// Pipe-flow and centrifugal-pump engine (steady, incompressible, one-dimensional).
// Water properties: Thiesen density, Vogel viscosity, Antoine vapour pressure (1–100 °C).
// Pipe friction: laminar 64/Re; turbulent Colebrook–White; 2000–4000 blended and flagged as uncertain.
// Pump: Euler turbomachine equation with Wiesner slip, friction and incidence ("shock") losses,
// leakage, disk friction and bearing losses; NPSH required by the Pfleiderer eye model.
export const G = 9.81;

// ---------- water ----------
export const water = T => {
  const rho = 1000 * (1 - ((T + 288.9414) / (508929.2 * (T + 68.12963))) * (T - 3.9863) ** 2);
  const mu = 2.414e-5 * 10 ** (247.8 / (T + 273.15 - 140));
  const pv = 133.322 * 10 ** (8.07131 - 1730.63 / (233.426 + T));
  return { rho, mu, nu: mu / rho, pv };
};
export const atmPressure = altitude => 101325 * (1 - 2.25577e-5 * altitude) ** 5.25588;

// ---------- pipes ----------
export const MATERIALS = {
  pvc: { name: 'PVC (new)', eps: 0.0015e-3 },
  steel: { name: 'Commercial steel (new)', eps: 0.045e-3 },
  gi: { name: 'Galvanised iron (new)', eps: 0.15e-3 },
  ci: { name: 'Cast iron', eps: 0.26e-3 },
  oldgi: { name: 'Galvanised iron, 15 years, rusted', eps: 1.5e-3 },
};
export const colebrook = (Re, rr) => {
  let f = 0.25 / Math.log10(rr / 3.7 + 5.74 / Re ** 0.9) ** 2;   // Swamee–Jain start
  for (let i = 0; i < 30; i++) { const n = (-2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(f)))) ** -2; if (Math.abs(n - f) < 1e-12) return n; f = n; }
  return f;
};
export function friction(Re, rr) {
  if (Re <= 0) return { f: 0, regime: 'none' };
  if (Re < 2000) return { f: 64 / Re, regime: 'laminar' };
  if (Re > 4000) return { f: colebrook(Re, rr), regime: 'turbulent' };
  const z = (Re - 2000) / 2000;
  return { f: (1 - z) * 0.032 + z * colebrook(4000, rr), regime: 'transitional' };
}
// Gate valve loss coefficient vs fraction open (Crane TP-410 typical values), log-interpolated.
const GATE = [[1, 0.15], [0.75, 1.15], [0.5, 5.6], [0.25, 24], [0.1, 200], [0.03, 3000]];
export const gateK = open => {
  if (open >= 1) return 0.15; if (open <= 0.03) return 3000 * (0.03 / Math.max(open, 1e-4)) ** 2;
  for (let i = 1; i < GATE.length; i++) if (open >= GATE[i][0]) { const [a, ka] = GATE[i - 1], [b, kb] = GATE[i], z = (open - a) / (b - a); return Math.exp(Math.log(ka) + z * (Math.log(kb) - Math.log(ka))); }
};
export const FITTINGS = { entrance: 0.5, footValve: 5, elbow: 0.75, checkValve: 2, exit: 1 };

export function pipeLoss(Q, pipe, w) {
  const A = Math.PI * pipe.D ** 2 / 4, V = Q / A, Re = V * pipe.D / w.nu;
  const { f, regime } = friction(Re, MATERIALS[pipe.material].eps / pipe.D);
  const vh = V * V / (2 * G);
  return { V, Re, f, regime, hf: f * pipe.L / pipe.D * vh, hm: pipe.K * vh, vh };
}

// ---------- centrifugal pump ----------
export const STOCK_PUMP = {
  name: 'Monoblock centrifugal pump (model)', rpm: 2900,
  D2: 0.13, b2: 0.0065, beta2: 25, Z: 6,        // impeller outlet: diameter, width, blade angle (deg), blades
  D1: 0.05, b1: 0.012, beta1: 16, eye: 0.05, hub: 0.018,
  kf: 0.14, ks: 0.22,                            // friction and shock loss factors (× u2²/2g at design flow)
  leak: 0.04, disk: 1.6e-4, bearing: 45,         // leakage fraction, disk-friction coefficient, bearing loss (W)
};
export function pumpAt(Q, p, w) {
  const n = p.rpm / 60, u2 = Math.PI * p.D2 * n, u1 = Math.PI * p.D1 * n;
  const Qd = Math.PI * p.D1 * p.b1 * u1 * Math.tan(p.beta1 * Math.PI / 180);
  const Ql = p.leak * Qd, Qi = Q + Ql;
  const b2 = p.beta2 * Math.PI / 180, slip = 1 - Math.sqrt(Math.sin(b2)) / p.Z ** 0.7;
  const cm2 = Qi / (Math.PI * p.D2 * p.b2), cu2 = slip * u2 - cm2 / Math.tan(b2);
  const Hth = u2 * cu2 / G;
  const scale = u2 * u2 / (2 * G);
  const loss = p.kf * scale * (Qi / Qd) ** 2 + p.ks * scale * ((Qi - Qd) / Qd) ** 2;
  const H = Hth - loss;
  const Phyd = w.rho * G * Qi * Math.max(Hth, 0), Pdisk = p.disk * w.rho * n ** 3 * p.D2 ** 5 * 1e3, Pshaft = Phyd + Pdisk + p.bearing * (p.rpm / 2900);
  const eff = Q > 0 && H > 0 ? w.rho * G * Q * H / Pshaft : 0;
  const Aeye = Math.PI / 4 * (p.eye ** 2 - p.hub ** 2), c1 = Qi / Aeye, ueye = Math.PI * p.eye * n;
  const off = 1 + 1.5 * ((Qi - Qd) / Qd) ** 2;
  const npshr = off * (1.2 * c1 * c1 + 0.25 * (c1 * c1 + ueye * ueye)) / (2 * G);
  return { Q, H, Hth, Pshaft, eff, npshr, Qd, u2, cm2, cu2, cu2inf: u2 - cm2 / Math.tan(b2), slip, Ql };
}
// combined curve for one / two in parallel / two in series
export function arrangedHead(Q, p, w, arr) {
  if (arr === 'parallel') { const r = pumpAt(Q / 2, p, w); return { ...r, Q, H: r.H, Pshaft: 2 * r.Pshaft, each: Q / 2 }; }
  if (arr === 'series') { const r = pumpAt(Q, p, w); return { ...r, H: 2 * r.H, Pshaft: 2 * r.Pshaft, each: Q }; }
  return { ...pumpAt(Q, p, w), each: Q };
}

// ---------- the installation ----------
export const STOCK_SYSTEM = {
  temp: 30, altitude: 0,
  sumpLevel: -2.5,        // water surface relative to pump centreline (m); negative = pump sits above water (suction lift)
  tankHeight: 18,         // overhead-tank water surface above pump centreline (m)
  suction: { D: 0.05, L: 4, material: 'gi', elbows: 1 },
  delivery: { D: 0.04, L: 30, material: 'gi', elbows: 4 },
  valveOpen: 1, arrangement: 'single', tankVolume: 10000,
};
const pipesOf = s => ({
  suction: { ...s.suction, K: FITTINGS.footValve + s.suction.elbows * FITTINGS.elbow },
  delivery: { ...s.delivery, K: FITTINGS.checkValve + s.delivery.elbows * FITTINGS.elbow + gateK(s.valveOpen) + FITTINGS.exit },
});
export function systemHead(Q, s, w) {
  const P = pipesOf(s), a = pipeLoss(Q, P.suction, w), b = pipeLoss(Q, P.delivery, w);
  return { H: s.tankHeight - s.sumpLevel + a.hf + a.hm + b.hf + b.hm, suction: a, delivery: b };
}

export function operate(s = STOCK_SYSTEM, pump = STOCK_PUMP) {
  const w = water(s.temp), patm = atmPressure(s.altitude), arr = s.arrangement || 'single';
  const net = Q => arrangedHead(Q, pump, w, arr).H - systemHead(Q, s, w).H;
  let hi = 0.001; while (arrangedHead(hi, pump, w, arr).H > 0 && hi < 1) hi *= 1.5;
  let Q = 0;
  if (net(1e-7) > 0) { let lo = 1e-7; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (net(m) > 0) lo = m; else hi = m; } Q = (lo + hi) / 2; }
  const pmp = arrangedHead(Q, pump, w, arr), sys = systemHead(Q, s, w);
  const sa = sys.suction, de = sys.delivery;
  // NPSH available at the pump inlet (per pump in parallel the suction is shared here: same pipe)
  const npsha = (patm - w.pv) / (w.rho * G) + s.sumpLevel - sa.hf - sa.hm;
  const firstPump = pumpAt(pmp.each, pump, w);
  const npshr = firstPump.npshr;
  const inletGauge = w.rho * G * (s.sumpLevel - sa.hf - sa.hm - sa.vh);       // Pa, relative to atmosphere
  const outletGauge = inletGauge + w.rho * G * pmp.H;                   // equal pipe velocities assumed at flanges
  return {
    Q, H: pmp.H, power: pmp.Pshaft, eff: Q > 0 ? w.rho * G * Q * pmp.H / pmp.Pshaft : 0,
    staticHead: s.tankHeight - s.sumpLevel, suction: sa, delivery: de, npsha, npshr, cavitating: Q > 0 && npsha < npshr,
    inletGauge, outletGauge, water: w, patm, pump: firstPump, arrangement: arr,
    fillMinutes: Q > 0 ? s.tankVolume / 1000 / Q / 60 : Infinity, noFlow: Q === 0,
    bep: bestEfficiency(pump, w),
  };
}
export function bestEfficiency(p, w) {
  let best = { eff: 0 }; const Qd = pumpAt(0.001, p, w).Qd;
  for (let i = 1; i <= 200; i++) { const r = pumpAt(Qd * 2 * i / 200, p, w); if (r.eff > best.eff) best = r; }
  return best;
}
// energy and hydraulic grade lines along the flow path, for drawing
export function gradeLines(s, op) {
  const sa = op.suction, de = op.delivery, z0 = s.sumpLevel, pts = [];
  const push = (x, z, egl, label) => pts.push({ x, z, egl, hgl: egl - (label === 'sump' || label === 'tank' ? 0 : x <= s.suction.L ? sa.vh : de.vh), label });
  push(0, z0, z0, 'sump');
  let e = z0 - FITTINGS.footValve * sa.vh; push(0.01, z0, e, 'foot valve');
  e -= sa.hf + s.suction.elbows * FITTINGS.elbow * sa.vh; push(s.suction.L, 0, e, 'pump inlet');
  e += op.H; push(s.suction.L + 0.01, 0, e, 'pump outlet');
  e -= FITTINGS.checkValve * de.vh + gateK(s.valveOpen) * de.vh; push(s.suction.L + 0.5, 0.2, e, 'valves');
  e -= de.hf + s.delivery.elbows * FITTINGS.elbow * de.vh; push(s.suction.L + s.delivery.L, s.tankHeight, e, 'pipe end');
  e -= FITTINGS.exit * de.vh; pts.push({ x: s.suction.L + s.delivery.L + 0.01, z: s.tankHeight, egl: e, hgl: e, label: 'tank' });
  return pts;
}
