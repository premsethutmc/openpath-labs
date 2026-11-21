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

// Regression: an editable copy used to reset the scenario and tag every member as deck, so a Truss bridge copy under
// "Festival crowd" carried crowd load on 13 members instead of the 4 deck members.
test('an editable copy keeps every model input and solves identically until the learner edits it', async () => {
  const { editableCopy, buildStructure, deleteMember } = await import('./build.mjs');
  const { PRESETS } = await import('./presets.mjs');
  const { analyze } = await import('../engines/solids/analyze.mjs');
  const truss = PRESETS.find(p => p.id === 'truss');
  const state = { material: truss.material, section: truss.section, scenario: 'crowd', loads: truss.loads.map(l => ({ ...l })) };
  const copy = editableCopy(truss, state, { gap: [0, 8000], steps: [{ text: 'a' }, { text: 'b' }] });
  assert.equal(copy.scenario, 'crowd');
  assert.deepEqual(copy.members, truss.members, 'member roles (tags, groups, names) are kept');
  const copyState = { material: copy.material, section: copy.section, scenario: copy.scenario, loads: copy.loads };
  const orig = buildStructure(truss, state), dup = buildStructure(copy, copyState);
  const crowd = s => s.memberLoads.filter(l => l.source === 'crowd').length;
  assert.equal(crowd(orig), 4); assert.equal(crowd(dup), 4);
  const a = analyze(orig), b = analyze(dup);
  assert.equal(b.sf, a.sf); assert.equal(b.maxDefl.d, a.maxDefl.d);
  // one intentional edit changes the result; the original preset is untouched
  const k = copy.members.findIndex(m => m.type === 'truss' && !m.tags?.includes('deck') && /diagonal/i.test(m.name || ''));
  assert.ok(k >= 0);
  const edited = { ...copy, ...deleteMember({ nodes: copy.nodes, members: copy.members, supports: copy.supports, loads: copy.loads }, k) };
  const c = analyze(buildStructure(edited, { ...copyState, loads: edited.loads }));
  assert.ok(!c.ok || c.sf !== a.sf, 'removing a diagonal changes the answer');
  assert.equal(PRESETS.find(p => p.id === 'truss').members.length, truss.members.length);
  assert.equal(analyze(buildStructure(truss, state)).sf, a.sf, 'the original still solves as before');
});
