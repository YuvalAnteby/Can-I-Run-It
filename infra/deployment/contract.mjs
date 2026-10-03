import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const date = value => { const result = new Date(value); requireValue(Number.isFinite(result.getTime()), 'Invalid evidence date'); return result; };
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function validateBindings(inputs, cost, context) {
  requireValue(inputs.subscription_id === context.subscription && inputs.tenant_id === context.tenant, 'Terraform inputs belong to another account');
  requireValue((inputs.location ?? 'westeurope') === context.region, 'Configured deployment regions differ');
  requireValue(inputs.entitlement_verified === true, 'Terraform entitlement gate must be explicitly verified');
  for (const field of ['credit_period_start', 'credit_period_end']) requireValue(date(inputs[field]).getTime() === date(cost[field]).getTime(), 'Terraform credit period differs from verified evidence');
  requireValue(inputs.credit_currency === cost.credit_currency, 'Terraform credit currency differs from verified evidence');
}

export function validateCostEvidence(evidence, context, now = new Date()) {
  requireValue(evidence?.subscription_id === context.subscription && evidence.tenant_id === context.tenant, 'Cost evidence belongs to another account');
  requireValue(evidence.region === context.region, 'Cost evidence region differs from deployment');
  const age = now - date(evidence.verified_at);
  requireValue(age >= 0 && age <= 7 * 86400000, 'Cost/account evidence must be observed within seven days');
  for (const field of ['spending_protection_enabled', 'resource_inventory_reconciled', 'state_inventory_reconciled', 'sku_and_region_verified', 'provider_registrations_verified']) requireValue(evidence[field] === true, `Missing verified gate: ${field}`);
  requireValue(typeof evidence.account_evidence_reference === 'string' && evidence.account_evidence_reference.length > 0, 'Missing account evidence reference');
  const start = date(evidence.credit_period_start), end = date(evidence.credit_period_end);
  requireValue(start <= now && now < end && date(evidence.free_service_expiry) >= end, 'Credit/free-service period is not eligible for this deployment');
  requireValue(evidence.postgres_free_hours >= 750 && evidence.postgres_free_storage_gib >= 32 && evidence.postgres_free_backup_gib >= 32, 'Required PostgreSQL account allowance is unverified');
  requireValue(/^[A-Z]{3}$/.test(evidence.credit_currency), 'Missing verified credit currency');
  requireValue(Number.isFinite(evidence.remaining_credit) && evidence.remaining_credit > 0 && Number.isFinite(evidence.reserve) && evidence.reserve > 0, 'Missing remaining credit/reserve');
  const categories = new Set(['postgres-compute', 'postgres-storage', 'postgres-backup', 'container-compute', 'container-requests', 'key-vault', 'state-blob', 'export-blob', 'monitor', 'bandwidth', 'budgets']);
  requireValue(Array.isArray(evidence.meters) && evidence.meters.length <= 128, 'Missing complete regional cost worksheet');
  let monthly = 0;
  for (const meter of evidence.meters) {
    requireValue(meter.currency === evidence.credit_currency, 'Cost/credit currencies differ; verified conversion is required');
    for (const field of ['quantity', 'unit_price', 'verified_free_allowance', 'net_monthly_estimate']) requireValue(Number.isFinite(meter[field]) && meter[field] >= 0, 'Invalid cost worksheet quantity/price');
    requireValue(typeof meter.price_source === 'string' && meter.price_source.startsWith('https://') && typeof meter.grant_evidence_reference === 'string' && meter.grant_evidence_reference.length > 0, 'Missing regional price/grant evidence');
    requireValue(date(meter.allowance_expiry) >= end, 'Cost worksheet must account for expiring allowances');
    const net = Math.max(0, meter.quantity - meter.verified_free_allowance) * meter.unit_price;
    requireValue(Math.abs(net - meter.net_monthly_estimate) < 0.01, 'Cost worksheet arithmetic is inconsistent');
    monthly += net; categories.delete(meter.name);
  }
  requireValue(categories.size === 0, 'Cost worksheet omits required resource categories');
  const monthsRemaining = (end - now) / (365.2425 / 12 * 86400000);
  requireValue(monthly <= 8 && monthly * monthsRemaining + evidence.reserve <= evidence.remaining_credit, 'Estimated deployment exceeds the credit/reserve target');
}

const vaultUri = value => typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/secrets\/[a-z0-9-]+$/i.test(value);
export function validateInputs(inputs) {
  requireValue(inputs && typeof inputs === 'object' && !Array.isArray(inputs), 'Terraform inputs must be a metadata object');
  function walk(value, key = '', depth = 0, secretMap = false) {
    requireValue(depth < 10, 'Terraform input nesting exceeds the metadata contract');
    if (secretMap && typeof value === 'string') { requireValue(vaultUri(value), 'Provider secret inputs must be Key Vault URIs'); return; }
    if (/password|token|api_key|secret_value|secret_environment_variables/i.test(key)) requireValue(value === false || value === null, 'Plaintext credentials are forbidden in Terraform inputs');
    if (/secret_(uri|id)$/i.test(key)) requireValue(vaultUri(value), 'Secret metadata must be a Key Vault URI');
    if (value && typeof value === 'object') {
      requireValue(Object.keys(value).length <= 128, 'Terraform metadata is unbounded');
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey, depth + 1, /provider_secret_uris|key_vault_secret_uris/.test(key));
    } else if (typeof value === 'string') requireValue(value.length <= 4096, 'Terraform metadata value is unbounded');
  }
  walk(inputs);
}

export function validatePlan(plan) {
  requireValue(Array.isArray(plan?.resource_changes), 'Missing reviewed Terraform resource changes');
  const allowed = new Set(['azapi_resource', 'azurerm_resource_group', 'azurerm_user_assigned_identity', 'azurerm_container_app_environment', 'azurerm_application_insights', 'azurerm_monitor_diagnostic_setting', 'azurerm_key_vault', 'azurerm_postgresql_flexible_server', 'azurerm_postgresql_flexible_server_configuration', 'azurerm_postgresql_flexible_server_database', 'azurerm_postgresql_flexible_server_firewall_rule', 'azurerm_consumption_budget_subscription']);
  const counts = new Map();
  const count = type => counts.set(type, (counts.get(type) ?? 0) + 1);
  for (const resource of plan.resource_changes) {
    if (resource.mode === 'data') {
      requireValue(!/key_vault_secret|storage_account_sas/.test(resource.type), 'Terraform must not read actual secret values');
      continue;
    }
    requireValue(allowed.has(resource.type), 'Plan contains an unapproved resource, secret-reading provider resource, networking, elevated RBAC or paid alert');
    requireValue(!resource.change.actions.includes('delete'), 'Destructive/replacement plans require a separate operator review');
    const value = resource.change.after;
    if (!value) continue;
    count(resource.type);
    if (resource.type === 'azapi_resource') {
      const body = value.body, p = body?.properties;
      requireValue(value.response_export_values?.every(v => ['properties.defaultHostname', 'properties.configuration.ingress.fqdn'].includes(v)), 'AzAPI may export only explicitly approved public metadata');
      switch (value.type) {
        case 'Microsoft.Web/staticSites@2024-04-01':
          count('swa'); requireValue(body.sku?.tier === 'Free' && body.sku.name === 'Free', 'SWA must remain Free'); break;
        case 'Microsoft.Storage/storageAccounts@2023-05-01':
          count('exports'); requireValue(body.kind === 'StorageV2' && body.sku?.name === 'Standard_LRS' && p.accessTier === 'Hot' && p.minimumTlsVersion === 'TLS1_2' && p.allowSharedKeyAccess === false && p.defaultToOAuthAuthentication === true && p.allowBlobPublicAccess === false && p.supportsHttpsTrafficOnly === true, 'Export account must be private Hot LRS with Entra-only data access'); break;
        case 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01':
          requireValue(p.isVersioningEnabled === false && p.deleteRetentionPolicy?.enabled === false && p.containerDeleteRetentionPolicy?.enabled === false, 'Export copies must not accumulate hidden versions or soft deletes'); break;
        case 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01':
          requireValue(['exports', 'control'].includes(value.name) && p.publicAccess === 'None', 'Export/control containers must be private and separate'); break;
        case 'Microsoft.OperationalInsights/workspaces@2023-09-01':
          requireValue(p.sku?.name === 'PerGB2018' && p.retentionInDays === 30 && p.workspaceCapping?.dailyQuotaGb === 0.1 && p.features?.disableLocalAuth === true, 'Monitoring retention/cap/local-auth contract changed'); break;
        case 'Microsoft.App/containerApps@2024-03-01': {
          count('api'); const t = p.template, c = t?.containers?.[0], i = p.configuration?.ingress;
          requireValue(p.workloadProfileName === 'Consumption' && p.configuration?.activeRevisionsMode === 'Single' && t?.scale?.minReplicas === 0 && t.scale.maxReplicas === 1 && t.containers.length === 1 && c?.resources?.cpu === 0.5 && c.resources.memory === '1Gi', 'API capacity differs from the approved contract');
          requireValue(i?.external === true && i.allowInsecure === false && i.targetPort === 4000 && i.traffic?.length === 1 && i.traffic[0].latestRevision === true && i.traffic[0].weight === 100 && !i.traffic[0].label, 'API must use HTTPS ingress with all traffic on latest revision');
          for (const secret of p.configuration?.secrets ?? []) requireValue(secret.name === 'applicationinsights-connection-string' || (!secret.value && vaultUri(secret.keyVaultUrl)), 'Native Key Vault metadata must replace provider secret values');
          break;
        }
        case 'Microsoft.App/jobs@2024-03-01': {
          count('jobs'); const config = p.configuration, containers = p.template?.containers;
          const heavy = /-(migration|export)$/.test(value.name), timeout = heavy ? 600 : 60;
          requireValue(/-(migration|export|firewall|export-check)$/.test(value.name) && p.workloadProfileName === 'Consumption' && config?.replicaTimeout === timeout && config.replicaRetryLimit === 0 && containers?.length === 1 && containers[0].resources?.cpu === (heavy ? 0.5 : 0.25) && containers[0].resources.memory === (heavy ? '1Gi' : '0.5Gi'), 'Finite Job resource/time/retry contract changed');
          const trigger = config.triggerType === 'Manual' ? config.manualTriggerConfig : config.triggerType === 'Schedule' ? config.scheduleTriggerConfig : null;
          requireValue(trigger?.parallelism === 1 && trigger.replicaCompletionCount === 1, 'Jobs must execute only one replica');
          requireValue(!config.secrets?.length, 'Maintenance Jobs cannot receive provider secrets');
          if (config.triggerType === 'Schedule') requireValue(!heavy && trigger.cronExpression === (value.name.endsWith('-firewall') ? '0 * * * *' : '0 2 * * *'), 'Maintenance schedule differs from the approved UTC contract');
          break;
        }
        default: throw new Error('Unapproved AzAPI resource type');
      }
    }
    if (resource.type === 'azurerm_container_app_environment') requireValue(!value.infrastructure_subnet_id && value.workload_profile?.length === 1 && value.workload_profile[0].workload_profile_type === 'Consumption', 'ACA must use the default Consumption network/profile');
    if (resource.type === 'azurerm_postgresql_flexible_server') {
      const auth = value.authentication?.[0];
      requireValue(value.version === '16' && value.sku_name === 'B_Standard_B1ms' && value.storage_mb === 32768 && value.auto_grow_enabled === false && value.backup_retention_days === 7 && value.geo_redundant_backup_enabled === false && !value.high_availability?.length && value.public_network_access_enabled === true, 'PostgreSQL SKU/storage/backups differ from the approved contract');
      requireValue(auth?.active_directory_auth_enabled === true && auth.password_auth_enabled === false && !value.administrator_password, 'PostgreSQL must remain Entra-only');
    }
    if (resource.type === 'azurerm_postgresql_flexible_server_firewall_rule') requireValue(isIP(value.start_ip_address) === 4 && value.start_ip_address !== '0.0.0.0' && value.start_ip_address === value.end_ip_address, 'Firewall rules must be individual IPv4 addresses; Azure-services bypass is forbidden');
    if (resource.type === 'azurerm_monitor_diagnostic_setting') requireValue(!value.enabled_metric?.length && !value.metric?.some(m => m.enabled) && value.enabled_log?.every(log => ['ContainerAppConsoleLogs', 'ContainerAppSystemLogs'].includes(log.category)), 'Only bounded console/system diagnostics are allowed');
  }
  for (const type of ['swa', 'api', 'exports', 'azurerm_container_app_environment', 'azurerm_postgresql_flexible_server']) requireValue(counts.get(type) === 1, 'Platform plan must contain exactly one of each approved serving/storage resource');
  requireValue(counts.get('jobs') === 4, 'Platform plan must contain all four finite maintenance Jobs');
}

export function verifyReceipt(receipt, expected, bytes, now = new Date()) {
  for (const [key, value] of Object.entries(expected)) requireValue(receipt?.[key] === value, 'Reviewed plan context changed; generate and review a new plan');
  requireValue(receipt.plan_sha256 === sha256(bytes), 'Reviewed plan bytes changed');
  const age = now - date(receipt.created_at);
  requireValue(age >= 0 && age < 86400000, 'Reviewed plans expire after 24 hours');
}
