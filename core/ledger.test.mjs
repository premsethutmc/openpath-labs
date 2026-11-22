import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkResponse, checkNumber, readNumber, convert, statusOf, describeStatus, openLedger, LedgerError } from './ledger.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const num = { id: 'i', answer: { kind: 'number', value: 1250, unit: 'N·m', tol: 0.01 }, misconceptions: [{ id: 'slant', value: 1500, label: 'slant' }] };

test('checkResponse: numbers with units, tolerance, conversions, misconceptions', () => {
  assert.equal(checkResponse(num, '1250 N·m').result, 'correct');
  assert.equal(checkResponse(num, '1250Nm').result, 'correct');
  assert.equal(checkResponse(num, '1.25 kN m').result, 'correct', 'a known unit converts');
  assert.equal(checkResponse(num, '1,250,000 N.mm').result, 'unresolved', 'commas are ambiguous');
  assert.equal(checkResponse(num, '1250000 N*mm').result, 'correct');
  assert.equal(checkResponse(num, '1260 N·m').result, 'correct', 'within 1 %');
  assert.equal(checkResponse(num, '1300 N·m').result, 'incorrect');
  assert.deepEqual(checkResponse(num, '1.5 kN·m'), { result: 'incorrect', value: 1500, unit: 'N·m', misconception: 'slant' });
  for (const bad of ['1250', '1250 N', '1250 kg', 'about 1250 N·m', '12 or 13 N·m', '', 'N·m 1250', '1250 furlongs'])
    assert.equal(checkResponse(num, bad).result, 'unresolved', `"${bad}" is unresolved`);
  assert.equal(checkResponse(num, { value: 1250, unit: 'N·m' }).result, 'correct');
  assert.equal(checkResponse(num, { dontKnow: true }).result, 'incorrect');
  const bare = { answer: { kind: 'number', value: 3, unit: '', tol: 0 }, misconceptions: [] };
  assert.equal(checkResponse(bare, '3').result, 'correct');
  assert.equal(checkResponse(bare, '3 m').result, 'unresolved', 'a unit where none belongs');
  assert.equal(checkNumber({ value: 2, unit: 'mm', tol: 0 }, '2', { requireUnit: false }).result, 'correct', 'predictions may omit the unit shown beside the box');
  assert.equal(checkNumber({ value: 0, unit: 'mm', tol: 0.01 }, '0.005 mm').result, 'correct', 'a zero key uses tol as absolute');
  assert.equal(convert(1, 'MPa', 'N/mm²'), 1); assert.equal(convert(60, 'L/min', 'L/s'), 1); assert.equal(convert(1, 'm', 'N'), null);
  assert.deepEqual(readNumber('-2.5e3 kN'), { value: -2500, unit: 'kN' });
});

test('checkResponse: choice items by index or text; anything else unresolved', () => {
  const ch = { answer: { kind: 'choice', options: ['a', 'b', 'c'], correct: 0 }, misconceptions: [{ id: 'm', option: 1, label: 'x' }] };
  assert.equal(checkResponse(ch, 0).result, 'correct');
  assert.equal(checkResponse(ch, 'a').result, 'correct');
  assert.deepEqual(checkResponse(ch, 1), { result: 'incorrect', value: 1, misconception: 'm' });
  assert.equal(checkResponse({ ...ch, answer: { ...ch.answer, correct: 'c' } }, 2).result, 'correct');
  for (const bad of [7, 'd', null, -1]) assert.equal(checkResponse(ch, bad).result, 'unresolved');
});

test('statusOf: not-seen, not-yet, helped, independent-after-help, independent; unresolved never counts', () => {
  const E = (kind, result, provenance = 'practice', c = 'C') => ({ competency: c, kind, result, provenance });
  assert.equal(statusOf([], 'C').status, 'not-seen');
  assert.equal(statusOf([E('evidence', 'unresolved')], 'C').status, 'not-seen');
  assert.equal(statusOf([E('evidence', 'incorrect', 'diagnostic')], 'C').status, 'not-yet');
  assert.equal(statusOf([E('evidence', 'correct', 'diagnostic')], 'C').status, 'independent');
  assert.equal(statusOf([E('evidence', 'correct', 'diagnostic'), E('evidence', 'incorrect', 'check')], 'C').status, 'not-yet', 'the latest answer alone decides');
  const helped = [E('evidence', 'incorrect', 'diagnostic'), E('hint'), E('assisted_response', 'correct')];
  assert.equal(statusOf(helped, 'C').status, 'helped');
  assert.equal(statusOf([...helped, E('evidence', 'unresolved', 'check')], 'C').status, 'helped');
  const after = [...helped, E('evidence', 'correct', 'check')];
  assert.equal(statusOf(after, 'C').status, 'independent-after-help');
  assert.equal(statusOf([...after, E('shown_solution')], 'C').status, 'helped', 'new help needs a new unaided answer');
  assert.equal(statusOf([...after, E('evidence', 'incorrect', 'check')], 'C').status, 'helped', 'a later miss alone takes it back');
  const s = statusOf([...after, E('evidence', 'correct', 'retention')], 'C');
  assert.equal(s.status, 'independent-after-help'); assert.equal(s.delayed, 'passed');
  assert.ok(!JSON.stringify(s).includes('master'));
  assert.equal(statusOf(after, 'other').status, 'not-seen');
});

test('statusOf: only a fresh unaided item (diagnostic, check, retention) on that exact competency shows what was done alone', () => {
  const E = (kind, result, provenance = 'practice', c = 'C') => ({ competency: c, kind, result, provenance });
  // teach practice is help: right answers with a hint or a shown solution never read "on your own"
  const taught = [E('evidence', 'incorrect', 'diagnostic'), E('shown_solution'), E('assisted_response', 'correct'), E('assisted_response', 'correct')];
  let s = statusOf(taught, 'C');
  assert.deepEqual([s.status, s.basis, s.assisted, s.help], ['helped', null, { right: 2, total: 2 }, 3]);
  assert.equal(describeStatus(s), 'Practised with help; no unaided question since');
  // an unaided answer in practice (apply) is counted apart and never decides the status
  s = statusOf([...taught, E('evidence', 'correct', 'practice')], 'C');
  assert.equal(s.status, 'helped'); assert.deepEqual(s.practice, { right: 1, total: 1 }); assert.deepEqual(s.unaided, { right: 0, total: 1 });
  assert.equal(statusOf([E('evidence', 'correct', 'practice')], 'C').status, 'not-yet', 'practice alone is not a fresh unaided item');
  // the fresh check after help decides, and says so
  s = statusOf([...taught, E('evidence', 'correct', 'practice'), E('evidence', 'correct', 'check')], 'C');
  assert.deepEqual([s.status, s.basis], ['independent-after-help', { provenance: 'check', result: 'correct' }]);
  assert.equal(describeStatus(s), 'Solved on your own after help');
  s = statusOf([...taught, E('evidence', 'incorrect', 'check')], 'C');
  assert.equal(describeStatus(s), 'Practised with help; not yet right on your own in the check');
  // help or a check on another competency (the journey's target) never changes a prerequisite, and the reverse
  const pre = [E('evidence', 'correct', 'diagnostic', 'PRE'), E('hint', undefined, 'practice', 'T'), E('assisted_response', 'correct', 'practice', 'T'), E('evidence', 'correct', 'check', 'T')];
  const sp = statusOf(pre, 'PRE'), st = statusOf(pre, 'T');
  assert.deepEqual([sp.status, sp.basis, sp.help], ['independent', { provenance: 'diagnostic', result: 'correct' }, 0]);
  assert.equal(describeStatus(sp), 'Answered right in the diagnostic (unaided)', 'a diagnostic answer never reads like the check');
  assert.deepEqual([st.status, st.basis.provenance], ['independent-after-help', 'check']);
  assert.equal(describeStatus(statusOf([E('evidence', 'correct', 'check')], 'C')), 'Solved on your own in the check');
  assert.equal(describeStatus(statusOf([E('evidence', 'incorrect', 'diagnostic')], 'C')), 'Not right in the diagnostic (unaided)');
  assert.equal(describeStatus(statusOf([], 'C')), 'Not seen yet');
  for (const k of ['independent', 'independent-after-help', 'helped', 'not-yet', 'not-seen']) assert.ok(!/master/i.test(describeStatus({ status: k })));
});

test('ledger: pseudonymous learner, validated events, export → import gives the same ledger', () => {
  const st = memory(), L = openLedger(st, { now: () => '2026-11-22T00:00:00.000Z' });
  assert.match(L.learner, /^L-[0-9a-f]{12}$/);
  L.record({ journey: 'j', competency: 'C', item: 'i1', aspect: 'procedure', kind: 'evidence', provenance: 'diagnostic', result: 'incorrect', misconception: 'm' });
  L.record({ journey: 'j', competency: 'C', item: 'i2', aspect: 'procedure', kind: 'hint', provenance: 'practice' });
  assert.throws(() => L.record({ journey: 'j', competency: 'C', item: 'i', kind: 'hint', provenance: 'practice', result: 'correct' }), LedgerError);
  assert.throws(() => L.record({ journey: 'j', competency: 'C', item: 'i', kind: 'guess', provenance: 'practice', result: 'correct' }), LedgerError);
  assert.equal(openLedger(st).learner, L.learner, 'the learner id persists');
  const text = L.exportJSON(), other = openLedger(memory());
  assert.notEqual(other.learner, L.learner);
  assert.equal(other.importJSON(text), 2);
  assert.equal(other.exportJSON(), text);
  assert.deepEqual(other.events()[0], { t: '2026-11-22T00:00:00.000Z', learner: L.learner, journey: 'j', competency: 'C', item: 'i1', aspect: 'procedure', kind: 'evidence', provenance: 'diagnostic', result: 'incorrect', misconception: 'm' });
  assert.throws(() => other.importJSON('{"format":"x"}'), /not an OpenPath ledger/);
});
