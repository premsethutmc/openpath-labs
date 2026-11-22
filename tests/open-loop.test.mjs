// Open loop (docs/OPEN_LOOP.md): a runner spec built from the learner's own project on a fixture bench
// (tests/fixtures/bench/learn.mjs: the Mount test stand's physics under the domain 'fixture-stand', fixture concepts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSpec, mostMissed, defendFrom, relError, patchAt, outputsOf, DEFAULT_TOL } from '../core/open-loop.mjs';
import { createRunner, applyPatch, JourneyError } from '../core/journey.mjs';
import { openLedger } from '../core/ledger.mjs';
import * as P from '../core/project.mjs';
import { loadContent, listBenches } from '../journeys/load.mjs';
import { BENCHES } from '../content/benches.mjs';
import { LEARN } from './fixtures/bench/learn.mjs';
import { READING_ADAPTER } from '../mount/model.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const MINE = { design: { material: 'aluminium', shape: 'rect', b: 35, h: 42 }, loaded: true, mount: 200, dialX: 200, strainX: 200 };
const truth = s => READING_ADAPTER.evaluate(JSON.parse(JSON.stringify(s))).outputs;      // computed apart from the runner
async function setup(design = MINE) {
  const storage = memory(), content = await loadContent({ content: LEARN.content });
  assert.deepEqual([content.skipped, content.problems], [[], []]);
  const adapter = await LEARN.adapter(), ledger = openLedger(storage), store = P.openStore(LEARN.domain, storage);
  // the learner's own project, built on the bench, with a run of their own already saved
  const project = store.put(P.createProject({ domain: LEARN.domain, name: 'My bracket', setup: design }));
  P.saveRun(project, adapter, 'my first try'); store.put(project); store.open(project.id);
  const deps = { adapter, graph: content.graph, items: content.items, ledger, store, nonce: 77 };
  return { storage, adapter, ledger, store, project, deps, ...content };
}
const key = (ctx, R) => { const ref = R.state.item.ref; return ctx.items.make(ref.generator, ref.seed, ref.aspect).answer; };
const right = (ctx, R) => { const a = key(ctx, R); return a.kind === 'choice' ? a.correct : `${a.value} ${a.unit}`.trim(); };
const wrong = (ctx, R) => { const a = key(ctx, R); return a.kind === 'choice' ? (a.correct + 1) % a.options.length : `${a.value * 3 + 7} ${a.unit}`.trim(); };

test('openSpec: brief, anchor and choices come from the learner\'s own project and the bench\'s outputs', async () => {
  const ctx = await setup(), spec = openSpec({ learn: LEARN, project: ctx.project, graph: ctx.graph, items: ctx.items, results: truth(MINE) });
  assert.equal(spec.id, `open:fixture-stand:${ctx.project.id}`);
  assert.deepEqual([spec.title, spec.course], ['Your design', 'My bracket']);
  assert.deepEqual(spec.bench, { page: LEARN.page, domain: LEARN.domain, adapter: LEARN.adapter });
  assert.deepEqual(spec.anchor, { project: ctx.project.id, setup: MINE, revision: 'Revision 1' });
  assert.equal(spec.describe, LEARN.describe);
  assert.deepEqual(spec.stuck.choose, { options: [{ id: 'deflection', prompt: 'Dial reading', unit: 'mm' }, { id: 'stress', prompt: 'Stress at the gauge', unit: 'MPa' }, { id: 'mass', prompt: 'Mass', unit: 'kg' }], min: 1, max: 3 });
  const preds = spec.stuck.predictions(['stress', 'mass', 'nope']);
  assert.deepEqual(preds.map(p => [p.id, p.unit, p.tol]), [['stress', 'MPa', DEFAULT_TOL], ['mass', 'kg', 0.02]]);
  const out = truth(MINE);
  assert.equal(preds[0].truth(MINE, out), out.stress.value);
  // teach entries: every output's concept and its mandatory prerequisites that have items, with a worked example
  assert.deepEqual(Object.keys(spec.teach).sort(), ['FIX.lever', 'FIX.product', 'FIX.ratio']);
  assert.equal(spec.teach['FIX.lever'].items, 'fix.lever');
  assert.equal(spec.teach['FIX.lever'].explore.page, LEARN.page);
  assert.match(spec.teach['FIX.lever'].steps[0], /^Worked example: /);
  assert.equal(spec.apply.count, 3); assert.equal(spec.check.count, 1); assert.equal(spec.return.decision, true);
  // picked in advance; unknown picks dropped; at most three
  assert.deepEqual(openSpec({ learn: LEARN, project: ctx.project, picked: ['mass', 'x', 'mass'] }).stuck.choose.picked, ['mass']);
  assert.throws(() => openSpec({ learn: LEARN, project: ctx.project, picked: ['x'] }), /none of the picked/);
  assert.throws(() => openSpec({ learn: LEARN, project: { ...ctx.project, domain: 'other' } }), /belongs to other/);
  assert.throws(() => openSpec({ learn: LEARN, project: { ...ctx.project, id: null } }), /saved project/);
  // outputs the run does not have are not offered
  assert.deepEqual(Object.keys(outputsOf(LEARN, MINE, { stress: out.stress })), ['stress']);
});

test('target: the competency of the picked output missed most (relative error); a tie goes to the first picked', () => {
  const row = (id, predicted, t) => ({ id, predicted, truth: t, result: Math.abs(predicted - t) <= 0.05 * Math.abs(t) ? 'correct' : 'incorrect' });
  assert.equal(mostMissed([row('deflection', 2, 1), row('stress', 30, 10)], ['deflection', 'stress']), 'stress');      // 100 % vs 200 %
  assert.equal(mostMissed([row('deflection', 3, 1), row('stress', 30, 10)], ['deflection', 'stress']), 'deflection');  // tie: first picked
  assert.equal(mostMissed([row('stress', 30, 10), row('deflection', 3, 1)], ['deflection', 'stress']), 'deflection');  // order of picking, not of rows
  assert.equal(mostMissed([row('deflection', 1.01, 1), row('stress', 10.3, 10)], ['deflection', 'stress']), 'stress'); // nothing missed: largest error
  assert.equal(mostMissed(null, ['mass', 'stress']), 'mass');                                                          // "I'm stuck" before running
  assert.equal(relError(0.5, 0), 0.5); assert.equal(relError(NaN, 1), Infinity);
});

test('runner on an open spec: Revision 1 is a run on the learner\'s existing project; the target is chosen after the stuck round', async () => {
  const ctx = await setup(), out = truth(MINE);
  for (const [miss, want] of [['stress', 'FIX.lever'], ['deflection', 'FIX.ratio']]) {
    const spec = openSpec({ learn: LEARN, project: ctx.store.get(ctx.project.id), graph: ctx.graph, items: ctx.items });
    const R = createRunner(spec, ctx.deps);
    assert.equal(R.view().target, null, 'no target before the learner has predicted');
    const before = ctx.store.list().length, runs = ctx.store.get(ctx.project.id).runs.length;
    R.start();
    assert.equal(R.state.projectId, ctx.project.id, 'their own project, not a new one');
    assert.equal(ctx.store.list().length, before);
    const p = ctx.store.get(ctx.project.id), r1 = p.runs.find(r => r.id === R.state.r1);
    assert.equal(p.runs.length, runs + 1); assert.equal(r1.name, 'Revision 1 · starting design'); assert.deepEqual(r1.setup, MINE);
    assert.equal(p.origin, 'scratch', 'the project keeps its own origin'); assert.equal(ctx.store.current().id, p.id);
    // choosing what to predict
    assert.throws(() => R.lockStuck({}), /Pick what you will predict/);
    assert.throws(() => R.stuck(), /Pick what you will predict/);
    assert.equal(R.choose([]).ok, false); assert.equal(R.choose(['deflection', 'stress', 'mass', 'x']).ok, true);
    assert.deepEqual(R.view().choose.picked, ['deflection', 'stress', 'mass']);
    assert.equal(R.choose(['deflection', 'stress']).ok, true);
    assert.deepEqual(R.view().predictions.map(x => x.id), ['deflection', 'stress']);
    const v = { deflection: out.deflection.value * (miss === 'deflection' ? 3 : 1.5), stress: out.stress.value * (miss === 'stress' ? 3 : 1.5) };
    assert.equal(R.lockStuck({ deflection: String(v.deflection), stress: `${v.stress} MPa` }).ok, true);
    assert.throws(() => R.choose(['mass']), JourneyError, 'no change after locking');
    R.runStuck();
    assert.deepEqual(R.view().scored.map(s => [s.id, s.truth, s.result]), [['deflection', out.deflection.value, 'incorrect'], ['stress', out.stress.value, 'incorrect']]);
    R.stuck();
    assert.equal(R.state.target, want); assert.equal(R.view().target.id, want);
    // resuming keeps the chosen target
    assert.equal(createRunner(spec, ctx.deps, R.state).view().target.id, want);
  }
  // a project that has gone
  const spec = openSpec({ learn: LEARN, project: ctx.project });
  ctx.store.remove(ctx.project.id);
  assert.throws(() => createRunner(spec, ctx.deps).start(), /no longer in this browser/);
});

test('defence from levers: changed levers go back to Revision 1; with none changed, ±20 % or the next option; only valid setups', async () => {
  const ctx = await setup(), adapter = ctx.adapter;
  const R1 = { ...MINE, design: { ...MINE.design } }, R2 = { ...MINE, design: { material: 'steel', shape: 'rect', b: 35, h: 50 } };
  let qs = defendFrom(LEARN, R2, { from: R1, picked: ['deflection', 'stress'], adapter });
  assert.deepEqual(qs.map(q => [q.read, q.change.design.material, q.change.design.h]), [['deflection', 'aluminium', 50], ['stress', 'steel', 42]]);
  assert.match(qs[0].prompt, /^What would the dial reading be if the material went back to its Revision 1 value \(aluminium instead of steel\)\?$/);
  assert.match(qs[1].prompt, /the depth went back to its Revision 1 value \(42 mm instead of 50 mm\)/);
  // a revert that the bench refuses is left out (R1 outside the envelope: 90 mm deep is not a valid design)
  qs = defendFrom(LEARN, R2, { from: { ...R1, design: { ...R1.design, h: 90 } }, picked: ['stress'], adapter });
  assert.deepEqual(qs.map(q => q.change.design.material), ['aluminium'], 'only the valid revert');
  // nothing changed: first two levers; the next material, and +20 % depth unless that is invalid (70 → 84 > 80 → 56)
  const deep = { ...MINE, design: { ...MINE.design, h: 70 } };
  qs = defendFrom(LEARN, deep, { from: deep, picked: ['mass'], adapter });
  assert.deepEqual(qs.map(q => [q.change.design.material, q.change.design.h]), [['steel', 70], ['aluminium', 56]]);
  assert.match(qs[1].prompt, /the depth were 56 mm instead of 70 mm/);
  assert.equal(qs[0].tol, 0.02, 'the output\'s own tolerance');
  qs = defendFrom(LEARN, MINE, { from: MINE, picked: ['mass'], adapter });
  assert.equal(qs[1].change.design.h, 50.4);
  for (const q of qs) assert.ok(adapter.evaluate(applyPatch(MINE, q.change)).ok);
  // lists stay lists in a patch
  assert.deepEqual(patchAt({ chain: [{ a: 1 }, { a: 2 }], k: 1 }, 'chain.1.a', 5), { chain: [{ a: 1 }, { a: 5 }] });
  assert.deepEqual(defendFrom(LEARN, MINE, { from: MINE, picked: [] }), []);
});

test('the open loop end to end in the runner: miss → teach → check → return to their project → tested Revision 2 → defend', async () => {
  const ctx = await setup(), spec = openSpec({ learn: LEARN, project: ctx.project, graph: ctx.graph, items: ctx.items });
  let R = createRunner(spec, ctx.deps);
  R.start(); R.choose(['stress', 'deflection']);
  const o1 = truth(MINE);
  R.lockStuck({ stress: String(o1.stress.value * 4), deflection: String(o1.deflection.value) }); R.runStuck();
  assert.equal(R.view().outcome, 'missed'); R.stuck();
  assert.equal(R.state.target, 'FIX.lever');
  for (let g = 0; !R.view().result && g < 5; g++) { const it = R.view().item; R.answer(it.competency === 'FIX.ratio' ? right(ctx, R) : wrong(ctx, R)); R.next(); }
  R.next();
  for (let g = 0; R.view().phase === 'teach' && g < 20; g++) { const v = R.view(); if (v.stage === 'lesson') { R.next(); continue; } R.showSolution(); R.answer(right(ctx, R)); R.next(); }
  assert.equal(R.view().phase, 'apply');
  while (R.view().phase === 'apply') { if (R.view().stage === 'transfer') { assert.equal(R.view().transfer.href, LEARN.page); R.next(); break; } R.answer(right(ctx, R)); R.next(); }
  R.answer(right(ctx, R)); R.next();
  assert.equal(R.view().status, 'independent-after-help');
  R.toDesign();
  // the learner changes their own project on the bench
  const bench = P.openStore(LEARN.domain, ctx.storage), bp = bench.current();
  assert.equal(bp.id, ctx.project.id);
  const R2 = { ...MINE, design: { ...MINE.design, material: 'steel', h: 48 } };
  bp.setup = R2; bench.put(bp);
  assert.deepEqual(R.view().predictions.map(p => p.id), ['stress', 'deflection'], 'the same picked outputs on the revised design');
  const o2 = truth(R2);
  R.lockReturn({ stress: String(o2.stress.value), deflection: String(o2.deflection.value) }); R.runReturn();
  assert.deepEqual(R.view().rounds[0].scored.map(s => s.result), ['correct', 'correct']);
  bench.reload(); const bq = bench.current(); bq.setup = { ...R2, design: { ...R2.design, h: 49 } }; bench.put(bq);           // as the bench page saves it
  assert.throws(() => R.saveRevision(), /must be a design you predicted and ran/);
  R.saveTestedRevision();
  R = createRunner(spec, ctx.deps, R.state);
  assert.equal(R.decide({ claim: 'Steel, 48 mm deep.', runs: [R.state.r2] }).ok, true);
  const q = R.state.defend.questions;
  assert.deepEqual(q.map(x => x.read), ['stress', 'deflection']);
  const t0 = truth({ ...R2, design: { ...R2.design, material: 'aluminium' } }).stress.value, t1 = truth({ ...R2, design: { ...R2.design, h: 42 } }).deflection.value;
  assert.deepEqual(q.map(x => x.truth), [t0, t1]);
  assert.equal(R.defendAnswers({ 0: String(t0), 1: String(t1 * 1.5) }).ok, true);
  const pf = R.portfolio(), p = ctx.store.get(ctx.project.id);
  assert.equal(pf.project.id, ctx.project.id);
  assert.deepEqual(pf.design.to.setup, R2, 'Revision 2 is the tested design, not the later edit');
  assert.deepEqual(pf.decision.defence.map(d => d.result), ['correct', 'incorrect']);
  assert.equal(pf.trail.status['FIX.lever'].role, 'target');
  assert.deepEqual(p.runs.map(r => r.id), ['R1', 'R2', 'R3', 'R4'], 'their run, Revision 1, the prediction run, Revision 2');
  assert.equal(p.decisions.length, 1); assert.equal(p.setup.design.h, 49, 'their later edit is kept');
  for (const r of pf.runs) assert.equal(r.reproduced, true);
});

test('every registered bench names concepts that exist in the graph and have items', async () => {
  const learns = await listBenches(BENCHES), { graph, items } = await loadContent({});
  for (const learn of [LEARN, ...learns]) {
    const { graph: g, items: it } = learn === LEARN ? await loadContent({ content: LEARN.content }) : { graph, items };
    if (typeof learn.outputs === 'function') continue;                 // dynamic outputs are checked by the bench's own tests
    for (const [k, o] of Object.entries(learn.outputs || {})) {
      assert.ok(g.has(o.competency), `${learn.domain}.${k}: unknown competency ${o.competency}`);
      const gen = g.node(o.competency).items;
      assert.ok(gen && it.has(gen), `${learn.domain}.${k}: ${o.competency} has no item generator`);
    }
  }
});
