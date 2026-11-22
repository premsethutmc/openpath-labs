// LEARN descriptor for the fluid line bench (docs/OPEN_LOOP.md → "What each bench provides"). Data and pure functions,
// no DOM: the open loop builds a journey spec from the student's own line, whatever they built (from the empty
// workspace or an edited preset). Every number comes from the bench's own model (circuit/model.mjs); nothing here
// computes physics.
//   describe(setup)        → [{ label, value, paths }]   the line in words, part by part (also used by content/journeys/pipe.mjs)
//   outputs                 fixed output keys → { label, unit, competency }
//   output(key, setup)      any adapter output key, fixed or dynamic (`gauge:<partId>`) → { label, unit, competency, what } | null
//   outputsFor(setup)       the predictable outputs this setup really produces (adapter.evaluate), keyed as the adapter keys them
//   levers(setup)           what the student can change: [{ path, label, kind, unit, scale, min, max, step, options?, values }]
//                           `values` are alternatives to the current value that the bench accepts and solves (adapter.evaluate ok)
//   applyLever(setup, path, value) → a new setup, changed through the bench's own edit function (same validation)
//   concepts(setup)         the competencies this line's physics rests on
// Only simulated outputs are predictable: the motor rating (a table value) and NPSH required (a pump-curve property)
// are not offered.
import { ADAPTER, PARTS, setParam } from './model.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fmt = n => String(+(+n).toPrecision(4));

// ---------- the line in words ----------
const partWords = part => {
  const P = PARTS[part.type];
  const bits = Object.entries(P.params ?? {}).filter(([k]) => part[k] !== undefined).map(([k, d]) => {
    const v = part[k], o = d.options?.[v] ?? (Array.isArray(d.options) ? d.options.find(x => x.value === v)?.label : undefined);
    return o ? `${d.label.toLowerCase()} ${o}` : `${d.label.toLowerCase()} ${fmt(v * (d.scale ?? 1))}${d.unit ? ` ${d.unit}` : ''}`;
  });
  return bits.length ? bits.join(', ') : '—';
};
const partName = (s, i) => `#${i + 1} ${PARTS[s.chain[i].type]?.name ?? s.chain[i].type}`;
const gaugeWhere = (s, id) => {
  const i = s.chain.findIndex(p => p.id === id);
  if (i < 0 || i >= s.chain.length - 1) return null;
  return `between ${partName(s, i)} and ${partName(s, i + 1)}`;
};

// The design in words: every part of the line in order, with its settings and units (from the bench's own part
// table), then the target flow, the water temperature and the gauges.
export function describe(setup) {
  const out = [];
  setup.chain.forEach((part, i) => {
    if (!PARTS[part.type]) return;
    out.push({ label: `${i + 1}. ${PARTS[part.type].name}`, value: partWords(part), paths: [`chain.${i}`] });
  });
  out.push({ label: 'Target flow', value: setup.requiredFlow === null || setup.requiredFlow === undefined ? 'none set' : `${fmt(setup.requiredFlow)} L/s`, paths: ['requiredFlow'] });
  out.push({ label: 'Water temperature', value: `${fmt(setup.temp)} °C`, paths: ['temp'] });
  const g = (setup.gauges ?? []).map(id => gaugeWhere(setup, id)).filter(Boolean);
  out.push({ label: 'Pressure gauges', value: g.length ? g.join('; ') : 'none', paths: ['gauges'] });
  return out;
}

// ---------- predictable outputs and the competency behind each ----------
export const outputs = {
  flow: { label: 'Flow', unit: 'L/s', competency: 'ENG.fluids.operating-point' },
  pumpHead: { label: 'Pump head', unit: 'm', competency: 'ENG.fluids.system-curve' },
  shaftPower: { label: 'Shaft power', unit: 'kW', competency: 'ENG.fluids.shaft-power' },
  torque: { label: 'Shaft torque', unit: 'N·m', competency: 'ENG.machine.torque-power' },
  npsha: { label: 'NPSH available', unit: 'm', competency: 'ENG.fluids.npsh' },
};
const hasPump = s => s.chain.some(p => p.type === 'pump');
export function output(key, setup) {
  if (key.startsWith('gauge:')) {
    const where = setup ? gaugeWhere(setup, key.slice(6)) : null;
    if (setup && !where) return null;
    return { label: setup ? `Gauge pressure ${where}` : 'Gauge pressure', unit: 'kPa (gauge)', competency: 'ENG.fluids.energy-equation',
      what: setup ? `the gauge pressure on the joint ${where}` : 'a gauge pressure' };
  }
  const o = outputs[key]; if (!o) return null;
  // without a pump the flow is where the static head is used up by the losses: the system curve, not a pump crossing
  const competency = key === 'flow' && setup && !hasPump(setup) ? 'ENG.fluids.system-curve' : o.competency;
  return { ...o, competency, what: o.label.toLowerCase() };
}
export function outputsFor(setup) {
  const r = ADAPTER.evaluate(setup); if (!r.ok) return {};
  return Object.fromEntries(Object.entries(r.outputs).filter(([, o]) => o.source === 'simulated').map(([k, o]) => {
    const d = output(k, setup); return d ? [k, { ...d, unit: o.unit }] : null;
  }).filter(Boolean));
}

// ---------- levers ----------
// Standard bores (m) a student picks from; the pipe bore lever offers the next size down and up.
export const BORES = [0.015, 0.02, 0.025, 0.032, 0.04, 0.05, 0.065, 0.08, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3];
const LEVER_PARAMS = { pipe: ['D', 'L', 'material', 'rise'], valve: ['open'], orifice: ['beta'], pump: ['rpm', 'D2', 'motorId'], source: ['inlet'] };
const round3 = v => +v.toPrecision(3);

export function applyLever(setup, path, value) {
  const m = /^chain\.(\d+)\.(\w+)$/.exec(path); if (!m) throw new Error(`not a lever path: ${path}`);
  const t = clone(setup), part = t.chain[+m[1]]; if (!part) throw new Error(`no part at ${path}`);
  setParam(t, part.id, m[2], value);
  return t;
}
const solves = s => ADAPTER.evaluate(s).ok;
function candidates(part, key, spec) {
  const v = part[key];
  if (spec.options) return Object.keys(spec.options).filter(o => o !== v);
  if (part.type === 'pipe' && key === 'D') {
    const i = BORES.findIndex(b => b > v + 1e-9), up = i < 0 ? null : BORES[i], down = [...BORES].reverse().find(b => b < v - 1e-9) ?? null;
    return [down, up].filter(x => x !== null);
  }
  const step = v === 0 ? (spec.step || 1) : Math.abs(v) * 0.2;
  return [v - step, v + step].map(x => (key === 'rpm' ? Math.round(x / 10) * 10 : round3(x))).map(x => Math.min(spec.max, Math.max(spec.min, x)));
}
export function levers(setup) {
  const out = [];
  setup.chain.forEach((part, i) => {
    for (const key of LEVER_PARAMS[part.type] ?? []) {
      const spec = PARTS[part.type].params[key], path = `chain.${i}.${key}`;
      const values = [...new Set(candidates(part, key, spec))].filter(x => x !== part[key]).filter(x => { try { return solves(applyLever(setup, path, x)); } catch { return false; } });
      if (!values.length) continue;
      out.push({ path, label: `${partName(setup, i)}: ${spec.label.toLowerCase()}`, kind: spec.options ? 'option' : 'number', unit: spec.unit ?? '', scale: spec.scale ?? 1,
        ...(spec.options ? { options: { ...spec.options } } : { min: spec.min, max: spec.max, step: spec.step }), value: part[key], values });
    }
  });
  return out;
}

// ---------- the concepts this line rests on ----------
export function concepts(setup) {
  const c = new Set(['ENG.fluids.energy-equation', 'ENG.fluids.flow-rate']), types = new Set(setup.chain.map(p => p.type));
  if (types.has('pipe')) c.add('ENG.fluids.darcy-weisbach');
  if (['elbow', 'valve', 'checkValve', 'orifice'].some(t => types.has(t)) || setup.chain.some(p => p.type === 'source')) c.add('ENG.fluids.minor-losses');
  if (new Set(setup.chain.filter(p => p.type === 'pipe').map(p => p.D)).size > 1) c.add('ENG.fluids.continuity');
  c.add('ENG.fluids.system-curve');
  if (types.has('pump')) ['ENG.fluids.operating-point', 'ENG.fluids.shaft-power', 'ENG.fluids.npsh', 'ENG.machine.torque-power'].forEach(x => c.add(x));
  return [...c];
}

export const LEARN = {
  domain: 'fluids-line',
  page: '../circuit/',
  adapter: () => import('./model.mjs').then(m => m.ADAPTER),
  describe, outputs, output, outputsFor, levers, applyLever, concepts,
};
export default LEARN;
