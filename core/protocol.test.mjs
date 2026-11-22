import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Protocol, checkAnswers } from './protocol.mjs';

test('predictions: recorded, locked before the result, scored; cannot be changed after locking', () => {
  const p = new Protocol();
  assert.throws(() => p.score('x', 'Up'), /not locked/);
  p.predict('x', 'Down'); p.predict('x', 'Up'); p.lock('x');
  assert.equal(p.isLocked('x'), true);
  assert.throws(() => p.predict('x', 'Down'), /locked/);
  assert.deepEqual(p.score('x', 'Up'), { predicted: 'Up', actual: 'Up', correct: true });
  assert.throws(() => p.lock('nothing'), /No prediction/);
  p.retract('x'); assert.equal(p.hasPrediction('x'), false);
});

test('feedback gate and answer checking; the protocol keeps no runs', () => {
  const p = new Protocol();
  assert.equal(p.canAdvance('case-1'), false); p.giveFeedback('case-1'); assert.equal(p.canAdvance('case-1'), true);
  const r = checkAnswers({ q1: 'a' }, { q1: { expected: 'a', explain: '…' }, q2: { expected: 'b', explain: '…' } });
  assert.equal(r.complete, false); assert.equal(r.items[0].ok, true);
  assert.equal('saveRun' in p, false);
});
