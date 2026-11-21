// Runs one slow simulation off the HTTP thread (1D gas dynamics bench, 2D flow probe).
import { workerData, parentPort } from 'node:worker_threads';
import { runPoint, setupForRunner, solverRunner, BENCH_STOCK } from '../engine-world/bench-setup.mjs';
import { probe } from '../engines/fluids/scenes.mjs';

try {
  const j = workerData;
  if (j.kind === 'bench') {
    const setup = setupForRunner(j.runner, { ...BENCH_STOCK, cam: j.cam });
    const r = runPoint(setup, j.rpm);
    parentPort.postMessage(r.valid ? {
      model: { name: '1D gas-dynamics engine test bench (Maruti Suzuki K12M-class 1.2 L, full throttle)', method: 'finite-volume pipes (MUSCL-HLL), 0D cylinders with Wiebe heat release and Woschni heat transfer; Chen–Flynn friction (modelled, not measured)',
        validity: 'one fitted constant at the published 113 N·m at 4500 rpm; the published 62.5 kW at 6000 rpm is a separate check (within 4 %). This does not validate the full curve or runner sensitivity.',
        notModelled: ['part throttle', 'measured friction', 'knock', 'species (residual gas vs fresh charge)'] },
      units: { torque: 'N·m', power: 'W', pressure: 'Pa', work: 'J', mass: 'kg' },
      inputs: { rpm: j.rpm, cam: j.cam, runnerLength: solverRunner(setup) },
      result: { converged: true, cycles: r.cycles, torque: r.torque, power: r.power, volumetricEfficiency: r.ve, imep: r.imep, fmep: r.fmep, bmep: r.bmep, valveEvents: r.valves,
        cylinder1: j.trace ? r.trace.theta.filter((_, i) => i % 5 === 0).map((th, k) => ({ crankAngle: th, pressure: r.trace.p[k * 5], volume: r.trace.V[k * 5] })) : undefined },
    } : { error: `did not converge in ${r.cycles} cycles — no result returned` });
  } else if (j.kind === 'probe') {
    const r = probe(j.scene, j.Re, { aoa: j.aoa });
    if (!r.healthy) parentPort.postMessage({ error: 'simulation became unstable — no result returned' });
    else parentPort.postMessage({
      model: { name: '2D flow past an object', method: 'lattice Boltzmann D2Q9 (two-relaxation-time), bounce-back walls, momentum-exchange forces', validity: 'Schäfer–Turek cylinder: Strouhal number correct; peak forces ~15 % high on this coarse grid', notModelled: ['3D effects', 'turbulence at everyday Reynolds numbers', 'compressibility'] },
      units: { coefficients: 'dimensionless' },
      inputs: { scene: j.scene, reynolds: j.Re, requestedReynolds: j.Re, aoaDeg: j.aoa },
      result: { reynolds: r.Re, gridLimited: !!r.limited, dragCoefficient: r.cd, liftCoefficientMean: r.clMean, liftCoefficientAmplitude: r.clAmp, speedRatio: r.speedRatio ?? null, pressureDrop: r.pressureDrop ?? null, centreOverMean: r.centreOverMean ?? null },
    });
  }
} catch (e) { parentPort.postMessage({ error: e.message }); }
