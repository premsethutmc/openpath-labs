import assert from 'node:assert/strict';
import { test } from 'node:test';
import { water, friction, colebrook, pumpAt, operate, gradeLines, STOCK_PUMP, STOCK_SYSTEM, gateK, atmPressure } from './hydraulics.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('water properties match IAPWS tables', () => {
  near(water(20).rho, 998.21, 0.001, 'ρ 20 °C'); near(water(80).rho, 971.8, 0.001, 'ρ 80 °C');
  near(water(20).mu, 1.0016e-3, 0.01, 'μ 20 °C'); near(water(80).mu, 0.3544e-3, 0.02, 'μ 80 °C');
  near(water(20).pv, 2339, 0.01, 'pv 20 °C'); near(water(80).pv, 47414, 0.01, 'pv 80 °C'); near(water(100).pv, 101418, 0.01, 'pv 100 °C');
  near(atmPressure(2240), 77000, 0.01, 'air pressure at Ooty');
});

test('pipe friction factor: laminar, smooth (Blasius), rough (Moody chart)', () => {
  near(friction(1000, 0).f, 0.064, 1e-9, 'laminar');
  near(colebrook(1e5, 0), 0.316 / 1e5 ** 0.25, 0.03, 'Blasius');
  near(colebrook(1e5, 0.001), 0.0222, 0.01, 'Moody Re 1e5 ε/D 0.001');
  near(colebrook(1e7, 0.01), 0.038, 0.01, 'fully rough ε/D 0.01');
  assert.equal(friction(3000, 0.001).regime, 'transitional');
  assert.ok(gateK(1) < gateK(0.5) && gateK(0.5) < gateK(0.1));
});

test('pump obeys the affinity laws (hydraulic head and flow)', () => {
  const w = water(30), half = { ...STOCK_PUMP, rpm: STOCK_PUMP.rpm / 2 };
  for (const q of [0, 0.001, 0.003]) {
    const a = pumpAt(q, STOCK_PUMP, w), b = pumpAt(q / 2, half, w);
    near(b.H, a.H / 4, 1e-9, `H at ${q}`);
  }
  // backward-curved blades: shut-off power is the lowest power
  const p0 = pumpAt(0, STOCK_PUMP, w).Pshaft; assert.ok(p0 < pumpAt(0.003, STOCK_PUMP, w).Pshaft);
});

test('operating point: pump head equals system head; energy accounts close', () => {
  const op = operate(STOCK_SYSTEM);
  assert.ok(op.Q > 0.001 && op.Q < 0.006);
  const losses = op.suction.hf + op.suction.hm + op.delivery.hf + op.delivery.hm;
  near(op.H, op.staticHead + losses, 1e-6, 'energy balance');
  const g = gradeLines(STOCK_SYSTEM, op);
  near(g.at(-1).egl, STOCK_SYSTEM.tankHeight, 1e-4, 'energy line ends at the tank surface');
  assert.ok(op.delivery.regime === 'turbulent' && op.delivery.Re > 4000);
});

test('valves, pumps in parallel and series, lifts that are too high, cavitation', () => {
  const s = STOCK_SYSTEM, base = operate(s);
  const throttled = operate({ ...s, valveOpen: 0.1 });
  assert.ok(throttled.Q < base.Q && throttled.power < base.power, 'closing the valve cuts flow and power');
  const par = operate({ ...s, arrangement: 'parallel' });
  assert.ok(par.Q > base.Q && par.Q < 2 * base.Q, 'parallel: more flow, not double');
  const high = operate({ ...s, tankHeight: 45 });
  assert.ok(high.noFlow, 'single pump cannot lift 47 m');
  assert.ok(!operate({ ...s, tankHeight: 45, arrangement: 'series' }).noFlow, 'two in series can');
  const lift = { ...s, sumpLevel: -4 };
  assert.ok(!operate(lift).cavitating, 'cold water, 4 m lift: fine');
  assert.ok(operate({ ...lift, temp: 85 }).cavitating, 'hot water, same lift: cavitates');
  // doubling the delivery length cuts flow, by less than half
  const long = operate({ ...s, delivery: { ...s.delivery, L: 60 } });
  assert.ok(long.Q < base.Q && long.Q > 0.5 * base.Q);
});
