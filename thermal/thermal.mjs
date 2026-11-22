// Thermal bench UI: an editor over a plain setup. Every number, check and explanation comes from thermal/model.mjs;
// saved runs go through the shared project record (core/project.mjs via core/notebook.mjs).
import { workbench } from '../core/workbench.mjs';
import { notebook } from '../core/notebook.mjs';
import * as M from './model.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const n4 = v => +(+v).toPrecision(4);
const g3 = v => (!Number.isFinite(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v === 0 ? '0' : v.toPrecision(3));
let setup = M.emptySetup(), selected = null, msg = {}, pick = { from: null, to: null }, sens = null, sw = null, swForm = null;
const VERDICT = { pass: 'OK', fail: 'over', 'cannot-assess': 'cannot assess', 'not-applicable': 'n/a' };

const changed = () => { nb.sync(); render(); };
const act = (k, fn) => { try { const t = fn(); msg = t ? { [k]: { ok: true, text: t } } : {}; } catch (e) { msg = { [k]: { text: e.message } }; } sw = null; changed(); };
const say = k => (msg[k] ? `<p class="msg ${msg[k].ok ? 'okmsg' : ''}" role="alert">${esc(msg[k].text)}</p>` : '');
const numOrNull = v => (v === '' ? null : +v);

function paintStarts() {
  $('starts').innerHTML = `<button type="button" class="buildbtn" id="empty">Empty bench</button>` + M.PRESETS.map(p => `<button type="button" data-preset="${p.id}">Preset: ${esc(p.name)}</button>`).join('');
  $('empty').onclick = () => { setup = M.emptySetup(); selected = null; msg = {}; sw = null; changed(); bench.open('build'); };
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { setup = M.fromPreset(b.dataset.preset); selected = null; msg = {}; sw = null; pick = { from: null, to: null }; changed(); });
}

// ---------- the path, its temperature profile, thermometers and the resistance budget ----------
const fillOf = l => (l.type === 'convection' ? 'film' : l.type === 'contact' ? 'contact' : l.type === 'fins' ? 'fins' : l.type === 'parallel' ? 'par'
  : (l.material === 'custom' ? l.k : M.MATERIALS[l.material].k) > 20 ? 'metal' : (l.material === 'custom' ? l.k : M.MATERIALS[l.material].k) < 0.1 ? 'insul' : 'solid');
function paintPath(e) {
  const svg = $('path'), L = setup.layers, n = L.length;
  if (!n) { svg.innerHTML = `<text x="300" y="120" text-anchor="middle" class="hint">Empty bench — add layers on the Build tab, or start from a preset.</text>`; return; }
  const x0 = 46, x1 = 554, dx = (x1 - x0) / n, X = j => x0 + dx * j, top = 40, bot = 170;
  const lim = e.ok ? e.limiting : -1, bad = e.ok ? -1 : e.at ?? -1;
  let out = '';
  L.forEach((l, i) => {
    const cls = `ly ${fillOf(l)}${i === lim ? ' lim' : ''}${i === bad ? ' bad' : ''}`;
    if (l.type === 'fins') { out += `<rect x="${X(i)}" y="${top}" width="${dx * 0.25}" height="${bot - top}" class="ly metal${i === bad ? ' bad' : ''}"/>`; for (let k = 0; k < 6; k++) out += `<rect x="${X(i) + dx * 0.25}" y="${top + 6 + k * (bot - top - 12) / 6}" width="${dx * 0.7}" height="${(bot - top) / 18}" class="ly metal${i === lim ? ' lim' : ''}"/>`; }
    else out += `<rect x="${X(i) + (l.type === 'contact' ? dx * 0.4 : 0)}" y="${top}" width="${l.type === 'contact' ? dx * 0.2 : dx}" height="${bot - top}" class="${cls}"/>`;
    out += `<text x="${X(i) + dx / 2}" y="${bot + 14}" class="num" text-anchor="middle">#${i + 1}</text>`;
  });
  out += `<text x="${x0}" y="16" class="lbl">${setup.start.kind === 'heat' ? `${n4(setup.start.Q)} W in` : `start ${n4(setup.start.T)} °C`}</text><text x="${x1}" y="16" class="lbl" text-anchor="end">ambient ${n4(setup.ambient)} °C</text>`;
  if (e.ok) {
    const T = e.sol.T, lo = Math.min(...T), hi = Math.max(...T), Y = t => bot - 8 - (hi === lo ? 0.5 : (t - lo) / (hi - lo)) * (bot - top - 16);
    out += `<path d="M${T.map((t, j) => `${X(j)} ${Y(t)}`).join(' L')}" class="profile"/>`;
    const spots = ['start', ...L.slice(0, -1).map(l => l.id)];
    spots.forEach((at, j) => {
      const on = setup.thermometers.includes(at);
      out += `<circle cx="${X(j)}" cy="${Y(T[j])}" r="7" class="tm ${on ? 'on' : ''}" data-thermo="${at}" role="button" tabindex="0" aria-pressed="${on}" aria-label="Thermometer ${at === 'start' ? 'on the start face' : `after layer ${j}`}"/>`;
      if (on) out += `<text x="${Math.min(x1 - 4, Math.max(x0 + 4, X(j)))}" y="${Y(T[j]) + (j % 2 ? 20 : -11)}" class="lbl" text-anchor="middle">${f(T[j], 1)}°</text>`;
    });
    // resistance budget: share of the total resistance (= share of the temperature difference)
    let bx = x0; const by = 206;
    e.sol.layers.forEach((l, i) => { const w = l.share * (x1 - x0); out += `<rect x="${bx}" y="${by}" width="${Math.max(0.5, w)}" height="16" class="bud ${i === lim ? 'lim' : ''}"/>${w > 34 ? `<text x="${bx + w / 2}" y="${by + 12}" class="bl" text-anchor="middle">#${i + 1} ${(l.share * 100).toFixed(0)}%</text>` : ''}`; bx += w; });
    out += `<text x="${x0}" y="${by - 4}" class="dim">share of total resistance ${g3(e.sol.Rt)} K/W</text>`;
  }
  svg.innerHTML = out;
  svg.querySelectorAll('[data-thermo]').forEach(c => { const go = () => act('measure', () => { M.toggleThermometer(setup, c.dataset.thermo); }); c.onclick = go; c.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } }; });
}

function paintResults(e) {
  const st = $('status');
  if (!e.ok) { st.className = 'solve unsupported'; st.innerHTML = `<b>Not solved.</b> ${esc(e.reason)}`; $('checks').innerHTML = ''; $('readings').innerHTML = ''; return; }
  const all = e.checks.filter(c => !c.na), ok = all.every(c => c.pass);
  st.className = `solve ${all.length ? (ok ? 'pass' : 'fail') : ''}`;
  st.textContent = `${f(e.sol.Q, 2)} W flows from ${f(e.sol.T[0], 1)} °C to ${setup.ambient} °C. ${all.length ? (ok ? 'All your limits are met.' : 'Not all your limits are met.') + ` ${e.governing.label} governs (${Number.isFinite(e.governing.util) ? (e.governing.util * 100).toFixed(0) : '∞'} %).` : 'No limits set.'} #${e.limiting + 1} limits the heat flow (${(e.sol.layers[e.limiting].share * 100).toFixed(0)} % of the resistance).`;
  $('checks').innerHTML = [...e.checks.map(c => `<li class="${c.na ? '' : c.pass ? 'pass' : 'fail'}" data-check="${c.key}">${esc(c.label)}: ${c.na ? 'n/a' : c.pass ? 'OK' : 'over'}${c.na ? '' : ` · ${Number.isFinite(c.util) ? (c.util * 100).toFixed(0) : '∞'} %`}</li>`),
    ...Object.entries(e.verdicts).filter(([k]) => k === 'transient').map(([k, v]) => `<li data-check="${k}">${esc(v.label)}: ${VERDICT[v.value]}</li>`)].join('');
  $('readings').innerHTML = Object.entries(e.outputs).map(([k, o]) => `<div data-out="${k}"><dt>${esc(o.label)}</dt><dd>${o.unit === '°C' ? f(o.value, 1) : g3(o.value)}${o.unit ? ` ${esc(o.unit)}` : ''}</dd></div>`).join('');
}

// ---------- modules ----------
function field(id, spec, value) {
  if (spec.options) return `<label class="field">${esc(spec.label)}<select id="${id}">${Object.entries(spec.options).map(([k, t]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const k = spec.scale || 1;
  return `<label class="field"><span>${esc(spec.label)}${spec.unit ? ` <span class="unit">${esc(spec.unit)}</span>` : ''}</span><input id="${id}" type="number" inputmode="decimal" step="any" value="${value === null || value === undefined ? '' : +(value * k).toPrecision(6)}"></label>`;
}
const relevant = (l, k) => !((k === 'k' && l.material !== 'custom') || (l.type === 'convection' && ((k === 'h' && l.mode !== 'h') || (k === 'Lc' && !/plate/.test(l.mode)) || (k === 'V' && !/forced/.test(l.mode)))) || (l.type === 'fins' && k === 'w' && l.shape === 'pin'));
function paintBuild(e) {
  const L = setup.layers, sel = L.find(l => l.id === selected) ? selected : null, si = L.findIndex(l => l.id === sel), layer = sel ? L[si] : null, cyl = setup.geometry === 'cylinder';
  $('m-build').innerHTML = `<h2>Build the heat path</h2>
    <div class="chips" role="radiogroup" aria-label="Geometry"><button type="button" role="radio" data-geo="plane" aria-checked="${!cyl}">Plane wall</button><button type="button" role="radio" data-geo="cylinder" aria-checked="${cyl}">Pipe (cylinder)</button></div>
    <div class="grid2">${cyl ? field('r0', { label: 'Inner radius', unit: 'mm', scale: 1000 }, setup.r0) + field('plen', { label: 'Pipe length', unit: 'm' }, setup.length) : field('area', { label: 'Area', unit: 'm²' }, setup.area)}</div>
    <p class="label">Start face</p>
    <div class="chips" role="radiogroup" aria-label="Start face"><button type="button" role="radio" data-start="temp" aria-checked="${setup.start.kind === 'temp'}">Fixed temperature</button><button type="button" role="radio" data-start="heat" aria-checked="${setup.start.kind === 'heat'}">Heat source</button></div>
    <div class="grid2">${setup.start.kind === 'temp' ? field('startT', { label: 'Start temperature', unit: '°C' }, setup.start.T) : field('startQ', { label: 'Heat input', unit: 'W' }, setup.start.Q)}${field('ambient', { label: 'Ambient', unit: '°C' }, setup.ambient)}</div>${say('ends')}
    <p class="label">Layers, start to ambient — new ones go ${sel ? `after #${si + 1}` : 'at the end'}</p>
    <div class="chips" aria-label="Add a layer">${Object.entries(M.LAYERS).map(([t, p]) => `<button type="button" data-add="${t}">+ ${esc(p.name)}</button>`).join('')}</div>${say('build')}
    <ol class="parts">${L.map((l, i) => `<li><button type="button" class="sel ${!e.ok && e.at === i ? 'bad' : ''}" data-sel="${l.id}" aria-pressed="${l.id === sel}">${esc(M.layerLabel(setup, i))}</button>
      <button type="button" data-up="${l.id}" aria-label="Move layer ${i + 1} up">↑</button><button type="button" data-down="${l.id}" aria-label="Move layer ${i + 1} down">↓</button><button type="button" data-del="${l.id}" aria-label="Remove layer ${i + 1}">✕</button></li>`).join('') || '<li class="note">No layers yet.</li>'}</ol>
    ${layer ? `<h2 style="margin-top:14px">#${si + 1} ${esc(M.LAYERS[layer.type].name)}</h2><div class="grid2">${Object.entries(M.LAYERS[layer.type].params).filter(([k]) => relevant(layer, k)).map(([k, spec]) => field(`lp-${k}`, spec, layer[k])).join('')}</div>${say('param')}` : '<p class="note">Select a layer to edit it.</p>'}`;
  document.querySelectorAll('[data-geo]').forEach(b => b.onclick = () => act('ends', () => M.setGeometry(setup, b.dataset.geo)));
  document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => act('ends', () => M.setStart(setup, b.dataset.start, b.dataset.start === 'temp' ? setup.start.T : setup.start.Q)));
  if (cyl) { $('r0').onchange = ev => act('ends', () => M.setPipe(setup, 'r0', +ev.target.value / 1000)); $('plen').onchange = ev => act('ends', () => M.setPipe(setup, 'length', +ev.target.value)); }
  else $('area').onchange = ev => act('ends', () => M.setArea(setup, +ev.target.value));
  if ($('startT')) $('startT').onchange = ev => act('ends', () => M.setStart(setup, 'temp', +ev.target.value)); else $('startQ').onchange = ev => act('ends', () => M.setStart(setup, 'heat', +ev.target.value));
  $('ambient').onchange = ev => act('ends', () => M.setAmbient(setup, +ev.target.value));
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => act('build', () => { selected = M.addLayer(setup, b.dataset.add, {}, sel); return `Added ${M.LAYERS[b.dataset.add].name}.`; }));
  document.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { selected = b.dataset.sel === sel ? null : b.dataset.sel; msg = {}; render(); });
  document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => act('build', () => M.moveLayer(setup, b.dataset.up, -1)));
  document.querySelectorAll('[data-down]').forEach(b => b.onclick = () => act('build', () => M.moveLayer(setup, b.dataset.down, 1)));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => act('build', () => { M.removeLayer(setup, b.dataset.del); if (selected === b.dataset.del) selected = null; }));
  if (layer) for (const [k, spec] of Object.entries(M.LAYERS[layer.type].params)) if ($(`lp-${k}`)) $(`lp-${k}`).onchange = ev => act('param', () => M.setParam(setup, layer.id, k, spec.options ? ev.target.value : +ev.target.value / (spec.scale || 1)));
}

function paintMeasure(e) {
  const spots = ['start', ...setup.layers.slice(0, -1).map(l => l.id)], placed = spots.filter(a => setup.thermometers.includes(a));
  let ex = '';
  if (pick.from && pick.to && e.ok) {
    try {
      const b = M.budget(setup, pick.from, pick.to);
      ex = `<p class="note">${esc(b.from)} − ${esc(b.to)} = <b>${f(b.total, 2)} K</b> with ${f(b.Q, 2)} W flowing:</p>
        <table class="tbl explain"><thead><tr><th>Layer</th><th>R (K/W)</th><th>ΔT = Q·R (K)</th></tr></thead><tbody>${b.items.map(i => `<tr><th>${esc(i.label)}</th><td>${g3(i.R)}</td><td>${f(i.dT, 2)}</td></tr>`).join('')}
        <tr class="chg"><th>Total (= difference of the readings)</th><td></td><td id="budget-total">${f(b.total, 2)}</td></tr></tbody></table><p class="note">The rows add up to the difference of the two readings (residual ${Math.abs(b.check).toExponential(1)} K).</p>`;
    } catch (err) { ex = `<p class="msg" role="alert">${esc(err.message)}</p>`; }
  }
  const opt = v => placed.map(a => `<option value="${a}" ${a === v ? 'selected' : ''}>${esc(M.pointLabel(setup, a))}</option>`).join('');
  $('m-measure').innerHTML = `<h2>Thermometers</h2><p class="note">Put a thermometer on the start face or any interface (or tap a dot on the drawing). Readings are simulated; they do not change the heat flow.</p>
    <ul class="gauges">${spots.map(a => `<li><label><input type="checkbox" data-tm="${a}" ${setup.thermometers.includes(a) ? 'checked' : ''}> ${a === 'start' ? 'start face' : `after ${esc(M.layerLabel(setup, setup.layers.findIndex(l => l.id === a)))}`}</label></li>`).join('') || '<li class="note">Add layers first.</li>'}</ul>${say('measure')}
    <h2 style="margin-top:14px">Explain a temperature drop</h2>
    ${placed.length < 2 ? '<p class="note">Place two thermometers to explain the drop between them.</p>' : `<div class="grid2"><label class="field">From<select id="tmFrom"><option value="">choose</option>${opt(pick.from)}</select></label><label class="field">To<select id="tmTo"><option value="">choose</option>${opt(pick.to)}</select></label></div>${ex}`}`;
  document.querySelectorAll('[data-tm]').forEach(c => c.onchange = () => act('measure', () => { M.toggleThermometer(setup, c.dataset.tm); }));
  if ($('tmFrom')) { $('tmFrom').onchange = ev => { pick.from = ev.target.value || null; render(); }; $('tmTo').onchange = ev => { pick.to = ev.target.value || null; render(); }; }
}

function paintLimits() {
  $('m-limits').innerHTML = `<h2>Your limits</h2><p class="note">The bench checks only what you set here. Leave a box empty for no limit.</p>
    <div class="grid2">${Object.entries(M.LIMITS).map(([k, l]) => field(`lim-${k}`, { label: l.label, unit: l.unit }, setup.limits[k])).join('')}</div>${say('limits')}`;
  for (const k of Object.keys(M.LIMITS)) $(`lim-${k}`).onchange = ev => act('limits', () => M.setLimit(setup, k, numOrNull(ev.target.value)));
}

const fmtDelta = d => `${d >= 0 ? '+' : '−'}${g3(Math.abs(d))}`;
function paintExplain(e) {
  if (!e.ok) { $('m-explain').innerHTML = `<h2>Explain</h2><p class="note">${esc(e.reason)}</p>`; return; }
  const x = M.explain(setup), qs = M.quantities(setup);
  const key = qs.some(q => q.key === sens) ? sens : x.quantity ?? (setup.start.kind === 'heat' ? 'T:start' : 'Q');
  const s = M.sensitivity(setup, key), top = s.rows.slice(0, 10);
  const row = (r, id) => `<tr><th>${esc(r.input)} ${esc(r.change)}</th><td>${fmtDelta(r.delta)}</td><td><button type="button" data-try="${id}">Apply</button></td></tr>`;
  $('m-explain').innerHTML = `<h2>What governs</h2><p id="explain-head"><b>${esc(x.headline)}</b></p><p id="explain-limiting">${esc(x.limiting.text)}</p>
    <table class="tbl" id="budget-rank"><thead><tr><th>Resistance</th><th>K/W</th><th>Share</th></tr></thead><tbody>${x.ranked.map(r => `<tr><th>${esc(r.label)}</th><td>${g3(r.R)}</td><td>${(r.share * 100).toFixed(1)} %</td></tr>`).join('')}</tbody></table>
    ${x.facts.map(t => `<p class="note">${esc(t)}</p>`).join('')}
    ${x.check ? `<p class="label">Changes that help most (computed, one step each)</p><table class="tbl movers" id="movers"><tbody>${x.movers.map((r, i) => row(r, `m${i}`)).join('') || '<tr><td>No single step helps.</td></tr>'}</tbody></table>` : ''}
    <p class="label">What moves…</p><label class="field"><select id="sens">${qs.map(q => `<option value="${q.key}" ${q.key === s.quantity ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
    <p class="note">Now ${g3(s.value)}. Effect of a one-step change of each input:</p><table class="tbl movers" id="sens-table"><tbody>${top.map((r, i) => row(r, `s${i}`)).join('') || '<tr><td>No input moves it.</td></tr>'}</tbody></table>${say('explain')}`;
  const tries = { ...Object.fromEntries(x.movers.map((r, i) => [`m${i}`, r])), ...Object.fromEntries(top.map((r, i) => [`s${i}`, r])) };
  document.querySelectorAll('[data-try]').forEach(b => b.onclick = () => act('explain', () => { const r = tries[b.dataset.try]; M.applyChange(setup, r.ref, r.to); return `Applied: ${r.input} ${r.change}.`; }));
  $('sens').onchange = ev => { sens = ev.target.value; render(); };
}

function paintSweep(e) {
  if (!e.ok) { $('m-sweep').innerHTML = `<h2>Sweep</h2><p class="note">${esc(e.reason)}</p>`; return; }
  const ins = M.inputs(setup), qs = M.quantities(setup);
  if (!swForm || !ins[swForm.input] || !qs.some(q => q.key === swForm.q)) swForm = { input: 0, q: 'Q', from: null, to: null };
  const inp = ins[swForm.input], k = inp.scale || 1, v = inp.value * k;
  const from = swForm.from ?? +(inp.rel ? v * 0.5 : v - 5 * inp.step * k).toPrecision(3), to = swForm.to ?? +(inp.rel ? v * 2 : v + 5 * inp.step * k).toPrecision(3);
  let out = '';
  if (sw) {
    const ok = sw.points.filter(p => p.q !== null);
    if (ok.length) {
      const lo = Math.min(...ok.map(p => p.q)), hi = Math.max(...ok.map(p => p.q)), a = sw.points[0].v, b = sw.points.at(-1).v, X = t => 34 + (t - a) / (b - a) * 250, Y = q => 100 - (hi === lo ? 0.5 : (q - lo) / (hi - lo)) * 80;
      out = `<svg class="sweepplot" viewBox="0 0 300 120" role="img" aria-label="Sweep result"><line x1="34" x2="284" y1="100" y2="100" class="ax"/><path d="M${ok.map(p => `${X(p.v)} ${Y(p.q)}`).join(' L')}" class="q"/><circle cx="${X(sw.max.v)}" cy="${Y(sw.max.q)}" r="4" class="best"/><circle cx="${X(sw.min.v)}" cy="${Y(sw.min.q)}" r="4" class="low"/>
        <text x="34" y="114" class="lbl">${g3(a * k)}</text><text x="284" y="114" class="lbl" text-anchor="end">${g3(b * k)}</text><text x="2" y="22" class="lbl">${g3(hi)}</text><text x="2" y="100" class="lbl">${g3(lo)}</text></svg>`;
    }
    out += `<p class="note" id="sweep-best">${ok.length ? `Highest ${g3(sw.max.q)} at ${g3(sw.max.v * k)}${sw.peak ? ' — a peak inside the range' : ''}. Lowest ${g3(sw.min.q)} at ${g3(sw.min.v * k)}${sw.trough ? ' — a minimum inside the range' : ''}.` : 'No valid point in this range.'}${sw.points.some(p => p.q === null) ? ` Some points are impossible (${esc(sw.points.find(p => p.q === null).why)}).` : ''}</p>
      ${ok.length ? `<div class="row"><button type="button" id="useMax">Use ${g3(sw.max.v * k)}</button><button type="button" id="useMin">Use ${g3(sw.min.v * k)}</button></div>` : ''}`;
  }
  $('m-sweep').innerHTML = `<h2>Sweep one input</h2><p class="note">Vary any input across a range and watch any result.</p>
    <label class="field">Input<select id="sw-in">${ins.map((x, i) => `<option value="${i}" ${i === swForm.input ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
    <label class="field">Result<select id="sw-q">${qs.map(q => `<option value="${q.key}" ${q.key === swForm.q ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
    <div class="grid2"><label class="field">From<input id="sw-from" type="number" inputmode="decimal" step="any" value="${from}"></label><label class="field">To<input id="sw-to" type="number" inputmode="decimal" step="any" value="${to}"></label></div>
    <div class="row"><button type="button" class="primary" id="sw-run">Run sweep</button></div>${say('sweep')}${out}`;
  $('sw-in').onchange = ev => { swForm = { ...swForm, input: +ev.target.value, from: null, to: null }; sw = null; render(); };
  $('sw-q').onchange = ev => { swForm.q = ev.target.value; sw = null; render(); };
  $('sw-from').onchange = ev => { swForm.from = +ev.target.value; }; $('sw-to').onchange = ev => { swForm.to = +ev.target.value; };
  $('sw-run').onclick = () => { try { swForm.from = +$('sw-from').value; swForm.to = +$('sw-to').value; sw = M.sweep(setup, inp.ref, swForm.q, swForm.from / k, swForm.to / k, 40); msg = {}; } catch (err) { msg = { sweep: { text: err.message } }; sw = null; } render(); };
  const use = p => act('sweep', () => { M.applyChange(setup, sw.ref, sw.ref.key === 'N' ? Math.round(p.v) : p.v); return 'Applied.'; });
  if ($('useMax')) { const s0 = sw; $('useMax').onclick = () => use(s0.max); $('useMin').onclick = () => use(s0.min); }
}

function paintTransient(e) {
  const t = setup.transient;
  if (!t) { $('m-transient').innerHTML = `<h2>Warm-up / cool-down</h2><p class="note">A separate lumped body (a part, a sensor, a bearing housing) heating or cooling in the same ambient. Checked with the Biot number; refused when the body would not be at one temperature.</p><div class="row"><button type="button" id="tr-on">Add a body</button></div>`; $('tr-on').onclick = () => act('transient', () => M.setTransient(setup, 'on')); return; }
  const r = e.transient;
  $('m-transient').innerHTML = `<h2>Warm-up / cool-down</h2>
    <div class="grid2">${field('tr-material', { label: 'Material', options: Object.fromEntries(Object.entries(M.MATERIALS).map(([k, m]) => [k, m.name])) }, t.material)}${field('tr-h', { label: 'h on its surface', unit: 'W/m²·K' }, t.h)}
    ${field('tr-V', { label: 'Volume', unit: 'cm³', scale: 1e6 }, t.V)}${field('tr-As', { label: 'Surface area', unit: 'cm²', scale: 1e4 }, t.As)}
    ${field('tr-Ti', { label: 'Starts at', unit: '°C' }, t.Ti)}${field('tr-Ttarget', { label: 'Target', unit: '°C' }, t.Ttarget)}</div>
    <p class="note">Ambient ${setup.ambient} °C (from the Build tab).</p>${say('transient')}
    ${r ? (r.ok ? `<p id="tr-result"><b>${g3(r.time)} s</b> (${g3(r.time / 60)} min) to reach ${t.Ttarget} °C · τ = ρVc/hA = ${g3(r.tau)} s · Bi = ${r.Bi.toExponential(2)} ≤ 0.1</p>` : `<p class="msg" id="tr-result" role="alert">Not solved: ${esc(r.reason)}</p>`) : ''}
    <div class="row"><button type="button" id="tr-off">Remove the body</button></div>`;
  $('tr-material').onchange = ev => act('transient', () => M.setTransient(setup, 'material', ev.target.value));
  for (const [k, sc] of [['h', 1], ['V', 1e6], ['As', 1e4], ['Ti', 1], ['Ttarget', 1]]) $(`tr-${k}`).onchange = ev => act('transient', () => M.setTransient(setup, k, +ev.target.value / sc));
  $('tr-off').onclick = () => act('transient', () => M.setTransient(setup, 'off'));
}

function paintLearn() {
  const topics = M.TOPICS.filter(t => t.when(setup));
  $('m-learn').innerHTML = `<h2>Concepts for this path</h2><p class="note">Open any topic. Notes never change a tool or a result.</p>
    ${topics.map(t => `<details class="topic" data-topic="${t.id}"><summary>${esc(t.title)}</summary><p>${esc(t.concept)}</p>${t.equation ? `<code>${esc(t.equation)}</code>` : ''}<p class="note">Limits: ${esc(t.limits)}</p></details>`).join('')}`;
}

function render() {
  const e = M.evaluate(setup);
  $('title').textContent = nb.project().name;
  $('subtitle').textContent = setup.layers.length ? `${setup.geometry === 'cylinder' ? `pipe r ${n4(setup.r0 * 1000)} mm × ${n4(setup.length)} m` : `plane ${n4(setup.area)} m²`} · ${setup.layers.length} layers · ${setup.start.kind === 'heat' ? `${n4(setup.start.Q)} W source` : `start ${setup.start.T} °C`} → ${setup.ambient} °C` : 'Nothing on the bench yet';
  paintStarts(); paintPath(e); paintResults(e);
  paintBuild(e); paintMeasure(e); paintLimits(); paintExplain(e); paintSweep(e); paintTransient(e); paintLearn(); nb.render();
}

const bench = workbench('thermal', { initial: 'build' });
const nb = notebook($('m-experiments'), { adapter: M.ADAPTER, getSetup: () => clone(setup), applySetup: s => { setup = s; sw = null; msg = {}; selected = null; render(); } });
setup = clone(nb.project().setup);
render();
document.body.dataset.ready = 'true';
