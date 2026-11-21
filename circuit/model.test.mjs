import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './model.mjs';
import * as PS from '../pumpset/model.mjs';
import * as P from '../core/project.mjs';

test('the pump-set preset gives the same operating point and verdicts as the drive check (PR #7)', () => {
  const s = C.fromPreset('pumpset'), r = C.evaluate(s), d = PS.evaluate(PS.projectFromPreset('tank4'));
  assert.ok(Math.abs(r.outputs.flow.value - d.operating.flow) / d.operating.flow < 1e-6);
  assert.ok(Math.abs(r.outputs.shaftPower.value * 1000 - d.operating.shaftPower) / d.operating.shaftPower < 1e-6);
  assert.equal(r.verdicts.flow.value, 'pass'); assert.equal(r.verdicts.drive.value, 'pass');
  C.setParam(s, 'p7', 'D', 0.05);                        // the drive check's acceptance change: 50 mm delivery
  const r2 = C.evaluate(s);
  assert.equal(r2.verdicts.flow.value, 'pass'); assert.equal(r2.verdicts.drive.value, 'fail');
});

test('a preset and the same line built by hand from an empty setup are identical', () => {
  for (const pre of C.PRESETS) {
    const hand = C.emptySetup();
    for (const [fn, ...args] of pre.script) ({ addPart: C.addPart, setParam: C.setParam, toggleGauge: C.toggleGauge, setTemp: C.setTemp, setRequiredFlow: C.setRequiredFlow })[fn](hand, ...args);
    assert.deepEqual(hand, C.fromPreset(pre.id));
    assert.deepEqual(C.evaluate(hand).outputs, C.evaluate(C.fromPreset(pre.id)).outputs);
  }
});

test('adding a restriction and explaining the loss between two gauges', () => {
  const s = C.fromPreset('gravity'), q0 = C.evaluate(s).outputs.flow.value;
  const id = C.addPart(s, 'orifice', { beta: 0.4 }, 'p3');          // after the valve
  C.toggleGauge(s, id);
  const r = C.evaluate(s);
  assert.ok(r.outputs.flow.value < q0, 'the restriction reduces the flow');
  const x = C.explain(s, 'p3', id);
  assert.ok(Math.abs(x.check) < 1e-9);
  assert.equal(x.items.length, 1); assert.equal(x.items[0].kind, 'orifice');
  assert.ok(x.total < 0 && Math.abs(x.total - x.items[0].kPa) < 1e-9, 'same bore and level: the whole drop is the orifice');
  const y = C.explain(s, 'p2', id);
  assert.deepEqual(y.items.map(i => i.kind), ['fitting', 'orifice']);
  assert.throws(() => C.explain(s, id, 'p2'), /upstream gauge first/);
});

test('unsupported parts and layouts get a specific explanation and cannot be saved as evidence', () => {
  const s = C.fromPreset('gravity');
  C.addPart(s, 'tee', {}, 'p2');
  const r = C.evaluate(s);
  assert.equal(r.ok, false); assert.match(r.reason, /#3 Tee \(branch\): Branches need a network solver/);
  const proj = P.createProject({ domain: 'fluids-line', setup: s });
  assert.throws(() => P.saveRun(proj, C.ADAPTER), /Not saved: #3 Tee/);
  const e = C.emptySetup();
  assert.match(C.evaluate(e).reason, /start with a source reservoir/);
  C.addPart(e, 'source'); C.addPart(e, 'pipe'); C.addPart(e, 'sink', { surface: 9 });
  assert.match(C.evaluate(e).reason, /backwards/);
  assert.throws(() => C.setParam(e, 'p2', 'D', 2), /Bore must be between 4 and 300 mm/);
  assert.throws(() => C.addPart(e, 'pipe', { L: -1 }), /Length/);
  assert.equal(e.chain.length, 3, 'a refused add changes nothing');
});

test('moving a gauge changes only its reading; moving parts reorders the line', () => {
  const s = C.fromPreset('gravity'), a = C.evaluate(s);
  C.toggleGauge(s, 'p2'); C.toggleGauge(s, 'p4');
  const b = C.evaluate(s);
  assert.equal(b.outputs.flow.value, a.outputs.flow.value);
  assert.ok(!('gauge:p2' in b.outputs) && 'gauge:p4' in b.outputs);
  C.movePart(s, 'p3', 1);                                            // valve after the second pipe
  assert.deepEqual(s.chain.map(p => p.type), ['source', 'pipe', 'pipe', 'valve', 'sink']);
  assert.throws(() => C.movePart(s, 'p1', -1), /end of the line/);
});

test('evidence from the fluid bench uses the shared project record', () => {
  const proj = P.createProject({ domain: 'fluids-line', setup: C.fromPreset('meter') });
  const a = P.saveRun(proj, C.ADAPTER, 'β 0.5');
  C.setParam(proj.setup, 'p5', 'beta', 0.35);
  const b = P.saveRun(proj, C.ADAPTER, 'β 0.35');
  const c = P.compareRuns(a, b);
  assert.deepEqual(c.changed.map(d => d.path), ['chain.4.beta']);
  assert.ok(c.outputs.find(o => o.key === 'flow').changed);
  const back = P.deserialize(P.serialize(proj), 'fluids-line');
  for (const r of back.runs) assert.ok(P.reproduceRun(r, C.ADAPTER).ok);
});
