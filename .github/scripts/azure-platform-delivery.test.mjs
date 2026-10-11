import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PLAN_TTL_HOURS,
  REPOSITORY,
  TERRAFORM_VERSION,
  WORKFLOW,
  backendConfig,
  buildManifest,
  main,
  readInputs,
  sha256,
  validateDispatchInputs,
  validatePlan,
  validateTerraformInputs,
  verifyManifest,
} from './azure-platform-delivery.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const WORKFLOW_YAML = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'azure-platform.yml'), 'utf8');
const BACKEND_CI = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'backend-ci.yml'), 'utf8');
const DELIVERY_SCRIPT = readFileSync(join(SCRIPT_DIR, 'azure-platform-delivery.mjs'), 'utf8');

const IDS = {
  commit: 'a'.repeat(40),
  tenant: '11111111-1111-4111-8111-111111111111',
  subscription: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333',
};

const IMAGE_DIGEST = `ghcr.io/example/image@sha256:${'b'.repeat(64)}`;

const FAKE_TERRAFORM = String.raw`
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const command = args[0] || '';
const log = process.env.FAKE_TOOL_LOG;
if (log) appendFileSync(log, JSON.stringify({ tool: 'terraform', command, args, cwd: process.cwd() }) + '\n');
const fail = process.env.FAKE_TF_FAIL;
const failCode = Number(process.env.FAKE_TF_FAIL_CODE || 17);
const marker = join(process.cwd(), '.fake-init-complete');
const failNow = (message, code = failCode) => {
  process.stderr.write(String(message) + '\n');
  process.exit(code);
};

if (fail === command) failNow('fake terraform ' + command + ' failure');
if (command === 'fmt' || command === 'validate') {
  process.stdout.write('TF_SENSITIVE_OUTPUT\\n');
  process.exit(0);
}
if (command === 'init') {
  writeFileSync(marker, 'initialized');
  process.stdout.write('TF_SENSITIVE_OUTPUT\\n');
  process.exit(0);
}
if (command === 'plan') {
  const outArg = args.find((arg) => arg.startsWith('-out='));
  if (!outArg) failNow('fake terraform plan missing -out');
  if (!existsSync(marker)) failNow('fake terraform plan ran before init', 32);
  const binary = outArg.slice('-out='.length);
  mkdirSync(dirname(binary), { recursive: true });
  writeFileSync(binary, process.env.FAKE_PLAN_BYTES || 'exact-plan-bytes');
  process.stdout.write('TF_SENSITIVE_OUTPUT\\n');
  process.exit(0);
}
if (command === 'show') {
  if (process.env.FAKE_REQUIRE_INIT_FOR_SHOW === '1' && !existsSync(marker)) failNow('fake terraform show ran before init', 77);
  if (args.includes('-json')) {
    const actions = JSON.parse(process.env.FAKE_PLAN_ACTIONS || '["create"]');
    process.stdout.write(JSON.stringify({ resource_changes: actions.map((action) => ({ address: 'fake.resource', change: { actions: [action] } })) }));
  } else {
    process.stdout.write('TF_SENSITIVE_OUTPUT\\n');
  }
  process.exit(0);
}
if (command === 'apply') {
  const binary = args.at(-1);
  if (!binary || binary.startsWith('-') || !existsSync(binary)) failNow('fake terraform apply missing downloaded plan', 78);
  if (process.env.FAKE_APPLY_CAPTURE) copyFileSync(binary, process.env.FAKE_APPLY_CAPTURE);
  process.stdout.write('TF_SENSITIVE_OUTPUT\\n');
  process.exit(0);
}
failNow('fake terraform unknown command ' + command, 79);
`;

const FAKE_AZ = String.raw`
import { appendFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const mode = args[2] || '';
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const name = valueAfter('--name');
const file = valueAfter('--file');
const log = process.env.FAKE_TOOL_LOG;
if (log) appendFileSync(log, JSON.stringify({ tool: 'az', mode, args, cwd: process.cwd() }) + '\n');
const storage = process.env.FAKE_STORAGE_ROOT;
const target = join(storage, ...name.split('/'));
const failName = process.env.FAKE_AZ_FAIL_NAME;
const failNow = (message, code = 23) => {
  process.stderr.write(String(message) + '\n');
  process.exit(code);
};
if (!storage || !name || !file || (mode !== 'upload' && mode !== 'download')) failNow('fake az received malformed blob arguments');
if (failName && name === failName) failNow('fake az ' + mode + ' failure for ' + name);
if (mode === 'upload') {
  if (existsSync(target) && args.includes('--overwrite') && args[args.indexOf('--overwrite') + 1] === 'false') failNow('fake az refused overwrite for ' + name);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
} else {
  if (!existsSync(target)) failNow('fake az missing ' + name, 24);
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(target, file);
}
`;

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installFakeCommand(bin, name, source) {
  const payload = join(bin, `fake-${name}.mjs`);
  writeFileSync(payload, source, { mode: 0o600 });
  if (process.platform === 'win32') {
    writeFileSync(join(bin, `${name}.cmd`), `@echo off\r\n"${process.execPath}" "${payload}" %*\r\n`, { mode: 0o700 });
  } else {
    const wrapper = join(bin, name);
    writeFileSync(wrapper, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(payload)} "$@"\n`, { mode: 0o700 });
    chmodSync(wrapper, 0o755);
  }
}

function validTerraformVars() {
  return {
    entitlement_verified: true,
    subscription_id: IDS.subscription,
    tenant_id: IDS.tenant,
    location: 'westeurope',
    backend_image: IMAGE_DIGEST,
    tools_image: `ghcr.io/example/tools@sha256:${'c'.repeat(64)}`,
    provider_secret_uris: {
      GEMINI_API_KEY: 'https://ciri-kv.vault.azure.net/secrets/gemini-api-key',
      RAWG_API_KEY: 'https://ciri-kv.vault.azure.net/secrets/rawg-api-key',
    },
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ciri-platform-test-'));
  const workspace = join(root, 'workspace');
  const terraformRoot = join(workspace, 'infra', 'terraform');
  const bin = join(root, 'bin');
  const runnerTemp = join(root, 'runner-temp');
  const storage = join(root, 'private-storage');
  const toolLog = join(root, 'tool.log');
  mkdirSync(terraformRoot, { recursive: true, mode: 0o700 });
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  mkdirSync(runnerTemp, { recursive: true, mode: 0o700 });
  mkdirSync(storage, { recursive: true, mode: 0o700 });
  writeFileSync(join(terraformRoot, '.terraform.lock.hcl'), 'fixture provider lock\n', { mode: 0o600 });
  writeFileSync(toolLog, '', { mode: 0o600 });
  installFakeCommand(bin, 'terraform', FAKE_TERRAFORM);
  installFakeCommand(bin, 'az', FAKE_AZ);
  const env = {
    ...process.env,
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
    GITHUB_WORKSPACE: workspace,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: IDS.commit,
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '2',
    PLATFORM_OPERATION: 'plan',
    PLATFORM_REVIEWED_MAIN_COMMIT: IDS.commit,
    PLATFORM_PLAN_ID: '',
    PLATFORM_REVIEWED_PLAN_SHA256: '',
    PLATFORM_SUBSCRIPTION_COST_ACK: 'true',
    PLATFORM_GRANTS_QUOTA_ACK: 'true',
    PLATFORM_STATE_IMPORT_ACK: 'true',
    PLATFORM_APPLY_ACK: 'false',
    AZURE_PLATFORM_CLIENT_ID: IDS.client,
    AZURE_TENANT_ID: IDS.tenant,
    AZURE_SUBSCRIPTION_ID: IDS.subscription,
    AZURE_LOCATION: 'westeurope',
    AZURE_STATE_STORAGE_ACCOUNT: 'ciriprodstate',
    AZURE_STATE_CONTAINER: 'terraform-state',
    AZURE_STATE_KEY: 'ciri-production.tfstate',
    AZURE_STATE_RESOURCE_GROUP: 'rg-ciri-state',
    AZURE_TERRAFORM_VARS_JSON: JSON.stringify(validTerraformVars()),
    CIRI_PLATFORM_TEMP_ROOT: runnerTemp,
    FAKE_STORAGE_ROOT: storage,
    FAKE_TOOL_LOG: toolLog,
    FAKE_PLAN_BYTES: 'exact-plan-bytes-v1',
    FAKE_PLAN_ACTIONS: JSON.stringify(['create', 'update', 'no-op']),
  };
  return { root, workspace, terraformRoot, storage, toolLog, env };
}

function dispose(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

function cloneEnv(fixture, overrides = {}) {
  return { ...fixture.env, ...overrides };
}

function readToolLog(fixture) {
  const text = readFileSync(fixture.toolLog, 'utf8').trim();
  return text ? text.split('\n').map((line) => JSON.parse(line)) : [];
}

function storedPath(fixture, name) {
  return join(fixture.storage, 'plans', IDS.commit, '12345-2', ...name.split('/'));
}

function runMain(argv, env) {
  const output = [];
  const originalLog = console.log;
  console.log = (...args) => output.push(args.join(' '));
  try {
    main(argv, env);
    return output;
  } finally {
    console.log = originalLog;
  }
}

function throwsMatching(fn, pattern) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'expected the operation to fail');
  if (pattern) assert.match(error.message, pattern);
  return error;
}

function assertNoAzureCommand(logs) {
  assert.equal(logs.some((entry) => entry.tool === 'az'), false, 'Azure CLI must not run after preflight rejection');
}

function manifestFixture(binaryPath, overrides = {}) {
  const context = {
    repository: REPOSITORY,
    workflow: WORKFLOW,
    commit: IDS.commit,
    run_id: '12345',
    run_attempt: '2',
    plan_id: '12345-2',
    terraform_version: TERRAFORM_VERSION,
    provider_lock_sha256: 'd'.repeat(64),
    tenant_id: IDS.tenant,
    subscription_id: IDS.subscription,
    backend: {
      storage_account: 'ciriprodstate',
      container: 'terraform-state',
      key: 'ciri-production.tfstate',
      resource_group: 'rg-ciri-state',
      subscription_id: IDS.subscription,
      tenant_id: IDS.tenant,
    },
  };
  return buildManifest({
    context: { ...context, ...overrides.context },
    createdAt: '2026-10-10T00:00:00.000Z',
    binaryPath,
    files: { binary: 'tfplan', text: 'plan.txt', json: 'plan.json', diagnostics: [] },
    counts: { add: 1, change: 0, destroy: 0, replace: 0 },
  });
}

test('dispatch and environment trust gates reject before any Azure command', () => {
  const fixture = createFixture();
  try {
    assert.equal(readInputs(fixture.env).operation, 'plan');
    assert.deepEqual(backendConfig(fixture.env), {
      storage_account: 'ciriprodstate',
      container: 'terraform-state',
      key: 'ciri-production.tfstate',
      resource_group: 'rg-ciri-state',
      subscription_id: IDS.subscription,
      tenant_id: IDS.tenant,
    });
    const cases = [
      ['GITHUB_EVENT_NAME', 'pull_request'],
      ['GITHUB_REPOSITORY', 'evil/fork'],
      ['GITHUB_REF', 'refs/heads/feature'],
      ['GITHUB_SHA', 'b'.repeat(40)],
      ['PLATFORM_SUBSCRIPTION_COST_ACK', 'false'],
      ['PLATFORM_GRANTS_QUOTA_ACK', 'false'],
      ['PLATFORM_STATE_IMPORT_ACK', 'false'],
      ['AZURE_LOCATION', 'eastus'],
      ['AZURE_STATE_CONTAINER', 'public'],
      ['AZURE_TERRAFORM_VARS_JSON', JSON.stringify({ ...JSON.parse(fixture.env.AZURE_TERRAFORM_VARS_JSON), api_key: 'sk-test-secret' })],
    ];
    for (const [name, value] of cases) {
      const env = cloneEnv(fixture, { [name]: value });
      throwsMatching(() => main(['plan'], env));
      assertNoAzureCommand(readToolLog(fixture));
    }
  } finally {
    dispose(fixture);
  }

});

test('dispatch apply inputs require explicit identifiers, digest, and approval', () => {
  const fixture = createFixture();
  try {
    const valid = cloneEnv(fixture, {
      PLATFORM_OPERATION: 'apply',
      PLATFORM_PLAN_ID: '12345-2',
      PLATFORM_REVIEWED_PLAN_SHA256: 'e'.repeat(64),
      PLATFORM_APPLY_ACK: 'true',
    });
    assert.equal(validateDispatchInputs(valid).inputs.operation, 'apply');
    for (const [name, value, message] of [
      ['PLATFORM_PLAN_ID', '12345/x', /plan_id/],
      ['PLATFORM_REVIEWED_PLAN_SHA256', 'bad', /SHA-256/],
      ['PLATFORM_APPLY_ACK', 'false', /apply_ack/],
    ]) {
      throwsMatching(() => validateDispatchInputs({ ...valid, [name]: value }), message);
    }
    throwsMatching(() => validateDispatchInputs(cloneEnv(fixture, {
      PLATFORM_PLAN_ID: '12345-2',
      PLATFORM_REVIEWED_PLAN_SHA256: 'e'.repeat(64),
      PLATFORM_APPLY_ACK: 'true',
    })), /apply_ack must remain false/);
  } finally {
    dispose(fixture);
  }
});

test('Terraform inputs allow only immutable images and Key Vault URI references', () => {
  const fixture = createFixture();
  try {
    const value = JSON.parse(fixture.env.AZURE_TERRAFORM_VARS_JSON);
    assert.equal(validateTerraformInputs(value, fixture.env).entitlement_verified, true);
    for (const mutation of [
      { ...value, location: 'eastus' },
      { ...value, backend_image: 'ghcr.io/example/image:latest' },
      { ...value, provider_secret_uris: { ...value.provider_secret_uris, GEMINI_API_KEY: 'raw-secret' } },
      { ...value, password: 'secret' },
      { ...value, tools_image: 'ghcr.io/example/tools@sha256:abc' },
    ]) {
      throwsMatching(() => validateTerraformInputs(mutation, fixture.env));
    }
  } finally {
    dispose(fixture);
  }
});

test('plan validation fails closed for malformed, diagnostic, delete, and replacement plans', () => {
  assert.deepEqual(validatePlan({ resource_changes: [
    { change: { actions: ['create'] } },
    { change: { actions: ['update'] } },
    { change: { actions: ['no-op'] } },
    { change: { actions: ['read'] } },
  ] }), { add: 1, change: 1, destroy: 0, replace: 0 });
  for (const plan of [
    null,
    { resource_changes: {} },
    { resource_changes: [{ change: { actions: ['unknown'] } }] },
    { diagnostics: [{ severity: 'error' }], resource_changes: [] },
    { resource_changes: [{ change: { actions: ['delete'] } }] },
    { resource_changes: [{ change: { actions: ['create', 'delete'] } }] },
  ]) {
    throwsMatching(() => validatePlan(plan));
  }
});

test('plan validation rejects non-passing checks even when resources are created', () => {
  for (const checks of [
    [{ status: 'fail' }],
    [{ status: 'unknown' }],
    [{ status: 'error' }],
    [{ status: 'pass', instances: [{ status: 'fail' }] }],
    [{ status: 'pass', instances: [{ status: 'unknown' }] }],
    [{ status: 'pass', instances: [{ status: 'error' }] }],
  ]) {
    throwsMatching(() => validatePlan({
      resource_changes: [{ change: { actions: ['create'] } }],
      checks,
    }), /check/);
  }
});

test('manifest binds exact bytes, private prefix, 24-hour TTL, toolchain, backend, identity, and digest', () => {
  const root = mkdtempSync(join(tmpdir(), 'ciri-manifest-test-'));
  try {
    const binary = join(root, 'tfplan');
    writeFileSync(binary, 'reviewed-plan-bytes', { mode: 0o600 });
    const manifest = manifestFixture(binary);
    assert.equal(manifest.original_plan_sha256, sha256(Buffer.from('reviewed-plan-bytes')));
    assert.equal(Date.parse(manifest.expires_at) - Date.parse(manifest.created_at), PLAN_TTL_HOURS * 60 * 60 * 1000);
    assert.equal(manifest.files.binary, 'tfplan');
    assert.equal(verifyManifest(manifest, {
      ...manifest,
      reviewed_plan_sha256: manifest.original_plan_sha256,
    }, { binaryPath: binary, now: Date.parse('2026-10-10T12:00:00.000Z') }).plan_id, '12345-2');
    for (const mutation of [
      { commit: 'b'.repeat(40) },
      { plan_id: '12345-3', run_id: '12345', run_attempt: '3' },
      { terraform_version: '1.8.0' },
      { provider_lock_sha256: 'e'.repeat(64) },
      { tenant_id: IDS.client },
      { subscription_id: IDS.tenant },
      { backend: { ...manifest.backend, key: 'other.tfstate' } },
      { reviewed_plan_sha256: 'f'.repeat(64) },
    ]) {
      throwsMatching(() => verifyManifest(manifest, { ...manifest, ...mutation }), /Stored plan/);
    }
    throwsMatching(() => verifyManifest(manifest, { ...manifest, reviewed_plan_sha256: manifest.original_plan_sha256 }, { binaryPath: binary, now: Date.parse('2026-10-11T00:00:01.000Z') }), /expired/);
    writeFileSync(binary, 'tampered-plan-bytes');
    throwsMatching(() => verifyManifest(manifest, { ...manifest, reviewed_plan_sha256: manifest.original_plan_sha256 }, { binaryPath: binary, now: Date.parse('2026-10-10T12:00:00.000Z') }), /bytes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('plan saves one exact binary, derives review files, uploads private diagnostics, and publishes manifest last', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  const fixture = createFixture();
  try {
    const output = runMain(['plan'], fixture.env);
    assert.match(output.join('\n'), /Protected plan saved for/);
    assert.equal(output.some((line) => line.includes('TF_SENSITIVE_OUTPUT')), false);
    const storedFiles = readdirSync(join(fixture.storage, 'plans', IDS.commit, '12345-2')).sort();
    assert.deepEqual(storedFiles, ['manifest.json', 'plan.json', 'plan.txt', 'terraform-fmt.log', 'terraform-init.log', 'terraform-plan.err', 'terraform-plan.log', 'terraform-show-json.log', 'terraform-show.log', 'terraform-validate.log', 'tfplan']);
    const manifest = JSON.parse(readFileSync(storedPath(fixture, 'manifest.json'), 'utf8'));
    const binary = readFileSync(storedPath(fixture, 'tfplan'));
    assert.equal(manifest.original_plan_sha256, sha256(binary));
    assert.equal(manifest.backend.container, 'terraform-state');
    assert.equal(manifest.files.binary, 'tfplan');
    const logs = readToolLog(fixture);
    const uploads = logs.filter((entry) => entry.tool === 'az' && entry.mode === 'upload');
    assert.equal(uploads.at(-1).args[uploads.at(-1).args.indexOf('--name') + 1], `plans/${IDS.commit}/12345-2/manifest.json`);
    assert.equal(uploads.at(-1).args.includes('--overwrite') && uploads.at(-1).args[uploads.at(-1).args.indexOf('--overwrite') + 1] === 'false', true);
    assert.equal(uploads.every((entry) => entry.args.includes('--auth-mode') && entry.args[entry.args.indexOf('--auth-mode') + 1] === 'login'), true);
    assert.equal(uploads.every((entry) => entry.args.includes('--only-show-errors') && entry.args.includes('--output') && entry.args[entry.args.indexOf('--output') + 1] === 'none'), true);
    const terraformLogs = logs.filter((entry) => entry.tool === 'terraform');
    const planLog = terraformLogs.find((entry) => entry.command === 'plan');
    assert.ok(planLog.args.some((arg) => arg.startsWith('-out=') && arg.endsWith('\\tfplan') || arg.startsWith('-out=') && arg.endsWith('/tfplan')));
    assert.equal(terraformLogs.filter((entry) => entry.command === 'plan').length, 1);
    assert.equal(readFileSync(storedPath(fixture, 'terraform-plan.log'), 'utf8').includes('TF_SENSITIVE_OUTPUT'), true);
    assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0, 'private runner files must be cleaned');
  } finally {
    dispose(fixture);
  }
});

test('rejected delete plan never publishes a completed manifest', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  const fixture = createFixture();
  try {
    const env = cloneEnv(fixture, { FAKE_PLAN_ACTIONS: JSON.stringify(['create', 'delete']) });
    throwsMatching(() => main(['plan'], env), /delete or replacement/);
    assert.equal(existsSync(storedPath(fixture, 'manifest.json')), false);
    assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
  } finally {
    dispose(fixture);
  }
});

test('native plan, init, show, and upload failures propagate after cleanup', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  for (const failure of [
    ['fmt', 11, /terraform fmt failed/],
    ['init', 12, /terraform init failed/],
    ['plan', 13, /terraform plan failed/],
    ['show', 14, /terraform show failed/],
  ]) {
    const fixture = createFixture();
    try {
      const [command, code, message] = failure;
      const error = throwsMatching(() => main(['plan'], cloneEnv(fixture, { FAKE_TF_FAIL: command, FAKE_TF_FAIL_CODE: String(code) })), message);
      assert.equal(error.exitCode, code);
      assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
    } finally {
      dispose(fixture);
    }
  }
  const fixture = createFixture();
  try {
    const error = throwsMatching(() => main(['plan'], cloneEnv(fixture, { FAKE_AZ_FAIL_NAME: `plans/${IDS.commit}/12345-2/manifest.json` })), /az upload failed/);
    assert.equal(error.exitCode, 23);
    assert.equal(existsSync(storedPath(fixture, 'manifest.json')), false);
    assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
  } finally {
    dispose(fixture);
  }
});

test('native apply failure propagates after diagnostic upload and cleanup', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  const fixture = createFixture();
  try {
    runMain(['plan'], fixture.env);
    const manifest = JSON.parse(readFileSync(storedPath(fixture, 'manifest.json'), 'utf8'));
    const error = throwsMatching(() => main(['apply'], cloneEnv(fixture, {
      PLATFORM_OPERATION: 'apply',
      PLATFORM_PLAN_ID: '12345-2',
      PLATFORM_REVIEWED_PLAN_SHA256: manifest.original_plan_sha256,
      PLATFORM_APPLY_ACK: 'true',
      FAKE_TF_FAIL: 'apply',
      FAKE_TF_FAIL_CODE: '19',
    })), /terraform apply failed/);
    assert.equal(error.exitCode, 19);
    assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
  } finally {
    dispose(fixture);
  }
});

test('apply downloads the reviewed binary and never replans', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  const fixture = createFixture();
  try {
    runMain(['plan'], fixture.env);
    const manifest = JSON.parse(readFileSync(storedPath(fixture, 'manifest.json'), 'utf8'));
    rmSync(join(fixture.terraformRoot, '.fake-init-complete'), { force: true });
    const capture = join(fixture.root, 'applied-bytes');
    const env = cloneEnv(fixture, {
      PLATFORM_OPERATION: 'apply',
      PLATFORM_PLAN_ID: '12345-2',
      PLATFORM_REVIEWED_PLAN_SHA256: manifest.original_plan_sha256,
      PLATFORM_APPLY_ACK: 'true',
      FAKE_APPLY_CAPTURE: capture,
    });
    const output = runMain(['apply'], env);
    assert.match(output.join('\n'), /Applied the reviewed platform plan/);
    assert.deepEqual(readFileSync(capture), readFileSync(storedPath(fixture, 'tfplan')));
    const logs = readToolLog(fixture);
    assert.equal(logs.filter((entry) => entry.tool === 'terraform' && entry.command === 'plan').length, 1);
    const apply = logs.find((entry) => entry.tool === 'terraform' && entry.command === 'apply');
    assert.ok(apply, 'apply must run');
    assert.equal(apply.args.at(-1).endsWith('tfplan'), true);
    assert.deepEqual(logs.filter((entry) => entry.tool === 'az' && entry.mode === 'download').map((entry) => entry.args[entry.args.indexOf('--name') + 1]), [`plans/${IDS.commit}/12345-2/manifest.json`, `plans/${IDS.commit}/12345-2/tfplan`]);
    assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
  } finally {
    dispose(fixture);
  }
});

test('fresh apply initializes provider plugins before show and apply', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  const fixture = createFixture();
  try {
    runMain(['plan'], fixture.env);
    const manifest = JSON.parse(readFileSync(storedPath(fixture, 'manifest.json'), 'utf8'));
    rmSync(join(fixture.terraformRoot, '.fake-init-complete'), { force: true });
    const env = cloneEnv(fixture, {
      PLATFORM_OPERATION: 'apply',
      PLATFORM_PLAN_ID: '12345-2',
      PLATFORM_REVIEWED_PLAN_SHA256: manifest.original_plan_sha256,
      PLATFORM_APPLY_ACK: 'true',
      FAKE_REQUIRE_INIT_FOR_SHOW: '1',
    });
    runMain(['apply'], env);
  } finally {
    dispose(fixture);
  }
});

test('apply rejects malformed, expired, tampered, and destructive saved plans before apply', (t) => {
  if (process.platform === 'win32') return t.skip('fake executable wrappers require a POSIX runner');
  for (const scenario of ['malformed', 'expired', 'tampered', 'delete', 'replacement']) {
    const fixture = createFixture();
    try {
      runMain(['plan'], fixture.env);
      const manifestPath = storedPath(fixture, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (scenario === 'malformed') writeFileSync(manifestPath, '{bad json');
      if (scenario === 'expired') {
        manifest.created_at = '2020-01-01T00:00:00.000Z';
        manifest.expires_at = '2020-01-02T00:00:00.000Z';
        writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      }
      if (scenario === 'tampered') writeFileSync(storedPath(fixture, 'tfplan'), 'tampered-bytes');
      if (scenario === 'delete') fixture.env.FAKE_PLAN_ACTIONS = JSON.stringify(['delete']);
      if (scenario === 'replacement') fixture.env.FAKE_PLAN_ACTIONS = JSON.stringify(['create', 'delete']);
      const digest = scenario === 'tampered' ? manifest.original_plan_sha256 : manifest.original_plan_sha256;
      const env = cloneEnv(fixture, {
        PLATFORM_OPERATION: 'apply',
        PLATFORM_PLAN_ID: '12345-2',
        PLATFORM_REVIEWED_PLAN_SHA256: digest,
        PLATFORM_APPLY_ACK: 'true',
      });
      throwsMatching(() => main(['apply'], env));
      assert.equal(readToolLog(fixture).some((entry) => entry.tool === 'terraform' && entry.command === 'apply'), false);
      assert.equal(readdirSync(fixture.env.CIRI_PLATFORM_TEMP_ROOT).length, 0);
    } finally {
      dispose(fixture);
    }
  }
});

test('backend CI keeps Terraform checks credential-free and fails clearly when predecessor roots are absent', () => {
  assert.match(BACKEND_CI, /test -f infra\/terraform\/bootstrap\/main\.tf \|\| \{[\s\S]*stack PR85/);
  assert.match(BACKEND_CI, /test -d infra\/terraform\/test-fixtures\/local-bootstrap \|\| \{/);
  assert.match(BACKEND_CI, /terraform -chdir=infra\/terraform init -backend=false -input=false -lockfile=readonly/);
  assert.match(BACKEND_CI, /terraform -chdir=infra\/terraform\/bootstrap init -backend=false -input=false -lockfile=readonly/);
  const terraformJob = BACKEND_CI.slice(BACKEND_CI.indexOf('  terraform_checks:'), BACKEND_CI.length);
  assert.doesNotMatch(terraformJob, /azure\/login|id-token|az login|upload-artifact|actions\/cache/i);
  assert.doesNotMatch(terraformJob, /provider register|role assignment|sqladmin|keyvault secret|storage account keys|sig=/i);
});

test('workflow and delivery script expose only the protected private protocol', () => {
  assert.match(WORKFLOW_YAML, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(WORKFLOW_YAML, /pull_request_target|pull_request:|push:/);
  assert.match(WORKFLOW_YAML, /permissions:\s*\n\s+contents: read/);
  assert.match(WORKFLOW_YAML, /environment:\s*\n\s+name: azure-platform/);
  assert.match(WORKFLOW_YAML, /id-token: write/);
  assert.doesNotMatch(WORKFLOW_YAML, /upload-artifact|actions\/cache|az\s+(role|provider|postgres|keyvault)|storage account keys/i);
  assert.match(DELIVERY_SCRIPT, /--auth-mode', 'login/);
  assert.match(DELIVERY_SCRIPT, /'--overwrite', 'false'/);
  assert.match(DELIVERY_SCRIPT, /uploadFile\(env, context, 'manifest\.json'/);
  assert.doesNotMatch(DELIVERY_SCRIPT, /upload-artifact|actions\/cache|az\s+(role|provider|postgres|keyvault)|storage account keys/i);
  assert.equal(DELIVERY_SCRIPT.includes('console.log(JSON.stringify'), false);
});

test('apply initializes the provider plugins before either saved-plan show', () => {
  const applySource = DELIVERY_SCRIPT.slice(DELIVERY_SCRIPT.indexOf('function runApply'), DELIVERY_SCRIPT.indexOf('export function main'));
  const initIndex = applySource.indexOf("runCommand('terraform', terraformArgsForInit");
  const showIndex = applySource.indexOf("runCommand('terraform', ['show'");
  assert.ok(initIndex >= 0 && showIndex >= 0 && initIndex < showIndex, 'fresh apply must initialize providers before terraform show');
});
