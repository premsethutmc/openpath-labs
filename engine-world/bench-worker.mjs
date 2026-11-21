// Runs the 1D gas-dynamics test bench off the main thread.
import { simulate } from '../engines/thermofluids/gasdyn.mjs';
import { engineFor, runPoint } from './bench-setup.mjs';

self.onmessage = ({ data }) => {
  if (data.kind === 'point') {
    const r = simulate(data.rpm, { engine: engineFor(data.setup) });
    // send one cycle of traces, thinned for drawing
    const k = Math.max(1, Math.floor(r.traces.theta.length / 360));
    const pick = a => a.filter((_, i) => i % k === 0);
    self.postMessage({ kind: 'point', rpm: data.rpm, torque: r.torque, power: r.power / 1000, ve: r.ve, imep: r.imep, converged: r.converged,
      traces: { theta: pick(r.traces.theta), cyl: pick(r.traces.cyl), runner: pick(r.traces.runner) } });
  } else if (data.kind === 'curve') {
    for (let rpm = 1000; rpm <= 7000; rpm += 500) {
      const r = simulate(rpm, { engine: engineFor(data.setup) });
      self.postMessage({ kind: 'curvePoint', rpm, torque: r.torque, power: r.power / 1000, ve: r.ve, converged: r.converged });
    }
    self.postMessage({ kind: 'curveDone' });
  } else if (data.kind === 'shaft') {
    // "From cylinder work to shaft power": one packaged run (or an unconverged marker), echoed with its label.
    self.postMessage({ kind: 'shaft', label: data.label, run: runPoint(data.setup, data.rpm, { maxCycles: data.maxCycles }) });
  }
};
