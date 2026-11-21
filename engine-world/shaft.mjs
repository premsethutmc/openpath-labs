// "From cylinder work to shaft power" — a controlled experiment on Engine World's 1D test bench.
// Every number shown comes from converged runs of the bench (cylinder 1's own p and V); the 3D cutaway is an
// idealised teaching view moved to the same crank angle. Runner lengths are always shown as the solver uses them.
import { BENCH_STOCK, BENCH_INPUTS, compare, solverRunner, setupForRunner, intakeEvidence, judge, CLEAR_BAR, LATE_FROM, airShift } from './bench-setup.mjs';
import { K12M, K12M_PUBLISHED } from '../engines/thermofluids/gasdyn.mjs';
import { piston } from '../engines/motion/crank.mjs';

const $ = id => document.getElementById(id);
const f = (n, d = 1) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(d));
const sgn = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x * 100).toFixed(1) + ' %';
const cm = L => `${Math.round(L * 100)} cm`;
const STROKE = a => (a < 180 ? 'Power (expansion)' : a < 360 ? 'Exhaust' : a < 540 ? 'Intake' : 'Compression');
const FIRST = [2500, 4500, 6000], UNSEEN = [2000, 3000, 3500, 4000, 5000, 5500, 6500, 7000];
const verdict = rel => (rel > 0.01 ? 'Up' : rel < -0.01 ? 'Down' : 'Within ±1 %');
const STOCK_L = solverRunner(BENCH_STOCK), GUIDED_L = 0.24;
const guided = () => document.body.dataset.mode === 'learn';

// pairs[k] = { rpm, A, B, prediction, kind: 'first' | 'repeat' | 'unseen' }
const X = { rpm: 4500, pairs: [], view: 0, angle: 0, playing: false, pv: 'linear', pth: 'full', busy: false, maxCycles: undefined,
  runnerL: GUIDED_L, prediction: null, nextRpm: null, why: null, unseenRpm: null, cite: {}, air: {} };
let worker = null, reqId = 0; const pending = new Map();
function bench(setup, rpm) {
  worker ||= new Worker(new URL('./bench-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { if (data.kind === 'shaft') { pending.get(data.label)?.(data.run); pending.delete(data.label); } };
  return new Promise(res => { const id = String(++reqId); pending.set(id, res); worker.postMessage({ kind: 'shaft', label: id, rpm, setup, maxCycles: X.maxCycles }); });
}
// Run A (stock) and/or Run B (runner changed) at one speed; Run B only after a valid Run A.
async function runPair(rpm, kind, prediction, { newA = true, withB = true } = {}) {
  X.busy = true; paint();
  let pair;
  if (newA) { pair = { rpm, kind, prediction, A: await bench(BENCH_STOCK, rpm) }; X.pairs.push(pair); } else pair = X.pairs[0];
  if (withB && pair.A.valid) { pair.B = await bench(setupForRunner(X.runnerL), rpm); pair.prediction = prediction; }
  X.view = X.pairs.indexOf(pair); X.busy = false; X.prediction = null; paint();
}

const viewed = () => X.pairs[X.view];
const events = r => { const v = r.valves; return [['IVO', v.ivo % 720, 'intake valve opens'], ['IVC', v.ivc % 720, 'intake valve closes'], ['EVO', v.evo % 720, 'exhaust valve opens'], ['EVC', v.evc % 720, 'exhaust valve closes']]; };
const at = (r, k) => r.trace[k][Math.min(719, Math.max(0, Math.floor(X.angle)))];

function readout() {
  const r = viewed()?.A?.valid ? viewed().A : null, el = $('x-read');
  if (!r) { el.innerHTML = ''; return; }
  const disp = piston(X.angle * Math.PI / 180, K12M.stroke / 2, K12M.rod).disp;
  const near = events(r).find(([, a]) => Math.abs(((X.angle - a + 360) % 720) - 360) < 1.5);
  const row = (k, v, cls = 'always') => `<li class="${cls}"><span>${k}</span> <b>${v}</b></li>`;   // 'key': always shown, also in Learn mode
  el.innerHTML = row('Crank angle (0° = firing TDC, cylinder 1)', `${X.angle.toFixed(0)}°`) + row('Stroke', STROKE(X.angle)) +
    row('Piston below top dead centre', `${(disp * 1000).toFixed(1)} mm`) + row(`Cylinder volume (Run A, ${r.rpm} rpm)`, `${(at(r, 'V') * 1e6).toFixed(1)} cm³`) +
    row('Cylinder pressure (Run A)', `${(at(r, 'p') / 1e5).toFixed(2)} bar`) +
    row('Intake / exhaust valve lift', `${(at(r, 'liftI') * 1000).toFixed(1)} / ${(at(r, 'liftE') * 1000).toFixed(1)} mm`) +
    row('Airflow at the intake valve', (m => (Math.abs(m) < 1e-4 ? 'none' : `${m > 0 ? '+' : '−'}${f(Math.abs(m) * 1000, 1)} g/s ${m > 0 ? 'into the cylinder' : 'back into the runner'}`))(at(r, 'mIn'))) +
    (near ? row('Valve event', `${near[0]} — ${near[2]}`, 'verdict good') : '');
  document.body.dataset.xAngle = X.angle.toFixed(0);
}

function axes(x0, y0, w, h, ticksY, fy, label) {
  let s = `<line class="ax" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"/><line class="ax" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}"/>`;
  for (const t of ticksY) s += `<line class="grid" x1="${x0}" x2="${x0 + w}" y1="${fy(t)}" y2="${fy(t)}"/><text class="tick" x="${x0 - 3}" y="${fy(t) + 3}" text-anchor="end">${t}</text>`;
  return s + `<text class="tick" x="${x0 + 2}" y="${y0 - h - 4}">${label}</text>`;
}
const runs = () => { const p = viewed(); return p ? [[p.A, '#4fc3f7', 'A', cm(STOCK_L)], [p.B?.valid ? p.B : null, '#ff8a3d', 'B', p.B?.valid ? cm(solverRunner(p.B.setup)) : '']].filter(([r]) => r?.valid) : []; };

function drawPV() {
  const svg = $('x-pv'), x0 = 40, y0 = 190, w = 290, h = 168, log = X.pv === 'log';
  const all = runs(); if (!all.length) { svg.innerHTML = ''; return; }
  const Vmin = Math.min(...all.flatMap(([r]) => r.trace.V)), Vmax = Math.max(...all.flatMap(([r]) => r.trace.V));
  const pmax = Math.max(...all.flatMap(([r]) => r.trace.p)), pmin = Math.min(...all.flatMap(([r]) => r.trace.p));
  const fx = v => (log ? x0 + Math.log(v / Vmin) / Math.log(Vmax / Vmin) * w : x0 + (v - Vmin) / (Vmax - Vmin) * w);
  const fy = p => (log ? y0 - Math.log(p / (pmin * 0.9)) / Math.log(pmax * 1.1 / (pmin * 0.9)) * h : y0 - p / (pmax * 1.05) * h);
  const ticks = log ? [0.5, 1, 2, 5, 10, 20, 50].filter(b => b * 1e5 > pmin * 0.9 && b * 1e5 < pmax * 1.1) : [10, 20, 30, 40, 50, 60, 70].filter(b => b * 1e5 < pmax * 1.05);
  let s = axes(x0, y0, w, h, ticks, b => fy(b * 1e5), `p (bar${log ? ', log' : ''}) · ${viewed().rpm} rpm`);
  s += `<text class="tick" x="${x0 + w}" y="${y0 + 12}" text-anchor="end">V (cm³${log ? ', log' : ''}) ${(Vmin * 1e6).toFixed(0)} → ${(Vmax * 1e6).toFixed(0)}</text>`;
  for (const [r, col, lab] of all) {
    const pts = r.trace.V.map((v, i) => `${fx(v).toFixed(1)},${fy(r.trace.p[i]).toFixed(1)}`).join(' ');
    s += `<polyline class="xloop" data-run="${lab}" points="${pts} ${fx(r.trace.V[0]).toFixed(1)},${fy(r.trace.p[0]).toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.6" ${lab === 'A' && all.length > 1 ? 'stroke-dasharray="4 3"' : ''}/>`;
  }
  const A = viewed().A; s += `<circle cx="${fx(at(A, 'V'))}" cy="${fy(at(A, 'p'))}" r="4.5" fill="#fff" stroke="#0d151b"/>`;
  s += `<text class="tick" x="${x0 + 40}" y="${y0 - h + 6}">${all.map(([, c, l, L]) => `<tspan fill="${c}">■ ${l} ${L}</tspan>`).join('  ')}</text>`;
  svg.innerHTML = `<title id="x-pv-t">Pressure against volume for cylinder 1 over one cycle</title>` + s;
}

function drawPTheta() {
  const svg = $('x-pth'), x0 = 40, y0 = 170, w = 290, h = 140, zoom = X.pth === 'zoom';
  const all = runs(); if (!all.length) { svg.innerHTML = ''; return; }
  const pmax = zoom ? 2.6e5 : Math.max(...all.flatMap(([r]) => r.trace.p)) * 1.05;
  const fx = a => x0 + a / 720 * w, fy = p => y0 - Math.min(p, pmax) / pmax * h;
  const ticks = zoom ? [0.5, 1, 1.5, 2, 2.5] : [10, 20, 30, 40, 50, 60, 70].filter(b => b * 1e5 < pmax);
  let s = axes(x0, y0, w, h, ticks, b => fy(b * 1e5), zoom ? 'p (bar) — gas exchange' : 'p (bar)');
  const A = viewed().A;
  for (const [key, col, yb] of [['liftI', '#4fc3f7', y0 + 6], ['liftE', '#ff8a3d', y0 + 14]]) {
    let d = ''; A.trace[key].forEach((l, i) => { if (l > 0) d += `M${fx(i).toFixed(1)} ${yb}h${(w / 720 + 0.3).toFixed(2)}`; });
    s += `<path d="${d}" stroke="${col}" stroke-opacity=".5" stroke-width="5"/>`;
  }
  for (const [n, a] of events(A)) s += `<text class="tick" x="${fx(a)}" y="${y0 + 28}" text-anchor="middle">${n}</text>`;
  for (const a of [0, 180, 360, 540]) s += `<text class="tick" x="${fx(a) + 2}" y="${y0 - h + 8}">${['TDC', 'BDC', 'TDC', 'BDC'][a / 180]}</text><line x1="${fx(a)}" x2="${fx(a)}" y1="${y0}" y2="${y0 - h}" stroke="#1b2832"/>`;
  for (const [r, col, lab] of all) {
    s += `<polyline data-run="${lab}" points="${r.trace.p.map((p, i) => `${fx(i).toFixed(1)},${fy(p).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    if (zoom) s += `<polyline points="${r.trace.runner.map((p, i) => `${fx(i).toFixed(1)},${fy(p).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="3 2" opacity=".8"/>`;
  }
  s += `<line x1="${fx(X.angle)}" x2="${fx(X.angle)}" y1="${y0}" y2="${y0 - h}" stroke="#fff" stroke-width="1"/>`;
  if (zoom) s += `<text class="tick" x="${x0 + w}" y="${y0 - h + 8}" text-anchor="end">solid: cylinder · dashed: runner at the valve</text>`;
  s += `<text class="tick" x="${x0 + w}" y="${y0 + 40}" text-anchor="end">crank angle · bands: intake / exhaust valve open</text>`;
  svg.innerHTML = `<title id="x-pth-t">Cylinder pressure against crank angle with valve events</title>` + s;
}

function drawFlow() {
  const svg = $('x-flow'), x0 = 40, y0 = 80, w = 290, h = 62;
  const all = runs(); if (!all.length) { svg.innerHTML = ''; return; }
  const A = viewed().A, mx = Math.max(...all.flatMap(([r]) => r.trace.mIn.map(Math.abs))) * 1.1;
  const lo = Math.max(0, Math.floor(A.valves.ivo % 720) - 30), hi = Math.min(719, Math.ceil(A.valves.ivc % 720) + 20), idx = [];
  for (let i = lo; i <= hi; i++) idx.push(i);
  const fx = a => x0 + (a - lo) / (hi - lo) * w, fy = m => y0 - m / mx * h;
  let s = `<line class="ax" x1="${x0}" y1="${y0 - h}" x2="${x0}" y2="${y0 + h}"/><line x1="${x0}" x2="${x0 + w}" y1="${y0}" y2="${y0}" stroke="#6d8796"/>`;
  s += `<text class="tick" x="${x0 + 3}" y="${y0 - h + 8}">into cylinder ↑ (g/s) · ${viewed().rpm} rpm</text><text class="tick" x="${x0 + 3}" y="${y0 + h - 2}">back into runner ↓</text>`;
  for (const v of [-1, 1]) { const g = Math.round(v * mx * 1000 * 0.8 / 10) * 10; if (g) s += `<text class="tick" x="${x0 - 3}" y="${fy(g / 1000) + 3}" text-anchor="end">${g}</text><line class="grid" x1="${x0}" x2="${x0 + w}" y1="${fy(g / 1000)}" y2="${fy(g / 1000)}"/>`; }
  for (const [n, a] of events(A).filter(([n]) => n.startsWith('I'))) s += `<line x1="${fx(a)}" x2="${fx(a)}" y1="${y0 - h}" y2="${y0 + h}" stroke="#2c3e4a" stroke-dasharray="2 2"/><text class="tick" x="${fx(a)}" y="${y0 + h + 10}" text-anchor="middle">${n}</text>`;
  s += `<line x1="${fx(540)}" x2="${fx(540)}" y1="${y0 - h}" y2="${y0 + h}" stroke="#1b2832"/><text class="tick" x="${fx(540)}" y="${y0 + h + 10}" text-anchor="middle">BDC</text>`;
  // shade A's backflow
  s += `<path d="${idx.map(i => (A.trace.mIn[i] < 0 ? `M${fx(i).toFixed(1)} ${y0}V${fy(A.trace.mIn[i]).toFixed(1)}` : '')).join('')}" stroke="#ff5a4f" stroke-opacity=".45" stroke-width="1.6"/>`;
  for (const [r, col, lab] of all) s += `<polyline class="xflow" data-run="${lab}" points="${idx.map(i => `${fx(i).toFixed(1)},${fy(r.trace.mIn[i]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
  if (X.angle >= lo && X.angle <= hi) s += `<line x1="${fx(X.angle)}" x2="${fx(X.angle)}" y1="${y0 - h}" y2="${y0 + h}" stroke="#fff" stroke-width="1"/>`;
  s += `<text class="tick" x="${x0 + w}" y="${y0 + h + 22}" text-anchor="end">crank angle ${lo}°–${hi}° (intake event)</text>`;
  svg.innerHTML = `<title id="x-flow-t">Signed airflow through cylinder 1’s intake valve over one cycle</title>` + s;
}

function chainHTML(r) {
  const z = r.cylinders, VdC = r.Vd * 1e6;
  return `<div class="eqs">
    <p><b>1 · Net indicated work, cylinder 1</b> (Run A, ${r.rpm} rpm). W = ∮ p dV over 720°, from this run’s p and V = <b>${f(r.Wloop, 1)} J</b>. The four cylinders average <b>${f(r.Wavg, 1)} J</b> (they breathe slightly differently through the shared manifolds); the average is used below.</p>
    <p><b>2 · Indicated mean effective pressure.</b> IMEP = W / V<sub>d</sub> = ${f(r.Wavg, 1)} J ÷ ${f(VdC, 1)} cm³ = <b>${f(r.imep / 1e5, 2)} bar</b></p>
    <p><b>3 · Friction (modelled, not measured).</b> FMEP from the Chen–Flynn correlation at ${f(r.rpm, 0)} rpm (mean piston speed ${f(2 * K12M.stroke * r.rpm / 60, 1)} m/s) = <b>${f(r.fmep / 1e5, 2)} bar</b></p>
    <p><b>4 · Brake mean effective pressure.</b> BMEP = IMEP − FMEP = ${f(r.imep / 1e5, 2)} − ${f(r.fmep / 1e5, 2)} = <b>${f(r.bmep / 1e5, 2)} bar</b></p>
    <p><b>5 · Brake torque</b> (four-stroke: one power stroke per cylinder every 2 revolutions). T = BMEP · V<sub>d</sub> · z / 4π = ${f(r.bmep, 0)} Pa × ${f(r.Vd * 1e6, 1)}×10⁻⁶ m³ × ${z} ÷ 4π = <b>${f(r.torque, 1)} N·m</b></p>
    <p><b>6 · Shaft power.</b> P = T · ω = ${f(r.torque, 1)} N·m × ${f(r.omega, 1)} rad/s = <b>${f(r.power / 1000, 2)} kW</b></p>
    <p class="note">Check: the bench’s own torque for this run is ${f(r.solverTorque, 2)} N·m; the chain gives ${f(r.torque, 2)} N·m.</p>
  </div>`;
}

const ivcIdx = p => Math.floor(p.A.valves.ivc % 720);
const mg = kg => `${f(kg * 1e6, 1)} mg`;
function pairTable(p, c) {
  const tr = (k, a, b, d, u) => `<tr><th>${k}</th><td>${a}</td><td>${b}</td><td>${d}</td><td>${u}</td></tr>`;
  return `<table class="abt"><thead><tr><th>${p.rpm} rpm</th><th>Run A</th><th>Run B</th><th>Change</th><th></th></tr></thead><tbody>
    ${tr('Intake runner (solver)', cm(STOCK_L), cm(solverRunner(p.B.setup)), 'tested', 'input')}
    ${tr('Speed', `${p.rpm} rpm`, `${p.rpm} rpm`, 'held', 'input')}
    ${tr('Volumetric efficiency', f(c.ve.a * 100) + ' %', f(c.ve.b * 100) + ' %', sgn(c.ve.rel), 'bench')}
    ${tr('Work per cylinder', f(c.Wavg.a) + ' J', f(c.Wavg.b) + ' J', sgn(c.Wavg.rel), 'bench')}
    ${tr('IMEP', f(c.imep.a / 1e5, 2) + ' bar', f(c.imep.b / 1e5, 2) + ' bar', sgn(c.imep.rel), 'bench')}
    ${tr('FMEP', f(c.fmep.a / 1e5, 2) + ' bar', f(c.fmep.b / 1e5, 2) + ' bar', sgn(c.fmep.rel), 'modelled')}
    ${tr('BMEP', f(c.bmep.a / 1e5, 2) + ' bar', f(c.bmep.b / 1e5, 2) + ' bar', sgn(c.bmep.rel), 'bench − model')}
    ${tr('Brake torque', f(c.torque.a) + ' N·m', f(c.torque.b) + ' N·m', sgn(c.torque.rel), '')}
    ${tr('Shaft power', f(c.power.a / 1000, 2) + ' kW', f(c.power.b / 1000, 2) + ' kW', sgn(c.power.rel), '')}
    ${tr('Cylinder p at IVC', f(p.A.trace.p[ivcIdx(p)] / 1e5, 2) + ' bar', f(p.B.trace.p[ivcIdx(p)] / 1e5, 2) + ' bar', '', 'bench')}
    ${tr('Air in through the valve', mg(p.A.air.fwd), mg(p.B.air.fwd), sgn((p.B.air.fwd - p.A.air.fwd) / p.A.air.fwd), 'cyl 1')}
    ${tr('Pushed back, before BDC', mg(p.A.air.backEarly), mg(p.B.air.backEarly), '', 'cyl 1')}
    ${tr('Pushed back, after BDC', mg(p.A.air.backLate), mg(p.B.air.backLate), '', 'cyl 1')}
    ${tr('Net air kept per cycle', mg(p.A.air.net), mg(p.B.air.net), sgn((p.B.air.net - p.A.air.net) / p.A.air.net), 'cyl 1')}
    ${(() => { const a = intakeEvidence(p.A), b = intakeEvidence(p.B); return tr('Valve-side p, whole intake event', f(a.whole / 1e5, 3) + ' bar', f(b.whole / 1e5, 3) + ' bar', '', 'bench') + tr(`Valve-side p, late intake (${LATE_FROM}°–IVC)`, f(a.late / 1e5, 3) + ' bar', f(b.late / 1e5, 3) + ' bar', '', 'bench'); })()}
    </tbody></table>`;
}
function resultBlock(p) {
  if (!p.A.valid) return `<p class="msg bad">Run A at ${p.rpm} rpm did not converge — not plotted, no numbers shown.</p>`;
  const c = compare(p.A, p.B);
  if (!c.ok) return `<p class="msg bad">${c.reason}</p>`;
  const want = verdict(c.torque.rel);
  return `<p class="result ${want === p.prediction ? 'right' : 'wrong'}">At ${p.rpm} rpm you predicted <b>${p.prediction}</b>. Brake torque ${f(c.torque.a, 1)} → ${f(c.torque.b, 1)} N·m (${sgn(c.torque.rel)}): <b>${want}</b>.</p>${pairTable(p, c)}
    <p class="note">Both runs converged (${p.A.cycles} and ${p.B.cycles} cycles). Model predictions, not dyno measurements.</p>`;
}
const predictRow = (key, disabled) => `<p class="think">Predict before you run: brake torque will go…</p><div class="row">${['Up', 'Down', 'Within ±1 %'].map(o => `<button type="button" class="guess" data-xp="${key}" data-v="${o}" aria-pressed="${X.prediction === o}" ${disabled ? 'disabled' : ''}>${o}</button>`).join('')}</div>`;
const WHY = [
  ['wave', 'Consistent with wave timing: at every speed the late-intake pressure moved the same way as filling, indicated work and torque.'],
  ['friction', 'Mechanical engine friction: changing the runner changed the engine’s friction losses.'],
  ['inconclusive', 'Inconclusive: the pressure trace does not line up clearly with filling and work at every speed.'],
];
function evidenceChart(p) {
  const a = intakeEvidence(p.A), x0 = 40, y0 = 104, w = 290, h = 84, lo0 = a.ivo - 20, hi0 = a.ivc + 20;
  const idx = []; for (let i = Math.floor(lo0); i <= Math.ceil(hi0); i++) idx.push(i);
  const vals = [p.A, p.B].flatMap(r => idx.map(i => r.trace.runner[i]));
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
  const fx = i => x0 + (i - lo0) / (hi0 - lo0) * w, fy = v => y0 - (v - lo) / (hi - lo) * h;
  let s = `<rect x="${fx(LATE_FROM)}" y="${y0 - h}" width="${fx(a.ivc) - fx(LATE_FROM)}" height="${h}" fill="#1b2832"/>`;
  s += `<line class="ax" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"/><line class="ax" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}"/>`;
  for (const t of [0.6, 0.8, 1, 1.2, 1.4, 1.6].filter(t => t * 1e5 > lo && t * 1e5 < hi)) s += `<text class="tick" x="${x0 - 3}" y="${fy(t * 1e5) + 3}" text-anchor="end">${t}</text>`;
  for (const [ang, lab] of [[a.ivo, 'IVO'], [540, 'BDC'], [a.ivc, 'IVC']]) s += `<line x1="${fx(ang)}" x2="${fx(ang)}" y1="${y0}" y2="${y0 - h}" stroke="#2c3e4a" stroke-dasharray="2 2"/><text class="tick" x="${fx(ang)}" y="${y0 + 11}" text-anchor="middle">${lab}</text>`;
  for (const [r, col] of [[p.A, '#4fc3f7'], [p.B, '#ff8a3d']]) s += `<polyline points="${idx.map(i => `${fx(i).toFixed(1)},${fy(r.trace.runner[i]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  s += `<text class="tick" x="${x0 + 4}" y="${y0 - h + 9}">${p.rpm} rpm · valve-side p (bar) · <tspan fill="#4fc3f7">A ${cm(STOCK_L)}</tspan> <tspan fill="#ff8a3d">B ${cm(solverRunner(p.B.setup))}</tspan></text>`;
  return `<svg class="chart evidence" viewBox="0 0 340 122" role="img" aria-label="Runner-side intake pressure across the intake event at ${p.rpm} rpm, Run A and Run B">${s}</svg>`;
}

function expHTML() {
  const first = X.pairs[0];
  if (!first?.A?.valid) return '';
  let h = '';
  // step 4: first A/B at the first speed
  if (guided() && !first.B) X.runnerL = GUIDED_L;
  const Lchanged = Math.abs(X.runnerL - STOCK_L) > 0.005;
  if (!first.B) {
    h += guided()
      ? `<p class="note"><b>Guided lesson:</b> Run B uses a ${cm(GUIDED_L)} runner (${cm(STOCK_L)} → ${cm(GUIDED_L)}). Any length can be tried in Explore mode.</p>`
      : `<label class="range">Run B intake runner length <output id="x-runner-out">${cm(X.runnerL)} (Run A: ${cm(STOCK_L)})</output><input id="x-runner" type="range" min="20" max="70" step="1" value="${Math.round(X.runnerL * 100)}"></label>`;
    h += predictRow('first', X.busy || !Lchanged);
    h += `<p class="note">${!Lchanged ? `Move the runner length away from the stock ${cm(STOCK_L)}.` : !X.prediction ? 'Predict first: Run B unlocks after you commit.' : 'Ready: Run B keeps everything else exactly as Run A.'}</p>`;
    h += `<div class="row"><button type="button" class="primary" id="x-runB" ${X.busy || !Lchanged || !X.prediction ? 'disabled' : ''}>Run B</button></div>`;
    return h;
  }
  h += resultBlock(first);
  if (!compare(first.A, first.B).ok) return h + `<div class="row"><button type="button" id="x-reset">Try Run B again</button></div>`;
  h += `<p><b>What to look at.</b> Mechanical engine friction (FMEP) depends only on speed in this model, so it is identical within the pair and the torque change comes from indicated work, which follows the air trapped (volumetric efficiency). The runner is a tuned pipe: when the intake valve opens, a pressure wave travels up the runner, reflects where the runner meets the plenum (a sudden widening) and returns to the valve. Whether that helps depends on the pressure on the runner side of the valve across the whole intake event — especially late in it, when the piston slows and the valve is closing. One crank angle is not enough: compare the whole trace (switch the second chart to “Gas exchange”).</p>`;
  // step 5: the same comparison at another speed
  const used = new Set(X.pairs.map(p => p.rpm)), second = X.pairs.find(p => p.kind === 'repeat');
  h += `<h3 class="sub">5 · Same change, another speed</h3>`;
  if (!second) {
    h += `<p class="note">Keep both runner lengths (${cm(STOCK_L)} and ${cm(solverRunner(first.B.setup))}) and repeat the comparison at a different speed. Both sets of traces are kept: switch between them above the charts.</p>
      <div class="chips" role="radiogroup" aria-label="Second speed">${FIRST.filter(r => !used.has(r)).map(r => `<button type="button" role="radio" data-xnext="${r}" aria-checked="${X.nextRpm === r}" ${X.busy ? 'disabled' : ''}>${r} rpm</button>`).join('')}</div>
      ${predictRow('repeat', X.busy || !X.nextRpm)}
      <div class="row"><button type="button" class="primary" id="x-runPair" ${X.busy || !X.nextRpm || !X.prediction ? 'disabled' : ''}>Run A and B at ${X.nextRpm || '…'} rpm</button></div>`;
    return h;
  }
  h += resultBlock(second);
  if (!compare(second.A, second.B).ok) return h + `<div class="row"><button type="button" id="x-redo">Try again</button></div>`;
  // step 6: cite the evidence across the intake event, then conclude (inconclusive is allowed)
  const pairs = [first, second], J = judge(pairs), c1 = compare(first.A, first.B), c2 = compare(second.A, second.B);
  const LB = cm(solverRunner(first.B.setup)), word = r => (r < 0 ? 'lost' : 'gained');
  h += `<h3 class="sub">6 · Defend it with the evidence</h3>
    <p>Changing the runner from ${cm(STOCK_L)} to ${LB} ${word(c1.torque.rel)} ${Math.abs(c1.torque.rel * 100).toFixed(1)} % torque at ${first.rpm} rpm and ${word(c2.torque.rel)} ${Math.abs(c2.torque.rel * 100).toFixed(1)} % at ${second.rpm} rpm. Below: the pressure on the runner side of the intake valve across the intake event (shaded: late intake, ${LATE_FROM}° to valve closing).</p>
    ${pairs.map(evidenceChart).join('')}
    <p class="think">For each speed: did the late-intake pressure move the same way as volumetric efficiency and indicated work?</p>
    ${J.rows.map(r => `<div class="row cite"><span class="citelabel">${r.rpm} rpm</span>${[['same', 'Same way'], ['opposite', 'Opposite'], ['unclear', 'No clear change']].map(([k, t]) => `<button type="button" class="guess" data-cite="${r.rpm}" data-v="${k}" aria-pressed="${X.cite[r.rpm] === k}">${t}</button>`).join('')}</div>`).join('')}`;
  const truth = r => (Math.abs(r.dLate) < CLEAR_BAR ? 'unclear' : Math.sign(r.dLate) === Math.sign(r.dVE) && Math.sign(r.dVE) === Math.sign(r.dW) ? 'same' : 'opposite');
  if (J.rows.some(r => !X.cite[r.rpm])) return h;
  h += J.rows.map(r => { const ok = X.cite[r.rpm] === truth(r);
    return `<p class="measured ${ok ? '' : 'badtext'}">${r.rpm} rpm — ${ok ? 'matches the data' : `the data say “${{ same: 'same way', opposite: 'opposite', unclear: 'no clear change' }[truth(r)]}”`}: late-intake pressure ${f(r.a.late / 1e5, 3)} → ${f(r.b.late / 1e5, 3)} bar, whole-event ${f(r.a.whole / 1e5, 3)} → ${f(r.b.whole / 1e5, 3)} bar, volumetric efficiency ${sgn(r.dVE / pairs.find(p => p.rpm === r.rpm).A.ve)}, work per cylinder ${sgn(r.dW / pairs.find(p => p.rpm === r.rpm).A.Wavg)}, FMEP unchanged.</p>`; }).join('');
  h += `<p class="think">What do your runs support?</p><div class="whys">${WHY.map(([k, t]) => `<button type="button" class="guess why" data-why="${k}" aria-pressed="${X.why === k}">${t}</button>`).join('')}</div>`;
  if (!X.why) return h;
  const bad = J.rows.find(r => !r.agree);
  const fb = X.why === 'friction' ? ['wrong', 'Not supported: within each pair the modelled mechanical engine friction (FMEP) is identical, so it cannot explain the difference between A and B. (Air dragging on the runner walls is different: it is part of the 1D gas model and does change with runner length, so it can change the size of the effect.)']
    : J.verdict === 'wave' ? (X.why === 'wave' ? ['right', 'Consistent with wave timing: at both speeds the late-intake pressure clearly moved the same way as filling, indicated work and torque. That supports the explanation; it does not prove it.'] : ['right', 'A defensible, cautious answer — but here the late-intake pressure clearly moved with filling, work and torque at both speeds, so the runs are consistent with wave timing.'])
    : (X.why === 'inconclusive' ? ['right', `Right to hold back: at ${bad.rpm} rpm the pressure trace does not clearly line up with filling and work. A next step would be the mass flow through the valve over the cycle (not shown in this lab) or a finer speed sweep.`] : ['wrong', `Not supported at every speed: at ${bad.rpm} rpm the late-intake pressure ${Math.abs(bad.dLate) < CLEAR_BAR ? 'barely changed' : 'moved the other way'} while filling ${bad.dVE > 0 ? 'rose' : 'fell'}. “Inconclusive” is the honest answer here.`]);
  h += `<p class="result ${fb[0]}">${fb[1]}</p>`;
  if (J.verdict === 'wave') h += `<p>The likely mechanism in these runs: what matters is when the reflected wave reaches the valve relative to the end of the intake event. The round trip takes roughly the same time at every speed, but the intake event gets shorter in time as speed rises, so the same length helps at one speed and hurts at another.</p>`;
  // follow the air: where was it gained or lost?
  h += `<h3 class="sub">Follow the air</h3><p>The airflow chart above shows when air goes in and when gas is pushed back into the runner. For each speed: where did Run B gain or lose its air compared with Run A?</p>`;
  const shifts = pairs.map(p => ({ rpm: p.rpm, ...airShift(p.A, p.B), p }));
  h += shifts.map(r => `<div class="row cite"><span class="citelabel">${r.rpm} rpm</span>${[['forward', 'Forward flow'], ['backflow', 'Pushed back'], ['both', 'Both']].map(([k, t]) => `<button type="button" class="guess" data-air="${r.rpm}" data-v="${k}" aria-pressed="${X.air[r.rpm] === k}">${t}</button>`).join('')}</div>`).join('');
  if (shifts.every(r => X.air[r.rpm])) h += shifts.map(r => { const ok = X.air[r.rpm] === r.where, A = r.p.A.air, B = r.p.B.air;
    return `<p class="measured ${ok ? '' : 'badtext'}">${r.rpm} rpm — ${ok ? 'matches the data' : `the data point to “${{ forward: 'forward flow', backflow: 'pushed back', both: 'both' }[r.where]}”`}: forward ${mg(A.fwd)} → ${mg(B.fwd)}, pushed back ${mg(A.backEarly + A.backLate)} → ${mg(B.backEarly + B.backLate)} (after BDC ${mg(A.backLate)} → ${mg(B.backLate)}), net kept ${mg(A.net)} → ${mg(B.net)}.</p>`; }).join('');
  h += `<p class="note">Model predictions from one 1D model, not dyno evidence.</p>`;
  // step 7: an operating point the learner has not run
  const third = X.pairs.find(p => p.kind === 'unseen');
  h += `<h3 class="sub">7 · An operating point you have not run</h3>`;
  if (!third) {
    h += `<p class="note">Use your explanation: choose a speed you have not run, predict, then test it.</p>
      <div class="chips" role="radiogroup" aria-label="Unseen speed">${UNSEEN.filter(r => !used.has(r)).map(r => `<button type="button" role="radio" data-xunseen="${r}" aria-checked="${X.unseenRpm === r}" ${X.busy ? 'disabled' : ''}>${r} rpm</button>`).join('')}</div>
      ${predictRow('unseen', X.busy || !X.unseenRpm)}
      <div class="row"><button type="button" class="primary" id="x-runUnseen" ${X.busy || !X.unseenRpm || !X.prediction ? 'disabled' : ''}>Test ${X.unseenRpm || '…'} rpm</button></div>`;
    return h;
  }
  h += resultBlock(third);
  if (third.B && compare(third.A, third.B).ok) h += `<p class="note">If this surprised you: below about 3500 rpm the reflected wave can make more than one round trip during one intake event, so each runner has more than one tuned speed and the comparison can flip back and forth. Engineers check that with a full sweep, not one point.</p>`;
  else h += `<div class="row"><button type="button" id="x-redoUnseen">Try another speed</button></div>`;
  h += `<div class="row"><button type="button" id="x-restart">Start a new experiment</button></div>`;
  return h;
}

function paint() {
  const first = X.pairs[0], st = $('x-status');
  document.querySelectorAll('[data-xrpm]').forEach(b => { b.setAttribute('aria-checked', String(+b.dataset.xrpm === X.rpm)); b.disabled = X.busy || !!first; });
  $('x-runA').disabled = X.busy || !!first;
  const haveA = first?.A?.valid;
  if (X.busy) st.textContent = 'Running the 1D bench until cycle-to-cycle convergence…';
  else if (first && !haveA) st.textContent = `Run A did not converge in ${first.A.cycles} cycles — not plotted, no numbers shown.`;
  else if (haveA) st.textContent = `Run A: stock K12M (runner ${cm(STOCK_L)}) at ${first.rpm} rpm, converged after ${first.A.cycles} cycles.`;
  else st.textContent = 'No run yet.';
  st.className = 'msg' + (first && !haveA ? ' bad' : haveA ? ' ok' : '');
  const last = X.pairs.at(-1);
  document.body.dataset.xState = X.busy ? 'busy' : !first ? 'none' : !haveA ? 'A-invalid' : !last.B && last.A.valid ? (last === first ? 'A' : `${last.kind}-invalid`)
    : !last.A.valid || !compare(last.A, last.B).ok ? `${last.kind}-invalid` : last.kind;
  document.body.dataset.xWhy = X.why || '';
  $('x-after-a').hidden = !haveA;
  if (!haveA) { readout(); drawPV(); drawPTheta(); drawFlow(); return; }
  if (!viewed()?.A?.valid) X.view = 0;
  $('x-view').innerHTML = X.pairs.length > 1 ? X.pairs.filter(p => p.A.valid).map(p => `<button type="button" role="radio" data-xview="${X.pairs.indexOf(p)}" aria-checked="${X.pairs.indexOf(p) === X.view}">${p.rpm} rpm</button>`).join('') : '';
  $('x-view').querySelectorAll('[data-xview]').forEach(b => b.onclick = () => { X.view = +b.dataset.xview; paint(); });
  $('x-scrub').value = X.angle; $('x-play').textContent = X.playing ? 'Pause' : 'Play';
  readout(); drawPV(); drawPTheta(); drawFlow();
  $('x-chain').innerHTML = chainHTML(viewed().A);
  $('x-exp').innerHTML = expHTML();
  wire();
}
function wire() {
  const r = $('x-runner');
  if (r) {
    r.oninput = e => { X.runnerL = +e.target.value / 100; $('x-runner-out').textContent = `${cm(X.runnerL)} (Run A: ${cm(STOCK_L)})`; };
    r.onchange = () => { X.prediction = null; paint(); $('x-runner')?.focus(); };
  }
  document.querySelectorAll('[data-xp]').forEach(b => b.onclick = () => { X.prediction = b.dataset.v; paint(); });
  const b1 = $('x-runB'); if (b1) b1.onclick = () => runPair(X.pairs[0].rpm, 'first', X.prediction, { newA: false });
  document.querySelectorAll('[data-xnext]').forEach(b => b.onclick = () => { X.nextRpm = +b.dataset.xnext; paint(); });
  const b2 = $('x-runPair'); if (b2) b2.onclick = () => runPair(X.nextRpm, 'repeat', X.prediction);
  document.querySelectorAll('[data-cite]').forEach(b => b.onclick = () => { X.cite = { ...X.cite, [b.dataset.cite]: b.dataset.v }; paint(); });
  document.querySelectorAll('[data-why]').forEach(b => b.onclick = () => { X.why = b.dataset.why; paint(); });
  document.querySelectorAll('[data-air]').forEach(b => b.onclick = () => { X.air = { ...X.air, [b.dataset.air]: b.dataset.v }; paint(); });
  document.querySelectorAll('[data-xunseen]').forEach(b => b.onclick = () => { X.unseenRpm = +b.dataset.xunseen; paint(); });
  const b3 = $('x-runUnseen'); if (b3) b3.onclick = () => runPair(X.unseenRpm, 'unseen', X.prediction);
  const drop = kind => { X.pairs = X.pairs.filter(p => p.kind !== kind); X.view = 0; X.prediction = null; if (kind === 'repeat') { X.cite = {}; X.why = null; X.air = {}; } paint(); };
  const rs = $('x-reset'); if (rs) rs.onclick = () => { X.pairs[0].B = null; X.prediction = null; paint(); };
  const rd = $('x-redo'); if (rd) rd.onclick = () => drop('repeat');
  const ru = $('x-redoUnseen'); if (ru) ru.onclick = () => drop('unseen');
  const rr = $('x-restart'); if (rr) rr.onclick = () => { Object.assign(X, { pairs: [], view: 0, prediction: null, nextRpm: null, why: null, unseenRpm: null, cite: {}, air: {}, runnerL: GUIDED_L }); paint(); };
}

export function initShaft() {
  $('x-bench-inputs').textContent = BENCH_INPUTS.join(', ');
  $('x-caveat').textContent = `Validation: the bench’s one fitted constant was set at the published ${K12M_PUBLISHED.torque.Nm} N·m at ${K12M_PUBLISHED.torque.rpm} rpm; the published ${K12M_PUBLISHED.power.kW} kW at ${K12M_PUBLISHED.power.rpm} rpm is a separate check (within 4 %). One fitted torque point and one power check do not validate the full curve, or effects such as runner length. Every result here is a model prediction, not dyno evidence.`;
  document.querySelectorAll('[data-xrpm]').forEach(b => b.onclick = () => { X.rpm = +b.dataset.xrpm; paint(); });
  $('x-runA').onclick = () => { X.angle = 0; X.playing = false; runPair(X.rpm, 'first', null, { withB: false }); };
  $('x-scrub').oninput = e => { X.angle = +e.target.value; X.playing = false; readout(); drawPV(); drawPTheta(); drawFlow(); $('x-play').textContent = 'Play'; };
  $('x-play').onclick = () => { X.playing = !X.playing; paint(); };
  document.querySelectorAll('[data-xpv]').forEach(b => b.onclick = () => { X.pv = b.dataset.xpv; document.querySelectorAll('[data-xpv]').forEach(c => c.setAttribute('aria-checked', String(c === b))); drawPV(); });
  document.querySelectorAll('[data-xpth]').forEach(b => b.onclick = () => { X.pth = b.dataset.xpth; document.querySelectorAll('[data-xpth]').forEach(c => c.setAttribute('aria-checked', String(c === b))); drawPTheta(); });
  new MutationObserver(() => paint()).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  paint();
  window.__shaft = { X, setMaxCycles: n => { X.maxCycles = n; } };   // used by browser tests
  return {
    // When the experiment owns the clock, the 3D cutaway follows its crank angle.
    tick(dt, moduleOpen) {
      if (!moduleOpen || !viewed()?.A?.valid) return null;
      if (X.playing) { X.angle = (X.angle + dt * 60) % 720; $('x-scrub').value = X.angle; readout(); drawPV(); drawPTheta(); drawFlow(); }
      return X.angle;
    },
  };
}
