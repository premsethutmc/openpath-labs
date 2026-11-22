// Hand-calculation checks for the stage 2 engines: fatigue (Shigley), bearing life (ISO 281), critical speed
// (Rayleigh / Dunkerley) and unbalance response (Jeffcott).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceFactor, sizeFactor, enduranceLimit, deGoodman, shaftFatigue, FatigueError } from './fatigue.mjs';
import { ratingLife } from './bearing.mjs';
import { rotor, magnification } from './rotor.mjs';
import { solveShaft } from './shaft.mjs';
import { MATERIALS } from '../../core/materials.mjs';

const rel = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b}`);
const E = MATERIALS.steel.E, rho = MATERIALS.steel.density;

test('Marin factors and endurance limit by hand (Shigley eqs. 6-8, 6-19, 6-20; Tables 6-2, 6-5)', () => {
  // steel Sut = 410 MPa, machined: ka = 4.51 × 410^-0.265 = 4.51 × 0.20300 = 0.9155
  rel(surfaceFactor(410, 'machined'), 0.9155, 1e-3);
  rel(surfaceFactor(410, 'ground'), 1.58 * 410 ** -0.085, 1e-12);
  // kb: 1.24 × 30^-0.107 = 1.24 × 0.69494 = 0.8617;  1.51 × 60^-0.157 = 1.51 × 0.52582 = 0.7940
  rel(sizeFactor(30), 0.8617, 1e-3); rel(sizeFactor(60), 0.7940, 1e-3);
  assert.throws(() => sizeFactor(300), FatigueError);
  // Se = 0.9155 × 0.8617 × 1 × 1 × 1 × (0.5 × 410) = 161.7 MPa;  at 99 % reliability × 0.814
  const e = enduranceLimit('steel', 30, { finish: 'machined', reliability: 50 });
  rel(e.Se1, 205, 1e-12); rel(e.Se, 161.7, 1e-3);
  rel(enduranceLimit('steel', 30, { reliability: 99 }).Se, 161.7 * 0.814, 1e-3);
  // aluminium: no endurance limit; 96.5 MPa fatigue strength at 5×10⁸ cycles, same Marin factors on Sut = 310
  const al = enduranceLimit('aluminium', 30);
  rel(al.Se, 4.51 * 310 ** -0.265 * 0.8617 * 96.5, 1e-3); assert.equal(al.endurance, false); assert.equal(al.cycles, 5e8);
  assert.throws(() => enduranceLimit('castIron', 30), /not assessed/);
});

test('DE-Goodman on a rotating shaft by hand: central load, steady torque, Kt = 2, Kts = 1.5', () => {
  // d = 30, span 300, F = 2000 N at mid-span: M = FL/4 = 150 000 N·mm; σ = 32M/πd³ = 56.59 MPa; σa = 2 × 56.59 = 113.18
  // T = 100 N·m: τ = 16T/πd³ = 18.86 MPa; τm = 1.5 × 18.86 = 28.29; σm' = √3 × 28.29 = 49.00
  // 1/n = 113.18/161.7 + 49.00/410 = 0.6999 + 0.1195 → n = 1.2204
  const r = solveShaft({ material: 'steel', selfWeight: false, segments: [{ L: 300, d: 30 }], bearings: [{ x: 0 }, { x: 300 }],
    loads: [{ kind: 'force', x: 150, F: 2000 }, { kind: 'torque', x: 0, T: 100e3 }, { kind: 'torque', x: 300, T: -100e3 }] });
  const f = shaftFatigue(r, 'steel', [{ x: 150, kt: 2, kts: 1.5 }], { finish: 'machined', reliability: 50 });
  assert.equal(f.x, 150); rel(f.sa, 113.18, 1e-3); rel(f.tm, 28.29, 1e-3); rel(f.sm_eq, 49.00, 1e-3); rel(f.n, 1.2204, 2e-3);
  // without the raiser the plain shaft: 1/n = 56.59/161.7 + √3·18.86/410
  const plain = shaftFatigue(r, 'steel', [], {});
  rel(plain.n, 1 / (56.59 / 161.7 + Math.sqrt(3) * 18.86 / 410), 2e-3);
  assert.equal(deGoodman({ Se: 100, Sut: 400 }).n, Infinity);
});

test('Bearing basic rating life by hand (ISO 281): L10 = (C/P)^3 ball, ^10/3 roller', () => {
  // C = 19 500 N, P = 1950 N: (10)^3 = 1000 million rev; at 1500 rpm 1e9 / (60 × 1500) = 11 111 h
  const b = ratingLife({ C: 19500, P: 1950, type: 'ball', rpm: 1500 });
  rel(b.L10, 1000, 1e-12); rel(b.hours, 11111.1, 1e-5);
  rel(ratingLife({ C: 19500, P: 1950, type: 'roller', rpm: 1500 }).L10, 2154.43, 1e-5);
  assert.equal(ratingLife({ C: 1000, P: 0, rpm: 100 }).hours, Infinity);
});

test('Critical speed: one disc on a light shaft is √(48EI/mL³) exactly; uniform shaft matches π²√(EI/m̄L⁴)', () => {
  // L = 900 mm, d = 25 mm: I = 19 175 mm⁴, k = 48EI/L³ = 252.5 N/mm; m = 20 kg: ω = √(252 500/20) = 112.36 rad/s = 1073 rpm
  const L = 900, d = 25, I = Math.PI * d ** 4 / 64, sh = { material: 'steel', segments: [{ L, d }], bearings: [{ x: 0 }, { x: L }], loads: [{ kind: 'force', x: 450, F: 0 }] };
  const disc = rotor(sh, { masses: [{ x: 450, m: 20, e: 0.04 }], shaftMass: false });
  rel(disc.omega, 112.36, 1e-4); rel(disc.omega, Math.sqrt(48 * E * I / L ** 3 * 1000 / 20), 1e-9); rel(disc.rpm, 1073.0, 1e-3);
  rel(disc.dunkerley, disc.omega, 1e-9);          // one mass: Dunkerley is exact too
  rel(disc.eModal, 0.04, 1e-9);                   // the disc's own eccentricity
  // uniform shaft alone: exact ω₁ = π²√(EI/(m̄L⁴)) = 384.39 rad/s; Rayleigh with the static curve is within 0.1 %
  const shaft = rotor(sh, { masses: [], shaftMass: true }), mbar = rho * Math.PI / 4 * (d / 1000) ** 2;
  const exact = Math.PI ** 2 * Math.sqrt(E * 1e6 * I * 1e-12 / (mbar * (L / 1000) ** 4));
  rel(exact, 384.39, 1e-4); assert.ok(shaft.omega >= exact); rel(shaft.omega, exact, 1e-3);
  // both: Dunkerley 1/ω² = 1/112.36² + 1/384.39² → 107.85 rad/s; Rayleigh above it and within 0.1 %
  const both = rotor(sh, { masses: [{ x: 450, m: 20 }], shaftMass: true });
  rel(both.dunkerley, 1 / Math.sqrt(1 / 112.36 ** 2 + 1 / shaft.omega ** 2), 1e-4); rel(both.dunkerley, 107.85, 1e-3);
  assert.ok(both.omega >= both.dunkerley); rel(both.omega, both.dunkerley, 1e-3);
});

test('Overhung masses: weights follow their own deflection (Shigley), Rayleigh stays above Dunkerley', () => {
  const o = rotor({ material: 'steel', segments: [{ L: 500, d: 30 }], bearings: [{ x: 0 }, { x: 400 }], loads: [{ kind: 'force', x: 500, F: 0 }, { kind: 'force', x: 200, F: 0 }] },
    { masses: [{ x: 500, m: 5 }, { x: 200, m: 10 }], shaftMass: true });
  assert.equal(o.signCorrected, true); assert.ok(o.omega > o.dunkerley && o.omega < 1.2 * o.dunkerley);
  assert.throws(() => rotor({ material: 'steel', segments: [{ L: 500, d: 30 }], bearings: [{ x: 0 }, { x: 400 }], loads: [] }, { masses: [], shaftMass: false }), /has mass/);
});

test('Jeffcott unbalance response: r/e = ρ²/√((1−ρ²)² + (2ζρ)²)', () => {
  rel(magnification(1, 0.02), 25, 1e-12);                       // at resonance 1/(2ζ)
  rel(magnification(0.5, 0.02), 0.25 / Math.sqrt(0.75 ** 2 + 0.02 ** 2), 1e-12);
  rel(magnification(10, 0.02), 100 / Math.sqrt(99 ** 2 + 0.4 ** 2), 1e-12);   // well above: tends to 1 (spins about the mass centre)
  assert.equal(magnification(0, 0.02), 0);
});
