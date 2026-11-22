// Journey 3 content: solids graph (stress, strain, Hooke's law, yield, factor of safety, stiffness vs strength), its item
// generators and the stiffness journey spec. Contract: docs/JOURNEYS.md.
// Every number item is solved here from its PROMPT TEXT alone (regexes over what the learner sees) with this file's own
// hand calculation; engine-keyed items are also re-run on the Mount bench's model (mount/model.mjs stand) from their params.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildGraph, buildItems, checkItems } from '../core/graph.mjs';
import { NODES as SOLIDS } from '../content/graph/solids.mjs';
import { NODES as STATICS } from '../content/graph/statics.mjs';
import { NODES as SCHOOL } from '../content/graph/school-math.mjs';
import { NODES as FLUIDS } from '../content/graph/fluids.mjs';
import { GENERATORS as GSOL } from '../content/items/solids.mjs';
import { GENERATORS as GS } from '../content/items/statics.mjs';
import { GENERATORS as GM } from '../content/items/school-math.mjs';
import { GENERATORS as GF } from '../content/items/fluids.mjs';
import * as CATALOG from '../content/catalog.mjs';
import { JOURNEYS } from '../content/journeys/index.mjs';
import J, { ANCHOR_SETUP, ANCHOR_DESIGN, whatIfs } from '../content/journeys/stiffness.mjs';
import { READING_ADAPTER, evaluateReading, stand, verdict, SPEC } from '../mount/model.mjs';
import { PRESETS } from '../playground/presets.mjs';

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 3);
const close = (a, b, rel = 1e-9, abs = 1e-12, msg = '') => assert.ok(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${msg} ${a} vs ${b}`);
const n = s => parseFloat(String(s).replace(/,/g, ''));
const graph = buildGraph(STATICS, SCHOOL, FLUIDS, SOLIDS), items = buildItems(GS, GM, GF, GSOL);

// ---------- the learner's own handbook and beam formulas (independent of the content and the engine) ----------
const HB = { steel: { E: 200000, Y: 250, rho: 7850 }, aluminium: { E: 69000, Y: 276, rho: 2700 } };
function sec(d) {
  if (d.shape === 'rect') return { A: d.b * d.h, I: d.b * d.h ** 3 / 12, c: d.h / 2 };
  if (d.shape === 'rhs') { const bi = d.b - 2 * d.t, hi = d.h - 2 * d.t; return { A: d.b * d.h - bi * hi, I: (d.b * d.h ** 3 - bi * hi ** 3) / 12, c: d.h / 2 }; }
  const hw = d.h - 2 * d.tf, yf = (d.h - d.tf) / 2;   // I-section by parallel axes: two flanges + web
  return { A: 2 * d.b * d.tf + d.tw * hw, I: 2 * (d.b * d.tf ** 3 / 12 + d.b * d.tf * yf ** 2) + d.tw * hw ** 3 / 12, c: d.h / 2 };
}
const P = 2500, L = 600;
const hand = (d, a = 200, load = P, span = L) => {
  const s = sec(d), m = HB[d.material], M = load * a * (span - a) / span, stress = M * s.c / s.I;
  return { ...s, M, stress, defl: load * a * a * (span - a) ** 2 / (3 * m.E * s.I * span), mass: m.rho * s.A * 1e-9 * span, fos: m.Y / stress, strain: stress / m.E };
};
const meets = (d, a = 200) => { const h = hand(d, a); return h.defl <= 0.15 && h.stress <= HB[d.material].Y / 2 && h.mass <= 2.5 && d.b <= 50 && d.h <= 80; };

// ---------- solve a number item from its visible prompt ----------
const STAND = /bolts (\d+) mm apart, a ([\d,]+) N machine (\d+) mm from the left bolt\), the support is an? (steel|aluminium) bar (\d+) mm wide and (\d+) mm deep \(h vertical; E = ([\d,]+) MPa, yield (\d+) MPa\)/;
function solveNumber(id, p) {
  let m;
  if ((m = p.match(STAND))) {
    const [span, load, a, , b, h, E, Y] = [n(m[1]), n(m[2]), n(m[3]), m[4], n(m[5]), n(m[6]), n(m[7]), n(m[8])];
    const sigma = load * a * (span - a) / span * (h / 2) / (b * h ** 3 / 12);
    if (/strain gauge .* read, in µε/.test(p)) return sigma / E * 1e6;
    if (/up to yield, in N/.test(p)) return load * Y / sigma;
    if (/factor of safety/.test(p)) return Y / sigma;
  }
  if ((m = p.match(/flat steel bar (\d+) mm wide and (\d+) mm thick is pulled along its length with (\d+) kN/))) return n(m[3]) * 1000 / (n(m[1]) * n(m[2]));
  if ((m = p.match(/bar (\d+) mm wide and (\d+) mm deep \(h vertical\) carries a bending moment of ([\d,]+) N·m/))) return 6 * n(m[3]) * 1000 / (n(m[1]) * n(m[2]) ** 2);
  if ((m = p.match(/(\d+) mm diameter steel bolt .* pull of ([\d,]+) N/))) return 4 * n(m[2]) / (Math.PI * n(m[1]) ** 2);
  if ((m = p.match(/bar ([\d,]+) mm long stretches by ([\d.]+) mm/))) return n(m[2]) / n(m[1]) * 1e6;
  if ((m = p.match(/reads ([\d,]+) µε\. Taking the strain as the same along a (\d+) mm stretch/))) return n(m[1]) * 1e-6 * n(m[2]);
  if ((m = p.match(/strain gauge on an? (?:steel|aluminium) part \(E = ([\d,]+) MPa, yield \d+ MPa\) reads ([\d,]+) µε/))) return n(m[1]) * n(m[2]) * 1e-6;
  if ((m = p.match(/tie rod ([\d,]+) mm long, with a cross-section of (\d+) mm², carries ([\d,]+) N \(E = ([\d,]+) MPa/))) return n(m[3]) * n(m[1]) / (n(m[2]) * n(m[4]));
  if ((m = p.match(/tie rod has a cross-section of (\d+) mm² \(E = [\d,]+ MPa, yield (\d+) MPa\)\. At what pull/))) return n(m[2]) * n(m[1]) / 1000;
  if ((m = p.match(/part has E = ([\d,]+) MPa, yield (\d+) MPa\. What is the largest strain/))) return n(m[2]) / n(m[1]) * 1e6;
  if ((m = p.match(/part \(E = [\d,]+ MPa, yield (\d+) MPa\) works at a stress of (\d+) MPa/))) return n(m[1]) / n(m[2]);
  if ((m = p.match(/part \(E = [\d,]+ MPa, yield (\d+) MPa\) must have a factor of safety of ([\d.]+)/))) return n(m[1]) / n(m[2]);
  if ((m = p.match(/support \(E = ([\d,]+) MPa, yield (\d+) MPa\) deflects ([\d.]+) mm under the machine, and its stress there is (\d+) MPa\. It is remade in (?:steel|aluminium) \(E = ([\d,]+) MPa, yield (\d+) MPa\)/))) {
    const [E1, , d1, s1, E2, Y2] = m.slice(1).map(n);
    return /new deflection/.test(p) ? d1 * E1 / E2 : /new stress/.test(p) ? s1 : Y2 / s1;   // σ = M·c/I has no E
  }
  if ((m = p.match(/(\d+) mm deep \(h vertical\) deflects ([\d.]+) mm under the machine, and its stress there is (\d+) MPa\. It is remade (\d+) mm deep/))) {
    const [h1, d1, s1, h2] = m.slice(1).map(n);
    return /new deflection/.test(p) ? d1 * (h1 / h2) ** 3 : 6 * (s1 * h1 ** 2 / 6) / h2 ** 2;   // σ = 6M/(b h²) with M and b fixed
  }
  if ((m = p.match(/(\d+) mm² in cross-section and ([\d,]+) mm long, each carry ([\d,]+) N: one aluminium \(E = [\d,]+ MPa, yield \d+ MPa\), one steel \(E = ([\d,]+) MPa, yield (\d+) MPa\)/))) {
    const [A, len, F, E, Y] = m.slice(1).map(n), s = F / A;
    return /stretch/.test(p) ? s * len / E : /factor of safety/.test(p) ? Y / s : s;
  }
  assert.fail(`${id}: cannot solve from the visible text: ${p}`);
}
// ---------- choose an option from the visible prompt ----------
function solveChoice(id, p, options) {
  let m, want;
  if ((m = p.match(/Rod B has (\d+) times the cross-sectional area/))) want = new RegExp(`^B has 1/${m[1]} of A’s stress$`);
  else if ((m = p.match(/strain of ([\d.]+) %/))) want = new RegExp(`^${String(+(n(m[1]) / 100).toPrecision(6)).replace('.', '\\.')} \\(= `);
  else if ((m = p.match(/steel bar \(E = ([\d,]+) MPa.*aluminium bar \(E = ([\d,]+) MPa/))) want = n(m[2]) < n(m[1]) ? /^The aluminium bar: ε = σ \/ E/ : /^The steel bar: the larger E/;
  else if ((m = p.match(/works at ([\d.]+) × its yield stress .* load doubles/))) { assert.ok(2 * n(m[1]) > 1); want = /past yield: .*says nothing reliable beyond/; }
  else if ((m = p.match(/at or below yield ÷ ([\d.]+)\. What does this mean/))) want = new RegExp(`^FoS = yield ÷ stress must be at least ${m[1].replace('.', '\\.')}$`);
  else if (/passes its strength check .* bends too far/.test(p)) want = /^Make E·I larger/;
  else if (/remade in steel with the same section .* What happens/.test(p)) want = /deflection falls about 2\.9×, but the stress stays the same/;
  else assert.fail(`${id}: cannot choose from the visible text: ${p}`);
  const hits = options.map((o, i) => [o, i]).filter(([o]) => want.test(o));
  assert.equal(hits.length, 1, `${id}: ${want} in ${JSON.stringify(options)}`);
  return hits[0][1];
}

// ---------- graph ----------
test('graph: solids nodes merge with statics, school maths and fluids; known edges, no cycles, generators match', async () => {
  assert.deepEqual(checkItems(graph, items), []);
  const ids = SOLIDS.map(x => x.id);
  assert.deepEqual(ids, ['ENG.solids.normal-stress', 'ENG.solids.strain', 'ENG.solids.hookes-law', 'ENG.solids.yield-elastic-limit', 'ENG.solids.factor-of-safety', 'ENG.solids.stiffness-vs-strength']);
  for (const x of SOLIDS) { assert.match(x.id, /^ENG\.solids\.[a-z-]+$/); assert.ok(GSOL[x.items], x.items); assert.equal(GSOL[x.items].competency, x.id); }
  const reach = (id, seen = new Set()) => { for (const e of [...graph.node(id).requires, ...graph.alsoUseful(id)]) if (!seen.has(e)) { seen.add(e); reach(e, seen); } return seen; };
  const below = reach('ENG.solids.stiffness-vs-strength');
  for (const x of ['ENG.solids.hookes-law', 'ENG.solids.factor-of-safety', 'ENG.solids.yield-elastic-limit', 'ENG.solids.normal-stress', 'ENG.solids.strain', 'ENG.solids.bending-stress',
    'ENG.solids.beam-stiffness', 'ENG.statics.second-moment-area', 'MATH.measurement.unit-conversions', 'MATH.algebra.inverse-proportion']) assert.ok(below.has(x), x);
  assert.deepEqual(graph.prerequisitesOf('ENG.solids.factor-of-safety', 1), ['ENG.solids.yield-elastic-limit', 'ENG.solids.normal-stress']);
  assert.deepEqual(graph.prerequisitesOf('ENG.solids.hookes-law', 1), ['ENG.solids.normal-stress', 'ENG.solids.strain']);
  // Existing statics nodes are not redefined (core/graph.mjs refuses that), so bending-stress does not yet require normal-stress.
  assert.throws(() => buildGraph(STATICS, SCHOOL, SOLIDS, [{ id: 'ENG.solids.bending-stress', requires: ['ENG.solids.normal-stress'] }]), /defined twice/);
  // the catalogue loads the new files, and the registry lists the journey
  assert.ok(CATALOG.GRAPH.length >= 4); assert.equal(CATALOG.ITEMS.length, CATALOG.GRAPH.length);
  assert.ok((await Promise.all(JOURNEYS.map(f => f()))).some(m => m.default === J));
});

// ---------- items ----------
test('items: shape, determinism, variety, misconceptions apart from the answer, no float noise in prompts or solutions', () => {
  for (const [id, g] of Object.entries(GSOL)) {
    assert.deepEqual(g.aspects, ['concept', 'procedure', 'transfer'], id);
    for (const aspect of g.aspects) {
      const prompts = new Set(), misIds = new Set();
      for (const seed of SEEDS) {
        const it = g.make(seed, aspect);
        assert.deepEqual(g.make(seed, aspect), it, `${id} deterministic`);
        assert.equal(it.competency, g.competency); assert.equal(it.aspect, aspect); assert.equal(it.id, `${id}:${aspect}:${seed}`);
        for (const t of [it.prompt, ...it.solution]) {
          assert.ok(typeof t === 'string' && !/undefined|NaN|Infinity|\ba aluminium\b|\bA aluminium\b/.test(t), `${id}: ${t}`);
          assert.doesNotMatch(t, /\.\d*([1-9]0{5,}[1-9]|9{6,})/, `${id} float noise: ${t}`);
        }
        assert.ok(it.misconceptions.length >= 1, `${it.id} has a misconception`);
        it.misconceptions.forEach(m => misIds.add(m.id));
        if (it.answer.kind === 'number') {
          const { value, tol } = it.answer;
          assert.ok(Number.isFinite(value) && value > 0 && tol > 0 && tol < 0.1, `${it.id} answer`);
          const inWin = (x, truth) => Math.abs(x - truth) <= tol * Math.abs(truth);
          for (const m of it.misconceptions) assert.ok(!inWin(m.value, value) && !inWin(value, m.value), `${it.id} ${m.id} too close`);
        } else {
          const { options, correct } = it.answer;
          assert.equal(new Set(options).size, options.length); assert.ok(options[correct]);
          for (const m of it.misconceptions) assert.ok(m.option !== correct && options[m.option]);
        }
        prompts.add(it.prompt);
      }
      assert.ok(prompts.size >= (g.make(1, aspect).answer.kind === 'number' ? 20 : 2), `${id} ${aspect}: ${prompts.size} distinct`);
      assert.ok(misIds.size >= 2, `${id} ${aspect}: misconceptions ${[...misIds]}`);
    }
  }
  // the misconceptions the brief names are all present somewhere
  const all = new Set(Object.values(GSOL).flatMap(g => g.aspects.flatMap(a => SEEDS.flatMap(s => g.make(s, a).misconceptions.map(m => m.id)))));
  for (const m of ['stiffness-is-strength', 'yield-reduces-deflection', 'e-as-yield', 'yield-for-e', 'fos-inverted', 'percent-as-absolute', 'percent-as-micro', 'pa-for-mpa', 'hooke-beyond-yield', 'stress-scales-with-e'])
    assert.ok(all.has(m), m);
});

test('items: every one is answered from its visible text by an independent hand calculation (≥ 100 seeds per generator and aspect)', () => {
  let count = 0;
  for (const [id, g] of Object.entries(GSOL)) for (const aspect of g.aspects) for (const seed of SEEDS) {
    const it = g.make(seed, aspect);
    if (it.answer.kind === 'choice') { assert.equal(solveChoice(id, it.prompt, it.answer.options), it.answer.correct, it.id); count++; continue; }
    const v = solveNumber(id, it.prompt);
    close(v, it.answer.value, it.key === 'engine' ? 1e-6 : 1e-12, 1e-12, it.id);
    assert.ok(Math.abs(v - it.answer.value) < it.answer.tol * it.answer.value / 10, it.id);
    count++;
  }
  assert.ok(count >= 6 * 3 * 100, `${count} items`);
});

test('items: engine-keyed answers are re-run on the Mount bench model from their params', () => {
  let count = 0;
  for (const [id, g] of Object.entries(GSOL)) for (const aspect of g.aspects) for (const seed of SEEDS) {
    const it = g.make(seed, aspect);
    if (it.key !== 'engine') continue;
    const { material, b, h, a } = it.params, st = stand({ material, shape: 'rect', b, h }, { mount: a, loaded: true }), at = st.at(a);
    const truth = { 'solids.hooke': at.strain * 1e6, 'solids.yield': SPEC.load * st.yieldStrength / at.stress, 'solids.fos': st.yieldStrength / at.stress }[id];
    assert.ok(truth !== undefined, `${id} has no engine check`);
    close(truth, it.answer.value, 1e-12, 1e-12, it.id);
    assert.ok(at.stress < st.yieldStrength, `${it.id}: the stand case stays elastic`);
    count++;
  }
  assert.ok(count >= 300, `${count} engine items`);
});

test('items: no item puts a stress past yield in front of the learner as if the linear model still held', () => {
  for (const [id, g] of Object.entries(GSOL)) for (const aspect of g.aspects) for (const seed of SEEDS) {
    const it = g.make(seed, aspect);
    if (it.answer.kind !== 'number' || it.answer.unit !== 'MPa' || /largest working stress/.test(it.prompt)) continue;
    assert.ok(it.answer.value < 250, `${it.id}: ${it.answer.value} MPa`);
  }
});

// ---------- journey ----------
const VALID = [{ material: 'steel', shape: 'I', b: 40, h: 70, tw: 3, tf: 3 }, { material: 'aluminium', shape: 'rhs', b: 50, h: 80, t: 5 },
  { material: 'steel', shape: 'I', b: 50, h: 80, tw: 3, tf: 3 }, { material: 'aluminium', shape: 'rhs', b: 45, h: 80, t: 5 }];
const at = (d, mount = 200) => ({ design: d, mount, loaded: true, dialX: mount, strainX: mount });

test('journey: contract shape, registered, bench adapter, brief states the limits and the linear model’s limit', async () => {
  assert.equal(J.id, 'stiffness'); assert.match(J.course, /PH25C01/); assert.match(J.course, /CE25C11/);
  assert.deepEqual({ page: J.bench.page, domain: J.bench.domain }, { page: '../mount/?project=current', domain: 'mount-stand' });
  assert.equal(await J.bench.adapter(), READING_ADAPTER);
  for (const k of ['2,500 N', '600 mm', '50 × 80 mm', '0.15 mm', 'yield ÷ 2', 'factor of safety of at least 2', '2.5 kg', 'aluminium 50 × 60 mm hollow tube with a 3 mm wall', 'does not predict what happens after yield']) assert.ok(J.brief.includes(k), k);
  assert.ok(J.teach[J.target].steps.some(s => /does not predict what happens after yield/.test(s)));
  assert.equal(J.anchor.revision, 'Revision 1'); assert.equal(J.anchor.setup, ANCHOR_SETUP); assert.deepEqual(ANCHOR_SETUP.design, ANCHOR_DESIGN);
  assert.equal(J.target, 'ENG.solids.stiffness-vs-strength'); assert.ok(graph.has(J.target));
  for (const [c, t] of Object.entries(J.teach)) {
    assert.ok(graph.has(c), c); assert.ok(items.has(t.items), t.items); assert.equal(items.generators[t.items].competency, c); assert.ok(t.steps.length);
    if (t.explore) { assert.match(t.explore.page, /^\.\.\/playground\//); assert.ok(PRESETS.some(p => p.id === t.explore.preset), t.explore.preset); }
  }
  for (const c of graph.prerequisitesOf(J.target, 1)) assert.ok(J.teach[c], `teach entry for prerequisite ${c}`);
  assert.ok(PRESETS.some(p => p.id === J.apply.transfer.preset));
  assert.ok(J.apply.count >= 1 && J.check.count === 1 && J.return.decision === true);
  for (const k of Object.keys(J.labels)) assert.ok(J.labels[k]);
  const src = ['../content/journeys/stiffness.mjs', '../content/items/solids.mjs', '../content/graph/solids.mjs'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(src, /document\.|window\.|localStorage|fetch\(|Math\.random/, 'content is pure');
});

test('journey: the target’s check items exist (procedure aspect, fresh per seed, solvable unaided)', () => {
  const g = items.generators[graph.node(J.target).items];
  assert.equal(g.competency, J.target); assert.ok(g.aspects.includes('procedure'));
  const seen = new Set();
  for (const seed of SEEDS) { const it = items.make(graph.node(J.target).items, seed, 'procedure'); assert.equal(it.competency, J.target); assert.equal(it.answer.kind, 'number'); seen.add(it.prompt); }
  assert.ok(seen.size >= 100);
});

test('journey: the anchor meets the stress limit (and mass) but bends too far — by the bench and by hand', () => {
  const r = READING_ADAPTER.evaluate(ANCHOR_SETUP), v = verdict(ANCHOR_DESIGN, 200), h = hand(ANCHOR_DESIGN);
  assert.ok(r.ok);
  assert.deepEqual([r.verdicts.alignment.value, r.verdicts.strength.value, r.verdicts.mass.value], ['fail', 'pass', 'pass']);
  assert.deepEqual([v.alignment, v.yield, v.mass], [false, true, true]);
  close(r.outputs.deflection.value, h.defl, 1e-6); close(r.outputs.stress.value, h.stress, 1e-6); close(r.outputs.mass.value, h.mass, 1e-9);
  assert.ok(h.defl > 2 * 0.15 && h.fos > 8, `${h.defl} mm, FoS ${h.fos}`);
});

test('journey: stuck truths come from the adapter and equal the hand calculation; steel changes the deflection, not the stress', () => {
  const s = ANCHOR_SETUP, out = READING_ADAPTER.evaluate(s).outputs, T = Object.fromEntries(J.stuck.predictions.map(p => [p.id, p.truth(s, out)]));
  for (const p of J.stuck.predictions) assert.ok(p.tol > 0 && p.tol < 0.1 && typeof p.unit === 'string' && Number.isFinite(T[p.id]), p.id);
  const al = hand(ANCHOR_DESIGN), st = hand({ ...ANCHOR_DESIGN, material: 'steel' }), deep = hand({ ...ANCHOR_DESIGN, h: 80 });
  close(T['fos-now'], 276 / al.stress, 1e-6); close(T['steel-deflection'], st.defl, 1e-6); close(T['steel-stress'], al.stress, 1e-6);
  close(T['deeper-deflection'], deep.defl, 1e-6); close(T['deeper-stress'], deep.stress, 1e-6);
  close(T['steel-deflection'], al.defl * 69000 / 200000, 1e-6, 0, 'deflection scales with 1/E');
  const tol = id => J.stuck.predictions.find(p => p.id === id).tol, off = (x, id) => Math.abs(x - T[id]) > tol(id) * Math.abs(T[id]);
  assert.ok(off(al.stress * 69000 / 200000, 'steel-stress'), 'the stiffness-for-strength mix-up is outside tolerance');
  assert.ok(off(al.defl, 'steel-deflection') && off(al.defl * 276 / 250, 'steel-deflection'), 'unchanged or yield-scaled deflection is a miss');
  assert.ok(off(al.stress * (60 / 80) ** 3, 'deeper-stress'), 'the h³ rule for stress is a miss');
});

test('journey: at least two different valid designs pass every constraint; the steel tube of the anchor’s section is too heavy', () => {
  for (const d of VALID) {
    const r = READING_ADAPTER.evaluate(at(d)), v = verdict(d, 200);
    assert.ok(r.ok, JSON.stringify(d));
    assert.deepEqual(Object.values(r.verdicts).map(x => x.value), ['pass', 'pass', 'pass'], JSON.stringify(d));
    assert.ok(v.all && meets(d), JSON.stringify(d));
  }
  assert.ok(new Set(VALID.map(d => d.material)).size === 2 && new Set(VALID.map(d => d.shape)).size === 2);
  const steelTube = READING_ADAPTER.evaluate(at({ ...ANCHOR_DESIGN, material: 'steel' })).verdicts;
  assert.deepEqual([steelTube.alignment.value, steelTube.strength.value, steelTube.mass.value], ['pass', 'pass', 'fail']);
});

test('journey: return predictions on the learner’s own setup equal the bench’s model and the hand calculation', () => {
  for (const d of [ANCHOR_DESIGN, ...VALID]) for (const mount of [150, 200, 300, 450]) {
    const s = at(d, mount), r = READING_ADAPTER.evaluate(s), h = hand(d, mount), T = Object.fromEntries(J.return.predictions.map(p => [p.id, p.truth(s, r.outputs)]));
    close(T['own-deflection'], r.outputs.deflection.value, 1e-12); close(T['own-stress'], r.outputs.stress.value, 1e-12);
    close(T['own-deflection'], h.defl, 1e-6); close(T['own-stress'], h.stress, 1e-6); close(T['own-fos'], h.fos, 1e-6);
  }
});

test('journey: defence questions are valid patched setups answered by adapter.evaluate; a material swap moves the dial, not the stress', () => {
  for (const d of [ANCHOR_DESIGN, ...VALID]) for (const mount of [150, 200, 300, 450]) {
    const s = at(d, mount), before = READING_ADAPTER.evaluate(s).outputs, qs = J.defend(s, before);
    assert.deepEqual(qs.map(q => q.prompt), whatIfs(s).map(q => q.prompt));
    assert.equal(qs.length, 3);
    for (const q of qs) {
      const patched = { ...s, ...q.change }, r = evaluateReading(patched);
      assert.ok(r.ok, r.reason); assert.equal(q.unit, r.outputs[q.read].unit); assert.ok(q.tol > 0 && q.tol < 0.1);
      const v = r.outputs[q.read].value, h = hand(patched.design, patched.mount);
      close(v, q.read === 'deflection' ? h.defl : h.stress, 1e-6, 0, q.prompt);
      assert.ok(!/after yield|beyond yield|past yield/.test(q.prompt));
      assert.ok(h.stress < HB[patched.design.material].Y, 'every what-if stays elastic');
    }
    const [swapD, swapS, depth] = qs;
    assert.ok(swapD.change.design.material !== d.material && swapS.change.design.material !== d.material);
    close(evaluateReading({ ...s, ...swapS.change }).outputs.stress.value, before.stress.value, 1e-9, 0, 'stress unchanged by the material');
    assert.ok(Math.abs(evaluateReading({ ...s, ...swapD.change }).outputs.deflection.value - before.deflection.value) > 0.5 * before.deflection.value, 'the dial moves');
    assert.equal(Math.abs(depth.change.design.h - d.h), 10);
  }
});
