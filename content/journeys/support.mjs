// Journey 1 — "The support that holds" (semester II, ME25C02 Engineering Mechanics). Contract: docs/JOURNEYS.md.
// Bench: the Mount lab (mount/model.mjs READING_ADAPTER). Every truth and every "what if" answer comes from the bench's
// own model (stand / evaluateReading, which run the Solids engine); nothing is hard-coded. Pure data and functions, no DOM.
//
// A setup is what the Mount lab saves on the project record: { design: { material, shape, b, h, t?, tw?, tf? }, mount, loaded, dialX, strainX }.
// tol everywhere is relative (a fraction of the truth), as core/ledger.mjs `within` reads it.
// defend(): `change` is a patch on the setup (objects merge, here always whole values); `read` is the key of the adapter output.
import { SPEC, ORIGINAL, stand, check, GAUGE_POSITIONS } from '../../mount/model.mjs';
import { MATERIALS } from '../../core/materials.mjs';

const loadedAt = (design, mount) => stand(design, { mount, loaded: true });
const leftBolt = (design, mount) => loadedAt(design, mount).reactions[0];                 // N, upward
const rightBolt = (design, mount) => loadedAt(design, mount).reactions[1];
const peakMoment = (design, mount) => Math.max(...loadedAt(design, mount).M.map(Math.abs)) / 1000;   // N·m
const peakAt = (design, mount) => { const M = loadedAt(design, mount).M.map(Math.abs); return M.indexOf(Math.max(...M)) * SPEC.step; };   // mm from the left bolt
const describe = d => `${MATERIALS[d.material].name.split(' ')[0].toLowerCase()} ${d.shape === 'rect' ? `${d.b} × ${d.h} mm solid bar` : d.shape === 'rhs' ? `${d.b} × ${d.h} × ${d.t} mm hollow tube` : `${d.h} × ${d.b} mm I-section`}`;
const fmt = v => Math.round(v).toLocaleString('en-IN');

export const LABELS = { 'design.material': 'Material', 'design.shape': 'Section (rect solid, rhs hollow, I)', 'design.b': 'Width b (mm)', 'design.h': 'Depth h (mm)', 'design.t': 'Wall t (mm)',
  'design.tw': 'Web tw (mm)', 'design.tf': 'Flange tf (mm)', mount: 'Machine position (mm from the left bolt)', loaded: 'Operating load', dialX: 'Dial gauge at (mm)', strainX: 'Strain gauge at (mm)' };
export const ANCHOR_SETUP = { design: { ...ORIGINAL }, mount: SPEC.guidedMount, loaded: true, dialX: SPEC.guidedMount, strainX: SPEC.guidedMount };
const [MOVE_A, MOVE_B] = [SPEC.guidedMount, SPEC.transferMount];   // 200 mm and 300 mm

// The "what if" changes, kept only when the patched setup is one the bench can test.
export function whatIfs(setup) {
  const d = setup.design, out = [];
  // Move 100 mm away from mid-span (towards the nearer bolt) when that stays on the stand, else towards it; never onto
  // the mirror position, where the reading would not change.
  const away = setup.mount > SPEC.span / 2 ? 100 : -100, moved = setup.mount + away >= SPEC.mountRange[0] && setup.mount + away <= SPEC.mountRange[1] ? setup.mount + away : setup.mount - away;
  out.push({ prompt: `The machine is moved 100 mm, to ${moved} mm from the left bolt (gauges moved with it). What will the dial gauge read under the machine, in mm?`,
    change: { mount: moved, dialX: moved, strainX: moved, loaded: true }, read: 'deflection', unit: 'mm' });
  const other = d.material === 'steel' ? 'aluminium' : 'steel';
  out.push({ prompt: `Your support is remade in ${other}, same section. What will the dial gauge read under the machine, in mm?`,
    change: { design: { ...d, material: other }, loaded: true, dialX: setup.mount, strainX: setup.mount }, read: 'deflection', unit: 'mm' });
  const deeper = Math.min(d.h + 10, SPEC.envelope.h);
  if (deeper > d.h) out.push({ prompt: `Your section is made ${deeper - d.h} mm deeper (h = ${deeper} mm), everything else the same. What stress will the strain gauge under the machine show, in MPa?`,
    change: { design: { ...d, h: deeper }, loaded: true, dialX: setup.mount, strainX: setup.mount }, read: 'stress', unit: 'MPa' });
  else out.push({ prompt: `Your section is made 10 mm shallower (h = ${d.h - 10} mm), everything else the same. What stress will the strain gauge under the machine show, in MPa?`,
    change: { design: { ...d, h: d.h - 10 }, loaded: true, dialX: setup.mount, strainX: setup.mount }, read: 'stress', unit: 'MPa' });
  return out.filter(q => { const s = { ...setup, ...q.change }; return check(s.design).ok && GAUGE_POSITIONS.includes(s.mount) && s.mount >= SPEC.mountRange[0] && s.mount <= SPEC.mountRange[1]; });
}

// The design in words for the journey page (spec.describe): material, section with its dimensions, where the machine and
// gauges sit, and whether the operating load is on.
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

export default {
  describe: describeSetup,
  id: 'support', title: 'The support that holds', semester: 2, course: 'ME25C02 Engineering Mechanics',
  bench: { page: '../mount/?project=current', domain: 'mount-stand', adapter: () => import('../../mount/model.mjs').then(m => m.READING_ADAPTER) },
  brief: `A ${fmt(SPEC.load)} N machine must sit on a support bolted ${SPEC.span} mm apart, inside a ${SPEC.envelope.b} × ${SPEC.envelope.h} mm envelope. `
    + `Under the machine the support may deflect at most ${SPEC.tolerance} mm, its stress must stay at or below yield ÷ ${SPEC.yieldFactor}, and it may weigh at most ${SPEC.massLimit} kg. `
    + `The existing support is a ${describe(ORIGINAL)}, with the machine ${SPEC.guidedMount} mm from the left bolt. Test it, then choose the material and section.`,
  anchor: { setup: ANCHOR_SETUP, revision: 'Revision 1' },
  // what the journey page shows beside each part of a saved setup (the page falls back to the raw key)
  labels: LABELS,

  stuck: { predictions: [
    { id: 'left-bolt-200', prompt: `With the machine ${MOVE_A} mm from the left bolt, how much does the left bolt carry, in N?`, unit: 'N', tol: 0.02, truth: s => leftBolt(s.design, MOVE_A) },
    { id: 'left-bolt-300', prompt: `Move the machine to ${MOVE_B} mm. How much does the left bolt carry now, in N?`, unit: 'N', tol: 0.02, truth: s => leftBolt(s.design, MOVE_B) },
    { id: 'peak-at-200', prompt: `With the machine at ${MOVE_A} mm, how far from the left bolt is the bending moment largest, in mm?`, unit: 'mm', tol: 0.05, truth: s => peakAt(s.design, MOVE_A) },
    { id: 'peak-moment-200', prompt: `With the machine at ${MOVE_A} mm, what is the largest bending moment in the support, in N·m?`, unit: 'N·m', tol: 0.03, truth: s => peakMoment(s.design, MOVE_A) },
    { id: 'peak-moment-300', prompt: `With the machine at ${MOVE_B} mm, what is the largest bending moment, in N·m?`, unit: 'N·m', tol: 0.03, truth: s => peakMoment(s.design, MOVE_B) },
  ] },
  target: 'ENG.statics.moment-about-point',

  teach: {
    'ENG.statics.moment-about-point': { explore: { page: '../playground/?view=moment', preset: 'shelf' }, items: 'statics.moment', steps: [
      'Turn on Moments and tap the wall: each force shows its line of action, its lever arm (the perpendicular distance from the point) and its moment.',
      'Drag the books along the shelf. Their moment about the wall is weight × lever arm, and it grows in step with the distance.',
      'Switch “include reactions” on and off. With the wall’s force and moment included, ΣM about any point is zero: the shelf is in equilibrium.',
      'Tap a point at the books instead of the wall. The books’ own moment drops to zero (their line passes through the point), but ΣM is still zero.'] },
    'ENG.statics.perpendicular-distance': { explore: { page: '../playground/?view=moment', preset: 'crane' }, items: 'statics.lever-arm', steps: [
      'Turn on Moments and tap the foot of the mast. The lever arm of the hanging bucket is its horizontal distance from the mast, not the slant distance to the hook.',
      'Tap the top of the mast. The bucket hangs further from that point along a slant, yet its lever arm is still the same horizontal distance: only the perpendicular to the line of action counts.'] },
    'ENG.statics.force-components': { explore: { page: '../playground/?view=moment', preset: 'crane' }, items: 'statics.components', steps: [
      'A sloping force has a horizontal part F cos θ and a vertical part F sin θ, with θ measured from the horizontal.',
      'Moment of a sloping force: take each part times its own perpendicular distance from the point, with the sense each one turns, and add. It equals F × the perpendicular distance to the whole force.'] },
    'ENG.statics.equilibrium-2d': { explore: { page: '../playground/?view=moment', preset: 'footbridge' }, items: 'statics.equilibrium', steps: [
      'A body at rest has ΣFx = 0, ΣFy = 0 and ΣM = 0 about every point.',
      'Take moments about the support whose reaction you do not want: that reaction drops out, leaving one unknown.'] },
    'ENG.statics.beam-reactions': { explore: { page: '../playground/?view=moment', preset: 'footbridge' }, items: 'statics.beam-reactions', steps: [
      'Tap the left support and switch reactions off: ΣM of the loads about it is what the right support must balance.',
      'R_B × L = P × a, then R_A = P − R_B. Walk the person across and watch the two reactions trade places.'] },
    'ENG.statics.bending-moment': { explore: { page: '../playground/?view=moment', preset: 'footbridge' }, items: 'statics.bending-moment', steps: [
      'The bending moment at a cut is the moment, about the cut, of every force on one side of it.',
      'For one point load it rises in a straight line from each support and peaks under the load: M = P·a·b / L.'] },
    'MATH.trigonometry.functions': { explore: null, items: 'math.trig', steps: ['The distance from a point to a line = (distance along the rod) × sin(angle between rod and line).'] },
    'MATH.algebra.linear-systems': { explore: null, items: 'math.pair', steps: ['Two unknown reactions need two equations: ΣFy = 0 and ΣM = 0. Solve the moment equation first; it has one unknown.'] },
  },
  apply: { count: 3, transfer: { page: '../playground/?view=moment', preset: 'crane' } },
  check: { count: 1 },

  return: { decision: true, predictions: [
    { id: 'own-left-bolt', prompt: 'For your design, with the machine where you placed it: how much does the left bolt carry, in N?', unit: 'N', tol: 0.02, truth: s => leftBolt(s.design, s.mount) },
    { id: 'own-right-bolt', prompt: 'And the right bolt, in N?', unit: 'N', tol: 0.02, truth: s => rightBolt(s.design, s.mount) },
    { id: 'own-peak-moment', prompt: 'What is the largest bending moment in your support, in N·m?', unit: 'N·m', tol: 0.03, truth: s => peakMoment(s.design, s.mount) },
    { id: 'own-deflection', prompt: 'What will the dial gauge read under the machine, in mm?', unit: 'mm', tol: 0.05, truth: s => loadedAt(s.design, s.mount).at(s.mount).deflection },
  ] },

  // tol: 3 % of the bench's own answer (the runner evaluates the patched setup on the adapter).
  defend: (setup, results) => whatIfs(setup).map(q => ({ ...q, tol: 0.03 })),
};
