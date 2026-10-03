import { Arm, APPS_API, credentialFor, immutableImage, resourceId } from '../azure/azure.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

try {
  const env = process.env;
  if (env.GITHUB_REF !== 'refs/heads/main' || env.MAINTENANCE_AUTH_MODE !== 'azure-cli') throw new Error('Trusted main release required');
  const id = resourceId(env.API_RESOURCE_ID, 'Microsoft.App/containerApps');
  if (id.split('/')[2].toLowerCase() !== env.AZURE_SUBSCRIPTION_ID.toLowerCase()) throw new Error('Wrong subscription');
  const image = immutableImage(env.BACKEND_IMAGE);
  const arm = new Arm(credentialFor(env), AbortSignal.timeout(600000));
  const resource = await arm.get(id, APPS_API);
  const template = structuredClone(resource.properties?.template);
  if (template?.containers?.length !== 1 || template.initContainers?.length) throw new Error('Unexpected API template');
  template.containers[0].image = image;
  // PATCH only the preserved template. No ListSecrets, identity/configuration changes or secret reads.
  await arm.mutate(id, APPS_API, 'PATCH', { properties: { template } });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const current = (await arm.get(id, APPS_API)).properties;
    if (current.latestRevisionName && current.latestRevisionName === current.latestReadyRevisionName && current.template?.containers?.[0]?.image === image) { ready = true; break; }
    await sleep(2000, undefined, { signal: arm.signal });
  }
  if (!ready) throw new Error('Latest scanned revision did not become ready');
  console.log('Updated API template image to the scanned immutable digest.');
} catch {
  console.error('API image update failed; inspect the redacted revision status before rollback.');
  process.exitCode = 1;
}
