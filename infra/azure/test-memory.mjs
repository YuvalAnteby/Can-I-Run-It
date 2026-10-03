import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const fail = statusCode => Object.assign(new Error('Fake storage error'), { statusCode });
export class MemoryContainer {
  blobs = new Map();
  failUploads = false;
  corruptDownload = false;
  events = [];
  put(name, data, date = new Date()) {
    this.blobs.set(name, { data: Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)), etag: randomUUID(), createdOn: date, lastModified: date });
  }
  json(name) { return JSON.parse(this.blobs.get(name).data.toString()); }
  getBlockBlobClient(name) {
    const owner = this;
    const check = conditions => {
      const existing = owner.blobs.get(name);
      if (conditions?.ifNoneMatch === '*' && existing) throw fail(412);
      if (conditions?.ifMatch && existing?.etag !== conditions.ifMatch) throw fail(412);
      if (existing?.lease && existing.lease !== conditions?.leaseId) throw fail(412);
      return existing;
    };
    const blob = {
      async uploadData(data, opts = {}) {
        opts.abortSignal?.throwIfAborted();
        const old = check(opts.conditions);
        owner.put(name, data);
        if (old?.lease) owner.blobs.get(name).lease = old.lease;
        owner.events.push(['upload', name]);
        return { etag: owner.blobs.get(name).etag };
      },
      async uploadFile(path, opts) {
        if (owner.failUploads) throw fail(503);
        return blob.uploadData(await readFile(path), opts);
      },
      async download(offset, count, opts = {}) {
        opts.abortSignal?.throwIfAborted();
        const item = check(opts.conditions);
        if (!item) throw fail(404);
        return { etag: item.etag, readableStreamBody: Readable.from(owner.corruptDownload && name.endsWith('.dump') ? Buffer.from('tampered') : item.data) };
      },
      async getProperties(opts = {}) {
        const item = check(opts.conditions);
        if (!item) throw fail(404);
        return { contentLength: item.data.length, etag: item.etag };
      },
      async delete(opts = {}) {
        check(opts.conditions);
        owner.events.push(['delete', name]);
        owner.blobs.delete(name);
      },
      getBlobLeaseClient() {
        return {
          leaseId: randomUUID(),
          async acquireLease() {
            const item = owner.blobs.get(name);
            if (item.lease) throw fail(409);
            item.lease = this.leaseId;
          },
          async renewLease() { if (owner.blobs.get(name)?.lease !== this.leaseId) throw fail(409); },
          async releaseLease() { if (owner.blobs.get(name)?.lease !== this.leaseId) throw fail(409); delete owner.blobs.get(name).lease; },
        };
      },
    };
    return blob;
  }
  async *listBlobsFlat() {
    for (const [name, item] of this.blobs) yield { name, properties: { createdOn: item.createdOn, lastModified: item.lastModified, etag: item.etag } };
  }
}

export const subscription = '11111111-1111-1111-1111-111111111111';
export const resource = suffix => `/subscriptions/${subscription}/resourceGroups/ciri/providers/${suffix}`;
export const image = `ghcr.io/yuvalanteby/can-i-run-it-tools@sha256:${'a'.repeat(64)}`;
export const period = { start: '2026-09-01T00:00:00Z', end: '2027-09-01T00:00:00Z', currency: 'USD' };
export const signal = () => new AbortController().signal;

export function completedSet(container, prefix, completedAt) {
  const files = ['ciri.dump', 'ciri.dump.sha256', 'ciri.contents.txt'].map(name => ({ name, sha256: 'a'.repeat(64), size: 1 }));
  for (const file of files) container.put(`${prefix}${file.name}`, Buffer.from('x'));
  container.put(`${prefix}manifest.json`, { format_version: 1, complete: true, verified: true, prefix, completed_at: completedAt,
    postgres_version: 'pg_dump (PostgreSQL) 16.11', schema_version: 'RuntimeGrants1790985600002', image_digest: image, files });
}
