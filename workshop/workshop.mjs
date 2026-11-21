// Workshop bench UI. All decisions come from model.mjs; this file only renders and records choices.
// Guidance level changes text only — it never hides, locks or alters a control or a number.
import { workbench } from '../core/workbench.mjs';
import * as M from './model.mjs';
import { notebook } from '../core/notebook.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'workshop.v1';
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let ws = store.get(KEY, null) || M.newWorkshop();   // a workshop saved before the shared record seeds the first project
let ui = store.get('workshop.ui', { guide: 'hints', truth: false, feature: 'bore', instrument: 'caliper', shaftInst: 'caliper', op: 'bore', compare: [] });
const msgs = {};
const save = () => { nb?.sync(); store.set('workshop.ui', ui); };
let nb = null;
const part = () => ws.parts.find(p => p.id === ws.current) || null;
const mm = (v, d = 3) => v === null || v === undefined ? '–' : (+v).toFixed(d);
const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;
const rd = r => `${mm(r.reading, r.resolution < 0.01 ? 3 : 2)} ±${r.maxError}`;
const opText = o => ({ face: `face to length ${o.L}`, turn: `turn outside to Ø${o.D}`, drill: `drill Ø${o.D}`, bore: `bore to Ø${o.D}` }[o.type]);
const OUT_CLASS = { ok: 'ok', tight: 'bad', loose: 'bad', inconclusive: 'warn', conforms: 'ok', nonconforming: 'bad' };

// guidance text: same controls at every level
const G = {
  lathe: { hints: 'Every cut makes a new revision. Material can only be removed, so a hole that is too big cannot be made smaller — fork a new blank instead.', equations: 'As-cut size = commanded + simulated offset (see Model). Mass = ρ·π/4·(D² − d²)·L.' },
  drawing: { hints: 'The drawing is what you asked for, not what you made. Changing it never changes the part, a reading or a fit.', equations: 'Drawing limits: target + lower … target + upper. A reading conforms only if reading ± max error lies inside them.' },
  measure: { hints: 'A reading belongs to the revision it was taken on. After a recut, old readings describe a part that no longer exists.', equations: 'True size lies within reading ± maximum error of the instrument.' },
  fit: { hints: 'The fit uses only readings: your latest bore reading of this revision and your latest reading of the chosen shaft. If the possible clearance crosses a limit, the instrument cannot settle it.', equations: 'c = bore − shaft;  c ∈ [c − (e_bore + e_shaft), c + (e_bore + e_shaft)] (worst case). Too tight if the whole band is below min, too loose if above max.' },
};
const guide = k => ui.guide === 'off' ? '' : `<p class="note guide-text">${ui.guide === 'equations' ? `<code>${esc(G[k].equations)}</code>` : esc(G[k].hints)}</p>`;
const msg = k => msgs[k] ? `<p class="msg ${msgs[k].ok ? 'okmsg' : ''}" role="alert">${esc(msgs[k].text)}</p>` : '';
const act = (k, fn) => { try { const r = fn(); msgs[k] = r ? { ok: true, text: r } : null; } catch (e) { msgs[k] = { text: e.message }; } save(); render(); };

// ---------- parts bar ----------
function paintParts() {
  $('parts').innerHTML = ws.parts.map(p => `<button type="button" data-part="${p.id}" aria-current="${p.id === ws.current}">${esc(p.id)} · r${M.currentRev(p)}</button>`).join('')
    + `<button type="button" class="buildbtn" data-new="stock">+ New from stock</button>`
    + M.PRESETS.map(p => `<button type="button" data-preset="${p.id}">Preset: ${esc(p.name)}</button>`).join('')
    + (ws.parts.length ? `<button type="button" id="clearAll">${ui.armed ? 'Tap again to clear the bench' : 'Clear bench'}</button>` : '');
  $('parts').querySelectorAll('[data-part]').forEach(b => b.onclick = () => { ws.current = b.dataset.part; save(); render(); });
  $('parts').querySelector('[data-new]').onclick = () => act('lathe', () => { M.addPartFromStock(ws, { material: 'al6061', D: 65, L: 30 }); bench.open('lathe'); });
  if ($('clearAll')) $('clearAll').onclick = () => { if (ui.armed) { ws = M.newWorkshop(); ui.armed = false; save(); render(); } else { ui.armed = true; render(); } };
  $('parts').querySelectorAll('[data-preset]').forEach(b => b.onclick = () => act('lathe', () => { M.addPartFromPreset(ws, b.dataset.preset); bench.open('lathe'); }));
}

// ---------- drawing (commanded sizes; simulation truth only if revealed) ----------
function paintDrawing() {
  const p = part(), svg = $('drawing');
  if (!p) { svg.innerHTML = `<text x="300" y="125" text-anchor="middle" class="lbl">Start from stock or open a preset above.</text>`; return; }
  const revs = M.revisions(p), g = revs.at(-1), s = Math.min(420 / p.stock.L, 170 / p.stock.D), cx = Math.max(20, 230 - p.stock.L * s / 2), cy = 112;
  const X = v => cx + v * s, Y = v => cy - v * s / 2, Yb = v => cy + v * s / 2;
  const stock = `<rect x="${X(0)}" y="${Y(p.stock.D)}" width="${p.stock.L * s}" height="${p.stock.D * s}" class="stock"/>`;
  const body = `<rect x="${X(0)}" y="${Y(g.od)}" width="${g.L * s}" height="${g.od * s}" class="metal m-${p.material}"/>`;
  const bore = g.bore ? `<rect x="${X(0)}" y="${Y(g.bore)}" width="${g.L * s}" height="${g.bore * s}" class="hole"/>` : '';
  const n = g.nominal, lbl = (x, y, t, c = 'lbl') => `<text x="${x}" y="${y}" class="${c}">${esc(t)}</text>`;
  let t = lbl(X(g.L) + 8, Y(g.od) + 12, `Ø${n.od} outside`) + lbl(X(0), Yb(g.od) + 18, `length ${n.L}`) + (g.bore ? lbl(X(g.L) + 8, cy + 4, `Ø${n.bore} bore`) : '');
  if (ui.truth) t += lbl(X(g.L) + 8, Y(g.od) + 26, `as-cut ${mm(g.od, 4)}`, 'truth') + (g.bore ? lbl(X(g.L) + 8, cy + 18, `as-cut ${mm(g.bore, 4)}`, 'truth') : '') + lbl(X(0), 18, 'simulation truth shown — not visible in a real workshop', 'truth');
  svg.innerHTML = `${stock}${body}${bore}<line x1="${X(-4)}" x2="${X(p.stock.L + 4)}" y1="${cy}" y2="${cy}" class="cl"/>${t}<text x="10" y="244" class="dim">commanded sizes, mm · dashed: original stock Ø${p.stock.D} × ${p.stock.L}</text>`;
}

// ---------- benches ----------
function paintLathe() {
  const p = part(), el = $('lathe');
  if (!p) { el.innerHTML = `<h2>Lathe</h2><p class="note">No part yet. Choose “+ New from stock” or a preset above.</p>${msg('lathe')}`; return; }
  const rev = M.currentRev(p), g = M.revisions(p).at(-1);
  const stockCtl = rev === 0 ? `
    <p class="label">Material</p><div class="chips" role="radiogroup" aria-label="Material">${Object.values(M.MATERIALS).map(m => `<button type="button" role="radio" data-mat="${m.id}" aria-checked="${p.material === m.id}">${esc(m.name)}</button>`).join('')}</div>
    <p class="label">Bar diameter (mm)</p><div class="chips" role="radiogroup" aria-label="Bar diameter">${M.STOCK_DIAMETERS.map(d => `<button type="button" role="radio" data-bar="${d}" aria-checked="${p.stock.D === d}">Ø${d}</button>`).join('')}</div>
    <label class="field">Sawn length (mm) <input id="stockL" type="number" inputmode="decimal" min="10" max="150" step="1" value="${p.stock.L}"></label>`
    : `<p class="note">${esc(M.MATERIALS[p.material].name)} · stock Ø${p.stock.D} × ${p.stock.L} mm. This blank has been cut, so its material is fixed.</p>
    <div class="row"><select id="forkMat" aria-label="Material for a new blank">${Object.values(M.MATERIALS).map(m => `<option value="${m.id}" ${m.id === p.material ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><button type="button" id="forkNow">New blank with this plan</button></div>`;
  const sizeCtl = ui.op === 'drill'
    ? `<select id="opSize" aria-label="Drill">${M.DRILLS.map(d => `<option ${d === 18 ? 'selected' : ''}>${d.toFixed(1)}</option>`).join('')}</select>`
    : `<input id="opSize" type="number" inputmode="decimal" step="0.001" aria-label="Size (mm)" value="${ui.op === 'face' ? g.nominal.L : ui.op === 'turn' ? g.nominal.od : g.nominal.bore ?? ''}">`;
  el.innerHTML = `<h2>Lathe</h2>${stockCtl}
    <p class="label">Next operation</p>
    <div class="chips" role="radiogroup" aria-label="Operation">${['face', 'turn', 'drill', 'bore'].map(o => `<button type="button" role="radio" data-op="${o}" aria-checked="${ui.op === o}">${{ face: 'Face', turn: 'Turn OD', drill: 'Drill', bore: 'Bore' }[o]}</button>`).join('')}</div>
    <div class="row"><label class="field grow">${ui.op === 'face' ? 'Length' : 'Diameter'} (mm) ${sizeCtl}</label><button type="button" class="primary" id="cutNow">Cut</button></div>
    ${msg('lathe')}
    <p class="label">History · this part is at revision ${rev}</p>
    <ol class="hist">${p.ops.map((o, i) => `<li><span>r${i + 1} · ${esc(opText(o))}</span><button type="button" data-forkrev="${i + 1}" aria-label="Fork a new blank from revision ${i + 1}">Fork</button></li>`).join('') || '<li><span>r0 · stock as received</span></li>'}</ol>
    <p class="note">Mass now: <b>${(M.mass(p) * 1000).toFixed(0)} g</b></p>${guide('lathe')}`;
  el.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => act('lathe', () => M.setStock(ws, p.id, { material: b.dataset.mat })));
  el.querySelectorAll('[data-bar]').forEach(b => b.onclick = () => act('lathe', () => M.setStock(ws, p.id, { D: +b.dataset.bar })));
  const L = $('stockL'); if (L) L.onchange = () => act('lathe', () => M.setStock(ws, p.id, { L: +L.value }));
  el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { ui.op = b.dataset.op; msgs.lathe = null; save(); render(); });
  $('cutNow').onclick = () => act('lathe', () => { const v = +$('opSize').value; M.cut(ws, p.id, ui.op === 'face' ? { type: 'face', L: v } : { type: ui.op, D: v }); return `Cut done — revision ${M.currentRev(p)}. Earlier readings stay with earlier revisions.`; });
  const f = $('forkNow'); if (f) f.onclick = () => act('lathe', () => { const id = M.forkPart(ws, p.id, { material: $('forkMat').value }); return `New blank ${id} cut to the same plan.`; });
  el.querySelectorAll('[data-forkrev]').forEach(b => b.onclick = () => act('lathe', () => { const id = M.forkPart(ws, p.id, { rev: +b.dataset.forkrev }); return `New blank ${id}, cut to revision ${b.dataset.forkrev} of ${p.id}.`; }));
}

function paintDrawingBench() {
  const p = part(), el = $('drawingmod');
  if (!p) { el.innerHTML = '<h2>Drawing</h2><p class="note">No part yet.</p>'; return; }
  const latestBore = M.latest(M.readingsFor(ws, p.id), r => r.feature === 'bore' && r.rev === M.currentRev(p));
  const chk = latestBore ? M.drawingCheck(latestBore, p.spec) : null;
  el.innerHTML = `<h2>Drawing: bore</h2>
    <div class="row three"><label class="field">Target Ø<input id="sT" type="number" inputmode="decimal" step="0.001" value="${p.spec.target}"></label>
    <label class="field">Lower<input id="sL" type="number" inputmode="decimal" step="0.001" value="${p.spec.lower}"></label>
    <label class="field">Upper<input id="sU" type="number" inputmode="decimal" step="0.001" value="${p.spec.upper}"></label></div>
    <div class="row"><button type="button" id="specNow">Apply drawing</button></div>${msg('drawing')}
    <p class="note">Limits ${mm(p.spec.target + p.spec.lower)} … ${mm(p.spec.target + p.spec.upper)} mm.</p>
    ${chk ? `<p class="result ${OUT_CLASS[chk.outcome]}">${M.OUTCOME_TEXT[chk.outcome] === 'Meets drawing' ? 'Bore meets drawing' : chk.outcome === 'inconclusive' ? 'Can’t confirm against the drawing with this instrument' : 'Bore outside drawing'} · reading ${rd(latestBore)} → ${mm(chk.lo)} … ${mm(chk.hi)}</p>` : '<p class="note">No bore reading on this revision yet.</p>'}
    ${guide('drawing')}`;
  $('specNow').onclick = () => act('drawing', () => { M.setSpec(ws, p.id, { target: $('sT').value, lower: $('sL').value, upper: $('sU').value }); return 'Drawing updated. The part, its readings and any fit result are unchanged.'; });
}

function paintMeasure() {
  const p = part(), el = $('measure');
  if (!p) { el.innerHTML = '<h2>Measure</h2><p class="note">No part yet.</p>'; return; }
  const rev = M.currentRev(p), list = M.readingsFor(ws, p.id);
  el.innerHTML = `<h2>Measure ${esc(p.id)}</h2>
    <p class="label">Feature</p><div class="chips" role="radiogroup" aria-label="Feature">${['bore', 'od', 'length'].map(f => `<button type="button" role="radio" data-feat="${f}" aria-checked="${ui.feature === f}">${M.FEATURES[f]}</button>`).join('')}</div>
    <p class="label">Instrument</p><div class="chips" role="radiogroup" aria-label="Instrument">${Object.values(M.INSTRUMENTS).map(i => `<button type="button" role="radio" data-inst="${i.id}" aria-checked="${ui.instrument === i.id}">${i.name} <small>±${i.maxError}</small></button>`).join('')}</div>
    <div class="row"><button type="button" class="primary" id="readNow">Take reading</button></div>${msg('measure')}
    <table class="tbl"><thead><tr><th>Rev</th><th>Feature</th><th>Instrument</th><th>Reading (mm)</th></tr></thead><tbody>
    ${list.slice().reverse().map(r => `<tr class="${r.rev === rev ? '' : 'old'}"><td>r${r.rev}${r.rev === rev ? '' : ' <em>superseded</em>'}</td><td>${M.FEATURES[r.feature]}</td><td>${M.INSTRUMENTS[r.instrument].name}</td><td>${rd(r)}</td></tr>`).join('') || '<tr><td colspan="4">No readings yet.</td></tr>'}
    </tbody></table>${guide('measure')}`;
  el.querySelectorAll('[data-feat]').forEach(b => b.onclick = () => { ui.feature = b.dataset.feat; msgs.measure = null; save(); render(); });
  el.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => { ui.instrument = b.dataset.inst; msgs.measure = null; save(); render(); });
  $('readNow').onclick = () => act('measure', () => { const r = M.takeReading(ws, p.id, ui.feature, ui.instrument); return `${M.FEATURES[r.feature]} r${r.rev}: ${rd(r)} mm (${M.INSTRUMENTS[r.instrument].name})`; });
}

function fitBand(f) {
  const lo = Math.min(f.lo, f.range.min) - 0.01, hi = Math.max(f.hi, f.range.max) + 0.01, X = v => 10 + (v - lo) / (hi - lo) * 280;
  return `<svg class="band" viewBox="0 0 300 54" role="img" aria-label="Clearance band against the fit range">
    <rect x="${X(f.range.min)}" y="8" width="${X(f.range.max) - X(f.range.min)}" height="16" class="rng"/><text x="${X(f.range.min)}" y="50" class="lbl">${mm(f.range.min)}</text><text x="${X(f.range.max)}" y="50" class="lbl" text-anchor="end">${mm(f.range.max)}</text>
    <rect x="${X(f.lo)}" y="28" width="${Math.max(2, X(f.hi) - X(f.lo))}" height="8" class="pl ${OUT_CLASS[f.outcome]}"/><line x1="${X(f.clearance)}" x2="${X(f.clearance)}" y1="24" y2="40" class="mid"/>
    ${lo < 0 && hi > 0 ? `<line x1="${X(0)}" x2="${X(0)}" y1="4" y2="40" class="zero"/><text x="${X(0)}" y="50" class="lbl" text-anchor="middle">0</text>` : ''}</svg>
    <p class="note">Shaded: your fit range. Bar: where the clearance can be, given both readings.</p>`;
}
function paintFit() {
  const p = part(), el = $('fit'), F = ws.fit, shaft = M.SHAFTS.find(s => s.id === F.shaftId);
  const sh = ws.readings.filter(r => r.shaftId === F.shaftId);
  const f = p ? M.fitState(ws, p.id, F) : null;
  const res = !p ? '<p class="note">No part yet.</p>'
    : f.state === 'needs-bore' ? '<p class="result warn">Measure the bore of this revision first (Measure bench).</p>'
    : f.state === 'stale' ? `<p class="result warn">Part recut since your last bore reading (r${f.staleRev}). Measure revision ${f.rev} — the old reading describes a part that no longer exists.</p>`
    : f.state === 'needs-shaft' ? '<p class="result warn">Measure the chosen shaft first.</p>'
    : `<p class="result ${OUT_CLASS[f.outcome]}" id="fitResult">${M.OUTCOME_TEXT[f.outcome]}</p>
       <p class="note">Bore ${rd(f.bore)} (${M.INSTRUMENTS[f.bore.instrument].name}, r${f.bore.rev}) − shaft ${rd(f.shaft)} (${M.INSTRUMENTS[f.shaft.instrument].name}) = clearance ${signed(f.clearance)} mm, could be ${signed(f.lo)} … ${signed(f.hi)}.</p>${fitBand(f)}`;
  el.innerHTML = `<h2>Fit bench${p ? ` · ${esc(p.id)} r${M.currentRev(p)}` : ''}</h2>
    <p class="label">Mating shaft</p><div class="chips" role="radiogroup" aria-label="Shaft">${M.SHAFTS.map(s => `<button type="button" role="radio" data-shaft="${s.id}" aria-checked="${F.shaftId === s.id}">${esc(s.name)}</button>`).join('')}</div>
    ${ui.truth ? `<p class="note truthtxt">Simulation truth: this shaft is ${shaft.size} mm.</p>` : ''}
    <div class="row"><div class="chips" role="radiogroup" aria-label="Shaft instrument">${['caliper', 'micrometer'].map(i => `<button type="button" role="radio" data-sinst="${i}" aria-checked="${ui.shaftInst === i}">${M.INSTRUMENTS[i].name}</button>`).join('')}</div><button type="button" id="shaftNow">Measure shaft</button></div>
    <p class="note">${sh.length ? `Shaft readings: ${sh.slice(-3).map(r => `${rd(r)} (${M.INSTRUMENTS[r.instrument].name})`).join(', ')}` : 'This shaft has not been measured.'}</p>
    <p class="label">Required clearance (bore − shaft, mm; negative = interference)</p>
    <div class="chips">${M.FIT_RANGES.map(r => `<button type="button" data-range="${r.id}" aria-pressed="${F.range.min === r.min && F.range.max === r.max}">${r.name}</button>`).join('')}</div>
    <div class="row three"><label class="field">Min<input id="fMin" type="number" inputmode="decimal" step="0.001" value="${F.range.min}"></label><label class="field">Max<input id="fMax" type="number" inputmode="decimal" step="0.001" value="${F.range.max}"></label><button type="button" id="rangeNow">Set range</button></div>
    <p class="note">Quick-fill values: ISO 286-2, sizes over 18 up to 30 mm.</p>
    ${msg('fit')}${res}${guide('fit')}`;
  el.querySelectorAll('[data-shaft]').forEach(b => b.onclick = () => { F.shaftId = b.dataset.shaft; msgs.fit = null; save(); render(); });
  el.querySelectorAll('[data-sinst]').forEach(b => b.onclick = () => { ui.shaftInst = b.dataset.sinst; save(); render(); });
  $('shaftNow').onclick = () => act('fit', () => { M.takeShaftReading(ws, F.shaftId, ui.shaftInst); });
  el.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { const r = M.FIT_RANGES.find(x => x.id === b.dataset.range); F.range = { min: r.min, max: r.max }; msgs.fit = null; save(); render(); });
  $('rangeNow').onclick = () => act('fit', () => { const r = { min: +$('fMin').value, max: +$('fMax').value }; M.fitCheck({ reading: 0, maxError: 0 }, { reading: 0, maxError: 0 }, r); F.range = r; });
}

function paintModel() {
  $('model').innerHTML = `<h2>What this model includes</h2>
    <p>Simulated: the operations you choose, the geometry they leave, a repeatable simulated offset per operation, and instrument readings with stated resolution and maximum error. Fit and drawing checks use readings only. The same stock and operations always give the same part, in any material.</p>
    <table class="tbl"><thead><tr><th>Operation</th><th>Simulated offset (mm)</th></tr></thead><tbody>${Object.entries(M.OFFSETS).map(([k, o]) => `<tr><td>${k}</td><td>${o.bias >= 0 ? '+' : ''}${o.bias} ± ${o.spread} — ${esc(o.note)}</td></tr>`).join('')}</tbody></table>
    <p class="note">Offsets are illustrative and labelled simulated; they are the same for every material and are not derived from cutting physics.</p>
    <table class="tbl"><thead><tr><th>Instrument</th><th>Resolution</th><th>Max error</th></tr></thead><tbody>${Object.values(M.INSTRUMENTS).map(i => `<tr><td>${i.name}</td><td>${i.resolution}</td><td>±${i.maxError}</td></tr>`).join('')}</tbody></table>
    <p class="note">Typical values for the instrument class, not a calibration certificate.</p>
    <table class="tbl"><thead><tr><th>Material</th><th>Density</th><th>Source</th></tr></thead><tbody>${Object.values(M.MATERIALS).map(m => `<tr><td>${esc(m.name)}</td><td>${m.density} kg/m³</td><td>${esc(m.source)}</td></tr>`).join('')}</tbody></table>
    <p class="note">Material affects mass only. Not simulated: cutting forces, tool deflection, chatter, tool wear, heat and thermal expansion, surface finish, roundness, taper, chucking distortion, material-specific cutting error, press-fit force and stress, gear teeth.</p>
    <div class="row"><button type="button" id="truth" aria-pressed="${ui.truth}">${ui.truth ? 'Hide' : 'Reveal'} simulation truth</button></div>
    <p class="note">Revealing the as-cut sizes changes nothing else: no reading, check or result uses them.</p>`;
  $('truth').onclick = () => { ui.truth = !ui.truth; save(); render(); };
}

function paintSummary() {
  const p = part();
  document.querySelectorAll('[data-guide]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.guide === ui.guide)));
  if (!p) { $('title').textContent = 'Workshop'; $('subtitle').textContent = 'Start from round stock or open an editable preset.'; ['r-rev', 'r-target', 'r-bore', 'r-fit'].forEach(k => $(k).textContent = '–'); $('verdict').textContent = ''; $('verdict').className = 'verdict'; return; }
  const rev = M.currentRev(p), f = M.fitState(ws, p.id, ws.fit), b = M.latest(M.readingsFor(ws, p.id), r => r.feature === 'bore' && r.rev === rev);
  $('title').textContent = `${p.name}`;
  $('subtitle').textContent = `${p.id} · ${M.MATERIALS[p.material].name} · ${p.from.startsWith('preset') ? 'opened from a preset' : p.from.startsWith('fork') ? `forked from ${p.from.slice(5)}` : 'started from stock'} · ${(M.mass(p) * 1000).toFixed(0)} g`;
  $('r-rev').textContent = `r${rev}`;
  $('r-target').textContent = `Ø${p.spec.target} ${p.spec.lower >= 0 ? '+' : ''}${p.spec.lower}/${p.spec.upper >= 0 ? '+' : ''}${p.spec.upper}`;
  $('r-bore').textContent = b ? rd(b) : f.state === 'stale' ? `stale (r${f.staleRev})` : 'not measured';
  $('r-fit').textContent = f.state === 'result' ? M.OUTCOME_TEXT[f.outcome] : '–';
  const shaft = M.SHAFTS.find(s => s.id === ws.fit.shaftId).name;
  $('verdict').className = `verdict ${f.state === 'result' ? OUT_CLASS[f.outcome] : 'warn'}`;
  $('verdict').textContent = f.state === 'result' ? `${M.OUTCOME_TEXT[f.outcome]} on ${shaft}: clearance ${signed(f.lo)} … ${signed(f.hi)} mm against ${signed(f.range.min)} … ${signed(f.range.max)}.`
    : f.state === 'stale' ? `Recut to r${rev}. Bore readings belong to r${f.staleRev}; measure again before judging the fit.`
    : f.state === 'needs-shaft' ? `Bore measured. Measure ${shaft} on the Fit bench.` : `Revision ${rev}. Measure the bore when you are ready to check a fit.`;
}

// Attempts saved before experiment records existed move onto the project as historical snapshots: shown exactly
// as saved, never replayed and never presented as runs.
function adoptLegacy(setup) {
  if (!Array.isArray(setup.attempts)) return false;
  const p = nb.project(), seen = new Set((p.history || []).map(a => JSON.stringify(a)));
  p.history = [...(p.history || []), ...setup.attempts.filter(a => !seen.has(JSON.stringify(a)))];
  delete setup.attempts;
  return true;
}
function paintHistory() {
  const h = nb.project().history || [];
  if (!h.length) return;
  const rd = r => r ? `${r.reading} ±${r.maxError} mm (${M.INSTRUMENTS[r.instrument]?.name ?? r.instrument})` : 'not measured';
  $('experiments').insertAdjacentHTML('beforeend', `<section class="history" id="history"><h2>Earlier attempts</h2>
    <p class="note">Saved before experiment records existed. Shown exactly as they were saved: they are not recomputed, not checked, and are not runs.</p>
    <ul class="nb-runs">${h.map(a => `<li data-history><b>${esc(a.name)}</b><span>${esc(a.partId)} r${a.rev} · bore ${esc(rd(a.bore))} · shaft ${esc(rd(a.shaft))}${a.clearance !== null && a.clearance !== undefined ? ` · clearance ${a.lo} … ${a.hi} mm` : ''}</span><em>${esc(M.OUTCOME_TEXT[a.outcome] ?? a.outcome)} (as saved)</em></li>`).join('')}</ul></section>`);
}

function render() { paintParts(); paintDrawing(); paintLathe(); paintDrawingBench(); paintMeasure(); paintFit(); paintModel(); paintSummary(); nb.render(); paintHistory(); }

document.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => { ui.guide = b.dataset.guide; save(); render(); });
const bench = workbench('workshop', { initial: 'lathe' });
nb = notebook($('experiments'), { adapter: M.ADAPTER, getSetup: () => JSON.parse(JSON.stringify(ws)), applySetup: s => { ws = s; if (adoptLegacy(ws)) nb.sync(); render(); } });
ws = JSON.parse(JSON.stringify(nb.project().setup));
if (adoptLegacy(ws)) nb.sync();
render();
document.body.dataset.ready = 'true';
