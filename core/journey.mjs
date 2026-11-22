// Journey runner: one state machine plays any journey spec (docs/JOURNEYS.md). No DOM, no physics, no content.
// brief → stuck → diagnose → teach → apply → check → return → decide → defend → summary
// Everything the learner does lands on two records: the bench's project record (core/project.mjs: R1, prediction runs,
// R2, the decision and its defence) and the learner ledger (core/ledger.mjs: evidence, help, provenance).
// Every number the learner is scored against comes from adapter.evaluate; learning help never changes a result.
//
//   createRunner(spec, { adapter, graph, items, ledger, store, nonce }, state?) → runner
//     adapter  the bench's adapter { domain, evaluate(setup) }     graph, items  core/graph.mjs buildGraph / buildItems
//     ledger   core/ledger.mjs openLedger()                         store  core/project.mjs openStore(spec.bench.domain)
//     nonce    integer that makes this learner's items fresh       state  a saved runner.state to resume
//   runner.state is plain JSON (save it anywhere); runner.view() describes the one thing to show now.
import * as P from './project.mjs';
import { checkResponse, checkNumber, readNumber, within } from './ledger.mjs';
import { diagnose, DIAGNOSIS_TEXT } from './diagnostic.mjs';

export const PHASES = ['brief', 'stuck', 'diagnose', 'teach', 'apply', 'check', 'return', 'decide', 'defend', 'summary'];
export const PHASE_TITLES = { brief: 'Brief', stuck: 'Predict', diagnose: 'Find the block', teach: 'Learn', apply: 'Apply', check: 'Check', return: 'Your design', decide: 'Decide', defend: 'Defend', summary: 'Portfolio' };
export class JourneyError extends Error {}

const clone = v => JSON.parse(JSON.stringify(v));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export const applyPatch = (base, patch) => { const out = clone(base); for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(out[k]) ? applyPatch(out[k], v) : clone(v); return out; };
// an output by key or by label
export const readOutput = (outputs, read) => outputs?.[read] ?? Object.values(outputs || {}).find(o => o.label === read) ?? null;
export const withPreset = (page, preset) => !page ? null : preset == null ? page : `${page}${page.includes('?') ? '&' : '?'}preset=${encodeURIComponent(preset)}`;

export function createRunner(spec, deps, saved) {
  const { adapter, graph, items, ledger, store } = deps;
  if (!spec?.id || !spec.target) throw new JourneyError('a journey needs an id and a target');
  if (adapter.domain !== spec.bench?.domain) throw new JourneyError(`journey bench domain ${spec.bench?.domain} does not match the adapter (${adapter.domain})`);
  if (!graph.has(spec.target)) throw new JourneyError(`unknown target competency ${spec.target}`);
  if (saved && saved.journey !== spec.id) throw new JourneyError('saved state belongs to another journey');
  const S = saved ? clone(saved) : { v: 1, journey: spec.id, phase: 'brief', nonce: (deps.nonce ?? 1) >>> 0, counter: 0, message: null };
  const target = spec.target;

  // ---------- helpers ----------
  const project = () => { store.reload(); return S.projectId ? store.get(S.projectId) : null; };
  const needProject = () => { const p = project(); if (!p) throw new JourneyError('The project for this journey is no longer in this browser. Start the journey again.'); return p; };
  const evaluate = setup => { const r = adapter.evaluate(clone(setup)); if (!r.ok) throw new JourneyError(r.reason); return r; };
  const runOf = (p, id) => p.runs.find(r => r.id === id) ?? null;
  const generatorOf = c => (graph.has(c) ? graph.node(c).items : null) || spec.teach?.[c]?.items || null;
  const fresh = () => ((S.nonce + (++S.counter) * 104729) >>> 0);
  const itemOf = ref => items.make(ref.generator, ref.seed, ref.aspect);
  const newItem = (competency, aspect, provenance) => {
    const generator = generatorOf(competency);
    if (!generator || !items.has(generator)) return null;
    return { ref: { generator, seed: fresh(), aspect }, provenance, hints: 0, shown: false, attempts: 0, solved: false, closed: false, feedback: null };
  };
  const aspectsOf = c => { const g = generatorOf(c); return g && items.has(g) ? items.generators[g].aspects : []; };
  const record = (it, item, e) => ledger.record({ journey: spec.id, competency: item.competency, item: item.id, aspect: item.aspect, provenance: it.provenance, ...e });
  const say = text => { S.message = text; };
  const same = (a, b) => !!a && !!b && P.setupDiff(a, b).length === 0;
  // R2 is a tested design: a round counts only if its run is on the project record with the setup the round recorded
  // (the record, not the saved page state, is the authority, so a reload or an edited state cannot invent a test)
  const testedRounds = p => (S.ret?.rounds || []).filter(r => { const run = p && runOf(p, r.run); return run && same(run.setup, r.setup); });
  const lastTested = p => testedRounds(p).at(-1) ?? null;
  const currentTested = p => (p ? testedRounds(p).filter(r => same(r.setup, p.setup)).at(-1) ?? null : null);
  function saveR2(p, round, name) {
    const tested = runOf(p, round.run);
    if (!P.reproduceRun(tested, adapter).ok) throw new JourneyError(`Run ${round.run} no longer reproduces; predict and run your design again.`);
    const run = P.saveRun(p, adapter, name, tested.setup);
    store.put(p); S.r2 = run.id; S.r2Tested = round.run; go(spec.return.decision === false ? 'summary' : 'decide');
    return run;
  }
  const go = phase => { S.phase = phase; S.message = null; };

  // a prediction box: a bare number counts in the prediction's unit; a unit given must be one for this quantity
  function readPredictions(list, values) {
    const out = {}, errors = {};
    for (const p of list) {
      const r = checkNumber({ value: 0, unit: p.unit ?? '', tol: 0 }, values?.[p.id], { requireUnit: false });
      if (r.result === 'unresolved') errors[p.id] = r.reason; else out[p.id] = r.value;
    }
    return { out, errors, ok: !Object.keys(errors).length };
  }
  const score = (list, values, setup, outputs) => list.map(p => {
    const truth = p.truth(clone(setup), outputs);
    return { id: p.id, prompt: p.prompt, unit: p.unit ?? '', predicted: values[p.id], truth, result: within(values[p.id], truth, p.tol ?? 0) ? 'correct' : 'incorrect' };
  });

  // ---------- diagnosis ----------
  const candidates = () => {
    const own = aspectsOf(target).map(aspect => ({ competency: target, aspect }));
    const pre = graph.prerequisitesOf(target, 1).filter(c => aspectsOf(c).length).map(c => ({ competency: c, aspect: aspectsOf(c).includes('procedure') ? 'procedure' : aspectsOf(c)[0] }));
    return [...own, ...pre];
  };
  const diagnosis = () => diagnose({ target, candidates: candidates(), answers: S.diag.answers });
  function nextDiagnosticItem() {
    const d = diagnosis();
    if (!d.next) { S.diag.result = { result: d.result, confidence: d.confidence, gaps: d.gaps, misconceptions: d.misconceptions, asked: d.asked, policy: d.policy }; S.item = null; return; }
    S.item = newItem(d.next.competency, d.next.aspect, 'diagnostic');
  }

  // ---------- teaching queue ----------
  function startTeaching() {
    const r = S.diag.result;
    if (r.result === 'secure') { S.trail.taught = []; return startCheck(); }
    const queue = [...r.gaps.filter(c => spec.teach?.[c] || generatorOf(c)), target];
    S.teach = { queue, index: 0, practised: 0, stage: 'lesson' };
    S.trail.taught = [...new Set([...(S.trail.taught || []), ...queue])];
    S.item = null; go('teach');
  }
  const teachEntry = c => spec.teach?.[c] ?? {};
  const practiceCount = c => (generatorOf(c) && items.has(generatorOf(c)) ? teachEntry(c).count ?? 2 : 0);
  function nextTeachStep() {
    const T = S.teach, c = T.queue[T.index];
    if (T.practised < practiceCount(c)) { const as = aspectsOf(c); S.item = newItem(c, as[T.practised % as.length], 'practice'); T.stage = 'practice'; return; }
    T.index++; T.practised = 0; T.stage = 'lesson'; S.item = null;
    if (T.index >= T.queue.length) { if (S.recheck) startCheck(); else startApply(); }
  }
  function startApply() { S.apply = { done: 0, count: spec.apply?.count ?? 3, stage: 'items' }; go('apply'); nextApplyItem(); }
  function nextApplyItem() {
    const A = S.apply, as = aspectsOf(target);
    if (A.done < A.count && as.length) { S.item = newItem(target, as[A.done % as.length], 'practice'); return; }
    S.item = null; A.stage = 'transfer';
  }
  function startCheck() { S.check = { done: 0, count: spec.check?.count ?? 1, results: [], stage: 'items' }; go('check'); nextCheckItem(); }
  function nextCheckItem() {
    const C = S.check, as = aspectsOf(target);
    if (C.done < C.count && as.length) { S.item = newItem(target, as.includes('procedure') ? 'procedure' : as[0], 'check'); return; }
    S.item = null; C.stage = 'result'; C.status = ledger.status(target).status;
  }

  // ---------- the item in front of the learner ----------
  function answer(response) {
    const it = S.item; if (!it || it.closed) throw new JourneyError('no open question');
    const item = itemOf(it.ref), c = checkResponse(item, response);
    // guided practice in the teach phase is help (as in the school engine: guided answers are assisted responses)
    const helped = S.phase === 'teach' || it.hints > 0 || it.shown || it.attempts > 0;
    const kind = helped ? 'assisted_response' : 'evidence';
    record(it, item, { kind, result: c.result, ...(c.misconception ? { misconception: c.misconception } : {}) });
    if (c.result === 'unresolved') { it.feedback = { result: 'unresolved', reason: c.reason }; return it.feedback; }
    it.attempts++;
    const mis = c.misconception ? (item.misconceptions || []).find(m => m.id === c.misconception) : null;
    it.feedback = { result: c.result, misconception: mis ? { id: mis.id, label: mis.label } : null, dontKnow: !!c.dontKnow };
    if (S.phase === 'diagnose') { S.diag.answers.push({ competency: item.competency, aspect: item.aspect, result: c.result, misconception: c.misconception, assisted: helped }); it.closed = true; }
    else if (S.phase === 'teach') { if (c.result === 'correct') { it.solved = true; it.closed = true; } }
    else { it.closed = true; it.solved = c.result === 'correct'; if (S.phase === 'check') S.check.results.push(c.result); }
    return it.feedback;
  }
  function hint() {
    const it = S.item; if (S.phase !== 'teach' || !it || it.closed) throw new JourneyError('hints are only for practice');
    const item = itemOf(it.ref), steps = item.solution || [];
    if (it.shown || it.hints >= Math.max(0, steps.length - 1)) throw new JourneyError('no more hints: show the solution instead');
    it.hints++; record(it, item, { kind: 'hint' });
  }
  function showSolution() {
    const it = S.item; if (S.phase !== 'teach' || !it) throw new JourneyError('solutions are only shown in practice');
    if (it.shown || it.solved) return;
    const item = itemOf(it.ref);
    it.shown = true; record(it, item, { kind: 'shown_solution' });
  }
  function next() {
    const it = S.item;
    if (S.phase === 'diagnose') {
      if (S.diag.result) return startTeaching();
      if (it && !it.closed) throw new JourneyError('answer first (or choose “I don’t know”)');
      return nextDiagnosticItem();
    }
    if (S.phase === 'teach') {
      if (S.teach.stage === 'lesson') return nextTeachStep();
      if (it && !it.closed && !it.shown) throw new JourneyError('answer it, or show the solution, before moving on');
      S.teach.practised++; return nextTeachStep();
    }
    if (S.phase === 'apply') {
      if (S.apply.stage === 'transfer') return startCheck();
      if (it && !it.closed) throw new JourneyError('answer first');
      S.apply.done++; return nextApplyItem();
    }
    if (S.phase === 'check') {
      if (it && !it.closed) throw new JourneyError('answer first');
      S.check.done++; return nextCheckItem();
    }
    throw new JourneyError(`nothing to continue in ${S.phase}`);
  }

  // ---------- actions by phase ----------
  const actions = {
    start() {
      if (S.phase !== 'brief') throw new JourneyError('already started');
      const p = P.createProject({ domain: adapter.domain, name: spec.title, setup: spec.anchor.setup, origin: `journey:${spec.id}` });
      const rev = spec.anchor.revision ?? 'R1';
      const run = P.saveRun(p, adapter, `${rev} · starting design`);
      store.put(p); store.open(p.id);
      Object.assign(S, { projectId: p.id, r1: run.id, r2: null, revisionLabels: [rev, rev === 'R1' ? 'R2' : `${rev}+1`], stuck: { locked: false, values: null, scored: null, outcome: null },
        diag: { answers: [], result: null }, trail: { taught: [] }, ret: { rounds: [], locked: null }, decision: null, defend: null });
      go('stuck');
    },
    lockStuck(values) {
      if (S.phase !== 'stuck' || S.stuck.locked) throw new JourneyError('nothing to lock');
      const r = readPredictions(spec.stuck.predictions, values);
      if (!r.ok) return { ok: false, errors: r.errors };
      S.stuck.values = r.out; S.stuck.locked = true; return { ok: true };
    },
    runStuck() {
      if (S.phase !== 'stuck' || !S.stuck.locked || S.stuck.scored) throw new JourneyError('lock your predictions first');
      const run = runOf(needProject(), S.r1), res = evaluate(run.setup);
      S.stuck.scored = score(spec.stuck.predictions, S.stuck.values, run.setup, res.outputs);
      S.stuck.outcome = S.stuck.scored.every(s => s.result === 'correct') ? 'held' : 'missed';
    },
    stuck() {                                        // "I'm stuck", or continue after a miss
      if (S.phase !== 'stuck') throw new JourneyError('not now');
      if (!S.stuck.outcome) S.stuck.outcome = 'stuck';
      go('diagnose'); S.diag = { answers: [], result: null }; nextDiagnosticItem();
    },
    skipToDesign() {                                 // predictions held: straight back to the design
      if (S.phase !== 'stuck' || S.stuck.outcome !== 'held') throw new JourneyError('not now');
      S.trail.skipped = true; go('return');
    },
    answer, hint, showSolution, next,
    reteach() { if (S.phase !== 'check' || S.check.stage !== 'result') throw new JourneyError('not now'); S.recheck = true; S.teach = { queue: [target], index: 0, practised: 0, stage: 'lesson' }; S.item = null; go('teach'); },
    toDesign() { if (S.phase !== 'check' || S.check.stage !== 'result') throw new JourneyError('not now'); S.recheck = false; go('return'); },
    lockReturn(values) {
      if (S.phase !== 'return') throw new JourneyError('not now');
      const r = readPredictions(spec.return.predictions, values);
      if (!r.ok) return { ok: false, errors: r.errors };
      S.ret.locked = { values: r.out, setup: clone(needProject().setup) }; return { ok: true };
    },
    runReturn() {
      if (S.phase !== 'return' || !S.ret.locked) throw new JourneyError('lock your predictions first');
      const p = needProject();
      if (JSON.stringify(p.setup) !== JSON.stringify(S.ret.locked.setup)) { S.ret.locked = null; throw new JourneyError('Your design changed after you locked: predict again for this design.'); }
      const run = P.saveRun(p, adapter, `Prediction run ${S.ret.rounds.length + 1}`);
      store.put(p);
      S.ret.rounds.push({ run: run.id, setup: clone(run.setup), scored: score(spec.return.predictions, S.ret.locked.values, run.setup, run.outputs) });
      S.ret.locked = null;
    },
    saveRevision() {                                  // the current design, only if it was predicted and run
      if (S.phase !== 'return') throw new JourneyError('not now');
      if (!S.ret.rounds.length) throw new JourneyError('Predict and run your design at least once before saving the revision.');
      const p = needProject(), round = currentTested(p), last = lastTested(p), R2 = S.revisionLabels[1];
      if (!round) throw new JourneyError(last
        ? `Your design has changed since run ${last.run}, and ${R2} must be a design you predicted and ran. Predict and run this design, or save the last tested design (run ${last.run}) as ${R2}.`
        : `This design has not been predicted and run. Predict and run it before saving it as ${R2}.`);
      saveR2(p, round, `${R2} · revised design`);
    },
    saveTestedRevision() {                            // the last design that was predicted and run, whatever the current edit is
      if (S.phase !== 'return') throw new JourneyError('not now');
      const p = needProject(), last = lastTested(p), R2 = S.revisionLabels[1];
      if (!last) throw new JourneyError('Predict and run your design at least once before saving the revision.');
      const edited = !same(last.setup, p.setup);
      saveR2(p, last, `${R2} · revised design (tested in run ${last.run})`);
      S.message = `Saved ${R2} from run ${last.run}, the last design you predicted and ran.${edited ? ` Your later edits are still in the project on the bench, but they are not part of ${R2}.` : ''}`;
    },
    predictCurrent() {                                // start a fresh round on the design as it stands now
      if (S.phase !== 'return') throw new JourneyError('not now');
      const p = needProject();
      if (S.ret.locked && !same(S.ret.locked.setup, p.setup)) S.ret.locked = null;
    },
    decide({ claim, runs = [], rejected = [] }) {
      if (S.phase !== 'decide') throw new JourneyError('not now');
      const p = needProject(), errors = {};
      if (!String(claim ?? '').trim()) errors.claim = 'Say what you decided and why.';
      const bad = runs.filter(id => !runOf(p, id)); if (bad.length) errors.runs = `No such run: ${bad.join(', ')}`;
      if (!runs.length) errors.runs = 'Pick the runs that show it.';
      if (Object.keys(errors).length) return { ok: false, errors };
      S.decision = { claim: String(claim).trim(), runs: [...new Set(runs)], rejected: (Array.isArray(rejected) ? rejected : String(rejected).split('\n')).map(t => String(t).trim()).filter(Boolean) };
      const r2 = runOf(p, S.r2), qs = typeof spec.defend === 'function' ? spec.defend(clone(r2.setup), clone(r2.outputs)) : [];
      S.defend = { questions: qs.map(q => {
        const patched = applyPatch(r2.setup, q.change), r = adapter.evaluate(clone(patched));
        const out = r.ok ? readOutput(r.outputs, q.read) : null;
        return out ? { prompt: q.prompt, change: clone(q.change), read: q.read, label: out.label, unit: out.unit ?? '', tol: q.tol ?? 0.02, truth: out.value }
          : { prompt: q.prompt, change: clone(q.change), read: q.read, skipped: r.ok ? `no output ${q.read}` : r.reason };
      }).filter(q => !q.skipped), answers: null };
      go('defend'); return { ok: true };
    },
    defendAnswers(values) {
      if (S.phase !== 'defend') throw new JourneyError('not now');
      const errors = {}, entries = [];
      S.defend.questions.forEach((q, i) => {
        const c = checkNumber({ value: q.truth, unit: q.unit, tol: q.tol }, values?.[i], { requireUnit: false });
        if (c.result === 'unresolved') errors[i] = c.reason; else entries.push({ prompt: q.prompt, answer: c.value, unit: q.unit, truth: q.truth, result: c.result });
      });
      if (Object.keys(errors).length) return { ok: false, errors };
      const p = needProject();
      const d = P.addDecision(p, { from: S.r1, to: S.r2, claim: S.decision.claim, runs: S.decision.runs, rejected: S.decision.rejected, defence: entries });
      store.put(p); S.defend.answers = entries; S.decisionId = d.id; go('summary'); return { ok: true };
    },
  };

  // ---------- what to show ----------
  function itemView() {
    const it = S.item; if (!it) return null;
    const item = itemOf(it.ref), steps = item.solution || [];
    return { id: item.id, competency: item.competency, title: graph.has(item.competency) ? graph.node(item.competency).title : item.competency, aspect: item.aspect, prompt: item.prompt, figure: item.figure ?? null,
      answer: item.answer.kind === 'number' ? { kind: 'number', unit: undefined } : { kind: 'choice', options: [...item.answer.options] },
      hints: steps.slice(0, it.hints), solution: it.shown || (it.closed && S.phase !== 'diagnose' && S.phase !== 'teach') ? steps : null,
      canHint: S.phase === 'teach' && !it.closed && !it.shown && it.hints < steps.length - 1, canShow: S.phase === 'teach' && !it.shown && !it.solved,
      attempts: it.attempts, closed: it.closed, solved: it.solved, feedback: it.feedback, provenance: it.provenance };
  }
  const titleOf = c => (graph.has(c) ? graph.node(c).title : c);
  function view() {
    const base = { phase: S.phase, phases: PHASES, titles: PHASE_TITLES, journey: { id: spec.id, title: spec.title, course: spec.course, semester: spec.semester }, message: S.message, target: { id: target, title: titleOf(target) } };
    const p = S.projectId ? project() : null;
    switch (S.phase) {
      case 'brief': return { ...base, brief: spec.brief, setup: clone(spec.anchor.setup), revision: spec.anchor.revision ?? 'R1', bench: spec.bench.page };
      case 'stuck': return { ...base, predictions: spec.stuck.predictions.map(x => ({ id: x.id, prompt: x.prompt, unit: x.unit ?? '' })), locked: S.stuck.locked, values: S.stuck.values, scored: S.stuck.scored, outcome: S.stuck.outcome, setup: p && runOf(p, S.r1)?.setup, bench: spec.bench.page };
      case 'diagnose': {
        const d = S.diag.result;
        return { ...base, item: itemView(), asked: S.diag.answers.length, result: d && { ...d, text: DIAGNOSIS_TEXT[d.result], gaps: d.gaps.map(c => ({ id: c, title: titleOf(c) })) } };
      }
      case 'teach': {
        const T = S.teach, c = T.queue[T.index], e = teachEntry(c), node = graph.has(c) ? graph.node(c) : {};
        return { ...base, competency: { id: c, title: titleOf(c), school: !!node.school, learnUrl: node.learnUrl ?? null }, step: T.index + 1, of: T.queue.length, stage: T.stage,
          explore: e.explore ? { href: withPreset(e.explore.page, e.explore.preset), page: e.explore.page, preset: e.explore.preset ?? null } : null, steps: e.steps ?? [], practice: { done: T.practised, of: practiceCount(c) }, item: itemView(), recheck: !!S.recheck };
      }
      case 'apply': {
        const A = S.apply, t = spec.apply?.transfer;
        return { ...base, done: A.done, of: A.count, stage: A.stage, item: itemView(), transfer: t ? { href: withPreset(t.page, t.preset), page: t.page, preset: t.preset ?? null, prompt: t.prompt ?? null } : null };
      }
      case 'check': { const C = S.check; return { ...base, done: C.done, of: C.count, stage: C.stage, item: itemView(), results: [...C.results], status: C.status ?? null }; }
      case 'return': {
        const r1 = p && runOf(p, S.r1);
        return { ...base, missing: !p, bench: spec.bench.page, setup: p ? clone(p.setup) : null, r1: r1 ? clone(r1.setup) : null, changed: p && r1 ? P.setupDiff(r1.setup, p.setup) : [],
          predictions: spec.return.predictions.map(x => ({ id: x.id, prompt: x.prompt, unit: x.unit ?? '' })), locked: S.ret.locked ? { values: S.ret.locked.values } : null,
          lockedStale: !!(S.ret.locked && p && JSON.stringify(p.setup) !== JSON.stringify(S.ret.locked.setup)), rounds: clone(S.ret.rounds),
          ...(() => { const last = lastTested(p), cur = currentTested(p);
            return { lastTested: last ? { run: last.run, setup: clone(last.setup) } : null, currentTested: cur ? cur.run : null, sinceTested: last && p ? P.setupDiff(last.setup, p.setup) : [] }; })() };
      }
      case 'decide': return { ...base, runs: p ? p.runs.map(r => ({ id: r.id, name: r.name })) : [], from: S.r1, to: S.r2, tested: S.r2Tested ?? null, changed: p ? P.setupDiff(runOf(p, S.r1).setup, runOf(p, S.r2).setup) : [] };
      case 'defend': return { ...base, questions: S.defend.questions.map(q => ({ prompt: q.prompt, unit: q.unit, label: q.label })) };
      case 'summary': return { ...base, portfolio: portfolio() };
    }
    throw new JourneyError(`unknown phase ${S.phase}`);
  }

  // ---------- the portfolio entry ----------
  function portfolio() {
    const p = needProject(), r1 = runOf(p, S.r1), r2 = S.r2 ? runOf(p, S.r2) : null;
    const events = ledger.events().filter(e => e.journey === spec.id);
    const trail = [...new Set([target, ...(S.trail.taught || []), ...(S.diag?.answers || []).map(a => a.competency)])];
    const dec = S.decisionId ? p.decisions.find(d => d.id === S.decisionId) : null;
    return {
      format: 'openpath.portfolio', version: 1, learner: ledger.learner,
      journey: { id: spec.id, title: spec.title, course: spec.course ?? null, semester: spec.semester ?? null },
      project: { id: p.id, name: p.name, domain: p.domain },
      design: { from: { label: S.revisionLabels[0], run: S.r1, setup: clone(r1.setup), outputs: clone(r1.outputs), verdicts: clone(r1.verdicts) },
        to: r2 ? { label: S.revisionLabels[1], run: S.r2, tested: S.r2Tested ?? null, setup: clone(r2.setup), outputs: clone(r2.outputs), verdicts: clone(r2.verdicts) } : null,
        changed: r2 ? P.setupDiff(r1.setup, r2.setup) : [] },
      runs: p.runs.map(r => ({ id: r.id, name: r.name, reproduced: P.reproduceRun(r, adapter).ok })),
      decision: dec ? clone(dec) : null,
      trail: {
        stuck: { outcome: S.stuck?.outcome ?? null, predictions: clone(S.stuck?.scored ?? []) },
        diagnosis: S.diag?.result ? { result: S.diag.result.result, confidence: S.diag.result.confidence, gaps: S.diag.result.gaps, misconceptions: S.diag.result.misconceptions, policy: S.diag.result.policy } : null,
        taught: [...(S.trail.taught || [])], skipped: !!S.trail.skipped,
        returned: clone(S.ret?.rounds ?? []),
        status: Object.fromEntries(trail.map(c => [c, { title: titleOf(c), ...ledger.status(c) }])),
        events,
      },
    };
  }

  return { get state() { return clone(S); }, view, portfolio, project, ...actions };
}
