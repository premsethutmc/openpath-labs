import { operate, arrangedHead, systemHead, gradeLines, water, MATERIALS, STOCK_SYSTEM, STOCK_PUMP } from '../engines/hydraulics/hydraulics.mjs';
import { MISSIONS, COURSE } from './missions.mjs';

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let S = clone(STOCK_SYSTEM), P = clone(STOCK_PUMP), op = null, chart = 'curve', mode = 'learn';

const SCENARIOS = {
  stock: { name: 'Hostel block', patch: {} },
  summer: { name: 'Summer: water table falls', patch: { sumpLevel: -7 } },
  hot: { name: 'Solar hot water, 85 °C', patch: { temp: 85 } },
  old: { name: 'Pipes 15 years old', patch: { suction: { ...STOCK_SYSTEM.suction, material: 'oldgi' }, delivery: { ...STOCK_SYSTEM.delivery, material: 'oldgi' } } },
  ooty: { name: 'Hill station, Ooty 2240 m', patch: { altitude: 2240, sumpLevel: -6 } },
  tower: { name: '12-storey tower', patch: { tankHeight: 40, delivery: { ...STOCK_SYSTEM.delivery, L: 60 } } },
  rush: { name: 'Morning rush: both pumps', patch: { arrangement: 'parallel' } },
};
let scenario = 'stock';
function apply(patch = {}) {
  S = clone(STOCK_SYSTEM); P = clone(STOCK_PUMP);
  for (const [k, v] of Object.entries(patch)) { if (k === 'rpm' || k === 'D2') P[k] = v; else S[k] = clone(v); }
  update();
}

// ---------- plant schematic ----------
const NS = 'http://www.w3.org/2000/svg';
let flowPaths = [], dash = 0, impAngle = 0;
function drawPlant() {
  const zBot = Math.min(S.sumpLevel, 0) - 2.5, zTop = S.tankHeight + 4, k = 285 / (zTop - zBot), y = z => 312 - (z - zBot) * k;
  const g0 = y(0), roof = y(S.tankHeight - 2.5), tankTop = y(S.tankHeight + 2.2), wl = y(S.tankHeight);
  const sumpTop = y(Math.max(S.sumpLevel + 1, 0.4)), sumpW = y(S.sumpLevel), sumpBot = y(zBot + 0.3);
  const floors = []; for (let z = 3; z < S.tankHeight - 2.5; z += 3) floors.push(`<line x1="214" x2="306" y1="${y(z)}" y2="${y(z)}" stroke="#c7cdd2"/>`);
  for (let z = 1.5; z < S.tankHeight - 3.5; z += 3) floors.push(`<rect x="226" y="${y(z) - 6}" width="12" height="8" fill="#b9d3ea"/><rect x="282" y="${y(z) - 6}" width="12" height="8" fill="#b9d3ea"/>`);
  const Vd = op.delivery.V, flowing = op.Q > 0;
  const bar = pa => `${(pa / 1e5).toFixed(2)} bar`;
  const svg = $('plant');
  svg.innerHTML = `
    <rect x="0" y="${g0 + 6}" width="360" height="${330 - g0}" fill="#d9cdb8"/><line x1="0" x2="360" y1="${g0 + 6}" y2="${g0 + 6}" stroke="#8a7b62" stroke-width="2"/>
    <rect x="22" y="${sumpTop}" width="86" height="${sumpBot - sumpTop}" fill="#f4f6f7" stroke="#6b7680" stroke-width="2"/>
    <rect x="24" y="${sumpW}" width="82" height="${sumpBot - sumpW - 1}" fill="#4f8fc6" opacity=".85"/>
    <text x="86" y="${sumpBot - 6}" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">sump</text>
    <rect x="212" y="${roof}" width="96" height="${g0 + 6 - roof}" fill="#eef0f1" stroke="#9aa3aa"/>${floors.join('')}
    <rect x="228" y="${tankTop}" width="64" height="${roof - tankTop}" fill="#f4f6f7" stroke="#6b7680" stroke-width="2"/>
    <rect id="tankwater" x="230" y="${wl}" width="60" height="${roof - wl - 1}" fill="#4f8fc6" opacity=".85"/>
    <text x="260" y="${tankTop + 14}" text-anchor="middle" font-size="8" font-weight="700" fill="#3d4a55">tank</text>
    <path class="pipe" d="M58 ${sumpBot - 10} V ${g0} H 140" fill="none" stroke="#7b8790" stroke-width="7"/>
    <path class="pipe" d="M176 ${g0} H 196 V ${tankTop - 8} H 246 V ${tankTop + 4}" fill="none" stroke="#7b8790" stroke-width="6"/>
    <path class="flow" data-v="${op.suction.V}" d="M58 ${sumpBot - 10} V ${g0} H 140" fill="none" stroke="#bfe0ff" stroke-width="3" stroke-dasharray="6 9" opacity="${flowing ? 1 : 0}"/>
    <path class="flow" data-v="${Vd}" d="M176 ${g0} H 196 V ${tankTop - 8} H 246 V ${tankTop + 4}" fill="none" stroke="#bfe0ff" stroke-width="2.6" stroke-dasharray="6 9" opacity="${flowing ? 1 : 0}"/>
    ${flowing ? `<line x1="246" x2="246" y1="${tankTop + 4}" y2="${wl}" stroke="#7fb6e6" stroke-width="${Math.min(4, 1 + op.Q * 800)}"/>` : ''}
    <rect x="52" y="${sumpBot - 12}" width="12" height="7" rx="2" fill="#4b5560"/>
    <g transform="translate(158 ${g0})"><circle r="17" fill="#2f6db5" stroke="#173a63" stroke-width="2"/><g id="impeller">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M0 0 Q 6 -4 ${(12 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(12 * Math.sin(a * Math.PI / 180)).toFixed(1)}" stroke="#dfeaf6" stroke-width="2" fill="none" transform="rotate(${a})"/>`).join('')}</g>
      <rect x="-12" y="17" width="24" height="7" fill="#4b5560"/><rect x="18" y="-9" width="22" height="18" rx="3" fill="#5a6772"/><text x="29" y="3" text-anchor="middle" font-size="7" fill="#fff" font-weight="700">M</text>
      <g id="bubbles"></g></g>
    <text x="100" y="${g0 + 24}" text-anchor="middle" font-size="8.5" fill="#3d4a55">suction ${bar(op.inletGauge)}</text>
    <text x="190" y="${g0 + 36}" text-anchor="middle" font-size="8.5" fill="#3d4a55">delivery ${bar(op.outletGauge)}</text>
    <g font-size="8.5" fill="#3d4a55"><line x1="322" x2="322" y1="${sumpW}" y2="${wl}" stroke="#3d4a55" marker-start="url(#ar)" marker-end="url(#ar)"/>
      <text x="330" y="${(sumpW + wl) / 2}" writing-mode="tb" text-anchor="middle">static lift ${op.staticHead.toFixed(1)} m</text></g>
    <defs><marker id="ar" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6z" fill="#3d4a55"/></marker></defs>`;
  flowPaths = [...svg.querySelectorAll('.flow')];
}

// ---------- charts ----------
function axes(x0, y0, w, h, xmax, ymax, xl, yl, yticks = 5) {
  let s = `<line class="ax" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"/><line class="ax" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}"/>`;
  for (let i = 1; i <= yticks; i++) { const v = ymax * i / yticks, yy = y0 - h * i / yticks; s += `<line class="grid" x1="${x0}" x2="${x0 + w}" y1="${yy}" y2="${yy}"/><text x="${x0 - 4}" y="${yy + 3}" text-anchor="end">${+v.toFixed(1)}</text>`; }
  for (let i = 1; i <= 5; i++) { const v = xmax * i / 5; s += `<text x="${x0 + w * i / 5}" y="${y0 + 12}" text-anchor="middle">${+v.toFixed(v < 10 ? 1 : 0)}</text>`; }
  return s + `<text x="${x0 + w / 2}" y="${y0 + 25}" text-anchor="middle">${xl}</text><text x="10" y="${y0 - h / 2}" transform="rotate(-90 10 ${y0 - h / 2})" text-anchor="middle">${yl}</text>`;
}
function drawChart() {
  const svg = $('chart'), w = op.water, arr = S.arrangement;
  document.querySelectorAll('[data-chart]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.chart === chart)));
  if (chart === 'curve') {
    let qmax = 0.0005; while (arrangedHead(qmax, P, w, arr).H > 0 && qmax < 1) qmax *= 1.1;
    const h0 = arrangedHead(0, P, w, arr).H, hmax = Math.ceil(Math.max(h0 * 1.15, op.staticHead + 4) / 5) * 5, X = 44, Y = 190, W = 290, H = 165;
    const px = q => X + q / qmax * W, py = h => Y - Math.max(0, Math.min(h, hmax)) / hmax * H;
    const n = 60, pump = [], sys = [], eff = [];
    for (let i = 0; i <= n; i++) { const q = qmax * i / n, a = arrangedHead(q, P, w, arr), s = systemHead(q, S, w).H; pump.push(`${px(q)},${py(a.H)}`); if (s <= hmax) sys.push(`${px(q)},${py(s)}`); eff.push(`${px(q)},${Y - Math.max(0, w.rho * 9.81 * q * a.H / a.Pshaft) * H}`); }
    svg.innerHTML = axes(X, Y, W, H, qmax * 1000, hmax, 'Flow (litres per second)', 'Head (m)') +
      `<polyline points="${eff.join(' ')}" fill="none" stroke="#3fae6a" stroke-width="1.6" stroke-dasharray="4 3"/>
       <polyline points="${pump.join(' ')}" fill="none" stroke="#1d58c8" stroke-width="2.4"/>
       <polyline points="${sys.join(' ')}" fill="none" stroke="#e0531f" stroke-width="2.4"/>
       <line x1="${X}" x2="${X + W}" y1="${py(op.staticHead)}" y2="${py(op.staticHead)}" stroke="#e0531f" stroke-width=".8" stroke-dasharray="2 3"/>
       ${op.Q > 0 ? `<circle cx="${px(op.Q)}" cy="${py(op.H)}" r="5" fill="#13202c"/><text x="${px(op.Q) + 7}" y="${py(op.H) - 7}" font-weight="800">operating point</text>` : `<text x="${X + 8}" y="${py(h0) - 6}" fill="#c2410c" font-weight="800">pump curve never meets the system curve</text>`}
       <g transform="translate(${X + 6} 14)"><rect width="10" height="3" y="-3" fill="#1d58c8"/><text x="14">pump${arr === 'single' ? '' : arr === 'parallel' ? 's in parallel' : 's in series'}</text><rect x="92" width="10" height="3" y="-3" fill="#e0531f"/><text x="106">pipes (system)</text><rect x="178" width="10" height="3" y="-3" fill="#3fae6a"/><text x="192">efficiency (0–100 %)</text></g>`;
    $('chart-note').textContent = 'Blue: the head the pump can give at each flow. Orange: the head the pipes demand (static lift + friction, rising with flow²). The pump settles where they cross.';
  } else if (chart === 'energy') {
    const pts = gradeLines(S, op), L = pts.at(-1).x, zs = pts.flatMap(p => [p.z, p.egl, p.hgl]);
    const lo = Math.floor(Math.min(...zs) - 1), hi = Math.ceil(Math.max(...zs) + 2), X = 44, Y = 190, W = 290, H = 165;
    const px = x => X + x / L * W, py = z => Y - (z - lo) / (hi - lo) * H;
    const line = (key, col, dashA, wd) => `<polyline points="${pts.map(p => `${px(p.x)},${py(p[key])}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${wd}" ${dashA ? `stroke-dasharray="${dashA}"` : ''}/>`;
    let s = `<line class="ax" x1="${X}" y1="${Y}" x2="${X + W}" y2="${Y}"/><line class="ax" x1="${X}" y1="${Y}" x2="${X}" y2="${Y - H}"/>`;
    for (let i = 0; i <= 4; i++) { const z = lo + (hi - lo) * i / 4; s += `<line class="grid" x1="${X}" x2="${X + W}" y1="${py(z)}" y2="${py(z)}"/><text x="${X - 4}" y="${py(z) + 3}" text-anchor="end">${z.toFixed(0)}</text>`; }
    const pump = pts.find(p => p.label === 'pump inlet');
    svg.innerHTML = s + line('z', '#9aa6ae', '', 5) + line('hgl', '#1d58c8', '', 2) + line('egl', '#c2410c', '5 3', 1.8) +
      `<text x="${px(pump.x) + 6}" y="${py(pump.hgl) - 5}">pump inlet: ${(pump.hgl - pump.z).toFixed(1)} m (${pump.hgl - pump.z < 0 ? 'suction' : 'pressure'})</text>
       <text x="${px(pump.x) + 4}" y="${py(pump.egl + op.H) - 4}">pump adds ${op.H.toFixed(1)} m</text>
       <text x="${X + W / 2}" y="${Y + 18}" text-anchor="middle">distance along the pipe from sump to tank (${L.toFixed(0)} m)</text><text x="10" y="${Y - H / 2}" transform="rotate(-90 10 ${Y - H / 2})" text-anchor="middle">height (m)</text>
       <g transform="translate(${X + 6} 14)"><rect width="10" height="4" y="-3" fill="#9aa6ae"/><text x="14">pipe</text><rect x="46" width="10" height="3" y="-3" fill="#1d58c8"/><text x="60">hydraulic grade line</text><rect x="152" width="10" height="3" y="-3" fill="#c2410c"/><text x="166">total energy line</text></g>`;
    $('chart-note').textContent = 'Total energy (Bernoulli: z + p/ρg + V²/2g) falls with every metre of pipe and every fitting, and jumps where the pump adds work. Where the blue line is below the pipe, the pressure is below atmospheric (suction).';
  } else {
    const p = op.pump, kx = 220 / p.u2, ex = 6, X = 60, Y = 160;
    const cm = p.cm2 * kx * ex, cuA = p.cu2 * kx, cuI = p.cu2inf * kx, u = p.u2 * kx;
    const v = (x1, y1, x2, y2, c, d = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2.2" ${d} marker-end="url(#ah${c.slice(1)})"/>`;
    const mk = c => `<marker id="ah${c.slice(1)}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6z" fill="${c}"/></marker>`;
    svg.innerHTML = `<defs>${['#13202c', '#1d58c8', '#e0531f', '#9aa6ae'].map(mk).join('')}</defs>
      ${v(X, Y, X + u, Y, '#13202c')}<text x="${X + u / 2}" y="${Y + 14}" text-anchor="middle">blade speed u₂ = ${p.u2.toFixed(1)} m/s</text>
      ${v(X, Y, X + cuI, Y - cm, '#9aa6ae', 'stroke-dasharray="4 3"')}${v(X, Y, X + cuA, Y - cm, '#1d58c8')}
      ${v(X + u, Y, X + cuA, Y - cm, '#e0531f')}
      <text x="${X + cuA - 4}" y="${Y - cm - 8}" text-anchor="end" fill="#1d58c8">water leaves at c₂ (whirl ${p.cu2.toFixed(1)} m/s)</text>
      <text x="${X + u}" y="${Y - cm - 22}" text-anchor="end" fill="#6b7680">no slip: whirl would be ${p.cu2inf.toFixed(1)} m/s</text>
      <text x="${X + u}" y="${Y + 28}" text-anchor="end" fill="#e0531f">orange: water relative to the blade, w₂ (blade angle ${P.beta2}°)</text>
      <text x="20" y="22" font-weight="800">Euler: head = u₂ × whirl ÷ g = ${(p.u2 * p.cu2 / 9.81).toFixed(1)} m (before losses)</text>
      <text x="20" y="36">slip factor ${p.slip.toFixed(2)} · radial speed ${p.cm2.toFixed(2)} m/s, drawn ×${ex} taller</text>
      <text x="20" y="${Y + 50}">Delivered: ${op.H.toFixed(1)} m. The rest is lost to friction and shock.</text>`;
    $('chart-note').textContent = 'Velocity triangle at the impeller outlet. Faster blades (speed, diameter) mean more whirl and more head: H ∝ u₂². More flow means a bigger radial speed and, with backward-curved blades, less whirl — that is why the pump curve slopes down.';
  }
}

// ---------- gauges, status, controls ----------
function update() {
  op = operate(S, P);
  const ok = !op.noFlow;
  $('g-q').textContent = ok ? `${(op.Q * 60000).toFixed(0)} L/min` : '0';
  $('g-h').textContent = `${op.H.toFixed(1)} m`;
  $('g-p').textContent = `${(op.power / 1000).toFixed(2)} kW`;
  $('g-e').textContent = ok ? `${Math.round(op.eff * 100)} %` : '0 %';
  $('g-n').textContent = `${op.npsha.toFixed(1)} / ${op.npshr.toFixed(1)} m`; $('g-n').classList.toggle('warn', op.cavitating);
  $('g-t').textContent = ok ? (op.fillMinutes > 600 ? `${(op.fillMinutes / 60).toFixed(0)} h` : `${op.fillMinutes.toFixed(0)} min`) : 'never';
  const st = $('status');
  if (!ok) { st.textContent = 'No flow — the pump cannot reach the tank'; st.className = 'state idle'; }
  else if (op.cavitating) { st.textContent = 'Cavitating — rattling, damaging the impeller'; st.className = 'state bad'; }
  else if (op.Q < 0.0004) { st.textContent = 'Trickle — nearly shut off'; st.className = 'state shedding'; }
  else { st.textContent = `Running · pipe flow ${op.delivery.regime}, Re ${Math.round(op.delivery.Re).toLocaleString('en-IN')}`; st.className = 'state steady'; }
  document.body.dataset.status = !ok ? 'noflow' : op.cavitating ? 'cavitating' : 'running';
  drawPlant(); drawChart(); paintControls();
}
const DIAS = [0.025, 0.032, 0.04, 0.05, 0.065];
function paintControls() {
  $('scenarios').innerHTML = Object.entries(SCENARIOS).map(([k, v]) => `<button type="button" role="radio" data-s="${k}" aria-checked="${k === scenario}">${v.name}</button>`).join('');
  $('scenarios').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { scenario = b.dataset.s; apply(SCENARIOS[scenario].patch); });
  const set = (id, v, txt) => { $(id).value = v; $(id + '-out').textContent = txt; };
  set('rpm', P.rpm, `${P.rpm} rpm`); set('d2', Math.round(P.D2 * 1000), `${Math.round(P.D2 * 1000)} mm`);
  set('valve', Math.round(S.valveOpen * 100), `${Math.round(S.valveOpen * 100)} %`);
  set('len', S.delivery.L, `${S.delivery.L} m`); set('tank', S.tankHeight, `${S.tankHeight} m`);
  set('sump', S.sumpLevel, `${S.sumpLevel > 0 ? '+' : ''}${S.sumpLevel} m`); set('temp', S.temp, `${S.temp} °C (boils at ${(op.water.pv / 1000).toFixed(1)} kPa)`);
  set('alt', S.altitude, `${S.altitude} m (air ${(op.patm / 1000).toFixed(0)} kPa)`);
  document.querySelectorAll('[data-arr]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.arr === S.arrangement)));
  $('dia').innerHTML = DIAS.map(d => `<button type="button" role="radio" data-d="${d}" aria-checked="${Math.abs(d - S.delivery.D) < 1e-6}">${d * 1000} mm</button>`).join('');
  $('dia').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { S.delivery.D = +b.dataset.d; update(); });
  if (!$('mat').options.length) $('mat').innerHTML = Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}">${m.name} — roughness ${(m.eps * 1000).toPrecision(2)} mm</option>`).join('');
  $('mat').value = S.delivery.material;
}
const bind = (id, fn) => $(id).addEventListener('input', e => { fn(+e.target.value); update(); });
bind('rpm', v => P.rpm = v); bind('d2', v => P.D2 = v / 1000); bind('valve', v => S.valveOpen = v / 100);
bind('len', v => S.delivery.L = v); bind('tank', v => S.tankHeight = v); bind('sump', v => S.sumpLevel = v);
bind('temp', v => S.temp = v); bind('alt', v => S.altitude = v);
$('mat').onchange = e => { S.delivery.material = S.suction.material = e.target.value; update(); };
document.querySelectorAll('[data-arr]').forEach(b => b.onclick = () => { S.arrangement = b.dataset.arr; update(); });
document.querySelectorAll('[data-chart]').forEach(b => b.onclick = () => { chart = b.dataset.chart; drawChart(); });

// ---------- missions ----------
const M = { i: 0, guess: null, res: null };
function startMission(i) {
  M.i = Math.max(0, Math.min(MISSIONS.length - 1, i)); M.guess = null; M.res = null;
  scenario = 'stock'; apply(MISSIONS[M.i].setup); chart = 'curve'; drawChart();
  try { localStorage.setItem('pumps.mission', String(M.i)); } catch {}
  paintMission();
}
function paintMission() {
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  const hide = mode === 'learn' && !M.res;
  ['c-scen', 'c-pump', 'c-pipe', 'c-site'].forEach(id => $(id).classList.toggle('learn-hidden', hide));
  if (mode !== 'learn') return;
  const m = MISSIONS[M.i], el = $('mission');
  let h = `<div class="mhead"><span>Mission ${M.i + 1} of ${MISSIONS.length}</span><div class="dots">${MISSIONS.map((_, k) => `<i class="${k <= M.i ? 'on' : ''}"></i>`).join('')}</div></div>
    <span class="unit">${COURSE} · ${m.unit}</span><h2>${m.title}</h2><p>${m.intro}</p>`;
  if (!M.res) h += `<p class="think">Pause and think</p><p>${m.q}</p><div class="row">${m.options.map(o => `<button type="button" class="guess" data-g="${o}">${o}</button>`).join('')}</div>`;
  else {
    const right = M.guess === M.res.a;
    h += `<p class="result ${right ? 'right' : 'wrong'}">${right ? 'Right' : 'Not quite'} — the model says: ${M.res.a}.</p><p class="measured">${M.res.m}</p><p>${m.explain}</p><p class="task">Now try it: ${m.task}</p>
      <div class="row">${M.i > 0 ? '<button type="button" id="m-prev">Back</button>' : ''}${M.i < MISSIONS.length - 1 ? '<button type="button" class="primary" id="m-next">Next mission</button>' : '<button type="button" class="primary" id="m-explore">Explore freely</button>'}</div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { M.guess = b.dataset.g; M.res = m.answer(); if (m.after) apply({ ...m.setup, ...m.after }); paintMission(); });
  const nx = $('m-next'); if (nx) nx.onclick = () => startMission(M.i + 1);
  const pv = $('m-prev'); if (pv) pv.onclick = () => startMission(M.i - 1);
  const ex = $('m-explore'); if (ex) ex.onclick = () => setMode('explore');
}
function setMode(m) { mode = m; try { localStorage.setItem('pumps.mode', m); } catch {} paintMission(); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

// ---------- animation: moving water, spinning impeller, cavitation bubbles ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!reduced && op) {
    dash += dt * 14;
    for (const p of flowPaths) p.setAttribute('stroke-dashoffset', String(-dash * +p.dataset.v * 3));
    impAngle = (impAngle + dt * 360 * (P.rpm / 2900) * 1.2) % 360;
    $('impeller')?.setAttribute('transform', `rotate(${impAngle})`);
    const bub = $('bubbles');
    if (bub) bub.innerHTML = op.cavitating && op.Q > 0 ? Array.from({ length: 8 }, () => `<circle class="bubble" cx="${(Math.random() - 0.7) * 20}" cy="${(Math.random() - 0.5) * 16}" r="${1 + Math.random() * 2}"/>`).join('') : '';
  }
  requestAnimationFrame(frame);
}
try { mode = localStorage.getItem('pumps.mode') || 'learn'; } catch {}
update();
if (mode === 'learn') { let i = 0; try { i = +(localStorage.getItem('pumps.mission') || 0); } catch {} startMission(i); } else paintMission();
requestAnimationFrame(frame);
window.__pumps = { get op() { return op; }, get S() { return S; }, get P() { return P; } };
document.body.dataset.ready = 'true';
