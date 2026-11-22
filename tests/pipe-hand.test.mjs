// Every Journey 2 item can be answered from its visible text alone (prompt and option labels), by the hand methods
// the visible-controls e2e uses (tests/pipe-hand.mjs). A failure here means an item hides a given it needs.
// Also: no floating-point noise (0.0021000000000000003) in any prompt or worked-solution step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATORS } from '../content/items/fluids.mjs';
import { checkResponse } from '../core/ledger.mjs';
import { solveItem, typed } from './pipe-hand.mjs';

test('each item, every aspect, 200 seeds: the hand answer from the visible text is marked right', () => {
  for (const [gid, g] of Object.entries(GENERATORS)) for (const a of g.aspects) for (let s = 0; s < 200; s++) {
    const it = g.make(s, a), ans = solveItem(it.prompt, it.answer.options ?? []);
    const c = checkResponse(it, ans.choice !== undefined ? ans.choice : typed(ans));
    assert.equal(c.result, 'correct', `${it.id}: ${it.prompt} → ${JSON.stringify(ans)}`);
  }
});

test('no floating-point noise in prompts or worked solutions', () => {
  for (const [, g] of Object.entries(GENERATORS)) for (const a of g.aspects) for (let s = 0; s < 200; s++) {
    const it = g.make(s, a);
    for (const t of [it.prompt, ...it.solution]) assert.doesNotMatch(t, /\d\.\d*(0{6,}|9{6,})[1-9]/, `${it.id}: ${t}`);
  }
});
