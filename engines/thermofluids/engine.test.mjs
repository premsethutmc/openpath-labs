import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OILS, viscosity, waltherFit, waltherNu, blend, ageOil, density } from './oil.mjs';
import { ENGINE, cycle, ottoEfficiency, displacement, cylinderVolume, operatingPoint, bearing, ocvirkLoad, cranking, oilPressureDelay, soak, warmUp, rodLoad } from './engine.mjs';
import { piston, pistonMotion } from '../motion/crank.mjs';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} ${a} vs ${b}`);

test('crank kinematics: TDC/BDC, stroke, velocity is the derivative of position', () => {
  const r = 0.0358, l = 0.128;
  near(piston(0, r, l).disp + 1, 1, 1e-12); near(piston(Math.PI, r, l).disp, 2 * r, 1e-12);
  const h = 1e-6, th = 0.7, rpm = 3000, w = rpm * Math.PI / 30;
  near(pistonMotion(th, r, l, rpm).v, (piston(th + h, r, l).disp - piston(th - h, r, l).disp) / (2 * h) * w, 1e-6);
  near(pistonMotion(th, r, l, rpm).a, (pistonMotion(th + h, r, l, rpm).v - pistonMotion(th - h, r, l, rpm).v) / (2 * h) * w, 1e-5);
  // TDC acceleration r·ω²(1 + r/l)
  near(pistonMotion(0, r, l, rpm).a, r * w * w * (1 + r / l), 1e-9); // TDC: r·ω²(1 + r/l), measured downward
});

test('geometry: 1.2 L displacement and compression ratio', () => {
  near(displacement() * 1000, 1.199, 0.002);
  near(cylinderVolume(Math.PI) / cylinderVolume(0), ENGINE.cr, 1e-9);
});

test('cycle model reduces to the ideal Otto cycle (instant burn, no wall loss)', () => {
  const c = cycle({ instant: true, wallLoss: 0, gamma: 1.4 });
  near(c.etaIndicated / 0.95, ottoEfficiency(ENGINE.cr, 1.4), 0.015); // 0.95 = combustion efficiency
});

test('realistic full-load behaviour of the reference engine', () => {
  const op = operatingPoint({ rpm: 6000, throttle: 1, oil: OILS['5W-30'], oilTemp: 95 });
  assert.ok(op.power > 50e3 && op.power < 75e3, `power ${op.power}`);
  assert.ok(op.pmax > 45e5 && op.pmax < 80e5, `pmax ${op.pmax}`);
  assert.ok(op.thPmax > 8 && op.thPmax < 25, 'peak pressure 8–25° after TDC');
  assert.ok(op.efficiency > 0.25 && op.efficiency < 0.4);
  const cold = operatingPoint({ rpm: 1500, throttle: 0.3, oil: OILS['5W-30'], oilTemp: 0 });
  const warm = operatingPoint({ rpm: 1500, throttle: 0.3, oil: OILS['5W-30'], oilTemp: 90 });
  assert.ok(cold.fmep > 2 * warm.fmep, 'cold oil roughly doubles-plus friction');
});

test('oil: Walther fit reproduces the data points; blending stays between the parents; ageing thickens', () => {
  for (const o of Object.values(OILS)) {
    const fit = waltherFit(o.kv40, o.kv100);
    near(waltherNu(fit, 40), o.kv40, 1e-9); near(waltherNu(fit, 100), o.kv100, 1e-9);
    near(viscosity(o, 40).mu, o.kv40 * density(40), 1e-9);
  }
  const b = blend(OILS['0W-20'], OILS['20W-50'], 0.5);
  assert.ok(b.kv40 > OILS['0W-20'].kv40 && b.kv40 < OILS['20W-50'].kv40);
  assert.ok(viscosity(ageOil(OILS['5W-30'], 1.25), 100).mu > viscosity(OILS['5W-30'], 100).mu);
  assert.equal(viscosity(OILS['20W-50'], -25).gelled, true);
  assert.equal(viscosity(OILS['5W-30'], -10).band, 'approximate');
});

test('cold cranking follows SAE J300 design intent', () => {
  for (const o of Object.values(OILS).filter(o => o.ccs)) {
    const at = cranking({ oil: o, T: o.ccs.T });
    assert.ok(at.starts && at.rpm < 170, `${o.name} cranks slowly but starts at its rated temperature (${at.rpm.toFixed(0)} rpm)`);
  }
  assert.equal(cranking({ oil: OILS['20W-50'], T: -35 }).starts, false);
  assert.equal(cranking({ oil: OILS['0W-20'], T: -35 }).starts, true);
  assert.ok(cranking({ oil: OILS['5W-30'], T: 25 }).rpm > 200);
  assert.ok(oilPressureDelay({ oil: OILS['5W-30'], T: -35 }).seconds > 5 * oilPressureDelay({ oil: OILS['5W-30'], T: 25 }).seconds);
});

test('Ocvirk bearing: inverse solution, thinner film when oil is thinner or the load higher', () => {
  const b = ENGINE.rodBearing, U = 3000 * Math.PI / 30 * b.D / 2;
  const W = ocvirkLoad(0.8, 0.01, U, b);
  near(bearing({ load: W, rpm: 3000, muCp: 10 }).eps, 0.8, 1e-6);
  const hot = bearing({ load: 15000, rpm: 1500, muCp: 5 }), thick = bearing({ load: 15000, rpm: 1500, muCp: 15 });
  assert.ok(thick.hmin > hot.hmin);
  assert.ok(bearing({ load: 30000, rpm: 1500, muCp: 5 }).hmin < hot.hmin);
  const op = operatingPoint({ rpm: 3000, throttle: 1, oil: OILS['5W-30'], oilTemp: 95 });
  assert.ok(rodLoad(op) > 10000);
});

test('temperatures: a parked engine reaches ambient in days; idle warm-up takes minutes', () => {
  near(soak(90, -35, 96), -35, 1e-6);
  const w = warmUp(-35, -35, 3600);
  assert.ok(w.reached > 600 && w.reached < 3600, `${w.reached} s`);
});
