// Machine Design bench — shafts first. The learner builds a shaft (segments, material), places bearings, applies
// their own forces and torques and sets their own limits. Physics: engines/machine/shaft.mjs. The tools that answer
// questions are generic — checks against the learner's limits, what governs, what moves a result (computed
// sensitivities) and a sweep of any input — so different questions need no lesson code.
import { solveShaft, ShaftError, lengthOf } from '../engines/machine/shaft.mjs';
import { MATERIALS } from '../core/materials.mjs';

export class EditError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));
export const SHAFT_MATERIALS = ['steel', 'aluminium', 'castIron'];

export const emptySetup = () => ({ material: 'steel', selfWeight: true, segments: [], bearings: [], loads: [], limits: { minSF: 2, deflection: null, slope: null }, nextId: 1 });
const nid = (s, p) => `${p}${s.nextId++}`;
const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new EditError(`${what} must be between ${lo} and ${hi}`); return v; };
const byId = (list, id, what) => { const x = list.find(i => i.id === id); if (!x) throw new EditError(`no such ${what}`); return x; };

// ---------- edits (validate first, change nothing on refusal) ----------
export function setMaterial(s, id) { if (!SHAFT_MATERIALS.includes(id)) throw new EditError('choose a listed material'); s.material = id; }
export function setSelfWeight(s, on) { s.selfWeight = !!on; }
export function addSegment(s, { L = 100, d = 30, bore = 0 } = {}, afterId = null) {
  num(L, 1, 3000, 'segment length (mm)'); num(d, 3, 500, 'diameter (mm)'); num(bore, 0, d - 1, 'bore (mm)');
  const seg = { id: nid(s, 's'), L, d, bore }, i = afterId ? s.segments.findIndex(x => x.id === afterId) + 1 : s.segments.length;
  s.segments.splice(i, 0, seg); return seg.id;
}
export function setSegment(s, id, key, v) {
  const seg = byId(s.segments, id, 'segment'), next = { ...seg, [key]: v };
  if (key === 'L') num(v, 1, 3000, 'segment length (mm)'); else if (key === 'd') num(v, 3, 500, 'diameter (mm)'); else if (key === 'bore') num(v, 0, 499, 'bore (mm)'); else throw new EditError('unknown setting');
  if (next.bore >= next.d - 0.5) throw new EditError('the bore must be smaller than the diameter');
  Object.assign(seg, next);
}
export const removeSegment = (s, id) => { byId(s.segments, id, 'segment'); s.segments = s.segments.filter(x => x.id !== id); };
export function addBearing(s, x, rating = null) { num(x, 0, 6000, 'bearing position (mm)'); if (rating !== null) num(rating, 1, 1e7, 'bearing load limit (N)'); const id = nid(s, 'b'); s.bearings.push({ id, x, rating }); return id; }
export function setBearing(s, id, key, v) {
  const b = byId(s.bearings, id, 'bearing');
  if (key === 'x') b.x = num(v, 0, 6000, 'bearing position (mm)');
  else if (key === 'rating') b.rating = v === null ? null : num(v, 1, 1e7, 'bearing load limit (N)');
  else throw new EditError('unknown setting');
}
export const removeBearing = (s, id) => { byId(s.bearings, id, 'bearing'); s.bearings = s.bearings.filter(x => x.id !== id); };
export function addForce(s, x, F) { num(x, 0, 6000, 'load position (mm)'); num(F, -1e6, 1e6, 'force (N)'); const id = nid(s, 'f'); s.loads.push({ id, kind: 'force', x, F }); return id; }
export function addTorque(s, x, T) { num(x, 0, 6000, 'torque position (mm)'); num(T, -1e5, 1e5, 'torque (N·m)'); const id = nid(s, 't'); s.loads.push({ id, kind: 'torque', x, T }); return id; }
export function setLoad(s, id, key, v) {
  const l = byId(s.loads, id, 'load');
  if (key === 'x') l.x = num(v, 0, 6000, 'position (mm)');
  else if (key === 'F' && l.kind === 'force') l.F = num(v, -1e6, 1e6, 'force (N)');
  else if (key === 'T' && l.kind === 'torque') l.T = num(v, -1e5, 1e5, 'torque (N·m)');
  else throw new EditError('unknown setting');
}
export const removeLoad = (s, id) => { byId(s.loads, id, 'load'); s.loads = s.loads.filter(x => x.id !== id); };
export function setLimit(s, key, v) {
  if (!(key in s.limits)) throw new EditError('unknown limit');
  if (v === null) { if (key === 'minSF') throw new EditError('a minimum safety factor is always checked'); s.limits[key] = null; return; }
  s.limits[key] = key === 'minSF' ? num(v, 1, 20, 'minimum safety factor') : key === 'deflection' ? num(v, 0.001, 100, 'deflection limit (mm)') : num(v, 0.01, 100, 'bearing slope limit (mrad)');
}
const EDITS = { setMaterial, setSelfWeight, addSegment, setSegment, addBearing, setBearing, addForce, addTorque, setLoad, setLimit };

// ---------- presets: edit scripts replayed into an empty setup ----------
export const PRESETS = [
  { id: 'pulley', name: 'Overhung pulley shaft', script: [
    ['addSegment', { L: 400, d: 30 }], ['addBearing', 0], ['addBearing', 250], ['addForce', 380, 1500], ['addTorque', 20, 40], ['addTorque', 380, -40],
    ['setLimit', 'minSF', 2], ['setLimit', 'deflection', 0.15]] },
  { id: 'countershaft', name: 'Gearbox countershaft', script: [
    ['addSegment', { L: 60, d: 25 }], ['addSegment', { L: 180, d: 32 }], ['addSegment', { L: 60, d: 25 }], ['addBearing', 30, 3000], ['addBearing', 270, 3000],
    ['addForce', 100, 1800], ['addTorque', 100, 60], ['addForce', 220, 3200], ['addTorque', 220, -60], ['setLimit', 'minSF', 2.5], ['setLimit', 'deflection', 0.05]] },
  { id: 'line', name: 'Line shaft on three bearings', script: [
    ['addSegment', { L: 1500, d: 40 }], ['addBearing', 0], ['addBearing', 750], ['addBearing', 1500], ['addForce', 375, 2000], ['addForce', 1125, 2000],
    ['addTorque', 0, 150], ['addTorque', 375, -75], ['addTorque', 1125, -75], ['setLimit', 'minSF', 2], ['setLimit', 'deflection', 0.5]] },
];
export function fromPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) throw new EditError('no such preset');
  const s = emptySetup(); for (const [fn, ...args] of p.script) EDITS[fn](s, ...args); return s;
}
export const SCRIPT_EDITS = EDITS;

// ---------- solve, checks, governing ----------
const toShaft = s => ({ material: s.material, selfWeight: s.selfWeight, segments: s.segments, bearings: s.bearings, loads: s.loads.map(l => (l.kind === 'torque' ? { ...l, T: l.T * 1000 } : l)) });
export const bearingLabel = (s, id) => `Bearing ${s.bearings.findIndex(b => b.id === id) + 1}`;

export function evaluate(s) {
  let r;
  try { r = solveShaft(toShaft(s)); }
  catch (e) { if (e instanceof ShaftError) return { ok: false, code: e.code, reason: e.message }; throw e; }
  const checks = [{ key: 'strength', label: `Strength (${r.criterion})`, value: r.sf, limit: s.limits.minSF, unit: '', util: s.limits.minSF / r.sf,
    where: r.worst.x, text: `safety factor ${r.sf.toFixed(2)} (needs ≥ ${s.limits.minSF})` }];
  if (s.limits.deflection !== null) checks.push({ key: 'deflection', label: 'Deflection', value: Math.abs(r.maxDefl.v), limit: s.limits.deflection, unit: 'mm', util: Math.abs(r.maxDefl.v) / s.limits.deflection, where: r.maxDefl.x,
    text: `${Math.abs(r.maxDefl.v).toFixed(4)} mm (limit ${s.limits.deflection} mm)` });
  if (s.limits.slope !== null) checks.push({ key: 'slope', label: 'Slope at bearings', value: Math.abs(r.maxSlope.slope) * 1000, limit: s.limits.slope, unit: 'mrad', util: Math.abs(r.maxSlope.slope) * 1000 / s.limits.slope, where: r.maxSlope.x,
    text: `${(Math.abs(r.maxSlope.slope) * 1000).toFixed(3)} mrad (limit ${s.limits.slope} mrad)` });
  s.bearings.forEach((b, i) => { if (b.rating !== null) checks.push({ key: `R:${b.id}`, label: `${bearingLabel(s, b.id)} load`, value: Math.abs(r.reactions[i].R), limit: b.rating, unit: 'N', util: Math.abs(r.reactions[i].R) / b.rating, where: b.x,
    text: `${Math.abs(r.reactions[i].R).toFixed(0)} N (limit ${b.rating} N)` }); });
  checks.forEach(c => { c.pass = c.util <= 1 + 1e-12; });
  const governing = checks.reduce((a, c) => (c.util > a.util ? c : a));
  const outputs = {};
  s.bearings.forEach((b, i) => { outputs[`R:${b.id}`] = { label: `${bearingLabel(s, b.id)} reaction (x = ${b.x} mm)`, value: r.reactions[i].R, unit: 'N', source: 'simulated' }; });
  Object.assign(outputs, { stress: { label: `Highest ${r.criterion} stress`, value: r.worst.eq, unit: 'MPa', source: 'simulated' }, sf: { label: 'Safety factor', value: r.sf, unit: '', source: 'simulated' },
    deflection: { label: 'Largest deflection', value: Math.abs(r.maxDefl.v), unit: 'mm', source: 'simulated' }, slope: { label: 'Largest bearing slope', value: Math.abs(r.maxSlope.slope) * 1000, unit: 'mrad', source: 'simulated' },
    torque: { label: 'Largest torque carried', value: r.maxTorque / 1000, unit: 'N·m', source: 'simulated' }, mass: { label: 'Shaft mass', value: r.mass, unit: 'kg', source: 'simulated' } });
  const verdicts = Object.fromEntries(checks.map(c => [c.key, { label: c.label, value: c.pass ? 'pass' : 'fail', reason: c.text }]));
  return { ok: true, r, checks, governing, outputs, verdicts };
}
export const ADAPTER = { domain: 'machine-shaft', title: 'Shaft', evaluate: s => { const e = evaluate(s); return e.ok ? { ok: true, outputs: e.outputs, verdicts: e.verdicts } : { ok: false, reason: e.reason }; } };

// ---------- generic question tools ----------
// Quantities any tool can ask about.
export function quantities(s) {
  return [{ key: 'deflection', label: 'Largest deflection (mm)' }, { key: 'sf', label: 'Safety factor' }, { key: 'stress', label: 'Highest stress (MPa)' }, { key: 'slope', label: 'Largest bearing slope (mrad)' },
    ...s.bearings.map(b => ({ key: `R:${b.id}`, label: `${bearingLabel(s, b.id)} reaction (N)` }))];
}
const read = (e, key) => (key.startsWith('R:') ? Math.abs(e.outputs[key].value) : e.outputs[key].value);
// Inputs a learner can vary.
export function inputs(s) {
  return [...s.segments.map((g, i) => ({ ref: { list: 'segments', id: g.id, key: 'd' }, label: `Segment ${i + 1} diameter (mm)`, value: g.d, step: 1 })),
    ...s.bearings.map(b => ({ ref: { list: 'bearings', id: b.id, key: 'x' }, label: `${bearingLabel(s, b.id)} position (mm)`, value: b.x, step: 5 })),
    ...s.loads.filter(l => l.kind === 'force').map(l => ({ ref: { list: 'loads', id: l.id, key: 'x' }, label: `Force ${s.loads.filter(q => q.kind === 'force').indexOf(l) + 1} position (mm)`, value: l.x, step: 5 }))];
}
const apply = (s, ref, v) => { const t = clone(s); const item = t[ref.list].find(x => x.id === ref.id); item[ref.key] = v; return t; };

// What moves a result: change each input by one small step either way and report the effect (computed, not assumed).
export function sensitivity(s, key) {
  const base = evaluate(s); if (!base.ok) throw new EditError(base.reason);
  const q0 = read(base, key), rows = [];
  for (const inp of inputs(s)) for (const dir of [1, -1]) {
    const v = inp.value + dir * inp.step, e = evaluate(apply(s, inp.ref, v));
    if (e.ok && e.outputs[key]) rows.push({ input: inp.label, change: `${dir > 0 ? '+' : '−'}${inp.step}`, ref: inp.ref, to: v, delta: read(e, key) - q0 });
  }
  for (const m of SHAFT_MATERIALS.filter(m => m !== s.material)) { const e = evaluate({ ...clone(s), material: m }); if (e.ok) rows.push({ input: 'Material', change: `→ ${MATERIALS[m].name}`, delta: read(e, key) - q0 }); }
  return { quantity: key, value: q0, rows: rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}
// Sweep one input over a range and record a quantity; positions where the setup is impossible are reported as such.
export function sweep(s, ref, key, from, to, steps = 20) {
  if (!(steps >= 2 && steps <= 100) || !(to > from)) throw new EditError('choose a range with the end above the start');
  const pts = Array.from({ length: steps + 1 }, (_, k) => { const v = from + (to - from) * k / steps, e = evaluate(apply(s, ref, v)); return { v, q: e.ok ? read(e, key) : null, why: e.ok ? null : e.reason }; });
  const ok = pts.filter(p => p.q !== null), best = ok.length ? ok.reduce((a, p) => (key === 'sf' ? (p.q > a.q ? p : a) : (p.q < a.q ? p : a))) : null;
  return { ref, key, points: pts, best };
}
// Why the governing check governs: the facts of the solved shaft plus the three inputs that move it most.
export function explain(s) {
  const e = evaluate(s); if (!e.ok) throw new EditError(e.reason);
  const g = e.governing, key = g.key === 'strength' ? 'sf' : g.key;
  // the computed changes that help most (lower the quantity, or raise the safety factor)
  const sens = sensitivity(s, key).rows.filter(r => (key === 'sf' ? r.delta > 0 : r.delta < 0)).slice(0, 3);
  const where = `at x = ${g.where.toFixed(0)} mm`;
  const facts = g.key === 'strength'
    ? `Highest ${e.r.criterion} stress ${e.r.worst.eq.toFixed(1)} MPa ${where} (bending ${Math.abs(e.r.worst.sigma).toFixed(1)} MPa from M = ${(Math.abs(e.r.worst.M) / 1000).toFixed(1)} N·m on Ø${e.r.worst.d} mm, shear ${Math.abs(e.r.worst.tau).toFixed(1)} MPa from T = ${(Math.abs(e.r.worst.T) / 1000).toFixed(1)} N·m), against ${e.r.allow} MPa for ${e.r.material.name}.`
    : g.key === 'deflection' ? `The shaft deflects most ${where}: ${g.value.toFixed(4)} mm.`
    : g.key === 'slope' ? `The steepest slope is at the bearing ${where}: ${g.value.toFixed(3)} mrad.`
    : `${g.label.replace(' load', '')} carries ${g.value.toFixed(0)} N.`;
  return { check: g, pass: g.pass, headline: `${g.label} governs: ${g.text} — ${(g.util * 100).toFixed(0)} % of your limit.`, facts, movers: sens, quantity: key };
}

// ---------- learning notes (on request; never change a tool or a result) ----------
export const TOPICS = [
  { id: 'reactions', title: 'Bearing reactions', concept: 'With two bearings the reactions follow from force and moment balance. With three or more the shaft is statically indeterminate: reactions also depend on how the shaft bends, so the solver uses stiffness.', equation: 'ΣF = 0,  ΣM = 0;  two bearings: R₂ = Σ F·(x − x₁) / (x₂ − x₁)' },
  { id: 'bending', title: 'Bending stress', concept: 'Bending moment makes tension on one side of the shaft and compression on the other, largest at the surface.', equation: 'σ = M·c / I;  solid shaft σ = 32 M / (π d³);  hollow I = π(d⁴ − dᵢ⁴)/64' },
  { id: 'torsion', title: 'Torsion', concept: 'Torque is carried between where power enters and where it leaves; elsewhere the shaft carries none.', equation: 'τ = T·r / J;  solid shaft τ = 16 T / (π d³);  J = π(d⁴ − dᵢ⁴)/32' },
  { id: 'combined', title: 'Combined stress', concept: 'Ductile materials yield on distortion energy (von Mises); brittle ones crack on the largest principal stress.', equation: 'ductile σ_eq = √(σ² + 3τ²);  brittle σ₁ = σ/2 + √(σ²/4 + τ²);  safety factor = strength / σ_eq' },
  { id: 'deflection', title: 'Deflection and slope', concept: 'Curvature is moment divided by stiffness EI; integrating twice gives slope and deflection. Bearings and gears need small slopes and deflections to run properly.', equation: 'E·I·v″ = M;  centre load on span L: v = F L³ / (48 E I)' },
  { id: 'limits', title: 'What this bench does not model', concept: 'Static strength and stiffness of a shaft in one plane.', equation: '', limits: 'Not modelled: fatigue and stress concentrations at steps and keyways, loads in two planes, bearing stiffness and life, shear deflection, whirling and critical speed, axial loads. Material values are typical, not a specific grade.' },
];
export const shaftLength = s => (s.segments.length ? lengthOf(s) : 0);
