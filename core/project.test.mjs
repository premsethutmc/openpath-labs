import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './project.mjs';

// a toy adapter: no physics, just enough to exercise the record
const toy = { domain: 'toy', title: 'Toy', evaluate: s => s.x < 0 ? { ok: false, reason: 'x must not be negative' } : { ok: true, outputs: { y: { label: 'Y', value: s.x * 2, unit: 'm', source: 'simulated' } }, verdicts: { big: { label: 'Big?', value: s.x * 2 > 5 ? 'pass' : 'fail' } } } };
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('runs freeze their setup, reproduce, compare and survive a file round-trip', () => {
  const p = P.createProject({ domain: 'toy', name: 'T', setup: { x: 1, nested: { k: 'a' } } });
  const a = P.saveRun(p, toy, 'one');
  p.setup.x = 4; p.setup.nested.k = 'b';
  const b = P.saveRun(p, toy);
  assert.equal(a.setup.x, 1, 'a run keeps the setup it was taken on');
  assert.equal(b.name, 'Run 2');
  const c = P.compareRuns(a, b);
  assert.deepEqual(c.changed.map(d => d.path), ['x', 'nested.k']);
  assert.deepEqual(c.outputs[0], { key: 'y', label: 'Y', unit: 'm', a: 2, b: 8, changed: true });
  assert.deepEqual(c.verdicts[0].a + c.verdicts[0].b, 'failpass');
  const back = P.deserialize(P.serialize(p), 'toy');
  for (const r of back.runs) assert.ok(P.reproduceRun(r, toy).ok);
  back.runs[0].outputs.y.value = 3;
  assert.deepEqual(P.reproduceRun(back.runs[0], toy).diffs, ['y']);
});

test('an unsupported setup is refused, not saved', () => {
  const p = P.createProject({ domain: 'toy', setup: { x: -1 } });
  assert.throws(() => P.saveRun(p, toy), /Not saved: x must not be negative/);
  assert.equal(p.runs.length, 0);
});

test('fork starts a new project from the setup or a run; evidence stays with the original', () => {
  const p = P.createProject({ domain: 'toy', name: 'T', setup: { x: 1 } }); p.id = 'P1';
  P.saveRun(p, toy); p.setup.x = 9;
  const f = P.forkProject(p, { fromRun: 'R1' });
  assert.equal(f.setup.x, 1); assert.equal(f.runs.length, 0); assert.equal(f.origin, 'fork:P1@R1');
  assert.equal(P.forkProject(p).setup.x, 9);
});

test('store: one domain per store, ids assigned, current project remembered', () => {
  const s = memory(), st = P.openStore('toy', s);
  const p = st.put(P.createProject({ domain: 'toy', name: 'A', setup: { x: 1 } }));
  assert.equal(p.id, 'P1'); st.open('P1');
  assert.equal(P.openStore('toy', s).current().name, 'A');
  assert.throws(() => st.put(P.createProject({ domain: 'other', setup: {} })), /cannot hold/);
  assert.throws(() => P.deserialize(P.serialize(p), 'other'), /toy project/);
});
