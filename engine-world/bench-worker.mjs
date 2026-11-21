// Runs the 1D gas-dynamics test bench off the main thread.
import { simulate, K12M } from '../engines/thermofluids/gasdyn.mjs';

// The learner's changes are applied as differences from the stock setup, so "Stock" runs the calibrated K12M exactly.
const STOCK = { duration: 240, lift: 8, centre: 105, runner: 0.35 };
const engineFor = ({ cam, runner }) => {
  const d = { duration: cam.duration - STOCK.duration, lift: (cam.lift - STOCK.lift) / 1000, centre: cam.centre - STOCK.centre };
  return {
    intake: { ...K12M.intake, duration: K12M.intake.duration + d.duration, lift: K12M.intake.lift + d.lift, centre: K12M.intake.centre + d.centre },
    exhaust: { ...K12M.exhaust, duration: K12M.exhaust.duration + d.duration, lift: K12M.exhaust.lift + d.lift, centre: K12M.exhaust.centre + d.centre },
    runner: { ...K12M.runner, L: Math.max(0.1, K12M.runner.L + (runner - STOCK.runner)) },
  };
};

self.onmessage = ({ data }) => {
  const engine = engineFor(data.setup);
  if (data.kind === 'point') {
    const r = simulate(data.rpm, { engine });
    // send one cycle of traces, thinned for drawing
    const k = Math.max(1, Math.floor(r.traces.theta.length / 360));
    const pick = a => a.filter((_, i) => i % k === 0);
    self.postMessage({ kind: 'point', rpm: data.rpm, torque: r.torque, power: r.power / 1000, ve: r.ve, imep: r.imep, converged: r.converged,
      traces: { theta: pick(r.traces.theta), cyl: pick(r.traces.cyl), runner: pick(r.traces.runner) } });
  } else if (data.kind === 'curve') {
    for (let rpm = 1000; rpm <= 7000; rpm += 500) {
      const r = simulate(rpm, { engine });
      self.postMessage({ kind: 'curvePoint', rpm, torque: r.torque, power: r.power / 1000, ve: r.ve });
    }
    self.postMessage({ kind: 'curveDone' });
  }
};
