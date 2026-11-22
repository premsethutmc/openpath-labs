// "The Mount That Didn't Break" — UI. Model: ./model.mjs (Solids engine). Shared: ../core/workbench.mjs (layout),
// ../core/protocol.mjs (predictions locked before results, feedback gates) and ../core/project.mjs via
// ../core/notebook.mjs (every test-stand reading is a reproducible run on the shared experiment record).
import { SPEC, ORIGINAL, MATERIAL_IDS, GAUGE_POSITIONS, stand, verdict, check, sectionOf, massOf, READING_ADAPTER, READING_LABELS } from './model.mjs';
import { MATERIALS } from '../core/materials.mjs';
import { workbench } from '../core/workbench.mjs';
import { Protocol, checkAnswers } from '../core/protocol.mjs';
import { notebook } from '../core/notebook.mjs';
import * as P from '../core/project.mjs';

const $ = id => document.getElementById(id);
const f = (n, d = 1) => n.toFixed(d);
const clone = o => JSON.parse(JSON.stringify(o));
const J = new Protocol();
const WB = workbench('mount', { initial: 'mission' });
const ALLOW = m => MATERIALS[m].yield / SPEC.yieldFactor;
const SHAPES = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
const DIMS = { rect: [['b', 'Width b', 10, 50], ['h', 'Depth h', 10, 80]], rhs: [['b', 'Width b', 20, 50], ['h', 'Depth h', 20, 80], ['t', 'Wall t', 3, 10]], I: [['b', 'Flange width b', 20, 50], ['h', 'Depth h', 20, 80], ['tw', 'Web tw', 3, 10], ['tf', 'Flange tf', 3, 12]] };
const DEFAULT_DIMS = { rect: { b: 40, h: 30 }, rhs: { b: 40, h: 50, t: 3 }, I: { b: 40, h: 60, tw: 3, tf: 4 } };
const NOT_MODELLED = { bolts: 'Bolt slip and the real fixity of bolted ends', holes: 'Stress concentrations at bolt holes and corners', fatigue: 'Fatigue under repeated loading', local: 'Local buckling of thin walls', dynamic: 'Dynamic or impact loading' };
const MODELLED = { hooke: 'Elastic (Hooke’s law) bending of the beam', geometry: 'The section’s second moment of area' };
const designKey = d => JSON.stringify(Object.fromEntries(['material', 'shape', ...DIMS[d.shape].map(x => x[0])].map(k => [k, d[k]])));
const SHORT = { steel: 'Steel', aluminium: 'Aluminium' };
const designLabel = d => `${SHORT[d.material]} ${d.shape === 'rect' ? `${d.b}×${d.h} solid` : d.shape === 'rhs' ? `${d.b}×${d.h}×${d.t} hollow` : `I ${d.b}×${d.h} (tw ${d.tw}, tf ${d.tf})`}`;

const S = {
  stage: 'investigate', design: clone(ORIGINAL), mount: SPEC.guidedMount, loaded: false, dialX: 100, strainX: 400,
  runs: [],          // [{ name, design, mount, loaded, dialX, strainX, deflection, strain, stress, mass }]
  diag: { answer: null, defl: '', stress: '', attempts: 0, passed: false, feedback: null },
  defend: { run: '', align: '', yield: '', why: null, limit: null, text: '', result: null },
  transfer: { attempt: 1, predA: null, predY: null, locked: false, verdictA: null, verdictY: null, result: null, history: [] },
};

// ---------- test stand ----------
function takeReading() {
  const st = stand(S.design, { mount: S.mount, loaded: S.loaded }), dd = st.at(S.dialX), ss = st.at(S.strainX);
  if (S.loaded && standLocked()) return;   // unseen case: no loaded results before the prediction and design are locked
  const r = { name: `R${S.runs.length + 1} · ${designLabel(S.design)} · ${S.loaded ? 'loaded' : 'unloaded'} · mount ${S.mount} mm`, design: clone(S.design), mount: S.mount, loaded: S.loaded,
    attempt: S.stage === 'transfer' || S.stage === 'finished' ? S.transfer.attempt : 0, afterLock: (S.stage === 'transfer' || S.stage === 'finished') && S.transfer.locked,
    dialX: S.dialX, strainX: S.strainX, deflection: dd.deflection, strain: ss.strain * 1e6, stress: ss.strain * MATERIALS[S.design.material].E, mass: st.mass };
  // every reading goes onto the shared experiment record and is recomputed from its setup when reopened
  nb.sync();
  const run = P.saveRun(nb.project(), READING_ADAPTER, r.name);
  nb.sync(); nb.render();
  r.runId = run.id;
  S.runs.push(r);
  $('r-dial').textContent = `${f(r.deflection, 3)} mm @ ${r.dialX}`; $('r-strain').textContent = `${f(r.strain, 0)} µε @ ${r.strainX}`;
  paintRuns(); mission(); document.body.dataset.runs = String(S.runs.length);
}
const runByName = n => S.runs.find(r => r.name === n);
// In the unseen case the test stand stays unloaded until the prediction and design are locked.
const standLocked = () => S.stage === 'transfer' && !S.transfer.locked;
// Only readings taken after this attempt's lock can count in the unseen case.
const attemptRuns = () => S.runs.filter(r => r.attempt === S.transfer.attempt && r.afterLock);
function paintStand() {
  const lockedOut = standLocked();
  if (lockedOut && S.loaded) S.loaded = false;
  $('load-on').disabled = lockedOut;
  $('stand-note').textContent = lockedOut ? 'New case: lock your prediction and design in Mission before loading the support. Results under load stay hidden until then.' : 'A reading saves the gauge values with the current design, load and positions. Strain gauges read strain; stress = E · strain.';
}
const sameDesign = (r, d) => designKey(r.design) === designKey(d);
const deflEvidence = (r, d, mount) => !!r && r.loaded && sameDesign(r, d) && r.mount === mount && r.dialX === mount;
const stressEvidence = (r, d, mount) => !!r && r.loaded && sameDesign(r, d) && r.mount === mount && r.strainX === mount;

// ---------- drawing ----------
const RAMP = [[0, [111, 135, 150]], [0.45, [150, 160, 150]], [0.65, [217, 164, 65]], [0.85, [224, 83, 31]], [1, [179, 20, 27]]];
const ramp = u => { u = Math.max(0, Math.min(1, u)); for (let i = 1; i < RAMP.length; i++) if (u <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (u - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`; } return 'rgb(179,20,27)'; };
function draw() {
  const st = stand(S.design, { mount: S.mount, loaded: S.loaded }), X = x => 40 + x / SPEC.span * 320, y0 = 92;
  const maxD = Math.max(...st.defl.map(Math.abs)), raw = maxD > 0 ? 40 / maxD : 1;
  const scale = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter(s => s <= raw).pop() || 1;
  const Y = i => y0 + st.defl[i] * scale, sec = sectionOf(S.design), yieldS = MATERIALS[S.design.material].yield;
  let segs = '';
  for (let i = 0; i < st.defl.length - 1; i++) {
    const u = Math.max(Math.abs(st.M[i]), Math.abs(st.M[i + 1])) * sec.c / sec.I / yieldS;
    segs += `<line x1="${X(i * SPEC.step)}" y1="${Y(i)}" x2="${X((i + 1) * SPEC.step)}" y2="${Y(i + 1)}" stroke="${ramp(u)}" stroke-width="7" stroke-linecap="round"/>`;
  }
  const mi = S.mount / SPEC.step, mx = X(S.mount), my = Y(mi);
  const dialY = Y(S.dialX / SPEC.step), strainY = Y(S.strainX / SPEC.step);
  // section sketch
  const k = 40 / 80, sx = 330, sy = 150;
  const d = S.design, w = d.b * k, h = d.h * k;
  let sk = '';
  if (d.shape === 'rect') sk = `<rect x="${sx - w / 2}" y="${sy}" width="${w}" height="${h}" fill="#4a5f6c"/>`;
  if (d.shape === 'rhs') sk = `<rect x="${sx - w / 2}" y="${sy}" width="${w}" height="${h}" fill="#4a5f6c"/><rect x="${sx - w / 2 + d.t * k}" y="${sy + d.t * k}" width="${w - 2 * d.t * k}" height="${h - 2 * d.t * k}" fill="#0d151b"/>`;
  if (d.shape === 'I') sk = `<rect x="${sx - w / 2}" y="${sy}" width="${w}" height="${d.tf * k}" fill="#4a5f6c"/><rect x="${sx - w / 2}" y="${sy + h - d.tf * k}" width="${w}" height="${d.tf * k}" fill="#4a5f6c"/><rect x="${sx - d.tw * k / 2}" y="${sy}" width="${d.tw * k}" height="${h}" fill="#4a5f6c"/>`;
  $('rig').innerHTML = `<style>.t{font:500 7.5px "JetBrains Mono",ui-monospace,monospace;fill:#8fa3b0}.tl{font:600 8px "JetBrains Mono",ui-monospace,monospace;fill:#e6eef3}</style>
    <defs><pattern id="g" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#16222b" stroke-width=".6"/></pattern>
    <pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" stroke="#6d8796" stroke-width="1"/></pattern></defs>
    <rect width="400" height="230" fill="url(#g)"/>
    <line x1="${X(0)}" x2="${X(SPEC.span)}" y1="${y0}" y2="${y0}" stroke="#2e4553" stroke-dasharray="3 3"/>
    ${segs}
    <path d="M${X(0)} ${y0 + 4}l-9 14h18z" fill="#0d151b" stroke="#c9d6df"/><rect x="${X(0) - 14}" y="${y0 + 18}" width="28" height="5" fill="url(#h)"/>
    <path d="M${X(SPEC.span)} ${y0 + 4}l-9 12h18z" fill="#0d151b" stroke="#c9d6df"/><circle cx="${X(SPEC.span) - 5}" cy="${y0 + 20}" r="3" fill="#0d151b" stroke="#c9d6df"/><circle cx="${X(SPEC.span) + 5}" cy="${y0 + 20}" r="3" fill="#0d151b" stroke="#c9d6df"/>
    <text x="${X(0)}" y="${y0 + 36}" class="t" text-anchor="middle">bolt (pin)</text><text x="${X(SPEC.span)}" y="${y0 + 36}" class="t" text-anchor="middle">bolt (roller)</text>
    <rect x="${mx - 22}" y="${my - 30}" width="44" height="22" rx="3" fill="#16222b" stroke="#e6eef3"/><text x="${mx}" y="${my - 16}" class="tl" text-anchor="middle">machine</text>
    ${S.loaded ? `<line x1="${mx}" y1="${my - 58}" x2="${mx}" y2="${my - 34}" stroke="#ff8a3d" stroke-width="2"/><path d="M${mx - 5} ${my - 40}l5 7 5 -7z" fill="#ff8a3d"/><text x="${mx + 7}" y="${my - 50}" class="tl" fill="#ff8a3d">${f(SPEC.load / 1000, 1)} kN</text>` : ''}
    <g><line x1="${X(S.dialX)}" y1="${dialY + 4}" x2="${X(S.dialX)}" y2="${y0 + 46}" stroke="#4fc3f7"/><circle cx="${X(S.dialX)}" cy="${y0 + 54}" r="8" fill="#0d151b" stroke="#4fc3f7"/><text x="${X(S.dialX)}" y="${y0 + 70}" class="t" text-anchor="middle" fill="#4fc3f7">dial ${S.dialX}</text></g>
    <rect x="${X(S.strainX) - 4}" y="${strainY + 3}" width="8" height="4" fill="#ff8a3d"/><text x="${X(S.strainX)}" y="${strainY + 16}" class="t" text-anchor="middle" fill="#ff8a3d">ε ${S.strainX}</text>
    <text id="scale-label" x="40" y="196" class="t">${S.loaded ? `deflection drawn ×${scale}` : 'unloaded: straight'} · colour: stress ÷ yield</text>
    <line x1="${X(0)}" x2="${X(SPEC.span)}" y1="${y0 - 60}" y2="${y0 - 60}" stroke="#2c3e4a"/><text x="${(X(0) + X(SPEC.span)) / 2}" y="${y0 - 63}" class="t" text-anchor="middle">${SPEC.span} mm between bolts · mount at ${S.mount} mm</text>
    ${sk}<text x="${sx}" y="${sy - 4}" class="t" text-anchor="middle">section (½ scale)</text>
    <text x="40" y="210" class="t">${designLabel(S.design)} · E ${f(MATERIALS[S.design.material].E / 1000, 0)} GPa · yield ${MATERIALS[S.design.material].yield} MPa</text>`;
  $('r-load').textContent = S.loaded ? `${SPEC.load} N` : '0 N';
  $('r-mass').textContent = `${f(massOf(S.design), 2)} kg`;
  $('status').textContent = S.loaded ? `LOADED · ${f(SPEC.load / 1000, 1)} kN at ${S.mount} mm` : 'UNLOADED';
  $('status').className = 'status ' + (S.loaded ? 'warn' : 'idle');
}

// ---------- design module ----------
function paintDesign() {
  const locked = S.stage === 'investigate' || (S.stage === 'transfer' && S.transfer.locked);
  $('design-lock').hidden = !locked;
  $('design-lock').textContent = S.stage === 'investigate' ? 'Investigate the support as it is first. Redesign unlocks after your diagnosis.' : 'Design locked with your prediction.';
  $('mat').innerHTML = MATERIAL_IDS.map(m => `<button type="button" role="radio" data-mat="${m}" aria-checked="${S.design.material === m}" ${locked ? 'disabled' : ''}>${MATERIALS[m].name}</button>`).join('');
  $('shape').innerHTML = Object.entries(SHAPES).map(([k, n]) => `<button type="button" role="radio" data-shape="${k}" aria-checked="${S.design.shape === k}" ${locked ? 'disabled' : ''}>${n}</button>`).join('');
  $('dims').innerHTML = DIMS[S.design.shape].map(([k, l, lo, hi]) => `<label class="range">${l} <output id="d-${k}-out">${S.design[k]} mm</output><input type="range" data-dim="${k}" min="${lo}" max="${hi}" step="1" value="${S.design[k]}" ${locked ? 'disabled' : ''}></label>`).join('');
  const sec = sectionOf(S.design), ok = check(S.design), m = MATERIALS[S.design.material];
  $('secprops').innerHTML = `I = ${Math.round(sec.I).toLocaleString('en-IN')} mm⁴ · E·I = ${(m.E * sec.I / 1e9).toFixed(1)} kN·m² · c = ${f(sec.c, 0)} mm · mass ${f(massOf(S.design), 2)} kg (limit ${SPEC.massLimit} kg)${ok.ok ? '' : `<br><span class="badtext">Not allowed: ${ok.errors.join('; ')}.</span>`}`;
  $('take').disabled = !ok.ok;
  $('mat').querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { S.design.material = b.dataset.mat; refresh(); });
  $('shape').querySelectorAll('[data-shape]').forEach(b => b.onclick = () => { S.design = { material: S.design.material, shape: b.dataset.shape, ...DEFAULT_DIMS[b.dataset.shape] }; refresh(); });
  $('dims').querySelectorAll('[data-dim]').forEach(i => i.oninput = () => { S.design[i.dataset.dim] = +i.value; $(`d-${i.dataset.dim}-out`).textContent = `${i.value} mm`; draw(); const s = sectionOf(S.design), c = check(S.design); $('secprops').innerHTML = `I = ${Math.round(s.I).toLocaleString('en-IN')} mm⁴ · E·I = ${(MATERIALS[S.design.material].E * s.I / 1e9).toFixed(1)} kN·m² · c = ${f(s.c, 0)} mm · mass ${f(massOf(S.design), 2)} kg (limit ${SPEC.massLimit} kg)${c.ok ? '' : `<br><span class="badtext">Not allowed: ${c.errors.join('; ')}.</span>`}`; $('take').disabled = !c.ok; });
}

// ---------- runs module ----------
const cell = (ok, txt) => `<td class="${ok === null ? 'na' : ok ? 'ok' : 'no'}">${txt}</td>`;
function paintRuns() {
  const rows = S.runs.map(r => {
    const aOk = r.loaded && r.dialX === r.mount ? r.deflection <= SPEC.tolerance : null, yOk = r.loaded && r.strainX === r.mount ? r.stress <= ALLOW(r.design.material) : null;
    return `<tr><th>${r.name}</th><td>${f(r.deflection, 3)} mm @${r.dialX}</td>${cell(aOk, aOk === null ? 'n/a' : aOk ? 'within' : 'outside')}<td>${f(r.strain, 0)} µε @${r.strainX}</td><td>${f(r.stress, 1)} MPa</td>${cell(yOk, yOk === null ? 'n/a' : yOk ? 'OK' : 'over')}${cell(r.mass <= SPEC.massLimit, `${f(r.mass, 2)} kg`)}</tr>`;
  }).join('');
  $('runs').innerHTML = S.runs.length ? `<table class="cmp"><thead><tr><th>Reading</th><th>Dial</th><th>Alignment ≤ ${SPEC.tolerance} mm</th><th>Strain</th><th>σ = E·ε</th><th>≤ yield ÷ ${SPEC.yieldFactor}</th><th>Mass ≤ ${SPEC.massLimit} kg</th></tr></thead><tbody>${rows}</tbody></table><p class="note">“n/a”: the gauge was not at the machine mount (or the load was off), so this reading cannot judge that limit.</p>` : '<p class="note">No readings yet.</p>';
  const opts = S.runs.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
  for (const id of ['cmp-a', 'cmp-b']) { const v = $(id).value; $(id).innerHTML = `<option value="">—</option>${opts}`; $(id).value = v; }
  paintCompare();
}
function paintCompare() {
  const byName = n => { const r = runByName(n); return r ? nb.project().runs.find(x => x.id === r.runId) : null; };
  const a = byName($('cmp-a').value), b = byName($('cmp-b').value);
  if (!a || !b) { $('cmp').innerHTML = ''; return; }
  const c = P.compareRuns(a, b), rows = c.outputs.filter(o => typeof o.a === 'number').map(o => ({ ...o, rel: o.a ? (o.b - o.a) / Math.abs(o.a) : null }));
  const changed = [...new Set(c.changed.map(d => READING_LABELS[d.path] ?? d.path))];
  $('cmp').innerHTML = `<p class="note">Changed between the two: <b>${changed.length ? changed.join(', ') : 'nothing'}</b>${changed.length > 1 ? ' — more than one thing changed, so the effect of each is mixed together.' : ''}</p><table class="cmp"><thead><tr><th></th><th>A</th><th>B</th><th>Change</th></tr></thead><tbody>${rows.map(r => `<tr><th>${r.label}</th><td>${f(r.a, 3)} ${r.unit}</td><td>${f(r.b, 3)} ${r.unit}</td><td>${r.rel === null ? '' : `${r.rel >= 0 ? '+' : '−'}${f(Math.abs(r.rel * 100), 1)} %`}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- mission ----------
const opt = (group, value, text, pressed) => `<button type="button" data-${group}="${value}" aria-pressed="${pressed === value}">${text}</button>`;
const runSelect = (id, value, filter = () => true) => `<select id="${id}"><option value="">— choose a saved reading —</option>${S.runs.filter(filter).map(r => `<option value="${r.name}" ${r.name === value ? 'selected' : ''}>${r.name}</option>`).join('')}</select>`;
const limitsTable = mount => `<table class="cmp lim"><tbody><tr><th>Operating load</th><td>${SPEC.load} N at ${mount} mm from the left bolt</td></tr><tr><th>Alignment tolerance at the mount</th><td>deflection ≤ ${SPEC.tolerance} mm</td></tr><tr><th>Strength</th><td>bending stress ≤ yield ÷ ${SPEC.yieldFactor}</td></tr><tr><th>Mass</th><td>≤ ${SPEC.massLimit} kg</td></tr><tr><th>Mounting envelope</th><td>bolts ${SPEC.span} mm apart; section within ${SPEC.envelope.b} × ${SPEC.envelope.h} mm</td></tr></tbody></table>`;

function mission() {
  const el = $('mission'); let h = '';
  if (S.stage === 'investigate') {
    const loadedR = S.runs.some(r => r.loaded), unloadedR = S.runs.some(r => !r.loaded && S.runs.some(q => q.loaded && S.runs.indexOf(q) < S.runs.indexOf(r)));
    h += `<div class="mhead"><span>1 · Investigate</span></div><span class="unit">Strength of materials · bending, stiffness and strength</span>
      <h2>The machine goes out of alignment under load</h2><p>The support springs back when the machine is switched off, and inspection found no yielding. Before anyone orders a thicker part, find out what is actually wrong. Current support: <b>${designLabel(ORIGINAL)}</b>.</p>${limitsTable(SPEC.guidedMount)}
      <p>Use the <b>Test stand</b>: apply the operating load, choose where the dial gauge and strain gauge go, and take readings. Then remove the load and read again.</p>
      <ul class="check"><li class="${loadedR ? 'done' : ''}">A reading under load</li><li class="${unloadedR ? 'done' : ''}">A reading after removing the load</li></ul>`;
    if (loadedR && unloadedR) {
      const D = S.diag;
      h += `<p class="step">Diagnosis</p><p>From your own readings, what is wrong with the support?</p><div class="opts">${opt('diag', 'flexible', 'Too flexible: it bends elastically beyond the alignment tolerance, far from yield', D.answer)}${opt('diag', 'yield', 'About to yield: the stress is close to the yield strength', D.answer)}${opt('diag', 'both', 'Both: too flexible and close to yield', D.answer)}</div>
        <p>Which saved reading shows the deflection that matters?</p>${runSelect('ev-defl', D.defl)}
        <p>Which saved reading shows how hard the metal is working?</p>${runSelect('ev-stress', D.stress)}
        <div class="row"><button type="button" class="primary" id="diag-go" ${D.answer && D.defl && D.stress ? '' : 'disabled'}>Check my diagnosis</button></div>`;
      if (D.feedback) h += D.feedback;
    }
  } else if (S.stage === 'redesign') {
    const tried = S.runs.filter(r => r.loaded && !sameDesign(r, ORIGINAL));
    h += `<div class="mhead"><span>2 · Redesign</span></div><h2>Make it stiff enough — within the limits</h2>${limitsTable(SPEC.guidedMount)}
      <p>Change the material and the section in <b>Design</b>; the bolt positions and envelope are fixed. Test each idea on the <b>Test stand</b> with the gauges where they can judge the limits, then use <b>Runs</b> to compare two readings and see what one change did.</p>
      <p class="note">Designs tried under load so far: ${new Set(tried.map(r => designKey(r.design))).size}.</p>
      <div class="row"><button type="button" class="primary" id="to-defend" ${tried.length ? '' : 'disabled'}>I have a design to defend</button></div>`;
  } else if (S.stage === 'defend') h += defendHTML();
  else if (S.stage === 'transfer' || S.stage === 'finished') h += transferHTML();
  el.innerHTML = h; wireMission();
}

function diagnose() {
  const D = S.diag, rd = runByName(D.defl), rs = runByName(D.stress);
  D.attempts++;
  const items = [];
  const ansOk = D.answer === 'flexible';
  const deflOk = deflEvidence(rd, ORIGINAL, SPEC.guidedMount);
  const stressOk = stressEvidence(rs, ORIGINAL, SPEC.guidedMount);
  items.push([ansOk, ansOk ? 'Diagnosis: too flexible.' : 'Diagnosis not supported by the readings.']);
  items.push([deflOk, deflOk ? `Deflection evidence: ${f(rd.deflection, 3)} mm at the mount under load — ${f(rd.deflection / SPEC.tolerance, 1)} × the ${SPEC.tolerance} mm tolerance.` : 'Deflection evidence: this reading cannot show the misalignment.']);
  items.push([stressOk, stressOk ? `Stress evidence: ${f(rs.strain, 0)} µε → σ = E·ε = ${f(rs.stress, 1)} MPa at the peak (under the mount), ${f(rs.stress / MATERIALS.aluminium.yield * 100, 0)} % of the ${MATERIALS.aluminium.yield} MPa yield strength.` : 'Stress evidence: this reading does not show the peak stress under load.']);
  const all = items.every(i => i[0]);
  let fb = items.map(([ok, t]) => `<p class="fb ${ok ? 'ok' : 'no'}">${t}</p>`).join('');
  if (!all) {
    // hints only after a meaningful attempt, and only for what was missed
    const hints = [];
    if (!deflOk) hints.push(rd && !rd.loaded ? 'That reading was taken with the load off.' : rd && rd.dialX !== SPEC.guidedMount ? `Alignment is judged at the machine mount (${SPEC.guidedMount} mm), and your dial was at ${rd.dialX} mm.` : 'Take a loaded reading with the dial gauge at the machine mount.');
    if (!stressOk) hints.push(rs && !rs.loaded ? 'That strain reading was taken with the load off.' : rs && rs.strainX !== SPEC.guidedMount ? `For a single point load the bending moment peaks under the load (${SPEC.guidedMount} mm); your strain gauge was at ${rs.strainX} mm.` : 'Put the strain gauge where the bending moment is largest, under load.');
    if (!ansOk) hints.push('Compare your deflection with the tolerance, and your stress (E × strain) with the yield strength — separately.');
    fb += `<p class="step">Hints</p><ul class="rubric">${hints.map(x => `<li>${x}</li>`).join('')}</ul>`;
  } else {
    D.passed = true; J.giveFeedback('diagnose');
    fb += `<p><b>It didn’t break, but it still failed.</b> Yield strength decides when metal stops springing back; it plays no part in how far it bends before that. Deflection is set by stiffness, E·I — the material’s elastic modulus times the section’s second moment of area. Your support is working at only a fraction of its strength while bending ${f(rd.deflection / SPEC.tolerance, 1)} × too far. A stronger alloy with the same E would bend exactly as much.</p>
      <div class="row"><button type="button" class="primary" id="to-redesign">Start the redesign</button></div>`;
  }
  D.feedback = fb; document.body.dataset.diagnosis = all ? 'passed' : `attempt-${D.attempts}`;
  mission();
}

function defendHTML() {
  const F = S.defend, designs = S.runs.filter(r => r.loaded && !sameDesign(r, ORIGINAL) && r.mount === SPEC.guidedMount);
  let h = `<div class="mhead"><span>3 · Defend the design</span></div><h2>Show it works, with your own readings</h2>
    <p>Choose the reading of the design you are submitting, then the readings that prove each limit.</p>
    <p>Design you submit (a loaded reading):</p>${runSelect('df-run', F.run, r => designs.includes(r))}
    <p>Reading that proves alignment:</p>${runSelect('df-align', F.align)}
    <p>Reading that proves it is strong enough:</p>${runSelect('df-yield', F.yield)}
    <p>Why did your change work?</p><div class="opts">${opt('why', 'EI', 'It raised the stiffness E·I, and deflection is proportional to 1/(E·I)', F.why)}${opt('why', 'yield', 'It raised the yield strength, so it bends less', F.why)}${opt('why', 'mass', 'It made the support heavier, and heavier parts bend less', F.why)}</div>
    <p>Name one thing this model does <i>not</i> include that could matter for the real mount:</p><div class="opts">${[...Object.entries(NOT_MODELLED), ...Object.entries(MODELLED)].sort((a, b) => a[1].localeCompare(b[1])).map(([k, t]) => opt('limit', k, t, F.limit)).join('')}</div>
    <p>In your own words (for your reviewer): what failed, what you changed, why it worked, and where you would not trust this model.</p>
    <textarea id="df-text" aria-label="Your explanation" maxlength="1200">${F.text}</textarea>
    <div class="row"><button type="button" class="primary" id="df-go" ${F.run && F.align && F.yield && F.why && F.limit && F.text.trim().length >= 40 ? '' : 'disabled'}>Submit my defence</button></div>`;
  if (F.result) h += F.result;
  return h;
}
function scoreDefence() {
  const F = S.defend, r = runByName(F.run), d = r.design, v = verdict(d, SPEC.guidedMount), ra = runByName(F.align), ry = runByName(F.yield);
  const alignEv = deflEvidence(ra, d, SPEC.guidedMount) && ra.deflection <= SPEC.tolerance, yieldEv = stressEvidence(ry, d, SPEC.guidedMount) && ry.stress <= ALLOW(d.material);
  const chk = checkAnswers({ why: F.why, limit: NOT_MODELLED[F.limit] ? 'not-modelled' : 'modelled' }, { why: { expected: 'EI', explain: 'Deflection ∝ 1/(E·I): material (E) and section (I) set stiffness; yield strength does not.' }, limit: { expected: 'not-modelled', explain: NOT_MODELLED[F.limit] ? `${NOT_MODELLED[F.limit]} is outside the model.` : `${MODELLED[F.limit]} is inside the model — choose something it leaves out.` } });
  const crit = [
    [v.alignment, `Alignment: ${f(v.deflection, 3)} mm at the mount (≤ ${SPEC.tolerance} mm)`],
    [v.yield, `Strength: ${f(v.maxStress, 1)} MPa (≤ ${f(v.allowable, 0)} MPa)`],
    [v.mass, `Mass: ${f(v.mass_kg, 2)} kg (≤ ${SPEC.massLimit} kg)`],
    [alignEv, alignEv ? `Alignment evidence: ${ra.name} — ${f(ra.deflection, 3)} mm with the dial at the mount, under load, on this design.` : 'Alignment evidence: the cited reading must be this design, under load, dial at the mount, within tolerance.'],
    [yieldEv, yieldEv ? `Strength evidence: ${ry.name} — ${f(ry.stress, 1)} MPa from strain at the peak-moment point.` : 'Strength evidence: the cited reading must be this design, under load, strain gauge at the mount (peak moment), within the stress limit.'],
    ...chk.items.map(i => [i.ok, `${i.id === 'why' ? 'Why it worked' : 'Model limit'}: ${i.explain}`]),
  ];
  const score = crit.filter(c => c[0]).length;
  J.giveFeedback('defend');
  F.result = `<p class="step">Scored criteria: ${score} / ${crit.length}</p>${crit.map(([ok, t]) => `<p class="fb ${ok ? 'ok' : 'no'}">${t}</p>`).join('')}
    <p class="step">Your explanation — for review, not auto-scored</p><blockquote class="fb">${F.text.replace(/</g, '&lt;')}</blockquote>
    <p class="note">Reviewer rubric:</p><ul class="rubric"><li>Cites specific readings with values and units (e.g. a dial reading at the mount, a strain → stress).</li><li>Separates stiffness (E·I, deflection) from strength (yield, stress) and says which one failed.</li><li>Explains the change through E or I — not through strength or weight.</li><li>Names a real limit of the model and when it would matter (e.g. bolt slip under vibration; stress concentration at holes; fatigue over many cycles).</li></ul>
    <div class="row"><button type="button" class="primary" id="to-transfer">Next: a new case without hints</button></div>`;
  document.body.dataset.defend = `${score}/${crit.length}`;
  mission();
}

function transferHTML() {
  const T = S.transfer, m = SPEC.transferMount;
  let h = `<div class="mhead"><span>4 · New case — no hints</span><span>attempt ${T.attempt}</span></div><h2>The machine moves to mid-span</h2>${limitsTable(m)}
    <p>Same load, same limits, but the machine is now mounted at <b>${m} mm</b>. Choose a design (any — your own, or a new one), predict, and lock both before you test.</p>`;
  if (!T.locked) {
    h += `<p>Current design: <b>${designLabel(S.design)}</b>${check(S.design).ok ? '' : ' — not allowed'}.</p><p>Prediction — alignment at the new mount:</p><div class="opts">${opt('pa', 'meets', 'Within tolerance', T.predA)}${opt('pa', 'fails', 'Outside tolerance', T.predA)}</div>
      <p>Prediction — strength:</p><div class="opts">${opt('py', 'meets', 'Within the stress limit', T.predY)}${opt('py', 'fails', 'Over the stress limit', T.predY)}</div>
      <div class="row"><button type="button" class="primary" id="tr-lock" ${T.predA && T.predY && check(S.design).ok ? '' : 'disabled'}>Lock prediction and design</button></div>`;
    return h + T.history.join('');
  }
  const d = T.lockedDesign, dr = attemptRuns().find(r => deflEvidence(r, d, m)), sr = attemptRuns().find(r => stressEvidence(r, d, m));
  h += `<p>Locked: <b>${designLabel(d)}</b>. Now check <b>both</b> limits on the test stand. Only readings taken after this lock count.</p><ul class="check"><li class="${dr ? 'done' : ''}">Deflection read where alignment is judged, under load</li><li class="${sr ? 'done' : ''}">Strain read where the stress peaks, under load</li></ul>`;
  if (dr && sr && !T.result) {
    h += `<p>From your readings — alignment:</p><div class="opts">${opt('va', 'meets', `Within tolerance (${f(dr.deflection, 3)} mm)`, T.verdictA)}${opt('va', 'fails', `Outside tolerance (${f(dr.deflection, 3)} mm)`, T.verdictA)}</div>
      <p>From your readings — strength:</p><div class="opts">${opt('vy', 'meets', `Within the stress limit (${f(sr.stress, 1)} MPa)`, T.verdictY)}${opt('vy', 'fails', `Over the stress limit (${f(sr.stress, 1)} MPa)`, T.verdictY)}</div>
      <div class="row"><button type="button" class="primary" id="tr-go" ${T.verdictA && T.verdictY ? '' : 'disabled'}>Submit</button></div>`;
  }
  if (T.result) h += T.result;
  return h + T.history.join('');
}
function scoreTransfer() {
  const T = S.transfer, m = SPEC.transferMount, d = T.lockedDesign, v = verdict(d, m);
  const dr = attemptRuns().find(r => deflEvidence(r, d, m)), sr = attemptRuns().find(r => stressEvidence(r, d, m));
  if (!dr || !sr) return;   // only readings taken after this attempt's lock are accepted
  const pa = J.score(`transfer${T.attempt}:alignment`, v.alignment ? 'meets' : 'fails'), py = J.score(`transfer${T.attempt}:yield`, v.yield ? 'meets' : 'fails');
  const readA = (dr.deflection <= SPEC.tolerance ? 'meets' : 'fails') === T.verdictA, readY = (sr.stress <= ALLOW(d.material) ? 'meets' : 'fails') === T.verdictY;
  const passed = v.all && readA && readY;
  const rows = [
    [pa.correct, `Your prediction for alignment (${pa.predicted}) — ${pa.correct ? 'right' : 'not what happened'}: ${f(v.deflection, 3)} mm at ${m} mm.`],
    [py.correct, `Your prediction for strength (${py.predicted}) — ${py.correct ? 'right' : 'not what happened'}: ${f(v.maxStress, 1)} MPa (limit ${f(v.allowable, 0)}).`],
    [readA && readY, readA && readY ? 'You read both of your own measurements correctly.' : 'One of your verdicts does not match your own reading.'],
    [v.mass, `Mass ${f(v.mass_kg, 2)} kg (limit ${SPEC.massLimit} kg).`],
  ];
  T.result = rows.map(([ok, t]) => `<p class="fb ${ok ? 'ok' : 'no'}">${t}</p>`).join('') + (passed
    ? `<p class="result right">Passed${T.attempt > 1 ? ` on design ${T.attempt}` : ''}: your locked design meets alignment, strength and mass with the load at mid-span, and your verdicts follow your own readings.</p>`
    : `<p class="result wrong">Not passed: ${!v.all ? 'the locked design does not meet every limit with the load at mid-span' : 'your verdicts must follow your own readings'}. Moving the load toward mid-span raises both the bending moment and the deflection under it.</p><div class="row"><button type="button" id="tr-retry">Redesign and lock again</button></div>`);
  if (passed) { S.stage = 'finished'; J.giveFeedback('transfer'); }
  document.body.dataset.transfer = passed ? 'passed' : `not-passed-${T.attempt}`;
  mission(); paintDesign();
}

function wireMission() {
  const on = (sel, fn) => $('mission').querySelectorAll(sel).forEach(b => b.onclick = () => fn(b));   // scoped: body data-* attributes must never match
  on('[data-diag]', b => { S.diag.answer = b.dataset.diag; mission(); });
  // dropdowns update state and the submit button only — no re-render, so nothing shifts under the learner's finger
  const diagReady = () => { const D = S.diag, g = $('diag-go'); if (g) g.disabled = !(D.answer && D.defl && D.stress); };
  const sd = $('ev-defl'); if (sd) sd.onchange = () => { S.diag.defl = sd.value; diagReady(); };
  const ss = $('ev-stress'); if (ss) ss.onchange = () => { S.diag.stress = ss.value; diagReady(); };
  const dg = $('diag-go'); if (dg) dg.onclick = diagnose;
  const tr = $('to-redesign'); if (tr) tr.onclick = () => { S.stage = 'redesign'; paintDesign(); mission(); WB.open('design'); document.body.dataset.stage = 'redesign'; };
  const td = $('to-defend'); if (td) td.onclick = () => { S.stage = 'defend'; mission(); document.body.dataset.stage = 'defend'; };
  const dfReady = () => { const F = S.defend, g = $('df-go'); if (g) g.disabled = !(F.run && F.align && F.yield && F.why && F.limit && F.text.trim().length >= 40); };
  for (const [id, key] of [['df-run', 'run'], ['df-align', 'align'], ['df-yield', 'yield']]) { const e = $(id); if (e) e.onchange = () => { S.defend[key] = e.value; dfReady(); }; }
  on('[data-why]', b => { S.defend.why = b.dataset.why; mission(); });
  on('[data-limit]', b => { S.defend.limit = b.dataset.limit; mission(); });
  const tx = $('df-text'); if (tx) tx.oninput = () => { S.defend.text = tx.value; const g = $('df-go'); const F = S.defend; g.disabled = !(F.run && F.align && F.yield && F.why && F.limit && F.text.trim().length >= 40); };
  const dgo = $('df-go'); if (dgo) dgo.onclick = scoreDefence;
  const tt = $('to-transfer'); if (tt) tt.onclick = () => { if (!J.canAdvance('defend')) return; S.stage = 'transfer'; S.mount = SPEC.transferMount; S.loaded = false; refresh(); document.body.dataset.stage = 'transfer'; };
  on('[data-pa]', b => { S.transfer.predA = b.dataset.pa; mission(); });
  on('[data-py]', b => { S.transfer.predY = b.dataset.py; mission(); });
  const lk = $('tr-lock'); if (lk) lk.onclick = () => {
    const T = S.transfer;
    J.predict(`transfer${T.attempt}:alignment`, T.predA); J.predict(`transfer${T.attempt}:yield`, T.predY);
    J.lock(`transfer${T.attempt}:alignment`); J.lock(`transfer${T.attempt}:yield`);
    T.locked = true; T.lockedDesign = clone(S.design); refresh();
  };
  on('[data-va]', b => { S.transfer.verdictA = b.dataset.va; mission(); });
  on('[data-vy]', b => { S.transfer.verdictY = b.dataset.vy; mission(); });
  const tg = $('tr-go'); if (tg) tg.onclick = scoreTransfer;
  const rt = $('tr-retry'); if (rt) rt.onclick = () => { const T = S.transfer; T.history.push(`<p class="step">Attempt ${T.attempt}: ${designLabel(T.lockedDesign)}</p>${T.result.replace(/<div class="row">[\s\S]*$/, '')}`); Object.assign(T, { attempt: T.attempt + 1, predA: null, predY: null, locked: false, verdictA: null, verdictY: null, result: null }); S.loaded = false; refresh(); };
}

function refresh() { paintStand(); draw(); paintDesign(); paintRuns(); mission(); }
// Experiments panel: the bench as it stands now. The load is only recorded as on when the stand allows it, and the
// mount position stays with the mission stage, so the record cannot be used to get round the unseen case's lock.
const nb = notebook($('experiments'), { adapter: READING_ADAPTER,
  getSetup: () => ({ design: clone(S.design), mount: S.mount, loaded: S.loaded && !standLocked(), dialX: S.dialX, strainX: S.strainX }),
  applySetup: s => { S.design = clone(s.design); S.dialX = s.dialX; S.strainX = s.strainX; S.loaded = false; refresh(); } });
// ---------- test stand wiring ----------
$('dial-x').innerHTML = GAUGE_POSITIONS.map(x => `<option value="${x}">${x} mm</option>`).join('');
$('strain-x').innerHTML = $('dial-x').innerHTML;
$('dial-x').value = S.dialX; $('strain-x').value = S.strainX;
$('dial-x').onchange = e => { S.dialX = +e.target.value; draw(); };
$('strain-x').onchange = e => { S.strainX = +e.target.value; draw(); };
$('load-on').onclick = () => { if (standLocked()) return; S.loaded = true; draw(); };
$('load-off').onclick = () => { S.loaded = false; draw(); };
$('take').onclick = takeReading;
$('cmp-a').onchange = paintCompare; $('cmp-b').onchange = paintCompare;
refresh();
nb.render();
window.__mount = { protocol: () => J, runs: () => nb.project().runs };
document.body.dataset.ready = 'true'; document.body.dataset.stage = 'investigate';
