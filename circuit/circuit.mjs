// Fluid line bench UI: an editor over a plain setup. Every number comes from circuit/model.mjs; every saved run
// goes through the shared project record (core/project.mjs via core/notebook.mjs).
import { workbench } from '../core/workbench.mjs';
import { notebook } from '../core/notebook.mjs';
import * as C from './model.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const f = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '–';
let setup = C.emptySetup(), selected = null, msg = {}, explainPick = { from: null, to: null };
const VERDICT = { pass: 'Yes', fail: 'No', 'cannot-assess': 'Cannot assess', 'not-applicable': 'Not applicable' };

const changed = () => { nb.sync(); render(); };
const act = (k, fn) => { try { const t = fn(); msg = t ? { [k]: { ok: true, text: t } } : {}; } catch (e) { msg = { [k]: { text: e.message } }; } changed(); };
const say = k => msg[k] ? `<p class="msg ${msg[k].ok ? 'okmsg' : ''}" role="alert">${esc(msg[k].text)}</p>` : '';

// ---------- start points ----------
function paintStarts() {
  $('starts').innerHTML = `<button type="button" class="buildbtn" id="empty">Empty workspace</button>` + C.PRESETS.map(p => `<button type="button" data-preset="${p.id}">Preset: ${esc(p.name)}</button>`).join('');
  $('empty').onclick = () => { setup = C.emptySetup(); selected = null; msg = {}; changed(); bench.open('build'); };
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { setup = C.fromPreset(b.dataset.preset); selected = null; msg = {}; changed(); });
}

// ---------- schematic: drawn from the setup, solved or not ----------
function paintScheme(r) {
  const svg = $('scheme'), ch = setup.chain;
  if (!ch.length) { svg.innerHTML = `<text x="300" y="120" text-anchor="middle" class="hint">Empty workspace — add parts on the Build tab, or start from a preset.</text>`; return; }
  const zIn = [], zOut = []; let z = ch[0].type === 'source' ? ch[0].outlet : 0;
  ch.forEach((p, i) => { zIn[i] = z; if (p.type === 'pipe') z += p.rise; zOut[i] = z; });
  const levels = [...zIn, ...zOut, ...ch.filter(p => p.surface !== undefined).map(p => p.surface)], lo = Math.min(...levels), hi = Math.max(...levels);
  const Y = v => 200 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * 160, n = ch.length, dx = Math.min(90, 540 / Math.max(1, n)), X = i => 30 + dx * (i + 0.5);
  const bad = r.ok ? -1 : r.at ?? -1;
  let path = '', glyphs = '', jn = '';
  ch.forEach((p, i) => {
    const x = X(i), y1 = Y(zIn[i]), y2 = Y(zOut[i]), cls = i === bad ? ' bad' : '';
    if (p.type === 'source' || p.type === 'sink') {
      glyphs += `<rect x="${x - dx * 0.4}" y="${Y(p.surface)}" width="${dx * 0.8}" height="${Math.max(16, 210 - Y(p.surface))}" class="tank${cls}"/><text x="${x}" y="${Y(p.surface) - 4}" class="lbl" text-anchor="middle">${p.surface} m</text>`;
    } else {
      path += `<path d="M${x - dx / 2} ${y1} L${x + dx / 2} ${y2}" class="line"/>`;
      const cy = (y1 + y2) / 2;
      if (p.type === 'pump') glyphs += `<circle cx="${x}" cy="${cy}" r="11" class="glyph${cls}"/><path d="M${x - 5} ${cy + 5} L${x + 6} ${cy} L${x - 5} ${cy - 5}" fill="none" stroke="#e6eef3"/>`;
      else if (p.type === 'valve') glyphs += `<path d="M${x - 8} ${cy - 7} L${x + 8} ${cy + 7} L${x + 8} ${cy - 7} L${x - 8} ${cy + 7}Z" class="glyph${cls}"/>`;
      else if (p.type === 'checkValve') glyphs += `<path d="M${x - 7} ${cy - 7} L${x + 7} ${cy} L${x - 7} ${cy + 7}Z" class="glyph${cls}"/>`;
      else if (p.type === 'orifice') glyphs += `<rect x="${x - 2}" y="${cy - 12}" width="4" height="24" class="glyph${cls}"/>`;
      else if (p.type === 'elbow') glyphs += `<path d="M${x - 6} ${cy + 6} L${x - 6} ${cy - 6} L${x + 6} ${cy - 6}" fill="none" stroke="${i === bad ? 'var(--bad)' : '#e6eef3'}" stroke-width="3"/>`;
      else if (p.type === 'tee') glyphs += `<path d="M${x - 8} ${cy} H${x + 8} M${x} ${cy} V${cy - 14}" stroke="var(--bad)" stroke-width="4"/>`;
    }
    glyphs += `<text x="${x}" y="236" class="num" text-anchor="middle">#${i + 1}</text>`;
    if (i < n - 1) {
      const on = setup.gauges.includes(p.id), g = r.ok ? r.gauges.find(q => q.id === p.id) : null;
      jn += `<circle cx="${x + dx / 2}" cy="${Y(zOut[i])}" r="6" class="jn ${on ? 'on' : ''}" data-junction="${p.id}" role="button" tabindex="0" aria-pressed="${on}" aria-label="Gauge after part ${i + 1}"/>`;
      if (g?.valid) { const k = r.gauges.filter(q => q.valid).indexOf(g); jn += `<text x="${x + dx / 2}" y="${Y(zOut[i]) + (k % 2 ? 20 : -10)}" class="lbl" text-anchor="middle">${f(g.kPa, 1)} kPa</text>`; }
    }
  });
  svg.innerHTML = path + glyphs + jn;
  svg.querySelectorAll('[data-junction]').forEach(c => { const go = () => act('measure', () => { C.toggleGauge(setup, c.dataset.junction); }); c.onclick = go; c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
}

// ---------- results ----------
function paintResults(r) {
  const st = $('status');
  if (!r.ok) { st.className = 'solve unsupported'; st.innerHTML = `<b>Not solved.</b> ${esc(r.reason)}`; $('verdicts').innerHTML = ''; $('readings').innerHTML = ''; return; }
  st.className = 'solve';
  st.textContent = r.sol.noFlow ? 'Solved: no flow — the line cannot lift water to the receiving reservoir.' : `Solved: ${f(r.outputs.flow.value)} L/s through ${setup.chain.length} parts.${r.sol.pump?.cavitating ? ' The pump is cavitating: flow and power at this point are not reliable.' : ''}`;
  $('verdicts').innerHTML = Object.entries(r.verdicts).map(([k, v]) => `<section class="vcard ${v.value}" data-verdict="${k}"><h2>${esc(v.label)}</h2><p class="vword">${VERDICT[v.value]}</p><p class="note">${esc(v.reason)}</p></section>`).join('');
  $('readings').innerHTML = Object.entries(r.outputs).filter(([k]) => k !== 'npshr' && k !== 'motorRating').map(([k, o]) => `<div data-out="${k}"><dt>${esc(o.label.replace('Pressure ', ''))}</dt><dd>${f(o.value, o.unit === 'kW' ? 3 : 2)} ${esc(o.unit.replace(' (gauge)', ''))}</dd></div>`).join('');
}

// ---------- modules ----------
function field(id, spec, value) {
  if (spec.options) return `<label class="field">${esc(spec.label)}<select id="${id}">${Object.entries(spec.options).map(([k, t]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const k = spec.scale || 1;
  return `<label class="field"><span>${esc(spec.label)}${spec.unit ? ` <span class="unit">${esc(spec.unit)}</span>` : ''}</span><input id="${id}" type="number" inputmode="decimal" step="${spec.step}" value="${+(value * k).toFixed(4)}"></label>`;
}
function paintBuild(r) {
  const ch = setup.chain, sel = ch.find(p => p.id === selected) ? selected : null, si = ch.findIndex(p => p.id === sel);
  const part = sel ? ch[si] : null;
  $('m-build').innerHTML = `<h2>Build the line</h2>
    <p class="note">Flow runs from #1 to the last part. New parts go ${sel ? `after #${si + 1}` : 'at the end'}.</p>
    <div class="chips" aria-label="Add a part">${Object.entries(C.PARTS).map(([t, p]) => `<button type="button" data-add="${t}">+ ${esc(p.name)}</button>`).join('')}</div>${say('build')}
    <ol class="parts">${ch.map((p, i) => `<li><button type="button" class="sel ${!r.ok && r.at === i ? 'bad' : ''}" data-sel="${p.id}" aria-pressed="${p.id === sel}">${esc(C.partLabel(setup, i))}</button>
      <button type="button" data-up="${p.id}" aria-label="Move part ${i + 1} up">↑</button><button type="button" data-down="${p.id}" aria-label="Move part ${i + 1} down">↓</button><button type="button" data-del="${p.id}" aria-label="Remove part ${i + 1}">✕</button></li>`).join('') || '<li class="note">No parts yet.</li>'}</ol>
    ${part ? `<h2 style="margin-top:14px">#${si + 1} ${esc(C.PARTS[part.type].name)}</h2><div class="grid2">${Object.entries(C.PARTS[part.type].params).map(([k, spec]) => field(`pp-${k}`, spec, part[k])).join('') || '<p class="note">No settings.</p>'}</div>${say('param')}` : '<p class="note">Select a part to edit its settings.</p>'}
    ${field('temp', { label: 'Water temperature', unit: '°C', step: 1 }, setup.temp)}`;
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => act('build', () => { const id = C.addPart(setup, b.dataset.add, {}, sel); selected = id; return `Added ${C.PARTS[b.dataset.add].name}.`; }));
  document.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { selected = b.dataset.sel === sel ? null : b.dataset.sel; msg = {}; render(); });
  document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => act('build', () => C.movePart(setup, b.dataset.up, -1)));
  document.querySelectorAll('[data-down]').forEach(b => b.onclick = () => act('build', () => C.movePart(setup, b.dataset.down, 1)));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => act('build', () => { C.removePart(setup, b.dataset.del); if (selected === b.dataset.del) selected = null; }));
  if (part) for (const [k, spec] of Object.entries(C.PARTS[part.type].params)) $(`pp-${k}`).onchange = e => act('param', () => C.setParam(setup, part.id, k, spec.options ? e.target.value : +e.target.value / (spec.scale || 1)));
  $('temp').onchange = e => act('build', () => C.setTemp(setup, +e.target.value));
}

function paintMeasure(r) {
  const ch = setup.chain, placed = ch.map((p, i) => ({ id: p.id, i })).filter(x => setup.gauges.includes(x.id));
  let ex = '';
  if (explainPick.from && explainPick.to) {
    try {
      const x = C.explain(setup, explainPick.from, explainPick.to);
      ex = `<p class="note">From ${esc(x.from)} to ${esc(x.to)} the gauge pressure changes by <b>${f(x.total, 2)} kPa</b>:</p>
        <table class="tbl explain"><tbody>${x.items.map(i => `<tr><th>${esc(i.label)}</th><td class="num">${f(i.kPa, 2)}</td></tr>`).join('')}
        <tr><th>Change of level (ρg·Δz)</th><td class="num">${f(x.elevation, 2)}</td></tr><tr><th>Change of velocity (ρ·ΔV²/2)</th><td class="num">${f(x.velocity, 2)}</td></tr>
        <tr class="chg"><th>Total (= gauge difference)</th><td class="num" id="explain-total">${f(x.total, 2)}</td></tr></tbody></table><p class="note">kPa. Negative values lower the pressure. The rows add up to the gauge difference (residual ${f(Math.abs(x.check) * 1000, 3)} Pa).</p>`;
    } catch (e) { ex = `<p class="msg" role="alert">${esc(e.message)}</p>`; }
  }
  const opt = v => placed.map(x => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(C.gaugeLabel(setup, x.id))}</option>`).join('');
  $('m-measure').innerHTML = `<h2>Where to measure</h2><p class="note">Put a pressure gauge on any joint between two parts (or tap a joint on the drawing). Gauges read simulated gauge pressure; they do not change the flow.</p>
    <ul class="gauges">${ch.slice(0, -1).map((p, i) => `<li><label><input type="checkbox" data-gauge="${p.id}" ${setup.gauges.includes(p.id) ? 'checked' : ''}> after ${esc(C.partLabel(setup, i))}</label></li>`).join('') || '<li class="note">Add parts first.</li>'}</ul>${say('measure')}
    <h2 style="margin-top:14px">Explain a pressure change</h2>
    ${placed.length < 2 ? '<p class="note">Place two gauges to explain the change between them.</p>' : `<div class="grid2"><label class="field">Upstream gauge<select id="exFrom"><option value="">choose</option>${opt(explainPick.from)}</select></label><label class="field">Downstream gauge<select id="exTo"><option value="">choose</option>${opt(explainPick.to)}</select></label></div>${r.ok ? ex : ''}`}`;
  document.querySelectorAll('[data-gauge]').forEach(c => c.onchange = () => act('measure', () => { C.toggleGauge(setup, c.dataset.gauge); }));
  if ($('exFrom')) { $('exFrom').onchange = e => { explainPick.from = e.target.value || null; render(); }; $('exTo').onchange = e => { explainPick.to = e.target.value || null; render(); }; }
}

function paintDuty(r) {
  const pump = setup.chain.find(p => p.type === 'pump');
  $('m-duty').innerHTML = `<h2>Requirement and motor</h2>
    <label class="field"><span>Flow the job needs <span class="unit">L/s — leave empty for none</span></span><input id="req" type="number" inputmode="decimal" step="0.1" value="${setup.requiredFlow ?? ''}"></label>
    ${pump ? field('motor', C.PARTS.pump.params.motorId, pump.motorId) : '<p class="note">Add a pump to the line to choose a motor for it.</p>'}${say('duty')}
    <p class="note">The flow verdict compares the calculated flow with your requirement. The motor verdict compares the shaft power the pump takes with the motor's continuous shaft-output rating at this speed; when the pump cavitates it cannot be assessed.</p>`;
  $('req').onchange = e => act('duty', () => C.setRequiredFlow(setup, e.target.value === '' ? null : +e.target.value));
  if (pump) $('motor').onchange = e => act('duty', () => C.setParam(setup, pump.id, 'motorId', e.target.value));
}

function paintLearn() {
  const topics = C.TOPICS.filter(t => t.when(setup));
  $('m-learn').innerHTML = `<h2>Concepts for this line</h2><p class="note">Open any topic. Notes never change a tool or a result.</p>
    ${topics.map(t => `<details class="topic" data-topic="${t.id}"><summary>${esc(t.title)}</summary><p>${esc(t.concept)}</p>${t.equation ? `<code>${esc(t.equation)}</code>` : ''}<p class="note">Limits: ${esc(t.limits)}</p></details>`).join('')}`;
}

function render() {
  const r = C.evaluate(setup);
  const proj = nb.project();
  $('title').textContent = proj.name; $('subtitle').textContent = `${setup.chain.length} parts · ${setup.gauges.length} gauges · water at ${setup.temp} °C`;
  paintStarts(); paintScheme(r); paintResults(r); paintBuild(r); paintMeasure(r); paintDuty(r); paintLearn(); nb.render();
}

const bench = workbench('circuit', { initial: 'build' });
// ?preset=<id> (how a journey's "Explore on the bench" opens it): a scratch bench on that preset, kept in memory, so
// exploring never changes the learner's saved projects or which one is open. Without it: the learner's current project.
const explore = C.presetFromQuery(location.search);
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; };
const nb = notebook($('m-experiments'), { adapter: C.ADAPTER, storage: explore ? memory() : undefined,
  getSetup: () => clone(setup), applySetup: s => { setup = s; selected = null; msg = {}; explainPick = { from: null, to: null }; render(); } });
if (explore) {
  setup = C.fromPreset(explore.id); nb.project().name = `Exploring: ${explore.name}`; nb.sync();
  $('explore').hidden = false;
  $('explore').innerHTML = `Exploring the preset “${esc(explore.name)}”. Your saved projects are not changed, and runs saved here are not kept. <a href="./">Open my project</a>`;
} else setup = clone(nb.project().setup);
render();
document.body.dataset.ready = 'true';
