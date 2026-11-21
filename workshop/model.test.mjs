import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';

const fresh = () => M.newWorkshop();
const truthBore = (ws, id) => M.revisions(ws.parts.find(p => p.id === id)).at(-1).bore;
const fitOf = (ws, id, shaftId, range = M.FIT_RANGES[0]) => M.fitState(ws, id, { shaftId, range });
const strip = p => ({ material: p.material, stock: p.stock, ops: p.ops, spec: p.spec });

test('a preset and the same setup built from stock are the same object and give the same results', () => {
  const A = fresh(), a = M.addPartFromPreset(A, 'gear20');
  const B = fresh(), b = M.addPartFromStock(B, { material: 'al6061', D: 65, L: 30 });
  M.cut(B, b, { type: 'face', L: 25 }); M.cut(B, b, { type: 'turn', D: 60 }); M.cut(B, b, { type: 'drill', D: 18 }); M.cut(B, b, { type: 'bore', D: 19.95 });
  M.setSpec(B, b, { target: 20, lower: 0, upper: 0.021 });
  const pa = A.parts[0], pb = B.parts[0];
  assert.deepEqual(strip(pa), strip(pb));
  assert.deepEqual(M.revisions(pa), M.revisions(pb));
  for (const ws of [A, B]) { const id = ws.parts[0].id; M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'boreGauge'); M.takeReading(ws, id, 'bore', 'caliper'); M.takeShaftReading(ws, 'g20a', 'micrometer'); }
  const clean = ws => ws.readings.map(({ partId, ...r }) => r);
  assert.deepEqual(clean(A), clean(B));
  assert.deepEqual(fitOf(A, a, 'g20a'), fitOf(B, b, 'g20a'));
  assert.equal(M.mass(pa), M.mass(pb));
});

test('all four outcomes come from readings: too tight, too loose, within range, can’t confirm', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  ['g20a', 'g20b', 'd20'].forEach(s => { M.takeShaftReading(ws, s, 'micrometer'); });
  M.cut(ws, id, { type: 'bore', D: 20.0 }); M.takeReading(ws, id, 'bore', 'boreGauge');
  assert.equal(fitOf(ws, id, 'g20a').outcome, 'tight');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'boreGauge');
  assert.equal(fitOf(ws, id, 'g20a').outcome, 'ok');
  assert.equal(fitOf(ws, id, 'd20').outcome, 'loose');
  M.takeReading(ws, id, 'bore', 'caliper'); M.takeShaftReading(ws, 'g20a', 'caliper');
  const f = fitOf(ws, id, 'g20a');
  assert.equal(f.bore.instrument, 'caliper'); assert.equal(f.outcome, 'inconclusive');
  assert.ok(f.hi - f.lo > 0.041 - 0.007, 'the caliper band is wider than the whole H7/g6 range');
});

test('the fit decision uses the measured geometry, never the drawing target or the hidden as-cut size', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); const bore = M.takeReading(ws, id, 'bore', 'boreGauge'); const shaft = M.takeShaftReading(ws, 'g20a', 'micrometer');
  const before = fitOf(ws, id, 'g20a');
  assert.deepEqual({ ...before }, { state: 'result', rev: 5, bore, shaft, ...M.fitCheck(bore, shaft, M.FIT_RANGES[0]) });
  assert.equal(before.clearance, Math.round((bore.reading - shaft.reading) * 1e4) / 1e4);
  assert.notEqual(before.clearance, Math.round((truthBore(ws, id) - 19.9935) * 1e4) / 1e4, 'readings and as-cut differ here, and the fit follows the reading');
  for (const spec of [{ target: 19.98, lower: 0, upper: 0.01 }, { target: 20.5, lower: -0.1, upper: 0.1 }]) {
    M.setSpec(ws, id, spec);
    assert.deepEqual(fitOf(ws, id, 'g20a'), before, 'changing only the drawing target never changes a fit result');
    assert.equal(M.currentRev(ws.parts[0]), 5, 'and never creates a revision');
  }
  // the bore can meet its own drawing and still be wrong for a particular shaft
  M.setSpec(ws, id, { target: 20, lower: 0, upper: 0.021 });
  assert.notEqual(M.drawingCheck(bore, ws.parts[0].spec).outcome, 'nonconforming');
  assert.equal(fitOf(ws, id, 'd20').state, 'needs-shaft');
  M.takeShaftReading(ws, 'd20', 'micrometer');
  assert.equal(fitOf(ws, id, 'd20').outcome, 'loose');
});

test('recutting makes a new revision; old evidence stays on the old revision and a fresh reading is required', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.0 }); const old = M.takeReading(ws, id, 'bore', 'boreGauge'); M.takeShaftReading(ws, 'g20a', 'micrometer');
  assert.equal(fitOf(ws, id, 'g20a').outcome, 'tight');
  const kept = JSON.stringify(ws.readings);
  M.cut(ws, id, { type: 'bore', D: 20.02 });
  assert.equal(JSON.stringify(ws.readings), kept, 'recutting does not edit or delete any reading');
  assert.equal(old.rev, 5);
  const f = fitOf(ws, id, 'g20a');
  assert.equal(f.state, 'stale'); assert.equal(f.staleRev, 5); assert.equal(f.rev, 6);
  M.takeReading(ws, id, 'bore', 'boreGauge');
  assert.equal(fitOf(ws, id, 'g20a').state, 'result');
});

test('only material can be removed: impossible cuts are refused and leave the part unchanged', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20'), before = JSON.stringify(ws.parts[0]);
  assert.throws(() => M.cut(ws, id, { type: 'bore', D: 19.9 }), /only be made larger/);
  assert.throws(() => M.cut(ws, id, { type: 'turn', D: 61 }), /smaller/);
  assert.throws(() => M.cut(ws, id, { type: 'turn', D: 22 }), /wall/);
  assert.throws(() => M.cut(ws, id, { type: 'face', L: 30 }), /shorter/);
  assert.throws(() => M.cut(ws, id, { type: 'drill', D: 7.3 }), /drill/);
  assert.throws(() => M.setStock(ws, id, { material: 'brass360' }), /new blank/);
  assert.equal(JSON.stringify(ws.parts[0]), before);
  const b = M.addPartFromStock(ws, { material: 'brass360', D: 40, L: 30 });
  assert.throws(() => M.cut(ws, b, { type: 'bore', D: 20 }), /drill a hole first/);
});

test('material changes mass only; a fork repeats the plan, keeps no readings, and old parts are untouched', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'boreGauge');
  const steel = M.forkPart(ws, id, { material: 'steel1045' }), brass = M.forkPart(ws, id, { material: 'brass360' });
  const [p, s, b] = [id, steel, brass].map(k => ws.parts.find(x => x.id === k));
  assert.deepEqual(M.revisions(s), M.revisions(p)); assert.deepEqual(M.revisions(b), M.revisions(p));
  assert.equal(M.readingsFor(ws, steel).length, 0);
  M.takeReading(ws, steel, 'bore', 'boreGauge');
  assert.equal(M.readingsFor(ws, steel)[0].reading, M.readingsFor(ws, id)[0].reading);
  assert.ok(Math.abs(M.mass(s) / M.mass(p) - 7870 / 2700) < 1e-12);
  assert.ok(Math.abs(M.mass(b) / M.mass(p) - 8500 / 2700) < 1e-12);
  const early = M.forkPart(ws, id, { rev: 3 });
  assert.equal(M.currentRev(ws.parts.find(x => x.id === early)), 3);
  M.cut(ws, early, { type: 'bore', D: 20.01 });
  assert.equal(M.currentRev(p), 5, 'forking and cutting the fork leaves the original alone');
});

test('mass: ρ·π/4·(D² − d²)·L from the as-cut geometry', () => {
  const ws = fresh(), id = M.addPartFromStock(ws, { material: 'steel1045', D: 50, L: 100 });
  assert.ok(Math.abs(M.mass(ws.parts[0]) - 7870 * Math.PI / 4 * 50 ** 2 * 100 * 1e-9) < 1e-12);
  M.cut(ws, id, { type: 'drill', D: 20 });
  const g = M.revisions(ws.parts[0]).at(-1);
  assert.ok(Math.abs(M.mass(ws.parts[0]) - 7870 * Math.PI / 4 * (50 ** 2 - g.bore ** 2) * 100 * 1e-9) < 1e-12);
});

test('instruments: every reading lies within its maximum error and on its resolution; wrong instrument refused', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'hub25');
  const t = truthBore(ws, id);
  for (const inst of ['boreGauge', 'caliper']) for (let i = 0; i < 300; i++) {
    const r = M.takeReading(ws, id, 'bore', inst), I = M.INSTRUMENTS[inst];
    assert.ok(Math.abs(r.reading - t) <= I.maxError + 1e-9, `${inst} ${r.reading} vs ${t}`);
    assert.ok(Math.abs(r.reading / I.resolution - Math.round(r.reading / I.resolution)) < 1e-6);
  }
  for (let i = 0; i < 300; i++) assert.ok(Math.abs(M.takeShaftReading(ws, 'g25', 'micrometer').reading - 24.994) <= 0.002 + 1e-9);
  assert.throws(() => M.takeReading(ws, id, 'bore', 'micrometer'), /cannot measure/);
  assert.throws(() => M.takeShaftReading(ws, 'g25', 'boreGauge'), /cannot measure a shaft/);
  const blank = M.addPartFromStock(ws, { material: 'al6061', D: 40, L: 20 });
  assert.throws(() => M.takeReading(ws, blank, 'bore', 'caliper'), /no bore/);
});

test('fit check: worst-case band and limits (ISO 286 18–30 mm values)', () => {
  const r = (reading, maxError) => ({ reading, maxError });
  const g6 = M.FIT_RANGES.find(f => f.id === 'H7/g6');
  assert.deepEqual([g6.min, g6.max], [0.007, 0.041]);
  assert.equal(M.fitCheck(r(20.02, 0.003), r(19.993, 0.002), g6).outcome, 'ok');            // 0.027 ± 0.005
  assert.equal(M.fitCheck(r(20.0, 0.003), r(19.999, 0.002), g6).outcome, 'tight');           // 0.001 ± 0.005 → hi 0.006 < 0.007
  assert.equal(M.fitCheck(r(20.0, 0.003), r(19.998, 0.002), g6).outcome, 'inconclusive');    // hi touches the limit: not confirmed tight
  assert.equal(M.fitCheck(r(20.05, 0.003), r(19.99, 0.002), g6).outcome, 'loose');           // 0.060 ± 0.005
  assert.equal(M.fitCheck(r(20.02, 0.03), r(19.99, 0.03), g6).outcome, 'inconclusive');
  assert.equal(M.fitCheck(r(20.012, 0.003), r(19.993, 0.002), g6).outcome, 'ok');           // 0.019 ± 0.005
  assert.throws(() => M.fitCheck(r(20, 0), r(20, 0), { min: 0.04, max: 0.01 }), /min below max/);
});

test('regression: a cut is judged on its as-cut geometry; impossible cuts change nothing', () => {
  const cases = [
    { what: 'boring would shrink the hole (preset gear blank, bore 19.95 again: 19.9461 → 19.9421)',
      make: ws => M.addPartFromPreset(ws, 'gear20'), op: { type: 'bore', D: 19.95 }, err: /hole can only be made larger/ },
    { what: 'turning would grow the outside (Ø36.009 → 36.0101)',
      make: ws => { const id = M.addPartFromStock(ws, { material: 'steel1045', D: 40, L: 30 }); M.cut(ws, id, { type: 'turn', D: 36 }); return id; },
      op: { type: 'turn', D: 36.0037 }, err: /would not cut/ },
    { what: 'drilling would leave a wall under 2 mm (Ø25 bar, 21 mm drill → 21.0466, wall 1.977)',
      make: ws => M.addPartFromStock(ws, { material: 'brass360', D: 25, L: 30 }), op: { type: 'drill', D: 21 }, err: /wall would be under 2 mm/ },
  ];
  for (const c of cases) {
    const ws = fresh(), id = c.make(ws);
    if (M.revisions(ws.parts[0]).at(-1).bore) M.takeReading(ws, id, 'bore', 'boreGauge');
    M.takeReading(ws, id, 'od', 'micrometer');
    const before = JSON.stringify({ parts: ws.parts, readings: ws.readings }), revs = JSON.stringify(M.revisions(ws.parts[0]));
    assert.throws(() => M.cut(ws, id, c.op), c.err, c.what);
    assert.equal(JSON.stringify({ parts: ws.parts, readings: ws.readings }), before, `${c.what}: part and readings unchanged`);
    assert.equal(JSON.stringify(M.revisions(ws.parts[0])), revs);
  }
  // sweep: no accepted cut ever shrinks a hole, grows the outside or the length, or leaves a thin wall
  const ws = fresh(), id = M.addPartFromStock(ws, { material: 'al6061', D: 32, L: 40 });
  M.cut(ws, id, { type: 'drill', D: 20 });
  const p = ws.parts[0]; let accepted = 0, refused = 0;
  for (let k = 0; k < 400; k++) {
    const g = M.revisions(p).at(-1), op = [{ type: 'bore', D: +(g.nominal.bore + (k % 7 - 2) * 0.003).toFixed(3) }, { type: 'turn', D: +(g.nominal.od - (k % 5 - 1) * 0.003).toFixed(3) }, { type: 'face', L: +(g.nominal.L - (k % 4 - 1) * 0.004).toFixed(3) }][k % 3];
    try { M.cut(ws, id, op); accepted++; } catch (e) { assert.ok(e instanceof M.CutError); refused++; continue; }
    const n = M.revisions(p).at(-1);
    assert.ok(n.bore > g.bore || op.type !== 'bore'); assert.ok(n.od <= g.od && n.L <= g.L && n.bore >= g.bore);
    assert.ok((n.od - n.bore) / 2 >= M.MIN_WALL);
  }
  assert.ok(accepted >= 10 && refused >= 10, `sweep exercised both paths (${accepted} accepted, ${refused} refused)`);
});

test('shared experiment record: runs freeze parts and readings, and reproduce by re-cutting and re-measuring', async () => {
  const P = await import('../core/project.mjs');
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'caliper'); M.takeShaftReading(ws, 'g20a', 'caliper');
  const proj = P.createProject({ domain: 'workshop-parts', setup: ws });
  const a = P.saveRun(proj, M.ADAPTER, 'calipers');
  assert.equal(a.verdicts.fit.value, 'cannot-assess'); assert.equal(a.outputs.bore.source, 'measured');
  M.takeReading(proj.setup, id, 'bore', 'boreGauge'); M.takeShaftReading(proj.setup, 'g20a', 'micrometer');
  const b = P.saveRun(proj, M.ADAPTER, 'gauges');
  assert.equal(b.verdicts.fit.value, 'pass');
  const back = P.deserialize(P.serialize(proj), 'workshop-parts');
  for (const r of back.runs) assert.ok(P.reproduceRun(r, M.ADAPTER).ok);
  const c = P.compareRuns(a, b);
  assert.ok(c.changed.every(d => d.path.startsWith('readings.')), 'only new readings changed');
  assert.ok(c.outputs.find(o => o.key === 'clearance').changed);
  // a tampered reading is caught instead of silently trusted
  back.runs[0].setup.readings[0].reading += 0.01;
  assert.match(M.evaluateWorkshop(back.runs[0].setup).reason, /does not match what its instrument gives: reading differs/);
  assert.match(M.evaluateWorkshop(M.newWorkshop()).reason, /No part on the bench/);
  // after a recut the fit is not applicable until the bore is measured again
  M.cut(proj.setup, id, { type: 'bore', D: 20.04 });
  assert.equal(M.evaluateWorkshop(proj.setup).verdicts.fit.value, 'not-applicable');
});

// Regression: the replay checked the value only. Zeroing the saved caliper's error turned "can't confirm" into a pass.
test('regression: a saved reading is trusted only if its value, instrument, resolution and error all match', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'caliper'); M.takeShaftReading(ws, 'g20a', 'caliper');
  assert.equal(M.evaluateWorkshop(ws).verdicts.fit.value, 'cannot-assess');
  const tamper = (fn, re) => { const w = JSON.parse(JSON.stringify(ws)); fn(w); const e = M.evaluateWorkshop(w); assert.equal(e.ok, false, 'not trusted'); assert.match(e.reason, re); };
  tamper(w => { w.readings[0].maxError = 0; w.readings[1].maxError = 0; }, /maxError differs/);
  tamper(w => { w.readings[0].resolution = 0.001; }, /resolution differs/);
  tamper(w => { w.readings[0].instrument = 'boreGauge'; }, /does not match/);
  tamper(w => { w.readings[0].rev = 4; }, /does not match/);
  tamper(w => { w.readings[1].n = 3; }, /does not match/);
  tamper(w => { w.readings[0].partId = 'P9'; }, /not in this workshop/);
  tamper(w => { w.readings[0].note = 'edited'; }, /note differs/);
});
