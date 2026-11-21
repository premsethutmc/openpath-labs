// Regenerates engine-world/bench-reference.mjs from the 1D gas-dynamics model.
import { simulate } from '../engines/thermofluids/gasdyn.mjs';
const out = [];
for (let rpm = 1000; rpm <= 7000; rpm += 500) { const r = simulate(rpm); out.push({ rpm, torque: +r.torque.toFixed(1), power: +(r.power / 1000).toFixed(2), ve: +r.ve.toFixed(3) }); }
console.log('// Precomputed full-load curve of the 1D gas-dynamics model (engines/thermofluids/gasdyn.mjs) for the stock K12M setup.');
console.log('// Regenerate: node tools/bench-curve.mjs > engine-world/bench-reference.mjs');
console.log('export const BENCH_REFERENCE = ' + JSON.stringify(out) + ';');
