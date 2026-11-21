import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makePipe, advancePipe, wallFlux, pipePrim, makeVolume, connectOpen, orifice, simulate, K12M_PUBLISHED, R } from './gasdyn.mjs';

// Exact Riemann solution (Toro, ch. 4) for the density at x/t.
function exactRiemann(L, Rr, g, xi) {
  const c = s => Math.sqrt(g * s.p / s.rho);
  const f = (p, s) => p > s.p
    ? (p - s.p) * Math.sqrt((2 / ((g + 1) * s.rho)) / (p + (g - 1) / (g + 1) * s.p))
    : (2 * c(s) / (g - 1)) * ((p / s.p) ** ((g - 1) / (2 * g)) - 1);
  let p = 0.5 * (L.p + Rr.p);
  for (let k = 0; k < 100; k++) { const h = 1e-7, F = f(p, L) + f(p, Rr) + Rr.u - L.u; const dF = (f(p + h, L) + f(p + h, Rr) - f(p - h, L) - f(p - h, Rr)) / (2 * h); p -= F / dF; }
  const u = 0.5 * (L.u + Rr.u) + 0.5 * (f(p, Rr) - f(p, L));
  if (xi < u) {
    if (p > L.p) { const S = L.u - c(L) * Math.sqrt((g + 1) / (2 * g) * p / L.p + (g - 1) / (2 * g)); return xi < S ? L.rho : L.rho * ((p / L.p + (g - 1) / (g + 1)) / ((g - 1) / (g + 1) * p / L.p + 1)); }
    const head = L.u - c(L), cs = c(L) * (p / L.p) ** ((g - 1) / (2 * g)), tail = u - cs;
    if (xi < head) return L.rho;
    if (xi > tail) return L.rho * (p / L.p) ** (1 / g);
    return L.rho * (2 / (g + 1) + (g - 1) / ((g + 1) * c(L)) * (L.u - xi)) ** (2 / (g - 1));
  }
  if (p > Rr.p) { const S = Rr.u + c(Rr) * Math.sqrt((g + 1) / (2 * g) * p / Rr.p + (g - 1) / (2 * g)); return xi > S ? Rr.rho : Rr.rho * ((p / Rr.p + (g - 1) / (g + 1)) / ((g - 1) / (g + 1) * p / Rr.p + 1)); }
  const head = Rr.u + c(Rr), cs = c(Rr) * (p / Rr.p) ** ((g - 1) / (2 * g)), tail = u + cs;
  if (xi > head) return Rr.rho;
  if (xi < tail) return Rr.rho * (p / Rr.p) ** (1 / g);
  return Rr.rho * (2 / (g + 1) - (g - 1) / ((g + 1) * c(Rr)) * (Rr.u - xi)) ** (2 / (g - 1));
}

function sodPipe(n) {
  const pp = makePipe({ L: 1, D: 0.05, n, gamma: 1.4 });
  pp.inviscid = true; pp.pFloor = 1e-9;
  pp.U = Array.from({ length: n }, (_, i) => { const left = (i + 0.5) / n < 0.5; const rho = left ? 1 : 0.125, p = left ? 1 : 0.1; return [rho, 0, p / 0.4]; });
  return pp;
}
function run(pp, tEnd, cfl = 0.5) {
  let t = 0;
  while (t < tEnd) {
    let smax = 0; for (let i = 0; i < pp.n; i++) { const [rho, u, p] = pipePrim(pp, i); smax = Math.max(smax, Math.abs(u) + Math.sqrt(1.4 * p / rho)); }
    const dt = Math.min(cfl * pp.dx / smax, tEnd - t);
    advancePipe(pp, dt, wallFlux(pp, 'left'), wallFlux(pp, 'right')); t += dt;
  }
}

test('Sod shock tube: density matches the exact Riemann solution and converges with mesh refinement', () => {
  const L = { rho: 1, u: 0, p: 1 }, Rr = { rho: 0.125, u: 0, p: 0.1 };
  const err = n => {
    const pp = sodPipe(n); run(pp, 0.2);
    let e = 0; for (let i = 0; i < n; i++) e += Math.abs(pipePrim(pp, i)[0] - exactRiemann(L, Rr, 1.4, ((i + 0.5) / n - 0.5) / 0.2)) / n;
    return e;
  };
  const e100 = err(100), e400 = err(400);
  assert.ok(e100 < 0.012, `L1 error (100 cells) ${e100}`);
  assert.ok(e400 < e100 / 2, `refining the mesh reduces the error (${e100} → ${e400})`);
});

test('a closed pipe conserves mass and energy exactly', () => {
  const pp = sodPipe(120); const tot = () => pp.U.reduce((a, q) => [a[0] + q[0], a[1] + q[2]], [0, 0]);
  const before = tot(); run(pp, 0.6);
  const after = tot();
  assert.ok(Math.abs(after[0] / before[0] - 1) < 1e-12 && Math.abs(after[1] / before[1] - 1) < 1e-12);
});

test('quarter-wave resonance: a pipe closed at one end and open at the other rings at a/4L', () => {
  const Lp = 1, pp = makePipe({ L: Lp, D: 0.04, n: 100, T: 300, p: 1.05e5, gamma: 1.4 }); pp.inviscid = true;
  const atm = makeVolume({ V: 1, p: 1e5, T: 300, fixed: true });
  const a = Math.sqrt(1.4 * R * 300);
  let t = 0, prev = null, crossings = [];
  while (t < 0.05) {
    const dt = 0.5 * pp.dx / 420;
    const c = connectOpen(pp, 'right', atm);
    advancePipe(pp, dt, wallFlux(pp, 'left'), [-c.F[0], c.F[1], -c.F[2]]); t += dt;
    const p0 = pipePrim(pp, 0)[2] - 1e5;
    if (prev !== null && prev > 0 && p0 <= 0) crossings.push(t);
    prev = p0;
  }
  const period = (crossings.at(-1) - crossings[0]) / (crossings.length - 1);
  const f = 1 / period, ideal = a / (4 * Lp);
  assert.ok(Math.abs(f / ideal - 1) < 0.05, `measured ${f.toFixed(1)} Hz vs a/4L ${ideal.toFixed(1)} Hz`);
});

test('orifice flow: chokes at the critical pressure ratio', () => {
  const m = pr => orifice(2e5, 300, 2e5 * pr, 1e-4, 1.4);
  assert.ok(Math.abs(m(0.3) - m(0.5)) < 1e-12, 'choked: flow independent of downstream pressure');
  assert.ok(m(0.8) < m(0.5) && m(0.999) < m(0.8));
});

test('full-load engine model: calibrated once at the published torque point, predicts the published power point within 5 %', () => {
  const t = simulate(K12M_PUBLISHED.torque.rpm), p = simulate(K12M_PUBLISHED.power.rpm);
  assert.ok(t.converged && p.converged);
  assert.ok(Math.abs(t.torque / K12M_PUBLISHED.torque.Nm - 1) < 0.015, `torque (calibration point) ${t.torque.toFixed(1)} vs ${K12M_PUBLISHED.torque.Nm}`);
  assert.ok(Math.abs(p.power / 1000 / K12M_PUBLISHED.power.kW - 1) < 0.05, `power (prediction) ${(p.power / 1000).toFixed(1)} vs ${K12M_PUBLISHED.power.kW}`);
  assert.ok(t.ve > 0.8 && t.ve < 1.05 && p.ve > 0.7 && p.ve < 1.0);
  assert.ok(Math.max(...t.traces.cyl) > 50e5 && Math.max(...t.traces.cyl) < 100e5);
});
