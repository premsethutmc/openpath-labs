// Pure editing operations for learner-built structures. A design is { nodes, members, supports, loads }.
// Coordinates in mm. All functions return a new design (never mutate).

import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';
import { SCENARIOS, applyScenario } from '../core/scenarios.mjs';
import { LOAD_OBJECTS } from './presets.mjs';

export const GRID = 500;
export const snap = v => Math.round(v / GRID) * GRID + 0; // + 0 turns -0 into 0
const SUPPORT_CYCLE = ['pin', 'roller', 'fixed', 'guide', null];

export function emptyDesign() {
  return { nodes: [], members: [], supports: [], loads: [] };
}

export function findNode(d, p, tol = GRID / 2) {
  let best = -1, bd = tol;
  d.nodes.forEach((n, k) => { const dist = Math.hypot(n.x - p.x, n.y - p.y); if (dist <= bd) { bd = dist; best = k; } });
  return best;
}

function ensureNode(d, p) {
  const k = findNode(d, p, 1);
  if (k >= 0) return [d, k];
  return [{ ...d, nodes: [...d.nodes, { x: p.x, y: p.y }] }, d.nodes.length];
}

// Adds a member between two (snapped) points; reuses existing joints. type: 'frame' (rigid) or 'truss' (pinned).
export function addMember(d, a, b, type = 'frame') {
  a = { x: snap(a.x), y: snap(a.y) }; b = { x: snap(b.x), y: snap(b.y) };
  if (a.x === b.x && a.y === b.y) return d;
  let i, j;
  [d, i] = ensureNode(d, a); [d, j] = ensureNode(d, b);
  if (d.members.some(m => (m.i === i && m.j === j) || (m.i === j && m.j === i))) return d;
  return { ...d, members: [...d.members, { i, j, type, group: 'main', tags: ['deck'] }] };
}

// Removes a member, any joints left unconnected, and loads on it; re-indexes everything.
export function deleteMember(d, k) {
  const members = d.members.filter((_, x) => x !== k);
  const used = new Set(members.flatMap(m => [m.i, m.j]));
  const keep = d.nodes.map((_, x) => used.has(x));
  const map = []; let c = 0; keep.forEach((y, x) => { map[x] = y ? c++ : -1; });
  return {
    ...d,
    nodes: d.nodes.filter((_, x) => keep[x]),
    members: members.map(m => ({ ...m, i: map[m.i], j: map[m.j] })),
    supports: d.supports.filter(s => keep[s.node]).map(s => ({ ...s, node: map[s.node] })),
    loads: d.loads.filter(l => l.member !== k).map(l => ({ ...l, member: l.member > k ? l.member - 1 : l.member })),
  };
}

// Tapping a joint cycles its support: pin → roller → fixed → guide → none.
export function cycleSupport(d, node) {
  const cur = d.supports.find(s => s.node === node);
  const next = SUPPORT_CYCLE[(SUPPORT_CYCLE.indexOf(cur ? cur.type : null) + 1) % SUPPORT_CYCLE.length];
  const others = d.supports.filter(s => s.node !== node);
  return { ...d, supports: next ? [...others, { node, type: next }] : others };
}

export function setJointType(d, k, type) {
  return { ...d, members: d.members.map((m, x) => (x === k ? { ...m, type } : m)) };
}

// Moves a joint to a snapped position, unless that would collapse a member or land on another joint.
export function moveNode(d, k, p) {
  const q = { x: snap(p.x), y: snap(p.y) };
  if (d.nodes.some((n, x) => x !== k && n.x === q.x && n.y === q.y)) return d;
  return { ...d, nodes: d.nodes.map((n, x) => (x === k ? q : n)) };
}

// Weight of material used, kg — the "cost" of a design.
export function mass(d, resolve) {
  return d.members.reduce((sum, m) => {
    const a = d.nodes[m.i], b = d.nodes[m.j], { material, section } = resolve(m);
    return sum + material.density * 1e-9 * section.A * Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
}

// An editable copy of a preset that keeps every model input: members with their roles (deck, exposed, group),
// supports, member groups, deck width, side height, loads, material, section and scenario. Only the editing frame
// changes (name, view, drawing grid). The copy solves to the same result until the learner changes something.
export function editableCopy(src, state, base) {
  const xs = src.nodes.map(n => n.x), ys = src.nodes.map(n => n.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), pad = Math.max(w, h, 3000) * 0.12;
  const clone = o => JSON.parse(JSON.stringify(o));
  const { steps, ...model } = src;
  return { ...clone(base), ...clone(model), id: 'build', editable: true, name: `Your ${src.name.toLowerCase()}`, copiedFrom: src.id,
    question: 'Change anything: add, delete or move members, change supports. What makes it stronger, lighter, or collapse?',
    view: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad * 0.6, maxY: Math.max(...ys) + pad },
    gap: src.setting === 'river' ? [Math.min(...xs), Math.max(...xs)] : base.gap, setting: src.setting === 'river' ? 'gap' : 'site',
    steps: base.steps.slice(1), loads: clone(state.loads), material: state.material, section: state.section, scenario: state.scenario };
}

// The structure the solver sees: the design + the learner's material, section, loads and scenario.
export function buildStructure(p, s) {
  const sc = SCENARIOS[s.scenario];
  const members = p.members.map(m => {
    const g = m.group === 'main' ? null : p.groups?.[m.group];
    return { ...m, material: MATERIALS[g ? g.material : s.material], section: section(g ? g.section : p.sections[s.section]) };
  });
  const base = { nodes: p.nodes, members, supports: p.supports, deckWidth: p.deckWidth, sideHeight: p.sideHeight, selfWeight: true };
  const extra = applyScenario(base, sc);
  const memberLoads = s.loads.map(l => ({ member: l.member, at: l.at, px: 0, py: -LOAD_OBJECTS[l.obj].kg * 9.81 * sc.gravity }));
  return { ...base, memberLoads: [...memberLoads, ...extra.memberLoads], temperatureChange: extra.temperatureChange, gravity: extra.gravity, temperature: sc.temperature };
}
