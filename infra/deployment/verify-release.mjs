import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { immutableImage, resourceId } from '../azure/azure.mjs';

try {
  const env = process.env;
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.AZURE_DATABASE_BOOTSTRAP_VERIFIED, 'true', 'Human Entra/SQL bootstrap acceptance is required');
  assert.equal(env.AZURE_RELEASE_ACCEPTANCE_VERIFIED, 'true', 'Identity, TLS, firewall and native Key Vault acceptance is required');
  for (const [name, kind] of [['API_RESOURCE_ID', 'Microsoft.App/containerApps'], ['MIGRATION_JOB_RESOURCE_ID', 'Microsoft.App/jobs'], ['FIREWALL_JOB_RESOURCE_ID', 'Microsoft.App/jobs'], ['SWA_RESOURCE_ID', 'Microsoft.Web/staticSites']]) {
    const id = resourceId(env[name], kind);
    assert.equal(id.split('/')[2].toLowerCase(), env.AZURE_SUBSCRIPTION_ID.toLowerCase(), 'Resource belongs to another subscription');
  }
  immutableImage(env.BACKEND_IMAGE); immutableImage(env.TOOLS_IMAGE);
  const app = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const swa = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  assert.equal(app.mode, 'Single'); assert.equal(app.min, 0); assert.equal(app.max, 1);
  assert.equal(app.cpu, 0.5); assert.equal(app.memory, '1Gi'); assert.equal(app.port, 4000);
  assert.equal(app.external, true); assert.equal(app.insecure, false);
  assert.equal(app.traffic?.length, 1, 'Expected one public latest-revision route');
  assert.equal(app.traffic[0].latestRevision, true); assert.equal(app.traffic[0].weight, 100);
  assert.ok(!app.traffic[0].label && !app.traffic[0].revisionName, 'Old revision labels or pinned traffic are forbidden');
  assert.equal(swa.tier, 'Free'); assert.equal(swa.size, 'Free');
  assert.match(app.fqdn, /^[a-z0-9.-]+\.azurecontainerapps\.io$/);
  assert.match(swa.hostname, /^[a-z0-9.-]+\.azurestaticapps\.net$/);
  if (process.argv[4] === 'after') assert.equal(app.image, env.BACKEND_IMAGE, 'Running API image differs from the scanned digest');
  else immutableImage(app.image);
  const smokeCheck = JSON.parse(env.SMOKE_CHECK_JSON);
  assert.equal(typeof smokeCheck.gameSlug, 'string');
  assert.ok(smokeCheck.hardware && smokeCheck.settings, 'Known measured compatibility smoke metadata is required');
  appendFileSync(env.GITHUB_ENV, `API_URL=https://${app.fqdn}\nSWA_URL=https://${swa.hostname}\n`);
  console.log('Trusted release scope, fixed capacity, HTTPS ingress and SWA Free verified.');
} catch {
  console.error('Release contract failed; reconcile protected resource metadata, human acceptance gates and live platform settings.');
  process.exitCode = 1;
}
