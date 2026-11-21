import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR, MATERIALS, newPart, addTurn, addGroove, setFillet, undo, diameterAt, criticalSections, runTest, explain, kt } from './model.mjs';

const near = (a, b, tol = 0.005) => assert.ok(Math.abs(a / b - 1) < tol, `${a} vs ${b}`);
const plain = newPart();

test('plain bar matches hand calculations', () => {
  const A = Math.PI * 20 ** 2 / 4, Z = Math.PI * 20 ** 3 / 16;
  near(runTest(plain, 'steel', 'tension').maxLoad, 410 * A);
  near(runTest(plain, 'steel', 'tension').firstYield, 250 * A);
  near(runTest(plain, 'castIron', 'torsion').maxLoad, 200 * Z);
  // Elastic stretch δ = FL/AE, twist θ = TL/GJ
  const t = runTest(plain, 'steel', 'tension');
  near(t.points[1].x, t.firstYield * BAR.length / (A * MATERIALS.steel.E), 0.01);
  const q = runTest(plain, 'steel', 'torsion');
  near(q.points[1].x, q.firstYield * BAR.length / (MATERIALS.steel.G * Math.PI * 20 ** 4 / 32) * 180 / Math.PI, 0.01);
});

test('ductile bars break at the smallest section; brittle bars at the worst stress peak', () => {
  const turned = addTurn(plain, { from: 30, to: 90, diameter: 14 });
  assert.equal(runTest(turned, 'steel', 'tension').breakAt, 60);
  assert.equal(runTest(turned, 'castIron', 'tension').governing.kind, 'shoulder');
  assert.equal(runTest(setFillet(turned, 4), 'castIron', 'tension').breakAt, 30);
  assert.ok(runTest(setFillet(turned, 4), 'castIron', 'tension').maxLoad > runTest(turned, 'castIron', 'tension').maxLoad, 'rounded steps are stronger');
});

test('grooves: sharp vs round matters a lot for cast iron, not for steel strength', () => {
  const sharp = addGroove(plain, { at: 60, depth: 2, radius: 0.5 });
  const round = addGroove(plain, { at: 60, depth: 2, radius: 2 });
  assert.equal(runTest(sharp, 'steel', 'tension').maxLoad, runTest(round, 'steel', 'tension').maxLoad);
  assert.ok(runTest(round, 'castIron', 'tension').maxLoad > 1.4 * runTest(sharp, 'castIron', 'tension').maxLoad);
  assert.ok(runTest(sharp, 'steel', 'tension').finalReading < 0.1 * runTest(plain, 'steel', 'tension').finalReading, 'notched bars stretch far less');
  assert.match(explain(runTest(sharp, 'castIron', 'tension'), sharp), /× the average/);
  assert.equal(runTest(sharp, 'castIron', 'torsion').mode, 'helix-45');
});

test('stress concentration fits stay near Peterson values', () => {
  near(kt('tension', 'groove', 1.67, 0.833), 2.3, 0.03);
  near(kt('torsion', 'groove', 1.67, 1.667), 1.42, 0.03);
  assert.ok(kt('torsion', 'groove', 2, 0.5) < kt('tension', 'groove', 2, 0.5));
});

test('lathe operations are bounded and undoable', () => {
  let p = addTurn(plain, { from: 10, to: 12, diameter: 10 });
  assert.equal(p, plain, 'too-short cut ignored');
  p = addTurn(plain, { from: 90, to: 30, diameter: 2 });
  assert.equal(diameterAt(p, 60), 8);
  p = addGroove(p, { at: 60, depth: 4, radius: 0.5 });
  assert.equal(diameterAt(p, 60), 4);
  assert.equal(undo(p).ops.length, 1);
  assert.equal(criticalSections(plain).length, 1);
  for (const m of Object.keys(MATERIALS)) for (const k of ['tension', 'torsion']) {
    const r = runTest(p, m, k);
    assert.ok(r.points.every((pt, i, a) => i === 0 || pt.x >= a[i - 1].x), 'curve moves forward');
    assert.ok(r.maxLoad > 0 && Number.isFinite(r.finalReading));
  }
});
