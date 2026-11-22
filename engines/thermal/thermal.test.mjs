// Heat transfer engine checked against hand calculations and Incropera (7th ed.) worked examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './thermal.mjs';

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg ?? ''} ${a} vs ${b}`);

test('composite plane wall: series resistances by hand', () => {
  const r = H.solvePath({ geometry: 'plane', area: 10, start: { kind: 'temp', T: 22 }, ambient: 2, layers: [
    { type: 'convection', mode: 'h', h: 8, emissivity: 0 }, { type: 'conduction', k: 0.72, t: 0.2 }, { type: 'conduction', k: 0.04, t: 0.05 }, { type: 'convection', mode: 'h', h: 25, emissivity: 0 }] });
  const Rt = 1 / 80 + 0.2 / 7.2 + 0.05 / 0.4 + 1 / 250;            // 0.169278 K/W
  near(r.Rt, Rt, 1e-12); near(r.Q, 20 / Rt, 1e-12, 'Q'); near(r.Q, 118.15, 1e-4);
  near(r.T[2], 22 - r.Q * (1 / 80 + 0.2 / 7.2), 1e-12, 'brick/insulation interface');
  assert.ok(Math.abs(r.layers.reduce((a, l) => a + l.dT, 0) - 20) < 1e-12, 'ΔT across the layers add up to the overall ΔT');
  assert.ok(Math.abs(r.layers.reduce((a, l) => a + l.share, 0) - 1) < 1e-12);
});

test('parallel layer inside a plane wall: conductances add', () => {
  const r = H.solvePath({ geometry: 'plane', area: 2, start: { kind: 'temp', T: 30 }, ambient: 10, layers: [{ type: 'parallel', kA: 0.12, kB: 0.04, fracA: 0.15, t: 0.1 }] });
  near(r.Rt, 1 / (0.12 * 0.3 / 0.1 + 0.04 * 1.7 / 0.1), 1e-12);
});

test('insulated pipe: ln(r2/r1)/(2πkL) and outer film', () => {
  const r = H.solvePath({ geometry: 'cylinder', r0: 0.03, length: 1, start: { kind: 'temp', T: 150 }, ambient: 20, layers: [{ type: 'conduction', k: 0.038, t: 0.05 }, { type: 'convection', mode: 'h', h: 10, emissivity: 0 }] });
  near(r.R[0], Math.log(0.08 / 0.03) / (2 * Math.PI * 0.038), 1e-12); near(r.R[0], 4.10799, 1e-5);
  near(r.R[1], 1 / (10 * 2 * Math.PI * 0.08), 1e-12);
  near(r.Q, 30.184, 1e-4);
  assert.equal(r.critical.more, 'reduces'); near(r.critical.rc, 0.0038, 1e-12);
});

test('critical radius of insulation, Incropera Example 3.5: k 0.055, h 5 → 11 mm', () => {
  near(H.criticalRadius(0.055, 5), 0.011, 1e-12);
  const Q = t => H.solvePath({ geometry: 'cylinder', r0: 0.005, length: 1, start: { kind: 'temp', T: 100 }, ambient: 25, layers: [{ type: 'conduction', k: 0.055, t }, { type: 'convection', mode: 'h', h: 5, emissivity: 0 }] }).Q;
  assert.ok(Q(0.006) > Q(0.002) && Q(0.006) > Q(0.010), 'heat loss peaks at r = r_cr = 11 mm (t = 6 mm)');
});

test('fins: Incropera Example 3.9 long copper rod (8.3 W), and a rectangular fin by hand', () => {
  const f = H.fin({ shape: 'pin', t: 0.005, L: 1, k: 398, h: 100, tip: 'adiabatic' });
  near(f.perTheta * 75, 8.3, 0.01, 'copper rod, θb = 75 K');
  const g = H.fin({ shape: 'rect', t: 0.002, w: 0.05, L: 0.02, k: 237, h: 25, tip: 'adiabatic' });
  const m = Math.sqrt(25 * 0.104 / (237 * 1e-4));
  near(g.m, m, 1e-12); near(g.eta, Math.tanh(m * 0.02) / (m * 0.02), 1e-12); near(g.eta, 0.9856, 1e-4);
  near(g.effectiveness, Math.sqrt(25 * 0.104 * 237 * 1e-4) * Math.tanh(m * 0.02) / (25 * 1e-4), 1e-12);
  const c = H.fin({ shape: 'rect', t: 0.002, w: 0.05, L: 0.02, k: 237, h: 25, tip: 'convective' }), r = 25 / (m * 237), mL = m * 0.02;
  near(c.perTheta, Math.sqrt(25 * 0.104 * 237 * 1e-4) * (Math.sinh(mL) + r * Math.cosh(mL)) / (Math.cosh(mL) + r * Math.sinh(mL)), 1e-12);
  const a = H.finArray({ shape: 'rect', t: 0.002, w: 0.05, L: 0.02, k: 237, h: 25, tip: 'adiabatic', N: 10, Abase: 0.0025 });
  near(a.R, 1 / (25 * (0.0025 - 10 * 1e-4) + 10 * g.perTheta), 1e-12); near(a.R, 1.818, 1e-3);
});

test('natural convection, Incropera Example 9.2 (vertical glass screen 0.71 m, 232 °C in 23 °C air): Ra 1.813e9, h 7.0', () => {
  const c = H.naturalPlate({ Ts: 232, Tinf: 23, L: 0.71 });
  near(c.Ra, 1.813e9, 0.01); near(c.Nu, 147, 0.01); near(c.h, 7.0, 0.02);
});

test('forced flow over a flat plate (laminar, film at 300 K): 0.664 Re^½ Pr^⅓ by hand', () => {
  const c = H.forcedPlate({ Ts: 36.85, Tinf: 16.85, V: 5, L: 0.5 }), Re = 5 * 0.5 / 15.89e-6;
  near(c.Re, Re, 1e-12); near(c.h, 0.664 * Re ** 0.5 * 0.707 ** (1 / 3) * 0.0263 / 0.5, 1e-12); near(c.h, 12.34, 1e-3);
  assert.equal(c.regime, 'laminar');
});

test('radiation coefficient and lumped capacitance (Incropera Example 5.1 thermocouple: τ 1 s, 5.2 s to 199 °C)', () => {
  near(H.hRad({ eps: 0.9, Ts: 100, Tsur: 20 }), 0.9 * 5.670374e-8 * 666.3 * (373.15 ** 2 + 293.15 ** 2), 1e-12);
  const D = 0.706e-3, x = H.lumped({ rho: 8500, c: 400, k: 20, h: 400, V: Math.PI * D ** 3 / 6, As: Math.PI * D * D, Ti: 25, Tinf: 200, Ttarget: 199 });
  near(x.tau, 1.0, 0.002); near(x.time, 5.2, 0.01); near(x.Bi, 2.35e-3, 0.01);
  assert.throws(() => H.lumped({ rho: 2400, c: 880, k: 1.4, h: 50, V: 0.001, As: 0.06, Ti: 25, Tinf: 200, Ttarget: 150 }), /Bi = .* above 0\.1/);
});

test('surface-temperature-dependent coefficients converge to a self-consistent state; refusals are specific', () => {
  const p = { geometry: 'plane', area: 0.04, start: { kind: 'heat', Q: 10 }, ambient: 25, layers: [{ type: 'conduction', k: 237, t: 0.003 }, { type: 'convection', mode: 'natural-plate', Lc: 0.2, emissivity: 0.8 }] };
  const r = H.solvePath(p), Ts = r.T[1], l = r.layers[1];
  near(l.hc, H.naturalPlate({ Ts, Tinf: 25, L: 0.2 }).h, 1e-8); near(l.hr, H.hRad({ eps: 0.8, Ts, Tsur: 25 }), 1e-8);
  near((Ts - 25) * (l.hc + l.hr) * 0.04, 10, 1e-8, 'energy balance at the surface');
  const bad = (layers, extra = {}) => () => H.solvePath({ ...p, ...extra, layers });
  assert.throws(bad([{ type: 'conduction', k: 1, t: 0.1 }, { type: 'convection', mode: 'h', h: 10 }, { type: 'conduction', k: 1, t: 0.1 }]), /convection only at the first or last layer/);
  assert.throws(bad([{ type: 'fins', shape: 'rect', N: 4, L: 0.02, t: 0.002, w: 0.05, k: 200, h: 10, tip: 'adiabatic' }, { type: 'conduction', k: 1, t: 0.1 }]), /fins go on the outer surface/);
  assert.throws(bad([{ type: 'conduction', k: 1, t: 0.1 }, { type: 'convection', mode: 'natural-cylinder', emissivity: 0 }]), /cylinder correlation needs the pipe geometry/);
  assert.throws(bad([{ type: 'conduction', k: 237, t: 0.003 }, { type: 'convection', mode: 'natural-plate', Lc: 0.2, emissivity: 0 }], { start: { kind: 'heat', Q: 2000 } }), /air properties are tabulated for film temperatures/);
  assert.throws(bad([{ type: 'conduction', k: 1, t: 0.1 }, { type: 'convection', mode: 'forced-plate', V: 100, Lc: 20, emissivity: 0 }]), /above 10⁸/);
});
