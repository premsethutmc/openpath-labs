// Journey 1 content: statics graph, school-maths nodes, item generators and the support journey spec.
// Engine-keyed items are re-solved here from their own params with engines/solids/frame.mjs (structures rebuilt in this
// file, not by the generators' helpers). Formula-keyed items are checked against hand calculations written here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { NODES as STATICS } from '../content/graph/statics.mjs';
import { NODES as SCHOOL } from '../content/graph/school-math.mjs';
import { GENERATORS as GS } from '../content/items/statics.mjs';
import { GENERATORS as GM } from '../content/items/school-math.mjs';
import J, { ANCHOR_SETUP, whatIfs } from '../content/journeys/support.mjs';
import { solve } from '../engines/solids/frame.mjs';
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';
import { READING_ADAPTER, evaluateReading, stand, SPEC, ORIGINAL } from '../mount/model.mjs';
import { PRESETS } from '../playground/presets.mjs';

const NODES = [...STATICS, ...SCHOOL], BY = Object.fromEntries(NODES.map(n => [n.id, n])), GEN = { ...GS, ...GM };
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const close = (a, b, rel = 1e-6, abs = 1e-6, msg) => assert.ok(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${msg ?? ''} ${a} vs ${b}`);
// School competency ids at premsethutmc/openpath main 62b17d3f, content/mathematics/curriculum.v1.json (checked 22 Nov 2026).
const SCHOOL_IDS = ['MATH.measurement.unit-conversions', 'MATH.measurement.rectangle-area', 'MATH.number.exponents', 'MATH.algebra.linear-equations', 'MATH.algebra.inverse-proportion',
  'MATH.algebra.linear-systems', 'MATH.trigonometry.ratios', 'MATH.trigonometry.functions', 'MATH.vectors.algebra', 'MATH.vectors.products'];

test('graph: unique ids, known edges, no cycles, every node has a generator, school nodes flagged', () => {
  assert.equal(new Set(NODES.map(n => n.id)).size, NODES.length);
  assert.ok(STATICS.length >= 10 && STATICS.length <= 15, `${STATICS.length} statics nodes`);
  for (const n of NODES) {
    for (const e of [...n.requires, ...n.support]) assert.ok(BY[e], `${n.id} → unknown ${e}`);
    assert.ok(GEN[n.items], `${n.id}: no generator ${n.items}`);
    assert.equal(GEN[n.items].competency, n.id, `${n.items} is for ${n.id}`);
    if (n.id.startsWith('MATH.')) { assert.equal(n.school, true); assert.equal(n.learnUrl, null); assert.ok(SCHOOL_IDS.includes(n.id), n.id); }
    else assert.match(n.id, /^ENG\.(statics|solids)\.[a-z0-9-]+$/);
  }
  const state = {}, visit = id => { if (state[id] === 1) throw new Error(`cycle at ${id}`); if (state[id] === 2) return; state[id] = 1; BY[id].requires.forEach(visit); state[id] = 2; };
  NODES.forEach(n => visit(n.id));
  const reach = (id, seen = new Set()) => { for (const e of [...BY[id].requires, ...BY[id].support]) if (!seen.has(e)) { seen.add(e); reach(e, seen); } return seen; };
  const below = reach('ENG.statics.moment-about-point');
  for (const m of ['MATH.trigonometry.functions', 'MATH.vectors.products', 'ENG.statics.perpendicular-distance']) assert.ok(below.has(m), m);
  assert.ok(reach('ENG.statics.beam-reactions').has('MATH.algebra.linear-equations'));
  assert.deepEqual(BY['ENG.statics.moment-about-point'].requires.slice(0, 2), ['MATH.trigonometry.functions', 'ENG.statics.perpendicular-distance']);
});

test('items: shape, determinism, variety, misconceptions distinct from the answer', () => {
  for (const [id, g] of Object.entries(GEN)) for (const aspect of g.aspects) {
    assert.ok(['concept', 'procedure', 'transfer'].includes(aspect), `${id} ${aspect}`);
    const prompts = new Set();
    for (const seed of SEEDS) {
      const it = g.make(seed, aspect);
      assert.deepEqual(g.make(seed, aspect), it, `${id} deterministic`);
      assert.equal(it.competency, g.competency); assert.equal(it.aspect, aspect); assert.equal(it.id, `${id}:${aspect}:${seed}`);
      assert.ok(typeof it.prompt === 'string' && it.prompt.length > 20 && !/undefined|NaN/.test(it.prompt), `${id} prompt: ${it.prompt}`);
      assert.ok(Array.isArray(it.solution) && it.solution.length && it.solution.every(s => typeof s === 'string' && !/undefined|NaN/.test(s)), `${id} solution`);
      assert.ok(['engine', 'formula'].includes(it.key));
      assert.ok(it.misconceptions.length >= 1, `${id} ${aspect} has a misconception`);
      if (it.answer.kind === 'number') {
        const { value, tol, unit } = it.answer;
        assert.ok(Number.isFinite(value) && tol > 0 && unit, `${id} answer`);
        // tol is relative (core/ledger.mjs within): the right answer never sits in a misconception's window, nor one misconception in another's
        const inWin = (x, truth) => Math.abs(x - truth) <= tol * Math.abs(truth);
        assert.ok(tol < 0.2, `${id} tol ${tol}`);
        for (const m of it.misconceptions) assert.ok(!inWin(m.value, value) && !inWin(value, m.value), `${id} ${m.id} too close to the answer`);
        for (let i = 0; i < it.misconceptions.length; i++) for (let j = 0; j < i; j++) assert.ok(!inWin(it.misconceptions[i].value, it.misconceptions[j].value), `${id} misconceptions overlap`);
      } else {
        const { options, correct } = it.answer;
        assert.equal(new Set(options).size, options.length, `${id} duplicate options ${options}`);
        assert.ok(Number.isInteger(correct) && options[correct]);
        for (const m of it.misconceptions) assert.ok(m.option !== correct && options[m.option], `${id} misconception option`);
        assert.equal(it.key, 'formula');
      }
      prompts.add(it.prompt);
    }
    assert.ok(prompts.size >= (GEN[id].make(1, aspect).answer.kind === 'number' ? 8 : 1), `${id} ${aspect}: only ${prompts.size} distinct items`);
  }
});

// ---------- independent recomputation ----------
const deg = a => a * Math.PI / 180, STEEL = MATERIALS.steel, BAR = section({ shape: 'rect', b: 50, h: 80 });
function frame(points, members, supports, loads, { material = STEEL, sec = BAR } = {}) {
  const res = solve({ nodes: points.map(([x, y]) => ({ x, y })), members: members.map(([i, j, type = 'frame']) => ({ i, j, type, material, section: sec })), supports, loads });
  assert.ok(res.ok); return res;
}
// simply supported, joints at 0, a, L; returns reactions, M under the load (from member 1 start), deflection at a
function ss(L, a, P, opts) {
  const res = frame([[0, 0], [a, 0], [L, 0]], [[0, 1], [1, 2]], [{ node: 0, type: 'pin' }, { node: 2, type: 'roller' }], [{ node: 1, fx: 0, fy: -P, m: 0 }], opts);
  return { RA: res.reactions[0].fy, RB: res.reactions[1].fy, M: -res.members[1].end[2], defl: -res.displacements[4] };
}
const fromUnit = (v, unit) => ({ 'N·m': v / 1e3, 'kN·m': v / 1e6 })[unit] ?? v;

const ENGINE = {
  'statics.supports': (p) => { const res = frame([[0, 0], [p.a, 0], [p.L, 0]], [[0, 1], [1, 2]], [{ node: 0, type: 'pin' }, { node: 2, type: 'roller' }], [{ node: 1, fx: p.F * Math.cos(deg(p.angle)), fy: -p.F * Math.sin(deg(p.angle)), m: 0 }]); return Math.abs(res.reactions[0].fx); },
  'statics.moment': (p, it) => {
    if (it.aspect === 'transfer') { const W = p.m * 9.81; return fromUnit(Math.abs(frame([[0, 0], [0, p.H], [p.x, p.H]], [[0, 1], [1, 2]], [{ node: 0, type: 'fixed' }], [{ node: 2, fx: 0, fy: -W, m: 0 }]).reactions[0].m), it.answer.unit); }
    if (it.figure.kind === 'arm') return fromUnit(Math.abs(frame([[0, 0], [p.r, 0]], [[0, 1]], [{ node: 0, type: 'fixed' }], [{ node: 1, fx: p.F * Math.cos(deg(p.angle)), fy: -p.F * Math.sin(deg(p.angle)), m: 0 }]).reactions[0].m), it.answer.unit);
    const [l1, l2] = p.loads;
    return fromUnit(Math.abs(frame([[0, 0], [l1.x, 0], [l2.x, 0]], [[0, 1], [1, 2]], [{ node: 0, type: 'fixed' }], [{ node: 1, fx: 0, fy: -l1.P, m: 0 }, { node: 2, fx: 0, fy: -l2.P, m: 0 }]).reactions[0].m), it.answer.unit);
  },
  'statics.equilibrium': (p) => { const W = p.m * 9.81, res = frame([[0, 0], [p.L, 0], [0, p.h]], [[0, 1, 'truss'], [2, 1, 'truss']], [{ node: 0, type: 'pin' }, { node: 2, type: 'pin' }], [{ node: 1, fx: 0, fy: -W, m: 0 }]); return -res.members[1].end[0]; },
  'statics.beam-reactions': (p) => { const r = ss(p.L, p.a, p.P); return p.ask === 'A' ? r.RA : r.RB; },
  'statics.cantilever': (p, it) => {
    const xs = [...new Set([0, p.L, ...p.loads.map(l => l.x)])].sort((a, b) => a - b);
    const res = frame(xs.map(x => [x, 0]), xs.slice(1).map((_, i) => [i, i + 1]), [{ node: 0, type: 'fixed' }], p.loads.map(l => ({ node: xs.indexOf(l.x), fx: 0, fy: -l.P, m: 0 })));
    return fromUnit(Math.abs(res.reactions[0].m), it.answer.unit);
  },
  'statics.bending-moment': (p, it) => fromUnit(ss(p.L, p.a, p.P).M, it.answer.unit),
  'solids.bending-stress': (p) => { const sec = section(p.section); return ss(p.L, p.a, p.P, { material: MATERIALS[p.material || 'steel'], sec }).M * sec.c / sec.I; },
  'solids.stiffness': (p) => p.after.shape ? ss(p.L, p.a, p.P, { material: MATERIALS[p.material], sec: section(p.after) }).defl : ss(p.L, p.a, p.P, { material: MATERIALS[p.after], sec: section(p.section) }).defl,
};
// Hand calculations (independent of the engine) for every number item.
const HAND = {
  'statics.components': p => p.F * (p.component === 'vertical' ? Math.sin(deg(p.angle)) : Math.cos(deg(p.angle))),
  'statics.supports': p => p.F * Math.cos(deg(p.angle)),
  'statics.lever-arm': p => (p.r !== undefined ? p.r * Math.sin(deg(p.angle)) : p.L * p.h / Math.sqrt(p.L ** 2 + p.h ** 2)),
  'statics.moment': (p, it) => it.aspect === 'transfer' ? p.m * 9.81 * p.x / 1e6 : p.r !== undefined ? p.F * p.r * Math.sin(deg(p.angle)) / 1e3 : Math.abs(p.loads[0].P * p.loads[0].x + p.loads[1].P * p.loads[1].x) / 1e3,
  'statics.couple': p => p.F * p.d / 1000,
  'statics.equilibrium': p => (p.W !== undefined ? p.W * p.a / p.b : p.m * 9.81 * Math.sqrt(p.L ** 2 + p.h ** 2) / p.h),
  'statics.beam-reactions': p => (p.ask === 'A' ? p.P * (p.L - p.a) / p.L : p.P * p.a / p.L),
  'statics.cantilever': p => p.loads.reduce((s, l) => s + l.P * l.x, 0) / 1000,
  'statics.bending-moment': (p, it) => fromUnit(p.P * p.a * (p.L - p.a) / p.L, it.answer.unit),
  'statics.second-moment': p => {
    if (p.shape === 'rect') return p.b * p.h ** 3 / 12;
    if (p.shape === 'rhs') return (p.b * p.h ** 3 - (p.b - 2 * p.t) * (p.h - 2 * p.t) ** 3) / 12;
    // I: two flanges by parallel axes + web
    const hw = p.h - 2 * p.tf, yf = (p.h - p.tf) / 2;
    return 2 * (p.b * p.tf ** 3 / 12 + p.b * p.tf * yf ** 2) + p.tw * hw ** 3 / 12;
  },
  'solids.bending-stress': p => { const M = p.P * p.a * (p.L - p.a) / p.L, { b, h } = p.section; return M * (h / 2) / (b * h ** 3 / 12); },
  'solids.stiffness': p => {   // simply supported point load: δ under the load = P a² b² / (3 E I L)
    const E = MATERIALS[p.material || p.after].E, s = p.after.shape ? p.after : p.section, I = s.b * s.h ** 3 / 12, b = p.L - p.a;
    return p.P * p.a ** 2 * b ** 2 / (3 * E * I * p.L);
  },
  'math.units': p => (p.mm !== undefined ? p.mm / 1000 : p.Nmm / 1000),
  'math.area': p => (p.shape === 'rect' ? p.b * p.h : p.b * p.h - (p.b - 2 * p.t) * (p.h - 2 * p.t)),
  'math.powers': p => p.h * p.h * p.h,
  'math.linear': p => p.P * p.a / p.L,
  'math.inverse': p => p.y1 * p.x1 / p.x2,
  'math.pair': p => p.P - p.P * p.a / p.L,
  'math.trig-ratios': p => p.hyp * Math.sin(deg(p.angle)),
  'math.trig': p => p.L * Math.sin(deg(p.angle)),
  'math.vectors': p => Math.sqrt(p.fx ** 2 + p.fy ** 2),
  'math.cross': p => p.rx * p.fy - p.ry * p.fx,
};

test('every engine-keyed item is re-solved from its params by the frame solver; every number item matches a hand calculation', () => {
  let engine = 0, hand = 0;
  for (const [id, g] of Object.entries(GEN)) for (const aspect of g.aspects) for (const seed of SEEDS) {
    const it = g.make(seed, aspect);
    if (it.answer.kind !== 'number') continue;
    const p = it.params;
    if (it.key === 'engine') { assert.ok(ENGINE[id], `no engine check for ${id}`); close(ENGINE[id](p, it), it.answer.value, 1e-9, 1e-9, `${it.id} engine`); engine++; }
    assert.ok(HAND[id], `no hand check for ${id}`);
    // Engine answers agree with the textbook formula to within the solver's round-off; formula answers exactly.
    close(HAND[id](p, it), it.answer.value, it.key === 'engine' ? 1e-6 : 1e-12, 1e-9, `${it.id} hand`); hand++;
    assert.ok(Math.abs(HAND[id](p, it) - it.answer.value) < it.answer.tol * Math.abs(it.answer.value) / 10);
  }
  assert.ok(engine > 600 && hand > 1500, `${engine} engine, ${hand} hand`);
});

test('second-moment items agree with core/sections.mjs', () => {
  for (const aspect of ['procedure', 'transfer']) for (const seed of SEEDS) {
    const it = GS['statics.second-moment'].make(seed, aspect);
    close(section(it.params).I, it.answer.value, 1e-12, 1e-9, it.id);
  }
});

// ---------- journey spec ----------
const DESIGNS = [ORIGINAL, { material: 'steel', shape: 'rect', b: 50, h: 80 }, { material: 'aluminium', shape: 'rhs', b: 50, h: 80, t: 4 },
  { material: 'steel', shape: 'I', b: 50, h: 80, tw: 4, tf: 6 }, { material: 'steel', shape: 'rect', b: 30, h: 75 }];
const setupsFor = d => [100, 200, 250, 300, 450, 500].map(m => ({ design: d, mount: m, loaded: true, dialX: m, strainX: m }));

test('journey: contract shape, bench adapter, anchor R1 is the original design and evaluates', async () => {
  assert.equal(J.id, 'support'); assert.equal(J.semester, 2); assert.match(J.course, /ME25C02/);
  assert.deepEqual({ page: J.bench.page, domain: J.bench.domain }, { page: '../mount/?project=current', domain: 'mount-stand' });
  assert.equal(await J.bench.adapter(), READING_ADAPTER);
  for (const k of ['2,500 N', '600 mm', '50 × 80 mm', '0.15 mm', 'yield ÷ 2', '2.5 kg']) assert.ok(J.brief.includes(k), k);
  assert.equal(J.anchor.revision, 'R1'); assert.deepEqual(J.anchor.setup.design, ORIGINAL); assert.equal(J.anchor.setup, ANCHOR_SETUP);
  const r = READING_ADAPTER.evaluate(J.anchor.setup);
  assert.ok(r.ok); assert.equal(r.verdicts.alignment.value, 'fail', 'the original support fails alignment: the reason to redesign');
  assert.ok(BY[J.target]); assert.equal(J.target, 'ENG.statics.moment-about-point');
  for (const [c, t] of Object.entries(J.teach)) {
    assert.ok(BY[c], c); assert.ok(GEN[t.items], t.items); assert.equal(GEN[t.items].competency, c); assert.ok(t.steps.length);
    if (t.explore) { assert.match(t.explore.page, /^\.\.\/playground\//); assert.ok(PRESETS.some(p => p.id === t.explore.preset), t.explore.preset); }
  }
  assert.ok(J.teach[J.target].explore.preset === 'shelf' && J.apply.transfer.preset === 'crane');
  assert.ok(J.apply.count >= 1 && J.check.count === 1 && J.return.decision === true);
  const src = readFileSync(new URL('../content/journeys/support.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../content/items/statics.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /document\.|window\.|localStorage|fetch\(/, 'content is pure: no DOM, storage or network');
});

test('journey: stuck truths come from the bench and match statics by hand; 200 mm and 300 mm differ', () => {
  const s = J.anchor.setup, out = READING_ADAPTER.evaluate(s).outputs, P = SPEC.load, L = SPEC.span, T = Object.fromEntries(J.stuck.predictions.map(p => [p.id, p.truth(s, out)]));
  for (const p of [...J.stuck.predictions, ...J.return.predictions]) assert.ok(p.unit && p.tol > 0 && p.tol < 0.1 && p.prompt);
  for (const p of J.stuck.predictions) assert.ok(Number.isFinite(T[p.id]));
  close(T['left-bolt-200'], P * (L - 200) / L, 1e-9, 1e-6); close(T['left-bolt-300'], P * 300 / L, 1e-9, 1e-6);
  close(T['peak-moment-200'], P * 200 * 400 / L / 1000, 1e-9, 1e-6); close(T['peak-moment-300'], P * L / 4 / 1000, 1e-9, 1e-6);
  assert.equal(T['peak-at-200'], 200);
  const tolOf = id => J.stuck.predictions.find(p => p.id === id).tol, outside = (x, id) => Math.abs(x - T[id]) > tolOf(id) * Math.abs(T[id]);
  assert.ok(outside(T['left-bolt-300'], 'left-bolt-200') && outside(T['peak-moment-300'], 'peak-moment-200'), '200 mm and 300 mm give different answers');
  // The common misses are outside tolerance: half the load on each bolt, peak bending at mid-span, P·L/4 at 200 mm.
  assert.ok(outside(P / 2, 'left-bolt-200') && outside(300, 'peak-at-200') && outside(P * L / 4 / 1000, 'peak-moment-200'));
});

test('journey: return predictions on the learner’s own setup equal the bench’s own model', () => {
  for (const d of DESIGNS) for (const s of setupsFor(d)) {
    const r = READING_ADAPTER.evaluate(s); assert.ok(r.ok, JSON.stringify(s));
    const st = stand(d, { mount: s.mount, loaded: true }), T = Object.fromEntries(J.return.predictions.map(p => [p.id, p.truth(s, r.outputs)]));
    close(T['own-left-bolt'] + T['own-right-bolt'], SPEC.load, 1e-9, 1e-6);
    close(T['own-left-bolt'], SPEC.load * (SPEC.span - s.mount) / SPEC.span, 1e-9, 1e-6);
    close(T['own-peak-moment'], Math.abs(st.at(s.mount).moment) / 1000, 1e-9, 1e-9);
    close(T['own-deflection'], r.outputs.deflection.value, 1e-12, 1e-12, 'dial at the mount');
  }
});

test('journey: defence questions are valid patched setups, answered by adapter.evaluate, and differ from the current reading', () => {
  for (const d of DESIGNS) for (const s of setupsFor(d)) {
    const before = READING_ADAPTER.evaluate(s).outputs, qs = J.defend(s, before);
    assert.ok(qs.length >= 2 && qs.length <= 3, `${qs.length} questions`);
    assert.deepEqual(qs.map(q => q.prompt), whatIfs(s).map(q => q.prompt));
    for (const q of qs) {
      const patched = { ...s, ...q.change }, r = READING_ADAPTER.evaluate(patched);
      assert.ok(r.ok, `${q.prompt}: ${r.reason}`); assert.ok(r.outputs[q.read], q.read); assert.ok(q.tol > 0 && q.tol < 0.1 && q.unit === r.outputs[q.read].unit);
      const v = r.outputs[q.read].value, st = stand(patched.design, { mount: patched.mount, loaded: true });
      close(v, q.read === 'deflection' ? st.at(patched.mount).deflection : st.at(patched.mount).stress, 1e-9, 1e-12);
      assert.ok(Math.abs(v - before[q.read].value) > q.tol * Math.abs(v), `${q.prompt}: the change must matter (${before[q.read].value} → ${v})`);
    }
    assert.ok(qs.some(q => q.change.mount !== undefined && q.change.mount !== s.mount), 'machine moved');
    assert.ok(qs.some(q => q.change.design && q.change.design.material !== d.material), 'material swapped');
  }
  // Same answers whether the evaluate call goes through the adapter or the model directly.
  const s = setupsFor(ORIGINAL)[1], q = J.defend(s, {})[0];
  assert.deepEqual(READING_ADAPTER.evaluate({ ...s, ...q.change }), evaluateReading({ ...s, ...q.change }));
});
