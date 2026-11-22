import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPEC, ORIGINAL, stand, verdict, check, massOf, sectionOf } from './model.mjs';
import { MATERIALS } from '../core/materials.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);
// independent hand calculations: simply supported beam, point load P at a from the left support
const hand = (P, L, a, E, I, c) => {
  const b = L - a;
  return { R1: P * b / L, R2: P * a / L, dLoad: P * a * a * b * b / (3 * E * I * L), Mmax: P * a * b / L, sigma: P * a * b / L * c / I,
    dAt: x => (x <= a ? P * b * x * (L * L - b * b - x * x) / (6 * E * I * L) : P * a * (L - x) * (L * L - a * a - (L - x) ** 2) / (6 * E * I * L)) };
};

test('solver matches hand calculations: reactions, deflection along the span, bending moment and stress (mm, N, MPa)', () => {
  for (const d of [ORIGINAL, { material: 'steel', shape: 'I', b: 50, h: 80, tw: 3, tf: 3 }, { material: 'aluminium', shape: 'rhs', b: 50, h: 80, t: 6 }]) {
    for (const a of [100, 200, 300, 450]) {
      const s = stand(d, { mount: a, loaded: true }), h = hand(SPEC.load, SPEC.span, a, MATERIALS[d.material].E, sectionOf(d).I, sectionOf(d).c);
      near(s.reactions[0], h.R1, 1e-9, 'left reaction'); near(s.reactions[1], h.R2, 1e-9, 'right reaction');
      near(s.at(a).deflection, h.dLoad, 1e-9, `deflection under the load at ${a} mm`);
      for (const x of [50, 150, 300, 500]) near(s.at(x).deflection, h.dAt(x), 1e-9, `deflection at ${x} mm`);
      near(s.at(a).moment, h.Mmax, 1e-9, 'moment under the load'); near(s.maxStress, h.sigma, 1e-9, 'σ = Mc/I');
      near(s.at(a).strain * 1e6, h.sigma / MATERIALS[d.material].E * 1e6, 1e-9, 'strain = σ/E (µε)');
    }
  }
  // units: aluminium 40 × 30 at 200 mm — hand: δ = 2500·200²·400²/(3·69000·90000·600) = 1.431 mm, σ = 333 333·15/90 000 = 55.6 MPa
  const o = stand(ORIGINAL, { mount: 200, loaded: true });
  assert.equal(o.at(200).deflection.toFixed(3), '1.431'); assert.equal(o.maxStress.toFixed(1), '55.6');
  near(massOf(ORIGINAL), 2700 * 40 * 30 * 600 * 1e-9, 1e-12, 'mass = ρ·A·L');
});

test('the original support is too flexible, not near yield, and springs back when unloaded', () => {
  const v = verdict(ORIGINAL, SPEC.guidedMount);
  assert.ok(!v.alignment && v.deflection > 9 * SPEC.tolerance, 'well outside alignment');
  assert.ok(v.yield && v.maxStress < 0.25 * MATERIALS.aluminium.yield, 'stress far below yield');
  const off = stand(ORIGINAL, { mount: 200, loaded: false });
  assert.ok(off.defl.every(d => Math.abs(d) < 1e-12), 'no permanent set: unloaded reads zero');
});

test('stiffness (E·I) and strength (yield) act differently: material swaps scale deflection by E, not stress', () => {
  const al = { ...ORIGINAL }, st = { ...ORIGINAL, material: 'steel' };
  const a = stand(al, { mount: 200, loaded: true }), s = stand(st, { mount: 200, loaded: true });
  near(a.at(200).deflection / s.at(200).deflection, MATERIALS.steel.E / MATERIALS.aluminium.E, 1e-9, 'δ ∝ 1/E');
  near(a.maxStress, s.maxStress, 1e-12, 'stress does not depend on E');
  // the yield strengths are similar, yet the deflection differs ~2.9×
  assert.ok(Math.abs(MATERIALS.steel.yield - MATERIALS.aluminium.yield) / MATERIALS.aluminium.yield < 0.15);
  // doubling depth: I × 8 → deflection ÷ 8, stress ÷ 4
  const deep = stand({ ...ORIGINAL, h: 60 }, { mount: 200, loaded: true });
  near(a.at(200).deflection / deep.at(200).deflection, 8, 1e-9, 'δ ∝ 1/h³'); near(a.maxStress / deep.maxStress, 4, 1e-9, 'σ ∝ 1/h²');
  // more load → proportionally more deflection and stress (linear elastic)
  // load position: nearer midspan → more deflection under the load
  assert.ok(stand(al, { mount: 300, loaded: true }).at(300).deflection > a.at(200).deflection);
});

test('the trade-offs exist: strong-but-floppy, stiff-but-heavy, and at least two different designs that meet every limit', () => {
  const floppy = { material: 'aluminium', shape: 'rhs', b: 50, h: 60, t: 4 }, heavy = { material: 'steel', shape: 'rect', b: 50, h: 60 };
  const passA = { material: 'steel', shape: 'I', b: 50, h: 80, tw: 3, tf: 3 }, passB = { material: 'aluminium', shape: 'I', b: 50, h: 80, tw: 3, tf: 8 };
  let v = verdict(floppy, 200); assert.ok(v.yield && v.mass && !v.alignment, 'meets yield and mass, fails alignment');
  v = verdict(heavy, 200); assert.ok(v.alignment && v.yield && !v.mass, 'meets alignment, too heavy');
  for (const d of [passA, passB]) { assert.ok(check(d).ok); assert.ok(verdict(d, 200).all, `${d.material} ${d.shape} meets all limits`); }
  assert.notEqual(passA.material, passB.material);
  // self-weight really is negligible for designs inside the mass limit
  assert.ok(SPEC.massLimit * 9.81 <= 0.01 * SPEC.load);
});

test('the transfer case tests reasoning, not recall: some guided winners fail when the load moves to mid-span', () => {
  const guidedWinners = [
    { material: 'steel', shape: 'I', b: 40, h: 70, tw: 3, tf: 3 }, { material: 'aluminium', shape: 'rhs', b: 50, h: 80, t: 5 },
    { material: 'aluminium', shape: 'I', b: 40, h: 80, tw: 3, tf: 8 }, { material: 'steel', shape: 'I', b: 50, h: 80, tw: 3, tf: 3 },
  ];
  const results = guidedWinners.map(d => ({ g: verdict(d, SPEC.guidedMount), t: verdict(d, SPEC.transferMount) }));
  assert.ok(results.every(r => r.g.all), 'all are guided-case winners');
  assert.ok(results.some(r => !r.t.all) && results.some(r => r.t.all), 'some fail and some pass at mid-span: the material or size alone does not decide');
  // steel and aluminium winners each appear among both outcomes? at least one of each material fails or passes differently
  assert.ok(results.filter(r => !r.t.all).every(r => !r.t.alignment && r.t.yield), 'the mid-span failures are alignment failures, not yield');
});

test('honest bounds: envelope, wall thickness, mount range', () => {
  assert.ok(!check({ material: 'steel', shape: 'rect', b: 60, h: 40 }).ok);
  assert.ok(!check({ material: 'steel', shape: 'rhs', b: 50, h: 80, t: 2 }).ok, 'thin walls refused (local buckling not modelled)');
  assert.throws(() => stand(ORIGINAL, { mount: 50, loaded: true }), /within/);
  assert.throws(() => stand(ORIGINAL, { mount: 225, loaded: true }), /grid/);
});
