import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Tunnel, shapes } from './lbm.mjs';
import { probe, build, venturiThroatX, sectionMean } from './scenes.mjs';

test('Poiseuille flow: centre speed matches F·H²/8ν within 1 %', () => {
  const ny = 34, H = ny - 2, nu = 0.1, F = 2e-6;
  const t = new Tunnel(6, ny, { nu, u0: 0, walls: 'walls', profile: 'none', force: F, periodicX: true });
  t.step(20000);
  const umax = Math.max(...Array.from({ length: ny }, (_, y) => t.ux[y * 6 + 3]));
  assert.ok(Math.abs(umax / (F * H * H / (8 * nu)) - 1) < 0.01, `${umax}`);
});

test('a closed periodic box conserves mass', () => {
  const t = new Tunnel(40, 30, { nu: 0.05, u0: 0, walls: 'walls', profile: 'none', periodicX: true });
  t.paint(shapes.circle(20, 15, 5), 2);
  for (let k = 0; k < t.rho.length; k++) if (!t.solid[k]) t.setEq(k, 1 + 0.01 * Math.sin(k), 0.02 * Math.cos(k), 0);
  const mass = () => { let m = 0; for (let k = 0; k < t.rho.length; k++) if (!t.solid[k]) for (let i = 0; i < 9; i++) m += t.f[9 * k + i]; return m; };
  const m0 = mass(); t.step(500);
  assert.ok(Math.abs(mass() / m0 - 1) < 1e-6);
});

test('channel flow: laminar profile centre ≈ 1.5 × mean (2D)', () => {
  const r = probe('pipe', 40);
  assert.ok(Math.abs(r.centreOverMean - 1.5) < 0.03, `${r.centreOverMean}`);
});

test('venturi: continuity and Bernoulli', () => {
  const { t } = build('venturi', 40, { ny: 48, maxNy: 72, u: 0.1 });
  const xt = venturiThroatX(t.nx);
  let open = 0; for (let y = 1; y < t.ny - 1; y++) if (!t.solid[y * t.nx + xt]) open++;
  const areaRatio = (t.ny - 2) / open;
  const r = probe('venturi', 40);
  assert.ok(r.speedRatio > 0.85 * areaRatio && r.speedRatio < 1.25 * areaRatio, `speed ratio ${r.speedRatio} vs area ratio ${areaRatio}`);
  assert.ok(r.pressureDrop > 0, 'pressure falls where the flow speeds up');
});

test('cylinder: steady wake at Re 20, vortex shedding at Re 100; a wing at positive angle lifts', () => {
  const low = probe('cylinder', 20), high = probe('cylinder', 100);
  assert.ok(low.clAmp < 0.05 && high.clAmp > 0.2, `${low.clAmp} ${high.clAmp}`);
  assert.ok(low.cd > high.cd, 'drag coefficient falls as Re rises');
  assert.ok(probe('wing', 150, { aoa: 6 }).clMean > 0.1);
  assert.ok(probe('wing', 150, { aoa: 6 }).cd < probe('cylinder', 150).cd, 'streamlined shape: far less drag');
  assert.ok(build('cylinder', 5000).limited, 'unrealistic 2D Reynolds numbers are capped and reported');
});
