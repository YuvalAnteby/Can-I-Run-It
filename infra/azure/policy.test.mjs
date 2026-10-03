import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIpv4, discoveredIps, firewallPlan, fourMonthsAfter, exportDue, completeExport, retentionPlan } from './policy.mjs';

test('firewall input rejects ranges, private, special and excessive discovery', () => {
  for (const ip of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '224.1.1.1', '198.51.100.1', '8.8.8.8/32', '1.1.1.1-8.8.8.8', '::1', '01.1.1.1']) assert.equal(publicIpv4(ip), false, ip);
  assert.equal(publicIpv4('20.50.1.2'), true);
  assert.throws(() => discoveredIps([['20.50.1.2'], []]));
  assert.throws(() => discoveredIps([Array(65).fill('20.50.1.2')]));
  assert.deepEqual(discoveredIps([['20.50.1.2'], ['20.50.1.2', '20.50.1.3']]), ['20.50.1.2', '20.50.1.3']);
});

test('new rules precede retirement; absent rules survive full one-hour grace', () => {
  const now = Date.parse('2026-10-03T01:00:00Z');
  const previous = { ips: { '20.50.1.1': { first_seen_at: '2026-10-02T00:00:00Z' } } };
  const first = firewallPlan(['20.50.1.2'], previous, now);
  assert.deepEqual(first.add, ['20.50.1.2']);
  assert.deepEqual(first.remove, []);
  assert.deepEqual(firewallPlan(['20.50.1.2'], first.state, now + 3599999).remove, []);
  assert.deepEqual(firewallPlan(['20.50.1.2'], first.state, now + 3600000).remove, ['20.50.1.1']);
  assert.equal(firewallPlan(['20.50.1.1'], first.state, now + 3600000).state.ips['20.50.1.1'].retired_at, undefined);
  assert.throws(() => firewallPlan([], previous, now));
  assert.equal(previous.ips['20.50.1.1'].retired_at, undefined);
});

test('four months are calendar months clamped in UTC, including leap years', () => {
  assert.equal(fourMonthsAfter('2026-10-31T02:03:04.005Z'), '2027-02-28T02:03:04.005Z');
  assert.equal(fourMonthsAfter('2023-10-31T02:00:00Z'), '2024-02-29T02:00:00.000Z');
  assert.equal(fourMonthsAfter('2026-01-31T00:00:00Z'), '2026-05-31T00:00:00.000Z');
});

const period = { start: '2026-09-01T00:00:00Z', end: '2027-09-01T00:00:00Z', currency: 'USD' };
const current = { last_success_at: '2026-10-01T00:00:00Z', next_due_at: '2027-02-01T00:00:00Z' };
test('thresholds preserve actual credit period across Jan 1 and require verified matching currency', () => {
  const now = Date.parse('2027-01-01T02:00:00Z');
  assert.deepEqual(exportDue(current, period, { verified: false, amount: 95, currency: 'USD' }, now).thresholds, []);
  assert.deepEqual(exportDue(current, period, { verified: true, amount: 95, currency: 'EUR' }, now).thresholds, []);
  const due = exportDue(current, period, { verified: true, amount: 95, currency: 'USD' }, now);
  assert.deepEqual(due.thresholds, [80, 90]);
  const completed = completeExport(current, due, 'exports/a/', now);
  assert.deepEqual(exportDue(completed, period, { verified: true, amount: 95, currency: 'USD' }, now + 1).thresholds, []);
  assert.deepEqual(exportDue(completed, { ...period, start: '2027-09-01T00:00:00Z', end: '2028-09-01T00:00:00Z' }, { verified: true, amount: 95, currency: 'USD' }, Date.parse('2027-10-01T00:00:00Z')).thresholds, [80, 90]);
  assert.deepEqual(exportDue(current, period, { verified: true, amount: 95, currency: 'USD' }, Date.parse(period.end)).thresholds, []);
});

test('retention keeps two successful sets, never counts incomplete uploads; abandoned cleanup is bounded', () => {
  const sets = [1, 2, 3].map(n => ({ prefix: `exports/${n}/`, completed_at: `2026-10-0${n}T00:00:00Z`, complete: true }));
  const incomplete = { prefix: 'exports/bad/', created_at: '2026-09-01T00:00:00Z' };
  assert.deepEqual(retentionPlan([...sets, incomplete], Date.parse('2026-10-03T02:00:00Z')).completed, ['exports/1/']);
  assert.deepEqual(retentionPlan([...sets, incomplete], Date.parse('2026-10-03T02:00:00Z')).abandoned, ['exports/bad/']);
  assert.throws(() => retentionPlan([{ ...sets[0], prefix: '../state/' }], Date.now()));
});
