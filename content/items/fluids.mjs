// Item generators for Journey 2 (pipe sizing). Contract: docs/JOURNEYS.md → Items.
// Every item is deterministic in (generator, aspect, seed). Engine-keyed items take their answer from
// engines/hydraulics (or the fluid line bench built on it); formula-keyed items use a stated formula and are checked
// in tests/pipe-content.test.mjs against an independent hand calculation. figure.params holds every input an item
// uses, so a test (or the page) can recompute it.
// Answers: number tol is relative (fraction of the answer; absolute only when the answer is 0), as core/ledger.mjs reads it; dimensionless numbers use unit ''. choice `correct` and a
// misconception's `option` are indexes into `options`.
import { rng } from '../../core/rng.mjs';
import { water, G, MATERIALS, FITTINGS, friction, pipeLoss } from '../../engines/hydraulics/hydraulics.mjs';
import * as LINE from '../../circuit/model.mjs';

// Misconceptions this journey names (the ids a wrong answer can carry).
export const MISCONCEPTIONS = {
  'diameter-as-radius': 'Used the diameter as the radius in A = πr²',
  'no-lps-conversion': 'Did not convert L/s to m³/s',
  'mm-not-converted': 'Did not convert millimetres to metres',
  'laminar-in-turbulent': 'Used the laminar friction factor 64/Re in turbulent flow',
  'loss-linear-in-v': 'Took head loss as proportional to velocity instead of velocity squared',
  'ignore-static-head': 'Left out the static head (the lift)',
  'add-pump-and-system': 'Added the pump head and the system head instead of finding where the curves meet',
  'area-linear-in-d': 'Took area as proportional to diameter instead of diameter squared',
  'continuity-inverted': 'Inverted the area ratio in continuity',
  'no-square-root': 'Forgot to take the square root',
  'efficiency-inverted': 'Multiplied by the efficiency instead of dividing (or inverted the ratio)',
  'pressure-as-head': 'Read a pressure in kPa as a head in metres',
  'vapour-pressure-ignored': 'Left out the vapour pressure',
};

const BORES = [15, 20, 25, 32, 40, 50, 65, 80, 100];            // mm, common nominal bores
const sig = (x, n = 3) => { if (x === 0 || !Number.isFinite(x)) return String(x); const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return (+x.toFixed(Math.min(d, 12))).toString(); };
const num = (value, unit, rel = 0.03, abs = 0) => ({ kind: 'number', value, unit, tol: value === 0 ? abs : Math.max(rel, abs / Math.abs(value)) });   // relative, per core/ledger.mjs within()
const mis = (id, value) => ({ id, value, label: MISCONCEPTIONS[id] });
// choice: options shuffled deterministically; `tags` maps an option text to a misconception id
function choice(r, correct, wrong, tags = {}) {
  const opts = [correct, ...wrong];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { answer: { kind: 'choice', options: opts, correct: opts.indexOf(correct) },
    misconceptions: Object.entries(tags).map(([text, id]) => ({ id, option: opts.indexOf(text), label: MISCONCEPTIONS[id] })) };
}
const area = Dm => Math.PI * Dm * Dm / 4;
const MAT_KEYS = ['pvc', 'steel', 'gi', 'ci'];
const TEMPS = [15, 20, 25, 30, 40];

// A generator definition: per-aspect builders get (r, seed) and return the item body; make() adds the envelope.
function gen(id, competency, builders) {
  return { competency, aspects: Object.keys(builders), make(seed, aspect) {
    const b = builders[aspect]; if (!b) throw new Error(`${id}: no aspect ${aspect}`);
    const body = b(rng(`${id}:${aspect}:${seed}`));
    // a wrong answer too close to the right one cannot name a misconception: drop such tags (e.g. V = 1 m/s, where V = V²)
    if (body.answer.kind === 'number' && body.misconceptions) body.misconceptions = body.misconceptions.filter(m => Math.abs(m.value - body.answer.value) > 1.5 * body.answer.tol * (body.answer.value === 0 ? 1 : Math.abs(body.answer.value)));
    return { id: `${id}:${aspect}:${seed}`, competency, aspect, misconceptions: [], ...body };
  } };
}

// Fluid line bench: an evaluated line for engine-keyed bench items (the same adapter the journey uses).
function benchLine(r) {
  const s = LINE.fromPreset('farm');
  const D = r.pick([0.025, 0.032, 0.04]), L = r.pick([40, 60, 80, 100, 120]);
  LINE.setParam(s, 'p6', 'D', D); LINE.setParam(s, 'p6', 'L', L); LINE.setParam(s, 'p9', 'D', D);
  const e = LINE.evaluate(s);
  return { s, e, D, L };
}

export const GENERATORS = {
  // ================= school maths, in pipe-sizing dress =================
  'fluids.math.units': gen('fluids.math.units', 'MATH.measurement.unit-conversions', {
    concept: r => {
      const c = choice(r, '0.001 m³/s', ['1 m³/s', '1000 m³/s', '0.01 m³/s'], { '1 m³/s': 'no-lps-conversion' });
      return { prompt: 'A pump delivers 1 L/s. How much is that in m³/s?', ...c, figure: { kind: 'none', params: {} },
        solution: ['1 m³ = 1000 L.', 'So 1 L/s = 1/1000 m³/s = 0.001 m³/s.'], key: 'formula' };
    },
    procedure: r => {
      const Q = r.int(5, 60) / 10;
      return { prompt: `Convert a flow of ${Q} L/s to m³/s.`, answer: num(Q / 1000, 'm³/s', 0.01), figure: { kind: 'none', params: { Q } },
        misconceptions: [mis('no-lps-conversion', Q)], solution: ['1 m³ = 1000 L, so divide litres by 1000.', `${Q} L/s ÷ 1000 = ${sig(Q / 1000)} m³/s.`], key: 'formula' };
    },
    transfer: r => {
      const D = r.pick(BORES), Q = r.int(10, 40) / 10;
      return { prompt: `A ${D} mm bore pipe carries ${Q} L/s. Write the bore in metres and the flow in m³/s, then give the flow per unit bore Q/D in m²/s.`,
        answer: num(Q / 1000 / (D / 1000), 'm²/s', 0.02), figure: { kind: 'pipe-section', params: { D_mm: D, Q_Lps: Q } },
        misconceptions: [mis('no-lps-conversion', Q / (D / 1000)), mis('mm-not-converted', Q / 1000 / D)],
        solution: [`D = ${D} mm = ${sig(D / 1000, 6)} m.`, `Q = ${Q} L/s = ${sig(Q / 1000, 6)} m³/s.`, `Q/D = ${sig(Q / 1000, 6)} ÷ ${sig(D / 1000, 6)} = ${sig(Q / D)} m²/s.`], key: 'formula' };
    },
  }),
  'fluids.math.circle-area': gen('fluids.math.circle-area', 'MATH.measurement.circle-area', {
    concept: r => {
      const c = choice(r, '4 times', ['2 times', '8 times', 'the same'], { '2 times': 'area-linear-in-d' });
      return { prompt: 'A pipe bore is doubled. Its cross-sectional area becomes…', ...c, figure: { kind: 'two-sections', params: { ratio: 2 } },
        solution: ['A = πD²/4: area goes with the square of the diameter.', '2² = 4, so the area is 4 times larger.'], key: 'formula' };
    },
    procedure: r => {
      const D = r.pick(BORES), A = area(D / 1000);
      return { prompt: `Find the flow area of a pipe with a ${D} mm bore, in m².`, answer: num(A, 'm²', 0.02), figure: { kind: 'pipe-section', params: { D_mm: D } },
        misconceptions: [mis('diameter-as-radius', Math.PI * (D / 1000) ** 2), mis('mm-not-converted', area(D))],
        solution: [`D = ${D} mm = ${sig(D / 1000, 6)} m.`, 'A = πD²/4 (D is the diameter; the radius is D/2).', `A = π × ${sig(D / 1000, 6)}² / 4 = ${sig(A)} m².`], key: 'formula' };
    },
    transfer: r => {
      const big = r.pick([50, 63, 80, 100]), small = r.pick([20, 25, 32].filter(x => x < big / 1.5)), n = (big / small) ** 2;
      return { prompt: `How many ${small} mm pipes together have the same flow area as one ${big} mm pipe? (A decimal answer is fine.)`,
        answer: num(n, 'pipes', 0.02), figure: { kind: 'two-sections', params: { D1_mm: big, D2_mm: small } },
        misconceptions: [mis('area-linear-in-d', big / small)],
        solution: ['Area goes with D², so the count is (D_big / D_small)².', `(${big} / ${small})² = ${sig(n)}.`], key: 'formula' };
    },
  }),
  'fluids.math.squares': gen('fluids.math.squares', 'MATH.number.square-roots', {
    concept: r => {
      const k = r.pick([2, 3]);
      const c = choice(r, `${k * k} times`, [`${k} times`, `${k ** 3} times`, 'the same'], { [`${k} times`]: 'loss-linear-in-v' });
      return { prompt: `The velocity in a pipe becomes ${k} times larger. The velocity head V²/2g becomes…`, ...c, figure: { kind: 'none', params: { k } },
        solution: ['Velocity head goes with V².', `${k}² = ${k * k}.`], key: 'formula' };
    },
    procedure: r => {
      const V = r.pick([0.5, 0.6, 0.8, 1.5, 1.8, 2, 2.5, 3, 3.5]), h = V * V / (2 * G);
      return { prompt: `Water flows at ${V} m/s. Find the velocity head V²/2g (g = ${G} m/s²).`, answer: num(h, 'm', 0.02), figure: { kind: 'none', params: { V } },
        misconceptions: [mis('loss-linear-in-v', V / (2 * G))], solution: [`V² = ${sig(V * V, 4)} m²/s².`, `V²/2g = ${sig(V * V, 4)} / ${2 * G} = ${sig(h)} m.`], key: 'formula' };
    },
    transfer: r => {
      const h = r.int(5, 60) / 100, V = Math.sqrt(2 * G * h);
      return { prompt: `A pitot tube shows a velocity head of ${h} m of water. What is the velocity? (g = ${G} m/s²)`, answer: num(V, 'm/s', 0.02), figure: { kind: 'none', params: { h } },
        misconceptions: [mis('no-square-root', 2 * G * h)], solution: ['h = V²/2g, so V = √(2gh).', `V = √(2 × ${G} × ${h}) = ${sig(V)} m/s.`], key: 'formula' };
    },
  }),
  'fluids.math.ratio': gen('fluids.math.ratio', 'MATH.number.ratio', {
    concept: r => {
      const a = r.pick([20, 40, 60]), b = a / 2;
      const c = choice(r, '2 : 1', ['1 : 2', '4 : 1', '20 : 1'], { '4 : 1': 'area-linear-in-d' });
      return { prompt: `Simplify the ratio of bores ${a} mm : ${b} mm.`, ...c, figure: { kind: 'none', params: { a, b } },
        solution: [`Divide both by ${b}: ${a / b} : 1.`], key: 'formula' };
    },
    procedure: r => {
      const D1 = r.pick([40, 50, 63]), D2 = r.pick([20, 25, 32]), q = (D1 / D2) ** 2;
      return { prompt: `A ${D1} mm pipe narrows to ${D2} mm. Find the area ratio A₁ : A₂ as a single number.`, answer: num(q, '', 0.02), figure: { kind: 'two-sections', params: { D1_mm: D1, D2_mm: D2 } },
        misconceptions: [mis('area-linear-in-d', D1 / D2), mis('continuity-inverted', 1 / q)],
        solution: ['A = πD²/4, so A₁/A₂ = (D₁/D₂)².', `(${D1}/${D2})² = ${sig(q)}.`], key: 'formula' };
    },
    transfer: r => {
      const eps = r.pick([0.045, 0.15, 0.26]), D = r.pick([25, 32, 40, 50]), rr = eps / D;
      return { prompt: `A pipe wall has bumps ${eps} mm high in a ${D} mm bore. Express the bump height as a fraction of the bore.`, answer: num(rr, '', 0.02),
        figure: { kind: 'none', params: { eps_mm: eps, D_mm: D } }, misconceptions: [mis('mm-not-converted', eps / (D / 1000))],
        solution: ['Same units top and bottom: both in mm.', `${eps} / ${D} = ${sig(rr)}.`], key: 'formula' };
    },
  }),
  'fluids.math.proportion': gen('fluids.math.proportion', 'MATH.number.proportion', {
    concept: r => {
      const c = choice(r, 'It doubles', ['It stays the same', 'It is four times larger', 'It halves'], { 'It is four times larger': 'loss-linear-in-v' });
      return { prompt: 'At the same flow, friction loss is proportional to pipe length. The pipe length is doubled. The friction loss…', ...c, figure: { kind: 'none', params: {} },
        solution: ['h_f ∝ L at a fixed flow and bore.', 'Twice the length, twice the loss.'], key: 'formula' };
    },
    procedure: r => {
      const L1 = r.pick([20, 30, 40, 50]), h1 = r.int(10, 60) / 10, L2 = r.pick([60, 80, 100, 150]), h2 = h1 * L2 / L1;
      return { prompt: `A pipe loses ${h1} m of head over ${L1} m at a certain flow. At the same flow and bore, how much over ${L2} m?`, answer: num(h2, 'm', 0.02),
        figure: { kind: 'none', params: { L1, h1, L2 } }, misconceptions: [],
        solution: ['Loss ∝ length: h₂ = h₁ × L₂/L₁.', `${h1} × ${L2}/${L1} = ${sig(h2)} m.`], key: 'formula' };
    },
    transfer: r => {
      const Q1 = r.pick([1, 1.5, 2]), h1 = r.int(20, 80) / 10, Q2 = Q1 * r.pick([1.5, 2, 2.5]), h2 = h1 * (Q2 / Q1) ** 2;
      return { prompt: `The losses in a line are ${h1} m at ${Q1} L/s. Losses grow with Q². What are they at ${Q2} L/s?`, answer: num(h2, 'm', 0.02),
        figure: { kind: 'none', params: { Q1, h1, Q2 } }, misconceptions: [mis('loss-linear-in-v', h1 * Q2 / Q1)],
        solution: ['h ∝ Q²: h₂ = h₁ × (Q₂/Q₁)².', `${h1} × (${Q2}/${Q1})² = ${sig(h2)} m.`], key: 'formula' };
    },
  }),
  'fluids.math.sci': gen('fluids.math.sci', 'MATH.number.scientific-notation', {
    concept: r => {
      const c = choice(r, '0.000001', ['1 000 000', '0.00001', '-6'], {});
      return { prompt: 'Water at 20 °C has a kinematic viscosity of about 1 × 10⁻⁶ m²/s. Which decimal is 1 × 10⁻⁶?', ...c, figure: { kind: 'none', params: {} },
        solution: ['10⁻⁶ means divide by 10 six times.', '1 × 10⁻⁶ = 0.000001.'], key: 'formula' };
    },
    procedure: r => {
      const V = r.int(5, 30) / 10, D = r.pick([0.025, 0.032, 0.04, 0.05]), m = r.pick([0.8, 1.0, 1.1]), nu = m * 1e-6, x = V * D / nu;
      return { prompt: `Work out ${V} × ${D} ÷ (${m} × 10⁻⁶).`, answer: num(x, '', 0.02), figure: { kind: 'none', params: { V, D, nu } },
        misconceptions: [], solution: [`${V} × ${D} = ${sig(V * D)}.`, `Dividing by ${m} × 10⁻⁶ multiplies by 10⁶/${m}.`, `= ${sig(x)} ≈ ${(x).toExponential(2)}.`], key: 'formula' };
    },
    transfer: r => {
      const m = r.pick([1.2, 1.5, 1.8, 2.5, 3.2, 3.6, 4.5, 6.4]), e = r.pick([3, 4]), x = m * 10 ** e;
      const c = choice(r, x < 2000 ? 'Below 2000' : x > 4000 ? 'Above 4000' : 'Between 2000 and 4000', ['Below 2000', 'Between 2000 and 4000', 'Above 4000'].filter(t => t !== (x < 2000 ? 'Below 2000' : x > 4000 ? 'Above 4000' : 'Between 2000 and 4000')), {});
      return { prompt: `Where does ${m} × 10^${e} lie?`, ...c, figure: { kind: 'none', params: { m, e } }, solution: [`${m} × 10^${e} = ${x}.`], key: 'formula' };
    },
  }),
  'fluids.math.intersect': gen('fluids.math.intersect', 'MATH.algebra.quadratics', {
    concept: r => {
      const c = choice(r, 'The x and y where both equations hold at once', ['The sum of the two y values', 'Where one curve crosses the y-axis', 'Where both curves are steepest'], { 'The sum of the two y values': 'add-pump-and-system' });
      return { prompt: 'Two curves are drawn on one graph. What does the point where they meet give you?', ...c, figure: { kind: 'none', params: {} },
        solution: ['At the meeting point the two curves share one x and one y.', 'Set the two expressions equal and solve for x.'], key: 'formula' };
    },
    procedure: r => {
      const H0 = r.int(24, 40), a = r.pick([1, 1.5, 2]), Hs = r.int(6, 16), k = r.pick([1, 2, 3]), x = Math.sqrt((H0 - Hs) / (a + k));
      return { prompt: `Solve ${H0} − ${a}x² = ${Hs} + ${k}x² for x > 0.`, answer: num(x, '', 0.02), figure: { kind: 'curves', params: { H0, a, Hs, k } },
        misconceptions: [mis('ignore-static-head', Math.sqrt(H0 / (a + k))), mis('no-square-root', (H0 - Hs) / (a + k))],
        solution: [`Collect x² terms: ${H0} − ${Hs} = (${a} + ${k})x².`, `x² = ${H0 - Hs}/${a + k} = ${sig((H0 - Hs) / (a + k))}.`, `x = ${sig(x)}.`], key: 'formula' };
    },
    transfer: r => {
      const H0 = r.int(24, 40), a = r.pick([1, 1.5, 2]), Hs = r.int(6, 16), k = r.pick([1, 2, 3]), x = Math.sqrt((H0 - Hs) / (a + k)), y = H0 - a * x * x;
      return { prompt: `y = ${H0} − ${a}x² and y = ${Hs} + ${k}x². Find y where they meet (x > 0).`, answer: num(y, '', 0.02), figure: { kind: 'curves', params: { H0, a, Hs, k } },
        misconceptions: [mis('add-pump-and-system', 2 * y)],
        solution: [`x² = (${H0} − ${Hs})/(${a} + ${k}) = ${sig(x * x)}.`, `y = ${H0} − ${a} × ${sig(x * x)} = ${sig(y)}.`], key: 'formula' };
    },
  }),

  // ================= fluid mechanics =================
  'fluids.flow-rate': gen('fluids.flow-rate', 'ENG.fluids.flow-rate', {
    concept: r => {
      const c = choice(r, '4 times faster', ['2 times faster', 'the same', 'half as fast'], { '2 times faster': 'area-linear-in-d' });
      return { prompt: 'The same flow passes from a pipe into one with half the bore. In the smaller pipe the water moves…', ...c, figure: { kind: 'two-sections', params: { ratio: 2 } },
        solution: ['Q = A·V is the same in both.', 'Half the bore is a quarter of the area, so V is 4 times larger.'], key: 'formula' };
    },
    procedure: r => {
      const D = r.pick([25, 32, 40, 50, 65]), Q = r.int(8, 50) / 10, V = Q / 1000 / area(D / 1000);
      return { prompt: `${Q} L/s flows in a ${D} mm bore pipe. Find the mean velocity.`, answer: num(V, 'm/s', 0.03), figure: { kind: 'pipe-section', params: { D_mm: D, Q_Lps: Q } },
        misconceptions: [mis('diameter-as-radius', Q / 1000 / (Math.PI * (D / 1000) ** 2)), mis('no-lps-conversion', Q / area(D / 1000))],
        solution: [`Q = ${Q} L/s = ${sig(Q / 1000, 6)} m³/s; D = ${sig(D / 1000, 6)} m.`, `A = πD²/4 = ${sig(area(D / 1000))} m².`, `V = Q/A = ${sig(V)} m/s.`], key: 'formula' };
    },
    transfer: r => {
      const D = r.pick([25, 32, 40]), V = r.int(8, 20) / 10, vol = r.pick([1000, 2000, 5000]), t = vol / 1000 / (area(D / 1000) * V) / 60;
      return { prompt: `Water arrives at a ${vol} L tank through a ${D} mm pipe at ${V} m/s. How many minutes to fill it?`, answer: num(t, 'min', 0.03),
        figure: { kind: 'tank-fill', params: { D_mm: D, V, vol_L: vol } }, misconceptions: [mis('diameter-as-radius', t / 4)],
        solution: [`Q = A·V = ${sig(area(D / 1000))} × ${V} = ${sig(area(D / 1000) * V)} m³/s.`, `Volume = ${sig(vol / 1000, 6)} m³.`, `t = ${sig(vol / 1000, 6)} / ${sig(area(D / 1000) * V)} s = ${sig(t)} min.`], key: 'formula' };
    },
  }),
  'fluids.continuity': gen('fluids.continuity', 'ENG.fluids.continuity', {
    concept: r => {
      const c = choice(r, 'The same in both', ['Larger in the narrow pipe', 'Smaller in the narrow pipe', 'Zero in the narrow pipe'], {});
      return { prompt: 'Water flows steadily from a wide pipe into a narrow one. The volume flow rate (L/s) is…', ...c, figure: { kind: 'two-sections', params: { ratio: 2 } },
        solution: ['Water is incompressible and nothing leaks: what goes in comes out.', 'Q₁ = Q₂; only the velocity changes.'], key: 'formula' };
    },
    procedure: r => {
      const D1 = r.pick([50, 65, 80]), D2 = r.pick([25, 32, 40]), V1 = r.int(5, 15) / 10, V2 = V1 * (D1 / D2) ** 2;
      return { prompt: `Water at ${V1} m/s in a ${D1} mm pipe passes into a ${D2} mm pipe. Find the velocity in the smaller pipe.`, answer: num(V2, 'm/s', 0.03),
        figure: { kind: 'two-sections', params: { D1_mm: D1, D2_mm: D2, V1 } },
        misconceptions: [mis('area-linear-in-d', V1 * D1 / D2), mis('continuity-inverted', V1 * (D2 / D1) ** 2)],
        solution: ['A₁V₁ = A₂V₂, so V₂ = V₁ (D₁/D₂)².', `V₂ = ${V1} × (${D1}/${D2})² = ${sig(V2)} m/s.`], key: 'formula' };
    },
    transfer: r => {
      const D1 = r.pick([50, 65]), V1 = r.int(6, 14) / 10, Q = area(D1 / 1000) * V1 * 1000;
      return { prompt: `A pump's ${D1} mm suction pipe runs at ${V1} m/s. Its delivery pipe is narrower. What flow (L/s) arrives at the tank?`, answer: num(Q, 'L/s', 0.03),
        figure: { kind: 'two-sections', params: { D1_mm: D1, V1 } }, misconceptions: [mis('no-lps-conversion', Q / 1000), mis('diameter-as-radius', Q * 4)],
        solution: ['Continuity: the same flow passes everywhere in a series line.', `Q = πD²/4 × V = ${sig(area(D1 / 1000))} × ${V1} = ${sig(Q / 1000)} m³/s = ${sig(Q)} L/s.`], key: 'formula' };
    },
  }),
  'fluids.energy': gen('fluids.energy', 'ENG.fluids.energy-equation', {
    concept: r => {
      const c = choice(r, 'Friction turns some of the water\'s energy into heat', ['The water speeds up along the pipe', 'The pipe is slightly uphill', 'Water is compressed'], {});
      return { prompt: 'In a level pipe of constant bore, the pressure falls steadily along the flow. Why?', ...c, figure: { kind: 'none', params: {} },
        solution: ['Same bore: same velocity (continuity). Level: same elevation.', 'So the pressure head drop is the energy lost to friction: h_L.'], key: 'formula' };
    },
    procedure: r => {
      const p1 = r.int(150, 300), z1 = 0, z2 = r.int(3, 10), hL = r.int(10, 40) / 10, rho = 1000, p2 = p1 + rho * G * (z1 - z2 - hL) / 1000;
      return { prompt: `Point 1: ${p1} kPa (gauge) at 0 m. Point 2 is ${z2} m higher in the same bore. The loss between them is ${hL} m. Find the pressure at point 2 (ρ = 1000 kg/m³, g = ${G}).`,
        answer: num(p2, 'kPa', 0.02, 1), figure: { kind: 'two-points', params: { p1, z1, z2, hL } },
        misconceptions: [mis('ignore-static-head', p1 - rho * G * hL / 1000)],
        solution: ['p₁/ρg + z₁ = p₂/ρg + z₂ + h_L (same bore: velocity heads cancel).', `p₂ = p₁ − ρg(z₂ − z₁ + h_L) = ${p1} − ${sig(rho * G / 1000)} × ${z2 + hL} = ${sig(p2)} kPa.`], key: 'formula' };
    },
    // the pipe-friction lab reading on the fluid line bench: two gauges across a level main
    transfer: r => {
      const { s, e, D, L } = benchLine(r), dp = +(e.outputs['gauge:p5'].value - e.outputs['gauge:p6'].value).toFixed(1);
      const rho = e.sol.water.rho, hf = -e.sol.steps.find(st => st.index === 5 && st.kind === 'friction').dH;
      return { prompt: `On the fluid line bench, gauges at both ends of a level ${D * 1000} mm × ${L} m main read a drop of ${dp} kPa (water at ${s.temp} °C, ρ = ${sig(rho, 4)} kg/m³, g = ${G} m/s²). What head is lost to friction in the main?`,
        answer: num(hf, 'm', 0.03), figure: { kind: 'bench-gauges', params: { D, L, temp: s.temp, dp_kPa: dp, setup: s } },
        misconceptions: [mis('pressure-as-head', dp)],
        solution: ['Level pipe, same bore: the gauge drop is all friction.', `h_f = Δp/ρg = ${dp * 1000} / (${sig(rho, 4)} × ${G}) = ${sig(hf)} m.`], key: 'engine' };
    },
  }),
  'fluids.reynolds': gen('fluids.reynolds', 'ENG.fluids.reynolds', {
    concept: r => {
      const D = r.pick([15, 20, 25]), Q = r.pick([0.005, 0.01, 0.02, 0.05, 0.5, 1]), T = r.pick(TEMPS), w = water(T);
      const res = pipeLoss(Q / 1000, { D: D / 1000, L: 1, material: 'pvc', K: 0 }, w), regime = res.regime;
      const names = { laminar: 'Laminar', transitional: 'Transitional (uncertain)', turbulent: 'Turbulent' };
      const c = choice(r, names[regime], Object.values(names).filter(n => n !== names[regime]), {});
      return { prompt: `Water at ${T} °C (ν = ${sig(w.nu, 3)} m²/s) flows at ${Q} L/s in a ${D} mm bore. Which regime?`, ...c,
        figure: { kind: 'pipe-section', params: { D_mm: D, Q_Lps: Q, T } }, solution: [`V = Q/A = ${sig(res.V)} m/s.`, `Re = VD/ν = ${sig(res.Re)}.`, 'Below 2000 laminar; above 4000 turbulent; between, transitional.'], key: 'engine' };
    },
    procedure: r => {
      const D = r.pick([25, 32, 40, 50]), Q = r.int(5, 40) / 10, T = r.pick(TEMPS), w = water(T);
      const res = pipeLoss(Q / 1000, { D: D / 1000, L: 1, material: 'pvc', K: 0 }, w);
      return { prompt: `Find the Reynolds number for ${Q} L/s of water at ${T} °C (ν = ${sig(w.nu, 3)} m²/s) in a ${D} mm bore.`, answer: num(res.Re, '', 0.03),
        figure: { kind: 'pipe-section', params: { D_mm: D, Q_Lps: Q, T } }, misconceptions: [mis('diameter-as-radius', res.Re / 4), mis('no-lps-conversion', res.Re * 1000)],
        solution: [`V = Q/A = ${sig(Q / 1000, 6)} / ${sig(area(D / 1000))} = ${sig(res.V)} m/s.`, `Re = VD/ν = ${sig(res.V)} × ${sig(D / 1000, 6)} / ${sig(w.nu, 3)} = ${sig(res.Re)}.`], key: 'engine' };
    },
    transfer: r => {
      const D = r.pick([4, 6, 8, 10]), T = r.pick(TEMPS), w = water(T), V = 2000 * w.nu / (D / 1000);
      return { prompt: `A ${D} mm capillary in a lab carries water at ${T} °C (ν = ${sig(w.nu, 3)} m²/s). Above what velocity does the flow stop being laminar (Re = 2000)?`,
        answer: num(V, 'm/s', 0.03), figure: { kind: 'pipe-section', params: { D_mm: D, T, Re: 2000 } }, misconceptions: [mis('mm-not-converted', 2000 * w.nu / D)],
        solution: ['Re = VD/ν = 2000, so V = 2000 ν / D.', `V = 2000 × ${sig(w.nu, 3)} / ${sig(D / 1000, 6)} = ${sig(V)} m/s.`], key: 'engine' };
    },
  }),
  'fluids.roughness': gen('fluids.roughness', 'ENG.fluids.relative-roughness', {
    concept: r => {
      const m = r.pick(MAT_KEYS);
      const c = choice(r, 'It rises', ['It falls', 'It stays the same', 'It depends only on the flow'], {});
      return { prompt: `A ${MATERIALS[m].name} pipe is replaced by a smaller bore of the same material. Its relative roughness ε/D…`, ...c,
        figure: { kind: 'none', params: { material: m } }, solution: ['ε is set by the material; D is smaller.', 'So ε/D is larger: a small pipe is relatively rougher.'], key: 'formula' };
    },
    procedure: r => {
      const m = r.pick(MAT_KEYS), D = r.pick(BORES), eps = MATERIALS[m].eps, rr = eps / (D / 1000);
      return { prompt: `${MATERIALS[m].name} has a roughness ε = ${sig(eps * 1000, 3)} mm. Find ε/D for a ${D} mm bore.`, answer: num(rr, '', 0.02),
        figure: { kind: 'pipe-section', params: { D_mm: D, material: m } }, misconceptions: [mis('mm-not-converted', eps / D)],
        solution: ['Use the same unit for ε and D.', `ε/D = ${sig(eps * 1000, 3)} mm / ${D} mm = ${sig(rr)}.`], key: 'engine' };
    },
    transfer: r => {
      const D1 = r.pick([20, 25, 32]), D2 = r.pick([80, 100]);
      const a = MATERIALS.gi.eps / (D1 / 1000), b = MATERIALS.oldgi.eps / (D2 / 1000);
      const A = `New GI, ${D1} mm`, B = `Rusted GI, ${D2} mm`, right = a > b ? A : B;
      const c = choice(r, right, [right === A ? B : A, 'They are equal'], {});
      return { prompt: `Which pipe is relatively rougher? New galvanised iron (ε = ${MATERIALS.gi.eps * 1000} mm) at ${D1} mm bore, or rusted galvanised iron (ε = ${MATERIALS.oldgi.eps * 1000} mm) at ${D2} mm bore?`, ...c,
        figure: { kind: 'none', params: { D1_mm: D1, D2_mm: D2 } }, solution: [`New: ε/D = ${sig(a)}.`, `Rusted: ε/D = ${sig(b)}.`, `${right} has the larger ε/D.`], key: 'engine' };
    },
  }),
  'fluids.friction-factor': gen('fluids.friction-factor', 'ENG.fluids.friction-factor', {
    concept: r => {
      const lam = r.next() < 0.5, Re = lam ? r.int(300, 1800) : r.int(10, 200) * 1000;
      const A = '64/Re', B = 'Colebrook–White (or the Moody chart) with Re and ε/D', right = friction(Re, 1e-4).regime === 'laminar' ? A : B;
      const c = choice(r, right, [right === A ? B : A, 'f = 0.02 always', 'f = Re/64'], lam ? {} : { [A]: 'laminar-in-turbulent' });
      return { prompt: `Flow in a pipe has Re = ${Re}. How do you find the Darcy friction factor?`, ...c, figure: { kind: 'moody', params: { Re } },
        solution: ['Laminar (Re < 2000): f = 64/Re, independent of roughness.', 'Turbulent (Re > 4000): Colebrook–White (the Moody chart), which depends on Re and ε/D.'], key: 'engine' };
    },
    procedure: r => {
      const Re = r.int(10, 300) * 1000, m = r.pick(MAT_KEYS), D = r.pick([25, 32, 40, 50, 65]), rr = MATERIALS[m].eps / (D / 1000), f = friction(Re, rr).f;
      return { prompt: `Turbulent flow: Re = ${Re}, ε/D = ${sig(rr, 3)}. Find the Darcy friction factor (Colebrook–White or the Moody chart).`, answer: num(f, '', 0.05),
        figure: { kind: 'moody', params: { Re, rr, material: m, D_mm: D } }, misconceptions: [mis('laminar-in-turbulent', 64 / Re)],
        solution: ['Re > 4000: turbulent, so use Colebrook–White: 1/√f = −2 log₁₀(ε/3.7D + 2.51/(Re√f)).', 'Start from Swamee–Jain and iterate (or read the Moody chart).', `f = ${sig(f)}.`], key: 'engine' };
    },
    transfer: r => {
      const D = r.pick([25, 32, 40, 50]), Q = r.int(10, 40) / 10, m = r.pick(MAT_KEYS), T = r.pick(TEMPS), w = water(T);
      const res = pipeLoss(Q / 1000, { D: D / 1000, L: 1, material: m, K: 0 }, w);
      return { prompt: `${Q} L/s of water at ${T} °C (ν = ${sig(w.nu, 3)} m²/s) in a ${D} mm ${MATERIALS[m].name} pipe (ε = ${sig(MATERIALS[m].eps * 1000, 3)} mm). Find the friction factor.`,
        answer: num(res.f, '', 0.05), figure: { kind: 'pipe-run', params: { D_mm: D, Q_Lps: Q, material: m, T } }, misconceptions: [mis('laminar-in-turbulent', 64 / res.Re)],
        solution: [`V = ${sig(res.V)} m/s; Re = ${sig(res.Re)} (turbulent).`, `ε/D = ${sig(MATERIALS[m].eps / (D / 1000))}.`, `Colebrook–White: f = ${sig(res.f)}.`], key: 'engine' };
    },
  }),
  'fluids.head-loss': gen('fluids.head-loss', 'ENG.fluids.darcy-weisbach', {
    concept: r => {
      const byFlow = r.next() < 0.5;
      const c = byFlow ? choice(r, 'About 4 times larger', ['About 2 times larger', 'About 8 times larger', 'Unchanged'], { 'About 2 times larger': 'loss-linear-in-v' })
        : choice(r, 'Twice as large', ['Four times as large', 'Unchanged', 'Half as large'], {});
      return { prompt: byFlow ? 'In turbulent flow (f roughly constant), the flow through a pipe doubles. The friction head loss becomes…' : 'At the same flow and bore, the pipe is made twice as long. The friction head loss becomes…', ...c,
        figure: { kind: 'none', params: { byFlow } }, solution: ['h_f = f (L/D) V²/2g.', byFlow ? 'Twice the flow is twice V, so V² is 4 times larger.' : 'h_f is proportional to L.'], key: 'formula' };
    },
    procedure: r => {
      const D = r.pick([25, 32, 40, 50]), L = r.pick([20, 40, 60, 80, 100]), Q = r.int(10, 40) / 10, m = r.pick(MAT_KEYS), w = water(20);
      const res = pipeLoss(Q / 1000, { D: D / 1000, L, material: m, K: 0 }, w), f = +res.f.toFixed(4), V = +res.V.toFixed(3);
      return { prompt: `A ${D} mm pipe ${L} m long carries water at V = ${V} m/s with f = ${f}. Find the friction head loss (g = ${G}).`, answer: num(res.hf, 'm', 0.03),
        figure: { kind: 'pipe-run', params: { D_mm: D, L, Q_Lps: Q, material: m, T: 20 } },
        misconceptions: [mis('loss-linear-in-v', f * L / (D / 1000) * V / (2 * G)), mis('mm-not-converted', res.hf / 1000)],
        solution: ['h_f = f (L/D) V²/2g.', `L/D = ${L} / ${sig(D / 1000, 6)} = ${sig(L / (D / 1000))}; V²/2g = ${sig(V * V / (2 * G))} m.`, `h_f = ${f} × ${sig(L / (D / 1000))} × ${sig(V * V / (2 * G))} = ${sig(res.hf)} m.`], key: 'engine' };
    },
    transfer: r => {
      const D = r.pick([25, 32, 40, 50]), L = r.pick([30, 50, 80, 120]), Q = r.int(10, 40) / 10, m = r.pick(MAT_KEYS), T = r.pick(TEMPS), w = water(T);
      const res = pipeLoss(Q / 1000, { D: D / 1000, L, material: m, K: 0 }, w), lam = 64 / res.Re * L / (D / 1000) * res.vh;
      return { prompt: `A farm main: ${L} m of ${D} mm ${MATERIALS[m].name} (ε = ${sig(MATERIALS[m].eps * 1000, 3)} mm) carrying ${Q} L/s of water at ${T} °C (ν = ${sig(w.nu, 3)} m²/s). Find the friction head loss (g = ${G} m/s²).`,
        answer: num(res.hf, 'm', 0.06), figure: { kind: 'pipe-run', params: { D_mm: D, L, Q_Lps: Q, material: m, T } },
        misconceptions: [mis('laminar-in-turbulent', lam), mis('loss-linear-in-v', res.f * L / (D / 1000) * res.V / (2 * G))],
        solution: [`V = Q/A = ${sig(res.V)} m/s; Re = ${sig(res.Re)} (turbulent).`, `ε/D = ${sig(MATERIALS[m].eps / (D / 1000))}; Colebrook–White f = ${sig(res.f)}.`, `h_f = f (L/D) V²/2g = ${sig(res.f)} × ${sig(L / (D / 1000))} × ${sig(res.vh)} = ${sig(res.hf)} m.`], key: 'engine' };
    },
  }),
  'fluids.minor-loss': gen('fluids.minor-loss', 'ENG.fluids.minor-losses', {
    concept: r => {
      const c = choice(r, 'The velocity head at its bore (h = K·V²/2g)', ['The length of the fitting', 'The height of the tank', 'The pump speed only'], {});
      return { prompt: 'A fitting\'s head loss is a multiple K of…', ...c, figure: { kind: 'none', params: {} },
        solution: ['Fittings disturb the flow; the loss scales with the kinetic energy per unit weight, V²/2g.', 'h_m = K · V²/2g.'], key: 'formula' };
    },
    procedure: r => {
      const n = r.int(2, 6), V = r.int(10, 30) / 10, K = n * FITTINGS.elbow + FITTINGS.checkValve, h = K * V * V / (2 * G);
      return { prompt: `A delivery line has ${n} elbows (K = ${FITTINGS.elbow} each) and one non-return valve (K = ${FITTINGS.checkValve}). The water moves at ${V} m/s. Find their total head loss (g = ${G} m/s²).`,
        answer: num(h, 'm', 0.03), figure: { kind: 'fittings', params: { elbows: n, checkValve: 1, V } },
        misconceptions: [mis('loss-linear-in-v', K * V / (2 * G))],
        solution: [`ΣK = ${n} × ${FITTINGS.elbow} + ${FITTINGS.checkValve} = ${sig(K)}.`, `V²/2g = ${sig(V * V / (2 * G))} m.`, `h_m = ${sig(K)} × ${sig(V * V / (2 * G))} = ${sig(h)} m.`], key: 'engine' };
    },
    transfer: r => {
      const D = r.pick([25, 32, 40]), Q = r.int(10, 30) / 10, n = r.int(2, 5), V = Q / 1000 / area(D / 1000), K = n * FITTINGS.elbow + FITTINGS.footValve, h = K * V * V / (2 * G);
      return { prompt: `A suction line of ${D} mm bore carries ${Q} L/s through a foot valve with strainer (K = ${FITTINGS.footValve}) and ${n} elbows (K = ${FITTINGS.elbow}). Find the fitting losses (g = ${G} m/s²).`,
        answer: num(h, 'm', 0.03), figure: { kind: 'fittings', params: { D_mm: D, Q_Lps: Q, elbows: n, footValve: 1 } },
        misconceptions: [mis('diameter-as-radius', h / 16)],
        solution: [`V = Q/A = ${sig(V)} m/s; V²/2g = ${sig(V * V / (2 * G))} m.`, `ΣK = ${FITTINGS.footValve} + ${n} × ${FITTINGS.elbow} = ${sig(K)}.`, `h_m = ${sig(h)} m.`], key: 'engine' };
    },
  }),
  'fluids.system-curve': gen('fluids.system-curve', 'ENG.fluids.system-curve', {
    concept: r => {
      const c = choice(r, 'The static lift (tank level minus sump level)', ['Zero', 'The pump\'s shut-off head', 'The friction loss at full flow'], { 'Zero': 'ignore-static-head' });
      return { prompt: 'A pump lifts water into an open tank. At zero flow, the system curve starts at…', ...c, figure: { kind: 'curves', params: {} },
        solution: ['System head = static lift + losses; losses are zero at zero flow.', 'So the curve starts at the static lift and rises with Q².'], key: 'formula' };
    },
    procedure: r => {
      const Hs = r.int(6, 20), Q1 = r.pick([1, 1.5, 2]), h1 = r.int(20, 80) / 10, Q2 = Q1 * r.pick([1.5, 2]), H2 = Hs + h1 * (Q2 / Q1) ** 2;
      return { prompt: `A line has a static lift of ${Hs} m and losses of ${h1} m at ${Q1} L/s. What head must the pump supply to push ${Q2} L/s?`, answer: num(H2, 'm', 0.02),
        figure: { kind: 'curves', params: { Hs, Q1, h1, Q2 } },
        misconceptions: [mis('ignore-static-head', h1 * (Q2 / Q1) ** 2), mis('loss-linear-in-v', Hs + h1 * Q2 / Q1)],
        solution: ['H_sys = H_static + h_loss, and h_loss ∝ Q².', `h_loss at ${Q2} L/s = ${h1} × (${Q2}/${Q1})² = ${sig(h1 * (Q2 / Q1) ** 2)} m.`, `H = ${Hs} + ${sig(h1 * (Q2 / Q1) ** 2)} = ${sig(H2)} m.`], key: 'formula' };
    },
    transfer: r => {
      const Hs = r.int(8, 15), Q = r.pick([2, 2.5, 3]), h = r.int(30, 90) / 10, dz = r.int(2, 6), H2 = Hs + dz + h;
      return { prompt: `A line needs ${Hs + h} m of pump head at ${Q} L/s: ${Hs} m of lift and ${h} m of losses. The tank is raised ${dz} m. What head is needed at the same flow?`, answer: num(H2, 'm', 0.02),
        figure: { kind: 'curves', params: { Hs, Q, h, dz } }, misconceptions: [mis('ignore-static-head', Hs + h)],
        solution: ['Raising the tank adds static head; at the same flow the losses do not change.', `H = ${Hs} + ${dz} + ${h} = ${H2} m.`], key: 'formula' };
    },
  }),
  'fluids.operating-point': gen('fluids.operating-point', 'ENG.fluids.operating-point', {
    concept: r => {
      const c = choice(r, 'Where its head–flow curve meets the system curve', ['At the sum of the pump head and the system head', 'At its shut-off head', 'At its best-efficiency flow, always'], { 'At the sum of the pump head and the system head': 'add-pump-and-system' });
      return { prompt: 'A centrifugal pump is connected to a pipe line. Where does it run?', ...c, figure: { kind: 'curves', params: {} },
        solution: ['The pump supplies H_pump(Q); the line needs H_sys(Q).', 'Steady running needs both to be equal: the crossing point.'], key: 'formula' };
    },
    procedure: r => {
      const H0 = r.int(25, 40), a = r.pick([1, 1.5, 2]), Hs = r.int(8, 16), k = r.pick([1, 1.5, 2, 3]), Q = Math.sqrt((H0 - Hs) / (a + k));
      return { prompt: `Pump: H = ${H0} − ${a}Q². System: H = ${Hs} + ${k}Q² (H in m, Q in L/s). Find the operating flow.`, answer: num(Q, 'L/s', 0.02),
        figure: { kind: 'curves', params: { H0, a, Hs, k } }, misconceptions: [mis('ignore-static-head', Math.sqrt(H0 / (a + k)))],
        solution: [`Set equal: ${H0} − ${a}Q² = ${Hs} + ${k}Q².`, `Q² = (${H0} − ${Hs}) / (${a} + ${k}) = ${sig(Q * Q)}.`, `Q = ${sig(Q)} L/s.`], key: 'formula' };
    },
    transfer: r => {
      const H0 = r.int(25, 40), a = r.pick([1, 1.5, 2]), Hs = r.int(8, 16), k = r.pick([1, 1.5, 2, 3]), Q = Math.sqrt((H0 - Hs) / (a + k)), H = Hs + k * Q * Q;
      return { prompt: `Pump: H = ${H0} − ${a}Q². System: H = ${Hs} + ${k}Q² (H in m, Q in L/s). What head does the pump deliver at its operating point?`, answer: num(H, 'm', 0.02),
        figure: { kind: 'curves', params: { H0, a, Hs, k } }, misconceptions: [mis('add-pump-and-system', 2 * H), mis('ignore-static-head', H0 - a * H0 / (a + k))],
        solution: [`Q² = (${H0} − ${Hs}) / (${a} + ${k}) = ${sig(Q * Q)}.`, `H = ${Hs} + ${k} × ${sig(Q * Q)} = ${sig(H)} m (the same from the pump curve).`], key: 'formula' };
    },
  }),
  'fluids.shaft-power': gen('fluids.shaft-power', 'ENG.fluids.shaft-power', {
    concept: r => {
      const c = choice(r, 'The shaft power ρgQH/η', ['The water power ρgQH', 'ρgQHη', 'The pump head times the flow in L/s'], { 'ρgQHη': 'efficiency-inverted' });
      return { prompt: 'The motor must supply at least…', ...c, figure: { kind: 'none', params: {} },
        solution: ['The water gains ρgQH; the pump loses some on the way.', 'Shaft power = ρgQH/η, larger than the water power.'], key: 'formula' };
    },
    procedure: r => {
      const Q = r.int(10, 40) / 10, H = r.int(10, 35), eta = r.int(40, 75), P = 1000 * G * Q / 1000 * H / (eta / 100) / 1000;
      return { prompt: `A pump delivers ${Q} L/s against ${H} m at ${eta} % efficiency. Find the shaft power (ρ = 1000 kg/m³, g = ${G}).`, answer: num(P, 'kW', 0.02),
        figure: { kind: 'none', params: { Q, H, eta } }, misconceptions: [mis('no-lps-conversion', P * 1000), mis('efficiency-inverted', P * (eta / 100) ** 2)],
        solution: [`Q = ${sig(Q / 1000, 6)} m³/s.`, `ρgQH = 1000 × ${G} × ${sig(Q / 1000, 6)} × ${H} = ${sig(1000 * G * Q / 1000 * H)} W.`, `P = ${sig(1000 * G * Q / 1000 * H)} / ${eta / 100} = ${sig(P * 1000)} W = ${sig(P)} kW.`], key: 'formula' };
    },
    // the bench's own operating point: flow, pump head and shaft power → pump efficiency (engine)
    transfer: r => {
      const { s, e } = benchLine(r), o = e.outputs, eta = e.sol.pump.efficiency * 100, rho = e.sol.water.rho;
      const Q = o.flow.value, H = o.pumpHead.value, P = o.shaftPower.value;
      return { prompt: `The fluid line bench runs at ${sig(Q, 4)} L/s with ${sig(H, 4)} m of pump head and ${sig(P, 4)} kW of shaft power (water at ${s.temp} °C, ρ = ${sig(rho, 4)} kg/m³, g = ${G} m/s²). What is the pump's efficiency?`,
        answer: num(eta, '%', 0, 1), figure: { kind: 'bench-pump', params: { setup: s } }, misconceptions: [mis('efficiency-inverted', 10000 / eta)],
        solution: [`Water power = ρgQH = ${sig(rho, 4)} × ${G} × ${sig(Q / 1000, 4)} × ${sig(H, 4)} = ${sig(rho * G * Q / 1000 * H)} W.`, `η = water power / shaft power = ${sig(rho * G * Q / 1000 * H)} / ${sig(P * 1000)} = ${sig(eta)} %.`], key: 'engine' };
    },
  }),
  'fluids.npsh': gen('fluids.npsh', 'ENG.fluids.npsh', {
    concept: r => {
      const c = choice(r, 'NPSH available falls, so cavitation is more likely', ['NPSH available rises', 'Nothing changes', 'The pump head doubles'], {});
      return { prompt: 'The same pump draws hotter water from the same sump. What happens?', ...c, figure: { kind: 'none', params: {} },
        solution: ['Hotter water has a higher vapour pressure.', 'NPSHa = (p_atm − p_v)/ρg − suction lift − suction losses: it falls.'], key: 'formula' };
    },
    procedure: r => {
      const patm = 101.3, T = r.pick([20, 30, 40, 60]), pv = +(water(T).pv / 1000).toFixed(2), z = r.int(10, 50) / 10, hl = r.int(3, 15) / 10;
      const v = (patm - pv) * 1000 / (1000 * G) - z - hl;
      return { prompt: `A pump sits ${z} m above an open sump. Atmospheric pressure ${patm} kPa, vapour pressure ${pv} kPa (water at ${T} °C), suction losses ${hl} m. Find NPSH available (ρ = 1000 kg/m³, g = ${G}).`,
        answer: num(v, 'm', 0.02, 0.05), figure: { kind: 'suction', params: { patm, pv, z, hl, T } },
        misconceptions: [mis('ignore-static-head', v + z), mis('vapour-pressure-ignored', v + pv * 1000 / (1000 * G))],
        solution: ['NPSHa = (p_atm − p_v)/ρg − z_s − h_ls.', `(${patm} − ${pv}) × 1000 / (1000 × ${G}) = ${sig((patm - pv) / G * 1000 / 1000)} m.`, `NPSHa = ${sig((patm - pv) / G)} − ${z} − ${hl} = ${sig(v)} m.`], key: 'formula' };
    },
    transfer: r => {
      const patm = 101.3, pv = r.pick([2.34, 4.25, 7.38]), hl = r.int(5, 15) / 10, npshr = r.int(15, 40) / 10, margin = r.pick([0.5, 1]);
      const zmax = (patm - pv) * 1000 / (1000 * G) - hl - npshr - margin;
      return { prompt: `A pump needs NPSH ${npshr} m and you want a ${margin} m margin. Atmospheric ${patm} kPa, vapour pressure ${pv} kPa, suction losses ${hl} m. How high above the sump can the pump sit (ρ = 1000 kg/m³, g = ${G})?`,
        answer: num(zmax, 'm', 0.02, 0.05), figure: { kind: 'suction', params: { patm, pv, hl, npshr, margin } },
        misconceptions: [mis('vapour-pressure-ignored', zmax + pv / G)],
        solution: ['NPSHa = (p_atm − p_v)/ρg − z − h_ls ≥ NPSHr + margin.', `z ≤ ${sig((patm - pv) / G)} − ${hl} − ${npshr} − ${margin} = ${sig(zmax)} m.`], key: 'formula' };
    },
  }),
};
