// Thermal bench: the learner builds ONE heat path from a start face (a fixed temperature or a heat source) to
// ambient, layer by layer — conduction, side-by-side materials, contact, convection (with radiation) and fin
// arrays — places thermometers on interfaces and sets their own limits. Physics: engines/thermal/thermal.mjs.
// Question tools are generic (limits, what limits the heat flow, what moves a result, a sweep of any input), so
// "design a cooling system", "why is this wall losing so much heat?" or "why does insulating this thin pipe
// increase its loss?" need no lesson code. A setup is plain data; a preset is a script of the same edits.
import { solvePath, lumped, ThermalError, MATERIALS, AIR_RANGE } from '../engines/thermal/thermal.mjs';

export class EditError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));
const opts = o => ({ options: o });
const MAT = Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, `${m.name} (k ${m.k})`]));
export { MATERIALS };

// Layer types and their editable parameters (stored in SI; `scale` converts for display).
export const LAYERS = {
  conduction: { name: 'Conduction layer', params: { material: { label: 'Material', ...opts({ ...MAT, custom: 'My own k' }) }, k: { label: 'k (used when “My own k”)', unit: 'W/m·K', min: 0.005, max: 500, step: 0.01 },
    t: { label: 'Thickness', unit: 'mm', scale: 1000, min: 1e-5, max: 2, step: 0.5 } }, defaults: { material: 'brick', k: 0.72, t: 0.1 } },
  parallel: { name: 'Side-by-side layer', params: { materialA: { label: 'Material A', ...opts(MAT) }, fracA: { label: 'Share of area that is A', unit: '%', scale: 100, min: 0.01, max: 0.99, step: 1 },
    materialB: { label: 'Material B', ...opts(MAT) }, t: { label: 'Thickness', unit: 'mm', scale: 1000, min: 1e-4, max: 2, step: 1 } }, defaults: { materialA: 'softwood', fracA: 0.15, materialB: 'glassWool', t: 0.1 } },
  contact: { name: 'Contact resistance', params: { Rc: { label: 'R″ contact', unit: '×10⁻⁴ m²·K/W', scale: 1e4, min: 1e-7, max: 1e-2, step: 0.1 } }, defaults: { Rc: 1e-4 } },
  convection: { name: 'Convection surface', params: { mode: { label: 'Coefficient h', ...opts({ h: 'I enter h', 'natural-plate': 'Natural, vertical plate (air)', 'natural-cylinder': 'Natural, horizontal pipe (air)', 'forced-plate': 'Forced, along a flat plate (air)', 'forced-cylinder': 'Forced, across a pipe (air)' }) },
    h: { label: 'h (used when “I enter h”)', unit: 'W/m²·K', min: 0.5, max: 1e5, step: 1 }, Lc: { label: 'Plate height / length along flow', unit: 'm', min: 0.01, max: 20, step: 0.05 },
    V: { label: 'Air speed (forced)', unit: 'm/s', min: 0.1, max: 100, step: 0.5 }, emissivity: { label: 'Emissivity (0 = no radiation)', unit: '', min: 0, max: 1, step: 0.05 } }, defaults: { mode: 'h', h: 10, Lc: 0.3, V: 2, emissivity: 0 } },
  fins: { name: 'Fin array', params: { shape: { label: 'Fin shape', ...opts({ rect: 'Straight rectangular', pin: 'Pin' }) }, N: { label: 'Number of fins', unit: '', min: 1, max: 500, step: 1, integer: true },
    L: { label: 'Fin length (height)', unit: 'mm', scale: 1000, min: 0.001, max: 0.3, step: 1 }, t: { label: 'Thickness / pin diameter', unit: 'mm', scale: 1000, min: 2e-4, max: 0.05, step: 0.1 },
    w: { label: 'Fin width (rectangular)', unit: 'mm', scale: 1000, min: 0.001, max: 1, step: 1 }, material: { label: 'Fin material', ...opts({ ...MAT, custom: 'My own k' }) }, k: { label: 'k (used when “My own k”)', unit: 'W/m·K', min: 0.005, max: 500, step: 1 },
    h: { label: 'h on the fins', unit: 'W/m²·K', min: 0.5, max: 1e4, step: 1 }, tip: { label: 'Fin tip', ...opts({ convective: 'Tip loses heat (convective)', adiabatic: 'Tip insulated (adiabatic)' }) } },
    defaults: { shape: 'rect', N: 8, L: 0.025, t: 0.0015, w: 0.05, material: 'alAlloy', k: 177, h: 8, tip: 'convective' } },
};
export const LIMITS = { maxStartT: { label: 'Highest start-face temperature', unit: '°C' }, maxSurfaceT: { label: 'Highest outer-surface temperature', unit: '°C' },
  maxQ: { label: 'Most heat flow allowed', unit: 'W' }, minQ: { label: 'Least heat flow needed', unit: 'W' } };

export const emptySetup = () => ({ geometry: 'plane', area: 1, r0: 0.01, length: 1, start: { kind: 'temp', T: 60, Q: 10 }, ambient: 25, layers: [], thermometers: [],
  limits: { maxStartT: null, maxSurfaceT: null, maxQ: null, minQ: null }, transient: null, nextId: 1 });
const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new EditError(`${what} must be between ${lo} and ${hi}`); return v; };
const find = (s, id) => { const i = s.layers.findIndex(l => l.id === id); if (i < 0) throw new EditError('no such layer'); return i; };

// ---------- edits (validate first; a refused edit changes nothing) ----------
export function setGeometry(s, g) { if (!['plane', 'cylinder'].includes(g)) throw new EditError('choose a plane wall or a pipe'); s.geometry = g; }
export function setArea(s, A) { s.area = num(A, 1e-6, 1e4, 'area (m²)'); }
export function setPipe(s, key, v) {
  if (key === 'r0') s.r0 = num(v, 1e-4, 2, 'inner radius (m)'); else if (key === 'length') s.length = num(v, 0.01, 1e4, 'pipe length (m)'); else throw new EditError('unknown pipe setting');
}
export function setStart(s, kind, v) {
  if (kind === 'temp') { s.start.T = num(v, -100, 1500, 'start temperature (°C)'); s.start.kind = 'temp'; }
  else if (kind === 'heat') { s.start.Q = num(v, 1e-3, 1e7, 'heat input (W)'); s.start.kind = 'heat'; }
  else throw new EditError('the start is a fixed temperature or a heat source');
}
export function setAmbient(s, T) { s.ambient = num(T, -100, 1500, 'ambient temperature (°C)'); }
export function setParam(s, id, key, value) {
  const layer = s.layers[find(s, id)], spec = LAYERS[layer.type].params[key];
  if (!spec) throw new EditError(`${LAYERS[layer.type].name} has no ${key}`);
  if (spec.options) { if (!(value in spec.options)) throw new EditError(`${spec.label}: choose one of the listed options`); }
  else {
    const k = spec.scale || 1;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) throw new EditError(`${spec.label} must be between ${+(spec.min * k).toPrecision(3)} and ${+(spec.max * k).toPrecision(3)} ${spec.unit}`.trim());
    if (spec.integer && !Number.isInteger(value)) throw new EditError(`${spec.label} must be a whole number`);
  }
  layer[key] = value;
}
export function addLayer(s, type, params = {}, afterId = null) {
  if (!LAYERS[type]) throw new EditError('unknown layer');
  const layer = { id: `L${s.nextId}`, type, ...clone(LAYERS[type].defaults) };
  const trial = clone(s); trial.layers.splice(afterId ? find(trial, afterId) + 1 : trial.layers.length, 0, layer);
  for (const [k, v] of Object.entries(params)) setParam(trial, layer.id, k, v);
  trial.nextId++; Object.assign(s, trial);
  return layer.id;
}
export function removeLayer(s, id) { find(s, id); s.layers = s.layers.filter(l => l.id !== id); s.thermometers = s.thermometers.filter(t => t !== id); }
export function moveLayer(s, id, dir) {
  const i = find(s, id), j = i + dir;
  if (j < 0 || j >= s.layers.length) throw new EditError('already at the end of the path');
  [s.layers[i], s.layers[j]] = [s.layers[j], s.layers[i]];
}
// A thermometer sits on the start face ('start') or on the interface after a layer (not after the last one: that is ambient).
export function toggleThermometer(s, at) {
  if (at !== 'start') { const i = find(s, at); if (i === s.layers.length - 1 && !s.thermometers.includes(at)) throw new EditError('after the last layer is ambient, which you set yourself; put the thermometer on an interface'); }
  if (s.thermometers.includes(at)) { s.thermometers = s.thermometers.filter(t => t !== at); return false; }
  s.thermometers.push(at); return true;
}
export function setLimit(s, key, v) {
  if (!(key in s.limits)) throw new EditError('unknown limit');
  s.limits[key] = v === null ? null : key.endsWith('T') ? num(v, -100, 1500, `${LIMITS[key].label} (°C)`) : num(v, 1e-6, 1e8, `${LIMITS[key].label} (W)`);
}
// A separate lumped body that heats up or cools down in the ambient (optional).
export function setTransient(s, key, v) {
  if (key === 'off') { s.transient = null; return; }
  const t = s.transient ? { ...s.transient } : { material: 'aluminium', V: 1e-5, As: 3e-3, h: 20, Ti: 90, Ttarget: 40 };
  if (key === 'on') { s.transient = t; return; }
  if (key === 'material') { if (!MATERIALS[v]) throw new EditError('choose a listed material'); t.material = v; }
  else if (key === 'V') t.V = num(v, 1e-12, 10, 'volume (m³)'); else if (key === 'As') t.As = num(v, 1e-9, 100, 'surface area (m²)');
  else if (key === 'h') t.h = num(v, 0.5, 1e5, 'h (W/m²·K)'); else if (key === 'Ti') t.Ti = num(v, -100, 1500, 'starting temperature (°C)');
  else if (key === 'Ttarget') t.Ttarget = num(v, -100, 1500, 'target temperature (°C)'); else throw new EditError('unknown setting');
  s.transient = t;
}
const EDITS = { setGeometry, setArea, setPipe, setStart, setAmbient, addLayer, setParam, toggleThermometer, setLimit, setTransient };
export const SCRIPT_EDITS = EDITS;

// ---------- presets: edit scripts replayed into an empty setup ----------
export const PRESETS = [
  { id: 'device', name: 'Cooling a 20 W device', script: [
    ['setGeometry', 'plane'], ['setArea', 0.0025], ['setStart', 'heat', 20], ['setAmbient', 35],
    ['addLayer', 'contact', { Rc: 1e-4 }], ['addLayer', 'conduction', { material: 'alAlloy', t: 0.004 }],
    ['addLayer', 'fins', { shape: 'rect', N: 8, L: 0.025, t: 0.0015, w: 0.05, material: 'alAlloy', h: 8, tip: 'convective' }],
    ['toggleThermometer', 'start'], ['toggleThermometer', 'L1'], ['toggleThermometer', 'L2'], ['setLimit', 'maxStartT', 80]] },
  { id: 'pipe', name: 'Thin hot-water pipe, PTFE sleeve', script: [
    ['setGeometry', 'cylinder'], ['setPipe', 'r0', 0.004], ['setPipe', 'length', 1], ['setStart', 'temp', 90], ['setAmbient', 25],
    ['addLayer', 'convection', { mode: 'h', h: 2000 }], ['addLayer', 'conduction', { material: 'copper', t: 0.001 }], ['addLayer', 'conduction', { material: 'teflon', t: 0.002 }],
    ['addLayer', 'convection', { mode: 'natural-cylinder', emissivity: 0.9 }], ['toggleThermometer', 'L1'], ['toggleThermometer', 'L2'], ['toggleThermometer', 'L3']] },
  { id: 'wall', name: 'Cold-room wall', script: [
    ['setGeometry', 'plane'], ['setArea', 10], ['setStart', 'temp', 35], ['setAmbient', 2],
    ['addLayer', 'convection', { mode: 'h', h: 25 }], ['addLayer', 'conduction', { material: 'brick', t: 0.23 }], ['addLayer', 'conduction', { material: 'polystyrene', t: 0.025 }],
    ['addLayer', 'conduction', { material: 'plaster', t: 0.012 }], ['addLayer', 'convection', { mode: 'h', h: 8 }],
    ['toggleThermometer', 'L1'], ['toggleThermometer', 'L2'], ['toggleThermometer', 'L3'], ['toggleThermometer', 'L4'], ['setLimit', 'maxQ', 150]] },
];
export function fromPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) throw new EditError('no such preset');
  const s = emptySetup(); for (const [fn, ...args] of p.script) EDITS[fn](s, ...args); return s;
}

// ---------- evaluation ----------
const kOf = (l, key = 'material') => (l[key] === 'custom' ? l.k : MATERIALS[l[key]].k);
const MODE = { h: 'h entered', 'natural-plate': 'natural, vertical plate', 'natural-cylinder': 'natural, horizontal pipe', 'forced-plate': 'forced, flat plate', 'forced-cylinder': 'forced, across pipe' };
export function layerLabel(s, i) {
  const l = s.layers[i], n = `#${i + 1}`;
  if (l.type === 'conduction') return `${n} ${l.material === 'custom' ? `k ${l.k}` : MATERIALS[l.material].name} ${+(l.t * 1000).toPrecision(4)} mm`;
  if (l.type === 'parallel') return `${n} ${MATERIALS[l.materialA].name} / ${MATERIALS[l.materialB].name} ${+(l.t * 1000).toPrecision(4)} mm`;
  if (l.type === 'contact') return `${n} Contact ${+(l.Rc * 1e4).toPrecision(3)}×10⁻⁴`;
  if (l.type === 'convection') return `${n} ${i === 0 && s.layers.length > 1 ? 'Inner' : i === s.layers.length - 1 ? 'Outer' : 'Fluid'} film (${l.mode === 'h' ? `h ${l.h}` : MODE[l.mode]}${l.emissivity > 0 ? ` + radiation ε ${l.emissivity}` : ''})`;
  return `${n} Fin array: ${l.N} ${l.shape === 'pin' ? 'pins' : 'rectangular fins'}, h ${l.h}`;
}
export const pointLabel = (s, at) => (at === 'start' ? 'T start face' : `T after #${s.layers.findIndex(l => l.id === at) + 1}`);
const toPath = s => ({ geometry: s.geometry, area: s.area, r0: s.r0, length: s.length, start: s.start, ambient: s.ambient,
  layers: s.layers.map(l => l.type === 'conduction' ? { type: l.type, k: kOf(l), t: l.t } : l.type === 'parallel' ? { type: l.type, kA: MATERIALS[l.materialA].k, kB: MATERIALS[l.materialB].k, fracA: l.fracA, t: l.t }
    : l.type === 'fins' ? { ...l, k: kOf(l) } : { ...l }) });

// Fins closer than this share one boundary layer: the single h entered no longer applies (channel correlations are not built).
export const MIN_FIN_GAP = 0.002;
function finGap(s, l) {
  // rectangular fins run across the base (width w); the rest of the base length holds the row. Pins on a square grid.
  if (l.shape === 'pin') return Math.sqrt(s.area / l.N) - l.t;
  const row = s.area / l.w; return l.N === 1 ? row - l.t : (row - l.N * l.t) / (l.N - 1);
}
export function solve(s) {
  const fl = s.layers.findIndex(l => l.type === 'fins');
  if (fl >= 0 && s.geometry === 'plane') { const l = s.layers[fl], g = finGap(s, l);
    if (g < MIN_FIN_GAP) return { ok: false, code: 'fin-gap', at: fl, reason: `${layerLabel(s, fl)}: the gap between fins is ${(g * 1000).toFixed(1)} mm, below ${MIN_FIN_GAP * 1000} mm — the fins' boundary layers merge, so one h no longer describes them (fin-channel correlations are not built). Use fewer or thinner fins, or a larger base.` }; }
  try { return { ok: true, sol: solvePath(toPath(s)) }; }
  catch (e) { if (e instanceof ThermalError) return { ok: false, code: e.code, at: e.at, reason: e.at !== null && s.layers[e.at] ? `${layerLabel(s, e.at)}: ${e.message}` : e.message }; throw e; }
}
function transientOf(s) {
  const t = s.transient; if (!t) return null;
  const m = MATERIALS[t.material];
  if (!m.rho || !m.c) return { ok: false, reason: `the table has no density and specific heat for ${m.name}` };
  try { return { ok: true, ...lumped({ rho: m.rho, c: m.c, k: m.k, V: t.V, As: t.As, h: t.h, Ti: t.Ti, Tinf: s.ambient, Ttarget: t.Ttarget }) }; }
  catch (e) { if (e instanceof ThermalError) return { ok: false, reason: e.message }; throw e; }
}
const outerSurface = (s, sol) => { const n = s.layers.length, l = s.layers[n - 1]; return l.type === 'convection' || l.type === 'fins' ? sol.T[n - 1] : null; };

export function evaluate(s) {
  const r = solve(s); if (!r.ok) return r;
  const { sol } = r, n = s.layers.length, Ts = outerSurface(s, sol);
  const outputs = { Q: { label: 'Heat flow', value: sol.Q, unit: 'W', source: 'simulated' }, startT: { label: 'Start-face temperature', value: sol.T[0], unit: '°C', source: s.start.kind === 'temp' ? 'input' : 'simulated' } };
  if (Ts !== null) outputs.surfaceT = { label: 'Outer-surface temperature', value: Ts, unit: '°C', source: 'simulated' };
  outputs.Rt = { label: 'Total resistance', value: sol.Rt, unit: 'K/W', source: 'simulated' };
  for (const at of s.thermometers) { const j = at === 'start' ? 0 : s.layers.findIndex(l => l.id === at) + 1; if (j >= 0 && j < n) outputs[`T:${at}`] = { label: pointLabel(s, at), value: sol.T[j], unit: '°C', source: 'simulated' }; }
  const fi = s.layers.findIndex(l => l.type === 'fins');
  if (fi >= 0) { const f = sol.layers[fi].fins; Object.assign(outputs, { finEta: { label: 'Fin efficiency', value: f.eta, unit: '', source: 'simulated' }, finEff: { label: 'Fin effectiveness', value: f.effectiveness, unit: '', source: 'simulated' }, tipT: { label: 'Fin tip temperature', value: sol.layers[fi].tipT, unit: '°C', source: 'simulated' } }); }
  if (sol.critical) outputs.rCrit = { label: 'Critical insulation radius', value: sol.critical.rc * 1000, unit: 'mm', source: 'simulated' };
  const tr = transientOf(s);
  if (tr?.ok) outputs.tTime = { label: 'Time to reach target', value: tr.time, unit: 's', source: 'simulated' };
  // the learner's limits
  const L = s.limits, Ta = s.ambient, rise = (T, lim) => (lim > Ta ? (T - Ta) / (lim - Ta) : T <= lim ? 0 : Infinity), checks = [];
  if (L.maxStartT !== null) checks.push({ key: 'maxStartT', label: 'Start-face temperature', quantity: 'T:start', dir: -1, value: sol.T[0], util: rise(sol.T[0], L.maxStartT), text: `${sol.T[0].toFixed(1)} °C (limit ${L.maxStartT} °C)` });
  if (L.maxSurfaceT !== null) checks.push(Ts === null ? { key: 'maxSurfaceT', label: 'Outer-surface temperature', na: true, text: 'the last layer is held at ambient: there is no outer surface film to check' }
    : { key: 'maxSurfaceT', label: 'Outer-surface temperature', quantity: 'surfaceT', dir: -1, value: Ts, util: rise(Ts, L.maxSurfaceT), text: `${Ts.toFixed(1)} °C (limit ${L.maxSurfaceT} °C)` });
  if (L.maxQ !== null) checks.push({ key: 'maxQ', label: 'Heat flow (most allowed)', quantity: 'Q', dir: -1, value: Math.abs(sol.Q), util: Math.abs(sol.Q) / L.maxQ, text: `${Math.abs(sol.Q).toFixed(2)} W (most allowed ${L.maxQ} W)` });
  if (L.minQ !== null) checks.push({ key: 'minQ', label: 'Heat flow (least needed)', quantity: 'Q', dir: 1, value: Math.abs(sol.Q), util: Math.abs(sol.Q) > 0 ? L.minQ / Math.abs(sol.Q) : Infinity, text: `${Math.abs(sol.Q).toFixed(2)} W (needs ≥ ${L.minQ} W)` });
  checks.forEach(c => { c.pass = c.na ? null : c.util <= 1 + 1e-12; });
  const active = checks.filter(c => !c.na), governing = active.length ? active.reduce((a, c) => (c.util > a.util ? c : a)) : null;
  const verdicts = Object.fromEntries(checks.map(c => [c.key, { label: c.label, value: c.na ? 'not-applicable' : c.pass ? 'pass' : 'fail', reason: c.text }]));
  if (tr && !tr.ok) verdicts.transient = { label: 'Warm-up / cool-down time', value: 'cannot-assess', reason: tr.reason };
  const limiting = sol.layers.reduce((a, l, i) => (l.share > sol.layers[a].share ? i : a), 0);
  return { ok: true, sol, outputs, verdicts, checks, governing, limiting, transient: tr };
}
export const ADAPTER = { domain: 'thermal', title: 'Thermal', evaluate: s => { const e = evaluate(s); return e.ok ? { ok: true, outputs: e.outputs, verdicts: e.verdicts } : { ok: false, reason: e.reason }; } };

// Temperature drop between two thermometers, layer by layer; the rows add up to the difference of the readings.
export function budget(s, fromAt, toAt) {
  const e = evaluate(s); if (!e.ok) throw new EditError(e.reason);
  if (!s.thermometers.includes(fromAt) || !s.thermometers.includes(toAt)) throw new EditError('choose two placed thermometers');
  const j = at => (at === 'start' ? 0 : s.layers.findIndex(l => l.id === at) + 1), a = j(fromAt), b = j(toAt);
  if (a >= b) throw new EditError('choose the thermometer nearer the start first');
  const items = s.layers.slice(a, b).map((l, k) => ({ label: layerLabel(s, a + k), R: e.sol.R[a + k], dT: e.sol.layers[a + k].dT }));
  const total = e.sol.T[a] - e.sol.T[b];
  return { from: pointLabel(s, fromAt), to: pointLabel(s, toAt), Q: e.sol.Q, items, total, check: total - items.reduce((x, i) => x + i.dT, 0) };
}

// ---------- generic question tools ----------
export function quantities(s) {
  const e = evaluate(s), keys = [{ key: 'Q', label: 'Heat flow (W)' }, { key: 'T:start', label: 'Start-face temperature (°C)' }];
  if (e.ok && e.outputs.surfaceT) keys.push({ key: 'surfaceT', label: 'Outer-surface temperature (°C)' });
  keys.push({ key: 'Rt', label: 'Total resistance (K/W)' });
  s.layers.slice(0, -1).forEach((l, i) => keys.push({ key: `T:${l.id}`, label: `T after #${i + 1} (°C)` }));
  if (e.ok && e.outputs.finEta) keys.push({ key: 'finEta', label: 'Fin efficiency' }, { key: 'tipT', label: 'Fin tip temperature (°C)' });
  return keys;
}
function read(e, key) {
  if (key === 'Q') return Math.abs(e.sol.Q);
  if (key === 'T:start') return e.sol.T[0];
  if (key.startsWith('T:')) { const v = e.outputs[key]?.value; if (v !== undefined) return v; return e.sol.T[e.idx(key.slice(2)) + 1]; }
  return e.outputs[key]?.value ?? null;
}
const evalFor = s => { const e = evaluate(s); if (e.ok) e.idx = id => s.layers.findIndex(l => l.id === id); return e; };
// Inputs a learner can vary (numeric settings of every layer, the geometry and the two ends). `design` marks those a
// designer chooses (not the duty or the weather); the computed "changes that help" use design inputs only.
export function inputs(s) {
  const out = [];
  if (s.geometry === 'plane') out.push({ ref: { key: 'area' }, label: 'Area (m²)', value: s.area, design: true, rel: true });
  else out.push({ ref: { key: 'r0' }, label: 'Pipe inner radius (mm)', value: s.r0, scale: 1000, design: true, rel: true }, { ref: { key: 'length' }, label: 'Pipe length (m)', value: s.length, design: true, rel: true });
  out.push(s.start.kind === 'heat' ? { ref: { key: 'startQ' }, label: 'Heat input (W)', value: s.start.Q, rel: true } : { ref: { key: 'startT' }, label: 'Start temperature (°C)', value: s.start.T, step: 5 });
  out.push({ ref: { key: 'ambient' }, label: 'Ambient temperature (°C)', value: s.ambient, step: 5 });
  s.layers.forEach((l, i) => {
    for (const [k, spec] of Object.entries(LAYERS[l.type].params)) {
      if (spec.options) continue;
      if (k === 'k' && l.material !== 'custom') continue;
      if (l.type === 'convection' && ((k === 'h' && l.mode !== 'h') || (k === 'Lc' && !/plate/.test(l.mode)) || (k === 'V' && !/forced/.test(l.mode)))) continue;
      if (l.type === 'fins' && k === 'w' && l.shape === 'pin') continue;
      out.push({ ref: { id: l.id, key: k }, label: `#${i + 1} ${spec.label.replace(/ \(used when.*\)/, '').replace(/ \(0 = no radiation\)/, '')}${spec.unit ? ` (${spec.unit})` : ''}`, value: l[k], scale: spec.scale, design: true,
        ...(k === 'N' ? { step: 1 } : k === 'emissivity' ? { step: 0.1 } : k === 'fracA' ? { step: 0.05 } : { rel: true }) });
    }
  });
  return out;
}
export function applyInput(s, ref, v) {
  const t = clone(s);
  if (ref.id) setParam(t, ref.id, ref.key, ref.key === 'N' ? Math.round(v) : v);
  else if (ref.key === 'area') setArea(t, v); else if (ref.key === 'r0' || ref.key === 'length') setPipe(t, ref.key, v);
  else if (ref.key === 'startQ') setStart(t, 'heat', v); else if (ref.key === 'startT') setStart(t, 'temp', v); else if (ref.key === 'ambient') setAmbient(t, v);
  return t;
}
const tryEval = (s, ref, v) => { try { return evalFor(applyInput(s, ref, v)); } catch (e) { if (e instanceof EditError) return { ok: false, reason: e.message }; throw e; } };

// What moves a result: each input one step either way (±10 % for sizes and coefficients, fixed steps otherwise), plus
// each listed material in place of a layer's material. Computed, not assumed.
export function sensitivity(s, key, { designOnly = false } = {}) {
  const base = evalFor(s); if (!base.ok) throw new EditError(base.reason);
  const q0 = read(base, key), rows = [];
  for (const inp of inputs(s).filter(x => !designOnly || x.design)) for (const dir of [1, -1]) {
    const to = inp.rel ? inp.value * (1 + 0.1 * dir) : inp.value + dir * inp.step, e = tryEval(s, inp.ref, to);
    const q = e.ok ? read(e, key) : null;
    if (q !== null && q !== undefined) rows.push({ input: inp.label, change: inp.rel ? `${dir > 0 ? '+' : '−'}10 %` : `${dir > 0 ? '+' : '−'}${inp.step}`, ref: inp.ref, to: inp.ref.key === 'N' ? Math.round(to) : to, delta: q - q0 });
  }
  s.layers.forEach((l, i) => { for (const mk of ['material', 'materialA', 'materialB'].filter(k => k in l)) for (const m of Object.keys(MATERIALS).filter(m => m !== l[mk])) {
    const t = clone(s); t.layers[i][mk] = m; const e = evalFor(t), q = e.ok ? read(e, key) : null;
    if (q !== null && q !== undefined) rows.push({ input: `#${i + 1} material`, change: `→ ${MATERIALS[m].name}`, ref: { id: l.id, key: mk }, to: m, delta: q - q0 });
  } });
  const tiny = 1e-9 * Math.max(1, Math.abs(q0));        // inputs that do not move this result are left out
  return { quantity: key, value: q0, rows: rows.filter(r => Math.abs(r.delta) > tiny).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}
// Sweep one input over a range against any result; impossible points are reported with their reason.
export function sweep(s, ref, key, from, to, steps = 20) {
  if (!(steps >= 2 && steps <= 200) || !(to > from)) throw new EditError('choose a range with the end above the start');
  const pts = Array.from({ length: steps + 1 }, (_, k) => { const v = from + (to - from) * k / steps, e = tryEval(s, ref, ref.key === 'N' ? Math.round(v) : v), q = e.ok ? read(e, key) : null; return { v, q: q ?? null, why: e.ok ? null : e.reason }; });
  const ok = pts.filter(p => p.q !== null);
  const max = ok.length ? ok.reduce((a, p) => (p.q > a.q ? p : a)) : null, min = ok.length ? ok.reduce((a, p) => (p.q < a.q ? p : a)) : null;
  const interior = p => p && p !== ok[0] && p !== ok.at(-1);
  return { ref, key, points: pts, max, min, peak: interior(max) ? max : null, trough: interior(min) ? min : null };
}

// Explain: which of the learner's limits governs, which resistance limits the heat flow, and the computed one-step
// changes (design inputs only) that help the governing check most.
export function explain(s) {
  const e = evalFor(s); if (!e.ok) throw new EditError(e.reason);
  const sol = e.sol, lim = e.limiting, share = sol.layers[lim].share;
  const ranked = sol.layers.map((l, i) => ({ label: layerLabel(s, i), R: l.R, share: l.share, dT: l.dT })).sort((a, b) => b.share - a.share);
  const limitingText = `${layerLabel(s, lim)} limits the heat flow: ${(share * 100).toFixed(0)} % of the total resistance (${sol.R[lim].toPrecision(3)} of ${sol.Rt.toPrecision(3)} K/W), so ${(share * 100).toFixed(0)} % of the temperature difference is across it.`;
  const g = e.governing;
  const headline = g ? `${g.label} governs: ${g.text} — ${Number.isFinite(g.util) ? (g.util * 100).toFixed(0) : '∞'} % of your limit${g.pass ? '' : ' (not met)'}.` : 'No limits set: add your own on the Limits tab to see what governs and what helps.';
  const facts = [`Heat flow ${sol.Q.toFixed(2)} W from ${sol.T[0].toFixed(1)} °C at the start face to ${s.ambient} °C ambient through ${sol.Rt.toPrecision(3)} K/W.`];
  const fi = s.layers.findIndex(l => l.type === 'fins');
  if (fi >= 0) { const f = sol.layers[fi].fins; facts.push(`Fins: efficiency ${(f.eta * 100).toFixed(0)} %, effectiveness ${f.effectiveness.toFixed(1)}${f.effectiveness < 2 ? ' (below 2: these fins hardly pay for themselves)' : ''}; the array has ${f.Atotal.toPrecision(3)} m² of surface against ${s.area} m² bare (bare plate would be ${f.bareR.toPrecision(3)} K/W, the array is ${f.R.toPrecision(3)} K/W).`); }
  s.layers.forEach((l, i) => { if (l.type === 'convection') { const x = sol.layers[i]; facts.push(`${layerLabel(s, i)}: h = ${x.hc.toFixed(2)} W/m²·K convection${x.hr ? ` + ${x.hr.toFixed(2)} radiation` : ''}${x.corr ? ` (${x.corr.Ra !== undefined ? `Ra ${x.corr.Ra.toExponential(2)}` : `Re ${x.corr.Re.toExponential(2)}`}, Nu ${x.corr.Nu.toFixed(1)})` : ''}.`); } });
  if (sol.critical) {
    const c = sol.critical, n = s.layers.length, ins = s.layers[n - 2], more = tryEval(s, { id: ins.id, key: 't' }, ins.t + 0.001);
    facts.push(`Critical insulation radius r = k/h = ${c.k} / ${c.h.toFixed(2)} = ${(c.rc * 1000).toFixed(1)} mm (at the present h); the outer radius is ${(c.ro * 1000).toFixed(1)} mm, so by this formula adding more of the outer layer ${c.more} the heat loss.`);
    if (more.ok) { const dQ = Math.abs(more.sol.Q) - Math.abs(sol.Q); facts.push(`Re-solved with 1 mm more of #${n - 1} (h recomputed for the new diameter and surface temperature): the heat flow ${dQ > 0 ? 'rises' : 'falls'} by ${Math.abs(dQ).toFixed(3)} W.`); }
  }
  let movers = [];
  if (g) {                                   // the three best numeric changes and the best material swap
    const help = sensitivity(s, g.quantity, { designOnly: true }).rows.filter(r => r.delta * g.dir > 0);
    movers = [...help.filter(r => typeof r.to === 'number').slice(0, 3), ...help.filter(r => typeof r.to === 'string').slice(0, 1)];
  }
  return { check: g, pass: g ? g.pass : null, headline, limiting: { index: lim, share, text: limitingText }, ranked, facts, movers, quantity: g?.quantity ?? null };
}
export function applyChange(s, ref, to) { if (typeof to === 'string') setParam(s, ref.id, ref.key, to); else Object.assign(s, applyInput(s, ref, to)); }

// ---------- learning notes (shown on request; they never change a tool or a number) ----------
export const TOPICS = [
  { id: 'network', when: () => true, title: 'Thermal resistance network', concept: 'Steady heat flow along one path is the same through every layer, so the resistances add like series electrical resistors and the temperature drop across each layer is Q times its resistance. The largest resistance takes the largest share of the temperature difference: that is the layer that limits the heat flow.',
    equation: 'Q = (T_start − T_ambient) / ΣR;  ΔT_i = Q·R_i;  parallel paths: 1/R = Σ 1/R_j', limits: 'Steady state, one-dimensional heat flow, constant k. Incropera 7th ed. §3.1, Table 3.3.' },
  { id: 'conduction', when: s => s.layers.some(l => ['conduction', 'parallel'].includes(l.type)), title: 'Conduction through a wall or a pipe wall', concept: 'A plane layer resists in proportion to its thickness; a cylindrical shell resists by the logarithm of its radius ratio, because the area grows outward.',
    equation: 'plane R = t/(kA);  cylinder R = ln(r₂/r₁)/(2πkL);  side by side: conductances k_j·A_j/t add', limits: 'k values are typical near 300 K (Incropera Tables A.1, A.3); a specific product differs. Side-by-side layers assume heat flows straight through each part (no sideways spreading).' },
  { id: 'contact', when: s => s.layers.some(l => l.type === 'contact'), title: 'Contact resistance', concept: 'Two pressed surfaces touch only at peaks; the gaps hold air, which conducts poorly. Thermal grease or a pad fills the gaps.',
    equation: 'R = R″t,c / A;  typical R″ 0.07–0.6 ×10⁻⁴ m²·K/W with a filler, 1–5 ×10⁻⁴ for bare metals in air', limits: 'Enter a value for your interface; it depends on pressure, finish and filler (Incropera Tables 3.1, 3.2).' },
  { id: 'convection', when: s => s.layers.some(l => l.type === 'convection'), title: 'Convection and its correlations', concept: 'A surface hands heat to a moving fluid across a thin boundary layer; h sums up how well. Natural convection is driven by the warm air rising, so h grows with the temperature difference; forced flow gives a much larger h.',
    equation: 'R = 1/(hA);  vertical plate Nu = {0.825 + 0.387Ra^⅙/[1 + (0.492/Pr)^(9/16)]^(8/27)}²;  horizontal pipe Nu = {0.60 + 0.387Ra^⅙/[1 + (0.559/Pr)^(9/16)]^(8/27)}²;  flat plate Nu = 0.664Re^½Pr^⅓ (Re ≤ 5×10⁵), (0.037Re^0.8 − 871)Pr^⅓ (to 10⁸);  across a pipe (Churchill–Bernstein)',
    limits: `Correlations are for air at 1 atm with properties at the film temperature, ${AIR_RANGE[0]}–${AIR_RANGE[1]} K (Incropera Table A.4); Ra ≤ 10¹², Re ≤ 10⁸ for a plate, Re·Pr ≥ 0.2 across a pipe. Outside these the bench refuses. Flow inside pipes and fin channels is not modelled: enter h.` },
  { id: 'radiation', when: s => s.layers.some(l => l.type === 'convection' && l.emissivity > 0), title: 'Radiation as a coefficient', concept: 'A warm surface also radiates to the walls around it. Written as a coefficient it acts in parallel with convection.',
    equation: 'h_r = εσ(T_s + T_sur)(T_s² + T_sur²)  (kelvin);  R = 1/((h_c + h_r)A)', limits: 'Linearised: h_r is evaluated at the solved surface temperature (iterated), for a grey surface in large surroundings at the ambient temperature. Only the outer surface radiates; fins are not given radiation.' },
  { id: 'fins', when: s => s.layers.some(l => l.type === 'fins'), title: 'Fins and fin arrays', concept: 'A fin adds surface, but its far end is cooler than its base, so each extra millimetre helps less. Efficiency compares the fin with an ideal fin at base temperature; effectiveness compares it with the bare base it covers (worth having when above about 2).',
    equation: 'm = √(hP/kA_c);  insulated tip q = √(hPkA_c)·θ_b·tanh(mL);  convective tip q = √(hPkA_c)θ_b(sinh mL + (h/mk)cosh mL)/(cosh mL + (h/mk)sinh mL);  array 1/R = h·A_unfinned + N·q_f/θ_b',
    limits: `One-dimensional fin (refused when h·(A_c/P)/k > 0.1), one h on fins and base, no radiation from fins. Fin gaps below ${MIN_FIN_GAP * 1000} mm are refused: closely spaced fins share one boundary layer, and fin-channel correlations are not built. Incropera §3.6.` },
  { id: 'critical', when: s => s.geometry === 'cylinder', title: 'Critical radius of insulation', concept: 'Insulating a pipe adds conduction resistance but also adds outer surface, which lowers the convection resistance. On a thin pipe the second effect wins at first, so a thin layer of insulation can increase the heat loss until the outer radius passes k/h.',
    equation: 'R(r) = ln(r/r₁)/(2πkL) + 1/(2πrLh);  dR/dr = 0 at r_cr = k/h', limits: 'r_cr uses the current h; natural convection and radiation change with the outer diameter and temperature, so a sweep of insulation thickness (Sweep tab) shows the true peak.' },
  { id: 'transient', when: s => !!s.transient, title: 'Warming up and cooling down (lumped body)', concept: 'If the body conducts much better than its surface hands heat to the fluid, it stays at one temperature while it heats or cools, and approaches ambient exponentially.',
    equation: 'Bi = h(V/A)/k ≤ 0.1;  τ = ρVc/(hA);  t = τ·ln((T_i − T_∞)/(T − T_∞))', limits: 'Refused when Bi > 0.1 (temperatures inside the body would differ). Incropera §5.1–5.2.' },
  { id: 'limits', when: () => true, title: 'What this bench does not model', concept: 'One heat path in steady state from a start face to ambient, plus an optional lumped body.',
    equation: '', limits: 'Not modelled: two- and three-dimensional conduction and spreading resistance, heat generation inside a layer, temperature-dependent k, enclosures and gaps of fluid between layers, internal pipe flow, fin-channel flow, annular fins, radiation exchange between surfaces, liquids in the correlations, heat exchangers, transients other than a lumped body.' },
];
