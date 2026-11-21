import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import * as P from '../core/project.mjs';

test('a preset and the same shaft built by hand from an empty bench are identical', () => {
  for (const pre of M.PRESETS) {
    const hand = M.emptySetup();
    for (const [fn, ...args] of pre.script) M.SCRIPT_EDITS[fn](hand, ...args);
    assert.deepEqual(hand, M.fromPreset(pre.id));
    assert.deepEqual(M.evaluate(hand).outputs, M.evaluate(M.fromPreset(pre.id)).outputs);
  }
});

test('question 1 — why does this shaft bend too far? The generic explain tool names the check, the place and the computed movers', () => {
  const s = M.fromPreset('pulley'), x = M.explain(s);
  assert.equal(x.check.key, 'deflection'); assert.equal(x.pass, false); assert.equal(x.check.where, 400);
  assert.match(x.headline, /^Deflection governs: .* % of your limit\.$/);
  assert.ok(x.movers.every(m => m.delta < 0), 'movers are changes that reduce the deflection');
  assert.ok(x.movers.some(m => /diameter/.test(m.input)) && x.movers.some(m => /Bearing 2 position/.test(m.input)));
  // the learner's own fix: move bearing 2 towards the pulley and thicken the shaft
  M.setBearing(s, 'b3', 'x', 360); M.setSegment(s, 's1', 'd', 35);
  const e = M.evaluate(s);
  assert.ok(e.checks.find(c => c.key === 'deflection').pass, `deflection now ${e.outputs.deflection.value}`);
});

test('question 2 — where should I move the bearings to cut the load on bearing 2? The generic sweep answers it', () => {
  const s = M.fromPreset('countershaft');
  assert.equal(M.evaluate(s).checks.find(c => c.key === 'R:b5').pass, false);
  const w = M.sweep(s, { list: 'bearings', id: 'b5', key: 'x' }, 'R:b5', 225, 300, 15);
  assert.equal(w.best.v, 300); assert.ok(w.points[0].q > w.best.q);
  for (let k = 1; k < w.points.length; k++) assert.ok(w.points[k].q < w.points[k - 1].q, 'moving bearing 2 outward lowers its load');
  M.setBearing(s, 'b5', 'x', 290);
  const e = M.evaluate(s);
  assert.ok(e.checks.find(c => c.key === 'R:b5').pass);
  assert.ok(Math.abs(e.outputs['R:b4'].value + e.outputs['R:b5'].value - (1800 + 3200 + e.outputs.mass.value * 9.81)) < 1e-4, 'reactions still balance the loads and weight');
});

test('both questions use the same tools: no question-specific code paths', () => {
  for (const id of ['pulley', 'countershaft', 'line']) {
    const s = M.fromPreset(id), q = M.quantities(s).map(x => x.key);
    for (const key of q) { const r = M.sensitivity(s, key); assert.ok(r.rows.length > 0); }
    const inp = M.inputs(s)[0]; assert.ok(M.sweep(s, inp.ref, q[0], inp.value * 0.8, inp.value * 1.2, 4).points.length === 5);
  }
});

test('impossible setups are explained, impossible edits change nothing, evidence goes through the shared record', () => {
  assert.match(M.evaluate(M.emptySetup()).reason, /at least one shaft segment/);
  const s = M.fromPreset('pulley'); M.removeLoad(s, 't5');
  assert.match(M.evaluate(s).reason, /Torques do not balance/);
  const t = M.fromPreset('pulley'), before = JSON.stringify(t);
  assert.throws(() => M.setSegment(t, 's1', 'bore', 30), /bore must be smaller/);
  assert.throws(() => M.setBearing(t, 'b2', 'x', -5), /position/);
  assert.throws(() => M.setLimit(t, 'minSF', null), /always checked/);
  assert.equal(JSON.stringify(t), before);
  const proj = P.createProject({ domain: 'machine-shaft', setup: t });
  const a = P.saveRun(proj, M.ADAPTER, 'as given'); M.setBearing(proj.setup, 'b3', 'x', 360);
  const b = P.saveRun(proj, M.ADAPTER, 'bearing 2 at 360');
  assert.deepEqual(P.compareRuns(a, b).changed.map(d => d.path), ['bearings.1.x']);
  for (const r of P.deserialize(P.serialize(proj), 'machine-shaft').runs) assert.ok(P.reproduceRun(r, M.ADAPTER).ok);
  const bad = P.createProject({ domain: 'machine-shaft', setup: s });
  assert.throws(() => P.saveRun(bad, M.ADAPTER), /Not saved: Torques do not balance/);
});
