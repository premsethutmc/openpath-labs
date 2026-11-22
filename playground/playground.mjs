import { MATERIALS, limits } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';
import { SCENARIOS, applyScenario } from '../core/scenarios.mjs';
import { analyze, verdict, SAMPLES } from '../engines/solids/analyze.mjs';
import { displacedPoint } from '../engines/solids/frame.mjs';
import { PRESETS, LOAD_OBJECTS } from './presets.mjs';
import { addMember, deleteMember, cycleSupport, moveNode, findNode, mass, snap, editableCopy, buildStructure } from './build.mjs';
import { momentsAbout, pickPoint, balanced } from './moments.mjs';
import { workbench } from '../core/workbench.mjs';
import { notebook } from '../core/notebook.mjs';
import { SOLIDS_ADAPTER, SETUP_VERSION } from './model.mjs';

const BUILD = {
  id: 'build', name: 'Build your own', setting: 'gap', editable: true, gap: [0, 8000], deckWidth: 3000,
  question: 'Bridge the 8 m river. Carry the load safely with the least material.',
  view: { minX: -1500, maxX: 9500, minY: -1000, maxY: 4500 },
  nodes: [{ x: 0, y: 0 }, { x: 8000, y: 0 }],
  members: [{ i: 0, j: 1, type: 'frame', group: 'main', tags: ['deck'] }],
  supports: [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }],
  materials: ['steel', 'aluminium', 'timber', 'bamboo'], material: 'steel',
  sections: [{ shape: 'tube', d: 60, t: 4 }, { shape: 'tube', d: 114, t: 5 }, { shape: 'I', h: 200, b: 100, tw: 5.7, tf: 10.8 }, { shape: 'I', h: 300, b: 140, tw: 7.5, tf: 12.4 }], section: 1,
  loadChoices: ['person', 'car', 'truck', 'sack'], loads: [{ obj: 'car', member: 0, at: 0.5 }],
  steps: [
    { text: 'A single steel tube across the river, with a car on it. It fails. Your job: design something better.' },
    { text: 'Choose “Draw”, then tap one point and another to add a member. Members snap to a 0.5 m grid and join where they meet. Try building triangles above the deck.' },
    { text: '“Supports”: tap a joint to change it — pin, roller, fixed, wall guide, none. “Delete”: tap a member to remove it. Rigid joints carry bending; pin joints only push and pull.' },
    { text: 'Challenge: carry the loaded truck with a safety factor above 1.5 using less than 2,000 kg of material. Watch “Material used”.' },
  ],
};
let tool = 'move', jointType = 'frame', pending = null, hover = null, nodeDrag = null, undoStack = [];
const clone = o => JSON.parse(JSON.stringify(o));
const design = () => ({ nodes: preset.nodes, members: preset.members, supports: preset.supports, loads: state.loads });
function saveDesign() { if (preset.editable) store.set('labs.design', { ...clone(preset), loads: state.loads, section: state.section, material: state.material, scenario: state.scenario }); }
function edit(fn) {
  const before = design(), after = fn(before);
  if (after === before) return;
  undoStack.push(clone(before)); if (undoStack.length > 40) undoStack.shift();
  Object.assign(preset, { nodes: after.nodes, members: after.members, supports: after.supports });
  update({ loads: after.loads.filter(l => l.member < after.members.length), selected: null });
  saveDesign();
}

const $ = id => document.getElementById(id);
const svg = $('scene');
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let preset, state, view, analysis, drag = null;
let mode = store.get('labs.mode', 'learn');
let guide = { step: 0, guess: null, revealed: false, before: null };

// ---------- model ----------
function freshState(p) {
  return { material: p.material, section: p.section, scenario: 'normal', loads: p.loads.map(l => ({ ...l })), selected: null, forces: false, exaggerate: true };
}

export { buildStructure };

const run = s => (preset.members.length ? analyze(buildStructure(preset, s)) : { ok: false, reason: 'empty', message: 'Nothing built yet — choose “Draw” and tap two points.' });

// ---------- formatting ----------
const fmt = (n, d = 1) => Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(d);
const kN = n => `${fmt(n / 1000, Math.abs(n) < 10000 ? 2 : 1)} kN`;
const kNm = n => `${fmt(n / 1e6, Math.abs(n) < 1e7 ? 2 : 1)} kN·m`;
const sci = n => { if (n === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(n))); return e < 4 ? fmt(n, 0) : `${(n / 10 ** e).toFixed(2)}×10${String(e).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c] || '⁻').join('')}`; };
const sfText = sf => (sf > 99 ? '99+' : sf.toFixed(sf < 10 ? 2 : 1));
// How hard a part works: calm steel → amber → orange → red at the limit (one meaning, no rainbow).
const RAMP = [[0, [111, 135, 150]], [0.45, [150, 160, 150]], [0.65, [217, 164, 65]], [0.85, [224, 83, 31]], [1, [179, 20, 27]]];
function utilColour(u) {
  const x = Math.max(0, Math.min(1, u));
  for (let i = 1; i < RAMP.length; i++) if (x <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], f = (x - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f)).join(' ')})`; }
  return 'rgb(179 20 27)';
}
const memberRole = (k) => {
  const m = preset.members[k], a = preset.nodes[m.i], b = preset.nodes[m.j];
  if (m.name) return m.name;
  if (m.group === 'tie') return 'Tie rod';
  if (m.group === 'mast') return 'Mast';
  if (m.tags?.includes('deck')) return preset.id === 'crane' ? 'Arm (jib)' : preset.id === 'truss' ? 'Deck beam' : preset.id === 'shelf' ? 'Shelf board' : preset.id === 'diving' ? 'Board' : 'Deck';
  if (Math.abs(a.x - b.x) < 1) return preset.id === 'column' ? 'Column' : 'Post';
  if (Math.abs(a.y - b.y) < 1) return 'Top chord';
  return 'Diagonal';
};

// ---------- view transform ----------
function layout() {
  const W = svg.clientWidth || 360;
  const xs = preset.nodes.map(n => n.x), ys = preset.nodes.map(n => n.y), v = preset.view;
  const minX = v ? v.minX : Math.min(...xs), maxX = v ? v.maxX : Math.max(...xs), minY = v ? v.minY : Math.min(...ys), maxY = v ? v.maxY : Math.max(...ys);
  const padX = v ? 10 : 34, top = v ? 16 : preset.hang ? 50 : 96, bottom = v ? 16 : preset.hang ? 120 : 70;
  const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
  // Fit the scene height to the object so small screens are not mostly sky.
  const ideal = Math.max(260, Math.min((spanY / spanX) * (W - 2 * padX) + top + bottom + 40, innerHeight * 0.58, 560));
  if (Math.abs(svg.clientHeight - ideal) > 2) svg.style.height = ideal + 'px';
  const H = svg.clientHeight || ideal;
  const s = Math.min((W - 2 * padX) / spanX, (H - top - bottom) / spanY);
  const ox = (W - spanX * s) / 2 - minX * s, oy = top + (H - top - bottom - spanY * s) / 2 + maxY * s;
  view = { W, H, s, X: x => ox + x * s, Y: y => oy - y * s, toWorld: (px, py) => ({ x: (px - ox) / s, y: (oy - py) / s }) };
}

// ---------- drawing ----------
// A river valley: far bank haze, water with ripples, earth banks with a grass edge, concrete abutments.
function valley(a, b, top, slope, abut = true) {
  const { W, H } = view, wy = H - 34, mid = (a + b) / 2;
  return `<path d="M0 ${wy - 18} C${W * 0.25} ${wy - 34} ${W * 0.5} ${wy - 20} ${W * 0.7} ${wy - 30} S${W} ${wy - 22} ${W} ${wy - 26} V${H}H0Z" fill="#16222b" opacity=".9"/>
    <rect x="0" y="${wy}" width="${W}" height="34" fill="url(#water)"/>
    <g stroke="#4fc3f7" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"><path d="M${mid - 70} ${wy + 10}h36M${mid + 10} ${wy + 20}h50M${mid - 30} ${wy + 28}h24"/></g>
    <path d="M0 ${top}H${a}L${a + slope} ${H}H0Z" fill="url(#earth)"/><path d="M${W} ${top}H${b}L${b - slope} ${H}H${W}Z" fill="url(#earth)"/>
    <path d="M0 ${top + 1}H${a}M${W} ${top + 1}H${b}" stroke="#8fa3b0" stroke-width="1.4"/>
    ${abut ? `<path d="M${a - 26} ${top + 2}h26l-3 ${Math.min(60, H - top - 30)}h-20z" fill="url(#conc)"/><path d="M${b} ${top + 2}h26l-3 ${Math.min(60, H - top - 30)}h-20z" fill="url(#conc)"/>` : ''}`;
}
function background() {
  const { W, H, X, Y } = view, y0 = Y(0), x0 = X(0);
  const sky = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  const defs = `<defs><pattern id="sky" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#0f171d"/><path d="M20 0H0V20" fill="none" stroke="#17232c" stroke-width=".8"/></pattern>
    <linearGradient id="water" x2="0" y2="1"><stop stop-color="#16405e"/><stop offset="1" stop-color="#0d2638"/></linearGradient>
    <pattern id="earth" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#15130f"/><path d="M0 0v7" stroke="#3b3326" stroke-width="1.2"/></pattern>
    <pattern id="conc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="6" height="6" fill="#1c262d"/><path d="M0 0v6" stroke="#3a4b57" stroke-width="1"/></pattern>
    <pattern id="brick" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#1e1612"/><path d="M0 .5H28M0 7.5H28M14 0v7M0 7v7M28 7v7" stroke="#5a3a2c" stroke-width="1"/></pattern>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" stroke="#6d8796" stroke-width="1.4"/></pattern></defs>`;
  let g = '';
  const xEnd = X(Math.max(...preset.nodes.map(n => n.x)));
  if (preset.setting === 'wall') g = `<rect x="0" y="0" width="${x0}" height="${H}" fill="url(#brick)"/><rect x="${x0 - 4}" y="0" width="4" height="${H}" fill="#a8b8c3"/>`;
  if (preset.setting === 'river') g = valley(x0 + 6, xEnd - 6, y0 + 6, 30);
  if (preset.setting === 'site') g = `<rect x="0" y="${y0 + 2}" width="${W}" height="${H - y0}" fill="url(#earth)"/><rect x="0" y="${y0 + 2}" width="${W}" height="1.4" fill="#8fa3b0"/>`;
  if (preset.setting === 'pool') g = `<rect x="0" y="${y0 + 8}" width="${x0 + view.s * 1100}" height="${H - y0}" fill="url(#conc)" stroke="#8fa3b0"/><rect x="${x0 + view.s * 1100}" y="${y0 + 60}" width="${W}" height="${H}" fill="url(#water)"/>`;
  if (preset.setting === 'gap') {
    const a = X(preset.gap[0]), b = X(preset.gap[1]);
    g = valley(a, b, y0, 14, false);
  }
  if (preset.editable) {
    const v = preset.view; let dots = '';
    for (let x = Math.ceil(v.minX / 1000) * 1000; x <= v.maxX; x += 1000) for (let y = Math.ceil(v.minY / 1000) * 1000; y <= v.maxY; y += 1000) dots += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="1.4" fill="#4a5f6c" opacity=".7"/>`;
    g += dots + `<text class="hint" x="${X(preset.gap[0]) + 4}" y="${y0 + 14}">← ${(preset.gap[1] - preset.gap[0]) / 1000} m →</text>`;
  }
  if (preset.setting === 'building') {
    const yt = Y(preset.nodes[1].y);
    g = `<rect x="0" y="${y0 + 4}" width="${W}" height="${H - y0}" fill="url(#conc)"/><rect x="0" y="${yt - 26}" width="${W}" height="22" fill="url(#conc)" stroke="#4a5f6c"/>`;
  }
  return defs + sky + g;
}

function supportGlyph(sp) {
  const n = preset.nodes[sp.node], x = view.X(n.x), y = view.Y(n.y);
  if (sp.type === 'fixed') return preset.setting === 'wall' ? '' : `<rect x="${x - 16}" y="${y + 4}" width="32" height="10" fill="url(#hatch)" stroke="#8fa3b0"/>`;
  if (sp.type === 'pin') return `<path d="M${x} ${y + 3}l-12 18h24z" fill="#0d151b" stroke="#c9d6df" stroke-width="1.2"/><rect x="${x - 16}" y="${y + 21}" width="32" height="6" fill="url(#hatch)"/>`;
  if (sp.type === 'roller') return `<path d="M${x} ${y + 3}l-11 14h22z" fill="#0d151b" stroke="#c9d6df" stroke-width="1.2"/><circle cx="${x - 6}" cy="${y + 21}" r="4" fill="#0d151b" stroke="#c9d6df"/><circle cx="${x + 6}" cy="${y + 21}" r="4" fill="#0d151b" stroke="#c9d6df"/>`;
  if (sp.type === 'guide') return `<path d="M${x - 14} ${y - 10}v20M${x + 14} ${y - 10}v20" stroke="#c9d6df" stroke-width="3"/>`;
  return '';
}

function loadGlyph(l, k) {
  const o = LOAD_OBJECTS[l.obj];
  const st = buildStructure(preset, state);
  const p = analysis.ok ? displacedPoint(st, analysis.res, l.member, l.at, scaleNow()) : (() => { const m = preset.members[l.member], a = preset.nodes[m.i], b = preset.nodes[m.j]; return { x: a.x + (b.x - a.x) * l.at, y: a.y + (b.y - a.y) * l.at }; })();
  const x = view.X(p.x), y = view.Y(p.y);
  const size = Math.max(22, Math.min(58, 14 + 9 * Math.log10(o.kg)));
  const hang = preset.hang, vertical = preset.id === 'column';
  const gy = hang ? y + 40 : y - (vertical ? 22 : 8);
  let shape;
  if (o.glyph === 'person') { const k = size; shape = `<g fill="#c9d6df" stroke="#c9d6df" stroke-linecap="round"><circle cx="0" cy="${-k * .86}" r="${k * .11}" stroke="none"/><path d="M0 ${-k * .72}V${-k * .36}" stroke-width="${k * .14}"/><path d="M${-k * .02} ${-k * .38}L${-k * .1} -2M${k * .02} ${-k * .38}L${k * .1} -2" stroke-width="${k * .09}" fill="none"/><path d="M0 ${-k * .66}L${-k * .14} ${-k * .44}M0 ${-k * .66}L${k * .14} ${-k * .44}" stroke-width="${k * .07}" fill="none"/></g>${l.obj === 'jump' ? `<path d="M${-k * .5} ${-k * .9}l6 6M${k * .5} ${-k * .9}l-6 6" stroke="#d7261e" stroke-width="2"/>` : ''}`; }
  else if (o.glyph === 'car') shape = `<path d="M${-size * .7} -5v${-size * .2}l${size * .2} ${-size * .2}h${size * .66}l${size * .3} ${size * .2}h${size * .24}v${size * .2}z" fill="#16222b" stroke="#e6eef3" stroke-width="1.2" stroke-linejoin="round"/><path d="M${-size * .44} ${-size * .42}h${size * .52}l${size * .18} ${size * .14}h${-size * .7}z" fill="#2c4a63"/><g fill="#0d151b" stroke="#e6eef3" stroke-width="1.2"><circle cx="${-size * .4}" cy="-4" r="${size * .1}"/><circle cx="${size * .42}" cy="-4" r="${size * .1}"/></g>`;
  else if (o.glyph === 'truck') shape = `<rect x="${-size * .8}" y="${-size * .64}" width="${size * 1.08}" height="${size * .54}" fill="#16222b" stroke="#e6eef3" stroke-width="1.2"/><path d="M${-size * .8} ${-size * .46}h${size * 1.08}M${-size * .8} ${-size * .28}h${size * 1.08}" stroke="#2c3e4a"/><path d="M${size * .3} ${-size * .5}h${size * .25}l${size * .16} ${size * .2}v${size * .2}h${-size * .41}z" fill="#16222b" stroke="#e6eef3" stroke-width="1.2"/><path d="M${size * .36} ${-size * .44}h${size * .16}l${size * .08} ${size * .12}h${-size * .24}z" fill="#2c4a63"/><g fill="#0d151b" stroke="#e6eef3" stroke-width="1.2"><circle cx="${-size * .52}" cy="-4" r="${size * .1}"/><circle cx="${-size * .3}" cy="-4" r="${size * .1}"/><circle cx="${size * .48}" cy="-4" r="${size * .1}"/></g>`;
  else shape = `<rect x="${-size * .4}" y="${-size * .7}" width="${size * .8}" height="${size * .66}" rx="2" fill="#16222b" stroke="#e6eef3" stroke-width="1.2"/><path d="M${-size * .4} ${-size * .7}l${size * .8} ${size * .66}M${size * .4} ${-size * .7}l${-size * .8} ${size * .66}" stroke="#2c3e4a"/>`;
  const arrow = hang
    ? `<path d="M${x} ${y}V${gy - size * .75}" stroke="#8fa3b0" stroke-width="1.2"/>`
    : '';
  const label = `<text class="tag" x="${x}" y="${hang ? gy + 14 : gy - size - 4}" text-anchor="middle">${o.kg >= 1000 ? (o.kg / 1000) + ' t' : o.kg + ' kg'}</text>`;
  return `${arrow}<g class="load${l.fixed ? '' : ' draggable'}" data-load="${k}" transform="translate(${x} ${hang ? gy + size * .7 : gy})" role="img" aria-label="${o.name}, ${o.kg} kg"><rect x="${-size * .8}" y="${-size * 1.1}" width="${size * 1.6}" height="${size * 1.2}" fill="transparent"/>${shape}</g>${label}`;
}

let lastScale = 1;
function scaleNow() { return lastScale; }

function draw() {
  layout();
  // While drawing, setting supports or deleting, only members and joints take taps: loads, crowds and labels drawn
  // on top of a member never block it.
  svg.classList.toggle('editing', !!preset.editable && tool !== 'move');
  const st = buildStructure(preset, state);
  let out = background();
  out += preset.supports.map(supportGlyph).join('');
  if (!analysis.ok) {
    lastScale = 1;
    out += preset.members.map((m, k) => `<line x1="${view.X(preset.nodes[m.i].x)}" y1="${view.Y(preset.nodes[m.i].y)}" x2="${view.X(preset.nodes[m.j].x)}" y2="${view.Y(preset.nodes[m.j].y)}" stroke="#8a949c" stroke-width="7" stroke-linecap="round"/><path class="hit" data-member="${k}" d="M${view.X(preset.nodes[m.i].x)},${view.Y(preset.nodes[m.i].y)}L${view.X(preset.nodes[m.j].x)},${view.Y(preset.nodes[m.j].y)}"/>`).join('');
    if (preset.members.length) out += state.loads.map(loadGlyph).join('');
    svg.innerHTML = out + editOverlay(); return;
  }
  const md = analysis.maxDefl.d;
  lastScale = state.exaggerate && !mview.on && md > 0 && !(preset.editable && tool !== 'move') ? Math.max(1, (0.07 * Math.min(view.W, view.H)) / (md * view.s)) : 1;
  // undeformed ghost
  out += preset.members.map(m => `<line x1="${view.X(preset.nodes[m.i].x)}" y1="${view.Y(preset.nodes[m.i].y)}" x2="${view.X(preset.nodes[m.j].x)}" y2="${view.Y(preset.nodes[m.j].y)}" class="ghost"/>`).join('');
  const failed = analysis.sf < 1 ? analysis.governing : null;
  preset.members.forEach((m, k) => {
    const am = analysis.members[k];
    const width = Math.max(4, Math.min(16, am.section.depth * view.s * (preset.members.length > 4 ? 1.4 : 1)));
    const pts = [];
    for (let i = 0; i <= SAMPLES; i++) {
      let p = displacedPoint(st, analysis.res, k, i / SAMPLES, lastScale);
      if (failed === am && am.mode === 'buckling') { // show the buckled shape
        const a = preset.nodes[m.i], b = preset.nodes[m.j], L = Math.hypot(b.x - a.x, b.y - a.y), amp = 0.06 * L * Math.sin(Math.PI * i / SAMPLES);
        p = { x: p.x - amp * (b.y - a.y) / L, y: p.y + amp * (b.x - a.x) / L };
      }
      pts.push(p);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const u = Math.max(1 / am.samples[i].sf, 1 / am.samples[i + 1].sf, am.mode === 'buckling' ? 1 / am.sfBuckle : 0);
      out += `<line x1="${view.X(pts[i].x).toFixed(1)}" y1="${view.Y(pts[i].y).toFixed(1)}" x2="${view.X(pts[i + 1].x).toFixed(1)}" y2="${view.Y(pts[i + 1].y).toFixed(1)}" stroke="${utilColour(u)}" stroke-width="${width.toFixed(1)}" stroke-linecap="round"/>`;
    }
    if (failed === am && am.mode !== 'buckling') {
      const p = pts[Math.round(am.worst.t * SAMPLES)], x = view.X(p.x), y = view.Y(p.y);
      out += `<path d="M${x - 4} ${y - 14}l8 7-8 7 8 7" stroke="#0d151b" stroke-width="3" fill="none"/><path d="M${x - 4} ${y - 14}l8 7-8 7 8 7" stroke="#ff5a4f" stroke-width="1.5" fill="none"/>`;
    }
    const sel = (state.selected ?? analysis.governing.index) === k;
    const d = 'M' + pts.map(p => `${view.X(p.x).toFixed(1)},${view.Y(p.y).toFixed(1)}`).join('L');
    if (sel) out += `<path d="${d}" fill="none" stroke="#4fc3f7" stroke-width="${width + 6}" stroke-opacity=".25" stroke-linecap="round" pointer-events="none"/>`;
    out += `<path class="hit" data-member="${k}" d="${d}" role="button" tabindex="0" aria-label="${memberRole(k)} ${k + 1}"/>`;
  });
  // joints
  const seen = new Set();
  preset.members.forEach((m, k) => [[m.i, 0], [m.j, 1]].forEach(([n, t]) => {
    if (seen.has(n) || (preset.members.length < 2 && !preset.editable)) return; seen.add(n);
    const p = displacedPoint(st, analysis.res, k, t, lastScale);
    out += `<circle cx="${view.X(p.x)}" cy="${view.Y(p.y)}" r="3.5" fill="#0d151b" stroke="#e6eef3" stroke-width="1.4"/>`;
  }));
  if (state.forces) out += analysis.res.reactions.map(r => {
    const n = preset.nodes[r.node], x = view.X(n.x), y = view.Y(n.y) + 34;
    let a = '';
    if (Math.abs(r.fy) > 1) a += `<path d="M${x} ${y + 34}V${y + 4}" class="arrow" marker-end="url(#ah)"/><text class="force" x="${x + 6}" y="${y + 30}">${kN(r.fy)} ${r.fy > 0 ? '↑' : '↓'}</text>`;
    if (Math.abs(r.fx) > 1) a += `<text class="force" x="${x + 6}" y="${y + 46}">${kN(Math.abs(r.fx))} ${r.fx > 0 ? '→' : '←'}</text>`;
    if (Math.abs(r.m) > 1) a += `<text class="force" x="${x + 6}" y="${y - 40}">${kNm(Math.abs(r.m))} ${r.m > 0 ? '↺' : '↻'}</text>`;
    return a;
  }).join('') + `<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3fbf7f"/></marker></defs>`;
  out += state.loads.map(loadGlyph).join('');
  if (mview.on) out += momentOverlay(st);
  if (lastScale > 1.5) out += `<text class="hint" x="${view.W - 8}" y="16" text-anchor="end">bend shown ×${fmt(lastScale, 0)}</text>`;
  svg.innerHTML = `<title id="scene-title">${preset.name}: ${verdict(analysis).text}</title>` + out + editOverlay();
}

// Joints you can grab, the member being drawn, pin markers — only while building.
function editOverlay() {
  if (!preset.editable) return '';
  const d = analysis.ok && tool === 'move' ? analysis.res.displacements : null; // joints follow the drawn (bent) shape
  let o = preset.nodes.map((n, k) => {
    const x = n.x + (d ? lastScale * d[3 * k] : 0), y = n.y + (d ? lastScale * d[3 * k + 1] : 0);
    return `<circle class="node${tool === 'supports' ? ' target' : ''}" data-node="${k}" cx="${view.X(x)}" cy="${view.Y(y)}" r="${tool === 'move' ? 5.5 : 9}"/>`;
  }).join('');
  if (pending) {
    o += `<circle cx="${view.X(pending.x)}" cy="${view.Y(pending.y)}" r="8" fill="#e0531f"/>`;
    if (hover) o += `<line x1="${view.X(pending.x)}" y1="${view.Y(pending.y)}" x2="${view.X(snap(hover.x))}" y2="${view.Y(snap(hover.y))}" stroke="#e0531f" stroke-width="4" stroke-dasharray="8 6" pointer-events="none"/>`;
  }
  return o;
}

// ---------- moment view (playground/moments.mjs: a view on the solver's results) ----------
const mview = { on: false, O: null, reactions: true, result: null };
const MCOL = { load: '#f0b429', reaction: '#3fbf7f', distributed: '#9fb3c0', couple: '#3fbf7f' };
const Nmm = v => (Math.abs(v) >= 1e6 ? `${fmt(v / 1e6, 2)} kN·m` : `${fmt(v / 1e3, 1)} N·m`);
const Nf = v => (Math.abs(v) >= 1000 ? kN(v) : `${fmt(v, 0)} N`);
const turn = v => (Math.abs(v) < 1e-6 ? '' : v > 0 ? ' ↺' : ' ↻');
function defaultPoint() { const sp = preset.supports[0]; return sp ? { ...preset.nodes[sp.node], node: sp.node } : preset.nodes[0] ? { ...preset.nodes[0], node: 0 } : { x: 0, y: 0, node: null }; }
function computeMoments(st) {
  if (!mview.on || !analysis.ok) { mview.result = null; return null; }
  if (!mview.O || (mview.O.node !== null && !preset.nodes[mview.O.node])) mview.O = defaultPoint();
  if (mview.O.node !== null) mview.O = { ...mview.O, ...preset.nodes[mview.O.node] };
  mview.result = momentsAbout(st, analysis.res, mview.O, { labels: state.loads.map(l => LOAD_OBJECTS[l.obj].name), includeReactions: mview.reactions });
  document.body.dataset.msum = mview.result.sum.toFixed(3);
  return mview.result;
}
function momentOverlay(st) {
  const m = computeMoments(st); if (!m) return '';
  const { X, Y, W, H, s } = view, ox = X(m.O.x), oy = Y(m.O.y), far = 2 * Math.hypot(W, H) / s;
  let o = '<g class="moments" pointer-events="none">', labelled = 0;
  m.rows.forEach(r => {
    const c = MCOL[r.kind];
    if (r.kind === 'couple') {
      const n = r.id.startsWith('reaction-m-') ? preset.nodes[analysis.res.reactions[+r.id.split('-')[2]].node] : m.O, x = X(n.x), y = Y(n.y);
      o += `<path d="M${x + 22} ${y}A22 22 0 1 ${r.M > 0 ? 0 : 1} ${x} ${y - 22}" fill="none" stroke="${c}" stroke-width="2" marker-end="url(#mh-${r.kind})"/>`;
      return;
    }
    const len = Math.hypot(r.F.x, r.F.y), ux = r.F.x / len, uy = r.F.y / len, a = r.at;
    o += `<line class="loa" x1="${X(a.x - ux * far)}" y1="${Y(a.y - uy * far)}" x2="${X(a.x + ux * far)}" y2="${Y(a.y + uy * far)}" stroke="${c}"/>`;
    const tx = X(a.x), ty = Y(a.y), tail = 34;
    o += `<path d="M${tx - ux * tail} ${ty + uy * tail}L${tx} ${ty}" stroke="${c}" stroke-width="2.4" marker-end="url(#mh-${r.kind})"/>`;
    if (r.d * s > 3) {
      const fx = X(r.foot.x), fy = Y(r.foot.y), px = (ox - fx) / Math.hypot(ox - fx, oy - fy), py = (oy - fy) / Math.hypot(ox - fx, oy - fy), q = 7;
      o += `<line x1="${ox}" y1="${oy}" x2="${fx}" y2="${fy}" stroke="${c}" stroke-width="2"/>`;
      o += `<path d="M${fx + px * q} ${fy + py * q}L${fx + px * q + ux * q} ${fy + py * q - uy * q}L${fx + ux * q} ${fy - uy * q}" fill="none" stroke="${c}" stroke-width="1.2"/>`;
      const right = fx > W - 80 ? false : fx < 80 ? true : fx >= ox;   // keep the label inside the scene
      o += `<text class="mlabel" x="${fx + (right ? 6 : -6)}" y="${fy - 6 - 13 * (labelled++ % 3)}" text-anchor="${right ? 'start' : 'end'}" fill="${c}">d ${fmt(r.d / 1000, r.d < 1000 ? 3 : 2)} m</text>`;
    }
  });
  o += `<circle cx="${ox}" cy="${oy}" r="9" fill="none" stroke="#e0531f" stroke-width="2.4"/><path d="M${ox - 14} ${oy}h28M${ox} ${oy - 14}v28" stroke="#e0531f" stroke-width="1.6"/><text class="mlabel" x="${ox + 12}" y="${oy + 22}" fill="#e0531f">O</text>`;
  o += `<defs>${Object.entries(MCOL).map(([k, c]) => `<marker id="mh-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs></g>`;
  return o;
}
function paintMoments() {
  const el = $('moments'); if (!el) return;
  $('t-moment').setAttribute('aria-pressed', String(mview.on));
  if (!mview.on) { el.innerHTML = '<h2>Moments about a point</h2><p>Turn on <b>Moments</b> above the scene, then tap any point: each force shows its line of action, its lever arm (the perpendicular distance from the point) and its moment.</p><div class="row"><button type="button" class="primary" id="m-on">Show moments</button></div>'; $('m-on').onclick = () => setMoments(true); return; }
  const m = mview.result;
  if (!m) { el.innerHTML = `<h2>Moments about a point</h2><p>${analysis.ok ? '' : 'The structure is not stable, so there are no moments to show.'}</p>`; return; }
  const ok = balanced(m), where = m.O.node !== null ? `joint ${m.O.node + 1}` : 'the tapped point';
  el.innerHTML = `<h2>Moments about O</h2><p class="note">O is at ${where} (${fmt(m.O.x / 1000, 2)}, ${fmt(m.O.y / 1000, 2)}) m. Tap the scene to move it. Anticlockwise ↺ is +.</p>
    <div class="chips" role="radiogroup" aria-label="Take moments about">${preset.nodes.map((n, k) => `<button type="button" role="radio" data-mpoint="${k}" aria-checked="${m.O.node === k}">Joint ${k + 1}${preset.supports.some(sp => sp.node === k) ? ' (support)' : ''}</button>`).join('')}</div>
    <label class="mcheck"><input type="checkbox" id="m-react" ${mview.reactions ? 'checked' : ''}> Include support reactions</label>
    <table class="mtable"><thead><tr><th>Force</th><th>F</th><th>Lever arm d</th><th>M about O</th></tr></thead><tbody>
    ${m.rows.map(r => `<tr data-row="${r.id}"><th><i style="background:${MCOL[r.kind]}"></i>${r.label}</th><td>${r.F ? Nf(Math.hypot(r.F.x, r.F.y)) : 'couple'}</td><td>${r.d === null ? '–' : `${fmt(r.d / 1000, r.d < 1000 ? 3 : 2)} m`}</td><td>${Nmm(r.M)}${turn(r.M)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th colspan="3">ΣM about O</th><td id="m-sum">${ok ? '0' : Nmm(m.sum) + turn(m.sum)}</td></tr></tfoot></table>
    <p class="mverdict ${ok ? 'ok' : ''}" id="m-verdict">${mview.reactions ? (ok ? 'ΣM = 0 about this point, as for every point: the structure is in equilibrium.' : 'ΣM is not zero: check the model.')
      : `Loads alone: ΣM = ${Nmm(m.sumLoads)}${turn(m.sumLoads)}. The supports must supply ${Nmm(-m.sumLoads)}${turn(-m.sumLoads)} about O to hold it still.`}</p>
    <p class="tip">M = F × d. d is measured at right angles to the force’s line of action (dashed), not to where the force acts.</p>`;
  el.querySelectorAll('[data-mpoint]').forEach(b => b.onclick = () => { const k = +b.dataset.mpoint; mview.O = { ...preset.nodes[k], node: k }; update({}); });
  $('m-react').onchange = e => { mview.reactions = e.target.checked; update({}); };
}
function setMoments(on) { mview.on = on; if (on) { mview.O = mview.O || defaultPoint(); WB.open('moments'); } else delete document.body.dataset.msum; update({}); }

// ---------- panels ----------
function paintStats() {
  const v = verdict(analysis);
  $('verdict').className = 'verdict ' + v.level;
  $('verdict').textContent = v.text + (analysis.ok && analysis.coldWarning ? ' Warning: ordinary steel becomes brittle in this cold — real engineers would choose a low-temperature grade.' : '');
  const util = analysis.ok ? 1 / analysis.sf : 1.5;
  $('meter-fill').style.width = `${Math.min(100, util / 1.5 * 100)}%`;
  $('meter-fill').style.background = utilColour(util);
  const kg = state.loads.reduce((s, l) => s + LOAD_OBJECTS[l.obj].kg, 0);
  $('s-load').textContent = kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : `${kg} kg`;
  if (!analysis.ok) { ['s-sf', 's-stress', 's-defl'].forEach(id => { $(id).textContent = '–'; }); paintBuildbar(); return; }
  $('s-sf').textContent = sfText(analysis.sf);
  const top = analysis.members.reduce((a, b) => (b.maxSigma > a.maxSigma ? b : a));
  $('s-stress').textContent = `${fmt(top.maxSigma)} MPa`;
  $('s-defl').textContent = `${fmt(analysis.maxDefl.d, analysis.maxDefl.d < 10 ? 2 : 0)} mm`;
  paintBuildbar();
}

function paintInspect() {
  const el = $('inspect');
  if (!analysis.ok) { el.innerHTML = `<h2>Not stable</h2><p>${analysis.message}</p>`; return; }
  const k = state.selected ?? analysis.governing.index, am = analysis.members[k], w = am.worst.sample;
  const m = am.material, lim = limits(m), sec = am.section;
  const N = w.N, M = w.M, compressed = Math.min(...am.samples.map(s => s.N)) < -1;
  const bending = am.samples.some(s => Math.abs(s.M) > 1);
  const doing = !bending ? (N > 0 ? 'Being pulled (tension)' : N < 0 ? 'Being squeezed (compression)' : 'Hardly loaded') : Math.abs(N / sec.A) > 0.2 * Math.abs(M * sec.c / sec.I) ? `Bending and being ${N > 0 ? 'pulled' : 'squeezed'}` : 'Bending';
  const atText = `${fmt(am.worst.t * am.L / 1000, 2)} m from its ${preset.members[k].tags?.includes('deck') || Math.abs(preset.nodes[preset.members[k].i].y - preset.nodes[preset.members[k].j].y) < 1 ? 'left' : 'lower'} end`;
  const limitName = m.ductile ? 'yield stress' : am.worst.sign > 0 ? 'tensile strength' : 'crushing strength';
  const limitVal = am.worst.sign > 0 ? lim.tension : lim.compression;
  let html = `<div class="ihead"><h2>${memberRole(k)} ${k + 1}</h2><span class="pill" style="background:${utilColour(1 / am.sf)}">SF ${sfText(am.sf)}</span></div>
    <p class="doing">${doing}. ${m.name}, ${sec.label}.</p><div class="eq">`;
  if (bending) html += `<p>Bending moment <b>M = ${kNm(Math.abs(M))}</b> at ${atText}</p>`;
  html += `<p>Axial force <b>N = ${kN(N)}</b> ${N > 1 ? '(tension)' : N < -1 ? '(compression)' : ''}</p>`;
  html += bending
    ? `<p class="f">σ = N/A ± M·c/I<br>= ${fmt(N, 0)} / ${fmt(sec.A, 0)} ± ${sci(Math.abs(M))} × ${fmt(sec.c, 1)} / ${sci(sec.I)}<br>= ${fmt(w.axial, 2)} ± ${fmt(w.bend, 2)} = <b>${fmt(w.sigma, 1)} MPa</b></p>`
    : `<p class="f">σ = N/A = ${fmt(N, 0)} / ${fmt(sec.A, 0)} = <b>${fmt(w.axial, 2)} MPa</b></p>`;
  html += `<p>Limit (${limitName}) ${limitVal} MPa → safety ${sfText(am.worst.sf)}</p>`;
  if (compressed) html += `<p class="f">Buckling load P = π²EI/L² = π² × ${sci(m.E)} × ${sci(sec.I)} / ${fmt(am.L, 0)}² = <b>${kN(am.Pcr)}</b> → safety ${sfText(am.sfBuckle)}</p>`;
  html += `</div><p class="tip">Tap any part of the structure to inspect it.</p>`;
  el.innerHTML = html;
}

function chips(el, items, current, onPick, label = x => x.name) {
  el.innerHTML = items.map(([id, item]) => `<button type="button" role="radio" aria-checked="${String(id) === String(current)}" data-id="${id}">${label(item)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.id));
}

function paintControls() {
  chips($('materials'), preset.materials.map(id => [id, MATERIALS[id]]), state.material, id => update({ material: id }), m => m.name.split(' (')[0]);
  chips($('sections'), preset.sections.map((s, i) => [i, section(s)]), state.section, i => update({ section: +i }), s => s.label);
  chips($('scenarios'), Object.entries(SCENARIOS), state.scenario, id => update({ scenario: id }));
  $('scenario-note').textContent = SCENARIOS[state.scenario].note;
  $('addloads').innerHTML = preset.loadChoices.map(id => `<button type="button" data-add="${id}">+ ${LOAD_OBJECTS[id].name}</button>`).join('');
  $('addloads').querySelectorAll('button').forEach(b => b.onclick = () => {
    if (state.loads.length >= 8 || !preset.members.length) return;
    if (preset.editable) undoStack.push(clone(design()));
    const deck = preset.members.findIndex(m => m.tags?.includes('deck'));
    const fixed = preset.loads[0]?.fixed;
    update({ loads: [...state.loads, fixed ? { ...preset.loads[0], obj: b.dataset.add } : { obj: b.dataset.add, member: deck < 0 ? 0 : deck, at: 0.5 }] });
  });
  $('loadlist').innerHTML = state.loads.map((l, k) => `<button type="button" class="loadchip" data-remove="${k}" aria-label="Remove ${LOAD_OBJECTS[l.obj].name}">${LOAD_OBJECTS[l.obj].name} ×</button>`).join('');
  $('loadlist').querySelectorAll('button').forEach(b => b.onclick = () => { if (preset.editable) undoStack.push(clone(design())); update({ loads: state.loads.filter((_, k) => k !== +b.dataset.remove) }); });
  $('t-forces').setAttribute('aria-pressed', String(state.forces));
  $('t-shape').setAttribute('aria-pressed', String(state.exaggerate));
}

// ---------- guided path ----------
function metric(a, name) {
  if (!a.ok) return 0;
  if (name === 'stress') return Math.max(...a.members.map(m => m.maxSigma));
  if (name === 'deflection') return a.maxDefl.d;
  if (name === 'sf') return a.sf;
  if (name === 'mode') return a.governing.mode;
  if (name === 'tieForce') { const k = preset.members.findIndex(m => m.group === 'tie'); return Math.abs(a.members[k].samples[SAMPLES / 2].N); }
  return 0;
}
function predictAnswer(step, before, after) {
  const p = step.predict, a = metric(before, p.metric), b = metric(after, p.metric);
  const opts = p.options || ['More', 'Same', 'Less'];
  if (p.metric === 'mode') return b === 'tension' ? 'Pulled' : 'Squeezed';
  if (opts[0] === 'Safe') return after.ok && b >= 1.5 ? 'Safe' : 'Unsafe';
  if (opts[0] === 'Much stronger') return b / a > 1.5 ? 'Much stronger' : b / a > 1.05 ? 'A little' : 'No change';
  return b > a * 1.02 ? 'More' : b < a * 0.98 ? 'Less' : 'Same';
}
function changeWords(step, before, after) {
  const p = step.predict, a = metric(before, p.metric), b = metric(after, p.metric);
  if (p.metric === 'mode') { const g = after.governing; return `${memberRole(g.index)} ${g.index + 1} fails first by ${g.mode === 'buckling' ? 'buckling' : g.mode}.`; }
  const name = { stress: 'Highest stress', deflection: 'Biggest movement', sf: 'Safety factor', tieForce: 'Tie rod force' }[p.metric];
  const unit = { stress: ' MPa', deflection: ' mm', sf: '', tieForce: '' }[p.metric];
  const show = v => p.metric === 'tieForce' ? kN(v) : p.metric === 'sf' ? sfText(v) : fmt(v, v < 10 ? 2 : 0) + unit;
  return `${name}: ${show(a)} → ${show(b)}${a ? ` (${b >= a ? '+' : ''}${fmt((b / a - 1) * 100, 0)}%)` : ''}.`;
}

function paintGuide() {
  const el = $('guide');
  if (!preset) return;
  document.querySelector('[data-open="guide"]').hidden = mode !== 'learn';
  if (mode !== 'learn') { if (WB.current === 'guide') WB.open('inspect'); return; }
  const steps = preset.steps, step = steps[guide.step], last = guide.step === steps.length - 1;
  let html = `<div class="ghead"><span>Step ${guide.step + 1} of ${steps.length}</span><div class="dots">${steps.map((_, i) => `<i class="${i <= guide.step ? 'on' : ''}"></i>`).join('')}</div></div>`;
  if (!step.predict) {
    html += `<p class="gtext">${step.text}</p><div class="row">${last ? '<button type="button" class="primary" id="g-explore">Explore freely</button>' : '<button type="button" class="primary" id="g-next">Next</button>'}</div>`;
  } else if (!guide.revealed) {
    html += `<p class="think">Pause and think</p><p class="gtext">${step.predict.prompt}</p><div class="row">${(step.predict.options || ['More', 'Same', 'Less']).map(o => `<button type="button" class="guess" data-guess="${o}">${o}</button>`).join('')}</div>`;
  } else {
    const right = guide.guess === guide.answer;
    html += `<p class="result ${right ? 'right' : 'wrong'}">${right ? 'You were right' : 'Not quite'}: ${guide.answer.toLowerCase()}. ${guide.words}</p><p class="gtext">${step.explain}</p><div class="row"><button type="button" class="primary" id="g-next">Next</button></div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.guess').forEach(b => b.onclick = () => {
    const before = analysis, next = step.predict.change(state), after = run(next);
    guide = { ...guide, guess: b.dataset.guess, answer: predictAnswer(step, before, after), words: changeWords(step, before, after), revealed: true };
    record(step);
    update(next);
  });
  const nx = $('g-next'); if (nx) nx.onclick = () => { guide = { step: guide.step + 1, revealed: false }; record(); paintGuide(); };
  const ex = $('g-explore'); if (ex) ex.onclick = () => setMode('explore');
}

function record() {
  const progress = store.get('labs.progress', {});
  progress[preset.id] = Math.max(progress[preset.id] || 0, guide.step + (guide.revealed ? 1 : 0));
  store.set('labs.progress', progress);
}

// ---------- state changes ----------
function update(patch) {
  state = { ...state, ...patch };
  if (patch.material || patch.section !== undefined || patch.loads) state.selected = patch.selected ?? null;
  analysis = run(state);
  draw(); paintStats(); paintInspect(); paintControls(); paintMoments(); if (!patch.loads || !drag) paintGuide();
  document.body.dataset.sf = analysis.ok ? analysis.sf.toFixed(3) : 'unstable';
  if (preset.editable && !drag && !nodeDrag) saveDesign();
  if (nb && !drag && !nodeDrag) nb.sync();
}

function paintBuildbar() {
  const bar = $('buildbar');
  if (!preset.editable) {
    bar.innerHTML = '<button type="button" id="b-copy">Edit this structure</button>';
    const c = $('b-copy'); if (c) c.onclick = () => editCopy();
    return;
  }
  const bs = buildStructure(preset, state), kg = mass(preset, m => bs.members[preset.members.indexOf(m)]);
  const tools = [['move', 'Move & inspect'], ['draw', 'Draw'], ['supports', 'Supports'], ['delete', 'Delete']];
  bar.innerHTML = `<div class="chips" role="radiogroup" aria-label="Building tool">${tools.map(([id, n]) => `<button type="button" role="radio" data-tool="${id}" aria-checked="${tool === id}">${n}</button>`).join('')}</div>
    <div class="chips" role="radiogroup" aria-label="Joints for new members"><button type="button" role="radio" data-joint="frame" aria-checked="${jointType === 'frame'}">Rigid joints</button><button type="button" role="radio" data-joint="truss" aria-checked="${jointType === 'truss'}">Pin joints</button>
    <button type="button" id="b-undo" ${undoStack.length ? '' : 'disabled'}>Undo</button><button type="button" id="b-clear">Clear</button></div>
    <p class="mass">Material used <b id="b-mass">${fmt(kg, 0)} kg</b> · ${preset.members.length} members</p>`;
  bar.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; pending = null; draw(); paintBuildbar(); });
  bar.querySelectorAll('[data-joint]').forEach(b => b.onclick = () => { jointType = b.dataset.joint; paintBuildbar(); });
  $('b-undo').onclick = () => { const d = undoStack.pop(); if (!d) return; Object.assign(preset, { nodes: d.nodes, members: d.members, supports: d.supports }); update({ loads: d.loads, selected: null }); saveDesign(); };
  $('b-clear').onclick = () => edit(d => ({ nodes: [], members: [], supports: [], loads: [] }));
}

function editCopy() { openBuild(editableCopy(preset, state, BUILD)); }

function openBuild(p) {
  preset = p; undoStack = []; tool = 'move'; pending = null; mview.O = null;
  store.set('labs.preset', 'build');
  state = { ...freshState(preset), loads: clone(p.loads || []), material: p.material, section: p.section, scenario: p.scenario || 'normal' };
  guide = { step: 0, revealed: false };
  $('title').textContent = preset.name; $('question').textContent = preset.question;
  document.querySelectorAll('#objects button').forEach(b => b.setAttribute('aria-current', String(b.dataset.preset === 'build')));
  if (location.hash !== '#build') window.history.replaceState(null, '', '#build');
  update({}); saveDesign();
}

function setPreset(id) {
  if (id === 'build') { openBuild(store.get('labs.design', null) || clone(BUILD)); return; }
  preset = PRESETS.find(p => p.id === id) || PRESETS[0];
  store.set('labs.preset', preset.id);
  state = freshState(preset); mview.O = null;
  guide = { step: 0, revealed: false };
  $('title').textContent = preset.name;
  $('question').textContent = preset.question;
  document.querySelectorAll('#objects button').forEach(b => b.setAttribute('aria-current', String(b.dataset.preset === preset.id)));
  update({});
}

function setMode(m) {
  mode = m; store.set('labs.mode', m); if (m === 'learn') WB.open('guide');
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  paintGuide(); if (preset) paintBuildbar();
}

// ---------- interaction ----------
function pointer(e) { const r = svg.getBoundingClientRect(); return view.toWorld(e.clientX - r.left, e.clientY - r.top); }
function nearestDeck(w) {
  let best = null;
  preset.members.forEach((m, k) => {
    if (!m.tags?.includes('deck')) return;
    const a = preset.nodes[m.i], b = preset.nodes[m.j], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((w.x - a.x) * dx + (w.y - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(a.x + dx * t - w.x, a.y + dy * t - w.y);
    if (!best || d < best.d) best = { d, member: k, at: t };
  });
  return best;
}
function nodeNear(e, px = 28) {
  const w = pointer(e), k = findNode(preset, w, px / view.s);
  return k;
}
svg.addEventListener('pointerdown', e => {
  const hit = e.target.closest('.hit');
  if (preset.editable && tool !== 'move') {
    e.preventDefault();
    const w = pointer(e);
    if (tool === 'draw') {
      const k = nodeNear(e), p = k >= 0 ? preset.nodes[k] : { x: snap(w.x), y: snap(w.y) };
      if (!pending) { pending = p; hover = w; draw(); }
      else { const a = pending; pending = null; edit(d => addMember(d, a, p, jointType)); draw(); }
    } else if (tool === 'supports') {
      const k = nodeNear(e); if (k >= 0) edit(d => cycleSupport(d, k));
    } else if (tool === 'delete' && hit) edit(d => deleteMember(d, +hit.dataset.member));
    return;
  }
  const g = e.target.closest('.load.draggable');
  if (g) { drag = +g.dataset.load; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (mview.on && analysis.ok) { e.preventDefault(); mview.O = pickPoint(preset, pointer(e), 24 / view.s); update({}); WB.open('moments'); return; }
  const nd = e.target.closest('.node');
  if (nd && preset.editable) { nodeDrag = { k: +nd.dataset.node, before: clone(design()) }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (hit) { update({ selected: +hit.dataset.member }); WB.open('inspect'); }
});
svg.addEventListener('pointermove', e => {
  if (pending) { hover = pointer(e); draw(); return; }
  if (nodeDrag) {
    const d = moveNode(design(), nodeDrag.k, pointer(e));
    if (d.nodes !== preset.nodes) { preset.nodes = d.nodes; update({ selected: state.selected }); }
    return;
  }
  if (drag === null) return;
  const n = nearestDeck(pointer(e));
  if (!n) return;
  update({ loads: state.loads.map((l, k) => (k === drag ? { ...l, member: n.member, at: +n.at.toFixed(3) } : l)), selected: state.selected });
});
const endDrag = () => {
  if (nodeDrag) { undoStack.push(nodeDrag.before); nodeDrag = null; saveDesign(); paintBuildbar(); }
  if (drag !== null) { drag = null; paintGuide(); saveDesign(); }
};
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('keydown', e => { const hit = e.target.closest?.('.hit'); if (hit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); update({ selected: +hit.dataset.member }); WB.open('inspect'); } });
$('t-forces').onclick = () => update({ forces: !state.forces });
$('t-shape').onclick = () => update({ exaggerate: !state.exaggerate });
$('t-moment').onclick = () => setMoments(!mview.on);
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
new ResizeObserver(() => { if (preset) draw(); }).observe(svg);

// ---------- experiments (shared project + evidence record, core/project.mjs) ----------
const SETUP_KEYS = ['id', 'name', 'editable', 'copiedFrom', 'setting', 'gap', 'view', 'deckWidth', 'sideHeight', 'hang', 'question', 'nodes', 'members', 'supports', 'groups', 'materials', 'sections', 'loadChoices'];
const getSetup = () => ({ object: Object.fromEntries(SETUP_KEYS.filter(k => preset[k] !== undefined).map(k => [k, clone(preset[k])])),
  state: { material: state.material, section: state.section, scenario: state.scenario, loads: clone(state.loads) }, v: SETUP_VERSION });
export { SOLIDS_ADAPTER };   // the pure adapter lives in ./model.mjs (DOM-free, used by ./learn.mjs)
function applySetup(setup) {
  if (setup.object.editable) openBuild({ ...clone(BUILD), ...setup.object, loads: setup.state.loads, material: setup.state.material, section: setup.state.section, scenario: setup.state.scenario });
  else { setPreset(setup.object.id); state = { ...state, ...setup.state }; }
  update({ scenario: setup.state.scenario });
}
let nb = null;
const WB = workbench('playground', { initial: 'guide' });
$('objects').innerHTML = PRESETS.map(p => `<button type="button" data-preset="${p.id}">${p.name}</button>`).join('') + '<button type="button" data-preset="build" class="buildbtn">+ Build your own</button>';
$('objects').querySelectorAll('button').forEach(b => b.onclick = () => { setPreset(b.dataset.preset); location.hash = b.dataset.preset; });
setMode(mode);
const QUERY = new URLSearchParams(location.search);   // ?preset=shelf&view=moment: how a journey opens the playground
setPreset(location.hash.slice(1) || QUERY.get('preset') || store.get('labs.preset', 'footbridge'));
window.addEventListener('hashchange', () => { if (location.hash.slice(1) !== preset.id) setPreset(location.hash.slice(1)); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pending) { pending = null; draw(); } });
nb = notebook($('experiments'), { adapter: SOLIDS_ADAPTER, getSetup, applySetup });
// ?project=current (how the learning loop returns the student to their own project): put the open project's setup on
// the bench instead of overwriting it with the last preset viewed.
if (QUERY.get('project') === 'current' && nb.project().setup?.object?.members) applySetup(clone(nb.project().setup));
nb.sync(); nb.render();
if (QUERY.get('view') === 'moment') setMoments(true);
window.__labs = { toScreen: (x, y) => ({ x: view.X(x), y: view.Y(y) }), moments: () => mview.result && JSON.parse(JSON.stringify(mview.result)) }; // used by browser tests
document.body.dataset.ready = 'true';
