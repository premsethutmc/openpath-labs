// Pump set drive check — one saved project: pipework, pump, operating speed, required flow, motor.
// The pump side is Pump House's solver (engines/hydraulics/hydraulics.mjs) unchanged; this file adds only the
// project record, two separate verdicts and saved runs.
//
// Steady-state sizing check: the operating speed is an input (direct-coupled drive). It does not predict starting,
// acceleration, or the speed an overloaded motor would settle at. Motor ratings are continuous (S1) shaft output,
// not electrical input.
import { operate, STOCK_SYSTEM, STOCK_PUMP, MATERIALS as PIPE_MATERIALS } from '../engines/hydraulics/hydraulics.mjs';

export const VERSION = 1;

// Illustrative 50 Hz induction motors. Outputs follow the IEC 60072-1 standard series; each rating is continuous
// (duty S1) shaft output and holds only inside the stated speed band (synchronous speed down to typical full-load
// speed). Not a manufacturer's data sheet; service factor taken as 1.0.
export const MOTORS = [
  { id: '2p-0.75', name: '0.75 kW, 2-pole', rated: 750, speed: [2800, 3000] },
  { id: '2p-1.1', name: '1.1 kW, 2-pole', rated: 1100, speed: [2800, 3000] },
  { id: '2p-1.5', name: '1.5 kW, 2-pole', rated: 1500, speed: [2800, 3000] },
  { id: '2p-2.2', name: '2.2 kW, 2-pole', rated: 2200, speed: [2800, 3000] },
  { id: '2p-3.0', name: '3.0 kW, 2-pole', rated: 3000, speed: [2800, 3000] },
  { id: '4p-1.5', name: '1.5 kW, 4-pole', rated: 1500, speed: [1400, 1500] },
  { id: '4p-2.2', name: '2.2 kW, 4-pole', rated: 2200, speed: [1400, 1500] },
];
export const PIPES = PIPE_MATERIALS;

export class InputError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));
const inRange = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new InputError(`${what} must be between ${lo} and ${hi}`); return v; };

// ---------- the project ----------
// Defaults = Pump House's stock installation; a scratch project starts here and every field is editable.
export function newProject(name = 'My pump set') {
  return {
    version: VERSION, name,
    system: { temp: STOCK_SYSTEM.temp, altitude: 0, sumpLevel: STOCK_SYSTEM.sumpLevel, tankHeight: STOCK_SYSTEM.tankHeight, valveOpen: 1,
      suction: { ...STOCK_SYSTEM.suction }, delivery: { ...STOCK_SYSTEM.delivery } },
    pump: { rpm: STOCK_PUMP.rpm, D2: STOCK_PUMP.D2 },
    requiredFlow: 2.0,           // L/s
    motorId: '2p-1.5',
    runs: [],
  };
}
// A preset is a list of the same edits a person would make, applied to a new project.
export const PRESETS = [
  { id: 'tank4', name: 'Overhead tank, 4-storey building', edits: [['setTarget', 2.0], ['setMotor', '2p-1.5']] },
  { id: 'farm', name: 'Farm sump to field channel', edits: [['setSystem', { tankHeight: 6, sumpLevel: -4 }], ['setPipe', 'delivery', { D: 0.05, L: 60, material: 'pvc', elbows: 3 }],
    ['setTarget', 3.0], ['setMotor', '2p-2.2']] },
];
export function projectFromPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) throw new InputError('no such preset');
  const proj = newProject(p.name);
  for (const [fn, ...args] of p.edits) EDITS[fn](proj, ...args);
  return proj;
}

// Setters validate everything first and change nothing if any value is refused.
export function setSystem(proj, v) {
  const n = { ...proj.system };
  if (v.tankHeight !== undefined) n.tankHeight = inRange(v.tankHeight, 0, 60, 'delivery height (m)');
  if (v.sumpLevel !== undefined) n.sumpLevel = inRange(v.sumpLevel, -7, 10, 'water level relative to pump (m)');
  if (v.temp !== undefined) n.temp = inRange(v.temp, 1, 90, 'water temperature (°C)');
  if (v.valveOpen !== undefined) n.valveOpen = inRange(v.valveOpen, 0.05, 1, 'valve opening');
  proj.system = n;
}
export function setPipe(proj, which, v) {
  if (which !== 'suction' && which !== 'delivery') throw new InputError('pipe must be suction or delivery');
  const p = { ...proj.system[which] };
  if (v.D !== undefined) p.D = inRange(v.D, 0.015, 0.15, 'pipe bore (m)');
  if (v.L !== undefined) p.L = inRange(v.L, 0.5, 500, 'pipe length (m)');
  if (v.elbows !== undefined) { p.elbows = inRange(v.elbows, 0, 20, 'elbows'); if (!Number.isInteger(p.elbows)) throw new InputError('elbows must be a whole number'); }
  if (v.material !== undefined) { if (!PIPE_MATERIALS[v.material]) throw new InputError('unknown pipe material'); p.material = v.material; }
  proj.system = { ...proj.system, [which]: p };
}
export function setPump(proj, v) {
  const n = { ...proj.pump };
  if (v.rpm !== undefined) n.rpm = inRange(v.rpm, 1000, 3600, 'operating speed (rpm)');
  if (v.D2 !== undefined) n.D2 = inRange(v.D2, 0.1, 0.16, 'impeller diameter (m)');
  proj.pump = n;
}
export const setTarget = (proj, Lps) => { proj.requiredFlow = inRange(Lps, 0.1, 20, 'required flow (L/s)'); };
export const setMotor = (proj, id) => { if (!MOTORS.some(m => m.id === id)) throw new InputError('unknown motor'); proj.motorId = id; };
const EDITS = { setSystem, setPipe, setPump, setTarget, setMotor };

// ---------- physics and verdicts ----------
export const torqueOf = (powerW, rpm) => powerW / (2 * Math.PI * rpm / 60);   // T = P / ω

export function evaluate(proj) {
  const s = { ...STOCK_SYSTEM, ...clone(proj.system), arrangement: 'single' };
  const pump = { ...STOCK_PUMP, ...proj.pump };
  const op = operate(s, pump);
  const motor = MOTORS.find(m => m.id === proj.motorId);
  const rpm = pump.rpm, Q = op.Q * 1000;                    // L/s
  const required = op.power, torque = torqueOf(required, rpm);

  // Verdict 1 — hydraulic: does the installation deliver the required flow?
  const flow = op.noFlow ? { pass: false, reason: 'no flow: the pump cannot lift water to this height at this speed' }
    : op.cavitating ? { pass: false, reason: 'the pump is cavitating: the flow figure is not reliable' }
    : Q >= proj.requiredFlow ? { pass: true, reason: `delivers ${Q.toFixed(2)} L/s against ${proj.requiredFlow} L/s required` }
    : { pass: false, reason: `delivers ${Q.toFixed(2)} L/s, ${(proj.requiredFlow - Q).toFixed(2)} L/s short of ${proj.requiredFlow} L/s` };
  Object.assign(flow, { delivered: Q, required: proj.requiredFlow });

  // Verdict 2 — drive: can this motor continuously supply the shaft power the pump takes at this speed?
  let drive;
  if (rpm < motor.speed[0] || rpm > motor.speed[1]) drive = { state: 'not-applicable', pass: null, reason: `this motor's rating holds between ${motor.speed[0]} and ${motor.speed[1]} rpm, not at ${rpm} rpm` };
  else {
    const margin = (motor.rated - required) / motor.rated;
    drive = { state: required <= motor.rated ? 'pass' : 'fail', pass: required <= motor.rated, margin,
      reason: required <= motor.rated ? `needs ${(required / 1000).toFixed(3)} kW of ${motor.rated / 1000} kW rated (${(margin * 100).toFixed(1)} % spare)`
        : `needs ${(required / 1000).toFixed(3)} kW, ${((required - motor.rated) / 1000).toFixed(3)} kW over the ${motor.rated / 1000} kW rating` };
  }
  Object.assign(drive, { motor: motor.name, rated: motor.rated, ratedTorqueAtSpeed: torqueOf(motor.rated, rpm), required, torque });

  return {
    operating: { flow: Q, head: op.H, shaftPower: required, torque, rpm, efficiency: op.eff, npshAvailable: op.npsha, npshRequired: op.npshr, cavitating: op.cavitating, noFlow: op.noFlow },
    flow, drive,
    design: flow.pass && drive.pass === true,
  };
}

// ---------- saved runs ----------
export function saveRun(proj, name) {
  const { runs, ...inputs } = clone(proj);
  const result = evaluate(proj);
  const run = { name: (name || '').trim() || `Run ${proj.runs.length + 1}`, inputs, result };
  proj.runs.push(run);
  return run;
}
// Recompute a saved run from its own inputs and compare with what was saved.
export function reproduce(run) {
  const again = evaluate({ ...run.inputs, runs: [] });
  const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) : a === b;
  const keys = [['operating', 'flow'], ['operating', 'head'], ['operating', 'shaftPower'], ['operating', 'torque'], ['flow', 'pass'], ['drive', 'state'], ['drive', 'required']];
  const diffs = keys.filter(([a, b]) => !same(again[a][b], run.result[a][b])).map(k => k.join('.'));
  return { ok: diffs.length === 0, diffs, again };
}
// Inputs that differ between two runs (what was changed).
export function changedInputs(a, b) {
  const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]);
  const A = Object.fromEntries(flat(a.inputs)), B = Object.fromEntries(flat(b.inputs));
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => k !== 'name' && A[k] !== B[k]);
}

// ---------- files ----------
export const serialize = proj => JSON.stringify(proj, null, 2);
export function deserialize(text) {
  let p; try { p = JSON.parse(text); } catch { throw new InputError('not a project file'); }
  if (!p || p.version !== VERSION || !p.system || !p.pump || !Array.isArray(p.runs)) throw new InputError('not a pump-set project (version 1)');
  const fresh = newProject(p.name);
  setSystem(fresh, p.system); setPipe(fresh, 'suction', p.system.suction); setPipe(fresh, 'delivery', p.system.delivery);
  setPump(fresh, p.pump); setTarget(fresh, p.requiredFlow); setMotor(fresh, p.motorId);
  fresh.runs = p.runs;
  return fresh;
}
