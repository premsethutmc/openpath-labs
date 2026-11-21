// One-dimensional gas dynamics engine model — the method used by professional engine simulation tools.
//
// Pipes: compressible Euler equations, finite volume, MUSCL reconstruction (minmod), HLL fluxes, Heun (RK2) time
// integration, wall friction (Fanning) and wall heat transfer (Colburn). Pipes join 0D volumes (atmosphere, plenum,
// cylinders, exhaust collector) through compressible-orifice boundaries.
// Cylinders: open-cycle first law with temperature-dependent cv, Wiebe heat release phased for best torque,
// Woschni heat transfer, valve flow from cam lift and discharge coefficients.
// Units: SI. Gas: R = 287 J/kgK; cv(T) = 663 + 0.17·T J/kgK (fit to air/product properties, 300–2500 K).

import { piston } from '../motion/crank.mjs';

export const R = 287;
const cvT = T => 663 + 0.17 * T;
const uOfT = T => 663 * T + 0.085 * T * T;                       // specific internal energy, J/kg
const TofU = u => (-663 + Math.sqrt(663 * 663 + 4 * 0.085 * u)) / (2 * 0.085);
export const gammaAt = T => (cvT(T) + R) / cvT(T);

// ---------------- pipes ----------------
export function makePipe({ L, D, n, T = 300, p = 1e5, gamma = 1.4, wallT = 330, name = '' }) {
  const A = Math.PI * D * D / 4, rho = p / (R * T);
  const U = Array.from({ length: n }, () => [rho, 0, p / (gamma - 1)]);
  return { L, D, A, n, dx: L / n, gamma, wallT, name, U, left: null, right: null };
}
const prim = (q, g) => { const rho = q[0], u = q[1] / rho, p = (g - 1) * (q[2] - 0.5 * rho * u * u); return [rho, u, p]; };
const cons = (w, g) => [w[0], w[0] * w[1], w[2] / (g - 1) + 0.5 * w[0] * w[1] * w[1]];
const flux = (w, g) => { const [rho, u, p] = w, E = p / (g - 1) + 0.5 * rho * u * u; return [rho * u, rho * u * u + p, u * (E + p)]; };
const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);
function hll(wl, wr, g) {
  const cl = Math.sqrt(g * wl[2] / wl[0]), cr = Math.sqrt(g * wr[2] / wr[0]);
  const sl = Math.min(wl[1] - cl, wr[1] - cr), sr = Math.max(wl[1] + cl, wr[1] + cr);
  const fl = flux(wl, g), fr = flux(wr, g);
  if (sl >= 0) return fl;
  if (sr <= 0) return fr;
  const ql = cons(wl, g), qr = cons(wr, g);
  return fl.map((_, k) => (sr * fl[k] - sl * fr[k] + sl * sr * (qr[k] - ql[k])) / (sr - sl));
}

// Advance one pipe by dt with given boundary face fluxes (x-direction) at the left and right ends.
// Second order in space (MUSCL, minmod) and time (Heun). Friction and wall heat transfer unless pipe.inviscid.
export function advancePipe(pp, dt, Fleft, Fright) {
  const g = pp.gamma, n = pp.n, dx = pp.dx;
  if (!pp._buf || pp._buf.n !== n) {
    const mk = () => new Float64Array(n);
    pp._buf = { n, r0: mk(), m0: mk(), e0: mk(), r1: mk(), m1: mk(), e1: mk(), k1r: mk(), k1m: mk(), k1e: mk(), k2r: mk(), k2m: mk(), k2e: mk(),
      W: [mk(), mk(), mk()], Fr: new Float64Array(n + 1), Fm: new Float64Array(n + 1), Fe: new Float64Array(n + 1) };
  }
  const B = pp._buf;
  for (let i = 0; i < n; i++) { B.r0[i] = pp.U[i][0]; B.m0[i] = pp.U[i][1]; B.e0[i] = pp.U[i][2]; }
  const wl = [0, 0, 0], wr = [0, 0, 0], fl = [0, 0, 0], fr = [0, 0, 0];
  const hllInto = (a, b, out, idx) => {
    const cl = Math.sqrt(g * a[2] / a[0]), cr = Math.sqrt(g * b[2] / b[0]);
    const sl = Math.min(a[1] - cl, b[1] - cr), sr = Math.max(a[1] + cl, b[1] + cr);
    const El = a[2] / (g - 1) + 0.5 * a[0] * a[1] * a[1], Er = b[2] / (g - 1) + 0.5 * b[0] * b[1] * b[1];
    fl[0] = a[0] * a[1]; fl[1] = a[0] * a[1] * a[1] + a[2]; fl[2] = a[1] * (El + a[2]);
    fr[0] = b[0] * b[1]; fr[1] = b[0] * b[1] * b[1] + b[2]; fr[2] = b[1] * (Er + b[2]);
    if (sl >= 0) { out.Fr[idx] = fl[0]; out.Fm[idx] = fl[1]; out.Fe[idx] = fl[2]; return; }
    if (sr <= 0) { out.Fr[idx] = fr[0]; out.Fm[idx] = fr[1]; out.Fe[idx] = fr[2]; return; }
    const d = sr - sl;
    out.Fr[idx] = (sr * fl[0] - sl * fr[0] + sl * sr * (b[0] - a[0])) / d;
    out.Fm[idx] = (sr * fl[1] - sl * fr[1] + sl * sr * (b[0] * b[1] - a[0] * a[1])) / d;
    out.Fe[idx] = (sr * fl[2] - sl * fr[2] + sl * sr * (Er - El)) / d;
  };
  const rhs = (r, m, e, kr, km, ke) => {
    const [Wr, Wu, Wp] = B.W;
    for (let i = 0; i < n; i++) { Wr[i] = r[i]; Wu[i] = m[i] / r[i]; Wp[i] = (g - 1) * (e[i] - 0.5 * m[i] * Wu[i]); }
    B.Fr[0] = Fleft[0]; B.Fm[0] = Fleft[1]; B.Fe[0] = Fleft[2];
    B.Fr[n] = Fright[0]; B.Fm[n] = Fright[1]; B.Fe[n] = Fright[2];
    for (let i = 1; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const Wk = B.W[k];
        const sL = i - 1 > 0 ? minmod(Wk[i - 1] - Wk[i - 2], Wk[i] - Wk[i - 1]) : 0;
        const sR = i < n - 1 ? minmod(Wk[i] - Wk[i - 1], Wk[i + 1] - Wk[i]) : 0;
        wl[k] = Wk[i - 1] + 0.5 * sL; wr[k] = Wk[i] - 0.5 * sR;
      }
      if (!(wl[0] > 0 && wl[2] > 0 && wr[0] > 0 && wr[2] > 0)) for (let k = 0; k < 3; k++) { wl[k] = B.W[k][i - 1]; wr[k] = B.W[k][i]; }
      hllInto(wl, wr, B, i);
    }
    for (let i = 0; i < n; i++) {
      kr[i] = -(B.Fr[i + 1] - B.Fr[i]) / dx; km[i] = -(B.Fm[i + 1] - B.Fm[i]) / dx; ke[i] = -(B.Fe[i + 1] - B.Fe[i]) / dx;
      if (!pp.inviscid) {
        const rho = Wr[i], u = Wu[i], T = Wp[i] / (rho * R);
        km[i] -= 2 * 0.0045 * rho * u * Math.abs(u) / pp.D;                                   // Fanning friction
        const Re = rho * Math.abs(u) * pp.D / 3e-5, h = 0.023 * Re ** 0.8 * 0.7 ** 0.4 * 0.04 / pp.D;  // Colburn
        ke[i] += 4 * h * (pp.wallT - T) / pp.D;
      }
    }
  };
  rhs(B.r0, B.m0, B.e0, B.k1r, B.k1m, B.k1e);
  for (let i = 0; i < n; i++) { B.r1[i] = Math.max(B.r0[i] + dt * B.k1r[i], 1e-3); B.m1[i] = B.m0[i] + dt * B.k1m[i]; B.e1[i] = B.e0[i] + dt * B.k1e[i]; }
  rhs(B.r1, B.m1, B.e1, B.k2r, B.k2m, B.k2e);
  const floor = 1e3 * (pp.pFloor ?? 1);
  for (let i = 0; i < n; i++) {
    const r = Math.max(B.r0[i] + 0.5 * dt * (B.k1r[i] + B.k2r[i]), 1e-3), m = B.m0[i] + 0.5 * dt * (B.k1m[i] + B.k2m[i]);
    let E = B.e0[i] + 0.5 * dt * (B.k1e[i] + B.k2e[i]);
    const kin = 0.5 * m * m / r;
    if ((g - 1) * (E - kin) < floor) E = floor / (g - 1) + kin;
    const q = pp.U[i]; q[0] = r; q[1] = m; q[2] = E;
  }
}
export const wallFlux = (pp, end) => { const i = end === 'left' ? 0 : pp.n - 1; const [, , p] = prim(pp.U[i], pp.gamma); return [0, p, 0]; };
export const pipePrim = (pp, i) => prim(pp.U[i], pp.gamma);
export { connect, connectOpen };

// ---------------- compressible orifice ----------------
// Mass flow from an upstream state (p0, T0, γ) through effective area CdA to downstream pressure p.
export function orifice(p0, T0, p, CdA, g) {
  if (CdA <= 0 || p0 <= 0) return 0;
  const pr = Math.max(p / p0, 1e-6), crit = (2 / (g + 1)) ** (g / (g - 1));
  const psi = pr <= crit
    ? Math.sqrt(g * (2 / (g + 1)) ** ((g + 1) / (g - 1)))
    : Math.sqrt(Math.max(0, (2 * g / (g - 1)) * (pr ** (2 / g) - pr ** ((g + 1) / g))));
  return CdA * p0 / Math.sqrt(R * T0) * psi;
}

// ---------------- 0D volumes ----------------
export function makeVolume({ V, p = 1e5, T = 300, fixed = false, name = '' }) {
  const m = p * V / (R * T);
  return { V, m, U: m * uOfT(T), fixed, name, p, T, dm: 0, dU: 0 };
}
function volState(v) { if (v.fixed) return; v.T = TofU(v.U / v.m); v.p = v.m * R * v.T / v.V; }

// A connection between a pipe end and a volume: flow through CdA (function of time for valves).
// Returns mass flow INTO the pipe (positive) and the corresponding face fluxes per unit pipe area.
// Open pipe end into a large volume (plenum, collector, atmosphere): Riemann (HLL) flux between the end cell and a
// ghost state at the volume's pressure and density — this reflects pressure waves correctly (open-end reflection).
function connectOpen(pipe, end, vol) {
  const i = end === 'left' ? 0 : pipe.n - 1, g = pipe.gamma, wc = prim(pipe.U[i], g), u = wc[1];
  const inflow = end === 'left' ? u > 0 : u < 0, cp = g * R / (g - 1);
  let ghost;
  if (inflow) {   // drawn from the volume at its stagnation state: static pressure drops by the dynamic head
    const Tg = Math.max(vol.T - u * u / (2 * cp), 0.5 * vol.T), pg = vol.p * (Tg / vol.T) ** (g / (g - 1));
    ghost = [pg / (R * Tg), u, pg];
  } else {        // discharging: the jet leaves at the volume's pressure
    ghost = [wc[0] * (vol.p / wc[2]) ** (1 / g), u, vol.p];
  }
  const Fx = end === 'left' ? hll(ghost, wc, g) : hll(wc, ghost, g);
  const into = end === 'left' ? [Fx[0], Fx[1], Fx[2]] : [-Fx[0], Fx[1], -Fx[2]];
  const mdot = into[0] * pipe.A;
  return { mdot, h0: mdot !== 0 ? into[2] * pipe.A / mdot : 0, F: into, energy: into[2] * pipe.A };
}

// Valve or restriction: quasi-steady compressible orifice. The flow in one step is limited so it cannot overshoot
// pressure equality with the neighbouring pipe cell (keeps the explicit coupling stable at large valve openings).
function connect(pipe, end, vol, CdA, dt = 0) {
  const i = end === 'left' ? 0 : pipe.n - 1, g = pipe.gamma;
  const [rho, u, p] = prim(pipe.U[i], g), T = p / (rho * R);
  const cpP = g * R / (g - 1), T0pipe = T + u * u / (2 * cpP), p0pipe = p * (T0pipe / T) ** (g / (g - 1));
  let mdot, h0;
  if (vol.p >= p0pipe) { mdot = orifice(vol.p, vol.T, p, CdA, g); h0 = cvT(vol.T) * vol.T + R * vol.T; }
  else { mdot = -orifice(p0pipe, T0pipe, vol.p, CdA, g); h0 = cpP * T0pipe; }
  if (dt > 0) {
    const Vside = Math.min(pipe.A * pipe.dx, vol.fixed ? Infinity : vol.V);
    const cap = 0.5 * Math.abs(vol.p - p) * Vside / (g * R * Math.max(T, 1) * dt);
    if (Math.abs(mdot) > cap) mdot = Math.sign(mdot) * cap;
  }
  // Face fluxes (direction: + into the pipe). Momentum = carried momentum + face pressure. Leaving the pipe, the jet
  // leaves at the receiver's pressure (or the critical pressure if choked); entering, the pipe-side pressure acts.
  const uf = mdot / (Math.max(rho, 1e-6) * pipe.A);
  const pFace = mdot < 0 ? Math.min(p, Math.max(vol.p, p0pipe * (2 / (g + 1)) ** (g / (g - 1)))) : p;
  const F = [mdot / pipe.A, (mdot * uf) / pipe.A + pFace, (mdot * h0) / pipe.A];
  return { mdot, h0, F, energy: mdot * h0 };
}

// ---------------- engine definition ----------------
// Reference: Maruti Suzuki K12M 1.2 L (bore 73 mm, stroke 71.5 mm, 4 valves/cyl). Published: 85 PS at 6000 rpm,
// 113 N·m at 4500 rpm (Maruti Suzuki press release, 2009). Geometry not published (valves, cam timing, pipes,
// rod) uses typical values for this class of engine, listed here so they can be checked and replaced.
export const K12M = {
  name: 'Maruti Suzuki K12M 1.2 L (reference)', cylinders: 4, bore: 0.073, stroke: 0.0715, rod: 0.128, cr: 11.0,
  firing: [0, 540, 180, 360],
  intake: { valves: 2, D: 0.027, lift: 8.3e-3, duration: 240, centre: 108 },
  exhaust: { valves: 2, D: 0.023, lift: 7.8e-3, duration: 236, centre: 112 },
  plenum: 2.2e-3, throttleD: 0.048, runner: { L: 0.34, D: 0.034 }, primary: { L: 0.42, D: 0.034 },
  collector: 0.35e-3, downpipe: { L: 0.35, D: 0.045 }, catalyst: { V: 1.2e-3, D: 0.06 }, tail: { L: 1.3, D: 0.045 }, muffler: { V: 9e-3, outD: 0.042 },
  snorkel: { L: 0.3, D: 0.06 }, airbox: 7e-3,
  wallT: 450, // cylinder wall temperature, K
  burn: { duration: 52, ca50: 8 }, // Wiebe duration (°) and 50 % burn angle after TDC (best-torque phasing)
  cdScale: 1.0,
  // The one calibrated constant: share of fuel energy released as useful heat beyond the modelled wall loss (covers
  // incomplete combustion, crevices, blow-by, knock-limited spark and full-load enrichment). Calibrated ONLY at the
  // published torque point (4500 rpm); the power point (6000 rpm) is then a prediction. See docs/VALIDATION.md.
  conversion: 0.923,
};

const deg = Math.PI / 180;
const cdValve = LD => 0.6 * Math.min(1, LD / 0.27) * (1 - 0.15 * Math.max(0, LD - 0.27)); // poppet valve, rises then saturates
function valveLift(theta, open, dur, L) {
  const x = ((theta - open) % 720 + 720) % 720;
  return x <= dur ? (L / 2) * (1 - Math.cos((2 * Math.PI * x) / dur)) : 0;
}

export function cylVolume(theta, e) {
  const Ap = Math.PI / 4 * e.bore ** 2, Vd = Ap * e.stroke, Vc = Vd / (e.cr - 1);
  return Vc + Ap * piston(theta * deg, e.stroke / 2, e.rod).disp;
}

// Simulate full-throttle operation at one speed until cycle-to-cycle convergence.
export function simulate(rpm, opts = {}) {
  const e = { ...K12M, ...opts.engine };
  const amb = { p: opts.pAmb ?? 1.0e5, T: opts.Tamb ?? 298 };
  const atmIn = makeVolume({ V: 1, p: amb.p, T: amb.T, fixed: true, name: 'air' });
  const atmOut = makeVolume({ V: 1, p: amb.p, T: amb.T, fixed: true, name: 'outside' });
  const plenum = makeVolume({ V: e.plenum, p: amb.p, T: amb.T, name: 'plenum' });
  const coll = makeVolume({ V: e.collector, p: amb.p, T: 700, name: 'collector' });
  const cellsPer = m => Math.max(8, Math.round(m / 0.016));
  const runners = Array.from({ length: e.cylinders }, (_, k) => makePipe({ ...e.runner, n: cellsPer(e.runner.L), gamma: 1.4, wallT: 320, name: `runner ${k + 1}` }));
  const prims = Array.from({ length: e.cylinders }, (_, k) => makePipe({ ...e.primary, n: cellsPer(e.primary.L), T: 800, gamma: 1.33, wallT: 650, name: `primary ${k + 1}` }));
  const down = makePipe({ ...e.downpipe, n: cellsPer(e.downpipe.L), T: 700, gamma: 1.34, wallT: 550, name: 'downpipe' });
  const tail = makePipe({ ...e.tail, n: cellsPer(e.tail.L), T: 600, gamma: 1.34, wallT: 450, name: 'tailpipe' });
  const snorkel = makePipe({ ...e.snorkel, n: cellsPer(e.snorkel.L), gamma: 1.4, wallT: amb.T, name: 'snorkel' });
  const airbox = makeVolume({ V: e.airbox, p: amb.p, T: amb.T, name: 'airbox' });
  const cat = makeVolume({ V: e.catalyst.V, p: amb.p, T: 700, name: 'catalyst' }), muff = makeVolume({ V: e.muffler.V, p: amb.p, T: 500, name: 'muffler' });
  const pipes = [...runners, ...prims, down, tail, snorkel];
  const cyls = e.firing.slice(0, e.cylinders).map(f => makeVolume({ V: cylVolume(((-f) % 720 + 720) % 720, e), p: amb.p, T: 900 }));
  const Ap = Math.PI / 4 * e.bore ** 2, Vd = Ap * e.stroke, Sp = 2 * e.stroke * rpm / 60;
  const w = rpm * 2 * Math.PI / 60;
  const throttleA = Math.PI / 4 * e.throttleD ** 2 * 0.9;
  const ivo = 360 + e.intake.centre - e.intake.duration / 2, evo = 360 - e.exhaust.centre - e.exhaust.duration / 2;
  const ivc = ivo + e.intake.duration;
  const LHV = 43.5e6, afr = 14.7, etaComb = 0.96;
  const burnStart = e.burn.ca50 - e.burn.duration * Math.pow(Math.log(2) / 5, 1 / 3);  // Wiebe a=5, m=2
  const wiebe = th => { const x = (th - burnStart) / e.burn.duration; return x <= 0 ? 0 : 1 - Math.exp(-5 * x ** 3); };
  const cyc = cyls.map(() => ({ trapped: 0, fuel: 0, work: 0, pIVC: 1e5, VIVC: cylVolume(180, e), TIVC: 300, airIn: 0, airThisCycle: 0 }));
  let theta = 0, cycles = 0, last = null, history = [];
  const maxCycles = opts.maxCycles ?? 14;
  const traces = { cyl: [], runner: [], theta: [] };
  const dxMin = Math.min(...pipes.map(p => p.dx));
  // per-cycle accumulators
  const done = () => last && history.length >= 3 && Math.abs(history.at(-1).ve - history.at(-2).ve) < 0.004 && Math.abs(history.at(-1).imep - history.at(-2).imep) / Math.abs(history.at(-1).imep) < 0.005;

  while (cycles < maxCycles && !done()) {
    // ---- time step from CFL ----
    let smax = 1;
    for (const pp of pipes) for (const q of pp.U) { const [rho, u, p] = prim(q, pp.gamma); smax = Math.max(smax, Math.abs(u) + Math.sqrt(pp.gamma * p / rho)); }
    let dt = 0.7 * dxMin / smax;
    dt = Math.min(dt, (0.5 * deg) / w);
    const dth = dt * w / deg;

    // ---- valve areas and connection fluxes (evaluated once per step, explicit) ----
    const conns = [];
    for (let k = 0; k < e.cylinders; k++) {
      const ph = ((theta - e.firing[k]) % 720 + 720) % 720;
      const Li = valveLift(ph, ivo, e.intake.duration, e.intake.lift), Le = valveLift(ph, evo, e.exhaust.duration, e.exhaust.lift);
      const Ai = e.intake.valves * Math.PI * e.intake.D * Li * cdValve(Li / e.intake.D) * e.cdScale;
      const Ae = e.exhaust.valves * Math.PI * e.exhaust.D * Le * cdValve(Le / e.exhaust.D) * e.cdScale;
      conns.push([runners[k], 'left', plenum, 'open'], [runners[k], 'right', cyls[k], Ai], [prims[k], 'left', cyls[k], Ae], [prims[k], 'right', coll, 'open']);
    }
    const catA = Math.PI / 4 * e.catalyst.D ** 2 * 0.8, mufA = Math.PI / 4 * e.muffler.outD ** 2 * 0.85;
    conns.push([down, 'left', coll, 'open'], [down, 'right', cat, catA], [tail, 'left', cat, catA], [tail, 'right', muff, 'open'],
      [snorkel, 'left', atmIn, 'open'], [snorkel, 'right', airbox, 'open']);
    for (const v of [plenum, coll, airbox, cat, muff, ...cyls]) { v.dm = 0; v.dU = 0; }
    // muffler → outside through its outlet
    const mOut = muff.p > atmOut.p ? orifice(muff.p, muff.T, atmOut.p, mufA, 1.35) : -orifice(atmOut.p, atmOut.T, muff.p, mufA, 1.35);
    muff.dm -= mOut; muff.dU -= mOut * (mOut > 0 ? (cvT(muff.T) + R) * muff.T : (cvT(atmOut.T) + R) * atmOut.T);
    const bfl = new Map();
    for (const [pp, end, vol, CdA] of conns) {
      const c = CdA === 'open' ? connectOpen(pp, end, vol) : connect(pp, end, vol, CdA, dt);
      bfl.set(pp.name + end, c.F);
      vol.dm -= c.mdot; vol.dU -= c.energy;
    }
    // throttle: atmosphere → plenum
    const mThr = plenum.p < airbox.p ? orifice(airbox.p, airbox.T, plenum.p, throttleA, 1.4) : -orifice(plenum.p, plenum.T, airbox.p, throttleA, 1.4);
    const hThr = mThr * (mThr > 0 ? (cvT(airbox.T) + R) * airbox.T : (cvT(plenum.T) + R) * plenum.T);
    plenum.dm += mThr; plenum.dU += hThr; airbox.dm -= mThr; airbox.dU -= hThr;

    // ---- pipes: RK2 with MUSCL-HLL; boundary faces from the orifice fluxes ----
    for (const pp of pipes) {
      const Fr = bfl.get(pp.name + 'right');
      advancePipe(pp, dt, bfl.get(pp.name + 'left'), [-Fr[0], Fr[1], -Fr[2]]);
    }

    // ---- cylinders: piston work, combustion, Woschni heat transfer ----
    for (let k = 0; k < e.cylinders; k++) {
      const c = cyls[k], s = cyc[k];
      const ph = ((theta - e.firing[k]) % 720 + 720) % 720, ph2 = ph + dth;
      const V1 = cylVolume(ph, e), V2 = cylVolume(ph2, e);
      // intake valve closing: trap the charge, add fuel for λ = 1
      if (ph < ivc % 720 && ph2 >= ivc % 720) {
        s.trapped = c.m; s.fuel = s.airThisCycle / afr; s.pIVC = c.p; s.VIVC = V1; s.TIVC = c.T;
        c.m += s.fuel; c.U += s.fuel * uOfT(c.T);
        s.airIn = s.airThisCycle; s.airThisCycle = 0;
      }
      const thc = ph > 360 ? ph - 720 : ph, thc2 = thc + dth;
      const dQ = (thc > -90 && thc < 120) ? s.fuel * LHV * etaComb * e.conversion * (wiebe(thc2) - wiebe(thc)) : 0;
      // Woschni
      const area = 2 * Ap * 1.15 + Math.PI * e.bore * (V1 - cylVolume(0, e)) / Ap + Math.PI * e.bore * 0.004;
      const gasExchange = !(thc > -150 && thc < 140);
      const pmot = s.pIVC * (s.VIVC / V1) ** 1.32;
      const wv = (gasExchange ? 6.18 : 2.28) * Sp + (gasExchange ? 0 : 3.24e-3 * (Vd * s.TIVC / (s.pIVC * s.VIVC)) * Math.max(0, c.p - pmot));
      const hW = 3.26 * e.bore ** -0.2 * (c.p / 1000) ** 0.8 * c.T ** -0.55 * wv ** 0.8;
      const Qw = hW * area * (c.T - e.wallT) * dt;
      c.U += c.dU * dt + dQ - Qw - c.p * (V2 - V1);
      c.m += c.dm * dt;
      // count fresh air entering this cylinder during intake (flow from runner side)
      s.airThisCycle += -bflMass(bfl, runners[k]) * dt;   // net fresh charge through the inlet valve (backflow subtracted)
      s.work += c.p * (V2 - V1);
      c.V = V2;
      c.m = Math.max(c.m, 1e-7);
      volState(c);
      if (k === 0) { traces.theta.push(ph2); traces.cyl.push(c.p); const [, , pr] = prim(runners[0].U[runners[0].n - 2], 1.4); traces.runner.push(pr); }
    }
    for (const v of [plenum, coll, airbox, cat, muff]) { v.U += v.dU * dt; v.m += v.dm * dt; v.m = Math.max(v.m, 1e-7); volState(v); }

    const before = theta;
    theta += dth;
    if (Math.floor(theta / 720) > Math.floor(before / 720)) {
      cycles++;
      const air = cyc.reduce((a, s) => a + (s.airIn || 0), 0) / e.cylinders;
      const work = cyc.reduce((a, s) => a + s.work, 0) / e.cylinders;
      cyc.forEach(s => { s.work = 0; });
      const ve = air / (amb.p / (R * amb.T) * Vd);
      last = { ve, imep: work / Vd, air };
      history.push(last);
      if (!done()) { traces.cyl.length = 0; traces.runner.length = 0; traces.theta.length = 0; }
    }
  }
  const fmep = frictionMEP(rpm, e);
  const bmep = last.imep - fmep;
  const torque = bmep * Vd * e.cylinders / (4 * Math.PI);
  return { rpm, ve: last.ve, imep: last.imep, fmep, bmep, torque, power: torque * w, cycles, converged: done(), history, traces };
}
function bflMass(bfl, runner) { return bfl.get(runner.name + 'right')[0] * runner.A; } // + = into the runner from the cylinder

// Friction: Chen–Flynn with warm oil (same correlation as the fast model, calibrated constant below).
export function frictionMEP(rpm, e = K12M) {
  const Sp = 2 * e.stroke * rpm / 60;
  return (0.3 + 0.006 * 60 + 0.09 * Sp + 0.0007 * Sp * Sp) * 1e5;
}

// Published reference points used for validation.
export const K12M_PUBLISHED = { power: { rpm: 6000, kW: 62.5 }, torque: { rpm: 4500, Nm: 113 }, source: 'Maruti Suzuki press release, 14 April 2009 (85 PS @ 6000 rpm, 113 N·m @ 4500 rpm)' };
