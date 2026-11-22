import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, POLICY, HYPOTHESES } from './diagnostic.mjs';

const T = 'T', cands = [{ competency: T, aspect: 'concept' }, { competency: T, aspect: 'procedure' }, { competency: T, aspect: 'transfer' }, { competency: 'A', aspect: 'procedure' }, { competency: 'B', aspect: 'procedure' }];
const play = respond => { const answers = []; let d; while ((d = diagnose({ target: T, candidates: cands, answers })).next) answers.push({ ...d.next, ...respond(d.next) }); return { d, answers }; };

test('diagnostic: stops on a confident hypothesis or after three questions', () => {
  const { d } = play(() => ({ result: 'correct' }));
  assert.equal(d.result, 'secure'); assert.ok(d.asked.length <= POLICY.maxQuestions);
  assert.ok(Math.abs(HYPOTHESES.reduce((s, h) => s + d.posterior[h], 0) - 1) < 1e-12);
  const wrong = play(() => ({ result: 'incorrect' }));
  assert.equal(wrong.d.asked.length, 3); assert.equal(wrong.d.next, null);
  assert.ok(['insufficient-evidence', ...HYPOTHESES].includes(wrong.d.result));
  assert.deepEqual(play(() => ({ result: 'incorrect' })).answers, wrong.answers, 'deterministic');
});

test('diagnostic: a wrong target answer is never evidence of a missing prerequisite', () => {
  let answers = [], before = POLICY.prior.prerequisite;
  for (const aspect of ['concept', 'procedure', 'transfer']) {
    answers = [...answers, { competency: T, aspect, result: 'incorrect' }];
    const d = diagnose({ target: T, candidates: cands, answers });
    assert.ok(Math.abs(d.posterior.prerequisite - before) < 1e-12, 'prerequisite share unchanged');
    assert.deepEqual(d.gaps, []);
  }
  const first = diagnose({ target: T, candidates: cands, answers: [] });
  assert.equal(first.next.competency, T, 'the target is asked before what it rests on');
  const okT = diagnose({ target: T, candidates: cands, answers: [{ competency: T, aspect: 'procedure', result: 'correct' }] });
  assert.equal(okT.next.competency, T, 'no prerequisite question while the target has not been missed');
  const pre = diagnose({ target: T, candidates: cands, answers: [{ competency: T, aspect: 'procedure', result: 'incorrect' }, { competency: 'A', aspect: 'procedure', result: 'incorrect' }] });
  assert.ok(pre.posterior.prerequisite > POLICY.prior.prerequisite, 'a wrong prerequisite answer raises it');
  assert.deepEqual(pre.gaps, ['A']);
  const preOk = diagnose({ target: T, candidates: cands, answers: [{ competency: T, aspect: 'procedure', result: 'incorrect' }, { competency: 'A', aspect: 'procedure', result: 'correct' }] });
  assert.ok(preOk.posterior.prerequisite < POLICY.prior.prerequisite, 'a right prerequisite answer lowers it');
});

test('diagnostic: misconceptions weigh in; unresolved, assisted and repeated answers do not count', () => {
  const two = [{ competency: T, aspect: 'procedure', result: 'incorrect', misconception: 'm1' }, { competency: T, aspect: 'transfer', result: 'incorrect', misconception: 'm2' }];
  const d = diagnose({ target: T, candidates: cands, answers: two });
  const plain = diagnose({ target: T, candidates: cands, answers: two.map(({ misconception, ...a }) => a) });
  assert.ok(d.posterior.misconception > plain.posterior.misconception);
  assert.deepEqual(d.misconceptions, ['m1', 'm2']);
  const noise = diagnose({ target: T, candidates: cands, answers: [{ competency: T, aspect: 'procedure', result: 'unresolved' }, { competency: T, aspect: 'procedure', result: 'correct', assisted: true }, { competency: T, aspect: 'concept', result: 'correct' }, { competency: T, aspect: 'concept', result: 'incorrect' }] });
  assert.equal(noise.asked.length, 1); assert.equal(noise.asked[0].right, true);
});
