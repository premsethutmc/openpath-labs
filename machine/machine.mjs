// Machine design bench UI (shafts). Renders the setup and records edits; every number, check and explanation
// comes from machine/model.mjs; saved runs go through the shared project record (core/notebook.mjs).
import { workbench } from '../core/workbench.mjs';
import { notebook } from '../core/notebook.mjs';
import { MATERIALS } from '../core/materials.mjs';
import * as M from './model.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const f = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : '–';
let setup = M.emptySetup(), msg = {}, sens = 'deflection', sw = null, swForm = null, drag = null;

const changed = () => { nb.sync(); render(); };
const act = (k, fn) => { try { const t = fn(); msg = t ? { [k]: { ok: true, text: t } } : {}; } catch (e) { msg = { [k]: { text: e.message } }; } changed(); };
const say = k => msg[k] ? `<p class="msg ${msg[k].ok ? 'okmsg' : ''}" role="alert">${esc(msg[k].text)}</p>` : '';
const numOrNull = v => (v === '' ? null : +v);

function paintStarts() {
  $('starts').innerHTML = `<button type="button" class="buildbtn" id="empty">Empty bench</button>` + M.PRESETS.map(p => `<button type="button" data-preset="${p.id}">Preset: ${esc(p.name)}</button>`).join('');
  $('empty').onclick = () => { setup = M.emptySetup(); msg = {}; sw = null; changed(); bench.open('shaft'); };
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { setup = M.fromPreset(b.dataset.preset); msg = {}; sw = null; changed(); });
}

// ---------- drawing ----------
function scale() { const L = M.shaftLength(setup) || 1; return { L, X: x => 40 + x / L * 520, inv: px => (px - 40) / 520 * L }; }
function paintShaft(e) {
  const svg = $('shaft');
  if (!setup.segments.length) { svg.innerHTML = `<text x="300" y="105" text-anchor="middle" class="hint">Empty bench — add a shaft segment on the Shaft tab, or start from a preset.</text>`; return; }
  const { X } = scale(), dmax = Math.max(...setup.segments.map(s => s.d)), k = 56 / dmax, cy = 92;
  let x = 0, out = '';
  setup.segments.forEach(s => { const h = s.d * k; out += `<rect x="${X(x)}" y="${cy - h / 2}" width="${X(x + s.L) - X(x)}" height="${h}" class="seg ${setup.material}"/>`; if (s.bore) out += `<rect x="${X(x)}" y="${cy - s.bore * k / 2}" width="${X(x + s.L) - X(x)}" height="${s.bore * k}" class="bore"/>`; x += s.L; });
  out += `<text x="${X(0)}" y="200" class="dim">0</text><text x="${X(M.shaftLength(setup))}" y="200" class="dim" text-anchor="end">${M.shaftLength(setup)} mm</text>`;
  setup.loads.forEach(l => {
    const px = X(l.x);
    if (l.kind === 'force') { const dn = l.F >= 0, y0 = dn ? 18 : cy + 70, y1 = dn ? cy - 32 : cy + 32; out += `<line x1="${px}" x2="${px}" y1="${y0}" y2="${y1}" class="force" marker-end="url(#arr)"/><text x="${px + 4}" y="${dn ? 16 : cy + 82}" class="lbl">${f(l.F / 1000, 2)} kN</text>`; }
    else out += `<path d="M${px - 9} ${cy - 40} a10 6 0 1 1 18 0" class="torque" marker-end="url(#arrT)"/><text x="${px - 4}" y="${cy - 50}" class="lbl" text-anchor="middle">${l.T > 0 ? '+' : ''}${l.T} N·m</text>`;
  });
  setup.bearings.forEach((b, i) => {
    const px = X(b.x), c = e.ok ? e.checks.find(q => q.key === `R:${b.id}`) : null, R = e.ok ? e.outputs[`R:${b.id}`].value : null;
    out += `<g data-brg="${b.id}" role="button" tabindex="0" aria-label="Bearing ${i + 1} at ${b.x} mm — drag to move"><path d="M${px} ${cy + 30} l-11 22 h22z" class="brg ${c && !c.pass ? 'over' : ''}"/><rect x="${px - 16}" y="${cy + 26}" width="32" height="32" fill="transparent"/></g>
      <text x="${px}" y="${cy + 66}" class="lbl" text-anchor="middle">B${i + 1}${R !== null ? ` ${f(R, 0)} N` : ''}</text>`;
  });
  svg.innerHTML = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#f0b429"/></marker><marker id="arrT" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#4fc3f7"/></marker></defs>${out}`;
  svg.querySelectorAll('[data-brg]').forEach(g => g.onpointerdown = ev => { drag = g.dataset.brg; svg.setPointerCapture(ev.pointerId); ev.preventDefault(); });
}
function pointerX(ev) { const r = $('shaft').getBoundingClientRect(); return (ev.clientX - r.left) / r.width * 600; }
$('shaft').addEventListener('pointermove', ev => { if (!drag) return; const { L, inv } = scale(), x = Math.round(Math.min(L, Math.max(0, inv(pointerX(ev)))) / 5) * 5; try { M.setBearing(setup, drag, 'x', x); render(); } catch {} });
const endDrag = () => { if (drag) { drag = null; changed(); } };
$('shaft').addEventListener('pointerup', endDrag); $('shaft').addEventListener('pointercancel', endDrag);

function paintPlots(e) {
  const svg = $('plots');
  if (!e.ok) { svg.innerHTML = ''; return; }
  const { X } = scale(), pts = e.r.points, Mmax = Math.max(1e-9, ...pts.map(p => Math.abs(p.M))), D = e.r.defl, Vmax = Math.max(1e-12, ...D.map(p => Math.abs(p.v)));
  const ym = p => 45 - p.M / Mmax * 32, yv = p => 125 + p.v / Vmax * 32;
  const gx = X(e.governing.where);
  svg.innerHTML = `<text x="6" y="14" class="lbl">bending moment · max ${f(Mmax / 1000, 1)} N·m</text><line x1="40" x2="560" y1="45" y2="45" class="ax"/>
    <path d="M${X(pts[0].x)} 45 ${pts.map(p => `L${X(p.x)} ${ym(p)}`).join(' ')} L${X(pts.at(-1).x)} 45Z" class="m"/>
    <text x="6" y="94" class="lbl">deflection (down +) · max ${f(Vmax, 4)} mm</text><line x1="40" x2="560" y1="125" y2="125" class="ax"/>
    <path d="M${D.map(p => `${X(p.x)} ${yv(p)}`).join(' L')}" class="v"/>
    <line x1="${gx}" x2="${gx}" y1="20" y2="165" class="gov"/><text x="${Math.min(gx + 4, 520)}" y="166" class="lbl">governs here</text>`;
}

function paintResults(e) {
  const st = $('status');
  if (!e.ok) { st.className = 'solve unsupported'; st.innerHTML = `<b>Not solved.</b> ${esc(e.reason)}`; $('checks').innerHTML = ''; $('readings').innerHTML = ''; return; }
  const g = e.governing;
  st.className = `solve ${e.checks.every(c => c.pass) ? 'pass' : 'fail'}`;
  st.textContent = `${e.checks.every(c => c.pass) ? 'All your limits are met.' : 'Not all your limits are met.'} ${g.label} governs (${(g.util * 100).toFixed(0)} % of its limit).`;
  $('checks').innerHTML = e.checks.map(c => `<li class="${c.pass ? 'pass' : 'fail'}" data-check="${c.key}">${esc(c.label)}: ${c.pass ? 'OK' : 'over'} · ${(c.util * 100).toFixed(0)} %</li>`).join('');
  $('readings').innerHTML = Object.entries(e.outputs).filter(([k]) => k !== 'mass').map(([k, o]) => `<div data-out="${k}"><dt>${esc(o.label.replace(/ \(x = .*\)/, ''))}</dt><dd>${f(o.value, k === 'deflection' ? 4 : k === 'slope' || k === 'sf' ? 2 : 1)} ${esc(o.unit)}</dd></div>`).join('');
}

// ---------- modules ----------
function paintShaftModule() {
  $('m-shaft').innerHTML = `<h2>Shaft</h2>
    <div class="chips" role="radiogroup" aria-label="Material">${M.SHAFT_MATERIALS.map(m => `<button type="button" role="radio" data-mat="${m}" aria-checked="${setup.material === m}">${esc(MATERIALS[m].name)}</button>`).join('')}</div>
    <label class="field" style="flex-direction:row;align-items:center"><input type="checkbox" id="sw" ${setup.selfWeight ? 'checked' : ''} style="width:20px;min-height:20px"> Include the shaft's own weight</label>
    <p class="label">Segments, left to right</p>
    <ul class="rows">${setup.segments.map((s, i) => `<li><b>${i + 1}</b><label>Length mm<input data-seg="${s.id}" data-key="L" type="number" inputmode="decimal" value="${s.L}"></label><label>Ø mm<input data-seg="${s.id}" data-key="d" type="number" inputmode="decimal" value="${s.d}"></label><label>Bore mm<input data-seg="${s.id}" data-key="bore" type="number" inputmode="decimal" value="${s.bore}"></label><button type="button" data-delseg="${s.id}" aria-label="Remove segment ${i + 1}">✕</button></li>`).join('') || '<li class="note">No segments yet.</li>'}</ul>
    <div class="row"><button type="button" id="addseg">+ Add segment</button></div>${say('shaft')}`;
  document.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => act('shaft', () => M.setMaterial(setup, b.dataset.mat)));
  $('sw').onchange = e => act('shaft', () => M.setSelfWeight(setup, e.target.checked));
  document.querySelectorAll('[data-seg]').forEach(i => i.onchange = () => act('shaft', () => M.setSegment(setup, i.dataset.seg, i.dataset.key, +i.value)));
  document.querySelectorAll('[data-delseg]').forEach(b => b.onclick = () => act('shaft', () => M.removeSegment(setup, b.dataset.delseg)));
  $('addseg').onclick = () => act('shaft', () => { M.addSegment(setup, setup.segments.length ? { L: 100, d: setup.segments.at(-1).d } : {}); });
}
function paintBearings() {
  $('m-bearings').innerHTML = `<h2>Bearings</h2><p class="note">Bearings support the shaft but do not resist bending. Drag them on the drawing or type a position. Give a bearing a load limit to check it.</p>
    <ul class="rows">${setup.bearings.map((b, i) => `<li><b>B${i + 1}</b><label>Position mm<input data-bearing="${b.id}" data-key="x" type="number" inputmode="decimal" value="${b.x}"></label><label>Load limit N<input data-bearing="${b.id}" data-key="rating" type="number" inputmode="decimal" placeholder="none" value="${b.rating ?? ''}"></label><span></span><button type="button" data-delbrg="${b.id}" aria-label="Remove bearing ${i + 1}">✕</button></li>`).join('') || '<li class="note">No bearings yet.</li>'}</ul>
    <div class="row"><button type="button" id="addbrg">+ Add bearing</button></div>${say('bearings')}`;
  document.querySelectorAll('[data-bearing]').forEach(i => i.onchange = () => act('bearings', () => M.setBearing(setup, i.dataset.bearing, i.dataset.key, i.dataset.key === 'rating' ? numOrNull(i.value) : +i.value)));
  document.querySelectorAll('[data-delbrg]').forEach(b => b.onclick = () => act('bearings', () => M.removeBearing(setup, b.dataset.delbrg)));
  $('addbrg').onclick = () => act('bearings', () => { M.addBearing(setup, Math.round(M.shaftLength(setup) / 2)); });
}
function paintLoads() {
  $('m-loads').innerHTML = `<h2>Loads</h2><p class="note">Forces act across the shaft (positive = downward). Torques must balance: power in at one place, out at another (+ in, − out).</p>
    <ul class="rows">${setup.loads.map((l, i) => `<li><b>${l.kind === 'force' ? 'F' : 'T'}${i + 1}</b><label>Position mm<input data-load="${l.id}" data-key="x" type="number" inputmode="decimal" value="${l.x}"></label>${l.kind === 'force' ? `<label>Force N<input data-load="${l.id}" data-key="F" type="number" inputmode="decimal" value="${l.F}"></label>` : `<label>Torque N·m<input data-load="${l.id}" data-key="T" type="number" inputmode="decimal" value="${l.T}"></label>`}<span></span><button type="button" data-delload="${l.id}" aria-label="Remove load ${i + 1}">✕</button></li>`).join('') || '<li class="note">No loads yet.</li>'}</ul>
    <div class="row"><button type="button" id="addF">+ Add force</button><button type="button" id="addT">+ Add torque</button></div>${say('loads')}`;
  document.querySelectorAll('[data-load]').forEach(i => i.onchange = () => act('loads', () => M.setLoad(setup, i.dataset.load, i.dataset.key, +i.value)));
  document.querySelectorAll('[data-delload]').forEach(b => b.onclick = () => act('loads', () => M.removeLoad(setup, b.dataset.delload)));
  $('addF').onclick = () => act('loads', () => { M.addForce(setup, Math.round(M.shaftLength(setup) / 2), 1000); });
  $('addT').onclick = () => act('loads', () => { M.addTorque(setup, 0, 0); });
}
function paintLimits() {
  const L = setup.limits;
  $('m-limits').innerHTML = `<h2>Your limits</h2><p class="note">The bench checks only what you set here (plus each bearing's load limit).</p>
    <div class="grid2"><label class="field"><span>Minimum safety factor</span><input id="lim-minSF" type="number" inputmode="decimal" step="0.1" value="${L.minSF}"></label>
    <label class="field"><span>Deflection limit <span class="unit">mm, empty = none</span></span><input id="lim-deflection" type="number" inputmode="decimal" step="0.01" value="${L.deflection ?? ''}"></label>
    <label class="field"><span>Bearing slope limit <span class="unit">mrad, empty = none</span></span><input id="lim-slope" type="number" inputmode="decimal" step="0.1" value="${L.slope ?? ''}"></label></div>${say('limits')}`;
  for (const k of ['minSF', 'deflection', 'slope']) $(`lim-${k}`).onchange = e => act('limits', () => M.setLimit(setup, k, numOrNull(e.target.value)));
}
function paintExplain(e) {
  if (!e.ok) { $('m-explain').innerHTML = `<h2>Explain</h2><p class="note">${esc(e.reason)}</p>`; return; }
  const x = M.explain(setup), qs = M.quantities(setup), s = M.sensitivity(setup, qs.some(q => q.key === sens) ? sens : 'deflection');
  const row = (r, i) => `<tr><th>${esc(r.input)} ${esc(r.change)}</th><td>${r.delta >= 0 ? '+' : ''}${Math.abs(r.delta) < 0.01 ? r.delta.toPrecision(2) : r.delta.toFixed(3)}</td><td>${r.ref ? `<button type="button" data-try="${i}">Apply</button>` : ''}</td></tr>`;
  $('m-explain').innerHTML = `<h2>What governs</h2><p id="explain-head"><b>${esc(x.headline)}</b></p><p class="note">${esc(x.facts)}</p>
    <p class="label">Changes that help most (computed, one step each)</p><table class="tbl movers" id="movers"><tbody>${x.movers.map((r, i) => row(r, `m${i}`)).join('') || '<tr><td>No single step helps.</td></tr>'}</tbody></table>
    <p class="label">What moves…</p><label class="field"><select id="sens">${qs.map(q => `<option value="${q.key}" ${q.key === s.quantity ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
    <p class="note">Now ${f(s.value, 4)}. Effect of a one-step change of each input:</p><table class="tbl movers" id="sens-table"><tbody>${s.rows.slice(0, 10).map((r, i) => row(r, `s${i}`)).join('')}</tbody></table>`;
  const tries = { ...Object.fromEntries(x.movers.map((r, i) => [`m${i}`, r])), ...Object.fromEntries(s.rows.slice(0, 10).map((r, i) => [`s${i}`, r])) };
  document.querySelectorAll('[data-try]').forEach(b => b.onclick = () => act('explain', () => { const r = tries[b.dataset.try]; const fn = { segments: M.setSegment, bearings: M.setBearing, loads: M.setLoad }[r.ref.list]; fn(setup, r.ref.id, r.ref.key, r.to); }));
  $('sens').onchange = ev => { sens = ev.target.value; render(); };
}
function paintSweep(e) {
  if (!e.ok) { $('m-sweep').innerHTML = `<h2>Sweep</h2><p class="note">${esc(e.reason)}</p>`; return; }
  const ins = M.inputs(setup), qs = M.quantities(setup);
  if (!swForm || !ins[swForm.input] || !qs.some(q => q.key === swForm.q)) swForm = { input: 0, q: qs[0].key, from: null, to: null };
  const inp = ins[swForm.input], isPos = inp.ref.key === 'x', L = M.shaftLength(setup);
  const from = swForm.from ?? (isPos ? 0 : Math.max(3, Math.round(inp.value * 0.6))), to = swForm.to ?? (isPos ? L : Math.round(inp.value * 1.4));
  let out = '';
  if (sw) {
    const ok = sw.points.filter(p => p.q !== null), lo = Math.min(...ok.map(p => p.q)), hi = Math.max(...ok.map(p => p.q)), X = v => 30 + (v - sw.points[0].v) / (sw.points.at(-1).v - sw.points[0].v) * 250, Y = q => 100 - (hi === lo ? 0.5 : (q - lo) / (hi - lo)) * 80;
    out = `<svg class="sweepplot" viewBox="0 0 300 120" role="img" aria-label="Sweep result"><line x1="30" x2="280" y1="100" y2="100" class="ax"/><path d="M${ok.map(p => `${X(p.v)} ${Y(p.q)}`).join(' L')}" class="q"/>${sw.best ? `<circle cx="${X(sw.best.v)}" cy="${Y(sw.best.q)}" r="4" class="best"/>` : ''}<text x="30" y="114" class="lbl">${f(sw.points[0].v, 0)}</text><text x="280" y="114" class="lbl" text-anchor="end">${f(sw.points.at(-1).v, 0)}</text><text x="30" y="12" class="lbl">${f(hi, 3)}</text><text x="30" y="96" class="lbl">${f(lo, 3)}</text></svg>
      <p class="note" id="sweep-best">${sw.best ? `${sw.key === 'sf' ? 'Highest' : 'Lowest'} at ${f(sw.best.v, 1)}: ${f(sw.best.q, 3)}.` : 'No valid point in this range.'} ${sw.points.some(p => p.q === null) ? `Some points are impossible (${esc(sw.points.find(p => p.q === null).why)})` : ''}</p>
      ${sw.best ? `<div class="row"><button type="button" id="useBest">Use ${f(sw.best.v, 1)}</button></div>` : ''}`;
  }
  $('m-sweep').innerHTML = `<h2>Sweep one input</h2><p class="note">Vary one input across a range and watch any result.</p>
    <label class="field">Input<select id="sw-in">${ins.map((x, i) => `<option value="${i}" ${i === swForm.input ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
    <label class="field">Result<select id="sw-q">${qs.map(q => `<option value="${q.key}" ${q.key === swForm.q ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
    <div class="grid2"><label class="field">From<input id="sw-from" type="number" inputmode="decimal" value="${from}"></label><label class="field">To<input id="sw-to" type="number" inputmode="decimal" value="${to}"></label></div>
    <div class="row"><button type="button" class="primary" id="sw-run">Run sweep</button></div>${say('sweep')}${out}`;
  $('sw-in').onchange = ev => { swForm = { ...swForm, input: +ev.target.value, from: null, to: null }; sw = null; render(); };
  $('sw-q').onchange = ev => { swForm.q = ev.target.value; sw = null; render(); };
  $('sw-from').onchange = ev => { swForm.from = +ev.target.value; }; $('sw-to').onchange = ev => { swForm.to = +ev.target.value; };
  $('sw-run').onclick = () => { try { sw = M.sweep(setup, inp.ref, swForm.q, +$('sw-from').value, +$('sw-to').value, 20); msg = {}; } catch (err) { msg = { sweep: { text: err.message } }; } render(); };
  if ($('useBest')) $('useBest').onclick = () => act('sweep', () => { const fn = { segments: M.setSegment, bearings: M.setBearing, loads: M.setLoad }[sw.ref.list]; fn(setup, sw.ref.id, sw.ref.key, +sw.best.v.toFixed(1)); sw = null; return 'Applied.'; });
}
function paintLearn() {
  $('m-learn').innerHTML = `<h2>Concepts</h2><p class="note">Open any topic. Notes never change a tool or a result.</p>${M.TOPICS.map(t => `<details class="topic"><summary>${esc(t.title)}</summary><p>${esc(t.concept)}</p>${t.equation ? `<code>${esc(t.equation)}</code>` : ''}${t.limits ? `<p class="note">${esc(t.limits)}</p>` : ''}</details>`).join('')}`;
}

function render() {
  const e = M.evaluate(setup);
  $('title').textContent = nb.project().name;
  $('subtitle').textContent = setup.segments.length ? `${M.shaftLength(setup)} mm shaft · ${setup.bearings.length} bearings · ${setup.loads.length} loads · ${MATERIALS[setup.material].name}` : 'Nothing on the bench yet';
  paintStarts(); paintShaft(e); paintPlots(e); paintResults(e);
  if (!drag) { paintShaftModule(); paintBearings(); paintLoads(); paintLimits(); paintExplain(e); paintSweep(e); paintLearn(); nb.render(); }
}

const bench = workbench('machine', { initial: 'shaft' });
const nb = notebook($('m-experiments'), { adapter: M.ADAPTER, getSetup: () => clone(setup), applySetup: s => { setup = s; sw = null; msg = {}; render(); } });
setup = clone(nb.project().setup);
render();
document.body.dataset.ready = 'true';
