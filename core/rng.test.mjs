import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from './rng.mjs';

test('rng: deterministic per seed, string seeds allowed, ranges honoured', () => {
  const seq = s => { const r = rng(s); return [r.next(), r.int(1, 6), r.pick(['a', 'b', 'c'])]; };
  assert.deepEqual(seq(42), seq(42));
  assert.deepEqual(seq('apply:1'), seq('apply:1'));
  assert.notDeepEqual(seq('apply:1'), seq('apply:2'));
  const r = rng(7), seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const x = r.next(); assert.ok(x >= 0 && x < 1);
    const n = r.int(-2, 3); assert.ok(Number.isInteger(n) && n >= -2 && n <= 3); seen.add(n);
  }
  assert.equal(seen.size, 6, 'both ends of int() are reachable');
  assert.equal(rng(1).int(5, 5), 5);
  assert.throws(() => rng(1).int(3, 2), RangeError);
  assert.throws(() => rng(1).pick([]), RangeError);
});
