import { BAR, MATERIALS, newPart, addTurn, addGroove, setFillet, undo, diameterAt, runTest, explain, loadLabel } from './model.mjs';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const METAL = { steel: ['#c3cad1', '#7d8790'], aluminium: ['#e3e8ec', '#a3adb6'], castIron: ['#8d9196', '#4f5358'] };

let part = newPart(), material = 'steel', op = 'turn', test = 'tension', grooveRadius = 0.5;
let notebook = [], busy = false, lastResult = null;
try { notebook = JSON.parse(localStorage.getItem('openpath-workshop-notebook') || '[]'); } catch { notebook = []; }
const save = () => { try { localStorage.setItem('openpath-workshop-notebook', JSON.stringify(notebook.slice(-30))); } catch {} };

// ---------- drawing helpers ----------
function profilePath(p, x0, scaleX, cy, scaleR, from = 0, to = BAR.length) {
  const top = [], bottom = [];
  for (let x = from; x <= to + 1e-9; x += 0.25) {
    const r = diameterAt(p, x) / 2 * scaleR, X = (x0 + x * scaleX).toFixed(2);
    top.push(`${X},${(cy - r).toFixed(2)}`);
    bottom.unshift(`${X},${(cy + r).toFixed(2)}`);
  }
  return 'M' + top.join('L') + 'L' + bottom.join('L') + 'Z';
}
const defs = () => `<defs><linearGradient id="metal-${material}" x2="0" y2="1"><stop offset="0" stop-color="${METAL[material][1]}"/><stop offset=".35" stop-color="${METAL[material][0]}"/><stop offset="1" stop-color="${METAL[material][1]}"/></linearGradient></defs>`;

function drawLathe(toolX = null) {
  const cx = x => 30 + x * 2.5, cy = 62, R = 2.4;
  let s = defs();
  s += `<rect x="0" y="20" width="30" height="84" rx="4" fill="#3d4a55"/><rect x="20" y="${cy - 30}" width="12" height="14" fill="#25303a"/><rect x="20" y="${cy + 16}" width="12" height="14" fill="#25303a"/>`;
  s += `<path d="M330 40h30v44h-30z" fill="#3d4a55"/><path d="M330 ${cy - 6}l-8 6 8 6z" fill="#25303a"/>`;
  s += `<clipPath id="bar-clip"><path d="${profilePath(part, 30, 2.5, cy, R)}"/></clipPath>`;
  s += `<path d="${profilePath(part, 30, 2.5, cy, R)}" fill="url(#metal-${material})" stroke="#38424b" stroke-width=".8"/>`;
  s += `<g clip-path="url(#bar-clip)"><g class="spin">` + [0, 1, 2, 3, 4, 5].map(i => `<path d="M30 ${cy - 24 + i * 9}H330" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>`).join('') + `</g></g>`;
  // Planned cut preview
  if (op === 'turn') {
    const f = +$('turn-from').value, t = +$('turn-to').value, d = +$('turn-dia').value;
    if (t - f >= 5) s += `<rect x="${cx(Math.min(f, t))}" y="${cy - d / 2 * R}" width="${Math.abs(t - f) * 2.5}" height="${d * R}" fill="none" stroke="#c0392b" stroke-dasharray="4 3" stroke-width="1.2"/>`;
  } else {
    const at = +$('groove-at').value, dep = +$('groove-depth').value;
    const D = diameterAt({ ...part, ops: part.ops.filter(o => o.type === 'turn') }, at);
    s += `<path d="M${cx(at - grooveRadius)} ${cy - D / 2 * R}v${dep * R}h${grooveRadius * 5}v${-dep * R}" fill="none" stroke="#c0392b" stroke-dasharray="3 2" stroke-width="1.2"/>`;
  }
  const tx = toolX ?? (op === 'turn' ? +$('turn-to').value : +$('groove-at').value);
  s += `<path d="M${cx(tx)} ${cy - 27}l-6-14h12z" fill="#e0a43a" stroke="#6b4a12"/><rect x="${cx(tx) - 9}" y="${cy - 52}" width="18" height="12" fill="#6b4a12"/>`;
  s += [0, 20, 40, 60, 80, 100, 120].map(x => `<text x="${cx(x)}" y="126" text-anchor="middle" class="tick">${x}</text>`).join('');
  $('lathe-svg').innerHTML = `<title id="lathe-title">${summary(part)} in ${MATERIALS[material].name.toLowerCase()}</title>` + s;
}

function drawRig(result = null, progress = 0) {
  const cx = x => 30 + x * 2.5, cy = 52, R = 2.4;
  let s = defs();
  s += `<rect x="0" y="22" width="30" height="60" rx="3" fill="#3d4a55"/><rect x="330" y="22" width="30" height="60" rx="3" fill="#3d4a55"/>`;
  const broken = result && progress >= 1;
  const gap = broken ? 10 : 0;
  const bx = result ? result.breakAt : null;
  if (!broken) s += `<path d="${profilePath(part, 30, 2.5, cy, R)}" fill="url(#metal-${material})" stroke="#38424b" stroke-width=".8"/>`;
  else {
    s += `<g transform="translate(${-gap / 2} 0)"><path d="${profilePath(part, 30, 2.5, cy, R, 0, bx)}" fill="url(#metal-${material})" stroke="#38424b" stroke-width=".8"/></g>`;
    s += `<g transform="translate(${gap / 2} 0)"><path d="${profilePath(part, 30, 2.5, cy, R, bx, BAR.length)}" fill="url(#metal-${material})" stroke="#38424b" stroke-width=".8"/></g>`;
    const r = diameterAt(part, bx) / 2 * R, X = cx(bx);
    const shape = { 'cup-and-cone': `M${X - 5} ${cy - r}q5 ${r} 0 ${2 * r}M${X + 5} ${cy - r}q5 ${r} 0 ${2 * r}`, flat: `M${X - 5} ${cy - r}v${2 * r}M${X + 5} ${cy - r}v${2 * r}`, 'flat-shear': `M${X - 5} ${cy - r}v${2 * r}M${X + 5} ${cy - r}v${2 * r}`, 'helix-45': `M${X - 5 - r} ${cy - r}l${2 * r} ${2 * r}M${X + 5 - r} ${cy - r}l${2 * r} ${2 * r}` }[result.mode];
    s += `<path d="${shape}" stroke="#b03a2e" stroke-width="2" fill="none"/>`;
  }
  if (test === 'torsion') {
    const twist = result ? Math.min(progress, 1) : 0;
    const k = broken ? 0 : Math.min(1, twist * 3);
    s += `<path d="M30 ${cy - 6}C130 ${cy - 6 + 12 * k} 230 ${cy - 6 - 12 * k} 330 ${cy - 6}" stroke="#b03a2e" stroke-width="1.4" fill="none" stroke-dasharray="${broken ? '4 3' : ''}"/>`;
    s += `<text x="345" y="100" text-anchor="middle" class="tick">↻</text>`;
  } else s += `<text x="345" y="100" text-anchor="middle" class="tick">→</text><text x="15" y="100" text-anchor="middle" class="tick">←</text>`;
  $('rig-svg').innerHTML = `<title id="rig-title">${broken ? `Broken at ${bx} mm` : 'Part in the test rig'}</title>` + s;
}

function drawGraph(result, progress) {
  const kind = test;
  const prev = [...notebook].reverse().find(e => e.kind === kind && (!result || e !== notebook.at(-1)));
  const sets = [];
  if (prev && prev.points) sets.push({ pts: prev.points, cls: 'prev' });
  if (result) sets.push({ pts: partialPoints(result.points, progress), cls: 'now' });
  const all = sets.flatMap(s => s.pts);
  const maxX = Math.max(kind === 'tension' ? 1 : 10, ...all.map(p => p.x)) * 1.05;
  const maxY = Math.max(kind === 'tension' ? 20000 : 50000, ...all.map(p => p.y)) * 1.1;
  const X = x => 40 + x / maxX * 290, Y = y => 165 - y / maxY * 150;
  let s = `<path d="M40 15V165H330" stroke="#5b6a62" fill="none"/>`;
  for (let i = 1; i <= 4; i++) {
    s += `<text x="36" y="${Y(maxY * i / 4) + 3}" text-anchor="end" class="tick">${kind === 'tension' ? (maxY * i / 4000).toFixed(0) : (maxY * i / 4000).toFixed(0)}</text><path d="M40 ${Y(maxY * i / 4)}H330" stroke="#e3e7dc"/>`;
    s += `<text x="${X(maxX * i / 4)}" y="178" text-anchor="middle" class="tick">${(maxX * i / 4).toFixed(maxX < 4 ? 2 : 0)}</text>`;
  }
  s += `<text x="185" y="189" text-anchor="middle" class="axis">${kind === 'tension' ? 'Stretch (mm)' : 'Twist (degrees)'}</text>`;
  s += `<text x="8" y="10" class="axis">${kind === 'tension' ? 'Load (kN)' : 'Torque (N·m)'}</text>`;
  for (const set of sets) s += `<polyline class="${set.cls}" points="${set.pts.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}" fill="none"/>`;
  if (prev && prev.points) s += `<text x="330" y="12" text-anchor="end" class="tick prev-label">dashed: test #${prev.n}</text>`;
  $('graph').innerHTML = `<title id="graph-title">${kind === 'tension' ? 'Load against stretch' : 'Torque against twist'}</title>` + s;
}

function partialPoints(points, progress) {
  if (progress >= 1) return points;
  const f = progress * (points.length - 1), i = Math.floor(f), t = f - i;
  const out = points.slice(0, i + 1);
  if (i + 1 < points.length) out.push({ x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t });
  return out;
}

// ---------- text ----------
function summary(p) {
  if (!p.ops.length) return 'Plain bar';
  return p.ops.map(o => o.type === 'turn'
    ? `turned to ${o.diameter} mm (${o.from}–${o.to})`
    : `${o.depth} mm groove at ${o.at}, ${o.radius < 1 ? 'sharp' : 'round'} tip`).join('; ') + (p.ops.some(o => o.type === 'turn') ? `; ${p.fillet < 1 ? 'sharp' : 'rounded'} steps` : '');
}
const wobble = (v, i) => v * (1 + 0.004 * Math.sin(i * 12.9898 + v * 0.001));
const moveLabel = (kind, v) => kind === 'tension' ? `${v.toFixed(2)} mm` : `${v.toFixed(0)}°`;

function paintPart() {
  let min = Infinity;
  for (let x = 0; x <= BAR.length; x += 0.25) min = Math.min(min, diameterAt(part, x));
  $('part-readout').textContent = `${MATERIALS[material].name}. ${summary(part)}. Smallest diameter ${min.toFixed(1)} mm.`;
  $('undo').disabled = !part.ops.length || busy;
  drawLathe();
}

function paintControls() {
  $('from-out').textContent = $('turn-from').value;
  $('to-out').textContent = $('turn-to').value;
  $('dia-out').textContent = $('turn-dia').value;
  $('at-out').textContent = $('groove-at').value;
  $('depth-out').textContent = $('groove-depth').value;
  drawLathe();
}

// ---------- notebook & quests ----------
const QUESTS = [
  ['Pull a plain steel bar until it breaks.', n => n.some(e => e.material === 'steel' && e.kind === 'tension' && e.plain)],
  ['Cut a groove in steel. Is it weaker? Where does it break?', n => n.some(e => e.material === 'steel' && e.kind === 'tension' && e.grooves.length)],
  ['In cast iron, which groove is stronger: one cut with a sharp tool or a round tool?', n => n.some(e => e.material === 'castIron' && e.kind === 'tension' && e.grooves.some(r => r < 1)) && n.some(e => e.material === 'castIron' && e.kind === 'tension' && e.grooves.some(r => r >= 1))],
  ['Turn down the middle with sharp steps. Where does steel break? Where does cast iron break?', n => ['steel', 'castIron'].every(m => n.some(e => e.material === m && e.kind === 'tension' && e.turned && !e.grooves.length))],
  ['Twist cast iron. Look at the angle of the break.', n => n.some(e => e.material === 'castIron' && e.kind === 'torsion')],
  ['Compare how far steel and cast iron twist before breaking.', n => ['steel', 'castIron'].every(m => n.some(e => e.material === m && e.kind === 'torsion'))],
];

function paintNotebook() {
  const body = $('notebook');
  body.innerHTML = notebook.length ? [...notebook].reverse().map(e =>
    `<tr><td>${e.n}</td><td>${MATERIALS[e.material].name}<br><small>${e.summary}</small></td><td>${e.kind === 'tension' ? 'Pull' : 'Twist'}</td><td>${loadLabel(e.kind, e.maxLoad)}</td><td>${e.breakAt} mm</td><td>${moveLabel(e.kind, e.final)}</td></tr>`).join('')
    : '<tr class="empty"><td colspan="6">Your tests appear here.</td></tr>';
  $('quests').innerHTML = QUESTS.map(([text, done]) => `<li class="${done(notebook) ? 'done' : ''}"><span aria-hidden="true">${done(notebook) ? '✓' : '○'}</span> ${text}${done(notebook) ? ' <span class="sr">(done)</span>' : ''}</li>`).join('');
}

// ---------- events ----------
function radio(selector, attr, onPick) {
  document.querySelectorAll(selector).forEach(b => b.addEventListener('click', () => {
    if (busy) return;
    document.querySelectorAll(selector).forEach(o => o.setAttribute('aria-checked', String(o === b)));
    onPick(b.dataset[attr]);
  }));
}
function toggle(selector, attr, onPick) {
  document.querySelectorAll(selector).forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll(selector).forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    onPick(+b.dataset[attr]);
  }));
}
radio('[data-material]', 'material', m => { material = m; resetTest(); paintPart(); });
radio('[data-op]', 'op', o => { op = o; $('op-turn').hidden = o !== 'turn'; $('op-groove').hidden = o !== 'groove'; drawLathe(); });
radio('[data-test]', 'test', t => { test = t; resetTest(); });
toggle('[data-fillet]', 'fillet', f => { part = setFillet(part, f); resetTest(); paintPart(); });
toggle('[data-radius]', 'radius', r => { grooveRadius = r; drawLathe(); });
['turn-from', 'turn-to', 'turn-dia', 'groove-at', 'groove-depth'].forEach(id => $(id).addEventListener('input', paintControls));

$('cut').addEventListener('click', async () => {
  if (busy) return;
  const before = part;
  const next = op === 'turn'
    ? addTurn(part, { from: +$('turn-from').value, to: +$('turn-to').value, diameter: +$('turn-dia').value })
    : addGroove(part, { at: +$('groove-at').value, depth: +$('groove-depth').value, radius: grooveRadius });
  if (next === before) { $('part-readout').textContent = 'That cut is too short or too shallow. Make it at least 5 mm long and thinner than the bar.'; return; }
  busy = true;
  $('lathe').classList.add('spinning');
  if (!reduced) {
    const [a, b] = op === 'turn' ? [+$('turn-from').value, +$('turn-to').value].sort((x, y) => x - y) : [+$('groove-at').value, +$('groove-at').value];
    const t0 = performance.now();
    await new Promise(done => { const step = now => { const f = Math.min(1, (now - t0) / 900); drawLathe(b + (a - b) * f); f < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step); });
  }
  $('lathe').classList.remove('spinning');
  part = next; busy = false; resetTest(); paintPart();
});
$('undo').addEventListener('click', () => { if (busy) return; part = undo(part); resetTest(); paintPart(); });
$('new-bar').addEventListener('click', () => { if (busy) return; part = setFillet(newPart(), part.fillet); resetTest(); paintPart(); });

function resetTest() {
  lastResult = null;
  $('dial-load').textContent = '0';
  $('dial-move-label').firstChild.textContent = test === 'tension' ? 'Stretch ' : 'Twist ';
  $('dial-move').textContent = '0';
  $('result').textContent = '';
  $('start').textContent = 'Start test';
  drawRig(); drawGraph(null, 0);
}

$('start').addEventListener('click', async () => {
  if (busy) return;
  if (lastResult) { resetTest(); return; } // "Fit a new bar"
  busy = true;
  $('start').disabled = true;
  const result = runTest(part, material, test);
  const duration = reduced ? 0 : 2600, t0 = performance.now();
  await new Promise(done => {
    const frame = now => {
      const p = duration ? Math.min(1, (now - t0) / duration) : 1;
      const pts = partialPoints(result.points, p), cur = pts.at(-1);
      $('dial-load').textContent = loadLabel(test, wobble(cur.y, pts.length));
      $('dial-move').textContent = moveLabel(test, cur.x);
      drawRig(result, p); drawGraph(result, p);
      p < 1 ? requestAnimationFrame(frame) : done();
    };
    requestAnimationFrame(frame);
  });
  const entry = {
    n: (notebook.at(-1)?.n || 0) + 1, material, kind: test, summary: summary(part), plain: !part.ops.length,
    turned: part.ops.some(o => o.type === 'turn'), grooves: part.ops.filter(o => o.type === 'groove').map(o => o.radius),
    maxLoad: Math.round(result.maxLoad), breakAt: result.breakAt, final: result.finalReading, points: result.points,
  };
  const prevSame = [...notebook].reverse().find(e => e.kind === test);
  notebook.push(entry); save();
  let compare = '';
  if (prevSame) {
    const change = Math.round((entry.maxLoad / prevSame.maxLoad - 1) * 100);
    compare = change === 0 ? ` Same strength as test #${prevSame.n}.` : ` That is ${Math.abs(change)}% ${change > 0 ? 'stronger' : 'weaker'} than test #${prevSame.n}.`;
  }
  $('result').textContent = `Broke at ${loadLabel(test, result.maxLoad)}, ${result.breakAt} mm from the left grip. ${explain(result, part)}${compare}`;
  $('start').textContent = 'Fit a new bar';
  $('start').disabled = false;
  lastResult = result; busy = false;
  drawRig(result, 1); drawGraph(result, 1); paintNotebook();
  $('undo').disabled = !part.ops.length;
  document.body.dataset.tests = String(notebook.length);
});

paintControls(); paintPart(); resetTest(); paintNotebook();
document.body.dataset.ready = 'true';
