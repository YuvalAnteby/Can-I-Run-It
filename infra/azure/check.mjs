import { randomUUID } from 'node:crypto';
import { Arm, COST_API, required, resourceId, withControlLease, startJob, waitJob, executionStatus } from './azure.mjs';
import { creditPeriod, exportDue, periodKey } from './policy.mjs';

export async function verifiedCost(arm, env, period, now = Date.now()) {
  if (env.VERIFIED_CREDIT_COST_MAPPING !== 'true') return { verified: false, fallback: 'manual export and budget email: credit-consumption mapping is unverified' };
  if (period.currency !== 'USD') return { verified: false, fallback: 'manual export and budget email: $80/$90 thresholds require verified USD credit currency' };
  if (now < Date.parse(period.start) || now >= Date.parse(period.end)) return { verified: false, fallback: 'manual export and budget email: no active credit period' };
  const subscription = required(env, 'AZURE_SUBSCRIPTION_ID');
  if (!/^[0-9a-f-]{36}$/i.test(subscription)) throw new Error('Invalid subscription ID');
  try {
    const { data } = await arm.request(`/subscriptions/${subscription}/providers/Microsoft.CostManagement/query`, COST_API, 'POST', {
      type: 'ActualCost', timeframe: 'Custom', timePeriod: { from: period.start, to: new Date(Math.min(now, Date.parse(period.end) - 1)).toISOString() },
      dataset: { granularity: 'None', aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } } },
    });
    const props = data.properties;
    const amountColumn = props?.columns?.findIndex(c => ['PreTaxCost', 'Cost'].includes(c.name));
    const currencyColumn = props?.columns?.findIndex(c => c.name === 'Currency');
    if (props?.nextLink || amountColumn < 0 || currencyColumn < 0 || !Array.isArray(props?.rows) || props.rows.length !== 1) throw new Error('Unverifiable cost result');
    const row = props.rows[0];
    if (row[currencyColumn] !== period.currency || !Number.isFinite(row[amountColumn]) || row[amountColumn] < 0) throw new Error('Unverifiable cost currency/amount');
    return { verified: true, amount: row[amountColumn], currency: period.currency, verified_at: new Date(now).toISOString(), source: 'ActualCost.PreTaxCost', credit_period_key: periodKey(period) };
  } catch { return { verified: false, fallback: 'manual export and budget email: cost query unavailable or mismatched; automatic credit thresholds disabled' }; }
}

export async function checkExports(env, credential, containers, signal, ArmClass = Arm) {
  const period = creditPeriod(required(env, 'CREDIT_PERIOD_START'), required(env, 'CREDIT_PERIOD_END'), required(env, 'CREDIT_CURRENCY'));
  const firewallJob = resourceId(required(env, 'FIREWALL_JOB_RESOURCE_ID'), 'Microsoft.App/jobs');
  const exportJob = resourceId(required(env, 'EXPORT_JOB_RESOURCE_ID'), 'Microsoft.App/jobs');
  return withControlLease(containers.control, 'export.json', signal, async (state, save, leasedSignal) => {
    const arm = new ArmClass(credential, leasedSignal);
    const cost = await verifiedCost(arm, env, period);
    const request = exportDue(state, period, cost, Date.now(), env.EXPORT_MANUAL === 'true');
    const updated = { ...state, last_check_at: new Date().toISOString(), cost_status: cost.verified ? 'verified' : cost.fallback,
      ...(cost.verified ? { last_verified_cost: cost } : {}) };
    if (state.pending?.execution_name && Date.now() - Date.parse(state.pending.created_at) < 20 * 60000) {
      const status = await executionStatus(arm, exportJob, state.pending.execution_name);
      if (['Running', 'Pending', 'Processing', 'Unknown'].includes(status)) {
        await save(updated);
        return { status: 'export-in-progress', cost_status: updated.cost_status };
      }
    }
    if (!request.due) {
      await save(updated);
      return { status: 'not-due', next_due_at: state.next_due_at, cost_status: updated.cost_status };
    }
    const requestId = randomUUID();
    const pending = { request_id: requestId, created_at: new Date().toISOString(), request };
    updated.pending = pending;
    updated.last_status = 'due';
    await save(updated); // A failed start retains schedule and threshold markers.
    try {
      const firewall = await startJob(arm, firewallJob);
      await waitJob(arm, firewallJob, firewall.execution_name);
      pending.firewall_verified_at = new Date().toISOString();
      await save(updated);
      const execution = await startJob(arm, exportJob, { requestId });
      pending.execution_name = execution.execution_name;
      updated.last_status = 'triggered';
      await save(updated);
      return { status: 'triggered', execution_name: execution.execution_name, thresholds: request.thresholds, cost_status: updated.cost_status };
    } catch (error) {
      try { await save({ ...updated, last_status: 'trigger-failed', last_failure_at: new Date().toISOString() }); } catch { /* Earlier due marker remains. */ }
      throw error;
    }
  });
}
