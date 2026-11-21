// Dashboard hero: a live engineering section of one cylinder of the reference engine, driven by the same
// models as Engine World (exact slider-crank kinematics, first-law cycle with Wiebe heat release).
import { ENGINE, cycle, cylinderVolume, swept } from './engines/thermofluids/engine.mjs';
import { piston, pistonMotion } from './engines/motion/crank.mjs';

const E = ENGINE, RPM = 2000, SLOW = 100, IGN = -20;
const cyc = cycle({ rpm: RPM, manifold: 1.0, ignition: IGN });
const mass = cyc.air + cyc.fuel, R = 287, deg = Math.PI / 180;
const r = E.stroke / 2, Vc = swept() / (E.cr - 1);
// pressure over the full 720° cycle (θ = 0 at firing TDC): intake −360…−180, closed cycle −180…180 (model), exhaust 180…360
const tr = cyc.trace;
function state(th) {
  const V = cylinderVolume(th * deg);
  let p, T;
  if (th < -180) { p = 0.96e5; T = 330; }
  else if (th <= 180) {
    let i = tr.findIndex(q => q.theta >= th); if (i < 1) i = 1; const a = tr[i - 1], b = tr[i] || a, f = b.theta === a.theta ? 0 : (th - a.theta) / (b.theta - a.theta);
    p = a.p + (b.p - a.p) * f; T = p * V / (mass * R);
  } else { const f = (th - 180) / 180; p = 1.08e5 + 0.04e5 * (1 - f); T = 1050 - 300 * f; }
  return { V, p, T: Math.max(300, T) };
}
const PV = []; for (let th = -360; th <= 360; th += 2) PV.push(state(th));
const pMax = Math.max(...PV.map(s => s.p)), TMax = Math.max(...PV.map(s => s.T)), Vmax = Vc + swept();
const lift = (th, open, close, max) => { if (th < open || th > close) return 0; return max * Math.sin(Math.PI * (th - open) / (close - open)); };
const STROKES = [[-360, -180, 'Intake'], [-180, 0, 'Compression'], [0, 180, 'Power'], [180, 360, 'Exhaust']];

// colour map for gas temperature (dark → red → orange → yellow → white), like a thermal camera
const CM = [[300, [24, 32, 48]], [700, [120, 30, 40]], [1400, [214, 70, 30]], [2100, [247, 170, 40]], [2700, [255, 240, 200]]];
function tcol(T) {
  for (let i = 1; i < CM.length; i++) if (T <= CM[i][0]) { const [a, ca] = CM[i - 1], [b, cb] = CM[i], f = Math.max(0, (T - a) / (b - a)); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f)).join(',')})`; }
  return 'rgb(255,240,200)';
}

const cv = document.getElementById('hero-canvas'), ctx = cv.getContext('2d');
const INK = '#c9d6df', DIM = '#6d8796', ACC = '#4fc3f7', HOT = '#ff8a3d';
let L = null;
function layout() {
  const w = cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1), narrow = w < 520;
  const W = narrow ? 360 : 600, H = narrow ? 560 : 380;
  cv.style.aspectRatio = `${W} / ${H}`;
  const s = (cv.clientWidth || w) / W;
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  L = narrow ? { W, H, eng: { x: 0, y: 0, w: 200, h: 360 }, read: { x: 206, y: 20 }, pv: { x: 40, y: 380, w: 300, h: 150 } }
             : { W, H, eng: { x: 0, y: 0, w: 250, h: 380 }, read: { x: 300, y: 214 }, pv: { x: 300, y: 22, w: 280, h: 160 } };
}
function hatch(x, y, w, h, col = '#3a4b57') {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = 0.8;
  for (let t = -h; t < w + h; t += 5) { ctx.beginPath(); ctx.moveTo(x + t, y + h); ctx.lineTo(x + t + h, y); ctx.stroke(); }
  ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.strokeRect(x, y, w, h);
}
function centreline(x1, y1, x2, y2) { ctx.save(); ctx.strokeStyle = DIM; ctx.lineWidth = 0.7; ctx.setLineDash([10, 3, 2, 3]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); }
function dim(x1, y1, x2, y2, text, side = 'h') {
  ctx.save(); ctx.strokeStyle = ACC; ctx.fillStyle = ACC; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const ar = (x, y, a) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5 * Math.cos(a - 0.35), y - 5 * Math.sin(a - 0.35)); ctx.lineTo(x - 5 * Math.cos(a + 0.35), y - 5 * Math.sin(a + 0.35)); ctx.fill(); };
  const a = Math.atan2(y2 - y1, x2 - x1); ar(x2, y2, a); ar(x1, y1, a + Math.PI);
  ctx.font = '600 9px "JetBrains Mono",ui-monospace,monospace'; ctx.textAlign = 'center';
  if (side === 'h') ctx.fillText(text, (x1 + x2) / 2, y1 - 4); else { ctx.translate(x1 - 5, (y1 + y2) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(text, 0, 0); }
  ctx.restore();
}

function drawEngine(th, st) {
  const B = L.eng, k = (B.h - 34) / 0.29;      // px per metre: fits head-to-crank (≈ 0.29 m) in the box
  const mm = v => v * k;
  const cx = B.x + B.w / 2 - 4, crankY = B.y + B.h - mm(0.048);
  const pp = piston(th * deg, r, E.rod), pinY = crankY - mm(pp.x);
  const bore = mm(E.bore), deckY = crankY - mm(r + E.rod) - mm(0.012) - mm(Vc / (Math.PI / 4 * E.bore ** 2));
  const crownY = pinY - mm(0.012), wall = mm(0.011);
  // cylinder walls (sectioned) with water jacket
  const wallTop = deckY, wallBot = crankY - mm(r + E.rod) + mm(E.stroke) + mm(0.03);
  hatch(cx - bore / 2 - wall, wallTop, wall, wallBot - wallTop); hatch(cx + bore / 2, wallTop, wall, wallBot - wallTop);
  ctx.strokeStyle = '#2d6f8f'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
  ctx.strokeRect(cx - bore / 2 - wall + 3, wallTop + 6, wall - 6, (wallBot - wallTop) * 0.55); ctx.strokeRect(cx + bore / 2 + 3, wallTop + 6, wall - 6, (wallBot - wallTop) * 0.55); ctx.setLineDash([]);
  // gas
  ctx.fillStyle = tcol(st.T); ctx.fillRect(cx - bore / 2, deckY, bore, crownY - deckY);
  // cylinder head (sectioned) with ports and valves
  const headH = mm(0.03);
  hatch(cx - bore / 2 - wall, deckY - headH, bore + 2 * wall, headH);
  const vIn = lift(th, -370, -130, mm(0.009)) + lift(th + 720, -370, -130, mm(0.009)), vEx = lift(th, 140, 380, mm(0.0085)) + lift(th - 720, 140, 380, mm(0.0085));
  for (const [x0, lft, col, label] of [[cx - bore * 0.27, vIn, '#5aa9d6', 'IN'], [cx + bore * 0.27, vEx, '#d9822b', 'EX']]) {
    const hw = bore * 0.17;
    ctx.fillStyle = '#0d1419'; ctx.fillRect(x0 - hw, deckY - headH, hw * 2, headH);          // port
    ctx.fillStyle = col; ctx.globalAlpha = lft > 0.5 ? 0.35 : 0.12; ctx.fillRect(x0 - hw, deckY - headH, hw * 2, headH); ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, deckY - headH - mm(0.02)); ctx.lineTo(x0, deckY + lft - 2); ctx.stroke();         // stem
    ctx.beginPath(); ctx.moveTo(x0 - hw, deckY + lft); ctx.lineTo(x0 + hw, deckY + lft); ctx.lineTo(x0 + 2, deckY + lft - 4); ctx.lineTo(x0 - 2, deckY + lft - 4); ctx.closePath(); ctx.fillStyle = '#9fb2bf'; ctx.fill();
    ctx.fillStyle = DIM; ctx.font = '600 8px "JetBrains Mono",ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x0, deckY - headH - mm(0.022));
  }
  // spark plug + spark
  ctx.fillStyle = '#7f909b'; ctx.fillRect(cx - 2, deckY - headH - mm(0.014), 4, headH + mm(0.014) + 3);
  if (th > IGN - 2 && th < IGN + 10) { ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(cx, deckY + 5, 4 + Math.random() * 3, 0, 7); ctx.fill(); }
  // piston (sectioned) with ring grooves and pin
  const pH = mm(0.045);
  hatch(cx - bore / 2 + 1, crownY, bore - 2, pH * 0.35, '#43535e');
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.strokeRect(cx - bore / 2 + 1, crownY, bore - 2, pH);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = '#0d1419'; ctx.fillRect(cx - bore / 2 + 1, crownY + 4 + i * 5, 4, 2); ctx.fillRect(cx + bore / 2 - 5, crownY + 4 + i * 5, 4, 2); }
  // crank
  const cpX = cx + mm(r * Math.sin(th * deg)), cpY = crankY - mm(r * Math.cos(th * deg));
  ctx.save(); ctx.translate(cx, crankY); ctx.rotate(th * deg);
  ctx.fillStyle = '#25333d'; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.arc(0, 0, mm(0.042), Math.PI * 0.18, Math.PI * 0.82); ctx.lineTo(0, -mm(r)); ctx.closePath(); ctx.fill(); ctx.stroke();  // counterweight
  ctx.beginPath(); ctx.moveTo(-mm(0.014), 0); ctx.lineTo(-mm(0.011), -mm(r)); ctx.lineTo(mm(0.011), -mm(r)); ctx.lineTo(mm(0.014), 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // connecting rod (I-section outline)
  const ang = Math.atan2(cpY - pinY, cpX - cx), len = Math.hypot(cpX - cx, cpY - pinY);
  ctx.save(); ctx.translate(cx, pinY); ctx.rotate(ang);
  ctx.fillStyle = '#31424d'; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(0, -mm(0.006)); ctx.lineTo(len, -mm(0.01)); ctx.lineTo(len, mm(0.01)); ctx.lineTo(0, mm(0.006)); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#5b6f7c'; ctx.beginPath(); ctx.moveTo(mm(0.012), 0); ctx.lineTo(len - mm(0.014), 0); ctx.stroke();
  ctx.restore();
  for (const [x, y, rad] of [[cx, pinY, mm(0.0095)], [cpX, cpY, mm(0.0175)], [cx, crankY, mm(0.0215)]]) { ctx.fillStyle = '#0d1419'; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.stroke(); }
  centreline(cx, deckY - headH - mm(0.03), cx, crankY + mm(0.045)); centreline(cx - mm(0.05), crankY, cx + mm(0.05), crankY);
  // dimensions
  dim(cx - bore / 2, deckY - headH - mm(0.04), cx + bore / 2, deckY - headH - mm(0.04), `Ø${(E.bore * 1000).toFixed(0)}`);
  const tdcY = crankY - mm(r + E.rod) - mm(0.012), bdcY = tdcY + mm(E.stroke);
  ctx.save(); ctx.strokeStyle = '#2e4553'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cx + bore / 2 + wall, tdcY); ctx.lineTo(cx + bore / 2 + wall + 18, tdcY); ctx.moveTo(cx + bore / 2 + wall, bdcY); ctx.lineTo(cx + bore / 2 + wall + 18, bdcY); ctx.stroke(); ctx.restore();
  dim(cx + bore / 2 + wall + 14, bdcY, cx + bore / 2 + wall + 14, tdcY, `${(E.stroke * 1000).toFixed(1)}`, 'v');
}

function drawPV(th) {
  const P = L.pv, X = v => P.x + (v / Vmax) * P.w, Y = p => P.y + P.h - (p / pMax) * P.h;
  ctx.strokeStyle = '#22323d'; ctx.lineWidth = 0.6;
  for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(P.x, P.y + P.h * i / 4 - P.h / 4); ctx.lineTo(P.x + P.w, P.y + P.h * i / 4 - P.h / 4); ctx.stroke(); }
  ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + P.h); ctx.lineTo(P.x + P.w, P.y + P.h); ctx.stroke();
  ctx.strokeStyle = HOT; ctx.lineWidth = 1.6; ctx.beginPath(); PV.forEach((s, i) => (i ? ctx.lineTo(X(s.V), Y(s.p)) : ctx.moveTo(X(s.V), Y(s.p)))); ctx.stroke();
  const s = state(th); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(s.V), Y(s.p), 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = DIM; ctx.font = '600 9px "JetBrains Mono",ui-monospace,monospace'; ctx.textAlign = 'left';
  ctx.fillText(`p–V diagram · p max ${(pMax / 1e5).toFixed(0)} bar`, P.x, P.y - 8);
  ctx.textAlign = 'right'; ctx.fillText(`V → ${(Vmax * 1e6).toFixed(0)} cm³`, P.x + P.w, P.y + P.h + 12);
  ctx.textAlign = 'left'; ctx.fillText('p ↑', P.x + 4, P.y + 8);
}

function drawReadout(th, st) {
  const R0 = L.read, m = pistonMotion(th * deg, r, E.rod, RPM), stroke = STROKES.find(s => th >= s[0] && th < s[1])?.[2] || 'Exhaust';
  const rows = [['CRANK', `${((th + 360) % 720).toFixed(0).padStart(3)}°`], ['STROKE', stroke], ['p cyl', `${(st.p / 1e5).toFixed(1)} bar`], ['T gas', `${st.T.toFixed(0)} K`],
    ['v piston', `${m.v.toFixed(1)} m/s`], ['a piston', `${(m.a / 1000).toFixed(1)} km/s²`], ['speed', `${RPM} rpm`]];
  ctx.font = '600 10px "JetBrains Mono",ui-monospace,monospace';
  rows.forEach(([k, v], i) => { ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.fillText(k, R0.x, R0.y + i * 17); ctx.fillStyle = i === 1 ? ACC : '#e6eef3'; ctx.textAlign = 'right'; ctx.fillText(v, R0.x + 140, R0.y + i * 17); });
  // temperature colour bar
  const by = R0.y + rows.length * 17 + 6;
  for (let i = 0; i < 140; i++) { ctx.fillStyle = tcol(300 + 2400 * i / 140); ctx.fillRect(R0.x + i, by, 1.2, 6); }
  ctx.fillStyle = DIM; ctx.font = '600 8px "JetBrains Mono",ui-monospace,monospace'; ctx.textAlign = 'left'; ctx.fillText('300 K', R0.x, by + 16); ctx.textAlign = 'right'; ctx.fillText('2700 K', R0.x + 140, by + 16);
  const marker = R0.x + Math.min(1, (st.T - 300) / 2400) * 140; ctx.fillStyle = '#fff'; ctx.fillRect(marker - 1, by - 3, 2, 12);
}

let th = -360, last = performance.now(), visible = true;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!reduced) th += dt * RPM * 6 / SLOW;
  if (th >= 360) th -= 720;
  if (reduced) th = 12;
  ctx.clearRect(0, 0, L.W, L.H);
  const st = state(th);
  drawEngine(th, st); drawPV(th); drawReadout(th, st);
  cv.dataset.theta = th.toFixed(0);
  if (visible) requestAnimationFrame(frame);
}
layout(); addEventListener('resize', layout);
new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); } }).observe(cv);
requestAnimationFrame(frame);
