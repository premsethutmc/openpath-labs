import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../engines/thermofluids/gasdyn.mjs';
import { BENCH_STOCK, engineFor, runPoint, chain, loopWork, compare, solverRunner, setupForRunner } from './bench-setup.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('baseline unchanged: recording traces for the experiment leaves the solver output unchanged', () => {
  // values recorded on main (commit c124848) before this branch touched the solver; tolerance 1e-9 relative so the
  // check is portable across Node/V8 versions (floating-point order of evaluation), far below any physical change
  const base = { 2500: 100.975972013305, 4500: 112.96149220597019 };
  near(simulate(4500).torque, base[4500], 1e-9, '4500 rpm');
  near(simulate(2500).torque, base[2500], 1e-9, '2500 rpm');
  // the stock learner setup maps to the calibrated K12M exactly (same run, same code path: identical)
  assert.equal(simulate(4500, { engine: engineFor(BENCH_STOCK) }).torque, simulate(4500).torque);
  assert.equal(runPoint(BENCH_STOCK, 4500).torque, simulate(4500).torque);
  assert.equal(solverRunner(BENCH_STOCK), 0.34, 'calibrated K12M runner length');
  near(solverRunner(setupForRunner(0.24)), 0.24, 1e-9, 'learner length → solver length');
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

test('intake-event evidence: guided lesson and a longer runner are judged from the data, with "inconclusive" when mixed', async () => {
  const { intakeEvidence, judge } = await import('./bench-setup.mjs');
  const pair = (L, rpm) => ({ A: runPoint(BENCH_STOCK, rpm), B: runPoint(setupForRunner(L), rpm) });
  const g45 = pair(0.24, 4500), g60 = pair(0.24, 6000), l60 = pair(0.50, 6000);
  // guided lesson: late-intake pressure, filling, work and torque move together at both speeds
  assert.equal(judge([g45, g60]).verdict, 'wave');
  // a single crank angle is not decisive: 34 → 50 cm at 6000 rpm leaves pressure near BDC unchanged while torque falls
  assert.ok(Math.abs(l60.B.trace.runner[540] - l60.A.trace.runner[540]) < 0.01e5);
  assert.ok(l60.B.torque < 0.9 * l60.A.torque);
  assert.ok(intakeEvidence(l60.B).late < intakeEvidence(l60.A).late - 0.02e5, 'late-intake pressure does move');
  // the whole-event average alone would mislead at 6000 rpm with 24 cm (changes < 0.01 bar while filling rises)
  assert.ok(Math.abs(judge([g60]).rows[0].dWhole) < 0.01e5 && g60.B.ve > g60.A.ve + 0.05);
  // mixed evidence → inconclusive (constructed: flip one run's late pressure so it disagrees with filling)
  const flipped = JSON.parse(JSON.stringify(g45)); flipped.B.trace.runner = flipped.A.trace.runner.map(p => p + 0.1e5);
  assert.equal(judge([flipped, g60]).verdict, 'inconclusive');
});

test('valve airflow: signed flow integrates to the solver’s own air count, mass balances through the exhaust, and locates the change', async () => {
  const { airShift } = await import('./bench-setup.mjs');
  for (const rpm of [2500, 4500, 6000]) {
    const r = runPoint(BENCH_STOCK, rpm);
    near(r.air.net, r.air.solverNet, 1e-9, `${rpm}: ∫ signed intake flow = solver air count`);
    near(r.air.exhaust, r.air.net * (1 + 1 / 14.7), 0.01, `${rpm}: exhaust mass = air + fuel (λ = 1)`);
    assert.ok(r.air.fwd > r.air.net && r.air.backEarly > 0, 'some gas flows back into the runner during overlap');
    assert.equal(r.trace.mIn.length, 720);
  }
  // guided lesson: at both speeds the change is mostly in the forward flow, not in backflow
  for (const rpm of [4500, 6000]) assert.equal(airShift(runPoint(BENCH_STOCK, rpm), runPoint(setupForRunner(0.24), rpm)).where, 'forward');
});
