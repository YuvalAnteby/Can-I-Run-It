import { Arm, APPS_API, JOBS_API, PG_API, required, resourceId, withControlLease } from './azure.mjs';
import { discoveredIps, firewallPlan, RULE_PREFIX, ruleName, publicIpv4 } from './policy.mjs';

export async function discoverEgress(arm, ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 16 || new Set(ids).size !== ids.length) throw new Error('Invalid DB executor resource inventory');
  const groups = [];
  for (const id of ids) {
    resourceId(id);
    const isJob = /\/providers\/Microsoft.App\/jobs\//i.test(id);
    if (!isJob && !/\/providers\/Microsoft.App\/containerApps\//i.test(id)) throw new Error('Executor must be an app or DB-connected Job');
    const resource = await arm.get(id, isJob ? JOBS_API : APPS_API);
    groups.push(resource.properties?.outboundIpAddresses);
  }
  return discoveredIps(groups);
}

export async function reconcileFirewall(env, credential, control, signal, ArmClass = Arm) {
  const arm = new ArmClass(credential, signal);
  // Complete discovery before any rule or metadata mutation. Missing one executor fails closed.
  const ips = await discoverEgress(arm, JSON.parse(required(env, 'DB_EXECUTOR_RESOURCE_IDS')));
  const server = resourceId(required(env, 'POSTGRES_SERVER_RESOURCE_ID'), 'Microsoft.DBforPostgreSQL/flexibleServers');
  return withControlLease(control, 'firewall.json', signal, async (previous, save, leasedSignal) => {
    const leasedArm = new ArmClass(credential, leasedSignal);
    const rules = await leasedArm.list(`${server}/firewallRules`, PG_API);
    const owned = rules.filter(rule => rule.name?.startsWith(RULE_PREFIX));
    const state = structuredClone(previous);
    state.ips ??= {};
    for (const rule of owned) {
      const ip = rule.properties?.startIpAddress;
      if (!publicIpv4(ip) || rule.properties?.endIpAddress !== ip || rule.name !== ruleName(ip)) throw new Error('Invalid controller-owned firewall rule; operator repair required');
      state.ips[ip] ??= { first_seen_at: new Date().toISOString() };
    }
    const plan = firewallPlan(ips, state);
    for (const ip of ips) {
      if (!owned.some(rule => rule.name === ruleName(ip))) await leasedArm.mutate(`${server}/firewallRules/${ruleName(ip)}`, PG_API, 'PUT', {
        properties: { startIpAddress: ip, endIpAddress: ip },
      });
    }
    // Persist retirement only after all additions succeeded, before removing any old address.
    await save(plan.state);
    for (const ip of plan.remove) {
      try { await leasedArm.mutate(`${server}/firewallRules/${ruleName(ip)}`, PG_API, 'DELETE'); }
      catch (error) { if (error.statusCode !== 404) throw error; }
      delete plan.state.ips[ip];
      await save(plan.state);
    }
    return { discovered_ips: ips.length, added: plan.add.length, retired: plan.remove.length, status: 'succeeded' };
  });
}
