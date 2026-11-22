// Rotor dynamics of a shaft on rigid bearings: first critical (whirling) speed and a single-mode unbalance response.
// Same stations and sections as the static solve (engines/machine/shaft.mjs); own banded beam solve. Units: mm, kg, N, rad/s.
//
// Critical speed — Rayleigh's method with the static deflection curve (Shigley 10th ed. §7-6, eq. 7-23; Rattan,
// Theory of Machines, ch. 15):  ω₁² = g·Σ mᵢ|yᵢ| / Σ mᵢyᵢ²,  yᵢ = static deflection under the weights mᵢg.
//   The shaft's own mass is lumped at the stations (half of each element to each end). When the deflection curve
//   changes sign (an overhang), each weight is applied in the direction of its own deflection, as Shigley advises,
//   so the curve resembles the first mode.
// Check — Dunkerley's empirical formula (Rattan §15.5):  1/ω_D² = 1/ω_s² + Σ 1/ωᵢ²,  ωᵢ² = g/δᵢᵢ (each attached mass
//   alone on the massless shaft), ω_s the shaft alone. Dunkerley underestimates and Rayleigh overestimates the first
//   critical speed of the model, so the true value lies between them.
// Unbalance response — a teaching estimate: one mode (the Rayleigh shape φ, 1 at its largest deflection) behaves like
//   a Jeffcott rotor (Rao, Mechanical Vibrations §3.10 / Jeffcott 1919):
//     r = e_m·ρ²/√((1 − ρ²)² + (2ζρ)²),  ρ = ω/ω₁,  e_m = Σ mᵢeᵢ|φᵢ| / Σ mⱼφⱼ²   (unbalances assumed in phase: worst case)
//   For one disc on a light shaft e_m is the disc's own eccentricity and this is the Jeffcott result exactly.
// Not modelled: gyroscopic effects, bearing and support stiffness, bearing damping, higher modes, shear, axial load.
import { beamModel } from './shaft.mjs';

export class RotorError extends Error { constructor(code, message) { super(message); this.code = code; } }
const g = 9.81;

// Lumped masses at stations: shaft (if included) and attached masses [{ x, m, e (mm) }].
function lumped(model, { shaftMass, masses }) {
  const m = new Array(model.xs.length).fill(0), unb = new Array(model.xs.length).fill(0);
  if (shaftMass) model.members.forEach((mem, k) => { const me = model.mat.density * 1e-9 * mem.section.A * (model.xs[k + 1] - model.xs[k]); m[k] += me / 2; m[k + 1] += me / 2; });
  for (const q of masses) { const i = model.node(q.x); m[i] += q.m; unb[i] += q.m * (q.e || 0); }
  return { m, unb };
}
// Static deflection (mm, positive in the load direction) under nodal forces f (N, same direction). The rotor model needs
// several load cases on one stiffness, so it assembles the same Euler–Bernoulli beam elements as the frame solver
// (2 DOF per station: deflection, slope; bearings fix the deflection) and factors the banded matrix once.
function stiffness(model) {
  const N = model.xs.length, n = 2 * N, B = 4, K = Array.from({ length: n }, () => new Float64Array(B));   // K[i][j - i], j ≥ i
  const add = (i, j, v) => { if (j >= i) K[i][j - i] += v; };
  model.members.forEach((mem, k) => {
    const l = model.xs[k + 1] - model.xs[k], EI = model.mat.E * mem.section.I, c = EI / l ** 3;
    const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
    const dof = [2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) add(dof[a], dof[b], c * ke[a][b]);
  });
  const fixed = new Set(model.supports.map(sp => 2 * sp.node));
  for (const i of fixed) { for (let j = 0; j < B; j++) K[i][j] = 0; for (let j = Math.max(0, i - B + 1); j < i; j++) K[j][i - j] = 0; K[i][0] = 1; }
  // banded LDLᵀ (symmetric positive definite once the bearings fix the shaft)
  for (let i = 0; i < n; i++) {
    for (let j = 1; j < B && i + j < n; j++) {
      if (K[i][0] <= 0) throw new RotorError('unstable', 'The shaft can move freely: check the bearings.');
      const f = K[i][j] / K[i][0];
      for (let m = j; m < B && i + m < n; m++) K[i + j][m - j] -= f * K[i][m];
    }
  }
  if (K[n - 1][0] <= 0) throw new RotorError('unstable', 'The shaft can move freely: check the bearings.');
  return { K, n, B, fixed, N };
}
function deflect({ K, n, B, fixed, N }, f) {
  const x = new Float64Array(n);
  f.forEach((F, i) => { if (!fixed.has(2 * i)) x[2 * i] = F; });
  for (let i = 0; i < n; i++) for (let j = 1; j < B && i + j < n; j++) x[i + j] -= K[i][j] / K[i][0] * x[i];
  for (let i = 0; i < n; i++) x[i] /= K[i][0];
  for (let i = n - 1; i >= 0; i--) for (let j = 1; j < B && i + j < n; j++) x[i] -= K[i][j] / K[i][0] * x[i + j];
  return Array.from({ length: N }, (_, i) => x[2 * i]);
}
const rayleigh = (m, y) => { let num = 0, den = 0; m.forEach((mi, i) => { num += mi * g * Math.abs(y[i]) * 1e-3; den += mi * (y[i] * 1e-3) ** 2; }); return Math.sqrt(num / den); };

export function rotor(shaft, { masses = [], shaftMass = true, resolution = 80 } = {}) {
  const model = beamModel(shaft, { resolution });
  const { m, unb } = lumped(model, { shaftMass, masses });
  if (!m.some(v => v > 0)) throw new RotorError('no-mass', 'Nothing rotating has mass: include the shaft\'s own weight or give a load a mass, so a critical speed can be found.');
  const KF = stiffness(model);
  let y = deflect(KF, m.map(v => v * g));
  const scale = Math.max(...y.map(Math.abs));
  const mixed = y.some((v, i) => m[i] > 0 && v < -1e-9 * scale) && y.some((v, i) => m[i] > 0 && v > 1e-9 * scale);
  if (mixed) y = deflect(KF, m.map((v, i) => v * g * Math.sign(y[i] || 1)));
  const omega = rayleigh(m, y);
  // Dunkerley: the shaft alone (Rayleigh on its own mass) plus each attached mass alone.
  const terms = [];
  if (shaftMass) { const s = lumped(model, { shaftMass: true, masses: [] }).m; let ys = deflect(KF, s.map(v => v * g)); if (ys.some(v => v < 0) && ys.some(v => v > 0)) ys = deflect(KF, s.map((v, i) => v * g * Math.sign(ys[i] || 1))); terms.push(rayleigh(s, ys)); }
  for (const q of masses.filter(q => q.m > 0)) { const i = model.node(q.x), f = new Array(model.xs.length).fill(0); f[i] = q.m * g; const d = Math.abs(deflect(KF, f)[i]) * 1e-3; terms.push(d > 0 ? Math.sqrt(g / d) : Infinity); }
  const dunkerley = 1 / Math.sqrt(terms.reduce((a, w) => a + 1 / (w * w), 0));
  const iref = y.reduce((a, v, i) => (Math.abs(v) > Math.abs(y[a]) ? i : a), 0), phi = y.map(v => v / y[iref]);
  const Mm = m.reduce((a, mi, i) => a + mi * phi[i] ** 2, 0), Um = unb.reduce((a, u, i) => a + u * Math.abs(phi[i]), 0);
  return { omega, rpm: omega * 60 / (2 * Math.PI), dunkerley, dunkerleyRpm: dunkerley * 60 / (2 * Math.PI), xref: model.xs[iref], modalMass: Mm, eModal: Um / Mm,
    shape: model.xs.map((x, i) => ({ x, phi: phi[i] })), signCorrected: mixed };
}

// Jeffcott magnification r/e at speed ratio ρ with damping ratio ζ.
export const magnification = (rho, zeta) => rho * rho / Math.sqrt((1 - rho * rho) ** 2 + (2 * zeta * rho) ** 2);
export const rpmToRad = n => n * 2 * Math.PI / 60;
