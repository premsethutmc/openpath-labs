import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import * as P from '../core/project.mjs';

test('a preset and the same path built by hand from an empty bench are identical', () => {
  for (const pre of M.PRESETS) {
    const hand = M.emptySetup();
    for (const [fn, ...args] of pre.script) M.SCRIPT_EDITS[fn](hand, ...args);
    assert.deepEqual(hand, M.fromPreset(pre.id));
    assert.deepEqual(M.evaluate(hand).outputs, M.evaluate(M.fromPreset(pre.id)).outputs);
  }
});

test('question 1 — design a cooling system: the limit fails, the fin array dominates, more h passes', () => {
  const s = M.fromPreset('device'), e = M.evaluate(s);
  assert.equal(e.verdicts.maxStartT.value, 'fail');
  // hand check: contact 1e-4/0.0025 + base 0.004/(177·0.0025) + fin array from its own conductance
  const f = e.sol.layers[2].fins, R = 1e-4 / 0.0025 + 0.004 / (177 * 0.0025) + 1 / (8 * f.Aunfinned + 8 * f.perTheta);
  assert.ok(Math.abs(e.sol.Rt - R) < 1e-12); assert.ok(Math.abs(e.outputs.startT.value - (35 + 20 * R)) < 1e-9);
  const x = M.explain(s);
  assert.equal(x.limiting.index, 2); assert.ok(x.limiting.share > 0.95, 'convection from the fin array dominates');
  assert.match(x.headline, /^Start-face temperature governs: .* % of your limit \(not met\)\.$/);
  assert.ok(x.movers.every(m => m.delta < 0) && x.movers.some(m => /h on the fins/.test(m.input)) && x.movers.some(m => /Number of fins/.test(m.input)));
  M.setParam(s, 'L3', 'h', 25);                           // a small fan
  const e2 = M.evaluate(s);
  assert.equal(e2.verdicts.maxStartT.value, 'pass', `start face ${e2.outputs.startT.value}`);
  // packing more fins into the base is refused once the gaps close up, with the reason
  const t = M.fromPreset('device'); M.setParam(t, 'L3', 'N', 20);
  assert.match(M.evaluate(t).reason, /gap between fins is 1\.1 mm, below 2 mm/);
});

test('question 2 — why does a PTFE sleeve on a thin pipe increase its heat loss? critical radius and a sweep', () => {
  const s = M.fromPreset('pipe'), e = M.evaluate(s), c = e.sol.critical;
  assert.equal(c.more, 'increases'); assert.ok(Math.abs(c.rc - 0.35 / c.h) < 1e-15);
  const x = M.explain(s);
  assert.ok(x.facts.some(f => /Critical insulation radius .* increases the heat loss/.test(f)) && x.facts.some(f => /heat flow rises by/.test(f)));
  const w = M.sweep(s, { id: 'L3', key: 't' }, 'Q', 0.0005, 0.04, 40);
  assert.ok(w.peak, 'the heat loss peaks inside the range');
  assert.ok(Math.abs((0.004 + 0.001 + w.peak.v) - c.rc) < 0.004, `peak outer radius ${(0.005 + w.peak.v) * 1000} mm near r_cr ${c.rc * 1000} mm`);
  assert.ok(w.points[0].q < w.peak.q && w.points.at(-1).q < w.peak.q);
  // thermometers: the layer-by-layer drops add up to the difference of the two readings
  const b = M.budget(s, 'L1', 'L3');
  assert.ok(Math.abs(b.check) < 1e-12); assert.equal(b.items.length, 2);
  assert.ok(Math.abs(b.total - (e.outputs['T:L1'].value - e.outputs['T:L3'].value)) < 1e-12);
});

test('which layer limits heat flow through this wall: hand calculation and the budget', () => {
  const s = M.fromPreset('wall'), e = M.evaluate(s);
  const R = 1 / 250 + 0.23 / 7.2 + 0.025 / 0.27 + 0.012 / 1.7 + 1 / 80;
  assert.ok(Math.abs(e.outputs.Q.value - 33 / R) < 1e-9);
  assert.equal(M.explain(s).limiting.index, 2, 'the polystyrene layer');
  const b = M.budget(s, 'L1', 'L4');
  assert.deepEqual(b.items.map(i => i.label), ['#2 Common brick 230 mm', '#3 Extruded polystyrene 25 mm', '#4 Gypsum / plaster board 12 mm']);
  assert.ok(Math.abs(b.check) < 1e-12);
  M.setParam(s, 'L3', 't', 0.05);
  assert.equal(M.evaluate(s).verdicts.maxQ.value, 'pass');
});

test('unsupported setups and edits are explained, never given a number; evidence uses the shared record', () => {
  assert.match(M.evaluate(M.emptySetup()).reason, /Add at least one layer/);
  const s = M.fromPreset('wall'); M.addLayer(s, 'convection', {}, 'L2');
  assert.match(M.evaluate(s).reason, /^#3 Fluid film .*convection only at the first or last layer/);
  const f = M.fromPreset('device'); M.moveLayer(f, 'L3', -1);
  assert.match(M.evaluate(f).reason, /fins go on the outer surface/);
  const c = M.fromPreset('pipe'); M.addLayer(c, 'fins');
  assert.match(M.evaluate(c).reason, /#5 Fin array.*annular fins, which are not built/);
  M.removeLayer(c, 'L4'); assert.match(M.evaluate(c).reason, /annular fins, which are not built/);
  const before = JSON.stringify(M.fromPreset('wall')), t = M.fromPreset('wall');
  assert.throws(() => M.setParam(t, 'L2', 't', -1), /Thickness must be between/);
  assert.throws(() => M.addLayer(t, 'fins', { N: 2.5 }), /whole number/);
  assert.throws(() => M.toggleThermometer(t, 'L5'), /ambient/);
  assert.equal(JSON.stringify(t), before);
  M.setTransient(t, 'on'); M.setTransient(t, 'material', 'concrete'); M.setTransient(t, 'V', 0.001); M.setTransient(t, 'As', 0.06);
  assert.equal(M.evaluate(t).verdicts.transient.value, 'cannot-assess'); assert.match(M.evaluate(t).verdicts.transient.reason, /Bi = .* above 0\.1/);
  const proj = P.createProject({ domain: 'thermal', setup: M.fromPreset('device') });
  const a = P.saveRun(proj, M.ADAPTER, 'natural'); M.setParam(proj.setup, 'L3', 'h', 25);
  const b = P.saveRun(proj, M.ADAPTER, 'fan');
  assert.deepEqual(P.compareRuns(a, b).changed.map(d => d.path), ['layers.2.h']);
  for (const r of P.deserialize(P.serialize(proj), 'thermal').runs) assert.ok(P.reproduceRun(r, M.ADAPTER).ok);
  assert.throws(() => P.saveRun(P.createProject({ domain: 'thermal', setup: s }), M.ADAPTER), /Not saved: #3 Fluid film/);
});

test('the same generic tools work on every preset: no question-specific code paths', () => {
  for (const id of ['device', 'pipe', 'wall']) {
    const s = M.fromPreset(id);
    for (const q of M.quantities(s)) assert.ok(M.sensitivity(s, q.key).rows.length > 0, `${id} ${q.key}`);
    const inp = M.inputs(s).find(i => i.design);
    assert.equal(M.sweep(s, inp.ref, 'Q', inp.value * 0.8, inp.value * 1.2, 4).points.length, 5);
  }
});
