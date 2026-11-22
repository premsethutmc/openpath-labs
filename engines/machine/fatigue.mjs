// Fatigue of a rotating shaft: fully reversed bending (the shaft turns under a steady bending moment, so each fibre
// goes from tension to compression once per revolution) plus steady torsion.
// Method: Shigley's Mechanical Engineering Design (Budynas & Nisbett, 10th ed.):
//   endurance limit   Se = ka·kb·kc·kd·ke·Se'                        (eq. 6-18, Marin factors)
//   Se' = 0.5·Sut for steels with Sut ≤ 1400 MPa                      (eq. 6-8)
//   ka = a·Sut^b, surface finish                                      (eq. 6-19, Table 6-2, Sut in MPa)
//   kb = 1.24 d^-0.107 (2.79–51 mm), 1.51 d^-0.157 (51–254 mm)       (eq. 6-20, rotating round bar)
//   kc = 1 (bending; torsion enters through von Mises), kd = 1 (room temperature)
//   ke from reliability                                               (Table 6-5)
//   DE-Goodman: 1/n = σa'/Se + σm'/Sut,  σa' = √(σa² + 3τa²),  σm' = √(σm² + 3τm²)   (eq. 7-7)
//   Rotating shaft, steady loads: σa = Kf·M·c/I, σm = 0, τa = 0, τm = Kfs·T·r/J.
// Stress concentration: the learner supplies Kt (bending) and Kts (torsion) at each stress raiser. We take Kf = Kt and
// Kfs = Kts (notch sensitivity q = 1), which is conservative; Shigley Table 7-1 gives first-iteration estimates.
// Units: MPa, mm.
import { MATERIALS } from '../../core/materials.mjs';

// Fatigue data per shaft material. Ultimate strengths come from core/materials.mjs (typical values, sourced there).
export const FATIGUE_DATA = {
  // Shigley eq. 6-8: Se' = 0.5 Sut for steel (Sut ≤ 1400 MPa); Sut = 410 MPa typical IS 2062 E250 / S275.
  steel: { basis: "Se' = 0.5·Sut (Shigley eq. 6-8, steels)", Sut: () => MATERIALS.steel.ultimate, Se1: () => 0.5 * MATERIALS.steel.ultimate, endurance: true },
  // Aluminium has no true endurance limit. 96.5 MPa is the typical fatigue strength of 6061-T6 at 5×10⁸ cycles
  // (R.R. Moore rotating beam; ASM Handbook Vol. 2 / Aluminum Association typical properties).
  aluminium: { basis: "fatigue strength 96.5 MPa at 5×10⁸ cycles (6061-T6, ASM Handbook Vol. 2); no true endurance limit", Sut: () => MATERIALS.aluminium.ultimate, Se1: () => 96.5, endurance: false, cycles: 5e8 },
  // Grey cast iron: brittle and notch-insensitive; the Goodman line for ductile metals does not apply. Not assessed.
  castIron: null,
};
export const NOT_ASSESSED = { castIron: 'Fatigue of grey cast iron is not assessed here: it is brittle, and the DE-Goodman method on this bench is for ductile steel and aluminium shafts.' };

// Shigley Table 6-2 (Sut in MPa).
export const SURFACE = {
  ground: { a: 1.58, b: -0.085, label: 'Ground' },
  machined: { a: 4.51, b: -0.265, label: 'Machined or cold-drawn' },
  hotRolled: { a: 57.7, b: -0.718, label: 'Hot-rolled' },
  forged: { a: 272, b: -0.995, label: 'As-forged' },
};
// Shigley Table 6-5.
export const RELIABILITY = { 50: 1, 90: 0.897, 95: 0.868, 99: 0.814, 99.9: 0.753 };

// First-iteration stress-concentration estimates for a learner to start from (Shigley Table 7-1). Always editable.
export const RAISER_KINDS = {
  sharpFillet: { label: 'Shoulder, sharp fillet (r/d = 0.02)', kt: 2.7, kts: 2.2 },
  roundFillet: { label: 'Shoulder, well-rounded fillet (r/d = 0.1)', kt: 1.7, kts: 1.5 },
  keyseat: { label: 'End-mill keyseat (r/d = 0.02)', kt: 2.14, kts: 3.0 },
  ringGroove: { label: 'Retaining-ring groove', kt: 5.0, kts: 3.0 },
  custom: { label: 'Your own Kt', kt: null, kts: null },
};

export class FatigueError extends Error { constructor(message) { super(message); } }

export const surfaceFactor = (Sut, finish) => { const f = SURFACE[finish]; if (!f) throw new FatigueError('Choose a surface finish.'); return f.a * Sut ** f.b; };
export function sizeFactor(d) {
  if (d >= 2.79 && d <= 51) return 1.24 * d ** -0.107;
  if (d > 51 && d <= 254) return 1.51 * d ** -0.157;
  throw new FatigueError(`The size factor fit (Shigley eq. 6-20) covers diameters 2.79–254 mm; Ø${d} mm is outside it, so fatigue cannot be assessed.`);
}
export function reliabilityFactor(r) { const k = RELIABILITY[r]; if (!k) throw new FatigueError('Choose a listed reliability.'); return k; }

// Endurance limit at a section of outer diameter d.
export function enduranceLimit(material, d, { finish = 'machined', reliability = 50 } = {}) {
  const data = FATIGUE_DATA[material];
  if (!data) throw new FatigueError(NOT_ASSESSED[material] || 'No fatigue data for this material.');
  const Sut = data.Sut(), Se1 = data.Se1(), ka = surfaceFactor(Sut, finish), kb = sizeFactor(d), kc = 1, kd = 1, ke = reliabilityFactor(reliability);
  return { Sut, Se1, ka, kb, kc, kd, ke, Se: ka * kb * kc * kd * ke * Se1, basis: data.basis, endurance: data.endurance, cycles: data.cycles ?? null };
}

// DE-Goodman safety factor (Shigley eq. 7-7 in stress form). Infinity when there is no stress at all.
export function deGoodman({ sa = 0, ta = 0, sm = 0, tm = 0, Se, Sut }) {
  const a = Math.sqrt(sa * sa + 3 * ta * ta), m = Math.sqrt(sm * sm + 3 * tm * tm), inv = a / Se + m / Sut;
  return { sa_eq: a, sm_eq: m, n: inv > 0 ? 1 / inv : Infinity };
}

// Fatigue along a solved shaft (result of solveShaft). raisers: [{ x, kt, kts }]. Kf, Kfs = 1 elsewhere.
export function shaftFatigue(solved, material, raisers = [], opts = {}) {
  const at = x => raisers.filter(q => Math.abs(q.x - x) < 0.5);
  let worst = null;
  for (const p of solved.points) {
    const here = at(p.x), Kf = Math.max(1, ...here.map(q => q.kt)), Kfs = Math.max(1, ...here.map(q => q.kts));
    const e = enduranceLimit(material, p.d, opts);
    const sa = Kf * Math.abs(p.sigma), tm = Kfs * Math.abs(p.tau), g = deGoodman({ sa, tm, Se: e.Se, Sut: e.Sut });
    const row = { x: p.x, d: p.d, M: p.M, T: p.T, Kf, Kfs, sa, tm, ...g, ...e };
    if (!worst || row.n < worst.n) worst = row;
  }
  return worst;
}
