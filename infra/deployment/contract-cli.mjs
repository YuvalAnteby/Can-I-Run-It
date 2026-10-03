import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { validateCostEvidence, validateBindings, validateInputs, validatePlan, verifyReceipt, sha256 } from './contract.mjs';

function environment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing deployment metadata: ${name}`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function context() {
  if (environment('GITHUB_REF') !== 'refs/heads/main') throw new Error('Production deployment is main-only');
  const inputs = JSON.parse(environment('AZURE_TERRAFORM_VARS_JSON'));
  const cost = JSON.parse(environment('AZURE_COST_EVIDENCE_JSON'));
  const subscription = environment('AZURE_SUBSCRIPTION_ID'), tenant = environment('AZURE_TENANT_ID');
  const region = environment('AZURE_LOCATION');
  validateInputs(inputs);
  validateBindings(inputs, cost, { subscription, tenant, region });
  validateCostEvidence(cost, { subscription, tenant, region });
  return { inputs, expected: {
    commit: environment('GITHUB_SHA'), repository: environment('GITHUB_REPOSITORY'), subscription, tenant,
    inputs_sha256: sha256(JSON.stringify(canonical(inputs))), cost_sha256: sha256(JSON.stringify(canonical(cost))),
    terraform_version: environment('TERRAFORM_VERSION'),
  } };
}

try {
  const [operation, ...paths] = process.argv.slice(2);
  const { inputs, expected } = context();
  if (operation === 'prepare' && paths.length === 1) {
    writeFileSync(paths[0], JSON.stringify(inputs), { mode: 0o600 });
    console.log('Validated recorded deployment evidence and metadata; live account checks follow.');
  } else if (operation === 'plan' && paths.length === 3) {
    const [jsonPath, binaryPath, receiptPath] = paths;
    const plan = JSON.parse(readFileSync(jsonPath, 'utf8'));
    validatePlan(plan);
    chmodSync(binaryPath, 0o600); chmodSync(jsonPath, 0o600);
    writeFileSync(receiptPath, JSON.stringify({ ...expected, created_at: new Date().toISOString(), plan_sha256: sha256(readFileSync(binaryPath)) }), { mode: 0o600 });
    for (const resource of plan.resource_changes.filter(item => item.mode !== 'data')) console.log(`${resource.address}: ${resource.change.actions.join(', ')}`);
    console.log('Plan contract verified; review the full plan privately before authorizing apply.');
  } else if (operation === 'verify' && paths.length === 3) {
    const [jsonPath, binaryPath, receiptPath] = paths;
    verifyReceipt(JSON.parse(readFileSync(receiptPath, 'utf8')), expected, readFileSync(binaryPath));
    validatePlan(JSON.parse(readFileSync(jsonPath, 'utf8')));
    console.log('Exact reviewed plan and current deployment context verified.');
  } else throw new Error('Usage: contract-cli.mjs prepare INPUTS | plan JSON BINARY RECEIPT | verify JSON BINARY RECEIPT');
} catch (error) {
  // Never print credential-bearing environment values, raw plans or SDK responses.
  console.error(error instanceof SyntaxError ? 'Invalid deployment metadata JSON' : error.message);
  process.exitCode = 1;
}
