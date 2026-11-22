// Fluid circuit bench: the learner assembles a series line from supported parts, decides where to measure, and
// optionally sets a flow requirement and a motor. Physics: engines/hydraulics/line.mjs (Pump House's checked
// functions). Motors and the drive rule come from the pump-set drive check (pumpset/model.mjs).
// A setup is plain data; a preset is a list of the same edits a person makes, replayed into an empty setup.
import { solveLine, budget, LineError, PIPE_MATERIALS, ORIFICE_C } from '../engines/hydraulics/line.mjs';
import { MOTORS, torqueOf } from '../pumpset/model.mjs';

export class EditError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));
const opts = o => ({ options: o });

// Supported parts and their editable parameters (stored in SI; `scale` converts for display: mm, %).
export const PARTS = {
  source: { name: 'Source reservoir', params: { surface: { label: 'Water surface', unit: 'm', min: -20, max: 100, step: 0.1 }, outlet: { label: 'Pipe leaves at', unit: 'm', min: -20, max: 100, step: 0.1 },
    inlet: { label: 'Pipe inlet', ...opts({ square: 'Square-edged entrance (K 0.5)', footValve: 'Foot valve with strainer (K 5)' }) } }, defaults: { surface: 5, outlet: 0, inlet: 'square' } },
  pipe: { name: 'Pipe', params: { D: { label: 'Bore', unit: 'mm', scale: 1000, min: 0.004, max: 0.3, step: 1 }, L: { label: 'Length', unit: 'm', min: 0.1, max: 2000, step: 1 },
    material: { label: 'Material', ...opts(Object.fromEntries(Object.entries(PIPE_MATERIALS).map(([k, m]) => [k, m.name]))) }, rise: { label: 'Rise (end − start)', unit: 'm', min: -100, max: 100, step: 0.5 } },
    defaults: { D: 0.05, L: 10, material: 'pvc', rise: 0 } },
  elbow: { name: '90° elbow', params: {}, defaults: {} },
  valve: { name: 'Gate valve', params: { open: { label: 'Opening', unit: '%', scale: 100, min: 0.05, max: 1, step: 5 } }, defaults: { open: 1 } },
  checkValve: { name: 'Non-return valve', params: {}, defaults: {} },
  orifice: { name: 'Orifice plate', params: { beta: { label: 'Hole ÷ pipe bore (β)', unit: '', min: 0.2, max: 0.75, step: 0.05 } }, defaults: { beta: 0.5 } },
  pump: { name: 'Centrifugal pump', params: { rpm: { label: 'Speed', unit: 'rpm', min: 1000, max: 3600, step: 10 }, D2: { label: 'Impeller diameter', unit: 'mm', scale: 1000, min: 0.1, max: 0.16, step: 1 },
    motorId: { label: 'Motor', ...opts({ none: 'No motor chosen', ...Object.fromEntries(MOTORS.map(m => [m.id, `${m.name} (${m.speed[0]}–${m.speed[1]} rpm)`])) }) } }, defaults: { rpm: 2900, D2: 0.13, motorId: 'none' } },
  sink: { name: 'Receiving reservoir', params: { surface: { label: 'Water surface', unit: 'm', min: -20, max: 100, step: 0.1 } }, defaults: { surface: 0 } },
  tee: { name: 'Tee (branch)', params: {}, defaults: {}, unsupported: 'Branches need a network solver, which is not built yet.' },
};

export const emptySetup = () => ({ temp: 20, requiredFlow: null, chain: [], gauges: [], nextId: 1 });
const find = (s, id) => { const i = s.chain.findIndex(p => p.id === id); if (i < 0) throw new EditError('no such part'); return i; };

export function setParam(s, id, key, value) {
  const part = s.chain[find(s, id)], spec = PARTS[part.type].params[key];
  if (!spec) throw new EditError(`${PARTS[part.type].name} has no ${key}`);
  if (spec.options) { if (!(value in spec.options)) throw new EditError(`${spec.label}: choose one of the listed options`); }
  else if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) {
    const k = spec.scale || 1; throw new EditError(`${spec.label} must be between ${+(spec.min * k).toFixed(3)} and ${+(spec.max * k).toFixed(3)} ${spec.unit}`.trim());
  }
  part[key] = value;
}
// Add a part after `afterId` (or at the end). Parameters given here go through the same checks as later edits.
export function addPart(s, type, params = {}, afterId = null) {
  if (!PARTS[type]) throw new EditError('unknown part');
  const part = { id: `p${s.nextId}`, type, ...clone(PARTS[type].defaults) };
  const trial = clone(s); trial.chain.splice(afterId ? find(trial, afterId) + 1 : trial.chain.length, 0, part);
  for (const [k, v] of Object.entries(params)) setParam(trial, part.id, k, v);
  trial.nextId++;
  Object.assign(s, trial);
  return part.id;
}
export function removePart(s, id) { const i = find(s, id); s.chain.splice(i, 1); s.gauges = s.gauges.filter(g => g !== id); }
export function movePart(s, id, dir) {
  const i = find(s, id), j = i + dir;
  if (j < 0 || j >= s.chain.length) throw new EditError('already at the end of the line');
  [s.chain[i], s.chain[j]] = [s.chain[j], s.chain[i]];
}
// A gauge sits on the junction after a part (between it and the next part).
export function toggleGauge(s, afterId) {
  const i = find(s, afterId);
  if (s.gauges.includes(afterId)) { s.gauges = s.gauges.filter(g => g !== afterId); return false; }
  if (i === s.chain.length - 1) throw new EditError('a gauge goes between two parts; there is nothing after this one');
  s.gauges.push(afterId); return true;
}
export function setTemp(s, t) { if (!(t >= 1 && t <= 90)) throw new EditError('water temperature must be between 1 and 90 °C'); s.temp = t; }
export function setRequiredFlow(s, Lps) {
  if (Lps === null || Lps === '' || Lps === undefined) { s.requiredFlow = null; return; }
  if (!(Lps > 0 && Lps <= 200)) throw new EditError('required flow must be between 0 and 200 L/s (or empty for none)');
  s.requiredFlow = Lps;
}
const EDITS = { addPart, setParam, toggleGauge, setTemp, setRequiredFlow };

// ---------- presets: edit scripts, replayed through the same functions ----------
export const PRESETS = [
  { id: 'gravity', name: 'Gravity feed between two tanks', script: [
    ['addPart', 'source', { surface: 10, outlet: 8, inlet: 'square' }], ['addPart', 'pipe', { D: 0.05, L: 20, material: 'pvc', rise: -8 }],
    ['addPart', 'valve', { open: 1 }], ['addPart', 'pipe', { D: 0.05, L: 30, material: 'pvc', rise: 0 }], ['addPart', 'sink', { surface: 0 }],
    ['toggleGauge', 'p2'], ['toggleGauge', 'p3']] },
  { id: 'pumpset', name: 'Pump set to an overhead tank', script: [
    ['addPart', 'source', { surface: -2.5, outlet: -2.5, inlet: 'footValve' }], ['addPart', 'pipe', { D: 0.05, L: 4, material: 'gi', rise: 2.5 }], ['addPart', 'elbow'],
    ['addPart', 'pump', { rpm: 2900, D2: 0.13, motorId: '2p-1.5' }], ['addPart', 'checkValve'], ['addPart', 'valve', { open: 1 }],
    ['addPart', 'pipe', { D: 0.04, L: 30, material: 'gi', rise: 18 }], ['addPart', 'elbow'], ['addPart', 'elbow'], ['addPart', 'elbow'], ['addPart', 'elbow'],
    ['addPart', 'sink', { surface: 18 }], ['setTemp', 30], ['setRequiredFlow', 2.0], ['toggleGauge', 'p3'], ['toggleGauge', 'p4']] },
  { id: 'meter', name: 'Orifice flow meter in a pumped line', script: [
    ['addPart', 'source', { surface: 1, outlet: 0, inlet: 'square' }], ['addPart', 'pipe', { D: 0.05, L: 2, material: 'pvc', rise: 0 }], ['addPart', 'pump', { rpm: 2900, D2: 0.13 }],
    ['addPart', 'pipe', { D: 0.05, L: 10, material: 'pvc', rise: 0 }], ['addPart', 'orifice', { beta: 0.5 }], ['addPart', 'pipe', { D: 0.05, L: 10, material: 'pvc', rise: 6 }],
    ['addPart', 'sink', { surface: 6 }], ['toggleGauge', 'p4'], ['toggleGauge', 'p5']] },
  // Journey 2 (pipe sizing): a farm sump to an overhead tank 12 m up, 80 m away. The main is undersized on purpose:
  // it misses the 2.5 L/s requirement. Gauges sit at both ends of the horizontal main (the pipe-friction lab reading).
  { id: 'farm', name: 'Farm tank: sump to an overhead tank (undersized main)', script: [
    ['addPart', 'source', { surface: -2, outlet: -2, inlet: 'footValve' }], ['addPart', 'pipe', { D: 0.05, L: 3, material: 'pvc', rise: 2 }],
    ['addPart', 'pump', { rpm: 2900, D2: 0.13, motorId: '2p-1.5' }], ['addPart', 'checkValve'], ['addPart', 'valve', { open: 1 }],
    ['addPart', 'pipe', { D: 0.032, L: 80, material: 'pvc', rise: 0 }], ['addPart', 'elbow'], ['addPart', 'elbow'],
    ['addPart', 'pipe', { D: 0.032, L: 12, material: 'pvc', rise: 12 }], ['addPart', 'sink', { surface: 12 }],
    ['setRequiredFlow', 2.5], ['toggleGauge', 'p5'], ['toggleGauge', 'p6']] },
  // Its near twin for practice: another site, galvanised iron, a different lift, run and requirement.
  { id: 'farm-twin', name: 'Orchard tank: a second site to size (undersized main)', script: [
    ['addPart', 'source', { surface: -1.5, outlet: -1.5, inlet: 'footValve' }], ['addPart', 'pipe', { D: 0.05, L: 2, material: 'gi', rise: 1.5 }],
    ['addPart', 'pump', { rpm: 2900, D2: 0.13, motorId: '2p-2.2' }], ['addPart', 'checkValve'], ['addPart', 'valve', { open: 1 }],
    ['addPart', 'pipe', { D: 0.032, L: 120, material: 'gi', rise: 0 }], ['addPart', 'elbow'], ['addPart', 'elbow'], ['addPart', 'elbow'],
    ['addPart', 'pipe', { D: 0.032, L: 9, material: 'gi', rise: 9 }], ['addPart', 'sink', { surface: 9 }],
    ['setRequiredFlow', 3], ['toggleGauge', 'p5'], ['toggleGauge', 'p6']] },
];
// A bench URL's ?preset=<id> → the preset to explore ({ id, name }), or null when absent or unknown.
export function presetFromQuery(search) {
  const id = new URLSearchParams(search || '').get('preset'), p = PRESETS.find(x => x.id === id);
  return p ? { id: p.id, name: p.name } : null;
}
export function fromPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) throw new EditError('no such preset');
  const s = emptySetup();
  for (const [fn, ...args] of p.script) EDITS[fn](s, ...args);
  return s;
}

// ---------- evaluation ----------
export const partLabel = (s, i) => { const p = s.chain[i], n = `#${i + 1} ${PARTS[p.type].name}`;
  return p.type === 'pipe' ? `${n} Ø${+(p.D * 1000).toFixed(1)} × ${p.L} m` : p.type === 'orifice' ? `${n} β ${p.beta}` : p.type === 'valve' ? `${n} ${Math.round(p.open * 100)} %` : n; };
export const gaugeLabel = (s, id) => `G after #${s.chain.findIndex(p => p.id === id) + 1}`;

export function solve(s) {
  const bad = s.chain.find(p => PARTS[p.type]?.unsupported);
  if (bad) return { ok: false, code: 'unsupported-part', at: s.chain.indexOf(bad), reason: `${partLabel(s, s.chain.indexOf(bad))}: ${PARTS[bad.type].unsupported} Remove it to solve the rest of the line.` };
  let sol;
  try { sol = solveLine(s.chain, { temp: s.temp }); }
  catch (e) { if (e instanceof LineError) return { ok: false, code: e.code, at: e.at, reason: e.at !== null && e.at !== undefined && s.chain[e.at] ? `${partLabel(s, e.at)}: ${e.message}` : e.message }; throw e; }
  const gauges = s.gauges.map(id => { const i = s.chain.findIndex(p => p.id === id); return i < 0 || i >= s.chain.length - 1 ? { id, valid: false } : { id, valid: true, junction: i, label: gaugeLabel(s, id), kPa: sol.junctions[i].gauge / 1000, z: sol.junctions[i].z }; });
  return { ok: true, sol, gauges };
}

export function evaluate(s) {
  const r = solve(s); if (!r.ok) return r;
  const { sol } = r, Q = sol.Q * 1000, outputs = { flow: { label: 'Flow', value: Q, unit: 'L/s', source: 'simulated' } };
  for (const g of r.gauges.filter(g => g.valid)) outputs[`gauge:${g.id}`] = { label: `Pressure ${g.label}`, value: g.kPa, unit: 'kPa (gauge)', source: 'simulated' };
  const verdicts = {}, pumpPart = sol.pump ? s.chain[sol.pump.index] : null;
  if (sol.pump) {
    Object.assign(outputs, { pumpHead: { label: 'Pump head', value: sol.pump.head, unit: 'm', source: 'simulated' }, shaftPower: { label: 'Shaft power', value: sol.pump.shaftPower / 1000, unit: 'kW', source: 'simulated' },
      torque: { label: 'Shaft torque', value: torqueOf(sol.pump.shaftPower, sol.pump.rpm), unit: 'N·m', source: 'simulated' }, npsha: { label: 'NPSH available', value: sol.pump.npsha, unit: 'm', source: 'simulated' }, npshr: { label: 'NPSH required', value: sol.pump.npshr, unit: 'm', source: 'simulated' } });
  }
  const cav = sol.pump?.cavitating;
  if (s.requiredFlow !== null) verdicts.flow = { label: 'Delivers the required flow?',
    ...(sol.noFlow ? { value: 'fail', reason: 'no flow: the line cannot lift water to the receiving reservoir' }
      : cav ? { value: 'fail', reason: 'the pump is cavitating: the flow figure is not reliable' }
      : Q >= s.requiredFlow ? { value: 'pass', reason: `${Q.toFixed(2)} L/s against ${s.requiredFlow} L/s required` } : { value: 'fail', reason: `${Q.toFixed(2)} L/s, ${(s.requiredFlow - Q).toFixed(2)} L/s short of ${s.requiredFlow} L/s` }) };
  if (pumpPart && pumpPart.motorId !== 'none') {
    const m = MOTORS.find(x => x.id === pumpPart.motorId), need = sol.pump.shaftPower;
    verdicts.drive = { label: 'Motor supplies the shaft power at this speed?',
      ...(cav ? { value: 'cannot-assess', reason: 'cannot assess at this operating point: the pump is cavitating' }
        : pumpPart.rpm < m.speed[0] || pumpPart.rpm > m.speed[1] ? { value: 'not-applicable', reason: `${m.name} is rated between ${m.speed[0]} and ${m.speed[1]} rpm, not ${pumpPart.rpm} rpm` }
        : need <= m.rated ? { value: 'pass', reason: `needs ${(need / 1000).toFixed(3)} kW of ${m.rated / 1000} kW (${((m.rated - need) / m.rated * 100).toFixed(1)} % spare)` }
        : { value: 'fail', reason: `needs ${(need / 1000).toFixed(3)} kW, ${((need - m.rated) / 1000).toFixed(3)} kW over ${m.rated / 1000} kW` }) };
    outputs.motorRating = { label: 'Motor rating', value: m.rated / 1000, unit: 'kW', source: 'table' };
  }
  return { ok: true, outputs, verdicts, sol, gauges: r.gauges };
}
export const ADAPTER = { domain: 'fluids-line', title: 'Line', evaluate: s => { const r = evaluate(s); return r.ok ? { ok: true, outputs: r.outputs, verdicts: r.verdicts } : { ok: false, reason: r.reason }; } };

// Pressure change between two gauges, part by part (kPa); the items add up to the gauge difference.
export function explain(s, fromId, toId) {
  const r = solve(s); if (!r.ok) throw new EditError(r.reason);
  const a = s.chain.findIndex(p => p.id === fromId), b = s.chain.findIndex(p => p.id === toId);
  if (!s.gauges.includes(fromId) || !s.gauges.includes(toId)) throw new EditError('choose two placed gauges');
  if (a >= b) throw new EditError('choose the upstream gauge first, then a gauge further along the flow');
  const x = budget(r.sol, a, b);
  const what = { friction: 'pipe friction', fitting: 'fitting loss', orifice: 'orifice plate (permanent loss)', pump: 'pump head added', entrance: 'entrance loss', exit: 'exit loss', expansion: 'sudden enlargement', contraction: 'sudden contraction' };
  const items = x.items.map(i => ({ label: i.part === 'junction' ? `bore change after ${partLabel(s, i.index)}` : `${partLabel(s, i.index)} — ${what[i.kind]}`, kind: i.kind, kPa: i.pa / 1000 }));
  return { from: gaugeLabel(s, fromId), to: gaugeLabel(s, toId), items, elevation: x.elevation / 1000, velocity: x.velocity / 1000, total: x.total / 1000, check: x.check / 1000 };
}

// ---------- learning notes (shown on request; they never change a tool or a number) ----------
export const TOPICS = [
  { id: 'energy', when: () => true, title: 'Energy along a line', concept: 'Between any two points, total head falls by the losses and rises by any pump head. Total head = pressure head + elevation + velocity head.',
    equation: 'p₁/ρg + z₁ + V₁²/2g + H_pump = p₂/ρg + z₂ + V₂²/2g + Σh_loss', limits: 'Steady, incompressible flow; one velocity per cross-section.' },
  { id: 'friction', when: s => s.chain.some(p => p.type === 'pipe'), title: 'Pipe friction (Darcy–Weisbach)', concept: 'Friction loss grows with length and roughly with velocity squared in turbulent flow; in laminar flow it is proportional to velocity.',
    equation: 'h_f = f · (L/D) · V²/2g;  laminar f = 64/Re;  turbulent f from Colebrook–White', limits: 'Re 2000–4000 is blended and flagged uncertain. Roughness values are for new pipe unless stated.' },
  { id: 'minor', when: s => s.chain.some(p => ['elbow', 'valve', 'checkValve'].includes(p.type)), title: 'Fittings and valves', concept: 'Each fitting costs a multiple K of the velocity head at its bore.',
    equation: 'h_m = K · V²/2g  (elbow 0.75, non-return valve 2, gate valve 0.15 open → 200 at 10 %)', limits: 'Typical Crane TP-410 coefficients, not a specific product.' },
  { id: 'bore', when: s => new Set(s.chain.filter(p => p.type === 'pipe').map(p => p.D)).size > 1, title: 'Changing the bore', concept: 'A sudden enlargement loses most of the extra velocity head; a sudden contraction loses less.',
    equation: 'enlargement h = (1 − A₁/A₂)² V₁²/2g;  contraction h = 0.5 (1 − A₂/A₁) V₂²/2g', limits: 'Sharp, sudden changes; tapers lose less.' },
  { id: 'orifice', when: s => s.chain.some(p => p.type === 'orifice'), title: 'Orifice plate', concept: 'The plate makes a large pressure difference between its taps (that is what a flow meter reads), but part of it is recovered downstream; only the rest is a permanent loss.',
    equation: `Δp_taps = (1 − β⁴)/(C² β⁴) · ρV²/2,  C = ${ORIFICE_C};  permanent loss = Δp_taps · (√(1 − β⁴(1 − C²)) − Cβ²)/(√(1 − β⁴(1 − C²)) + Cβ²)  (ISO 5167-2)`, limits: 'C fixed at a typical value; real meters need straight pipe upstream and a calibrated C.' },
  { id: 'pump', when: s => s.chain.some(p => p.type === 'pump'), title: 'Pump and operating point', concept: 'The pump runs where its head–flow curve meets the line\'s system curve: static lift plus losses.',
    equation: 'H_pump(Q) = Δz + Σh_loss(Q);  shaft power P = ρgQH/η;  torque T = P/ω', limits: 'Pump House\'s model pump (impeller geometry), not a catalogue pump; water only.' },
  { id: 'npsh', when: s => s.chain.some(p => p.type === 'pump'), title: 'NPSH and cavitation', concept: 'If the absolute pressure at the pump inlet comes too close to the vapour pressure, the water boils locally and the pump cavitates. Then neither the flow nor the shaft power figure is reliable.',
    equation: 'NPSHa = (p_inlet,abs − p_vapour)/ρg + V²/2g  ≥  NPSHr', limits: 'Cavitation is flagged, not simulated.' },
  { id: 'limits', when: () => true, title: 'What this bench does not model', concept: 'One series line between two open reservoirs, steady state, water at one temperature.',
    equation: '', limits: 'Not modelled: branches and networks, two pumps in one line, reverse flow, transients and water hammer, air entrainment, heat transfer along the line, fluids other than water, motor starting.' },
];
