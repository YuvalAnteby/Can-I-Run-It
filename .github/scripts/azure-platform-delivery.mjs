import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const REPOSITORY = 'YuvalAnteby/Can-I-Run-It';
export const WORKFLOW = 'azure-platform';
export const TERRAFORM_VERSION = '1.9.8';
export const PLAN_SCHEMA_VERSION = 1;
export const PLAN_TTL_HOURS = 24;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const PLAN_ID = /^[0-9]+-[0-9]+$/;
const STORAGE_ACCOUNT = /^[a-z0-9]{3,24}$/;
const PROVIDER_URI = /^https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net\/secrets\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)?$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/i;

class DeliveryError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new DeliveryError(`Missing deployment configuration: ${name}`);
  return value.trim();
}

function first(env, ...names) {
  for (const name of names) {
    if (typeof env[name] === 'string' && env[name].trim() !== '') return env[name].trim();
  }
  return '';
}

function booleanInput(value, name) {
  if (value !== 'true' && value !== 'false') throw new DeliveryError(`${name} must be explicitly true or false`);
  return value === 'true';
}

export function readInputs(env = process.env) {
  return {
    operation: first(env, 'PLATFORM_OPERATION', 'INPUT_OPERATION'),
    reviewed_main_commit: first(env, 'PLATFORM_REVIEWED_MAIN_COMMIT', 'INPUT_REVIEWED_MAIN_COMMIT'),
    plan_id: first(env, 'PLATFORM_PLAN_ID', 'INPUT_PLAN_ID'),
    reviewed_plan_sha256: first(env, 'PLATFORM_REVIEWED_PLAN_SHA256', 'INPUT_REVIEWED_PLAN_SHA256'),
    subscription_cost_ack: first(env, 'PLATFORM_SUBSCRIPTION_COST_ACK', 'INPUT_SUBSCRIPTION_COST_ACK'),
    grants_quota_ack: first(env, 'PLATFORM_GRANTS_QUOTA_ACK', 'INPUT_GRANTS_QUOTA_ACK'),
    state_import_ack: first(env, 'PLATFORM_STATE_IMPORT_ACK', 'INPUT_STATE_IMPORT_ACK'),
    apply_ack: first(env, 'PLATFORM_APPLY_ACK', 'INPUT_APPLY_ACK') || 'false',
  };
}

export function backendConfig(env = process.env) {
  const subscription = first(env, 'AZURE_SUBSCRIPTION_ID', 'ARM_SUBSCRIPTION_ID');
  const tenant = first(env, 'AZURE_TENANT_ID', 'ARM_TENANT_ID');
  return {
    storage_account: first(env, 'AZURE_STATE_STORAGE_ACCOUNT', 'STATE_STORAGE_ACCOUNT'),
    container: first(env, 'AZURE_STATE_CONTAINER', 'STATE_CONTAINER'),
    key: first(env, 'AZURE_STATE_KEY', 'STATE_KEY'),
    resource_group: first(env, 'AZURE_STATE_RESOURCE_GROUP', 'STATE_RESOURCE_GROUP'),
    subscription_id: subscription,
    tenant_id: tenant,
  };
}

function parseObjectJson(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DeliveryError(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new DeliveryError(`${label} must be a JSON object`);
  return parsed;
}

function rejectSecretLikeValue(key, value) {
  if (typeof value !== 'string') return;
  if (/-----BEGIN|(?:^|\b)(?:Bearer|SharedAccessSignature)\b|(?:^|[?;&])(?:sig|sv)=|gh[pousr]_|github_pat_|sk-[a-z0-9]/i.test(value)) {
    throw new DeliveryError(`Terraform inputs contain a secret-like value at ${key}`);
  }
}

function validateSafeTerraformValue(value, path, parent = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSafeTerraformValue(item, `${path}[${index}]`, parent));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const keyPath = path ? `${path}.${key}` : key;
      const lower = key.toLowerCase();
      if (parent !== 'provider_secret_uris' && lower !== 'provider_secret_uris' && /(password|token|secret|sas|api[_-]?key|connection[_-]?string)/i.test(lower)) {
        throw new DeliveryError(`Terraform inputs contain a secret-bearing key: ${keyPath}`);
      }
      if (parent === 'provider_secret_uris') {
        if (!['GEMINI_API_KEY', 'RAWG_API_KEY'].includes(key) || typeof child !== 'string' || !PROVIDER_URI.test(child)) {
          throw new DeliveryError('provider_secret_uris may contain only Key Vault secret URIs');
        }
        continue;
      }
      validateSafeTerraformValue(child, keyPath, key);
    }
    return;
  }
  rejectSecretLikeValue(path, value);
}

export function validateTerraformInputs(value, env = process.env) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeliveryError('AZURE_TERRAFORM_VARS_JSON must be an object');
  if (value.entitlement_verified !== true) throw new DeliveryError('Terraform entitlement_verified must be true after human review');

  const subscription = first(env, 'AZURE_SUBSCRIPTION_ID', 'ARM_SUBSCRIPTION_ID');
  const tenant = first(env, 'AZURE_TENANT_ID', 'ARM_TENANT_ID');
  if (value.subscription_id !== subscription) throw new DeliveryError('Terraform subscription_id does not match the approved environment');
  if (value.tenant_id !== tenant) throw new DeliveryError('Terraform tenant_id does not match the approved environment');
  if (String(value.location || '').toLowerCase() !== 'westeurope') throw new DeliveryError('Terraform location must be the approved westeurope region');
  for (const key of ['backend_image', 'tools_image']) {
    if (typeof value[key] !== 'string' || !DIGEST.test(value[key]) || /:latest$/i.test(value[key])) {
      throw new DeliveryError(`${key} must be an immutable sha256 image digest`);
    }
  }
  validateSafeTerraformValue(value, 'terraform');
  return value;
}

export function validateEnvironment(env = process.env) {
  const subscription = first(env, 'AZURE_SUBSCRIPTION_ID', 'ARM_SUBSCRIPTION_ID');
  const tenant = first(env, 'AZURE_TENANT_ID', 'ARM_TENANT_ID');
  const client = first(env, 'AZURE_PLATFORM_CLIENT_ID', 'ARM_CLIENT_ID');
  if (!UUID.test(subscription)) throw new DeliveryError('Approved subscription ID must be a UUID');
  if (!UUID.test(tenant)) throw new DeliveryError('Approved tenant ID must be a UUID');
  if (!UUID.test(client)) throw new DeliveryError('Approved platform client ID must be a UUID');
  if (first(env, 'AZURE_LOCATION').toLowerCase() !== 'westeurope') throw new DeliveryError('Approved location must be westeurope');

  const backend = backendConfig(env);
  if (!STORAGE_ACCOUNT.test(backend.storage_account)) throw new DeliveryError('Approved state storage account is invalid');
  if (backend.container !== 'terraform-state') throw new DeliveryError('Platform plans must use the production terraform-state container');
  if (backend.key !== 'ciri-production.tfstate') throw new DeliveryError('Platform plans must use the production state key');
  if (!backend.resource_group) throw new DeliveryError('Approved state resource group is required');
  if (backend.subscription_id !== subscription || backend.tenant_id !== tenant) throw new DeliveryError('Backend identity does not match the approved environment');

  const vars = validateTerraformInputs(parseObjectJson(required(env, 'AZURE_TERRAFORM_VARS_JSON'), 'AZURE_TERRAFORM_VARS_JSON'), env);
  return { backend, vars };
}

export function validateDispatchInputs(env = process.env) {
  const inputs = readInputs(env);
  if (first(env, 'GITHUB_EVENT_NAME') !== 'workflow_dispatch') throw new DeliveryError('Platform delivery is workflow_dispatch-only');
  if (first(env, 'GITHUB_REPOSITORY') !== REPOSITORY) throw new DeliveryError('Platform delivery is restricted to the approved repository');
  if (first(env, 'GITHUB_REF') !== 'refs/heads/main') throw new DeliveryError('Platform delivery is main-only');
  const sha = required(env, 'GITHUB_SHA');
  if (!SHA40.test(sha) || inputs.reviewed_main_commit !== sha) throw new DeliveryError('reviewed_main_commit must exactly match the 40-character main commit');
  if (!['plan', 'apply'].includes(inputs.operation)) throw new DeliveryError('operation must be plan or apply');

  for (const name of ['subscription_cost_ack', 'grants_quota_ack', 'state_import_ack']) {
    if (!booleanInput(inputs[name], name) || inputs[name] !== 'true') throw new DeliveryError(`${name} must be explicitly acknowledged`);
  }
  const applyAck = booleanInput(inputs.apply_ack, 'apply_ack');
  if (inputs.operation === 'apply') {
    if (!applyAck) throw new DeliveryError('apply_ack must be true for apply');
    if (!PLAN_ID.test(inputs.plan_id)) throw new DeliveryError('plan_id must be <github-run-id>-<run-attempt>');
    if (!SHA256.test(inputs.reviewed_plan_sha256)) throw new DeliveryError('reviewed_plan_sha256 must be a SHA-256 digest');
  } else {
    if (applyAck) throw new DeliveryError('apply_ack must remain false for plan');
    if (inputs.plan_id || inputs.reviewed_plan_sha256) throw new DeliveryError('plan_id and reviewed_plan_sha256 are apply-only inputs');
  }
  const environment = validateEnvironment(env);
  return { inputs, environment };
}

function planChanges(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new DeliveryError('Terraform JSON plan must be an object');
  if (plan.errored === true || plan.error || ('diagnostics' in plan && !Array.isArray(plan.diagnostics)) || (Array.isArray(plan.diagnostics) && plan.diagnostics.some(item => !item || !['warning', 'error'].includes(item.severity) || item.severity === 'error'))) {
    throw new DeliveryError('Terraform plan contains an error');
  }
  if ('checks' in plan) {
    if (!Array.isArray(plan.checks)) throw new DeliveryError('Terraform JSON plan has invalid checks');
    for (const check of plan.checks) {
      if (!check || typeof check !== 'object' || Array.isArray(check) || !['pass', 'fail', 'error', 'unknown'].includes(check.status)) {
        throw new DeliveryError('Terraform JSON plan has an invalid check result');
      }
      if (check.status !== 'pass') throw new DeliveryError('Terraform plan contains a failed or unknown check');
      if ('instances' in check) {
        if (!Array.isArray(check.instances)) throw new DeliveryError('Terraform JSON plan has invalid check instances');
        for (const instance of check.instances) {
          if (!instance || typeof instance !== 'object' || Array.isArray(instance) || !['pass', 'fail', 'error', 'unknown'].includes(instance.status)) {
            throw new DeliveryError('Terraform JSON plan has an invalid check instance');
          }
          if (instance.status !== 'pass') throw new DeliveryError('Terraform plan contains a failed or unknown check instance');
        }
      }
    }
  }
  if (!Array.isArray(plan.resource_changes)) throw new DeliveryError('Terraform JSON plan has no resource_changes array');

  const counts = { add: 0, change: 0, destroy: 0, replace: 0 };
  for (const resource of plan.resource_changes) {
    if (!resource || !resource.change || !Array.isArray(resource.change.actions)) throw new DeliveryError('Terraform JSON plan has an invalid resource change');
    const actions = resource.change.actions;
    if (actions.some(action => !['create', 'update', 'delete', 'no-op', 'read'].includes(action))) throw new DeliveryError('Terraform JSON plan contains an unknown action');
    if (actions.includes('delete')) throw new DeliveryError('Terraform plan contains a delete or replacement');
    if (actions.includes('create')) counts.add += 1;
    if (actions.includes('update')) counts.change += 1;
    if (actions.includes('create') && actions.includes('delete')) counts.replace += 1;
  }
  return counts;
}

export function validatePlan(plan) {
  return planChanges(plan);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(file) {
  return sha256(readFileSync(file));
}

function repositoryRoot(env) {
  return resolve(first(env, 'GITHUB_WORKSPACE') || process.cwd());
}

function terraformRoot(env) {
  const root = join(repositoryRoot(env), 'infra', 'terraform');
  if (!existsSync(root)) throw new DeliveryError('Terraform platform source is unavailable in this checkout');
  return root;
}

function lockPath(env) {
  const file = join(terraformRoot(env), '.terraform.lock.hcl');
  if (!existsSync(file)) throw new DeliveryError('Terraform provider lock file is missing');
  return file;
}

function planContext(env, inputs, environment) {
  const commit = required(env, 'GITHUB_SHA');
  const currentRunId = required(env, 'GITHUB_RUN_ID');
  const currentAttempt = required(env, 'GITHUB_RUN_ATTEMPT');
  let runId = currentRunId;
  let attempt = currentAttempt;
  if (inputs.operation === 'apply') {
    [runId, attempt] = inputs.plan_id.split('-');
  }
  if (!/^[0-9]+$/.test(runId) || !/^[0-9]+$/.test(attempt)) throw new DeliveryError('GitHub run identifiers must be numeric');
  const planId = inputs.operation === 'apply' ? inputs.plan_id : `${runId}-${attempt}`;
  if (!PLAN_ID.test(planId)) throw new DeliveryError('Invalid protected plan identifier');
  return {
    commit,
    run_id: runId,
    run_attempt: attempt,
    plan_id: planId,
    prefix: `plans/${commit}/${planId}`,
    repository: REPOSITORY,
    workflow: WORKFLOW,
    backend: environment.backend,
    tenant_id: environment.backend.tenant_id,
    subscription_id: environment.backend.subscription_id,
    terraform_version: TERRAFORM_VERSION,
    provider_lock_sha256: fileSha256(lockPath(env)),
  };
}

function privateDir(env) {
  const base = first(env, 'CIRI_PLATFORM_TEMP_ROOT', 'RUNNER_TEMP') || tmpdir();
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const dir = mkdtempSync(join(base, 'ciri-platform-'));
  chmodSync(dir, 0o700);
  return dir;
}

function openOutput(file) {
  const fd = openSync(file, 'w', 0o600);
  chmodSync(file, 0o600);
  return fd;
}

function runCommand(command, args, { cwd, stdout, stderr, env = process.env, label } = {}) {
  let outFd;
  let errFd;
  try {
    outFd = stdout ? openOutput(stdout) : 'ignore';
    errFd = stderr ? (stderr === stdout ? outFd : openOutput(stderr)) : 'ignore';
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, ...env, TF_LOG: 'off' },
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    });
    if (result.error) throw new DeliveryError(`${command} could not start`);
    if (result.status !== 0) throw new DeliveryError(`${command} ${label || args[0] || 'command'} failed`, result.status || 1);
    return result.status;
  } finally {
    if (typeof errFd === 'number' && errFd !== outFd) closeSync(errFd);
    if (typeof outFd === 'number') closeSync(outFd);
  }
}

function writeTerraformInputs(file, environment) {
  writeFileSync(file, JSON.stringify(environment.vars), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function terraformArgsForInit(environment) {
  const b = environment.backend;
  return [
    'init', '-input=false', '-lockfile=readonly',
    `-backend-config=storage_account_name=${b.storage_account}`,
    `-backend-config=container_name=${b.container}`,
    `-backend-config=key=${b.key}`,
    `-backend-config=resource_group_name=${b.resource_group}`,
    `-backend-config=subscription_id=${b.subscription_id}`,
    `-backend-config=tenant_id=${b.tenant_id}`,
    '-backend-config=use_azuread_auth=true',
    '-backend-config=use_oidc=true',
  ];
}

function blobArgs(mode, context, name, file) {
  const common = [
    'storage', 'blob', mode,
    '--auth-mode', 'login',
    '--account-name', context.backend.storage_account,
    '--container-name', context.backend.container,
    '--name', `${context.prefix}/${name}`,
    '--only-show-errors', '--output', 'none',
  ];
  if (mode === 'upload') return [...common, '--file', file, '--overwrite', 'false'];
  return [...common, '--file', file, '--no-progress'];
}

function uploadFile(env, context, name, file, diagnostics) {
  const stdout = join(diagnostics, `az-upload-${name.replace(/[^a-z0-9.-]/gi, '_')}.log`);
  runCommand('az', blobArgs('upload', context, name, file), { cwd: repositoryRoot(env), stdout, stderr: stdout, env, label: 'upload' });
}

function downloadFile(env, context, name, file, diagnostics) {
  const stdout = join(diagnostics, `az-download-${name.replace(/[^a-z0-9.-]/gi, '_')}.log`);
  runCommand('az', blobArgs('download', context, name, file), { cwd: repositoryRoot(env), stdout, stderr: stdout, env, label: 'download' });
}

function uploadBestEffort(env, context, files, diagnostics) {
  for (const [name, file] of files) {
    if (!existsSync(file)) continue;
    try {
      uploadFile(env, context, name, file, diagnostics);
    } catch {
      // Preserve the original Terraform failure; upload errors must not hide it.
    }
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function buildManifest({ context, createdAt, binaryPath, files, counts }) {
  const created = new Date(createdAt || Date.now());
  if (Number.isNaN(created.getTime())) throw new DeliveryError('Manifest creation time is invalid');
  const expires = new Date(created.getTime() + PLAN_TTL_HOURS * 60 * 60 * 1000);
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    repository: context.repository,
    workflow: context.workflow,
    commit: context.commit,
    run_id: context.run_id,
    run_attempt: context.run_attempt,
    plan_id: context.plan_id,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
    terraform_version: context.terraform_version,
    provider_lock_sha256: context.provider_lock_sha256,
    tenant_id: context.tenant_id,
    subscription_id: context.subscription_id,
    backend: context.backend,
    original_plan_sha256: fileSha256(binaryPath),
    files,
    change_counts: counts,
  };
}

function assertManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new DeliveryError('Stored plan manifest is invalid');
  for (const key of ['schema_version', 'repository', 'workflow', 'commit', 'run_id', 'run_attempt', 'plan_id', 'created_at', 'expires_at', 'terraform_version', 'provider_lock_sha256', 'tenant_id', 'subscription_id', 'backend', 'original_plan_sha256', 'files']) {
    if (!(key in manifest)) throw new DeliveryError(`Stored plan manifest is incomplete: ${key}`);
  }
  if (manifest.schema_version !== PLAN_SCHEMA_VERSION || manifest.repository !== REPOSITORY || manifest.workflow !== WORKFLOW) throw new DeliveryError('Stored plan manifest identity is invalid');
  if (!SHA40.test(manifest.commit) || !/^\d+$/.test(String(manifest.run_id)) || !/^\d+$/.test(String(manifest.run_attempt)) || !PLAN_ID.test(manifest.plan_id)) throw new DeliveryError('Stored plan manifest identifiers are invalid');
  if (!SHA256.test(manifest.provider_lock_sha256) || !SHA256.test(manifest.original_plan_sha256)) throw new DeliveryError('Stored plan manifest digests are invalid');
  if (!UUID.test(manifest.tenant_id) || !UUID.test(manifest.subscription_id)) throw new DeliveryError('Stored plan manifest Azure identity is invalid');
  if (!manifest.backend || typeof manifest.backend !== 'object' || !manifest.files || typeof manifest.files !== 'object') throw new DeliveryError('Stored plan manifest backend/files are invalid');
  if (manifest.files.binary !== 'tfplan' || manifest.files.text !== 'plan.txt' || manifest.files.json !== 'plan.json') throw new DeliveryError('Stored plan manifest filenames are invalid');
  const created = Date.parse(manifest.created_at);
  const expires = Date.parse(manifest.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created || expires - created > PLAN_TTL_HOURS * 60 * 60 * 1000) throw new DeliveryError('Stored plan manifest expiry is invalid');
  return manifest;
}

export function verifyManifest(manifest, expected, { binaryPath, now = Date.now() } = {}) {
  assertManifestShape(manifest);
  if (manifest.commit !== expected.commit || manifest.plan_id !== expected.plan_id || manifest.run_id !== expected.run_id || manifest.run_attempt !== expected.run_attempt) throw new DeliveryError('Stored plan does not match the requested main run');
  if (manifest.terraform_version !== expected.terraform_version || manifest.provider_lock_sha256 !== expected.provider_lock_sha256) throw new DeliveryError('Stored plan toolchain or provider lock does not match');
  if (manifest.tenant_id !== expected.tenant_id || manifest.subscription_id !== expected.subscription_id) throw new DeliveryError('Stored plan Azure identity does not match');
  if (JSON.stringify(manifest.backend) !== JSON.stringify(expected.backend)) throw new DeliveryError('Stored plan backend does not match');
  if (Date.parse(manifest.expires_at) <= now) throw new DeliveryError('Stored plan has expired');
  if (expected.reviewed_plan_sha256 && manifest.original_plan_sha256 !== expected.reviewed_plan_sha256) throw new DeliveryError('Stored plan digest does not match the reviewed digest');
  if (binaryPath && fileSha256(binaryPath) !== manifest.original_plan_sha256) throw new DeliveryError('Downloaded plan bytes do not match the stored digest');
  return manifest;
}

function runPlan(env) {
  const { inputs, environment } = validateDispatchInputs(env);
  const context = planContext(env, inputs, environment);
  const temp = privateDir(env);
  const terraform = terraformRoot(env);
  const tfvars = join(temp, 'platform.tfvars.json');
  const binary = join(temp, 'tfplan');
  const text = join(temp, 'plan.txt');
  const json = join(temp, 'plan.json');
  const diagnostics = join(temp, 'diagnostics');
  mkdirSync(diagnostics, { mode: 0o700 });
  const diagnosticFiles = [
    ['terraform-init.log', join(diagnostics, 'terraform-init.log')],
    ['terraform-fmt.log', join(diagnostics, 'terraform-fmt.log')],
    ['terraform-validate.log', join(diagnostics, 'terraform-validate.log')],
    ['terraform-plan.log', join(diagnostics, 'terraform-plan.log')],
    ['terraform-plan.err', join(diagnostics, 'terraform-plan.err')],
    ['terraform-show.log', join(diagnostics, 'terraform-show.log')],
    ['terraform-show-json.log', join(diagnostics, 'terraform-show-json.log')],
  ];
  try {
    writeTerraformInputs(tfvars, environment);
    runCommand('terraform', ['fmt', '-check', '-recursive'], { cwd: terraform, stdout: diagnosticFiles[1][1], stderr: diagnosticFiles[1][1], env });
    runCommand('terraform', terraformArgsForInit(environment), { cwd: terraform, stdout: diagnosticFiles[0][1], stderr: diagnosticFiles[0][1], env });
    runCommand('terraform', ['validate', '-no-color'], { cwd: terraform, stdout: diagnosticFiles[2][1], stderr: diagnosticFiles[2][1], env });
    runCommand('terraform', ['plan', '-input=false', '-lock-timeout=5m', `-var-file=${tfvars}`, `-out=${binary}`], { cwd: terraform, stdout: diagnosticFiles[3][1], stderr: diagnosticFiles[4][1], env });
    runCommand('terraform', ['show', '-no-color', binary], { cwd: terraform, stdout: text, stderr: diagnosticFiles[5][1], env });
    runCommand('terraform', ['show', '-json', binary], { cwd: terraform, stdout: json, stderr: diagnosticFiles[6][1], env });
    const counts = validatePlan(parseObjectJson(readFileSync(json, 'utf8'), 'Terraform JSON plan'));
    const files = {
      binary: 'tfplan',
      text: 'plan.txt',
      json: 'plan.json',
      diagnostics: diagnosticFiles.map(([name]) => name),
    };
    const manifest = buildManifest({ context, binaryPath: binary, files, counts });
    const manifestFile = join(temp, 'manifest.json');
    writeJson(manifestFile, manifest);
    for (const [name, file] of [['tfplan', binary], ['plan.txt', text], ['plan.json', json], ...diagnosticFiles]) uploadFile(env, context, name, file, diagnostics);
    uploadFile(env, context, 'manifest.json', manifestFile, diagnostics);
    console.log(`Protected plan saved for ${context.commit.slice(0, 12)} as ${context.plan_id}; expiry ${manifest.expires_at}`);
  } catch (error) {
    uploadBestEffort(env, context, diagnosticFiles, diagnostics);
    throw error;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function runApply(env) {
  const { inputs, environment } = validateDispatchInputs(env);
  const context = planContext(env, inputs, environment);
  const temp = privateDir(env);
  const terraform = terraformRoot(env);
  const diagnostics = join(temp, 'diagnostics');
  mkdirSync(diagnostics, { mode: 0o700 });
  const manifestFile = join(temp, 'manifest.json');
  const binary = join(temp, 'tfplan');
  const text = join(temp, 'plan.txt');
  const json = join(temp, 'plan.json');
  try {
    downloadFile(env, context, 'manifest.json', manifestFile, diagnostics);
    const manifest = parseObjectJson(readFileSync(manifestFile, 'utf8'), 'stored manifest');
    verifyManifest(manifest, { ...context, reviewed_plan_sha256: inputs.reviewed_plan_sha256 });
    downloadFile(env, context, 'tfplan', binary, diagnostics);
    verifyManifest(manifest, { ...context, reviewed_plan_sha256: inputs.reviewed_plan_sha256 }, { binaryPath: binary });
    runCommand('terraform', terraformArgsForInit(environment), { cwd: terraform, stdout: join(diagnostics, 'terraform-init.log'), stderr: join(diagnostics, 'terraform-init.log'), env });
    runCommand('terraform', ['show', '-no-color', binary], { cwd: terraform, stdout: text, stderr: join(diagnostics, 'terraform-show.log'), env });
    runCommand('terraform', ['show', '-json', binary], { cwd: terraform, stdout: json, stderr: join(diagnostics, 'terraform-show-json.log'), env });
    validatePlan(parseObjectJson(readFileSync(json, 'utf8'), 'Terraform JSON plan'));
    runCommand('terraform', ['apply', '-input=false', '-lock-timeout=5m', binary], { cwd: terraform, stdout: join(diagnostics, 'terraform-apply.log'), stderr: join(diagnostics, 'terraform-apply.log'), env });
    console.log(`Applied the reviewed platform plan ${context.plan_id} for ${context.commit.slice(0, 12)}`);
  } catch (error) {
    uploadBestEffort(env, context, [
      ['apply-init.log', join(diagnostics, 'terraform-init.log')],
      ['apply-show.log', join(diagnostics, 'terraform-show.log')],
      ['apply-show-json.log', join(diagnostics, 'terraform-show-json.log')],
      ['apply.log', join(diagnostics, 'terraform-apply.log')],
    ], diagnostics);
    throw error;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0];
  if (command === 'validate-dispatch') {
    validateDispatchInputs(env);
    console.log('Protected platform dispatch inputs and environment configuration are valid');
    return;
  }
  if (command === 'plan') return runPlan(env);
  if (command === 'apply') return runApply(env);
  throw new DeliveryError('Usage: azure-platform-delivery.mjs validate-dispatch|plan|apply');
}

const entry = process.argv[1] && resolve(process.argv[1]);
if (entry === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    const exitCode = error instanceof DeliveryError ? error.exitCode : 1;
    console.error(error instanceof Error ? error.message : 'Protected platform delivery failed');
    process.exitCode = exitCode > 0 && exitCode <= 255 ? exitCode : 1;
  }
}
