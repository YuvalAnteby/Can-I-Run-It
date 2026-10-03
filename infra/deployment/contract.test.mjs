import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateCostEvidence, validateBindings, validateInputs, validatePlan, verifyReceipt } from './contract.mjs';

const subscription = '11111111-1111-4111-8111-111111111111';
const tenant = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-03T12:00:00Z');
const meterNames = ['postgres-compute', 'postgres-storage', 'postgres-backup', 'container-compute', 'container-requests', 'key-vault', 'state-blob', 'export-blob', 'monitor', 'bandwidth', 'budgets'];
const evidence = () => ({
  subscription_id: subscription, tenant_id: tenant, region: 'westeurope', verified_at: '2026-10-03T10:00:00Z',
  credit_period_start: '2026-09-01', credit_period_end: '2027-09-01', credit_currency: 'USD', remaining_credit: 95,
  spending_protection_enabled: true, resource_inventory_reconciled: true, state_inventory_reconciled: true,
  postgres_free_hours: 750, postgres_free_storage_gib: 32, postgres_free_backup_gib: 32,
  free_service_expiry: '2027-09-01', sku_and_region_verified: true, provider_registrations_verified: true,
  account_evidence_reference: 'private-operator-evidence/2026-10-03', reserve: 10,
  meters: meterNames.map(name => ({ name, currency: 'USD', quantity: 1, unit_price: 0.5, verified_free_allowance: 0, net_monthly_estimate: 0.5, allowance_expiry: '2027-09-01', price_source: 'https://prices.azure.com/api/retail/prices', grant_evidence_reference: 'private-operator-evidence/2026-10-03' })),
});

test('verified account and credit evidence must describe the actual Terraform inputs', () => {
  const cost = evidence(), context = { subscription, tenant, region: 'westeurope' };
  const inputs = { subscription_id: subscription, tenant_id: tenant, location: 'westeurope', entitlement_verified: true, credit_period_start: cost.credit_period_start, credit_period_end: cost.credit_period_end, credit_currency: 'USD' };
  assert.doesNotThrow(() => validateBindings(inputs, cost, context));
  for (const patch of [{ subscription_id: tenant }, { tenant_id: subscription }, { credit_period_end: '2028-01-01' }, { credit_currency: 'EUR' }, { entitlement_verified: false }]) assert.throws(() => validateBindings({ ...inputs, ...patch }, cost, context));
});

test('cost gate binds recent real-account evidence, every meter, credit period and reserved budget', () => {
  assert.doesNotThrow(() => validateCostEvidence(evidence(), { subscription, tenant, region: 'westeurope' }, now));
  for (const patch of [
    { subscription_id: tenant }, { verified_at: '2026-09-01T00:00:00Z' }, { region: 'eastus' },
    { spending_protection_enabled: false }, { resource_inventory_reconciled: false },
    { postgres_free_hours: 0 }, { remaining_credit: 3 }, { meters: [] },
    { credit_period_end: '2026-10-01' }, { credit_currency: 'EUR' },
  ]) assert.throws(() => validateCostEvidence({ ...evidence(), ...patch }, { subscription, tenant, region: 'westeurope' }, now));
});

const resource = (type, after) => ({ address: `${type}.example`, type, mode: 'managed', change: { actions: ['create'], after } });
const armResource = (type, body, name = 'example') => resource('azapi_resource', { type, name, body, response_export_values: [] });
const plan = () => ({ resource_changes: [
  armResource('Microsoft.Web/staticSites@2024-04-01', { sku: { tier: 'Free', name: 'Free' } }),
  resource('azurerm_container_app_environment', { infrastructure_subnet_id: null, workload_profile: [{ name: 'Consumption', workload_profile_type: 'Consumption' }] }),
  armResource('Microsoft.App/containerApps@2024-03-01', { properties: { workloadProfileName: 'Consumption', configuration: { activeRevisionsMode: 'Single', ingress: { external: true, allowInsecure: false, targetPort: 4000, traffic: [{ latestRevision: true, weight: 100 }] }, secrets: [{ name: 'rawg-api-key', keyVaultUrl: 'https://vault.vault.azure.net/secrets/rawg' }] }, template: { scale: { minReplicas: 0, maxReplicas: 1 }, containers: [{ resources: { cpu: 0.5, memory: '1Gi' } }] } } }),
  resource('azurerm_postgresql_flexible_server', { version: '16', sku_name: 'B_Standard_B1ms', storage_mb: 32768, auto_grow_enabled: false, backup_retention_days: 7, geo_redundant_backup_enabled: false, public_network_access_enabled: true, high_availability: [], authentication: [{ active_directory_auth_enabled: true, password_auth_enabled: false }] }),
  resource('azurerm_postgresql_flexible_server_firewall_rule', { start_ip_address: '8.8.8.8', end_ip_address: '8.8.8.8' }),
  armResource('Microsoft.Storage/storageAccounts@2023-05-01', { kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: { accessTier: 'Hot', minimumTlsVersion: 'TLS1_2', allowSharedKeyAccess: false, defaultToOAuthAuthentication: true, allowBlobPublicAccess: false, supportsHttpsTrafficOnly: true } }),
  ...['migration', 'export', 'firewall', 'export-check'].map(name => {
    const heavy = ['migration', 'export'].includes(name);
    return armResource('Microsoft.App/jobs@2024-03-01', { properties: { workloadProfileName: 'Consumption', configuration: { replicaTimeout: heavy ? 600 : 60, replicaRetryLimit: 0, triggerType: 'Manual', manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 } }, template: { containers: [{ resources: { cpu: heavy ? 0.5 : 0.25, memory: heavy ? '1Gi' : '0.5Gi' } }] } } }, `ciri-${name}`);
  }),
] });

test('review gate rejects forbidden paid topology, broad firewall, secret values and destructive changes', () => {
  assert.doesNotThrow(() => validatePlan(plan()));
  for (const item of [
    resource('azurerm_virtual_network', {}), resource('azurerm_nat_gateway', {}),
    resource('azurerm_role_assignment', {}), resource('azurerm_monitor_metric_alert', {}),
    resource('azurerm_postgresql_flexible_server_firewall_rule', { start_ip_address: '0.0.0.0', end_ip_address: '0.0.0.0' }),
    resource('azurerm_postgresql_flexible_server_firewall_rule', { start_ip_address: '8.8.8.8', end_ip_address: '8.8.8.9' }),
  ]) assert.throws(() => validatePlan({ resource_changes: [...plan().resource_changes, item] }));
  const secret = plan(); secret.resource_changes[2].change.after.body.properties.configuration.secrets[0].value = 'example-actual-secret';
  assert.throws(() => validatePlan(secret));
  const deletion = plan(); deletion.resource_changes[0].change.actions = ['delete', 'create'];
  assert.throws(() => validatePlan(deletion));
  const replicas = plan(); replicas.resource_changes[2].change.after.body.properties.template.scale.minReplicas = 1;
  assert.throws(() => validatePlan(replicas));
});

test('Terraform inputs accept metadata and deny plaintext credentials', () => {
  assert.doesNotThrow(() => validateInputs({ prefix: 'ciri', provider_secret_uris: { RAWG_API_KEY: 'https://vault.vault.azure.net/secrets/rawg' } }));
  assert.throws(() => validateInputs({ secret_environment_variables: { RAWG_API_KEY: 'example-secret' } }));
  assert.throws(() => validateInputs({ postgres_password: 'example-secret' }));
  assert.throws(() => validateInputs({ provider_secret_uris: { RAWG_API_KEY: 'example-secret' } }));
  assert.throws(() => validateInputs({ provider_secret_uris: { RAWG_API_KEY: 'https://vault.vault.azure.net/secrets/rawg/' + 'a'.repeat(32) } }));
});

test('SWA uses metadata-only AzAPI and cannot hide unapproved topology in AzAPI', () => {
  const value = plan();
  assert.doesNotThrow(() => validatePlan(value));
  value.resource_changes[0].change.after.body.sku.name = 'Standard'; assert.throws(() => validatePlan(value));
  value.resource_changes[0].change.after.type = 'Microsoft.Network/virtualNetworks@2024-01-01'; assert.throws(() => validatePlan(value));
});

test('saved-plan receipt binds exact reviewed bytes, commit, inputs, cost evidence, account and expiry', () => {
  const bytes = Buffer.from('reviewed plan');
  const expected = { commit: 'a'.repeat(40), repository: 'YuvalAnteby/Can-I-Run-It', subscription, tenant, inputs_sha256: 'b'.repeat(64), cost_sha256: 'c'.repeat(64) };
  const receipt = { ...expected, created_at: '2026-10-03T11:00:00Z', plan_sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.doesNotThrow(() => verifyReceipt(receipt, expected, bytes, now));
  assert.throws(() => verifyReceipt(receipt, expected, Buffer.from('changed plan'), now));
  assert.throws(() => verifyReceipt({ ...receipt, commit: 'd'.repeat(40) }, expected, bytes, now));
  assert.throws(() => verifyReceipt({ ...receipt, created_at: '2026-10-01T00:00:00Z' }, expected, bytes, now));
});
