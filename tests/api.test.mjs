// HTTP API: every catalogue example runs, inputs are validated, keys and limits are enforced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/api.mjs';

async function withServer(opts, fn) {
  const srv = createApp(opts).listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn((path, body, headers = {}) => fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })); }
  finally { srv.close(); }
}

test('health and catalogue', () => withServer({ keys: [] }, async call => {
  const h = await (await call('/health')).json();
  assert.equal(h.ok, true);
  const c = await (await call('/v1')).json();
  assert.ok(c.endpoints.length >= 8 && c.materials.steel);
}));

test('every catalogue example returns a result with model, units and limits', { timeout: 120000 }, () => withServer({ keys: [] }, async call => {
  const c = await (await call('/v1')).json();
  for (const e of c.endpoints) {
    const r = await call(e.path, e.example), j = await r.json();
    assert.equal(r.status, 200, `${e.path}: ${j.error}`);
    assert.ok(j.model?.name && j.model?.notModelled?.length && j.units && j.result, e.path);
  }
}));

test('beam answers match hand calculation (PL/4, PL³/48EI)', () => withServer({ keys: [] }, async call => {
  const j = await (await call('/v1/solids/beam', { span: 1000, load: 1000, position: 500, material: 'steel', section: { shape: 'rect', b: 20, h: 40 } })).json();
  const I = 20 * 40 ** 3 / 12, E = j.result.EI / I;
  assert.ok(Math.abs(j.result.maxMoment.value - 250000) < 1);
  assert.ok(Math.abs(j.result.deflectionUnderLoad - 1000 * 1000 ** 3 / (48 * E * I)) < 1e-6);
  assert.ok(Math.abs(j.result.maxBendingStress - 250000 * 20 / I) < 1e-6);
}));

test('bad input is rejected with a reason, never a crash', () => withServer({ keys: [] }, async call => {
  for (const [path, body, status] of [
    ['/v1/solids/beam', { span: 600, load: 1, section: { shape: 'rect', b: -4, h: 30 } }, 422],
    ['/v1/solids/beam', { span: 'long' }, 422],
    ['/v1/solids/beam', '{not json', 400],
    ['/v1/solids/beam', [1, 2], 400],
    ['/v1/solids/frame', { nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }], members: [{ i: 0, j: 1, section: { shape: 'rect', b: 10, h: 10 } }], supports: [{ node: 0, type: 'roller' }] }, 422],
    ['/v1/thermofluids/oil-viscosity', { grade: 'SAE-99' }, 422],
    ['/v1/fluids/flow-probe', { scene: 'cylinder', reynolds: 5000 }, 422],
    ['/v1/nothing', {}, 404],
  ]) {
    const r = await call(path, body), j = await r.json();
    assert.equal(r.status, status, `${path} ${JSON.stringify(body)} → ${j.error}`);
    assert.equal(j.ok, false); assert.ok(j.error);
  }
  assert.equal((await call('/v1/solids/beam')).status, 405);
  assert.equal((await call('/v1/solids/beam', 'x'.repeat(70000))).status, 413);
}));

test('API key and rate limit', () => withServer({ keys: ['k1'], ratePerMin: 3 }, async call => {
  const body = { grade: '5W-30' };
  assert.equal((await call('/v1/thermofluids/oil-viscosity', body)).status, 401);
  assert.equal((await call('/v1/thermofluids/oil-viscosity', body, { 'x-api-key': 'wrong' })).status, 401);
  assert.equal((await call('/health')).status, 200);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call('/v1/thermofluids/oil-viscosity', body, { 'x-api-key': 'k1' })).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
}));
