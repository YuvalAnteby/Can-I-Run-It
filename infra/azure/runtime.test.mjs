import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arm, credentialFor, withControlLease, startJob, waitJob, APPS_API, JOBS_API } from './azure.mjs';
import { discoverEgress, reconcileFirewall } from './firewall.mjs';
import { verifiedCost, checkExports } from './check.mjs';
import { publishDump, exportDatabase, pruneExports } from './export.mjs';
import { exportDue } from './policy.mjs';
import { retryDatabase, pgEnvironment, createDump } from './postgres.mjs';
import { MemoryContainer, resource, image, period, signal, subscription, completedSet } from './test-memory.mjs';

test('credentials require explicit mode and UAMI client ID', () => {
  assert.throws(() => credentialFor({}));
  assert.throws(() => credentialFor({ MAINTENANCE_AUTH_MODE: 'managed-identity' }));
  assert.equal(credentialFor({ MAINTENANCE_AUTH_MODE: 'managed-identity', AZURE_CLIENT_ID: subscription }).constructor.name, 'ManagedIdentityCredential');
  assert.equal(credentialFor({ MAINTENANCE_AUTH_MODE: 'azure-cli' }).constructor.name, 'AzureCliCredential');
});

test('each DB executor has its own correctly versioned ARM discovery; a missing Job fails', async () => {
  const calls = [];
  const ids = [resource('Microsoft.App/containerApps/api'), resource('Microsoft.App/jobs/migrate'), resource('Microsoft.App/jobs/export')];
  const arm = { get: async (id, version) => { calls.push([id, version]); return { properties: { outboundIpAddresses: [id.endsWith('api') ? '20.50.1.1' : '20.50.1.2'] } }; } };
  assert.deepEqual(await discoverEgress(arm, ids), ['20.50.1.1', '20.50.1.2']);
  assert.deepEqual(calls.map(c => c[1]), [APPS_API, JOBS_API, JOBS_API]);
  await assert.rejects(discoverEgress({ get: async () => ({ properties: {} }) }, ids));
});

test('empty discovery changes neither metadata nor previous firewall rules', async () => {
  const control = new MemoryContainer();
  const original = { ips: { '20.50.1.1': { first_seen_at: '2026-01-01T00:00:00Z' } } };
  control.put('firewall.json', original);
  const mutations = [];
  class BadArm { async get() { return { properties: { outboundIpAddresses: [] } }; } async mutate(...args) { mutations.push(args); } }
  await assert.rejects(reconcileFirewall({ DB_EXECUTOR_RESOURCE_IDS: JSON.stringify([resource('Microsoft.App/containerApps/api')]), POSTGRES_SERVER_RESOURCE_ID: resource('Microsoft.DBforPostgreSQL/flexibleServers/db') }, {}, control, signal(), BadArm));
  assert.deepEqual(control.json('firewall.json'), original);
  assert.deepEqual(mutations, []);
});

test('firewall adds new exact rules before removing retired owned rules; operator rules survive', async () => {
  const control = new MemoryContainer();
  const first = new Date(Date.now() - 7200000).toISOString();
  control.put('firewall.json', { ips: { '20.50.1.1': { first_seen_at: first, retired_at: first } } });
  const calls = [];
  class FakeArm {
    async get() { return { properties: { outboundIpAddresses: ['20.50.1.2'] } }; }
    async list() { return [{ name: 'ciri-auto-20-50-1-1', properties: { startIpAddress: '20.50.1.1', endIpAddress: '20.50.1.1' } }, { name: 'operator-office', properties: { startIpAddress: '8.8.8.8', endIpAddress: '8.8.8.8' } }]; }
    async mutate(path, api, method, body) { calls.push({ path, method, body }); }
  }
  const result = await reconcileFirewall({ DB_EXECUTOR_RESOURCE_IDS: JSON.stringify([resource('Microsoft.App/containerApps/api')]), POSTGRES_SERVER_RESOURCE_ID: resource('Microsoft.DBforPostgreSQL/flexibleServers/db') }, {}, control, signal(), FakeArm);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls.map(c => c.method), ['PUT', 'DELETE']);
  assert.equal(calls[0].body.properties.startIpAddress, calls[0].body.properties.endIpAddress);
  assert.ok(calls.every(c => !c.path.includes('operator-office')));
});

test('concurrent control operations fail under a lease; lost ETags reject writes', async () => {
  const control = new MemoryContainer();
  let enter;
  const started = new Promise(resolve => { enter = resolve; });
  let unblock;
  const waiting = new Promise(resolve => { unblock = resolve; });
  const first = withControlLease(control, 'export.json', signal(), async (state, save) => { enter(); await waiting; await save({ ok: true }); });
  await started;
  await assert.rejects(withControlLease(control, 'export.json', signal(), () => assert.fail('Competing action ran')), error => error.statusCode === 409);
  unblock();
  await first;
  await assert.rejects(withControlLease(control, 'export.json', signal(), async (state, save) => {
    control.blobs.get('export.json').etag = 'changed-externally';
    await save({ stale: true });
  }), error => error.statusCode === 412);
});

test('ARM refuses foreign polling URLs and suppresses raw error bodies', async () => {
  const arm = new Arm({ getToken: async () => ({ token: 'PRIVATE_TOKEN' }) }, signal(), async () => new Response('PRIVATE_PROVIDER_KEY', { status: 403 }));
  await assert.rejects(arm.get('https://attacker.test/subscriptions/abc', APPS_API), /Untrusted ARM URL/);
  await assert.rejects(arm.get(resource('Microsoft.App/jobs/firewall'), JOBS_API), error => !error.message.includes('PRIVATE') && error.statusCode === 403);
});

test('waitJob succeeds only on matching terminal execution and respects budget', async () => {
  const job = resource('Microsoft.App/jobs/firewall');
  assert.equal((await waitJob({ list: async () => [{ name: 'desired', properties: { status: 'Succeeded' } }] }, job, 'desired')).status, 'Succeeded');
  await assert.rejects(waitJob({ list: async () => [{ name: 'desired', properties: { status: 'Failed' } }] }, job, 'desired'), /Failed/);
  const bounded = AbortSignal.timeout(10);
  await assert.rejects(waitJob({ signal: bounded, list: async () => [{ name: 'other', properties: { status: 'Succeeded' } }] }, job, 'desired'));
});

test('trusted image/command override preserves secret references and rejects mutable images', async () => {
  let body;
  const job = resource('Microsoft.App/jobs/migration');
  const arm = { get: async () => ({ properties: { template: { containers: [{ name: 'migrate', image, env: [{ name: 'SECRET', secretRef: 'kv' }], resources: { cpu: 0.5, memory: '1Gi' } }] } } }),
    mutate: async (path, version, method, template) => { body = template; return { name: 'migration-run' }; } };
  await startJob(arm, job, { image, command: ['node', '/app/dist/database/maintenance.js', 'migrate'] });
  assert.deepEqual(body.containers[0].env, [{ name: 'SECRET', secretRef: 'kv' }]);
  assert.deepEqual(body.containers[0].resources, { cpu: 0.5, memory: '1Gi' });
  await assert.rejects(startJob(arm, job, { image: 'ghcr.io/example/tools:latest' }));
});

test('cost reads exact period through Jan 1, validates currency and requires operator-verified mapping', async () => {
  let body;
  const arm = { request: async (path, api, method, input) => { body = input; return { data: { properties: { columns: [{ name: 'PreTaxCost' }, { name: 'Currency' }], rows: [[90, 'USD']] } } }; } };
  const env = { AZURE_SUBSCRIPTION_ID: subscription, VERIFIED_CREDIT_COST_MAPPING: 'true' };
  const cost = await verifiedCost(arm, env, period, Date.parse('2027-01-01T02:00:00Z'));
  assert.equal(cost.verified, true);
  assert.equal(body.timePeriod.from, period.start);
  assert.equal((await verifiedCost(arm, { ...env, VERIFIED_CREDIT_COST_MAPPING: 'false' }, period)).verified, false);
  assert.equal((await verifiedCost(arm, env, { ...period, currency: 'EUR' })).verified, false);
  assert.equal((await verifiedCost({ request: async () => { throw new Error('No cost API'); } }, env, period)).verified, false);
});

test('failed firewall preparation keeps due thresholds and never starts export', async () => {
  const control = new MemoryContainer();
  const oldState = { last_success_at: '2026-01-01T00:00:00Z', next_due_at: '2026-05-01T00:00:00Z', fired_thresholds: [80] };
  control.put('export.json', oldState);
  const starts = [];
  class FakeArm {
    constructor(c, s) { this.signal = s; }
    async get() { return { properties: { template: { containers: [{ name: 'control', image }] } } }; }
    async mutate(path) { starts.push(path); return { name: 'firewall-run' }; }
    async list() { return [{ name: 'firewall-run', properties: { status: 'Failed' } }]; }
  }
  await assert.rejects(checkExports({ CREDIT_PERIOD_START: period.start, CREDIT_PERIOD_END: period.end, CREDIT_CURRENCY: 'USD', FIREWALL_JOB_RESOURCE_ID: resource('Microsoft.App/jobs/firewall'), EXPORT_JOB_RESOURCE_ID: resource('Microsoft.App/jobs/export') }, {}, { control }, signal(), FakeArm));
  assert.equal(starts.length, 1);
  const state = control.json('export.json');
  assert.equal(state.last_success_at, oldState.last_success_at);
  assert.equal(state.next_due_at, oldState.next_due_at);
  assert.deepEqual(state.fired_thresholds, [80]);
  assert.equal(state.last_status, 'trigger-failed');
});

test('PG firewall retries are bounded and auth/SQL errors fail immediately', async () => {
  let clock = 0;
  let attempts = 0;
  const failure = Object.assign(new Error('Connection'), { retryable: true });
  await assert.rejects(retryDatabase(async () => { attempts++; throw failure; }, signal(), { budgetMs: 100, now: () => clock, pause: async ms => { clock += ms; } }));
  assert.equal(clock, 100);
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(retryDatabase(async () => { attempts++; throw new Error('Permission'); }, signal()));
  assert.equal(attempts, 1);
});

test('export uses fresh UAMI tokens, verify-full, PG16, complete schema and protected environment', async () => {
  const dir = (await mkdtemp(join(tmpdir(), 'ciri-pg-test-'))).replaceAll('\\', '/');
  try {
    await writeFile(`${dir}/roots.pem`, 'test root');
    const env = { MAINTENANCE_AUTH_MODE: 'managed-identity', POSTGRES_SSL_MODE: 'verify-full', POSTGRES_SSL_ROOT_CERT: `${dir}/roots.pem`, POSTGRES_HOST: 'ciri.postgres.database.azure.com', POSTGRES_USER: 'ciri-exporter', POSTGRES_DB: 'ciri', PATH: process.env.PATH, PGOPTIONS: '-c ssl=off' };
    let count = 0;
    const credential = { getToken: async () => ({ token: `private-${++count}`, expiresOnTimestamp: Date.now() + 3600000 }) };
    const calls = [];
    const run = async (tool, args, pg) => {
      calls.push({ tool, args, pg: { ...pg } });
      if (args[0] === '--version') return `${tool} (PostgreSQL) 16.11`;
      if (tool === 'pg_dump') { await writeFile(`${dir}/ciri.dump`, 'custom dump fixture'); return ''; }
      if (tool === 'pg_restore') return 'TABLE DATA public games\nTABLE DATA public migrations';
      return args.at(-1).includes('migrations') ? 'RuntimeGrants1790985600002' : '1';
    };
    const archive = await createDump(env, credential, dir, signal(), run);
    assert.equal(archive.schema_version, 'RuntimeGrants1790985600002');
    assert.equal(count, 2);
    assert.ok(calls.find(c => c.tool === 'pg_dump' && c.args.includes('--format=custom')).args.includes('--no-acl'));
    assert.ok(calls.find(c => c.tool === 'pg_dump' && c.args.includes('--format=custom')).args.includes('--no-owner'));
    for (const c of calls.filter(c => c.pg.PGPASSWORD)) { assert.equal(c.pg.PGSSLMODE, 'verify-full'); assert.equal(c.pg.PGOPTIONS, undefined); }
    await assert.rejects(pgEnvironment({ ...env, POSTGRES_SSL_MODE: 'require' }, credential));
    await assert.rejects(pgEnvironment({ ...env, MAINTENANCE_AUTH_MODE: 'azure-cli' }, credential));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a corrupted read-back never publishes completion manifest', async () => {
  const dir = (await mkdtemp(join(tmpdir(), 'ciri-upload-test-'))).replaceAll('\\', '/');
  try {
    await writeFile(`${dir}/ciri.dump`, 'custom dump fixture');
    const container = new MemoryContainer();
    container.corruptDownload = true;
    await assert.rejects(publishDump(container, 'exports/new/', { dump: `${dir}/ciri.dump`, contents: 'TABLE DATA public migrations', postgres_version: 'pg_dump (PostgreSQL) 16.11', schema_version: 'Baseline1' }, image, signal()), /hash mismatch/);
    assert.equal(container.blobs.has('exports/new/manifest.json'), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed uploads preserve previous valid copies and unconsumed pending threshold markers', async () => {
  const exports = new MemoryContainer();
  completedSet(exports, 'exports/older/', '2026-01-01T00:00:00Z');
  completedSet(exports, 'exports/newer/', '2026-05-01T00:00:00Z');
  const names = [...exports.blobs.keys()];
  exports.failUploads = true;
  const control = new MemoryContainer();
  const request = exportDue({}, period, { verified: true, amount: 95, currency: 'USD' }, Date.parse('2026-10-03T02:00:00Z'));
  control.put('export.json', { pending: { request_id: 'test', firewall_verified_at: new Date().toISOString(), request }, fired_thresholds: [] });
  await assert.rejects(exportDatabase({ EXPORT_REQUEST_ID: 'test', RELEASE_TOOLS_IMAGE_DIGEST: image }, {}, { exports, control }, signal(), async (env, credential, dir) => {
    await writeFile(`${dir}/ciri.dump`, 'custom dump fixture');
    return { dump: `${dir}/ciri.dump`, contents: 'TABLE DATA public migrations', postgres_version: 'pg_dump (PostgreSQL) 16.11', schema_version: 'Baseline1' };
  }));
  assert.deepEqual([...exports.blobs.keys()], names);
  assert.deepEqual(control.json('export.json').fired_thresholds, []);
  assert.equal(control.json('export.json').pending.request.thresholds.length, 2);
  assert.equal(control.json('export.json').last_status, 'failed');
});

test('retention deletes only older completed sets and expired abandoned uploads', async () => {
  const exports = new MemoryContainer();
  for (let i = 1; i <= 3; i++) completedSet(exports, `exports/set${i}/`, `2026-10-0${i}T00:00:00Z`);
  exports.put('exports/abandoned/ciri.dump', Buffer.from('x'), new Date('2026-08-01T00:00:00Z'));
  exports.put('exports/active/ciri.dump', Buffer.from('x'), new Date('2026-10-03T01:00:00Z'));
  exports.put('unrelated.txt', Buffer.from('x'));
  const result = await pruneExports(exports, signal(), Date.parse('2026-10-03T02:00:00Z'));
  assert.deepEqual(result, { pruned_completed: 1, cleaned_abandoned: 1 });
  assert.equal([...exports.blobs.keys()].filter(name => name.endsWith('/manifest.json')).length, 2);
  assert.equal(exports.blobs.has('exports/active/ciri.dump'), true);
  assert.equal(exports.blobs.has('unrelated.txt'), true);
});

test('successful export commits due markers only after verified upload and keeps newest two sets', async () => {
  const exports = new MemoryContainer();
  completedSet(exports, 'exports/oldest/', '2026-01-01T00:00:00Z');
  completedSet(exports, 'exports/previous/', '2026-05-01T00:00:00Z');
  const control = new MemoryContainer();
  const request = exportDue({}, period, { verified: true, amount: 95, currency: 'USD' }, Date.parse('2026-10-03T02:00:00Z'));
  control.put('export.json', { pending: { request_id: 'test', firewall_verified_at: new Date().toISOString(), request }, fired_thresholds: [] });
  const result = await exportDatabase({ EXPORT_REQUEST_ID: 'test', RELEASE_TOOLS_IMAGE_DIGEST: image }, {}, { exports, control }, signal(), async (env, credential, dir) => {
    await writeFile(`${dir}/ciri.dump`, 'custom dump fixture');
    return { dump: `${dir}/ciri.dump`, contents: 'TABLE DATA public migrations', postgres_version: 'pg_dump (PostgreSQL) 16.11', schema_version: 'Baseline1' };
  });
  assert.equal(result.status, 'succeeded');
  const state = control.json('export.json');
  assert.deepEqual(state.fired_thresholds, [80, 90]);
  assert.equal(state.pending, undefined);
  assert.equal(state.last_success_prefix, result.prefix);
  assert.ok(Date.parse(state.next_due_at) > Date.parse(state.last_success_at));
  assert.equal([...exports.blobs.keys()].filter(name => name.endsWith('/manifest.json')).length, 2);
  assert.ok(exports.blobs.has('exports/previous/ciri.dump'));
});

test('a due checker confirms firewall success before triggering and never consumes thresholds', async () => {
  const control = new MemoryContainer();
  const events = [];
  class FakeArm {
    constructor(c, s) { this.signal = s; }
    async get() { return { properties: { template: { containers: [{ name: 'control', image }] } } }; }
    async mutate(path, version, method, body) {
      events.push(path.endsWith('/firewall/start') ? 'firewall-start' : 'export-start');
      if (path.endsWith('/export/start')) {
        const requestId = body.containers[0].env.find(v => v.name === 'EXPORT_REQUEST_ID').value;
        assert.equal(requestId, control.json('export.json').pending.request_id);
        assert.ok(control.json('export.json').pending.firewall_verified_at);
        return { name: 'export-run' };
      }
      return { name: 'firewall-run' };
    }
    async list() { events.push('firewall-confirm'); return [{ name: 'firewall-run', properties: { status: 'Succeeded' } }]; }
  }
  const result = await checkExports({ CREDIT_PERIOD_START: period.start, CREDIT_PERIOD_END: period.end, CREDIT_CURRENCY: 'USD', FIREWALL_JOB_RESOURCE_ID: resource('Microsoft.App/jobs/firewall'), EXPORT_JOB_RESOURCE_ID: resource('Microsoft.App/jobs/export') }, {}, { control }, signal(), FakeArm);
  assert.equal(result.status, 'triggered');
  assert.deepEqual(events, ['firewall-start', 'firewall-confirm', 'export-start']);
  assert.equal(control.json('export.json').last_success_at, undefined);
  assert.equal(control.json('export.json').fired_thresholds, undefined);
});
