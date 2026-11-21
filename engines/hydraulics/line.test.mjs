import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveLine, budget, checkLine, LineError, ORIFICE_C } from './line.mjs';
import { operate, STOCK_SYSTEM as S, STOCK_PUMP, water, G } from './hydraulics.mjs';

// Pump House's stock installation written as a series line
const pumpHouseLine = (sys = S) => [
  { type: 'source', surface: sys.sumpLevel, outlet: sys.sumpLevel, inlet: 'footValve' },
  { type: 'pipe', D: sys.suction.D, L: sys.suction.L, material: sys.suction.material, rise: -sys.sumpLevel },
  ...Array.from({ length: sys.suction.elbows }, () => ({ type: 'elbow' })),
  { type: 'pump', rpm: STOCK_PUMP.rpm, D2: STOCK_PUMP.D2 },
  { type: 'checkValve' }, { type: 'valve', open: sys.valveOpen },
  { type: 'pipe', D: sys.delivery.D, L: sys.delivery.L, material: sys.delivery.material, rise: sys.tankHeight },
  ...Array.from({ length: sys.delivery.elbows }, () => ({ type: 'elbow' })),
  { type: 'sink', surface: sys.tankHeight },
];

test('the series-line solver reproduces Pump House’s operating point for the same installation', () => {
  for (const sys of [S, { ...S, tankHeight: 24 }, { ...S, delivery: { ...S.delivery, D: 0.05 } }, { ...S, valveOpen: 0.4 }]) {
    const o = operate(sys, STOCK_PUMP), r = solveLine(pumpHouseLine(sys), { temp: sys.temp });
    assert.ok(Math.abs(r.Q - o.Q) / o.Q < 1e-6, `Q ${r.Q} vs ${o.Q}`);
    assert.ok(Math.abs(r.pump.head - o.H) < 1e-5); assert.ok(Math.abs(r.pump.shaftPower - o.power) / o.power < 1e-6);
    assert.ok(Math.abs(r.pump.npsha - o.npsha) < 1e-5, `NPSHa ${r.pump.npsha} vs ${o.npsha}`);
    assert.equal(r.pump.cavitating, o.cavitating);
  }
});

test('gravity drain, laminar: matches Hagen–Poiseuille with entrance and exit losses', () => {
  const T = 20, w = water(T), D = 0.004, L = 10, dz = 0.05;
  const r = solveLine([{ type: 'source', surface: dz, outlet: 0, inlet: 'square' }, { type: 'pipe', D, L, material: 'pvc', rise: 0 }, { type: 'sink', surface: 0 }], { temp: T });
  // dz = 32 ν L V / (g D²) + 1.5 V²/2g → solve the quadratic for V
  const a = 1.5 / (2 * G), b = 32 * w.nu * L / (G * D * D), V = (-b + Math.sqrt(b * b + 4 * a * dz)) / (2 * a);
  assert.ok(Math.abs(r.Q - V * Math.PI * D * D / 4) / r.Q < 1e-6);
  assert.equal(r.steps.find(s => s.part === 'pipe').regime, 'laminar');
});

test('gravity drain, turbulent long pipe: within 2 % of the explicit Swamee–Jain flow formula', () => {
  const T = 20, w = water(T), D = 0.05, L = 2000, hf = 10, eps = 0.045e-3;
  const r = solveLine([{ type: 'source', surface: hf, outlet: 0, inlet: 'square' }, { type: 'pipe', D, L, material: 'steel', rise: 0 }, { type: 'sink', surface: 0 }], { temp: T });
  const k = Math.sqrt(G * D * hf / L), Qsj = -0.965 * D * D * k * Math.log(eps / (3.7 * D) + 1.784 * w.nu / (D * k));
  assert.ok(Math.abs(r.Q - Qsj) / Qsj < 0.02, `${r.Q} vs ${Qsj}`);
});

test('gauges: energy closes along the line and the pressure budget sums to the gauge difference', () => {
  const line = [{ type: 'source', surface: 8, outlet: 6, inlet: 'square' }, { type: 'pipe', D: 0.05, L: 20, material: 'gi', rise: -6 },
    { type: 'orifice', beta: 0.5 }, { type: 'pipe', D: 0.032, L: 10, material: 'gi', rise: 1 }, { type: 'valve', open: 0.75 }, { type: 'pipe', D: 0.05, L: 5, material: 'gi', rise: 0 }, { type: 'sink', surface: 2 }];
  const r = solveLine(line);
  assert.ok(Math.abs(r.closure) < 1e-6);
  for (const [a, b] of [[0, 1], [1, 2], [0, 4], [2, 5], [0, 5]]) { const x = budget(r, a, b); assert.ok(Math.abs(x.check) < 1e-6, `${a}-${b} ${x.check}`); }
  const kinds = budget(r, 0, 5).items.map(i => i.kind);
  assert.ok(kinds.includes('orifice') && kinds.includes('contraction') && kinds.includes('expansion'));
});

test('orifice plate: permanent loss follows ISO 5167-2 and is smaller than the tap differential', () => {
  const line = b => [{ type: 'source', surface: 5, outlet: 0, inlet: 'square' }, { type: 'pipe', D: 0.05, L: 10, material: 'pvc', rise: 0 }, { type: 'orifice', beta: b }, { type: 'pipe', D: 0.05, L: 10, material: 'pvc', rise: 0 }, { type: 'sink', surface: 0 }];
  const r = solveLine(line(0.5)), o = r.steps.find(s => s.part === 'orifice');
  const C = ORIFICE_C, b = 0.5, s = Math.sqrt(1 - b ** 4 * (1 - C * C));
  assert.ok(Math.abs(-o.dH / o.tapHead - (s - C * b * b) / (s + C * b * b)) < 1e-12);
  assert.ok(-o.dH < o.tapHead && -o.dH / o.tapHead > 0.6 && -o.dH / o.tapHead < 0.8);   // β 0.5: about 73 % unrecovered
  assert.ok(solveLine(line(0.3)).Q < r.Q, 'a smaller hole passes less flow');
});

test('unsupported setups are refused with a specific reason, never solved', () => {
  const src = { type: 'source', surface: 5, outlet: 0, inlet: 'square' }, pipe = { type: 'pipe', D: 0.05, L: 10, material: 'pvc', rise: 0 }, sink = { type: 'sink', surface: 0 };
  const code = l => { try { checkLine(l); solveLine(l); return 'ok'; } catch (e) { assert.ok(e instanceof LineError); assert.ok(e.message.length > 30); return e.code; } };
  assert.equal(code([]), 'empty');
  assert.equal(code([pipe, sink]), 'no-source');
  assert.equal(code([src, pipe]), 'no-sink');
  assert.equal(code([src, pipe, { type: 'tee' }, pipe, sink]), 'branch');
  assert.equal(code([src, pipe, { type: 'pump', rpm: 2900, D2: 0.13 }, pipe, { type: 'pump', rpm: 2900, D2: 0.13 }, sink]), 'two-pumps');
  assert.equal(code([src, pipe, sink, pipe, sink]), 'mid-reservoir');
  assert.equal(code([{ ...src, surface: 0 }, pipe, { ...sink, surface: 5 }]), 'reverse');
  assert.equal(code([src, { type: 'elbow' }, sink]), 'no-pipe');
  assert.equal(code([src, pipe, sink]), 'ok');
});
