import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Journal, compareRuns, changedInputs, checkAnswers } from './experiment.mjs';

test('predictions: recorded, locked before the result, scored; cannot be changed after locking', () => {
  const j = new Journal();
  assert.throws(() => j.score('x', 'Up'), /not locked/);
  j.predict('x', 'Down'); j.predict('x', 'Up'); j.lock('x');
  assert.throws(() => j.predict('x', 'Down'), /locked/);
  assert.deepEqual(j.score('x', 'Up'), { predicted: 'Up', actual: 'Up', correct: true });
  assert.throws(() => j.lock('nothing'), /No prediction/);
});

test('runs: saved with inputs and units, frozen, compared quantity by quantity', () => {
  const j = new Journal();
  const a = j.saveRun('healthy', { inputs: { lift: { value: 12, unit: 'm' } }, outputs: { flow: { value: 3.7, unit: 'L/s', label: 'Flow' } } });
  const b = j.saveRun('faulted', { inputs: { lift: { value: 12, unit: 'm' } }, outputs: { flow: { value: 2.7, unit: 'L/s', label: 'Flow' } } });
  assert.throws(() => { a.outputs.flow.value = 99; }, TypeError);
  assert.throws(() => j.saveRun('healthy', {}), /already exists/);
  const [row] = compareRuns(a, b);
  assert.equal(row.label, 'Flow'); assert.equal(row.unit, 'L/s'); assert.ok(Math.abs(row.rel + 0.27027) < 1e-4);
  assert.deepEqual(changedInputs(a, b), []);
  const c = j.saveRun('other', { inputs: { lift: { value: 6, unit: 'm' } }, outputs: { flow: { value: 2, unit: 'm³/s' } } });
  assert.deepEqual(changedInputs(a, c), ['lift']);
  assert.throws(() => compareRuns(a, c), /Units differ/);
});

test('feedback gate and answer checking', () => {
  const j = new Journal();
  assert.equal(j.canAdvance('case-1'), false); j.giveFeedback('case-1'); assert.equal(j.canAdvance('case-1'), true);
  const r = checkAnswers({ q1: 'a' }, { q1: { expected: 'a', explain: '…' }, q2: { expected: 'b', explain: '…' } });
  assert.equal(r.complete, false); assert.equal(r.items[0].ok, true);
});
