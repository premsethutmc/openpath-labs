// The open-loop learner's hand solver (tests/visible-helpers.mjs solveItem) against the item generators it may meet on
// the open solids benches, over many seeds and every aspect: its answers must be marked right by the ledger's own check.
// (The browser tests use only the solver and the visible text; this file is where the solver itself is checked.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATORS as GS } from '../content/items/statics.mjs';
import { GENERATORS as GSOL } from '../content/items/solids.mjs';
import { GENERATORS as GM } from '../content/items/school-math.mjs';
import { checkResponse } from '../core/ledger.mjs';
import { solveItem } from './visible-helpers.mjs';

const GEN = { ...GS, ...GSOL, ...GM };
// equilibrium in 2D and its prerequisites (the truss); factor of safety and its prerequisites (the beam)
const USED = ['statics.equilibrium', 'statics.fbd', 'statics.supports', 'statics.moment', 'math.linear', 'solids.fos', 'solids.yield', 'solids.normal-stress'];
for (const id of USED) test(`hand solver answers every ${id} item right (300 seeds × every aspect)`, () => {
  const g = GEN[id];
  assert.ok(g, id);
  for (const aspect of g.aspects) for (let seed = 1; seed <= 300; seed++) {
    const it = g.make(seed, aspect), s = solveItem(it.prompt, it.answer.kind === 'choice' ? it.answer.options : []);
    const r = checkResponse(it, 'option' in s ? s.option : s.text);
    assert.equal(r.result, 'correct', `${id} ${aspect} #${seed}: ${it.prompt} → ${JSON.stringify(s)}`);
  }
});
