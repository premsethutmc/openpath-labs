// Ready-made experiments for the flow tunnel, and the measurements students (and missions) use.
import { Tunnel, shapes } from './lbm.mjs';

export const U_LATTICE = 0.08;            // inlet speed in lattice units (Mach ≈ 0.14)
export const NU_MIN = 0.012;              // below this the plain solver loses stability; the turbulence model takes over

export const SCENES = {
  cylinder: { name: 'Cylinder', walls: 'open', body: (nx, ny) => ({ fn: shapes.circle(nx * 0.22, ny / 2 + 0.3, ny * 0.1), size: ny * 0.2 }) },
  wing: { name: 'Wing', walls: 'open', aoa: 6, body: (nx, ny, s) => ({ fn: shapes.naca(nx * 0.2, ny / 2, ny * 0.5, 0.12, s.aoa ?? 6), size: ny * 0.5 }) },
  plate: { name: 'Flat plate', walls: 'open', body: (nx, ny) => ({ fn: shapes.rect(nx * 0.22, ny * 0.38 + 0.4, 2, ny * 0.24), size: ny * 0.24 }) },
  square: { name: 'Square', walls: 'open', body: (nx, ny) => ({ fn: shapes.rect(nx * 0.2, ny * 0.4, ny * 0.2, ny * 0.2), size: ny * 0.2 }) },
  car: { name: 'Car', walls: 'open', body: (nx, ny) => ({ fn: carShape(nx * 0.18, ny * 0.38, ny * 0.6), size: ny * 0.22 }) },
  venturi: { name: 'Venturi', walls: 'walls', walled: (nx, ny) => venturiWalls(nx, ny), size: ny => ny - 2 },
  pipe: { name: 'Pipe (channel)', walls: 'walls', size: ny => ny - 2 },
};

function carShape(x0, yBase, L) {
  // a simple hatchback profile: body plus a cabin; wheels sit on the body line
  const body = shapes.rect(x0, yBase, L, L * 0.18), cabin = (x, y) => {
    const u = (x - x0) / L; if (u < 0.25 || u > 0.85) return false;
    const top = yBase + L * 0.18 + L * 0.17 * Math.sin(Math.PI * Math.min(1, (u - 0.25) / 0.55));
    return y >= yBase + L * 0.18 && y <= top;
  };
  return (x, y) => body(x, y) || cabin(x, y);
}
function venturiWalls(nx, ny) {
  // smooth converging–diverging channel; throat at 45 % of the inlet height
  const xc = nx * 0.45, half = nx * 0.18;
  return (x, y) => {
    const d = Math.abs(x - xc) / half; if (d >= 1) return false;
    const pinch = 0.275 * (ny - 2) * 0.5 * (1 + Math.cos(Math.PI * d));
    return y < 1 + pinch || y > ny - 2 - pinch;
  };
}
export const venturiThroatX = nx => Math.round(nx * 0.45);

// Build a tunnel for a scene at a target Reynolds number (based on the body size, or channel height).
// Resolution is chosen so the lattice viscosity stays above NU_MIN (stable, no turbulence model needed); if the grid
// would exceed maxNy the Reynolds number is capped and `limited` is reported.
export function build(sceneId, Re, { ny: nyWanted = 96, maxNy = 160, aspect = 2.5, u = U_LATTICE, aoa } = {}) {
  const sc = SCENES[sceneId];
  const frac = sc.walls === 'walls' ? 1 : (sc.body(400, 100, { aoa: aoa ?? sc.aoa }).size / 100);  // body size ÷ height
  const nyNeeded = Math.ceil((Re * NU_MIN) / (u * frac)) + 2;
  const ny = Math.min(maxNy, Math.max(nyWanted, nyNeeded)), nx = Math.round(ny * aspect);
  const spec = { aoa: aoa ?? sc.aoa };
  const b = sc.body ? sc.body(nx, ny, spec) : null;
  const L = b ? b.size : sc.size(ny);
  const nu = Math.max((u * L) / Re, NU_MIN);
  const t = new Tunnel(nx, ny, { nu, u0: u, walls: sc.walls, profile: sc.walls === 'walls' ? 'parabolic' : 'uniform' });
  if (sc.walled) t.paint(sc.walled(nx, ny), 1);
  if (b) t.paint(b.fn, 2);
  return { t, L, u, Re: (u * L) / nu, scene: sceneId, limited: (u * L) / nu < Re * 0.98 };
}

// ---- measurements ----
export const coeffs = (t, L, u = t.u0) => ({ cd: (2 * t.fx) / (u ** 2 * L), cl: (2 * t.fy) / (u ** 2 * L) });
export function sectionMean(t, x, field = 'ux') {
  let s = 0, n = 0;
  for (let y = 1; y < t.ny - 1; y++) { const k = y * t.nx + x; if (!t.solid[k]) { s += t[field][k]; n++; } }
  return n ? s / n : 0;
}
export function profile(t, x) { const out = []; for (let y = 1; y < t.ny - 1; y++) out.push(t.solid[y * t.nx + x] ? 0 : t.ux[y * t.nx + x]); return out; }

// Run an experiment and report what happened (used by missions and tests).
// Probes use a faster lattice speed (Mach ≈ 0.17) and coarser grid: right regime and trends, a few seconds to run.
export function probe(sceneId, Re, { steps, aoa } = {}) {
  const { t, L, Re: actualRe, u } = build(sceneId, Re, { ny: 48, maxNy: 72, u: 0.1, aoa });
  const nx = t.nx;
  const steady = sceneId === 'venturi' || sceneId === 'pipe';
  const n = steps ?? Math.round((steady ? 1.6 : 3) * nx / u);
  t.step(Math.round(n * 0.6));
  const cd = [], cl = [];
  for (let k = 0; k < n * 0.4; k++) { t.step(1); const c = coeffs(t, L); cd.push(c.cd); cl.push(c.cl); }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sm = a => a.map((_, i) => { let s = 0, m = 0; for (let j = Math.max(0, i - 20); j <= Math.min(a.length - 1, i + 20); j++) { s += a[j]; m++; } return s / m; });
  const clS = sm(cl);
  const out = { Re: actualRe, cd: mean(cd), clMean: mean(cl), clAmp: (Math.max(...clS) - Math.min(...clS)) / 2, healthy: t.healthy() };
  if (sceneId === 'venturi') {
    const xi = Math.round(nx * 0.12), xt = venturiThroatX(nx);
    out.speedRatio = sectionMean(t, xt) / sectionMean(t, xi);
    out.pressureDrop = (sectionMean(t, xi, 'rho') - sectionMean(t, xt, 'rho')) / 3;  // p = ρ/3
  }
  if (sceneId === 'pipe') { const p = profile(t, Math.round(nx * 0.7)); out.centreOverMean = Math.max(...p) / mean(p); out.profile = p; }
  return out;
}
