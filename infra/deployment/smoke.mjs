import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function smoke(api, frontend, fetchImpl = fetch, signal = AbortSignal.timeout(120000), checkRequest = JSON.parse(process.env.SMOKE_CHECK_JSON ?? 'null')) {
  for (const value of [api, frontend]) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, value, 'Smoke URLs must be HTTPS origins');
  }
  assert.ok(checkRequest?.gameSlug && checkRequest.hardware && checkRequest.settings, 'A human-verified measured compatibility tuple is required');
  let ready;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      ready = await fetchImpl(`${api}/api/health/ready`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (ready.ok) break;
    } catch { signal.throwIfAborted(); }
    await sleep(3000, undefined, { signal });
  }
  assert.equal(ready?.status, 200, 'API readiness failed');
  assert.deepEqual(await ready.json(), { status: 'ok' });
  const cors = await fetchImpl(`${api}/api/health/live`, { method: 'OPTIONS', signal, headers: { Origin: frontend, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(cors.headers.get('access-control-allow-origin'), frontend, 'Exact production CORS origin is missing');
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
  const denied = await fetchImpl(`${api}/api/health/live`, { method: 'OPTIONS', signal, headers: { Origin: 'https://untrusted.invalid', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null, 'Untrusted CORS origin was allowed');
  const catalog = await fetchImpl(`${api}/api/v2/games?limit=1`, { signal });
  assert.equal(catalog.status, 200, 'Runtime catalog SELECT grants failed');
  assert.ok(Array.isArray((await catalog.json()).data));
  const compatibility = await fetchImpl(`${api}/api/v1/check`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkRequest) });
  assert.equal(compatibility.status, 200, 'Known measured compatibility check failed');
  const result = await compatibility.json();
  assert.equal(result.source, 'measured', 'Smoke tuple must match an existing measured record');
  assert.equal(result.provider, null);
  assert.ok(Number.isFinite(result.fps?.high));
  const home = await fetchImpl(frontend, { signal });
  assert.equal(home.status, 200, 'SPA home failed');
  assert.match(home.headers.get('content-type') ?? '', /text\/html/);
  const html = await home.text();
  assert.match(html, /id=["']root["']/);
  const source = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/)?.[1];
  assert.ok(source, 'SPA module asset is missing');
  const assetUrl = new URL(source, frontend);
  assert.equal(assetUrl.origin, frontend, 'SPA module must be served from the approved origin');
  assert.ok(assetUrl.pathname.startsWith('/assets/'));
  const asset = await fetchImpl(assetUrl, { signal });
  assert.equal(asset.status, 200, 'SPA module asset failed');
  assert.match(asset.headers.get('content-type') ?? '', /(?:javascript|ecmascript)/);
  assert.ok((await asset.text()).length > 0);
  const deep = await fetchImpl(`${frontend}/games/azure-smoke-deep-link`, { signal });
  assert.equal(deep.status, 200, 'SPA navigation fallback failed');
  assert.equal(await deep.text(), html, 'SPA deep link did not return the same index document');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await smoke(process.env.API_URL, process.env.SWA_URL);
    console.log('API readiness, exact/denied CORS origins, SPA and deep-link smoke checks passed.');
  } catch {
    console.error('Azure release smoke checks failed; inspect application health and the previous immutable image before rollback.');
    process.exitCode = 1;
  }
}
