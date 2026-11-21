// Pump House fault lab — UI. Physics and faults: ./faults.mjs (Pump House only).
// Shared with Engine World: ../core/workbench.mjs (layout) and ../core/experiment.mjs (journal: predictions locked
// before results, named runs with units, run comparison, feedback before the next case).
import { casesForSeed, repair, cleanExpected, SECTIONS, ACTIONS, elevations } from './faults.mjs';
import { workbench } from '../core/workbench.mjs';
import { Journal, compareRuns, checkAnswers } from '../core/experiment.mjs';

const $ = id => document.getElementById(id);
const f = (n, d = 1) => n.toFixed(d);
const kPa = pa => `${f(pa / 1000, 2)} kPa`;
// The case seed is never shown or written anywhere the learner sees; ?seed= exists only so tests are repeatable.
const randomSeed = () => 1 + Math.floor(Math.random() * 1000);
let seed = (() => { const q = +new URLSearchParams(location.search).get('seed'); return Number.isFinite(q) && q > 0 ? q : randomSeed(); })();
let CASES = casesForSeed(seed);   // the hidden faults live only in this closure
let J = new Journal();
const WB = workbench('pump-fault', { initial: 'mission' });
const SECTION_LABEL = { strainer: 'the inlet strainer', discharge: 'the discharge section' };
const FAULT_LABEL = { strainer: 'Fouled inlet strainer', discharge: 'Restriction on the discharge side' };

// learner state per case: 'guided' then 'unseen'
const L = { stage: 'brief', caseId: 'guided', measured: null, answers: {}, action: null, repairs: [] };
const cur = () => CASES[L.caseId];
const guided = () => L.caseId === 'guided';

function snapshot(name, state, measured) {
  const c = cur(), d = state.dashboard;
  const outputs = { flow: { value: d.flow * 1000, unit: 'L/s', label: 'Flow' }, head: { value: d.head, unit: 'm', label: 'Pump head' }, power: { value: d.power / 1000, unit: 'kW', label: 'Motor power' }, eff: { value: d.eff * 100, unit: '%', label: 'Efficiency' } };
  if (measured) outputs[`dp_${measured}`] = { value: state.taps[measured] / 1000, unit: 'kPa', label: `Δp across ${SECTION_LABEL[measured]}` };
  const e = elevations(c.cond);
  return J.saveRun(`${L.caseId}: ${name}`, { inputs: {
    headerElevation: { value: e.header, unit: 'm', label: 'Return-header elevation above pump' },
    basinElevation: { value: e.basin, unit: 'm', label: 'Basin water elevation above pump' },
    staticLift: { value: e.staticLift, unit: 'm', label: 'Static lift (header − basin)' },
    rpm: { value: c.cond.rpm, unit: 'rpm', label: 'Pump speed' } }, outputs });
}

// ---------- diagram ----------
function diagram(state, gauge) {
  const c = cur(), e = elevations(c.cond), s = $('loop');
  const yP = 228, yHeader = yP - Math.min(150, 9 * e.header), yBasin = yP - 9 * e.basin;   // 9 px per metre above the pump centreline
  const pipe = d => `<path d="${d}" fill="none" stroke="#4a5f6c" stroke-width="7"/><path d="${d}" fill="none" stroke="#0d151b" stroke-width="4.4"/><path class="flowline" d="${d}" fill="none" stroke="#7fd4ff" stroke-width="2" stroke-dasharray="4 7"/>`;
  const tapPair = (x1, x2, y, id) => `<g class="taps"><circle cx="${x1}" cy="${y - 7}" r="3" fill="#0d151b" stroke="#a8b8c3"/><circle cx="${x2}" cy="${y - 7}" r="3" fill="#0d151b" stroke="#a8b8c3"/><text x="${(x1 + x2) / 2}" y="${y - 14}" class="t" text-anchor="middle">taps ${id}</text></g>`;
  const g = gauge ? (() => { const x = gauge.id === 'strainer' ? 112 : 232; return `<g><line x1="${x - 12}" y1="${yP - 10}" x2="${x - 4}" y2="${yP - 40}" stroke="#ff8a3d"/><line x1="${x + 12}" y1="${yP - 10}" x2="${x + 4}" y2="${yP - 40}" stroke="#ff8a3d"/><rect x="${x - 34}" y="${yP - 64}" width="68" height="24" rx="4" fill="#0d151b" stroke="#ff8a3d"/><text x="${x}" y="${yP - 48}" class="tl" text-anchor="middle">Δp ${kPa(gauge.value)}</text></g>`; })() : '';
  s.innerHTML = `<style>.t{font:500 7.5px "JetBrains Mono",ui-monospace,monospace;fill:#8fa3b0}.tl{font:600 8.5px "JetBrains Mono",ui-monospace,monospace;fill:#e6eef3}</style>
    <defs><pattern id="g" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#16222b" stroke-width=".6"/></pattern></defs>
    <rect width="400" height="300" fill="url(#g)"/>
    <line x1="0" x2="400" y1="${yP + 22}" y2="${yP + 22}" stroke="#6d8796"/>
    <rect x="14" y="${yBasin - 10}" width="56" height="${yP + 18 - yBasin}" fill="#0d151b" stroke="#a8b8c3"/><rect x="15" y="${yBasin}" width="54" height="${yP + 17 - yBasin}" fill="#1f5f8f" opacity=".7"/><text x="42" y="${yBasin - 14}" class="t" text-anchor="middle">tower basin</text>
    ${pipe(`M70 ${yP} H 150`)}${pipe(`M186 ${yP} H 300 V ${yHeader} H 360`)}
    <rect x="100" y="${yP - 9}" width="24" height="18" fill="#0d151b" stroke="#a8b8c3"/><path d="M104 ${yP - 6} l16 12 M104 ${yP + 6} l16 -12" stroke="#6d8796"/><text x="112" y="${yP + 22 + 12}" class="t" text-anchor="middle">inlet strainer</text>
    <g transform="translate(168 ${yP})"><circle r="16" fill="#0d151b" stroke="#4fc3f7" stroke-width="1.4"/><text y="3" class="tl" text-anchor="middle">P</text></g><text x="168" y="${yP + 22 + 12}" class="t" text-anchor="middle">pump</text>
    <g transform="translate(220 ${yP})"><path d="M-8 -8 L8 8 M-8 8 L8 -8" stroke="#a8b8c3"/></g><rect x="236" y="${yP - 8}" width="14" height="16" fill="#0d151b" stroke="#a8b8c3"/>
    <text x="232" y="${yP + 22 + 12}" class="t" text-anchor="middle">discharge section</text>
    ${tapPair(96, 128, yP, 'A')}${tapPair(212, 254, yP, 'B')}
    <rect x="360" y="${yHeader - 14}" width="30" height="28" fill="#0d151b" stroke="#a8b8c3"/><text x="375" y="${yHeader - 18}" class="t" text-anchor="middle">header</text>
    <line x1="70" x2="336" y1="${yBasin}" y2="${yBasin}" stroke="#2e4553" stroke-dasharray="2 3"/><line x1="360" x2="336" y1="${yHeader}" y2="${yHeader}" stroke="#2e4553" stroke-dasharray="2 3"/>
    <line id="lift-dim" x1="330" x2="330" y1="${yBasin}" y2="${yHeader}" stroke="#4fc3f7" stroke-width=".8"/><text id="lift-label" x="340" y="${(yBasin + yHeader) / 2}" class="t" writing-mode="tb" text-anchor="middle" fill="#4fc3f7">static lift ${e.staticLift} m</text>
    <text x="76" y="${yBasin - 3}" class="t">basin +${e.basin} m</text><text x="358" y="${yHeader + 24}" class="t" text-anchor="end">header +${e.header} m</text>
    <line x1="186" x2="200" y1="${yP}" y2="${yP}" stroke="#2e4553"/><text x="202" y="${yP + 3}" class="t">0 m (pump ℄)</text>
    <text x="168" y="${yP - 26}" class="t" text-anchor="middle">${c.cond.rpm} rpm</text>${g}`;
  const d = state.dashboard;
  $('g-q').textContent = `${f(d.flow * 1000, 2)} L/s`; $('g-h').textContent = `${f(d.head, 1)} m`; $('g-p').textContent = `${f(d.power / 1000, 2)} kW`; $('g-e').textContent = `${f(d.eff * 100, 0)} %`;
  const ok = state === c.healthy;
  $('status').textContent = ok ? `FLOW RESTORED · ${f(d.flow * 1000, 2)} L/s` : `LOW FLOW · ${f(d.flow / c.healthy.dashboard.flow * 100, 0)} % of healthy`;
  $('status').className = 'status ' + (ok ? 'ok' : 'warn');
}

// ---------- tables ----------
const table = (rows, heads) => `<div class="tbl-wrap"><table class="cmp"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('').replace('<td>', '<th>').replace('</td>', '</th>')}</tr>`).join('')}</tbody></table></div>`;
function briefTable() {
  const c = cur(), h = c.healthy.dashboard, x = c.faulted.dashboard;
  return table([
    ['Flow', `${f(h.flow * 1000, 2)} L/s`, `${f(x.flow * 1000, 2)} L/s`],
    ['Pump head', `${f(h.head, 1)} m`, `${f(x.head, 1)} m`],
    ['Motor power', `${f(h.power / 1000, 2)} kW`, `${f(x.power / 1000, 2)} kW`],
    ['Efficiency', `${f(h.eff * 100, 0)} %`, `${f(x.eff * 100, 0)} %`],
    ['Δp across inlet strainer (taps A)', kPa(c.healthy.taps.strainer), 'not measured'],
    ['Δp across discharge section (taps B)', kPa(c.healthy.taps.discharge), 'not measured'],
  ], ['', 'Healthy (commissioning)', 'Today']);
}
function logTable() {
  const names = J.runNames();
  $('log').innerHTML = names.length ? names.map(n => { const r = J.run(n); return `<p class="step">${n}</p>${table(Object.values(r.outputs).map(o => [`${o.label}`, `${f(o.value, 2)} ${o.unit}`]), ['', 'Value'])}`; }).join('') : '<p class="note">No runs yet.</p>';
}

// ---------- mission ----------
const opt = (key, value, text) => `<button type="button" data-q="${key}" data-v="${value}" aria-pressed="${L.answers[key] === value}">${text}</button>`;
function truths() {
  const c = cur(), m = L.measured, ratio = c.faulted.taps[m] / cleanExpected(c, m);
  const cite = ratio > 1.5 ? 'higher' : ratio < 0.8 ? 'lower' : 'same';
  return {
    cite: { expected: cite, explain: `${kPa(c.faulted.taps[m])} measured; a clean ${SECTIONS[m].name.split(' (')[0]} would read ${kPa(c.healthy.taps[m])} × (${f(c.faulted.dashboard.flow * 1000, 2)} / ${f(c.healthy.dashboard.flow * 1000, 2)})² = ${kPa(cleanExpected(c, m))} at today’s flow — ${f(ratio, 1)} times that.` },
    ...(guided() ? { ruleout: { expected: cite === 'higher' ? 'here' : 'elsewhere', explain: cite === 'higher' ? 'A restriction in the other section would only lower the flow, and with it this section’s loss (∝ Q²). Only a restriction inside this section can push its Δp far above the clean value.' : 'This section loses exactly what a clean one would at today’s flow, so it is not restricted. The flow is down, so the extra loss must be in the only other candidate section.' } } : {}),
    diagnosis: { expected: c.fault, explain: `The fault was: ${FAULT_LABEL[c.fault].toLowerCase()}.` },
  };
}
function mission() {
  const c = cur(), el = $('mission');
  let h = `<div class="mhead"><span>${guided() ? 'Guided case' : 'New case — no hints'}</span></div>`;
  h += `<span class="unit">CE3391 Unit IV · centrifugal pumps in a system</span>`;
  if (L.stage === 'done') { el.innerHTML = h + doneHTML(); wire(); return; }
  h += guided() ? `<h2>The factory cooling loop is delivering less water</h2><p>Maintenance wants to replace the pump. Before anything is replaced, find the fault. Two faults are possible: a <b>fouled inlet strainer</b> or a <b>restriction on the discharge side</b>.</p>`
    : `<h2>Another plant, same complaint</h2><p>Pump at ${c.cond.rpm} rpm. Same two candidate faults. Diagnose and repair it.</p>`;
  { const e = elevations(c.cond); h += `<p class="note" id="elev">Elevations above the pump centreline: return header <b>${e.header} m</b>, basin water <b>${e.basin} m</b>. Static lift = ${e.header} − ${e.basin} = <b>${e.staticLift} m</b>.</p>`; }
  h += briefTable();
  if (guided()) h += `<p class="note">The dashboard is identical for both candidate faults — the pump does not know where the extra loss is. You may place one differential-pressure gauge.</p>`;
  // 1 · hypothesis
  h += `<p class="step">1 · Your hypothesis</p><div class="opts">${opt('hypothesis', 'strainer', FAULT_LABEL.strainer)}${opt('hypothesis', 'discharge', FAULT_LABEL.discharge)}</div>`;
  // 2 · place the gauge
  if (L.answers.hypothesis) {
    h += `<p class="step">2 · Place the Δp gauge (one measurement)</p>`;
    if (!L.measured) h += `<div class="opts"><button type="button" data-measure="strainer">Across taps A (inlet strainer)</button><button type="button" data-measure="discharge">Across taps B (discharge section)</button></div>`;
    else h += `<p class="measured">Δp across ${SECTION_LABEL[L.measured]}: <b>${kPa(c.faulted.taps[L.measured])}</b> at ${f(c.faulted.dashboard.flow * 1000, 2)} L/s.</p>`;
  }
  // 3 · cite, rule out, diagnose, act
  if (L.measured) {
    h += `<p class="step">3 · Cite your reading</p><p>Compared with what a clean section would read <i>at today’s flow</i>, your reading is:</p>`;
    if (guided()) h += `<p class="note">Hint: a clean section’s loss scales with flow² — healthy reading × (today’s flow ÷ healthy flow)².</p>`;
    h += `<div class="opts">${opt('cite', 'higher', 'Much higher')}${opt('cite', 'same', 'About the same')}${opt('cite', 'lower', 'Lower')}</div>`;
    if (guided()) h += `<p>Why does that rule out the other fault?</p><div class="opts">${opt('ruleout', 'here', 'This section loses far more than a clean one would at this flow; a restriction elsewhere would have lowered the flow and made this reading smaller, so the restriction is here.')}${opt('ruleout', 'elsewhere', 'This section reads like a clean one at today’s flow, so it is not restricted; the flow is down, so the extra loss must be in the other section.')}${opt('ruleout', 'pump', 'The flow is lower than healthy, so the pump itself must be worn.')}</div>`;
    h += `<p>Diagnosis:</p><div class="opts">${opt('diagnosis', 'strainer', FAULT_LABEL.strainer)}${opt('diagnosis', 'discharge', FAULT_LABEL.discharge)}</div>`;
    h += `<p>Corrective action:</p><div class="opts">${Object.entries(ACTIONS).map(([k, a]) => `<button type="button" data-act="${k}" aria-pressed="${L.action === k}">${a.name}</button>`).join('')}</div>`;
    const need = Object.keys(truths()), ready = need.every(k => L.answers[k]) && L.action;
    h += `<div class="row"><button type="button" class="primary" id="do-repair" ${ready ? '' : 'disabled'}>Carry out the repair and re-run the loop</button></div>`;
  }
  // repair results so far
  h += L.repairs.map(repairHTML).join('');
  el.innerHTML = h; wire();
}
function repairHTML(rp, i) {
  const c = cur(), rows = compareRuns(J.run(`${L.caseId}: healthy`), J.run(rp.run), ['flow', 'head', 'power', 'eff']);
  const t = table(rows.map(r => [r.label, `${f(r.a, 2)} ${r.unit}`, `${f(r.b, 2)} ${r.unit}`, `${r.rel >= 0 ? '+' : '−'}${f(Math.abs(r.rel * 100), 1)} %`]), ['', 'Healthy', `After: ${ACTIONS[rp.action].name.toLowerCase()}`, 'vs healthy']);
  if (rp.fixed) return `<p class="step">Repair ${i + 1}</p><p class="fb ok">Flow is back to the healthy value. The repair matched the fault.</p>${t}`;
  const m = L.measured, still = J.run(rp.run).outputs[`dp_${m}`];
  return `<p class="step">Repair ${i + 1}</p><p class="fb no">Nothing changed: flow is still ${f(c.faulted.dashboard.flow * 1000, 2)} L/s (healthy ${f(c.healthy.dashboard.flow * 1000, 2)} L/s), pump head ${f(c.faulted.dashboard.head, 1)} m. ${still ? `The gauge across ${SECTION_LABEL[m]} still reads <b>${f(still.value, 2)} kPa</b>.` : ''} ${rp.action === 'replace-pump' ? 'A new identical pump sits on the same system curve, so it settles at the same point.' : 'The section you repaired was not the one losing the head.'} Look at your measurement again and choose another action.</p>${t}`;
}
function doRepair() {
  const c = cur(), r = repair(c, L.action), m = L.measured;
  const name = `after ${ACTIONS[L.action].name.toLowerCase()} (#${L.repairs.length + 1})`;
  snapshot(name, r.state, m);
  L.repairs.push({ action: L.action, fixed: r.fixed, run: `${L.caseId}: ${name}` });
  diagram(r.state, { id: m, value: r.state.taps[m] });
  if (r.fixed) { L.stage = 'done'; J.giveFeedback(L.caseId); } else L.action = null;
  logTable(); mission();
}
function doneHTML() {
  const c = cur(), chk = checkAnswers(L.answers, truths()), firstFix = L.repairs[0]?.fixed;
  const hyp = J.score(`${L.caseId}:hypothesis`, c.fault);
  let h = `<h2>${guided() ? 'Guided case' : 'New case'}: flow restored</h2>`;
  h += `<p class="fb ${hyp.correct ? 'ok' : 'no'}">Your starting hypothesis (${FAULT_LABEL[hyp.predicted].toLowerCase()}) was ${hyp.correct ? 'right' : 'not the fault'} — that is fine; the measurement is what decides.</p>`;
  h += chk.items.map(i => `<p class="fb ${i.ok ? 'ok' : 'no'}">${{ cite: 'Your reading', ruleout: 'Ruling out the other fault', diagnosis: 'Diagnosis' }[i.id]}: ${i.ok ? 'correct' : 'not supported'}. ${i.explain}</p>`).join('');
  h += L.repairs.map(repairHTML).join('');
  const passed = chk.allCorrect && firstFix;
  if (guided()) h += `<div class="row"><button type="button" class="primary" id="next-case" ${J.canAdvance('guided') ? '' : 'disabled'}>Next: a new case without hints</button></div>`;
  else h += `<p class="result ${passed ? 'right' : 'wrong'}">${passed ? 'Passed: you diagnosed an unfamiliar case from your own measurement and fixed it first time.' : 'Not passed yet: a correct diagnosis must rest on a correctly read measurement and fix the loop first time.'}</p><div class="row"><button type="button" id="restart">Try a different plant</button></div>`;
  document.body.dataset.result = guided() ? 'guided-done' : passed ? 'passed' : 'not-passed';
  return h;
}
function wire() {
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const k = b.dataset.q, v = b.dataset.v;
    if (k === 'hypothesis') { if (L.measured) return; J.predict(`${L.caseId}:hypothesis`, v); }
    L.answers[k] = v; mission();
  });
  document.querySelectorAll('[data-measure]').forEach(b => b.onclick = () => {
    const m = b.dataset.measure, c = cur();
    J.lock(`${L.caseId}:hypothesis`);
    L.measured = m;
    snapshot('today, faulted', c.faulted, m);
    diagram(c.faulted, { id: m, value: c.faulted.taps[m] }); logTable(); mission();
    document.body.dataset.stage = 'measured';
  });
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { L.action = b.dataset.act; mission(); });
  const r = $('do-repair'); if (r) r.onclick = doRepair;
  const n = $('next-case'); if (n) n.onclick = () => { if (!J.canAdvance('guided')) return; startCase('unseen'); };
  const rs = $('restart'); if (rs) rs.onclick = () => { seed = randomSeed(); CASES = casesForSeed(seed); J = new Journal(); startCase('guided'); };
}
function startCase(id) {
  Object.assign(L, { stage: 'brief', caseId: id, measured: null, answers: {}, action: null, repairs: [] });
  snapshot('healthy', cur().healthy);
  diagram(cur().faulted, null); logTable(); mission();
  document.body.dataset.case = id; document.body.dataset.stage = 'brief'; document.body.dataset.result = '';
  WB.open('mission');
}
startCase('guided');
window.__fault = { journal: () => J };   // runs and locked predictions only — the hidden fault is not exposed
document.body.dataset.ready = 'true';
