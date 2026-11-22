// Item generators for the school-maths nodes in content/graph/school-math.mjs (diagnostic prerequisite checks).
// Deterministic in seed. Formula-keyed: tests/support-content.test.mjs recomputes each answer by an independent hand calculation.
// Also exports the item builders that content/items/statics.mjs uses, so every item in Journey 1 has one shape.
import { rng } from '../../core/rng.mjs';

const R = (v, n = 3) => +v.toPrecision(n);                       // tidy display numbers
export const fmt = (v, d = 0) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : (+v.toFixed(d)).toString());
const deg = a => a * Math.PI / 180;

// Number item. answer.tol is relative, as core/ledger.mjs `within` reads it (a fraction of the right value): 1.5 % by
// default, widened so the absolute window is never below minTol (in the answer's unit). A misconception value that falls
// near the right answer, or near an earlier misconception, is dropped, so a wrong answer names at most one misconception.
const near = (a, b, tol, k) => Math.abs(a - b) <= k * tol * Math.max(Math.abs(a), Math.abs(b));
export function numberItem({ gen, seed, aspect, competency, prompt, figure, params, value, unit, tol = 0.015, minTol = 0, misconceptions = [], solution, key = 'formula' }) {
  const t = Math.max(tol, value ? minTol / Math.abs(value) : 0);
  const kept = [];
  for (const m of misconceptions) {
    if (!Number.isFinite(m.value) || near(m.value, value, t, 3) || kept.some(k => near(k.value, m.value, t, 2))) continue;
    kept.push(m);
  }
  return { id: `${gen}:${aspect}:${seed}`, competency, aspect, prompt, ...(figure && { figure }), params: params ?? figure?.params ?? {}, answer: { kind: 'number', value, unit, tol: t }, misconceptions: kept, solution, key };
}

// Choice item. options: [{ text, correct?, misconception?: { id, label } }]. Options are shuffled by the seed;
// answer.correct and misconception.option are indexes into the shuffled list.
export function choiceItem({ gen, seed, aspect, competency, prompt, figure, options, solution, key = 'formula' }) {
  const r = rng(`${gen}:${aspect}:${seed}:order`), o = options.map(x => ({ ...x, k: r.next() })).sort((a, b) => a.k - b.k);
  return { id: `${gen}:${aspect}:${seed}`, competency, aspect, prompt, figure,
    answer: { kind: 'choice', options: o.map(x => x.text), correct: o.findIndex(x => x.correct) },
    misconceptions: o.flatMap((x, i) => (x.misconception ? [{ id: x.misconception.id, option: i, label: x.misconception.label }] : [])), solution, key };
}

const g = (id, competency, aspects, make) => [id, { competency, aspects, make: (seed, aspect = aspects[0]) => make(rng(`${id}:${aspect}:${seed}`), seed, aspect, { gen: id, seed, aspect, competency }) }];

export const GENERATORS = Object.fromEntries([
  g('math.units', 'MATH.measurement.unit-conversions', ['procedure', 'transfer'], (r, seed, aspect, base) => {
    if (aspect === 'procedure') {
      const v = r.int(12, 95) * 10;   // mm
      return numberItem({ ...base, params: { mm: v }, prompt: `A bracket is ${fmt(v)} mm long. How long is it in metres?`, value: v / 1000, unit: 'm', minTol: 0.0005,
        misconceptions: [{ id: 'units-factor', value: v / 100, label: 'divided by 100 (cm) instead of 1,000' }, { id: 'units-direction', value: v * 1000, label: 'multiplied instead of divided' }],
        solution: ['1 m = 1,000 mm, so divide by 1,000.', `${fmt(v)} mm ÷ 1,000 = ${v / 1000} m.`] });
    }
    const M = r.int(15, 95) * 10000;   // N·mm
    return numberItem({ ...base, params: { Nmm: M }, prompt: `The solver reports a bending moment of ${fmt(M)} N·mm. What is it in N·m?`, value: M / 1000, unit: 'N·m',
      misconceptions: [{ id: 'units-factor', value: M / 1e6, label: 'divided by 1,000,000 (as for mm² → m²)' }, { id: 'units-direction', value: M * 1000, label: 'multiplied instead of divided' }],
      solution: ['N·mm → N·m: the force stays in N, the length goes from mm to m.', `${fmt(M)} N·mm ÷ 1,000 = ${fmt(M / 1000)} N·m.`] });
  }),
  g('math.area', 'MATH.measurement.rectangle-area', ['procedure', 'transfer'], (r, seed, aspect, base) => {
    const b = r.int(4, 10) * 5, h = r.int(5, 16) * 5;
    if (aspect === 'procedure') return numberItem({ ...base, prompt: `A solid bar has a rectangular cross-section ${b} mm wide and ${h} mm deep. What is its cross-sectional area?`,
      figure: { kind: 'section', params: { shape: 'rect', b, h } }, value: b * h, unit: 'mm²',
      misconceptions: [{ id: 'perimeter', value: 2 * (b + h), label: 'perimeter instead of area' }],
      solution: [`A = b × h = ${b} × ${h} = ${fmt(b * h)} mm².`] });
    const t = r.int(3, 5), bo = Math.max(b, 30), ho = Math.max(h, 40);
    const A = bo * ho - (bo - 2 * t) * (ho - 2 * t);
    return numberItem({ ...base, prompt: `A hollow rectangular tube is ${bo} mm wide, ${ho} mm deep, with a ${t} mm wall all round. What is the area of steel in its cross-section?`,
      figure: { kind: 'section', params: { shape: 'rhs', b: bo, h: ho, t } }, value: A, unit: 'mm²',
      misconceptions: [{ id: 'wall-once', value: bo * ho - (bo - t) * (ho - t), label: 'took the wall off one side only' }, { id: 'outer-only', value: bo * ho, label: 'forgot to subtract the hole' }],
      solution: [`Outer: ${bo} × ${ho} = ${fmt(bo * ho)} mm².`, `Hole: (${bo} − 2×${t}) × (${ho} − 2×${t}) = ${bo - 2 * t} × ${ho - 2 * t} = ${fmt((bo - 2 * t) * (ho - 2 * t))} mm².`, `A = ${fmt(bo * ho)} − ${fmt((bo - 2 * t) * (ho - 2 * t))} = ${fmt(A)} mm².`] });
  }),
  g('math.powers', 'MATH.number.exponents', ['procedure', 'concept'], (r, seed, aspect, base) => {
    if (aspect === 'procedure') {
      const h = r.int(4, 16) * 5;
      return numberItem({ ...base, params: { h }, prompt: `Work out h³ for h = ${h} mm.`, value: h ** 3, unit: 'mm³',
        misconceptions: [{ id: 'times-three', value: 3 * h, label: 'multiplied by 3 instead of cubing' }, { id: 'squared', value: h ** 2, label: 'squared instead of cubed' }],
        solution: [`h³ = ${h} × ${h} × ${h} = ${fmt(h ** 3)} mm³.`] });
    }
    const k = r.pick([2, 4]);
    return choiceItem({ ...base, prompt: `If h is multiplied by ${k}, h³ is multiplied by …`,
      options: [{ text: String(k ** 3), correct: true }, { text: String(k), misconception: { id: 'linear', label: 'treated h³ as if it grew like h' } },
        { text: String(3 * k), misconception: { id: 'times-three', label: 'multiplied the factor by 3' } }, { text: String(k ** 2), misconception: { id: 'squared', label: 'squared the factor' } }],
      solution: [`(${k}h)³ = ${k}³ × h³ = ${k ** 3} h³.`] });
  }),
  g('math.linear', 'MATH.algebra.linear-equations', ['procedure'], (r, seed, aspect, base) => {
    const L = r.int(4, 12) * 100, a = r.int(1, L / 100 - 1) * 100, P = r.int(10, 60) * 50;
    return numberItem({ ...base, params: { L, a, P }, prompt: `Solve for R: R × ${L} − ${fmt(P)} × ${a} = 0. (R in N)`, value: P * a / L, unit: 'N',
      misconceptions: [{ id: 'inverted', value: P * L / a, label: 'divided the wrong way' }, { id: 'sign', value: -P * a / L, label: 'sign error when moving the term across' }],
      solution: [`R × ${L} = ${fmt(P)} × ${a} = ${fmt(P * a)}.`, `R = ${fmt(P * a)} ÷ ${L} = ${fmt(P * a / L, 1)} N.`] });
  }),
  g('math.inverse', 'MATH.algebra.inverse-proportion', ['procedure'], (r, seed, aspect, base) => {
    const y1 = R(r.int(10, 60) / 100, 2), x1 = r.int(2, 6) * 10, k = r.pick([2, 3, 4]), x2 = x1 * k;
    return numberItem({ ...base, params: { y1, x1, x2 }, prompt: `The sag y of a shelf is inversely proportional to its stiffness S. With S = ${x1} units the sag is ${y1} mm. What is the sag with S = ${x2} units?`,
      value: y1 * x1 / x2, unit: 'mm', minTol: 0.002,
      misconceptions: [{ id: 'direct', value: y1 * x2 / x1, label: 'treated it as direct proportion' }],
      solution: ['Inverse proportion: y × S stays the same.', `y = ${y1} × ${x1} ÷ ${x2} = ${R(y1 * x1 / x2, 3)} mm.`] });
  }),
  g('math.pair', 'MATH.algebra.linear-systems', ['procedure'], (r, seed, aspect, base) => {
    const L = r.int(4, 10) * 100, P = r.int(10, 60) * 50;
    let a; do a = r.int(1, L / 100 - 1) * 100; while (2 * a === L);
    const y = P * a / L, x = P - y;
    return numberItem({ ...base, params: { L, a, P }, prompt: `Solve the pair: x + y = ${fmt(P)} and ${L}·y = ${fmt(P)} × ${a}. What is x (in N)?`, value: x, unit: 'N',
      misconceptions: [{ id: 'swapped', value: y, label: 'gave y instead of x' }, { id: 'half', value: P / 2, label: 'split the total equally' }],
      solution: [`From the second equation y = ${fmt(P)} × ${a} ÷ ${L} = ${fmt(y, 1)}.`, `Then x = ${fmt(P)} − ${fmt(y, 1)} = ${fmt(x, 1)} N.`] });
  }),
  g('math.trig-ratios', 'MATH.trigonometry.ratios', ['procedure'], (r, seed, aspect, base) => {
    const hyp = r.int(4, 12) * 50, th = r.pick([20, 25, 30, 35, 40, 50, 55, 60, 65, 70]);
    return numberItem({ ...base, prompt: `A right-angled triangle has hypotenuse ${hyp} mm and an angle of ${th}°. How long is the side opposite that angle?`,
      figure: { kind: 'triangle', params: { hyp, angle: th } }, value: hyp * Math.sin(deg(th)), unit: 'mm',
      misconceptions: [{ id: 'sin-cos-swap', value: hyp * Math.cos(deg(th)), label: 'used cos instead of sin' }, { id: 'no-trig', value: hyp, label: 'used the hypotenuse itself' }],
      solution: ['opposite = hypotenuse × sin θ.', `= ${hyp} × sin ${th}° = ${R(hyp * Math.sin(deg(th)), 4)} mm.`] });
  }),
  g('math.trig', 'MATH.trigonometry.functions', ['procedure', 'transfer'], (r, seed, aspect, base) => {
    const L = r.int(3, 12) * 50, th = aspect === 'transfer' ? r.pick([110, 120, 135, 150]) : r.pick([20, 30, 40, 50, 60, 70]);
    const d = L * Math.sin(deg(th));
    return numberItem({ ...base, prompt: `A straight line leaves point A at ${th}° to a rod. Point B is on the rod, ${L} mm from A. How far is B from the line, measured at right angles to it?`,
      figure: { kind: 'line-point', params: { L, angle: th } }, value: d, unit: 'mm',
      misconceptions: [{ id: 'sin-cos-swap', value: Math.abs(L * Math.cos(deg(th))), label: 'used cos instead of sin' }, { id: 'slant-distance', value: L, label: 'used the distance along the rod' }],
      solution: ['Distance from a point to a line = (distance along the rod) × sin(angle between the rod and the line).', `= ${L} × sin ${th}°${th > 90 ? ` (= sin ${180 - th}°)` : ''} = ${R(d, 4)} mm.`] });
  }),
  g('math.vectors', 'MATH.vectors.algebra', ['procedure'], (r, seed, aspect, base) => {
    const a = r.int(3, 12) * 100, b = r.int(3, 12) * 100;
    return numberItem({ ...base, prompt: `Two forces act at a point: ${fmt(a)} N to the right and ${fmt(b)} N upwards. What is the size of their resultant?`,
      figure: { kind: 'vectors', params: { fx: a, fy: b } }, value: Math.hypot(a, b), unit: 'N',
      misconceptions: [{ id: 'scalar-sum', value: a + b, label: 'added the sizes as if the forces were in line' }],
      solution: ['The forces are at right angles: R = √(Fx² + Fy²).', `= √(${a}² + ${b}²) = ${R(Math.hypot(a, b), 4)} N.`] });
  }),
  g('math.cross', 'MATH.vectors.products', ['procedure'], (r, seed, aspect, base) => {
    let rx, ry, Fx, Fy;
    do { rx = r.int(-6, 6) / 10; ry = r.int(-6, 6) / 10; Fx = r.int(-8, 8) * 50; Fy = r.int(-8, 8) * 50; } while (Math.abs(rx * Fy - ry * Fx) < 20 || Math.abs(rx * Fx + ry * Fy - (rx * Fy - ry * Fx)) < 20);
    const M = rx * Fy - ry * Fx;
    return numberItem({ ...base, prompt: `r = (${rx}, ${ry}) m from O to where the force acts, and F = (${Fx}, ${Fy}) N. Find the z-component of r × F (anticlockwise positive).`,
      figure: { kind: 'vectors', params: { rx, ry, fx: Fx, fy: Fy } }, value: M, unit: 'N·m', minTol: 0.5,
      misconceptions: [{ id: 'sign', value: -M, label: 'reversed the order (F × r), so the sign flipped' }, { id: 'dot-not-cross', value: rx * Fx + ry * Fy, label: 'worked out the dot product' }],
      solution: ['(r × F)z = rx·Fy − ry·Fx.', `= ${rx} × ${Fy} − (${ry}) × (${Fx}) = ${R(M, 4)} N·m.`] });
  }),
]);
