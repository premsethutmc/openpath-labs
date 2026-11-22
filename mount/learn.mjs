// LEARN descriptor for the Mount lab (domain 'mount-stand'). Contract: docs/OPEN_LOOP.md. No DOM imports.
// A setup is what the Mount lab saves: { design: { material, shape, b, h, t?, tw?, tf? }, mount, loaded, dialX, strainX,
// bench? } — `bench` ({ span, load, supports, limits }) is present on open-bench setups (./model.mjs).
import { MATERIALS } from '../core/materials.mjs';
import { SPEC, SUPPORTS, DIMS, DEFAULT_DIMS, OPEN_RANGE, benchOf, stations, evaluateReading } from './model.mjs';

const clone = o => JSON.parse(JSON.stringify(o));
const SECTION = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
const leaves = (o, pre) => (o === null || typeof o !== 'object' ? [pre] : Object.entries(o).flatMap(([k, v]) => leaves(v, `${pre}.${k}`)));

export function describe(setup) {
  const d = setup.design ?? {}, B = benchOf(setup);
  const dims = d.shape === 'rhs' ? `${d.b} × ${d.h} mm, wall ${d.t} mm` : d.shape === 'I' ? `${d.b} × ${d.h} mm, web ${d.tw} mm, flanges ${d.tf} mm` : `${d.b} × ${d.h} mm`;
  const benchPaths = setup.bench ? leaves(setup.bench, 'bench') : [];
  const only = re => benchPaths.filter(p => re.test(p));
  return [
    { label: 'Material', value: MATERIALS[d.material]?.name ?? d.material, paths: ['design.material'] },
    { label: 'Section', value: `${SECTION[d.shape] ?? d.shape}, ${dims}`, paths: Object.keys(d).filter(k => k !== 'material').map(k => `design.${k}`) },
    { label: 'Span and supports', value: `${B.span} mm, ${SUPPORTS[B.supports]?.label ?? B.supports}`, paths: only(/^bench\.(span|supports)$/) },
    { label: 'Machine', value: `${B.load} N at ${setup.mount} mm from the left end`, paths: ['mount', ...only(/^bench\.load$/)] },
    { label: 'Operating load', value: setup.loaded ? 'on' : 'off', paths: ['loaded'] },
    { label: 'Gauges', value: `dial at ${setup.dialX} mm, strain gauge at ${setup.strainX} mm`, paths: ['dialX', 'strainX'] },
    { label: 'Your limits', value: `deflection ≤ ${B.limits.deflection} mm at the machine, stress ≤ strength ÷ ${B.limits.yieldFactor}, mass ≤ ${B.limits.mass} kg`, paths: only(/^bench\.limits\./) },
  ];
}

// Every output a Mount setup can have, with its competency. Open-bench setups add the values under the operating load.
export const OUTPUTS = {
  deflection: { label: 'Dial reading (deflection)', unit: 'mm', competency: 'ENG.solids.beam-stiffness' },
  strain: { label: 'Strain reading', unit: 'µε', competency: 'ENG.solids.strain' },
  stress: { label: 'Stress from strain (E·ε)', unit: 'MPa', competency: 'ENG.solids.bending-stress' },
  I: { label: 'Second moment of area I', unit: 'mm⁴', competency: 'ENG.statics.second-moment-area' },
  reactionLeft: { label: 'Left support reaction (under the operating load)', unit: 'N', competency: 'ENG.statics.beam-reactions' },
  reactionRight: { label: 'Right support reaction (under the operating load)', unit: 'N', competency: 'ENG.statics.beam-reactions' },
  momentLeft: { label: 'Left fixing moment (under the operating load)', unit: 'N·m', competency: 'ENG.statics.support-reactions' },
  momentRight: { label: 'Right fixing moment (under the operating load)', unit: 'N·m', competency: 'ENG.statics.support-reactions' },
  maxMoment: { label: 'Largest bending moment (under the operating load)', unit: 'N·m', competency: 'ENG.statics.bending-moment' },
  maxStress: { label: 'Largest bending stress (under the operating load)', unit: 'MPa', competency: 'ENG.solids.bending-stress' },
  maxDeflection: { label: 'Largest deflection (under the operating load)', unit: 'mm', competency: 'ENG.solids.beam-stiffness' },
  fos: { label: 'Factor of safety (under the operating load)', unit: '', competency: 'ENG.solids.factor-of-safety' },
};
// The outputs this setup really has, with the reaction competency for its supports: simply supported → beam reactions,
// cantilever → reactions at a fixed support, any other fixity → what each support type carries.
export function outputsFor(setup) {
  const r = evaluateReading(setup);
  if (!r.ok) return {};
  const sup = benchOf(setup).supports, rc = sup === 'pin-roller' ? 'ENG.statics.beam-reactions' : sup === 'cantilever' ? 'ENG.statics.cantilever-reactions' : 'ENG.statics.support-reactions';
  return Object.fromEntries(Object.keys(r.outputs).filter(k => OUTPUTS[k]).map(k => [k, { ...OUTPUTS[k], label: r.outputs[k].label, ...(/^(reaction|moment)/.test(k) ? { competency: rc } : {}) }]));
}

// ---------- levers ----------
// setPath creates missing objects (a legacy setup gains `bench` when a bench lever is applied: an open-bench setup).
export function setPath(setup, path, value) {
  const s = clone(setup), ks = path.split('.'), last = ks.pop();
  ks.reduce((o, k) => (o[k] ??= {}), s)[last] = value;
  return s;
}
// A lever may carry apply(setup, value) when one change moves more than one path (a new shape brings its own dimensions;
// the gauges that sat under the machine move with it). applyLever uses it, or sets the path.
// lever is a lever object or a path (the shared LEARN shape is applyLever(setup, path, value)); a path finds its lever.
// ctx ({ from }, optional): the Revision 1 setup, when a defence question puts a lever back to its Revision 1 value.
export const applyLever = (setup, lever, value, ctx) => {
  if (typeof lever === 'string') lever = levers(setup).find(l => l.path === lever) ?? { path: lever };
  return lever.apply ? lever.apply(setup, value, ctx) : setPath(setup, lever.path, value);
};
const valid = s => evaluateReading(s).ok;

export function levers(setup) {
  const d = setup.design, B = benchOf(setup), out = [];
  const opt = (lever, values, labelOf) => {
    const options = values.filter(v => valid(applyLever(setup, lever, v)));
    if (options.length > 1) out.push({ ...lever, kind: 'option', options, optionLabels: options.map(labelOf) });
  };
  const num = (lever, lo, hi, step) => { if (hi > lo) out.push({ ...lever, kind: 'number', min: lo, max: hi, step }); };
  opt({ path: 'design.material', label: 'Material' }, Object.keys(MATERIALS), m => MATERIALS[m].name);
  // a new shape brings the bench's default dimensions, as the Design tab does; put back to Revision 1's shape, it brings
  // back Revision 1's own dimensions (the section the student had), so a defence question about it can be worked by hand
  const shapeDims = (s, v, ctx) => (ctx?.from?.design?.shape === v ? Object.fromEntries(DIMS[v].map(([k]) => [k, ctx.from.design[k]])) : DEFAULT_DIMS[v]);
  opt({ path: 'design.shape', label: 'Section shape', apply: (s, v, ctx) => setPath(s, 'design', v === s.design.shape ? s.design : { material: s.design.material, shape: v, ...shapeDims(s, v, ctx) }) }, Object.keys(DIMS), v => SECTION[v]);
  for (const [k, label, lo, hi] of DIMS[d.shape] ?? []) {
    // keep only values the bench accepts (walls thinner than the section, inside the envelope)
    const ok = v => valid(setPath(setup, `design.${k}`, v)), vals = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(ok);
    if (vals.length > 1) num({ path: `design.${k}`, label: `${label} (mm)` }, vals[0], vals[vals.length - 1], 1);
  }
  const followGauges = (s, x) => { const t = setPath(s, 'mount', x); if (s.dialX === s.mount) t.dialX = x; if (s.strainX === s.mount) t.strainX = x; return t; };
  const posLo = setup.bench ? SPEC.step : SPEC.mountRange[0], st = setup.bench ? stations(B) : [];
  const posHi = setup.bench ? st[st.length - 1] : SPEC.mountRange[1];
  num({ path: 'mount', label: 'Machine position (mm from the left end)', apply: followGauges }, posLo, posHi, SPEC.step);
  // the span may not shrink past the machine or the gauges
  const reach = Math.max(setup.mount, setup.dialX, setup.strainX) + (SUPPORTS[B.supports].ends[1] ? SPEC.step : 0);
  num({ path: 'bench.span', label: 'Span (mm)' }, Math.max(OPEN_RANGE.span[0], reach), OPEN_RANGE.span[1], SPEC.step);
  num({ path: 'bench.load', label: 'Machine load (N)' }, OPEN_RANGE.load[0], OPEN_RANGE.load[1], 100);
  opt({ path: 'bench.supports', label: 'Supports' }, Object.keys(SUPPORTS), v => SUPPORTS[v].label);
  return out;
}

export const LEARN = {
  domain: 'mount-stand',
  page: '../mount/?project=current',
  adapter: () => import('./model.mjs').then(m => m.READING_ADAPTER),
  describe,
  outputs: OUTPUTS,
  outputsFor,
  levers,
  setPath,
  applyLever,
};
export default LEARN;
