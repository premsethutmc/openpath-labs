import { SCENES, build, coeffs, sectionMean, profile, venturiThroatX } from '../engines/fluids/scenes.mjs';
import { MISSIONS, COURSE } from './missions.mjs';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = innerWidth < 640;
const REAL = {
  cylinder: { L: 0.05, what: 'a 5 cm pole', everyday: 10, medium: 'air' }, wing: { L: 1, what: 'a 1 m wing', everyday: 50, medium: 'air' },
  plate: { L: 0.3, what: 'a 30 cm sign', everyday: 10, medium: 'air' }, square: { L: 0.1, what: 'a 10 cm square post', everyday: 10, medium: 'air' },
  car: { L: 4, what: 'a 4 m car', everyday: 25, medium: 'air' }, venturi: { L: 0.05, what: 'a 5 cm water pipe', everyday: 1, medium: 'water' },
  pipe: { L: 0.02, what: 'a 2 cm water pipe', everyday: 1, medium: 'water' }, custom: { L: 0.1, what: 'your 10 cm shape', everyday: 10, medium: 'air' },
};
const NU = { air: 1.5e-5, water: 1.0e-6 };
const S = { scene: 'cylinder', Re: 100, aoa: 6, view: 'speed', tool: 'none', paused: false, mode: 'learn' };
let T = null, L = 1, U = 0.08, limited = false, hist = [], stepsPerFrame = 4, img = null;
const fieldC = $('field'), smokeC = $('smoke'), fctx = fieldC.getContext('2d'), sctx = smokeC.getContext('2d');

// ---------- Reynolds slider (log scale) ----------
const RE_MIN = 5, RE_MAX = 300;
const reFromSlider = v => Math.round(RE_MIN * (RE_MAX / RE_MIN) ** (v / 100));
const sliderFromRe = re => Math.round(100 * Math.log(re / RE_MIN) / Math.log(RE_MAX / RE_MIN));

function setup() {
  const sceneId = S.scene === 'custom' ? 'cylinder' : S.scene;
  const b = build(sceneId, S.Re, { ny: phone ? 64 : 96, maxNy: phone ? 84 : 130, u: 0.08, aoa: S.aoa });
  T = b.t; L = b.L; U = b.u; limited = b.limited;
  if (S.scene === 'custom') { T.clearBodies(); L = T.ny * 0.2; }
  fieldC.width = T.nx; fieldC.height = T.ny; smokeC.width = T.nx * 3; smokeC.height = T.ny * 3;
  img = fctx.createImageData(T.nx, T.ny);
  $('re').value = sliderFromRe(S.Re);
  hist = []; seedSmoke(); paintPanels();
}

// ---------- smoke particles (streaklines) ----------
let P = null;
function seedSmoke() {
  const n = phone ? 500 : 900; P = { x: new Float32Array(n), y: new Float32Array(n), n };
  for (let i = 0; i < n; i++) respawn(i, Math.random() * T.nx * 0.95);
}
function respawn(i, x = 1) { const lines = 14, l = i % lines; P.x[i] = x; P.y[i] = 1 + (T.ny - 2) * (l + 0.5) / lines + (Math.random() - 0.5) * 0.6; }
function advect(steps) {
  const { nx, ny, ux, uy, solid } = T;
  for (let i = 0; i < P.n; i++) {
    const x = P.x[i], y = P.y[i], xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= nx - 1 || yi >= ny - 1) { respawn(i); continue; }
    const k = yi * nx + xi; if (solid[k]) { respawn(i); continue; }
    const fx = x - xi, fy = y - yi;
    const bil = a => a[k] * (1 - fx) * (1 - fy) + a[k + 1] * fx * (1 - fy) + a[k + nx] * (1 - fx) * fy + a[k + nx + 1] * fx * fy;
    P.x[i] += bil(ux) * steps; P.y[i] += bil(uy) * steps;
    if (P.y[i] < 0) P.y[i] += ny - 1; if (P.y[i] > ny - 1) P.y[i] -= ny - 1;
  }
}

// ---------- drawing the field ----------
const STOPS = [[0, [11, 26, 46]], [0.3, [31, 95, 139]], [0.55, [63, 183, 198]], [0.78, [236, 244, 232]], [1, [242, 165, 65]]];
const turbo = t => {   // navy → teal → near-white → amber
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (t - a) / (b - a); return ca.map((v, k) => Math.round(v + (cb[k] - v) * f)); }
  return STOPS.at(-1)[1];
};
const diverge = v => { v = Math.max(-1, Math.min(1, v)); return v >= 0 ? [255, Math.round(255 * (1 - v * 0.85)), Math.round(255 * (1 - v))] : [Math.round(255 * (1 + v)), Math.round(255 * (1 + v * 0.6)), 255]; };
function drawField() {
  const { nx, ny, ux, uy, rho, solid } = T, d = img.data, view = S.view;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const k = y * nx + x, o = 4 * ((ny - 1 - y) * nx + x);
    let c;
    if (solid[k] === 2) c = [44, 50, 58]; else if (solid[k] === 1) c = [86, 96, 108];
    else if (view === 'speed') c = turbo(Math.hypot(ux[k], uy[k]) / (2 * U));
    else if (view === 'swirl') c = diverge(T.vorticity(x, y) / (U / L) / 2.5);
    else if (view === 'pressure') c = diverge((rho[k] - 1) / 3 / (0.5 * U * U) / 1.2);
    else { const s = Math.hypot(ux[k], uy[k]) / U; c = [10 + 14 * s, 24 + 18 * s, 40 + 22 * s]; }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  fctx.putImageData(img, 0, 0);
  // smoke: trails in Smoke view, light dots otherwise
  const sx = smokeC.width / nx, sy = smokeC.height / ny;
  if (S.view === 'smoke') { sctx.fillStyle = 'rgba(10,24,40,0.12)'; sctx.globalCompositeOperation = 'destination-out'; sctx.fillRect(0, 0, smokeC.width, smokeC.height); sctx.globalCompositeOperation = 'source-over'; sctx.fillStyle = 'rgba(235,245,255,0.85)'; }
  else { sctx.clearRect(0, 0, smokeC.width, smokeC.height); sctx.fillStyle = 'rgba(255,255,255,0.55)'; }
  for (let i = 0; i < P.n; i++) sctx.fillRect(P.x[i] * sx, (ny - 1 - P.y[i]) * sy, S.view === 'smoke' ? 2.2 : 1.6, S.view === 'smoke' ? 2.2 : 1.6);
}

// ---------- readouts ----------
const fmt = (n, d = 2) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(d));
function readouts() {
  const c = coeffs(T, L, U);
  hist.push({ t: T.t, cd: c.cd, cl: c.cl }); if (hist.length > 600) hist.shift();
  const recent = hist.slice(-Math.min(hist.length, 300));
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const cd = mean(recent.map(h => h.cd)), cl = mean(recent.map(h => h.cl));
  const amp = (Math.max(...recent.map(h => h.cl)) - Math.min(...recent.map(h => h.cl))) / 2;
  const isBody = SCENES[S.scene]?.body || S.scene === 'custom';
  $('g-re').textContent = `${Math.round(T.u0 * L / T.nu)}${limited ? ' (max)' : ''}`;
  $('g-cd').textContent = isBody ? fmt(cd) : '—'; $('g-cl').textContent = isBody ? fmt(cl) : '—';
  let reg = 'Steady', x = '—', xl = 'Vortex shedding';
  if (isBody && hist.length > 150 && amp > 0.08) {
    reg = 'Vortex shedding';
    const ups = []; let armed = false; for (const h of hist) { if (h.cl < cl - amp / 2) armed = true; else if (armed && h.cl > cl + amp / 2) { ups.push(h.t); armed = false; } }
    if (ups.length >= 3) { const per = (ups.at(-1) - ups[0]) / (ups.length - 1); x = `St ${(L / (per * U)).toFixed(2)}`; }
  }
  if (S.scene === 'venturi') { xl = 'Throat ÷ inlet speed'; x = (sectionMean(T, venturiThroatX(T.nx)) / sectionMean(T, Math.round(T.nx * 0.12))).toFixed(2); reg = 'Pipe flow'; }
  if (S.scene === 'pipe') { const p = profile(T, Math.round(T.nx * 0.7)); xl = 'Centre ÷ mean speed'; x = (Math.max(...p) / mean(p)).toFixed(2); reg = 'Laminar pipe flow'; }
  $('g-x-label').textContent = xl; $('g-x').textContent = x;
  $('regime').textContent = T.t < 400 ? 'Starting…' : reg; $('regime').className = 'state ' + (reg === 'Vortex shedding' ? 'shedding' : 'steady');
  // lift trace
  if (isBody && hist.length > 2) {
    const W = 340, H = 90, lo = Math.min(-0.2, ...hist.map(h => h.cl)), hi = Math.max(0.2, ...hist.map(h => h.cl));
    const pts = hist.map((h, i) => `${(i / (hist.length - 1) * (W - 10) + 5).toFixed(1)},${(H - 8 - (h.cl - lo) / (hi - lo) * (H - 20)).toFixed(1)}`).join(' ');
    $('trace').innerHTML = `<title id="trace-t">Lift coefficient over time: ${reg.toLowerCase()}</title><text x="6" y="11" class="tick">sideways force (lift) over time</text><polyline points="${pts}" fill="none" stroke="#1d58c8" stroke-width="1.6"/>`;
  }
  document.body.dataset.regime = reg; document.body.dataset.steps = String(T.t);
}

function paintPanels() {
  $('scenes').innerHTML = [...Object.entries(SCENES), ['custom', { name: 'Draw your own' }]].map(([k, v]) => `<button type="button" role="radio" data-scene="${k}" aria-checked="${S.scene === k}">${v.name}</button>`).join('');
  $('scenes').querySelectorAll('button').forEach(b => b.onclick = () => setScene(b.dataset.scene));
  $('aoa-box').hidden = S.scene !== 'wing'; $('aoa-out').textContent = `${S.aoa}°`;
  $('re-out').textContent = `${S.Re}${limited ? ` → ${Math.round(T.u0 * L / T.nu)} (grid limit)` : ''}`;
  const r = REAL[S.scene] || REAL.custom, Re = T.u0 * L / T.nu;
  const vA = Re * NU.air / r.L, vW = Re * NU.water / r.L, everydayRe = r.everyday * r.L / NU[r.medium];
  const unit = v => (v < 0.01 ? `${(v * 1000).toFixed(2)} mm/s` : v < 1 ? `${(v * 100).toFixed(1)} cm/s` : `${v.toFixed(1)} m/s`);
  $('re-note').textContent = `Same flow pattern as ${r.what} in air at ${unit(vA)}, or in water at ${unit(vW)}. In everyday use (${r.everyday} m/s in ${r.medium}) its Reynolds number is about ${everydayRe.toExponential(1).replace('e+', ' × 10^')} — turbulent, three-dimensional flow this 2D tunnel cannot show exactly.`;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === S.view)));
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === S.tool)));
  $('legend').textContent = { speed: 'Colour: speed (dark = slow, bright = fast)', swirl: 'Colour: swirl — red anticlockwise, blue clockwise', pressure: 'Colour: pressure — red high, blue low', smoke: 'Smoke streaks released at the left' }[S.view];
  $('pause').textContent = S.paused ? 'Play' : 'Pause';
}

function setScene(id, Re) { S.scene = id; if (Re) { S.Re = Re; $('re').value = sliderFromRe(Re); } S.tool = id === 'custom' ? 'draw' : 'none'; setup(); }
function setRe(Re) { S.Re = Re; $('re').value = sliderFromRe(Re); setup(); }

// ---------- interaction ----------
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; sctx.clearRect(0, 0, smokeC.width, smokeC.height); paintPanels(); });
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { S.tool = b.dataset.tool; paintPanels(); });
$('re').oninput = e => { S.Re = reFromSlider(+e.target.value); $('re-out').textContent = S.Re; };
$('re').onchange = () => setup();
$('aoa').oninput = e => { S.aoa = +e.target.value; $('aoa-out').textContent = `${S.aoa}°`; };
$('aoa').onchange = () => setup();
$('pause').onclick = () => { S.paused = !S.paused; paintPanels(); };
$('restart').onclick = () => setup();
let painting = false;
const paintAt = e => {
  const r = fieldC.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * T.nx, y = T.ny - 1 - (e.clientY - r.top) / r.height * T.ny;
  const rad = Math.max(1.5, T.ny * 0.025);
  T.paint((px, py) => (px - x) ** 2 + (py - y) ** 2 <= rad * rad, S.tool === 'draw' ? 2 : 0);
};
fieldC.addEventListener('pointerdown', e => { if (S.tool === 'none') return; painting = true; fieldC.setPointerCapture(e.pointerId); paintAt(e); });
fieldC.addEventListener('pointermove', e => { if (painting) paintAt(e); });
fieldC.addEventListener('pointerup', () => { painting = false; });

// ---------- missions ----------
let worker = null, reqId = 0; const pending = new Map();
function runProbe(runs) {
  worker ||= new Worker(new URL('./probe-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { pending.get(data.id)?.(data.results); pending.delete(data.id); };
  return new Promise(res => { const id = ++reqId; pending.set(id, res); worker.postMessage({ id, runs }); });
}
const M = { i: 0, guess: null, answer: null, measured: '', busy: false };
function startMission(i) {
  M.i = Math.max(0, Math.min(MISSIONS.length - 1, i)); M.guess = null; M.answer = null; M.busy = false;
  const m = MISSIONS[M.i]; S.view = m.view; S.aoa = 6; setScene(...m.scene);
  try { localStorage.setItem('fluids.mission', String(M.i)); } catch {}
  paintMission();
}
function paintMission() {
  document.body.dataset.mode = S.mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
  $('c-object').classList.toggle('learn-hidden', S.mode === 'learn' && M.answer === null);
  if (S.mode !== 'learn') return;
  const m = MISSIONS[M.i], el = $('mission');
  let h = `<div class="mhead"><span>Mission ${M.i + 1} of ${MISSIONS.length}</span><div class="dots">${MISSIONS.map((_, k) => `<i class="${k <= M.i ? 'on' : ''}"></i>`).join('')}</div></div>
    <span class="unit">${COURSE} · ${m.unit}</span><h2>${m.title}</h2><p>${m.intro}</p>`;
  if (M.answer === null) {
    h += `<p class="think">Pause and think</p><p>${m.q}</p><div class="row">${m.options.map(o => `<button type="button" class="guess" data-g="${o}" ${M.busy ? 'disabled' : ''}>${o}</button>`).join('')}</div>`;
    if (M.busy) h += `<p class="note" role="status">Running the experiment…</p>`;
  } else {
    const right = M.guess === M.answer;
    h += `<p class="result ${right ? 'right' : 'wrong'}">${right ? 'Right' : 'Not quite'} — the experiment says: ${M.answer}.</p><p class="measured">${M.measured}</p><p>${m.explain}</p><p class="task">Now try it: ${m.task}</p>
      <div class="row">${M.i > 0 ? '<button type="button" id="m-prev">Back</button>' : ''}${M.i < MISSIONS.length - 1 ? '<button type="button" class="primary" id="m-next">Next mission</button>' : '<button type="button" class="primary" id="m-explore">Explore freely</button>'}</div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => {
    M.guess = b.dataset.g; M.busy = true; paintMission();
    let result = null;
    if (m.probe) { const runs = Array.isArray(m.probe[0]) ? m.probe : [m.probe]; const res = await runProbe(runs); result = Array.isArray(m.probe[0]) ? res : res[0]; }
    M.answer = m.answer(result); M.measured = m.measured(result); M.busy = false;
    m.after?.({ setRe, setScene });
    paintMission();
  });
  const nx = $('m-next'); if (nx) nx.onclick = () => startMission(M.i + 1);
  const pv = $('m-prev'); if (pv) pv.onclick = () => startMission(M.i - 1);
  const ex = $('m-explore'); if (ex) ex.onclick = () => setMode('explore');
}
function setMode(m) { S.mode = m; try { localStorage.setItem('fluids.mode', m); } catch {} paintMission(); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  if (!S.paused && T) {
    const t0 = performance.now();
    T.step(stepsPerFrame);
    const dt = performance.now() - t0;
    stepsPerFrame = Math.max(1, Math.min(40, Math.round(stepsPerFrame * (dt > 14 ? 0.85 : 1.1) + (dt > 14 ? 0 : 0.5))));
    if (!T.healthy()) { setup(); $('regime').textContent = 'Reset (flow became unstable)'; }
    advect(stepsPerFrame);
    readouts();
  }
  if (T) drawField();
  last = now;
  requestAnimationFrame(frame);
}
try { S.mode = localStorage.getItem('fluids.mode') || 'learn'; } catch {}
setup();
if (S.mode === 'learn') { let i = 0; try { i = +(localStorage.getItem('fluids.mission') || 0); } catch {} startMission(i); } else paintMission();
requestAnimationFrame(frame);
window.__tunnel = { get T() { return T; }, S };
document.body.dataset.ready = 'true';
