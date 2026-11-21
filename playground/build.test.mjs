import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDesign, addMember, deleteMember, cycleSupport, moveNode, findNode, mass } from './build.mjs';
import { analyze } from '../engines/solids/analyze.mjs';
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';

const resolve = () => ({ material: MATERIALS.steel, section: section({ shape: 'tube', d: 114, t: 5 }) });
const toStructure = d => ({ ...d, members: d.members.map(m => ({ ...m, ...resolve(m) })), memberLoads: d.loads.map(l => ({ member: l.member, at: l.at, py: -11772 })), selfWeight: true });

test('drawing snaps to the grid, joins at shared joints, ignores duplicates and zero-length', () => {
  let d = addMember(emptyDesign(), { x: 30, y: -40 }, { x: 3980, y: 10 });
  assert.deepEqual(d.nodes, [{ x: 0, y: 0 }, { x: 4000, y: 0 }]);
  d = addMember(d, { x: 4000, y: 0 }, { x: 8000, y: 0 });
  assert.equal(d.nodes.length, 3);
  assert.equal(addMember(d, { x: 8000, y: 0 }, { x: 4000, y: 0 }), d);
  assert.equal(addMember(d, { x: 100, y: 0 }, { x: -100, y: 0 }), d);
  assert.equal(findNode(d, { x: 4100, y: 120 }), 1);
});

test('deleting re-indexes joints, supports and loads', () => {
  let d = emptyDesign();
  d = addMember(d, { x: 0, y: 0 }, { x: 4000, y: 0 });
  d = addMember(d, { x: 4000, y: 0 }, { x: 8000, y: 0 });
  d = cycleSupport(cycleSupport(d, 2), 2); // pin → roller
  d = { ...d, loads: [{ obj: 'car', member: 1, at: 0.5 }, { obj: 'x', member: 0, at: 0.2 }] };
  const e = deleteMember(d, 0);
  assert.deepEqual(e.nodes, [{ x: 4000, y: 0 }, { x: 8000, y: 0 }]);
  assert.deepEqual(e.members, [{ i: 0, j: 1, type: 'frame', group: 'main', tags: ['deck'] }]);
  assert.deepEqual(e.supports, [{ node: 1, type: 'roller' }]);
  assert.deepEqual(e.loads, [{ obj: 'car', member: 0, at: 0.5 }]);
  let s = d; const seen = [];
  for (let i = 0; i < 5; i++) { s = cycleSupport(s, 0); seen.push(s.supports.find(x => x.node === 0)?.type ?? null); }
  assert.deepEqual(seen, ['pin', 'roller', 'fixed', 'guide', null]);
  assert.equal(moveNode(d, 0, { x: 4100, y: 0 }), d, 'cannot drop a joint on another joint');
  assert.deepEqual(moveNode(d, 0, { x: -480, y: 520 }).nodes[0], { x: -500, y: 500 });
});

test('a learner-built king-post truss is far stronger than a plain plank of the same tube', () => {
  let plank = addMember(emptyDesign(), { x: 0, y: 0 }, { x: 8000, y: 0 });
  plank = { ...cycleSupport(plank, 0), loads: [{ member: 0, at: 0.5 }] };
  plank = cycleSupport(cycleSupport(plank, 1), 1);
  let truss = emptyDesign();
  truss = addMember(truss, { x: 0, y: 0 }, { x: 4000, y: 0 });
  truss = addMember(truss, { x: 4000, y: 0 }, { x: 8000, y: 0 });
  for (const [a, b] of [[[0, 0], [4000, 2000]], [[4000, 2000], [8000, 0]], [[4000, 2000], [4000, 0]]])
    truss = addMember(truss, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, 'truss');
  truss = cycleSupport(truss, 0); truss = cycleSupport(cycleSupport(truss, 2), 2);
  truss = { ...truss, loads: [{ member: 0, at: 1 }] };
  const a = analyze(toStructure(plank)), b = analyze(toStructure(truss));
  assert.ok(a.sf < 1, 'plank fails under a car');
  assert.ok(b.ok && b.sf > 4 * a.sf, `truss ${b.sf} vs plank ${a.sf}`);
  assert.ok(mass(truss, resolve) > mass(plank, resolve));
});
