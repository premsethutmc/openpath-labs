// Item generators for the statics and beam-bending nodes in content/graph/statics.mjs (Journey 1, "The support that holds").
// Deterministic in seed. key 'engine': the answer comes from the Solids engine (engines/solids/frame.mjs direct stiffness,
// or mount/model.mjs stand, which runs it); tests/support-content.test.mjs rebuilds each structure from figure.params and
// re-solves it. key 'formula': checked there against an independent hand calculation.
// Units in prompts: N, kN, mm, m, N·m, kN·m, MPa. The solver works in N, mm, MPa.
import { rng } from '../../core/rng.mjs';
import { numberItem, choiceItem, fmt } from './school-math.mjs';
import { solve } from '../../engines/solids/frame.mjs';
import { MATERIALS } from '../../core/materials.mjs';
import { section } from '../../core/sections.mjs';
import { stand, SPEC } from '../../mount/model.mjs';

const deg = a => a * Math.PI / 180;
const R = (v, n = 4) => +v.toPrecision(n);
const STEEL = MATERIALS.steel, BAR = section({ shape: 'rect', b: 50, h: 80 });

// ---------- engine helpers (all go through engines/solids/frame.mjs solve) ----------
// A straight horizontal beam with joints at xs (mm). supports: [{ x, type }]; loads: [{ x, fx, fy }] (N) at joints.
export function beamSolve(xs, supports, loads, { material = STEEL, sec = BAR } = {}) {
  const X = [...new Set(xs)].sort((a, b) => a - b), at = x => X.indexOf(x), n = X.length;
  const res = solve({ nodes: X.map(x => ({ x, y: 0 })), members: X.slice(1).map((_, i) => ({ i, j: i + 1, material, section: sec, type: 'frame' })),
    supports: supports.map(s => ({ node: at(s.x), type: s.type })), loads: loads.map(l => ({ node: at(l.x), fx: l.fx || 0, fy: l.fy || 0, m: 0 })) });
  if (!res.ok) throw new Error('unstable item structure');
  const M = x => { const i = at(x); return i < n - 1 ? -res.members[i].end[2] : res.members[n - 2].end[5]; };   // sagging +, N·mm
  return { res, M, defl: x => -res.displacements[3 * at(x) + 1], reaction: x => res.reactions.find(r => r.node === at(x)) };
}
const simplySupported = (L, a, P, opts) => beamSolve([0, a, L], [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }], [{ x: a, fy: -P }], opts);
// Planar frame from points; members frame unless listed in truss. Used for the crane and the slanted arm.
export function frameSolve(points, members, supports, loads) {
  const res = solve({ nodes: points.map(([x, y]) => ({ x, y })), members: members.map(([i, j, type = 'frame']) => ({ i, j, type, material: STEEL, section: BAR })), supports, loads });
  if (!res.ok) throw new Error('unstable item structure');
  return res;
}

const g = (id, competency, aspects, make) => [id, { competency, aspects, make: (seed, aspect = aspects[0]) => make(rng(`${id}:${aspect}:${seed}`), { gen: id, seed, aspect: aspects.includes(aspect) ? aspect : aspects[0], competency }) }];
const kNm = v => v / 1e6, Nm = v => v / 1e3;

export const GENERATORS = Object.fromEntries([
  // ---- free-body diagram ----
  g('statics.fbd', 'ENG.statics.free-body-diagram', ['concept', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const c = r.pick([
        { what: 'a beam resting on a pin at A and a roller at B', n: 3, fewer: 'left out the pin’s horizontal reaction', more: 'gave the roller a sideways reaction as well' },
        { what: 'a shelf board fixed (built in) into a wall at one end', n: 3, fewer: 'left out the wall’s moment reaction', more: 'counted the board’s weight as an unknown' },
        { what: 'a gate hung on two pins, one above the other', n: 4, fewer: 'gave one pin only one reaction', more: 'added a moment reaction at a pin' }]);
      const P = r.int(2, 12) * 100;
      return choiceItem({ ...base, prompt: `Draw the free-body diagram of ${c.what}, carrying a known ${fmt(P)} N load. How many unknown reaction components does it show?`,
        figure: { kind: 'fbd', params: { case: c.what, P } },
        options: [{ text: String(c.n), correct: true }, { text: String(c.n - 1), misconception: { id: 'missing-reaction', label: c.fewer } }, { text: String(c.n + 1), misconception: { id: 'extra-reaction', label: c.more } }, { text: '1', misconception: { id: 'load-only', label: 'counted only one support force' } }],
        solution: ['Cut the body free from every support and replace each support by what it can push or pull with.', 'Pin: two forces (H and V). Roller: one force at right angles to its surface. Fixed: H, V and a moment.', `So there are ${c.n} unknowns.`] });
    }
    const obj = r.pick(['wall shelf', 'balcony beam', 'machine bracket']), m = r.int(5, 60);
    return choiceItem({ ...base, prompt: `A ${obj} is built into a wall at one end and carries a ${m} kg box. Which is the complete free-body diagram of the ${obj}?`,
      figure: { kind: 'cantilever', params: { mass: m } },
      options: [{ text: 'The box’s weight, the wall’s upward force and the wall’s moment', correct: true },
        { text: 'The box’s weight and the wall’s upward force', misconception: { id: 'missing-reaction', label: 'left out the wall’s moment reaction' } },
        { text: 'The box’s weight, the wall’s force and moment, and the bending moment inside the board', misconception: { id: 'internal-on-fbd', label: 'drew an internal force on a whole-body free-body diagram' } },
        { text: 'The box’s mass in kg and the wall’s upward force', misconception: { id: 'mass-not-weight', label: 'drew mass instead of weight' } }],
      solution: ['A built-in end stops the board moving up, sideways and turning: force and moment reactions.', 'Only external forces go on the free-body diagram; the box acts by its weight m·g.'] });
  }),

  // ---- resolving components ----
  g('statics.components', 'ENG.statics.force-components', ['procedure', 'transfer'], (r, base) => {
    const F = r.int(4, 40) * 50, th = r.pick([20, 25, 30, 35, 40, 50, 55, 60, 65, 70]), vert = r.next() < 0.5;
    const ctx = base.aspect === 'transfer' ? `The tie rod of a jib crane pulls on the arm with ${fmt(F)} N at ${th}° to the horizontal arm.` : `A rope pulls with ${fmt(F)} N at ${th}° above the horizontal.`;
    const v = vert ? F * Math.sin(deg(th)) : F * Math.cos(deg(th)), other = vert ? F * Math.cos(deg(th)) : F * Math.sin(deg(th));
    return numberItem({ ...base, prompt: `${ctx} What is its ${vert ? 'vertical' : 'horizontal'} component?`, figure: { kind: 'force', params: { F, angle: th, component: vert ? 'vertical' : 'horizontal' } },
      value: v, unit: 'N', misconceptions: [{ id: 'sin-cos-swap', value: other, label: 'swapped sin and cos' }, { id: 'no-resolve', value: F, label: 'used the whole force' }],
      solution: [`Measured from the horizontal: horizontal = F cos θ, vertical = F sin θ.`, `${vert ? 'Vertical' : 'Horizontal'} = ${fmt(F)} × ${vert ? 'sin' : 'cos'} ${th}° = ${R(v)} N.`] });
  }),

  // ---- support reactions ----
  g('statics.supports', 'ENG.statics.support-reactions', ['concept', 'procedure'], (r, base) => {
    if (base.aspect === 'concept') {
      const kind = r.pick(['roller', 'pin', 'fixed']);
      const opts = {
        roller: ['one force at right angles to the surface it rolls on', 'a force in any direction', 'a force in any direction and a moment', 'a moment only'],
        pin: ['a force in any direction (two components), but no moment', 'one force at right angles to the surface', 'a force in any direction and a moment', 'a moment only'],
        fixed: ['a force in any direction and a moment', 'a force in any direction (two components), but no moment', 'one force at right angles to the surface', 'a moment only'] }[kind];
      const mis = { roller: [['roller-sideways', 'gave a roller a sideways reaction'], ['roller-moment', 'gave a roller a moment reaction'], ['moment-only', 'confused a support with a couple']],
        pin: [['missing-reaction', 'left out one component of the pin force'], ['pin-moment', 'thought a pin resists turning'], ['moment-only', 'confused a support with a couple']],
        fixed: [['missing-reaction', 'left out the moment of a fixed support'], ['missing-reaction', 'left out a force component'], ['moment-only', 'confused a support with a couple']] }[kind];
      return choiceItem({ ...base, prompt: `What can a ${kind} support push or pull on a beam with?`, figure: { kind: 'support', params: { type: kind } },
        options: [{ text: opts[0], correct: true }, ...opts.slice(1).map((t, i) => ({ text: t, misconception: { id: mis[i][0], label: mis[i][1] } }))],
        solution: ['A support gives a reaction for every movement it stops.', 'Roller: stops movement into the surface → one force. Pin: stops all movement but not turning → two forces. Fixed: stops movement and turning → two forces and a moment.'] });
    }
    // Engine: horizontal reaction at the pin of a pin–roller beam under a sloping load.
    const L = r.int(3, 8) * 1000, a = r.int(1, L / 500 - 1) * 500, F = r.int(4, 30) * 100, th = r.pick([30, 40, 45, 50, 60]);
    const b = beamSolve([0, a, L], [{ x: 0, type: 'pin' }, { x: L, type: 'roller' }], [{ x: a, fx: F * Math.cos(deg(th)), fy: -F * Math.sin(deg(th)) }]);
    const H = Math.abs(b.reaction(0).fx);
    return numberItem({ ...base, key: 'engine', prompt: `A ${L / 1000} m beam sits on a pin at A (left) and a roller at B. A ${fmt(F)} N force pushes down on it ${a / 1000} m from A, sloping at ${th}° to the beam. What horizontal force does the pin at A carry?`,
      figure: { kind: 'beam', params: { L, a, F, angle: th, supports: ['pin', 'roller'] } }, value: H, unit: 'N',
      misconceptions: [{ id: 'roller-shares', value: H / 2, label: 'shared the sideways force with the roller' }, { id: 'sin-cos-swap', value: F * Math.sin(deg(th)), label: 'used the vertical component' }],
      solution: ['A roller cannot push sideways, so the pin takes all of the horizontal component.', `ΣFx = 0: H_A = F cos θ = ${fmt(F)} × cos ${th}° = ${R(H)} N.`] });
  }),

  // ---- perpendicular distance (lever arm) ----
  g('statics.lever-arm', 'ENG.statics.perpendicular-distance', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'A spanner turns a bolt at O. You pull on the end of the handle, but not at right angles to it. Which distance do you multiply the force by to get its moment about O?',
        figure: { kind: 'arm', params: { r: 250, angle: r.pick([40, 50, 60]) } },
        options: [{ text: 'The perpendicular distance from O to the force’s line of action', correct: true },
          { text: 'The length of the handle, from O to where you pull', misconception: { id: 'slant-distance', label: 'used the slant distance to the point of application' } },
          { text: 'The horizontal distance from O to your hand', misconception: { id: 'horizontal-distance', label: 'used a horizontal distance whatever the force’s direction' } },
          { text: 'Half the handle length', misconception: { id: 'centroid-distance', label: 'used the middle of the handle' } }],
        solution: ['The moment depends only on the line along which the force acts.', 'Lever arm = shortest (perpendicular) distance from the point to that line.'] });
    }
    if (base.aspect === 'procedure') {
      const L = r.int(4, 20) * 25, th = r.pick([25, 30, 35, 40, 50, 55, 60, 65]), d = L * Math.sin(deg(th));
      return numberItem({ ...base, prompt: `A spanner handle is ${L} mm long from the bolt centre O to your hand. You pull at ${th}° to the handle. What is the perpendicular distance from O to the line of your pull?`,
        figure: { kind: 'arm', params: { r: L, angle: th } }, value: d, unit: 'mm',
        misconceptions: [{ id: 'slant-distance', value: L, label: 'used the slant distance (the handle length)' }, { id: 'sin-cos-swap', value: L * Math.cos(deg(th)), label: 'used cos instead of sin' }],
        solution: ['Lever arm d = r sin θ, with θ the angle between the handle and the force.', `d = ${L} × sin ${th}° = ${R(d)} mm.`] });
    }
    const L = r.int(3, 8) * 500, h = r.int(2, 5) * 500, d = h * L / Math.hypot(h, L);
    return numberItem({ ...base, prompt: `A crane arm sticks out ${fmt(L)} mm from the mast. A tie rod runs from the arm’s tip up to the mast, ${fmt(h)} mm above the arm. What is the perpendicular distance from the arm’s pin on the mast to the tie rod?`,
      figure: { kind: 'crane', params: { L, h } }, value: d, unit: 'mm',
      misconceptions: [{ id: 'slant-distance', value: Math.hypot(h, L), label: 'used the tie length' }, { id: 'horizontal-distance', value: L, label: 'used the arm length' }, { id: 'vertical-distance', value: h, label: 'used the height of the tie anchor' }],
      solution: ['The tie, the arm and the mast form a right triangle with legs L and h.', `Tie length = √(L² + h²) = ${R(Math.hypot(h, L))} mm.`, `Distance from the corner to the hypotenuse = L·h / √(L² + h²) = ${R(d)} mm.`] });
  }),

  // ---- moment of a force about a point (the journey's target) ----
  g('statics.moment', 'ENG.statics.moment-about-point', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const c = r.pick(['through', 'slide', 'double']);
      if (c === 'through') return choiceItem({ ...base, prompt: 'A force on a bracket is turned until its line of action passes straight through the bolt O. What is its moment about O now?',
        figure: { kind: 'arm', params: { r: 300, angle: 0 } },
        options: [{ text: 'Zero', correct: true }, { text: 'Force × the distance from O to where it acts', misconception: { id: 'slant-distance', label: 'used the distance to the point of application, not the lever arm' } },
          { text: 'The largest it can be', misconception: { id: 'direction-blind', label: 'thought pulling along the arm turns it most' } }, { text: 'It cannot be worked out', misconception: { id: 'no-model', label: 'did not use the lever-arm idea' } }],
        solution: ['Moment = F × perpendicular distance from O to the line of action.', 'The line passes through O, so that distance is 0, and the moment is 0.'] });
      if (c === 'slide') return choiceItem({ ...base, prompt: 'A force is slid along its own line of action to a different point on a body. What happens to its moment about O?',
        figure: { kind: 'arm', params: { r: 300, angle: 50, slide: true } },
        options: [{ text: 'It stays the same', correct: true }, { text: 'It grows if the new point is further from O', misconception: { id: 'slant-distance', label: 'used the distance to the point of application' } },
          { text: 'It becomes zero', misconception: { id: 'no-model', label: 'did not use the lever-arm idea' } }, { text: 'It changes sign', misconception: { id: 'sign', label: 'confused the sense of turning' } }],
        solution: ['The perpendicular distance from O to the line does not change when the force slides along that line.', 'So F × d, the moment, is unchanged (principle of transmissibility).'] });
      return choiceItem({ ...base, prompt: 'A machine sits on a shelf fixed into a wall. It is moved twice as far from the wall. What happens to the moment of its weight about the wall?',
        figure: { kind: 'cantilever', params: { moved: true } },
        options: [{ text: 'It doubles', correct: true }, { text: 'It stays the same: the weight has not changed', misconception: { id: 'force-only', label: 'thought moment depends on force only' } },
          { text: 'It becomes four times as big', misconception: { id: 'square-law', label: 'thought moment grows with distance squared' } }, { text: 'It halves', misconception: { id: 'inverted', label: 'inverted the lever relation' } }],
        solution: ['M = W × d. W stays the same, d doubles, so M doubles.'] });
    }
    if (base.aspect === 'procedure') {
      if (r.next() < 0.6) {   // one sloping force at the tip of a bracket fixed at O
        const L = r.int(4, 24) * 25, F = r.int(4, 40) * 25, th = r.pick([25, 30, 35, 40, 45, 50, 55, 60, 65, 70]);
        const res = frameSolve([[0, 0], [L, 0]], [[0, 1]], [{ node: 0, type: 'fixed' }], [{ node: 1, fx: F * Math.cos(deg(th)), fy: -F * Math.sin(deg(th)), m: 0 }]);
        const M = Math.abs(res.reactions[0].m);
        return numberItem({ ...base, key: 'engine', prompt: `A bracket sticks out ${L} mm from a wall at O. At its tip a cable pulls with ${fmt(F)} N, downwards and outwards at ${th}° to the bracket. What is the moment of this force about O, in N·m?`,
          figure: { kind: 'arm', params: { r: L, F, angle: th } }, value: Nm(M), unit: 'N·m', minTol: 0.05,
          misconceptions: [{ id: 'slant-distance', value: F * L / 1000, label: 'used the bracket length instead of the lever arm' }, { id: 'sin-cos-swap', value: F * L * Math.cos(deg(th)) / 1000, label: 'used cos instead of sin' }, { id: 'units-mm', value: M, label: 'left the answer in N·mm' }],
          solution: [`Lever arm d = ${L} × sin ${th}° = ${R(L * Math.sin(deg(th)))} mm.`, `M = F × d = ${fmt(F)} × ${R(L * Math.sin(deg(th)))} = ${fmt(M)} N·mm.`, `= ${R(Nm(M))} N·m.`] });
      }
      // two vertical forces turning opposite ways about O
      const x1 = r.int(2, 8) * 50, x2 = x1 + r.int(2, 8) * 50, F1 = r.int(4, 30) * 50, F2 = r.int(2, 20) * 50;
      const res = frameSolve([[0, 0], [x1, 0], [x2, 0]], [[0, 1], [1, 2]], [{ node: 0, type: 'fixed' }], [{ node: 1, fx: 0, fy: -F1, m: 0 }, { node: 2, fx: 0, fy: F2, m: 0 }]);
      const M = Math.abs(res.reactions[0].m);
      return numberItem({ ...base, key: 'engine', prompt: `A bar is fixed at O. ${fmt(F1)} N pushes down on it ${x1} mm from O, and ${fmt(F2)} N pushes up ${x2} mm from O. What is the size of their total moment about O, in N·m?`,
        figure: { kind: 'cantilever', params: { loads: [{ x: x1, P: F1 }, { x: x2, P: -F2 }] } }, value: Nm(M), unit: 'N·m', minTol: 0.05,
        misconceptions: [{ id: 'sign', value: (F1 * x1 + F2 * x2) / 1000, label: 'added moments that turn opposite ways' }, { id: 'units-mm', value: M, label: 'left the answer in N·mm' }],
        solution: ['Clockwise and anticlockwise moments have opposite signs.', `${fmt(F1)} × ${x1} = ${fmt(F1 * x1)} N·mm clockwise; ${fmt(F2)} × ${x2} = ${fmt(F2 * x2)} N·mm anticlockwise.`, `Net = ${fmt(Math.abs(F1 * x1 - F2 * x2))} N·mm = ${R(Nm(M))} N·m.`] });
    }
    // transfer: jib crane — moment of the hanging load about the foot of the mast
    const H = r.int(6, 12) * 500, x = r.int(2, 12) * 500, m = r.int(2, 20) * 50, W = m * 9.81;
    const res = frameSolve([[0, 0], [0, H], [x, H]], [[0, 1], [1, 2]], [{ node: 0, type: 'fixed' }], [{ node: 2, fx: 0, fy: -W, m: 0 }]);
    const M = Math.abs(res.reactions[0].m);
    return numberItem({ ...base, key: 'engine', prompt: `A jib crane’s mast is ${H / 1000} m tall. A ${m} kg load hangs from the arm ${x / 1000} m out from the mast. What moment does the load’s weight make about the foot of the mast, in kN·m? (g = 9.81 m/s²)`,
      figure: { kind: 'crane', params: { H, x, m } }, value: kNm(M), unit: 'kN·m', minTol: 0.005,
      misconceptions: [{ id: 'slant-distance', value: W * Math.hypot(x, H) / 1e6, label: 'used the slant distance from the foot to the hook' }, { id: 'mass-not-weight', value: m * x / 1e6, label: 'used mass in kg instead of weight in N' }, { id: 'wrong-point', value: W * H / 1e6, label: 'used the mast height as the lever arm' }],
      solution: [`Weight W = ${m} × 9.81 = ${R(W)} N, acting straight down.`, `Its line of action is ${x} mm from the mast, whatever the height: d = ${x} mm.`, `M = ${R(W)} × ${x} = ${fmt(M)} N·mm = ${R(kNm(M))} kN·m.`] });
  }),

  // ---- couple ----
  g('statics.couple', 'ENG.statics.couple', ['concept', 'procedure'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'Two equal and opposite parallel forces act on a plate (a couple). Its moment is worked out first about point A and then about a different point B. How do the answers compare?',
        figure: { kind: 'couple', params: {} },
        options: [{ text: 'The same about every point', correct: true }, { text: 'Larger about the point that is further away', misconception: { id: 'wrong-point', label: 'thought a couple’s moment depends on the point' } },
          { text: 'Zero, because the forces cancel', misconception: { id: 'force-sum', label: 'confused ΣF = 0 with ΣM = 0' } }, { text: 'Opposite signs', misconception: { id: 'sign', label: 'confused the sense of turning' } }],
        solution: ['Take moments about any point O: F·(x₂) − F·(x₁) = F·(x₂ − x₁) = F·d.', 'O drops out, so a couple has the same moment about every point.'] });
    }
    const F = r.int(2, 30) * 25, d = r.int(4, 30) * 10;
    return numberItem({ ...base, prompt: `A tap handle is turned by two equal and opposite ${F} N forces, ${d} mm apart (perpendicular distance between their lines). What is the moment of the couple, in N·m?`,
      figure: { kind: 'couple', params: { F, d } }, value: F * d / 1000, unit: 'N·m', minTol: 0.01,
      misconceptions: [{ id: 'half-arm', value: F * d / 2000, label: 'used half the distance (only one force)' }, { id: 'double-count', value: 2 * F * d / 1000, label: 'multiplied each force by the full distance' }, { id: 'force-sum', value: 0, label: 'thought equal and opposite forces make no turning' }],
      solution: ['Couple moment = one force × perpendicular distance between the two lines.', `= ${F} × ${d} = ${fmt(F * d)} N·mm = ${F * d / 1000} N·m.`] });
  }),

  // ---- equilibrium ΣF = 0, ΣM = 0 ----
  g('statics.equilibrium', 'ENG.statics.equilibrium-2d', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'A beam on a pin at A and a roller at B carries one load. You want B’s reaction with one equation. Which equation should you write first?',
        figure: { kind: 'beam', params: { supports: ['pin', 'roller'] } },
        options: [{ text: 'ΣM about A = 0: A’s reactions have no moment about A', correct: true }, { text: 'ΣM about the load = 0', misconception: { id: 'wrong-point', label: 'took moments about a point that leaves both reactions in the equation' } },
          { text: 'ΣFy = 0', misconception: { id: 'force-only', label: 'used a force sum, which has two unknowns' } }, { text: 'ΣM about B = 0', misconception: { id: 'wrong-point', label: 'took moments about the support whose reaction you want' } }],
        solution: ['Pick the point where the unknowns you do not want act: their moments vanish.', 'ΣM_A = 0 leaves R_B as the only unknown.'] });
    }
    if (base.aspect === 'procedure') {
      const a = r.int(2, 12) * 50, b = r.int(4, 30) * 50, W = r.int(4, 40) * 50;
      return numberItem({ ...base, prompt: `A crowbar pivots on a stone. The load presses ${fmt(W)} N on it ${a} mm from the pivot; you push down ${b} mm from the pivot on the other side. What push holds it balanced?`,
        figure: { kind: 'lever', params: { a, b, W } }, value: W * a / b, unit: 'N',
        misconceptions: [{ id: 'full-length', value: W * a / (a + b), label: 'used the whole bar length as your lever arm' }, { id: 'inverted', value: W * b / a, label: 'swapped the two lever arms' }],
        solution: ['ΣM about the pivot = 0 (the pivot force has no moment there).', `P × ${b} = ${fmt(W)} × ${a}  →  P = ${R(W * a / b)} N.`] });
    }
    // transfer: tie force in a jib crane, pin-jointed (engine)
    const L = r.int(3, 8) * 500, h = r.int(2, 5) * 500, m = r.int(2, 20) * 50, W = m * 9.81;
    const res = frameSolve([[0, 0], [L, 0], [0, h]], [[0, 1, 'truss'], [2, 1, 'truss']], [{ node: 0, type: 'pin' }, { node: 2, type: 'pin' }], [{ node: 1, fx: 0, fy: -W, m: 0 }]);
    const T = -res.members[1].end[0];
    return numberItem({ ...base, key: 'engine', prompt: `A crane arm ${fmt(L)} mm long is pinned to a mast. A tie rod runs from the arm’s tip to the mast ${fmt(h)} mm above the pin. A ${m} kg load hangs at the tip. What is the tension in the tie, in N? (g = 9.81 m/s², ignore the arm’s weight)`,
      figure: { kind: 'crane', params: { L, h, m, pinned: true } }, value: T, unit: 'N',
      misconceptions: [{ id: 'no-resolve', value: W, label: 'set the tie force equal to the load (forgot the tie slopes)' }, { id: 'sin-cos-swap', value: W * Math.hypot(h, L) / L, label: 'used the wrong angle of the tie' }, { id: 'horizontal-only', value: W * L / h, label: 'gave only the horizontal pull of the tie' }],
      solution: ['ΣM about the arm’s pin = 0: the pin’s own force has no moment there.', `Tie lever arm about the pin = L·h / √(L² + h²) = ${R(L * h / Math.hypot(L, h))} mm.`, `T × ${R(L * h / Math.hypot(L, h))} = ${R(W)} × ${L}  →  T = ${R(T)} N.`] });
  }),

  // ---- simply supported beam reactions ----
  g('statics.beam-reactions', 'ENG.statics.beam-reactions', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'A load on a beam resting on two supports A and B is moved towards B. What happens to the reaction at A?',
        figure: { kind: 'beam', params: { supports: ['pin', 'roller'], moving: true } },
        options: [{ text: 'It gets smaller', correct: true }, { text: 'It gets bigger', misconception: { id: 'swapped', label: 'gave each support the share of the far end' } },
          { text: 'It stays at half the load', misconception: { id: 'half', label: 'split the load equally whatever its position' } }, { text: 'It becomes the whole load', misconception: { id: 'missing-reaction', label: 'left out one reaction' } }],
        solution: ['ΣM about B: R_A × L = P × (distance from the load to B).', 'Moving the load towards B makes that distance smaller, so R_A falls.'] });
    }
    const mount = base.aspect === 'transfer';
    const L = mount ? SPEC.span : r.int(3, 10) * 1000, a = mount ? r.int(SPEC.mountRange[0] / SPEC.step, SPEC.mountRange[1] / SPEC.step) * SPEC.step : r.int(1, L / 500 - 1) * 500;
    const P = mount ? r.int(10, 40) * 100 : r.int(2, 40) * 500, left = mount || r.next() < 0.5;
    const b = simplySupported(L, a, P), RA = b.reaction(0).fy, RB = b.reaction(L).fy, v = left ? RA : RB;
    const prompt = mount ? `A ${fmt(P)} N machine sits ${a} mm from the left bolt of a support bolted ${L} mm apart (treat the bolts as a pin and a roller). What does the left bolt carry, in N?`
      : `A ${L / 1000} m beam rests on a pin at A and a roller at B. A ${fmt(P)} N load acts ${a / 1000} m from A. What is the reaction at ${left ? 'A' : 'B'}, in N?`;
    return numberItem({ ...base, key: 'engine', prompt, figure: { kind: 'beam', params: { L, a, P, supports: ['pin', 'roller'], ask: left ? 'A' : 'B' } }, value: v, unit: 'N',
      misconceptions: [{ id: 'swapped', value: left ? RB : RA, label: 'used the distance to the near support (swapped the shares)' }, { id: 'half', value: P / 2, label: 'split the load equally' }, { id: 'missing-reaction', value: P, label: 'gave all the load to one support' }],
      solution: [`ΣM about ${left ? 'B' : 'A'} = 0: R_${left ? 'A' : 'B'} × ${L} = ${fmt(P)} × ${left ? L - a : a}.`, `R_${left ? 'A' : 'B'} = ${R(v)} N.`, `Check ΣFy: R_A + R_B = ${R(RA)} + ${R(RB)} = ${fmt(P)} N.`] });
  }),

  // ---- cantilever (fixed support) reactions ----
  g('statics.cantilever', 'ENG.statics.cantilever-reactions', ['procedure', 'transfer'], (r, base) => {
    const L = r.int(4, 12) * 100;
    const loads = base.aspect === 'procedure' ? [{ x: r.int(1, L / 100) * 100, m: r.int(3, 40) }] : (() => { const x1 = r.int(1, L / 100 - 1) * 100; return [{ x: x1, m: r.int(3, 30) }, { x: r.int(x1 / 100 + 1, L / 100) * 100, m: r.int(3, 30) }]; })();
    const W = l => l.m * 9.81;
    const b = beamSolve([0, L, ...loads.map(l => l.x)], [{ x: 0, type: 'fixed' }], loads.map(l => ({ x: l.x, fy: -W(l) })));
    const M = Math.abs(b.reaction(0).m), hand = loads.reduce((s, l) => s + W(l) * l.x, 0);
    const what = loads.length === 1 ? `a ${loads[0].m} kg box ${loads[0].x} mm from the wall` : `a ${loads[0].m} kg box ${loads[0].x} mm and a ${loads[1].m} kg box ${loads[1].x} mm from the wall`;
    return numberItem({ ...base, key: 'engine', prompt: `A ${L} mm shelf is built into a wall. It carries ${what}. What moment must the wall supply, in N·m? (g = 9.81 m/s², ignore the shelf’s weight)`,
      figure: { kind: 'cantilever', params: { L, loads: loads.map(l => ({ x: l.x, P: W(l) })) } }, value: Nm(M), unit: 'N·m', minTol: 0.05,
      misconceptions: [{ id: 'full-span', value: loads.reduce((s, l) => s + W(l) * L, 0) / 1000, label: 'used the whole shelf length as the lever arm' }, { id: 'mass-not-weight', value: loads.reduce((s, l) => s + l.m * l.x, 0) / 1000, label: 'used kg instead of newtons' }, { id: 'units-mm', value: hand, label: 'left the answer in N·mm' }],
      solution: ['ΣM about the wall = 0: M_wall = Σ (weight × distance from the wall).', ...loads.map(l => `${l.m} × 9.81 × ${l.x} = ${fmt(W(l) * l.x)} N·mm`), `M_wall = ${fmt(hand)} N·mm = ${R(Nm(M))} N·m.`] });
  }),

  // ---- bending moment from loads ----
  g('statics.bending-moment', 'ENG.statics.bending-moment', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'A beam rests on two supports and carries one point load, not at mid-span. Where is the bending moment largest?',
        figure: { kind: 'beam', params: { supports: ['pin', 'roller'], offCentre: true } },
        options: [{ text: 'Under the load', correct: true }, { text: 'At mid-span', misconception: { id: 'centre-formula', label: 'assumed the peak is always at mid-span' } },
          { text: 'At the support nearer the load', misconception: { id: 'support-peak', label: 'put the peak bending at a simple support (it is zero there)' } }, { text: 'It is the same all along', misconception: { id: 'uniform', label: 'thought bending is uniform' } }],
        solution: ['Between the supports and the load, M grows linearly from 0 at each support.', 'The two straight lines meet, at their highest, under the load.'] });
    }
    if (base.aspect === 'transfer') {   // on the mount test stand (mount/model.mjs stand runs the frame solver)
      const a = r.int(SPEC.mountRange[0] / SPEC.step, SPEC.mountRange[1] / SPEC.step) * SPEC.step, L = SPEC.span, P = SPEC.load;
      const st = stand({ material: 'steel', shape: 'rect', b: 40, h: 50 }, { mount: a, loaded: true }), M = Math.max(...st.M.map(Math.abs));
      return numberItem({ ...base, key: 'engine', prompt: `On the mount test stand, the ${fmt(P)} N machine sits ${a} mm from the left bolt; the bolts are ${L} mm apart. What is the largest bending moment in the support, in N·m?`,
        figure: { kind: 'beam', params: { L, a, P, supports: ['pin', 'roller'] } }, value: Nm(M), unit: 'N·m', minTol: 0.5,
        misconceptions: [{ id: 'centre-formula', value: P * L / 4000, label: 'used P·L/4, which holds only for a load at mid-span' }, { id: 'full-span', value: P * L / 1000, label: 'used the full span instead of a and b' }, { id: 'missing-reaction', value: P * a / 1000, label: 'took the load times its distance, forgetting the reaction' }],
        solution: [`Left bolt: R = P·b/L = ${fmt(P)} × ${L - a} / ${L} = ${R(P * (L - a) / L)} N.`, `Under the load: M = R × a = ${R(P * (L - a) / L)} × ${a} = ${fmt(P * a * (L - a) / L)} N·mm.`, `= ${R(Nm(M))} N·m.`] });
    }
    const L = r.int(3, 10) * 1000, a = r.int(1, L / 500 - 1) * 500, P = r.int(2, 40) * 500;
    const b = simplySupported(L, a, P), M = b.M(a);
    return numberItem({ ...base, key: 'engine', prompt: `A ${L / 1000} m beam on two supports carries ${fmt(P)} N, ${a / 1000} m from the left support. What is the largest bending moment, in kN·m?`,
      figure: { kind: 'beam', params: { L, a, P, supports: ['pin', 'roller'] } }, value: kNm(M), unit: 'kN·m', minTol: 0.005,
      misconceptions: [{ id: 'centre-formula', value: P * L / 4e6, label: 'used P·L/4, which holds only for a load at mid-span' }, { id: 'full-span', value: P * L / 1e6, label: 'used the full span instead of a and b' }, { id: 'missing-reaction', value: P * a / 1e6, label: 'took the load times its distance, forgetting the reaction' }],
      solution: [`R_left = P·b/L = ${fmt(P)} × ${L - a} / ${L} = ${R(P * (L - a) / L)} N.`, `M under the load = R_left × a = P·a·b/L = ${fmt(P * a * (L - a) / L)} N·mm.`, `= ${R(kNm(M))} kN·m.`] });
  }),

  // ---- second moment of area ----
  g('statics.second-moment', 'ENG.statics.second-moment-area', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const k = r.pick([2, 3]);
      return choiceItem({ ...base, prompt: `A rectangular bar bends about the axis parallel to its width b. Which makes it stiffer: multiplying the depth h by ${k}, or multiplying the width b by ${k}?`,
        figure: { kind: 'section', params: { shape: 'rect' } },
        options: [{ text: `Depth: I grows ${k ** 3}×, against ${k}× for width`, correct: true }, { text: 'Both the same', misconception: { id: 'h-not-cubed', label: 'treated I as growing like h, not h³' } },
          { text: 'Width', misconception: { id: 'axes-swapped', label: 'cubed the width instead of the depth' } }, { text: `Depth, ${k ** 2}× stiffer`, misconception: { id: 'h-squared', label: 'used h² instead of h³' } }],
        solution: ['I = b·h³/12 about the axis parallel to b.', `×${k} on h gives ×${k ** 3}; ×${k} on b gives ×${k}.`] });
    }
    if (base.aspect === 'procedure') {
      const b = r.int(4, 10) * 5, h = r.int(4, 16) * 5;
      return numberItem({ ...base, prompt: `A solid rectangular bar is ${b} mm wide and ${h} mm deep, bending about the axis parallel to its width. What is its second moment of area I, in mm⁴?`,
        figure: { kind: 'section', params: { shape: 'rect', b, h } }, value: b * h ** 3 / 12, unit: 'mm⁴',
        misconceptions: [{ id: 'h-not-cubed', value: b * h / 12, label: 'used h instead of h³' }, { id: 'axes-swapped', value: h * b ** 3 / 12, label: 'cubed the width instead of the depth' }, { id: 'h-squared', value: b * h ** 2 / 12, label: 'used h² instead of h³' }, { id: 'about-edge', value: b * h ** 3 / 3, label: 'used b·h³/3 (about the edge, not the centre)' }],
        solution: ['I = b·h³/12.', `= ${b} × ${h}³ / 12 = ${b} × ${fmt(h ** 3)} / 12 = ${fmt(b * h ** 3 / 12)} mm⁴.`] });
    }
    if (r.next() < 0.5) {
      const b = r.int(6, 10) * 5, h = r.int(8, 16) * 5, t = r.int(3, 5), bi = b - 2 * t, hi = h - 2 * t, I = (b * h ** 3 - bi * hi ** 3) / 12;
      return numberItem({ ...base, prompt: `A hollow rectangular tube is ${b} mm wide and ${h} mm deep with a ${t} mm wall. What is its second moment of area about the axis parallel to its width, in mm⁴?`,
        figure: { kind: 'section', params: { shape: 'rhs', b, h, t } }, value: I, unit: 'mm⁴',
        misconceptions: [{ id: 'wall-once', value: (b * h ** 3 - (b - t) * (h - t) ** 3) / 12, label: 'took the wall off one side only' }, { id: 'outer-only', value: b * h ** 3 / 12, label: 'forgot to subtract the hole' }, { id: 'subtract-dimensions', value: (b - bi) * (h - hi) ** 3 / 12, label: 'subtracted the sizes before cubing' }],
        solution: ['I = (b·h³ − bᵢ·hᵢ³)/12, with the hole bᵢ = b − 2t, hᵢ = h − 2t.', `= (${b} × ${h}³ − ${bi} × ${hi}³)/12 = ${fmt(I)} mm⁴.`] });
    }
    const h = r.int(10, 16) * 5, b = r.int(6, 10) * 5, tf = r.int(4, 8), tw = r.int(3, 6), hw = h - 2 * tf, I = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
    return numberItem({ ...base, prompt: `An I-section is ${h} mm deep with ${b} mm wide flanges ${tf} mm thick and a ${tw} mm web. What is its second moment of area about the horizontal axis, in mm⁴?`,
      figure: { kind: 'section', params: { shape: 'I', b, h, tw, tf } }, value: I, unit: 'mm⁴',
      misconceptions: [{ id: 'outer-only', value: b * h ** 3 / 12, label: 'treated it as a solid rectangle' }, { id: 'h-squared', value: (b * h ** 2 - (b - tw) * hw ** 2) / 12, label: 'used h² instead of h³' }],
      solution: ['Treat it as the outer rectangle minus the two gaps beside the web.', `I = (b·h³ − (b − t_w)·h_w³)/12, h_w = h − 2t_f = ${hw} mm.`, `= (${b} × ${h}³ − ${b - tw} × ${hw}³)/12 = ${fmt(I)} mm⁴.`] });
  }),

  // ---- bending stress ----
  g('solids.bending-stress', 'ENG.solids.bending-stress', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'A beam sags under load. Where in its cross-section is the bending stress largest?',
        figure: { kind: 'section', params: { shape: 'rect', stress: true } },
        options: [{ text: 'At the top and bottom surfaces', correct: true }, { text: 'At the centre (neutral axis)', misconception: { id: 'neutral-axis', label: 'put the peak at the neutral axis, where bending stress is zero' } },
          { text: 'It is the same everywhere', misconception: { id: 'uniform', label: 'treated bending stress like a uniform axial stress' } }, { text: 'Only at the bottom', misconception: { id: 'tension-only', label: 'forgot the compression side' } }],
        solution: ['σ = M·y/I grows with distance y from the neutral axis.', 'Largest at y = c, the top (compression) and bottom (tension) surfaces.'] });
    }
    if (base.aspect === 'transfer') {   // the mount design on the test stand
      const material = r.pick(['steel', 'aluminium']), b = r.int(6, 10) * 5, h = r.int(6, 16) * 5, mount = r.int(2, 10) * 50;
      const d = { material, shape: 'rect', b, h }, st = stand(d, { mount, loaded: true }), s = st.at(mount).stress, M = st.at(mount).moment, sec = st.section;
      return numberItem({ ...base, key: 'engine', prompt: `On the mount stand (bolts ${SPEC.span} mm apart, ${fmt(SPEC.load)} N machine at ${mount} mm), the support is a ${b} × ${h} mm ${material} bar (h vertical). What is the bending stress at the mount, in MPa?`,
        figure: { kind: 'beam', params: { L: SPEC.span, a: mount, P: SPEC.load, section: { shape: 'rect', b, h }, material } }, value: s, unit: 'MPa', minTol: 0.1,
        misconceptions: [{ id: 'c-full-depth', value: 2 * s, label: 'used the full depth h as c (c = h/2)' }, { id: 'centre-formula', value: (SPEC.load * SPEC.span / 4) * sec.c / sec.I, label: 'used P·L/4 for a load that is not at mid-span' }, { id: 'units-m', value: s / 1000, label: 'mixed N·m with mm' }],
        solution: [`M at the mount = P·a·b/L = ${fmt(M)} N·mm.`, `I = b·h³/12 = ${fmt(sec.I)} mm⁴, c = h/2 = ${sec.c} mm.`, `σ = M·c/I = ${fmt(M)} × ${sec.c} / ${fmt(sec.I)} = ${R(s)} MPa.`] });
    }
    const L = r.int(2, 8) * 500, a = r.int(1, L / 250 - 1) * 250, P = r.int(4, 40) * 250, b = r.int(4, 10) * 10, h = r.int(6, 20) * 10;
    const sec = section({ shape: 'rect', b, h }), bs = simplySupported(L, a, P, { sec }), M = bs.M(a), s = M * sec.c / sec.I;
    return numberItem({ ...base, key: 'engine', prompt: `A ${L} mm beam on two supports carries ${fmt(P)} N at ${a} mm from the left support. It is a ${b} mm wide × ${h} mm deep rectangle. What is the largest bending stress, in MPa?`,
      figure: { kind: 'beam', params: { L, a, P, section: { shape: 'rect', b, h } } }, value: s, unit: 'MPa', minTol: 0.05,
      misconceptions: [{ id: 'c-full-depth', value: 2 * s, label: 'used the full depth h as c (c = h/2)' }, { id: 'centre-formula', value: (P * L / 4) * sec.c / sec.I, label: 'used P·L/4 for a load that is not at mid-span' }, { id: 'inverted', value: M * sec.I / sec.c / 1e6, label: 'used M·I/c' }],
      solution: [`M under the load = P·a·b/L = ${fmt(M)} N·mm.`, `I = b·h³/12 = ${fmt(sec.I)} mm⁴, c = h/2 = ${h / 2} mm.`, `σ = M·c/I = ${R(s)} MPa.`] });
  }),

  // ---- stiffness: deflection ∝ 1/(E·I) ----
  g('solids.stiffness', 'ENG.solids.beam-stiffness', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      return choiceItem({ ...base, prompt: 'Steel’s Young’s modulus E is about 2.9× that of aluminium. Two supports have identical size and load, one steel and one aluminium. How do their deflections compare?',
        figure: { kind: 'beam', params: { compare: ['steel', 'aluminium'] } },
        options: [{ text: 'The aluminium one deflects about 2.9× as much', correct: true }, { text: 'They deflect the same: same shape, same load', misconception: { id: 'shape-only', label: 'thought stiffness depends on shape only' } },
          { text: 'The steel one deflects more because it is heavier', misconception: { id: 'density', label: 'confused weight with stiffness' } }, { text: 'Aluminium deflects less: its yield strength is higher', misconception: { id: 'strength-not-stiffness', label: 'confused strength (yield) with stiffness (E)' } }],
        solution: ['Deflection = (load and span terms) / (E·I).', 'Same I, so δ_al / δ_steel = E_steel / E_al ≈ 2.9.'] });
    }
    const L = SPEC.span, a = r.int(2, 10) * 50, P = SPEC.load;
    if (base.aspect === 'procedure') {   // deeper section, same material
      const b = r.int(6, 10) * 5, h1 = r.int(6, 10) * 5, h2 = h1 + r.int(2, 6) * 5, mat = MATERIALS[r.pick(['steel', 'aluminium'])];
      const d1 = simplySupported(L, a, P, { material: mat, sec: section({ shape: 'rect', b, h: h1 }) }).defl(a), d2 = simplySupported(L, a, P, { material: mat, sec: section({ shape: 'rect', b, h: h2 }) }).defl(a);
      return numberItem({ ...base, key: 'engine', prompt: `A ${b} mm wide, ${h1} mm deep ${mat.name.toLowerCase()} support deflects ${R(d1, 3)} mm at the load. The depth is increased to ${h2} mm (same width, load and position). What is the new deflection, in mm?`,
        figure: { kind: 'beam', params: { L, a, P, material: mat.id, before: { shape: 'rect', b, h: h1 }, after: { shape: 'rect', b, h: h2 } } }, value: d2, unit: 'mm', minTol: 0.0005,
        misconceptions: [{ id: 'h-not-cubed', value: d1 * h1 / h2, label: 'scaled with h instead of h³' }, { id: 'h-squared', value: d1 * (h1 / h2) ** 2, label: 'scaled with h² instead of h³' }, { id: 'direct', value: d1 * (h2 / h1) ** 3, label: 'made it deflect more (direct, not inverse)' }],
        solution: ['δ ∝ 1/(E·I) and I ∝ h³ for the same width.', `δ₂ = δ₁ × (h₁/h₂)³ = ${R(d1, 3)} × (${h1}/${h2})³ = ${R(d2, 3)} mm.`] });
    }
    const b = r.int(6, 10) * 5, h = r.int(6, 16) * 5, from = r.pick(['steel', 'aluminium']), to = from === 'steel' ? 'aluminium' : 'steel', sec = section({ shape: 'rect', b, h });
    const d1 = simplySupported(L, a, P, { material: MATERIALS[from], sec }).defl(a), d2 = simplySupported(L, a, P, { material: MATERIALS[to], sec }).defl(a);
    return numberItem({ ...base, key: 'engine', prompt: `A ${b} × ${h} mm ${from} support deflects ${R(d1, 3)} mm under the machine. It is remade in ${to}, same size. What is the new deflection, in mm? (E: steel ${fmt(MATERIALS.steel.E)} MPa, aluminium ${fmt(MATERIALS.aluminium.E)} MPa)`,
      figure: { kind: 'beam', params: { L, a, P, section: { shape: 'rect', b, h }, before: from, after: to } }, value: d2, unit: 'mm', minTol: 0.0005,
      misconceptions: [{ id: 'direct', value: d1 * MATERIALS[to].E / MATERIALS[from].E, label: 'scaled with E instead of 1/E' }, { id: 'shape-only', value: d1, label: 'thought the material does not change deflection' }, { id: 'strength-not-stiffness', value: d1 * MATERIALS[from].yield / MATERIALS[to].yield, label: 'scaled with yield strength instead of E' }],
      solution: ['δ ∝ 1/E for the same section, span and load.', `δ₂ = δ₁ × E_${from}/E_${to} = ${R(d1, 3)} × ${fmt(MATERIALS[from].E)}/${fmt(MATERIALS[to].E)} = ${R(d2, 3)} mm.`] });
  }),
]);
