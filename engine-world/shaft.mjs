// "From cylinder work to shaft power" — a controlled experiment on Engine World's 1D test bench.
// Every number shown comes from one converged run of the bench (cylinder 1's own p and V); the 3D cutaway is an
// idealised teaching view moved to the same crank angle.
import { BENCH_STOCK, BENCH_INPUTS, compare } from './bench-setup.mjs';
import { K12M, K12M_PUBLISHED } from '../engines/thermofluids/gasdyn.mjs';
import { piston } from '../engines/motion/crank.mjs';

const $ = id => document.getElementById(id);
const f = (n, d = 1) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(d));
const sgn = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x * 100).toFixed(1) + ' %';
const STROKE = a => (a < 180 ? 'Power (expansion)' : a < 360 ? 'Exhaust' : a < 540 ? 'Intake' : 'Compression');
const X = { rpm: 4500, A: null, B: null, angle: 0, playing: false, prediction: null, pv: 'linear', pth: 'full', busy: false, maxCycles: undefined };
let worker = null;

function run(label, setup) {
  worker ||= new Worker(new URL('./bench-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.kind !== 'shaft') return;
    X.busy = false;
    if (data.label === 'A') { X.A = data.run; X.B = null; X.prediction = null; } else X.B = data.run;
    paint();
  };
  X.busy = true; paint();
  worker.postMessage({ kind: 'shaft', label, rpm: X.rpm, setup, maxCycles: X.maxCycles });
}

const events = r => { const v = r.valves; return [['IVO', v.ivo % 720, 'intake valve opens'], ['IVC', v.ivc % 720, 'intake valve closes'], ['EVO', v.evo % 720, 'exhaust valve opens'], ['EVC', v.evc % 720, 'exhaust valve closes']]; };
const at = (r, k) => r.trace[k][Math.min(719, Math.max(0, Math.floor(X.angle)))];

function readout() {
  const r = X.A?.valid ? X.A : null, el = $('x-read');
  if (!r) { el.innerHTML = ''; return; }
  const disp = piston(X.angle * Math.PI / 180, K12M.stroke / 2, K12M.rod).disp;
  const near = events(r).find(([, a]) => Math.abs(((X.angle - a + 360) % 720) - 360) < 1.5);
  const row = (k, v, cls = '') => `<li class="${cls}"><span>${k}</span> <b>${v}</b></li>`;
  el.innerHTML = row('Crank angle (0° = firing TDC, cylinder 1)', `${X.angle.toFixed(0)}°`) + row('Stroke', STROKE(X.angle)) +
    row('Piston below top dead centre', `${(disp * 1000).toFixed(1)} mm`) + row('Cylinder volume (from the run)', `${(at(r, 'V') * 1e6).toFixed(1)} cm³`) +
    row('Cylinder pressure (from the run)', `${(at(r, 'p') / 1e5).toFixed(2)} bar`) +
    row('Intake / exhaust valve lift', `${(at(r, 'liftI') * 1000).toFixed(1)} / ${(at(r, 'liftE') * 1000).toFixed(1)} mm`) +
    (near ? row('Valve event', `${near[0]} — ${near[2]}`, 'verdict good') : '');
  document.body.dataset.xAngle = X.angle.toFixed(0);
}

function axes(x0, y0, w, h, ticksY, fy, label) {
  let s = `<line class="ax" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"/><line class="ax" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}"/>`;
  for (const t of ticksY) s += `<line class="grid" x1="${x0}" x2="${x0 + w}" y1="${fy(t)}" y2="${fy(t)}"/><text class="tick" x="${x0 - 3}" y="${fy(t) + 3}" text-anchor="end">${t}</text>`;
  return s + `<text class="tick" x="${x0 + 2}" y="${y0 - h - 4}">${label}</text>`;
}
const runs = () => [[X.A, '#4fc3f7', 'A'], [X.B?.valid ? X.B : null, '#ff8a3d', 'B']].filter(([r]) => r?.valid);

function drawPV() {
  const svg = $('x-pv'), x0 = 40, y0 = 190, w = 290, h = 168, log = X.pv === 'log';
  const all = runs(); if (!all.length) { svg.innerHTML = ''; return; }
  const Vmin = Math.min(...all.flatMap(([r]) => r.trace.V)), Vmax = Math.max(...all.flatMap(([r]) => r.trace.V));
  const pmax = Math.max(...all.flatMap(([r]) => r.trace.p)), pmin = Math.min(...all.flatMap(([r]) => r.trace.p));
  const fx = v => (log ? x0 + Math.log(v / Vmin) / Math.log(Vmax / Vmin) * w : x0 + (v - Vmin) / (Vmax - Vmin) * w);
  const fy = p => (log ? y0 - Math.log(p / (pmin * 0.9)) / Math.log(pmax * 1.1 / (pmin * 0.9)) * h : y0 - p / (pmax * 1.05) * h);
  const ticks = log ? [0.5, 1, 2, 5, 10, 20, 50].filter(b => b * 1e5 > pmin * 0.9 && b * 1e5 < pmax * 1.1) : [10, 20, 30, 40, 50, 60, 70].filter(b => b * 1e5 < pmax * 1.05);
  let s = axes(x0, y0, w, h, ticks, b => fy(b * 1e5), `p (bar${log ? ', log' : ''})`);
  s += `<text class="tick" x="${x0 + w}" y="${y0 + 12}" text-anchor="end">V (cm³${log ? ', log' : ''}) ${(Vmin * 1e6).toFixed(0)} → ${(Vmax * 1e6).toFixed(0)}</text>`;
  for (const [r, col, lab] of all) {
    const pts = r.trace.V.map((v, i) => `${fx(v).toFixed(1)},${fy(r.trace.p[i]).toFixed(1)}`).join(' ');
    s += `<polyline class="xloop" data-run="${lab}" points="${pts} ${fx(r.trace.V[0]).toFixed(1)},${fy(r.trace.p[0]).toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.6" ${lab === 'A' && all.length > 1 ? 'stroke-dasharray="4 3"' : ''}/>`;
  }
  const A = X.A; s += `<circle cx="${fx(at(A, 'V'))}" cy="${fy(at(A, 'p'))}" r="4.5" fill="#fff" stroke="#0d151b"/>`;
  s += `<text class="tick" x="${x0 + 40}" y="${y0 - h + 6}">${all.map(([, c, l]) => `<tspan fill="${c}">■ Run ${l}</tspan>`).join('  ')}</text>`;
  svg.innerHTML = `<title id="x-pv-t">Pressure against volume for cylinder 1 over one cycle</title>` + s;
}

function drawPTheta() {
  const svg = $('x-pth'), x0 = 40, y0 = 170, w = 290, h = 140, zoom = X.pth === 'zoom';
  const all = runs(); if (!all.length) { svg.innerHTML = ''; return; }
  const pmax = zoom ? 2.6e5 : Math.max(...all.flatMap(([r]) => r.trace.p)) * 1.05;
  const fx = a => x0 + a / 720 * w, fy = p => y0 - Math.min(p, pmax) / pmax * h;
  const ticks = zoom ? [0.5, 1, 1.5, 2, 2.5] : [10, 20, 30, 40, 50, 60, 70].filter(b => b * 1e5 < pmax);
  let s = axes(x0, y0, w, h, ticks, b => fy(b * 1e5), zoom ? 'p (bar) — gas exchange' : 'p (bar)');
  // valve lift bands from the run
  const A = X.A;
  for (const [key, col, yb] of [['liftI', '#13283a', y0 + 6], ['liftE', '#2e1c12', y0 + 14]]) {
    let d = ''; A.trace[key].forEach((l, i) => { if (l > 0) d += `M${fx(i).toFixed(1)} ${yb}h${(w / 720 + 0.3).toFixed(2)}`; });
    s += `<path d="${d}" stroke="${key === 'liftI' ? '#4fc3f7' : '#ff8a3d'}" stroke-opacity=".5" stroke-width="5"/>`;
  }
  for (const [n, a] of events(A)) s += `<text class="tick" x="${fx(a)}" y="${y0 + 28}" text-anchor="middle">${n}</text>`;
  for (const a of [0, 180, 360, 540]) s += `<text class="tick" x="${fx(a) + 2}" y="${y0 - h + 8}">${['TDC', 'BDC', 'TDC', 'BDC'][a / 180]}</text><line x1="${fx(a)}" x2="${fx(a)}" y1="${y0}" y2="${y0 - h}" stroke="#1b2832"/>`;
  for (const [r, col, lab] of all) {
    s += `<polyline data-run="${lab}" points="${r.trace.p.map((p, i) => `${fx(i).toFixed(1)},${fy(p).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    if (zoom) s += `<polyline points="${r.trace.runner.map((p, i) => `${fx(i).toFixed(1)},${fy(p).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="3 2" opacity=".8"/>`;
  }
  s += `<line x1="${fx(X.angle)}" x2="${fx(X.angle)}" y1="${y0}" y2="${y0 - h}" stroke="#fff" stroke-width="1"/>`;
  if (zoom) s += `<text class="tick" x="${x0 + w}" y="${y0 - h + 8}" text-anchor="end">solid: cylinder · dashed: intake runner at the valve</text>`;
  s += `<text class="tick" x="${x0 + w}" y="${y0 + 40}" text-anchor="end">crank angle · bands: intake / exhaust valve open</text>`;
  svg.innerHTML = `<title id="x-pth-t">Cylinder pressure against crank angle with valve events</title>` + s;
}

function chainHTML(r, tag) {
  const z = r.cylinders, VdC = r.Vd * 1e6;
  return `<div class="eqs" data-run="${tag}">
    <p><b>1 · Net indicated work, cylinder 1.</b> W = ∮ p dV over 720°, from this run’s p and V = <b>${f(r.Wloop, 1)} J</b>. The four cylinders average <b>${f(r.Wavg, 1)} J</b> (they breathe slightly differently through the shared manifolds); the average is used below.</p>
    <p><b>2 · Indicated mean effective pressure.</b> IMEP = W / V<sub>d</sub> = ${f(r.Wavg, 1)} J ÷ ${f(VdC, 1)} cm³ = <b>${f(r.imep / 1e5, 2)} bar</b></p>
    <p><b>3 · Friction (modelled, not measured).</b> FMEP from the Chen–Flynn correlation at ${f(r.rpm, 0)} rpm (mean piston speed ${f(2 * K12M.stroke * r.rpm / 60, 1)} m/s) = <b>${f(r.fmep / 1e5, 2)} bar</b></p>
    <p><b>4 · Brake mean effective pressure.</b> BMEP = IMEP − FMEP = ${f(r.imep / 1e5, 2)} − ${f(r.fmep / 1e5, 2)} = <b>${f(r.bmep / 1e5, 2)} bar</b></p>
    <p><b>5 · Brake torque</b> (four-stroke: one power stroke per cylinder every 2 revolutions). T = BMEP · V<sub>d</sub> · z / 4π = ${f(r.bmep, 0)} Pa × ${f(r.Vd * 1e6, 1)}×10⁻⁶ m³ × ${z} ÷ 4π = <b>${f(r.torque, 1)} N·m</b></p>
    <p><b>6 · Shaft power.</b> P = T · ω = ${f(r.torque, 1)} N·m × ${f(r.omega, 1)} rad/s = <b>${f(r.power / 1000, 2)} kW</b></p>
  </div>`;
}

function paint() {
  const A = X.A, B = X.B, st = $('x-status');
  document.querySelectorAll('[data-xrpm]').forEach(b => { b.setAttribute('aria-checked', String(+b.dataset.xrpm === X.rpm)); b.disabled = X.busy || !!A; });
  $('x-runA').disabled = X.busy; $('x-runA').textContent = A ? 'Run A again (stock)' : 'Run A: stock engine';
  const haveA = A?.valid;
  if (X.busy) st.textContent = 'Running the 1D bench until cycle-to-cycle convergence…';
  else if (A && !A.valid) st.textContent = `Run A did not converge in ${A.cycles} cycles — not plotted, no numbers shown.`;
  else if (haveA) st.textContent = `Run A: stock K12M at ${A.rpm} rpm, converged after ${A.cycles} cycles.`;
  else st.textContent = 'No run yet.';
  st.className = 'msg' + (A && !A.valid ? ' bad' : haveA ? ' ok' : '');
  document.body.dataset.xState = X.busy ? 'busy' : !A ? 'none' : !A.valid ? 'A-invalid' : !B ? 'A' : B.valid ? 'AB' : 'B-invalid';
  $('x-after-a').hidden = !haveA;
  if (!haveA) { readout(); drawPV(); drawPTheta(); return; }
  $('x-scrub').value = X.angle; $('x-play').textContent = X.playing ? 'Pause' : 'Play';
  readout(); drawPV(); drawPTheta();
  $('x-chain').innerHTML = chainHTML(A, 'A') + `<p class="note">Check: the bench’s own torque for this run is ${f(A.solverTorque, 2)} N·m; the chain above gives ${f(A.torque, 2)} N·m.</p>`;
  // A/B
  const runnerCm = +$('x-runner').value;
  $('x-runner-out').textContent = `${runnerCm} cm (Run A: ${BENCH_STOCK.runner * 100} cm)`;
  const changed = runnerCm !== BENCH_STOCK.runner * 100;
  document.querySelectorAll('[data-xpred]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.xpred === X.prediction)); b.disabled = X.busy || !changed || !!B; });
  $('x-runB').disabled = X.busy || !changed || !X.prediction || !!B;
  $('x-runner').disabled = X.busy || !!B;
  $('x-hint').textContent = !changed ? 'Move the runner length away from the stock 35 cm.' : !X.prediction ? 'Predict first: Run B unlocks after you commit.' : B ? '' : 'Ready: Run B keeps the speed, cam, throttle and everything else exactly as Run A.';
  const ab = $('x-ab');
  if (!B) { ab.innerHTML = ''; return; }
  const c = compare(A, B);
  if (!c.ok) { ab.innerHTML = `<p class="msg bad">${c.reason}</p>`; return; }
  const want = c.torque.rel > 0.01 ? 'Up' : c.torque.rel < -0.01 ? 'Down' : 'Within ±1 %';
  const tr = (k, a, b, d, u) => `<tr><th>${k}</th><td>${a}</td><td>${b}</td><td>${d}</td><td>${u}</td></tr>`;
  const ivc = A.valves.ivc % 720, iA = Math.floor(ivc), bdc = 540;
  ab.innerHTML = `<p class="result ${want === X.prediction ? 'right' : 'wrong'}">You predicted <b>${X.prediction}</b>. Brake torque ${f(c.torque.a, 1)} → ${f(c.torque.b, 1)} N·m (${sgn(c.torque.rel)}): <b>${want}</b>.</p>
    <table class="abt"><thead><tr><th></th><th>Run A</th><th>Run B</th><th>Change</th><th></th></tr></thead><tbody>
    ${tr('Intake runner', `${A.setup.runner * 100} cm`, `${B.setup.runner * 100} cm`, 'tested', 'input')}
    ${tr('Speed', `${A.rpm} rpm`, `${B.rpm} rpm`, 'held', 'input')}
    ${tr('Volumetric efficiency', f(c.ve.a * 100) + ' %', f(c.ve.b * 100) + ' %', sgn(c.ve.rel), 'bench')}
    ${tr('Work per cylinder', f(c.Wavg.a) + ' J', f(c.Wavg.b) + ' J', sgn(c.Wavg.rel), 'bench')}
    ${tr('IMEP', f(c.imep.a / 1e5, 2) + ' bar', f(c.imep.b / 1e5, 2) + ' bar', sgn(c.imep.rel), 'bench')}
    ${tr('FMEP', f(c.fmep.a / 1e5, 2) + ' bar', f(c.fmep.b / 1e5, 2) + ' bar', sgn(c.fmep.rel), 'modelled')}
    ${tr('BMEP', f(c.bmep.a / 1e5, 2) + ' bar', f(c.bmep.b / 1e5, 2) + ' bar', sgn(c.bmep.rel), 'bench − model')}
    ${tr('Brake torque', f(c.torque.a) + ' N·m', f(c.torque.b) + ' N·m', sgn(c.torque.rel), '')}
    ${tr('Shaft power', f(c.power.a / 1000, 2) + ' kW', f(c.power.b / 1000, 2) + ' kW', sgn(c.power.rel), '')}
    </tbody></table>
    <p><b>What changed.</b> Friction is modelled from speed alone here, and the speed was held, so FMEP is identical and the whole torque change comes from indicated work. That work follows the air trapped: volumetric efficiency ${sgn(c.ve.rel)}. When the intake valve closed (${ivc.toFixed(0)}°) the cylinder held ${f(A.trace.p[iA] / 1e5, 2)} bar in Run A and ${f(B.trace.p[iA] / 1e5, 2)} bar in Run B.</p>
    <p><b>Why.</b> The runner is a tuned pipe: when the intake valve opens, a pressure wave runs to the runner’s open end and reflects back, arriving at the valve after a time set by length ÷ speed of sound. Near bottom dead centre (540°) the pressure at the valve was ${f(A.trace.runner[bdc] / 1e5, 2)} bar in Run A and ${f(B.trace.runner[bdc] / 1e5, 2)} bar in Run B — ${B.trace.runner[bdc] > A.trace.runner[bdc] ? 'a stronger push' : 'a weaker push'} just as the piston turns and the valve is about to close. Switch the second chart to “Gas exchange” to see the two waves.</p>
    <p class="note">Run B converged after ${B.cycles} cycles. These are predictions of the 1D model, not measurements: the runner effect has not been checked against test data for this engine.</p>
    <div class="row"><button type="button" id="x-reset">New Run B</button></div>`;
  $('x-reset').onclick = () => { X.B = null; X.prediction = null; paint(); };
  document.body.dataset.xResult = want;
}

export function initShaft() {
  $('x-bench-inputs').textContent = BENCH_INPUTS.join(', ');
  $('x-caveat').textContent = `Validation: the bench’s one fitted constant was set at the published ${K12M_PUBLISHED.torque.Nm} N·m at ${K12M_PUBLISHED.torque.rpm} rpm; the published ${K12M_PUBLISHED.power.kW} kW at ${K12M_PUBLISHED.power.rpm} rpm is a separate check (within 4 %). One fitted torque point and one power check do not validate the full curve, or effects such as runner length.`;
  document.querySelectorAll('[data-xrpm]').forEach(b => b.onclick = () => { X.rpm = +b.dataset.xrpm; paint(); });
  $('x-runA').onclick = () => { X.angle = 0; X.playing = false; run('A', BENCH_STOCK); };
  $('x-runB').onclick = () => run('B', { ...BENCH_STOCK, runner: +$('x-runner').value / 100 });
  $('x-runner').oninput = () => paint();
  $('x-scrub').oninput = e => { X.angle = +e.target.value; X.playing = false; readout(); drawPV(); drawPTheta(); $('x-play').textContent = 'Play'; };
  $('x-play').onclick = () => { X.playing = !X.playing; paint(); };
  document.querySelectorAll('[data-xpred]').forEach(b => b.onclick = () => { X.prediction = b.dataset.xpred; paint(); });
  document.querySelectorAll('[data-xpv]').forEach(b => b.onclick = () => { X.pv = b.dataset.xpv; document.querySelectorAll('[data-xpv]').forEach(c => c.setAttribute('aria-checked', String(c === b))); drawPV(); });
  document.querySelectorAll('[data-xpth]').forEach(b => b.onclick = () => { X.pth = b.dataset.xpth; document.querySelectorAll('[data-xpth]').forEach(c => c.setAttribute('aria-checked', String(c === b))); drawPTheta(); });
  paint();
  window.__shaft = { X, setMaxCycles: n => { X.maxCycles = n; } };   // used by browser tests
  return {
    // When the experiment owns the clock, the 3D cutaway follows its crank angle.
    tick(dt, moduleOpen) {
      if (!moduleOpen || !X.A?.valid) return null;
      if (X.playing) { X.angle = (X.angle + dt * 60) % 720; $('x-scrub').value = X.angle; readout(); drawPV(); drawPTheta(); }
      return X.angle;
    },
  };
}
