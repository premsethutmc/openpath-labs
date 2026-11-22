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

// ---------------- stage 2: rotating shaft ----------------
import { readFileSync } from 'node:fs';
import { MATERIALS } from '../core/materials.mjs';

test('runs saved before stage 2 (no speed, no new fields) still evaluate identically and reproduce', () => {
  const p = P.deserialize(readFileSync(new URL('./fixtures/v1-project.json', import.meta.url), 'utf8'), 'machine-shaft');
  assert.equal(p.runs.length, 5);
  for (const r of p.runs) {
    assert.equal('speed' in r.setup, false);
    assert.deepEqual(P.reproduceRun(r, M.ADAPTER), { ok: true, diffs: [] }, r.name);
    const now = M.ADAPTER.evaluate(r.setup);
    assert.deepEqual(Object.keys(now.outputs), Object.keys(r.outputs), 'no new outputs appear on an old run');
    for (const k of Object.keys(r.outputs)) assert.equal(now.outputs[k].value, r.outputs[k].value, `${r.name} ${k}`);
    assert.deepEqual(now.verdicts, r.verdicts);
  }
  // the bench upgrades an old setup for editing without changing what it evaluates to
  const old = p.runs[0].setup, up = M.upgrade(old);
  assert.equal(up.speed, null); assert.deepEqual(up.raisers, []); assert.equal(up.limits.fatigueSF, null);
  assert.deepEqual(M.evaluate(up).outputs, M.evaluate(old).outputs);
});

test('fan preset: critical speed matches Dunkerley by hand; the bench reports the margin and the whirl', () => {
  const s = M.fromPreset('fan'), e = M.evaluate(s), E = MATERIALS.steel.E, L = 900, d = 32, I = Math.PI * d ** 4 / 64;
  // disc alone ω_d = √(48EI/(mL³)), shaft alone ω_s = π²√(EI/(m̄L⁴)); Dunkerley 1/ω² = 1/ω_d² + 1/ω_s²
  const wd = Math.sqrt(48 * E * I / L ** 3 * 1000 / 20), ws = Math.PI ** 2 * Math.sqrt(E * 1e6 * I * 1e-12 / (7850 * Math.PI / 4 * (d / 1000) ** 2 * (L / 1000) ** 4));
  const dunk = 1 / Math.sqrt(1 / wd ** 2 + 1 / ws ** 2) * 60 / (2 * Math.PI);
  assert.ok(Math.abs(e.outputs.dunkerley.value - dunk) / dunk < 2e-3, `${e.outputs.dunkerley.value} vs ${dunk}`);
  assert.ok(e.outputs.critical.value >= e.outputs.dunkerley.value);
  assert.ok(Math.abs(e.outputs.critPct.value - 1450 / e.outputs.critical.value * 100) < 1e-9);
  // whirl: e_m × ρ²/√((1−ρ²)² + (2ζρ)²); e_m = 40 µm × 20 kg / modal mass (disc + part of the shaft)
  const rho = 1450 / e.outputs.critical.value, mag = rho * rho / Math.sqrt((1 - rho * rho) ** 2 + (0.04 * rho) ** 2);
  assert.ok(Math.abs(e.outputs.amplitude.value - e.dyn.rotor.eModal * 1000 * mag) < 1e-9);
  assert.ok(e.dyn.rotor.eModal * 1000 < 40 && e.dyn.rotor.eModal * 1000 > 40 * 20 / (20 + 5.7));
  assert.equal(e.checks.find(c => c.key === 'critical').pass, false);
  // bearing life: P = 125.9 N per bearing, C = 10 000 N: (C/P)³ million rev at 1450 rpm
  const P1 = Math.abs(e.outputs['R:b2'].value);
  assert.ok(Math.abs(e.outputs['L10h:b2'].value - (10000 / P1) ** 3 * 1e6 / (60 * 1450)) < 1e-6 * e.outputs['L10h:b2'].value);
});

test('question 3 — why does the machine shake at one speed? Sweep speed: the whirl peaks at the computed critical speed; a stiffer shaft moves it', () => {
  const s = M.fromPreset('fan'), ref = M.inputs(s).find(i => i.label === 'Operating speed (rpm)').ref;
  assert.deepEqual(ref, { list: 'setup', key: 'speed' });
  assert.ok(M.quantities(s).some(q => q.key === 'amplitude'));
  const peakOf = t => { const w = M.sweep(t, ref, 'amplitude', 100, 4000, 78); return { w, at: w.worst.v, crit: M.evaluate(t).outputs.critical.value }; };
  const a = peakOf(s);
  assert.ok(Math.abs(a.at - a.crit) <= 50, `peak at ${a.at}, critical ${a.crit}`);
  assert.equal(a.w.higherIsBetter, false); assert.ok(a.w.worst.q > 10 * M.evaluate(s).outputs.amplitude.value / 5);
  // thicker shaft: critical speed rises, so does the peak
  const t = M.fromPreset('fan'); M.setSegment(t, 's1', 'd', 40);
  const b = peakOf(t); assert.ok(b.crit > a.crit * 1.4 && Math.abs(b.at - b.crit) <= 50, `peak ${b.at} critical ${b.crit}`);
  // shorter span (bearings closer to the disc): the peak moves up too
  const u = M.fromPreset('fan'); M.setBearing(u, 'b2', 'x', 150); M.setBearing(u, 'b3', 'x', 750);
  const c = peakOf(u); assert.ok(c.crit > a.crit && Math.abs(c.at - c.crit) <= 50);
  // the learner's fix: Ø40 runs at 58 % of critical and the whirl falls below their limit
  const e = M.evaluate(t); assert.ok(e.checks.every(x => x.pass), e.checks.map(x => x.text).join('; '));
  // Explain on the original names vibration and offers computed one-step changes that cut it
  const x = M.explain(s); assert.match(x.headline, /^Vibration \(unbalance\) governs/); assert.ok(x.movers.every(m => m.delta < 0)); assert.ok(x.movers.some(m => /diameter/.test(m.input)));
  // a speed of zero is not a number we make up
  assert.match(M.sweep(s, ref, 'amplitude', 0, 1000, 4).points[0].why, /above zero/);
});

test('question 4 — why does the shaft fail after long running? Fatigue governs although the static check passes; a fillet or a thicker step fixes it', () => {
  const s = M.fromPreset('shoulder'), e = M.evaluate(s);
  assert.ok(e.checks.find(c => c.key === 'strength').pass && e.outputs.sf.value > 4);
  assert.equal(e.governing.key, 'fatigue'); assert.equal(e.governing.pass, false); assert.equal(e.dyn.fatigue.x, 100);
  // hand check at the shoulder (x = 100, Ø30): M = R1 × 80 − w·100²/2 (own weight w = ρgA of the Ø30 part), T = 100 N·m,
  // Kt 2.7, Kts 2.2, Se = 4.51·410^-0.265 × 1.24·30^-0.107 × 205 = 161.7 MPa, Sut = 410
  const R1 = e.outputs['R:b4'].value, w = 7850 * 9.81 * Math.PI / 4 * 30 ** 2 * 1e-9, M100 = R1 * 80 - w * 100 ** 2 / 2, sa = 2.7 * 32 * M100 / (Math.PI * 30 ** 3), tm = 2.2 * 16 * 100e3 / (Math.PI * 30 ** 3);
  const n = 1 / (sa / (4.51 * 410 ** -0.265 * 1.24 * 30 ** -0.107 * 205) + Math.sqrt(3) * tm / 410);
  assert.ok(Math.abs(e.outputs.fatigueSF.value - n) < 1e-6 * n, `${e.outputs.fatigueSF.value} vs ${n}`);
  const x = M.explain(s);
  assert.match(x.headline, /^Fatigue \(DE-Goodman\) governs/); assert.match(x.facts, /Kf 2\.70/); assert.match(x.facts, /Se = ka/);
  assert.ok(x.movers.every(m => m.delta > 0)); assert.ok(x.movers.some(m => /Segment 1 diameter/.test(m.input)) && x.movers.some(m => /Stress raiser 1 Kt/.test(m.input)), x.movers.map(m => m.input).join());
  const proj = P.createProject({ domain: 'machine-shaft', setup: s }); const a = P.saveRun(proj, M.ADAPTER, 'sharp shoulder');
  assert.equal(a.verdicts.fatigue.value, 'fail');
  M.setRaiser(proj.setup, 'k9', 'kind', 'roundFillet');
  const b = P.saveRun(proj, M.ADAPTER, 'rounded fillet'); assert.equal(b.verdicts.fatigue.value, 'pass');
  const t = M.fromPreset('shoulder'); M.setSegment(t, 's1', 'd', 34); assert.ok(M.evaluate(t).checks.every(c => c.pass));
  assert.deepEqual(P.compareRuns(a, b).changed.map(d => d.path).sort(), ['raisers.0.kind', 'raisers.0.kt', 'raisers.0.kts']);
  for (const r of P.deserialize(P.serialize(proj), 'machine-shaft').runs) assert.ok(P.reproduceRun(r, M.ADAPTER).ok);
});

test('what cannot be assessed is said, never made up', () => {
  const s = M.fromPreset('shoulder'); M.setMaterial(s, 'castIron');
  const e = M.evaluate(s); assert.equal(e.verdicts.fatigue.value, 'cannot-assess'); assert.match(e.verdicts.fatigue.reason, /cast iron is not assessed/);
  assert.equal(e.outputs.fatigueSF, undefined); assert.ok(e.outputs.critical);
  const t = M.fromPreset('fan'); M.setSpeed(t, null);
  const f = M.evaluate(t); for (const k of ['critical', 'amplitude', 'L:b2']) assert.equal(f.verdicts[k].value, 'cannot-assess');
  assert.equal(f.outputs.critical, undefined); assert.equal(f.governing.key, 'strength');
  const u = M.fromPreset('fan'); M.setLoad(u, 'f4', 'ecc', 0); assert.match(M.evaluate(u).verdicts.amplitude.reason, /no unbalance/);
  const v = M.fromPreset('fan'); M.setSelfWeight(v, false); M.setLoad(v, 'f4', 'mass', 0); assert.match(M.evaluate(v).verdicts.critical.reason, /has mass/);
  const big = M.fromPreset('shoulder'); M.setSegment(big, 's2', 'd', 300); assert.match(M.evaluate(big).verdicts.fatigue.reason, /2\.79–254 mm/);
  // saving with a cannot-assess verdict is fine; refused edits change nothing
  assert.ok(P.saveRun(P.createProject({ domain: 'machine-shaft', setup: s }), M.ADAPTER).verdicts.fatigue);
  const w = M.fromPreset('shoulder'), before = JSON.stringify(w);
  assert.throws(() => M.setRaiser(w, 'k9', 'kt', 0.5), /Kt/); assert.throws(() => M.setSpeed(w, -5), /speed/); assert.throws(() => M.setDamping(w, 2), /damping/);
  assert.throws(() => M.setFinish(w, 'polished'), /finish/); assert.throws(() => M.setLoad(w, 't7', 'mass', 3), /unknown/);
  assert.equal(JSON.stringify(w), before);
});
