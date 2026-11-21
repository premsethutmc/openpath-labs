import { recip, STOCK_RECIP } from '../engines/hydraulics/reciprocating.mjs';
import { workbench } from '../core/workbench.mjs';

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const COURSE = 'Anna University CE3391 Fluid Mechanics and Machinery · Unit IV · Reciprocating pump';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let P = clone(STOCK_RECIP), R = recip(P), mode = 'learn', theta = 0;

const MISSIONS = [
  { title: 'Twice the speed', intro: 'The crank turns at 60 rpm. The motor is changed so it turns at 120 rpm.',
    q: 'What happens to the discharge?', options: ['Doubles', 'Rises a little', 'Stays the same'],
    answer: () => { const a = recip(STOCK_RECIP), b = recip({ ...STOCK_RECIP, rpm: 120 }), r = b.Q / a.Q; return { a: r > 1.9 ? 'Doubles' : r > 1.05 ? 'Rises a little' : 'Stays the same', m: `Discharge ${(a.Q * 60000).toFixed(0)} → ${(b.Q * 60000).toFixed(0)} L/min. Q = Cd·A·L·N/60.` }; },
    explain: 'A piston pump is a positive-displacement machine: every stroke pushes out one cylinder-full, whatever the pressure. Flow is set by speed, not by the pipes — unlike a centrifugal pump.', task: 'Raise the delivery height: discharge does not change, but power does.', open: 'site' },
  { title: 'Where is the pressure lowest?', intro: 'During the suction stroke the piston drags the whole water column in the suction pipe after it.',
    q: 'When is the pressure in the cylinder lowest during the suction stroke?', options: ['At the start of the stroke', 'In the middle', 'At the end'],
    answer: () => { const d = recip(STOCK_RECIP).diagram.filter(p => p.th <= 180), lo = d.reduce((a, b) => (b.h < a.h ? b : a)); return { a: lo.th < 45 ? 'At the start of the stroke' : lo.th > 135 ? 'At the end' : 'In the middle', m: `Lowest cylinder head ${lo.h.toFixed(1)} m at crank angle ${lo.th}°.` }; },
    explain: 'At the start of the stroke the piston accelerates fastest, so it must accelerate the water column hardest: the acceleration head h_a = (L/g)(A/a)ω²r is largest there. In mid-stroke the acceleration is zero and only friction is left.', task: 'Open the indicator diagram and lengthen the suction pipe: watch the line tilt.', open: 'indicator' },
  { title: 'Faster still', intro: 'At 60 rpm the pressure at the start of suction stays above the point where dissolved air comes out.',
    q: 'At 120 rpm, will the water column separate from the piston?', options: ['Yes', 'No'],
    answer: () => { const b = recip({ ...STOCK_RECIP, rpm: 120 }); return { a: b.separation ? 'Yes' : 'No', m: `Lowest absolute head ${b.minAbsSuction.toFixed(1)} m (limit 2.5 m). This pump separates above ${Math.round(recip(STOCK_RECIP).sepRpm)} rpm.` }; },
    explain: 'Acceleration head grows with speed squared. When the absolute pressure falls below about 2.5 m of water, air and vapour come out, the column breaks away and later slams back — noise, vibration and damaged valves. That is why piston pumps run slowly.', task: 'Fit air vessels and try 120 rpm again.', open: 'pipes', after: { rpm: 120 } },
  { title: 'Air vessels', intro: 'An air vessel is a closed tank of trapped air right next to the cylinder. It stores and returns water every stroke, so the long pipe beyond it flows steadily.',
    q: 'How much of the friction work in the delivery pipe does an air vessel save on this single-acting pump?', options: ['About 85 %', 'About 40 %', 'None'],
    answer: () => { const a = recip(STOCK_RECIP), b = recip({ ...STOCK_RECIP, vesselD: true }), s = 1 - b.delivery.hfVessel / (2 / 3 * a.delivery.hfMax); return { a: s > 0.7 ? 'About 85 %' : s > 0.2 ? 'About 40 %' : 'None', m: `Friction work saved: ${(s * 100).toFixed(1)} % (textbook: 84.8 %; double-acting 39.2 %).` }; },
    explain: 'Without a vessel the pipe velocity swings from zero to a peak (friction ∝ V²). With one, the water flows at the steady average speed — the same volume with far less friction, and no acceleration head at all.', task: 'Compare the indicator diagram with and without vessels.', open: 'indicator', after: { vesselD: true, vesselS: true } },
];

// ---------- drawing the rig ----------
function rig() {
  const s = $('rig'), r = R, suction = Math.sin(theta) >= 0;
  const Sx = Math.min(380, 76 / P.stroke), Rc = r.r * Sx, cy = 150, bore = Math.max(18, Math.min(60, P.D * 300));
  const cylL = 110, cylLen = 2 * Rc + 18, cylR = cylL + 10 + cylLen, pistonRod = cylLen + 6, rodLen = 2 * Rc + 6;
  const crankX = cylL + 10 + Rc + rodLen + pistonRod, crankR = Rc;
  const cpx = crankX - Rc * Math.cos(theta), cpy = cy - Rc * Math.sin(theta), crossX = cpx - rodLen, px = crossX - pistonRod;
  const h = r.head(theta), abs = r.Hatm + h, sep = abs < 2.5;
  const shade = h < 0 ? `rgb(${Math.round(20 + 30 * Math.min(1, -h / 10))},${Math.round(60 + 40 * Math.min(1, -h / 10))},110)` : `rgb(${Math.round(30 + 160 * Math.min(1, h / 50))},${Math.round(80 - 30 * Math.min(1, h / 50))},${Math.round(130 - 80 * Math.min(1, h / 50))})`;
  const vOpenS = suction && Math.sin(theta) > 0.05, vOpenD = !suction && Math.sin(theta) < -0.05;
  const vessel = (xv, y0, on) => on ? `<path d="M${xv - 10} ${y0} v-26 a10 10 0 0 1 20 0 v26" fill="#0d151b" stroke="#a8b8c3"/><rect x="${xv - 9}" y="${y0 - 10}" width="18" height="10" fill="#1f5f8f"/><text x="${xv}" y="${y0 - 40}" class="t" text-anchor="middle">air</text>` : '';
  s.innerHTML = `<style>.t{font:500 7.5px "JetBrains Mono",ui-monospace,monospace;fill:#8fa3b0}.tl{font:600 8px "JetBrains Mono",ui-monospace,monospace;fill:#e6eef3}</style>
    <defs><pattern id="g" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#16222b" stroke-width=".6"/></pattern>
      <pattern id="e" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#15130f"/><path d="M0 0v7" stroke="#3b3326" stroke-width="1.2"/></pattern></defs>
    <rect width="420" height="300" fill="url(#g)"/>
    <rect x="0" y="230" width="420" height="70" fill="url(#e)"/><line x1="0" x2="420" y1="230" y2="230" stroke="#6d8796"/>
    <rect x="40" y="246" width="110" height="44" fill="#0d151b" stroke="#a8b8c3"/><rect x="41" y="258" width="108" height="31" fill="#1f5f8f" opacity=".75"/><text x="95" y="284" class="tl" text-anchor="middle">SUMP</text>
    <rect x="12" y="16" width="70" height="34" fill="#0d151b" stroke="#a8b8c3"/><rect x="13" y="28" width="68" height="21" fill="#1f5f8f" opacity=".75"/><text x="47" y="44" class="tl" text-anchor="middle">TANK</text>
    <path d="M110 268 V ${cy + 30} H ${cylL + 6} V ${cy + bore / 2}" fill="none" stroke="#4a5f6c" stroke-width="7"/><path d="M110 268 V ${cy + 30} H ${cylL + 6} V ${cy + bore / 2}" fill="none" stroke="${vOpenS ? '#7fd4ff' : '#0d151b'}" stroke-width="4"/>
    <path d="M${cylL + 6} ${cy - bore / 2} V ${cy - 40} H 60 V 50" fill="none" stroke="#4a5f6c" stroke-width="7"/><path d="M${cylL + 6} ${cy - bore / 2} V ${cy - 40} H 60 V 50" fill="none" stroke="${vOpenD ? '#7fd4ff' : '#0d151b'}" stroke-width="4"/>
    ${vessel(cylL - 18, cy + 30, P.vesselS)}${vessel(cylL - 18, cy - 40, P.vesselD)}
    <rect x="${cylL}" y="${cy - bore / 2}" width="${cylR - cylL}" height="${bore}" fill="#0d151b" stroke="#a8b8c3" stroke-width="1.4"/>
    <rect x="${cylL + 1}" y="${cy - bore / 2 + 1}" width="${px - cylL - 1}" height="${bore - 2}" fill="${sep ? '#5a2420' : shade}"/>
    ${sep ? `<g fill="#e6f4ff">${Array.from({ length: 10 }, () => `<circle cx="${cylL + 4 + Math.random() * (px - cylL - 8)}" cy="${cy - bore / 2 + 3 + Math.random() * (bore - 6)}" r="${0.8 + Math.random() * 1.5}"/>`).join('')}</g>` : ''}
    <rect x="${px}" y="${cy - bore / 2 + 1}" width="10" height="${bore - 2}" fill="#25333d" stroke="#e6eef3"/>
    <line x1="${px + 10}" y1="${cy}" x2="${crossX}" y2="${cy}" stroke="#a8b8c3" stroke-width="3"/><rect x="${crossX - 6}" y="${cy - 6}" width="12" height="12" fill="#0d151b" stroke="#a8b8c3"/><line x1="${cylR + 4}" x2="${crankX - Rc - 4}" y1="${cy - 9}" y2="${cy - 9}" stroke="#2c3e4a"/><line x1="${cylR + 4}" x2="${crankX - Rc - 4}" y1="${cy + 9}" y2="${cy + 9}" stroke="#2c3e4a"/>
    <line x1="${crossX}" y1="${cy}" x2="${cpx}" y2="${cpy}" stroke="#a8b8c3" stroke-width="4"/>
    <circle cx="${crankX}" cy="${cy}" r="${crankR + 6}" fill="none" stroke="#2c3e4a" stroke-dasharray="3 3"/><line x1="${crankX}" y1="${cy}" x2="${cpx}" y2="${cpy}" stroke="#ff8a3d" stroke-width="5"/><circle cx="${crankX}" cy="${cy}" r="4" fill="#0d151b" stroke="#e6eef3"/><circle cx="${cpx}" cy="${cpy}" r="3" fill="#ff8a3d"/>
    <rect x="${cylL + 1}" y="${cy + bore / 2 - 2}" width="10" height="4" fill="${vOpenS ? '#3fbf7f' : '#6d8796'}"/><rect x="${cylL + 1}" y="${cy - bore / 2 - 2}" width="10" height="4" fill="${vOpenD ? '#3fbf7f' : '#6d8796'}"/>
    <text x="${cylL + 16}" y="${cy + bore / 2 + 12}" class="t">suction valve ${vOpenS ? 'open' : 'shut'}</text><text x="${cylL + 16}" y="${cy - bore / 2 - 6}" class="t">delivery valve ${vOpenD ? 'open' : 'shut'}</text>
    <text x="${(cylL + cylR) / 2}" y="${cy + 3}" class="tl" text-anchor="middle">${h >= 0 ? '+' : ''}${h.toFixed(1)} m</text>
    <text x="392" y="${cy + crankR + 20}" class="t" text-anchor="end">${suction ? 'SUCTION' : 'DELIVERY'} stroke · crank ${Math.round(theta * 180 / Math.PI) % 360}°</text>
    <line x1="398" x2="398" y1="258" y2="28" stroke="#4fc3f7" stroke-width=".8"/><text x="410" y="150" class="t" writing-mode="tb" text-anchor="middle" fill="#4fc3f7">hs ${P.hs} m + hd ${P.hd} m</text>`;
  $('g-h').textContent = `${h >= 0 ? '+' : ''}${h.toFixed(1)} m`;
}

function indicator() {
  const d = R.diagram, X0 = 44, Y0 = 200, W = 296, H = 175;
  const hs = d.map(q => q.h), lo = Math.min(-R.Hatm, ...hs) - 1, hi = Math.max(...hs) + 2, xmax = 2 * R.r;
  const X = x => X0 + x / xmax * W, Y = h => Y0 - (h - lo) / (hi - lo) * H;
  let s = `<line class="ax" x1="${X0}" y1="${Y0}" x2="${X0 + W}" y2="${Y0}"/><line class="ax" x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y0 - H}"/>`;
  for (let i = 0; i <= 5; i++) { const h = lo + (hi - lo) * i / 5; s += `<line class="grid" x1="${X0}" x2="${X0 + W}" y1="${Y(h)}" y2="${Y(h)}"/><text x="${X0 - 4}" y="${Y(h) + 3}" text-anchor="end">${h.toFixed(0)}</text>`; }
  s += `<line x1="${X0}" x2="${X0 + W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#6d8796" stroke-dasharray="3 3"/><text x="${X0 + W}" y="${Y(0) - 3}" text-anchor="end">atmosphere</text>`;
  s += `<line x1="${X0}" x2="${X0 + W}" y1="${Y(2.5 - R.Hatm)}" y2="${Y(2.5 - R.Hatm)}" stroke="#ff5a4f" stroke-dasharray="2 3"/><text x="${X0 + 4}" y="${Y(2.5 - R.Hatm) + 10}" fill="#ff5a4f">separation (2.5 m abs)</text>`;
  s += `<line x1="${X0}" x2="${X0 + W}" y1="${Y(-P.hs)}" y2="${Y(-P.hs)}" stroke="#2e4553"/><line x1="${X0}" x2="${X0 + W}" y1="${Y(P.hd)}" y2="${Y(P.hd)}" stroke="#2e4553"/>`;
  s += `<polygon points="${d.map(q => `${X(q.x).toFixed(1)},${Y(q.h).toFixed(1)}`).join(' ')}" fill="#ff8a3d22" stroke="#ff8a3d" stroke-width="1.8"/>`;
  const x = R.r * (1 - Math.cos(theta)); s += `<circle cx="${X(x)}" cy="${Y(R.head(theta))}" r="4" fill="#fff"/>`;
  s += `<text x="${X0 + W / 2}" y="${Y0 + 14}" text-anchor="middle">piston position → stroke ${(P.stroke * 1000).toFixed(0)} mm</text><text x="10" y="${Y0 - H / 2}" transform="rotate(-90 10 ${Y0 - H / 2})" text-anchor="middle">cylinder head (m, gauge)</text>`;
  $('ind').innerHTML = s;
}

function update() {
  R = recip(P);
  $('g-q').textContent = `${(R.Q * 60000).toFixed(0)} L/min`;
  $('g-p').textContent = `${(R.power / 1000).toFixed(2)} kW`;
  $('g-n').textContent = Number.isFinite(R.sepRpm) ? `${Math.round(R.sepRpm)} rpm` : 'never';
  $('g-n').classList.toggle('warn', R.separation);
  const st = $('status');
  if (R.separation) { st.textContent = `SEPARATION · ${R.separationWhere} · ${(R.separationWhere === 'suction' ? R.minAbsSuction : R.minAbsDelivery).toFixed(1)} m abs < 2.5 m`; st.className = 'status bad'; }
  else { st.textContent = `RUNNING · ${P.rpm} rpm · slip ${(R.slip * 100).toFixed(0)} %`; st.className = 'status ok'; }
  document.body.dataset.status = R.separation ? 'separation' : 'running';
  $('ind-note').textContent = `Acceleration head: suction ±${R.suction.haMax.toFixed(1)} m, delivery ±${R.delivery.haMax.toFixed(1)} m. Peak friction: ${(P.vesselS ? R.suction.hfVessel : R.suction.hfMax).toFixed(2)} m / ${(P.vesselD ? R.delivery.hfVessel : R.delivery.hfMax).toFixed(2)} m. Power from the diagram ${(R.power / 1000).toFixed(3)} kW = formula ${(R.powerFormula / 1000).toFixed(3)} kW.`;
  const set = (id, v, t) => { $(id).value = v; $(id + '-out').textContent = t; };
  set('rpm', P.rpm, `${P.rpm} rpm`); set('D', P.D * 1000, `${Math.round(P.D * 1000)} mm`); set('st', P.stroke * 1000, `${Math.round(P.stroke * 1000)} mm`); set('cd', P.Cd, P.Cd.toFixed(2));
  set('ls', P.suction.L, `${P.suction.L} m`); set('ds', P.suction.d * 1000, `${Math.round(P.suction.d * 1000)} mm`); set('ld', P.delivery.L, `${P.delivery.L} m`); set('dd', P.delivery.d * 1000, `${Math.round(P.delivery.d * 1000)} mm`);
  set('hs', P.hs, `${P.hs} m`); set('hd', P.hd, `${P.hd} m`); set('alt', P.altitude, `${P.altitude} m`);
  $('vs').setAttribute('aria-checked', String(P.vesselS)); $('vd').setAttribute('aria-checked', String(P.vesselD));
  document.querySelectorAll('[data-acting]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.acting === P.acting)));
  rig(); indicator();
}
const bind = (id, fn) => $(id).addEventListener('input', e => { fn(+e.target.value); update(); });
bind('rpm', v => P.rpm = v); bind('D', v => P.D = v / 1000); bind('st', v => P.stroke = v / 1000); bind('cd', v => P.Cd = v);
bind('ls', v => P.suction.L = v); bind('ds', v => P.suction.d = v / 1000); bind('ld', v => P.delivery.L = v); bind('dd', v => P.delivery.d = v / 1000);
bind('hs', v => P.hs = v); bind('hd', v => P.hd = v); bind('alt', v => P.altitude = v);
$('vs').onclick = () => { P.vesselS = !P.vesselS; update(); }; $('vd').onclick = () => { P.vesselD = !P.vesselD; update(); };
document.querySelectorAll('[data-acting]').forEach(b => b.onclick = () => { P.acting = b.dataset.acting; update(); });

// ---------- missions ----------
const WB = workbench('piston', { initial: 'mission' });
const M = { i: 0, guess: null, res: null };
function startMission(i) { M.i = Math.max(0, Math.min(MISSIONS.length - 1, i)); M.guess = null; M.res = null; P = clone(STOCK_RECIP); update(); try { localStorage.setItem('piston.mission', String(M.i)); } catch {} paintMission(); }
function paintMission() {
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  WB.lock(mode === 'learn' && !M.res ? ['pump', 'pipes', 'site'] : []);
  document.querySelector('[data-open="mission"]').hidden = mode !== 'learn';
  if (mode !== 'learn') { if (WB.current === 'mission') WB.open('indicator'); return; }
  const m = MISSIONS[M.i];
  let h = `<div class="mhead"><span>Mission ${M.i + 1} of ${MISSIONS.length}</span><div class="dots">${MISSIONS.map((_, k) => `<i class="${k <= M.i ? 'on' : ''}"></i>`).join('')}</div></div><span class="unit">${COURSE}</span><h2>${m.title}</h2><p>${m.intro}</p>`;
  if (!M.res) h += `<p class="think">Pause and think</p><p>${m.q}</p><div class="row">${m.options.map(o => `<button type="button" class="guess" data-g="${o}">${o}</button>`).join('')}</div>`;
  else {
    const right = M.guess === M.res.a;
    h += `<p class="result ${right ? 'right' : 'wrong'}">${right ? 'Right' : 'Not quite'} — the model says: ${M.res.a}.</p><p class="measured">${M.res.m}</p><p>${m.explain}</p><p class="task">Now try it: ${m.task}</p>
      <div class="row"><button type="button" id="m-try">Open ${document.querySelector(`[data-module="${m.open}"]`).dataset.title} →</button>${M.i > 0 ? '<button type="button" id="m-prev">Back</button>' : ''}${M.i < MISSIONS.length - 1 ? '<button type="button" class="primary" id="m-next">Next mission</button>' : '<button type="button" class="primary" id="m-explore">Explore freely</button>'}</div>`;
  }
  $('mission').innerHTML = h;
  $('mission').querySelectorAll('[data-g]').forEach(b => b.onclick = () => { M.guess = b.dataset.g; M.res = m.answer(); if (m.after) { Object.assign(P, m.after); update(); } paintMission(); });
  const t = $('m-try'); if (t) t.onclick = () => WB.open(m.open);
  const nx = $('m-next'); if (nx) nx.onclick = () => startMission(M.i + 1);
  const pv = $('m-prev'); if (pv) pv.onclick = () => startMission(M.i - 1);
  const ex = $('m-explore'); if (ex) ex.onclick = () => setMode('explore');
}
function setMode(m) { mode = m; if (m === 'learn') WB.open('mission'); try { localStorage.setItem('piston.mode', m); } catch {} paintMission(); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!reduced) { theta = (theta + dt * 2 * Math.PI * P.rpm / 60 / 2) % (2 * Math.PI); rig(); if (WB.current === 'indicator') indicator(); }
  requestAnimationFrame(frame);
}
try { mode = localStorage.getItem('piston.mode') || 'learn'; } catch {}
update();
if (mode === 'learn') { let i = 0; try { i = +(localStorage.getItem('piston.mission') || 0); } catch {} startMission(i); } else paintMission();
if (reduced) theta = 0.3;
requestAnimationFrame(frame);
window.__piston = { get R() { return R; }, P: () => P };
document.body.dataset.ready = 'true';
