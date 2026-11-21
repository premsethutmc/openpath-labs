// Reference engine: system-level model of a 1.2 L four-cylinder petrol engine, the kind used to teach
// engine principles (Heywood, "Internal Combustion Engine Fundamentals"). SI units unless noted.
// Each result carries a confidence band: 'reliable' (textbook physics / standards), 'approximate'
// (published correlations, right trend and ballpark), 'assumption' (a visible, learner-adjustable input).

import { piston, meanPistonSpeed } from '../motion/crank.mjs';
import { viscosity } from './oil.mjs';

export const ENGINE = {
  name: '1.2 L inline-four petrol (reference)',
  cylinders: 4, bore: 0.073, stroke: 0.0716, rod: 0.128, cr: 10.5,
  firing: [0, 540, 180, 360], // when each cylinder (1–4) fires in the 720° cycle: firing order 1-3-4-2
  mainBearing: { D: 0.045, L: 0.018, c: 25e-6 }, rodBearing: { D: 0.040, L: 0.017, c: 25e-6 },
  roughness: 0.5e-6, // composite surface roughness of journal and shell (m)
  mass: 90, heatCapacity: 50e3, // J/K, block + oil + coolant lumped
  oilLitres: 3.5, gallery: 0.15e-3, pumpPerRev: 10e-6, // m³
  starter: { stallTorque: 120, noLoadRpm: 300 }, // referred to the crankshaft, healthy battery at 25 °C
  startRpm: 80, // minimum steady cranking speed for a petrol engine to fire (typical 60–100 rpm)
};
export const swept = (e = ENGINE) => (Math.PI / 4) * e.bore ** 2 * e.stroke;            // per cylinder, m³
export const displacement = (e = ENGINE) => swept(e) * e.cylinders;

export function cylinderVolume(theta, e = ENGINE) {
  const Vc = swept(e) / (e.cr - 1), r = e.stroke / 2;
  return Vc + (Math.PI / 4) * e.bore ** 2 * piston(theta, r, e.rod).disp;
}

// ---------------- closed-cycle model (compression → combustion → expansion) ----------------
// First law for the cylinder gas: dp/dθ = −γ·p/V·dV/dθ + (γ−1)/V·dQ/dθ, with a Wiebe burn curve.
// Wall heat loss is a fixed fraction of fuel energy (labelled simplification); γ constant (air-standard-like).
export function cycle({ rpm = 3000, manifold = 1.0, ignition = -15, burn = 50, gamma = 1.33, wallLoss = 0.22, instant = false } = {}, e = ENGINE) {
  const R = 287, T1 = 320, p1 = manifold * 1e5, LHV = 44e6, afr = 14.7, etaComb = 0.95;
  const deg = Math.PI / 180, V1 = cylinderVolume(-Math.PI, e);
  const air = (p1 * V1) / (R * T1) * 0.92;                     // trapped air with residual gas, kg
  const Qin = (air / afr) * LHV * etaComb * (1 - wallLoss);
  const wiebe = th => { if (instant) return th >= 0 ? 1 : 0; const x = (th - ignition) / burn; return x <= 0 ? 0 : 1 - Math.exp(-5 * x ** 3); };
  let p = p1, work = 0, pmax = p1, thPmax = 0;
  const trace = [];
  const step = 0.25;
  for (let th = -180; th < 180; th += step) {
    const a = th * deg, b = (th + step) * deg, Va = cylinderVolume(a, e), Vb = cylinderVolume(b, e), dV = Vb - Va;
    const dQ = Qin * (wiebe(th + step) - wiebe(th));
    const Vm = (Va + Vb) / 2;
    const dp = -gamma * p / Vm * dV + (gamma - 1) / Vm * dQ;
    const pNew = p + dp;
    work += ((p + pNew) / 2) * dV;
    p = pNew;
    if (p > pmax) { pmax = p; thPmax = th + step; }
    if (Math.round(th * 4) % 8 === 0) trace.push({ theta: th, V: Va, p });
  }
  const imep = work / swept(e);
  const pmep = Math.max(0, 1.05e5 - p1) + 0.25e5 * (rpm / 6000) ** 2;  // throttling + valve flow losses (approx.)
  return { imep, pmep, pmax, thPmax, trace, work, Qfuel: (air / afr) * LHV, air, etaIndicated: work / ((air / afr) * LHV) };
}

export const ottoEfficiency = (cr, gamma = 1.4) => 1 - cr ** (1 - gamma);

// ---------------- friction ----------------
// Chen–Flynn correlation FMEP = C + A·p_max + (B·S_p + D·S_p²)·(μ/μ_ref)^0.6.
// The speed terms are viscous (hydrodynamic) friction, scaled with oil viscosity; the exponent < 1 because
// part of engine friction is mixed/boundary. APPROXIMATE.
export const MU_REF = 9; // mPa·s, a 5W-30 at about 95 °C
export function fmep(rpm, pmaxPa, muOil, e = ENGINE) {
  const Sp = meanPistonSpeed(e.stroke, rpm), pmaxBar = pmaxPa / 1e5;
  const viscous = (0.08 * Sp + 0.0006 * Sp * Sp) * (muOil / MU_REF) ** 0.6;
  return (0.25 + 0.006 * pmaxBar + viscous) * 1e5;
}

// ---------------- running engine at a steady operating point ----------------
export function operatingPoint({ rpm, throttle, oil, oilTemp }, e = ENGINE) {
  const manifold = 0.3 + 0.7 * throttle;
  const c = cycle({ rpm, manifold }, e);
  const v = viscosity(oil, oilTemp);
  const f = v.gelled ? Infinity : fmep(rpm, c.pmax, v.mu, e);
  const bmep = c.imep - c.pmep - f;
  const Vd = displacement(e);
  const torque = (bmep * Vd) / (4 * Math.PI);
  const power = torque * rpm * 2 * Math.PI / 60;
  const fuelPower = c.Qfuel * e.cylinders * rpm / 120;
  const frictionPower = (f * Vd / (4 * Math.PI)) * rpm * 2 * Math.PI / 60;
  return { ...c, rpm, throttle, manifold, fmep: f, bmep, torque, power, fuelPower, frictionPower, efficiency: power / fuelPower, oil: v };
}

// ---------------- journal bearing (Ocvirk short-bearing solution of the Reynolds equation) ----------------
// W = (μ·U·L³ / 4c²) · ε/(1−ε²)² · √(π²(1−ε²) + 16ε²); h_min = c(1−ε). Steady-load approximation:
// real crank bearings are dynamically loaded (squeeze film helps), so this is a conservative trend. APPROXIMATE.
export function ocvirkLoad(eps, mu, U, b) {
  return (mu * U * b.L ** 3 / (4 * b.c ** 2)) * eps / (1 - eps * eps) ** 2 * Math.sqrt(Math.PI ** 2 * (1 - eps * eps) + 16 * eps * eps);
}
export function bearing({ load, rpm, muCp, b = ENGINE.rodBearing, roughness = ENGINE.roughness }) {
  const mu = muCp / 1000, U = (rpm * 2 * Math.PI / 60) * b.D / 2;
  let lo = 0, hi = 0.999999;
  if (U <= 0 || mu <= 0) return { eps: 1, hmin: 0, lambda: 0, regime: 'boundary' };
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (ocvirkLoad(mid, mu, U, b) < load) lo = mid; else hi = mid; }
  const eps = (lo + hi) / 2, hmin = b.c * (1 - eps), lambda = hmin / roughness;
  return { eps, hmin, lambda, regime: lambda >= 3 ? 'full film' : lambda >= 1 ? 'mixed' : 'boundary' };
}
// Peak rod-bearing load from gas force minus reciprocating inertia at TDC (approx. piston + rod mass 0.45 kg).
export function rodLoad(op, e = ENGINE) {
  const A = Math.PI / 4 * e.bore ** 2, w = op.rpm * 2 * Math.PI / 60, r = e.stroke / 2;
  const inertia = 0.45 * r * w * w * (1 + r / e.rod);
  return Math.max(op.pmax * A - inertia, inertia * 0.6);
}

// ---------------- cold start ----------------
// Battery: share of cranking power left at temperature (typical lead-acid chart). APPROXIMATE.
const BATTERY = [[-40, 0.2], [-35, 0.25], [-30, 0.3], [-18, 0.4], [0, 0.65], [27, 1], [60, 1]];
export function batteryFactor(T) {
  for (let i = 1; i < BATTERY.length; i++) if (T <= BATTERY[i][0]) {
    const [t0, f0] = BATTERY[i - 1], [t1, f1] = BATTERY[i];
    return f0 + (f1 - f0) * (Math.max(T, t0) - t0) / (t1 - t0);
  }
  return 1;
}
// Resistance while cranking: T = T0 + k·μ·ω (hydrodynamic drag grows with viscosity and speed).
// k is calibrated so an oil exactly at its SAE J300 cold-cranking limit, with the battery at that
// temperature, cranks at about 100 rpm — which is what the J300 limits are designed for.
export const CRANK = { T0: 15, k: 0.13 };
export function cranking({ oil, T, batteryHealth = 1 }, e = ENGINE) {
  const v = viscosity(oil, T);
  const f = batteryFactor(T) * batteryHealth, Ts = e.starter.stallTorque * f, w0 = e.starter.noLoadRpm * 2 * Math.PI / 60;
  if (v.gelled) return { rpm: 0, starts: false, reason: 'gelled', oil: v, battery: f };
  const w = (Ts - CRANK.T0) / (Ts / w0 + CRANK.k * v.mu / 1000);
  const rpm = Math.max(0, (w * 60) / (2 * Math.PI));
  const starts = rpm >= e.startRpm;
  return { rpm, starts, reason: starts ? 'ok' : rpm <= 1 ? 'no-turn' : 'too-slow', oil: v, battery: f };
}

// Seconds until oil reaches the bearings after start: the gallery must refill. Flow is the smaller of the
// pump's displacement and what the suction pipe can draw (Hagen–Poiseuille, ΔP ≈ 0.7 bar). APPROXIMATE.
export function oilPressureDelay({ oil, T, rpm = 1000 }, e = ENGINE) {
  const v = viscosity(oil, T);
  if (v.gelled) return { seconds: Infinity, oil: v, limitedBy: 'gelled' };
  const pump = e.pumpPerRev * rpm / 60 * 0.9;
  const suction = (0.7e5 * Math.PI * 0.006 ** 4) / (8 * (v.mu / 1000) * 0.25);
  const q = Math.min(pump, suction);
  return { seconds: e.gallery / q, flow: q, limitedBy: suction < pump ? 'suction' : 'pump', oil: v };
}

// ---------------- temperatures ----------------
// Parked engine cools towards ambient exponentially (Newton's law), time constant ≈ 3 h. RELIABLE trend.
export const soak = (Tstart, Tamb, hours, tau = 3) => Tamb + (Tstart - Tamb) * Math.exp(-hours / tau);
// Warm-up at idle: ~25 % of fuel energy heats the engine; the thermostat holds 90 °C. APPROXIMATE.
export function warmUp(T0, Tamb, seconds, heatW = 5000, e = ENGINE) {
  const h = 25; // W/K loss to surroundings while closed thermostat
  let T = T0;
  for (let t = 0; t < seconds; t++) { T += (heatW - h * (T - Tamb)) / e.heatCapacity; if (T >= 90) return { T: 90, reached: t }; }
  return { T, reached: null };
}

// Relative wear index for one cold start (trend only): dry seconds × boundary contact. ASSUMPTION-level.
export const startWear = (delay, regimeAfter) => Math.min(100, delay * 4 + (regimeAfter === 'boundary' ? 30 : regimeAfter === 'mixed' ? 10 : 0));
