import assert from 'node:assert/strict';
import { test } from 'node:test';
import { factorOfSafety, properties, splitReadout, stressStrainPoint, runRatios } from './split.mjs';
import { evaluateReading, ORIGINAL } from './model.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('readout against hand calculations: aluminium 40×30 solid, 2500 N at 200 mm of a 600 mm span', () => {
  // I = 40·30³/12 = 90 000 mm⁴, c = 15 mm, I/c = 6 000 mm³, E·I = 69 000·90 000 = 6.21e9 N·mm²
  // δ = 2500·200²·400²/(3·69 000·90 000·600) = 1.6e13/1.1178e13 = 1.43138 mm; M = 2500·200·400/600 = 333 333 N·mm
  // σ = M/(I/c) = 55.556 MPa; allowable = 276/2 = 138 MPa; FoS = 276/55.556 = 4.968
  const r = splitReadout(ORIGINAL, 200);
  near(r.EI, 6.21e9, 1e-12, 'E·I'); near(r.Z, 6000, 1e-12, 'I/c');
  near(r.deflection, 1.6e13 / 1.1178e13, 1e-9, 'δ'); near(r.deflectionRatio, 1.6e13 / 1.1178e13 / 0.15, 1e-9, 'δ ÷ limit');
  near(r.stress, 1e6 / 3 / 6000, 1e-9, 'σ'); near(r.allowable, 138, 1e-12, 'allowable'); near(r.fos, 276 / (1e6 / 3 / 6000), 1e-9, 'FoS');
  near(r.strain, 1e6 / 3 / 6000 / 69000 * 1e6, 1e-9, 'ε (µε)');
  assert.equal(r.stiff, false); assert.equal(r.strong, true); assert.equal(r.beyondYield, false);
});

test('material swap moves deflection by the E ratio and leaves stress unchanged; a deeper section moves both', () => {
  const al = splitReadout(ORIGINAL, 200), st = splitReadout({ ...ORIGINAL, material: 'steel' }, 200);
  near(st.deflection / al.deflection, 69000 / 200000, 1e-9, 'δ steel ÷ δ aluminium = E_al/E_st');
  near(st.stress, al.stress, 1e-9, 'σ independent of E');
  near(st.fos, 250 / al.stress, 1e-9, 'FoS changes only through the yield strength');
  // 40×60: I = 40·60³/12 = 720 000 (×8), I/c = 24 000 (×4)
  const deep = splitReadout({ ...ORIGINAL, h: 60 }, 200);
  near(deep.deflection / al.deflection, 90000 / 720000, 1e-9, 'δ ∝ 1/I'); near(deep.stress / al.stress, 6000 / 24000, 1e-9, 'σ ∝ 1/(I/c)');
});

test('factor of safety and the linear-elastic point, with the beyond-yield flag', () => {
  assert.equal(factorOfSafety(250, 125), 2); assert.equal(factorOfSafety(250, -50), 5); assert.equal(factorOfSafety(250, 0), Infinity);
  const al = properties(ORIGINAL);
  let p = stressStrainPoint(al, 2000);   // 69 000 · 2000e-6 = 138 MPa = yield ÷ 2
  near(p.stress, 138, 1e-12, 'σ = E·ε'); near(p.yieldStrain, 276 / 69000 * 1e6, 1e-12, 'ε_y = yield/E = 4000 µε'); near(p.fractionOfYield, 0.5, 1e-12, 'σ/yield');
  assert.equal(p.beyondYield, false);
  p = stressStrainPoint(al, 5000);       // 345 MPa > 276: the linear model does not apply
  assert.equal(p.beyondYield, true);
  // a 10×10 aluminium bar at mid-span: M = 375 000 N·mm, I/c = 10·10²/6 = 166.7 mm³ → σ = 2250 MPa ≫ yield
  const tiny = splitReadout({ material: 'aluminium', shape: 'rect', b: 10, h: 10 }, 300);
  near(tiny.stress, 375000 / (1000 / 6), 1e-9, 'σ tiny'); assert.equal(tiny.beyondYield, true); assert.equal(tiny.strong, false);
});

test('two-run ratios: deflection follows E·I, stress follows I/c, from saved readings', () => {
  const setup = d => ({ design: d, mount: 200, loaded: true, dialX: 200, strainX: 200 });
  const run = d => { const s = setup(d); return { setup: s, outputs: evaluateReading(s).outputs }; };
  const a = run(ORIGINAL), b = run({ ...ORIGINAL, material: 'steel' }), c = run({ ...ORIGINAL, h: 60 });
  let r = runRatios(a, b);
  near(r.deflection, 0.345, 1e-9, 'δ B÷A'); near(r.stiffness, 0.345, 1e-9, '(E·I)A÷(E·I)B'); near(r.stress, 1, 1e-9, 'σ B÷A'); near(r.section, 1, 1e-12, '(I/c)A÷(I/c)B');
  near(r.E, 200000 / 69000, 1e-12, 'E B÷A'); assert.equal(r.comparable, true);
  r = runRatios(a, c);
  near(r.deflection, 0.125, 1e-9, 'δ'); near(r.stiffness, 0.125, 1e-12, 'E·I'); near(r.stress, 0.25, 1e-9, 'σ'); near(r.section, 0.25, 1e-12, 'I/c');
  const moved = { setup: { ...setup(ORIGINAL), strainX: 400 }, outputs: a.outputs };
  r = runRatios(a, moved); assert.equal(r.comparable, false); assert.deepEqual(r.issues, ['the strain gauge moved']);
  const off = { setup: { ...setup(ORIGINAL), loaded: false }, outputs: evaluateReading({ ...setup(ORIGINAL), loaded: false }).outputs };
  r = runRatios(off, a); assert.equal(r.deflection, null, 'no ratio from a zero reading'); assert.equal(r.comparable, false);
});
