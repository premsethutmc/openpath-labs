import assert from 'node:assert/strict';
import { test } from 'node:test';
import { momentsAbout, balanced, pickPoint } from './moments.mjs';
import { buildStructure } from './build.mjs';
import { PRESETS, LOAD_OBJECTS } from './presets.mjs';
import { solve } from '../engines/solids/frame.mjs';
import { SCENARIOS } from '../core/scenarios.mjs';
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';

const close = (a, b, tol = 1e-6 * Math.max(1, Math.abs(b))) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const bar = { material: MATERIALS.steel, section: section({ shape: 'rect', b: 50, h: 80 }), type: 'frame' };

test('shelf about the wall: load moment = −W·x, lever arm x, the wall supplies the rest; ΣM = 0', () => {
  const p = PRESETS.find(q => q.id === 'shelf'), st = buildStructure(p, { material: p.material, section: p.section, scenario: 'normal', loads: [{ obj: 'books', member: 0, at: 0.75 }] });
  const m = momentsAbout(st, solve(st), { x: 0, y: 0 }, { labels: ['Books'] }), W = LOAD_OBJECTS.books.kg * 9.81;
  const books = m.rows.find(r => r.label === 'Books'), self = m.rows.find(r => r.id === 'self'), wall = m.rows.find(r => r.id === 'reaction-m-0');
  close(books.M, -W * 600); close(books.d, 600); assert.deepEqual(books.foot, { x: 600, y: 0 });
  const w = MATERIALS[p.material].density * 1e-9 * section(p.sections[p.section]).A * 9.81 * 800;   // own weight, acting at 400 mm
  close(self.M, -w * 400); close(self.d, 400);
  close(wall.M, W * 600 + w * 400); assert.equal(wall.kind, 'couple'); assert.equal(wall.d, null);
  assert.ok(balanced(m)); close(m.sumLoads, -(W * 600 + w * 400));
});

test('slanted force: lever arm = r·sin θ, foot of the perpendicular on the line of action', () => {
  const r = 400, F = 1000, th = 30 * Math.PI / 180;
  const st = { nodes: [{ x: 0, y: 0 }, { x: r, y: 0 }], members: [{ i: 0, j: 1, ...bar }], supports: [{ node: 0, type: 'fixed' }], memberLoads: [{ member: 0, at: 1, px: F * Math.cos(th), py: -F * Math.sin(th) }] };
  const m = momentsAbout(st, solve(st), { x: 0, y: 0 }), load = m.rows[0];
  close(load.d, r * Math.sin(th)); close(load.M, -F * r * Math.sin(th));
  // the foot lies on the line of action and O→foot is perpendicular to the force
  const { foot, F: f } = load; close((foot.x - r) * f.y - foot.y * f.x, 0, 1e-6); close(foot.x * f.x + foot.y * f.y, 0, 1e-6);
  close(Math.hypot(foot.x, foot.y), r * Math.sin(th));
  assert.ok(balanced(m));
});

test('simply supported beam about A without reactions: the loads’ moment is what R_B·L must balance', () => {
  const L = 6000, a = 2000, P = 9000;
  const st = { nodes: [{ x: 0, y: 0 }, { x: L, y: 0 }], members: [{ i: 0, j: 1, ...bar }], supports: [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], memberLoads: [{ member: 0, at: a / L, px: 0, py: -P }] };
  const res = solve(st), m = momentsAbout(st, res, { x: 0, y: 0 }, { includeReactions: false });
  assert.ok(m.rows.every(r => r.kind !== 'reaction'));
  const loadsOnly = m.rows.filter(r => r.id !== 'self').reduce((s, r) => s + r.M, 0);
  close(loadsOnly, -P * a);
  close(res.reactions[1].fy * L, -m.sumLoads);   // R_B from ΣM_A = 0 (own weight included on both sides)
  const all = momentsAbout(st, res, { x: 0, y: 0 }), rb = all.rows.find(r => r.id === 'reaction-1');
  close(rb.d, L); assert.ok(balanced(all));
  close(all.rows.find(r => r.id === 'reaction-0').M, 0);   // the pin's own force has no moment about A
});

test('ΣM = 0 about any point for every preset and scenario (reactions included)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1234, y: -567 }, { x: -3000, y: 4500 }, { x: 9000, y: 2500 }];
  let n = 0;
  for (const p of PRESETS) for (const sc of Object.keys(SCENARIOS)) {
    const st = buildStructure(p, { material: p.material, section: p.section, scenario: sc, loads: p.loads }), res = solve(st);
    if (!res.ok) continue;
    for (const O of pts) { const m = momentsAbout(st, res, O); assert.ok(balanced(m), `${p.id} ${sc} (${O.x}, ${O.y}): ΣM ${m.sum} of ${m.scale}`); n++; }
  }
  assert.ok(n > 60);
});

test('a tap snaps to a joint nearby, else to a 10 mm grid', () => {
  const st = { nodes: [{ x: 0, y: 0 }, { x: 800, y: 0 }] };
  assert.deepEqual(pickPoint(st, { x: 790, y: 12 }, 40), { x: 800, y: 0, node: 1 });
  assert.deepEqual(pickPoint(st, { x: 403, y: -26 }, 40), { x: 400, y: -30, node: null });
});
