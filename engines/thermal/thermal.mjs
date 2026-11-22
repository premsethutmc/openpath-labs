// Steady heat transfer along ONE heat path: a series thermal-resistance network, with parallel layers inside a
// plane layer, convection (h entered or from a stated correlation), linearised radiation and fin arrays at the
// outer surface, plus lumped-capacitance transients. Textbook-standard relations, cited by equation:
//   [I] Incropera, DeWitt, Bergman, Lavine, Fundamentals of Heat and Mass Transfer, 7th ed. (Wiley, 2011).
// Units: SI throughout (m, W, K); temperatures in °C at the interface, converted to K where absolute values matter
// (air properties, radiation). Heat rate Q is positive from the start face towards ambient.
//
// path = { geometry: 'plane' | 'cylinder', area (m², plane), r0 (m, inner radius, cylinder), length (m, cylinder),
//          start: { kind: 'temp', T } | { kind: 'heat', Q }, ambient (°C), layers: [layer] }
// layer = { type: 'conduction', k, t } | { type: 'parallel', kA, kB, fracA, t } | { type: 'contact', Rc }
//       | { type: 'convection', mode: 'h'|'natural-plate'|'natural-cylinder'|'forced-plate'|'forced-cylinder', h, Lc, V, emissivity }
//       | { type: 'fins', shape: 'rect'|'pin', N, L, t, w, k, h, tip: 'adiabatic'|'convective' }
export class ThermalError extends Error { constructor(code, message, at = null) { super(message); this.code = code; this.at = at; } }
export const SIGMA = 5.670374e-8, G = 9.81, K0 = 273.15;

// Thermal conductivity k (W/m·K), density ρ (kg/m³), specific heat c (J/kg·K) near 300 K. Typical values from
// [I] Table A.1 (metals) and Table A.3 (building and insulating materials); a specific product or grade differs.
// ρ and c are given only where the table lists them (needed for transients).
export const MATERIALS = {
  copper: { name: 'Copper (pure)', k: 401, rho: 8933, c: 385 },
  aluminium: { name: 'Aluminium (pure)', k: 237, rho: 2702, c: 903 },
  alAlloy: { name: 'Aluminium alloy 2024-T6', k: 177, rho: 2770, c: 875 },
  carbonSteel: { name: 'Carbon steel (plain)', k: 60.5, rho: 7854, c: 434 },
  stainless: { name: 'Stainless steel AISI 304', k: 14.9, rho: 7900, c: 477 },
  brick: { name: 'Common brick', k: 0.72, rho: 1920, c: 835 },
  concrete: { name: 'Concrete (stone mix)', k: 1.4, rho: 2300, c: 880 },
  glass: { name: 'Plate glass', k: 1.4, rho: 2500, c: 750 },
  plaster: { name: 'Gypsum / plaster board', k: 0.17, rho: 800, c: null },
  softwood: { name: 'Softwood (fir, pine)', k: 0.12, rho: 510, c: 1380 },
  rubber: { name: 'Hard rubber', k: 0.16, rho: 1190, c: null },
  teflon: { name: 'PTFE (Teflon)', k: 0.35, rho: 2200, c: null },
  glassWool: { name: 'Glass-fibre blanket', k: 0.038, rho: 32, c: 835 },
  polystyrene: { name: 'Extruded polystyrene', k: 0.027, rho: 55, c: 1210 },
};

// Air at 1 atm, [I] Table A.4: T (K), kinematic viscosity ν (m²/s), conductivity k (W/m·K), Prandtl number.
const AIR = [[250, 11.44e-6, 0.0223, 0.720], [300, 15.89e-6, 0.0263, 0.707], [350, 20.92e-6, 0.0300, 0.700], [400, 26.41e-6, 0.0338, 0.690], [450, 32.39e-6, 0.0373, 0.686], [500, 38.79e-6, 0.0407, 0.684]];
export const AIR_RANGE = [250, 500];
export function air(TK, { clamp = false } = {}) {
  if (!(TK >= AIR_RANGE[0] - 1e-9 && TK <= AIR_RANGE[1] + 1e-9)) {
    if (!clamp) throw new ThermalError('air-range', `air properties are tabulated for film temperatures ${AIR_RANGE[0]}–${AIR_RANGE[1]} K (${AIR_RANGE[0] - K0}–${AIR_RANGE[1] - K0} °C); here the film is at ${(TK - K0).toFixed(0)} °C`);
    TK = Math.min(AIR_RANGE[1], Math.max(AIR_RANGE[0], TK));
  }
  const i = Math.min(AIR.length - 2, Math.max(0, Math.floor((TK - 250) / 50))), [T1, n1, k1, p1] = AIR[i], [T2, n2, k2, p2] = AIR[i + 1], s = (TK - T1) / (T2 - T1);
  return { nu: n1 + s * (n2 - n1), k: k1 + s * (k2 - k1), Pr: p1 + s * (p2 - p1) };
}

// ---------- convection correlations (air, 1 atm). Each returns { h, Nu, Ra|Re, valid, why } ----------
const filmOf = (Ts, Tinf) => (Ts + Tinf) / 2 + K0;
const rayleigh = (Ts, Tinf, L, p, TfK) => G * (1 / TfK) * Math.abs(Ts - Tinf) * L ** 3 / (p.nu * p.nu / p.Pr);   // ideal gas β = 1/T_film
// Vertical plate, Churchill & Chu, [I] eq. 9.26, all Ra up to 1e12 (stated limit here).
export function naturalPlate({ Ts, Tinf, L }, o) {
  const Tf = filmOf(Ts, Tinf), p = air(Tf, o), Ra = rayleigh(Ts, Tinf, L, p, Tf);
  const Nu = (0.825 + 0.387 * Ra ** (1 / 6) / (1 + (0.492 / p.Pr) ** (9 / 16)) ** (8 / 27)) ** 2;
  return { h: Nu * p.k / L, Nu, Ra, valid: Ra <= 1e12, why: `Ra = ${Ra.toExponential(2)} is above 10¹², outside the Churchill–Chu range used here` };
}
// Long horizontal cylinder, Churchill & Chu, [I] eq. 9.34, Ra_D ≤ 1e12.
export function naturalCylinder({ Ts, Tinf, D }, o) {
  const Tf = filmOf(Ts, Tinf), p = air(Tf, o), Ra = rayleigh(Ts, Tinf, D, p, Tf);
  const Nu = (0.60 + 0.387 * Ra ** (1 / 6) / (1 + (0.559 / p.Pr) ** (9 / 16)) ** (8 / 27)) ** 2;
  return { h: Nu * p.k / D, Nu, Ra, valid: Ra <= 1e12, why: `Ra_D = ${Ra.toExponential(2)} is above 10¹², outside the Churchill–Chu range` };
}
// Flat plate in parallel flow, average over length L: laminar [I] eq. 7.30 (Re ≤ 5e5), mixed laminar/turbulent
// [I] eq. 7.38 with Re_x,c = 5e5 (5e5 < Re ≤ 1e8). Pr ≥ 0.6 holds for air.
export function forcedPlate({ Ts, Tinf, V, L }, o) {
  const p = air(filmOf(Ts, Tinf), o), Re = V * L / p.nu;
  const Nu = Re <= 5e5 ? 0.664 * Re ** 0.5 * p.Pr ** (1 / 3) : (0.037 * Re ** 0.8 - 871) * p.Pr ** (1 / 3);
  return { h: Nu * p.k / L, Nu, Re, regime: Re <= 5e5 ? 'laminar' : 'mixed', valid: Re <= 1e8, why: `Re = ${Re.toExponential(2)} is above 10⁸, outside the flat-plate correlation` };
}
// Cylinder in cross flow, Churchill & Bernstein, [I] eq. 7.54, Re·Pr ≥ 0.2.
export function forcedCylinder({ Ts, Tinf, V, D }, o) {
  const p = air(filmOf(Ts, Tinf), o), Re = V * D / p.nu;
  const Nu = 0.3 + 0.62 * Re ** 0.5 * p.Pr ** (1 / 3) / (1 + (0.4 / p.Pr) ** (2 / 3)) ** 0.25 * (1 + (Re / 282000) ** (5 / 8)) ** 0.8;
  return { h: Nu * p.k / D, Nu, Re, valid: Re * p.Pr >= 0.2, why: `Re·Pr = ${(Re * p.Pr).toPrecision(2)} is below 0.2, outside the Churchill–Bernstein range` };
}
// Radiation from a small grey surface to large surroundings at Tsur, written as a coefficient ([I] eq. 1.9):
// q = h_r A (Ts − Tsur), h_r = εσ(Ts + Tsur)(Ts² + Tsur²) in kelvin. It depends on Ts, so it is updated with Ts.
export const hRad = ({ eps, Ts, Tsur }) => { const a = Ts + K0, b = Tsur + K0; return eps * SIGMA * (a + b) * (a * a + b * b); };

// ---------- resistances ([I] Table 3.3) ----------
export const planeR = (k, t, A) => t / (k * A);
export const cylR = (k, r1, r2, L) => Math.log(r2 / r1) / (2 * Math.PI * k * L);
export const convR = (h, A) => 1 / (h * A);
export const contactR = (Rc, A) => Rc / A;      // Rc = R″t,c in m²·K/W, [I] §3.1.4
export const criticalRadius = (k, h) => k / h;  // cylinder, [I] Example 3.5 / eq. 3.37

// ---------- fins ([I] §3.6, Table 3.4; arrays §3.6.5) ----------
// One fin of uniform cross-section. rect: thickness t, width w (P = 2(w + t), Ac = w t); pin: diameter t.
export function fin({ shape, L, t, w, k, h, tip }) {
  const Ac = shape === 'pin' ? Math.PI * t * t / 4 : w * t, P = shape === 'pin' ? Math.PI * t : 2 * (w + t);
  const m = Math.sqrt(h * P / (k * Ac)), M1 = Math.sqrt(h * P * k * Ac), mL = m * L, r = h / (m * k);
  const perTheta = tip === 'adiabatic' ? M1 * Math.tanh(mL) : M1 * (Math.sinh(mL) + r * Math.cosh(mL)) / (Math.cosh(mL) + r * Math.sinh(mL));
  const tipRatio = tip === 'adiabatic' ? 1 / Math.cosh(mL) : 1 / (Math.cosh(mL) + r * Math.sinh(mL));
  const Af = P * L + (tip === 'adiabatic' ? 0 : Ac);
  return { Ac, P, m, mL, Af, perTheta, eta: perTheta / (h * Af), effectiveness: perTheta / (h * Ac), tipRatio, Bi: h * (Ac / P) / k };
}
// N fins on a base of area Abase, all at one h: conductance = h·A_unfinned + N·q_f/θ_b; η_o = that / (h·A_total).
export function finArray({ N, Abase, h, ...one }) {
  const f = fin({ ...one, h }), Aun = Abase - N * f.Ac, Gc = h * Aun + N * f.perTheta, At = Aun + N * f.Af;
  return { ...f, N, Aunfinned: Aun, Atotal: At, R: 1 / Gc, etaO: Gc / (h * At), bareR: 1 / (h * Abase) };
}

// ---------- lumped capacitance ([I] §5.2, eq. 5.5, 5.10) ----------
export function lumped({ rho, c, V, As, h, k, Ti, Tinf, Ttarget }) {
  const Lc = V / As, Bi = h * Lc / k, tau = rho * V * c / (h * As);
  if (Bi > 0.1) throw new ThermalError('biot', `Bi = h·(V/A)/k = ${Bi.toFixed(3)} is above 0.1: the body is not at one temperature, so the lumped model does not apply`);
  const ti = Ti - Tinf, tt = Ttarget - Tinf;
  if (ti === 0 || tt / ti <= 0 || tt / ti > 1) throw new ThermalError('target', `the target ${Ttarget} °C is not reached on the way from ${Ti} °C towards ${Tinf} °C`);
  return { Bi, Lc, tau, time: tau * Math.log(ti / tt) };
}

// ---------- the path ----------
const isConv = l => l.type === 'convection';
export function checkPath(p) {
  const n = p.layers.length, cyl = p.geometry === 'cylinder';
  if (!n) throw new ThermalError('empty', 'Add at least one layer between the start face and ambient.');
  if (cyl ? !(p.r0 > 0 && p.length > 0) : !(p.area > 0)) throw new ThermalError('geometry', cyl ? 'The pipe needs a positive inner radius and length.' : 'The wall needs a positive area.');
  if (n > 1 && p.layers.every(isConv)) throw new ThermalError('no-solid', 'two fluid films with no solid between them: add a wall, a pipe wall or a layer of insulation.');
  p.layers.forEach((l, i) => {                               // what the geometry cannot hold, before the order of layers
    if (l.type === 'fins' && cyl) throw new ThermalError('annular-fins', 'fins on a pipe are annular fins, which are not built; use the plane geometry for a fin array.', i);
    if (l.type === 'parallel' && cyl) throw new ThermalError('parallel-on-pipe', 'side-by-side materials are modelled only in a plane wall.', i);
  });
  p.layers.forEach((l, i) => {
    const inner = isConv(l) && i === 0 && n > 1;               // a film between the start fluid and the first solid
    if (isConv(l) && i > 0 && i < n - 1) throw new ThermalError('mid-convection', 'convection only at the first or last layer: a fluid gap between two solid layers needs enclosure correlations, which are not built.', i);
    if (inner && p.start.kind === 'heat') throw new ThermalError('heat-into-fluid', 'a heat source sits on a solid face; put a solid layer (or contact) first, or give the start a fixed fluid temperature instead.', i);
    if (inner && l.emissivity > 0) throw new ThermalError('inner-radiation', 'radiation is modelled only from the outer surface to large surroundings at ambient; set the emissivity of the inner surface to 0.', i);
    if (inner && cyl && l.mode !== 'h') throw new ThermalError('internal-flow', 'flow inside a pipe needs internal-flow correlations (e.g. Dittus–Boelter), which are not built; enter h for the inside surface.', i);
    if (isConv(l) && cyl && /plate/.test(l.mode)) throw new ThermalError('plate-on-pipe', 'a flat-plate correlation does not apply to a pipe; choose a cylinder correlation or enter h.', i);
    if (isConv(l) && !cyl && /cylinder/.test(l.mode)) throw new ThermalError('cylinder-on-plane', 'a cylinder correlation needs the pipe geometry; on a flat wall choose a plate correlation or enter h.', i);
    if (l.type === 'fins' && i !== n - 1) throw new ThermalError('fins-not-last', 'fins go on the outer surface: make the fin array the last layer (it includes its own convection to ambient).', i);
  });
}

// Solve the path. Coefficients that depend on surface temperature (natural convection, radiation, film properties)
// are found by damped fixed-point iteration; validity is checked on the converged state only.
export function solvePath(p) {
  checkPath(p);
  const n = p.layers.length, cyl = p.geometry === 'cylinder';
  const r = [cyl ? p.r0 : null];
  p.layers.forEach((l, i) => { r[i + 1] = cyl ? r[i] + (l.type === 'conduction' ? l.t : 0) : null; });
  const areaAt = i => (cyl ? 2 * Math.PI * r[i] * p.length : p.area);
  const coeff = p.layers.map(l => (isConv(l) ? { hc: l.mode === 'h' ? l.h : 10, hr: 0 } : null));
  let T = [], Q = 0, R = [], it = 0, done = false, fins = null;
  const film = (i, T, o) => {
    const l = p.layers[i], last = i === n - 1, Ts = last ? T[i] : T[i + 1], Tinf = last ? p.ambient : T[0], D = 2 * r[last ? i : i + 1];
    const c = l.mode === 'h' ? { h: l.h } : l.mode === 'natural-plate' ? naturalPlate({ Ts, Tinf, L: l.Lc }, o) : l.mode === 'natural-cylinder' ? naturalCylinder({ Ts, Tinf, D }, o)
      : l.mode === 'forced-plate' ? forcedPlate({ Ts, Tinf, V: l.V, L: l.Lc }, o) : forcedCylinder({ Ts, Tinf, V: l.V, D }, o);
    return { c, hr: last && l.emissivity > 0 ? hRad({ eps: l.emissivity, Ts, Tsur: p.ambient }) : 0, Ts, Tinf };
  };
  for (; it < 1000 && !done; it++) {
    R = p.layers.map((l, i) => {
      if (l.type === 'conduction') return cyl ? cylR(l.k, r[i], r[i + 1], p.length) : planeR(l.k, l.t, p.area);
      if (l.type === 'parallel') return 1 / (l.kA * l.fracA * p.area / l.t + l.kB * (1 - l.fracA) * p.area / l.t);
      if (l.type === 'contact') return contactR(l.Rc, areaAt(i));
      if (l.type === 'fins') return (fins = finArray({ ...l, Abase: p.area })).R;
      const A = areaAt(i === n - 1 ? i : i + 1); return 1 / ((coeff[i].hc + coeff[i].hr) * A);
    });
    const Rt = R.reduce((a, b) => a + b, 0);
    Q = p.start.kind === 'temp' ? (p.start.T - p.ambient) / Rt : p.start.Q;
    T = [p.start.kind === 'temp' ? p.start.T : p.ambient + Q * Rt];
    R.forEach((x, i) => { T[i + 1] = T[i] - Q * x; });
    T[n] = p.ambient;
    done = true;
    p.layers.forEach((l, i) => {
      if (!isConv(l)) return;
      const f = film(i, T, { clamp: true }), hc = l.mode === 'h' ? l.h : f.c.h, hr = f.hr, o = coeff[i];
      if (Math.abs(hc - o.hc) > 1e-10 * Math.max(1, hc) || Math.abs(hr - o.hr) > 1e-10 * Math.max(1, hr)) done = false;
      o.hc += 0.6 * (hc - o.hc); o.hr += 0.6 * (hr - o.hr);
    });
  }
  if (!done) throw new ThermalError('no-converge', 'the surface temperature and the convection coefficient did not settle; check the inputs (very large heat loads or ΔT near zero).');
  const Rt = R.reduce((a, b) => a + b, 0);
  const layers = p.layers.map((l, i) => {
    const out = { R: R[i], dT: Q * R[i], share: R[i] / Rt, Tin: T[i], Tout: T[i + 1], r1: r[i], r2: r[i + 1] };
    if (isConv(l)) {
      const f = film(i, T);                                       // unclamped: refuses a film outside the air table
      if (l.mode !== 'h' && !f.c.valid) throw new ThermalError('correlation-range', f.c.why, i);
      Object.assign(out, { hc: coeff[i].hc, hr: coeff[i].hr, area: areaAt(i === n - 1 ? i : i + 1), corr: l.mode === 'h' ? null : f.c, Ts: f.Ts });
    }
    if (l.type === 'fins') {
      if (fins.Aunfinned <= 0) throw new ThermalError('fins-footprint', `the ${l.N} fin roots (${(l.N * fins.Ac * 1e4).toFixed(2)} cm²) cover more than the base area (${(p.area * 1e4).toFixed(2)} cm²).`, i);
      if (fins.Bi > 0.1) throw new ThermalError('fin-1d', `fin Biot number h·(Ac/P)/k = ${fins.Bi.toFixed(3)} is above 0.1: the fin is not at one temperature across its thickness, so the 1D fin model does not apply.`, i);
      Object.assign(out, { fins, tipT: p.ambient + (T[i] - p.ambient) * fins.tipRatio });
    }
    return out;
  });
  const last = p.layers[n - 1], lastOut = layers[n - 1];
  let critical = null;
  if (cyl && isConv(last) && n >= 2 && p.layers[n - 2].type === 'conduction') {
    const k = p.layers[n - 2].k, h = lastOut.hc + lastOut.hr, rc = criticalRadius(k, h), ro = r[n - 1];
    critical = { k, h, rc, ro, more: ro < rc ? 'increases' : 'reduces' };
  }
  return { Q, T, R, Rt, layers, r, critical, iterations: it };
}
