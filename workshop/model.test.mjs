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

test('attempts are frozen snapshots and compare row by row', () => {
  const ws = fresh(), id = M.addPartFromPreset(ws, 'gear20');
  ws.fit.shaftId = 'g20a'; M.takeShaftReading(ws, 'g20a', 'caliper');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'caliper');
  const a = M.saveAttempt(ws, id, 'calipers');
  M.takeReading(ws, id, 'bore', 'boreGauge'); M.takeShaftReading(ws, 'g20a', 'micrometer');
  const b = M.saveAttempt(ws, id, 'gauges');
  assert.equal(a.outcome, 'inconclusive'); assert.equal(b.outcome, 'ok');
  const rows = M.compareAttempts(a, b), changed = rows.filter(r => r.changed).map(r => r.row);
  assert.deepEqual(changed, ['bore reading', 'shaft reading', 'clearance', 'outcome']);
  M.cut(ws, id, { type: 'bore', D: 20.04 });
  assert.equal(a.rev, 5, 'a saved attempt does not follow later cuts');
});
