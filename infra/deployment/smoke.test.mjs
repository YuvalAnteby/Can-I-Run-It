import assert from 'node:assert/strict';
import test from 'node:test';
import { smoke } from './smoke.mjs';

function responses(patch = {}) {
  return async (url, options = {}) => {
    url = String(url);
    if (url.endsWith('/ready')) return Response.json({ status: 'ok' });
    if (url.includes('/api/v2/games')) return Response.json({ data: [] });
    if (url.endsWith('/api/v1/check')) return Response.json({ source: patch.unmeasured ? 'ai' : 'measured', provider: null, fps: { high: 60 } });
    if (url.endsWith('/assets/index.js')) return new Response('console.log(1)', { headers: { 'content-type': 'application/javascript' } });
    if (options.method === 'OPTIONS') return new Response(null, { status: 204, headers: options.headers.Origin === 'https://frontend.example' || patch.openCors ? { 'access-control-allow-origin': options.headers.Origin, 'access-control-allow-credentials': 'true' } : {} });
    return new Response(url.includes('deep-link') && patch.missingFallback ? '<h1>404</h1>' : '<html><div id="root"></div><script type="module" src="/assets/index.js"></script></html>', { headers: { 'content-type': 'text/html' } });
  };
}
test('release smoke detects permissive CORS and broken SPA navigation', async () => {
  const request = { gameSlug: 'measured-game', hardware: { cpuId: 1, gpuId: 1 }, settings: { preset: 'high' } };
  const run = (patch = {}, api = 'https://api.example') => smoke(api, 'https://frontend.example', responses(patch), undefined, request);
  await run();
  await assert.rejects(run({ openCors: true }));
  await assert.rejects(run({ missingFallback: true }));
  await assert.rejects(run({ unmeasured: true }));
  await assert.rejects(run({}, 'http://api.example'));
});
