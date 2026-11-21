// Spark timing, fuel octane, mixture strength and turbocharging — the inputs to the cylinder model.
import { operatingPoint } from './engine.mjs';

export const FUELS = {
  91: { ron: 91, name: 'Regular (RON 91)' },
  95: { ron: 95, name: 'Premium (RON 95)' },
  100: { ron: 100, name: 'Racing / 100 octane' },
};
export const INTERCOOLERS = { none: { name: 'None', eff: 0 }, basic: { name: 'Basic', eff: 0.55 }, good: { name: 'Large', eff: 0.8 } };

// Turbocharger at full throttle. Compressor outlet temperature from the isentropic relation with 72 % efficiency
// (RELIABLE thermodynamics); boost build-up with engine speed (turbo lag) and turbine back-pressure are APPROXIMATE.
export function turbo({ target, rpm, intercooler = 'basic', ambientC = 30 }) {
  const Tamb = ambientC + 273.15;
  if (!target) return { boost: 0, PR: 1, Tcomp: Tamb, T1: Tamb + 15, pExhaust: 1.05e5 };
  const x = Math.max(0, Math.min(1, (rpm - 1500) / 2000));
  const boost = target * x * x * (3 - 2 * x);                  // smooth spool-up between 1500 and 3500 rpm
  const PR = 1 + boost, Tcomp = Tamb * (1 + (PR ** (0.4 / 1.4) - 1) / 0.72);
  const Tafter = Tcomp - INTERCOOLERS[intercooler].eff * (Tcomp - Tamb);
  return { boost, PR, Tcomp, T1: Tafter + 15, pExhaust: (1.05 + 0.85 * boost) * 1e5 };   // +15 K picked up from the hot head
}

// Sweep spark advance at one operating point: torque curve, best-torque timing (MBT) and the knock limit.
export function sparkSweep(base, from = 0, to = 45, step = 1) {
  const pts = [];
  for (let adv = from; adv <= to; adv += step) {
    const op = operatingPoint({ ...base, ignition: -adv });
    pts.push({ adv, torque: op.torque, knock: op.knock, intensity: op.knockIntensity });
  }
  const mbt = pts.reduce((a, b) => (b.torque > a.torque ? b : a));
  const safe = pts.filter(p => !p.knock);
  const knockLimit = safe.length ? safe.reduce((a, b) => (b.adv > a.adv ? b : a)).adv : null;
  return { pts, mbt: mbt.adv, knockLimit };
}

// Timing an engine computer would use: best torque, but never past the knock limit (knock sensor on).
export function ecuTiming(base) {
  const s = sparkSweep(base, 0, 45, 1);
  return { ...s, timing: s.knockLimit === null ? 0 : Math.min(s.mbt, s.knockLimit) };
}

// Exhaust emissions trend with mixture (qualitative, 0–1). Shapes follow textbook curves; ASSUMPTION-level values.
export function emissionsTrend(lambda) {
  const co = Math.max(0.03, Math.min(1, (1.02 - lambda) * 4 + 0.05));
  const hc = Math.min(1, 0.15 + Math.max(0, 1 - lambda) * 2 + Math.max(0, lambda - 1.25) * 3);
  const nox = Math.max(0.05, Math.exp(-(((lambda - 1.08) / 0.13) ** 2)));
  const cat = Math.abs(lambda - 1) < 0.02;                       // a three-way catalyst only works close to λ = 1
  return { co, hc, nox, cat };
}
