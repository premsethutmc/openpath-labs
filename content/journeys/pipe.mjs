// Journey 2 — pipe sizing: friction losses and the pump operating point (sem IV, CE25C12 Fluid Mechanics and
// Machinery, which has a pipe-friction lab). Contract: docs/JOURNEYS.md → Journey spec. Data and pure functions only.
// Bench: the fluid line bench (circuit/, domain 'fluids-line'). Every truth and every defence answer comes from the
// bench's own evaluation (circuit/model.mjs ADAPTER, or evaluate(), which ADAPTER wraps); nothing is hard-coded.
import { ADAPTER, evaluate, fromPreset, addPart, setParam, PARTS } from '../../circuit/model.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const flowOf = s => { const r = ADAPTER.evaluate(s); return r.ok ? r.outputs.flow.value : NaN; };

// The main = the longest pipe in the line (in the anchor: the 80 m level run between the two gauges).
const mainIndex = s => s.chain.reduce((best, p, i) => p.type === 'pipe' && (best < 0 || p.L > s.chain[best].L) ? i : best, -1);
// Friction head lost along the main (m of water), from the bench's solution. On the anchor this equals the gauge drop
// across the main divided by ρg (tested).
export function mainLoss(s) {
  const r = evaluate(s), i = mainIndex(s);
  if (!r.ok || i < 0) return NaN;
  return -r.sol.steps.find(st => st.index === i && st.kind === 'friction').dH;
}
const pumpIndex = s => s.chain.findIndex(p => p.type === 'pump');

// ---- setup patches (always made through the bench's own edit functions, so they pass the same checks) ----
export const BORES = [0.015, 0.02, 0.025, 0.032, 0.04, 0.05, 0.065, 0.08, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3];   // m
const deliveryPipes = s => { const k = pumpIndex(s); return s.chain.filter((p, i) => p.type === 'pipe' && i > k); };
export function patchBoreUp(s) {
  const t = clone(s), pipes = deliveryPipes(t), edits = [];
  if (!pipes.length) return null;
  for (const p of pipes) {
    const D = BORES.find(b => b > p.D + 1e-9); if (D === undefined) return null;
    setParam(t, p.id, 'D', D); edits.push(['setParam', p.id, 'D', D]);
  }
  return { setup: t, edits };
}
export function patchLength(s, k = 2) {
  const t = clone(s), i = mainIndex(t); if (i < 0) return null;
  const p = t.chain[i], L = p.L * k; if (L > PARTS.pipe.params.L.max) return null;
  setParam(t, p.id, 'L', L);
  return { setup: t, edits: [['setParam', p.id, 'L', L]] };
}
export function patchElbows(s, n = 2) {
  const t = clone(s), i = mainIndex(t); if (i < 0) return null;
  const edits = []; let after = t.chain[i].id;
  for (let j = 0; j < n; j++) { edits.push(['addPart', 'elbow', {}, after]); after = addPart(t, 'elbow', {}, after); }
  return { setup: t, edits };
}

const mm = D => +(D * 1000).toFixed(1);
const anchor = fromPreset('farm');

export default {
  id: 'pipe',
  title: 'Pipe sizing: friction losses and the pump operating point',
  semester: 4,
  course: 'CE25C12 Fluid Mechanics and Machinery',
  bench: { page: '../circuit/', domain: 'fluids-line', adapter: () => import('../../circuit/model.mjs').then(m => m.ADAPTER) },
  brief: 'A farm pumps water from a sump to an overhead tank 12 m above the pump, 80 m away. The pump and its 1.5 kW motor are '
    + 'already bought. The tank must get at least 2.5 L/s, and the motor must not be overloaded. The first pipe run, a 32 mm main, '
    + 'falls short. Choose the pipe bore, the route length and the fittings so the line delivers 2.5 L/s within the motor\'s rating.',
  anchor: { setup: anchor, revision: 'R1' },
  stuck: { predictions: [
    { id: 'flow', prompt: 'Before you run it: what flow will this line deliver to the tank?', unit: 'L/s', tol: 0.25,
      truth: (setup, results) => results.flow.value },
    { id: 'main-loss', prompt: 'How much head is lost to friction along the main (the level run between the two gauges)?', unit: 'm', tol: 1.5,
      truth: setup => mainLoss(setup) },
    { id: 'flow-long', prompt: 'If the main were twice as long, what flow would reach the tank?', unit: 'L/s', tol: 0.2,
      truth: setup => flowOf(patchLength(setup, 2).setup) },
  ] },
  target: 'ENG.fluids.darcy-weisbach',
  teach: {
    'ENG.fluids.darcy-weisbach': { explore: { page: '../circuit/', preset: 'gravity' }, items: 'fluids.head-loss', steps: [
      'Friction head loss in a pipe: h_f = f · (L/D) · V²/2g.',
      'Double the length: double the loss. Double the flow: V doubles, so the loss is about four times (V², with f nearly constant).',
      'At the same flow, a smaller bore raises V (as 1/D²) and L/D: the loss grows roughly as 1/D⁵.',
      'On the bench: change the bore or length of one pipe and read the gauge drop across it; Explain splits it into friction and fittings.'] },
    'ENG.fluids.friction-factor': { explore: { page: '../pumps/', preset: 'regime' }, items: 'fluids.friction-factor', steps: [
      'Find Re first. Below 2000 the flow is laminar: f = 64/Re.',
      'Above 4000 it is turbulent: f depends on Re and ε/D (Colebrook–White, or read the Moody chart). 64/Re is wrong there.',
      'Between 2000 and 4000 the flow is transitional and the value is uncertain.'] },
    'ENG.fluids.reynolds': { explore: { page: '../pumps/', preset: 'regime' }, items: 'fluids.reynolds', steps: [
      'Re = V·D/ν: inertia over viscosity.', 'V from Q = A·V, with Q in m³/s and D in metres.', 'Water near 20 °C: ν ≈ 1.0 × 10⁻⁶ m²/s; it falls as water warms.'] },
    'ENG.fluids.relative-roughness': { explore: { page: '../pumps/', preset: 'diameter' }, items: 'fluids.roughness', steps: [
      'ε is the roughness height of the pipe material; ε/D compares it with the bore (same units top and bottom).', 'A small pipe of the same material is relatively rougher.'] },
    'ENG.fluids.energy-equation': { explore: { page: '../circuit/', preset: 'gravity' }, items: 'fluids.energy', steps: [
      'Total head = pressure head p/ρg + elevation z + velocity head V²/2g.',
      'Between two points it falls by the losses and rises by any pump head.',
      'In a level pipe of constant bore the gauge drop is the friction loss: h_f = Δp/ρg.'] },
    'ENG.fluids.flow-rate': { explore: { page: '../circuit/', preset: 'farm' }, items: 'fluids.flow-rate', steps: [
      'Q = A·V with A = πD²/4 (D is the diameter).', 'Convert first: L/s ÷ 1000 = m³/s; mm ÷ 1000 = m.'] },
    'ENG.fluids.minor-losses': { explore: { page: '../circuit/', preset: 'pumpset' }, items: 'fluids.minor-loss', steps: [
      'Each fitting costs K · V²/2g at its bore: elbow 0.75, non-return valve 2, foot valve 5, open gate valve 0.15.', 'They grow with V², like pipe friction.'] },
    'ENG.fluids.system-curve': { explore: { page: '../pumps/', preset: 'length' }, items: 'fluids.system-curve', steps: [
      'The line needs H_sys(Q) = static lift + losses(Q).', 'At zero flow it still needs the static lift; the losses grow with Q².'] },
    'ENG.fluids.operating-point': { explore: { page: '../pumps/', preset: 'valve' }, items: 'fluids.operating-point', steps: [
      'The pump supplies H_pump(Q), falling as the flow rises.', 'It runs where H_pump(Q) = H_sys(Q): the crossing of the two curves, not their sum.'] },
    'MATH.measurement.unit-conversions': { explore: null, items: 'fluids.math.units', steps: ['1 m³ = 1000 L, so L/s ÷ 1000 = m³/s.', '1 m = 1000 mm, so mm ÷ 1000 = m.'] },
    'MATH.number.square-roots': { explore: null, items: 'fluids.math.squares', steps: ['V² grows with the square: 2 × V gives 4 × V².', 'To undo a square, take the square root.'] },
  },
  apply: { count: 3, transfer: { page: '../circuit/', preset: 'farm-twin' } },
  check: { count: 1 },
  return: { decision: true, predictions: [
    { id: 'flow', prompt: 'Your revised line: what flow will it deliver to the tank?', unit: 'L/s', tol: 0.25, truth: (setup, results) => results.flow.value },
    { id: 'main-loss', prompt: 'Your revised line: how much head is lost to friction along the main (the longest pipe)?', unit: 'm', tol: 1, truth: setup => mainLoss(setup) },
    { id: 'shaft-power', prompt: 'Your revised line: what shaft power will the pump draw?', unit: 'kW', tol: 0.1, truth: (setup, results) => results.shaftPower ? results.shaftPower.value : NaN },
  ] },
  // "What if" questions on the learner's own setup. `change` holds the patched fields (chain, nextId) — a full
  // replacement, valid for a shallow or a deep merge; `edits` is the same change as bench edits. The answer is
  // adapter.evaluate(patched setup).outputs[read].value.
  defend(setup) {
    const qs = [];
    const add = (prompt, patch) => {
      if (!patch) return;
      const r = ADAPTER.evaluate(patch.setup); if (!r.ok) return;
      const v = r.outputs.flow.value;
      qs.push({ prompt, change: { chain: patch.setup.chain, nextId: patch.setup.nextId }, edits: patch.edits, read: 'flow', tol: Math.max(0.05, 0.05 * v) });
    };
    let up = null; try { up = patchBoreUp(setup); } catch { /* a patch outside the bench's limits is not asked */ }
    if (up) { const from = deliveryPipes(setup).map(p => mm(p.D)), to = deliveryPipes(up.setup).map(p => mm(p.D));
      add(`If every delivery pipe were one size larger (${[...new Set(from)].join(', ')} → ${[...new Set(to)].join(', ')} mm), what flow would reach the tank (L/s)?`, up); }
    let long = null; try { long = patchLength(setup, 2); } catch { /* skipped */ }
    if (long) { const p = setup.chain[mainIndex(setup)]; add(`If the main (${p.L} m) were twice as long, what flow would reach the tank (L/s)?`, long); }
    let el = null; try { el = patchElbows(setup, 2); } catch { /* skipped */ }
    add('If the route needed two more 90° elbows on the main, what flow would reach the tank (L/s)?', el);
    return qs;
  },
};
