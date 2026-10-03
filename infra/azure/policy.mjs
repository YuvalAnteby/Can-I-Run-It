import { isIPv4 } from 'node:net';

export const RULE_PREFIX = 'ciri-auto-';
export const ruleName = ip => `${RULE_PREFIX}${ip.replaceAll('.', '-')}`;

export function publicIpv4(ip) {
  if (typeof ip !== 'string' || !isIPv4(ip)) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function discoveredIps(groups) {
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 16) throw new Error('Invalid executor inventory');
  for (const ips of groups) {
    if (!Array.isArray(ips) || ips.length < 1 || ips.length > 64 || !ips.every(publicIpv4)) throw new Error('Empty, invalid or excessive executor egress discovery');
  }
  const ips = [...new Set(groups.flat())].sort();
  if (ips.length > 128) throw new Error('Too many distinct egress addresses');
  return ips;
}

const iso = value => new Date(value).toISOString();
export function firewallPlan(ips, previous = {}, now = Date.now()) {
  discoveredIps([ips]);
  const state = structuredClone(previous);
  state.ips ??= {};
  if (Object.keys(state.ips).length > 512 || !Object.keys(state.ips).every(publicIpv4)) throw new Error('Invalid firewall metadata');
  const add = [];
  const remove = [];
  for (const ip of ips) {
    if (!state.ips[ip]) { add.push(ip); state.ips[ip] = { first_seen_at: iso(now) }; }
    delete state.ips[ip].retired_at;
  }
  for (const [ip, entry] of Object.entries(state.ips)) {
    if (ips.includes(ip)) continue;
    if (!entry.retired_at) entry.retired_at = iso(now);
    else if (Number.isFinite(Date.parse(entry.retired_at)) && now - Date.parse(entry.retired_at) >= 3600000) remove.push(ip);
  }
  state.last_discovery_at = iso(now);
  return { add, remove, state };
}

export function fourMonthsAfter(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid export timestamp');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 4);
  const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, maxDay));
  return d.toISOString();
}

export function creditPeriod(start, end, currency) {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || !/^[A-Z]{3}$/.test(currency ?? '')) throw new Error('Invalid actual credit period/currency');
  return { start: iso(start), end: iso(end), currency };
}
export const periodKey = period => `${iso(period.start)}/${iso(period.end)}/${period.currency}`;

export function exportDue(state, period, cost, now = Date.now(), manual = false) {
  const key = periodKey(period);
  const active = now >= Date.parse(period.start) && now < Date.parse(period.end);
  const verified = cost?.verified === true && period.currency === 'USD' && cost.currency === period.currency && Number.isFinite(cost.amount) && cost.amount >= 0;
  const fired = state.credit_period_key === key ? state.fired_thresholds ?? [] : [];
  const thresholds = active && verified ? [80, 90].filter(n => cost.amount >= n && !fired.includes(n)) : [];
  const schedule = !state.last_success_at || now >= Date.parse(state.next_due_at ?? fourMonthsAfter(state.last_success_at));
  return { due: manual || schedule || thresholds.length > 0, schedule, manual, thresholds, period, credit_period_key: key, cost: verified ? cost : null };
}

export function completeExport(state, request, prefix, now = Date.now()) {
  const fired = state.credit_period_key === request.credit_period_key ? state.fired_thresholds ?? [] : [];
  const next = { ...state, last_success_at: iso(now), next_due_at: fourMonthsAfter(iso(now)), last_success_prefix: prefix,
    credit_period_key: request.credit_period_key, credit_period_start: iso(request.period.start), credit_period_end: iso(request.period.end),
    currency: request.period.currency, fired_thresholds: [...new Set([...fired, ...request.thresholds])].sort(),
    last_verified_cost: request.cost ?? state.last_verified_cost ?? null, last_status: 'succeeded' };
  delete next.pending;
  delete next.last_failure_at;
  return next;
}

export function retentionPlan(sets, now = Date.now()) {
  if (sets.some(s => !/^exports\/[A-Za-z0-9_.-]+\/$/.test(s.prefix))) throw new Error('Unsafe export prefix');
  const completed = sets.filter(s => s.complete === true && Number.isFinite(Date.parse(s.completed_at)))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at) || b.prefix.localeCompare(a.prefix));
  // ponytail: at most 32 abandoned sets per run; daily checks bound cleanup work.
  const abandoned = sets.filter(s => s.complete !== true && Number.isFinite(Date.parse(s.created_at)) && now - Date.parse(s.created_at) > 7 * 86400000).slice(0, 32);
  return { completed: completed.slice(2).map(s => s.prefix), abandoned: abandoned.map(s => s.prefix) };
}
