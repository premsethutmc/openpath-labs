// Journey page: plays one journey with the shared runner (core/journey.mjs). It only draws what runner.view() says
// and passes the learner's input back; no journey is named here.
//   journey.html?j=<id>         a journey from the registry (content/journeys/index.mjs)
//   journey.html?src=<path.mjs>  a journey module by relative path (tests and authoring)
//   journey.html?open=<domain>&project=<id>   the learner's own project on an open bench (docs/OPEN_LOOP.md): the bench
//                                is found by domain in content/benches.mjs (or &learn=<path.mjs>, tests and authoring)
import { JOURNEYS } from '../content/journeys/index.mjs';
import { BENCHES } from '../content/benches.mjs';
import { listJourneys, loadJourney, loadContent, listBenches } from './load.mjs';
import { createRunner } from '../core/journey.mjs';
import { openSpec, pageFor } from '../core/open-loop.mjs';
import { openLedger, describeStatus } from '../core/ledger.mjs';
import * as P from '../core/project.mjs';

const $ = id => document.getElementById(id);
const app = $('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => typeof v !== 'number' || !Number.isFinite(v) ? esc(v ?? '–') : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v === 0 ? '0' : v.toPrecision(3);
const fail = (text, { title = 'This journey cannot open', bench = null } = {}) => { app.innerHTML = `<div class="card" id="cannot-open"><h2>${esc(title)}</h2><p class="msg">${esc(text)}</p><div class="actions">${bench ? `<a class="button" id="bench" href="${esc(bench)}">Back to my design on the bench</a>` : ''}<a class="button" href="./index.html">All journeys</a></div></div>`; document.body.dataset.ready = 'error'; };
class OpenError extends Error { constructor(text, opts) { super(text); this.opts = opts; } }
const modulePath = p => { if (!/^[\w./-]+\.mjs$/.test(p) || p.includes('//')) throw new Error('a module path must be a relative path to a .mjs module'); return new URL(p, location.href).href; };

// The learner's own project on an open bench: the spec is built from the bench's LEARN and the project.
async function openOwn(q) {
  const domain = q.get('open'), id = q.get('project'), src = q.get('learn');
  const learn = src ? (await import(modulePath(src))).LEARN : (await listBenches(BENCHES)).find(l => l.domain === domain);
  if (!learn || learn.domain !== domain) throw new OpenError('Predict and learn is not ready for this bench yet. Your project is safe on the bench; the worked examples on the journeys page show how the loop goes.', { title: 'Not ready for this bench yet' });
  const store = P.openStore(domain), project = id && id !== 'current' ? store.get(id) : null;   // only the named project, never whichever was opened last
  if (!project) throw new OpenError('This project is not saved in this browser. Open it on the bench, then press Predict and learn again.', { title: 'Project not found', bench: id ? pageFor(learn.page, id) : learn.page });
  const [adapter, content] = await Promise.all([learn.adapter(), loadContent({ content: learn.content })]);
  const r = adapter.evaluate(JSON.parse(JSON.stringify(project.setup)));
  if (!r.ok) throw new OpenError(`Your design cannot be run yet: ${r.reason} Change it on the bench, then come back.`, { title: 'Your design cannot run yet', bench: pageFor(learn.page, project.id) });
  const spec = openSpec({ learn, project, graph: content.graph, items: content.items, results: r.outputs });
  return { spec, loaded: { adapter, ...content } };
}
async function findSpec() {
  const q = new URLSearchParams(location.search), src = q.get('src'), id = q.get('j');
  if (src) {
    if (!/^[\w./-]+\.mjs$/.test(src) || src.includes('//')) throw new Error('src must be a relative path to a .mjs module');
    return (await import(new URL(src, location.href).href)).default;
  }
  const spec = (await listJourneys(JOURNEYS)).find(j => j.id === id);
  if (!spec) throw new Error(id ? `No journey “${id}”.` : 'No journey chosen.');
  return spec;
}

let spec, deps, runner, key, flash = null;

function save() { try { localStorage.setItem(key, JSON.stringify(runner.state)); } catch {} }
// run a runner action, keep the state, redraw; a refusal is shown, never thrown at the learner
// (what the learner typed stays in the boxes when an action is refused)
function act(fn) {
  return (...args) => {
    flash = null;
    const typed = [...app.querySelectorAll('[data-field], textarea, #answer')].map(el => [el.dataset.field ?? el.id, el.value]);
    const itemBefore = app.querySelector('[data-item]')?.dataset.item;
    try { const r = fn(...args); if (r && r.ok === false) flash = { errors: r.errors }; }
    catch (e) { flash = { text: e.message }; }
    save(); render();
    const sameItem = itemBefore && app.querySelector('[data-item]')?.dataset.item === itemBefore;
    if (flash || sameItem) for (const [k, val] of typed) { const el = app.querySelector(`[data-field="${CSS.escape(k)}"]`) ?? $(k); if (el && !el.disabled && !el.value) el.value = val; }
  };
}

// ---------- pieces ----------
const label = path => spec.labels?.[path] ?? path;
const flat = (o, pre = '') => o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, pre ? `${pre}.${k}` : k)) : [[pre, o]];
// A journey may describe its own setup (spec.describe(setup) → [{ label, value, paths }]) so the learner reads the design in
// words and units; otherwise every field is listed with spec.labels. `paths` are the setup paths a line shows (for highlighting).
const described = setup => { if (typeof spec.describe === 'function') { try { return spec.describe(setup); } catch {} } return null; };
const setupList = (setup, changed = []) => {
  const c = new Set(changed.map(d => d.path)), d = described(setup);
  const hit = paths => (paths ?? []).some(p => [...c].some(k => k === p || k.startsWith(`${p}.`)));
  if (d) return `<dl class="setup">${d.map(x => `<dt>${esc(x.label)}</dt><dd class="${hit(x.paths) ? 'chg' : ''}">${esc(x.value)}</dd>`).join('')}</dl>`;
  return `<dl class="setup">${flat(setup).map(([k, v]) => `<dt>${esc(label(k))}</dt><dd class="${c.has(k) ? 'chg' : ''}">${esc(typeof v === 'boolean' ? (v ? 'on' : 'off') : v)}</dd>`).join('')}</dl>`;
};
// Names of what changed, in the journey's own words when it describes its setup.
const changedNames = (setup, changed) => {
  const d = described(setup);
  if (!d) return changed.map(c => label(c.path));
  const names = d.filter(x => (x.paths ?? []).some(p => changed.some(c => c.path === p || c.path.startsWith(`${p}.`)))).map(x => x.label);
  return names.length ? names : changed.map(c => label(c.path));
};
const figure = f => {
  if (!f) return '';
  const draw = spec.figures?.[f.kind];
  if (typeof draw === 'function') { try { return `<div class="figure">${draw(f.params ?? {})}</div>`; } catch {} }
  return `<div class="figure"><dl class="setup">${flat(f.params ?? {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
};
const err = (id, errors) => (errors?.[id] ? `<span class="err" role="alert">${esc(errors[id])}</span>` : '');
const numberField = (id, prompt, unit, { value = '', disabled = false, errors } = {}) =>
  `<label class="field" for="f-${esc(id)}">${esc(prompt)}<span class="in"><input id="f-${esc(id)}" data-field="${esc(id)}" inputmode="decimal" autocomplete="off" value="${esc(value)}" ${disabled ? 'disabled' : ''}>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</span>${err(id, errors)}</label>`;
const fields = () => Object.fromEntries([...app.querySelectorAll('[data-field]')].map(i => [i.dataset.field, i.value]));
const message = () => (flash?.text ? `<p class="msg" role="alert">${esc(flash.text)}</p>` : '');
const scoredTable = (rows, caption) => `<table class="tbl scored"><caption>${esc(caption)}</caption><thead><tr><th>Quantity</th><th>You</th><th>Engine</th><th></th></tr></thead><tbody>${rows.map(s => `<tr><th>${esc(s.prompt)}</th><td>${num(s.predicted ?? s.answer)} ${esc(s.unit)}</td><td>${num(s.truth)} ${esc(s.unit)}</td><td class="res-${s.result}">${s.result === 'correct' ? 'close' : 'off'}</td></tr>`).join('')}</tbody></table>`;
const DIAG = { secure: 'already secure', concept: 'a concept gap', procedure: 'a method gap', recall: 'a recall gap', transfer: 'a transfer gap', prerequisite: 'a missing prerequisite', misconception: 'a known mix-up', 'insufficient-evidence': 'not enough evidence to name one cause' };
// status words come from core/ledger.mjs describeStatus: they say where the evidence came from (diagnostic, check) and name help as help
const plural = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`;
const evidenceLine = s => [`${s.unaided.right}/${s.unaided.total} right on fresh questions alone`, s.practice?.total ? `${s.practice.right}/${s.practice.total} in practice alone` : '', s.assisted.total ? `${plural(s.assisted.total, 'answer')} with help` : '', plural(s.help, 'help event')].filter(Boolean).join(', ');

function itemCard(it, { allowDontKnow = false } = {}) {
  const fb = it.feedback;
  const answer = it.answer.kind === 'choice'
    ? `<fieldset class="options" ${it.closed ? 'disabled' : ''}><legend class="quiet">Choose one</legend>${it.answer.options.map((o, i) => `<label><input type="radio" name="opt" value="${i}">${esc(o)}</label>`).join('')}</fieldset>`
    : `<label class="field" for="answer">Your answer, with its unit<span class="in"><input id="answer" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" ${it.closed ? 'disabled' : ''}></span></label>`;
  const fbHtml = !fb ? '' : fb.result === 'unresolved' ? `<div class="feedback unresolved" role="status"><b>Not read</b>${esc(fb.reason)}. Nothing was counted; try again.</div>`
    : `<div class="feedback ${fb.result}" role="status"><b>${fb.result === 'correct' ? 'Right' : fb.dontKnow ? 'Noted' : 'Not this time'}</b>${fb.misconception ? esc(`This matches a known mix-up: ${fb.misconception.label}.`) : ''}</div>`;
  const help = [...(it.hints || [])];
  return `<div class="card item" data-item="${esc(it.id)}">
    <p class="eyebrow">${esc(it.title)}</p>
    <p class="lead">${esc(it.prompt)}</p>${figure(it.figure)}
    ${help.length && !it.solution ? `<ol class="steps hints">${help.map(h => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
    ${answer}${fbHtml}
    ${it.solution ? `<div><p class="quiet">Worked solution</p><ol class="steps solution">${it.solution.map(h => `<li>${esc(h)}</li>`).join('')}</ol></div>` : ''}
    <div class="actions">${!it.closed ? `<button type="button" class="primary" data-do="answer">Check</button>` : `<button type="button" class="primary" data-do="next">Next</button>`}
      ${it.canHint ? '<button type="button" data-do="hint">Hint</button>' : ''}${it.canShow ? '<button type="button" data-do="show">Show the solution</button>' : ''}
      ${!it.closed && allowDontKnow ? '<button type="button" data-do="dontknow">I don’t know</button>' : ''}
      ${!it.closed && it.solution ? '<button type="button" data-do="next">Next</button>' : ''}</div></div>`;
}
const readAnswer = () => { const r = app.querySelector('input[name="opt"]:checked'); return r ? +r.value : app.querySelector('input[name="opt"]') ? null : $('answer')?.value ?? ''; };
function wireItem() {
  const on = (d, f) => app.querySelectorAll(`[data-do="${d}"]`).forEach(b => { b.onclick = f; });
  on('answer', act(() => runner.answer(readAnswer())));
  on('dontknow', act(() => runner.answer({ dontKnow: true })));
  on('hint', act(() => runner.hint()));
  on('show', act(() => runner.showSolution()));
  on('next', act(() => runner.next()));
  const a = $('answer'); if (a) a.onkeydown = e => { if (e.key === 'Enter') app.querySelector('[data-do="answer"]')?.click(); };
}

// ---------- phases ----------
function render() {
  if (!runner) return;
  let v;
  try { v = runner.view(); } catch (e) { return fail(e.message); }
  const i = v.phases.indexOf(v.phase);
  $('restart').hidden = v.phase === 'brief';
  const head = `<div class="progress"><ol aria-hidden="true">${v.phases.map((p, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}"></li>`).join('')}</ol><p>Step ${i + 1} of ${v.phases.length} · ${esc(v.titles[v.phase])}</p></div>`;
  // learning from the learner's own project is optional: the way back to that exact project is always one tap away
  const back = spec.anchor?.project != null && spec.bench?.page ? `<p class="backline"><a id="to-design" href="${esc(spec.bench.page)}">← Back to my design on the bench</a></p>` : '';
  const body = PHASE[v.phase](v);
  app.innerHTML = head + back + body;
  document.body.dataset.phase = v.phase;
  WIRE[v.phase]?.(v);
  wireItem();
  app.querySelector('[data-focus]')?.focus({ preventScroll: true });
}
const on = (sel, f) => { const el = app.querySelector(sel); if (el) el.onclick = f; };

// after Revision 2 is saved the learner can always go back to the design in the project (it may be a later, untested edit)
const benchLink = v => (v.bench ? `<div class="card"><p class="quiet">Your design stays editable on the bench. Changes you make there now are not part of ${esc(runner.state.revisionLabels?.[1] ?? 'the saved revision')}.</p><div class="actions"><a class="button" id="bench" href="${esc(v.bench)}">Open my design on the bench</a></div></div>` : '');
const PHASE = {
  brief: v => `<div><p class="eyebrow">${esc([v.journey.course, v.journey.semester ? `Semester ${v.journey.semester}` : ''].filter(Boolean).join(' · '))}</p><h1>${esc(v.journey.title)}</h1></div>
    <div class="card"><h2>The task</h2><p class="lead">${esc(v.brief)}</p></div>
    <div class="card"><h2>${v.existing ? 'Your design as it stands' : 'Starting design'}</h2>${setupList(v.setup)}<p class="quiet">${v.existing
      ? `Starting saves this design as ${esc(v.revision)}, a run on your own project “${esc(v.journey.course)}”. Nothing else in the project changes.`
      : `Starting the journey saves this design as ${esc(v.revision)} on a new project in the bench. You will come back to it.`}</p>
      <div class="actions"><button type="button" class="primary" id="start">Start · save ${esc(v.revision)}</button></div></div>`,
  stuck: v => `${v.choose && !v.locked ? `<div class="card" id="pick-card"><h2>What will you predict?</h2><p class="quiet">Pick ${v.choose.min === v.choose.max ? v.choose.max : `${v.choose.min} to ${v.choose.max}`} of what your design does. You predict them before the bench runs.</p>
      <fieldset class="checks" id="pick"><legend class="field">Outputs of your design</legend>${v.choose.options.map(o => `<label><input type="checkbox" value="${esc(o.id)}" ${v.choose.picked?.includes(o.id) ? 'checked' : ''}> ${esc(o.prompt)}${o.unit ? ` (${esc(o.unit)})` : ''}</label>`).join('')}${err('pick', flash?.errors)}</fieldset>
      <div class="actions"><button type="button" class="${v.choose.picked ? '' : 'primary'}" id="pick-go">${v.choose.picked ? 'Change what I predict' : 'Predict these'}</button></div></div>` : ''}
    ${v.choose && !v.choose.picked ? message() : `<div class="card"><h2>Predict before you run</h2><p class="quiet">Your predictions lock before the bench runs. A bare number is read in the unit shown.</p>
      ${v.predictions.map(p => numberField(p.id, p.prompt, p.unit, { value: v.values?.[p.id] ?? '', disabled: v.locked, errors: flash?.errors })).join('')}
      ${message()}
      ${!v.locked ? `<div class="actions"><button type="button" class="primary" id="lock">Lock predictions</button><button type="button" id="stuck">I’m stuck</button></div>`
        : !v.scored ? `<div class="actions"><button type="button" class="primary" id="run">Run the bench</button></div>` : ''}</div>`}
    ${v.scored ? `<div class="card">${scoredTable(v.scored, 'Your prediction against the engine')}
      ${v.outcome === 'missed' ? `<p>A miss is useful: it shows where to look. A few short questions will find what is blocking you.</p><div class="actions"><button type="button" class="primary" id="stuck">Find what is blocking me</button></div>`
        : `<p>Your predictions held.</p><div class="actions"><button type="button" class="primary" id="skip">Back to my design</button><button type="button" id="stuck">I’m still stuck</button></div>`}</div>` : ''}
    <details class="card about"><summary>Design being tested (${esc(runner.state.revisionLabels?.[0] ?? 'Revision 1')})</summary>${v.setup ? setupList(v.setup) : ''}</details>`,
  diagnose: v => v.result ? `<div class="card"><h2>What we found</h2><p class="lead">${esc(v.result.text)}</p>
      ${v.result.gaps.length ? `<p>First: ${v.result.gaps.map(g => `<b>${esc(g.title)}</b>`).join(', ')}. Then ${esc(v.target.title)}.</p>` : ''}
      <p class="quiet">Based on ${v.result.asked.length} answer${v.result.asked.length === 1 ? '' : 's'}. A wrong answer alone is never taken as proof of a gap.</p>
      <div class="actions"><button type="button" class="primary" data-do="next">Continue</button></div></div>`
    : `<div><h2>Find the block</h2><p class="quiet">Question ${Math.min(v.asked + (v.item?.closed ? 0 : 1), 3)} of up to 3. Answer on your own; “I don’t know” is a fine answer.</p></div>${message()}${itemCard(v.item, { allowDontKnow: true })}`,
  teach: v => v.stage === 'lesson' ? `<div class="card"><p class="eyebrow">Learn ${v.step} of ${v.of}</p><h2>${esc(v.competency.title)}${v.competency.school ? '<span class="badge">School maths</span>' : ''}</h2>
      ${v.explore ? `<p>Move it on the bench first, and watch what changes.</p><div class="actions"><a class="button" id="explore" href="${esc(v.explore.href)}">Explore on the bench</a></div>` : ''}
      ${v.steps.length ? `<ol class="steps">${v.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${v.competency.learnUrl ? `<p><a href="${esc(v.competency.learnUrl)}">Learn this in the school engine</a></p>` : ''}
      <div class="actions"><button type="button" class="primary" data-do="next">${v.practice.of ? 'Practise' : 'Continue'}</button></div></div>`
    : `<div><h2>${esc(v.competency.title)}</h2><p class="quiet">Practice ${v.practice.done + 1} of ${v.practice.of}. Hints and the worked solution are there if you need them; using them is recorded as help.</p></div>${message()}${itemCard(v.item)}`,
  apply: v => v.stage === 'transfer' ? `<div class="card"><h2>Same idea, new setting</h2><p>${esc(v.transfer?.prompt ?? 'Try the same reasoning on a different setup.')}</p>
      ${v.transfer ? `<div class="actions"><a class="button" id="transfer" href="${esc(v.transfer.href)}">Open it on the bench</a></div>` : ''}
      <div class="actions"><button type="button" class="primary" data-do="next">Continue to the check</button></div></div>`
    : `<div><h2>Apply it on your own</h2><p class="quiet">Question ${v.done + 1} of ${v.of}. Fresh numbers, no hints.</p></div>${message()}${itemCard(v.item)}`,
  check: v => v.stage === 'result' ? `<div class="card"><h2>Check on your own</h2><p class="lead status-${esc(v.status)}" id="status">${esc(v.statusText ?? describeStatus({ status: v.status }))}.</p>
      ${['independent-after-help', 'independent'].includes(v.status) ? '<p class="quiet">Recorded with your help kept apart. A later check will strengthen this.</p><div class="actions"><button type="button" class="primary" id="design">Back to my design</button></div>'
        : '<div class="actions"><button type="button" class="primary" id="reteach">Learn it again</button><button type="button" id="design">Go to my design anyway</button></div>'}</div>`
    : `<div><h2>One fresh question, on your own</h2><p class="quiet">No hints. This is the evidence that you can do it alone.</p></div>${message()}${itemCard(v.item)}`,
  return: v => { if (v.missing) return `<div class="card"><p class="msg">The project for this journey is no longer in this browser.</p></div>`;
    const R1 = esc(runner.state.revisionLabels[0]), R2 = esc(runner.state.revisionLabels[1]), lt = v.lastTested, untested = v.rounds.length > 0 && !v.currentTested;
    const tested = !v.rounds.length ? '' : `<p class="tested ${untested ? 'no' : 'yes'}" id="tested-status">${lt ? `Last tested: run <b>${esc(lt.run)}</b>. ` : ''}${v.currentTested
      ? `This design is tested (run ${esc(v.currentTested)}).` : `This design is not tested${lt && v.sinceTested.length ? `: changed since run ${esc(lt.run)} (${changedNames(v.setup, v.sinceTested).map(esc).join(', ')})` : ''}.`}</p>`;
    return `<div class="card"><h2>Your design</h2>
      <p class="quiet">${v.changed.length ? `Changed since ${R1}: ${changedNames(v.setup, v.changed).map(esc).join(', ')}.` : `As saved in ${R1}.`}</p>${setupList(v.setup, v.changed)}${tested}
      <div class="actions"><a class="button" id="bench" href="${esc(v.bench)}">Change it on the bench</a><button type="button" id="reload">I’ve saved a change</button></div>
      <p class="quiet">Make the change on the bench and save it there; this page reads your latest saved design.</p></div>
    <div class="card" id="predict-card"><h2>Predict, then run</h2>
      ${v.predictions.map(p => numberField(p.id, p.prompt, p.unit, { value: v.locked?.values?.[p.id] ?? '', disabled: !!v.locked, errors: flash?.errors })).join('')}
      ${v.lockedStale ? '<p class="msg">Your design changed after you locked. Run will ask you to predict again.</p>' : ''}${untested ? '' : message()}
      <div class="actions">${v.locked ? '<button type="button" class="primary" id="run">Run the bench</button>' : '<button type="button" class="primary" id="lock">Lock predictions</button>'}</div></div>
    ${v.rounds.map((r, k) => `<div class="card round">${scoredTable(r.scored, `Prediction run ${k + 1} · run ${r.run}`)}</div>`).join('')}
    ${!v.rounds.length ? '' : !untested ? `<div class="card"><h2>Save the revision</h2><p class="quiet">Saves this design, as tested in run ${esc(v.currentTested)}, as ${R2}.</p><div class="actions"><button type="button" class="primary" id="save">Save as ${R2}</button></div></div>`
      : `<div class="card" id="choose"><h2>Save the revision</h2>${message() || `<p class="quiet">${R2} must be a design you predicted and ran. Your current design has not been run since you changed it.</p>`}
      <div class="actions"><button type="button" class="primary" id="predict-current">Predict and run this design</button>${lt ? `<button type="button" id="save-tested">Save the last tested design as ${R2}</button>` : ''}</div>
      ${lt ? `<p class="quiet">The second choice saves the setup of run ${esc(lt.run)} as ${R2}. Your current edits stay in the project on the bench, but are not part of ${R2}.</p>` : ''}</div>`}`; },
  decide: v => `${v.message ? `<p class="notice" role="status" id="saved-note">${esc(v.message)}</p>` : ''}${benchLink(v)}<div class="card"><h2>Your decision</h2><p class="quiet" id="decide-design">From ${esc(v.from)} to ${esc(v.to)}${v.tested ? ` (tested in run ${esc(v.tested)})` : ''}: ${v.changed.length ? changedNames(v.setup, v.changed).map(esc).join(', ') : 'no change to the design'}.</p>
      <label class="field">What did you decide, and why?<textarea id="claim" data-focus>${esc(runner.state.decision?.claim ?? '')}</textarea>${err('claim', flash?.errors)}</label>
      <fieldset class="checks"><legend class="field">Which runs show it?</legend>${v.runs.map(r => `<label><input type="checkbox" value="${esc(r.id)}" ${r.id === v.to ? 'checked' : ''}> ${esc(r.id)} · ${esc(r.name)}</label>`).join('')}${err('runs', flash?.errors)}</fieldset>
      <label class="field">What did you consider and reject? (one per line)<textarea id="rejected"></textarea></label>
      ${message()}<div class="actions"><button type="button" class="primary" id="decide">Save the decision</button></div></div>`,
  defend: v => `<div class="card"><h2>Defend it</h2><p class="quiet">What if things changed? Answer from your own numbers; the engine checks each one on a copy of your design.</p>
      ${v.questions.map((q, k) => numberField(String(k), q.prompt, q.unit, { errors: flash?.errors })).join('')}
      ${v.questions.length ? '' : '<p class="quiet">No questions for this design.</p>'}${message()}
      <div class="actions"><button type="button" class="primary" id="defend">Submit</button></div></div>${benchLink(v)}`,
  summary: v => { const p = v.portfolio, d = p.design;
    return `<div><p class="eyebrow">Portfolio entry</p><h1>${esc(p.journey.title)}</h1></div>
    <div class="card"><h2>Design ${esc(d.from.label)} → ${esc(d.to?.label ?? '–')}</h2>${d.to ? `<p class="quiet" id="r2-run">${esc(d.to.label)} is run ${esc(d.to.run)}${d.to.tested ? `, the design you predicted and ran in run ${esc(d.to.tested)}` : ''}.</p>${setupList(d.to.setup, d.changed)}` : ''}
      <table class="tbl"><thead><tr><th></th><th>${esc(d.from.label)}</th><th>${esc(d.to?.label ?? '')}</th></tr></thead><tbody>${Object.entries(d.from.outputs).map(([k, o]) => `<tr><th>${esc(o.label)}${o.unit ? ` (${esc(o.unit)})` : ''}</th><td>${num(o.value)}</td><td>${num(d.to?.outputs[k]?.value)}</td></tr>`).join('')}</tbody></table></div>
    ${p.decision ? `<div class="card"><h2>Decision</h2><p class="lead" id="claim-text">${esc(p.decision.claim)}</p><p class="quiet">Runs: ${p.decision.runs.map(esc).join(', ')}${p.decision.rejected.length ? ` · Rejected: ${p.decision.rejected.map(esc).join('; ')}` : ''}</p>
      ${p.decision.defence.length ? scoredTable(p.decision.defence, 'Defence') : ''}</div>` : ''}
    <div class="card"><h2>Prerequisite trail</h2>
      <p class="quiet">${p.trail.skipped ? 'Predictions held; no detour.' : `Blocked at: ${p.trail.stuck.outcome === 'stuck' ? 'asked for help' : 'a missed prediction'}. Diagnosis: ${esc(DIAG[p.trail.diagnosis?.result] ?? p.trail.diagnosis?.result ?? '–')}.`}</p>
      <ul class="list trail">${Object.entries(p.trail.status).map(([id, s]) => `<li class="quiet" data-competency="${esc(id)}" data-status="${esc(s.status)}" data-role="${esc(s.role ?? '')}"><b>${esc(s.title)}</b> · <span class="st">${esc(s.text ?? describeStatus(s))}</span> · ${esc(evidenceLine(s))}</li>`).join('')}</ul></div>
    <div class="card"><h2>Runs</h2><ul class="list">${p.runs.map(r => `<li class="quiet">${esc(r.name)} <span class="eyebrow">run ${esc(r.id)}</span> · ${r.reproduced ? '<span class="okmsg">reproduced from its saved setup</span>' : '<span class="badmsg">does not reproduce</span>'}</li>`).join('')}</ul>
      <div class="actions"><button type="button" class="primary" id="export">Export portfolio (JSON)</button><button type="button" id="export-project">Export project file</button></div></div>${benchLink(v)}`; },
};

const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
const WIRE = {
  brief: () => on('#start', act(() => runner.start())),
  stuck: () => { on('#pick-go', act(() => runner.choose([...app.querySelectorAll('#pick input:checked')].map(c => c.value)))); on('#lock', act(() => runner.lockStuck(fields()))); on('#run', act(() => runner.runStuck())); on('#stuck', act(() => runner.stuck())); on('#skip', act(() => runner.skipToDesign())); },
  check: () => { on('#reteach', act(() => runner.reteach())); on('#design', act(() => runner.toDesign())); },
  return: () => { on('#lock', act(() => runner.lockReturn(fields()))); on('#run', act(() => runner.runReturn())); on('#save', act(() => runner.saveRevision())); on('#reload', act(() => {}));
    on('#save-tested', act(() => runner.saveTestedRevision()));
    on('#predict-current', () => { act(() => runner.predictCurrent())(); const card = $('predict-card'); card?.scrollIntoView({ block: 'start' }); card?.querySelector('input:not([disabled]), #run')?.focus({ preventScroll: true }); }); },
  decide: () => on('#decide', act(() => runner.decide({ claim: $('claim').value, runs: [...app.querySelectorAll('.checks input:checked')].map(c => c.value), rejected: $('rejected').value }))),
  defend: () => on('#defend', act(() => runner.defendAnswers(fields()))),
  summary: v => {
    const slug = v.portfolio.journey.id.replace(/[^\w-]+/g, '-');
    on('#export', () => download(`portfolio-${slug}.json`, JSON.stringify(runner.portfolio(), null, 2)));
    on('#export-project', () => download(`project-${slug}.json`, P.serialize(runner.project())));
  },
};
// start once everything above and below is defined
try {
  const q = new URLSearchParams(location.search);
  let loaded;
  if (q.get('open')) ({ spec, loaded } = await openOwn(q));
  else { spec = await findSpec(); loaded = await loadJourney(spec); }
  deps = { adapter: loaded.adapter, graph: loaded.graph, items: loaded.items, ledger: openLedger(), store: P.openStore(spec.bench.domain) };
  if (loaded.skipped.length || loaded.problems.length) console.warn('journey content', loaded.skipped, loaded.problems);
  key = `openpath.journey.${spec.id}`;
  let saved = null; try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  const fresh = () => createRunner(spec, { ...deps, nonce: crypto.getRandomValues(new Uint32Array(1))[0] });
  try { runner = saved ? createRunner(spec, deps, saved) : fresh(); } catch { runner = fresh(); }
  $('restart').onclick = () => { if (!confirm('Start this journey again? Your saved designs and your learning record stay.')) return; localStorage.removeItem(key); runner = fresh(); save(); render(); };
  document.title = `${spec.title} · OpenPath Labs`;
  $('crumb').textContent = [spec.course, spec.title].filter(Boolean).join(' · ');
  render();
  // coming back from a bench (tab switch or back button): read the latest saved design
  addEventListener('pageshow', e => { if (e.persisted) render(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
  window.__journey = { state: () => runner.state, items: deps.items, adapter: deps.adapter, ledger: deps.ledger };
} catch (e) { fail(e.message, e.opts); }
document.body.dataset.ready = document.body.dataset.ready || 'true';
