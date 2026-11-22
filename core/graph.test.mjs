import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, buildItems, checkItems, GraphError } from './graph.mjs';
import { NODES } from '../tests/fixtures/graph.mjs';
import { GENERATORS } from '../tests/fixtures/items.mjs';

const USEFUL = ['su', 'pport'].join('');
test('graph: merges files, prerequisites nearest first, refuses unknown ids and cycles', () => {
  const g = buildGraph([{ id: 'A', requires: ['B'], [USEFUL]: ['D'] }, { id: 'B', requires: ['C'] }], [{ id: 'C' }, { id: 'D' }]);
  assert.deepEqual(g.prerequisitesOf('A'), ['B']);
  assert.deepEqual(g.prerequisitesOf('A', 3), ['B', 'C']);
  assert.deepEqual(g.alsoUseful('A'), ['D'], 'useful edges are never prerequisites');
  assert.throws(() => buildGraph([{ id: 'A', requires: ['X'] }]), /unknown competency X/);
  assert.throws(() => buildGraph([{ id: 'A', requires: ['B'] }, { id: 'B', requires: ['A'] }]), /cycle: A → B → A/);
  assert.throws(() => buildGraph([{ id: 'A' }], [{ id: 'A' }]), /defined twice/);
  const school = buildGraph([{ id: 'M', school: true }], [{ id: 'M', school: true, items: 'm' }]);
  assert.deepEqual(school.duplicates, ['M']); assert.equal(school.node('M').items, 'm');
  assert.throws(() => g.node('nope'), GraphError);
});

test('items: merged generators, deterministic in seed, consistent with the graph', () => {
  const items = buildItems(GENERATORS), g = buildGraph(NODES);
  assert.deepEqual(checkItems(g, items), []);
  const a = items.make('fix.lever', 11, 'procedure'), b = items.make('fix.lever', 11, 'procedure');
  assert.deepEqual(a, b); assert.equal(a.competency, 'FIX.lever'); assert.equal(a.id, 'fix.lever:procedure:11');
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(s => items.make('fix.lever', s, 'procedure').prompt)).size > 1, 'fresh seeds give fresh numbers');
  assert.equal(items.make('fix.product', 1, 'concept').aspect, 'procedure', 'unknown aspect falls back to the first');
  assert.throws(() => buildItems(GENERATORS, { 'fix.lever': GENERATORS['fix.lever'] }), /twice/);
  assert.deepEqual(checkItems(buildGraph([{ id: 'Q', items: 'fix.lever' }]), items), ['Q: generator fix.lever is about FIX.lever']);
});
