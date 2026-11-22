import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRunner, applyPatch, readOutput, JourneyError } from './journey.mjs';
import { openLedger } from './ledger.mjs';
import * as P from './project.mjs';
import { loadJourney } from '../journeys/load.mjs';
import spec from '../tests/fixtures/journey.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
async function setup() {
  const storage = memory(), loaded = await loadJourney(spec);
  assert.deepEqual([loaded.skipped, loaded.problems], [[], []]);
  const ledger = openLedger(storage), store = P.openStore(spec.bench.domain, storage);
  return { storage, ...loaded, ledger, store, deps: { adapter: loaded.adapter, graph: loaded.graph, items: loaded.items, ledger, store, nonce: 4242 } };
}
// the right (or a wrong) answer to the open item, recomputed from the generator, as a learner would type it
const key = (ctx, R) => { const ref = R.state.item.ref; return ctx.items.make(ref.generator, ref.seed, ref.aspect).answer; };
const right = (ctx, R) => { const a = key(ctx, R); return a.kind === 'choice' ? (typeof a.correct === 'number' ? a.correct : a.options.indexOf(a.correct)) : `${a.value} ${a.unit}`.trim(); };
const wrong = (ctx, R) => { const a = key(ctx, R); return a.kind === 'choice' ? ((typeof a.correct === 'number' ? a.correct : a.options.indexOf(a.correct)) + 1) % a.options.length : `${a.value * 3 + 7} ${a.unit}`.trim(); };

test('runner: anchor → stuck → diagnose → teach → apply → check → return → revise → decide → defend → portfolio', async () => {
  const ctx = await setup();
  let R = createRunner(spec, ctx.deps);
  assert.equal(R.view().phase, 'brief');
  R.start();
  const p0 = ctx.store.get(R.state.projectId);
  assert.equal(R.state.r1, 'R1'); assert.equal(p0.runs[0].name, 'Revision 1 · starting design'); assert.equal(ctx.store.current().id, p0.id, 'the bench opens the journey project');

  // stuck: unreadable predictions are refused, locking is final, the score comes from the engine
  assert.equal(R.lockStuck({ defl: 'a lot' }).ok, false);
  assert.throws(() => R.runStuck(), JourneyError);
  assert.equal(R.lockStuck({ defl: '0.2' }).ok, true);
  assert.throws(() => R.lockStuck({ defl: '1.4' }), JourneyError, 'locked predictions cannot change');
  R.runStuck();
  const truth = ctx.adapter.evaluate(spec.anchor.setup).outputs.deflection.value;
  assert.deepEqual(R.view().scored[0], { id: 'defl', prompt: spec.stuck.predictions[0].prompt, unit: 'mm', predicted: 0.2, truth, result: 'incorrect' });
  assert.equal(R.view().outcome, 'missed');
  R.stuck();

  // diagnose: an unreadable answer is not counted and the same item stays; target misses, then a prerequisite miss
  assert.equal(R.view().phase, 'diagnose');
  const first = R.view().item.id;
  assert.equal(R.answer('no idea really').result, 'unresolved');
  assert.equal(R.view().item.id, first); assert.equal(R.view().asked, 0);
  let guard = 0;
  while (!R.view().result && guard++ < 5) {
    const it = R.view().item;
    if (it.competency === 'FIX.lever') R.answer(wrong(ctx, R)); else R.answer(it.competency === 'FIX.product' ? wrong(ctx, R) : right(ctx, R));
    assert.equal(R.view().item.solution, null, 'no solution during the diagnostic');
    R.next();
  }
  const diag = R.view().result;
  assert.ok(diag.asked.length <= 3 && diag.text);
  const productAsked = diag.asked.some(a => a.competency === 'FIX.product');
  assert.ok(productAsked, 'after target misses the diagnostic checks what it rests on');

  // teach: prerequisite gaps first, then the target; hints and shown solutions are recorded as help
  R.next();
  let v = R.view();
  assert.equal(v.phase, 'teach');
  if (productAsked) {
    assert.equal(v.competency.id, 'FIX.product'); assert.equal(v.competency.school, true);
    R.next();                                                       // lesson → practice
    assert.equal(R.view().item.canHint, false, 'a one-step solution has no hints, only the solution');
    R.showSolution(); assert.ok(R.view().item.solution.length);
    R.answer(right(ctx, R)); R.next();
    v = R.view();
  }
  assert.equal(v.competency.id, 'FIX.lever'); assert.equal(v.explore.href, '../playground/?preset=shelf'); assert.deepEqual(v.steps, spec.teach['FIX.lever'].steps);
  R.next();
  assert.throws(() => R.next(), JourneyError, 'cannot skip an open practice item');
  if (R.view().item.canHint) { R.hint(); assert.equal(R.view().item.hints.length, 1); }
  else R.showSolution();
  R.answer(wrong(ctx, R)); assert.equal(R.view().item.closed, false, 'a miss in practice can be tried again');
  R.answer(right(ctx, R)); assert.equal(R.view().item.solved, true); R.next();
  R.answer(right(ctx, R)); R.next();

  // apply: fresh unaided items, no help offered, then the transfer link
  v = R.view(); assert.equal(v.phase, 'apply'); assert.equal(v.item.canHint, false); assert.equal(v.item.canShow, false);
  assert.throws(() => R.hint(), JourneyError);
  const seen = new Set();
  for (let i = 0; i < spec.apply.count; i++) { seen.add(R.view().item.id); R.answer(right(ctx, R)); assert.ok(R.view().item.solution, 'feedback after the answer'); R.next(); }
  assert.equal(seen.size, spec.apply.count, 'every item is fresh');
  v = R.view(); assert.equal(v.stage, 'transfer'); assert.equal(v.transfer.href, '../playground/?preset=crane');
  R.next();

  // unaided check after help
  assert.equal(R.view().phase, 'check');
  R.answer(right(ctx, R)); R.next();
  v = R.view(); assert.equal(v.stage, 'result'); assert.equal(v.status, 'independent-after-help');
  assert.equal(ctx.ledger.status('FIX.lever').status, 'independent-after-help');

  // resume from saved state at any point
  R = createRunner(spec, ctx.deps, JSON.parse(JSON.stringify(R.state)));
  R.toDesign();

  // return: predictions on the learner's own design, then they change it on the bench and come back
  v = R.view(); assert.equal(v.phase, 'return'); assert.deepEqual(v.changed, []);
  assert.throws(() => R.saveRevision(), /at least once/);
  const own = ctx.adapter.evaluate(v.setup).outputs;
  R.lockReturn({ defl: String(own.deflection.value), stress: `${own.stress.value} MPa` }); R.runReturn();
  assert.deepEqual(R.view().rounds[0].scored.map(s => s.result), ['correct', 'correct']);
  // the bench saves a new setup on the same project (as the bench page would)
  const bench = P.openStore(spec.bench.domain, ctx.storage), bp = bench.current();
  bp.setup = { ...bp.setup, design: { material: 'steel', shape: 'rect', b: 40, h: 50 } }; bench.put(bp);
  v = R.view(); assert.deepEqual(v.changed.map(c => c.path).sort(), ['design.h', 'design.material']);
  R.lockReturn({ defl: '0.5', stress: '20' });
  bp.setup.design.h = 45; bench.put(bp);
  assert.equal(R.view().lockedStale, true);
  assert.throws(() => R.runReturn(), /changed after you locked/);
  R.lockReturn({ defl: '0.5', stress: '20' }); R.runReturn();
  R.saveRevision();

  // decide and defend: answers keyed by the engine on patched copies of R2; the design itself is untouched
  v = R.view(); assert.equal(v.phase, 'decide'); assert.equal(v.to, R.state.r2);
  assert.equal(R.decide({ claim: '', runs: [] }).ok, false);
  assert.equal(R.decide({ claim: 'Steel and a deeper section bring the dial reading inside 0.15 mm.', runs: [R.state.r2, 'R3'], rejected: 'Aluminium 40 × 50\n' }).ok, true);
  v = R.view(); assert.equal(v.phase, 'defend'); assert.equal(v.questions.length, 2); assert.equal(v.questions[0].unit, 'mm');
  const proj = ctx.store.get(R.state.projectId), r2 = proj.runs.find(r => r.id === R.state.r2);
  const t0 = ctx.adapter.evaluate(applyPatch(r2.setup, { design: { material: 'steel' } })).outputs.deflection.value;
  const t1 = readOutput(ctx.adapter.evaluate(applyPatch(r2.setup, { mount: 300, dialX: 300, strainX: 300 })).outputs, 'Stress from strain (E·ε)').value;
  assert.equal(R.defendAnswers({ 0: 'eh', 1: '3' }).ok, false);
  assert.equal(R.defendAnswers({ 0: String(t0), 1: `${t1 * 2} MPa` }).ok, true);
  assert.equal(r2.setup.design.material, 'steel', 'defence never changes the design');

  // portfolio: R1 → R2, runs that reproduce, the decision with its defence, the prerequisite trail
  const pf = R.view().portfolio;
  assert.equal(pf.design.from.run, 'R1'); assert.equal(pf.design.to.run, R.state.r2);
  assert.ok(pf.design.changed.length >= 2);
  assert.ok(pf.runs.every(r => r.reproduced));
  assert.deepEqual(pf.decision.defence.map(d => d.result), ['correct', 'incorrect']);
  assert.deepEqual(pf.decision.defence.map(d => d.truth), [t0, t1]);
  assert.equal(pf.decision.from, 'R1'); assert.deepEqual(pf.decision.rejected, ['Aluminium 40 × 50']);
  assert.equal(pf.trail.status['FIX.lever'].status, 'independent-after-help');
  assert.ok(pf.trail.taught.includes('FIX.lever'));
  assert.ok(pf.trail.events.some(e => e.kind === 'evidence' && e.provenance === 'check' && e.result === 'correct'));
  assert.ok(pf.trail.events.some(e => e.provenance === 'diagnostic' && e.result === 'unresolved'), 'unresolved answers are logged, not counted');
  assert.ok(pf.trail.events.every(e => e.journey === spec.id && e.learner === ctx.ledger.learner));

  // the record survives a file round-trip with the same results
  const saved = ctx.store.get(R.state.projectId), back = P.deserialize(P.serialize(saved), spec.bench.domain);
  assert.deepEqual(back, JSON.parse(P.serialize(saved)));
  assert.equal(back.version, 2); assert.equal(back.decisions.length, 1);
  for (const r of back.runs) assert.ok(P.reproduceRun(r, ctx.adapter).ok);
});

test('runner: predictions that hold go straight back to the design; "I\'m stuck" always opens the loop', async () => {
  const ctx = await setup();
  const R = createRunner(spec, ctx.deps); R.start();
  const t = ctx.adapter.evaluate(spec.anchor.setup).outputs.deflection.value;
  R.lockStuck({ defl: `${t} mm` }); R.runStuck();
  assert.equal(R.view().outcome, 'held');
  R.skipToDesign(); assert.equal(R.view().phase, 'return');
  assert.equal(R.portfolio().trail.skipped, true);
  const S = createRunner(spec, ctx.deps); S.start(); S.stuck();
  assert.equal(S.view().phase, 'diagnose'); assert.equal(S.state.stuck.outcome, 'stuck');
  assert.throws(() => createRunner({ ...spec, bench: { ...spec.bench, domain: 'other' } }, ctx.deps), /does not match/);
});

test('runner: a secure diagnosis skips teaching; a missed check can go back to teaching', async () => {
  const ctx = await setup();
  const R = createRunner(spec, ctx.deps); R.start(); R.stuck();
  while (!R.view().result) { R.answer(right(ctx, R)); R.next(); }
  assert.equal(R.view().result.result, 'secure');
  R.next(); assert.equal(R.view().phase, 'check');
  R.answer(wrong(ctx, R)); R.next();
  assert.equal(R.view().status, 'not-yet', 'right alone in the diagnostic, but the latest answer alone was wrong');
  R.reteach(); assert.equal(R.view().phase, 'teach'); assert.equal(R.view().recheck, true);
  R.next(); R.showSolution(); R.answer(right(ctx, R)); R.next(); R.answer(right(ctx, R)); R.next();
  assert.equal(R.view().phase, 'check', 'after re-teaching, straight to a fresh check');
  R.answer(right(ctx, R)); R.next();
  assert.equal(R.view().status, 'independent-after-help');
});

test('runner: help on a prerequisite is kept apart from the unaided check on the target; the trail words say where evidence came from', async () => {
  const ctx = await setup();
  const R = createRunner(spec, ctx.deps); R.start(); R.stuck();
  let guard = 0;
  while (!R.view().result && guard++ < 5) { R.answer(R.view().item.competency === 'FIX.lever' || R.view().item.competency === 'FIX.product' ? { dontKnow: true } : right(ctx, R)); R.next(); }
  assert.deepEqual(R.view().result.gaps.map(g => g.id), ['FIX.product']);
  R.next();
  assert.equal(R.view().competency.id, 'FIX.product'); R.next();
  R.showSolution(); R.answer(right(ctx, R)); R.next();                // help on the prerequisite
  assert.equal(R.view().competency.id, 'FIX.lever'); R.next();
  while (R.view().phase === 'teach') { if (R.view().item) R.answer(right(ctx, R)); R.next(); }   // the target's practice, unaided but guided
  while (R.view().phase === 'apply') { if (R.view().item) R.answer(right(ctx, R)); R.next(); }
  R.answer(right(ctx, R)); R.next();
  assert.equal(R.view().status, 'independent-after-help'); assert.equal(R.view().statusText, 'Solved on your own after help');
  const tr = R.portfolio().trail;
  assert.deepEqual([tr.status['FIX.product'].status, tr.status['FIX.product'].role, tr.status['FIX.product'].basis], ['helped', 'prerequisite', null]);
  assert.equal(tr.status['FIX.product'].text, 'Practised with help; no unaided question since', 'the prerequisite is never claimed as checked alone');
  assert.deepEqual([tr.status['FIX.lever'].role, tr.status['FIX.lever'].basis], ['target', { provenance: 'check', result: 'correct' }]);
  const pe = tr.events.filter(e => e.competency === 'FIX.product');
  assert.deepEqual(pe.map(e => `${e.kind}/${e.provenance}`), ['evidence/diagnostic', 'shown_solution/practice', 'assisted_response/practice']);
  assert.ok(tr.events.filter(e => e.provenance === 'check').every(e => e.competency === 'FIX.lever' && e.kind === 'evidence'), 'the check assesses only the target');
});

test('runner files contain no journey-specific words', () => {
  const files = ['core/journey.mjs', 'core/ledger.mjs', 'core/diagnostic.mjs', 'core/graph.mjs', 'core/open-loop.mjs', ...readdirSync(new URL('../journeys/', import.meta.url)).map(f => `journeys/${f}`)];
  const words = /support|pipe|moment|mount|statics|fluids|playground|circuit|frame|truss/i, hits = [];
  for (const f of files) readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').forEach((line, i) => { if (words.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`); });
  assert.deepEqual(hits, []);
});

// R2 must be a design that was predicted and run in the return phase. A learner who runs design A, then edits the
// design on the bench, must not be able to save the untested edit as R2.
test('runner: R2 is a tested design — an edit after the run is refused, and the tested setup is what gets saved', async () => {
  const ctx = await setup();
  let R = createRunner(spec, ctx.deps); R.start();
  const A = R.project().setup, tA = ctx.adapter.evaluate(A).outputs;
  R.lockStuck({ defl: `${tA.deflection.value} mm` }); R.runStuck(); R.skipToDesign();
  R.lockReturn({ defl: String(tA.deflection.value), stress: String(tA.stress.value) }); R.runReturn();
  const testedRun = R.state.ret.rounds[0].run;
  // the bench saves an edited design B on the same project after the run
  const bench = P.openStore(spec.bench.domain, ctx.storage), bp = bench.current();
  bp.setup = { ...bp.setup, design: { material: 'steel', shape: 'rect', b: 40, h: 50 } }; bench.put(bp);
  const B = JSON.parse(JSON.stringify(bp.setup)), runsBefore = bench.current().runs.length;
  assert.throws(() => R.saveRevision(), JourneyError, 'an untested edit is never saved as R2');
  assert.equal(R.state.r2, null); assert.equal(R.view().phase, 'return');
  assert.equal(ctx.store.get(R.state.projectId).runs.length, runsBefore, 'a refusal saves nothing');
  let v = R.view();
  assert.equal(v.lastTested.run, testedRun); assert.equal(v.currentTested, null);
  assert.deepEqual(v.sinceTested.map(c => c.path).sort(), ['design.h', 'design.material']);

  // a reload keeps the binding; a forged record in saved state never turns B into a tested design
  R = createRunner(spec, ctx.deps, JSON.parse(JSON.stringify(R.state)));
  assert.equal(R.view().lastTested.run, testedRun); assert.equal(R.view().currentTested, null);
  const forged = JSON.parse(JSON.stringify(R.state)); forged.ret.rounds[0].setup = B;
  assert.throws(() => createRunner(spec, ctx.deps, forged).saveRevision(), JourneyError, 'tested means the run on the project record, not the saved page state');
  assert.equal(createRunner(spec, ctx.deps, forged).view().currentTested, null);

  // choice 1: save the last tested design — exactly that run's setup; the learner's current edit stays in the project
  const S = createRunner(spec, ctx.deps, JSON.parse(JSON.stringify(R.state)));
  S.saveTestedRevision();
  const p = ctx.store.get(S.state.projectId), r2 = p.runs.find(r => r.id === S.state.r2);
  assert.deepEqual(r2.setup, A); assert.deepEqual(p.setup, B, 'the current editing state is not overwritten');
  assert.ok(P.reproduceRun(r2, ctx.adapter).ok);
  v = S.view(); assert.equal(v.phase, 'decide'); assert.equal(v.to, S.state.r2); assert.equal(v.tested, testedRun);
  assert.match(v.message, new RegExp(`run ${testedRun}`)); assert.match(v.message, /not part of Revision 2/);
  assert.equal(S.decide({ claim: 'Kept the tested design.', runs: [S.state.r2] }).ok, true);
  // defence questions come from the R2 setup (A), not the current project setup (B)
  const tA0 = ctx.adapter.evaluate(applyPatch(A, { design: { material: 'steel' } })).outputs.deflection.value;
  const tB0 = ctx.adapter.evaluate(applyPatch(B, { design: { material: 'steel' } })).outputs.deflection.value;
  assert.notEqual(tA0, tB0);
  assert.equal(S.state.defend.questions[0].truth, tA0);
  assert.equal(S.defendAnswers({ 0: String(tA0), 1: '1' }).ok, true);
  const pf = S.portfolio();
  assert.deepEqual(pf.design.to.setup, A); assert.equal(pf.design.to.run, S.state.r2); assert.equal(pf.design.to.tested, testedRun);
  assert.equal(pf.decision.to, S.state.r2);

  // choice 2: predict and run this design — a fresh round on B, then B saves as R2
  const ctx2 = await setup();
  const Q = createRunner(spec, ctx2.deps); Q.start();
  Q.lockStuck({ defl: `${tA.deflection.value} mm` }); Q.runStuck(); Q.skipToDesign();
  Q.lockReturn({ defl: '1', stress: '1' });
  const b2 = P.openStore(spec.bench.domain, ctx2.storage), q = b2.current(); q.setup = B; b2.put(q);
  assert.equal(Q.view().lockedStale, true);
  Q.predictCurrent(); assert.equal(Q.state.ret.locked, null, 'a stale lock is cleared for a fresh round');
  assert.throws(() => Q.saveRevision(), /at least once/);
  Q.lockReturn({ defl: '1', stress: '1' }); Q.runReturn();
  assert.deepEqual(Q.view().currentTested, Q.state.ret.rounds[0].run);
  Q.saveRevision();
  assert.deepEqual(ctx2.store.get(Q.state.projectId).runs.find(r => r.id === Q.state.r2).setup, B);
  assert.equal(Q.portfolio().design.to.tested, Q.state.ret.rounds[0].run);
});
