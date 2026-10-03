import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withControlLease, readJson, required, immutableImage } from './azure.mjs';
import { completeExport, retentionPlan } from './policy.mjs';
import { createDump } from './postgres.mjs';

async function hashStream(stream, signal) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) { signal.throwIfAborted(); hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size };
}

export async function uploadVerified(container, name, path, signal) {
  const expected = await hashStream(createReadStream(path), signal);
  if (expected.size === 0 || expected.size > 512 * 1024 * 1024) throw new Error('Export file is empty or exceeds 512 MiB');
  const blob = container.getBlockBlobClient(name);
  const uploaded = await blob.uploadFile(path, { conditions: { ifNoneMatch: '*' }, abortSignal: signal,
    blockSize: 4 * 1024 * 1024, concurrency: 1 });
  const properties = await blob.getProperties({ conditions: { ifMatch: uploaded.etag }, abortSignal: signal });
  if (properties.contentLength !== expected.size) throw new Error('Uploaded export size mismatch');
  const downloaded = await blob.download(0, undefined, { conditions: { ifMatch: uploaded.etag }, abortSignal: signal });
  const actual = await hashStream(downloaded.readableStreamBody, signal);
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) throw new Error('Uploaded export read-back hash mismatch');
  return { name: name.split('/').at(-1), ...expected, etag: uploaded.etag };
}

export function validManifest(manifest, prefix) {
  return manifest?.format_version === 1 && manifest.complete === true && manifest.verified === true && manifest.prefix === prefix &&
    Number.isFinite(Date.parse(manifest.completed_at)) && typeof manifest.schema_version === 'string' && /\b16\./.test(manifest.postgres_version ?? '') &&
    /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(manifest.image_digest ?? '') &&
    manifest.files?.length === 3 && ['ciri.dump', 'ciri.dump.sha256', 'ciri.contents.txt'].every(name =>
      manifest.files.filter(file => file.name === name && /^[a-f0-9]{64}$/.test(file.sha256 ?? '') && Number.isSafeInteger(file.size) && file.size > 0).length === 1);
}

export async function pruneExports(container, signal, now = Date.now()) {
  const groups = new Map();
  let count = 0;
  for await (const blob of container.listBlobsFlat({ prefix: 'exports/', abortSignal: signal })) {
    if (++count > 4096) throw new Error('Export inventory exceeds safe bound');
    const match = /^(exports\/[A-Za-z0-9_.-]+\/)([^/]+)$/.exec(blob.name);
    if (!match) continue;
    const [, prefix] = match;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(blob);
  }
  const sets = [];
  for (const [prefix, blobs] of groups) {
    if (blobs.some(blob => blob.name === `${prefix}manifest.json`)) {
      const { data } = await readJson(container.getBlockBlobClient(`${prefix}manifest.json`), signal);
      if (!validManifest(data, prefix)) throw new Error('Invalid completed export manifest; retention stopped');
      sets.push({ prefix, completed_at: data.completed_at, complete: true });
    } else {
      const dates = blobs.map(blob => new Date(blob.properties.createdOn ?? blob.properties.lastModified).getTime());
      // Last write, rather than first write, protects an actively uploading incomplete set.
      sets.push({ prefix, created_at: new Date(Math.max(...dates)).toISOString() });
    }
  }
  const plan = retentionPlan(sets, now);
  for (const prefix of [...plan.completed, ...plan.abandoned]) {
    const blobs = groups.get(prefix);
    // Delete completion last so a partially failed prune remains identifiable/retryable.
    blobs.sort((a, b) => Number(a.name.endsWith('/manifest.json')) - Number(b.name.endsWith('/manifest.json')));
    for (const blob of blobs) await container.getBlockBlobClient(blob.name).delete({ abortSignal: signal, conditions: { ifMatch: blob.properties.etag } });
  }
  return { pruned_completed: plan.completed.length, cleaned_abandoned: plan.abandoned.length };
}

export async function publishDump(container, prefix, archive, image, signal) {
  immutableImage(image);
  const directory = archive.dump.slice(0, archive.dump.lastIndexOf('/'));
  const hash = await hashStream(createReadStream(archive.dump), signal);
  await writeFile(`${directory}/ciri.dump.sha256`, `${hash.sha256}  ciri.dump\n`, { mode: 0o600 });
  await writeFile(`${directory}/ciri.contents.txt`, archive.contents, { mode: 0o600 });
  const files = [];
  for (const name of ['ciri.dump', 'ciri.dump.sha256', 'ciri.contents.txt']) files.push(await uploadVerified(container, `${prefix}${name}`, `${directory}/${name}`, signal));
  const manifest = { format_version: 1, complete: true, verified: true, prefix, completed_at: new Date().toISOString(),
    postgres_version: archive.postgres_version, schema_version: archive.schema_version, image_digest: image, files };
  if (!validManifest(manifest, prefix)) throw new Error('Invalid new export manifest');
  const blob = container.getBlockBlobClient(`${prefix}manifest.json`);
  const result = await blob.uploadData(Buffer.from(JSON.stringify(manifest)), { abortSignal: signal,
    conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: 'application/json' } });
  const verified = await readJson(blob, signal, { ifMatch: result.etag });
  if (JSON.stringify(verified.data) !== JSON.stringify(manifest)) throw new Error('Completion manifest read-back mismatch');
  return manifest;
}

export async function exportDatabase(env, credential, containers, signal, dump = createDump) {
  const requestId = required(env, 'EXPORT_REQUEST_ID');
  const image = immutableImage(required(env, 'RELEASE_TOOLS_IMAGE_DIGEST'));
  return withControlLease(containers.control, 'export.json', signal, async (state, save, leasedSignal) => {
    const pending = state.pending;
    if (!pending || pending.request_id !== requestId || !pending.firewall_verified_at || Date.now() - Date.parse(pending.firewall_verified_at) > 20 * 60000) throw new Error('Export requires matching fresh firewall-prepared request');
    let directory;
    try {
      directory = await mkdtemp(join(tmpdir(), 'ciri-export-'));
      const archive = await dump(env, credential, directory.replaceAll('\\', '/'), leasedSignal);
      await stat(archive.dump);
      const prefix = `exports/${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}/`;
      const manifest = await publishDump(containers.exports, prefix, archive, image, leasedSignal);
      // A completed manifest is the commit point. Retention and durable success follow verification.
      const retention = await pruneExports(containers.exports, leasedSignal);
      const next = completeExport(state, pending.request, prefix, Date.parse(manifest.completed_at));
      await save(next);
      return { status: 'succeeded', prefix, ...retention };
    } catch (error) {
      try { await save({ ...state, last_status: 'failed', last_failure_at: new Date().toISOString() }); } catch { /* Due and existing copies remain untouched. */ }
      throw error;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }, { acquireWaitMs: 30000 });
}
