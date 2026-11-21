import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../engines/thermofluids/gasdyn.mjs';
import { BENCH_STOCK, engineFor, runPoint, chain, loopWork, compare } from './bench-setup.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('baseline unchanged: recording traces for the experiment leaves the solver output bit-for-bit identical', () => {
  // values recorded on main (commit c124848) before this branch touched the solver
  assert.equal(simulate(4500).torque, 112.96149220597019);
  assert.equal(simulate(2500).torque, 100.975972013305);
  // the stock learner setup maps to the calibrated K12M exactly
  assert.equal(simulate(4500, { engine: engineFor(BENCH_STOCK) }).torque, 112.96149220597019);
  assert.equal(runPoint(BENCH_STOCK, 4500).torque, 112.96149220597019);
});

test('work → power: the p–V loop, IMEP, BMEP, torque and power are one consistent chain from a single run', () => {
  for (const rpm of [2500, 4500, 6000]) {
    const r = simulate(rpm), c = chain(r);
    near(loopWork(r.traces), r.works[0], 0.001, `${rpm}: ∮p dV of cylinder 1 equals the solver's cylinder-1 work`);
    near(c.imep, r.imep, 1e-12, `${rpm}: IMEP = W / Vd`);
    near(c.bmep, r.imep - r.fmep, 1e-12, `${rpm}: BMEP = IMEP − FMEP`);
    near(c.torque, r.torque, 1e-12, `${rpm}: T = BMEP·Vd·z / 4π`);
    near(c.power, r.power, 1e-12, `${rpm}: P = T·ω`);
    near(c.power, c.bmep * c.Vd * c.cylinders * rpm / 120, 1e-12, `${rpm}: P = BMEP·V_total·N/120 (four-stroke)`);
  }
  // packaged run: trace resampled from the same run, volume spans clearance to full cylinder
  const p = runPoint(BENCH_STOCK, 4500);
  assert.equal(p.trace.theta.length, 720);
  near(Math.max(...p.trace.V) / Math.min(...p.trace.V), 11.0, 0.01, 'compression ratio from the trace');
});

test('non-convergence: an unconverged run carries no numbers and cannot be compared or plotted', () => {
  const bad = runPoint(BENCH_STOCK, 4500, { maxCycles: 2 });
  assert.equal(bad.converged, false); assert.equal(bad.valid, false);
  assert.equal(bad.torque, undefined); assert.equal(bad.trace, undefined);
  const good = runPoint(BENCH_STOCK, 4500);
  const cmp = compare(good, bad);
  assert.equal(cmp.ok, false); assert.match(cmp.reason, /Run B did not converge/);
});

test('A/B comparison is controlled: only the runner may differ, speed fixed; baseline object not mutated', () => {
  const A = runPoint(BENCH_STOCK, 4500), snapshot = JSON.stringify(A);
  const B = runPoint({ ...BENCH_STOCK, runner: 0.55 }, 4500);
  const cmp = compare(A, B);
  assert.ok(cmp.ok);
  assert.equal(cmp.fmep.rel, 0, 'same speed: modelled friction identical');
  assert.equal(JSON.stringify(A), snapshot, 'Run A unchanged after Run B');
  assert.equal(compare(A, runPoint({ ...BENCH_STOCK, cam: { ...BENCH_STOCK.cam, lift: 9 } }, 4500)).ok, false, 'cam change rejected');
  assert.equal(compare(A, runPoint(BENCH_STOCK, 3000)).ok, false, 'speed change rejected');
});
