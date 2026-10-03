import { setTimeout as sleep } from 'node:timers/promises';
import { ManagedIdentityCredential, AzureCliCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';

export const APPS_API = '2025-01-01';
export const JOBS_API = '2026-07-01';
export const PG_API = '2024-08-01';
export const COST_API = '2026-06-01';
export const ARM_SCOPE = 'https://management.azure.com/.default';
export const PG_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

export function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}`);
  return value;
}

export function credentialFor(env) {
  if (env.MAINTENANCE_AUTH_MODE === 'managed-identity') return new ManagedIdentityCredential({ clientId: required(env, 'AZURE_CLIENT_ID') });
  if (env.MAINTENANCE_AUTH_MODE === 'azure-cli') return new AzureCliCredential({ processTimeoutInMs: 10000 });
  throw new Error('MAINTENANCE_AUTH_MODE must explicitly select managed-identity or azure-cli');
}

export function resourceId(value, kind) {
  if (typeof value !== 'string' || !/^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[A-Za-z0-9_.()-]+\/providers\/[A-Za-z.]+\/[A-Za-z]+\/[A-Za-z0-9_.()-]+$/i.test(value) || (kind && !value.toLowerCase().includes(`/providers/${kind.toLowerCase()}/`))) throw new Error('Invalid ARM resource ID');
  return value;
}
export function immutableImage(value) {
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(value ?? '')) throw new Error('Expected immutable public GHCR image digest');
  return value;
}

function armUrl(path, version) {
  const url = new URL(path, 'https://management.azure.com');
  if (url.origin !== 'https://management.azure.com' || !url.pathname.startsWith('/subscriptions/') || url.username || url.password) throw new Error('Untrusted ARM URL');
  if (!url.searchParams.has('api-version')) url.searchParams.set('api-version', version);
  return url;
}

export class Arm {
  constructor(credential, signal, fetchImpl = fetch) { this.credential = credential; this.signal = signal; this.fetch = fetchImpl; }
  async request(path, version, method = 'GET', body) {
    this.signal.throwIfAborted();
    const token = await this.credential.getToken(ARM_SCOPE);
    this.signal.throwIfAborted();
    const response = await this.fetch(armUrl(path, version), { method, signal: this.signal,
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const error = new Error(`ARM ${method} failed (HTTP ${response.status})`);
      error.statusCode = response.status;
      throw error;
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { data, status: response.status, poll: response.headers.get('Azure-AsyncOperation') ?? response.headers.get('Location') };
  }
  async get(path, api) { return (await this.request(path, api)).data; }
  async list(path, api) {
    const result = [];
    for (let page = 0; path && page < 20; page++) {
      const data = await this.get(path, api);
      if (!Array.isArray(data.value) || data.value.length > 2048) throw new Error('Invalid ARM list response');
      result.push(...data.value);
      if (result.length > 4096) throw new Error('ARM inventory exceeds safe bound');
      path = data.nextLink;
    }
    if (path) throw new Error('ARM pagination exceeds safe bound');
    return result;
  }
  async mutate(path, api, method, body) {
    let result = await this.request(path, api, method, body);
    for (let attempts = 0; result.poll && attempts < 120; attempts++) {
      await sleep(1000, undefined, { signal: this.signal });
      const next = await this.request(result.poll, api);
      const status = next.data.status ?? next.data.properties?.provisioningState;
      if (['Failed', 'Canceled', 'Cancelled'].includes(status)) throw new Error('ARM operation failed terminally');
      if (status === 'Succeeded' || (!status && next.status === 200)) return next.data;
      result = { ...next, poll: next.poll ?? result.poll };
    }
    if (result.poll) throw new Error('ARM operation exceeded polling bound');
    return result.data;
  }
}

export function containersFor(env, credential) {
  const account = required(env, 'EXPORT_STORAGE_ACCOUNT');
  const exports = required(env, 'EXPORT_CONTAINER');
  const control = required(env, 'CONTROL_CONTAINER');
  if (!/^[a-z0-9]{3,24}$/.test(account) || ![exports, control].every(v => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v)) || exports === control) throw new Error('Invalid or shared export/control storage');
  const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential, { retryOptions: { maxTries: 2, tryTimeoutInMs: 10000 } });
  return { exports: service.getContainerClient(exports), control: service.getContainerClient(control) };
}

export async function readJson(blob, signal, conditions = {}) {
  const response = await blob.download(0, undefined, { abortSignal: signal, conditions });
  const chunks = [];
  let size = 0;
  for await (const chunk of response.readableStreamBody) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Control/manifest metadata too large');
    chunks.push(chunk);
  }
  return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: response.etag };
}

export async function withControlLease(container, name, signal, action, { acquireWaitMs = 0 } = {}) {
  const blob = container.getBlockBlobClient(name);
  try { await blob.uploadData(Buffer.from('{}'), { conditions: { ifNoneMatch: '*' }, abortSignal: signal }); }
  catch (error) { if (![409, 412].includes(error.statusCode)) throw error; }
  const lease = blob.getBlobLeaseClient();
  const acquireDeadline = Date.now() + acquireWaitMs;
  while (true) {
    try { await lease.acquireLease(60, { abortSignal: signal }); break; }
    catch (error) {
      if (error.statusCode !== 409 || Date.now() >= acquireDeadline) throw error;
      await sleep(Math.min(1000, acquireDeadline - Date.now()), undefined, { signal });
    }
  }
  const controller = new AbortController();
  const leasedSignal = AbortSignal.any([signal, controller.signal]);
  let renewing = Promise.resolve();
  const timer = setInterval(() => {
    renewing = renewing.then(() => lease.renewLease({ abortSignal: leasedSignal })).catch(() => controller.abort(new Error('Control lease lost')));
  }, 20000);
  timer.unref();
  try {
    let { data, etag } = await readJson(blob, leasedSignal, { leaseId: lease.leaseId });
    const save = async next => {
      leasedSignal.throwIfAborted();
      const result = await blob.uploadData(Buffer.from(JSON.stringify(next)), { abortSignal: leasedSignal,
        conditions: { leaseId: lease.leaseId, ifMatch: etag }, blobHTTPHeaders: { blobContentType: 'application/json' } });
      data = next;
      etag = result.etag;
    };
    const result = await action(data, save, leasedSignal);
    leasedSignal.throwIfAborted();
    return result;
  } finally {
    clearInterval(timer);
    await renewing;
    // A lost/expired lease must never be broken: another execution may own it.
    try { await lease.releaseLease({ abortSignal: AbortSignal.timeout(3000) }); } catch { /* expires after 60s */ }
  }
}

export async function executionStatus(arm, jobId, executionName) {
  resourceId(jobId, 'Microsoft.App/jobs');
  if (!/^[A-Za-z0-9_.()-]+$/.test(executionName ?? '')) throw new Error('Invalid execution name');
  const execution = (await arm.list(`${jobId}/executions`, JOBS_API)).find(item => item.name === executionName);
  return execution?.properties?.status ?? 'Unknown';
}

export async function waitJob(arm, jobId, executionName) {
  for (let tries = 0; tries < 450; tries++) {
    const status = await executionStatus(arm, jobId, executionName);
    if (status === 'Succeeded') return { execution_name: executionName, status };
    if (['Failed', 'Stopped', 'Canceled', 'Cancelled'].includes(status)) throw new Error(`Job ended ${status}`);
    await sleep(2000, undefined, { signal: arm.signal });
  }
  throw new Error('Job execution exceeded polling bound');
}

export async function startJob(arm, jobId, overrides = {}) {
  resourceId(jobId, 'Microsoft.App/jobs');
  const job = await arm.get(jobId, JOBS_API);
  const template = structuredClone(job.properties?.template);
  if (!template || template.containers?.length !== 1 || template.initContainers?.length) throw new Error('Expected one trusted Job container');
  const container = template.containers[0];
  if (overrides.image) container.image = immutableImage(overrides.image);
  immutableImage(container.image);
  if (overrides.command) {
    if (!Array.isArray(overrides.command) || !overrides.command.every(v => typeof v === 'string') || overrides.command.length > 16) throw new Error('Invalid trusted command override');
    container.command = overrides.command;
    container.args = [];
  }
  if (overrides.requestId) {
    if (!/^[0-9a-f-]{36}$/i.test(overrides.requestId)) throw new Error('Invalid export request ID');
    container.env = (container.env ?? []).filter(v => v.name !== 'EXPORT_REQUEST_ID');
    container.env.push({ name: 'EXPORT_REQUEST_ID', value: overrides.requestId });
  }
  const result = await arm.mutate(`${jobId}/start`, JOBS_API, 'POST', template);
  const name = result.name ?? result.id?.split('/').at(-1);
  if (!/^[A-Za-z0-9_.()-]+$/.test(name ?? '')) throw new Error('ARM start did not confirm an execution; due markers retained');
  return { execution_name: name, image: container.image };
}
