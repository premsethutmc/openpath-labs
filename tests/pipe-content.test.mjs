// Journey 2 (pipe sizing) content: graph, item generators, journey spec. Contract: docs/JOURNEYS.md.
// Engine-keyed items and defence answers are recomputed from engines/hydraulics and the fluid line bench;
// formula-keyed items are checked against an independent hand calculation from the item's own figure params.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { NODES } from '../content/graph/fluids.mjs';
import { GENERATORS, MISCONCEPTIONS } from '../content/items/fluids.mjs';
import J, { mainLoss } from '../content/journeys/pipe.mjs';
import * as C from '../circuit/model.mjs';
import { MISSIONS } from '../pumps/missions.mjs';
import { water, MATERIALS, FITTINGS, friction, pipeLoss } from '../engines/hydraulics/hydraulics.mjs';

const G = 9.81, SEEDS = Array.from({ length: 150 }, (_, i) => i);
const all = function* () { for (const [gid, g] of Object.entries(GENERATORS)) for (const a of g.aspects) for (const s of SEEDS) yield [gid, a, s, g.make(s, a)]; };
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12), `${msg}: ${a} vs ${b}`);
// School-engine ids, checked against premsethutmc/openpath main content/mathematics/curriculum.v1.json
const SCHOOL_IDS = ['MATH.measurement.unit-conversions', 'MATH.measurement.circle-area', 'MATH.number.square-roots', 'MATH.number.ratio',
  'MATH.number.proportion', 'MATH.number.scientific-notation', 'MATH.algebra.quadratics'];

test('graph: unique ids, known edges, no cycles, school nodes marked, each node has its generator', () => {
  const ids = new Set(NODES.map(n => n.id));
  assert.equal(ids.size, NODES.length);
  for (const n of NODES) {
    for (const e of [...n.requires, ...n.support]) assert.ok(ids.has(e), `${n.id} → unknown ${e}`);
    if (n.id.startsWith('MATH.')) { assert.equal(n.school, true); assert.equal(n.learnUrl, null); assert.ok(SCHOOL_IDS.includes(n.id), n.id); }
    else assert.match(n.id, /^ENG\.fluids\./);
    assert.ok(GENERATORS[n.items], `${n.id}: no generator ${n.items}`);
    assert.equal(GENERATORS[n.items].competency, n.id);
  }
  assert.ok(NODES.filter(n => n.id.startsWith('ENG.')).length >= 10);
  const seen = new Set(), stack = new Set(), by = Object.fromEntries(NODES.map(n => [n.id, n]));
  const visit = id => { assert.ok(!stack.has(id), `cycle at ${id}`); if (seen.has(id)) return; stack.add(id); by[id].requires.forEach(visit); stack.delete(id); seen.add(id); };
  NODES.forEach(n => visit(n.id));
  // the curriculum map's chain: head loss → Darcy–Weisbach, Reynolds number, energy equation → unit conversion, ratios
  const pre = id => { const out = new Set(), go = x => by[x].requires.forEach(r => { if (!out.has(r)) { out.add(r); go(r); } }); go(id); return out; };
  const dw = pre('ENG.fluids.darcy-weisbach');
  for (const x of ['ENG.fluids.reynolds', 'ENG.fluids.friction-factor', 'ENG.fluids.energy-equation', 'MATH.measurement.unit-conversions', 'MATH.number.ratio']) assert.ok(dw.has(x), x);
  for (const gid of Object.keys(GENERATORS)) assert.ok(NODES.some(n => n.items === gid), `generator ${gid} has no node`);
});

test('items: deterministic, well formed, misconceptions distinct from the answer', () => {
  for (const [gid, a, s, it] of all()) {
    const tag = `${gid}/${a}/${s}`;
    assert.deepEqual(GENERATORS[gid].make(s, a), it, `${tag} not deterministic`);
    assert.deepEqual(JSON.parse(JSON.stringify(it)), it, `${tag} not plain data`);
    assert.equal(it.competency, GENERATORS[gid].competency); assert.equal(it.aspect, a); assert.equal(it.id, `${gid}:${a}:${s}`);
    assert.ok(typeof it.prompt === 'string' && it.prompt.length > 10 && !/NaN|undefined|Infinity/.test(it.prompt), `${tag} prompt: ${it.prompt}`);
    assert.ok(Array.isArray(it.solution) && it.solution.length && it.solution.every(x => typeof x === 'string' && !/NaN|undefined/.test(x)), `${tag} solution`);
    assert.ok(['engine', 'formula'].includes(it.key));
    assert.ok(it.figure && typeof it.figure.kind === 'string' && it.figure.params);
    for (const m of it.misconceptions) { assert.ok(MISCONCEPTIONS[m.id], `${tag}: unknown misconception ${m.id}`); assert.equal(m.label, MISCONCEPTIONS[m.id]); }
    if (it.answer.kind === 'number') {
      assert.ok(Number.isFinite(it.answer.value) && it.answer.tol > 0 && typeof it.answer.unit === 'string', `${tag} answer`);
      for (const m of it.misconceptions) assert.ok(Number.isFinite(m.value) && Math.abs(m.value - it.answer.value) > it.answer.tol * Math.abs(it.answer.value), `${tag}: ${m.id} ${m.value} within tol of ${it.answer.value}`);
    } else {
      assert.equal(it.answer.kind, 'choice');
      const o = it.answer.options;
      assert.equal(new Set(o).size, o.length, `${tag} duplicate options`);
      assert.ok(Number.isInteger(it.answer.correct) && o[it.answer.correct] !== undefined);
      for (const m of it.misconceptions) assert.ok(m.option >= 0 && m.option < o.length && m.option !== it.answer.correct, `${tag} misconception option`);
    }
  }
  for (const [gid, g] of Object.entries(GENERATORS)) {
    assert.deepEqual(g.aspects, ['concept', 'procedure', 'transfer'], gid);
    for (const a of g.aspects) assert.ok(new Set(SEEDS.slice(0, 40).map(s => JSON.stringify(g.make(s, a)))).size > 1, `${gid}/${a}: seeds give one item`);
  }
  // the six misconceptions this journey must name all appear somewhere
  const used = new Set([...all()].flatMap(([, , , it]) => it.misconceptions.map(m => m.id)));
  for (const id of ['diameter-as-radius', 'no-lps-conversion', 'laminar-in-turbulent', 'loss-linear-in-v', 'ignore-static-head', 'add-pump-and-system']) assert.ok(used.has(id), id);
});

// ---------- recomputation: engine-keyed from the engine, formula-keyed by hand ----------
const A = D_mm => Math.PI * (D_mm / 1000) ** 2 / 4;
const optText = it => it.answer.options[it.answer.correct];
const ENGINE = {
  'fluids.energy:transfer': it => { const r = C.evaluate(it.figure.params.setup); const hf = -r.sol.steps.find(s => s.index === 5 && s.kind === 'friction').dH;
    near((r.outputs['gauge:p5'].value - r.outputs['gauge:p6'].value) * 1000 / (r.sol.water.rho * G), hf, 1e-6, 'gauge drop = friction'); return hf; },
  'fluids.reynolds:concept': it => { const p = it.figure.params; return { laminar: 'Laminar', transitional: 'Transitional (uncertain)', turbulent: 'Turbulent' }[pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: 1, material: 'pvc', K: 0 }, water(p.T)).regime]; },
  'fluids.reynolds:procedure': it => { const p = it.figure.params; return pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: 1, material: 'pvc', K: 0 }, water(p.T)).Re; },
  'fluids.reynolds:transfer': it => 2000 * water(it.figure.params.T).nu / (it.figure.params.D_mm / 1000),
  'fluids.roughness:procedure': it => MATERIALS[it.figure.params.material].eps / (it.figure.params.D_mm / 1000),
  'fluids.roughness:transfer': it => { const p = it.figure.params; return MATERIALS.gi.eps / p.D1_mm > MATERIALS.oldgi.eps / p.D2_mm ? `New GI, ${p.D1_mm} mm` : `Rusted GI, ${p.D2_mm} mm`; },
  'fluids.friction-factor:concept': it => friction(it.figure.params.Re, 1e-4).regime === 'laminar' ? '64/Re' : 'Colebrook–White (or the Moody chart) with Re and ε/D',
  'fluids.friction-factor:procedure': it => friction(it.figure.params.Re, MATERIALS[it.figure.params.material].eps / (it.figure.params.D_mm / 1000)).f,
  'fluids.friction-factor:transfer': it => { const p = it.figure.params; return pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: 1, material: p.material, K: 0 }, water(p.T)).f; },
  'fluids.head-loss:procedure': it => { const p = it.figure.params; return pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: p.L, material: p.material, K: 0 }, water(p.T)).hf; },
  'fluids.head-loss:transfer': it => { const p = it.figure.params; return pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: p.L, material: p.material, K: 0 }, water(p.T)).hf; },
  'fluids.minor-loss:procedure': it => { const p = it.figure.params; return (p.elbows * FITTINGS.elbow + FITTINGS.checkValve) * p.V ** 2 / (2 * G); },
  'fluids.minor-loss:transfer': it => { const p = it.figure.params; return pipeLoss(p.Q_Lps / 1000, { D: p.D_mm / 1000, L: 1, material: 'pvc', K: p.elbows * FITTINGS.elbow + FITTINGS.footValve }, water(20)).hm; },
  'fluids.shaft-power:transfer': it => { const r = C.evaluate(it.figure.params.setup), o = r.outputs;
    near(r.sol.water.rho * G * o.flow.value / 1000 * o.pumpHead.value / (o.shaftPower.value * 1000), r.sol.pump.efficiency, 1e-9, 'η = ρgQH/P'); return r.sol.pump.efficiency * 100; },
};
const HAND = {
  'fluids.math.units:concept': () => '0.001 m³/s',
  'fluids.math.units:procedure': ({ Q }) => Q * 1e-3,
  'fluids.math.units:transfer': ({ D_mm, Q_Lps }) => (Q_Lps * 1e-3) / (D_mm * 1e-3),
  'fluids.math.circle-area:concept': () => '4 times',
  'fluids.math.circle-area:procedure': ({ D_mm }) => 3.141592653589793 * 0.25 * (D_mm * 1e-3) ** 2,
  'fluids.math.circle-area:transfer': ({ D1_mm, D2_mm }) => (D1_mm * D1_mm) / (D2_mm * D2_mm),
  'fluids.math.squares:concept': ({ k }) => `${k * k} times`,
  'fluids.math.squares:procedure': ({ V }) => V * V / 19.62,
  'fluids.math.squares:transfer': ({ h }) => (19.62 * h) ** 0.5,
  'fluids.math.ratio:concept': () => '2 : 1',
  'fluids.math.ratio:procedure': ({ D1_mm, D2_mm }) => (D1_mm * D1_mm) / (D2_mm * D2_mm),
  'fluids.math.ratio:transfer': ({ eps_mm, D_mm }) => eps_mm / D_mm,
  'fluids.math.proportion:concept': () => 'It doubles',
  'fluids.math.proportion:procedure': ({ L1, h1, L2 }) => h1 / L1 * L2,
  'fluids.math.proportion:transfer': ({ Q1, h1, Q2 }) => h1 / (Q1 * Q1) * Q2 * Q2,
  'fluids.math.sci:concept': () => '0.000001',
  'fluids.math.sci:procedure': ({ V, D, nu }) => V * D / nu,
  'fluids.math.sci:transfer': ({ m, e }) => { const x = m * 10 ** e; return x < 2000 ? 'Below 2000' : x > 4000 ? 'Above 4000' : 'Between 2000 and 4000'; },
  'fluids.math.intersect:concept': () => 'The x and y where both equations hold at once',
  'fluids.math.intersect:procedure': ({ H0, a, Hs, k }) => ((H0 - Hs) / (a + k)) ** 0.5,
  'fluids.math.intersect:transfer': ({ H0, a, Hs, k }) => Hs + k * (H0 - Hs) / (a + k),
  'fluids.flow-rate:concept': () => '4 times faster',
  'fluids.flow-rate:procedure': ({ D_mm, Q_Lps }) => Q_Lps * 1e-3 / A(D_mm),
  'fluids.flow-rate:transfer': ({ D_mm, V, vol_L }) => vol_L * 1e-3 / (A(D_mm) * V) / 60,
  'fluids.continuity:concept': () => 'The same in both',
  'fluids.continuity:procedure': ({ D1_mm, D2_mm, V1 }) => V1 * A(D1_mm) / A(D2_mm),
  'fluids.continuity:transfer': ({ D1_mm, V1 }) => A(D1_mm) * V1 * 1000,
  'fluids.energy:concept': () => 'Friction turns some of the water\'s energy into heat',
  'fluids.energy:procedure': ({ p1, z1, z2, hL }) => (p1 * 1000 / (1000 * G) + z1 - z2 - hL) * 1000 * G / 1000,
  'fluids.roughness:concept': () => 'It rises',
  'fluids.head-loss:concept': ({ byFlow }) => byFlow ? 'About 4 times larger' : 'Twice as large',
  'fluids.minor-loss:concept': () => 'The velocity head at its bore (h = K·V²/2g)',
  'fluids.system-curve:concept': () => 'The static lift (tank level minus sump level)',
  'fluids.system-curve:procedure': ({ Hs, Q1, h1, Q2 }) => Hs + h1 * (Q2 / Q1) ** 2,
  'fluids.system-curve:transfer': ({ Hs, h, dz }) => Hs + h + dz,
  'fluids.operating-point:concept': () => 'Where its head–flow curve meets the system curve',
  'fluids.operating-point:procedure': ({ H0, a, Hs, k }) => ((H0 - Hs) / (a + k)) ** 0.5,
  'fluids.operating-point:transfer': ({ H0, a, Hs, k }) => H0 - a * (H0 - Hs) / (a + k),
  'fluids.shaft-power:concept': () => 'The shaft power ρgQH/η',
  'fluids.shaft-power:procedure': ({ Q, H, eta }) => 1000 * G * (Q / 1000) * H / (eta / 100) / 1000,
  'fluids.npsh:concept': () => 'NPSH available falls, so cavitation is more likely',
  'fluids.npsh:procedure': ({ patm, pv, z, hl }) => (patm - pv) / G - z - hl,
  'fluids.npsh:transfer': ({ patm, pv, hl, npshr, margin }) => (patm - pv) / G - hl - npshr - margin,
};

test('every engine-keyed item is recomputed from the engine (all seeds)', () => {
  let n = 0;
  for (const [gid, a, s, it] of all()) {
    if (it.key !== 'engine') continue;
    const f = ENGINE[`${gid}:${a}`]; assert.ok(f, `no engine recomputation for ${gid}:${a}`);
    const want = f(it); n++;
    if (it.answer.kind === 'choice') assert.equal(optText(it), want, `${gid}/${a}/${s}`);
    else assert.ok(Math.abs(it.answer.value - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${gid}/${a}/${s}: ${it.answer.value} vs engine ${want}`);
  }
  assert.ok(n > 1500, `only ${n} engine items`);
});

test('every formula-keyed item matches an independent hand calculation (all seeds)', () => {
  for (const [gid, a, s, it] of all()) {
    if (it.key !== 'formula') continue;
    const f = HAND[`${gid}:${a}`]; assert.ok(f, `no hand calculation for ${gid}:${a}`);
    const want = f(it.figure.params);
    if (it.answer.kind === 'choice') assert.equal(optText(it), want, `${gid}/${a}/${s}`);
    else near(it.answer.value, want, 1e-9, `${gid}/${a}/${s}`);
  }
});

test('turbulent friction factors agree with an independent explicit formula (Swamee–Jain, within 3 %)', () => {
  for (const s of SEEDS) {
    const it = GENERATORS['fluids.friction-factor'].make(s, 'procedure'), { Re, material, D_mm } = it.figure.params, rr = MATERIALS[material].eps / (D_mm / 1000);
    near(it.answer.value, 0.25 / Math.log10(rr / 3.7 + 5.74 / Re ** 0.9) ** 2, 0.03, `seed ${s}`);
    assert.ok(it.answer.tol >= 0.03, 'a Moody-chart or Swamee–Jain answer is accepted');
  }
});

// ---------- journey spec ----------
const evalJ = s => C.ADAPTER.evaluate(JSON.parse(JSON.stringify(s)));

test('journey spec: shape, bench, graph links, teach entries', async () => {
  assert.equal(J.id, 'pipe'); assert.equal(J.semester, 4); assert.match(J.course, /^CE25C12 /);
  assert.equal(J.bench.page, '../circuit/'); assert.equal(J.bench.domain, 'fluids-line');
  const ad = await J.bench.adapter(); assert.equal(ad, C.ADAPTER); assert.equal(ad.domain, 'fluids-line');
  assert.ok(J.brief.length > 50); assert.equal(J.anchor.revision, 'Revision 1');
  const ids = new Set(NODES.map(n => n.id)), presets = { '../circuit/': C.PRESETS.map(p => p.id), '../pumps/': MISSIONS.map(m => m.id) };
  assert.ok(ids.has(J.target)); assert.ok(J.teach[J.target]);
  for (const [comp, t] of Object.entries(J.teach)) {
    assert.ok(ids.has(comp), comp); assert.equal(GENERATORS[t.items].competency, comp);
    assert.ok(t.steps.length && t.steps.every(x => typeof x === 'string'));
    if (t.explore) { assert.ok(existsSync(new URL(`../${t.explore.page.replace('../', '')}index.html`, import.meta.url)), t.explore.page); assert.ok(presets[t.explore.page].includes(t.explore.preset), `${comp}: ${t.explore.preset}`); }
  }
  for (const r of NODES.find(n => n.id === J.target).requires) if (!r.startsWith('MATH.')) assert.ok(J.teach[r], `no teach entry for prerequisite ${r}`);
  assert.ok(C.PRESETS.some(p => p.id === J.apply.transfer.preset)); assert.equal(J.apply.count, 3); assert.equal(J.check.count, 1); assert.equal(J.return.decision, true);
  const src = readFileSync(new URL('../content/journeys/pipe.mjs', import.meta.url), 'utf8');
  assert.ok(!/\b(document|window|localStorage|fetch)\b/.test(src), 'the spec is data and pure functions');
});

test('anchor: a valid fluid line that misses the target flow; the brief is solvable on the bench', () => {
  const s = J.anchor.setup, r = evalJ(s);
  assert.deepEqual(s, C.fromPreset('farm'));
  assert.ok(r.ok); assert.equal(r.verdicts.flow.value, 'fail'); assert.equal(r.verdicts.drive.value, 'pass');
  assert.ok(r.outputs.flow.value < s.requiredFlow);
  // one bore up passes both verdicts; two up overloads the motor (the design trade-off)
  const t = C.fromPreset('farm'); C.setParam(t, 'p6', 'D', 0.04); C.setParam(t, 'p9', 'D', 0.04);
  const r2 = evalJ(t); assert.equal(r2.verdicts.flow.value, 'pass'); assert.equal(r2.verdicts.drive.value, 'pass');
  C.setParam(t, 'p6', 'D', 0.05); C.setParam(t, 'p9', 'D', 0.05); assert.equal(evalJ(t).verdicts.drive.value, 'fail');
  // the practice twin also starts short and can be fixed
  const w = C.fromPreset('farm-twin'); assert.equal(evalJ(w).verdicts.flow.value, 'fail');
  C.setParam(w, 'p6', 'D', 0.05); C.setParam(w, 'p10', 'D', 0.05); const rw = evalJ(w);
  assert.equal(rw.verdicts.flow.value, 'pass'); assert.equal(rw.verdicts.drive.value, 'pass');
  // a saved setup reloads to the same results
  assert.deepEqual(evalJ(JSON.parse(JSON.stringify(s))), r);
});

test('stuck and return predictions: truths come from the bench, recomputed independently', () => {
  const s = J.anchor.setup, o = evalJ(s).outputs, P = Object.fromEntries(J.stuck.predictions.map(p => [p.id, p]));
  for (const p of [...J.stuck.predictions, ...J.return.predictions]) { assert.ok(p.prompt && p.unit && p.tol > 0); assert.ok(Number.isFinite(p.truth(s, o)), p.id); }
  assert.equal(P.flow.truth(s, o), o.flow.value);
  near(P['main-loss'].truth(s, o), (o['gauge:p5'].value - o['gauge:p6'].value) * 1000 / (water(s.temp).rho * G), 1e-6, 'main loss = gauge drop / ρg');
  const long = JSON.parse(JSON.stringify(s)); C.setParam(long, 'p6', 'L', 160);
  assert.equal(P['flow-long'].truth(s, o), evalJ(long).outputs.flow.value);
  assert.ok(Math.abs(P['flow-long'].truth(s, o) - o.flow.value) > P['flow-long'].tol * o.flow.value, 'doubling the main makes a visible difference');
  // return predictions on a learner's own revision (bigger bore, a shorter route, a part moved)
  const mine = C.fromPreset('farm'); C.setParam(mine, 'p6', 'D', 0.04); C.setParam(mine, 'p9', 'D', 0.04); C.setParam(mine, 'p6', 'L', 70);
  const om = evalJ(mine).outputs, R = Object.fromEntries(J.return.predictions.map(p => [p.id, p]));
  assert.equal(R.flow.truth(mine, om), om.flow.value); assert.equal(R['shaft-power'].truth(mine, om), om.shaftPower.value);
  near(R['main-loss'].truth(mine, om), (om['gauge:p5'].value - om['gauge:p6'].value) * 1000 / (water(mine.temp).rho * G), 1e-6, 'revised main loss');
  near(mainLoss(mine), pipeLoss(om.flow.value / 1000, { D: 0.04, L: 70, material: 'pvc', K: 0 }, water(mine.temp)).hf, 1e-6, 'Darcy–Weisbach at the bench flow');
});

test('defend: 2–3 what-ifs on the learner\'s own setup, answered by the bench on valid patched setups', () => {
  const designs = [J.anchor.setup];
  const a = C.fromPreset('farm'); C.setParam(a, 'p6', 'D', 0.04); C.setParam(a, 'p9', 'D', 0.04); designs.push(a);
  const b = C.fromPreset('farm'); C.setParam(b, 'p6', 'D', 0.05); C.setParam(b, 'p9', 'D', 0.05); C.setParam(b, 'p5', 'open', 0.5); designs.push(b);
  const c = C.fromPreset('farm'); C.setParam(c, 'p6', 'D', 0.063); C.setParam(c, 'p9', 'D', 0.063); C.setParam(c, 'p6', 'L', 1500); C.removePart(c, 'p7'); designs.push(c);
  designs.push(C.fromPreset('farm-twin'), C.fromPreset('pumpset'));
  for (const s of designs) {
    const before = JSON.stringify(s), base = evalJ(s), qs = J.defend(s, base.outputs);
    assert.equal(JSON.stringify(s), before, 'defend must not change the learner\'s setup');
    assert.ok(qs.length >= 2 && qs.length <= 3, `${qs.length} questions`);
    for (const q of qs) {
      assert.ok(q.prompt && q.read === 'flow' && q.tol > 0);
      const patched = { ...JSON.parse(JSON.stringify(s)), ...q.change }, r = evalJ(patched);
      assert.ok(r.ok, q.prompt); assert.ok(Number.isFinite(r.outputs[q.read].value));
      // the same change replayed as bench edits gives the same setup and answer
      const replay = JSON.parse(JSON.stringify(s)); for (const [fn, ...args] of q.edits) ({ setParam: C.setParam, addPart: C.addPart })[fn](replay, ...args);
      assert.deepEqual(replay, patched); assert.equal(evalJ(replay).outputs.flow.value, r.outputs.flow.value);
      assert.notDeepEqual(patched, s);
    }
  }
  // on the anchor: bigger bore → more flow, longer → less, elbows → slightly less
  const qs = J.defend(J.anchor.setup), base = evalJ(J.anchor.setup).outputs.flow.value, f = q => evalJ({ ...J.anchor.setup, ...q.change }).outputs.flow.value;
  assert.equal(qs.length, 3); assert.ok(f(qs[0]) > base * (1 + qs[0].tol)); assert.ok(f(qs[1]) < base * (1 - qs[1].tol)); assert.ok(f(qs[2]) < base && f(qs[2]) > f(qs[1]));
});

test('every "Explore on the bench" and transfer link names a preset its bench opens', () => {
  const links = [...Object.values(J.teach).map(t => t.explore).filter(Boolean), J.apply.transfer];
  assert.ok(links.length >= 8);
  for (const { page, preset } of links) {
    if (page === '../circuit/') assert.ok(C.presetFromQuery(`?preset=${preset}`), `circuit preset ${preset}`);
    else if (page === '../pumps/') assert.ok(MISSIONS.some(m => m.id === preset), `Pump House mission ${preset}`);
    else assert.fail(`unknown bench ${page}`);
  }
});
