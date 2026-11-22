// LEARN descriptor for the machine design bench, shafts (docs/OPEN_LOOP.md → "What each bench provides"). Data and
// pure functions, no DOM. Every number comes from machine/model.mjs; nothing here computes physics.
// Same shape as circuit/learn.mjs: describe, outputs, output(key, setup), outputsFor(setup), levers, applyLever, concepts.
// Outputs mapped (competencies in content/graph/machine.mjs, statics.mjs, solids.mjs):
//   torque → ENG.machine.torque-power; stress, sf → ENG.machine.combined-stress; critical, dunkerley, critPct →
//   ENG.machine.critical-speed; deflection → ENG.solids.beam-stiffness; R:<bearingId> → ENG.statics.beam-reactions
//   (only on two bearings: with three or more the shaft is statically indeterminate).
// Not mapped (no taught node yet): slope, mass, fatigueSF, Se, amplitude, L10h:<id>; speed is the student's input.
import { ADAPTER, upgrade, applyRef, SHAFT_MATERIALS, SURFACE, RAISER_KINDS, bearingLabel } from './model.mjs';
import { MATERIALS } from '../core/materials.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fmt = n => String(+(+n).toPrecision(4));

// ---------- the shaft in words ----------
export function describe(setup0) {
  const s = upgrade(setup0), out = [];
  out.push({ label: 'Material', value: MATERIALS[s.material]?.name ?? s.material, paths: ['material'] });
  out.push({ label: "Shaft's own weight", value: s.selfWeight ? 'included' : 'left out', paths: ['selfWeight'] });
  s.segments.forEach((g, i) => out.push({ label: `Segment ${i + 1}`, value: `length ${fmt(g.L)} mm, diameter ${fmt(g.d)} mm${g.bore ? `, bore ${fmt(g.bore)} mm` : ''}`, paths: [`segments.${i}`] }));
  s.bearings.forEach((b, i) => out.push({ label: `Bearing ${i + 1}`, value: [`at ${fmt(b.x)} mm`, b.rating !== null ? `load limit ${fmt(b.rating)} N` : null, b.C !== null ? `${b.type} bearing, C ${fmt(b.C)} N` : null].filter(Boolean).join(', '), paths: [`bearings.${i}`] }));
  let nf = 0, nt = 0;
  s.loads.forEach((l, i) => {
    if (l.kind === 'force') out.push({ label: `Force ${++nf}`, value: `${fmt(l.F)} N at ${fmt(l.x)} mm${l.mass ? `, rotating mass ${fmt(l.mass)} kg` : ''}${l.ecc ? `, eccentricity ${fmt(l.ecc)} µm` : ''}`, paths: [`loads.${i}`] });
    else out.push({ label: `Torque ${++nt}`, value: `${fmt(l.T)} N·m at ${fmt(l.x)} mm`, paths: [`loads.${i}`] });
  });
  s.raisers.forEach((q, i) => out.push({ label: `Stress raiser ${i + 1}`, value: `${RAISER_KINDS[q.kind]?.label ?? q.kind} at ${fmt(q.x)} mm, Kt ${fmt(q.kt)}, Kts ${fmt(q.kts)}`, paths: [`raisers.${i}`] }));
  out.push({ label: 'Operating speed', value: s.speed === null ? 'none (static check only)' : `${fmt(s.speed)} rpm`, paths: ['speed'] });
  out.push({ label: 'Fatigue and vibration settings', value: `surface ${SURFACE[s.finish]?.label ?? s.finish}, reliability ${fmt(s.reliability)} %, damping ratio ${fmt(s.damping)}`, paths: ['finish', 'reliability', 'damping'] });
  const L = s.limits, lim = [`safety factor ≥ ${fmt(L.minSF)}`, L.deflection !== null ? `deflection ≤ ${fmt(L.deflection)} mm` : null, L.slope !== null ? `slope ≤ ${fmt(L.slope)} mrad` : null,
    L.fatigueSF !== null ? `fatigue safety factor ≥ ${fmt(L.fatigueSF)}` : null, L.lifeHours !== null ? `bearing life ≥ ${fmt(L.lifeHours)} h` : null,
    L.critPct !== null ? `speed ≤ ${fmt(L.critPct)} % of critical` : null, L.amplitude !== null ? `whirl ≤ ${fmt(L.amplitude)} µm` : null].filter(Boolean);
  out.push({ label: 'Your limits', value: lim.join(', '), paths: ['limits'] });
  return out;
}

// ---------- predictable outputs ----------
export const outputs = {
  torque: { label: 'Largest torque carried', unit: 'N·m', competency: 'ENG.machine.torque-power' },
  stress: { label: 'Highest equivalent stress', unit: 'MPa', competency: 'ENG.machine.combined-stress' },
  sf: { label: 'Safety factor', unit: '', competency: 'ENG.machine.combined-stress' },
  deflection: { label: 'Largest deflection', unit: 'mm', competency: 'ENG.solids.beam-stiffness' },
  critical: { label: 'First critical speed (Rayleigh)', unit: 'rpm', competency: 'ENG.machine.critical-speed' },
  dunkerley: { label: 'Critical speed, Dunkerley check', unit: 'rpm', competency: 'ENG.machine.critical-speed' },
  critPct: { label: 'Operating speed, % of critical', unit: '%', competency: 'ENG.machine.critical-speed' },
};
export function output(key, setup) {
  if (key.startsWith('R:')) {
    const s = setup ? upgrade(setup) : null, id = key.slice(2);
    if (s && (s.bearings.length !== 2 || !s.bearings.some(b => b.id === id))) return null;
    const b = s?.bearings.find(x => x.id === id);
    return { label: s ? `${bearingLabel(s, id)} reaction (x = ${b.x} mm)` : 'Bearing reaction', unit: 'N', competency: 'ENG.statics.beam-reactions',
      what: s ? `the reaction at ${bearingLabel(s, id).toLowerCase()} (x = ${b.x} mm)` : 'a bearing reaction' };
  }
  const o = outputs[key]; return o ? { ...o, what: o.label.toLowerCase() } : null;
}
export function outputsFor(setup) {
  const r = ADAPTER.evaluate(setup); if (!r.ok) return {};
  return Object.fromEntries(Object.entries(r.outputs).filter(([, o]) => o.source === 'simulated').map(([k, o]) => {
    const d = output(k, setup); return d ? [k, { ...d, label: o.label, unit: o.unit }] : null;
  }).filter(Boolean));
}

// ---------- levers ----------
const LIST = { segments: 'segments', bearings: 'bearings', loads: 'loads' };
export function applyLever(setup, path, value) {
  const t = upgrade(clone(setup)), m = /^(segments|bearings|loads)\.(\d+)\.(\w+)$/.exec(path);
  if (m) { const item = t[LIST[m[1]]][+m[2]]; if (!item) throw new Error(`nothing at ${path}`); applyRef(t, { list: m[1], id: item.id, key: m[3] }, value); return t; }
  if (['material', 'speed', 'finish'].includes(path)) { applyRef(t, { list: 'setup', key: path }, value); return t; }
  throw new Error(`not a lever path: ${path}`);
}
const solves = s => ADAPTER.evaluate(s).ok;
const round3 = v => +v.toPrecision(3);
const around = (v, { min = -Infinity, max = Infinity, whole = false } = {}) => {
  const step = v === 0 ? 10 : Math.abs(v) * 0.2;
  return [v - step, v + step].map(x => (whole ? Math.round(x) : round3(x))).map(x => Math.min(max, Math.max(min, x)));
};
export function levers(setup0) {
  const s = upgrade(setup0), out = [];
  const add = (path, label, kind, unit, value, cands, extra = {}) => {
    const values = [...new Set(cands)].filter(x => x !== value).filter(x => { try { return solves(applyLever(s, path, x)); } catch { return false; } });
    if (values.length) out.push({ path, label, kind, unit, value, values, ...extra });
  };
  add('material', 'Shaft material', 'option', '', s.material, SHAFT_MATERIALS, { options: Object.fromEntries(SHAFT_MATERIALS.map(m => [m, MATERIALS[m].name])) });
  s.segments.forEach((g, i) => {
    add(`segments.${i}.d`, `Segment ${i + 1} diameter`, 'number', 'mm', g.d, around(g.d, { min: Math.max(3, g.bore + 1), max: 500, whole: true }));
    add(`segments.${i}.L`, `Segment ${i + 1} length`, 'number', 'mm', g.L, around(g.L, { min: 1, max: 3000, whole: true }));
  });
  s.bearings.forEach((b, i) => add(`bearings.${i}.x`, `Bearing ${i + 1} position`, 'number', 'mm', b.x, around(b.x, { min: 0, max: 6000, whole: true })));
  let nf = 0;
  s.loads.forEach((l, i) => {
    if (l.kind !== 'force') return; nf++;
    add(`loads.${i}.F`, `Force ${nf}`, 'number', 'N', l.F, around(l.F, { min: -1e6, max: 1e6 }));
    add(`loads.${i}.x`, `Force ${nf} position`, 'number', 'mm', l.x, around(l.x, { min: 0, max: 6000, whole: true }));
    if (s.speed !== null && l.mass > 0) add(`loads.${i}.mass`, `Force ${nf} rotating mass`, 'number', 'kg', l.mass, around(l.mass, { min: 0, max: 1e4 }));
  });
  if (s.speed !== null) add('speed', 'Operating speed', 'number', 'rpm', s.speed, around(s.speed, { min: 10, max: 100000, whole: true }));
  return out;
}

export function concepts(setup0) {
  const s = upgrade(setup0), c = ['ENG.machine.combined-stress', 'ENG.solids.bending-stress', 'ENG.solids.beam-stiffness'];
  if (s.loads.some(l => l.kind === 'torque' && l.T)) c.push('ENG.machine.torsion-stress', 'ENG.machine.torque-power');
  if (s.bearings.length === 2) c.push('ENG.statics.beam-reactions');
  if (s.speed !== null) c.push('ENG.machine.critical-speed');
  return c;
}

export const LEARN = {
  domain: 'machine-shaft',
  page: '../machine/',
  adapter: () => import('./model.mjs').then(m => m.ADAPTER),
  describe, outputs, output, outputsFor, levers, applyLever, concepts,
};
export default LEARN;
