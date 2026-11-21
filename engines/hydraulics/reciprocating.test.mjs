import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recip, STOCK_RECIP as P } from './reciprocating.mjs';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('discharge: Q = A·L·N/60, doubled when double-acting, slip from Cd', () => {
  const r = recip(P), A = Math.PI * 0.1 ** 2 / 4;
  near(r.Qth, A * 0.2 * 60 / 60, 1e-12, 'Qth'); near(r.Q, 0.95 * r.Qth, 1e-12, 'slip');
  near(recip({ ...P, acting: 'double' }).Qth, 2 * r.Qth, 1e-12, 'double-acting');
  near(recip({ ...P, rpm: 120 }).Qth, 2 * r.Qth, 1e-12, 'positive displacement: Q ∝ N');
});

test('acceleration head ha = (L/g)(A/a)ω²r, largest at the start of each stroke', () => {
  const r = recip(P), om = 2 * Math.PI;
  near(r.suction.haMax, 4 / 9.81 * (0.1 / 0.075) ** 2 * om * om * 0.1, 1e-9, 'suction ha');
  const suc = r.diagram.filter(q => q.th <= 180), lowest = suc.reduce((a, b) => (b.h < a.h ? b : a));
  assert.equal(lowest.th, 0, 'lowest cylinder pressure at the start of suction');
});

test('indicator-diagram area equals the textbook power formula (2/3 of peak friction)', () => {
  for (const q of [P, { ...P, acting: 'double' }, { ...P, vesselS: true, vesselD: true }, { ...P, rpm: 90, hs: 5 }]) {
    const r = recip(q); near(r.power, r.powerFormula, 0.002, `power ${JSON.stringify({ a: q.acting, v: q.vesselS, n: q.rpm })}`);
  }
});

test('air vessels save 84.8 % (single-acting) and 39.2 % (double-acting) of friction work', () => {
  for (const [acting, saving] of [['single', 0.848], ['double', 0.392]]) {
    const a = recip({ ...P, acting }), b = recip({ ...P, acting, vesselD: true });
    near(1 - b.delivery.hfVessel / (2 / 3 * a.delivery.hfMax), saving, 0.005, `${acting} saving`);
  }
});

test('separation: fine at 60 rpm, separates when speed doubles; air vessel removes it', () => {
  assert.ok(!recip(P).separation);
  const fast = recip({ ...P, rpm: 120 });
  assert.ok(fast.separation && fast.separationWhere === 'suction');
  const r = recip(P); assert.ok(r.sepRpm > 60 && r.sepRpm < 120);
  assert.ok(!recip({ ...P, rpm: 120, vesselS: true, vesselD: true }).separation);
});
