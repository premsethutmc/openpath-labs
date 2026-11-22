// Journey 3 — "Stiff enough, not just strong" (PH25C01 Applied Physics I, sem I: elasticity, Young's modulus; carried into
// CE25C11 Strength of Materials, sem III). Contract: docs/JOURNEYS.md.
// Bench: the Mount lab (mount/model.mjs READING_ADAPTER). Every truth and every "what if" answer comes from the bench's own
// adapter (evaluateReading, which runs the Solids engine); nothing is hard-coded. Pure data and functions, no DOM.
//
// The anchor is a support that MEETS the stress limit (factor of safety about 9) but BENDS TOO FAR: the confusion between
// strength (yield, and the section modulus I/c) and stiffness (E·I) is the block this journey looks for.
// A setup is what the Mount lab saves: { design: { material, shape, b, h, t?, tw?, tf? }, mount, loaded, dialX, strainX }.
// tol everywhere is relative (core/ledger.mjs `within`).
import { SPEC, check, GAUGE_POSITIONS, READING_ADAPTER } from '../../mount/model.mjs';
import { MATERIALS } from '../../core/materials.mjs';
import { LABELS } from './support.mjs';

const fmt = v => Math.round(v).toLocaleString('en-IN');
// The starting support: an aluminium hollow tube, light and strong, too flexible (verified in tests/stiffness-content.test.mjs).
export const ANCHOR_DESIGN = { material: 'aluminium', shape: 'rhs', b: 50, h: 60, t: 3 };
export const ANCHOR_SETUP = { design: { ...ANCHOR_DESIGN }, mount: SPEC.guidedMount, loaded: true, dialX: SPEC.guidedMount, strainX: SPEC.guidedMount };
const DEEPER = 80;   // the stuck question's deeper tube (the envelope's full depth)

// Everything is read from the bench's own adapter, on the setup with the gauges at the machine.
const atMachine = s => ({ ...s, loaded: true, dialX: s.mount, strainX: s.mount });
const read = (s, key) => { const r = READING_ADAPTER.evaluate(atMachine(s)); if (!r.ok) throw new Error(r.reason); return r.outputs[key].value; };
const withDesign = (s, patch) => ({ ...s, design: { ...s.design, ...patch } });
const fos = s => MATERIALS[s.design.material].yield / read(s, 'stress');
const other = m => (m === 'steel' ? 'aluminium' : 'steel');
const matName = m => MATERIALS[m].name;

// The "what if" changes, kept only when the patched setup is one the bench can test.
export function whatIfs(setup) {
  const d = setup.design, o = other(d.material), out = [], gauges = { loaded: true, dialX: setup.mount, strainX: setup.mount };
  out.push({ prompt: `Your support is remade in ${o} (${matName(o)}), same section. What will the dial gauge read under the machine, in mm?`,
    change: { design: { ...d, material: o }, ...gauges }, read: 'deflection', unit: 'mm' });
  out.push({ prompt: `Same change, remade in ${o} with the same section. What stress will the strain gauge under the machine show, in MPa?`,
    change: { design: { ...d, material: o }, ...gauges }, read: 'stress', unit: 'MPa' });
  const deeper = d.h + 10 <= SPEC.envelope.h, h2 = deeper ? d.h + 10 : d.h - 10;
  out.push({ prompt: `Back in ${d.material}, your section is made 10 mm ${deeper ? 'deeper' : 'shallower'} (h = ${h2} mm), everything else the same. What will the dial gauge read under the machine, in mm?`,
    change: { design: { ...d, h: h2 }, ...gauges }, read: 'deflection', unit: 'mm' });
  return out.filter(q => { const s = { ...setup, ...q.change }; return check(s.design).ok && GAUGE_POSITIONS.includes(s.mount) && s.mount >= SPEC.mountRange[0] && s.mount <= SPEC.mountRange[1]; });
}

const SECTION = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
function describeSetup(setup) {
  const d = setup.design ?? {};
  const dims = d.shape === 'rhs' ? `${d.b} × ${d.h} mm, wall ${d.t} mm` : d.shape === 'I' ? `${d.b} × ${d.h} mm, web ${d.tw} mm, flanges ${d.tf} mm` : `${d.b} × ${d.h} mm`;
  return [
    { label: 'Material', value: MATERIALS[d.material]?.name ?? d.material, paths: ['design.material'] },
    { label: 'Section', value: `${SECTION[d.shape] ?? d.shape}, ${dims}`, paths: ['design.shape', 'design.b', 'design.h', 'design.t', 'design.tw', 'design.tf'] },
    { label: 'Machine at', value: `${setup.mount} mm from the left bolt`, paths: ['mount'] },
    { label: 'Operating load', value: setup.loaded ? 'on' : 'off', paths: ['loaded'] },
    { label: 'Gauges', value: `dial at ${setup.dialX} mm, strain gauge at ${setup.strainX} mm`, paths: ['dialX', 'strainX'] },
  ];
}

const LINEAR = 'Every number here comes from a linear elastic model (σ = E·ε), which holds only while the stress stays below yield: it does not predict what happens after yield.';

export default {
  describe: describeSetup,
  id: 'stiffness', title: 'Stiff enough, not just strong', semester: 1, course: 'PH25C01 Applied Physics I · CE25C11 Strength of Materials',
  bench: { page: '../mount/?project=current', domain: 'mount-stand', adapter: () => import('../../mount/model.mjs').then(m => m.READING_ADAPTER) },
  brief: `A ${fmt(SPEC.load)} N machine must sit on a support bolted ${SPEC.span} mm apart, inside a ${SPEC.envelope.b} × ${SPEC.envelope.h} mm envelope. `
    + `Under the machine the support may deflect at most ${SPEC.tolerance} mm, its stress must stay at or below yield ÷ ${SPEC.yieldFactor} (a factor of safety of at least ${SPEC.yieldFactor}), and it may weigh at most ${SPEC.massLimit} kg. `
    + `The existing support is an aluminium ${ANCHOR_DESIGN.b} × ${ANCHOR_DESIGN.h} mm hollow tube with a ${ANCHOR_DESIGN.t} mm wall, with the machine ${SPEC.guidedMount} mm from the left bolt. `
    + `It is strong enough, yet the machine goes out of alignment. Find out why, then choose the material and section. ${LINEAR}`,
  anchor: { setup: ANCHOR_SETUP, revision: 'Revision 1' },
  labels: LABELS,

  // Predictions that pull stiffness and strength apart: a stiffer material changes the deflection but not the stress;
  // a deeper section changes both, by different powers.
  stuck: { predictions: [
    { id: 'fos-now', prompt: 'As it is, what factor of safety against yield does the aluminium tube have under the machine? (No unit.)', unit: '', tol: 0.03, truth: s => fos(s) },
    { id: 'steel-deflection', prompt: 'The same tube is remade in structural steel. What will the dial gauge read under the machine, in mm?', unit: 'mm', tol: 0.03, truth: s => read(withDesign(s, { material: 'steel' }), 'deflection') },
    { id: 'steel-stress', prompt: 'And what stress will the strain gauge under the machine show in the steel tube, in MPa?', unit: 'MPa', tol: 0.03, truth: s => read(withDesign(s, { material: 'steel' }), 'stress') },
    { id: 'deeper-deflection', prompt: `Back in aluminium, the tube is made ${DEEPER} mm deep (same width and wall). What will the dial gauge read, in mm?`, unit: 'mm', tol: 0.03, truth: s => read(withDesign(s, { h: DEEPER }), 'deflection') },
    { id: 'deeper-stress', prompt: `And the stress under the machine in that ${DEEPER} mm deep aluminium tube, in MPa?`, unit: 'MPa', tol: 0.03, truth: s => read(withDesign(s, { h: DEEPER }), 'stress') },
  ] },
  // Target: stiffness vs strength, not Hooke's law alone. The anchor passes on strength and fails on stiffness, so the miss
  // that matters is treating the two as one; Hooke's law (σ = E·ε) and the factor of safety are its prerequisites.
  target: 'ENG.solids.stiffness-vs-strength',

  teach: {
    'ENG.solids.stiffness-vs-strength': { explore: { page: '../playground/', preset: 'diving' }, items: 'solids.stiff-strong', steps: [
      'Two different questions: is it strong enough (stress against yield ÷ the factor of safety), and is it stiff enough (deflection against its limit)? A part can pass one and fail the other.',
      'Stress σ = M·c / I has no E in it. The same load on the same section gives the same stress in steel or aluminium; only yield, and the section modulus I/c, decide the strength.',
      'Deflection ∝ 1 / (E·I). Steel’s E is about 2.9× aluminium’s, so the same section bends about 2.9× less in steel. A higher yield strength does not reduce deflection at all.',
      'A deeper section helps both, by different powers: for a solid rectangle the stress falls as 1/h², the deflection as 1/h³.',
      'On the diving board: find a board that is safe for the jump (strength) but still springy (stiffness). Then, on the Mount bench, swap the material with the section unchanged and compare the two runs: the dial moves, the stress does not.',
      LINEAR] },
    'ENG.solids.hookes-law': { explore: { page: '../playground/', preset: 'footbridge' }, items: 'solids.hooke', steps: [
      'Below yield, stress is proportional to strain: σ = E·ε. E (Young’s modulus) is a property of the material, the slope of the straight part of the stress–strain line.',
      'The Mount bench’s strain gauge measures ε; the bench reports the stress as E·ε. Steel E = 200,000 MPa, aluminium 69,000 MPa.',
      'On the footbridge, swap steel for aluminium: the same load sags about 3× as much, because E is about 3× smaller.'] },
    'ENG.solids.normal-stress': { explore: { page: '../playground/', preset: 'crane' }, items: 'solids.normal-stress', steps: [
      'Stress is force per area: σ = F / A for a pull or a push along a bar. N/mm² is the same as MPa.',
      'In bending, the stress is largest at the top and bottom faces: σ = M·c / I.',
      'Tap the crane’s tie rod: it is pulled, and its stress is the pull divided by its area.'] },
    'ENG.solids.strain': { explore: null, items: 'solids.strain', steps: [
      'Strain is stretch per length, ε = ΔL / L. It has no unit.',
      'Strains in metals are tiny, so they are given in microstrain: 1 µε = 0.000001. 0.1 % = 0.001 = 1,000 µε.'] },
    'ENG.solids.factor-of-safety': { explore: { page: '../playground/', preset: 'shelf' }, items: 'solids.fos', steps: [
      'Factor of safety against yield: FoS = yield ÷ working stress. Allowable stress = yield ÷ the required FoS.',
      '“Stress ≤ yield ÷ 2” is the same as “FoS ≥ 2”. A factor of safety is a strength margin; it says nothing about deflection.',
      'On the shelf, find the thinnest board that holds a person at the end with a safety factor above 2.'] },
    'ENG.solids.yield-elastic-limit': { explore: { page: '../playground/', preset: 'shelf' }, items: 'solids.yield', steps: [
      'Yield strength is the stress at which a metal starts to deform permanently. Below it the part springs back.',
      'The linear model, σ = E·ε, and stress ∝ load, hold only below yield. It does not predict what happens after yield.'] },
    'ENG.solids.beam-stiffness': { explore: { page: '../playground/', preset: 'footbridge' }, items: 'solids.stiffness', steps: [
      'For a beam on two supports with a point load, deflection ∝ P / (E·I).',
      'Same section, other material: δ scales with 1/E. Same material, deeper solid rectangle: δ scales with 1/h³.'] },
    'ENG.solids.bending-stress': { explore: { page: '../playground/', preset: 'shelf' }, items: 'solids.bending-stress', steps: [
      'σ = M·c / I, with c the distance from the neutral axis to the outer face (h/2 for a symmetric section).',
      'For a point load P at a from the left support on a span L, the largest moment is under the load: M = P·a·(L − a)/L.'] },
    'MATH.algebra.inverse-proportion': { explore: null, items: 'math.inverse', steps: ['If y ∝ 1/x, then y₂ = y₁ × x₁ / x₂: double x and y halves.'] },
  },
  apply: { count: 3, transfer: { page: '../playground/', preset: 'diving', prompt: 'On the diving board: choose a board that is safe for the jump (strength) but still bends enough to be springy (stiffness). Then come back for the check.' } },
  check: { count: 1 },

  return: { decision: true, predictions: [
    { id: 'own-deflection', prompt: 'For your design, with the machine where you placed it: what will the dial gauge read under the machine, in mm?', unit: 'mm', tol: 0.03, truth: s => read(s, 'deflection') },
    { id: 'own-stress', prompt: 'What stress will the strain gauge under the machine show, in MPa?', unit: 'MPa', tol: 0.03, truth: s => read(s, 'stress') },
    { id: 'own-fos', prompt: 'What factor of safety against yield does your design have under the machine? (No unit.)', unit: '', tol: 0.03, truth: s => fos(s) },
  ] },

  // tol: 3 % of the bench's own answer (the runner evaluates the patched setup on the adapter).
  defend: (setup, results) => whatIfs(setup).map(q => ({ ...q, tol: 0.03 })),
};
