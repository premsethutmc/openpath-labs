// LEARN descriptor for the thermal bench, one heat path (docs/OPEN_LOOP.md → "What each bench provides"). Data and
// pure functions, no DOM. Every number comes from thermal/model.mjs; nothing here computes physics.
// Same shape as circuit/learn.mjs: describe, outputs, output(key, setup), outputsFor(setup), levers, applyLever, concepts.
// Outputs mapped (content/graph/thermal.mjs): Q, Rt, surfaceT, startT (when the start is a heat source, so the start
// temperature is a result) and T:<at> thermometer readings → ENG.thermal.series-resistance.
// Not mapped (no taught node yet): finEta, finEff, tipT, rCrit, tTime; startT when the student fixed it (an input).
import { ADAPTER, LAYERS, MATERIALS, inputs, applyInput, setParam, pointLabel } from './model.mjs';

const fmt = n => String(+(+n).toPrecision(4));

// ---------- the heat path in words ----------
const shown = (l, k) => {
  if (k === 'k') return l.material === 'custom';
  if (l.type === 'convection') return k === 'mode' || k === 'emissivity' || (k === 'h' && l.mode === 'h') || (k === 'Lc' && /plate/.test(l.mode)) || (k === 'V' && /forced/.test(l.mode));
  if (l.type === 'fins' && k === 'w') return l.shape !== 'pin';
  return true;
};
const layerWords = l => Object.entries(LAYERS[l.type].params).filter(([k]) => l[k] !== undefined && shown(l, k)).map(([k, d]) => {
  const v = l[k]; if (d.options) return `${d.label.replace(/ \(used when.*\)/, '').toLowerCase()} ${d.options[v] ?? v}`;
  return `${d.label.replace(/ \(used when.*\)/, '').replace(/ \(0 = no radiation\)/, '').toLowerCase()} ${fmt(v * (d.scale ?? 1))}${d.unit ? ` ${d.unit}` : ''}`;
}).join(', ');
export function describe(s) {
  const out = [];
  // the unused sizes of the other geometry are kept in the setup but change nothing, so the one row covers them
  out.push(s.geometry === 'plane' ? { label: 'Geometry', value: `plane wall, area ${fmt(s.area)} m²`, paths: ['geometry', 'area', 'r0', 'length'] }
    : { label: 'Geometry', value: `pipe, inner radius ${fmt(s.r0 * 1000)} mm, length ${fmt(s.length)} m`, paths: ['geometry', 'r0', 'length', 'area'] });
  out.push({ label: 'Start face', value: s.start.kind === 'temp' ? `held at ${fmt(s.start.T)} °C` : `heat source ${fmt(s.start.Q)} W`, paths: ['start'] });
  s.layers.forEach((l, i) => out.push({ label: `${i + 1}. ${LAYERS[l.type].name}`, value: layerWords(l) || '—', paths: [`layers.${i}`] }));
  out.push({ label: 'Ambient', value: `${fmt(s.ambient)} °C`, paths: ['ambient'] });
  out.push({ label: 'Thermometers', value: s.thermometers.length ? s.thermometers.map(at => pointLabel(s, at)).join('; ') : 'none', paths: ['thermometers'] });
  const L = s.limits ?? {}, lim = [L.maxStartT != null ? `start face ≤ ${fmt(L.maxStartT)} °C` : null, L.maxSurfaceT != null ? `outer surface ≤ ${fmt(L.maxSurfaceT)} °C` : null,
    L.maxQ != null ? `heat flow ≤ ${fmt(L.maxQ)} W` : null, L.minQ != null ? `heat flow ≥ ${fmt(L.minQ)} W` : null].filter(Boolean);
  out.push({ label: 'Your limits', value: lim.length ? lim.join(', ') : 'none', paths: ['limits'] });
  const tr = s.transient;
  out.push({ label: 'Warm-up body', value: tr ? `${MATERIALS[tr.material]?.name ?? tr.material}, volume ${fmt(tr.V)} m³, surface ${fmt(tr.As)} m², h ${fmt(tr.h)} W/m²·K, from ${fmt(tr.Ti)} °C to ${fmt(tr.Ttarget)} °C` : 'none', paths: ['transient'] });
  return out;
}

// ---------- predictable outputs ----------
const SERIES = 'ENG.thermal.series-resistance';
export const outputs = {
  Q: { label: 'Heat flow', unit: 'W', competency: SERIES },
  Rt: { label: 'Total resistance', unit: 'K/W', competency: SERIES },
  surfaceT: { label: 'Outer-surface temperature', unit: '°C', competency: SERIES },
  startT: { label: 'Start-face temperature', unit: '°C', competency: SERIES },
};
export function output(key, setup) {
  if (key.startsWith('T:')) {
    const at = key.slice(2);
    if (setup && at !== 'start' && !setup.layers.some(l => l.id === at)) return null;
    const label = setup ? `Temperature at ${pointLabel(setup, at).replace(/^T /, '')}` : 'Thermometer reading';
    return { label, unit: '°C', competency: SERIES, what: label.toLowerCase() };
  }
  if (key === 'startT' && setup && setup.start.kind === 'temp') return null;   // the student's own input
  const o = outputs[key]; return o ? { ...o, what: o.label.toLowerCase() } : null;
}
export function outputsFor(setup) {
  const r = ADAPTER.evaluate(setup); if (!r.ok) return {};
  return Object.fromEntries(Object.entries(r.outputs).filter(([, o]) => o.source === 'simulated').map(([k, o]) => {
    const d = output(k, setup); return d ? [k, { ...d, unit: o.unit }] : null;
  }).filter(Boolean));
}

// ---------- levers: the bench's own design inputs, plus each layer's material ----------
// Paths: 'area' | 'r0' | 'length' | 'layers.<i>.<key>'.
export function applyLever(setup, path, value) {
  const m = /^layers\.(\d+)\.(\w+)$/.exec(path);
  if (m) {
    const l = setup.layers[+m[1]]; if (!l) throw new Error(`no layer at ${path}`);
    if (LAYERS[l.type].params[m[2]]?.options) { const t = JSON.parse(JSON.stringify(setup)); setParam(t, l.id, m[2], value); return t; }
    return applyInput(setup, { id: l.id, key: m[2] }, value);
  }
  if (['area', 'r0', 'length'].includes(path)) return applyInput(setup, { key: path }, value);
  throw new Error(`not a lever path: ${path}`);
}
const solves = s => ADAPTER.evaluate(s).ok;
export function levers(setup) {
  const out = [], idx = id => setup.layers.findIndex(l => l.id === id);
  const add = (path, label, kind, unit, value, cands, extra = {}) => {
    const values = [...new Set(cands)].filter(x => x !== value).filter(x => { try { return solves(applyLever(setup, path, x)); } catch { return false; } });
    if (values.length) out.push({ path, label, kind, unit, value, values, ...extra });
  };
  for (const inp of inputs(setup).filter(x => x.design)) {
    const path = inp.ref.id ? `layers.${idx(inp.ref.id)}.${inp.ref.key}` : inp.ref.key, v = inp.value;
    const cands = inp.ref.key === 'N' ? [Math.max(1, Math.round(v * 0.8)), Math.round(v * 1.2)] : inp.step && !inp.rel ? [+(v - inp.step).toFixed(4), +(v + inp.step).toFixed(4)] : [+(v * 0.8).toPrecision(3), +(v * 1.2).toPrecision(3)];
    add(path, inp.label, 'number', '', v, cands, { scale: inp.scale ?? 1 });
  }
  setup.layers.forEach((l, i) => {
    for (const key of ['material', 'materialA', 'materialB']) {
      const spec = LAYERS[l.type].params[key]; if (!spec || l[key] === 'custom') continue;
      const opts = Object.keys(spec.options).filter(k => k !== 'custom');
      add(`layers.${i}.${key}`, `#${i + 1} ${spec.label.toLowerCase()}`, 'option', '', l[key], opts, { options: Object.fromEntries(opts.map(k => [k, MATERIALS[k].name])) });
    }
  });
  return out;
}

export function concepts(setup) {
  const t = new Set(setup.layers.map(l => l.type)), c = [SERIES];
  if (t.has('conduction') || t.has('parallel')) c.push('ENG.thermal.conduction-resistance');
  if (t.has('convection') || t.has('fins')) c.push('ENG.thermal.convection-resistance');
  return c;
}

export const LEARN = {
  domain: 'thermal',
  page: '../thermal/',
  adapter: () => import('./model.mjs').then(m => m.ADAPTER),
  describe, outputs, output, outputsFor, levers, applyLever, concepts,
};
export default LEARN;
