// The 1D test bench as used by Engine World: how the learner's setup reaches the solver, how one run is packaged
// for the "From cylinder work to shaft power" experiment, and how two runs are compared.
// Nothing here changes the solver; it only maps inputs and post-processes one run's own output.
import { simulate, K12M } from '../engines/thermofluids/gasdyn.mjs';

// The learner's changes are applied as differences from the stock setup, so "Stock" runs the calibrated K12M exactly.
export const BENCH_STOCK = { cam: { duration: 240, lift: 8, centre: 105 }, runner: 0.35 };
// Which inputs reach the 1D bench. Everything else in Engine World (oil, temperatures, spark, mixture, fuel, boost,
// assembly choices) changes only the fast model.
export const BENCH_INPUTS = ['cam duration', 'cam lift', 'lobe centre', 'intake runner length'];

// The learner-facing runner value is offset from the solver's (the calibrated K12M runner is 0.34 m while the
// Engine World stock setting is 0.35). Always show learners the length the solver actually uses.
export const solverRunner = setup => engineFor(setup).runner.L;
export const setupForRunner = (L, base = BENCH_STOCK) => ({ ...base, runner: +(L + (base.runner - K12M.runner.L)).toFixed(4) });

export function engineFor({ cam, runner }) {
  const d = { duration: cam.duration - BENCH_STOCK.cam.duration, lift: (cam.lift - BENCH_STOCK.cam.lift) / 1000, centre: cam.centre - BENCH_STOCK.cam.centre };
  return {
    intake: { ...K12M.intake, duration: K12M.intake.duration + d.duration, lift: K12M.intake.lift + d.lift, centre: K12M.intake.centre + d.centre },
    exhaust: { ...K12M.exhaust, duration: K12M.exhaust.duration + d.duration, lift: K12M.exhaust.lift + d.lift, centre: K12M.exhaust.centre + d.centre },
    runner: { ...K12M.runner, L: Math.max(0.1, K12M.runner.L + (runner - BENCH_STOCK.runner)) },
  };
}

// Net indicated work of cylinder 1 from its own p and V over the converged cycle, with the same left-point rule
// the solver uses for the piston work (p at the start of each step × dV).
export function loopWork(tr) {
  let W = 0;
  for (let i = 1; i < tr.V.length; i++) W += tr.cyl[i - 1] * (tr.V[i] - tr.V[i - 1]);
  return W;
}

// Work → IMEP → (modelled friction) → BMEP → torque → power, with every intermediate value.
export function chain(r) {
  const Wavg = r.works.reduce((a, b) => a + b, 0) / r.works.length;
  const imep = Wavg / r.Vd, fmep = r.fmep, bmep = imep - fmep;
  const torque = bmep * r.Vd * r.cylinders / (4 * Math.PI), omega = 2 * Math.PI * r.rpm / 60;
  return { Wavg, imep, fmep, bmep, torque, omega, power: torque * omega, Vd: r.Vd, cylinders: r.cylinders };
}

const interp = (xs, ys, x) => {
  let i = xs.findIndex(v => v >= x); if (i <= 0) return ys[Math.max(0, i)]; if (i < 0) return ys.at(-1);
  const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
};

// One bench run packaged for the experiment. A run that has not converged carries no numbers and no traces.
export function runPoint(setup, rpm, opts = {}) {
  const r = simulate(rpm, { engine: engineFor(setup), maxCycles: opts.maxCycles });
  const base = { rpm, setup: JSON.parse(JSON.stringify(setup)), cycles: r.cycles, converged: r.converged };
  if (!r.converged || !r.works || r.traces.theta.length < 100) return { ...base, valid: false };
  const t = r.traces, c = chain(r), Wloop = loopWork(t);
  // resample cylinder 1's cycle at 1° for drawing and scrubbing (values from this run only)
  const deg = Array.from({ length: 720 }, (_, i) => i + 0.5);
  const th = t.theta.map(v => (v >= 720 ? v - 720 : v));
  const order = th.map((v, i) => i).sort((a, b) => th[a] - th[b]);
  const xs = order.map(i => th[i]), pick = key => order.map(i => t[key][i]);
  const cols = { p: pick('cyl'), V: pick('V'), liftI: pick('liftI'), liftE: pick('liftE'), runner: pick('runner') };
  const trace = { theta: deg };
  for (const [k, ys] of Object.entries(cols)) trace[k] = deg.map(x => interp(xs, ys, x));
  const ivc = r.valves.ivc % 720;
  const nearIVC = deg.filter(x => x > ivc - 60 && x <= ivc).map(x => interp(xs, cols.runner, x));
  return {
    ...base, valid: true, ve: r.ve, works: r.works, Wloop, Vd: r.Vd, cylinders: r.cylinders, valves: r.valves,
    ...c, solverTorque: r.torque, solverPower: r.power,
    runnerBeforeIVC: nearIVC.reduce((a, b) => a + b, 0) / nearIVC.length, trace,
  };
}

// A/B comparison: only valid when both runs converged and share every input except the one being tested.
export function compare(A, B) {
  if (!A?.valid || !B?.valid) return { ok: false, reason: `${!A?.valid ? 'Run A' : 'Run B'} did not converge — it is not plotted or compared.` };
  if (A.rpm !== B.rpm) return { ok: false, reason: 'Runs were made at different speeds.' };
  const changed = [];
  if (JSON.stringify(A.setup.cam) !== JSON.stringify(B.setup.cam)) changed.push('cam');
  if (A.setup.runner !== B.setup.runner) changed.push('runner');
  if (changed.length !== 1 || changed[0] !== 'runner') return { ok: false, reason: 'Only the intake runner length may differ between Run A and Run B.' };
  const d = k => ({ a: A[k], b: B[k], rel: (B[k] - A[k]) / Math.abs(A[k]) });
  return { ok: true, ve: d('ve'), imep: d('imep'), fmep: d('fmep'), bmep: d('bmep'), torque: d('torque'), power: d('power'), runnerBeforeIVC: d('runnerBeforeIVC'), Wavg: d('Wavg') };
}
