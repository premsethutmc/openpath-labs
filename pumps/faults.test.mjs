import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONDITIONS, FAULTS, makeCase, repair, cleanExpected, loopState, casesForSeed } from './faults.mjs';
import { operate } from '../engines/hydraulics/hydraulics.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);
const classify = (c, m) => { const r = c.faulted.taps[m] / cleanExpected(c, m); return r > 1.5 ? 'higher' : r < 0.8 ? 'lower' : 'same'; };

test('Pump House itself is unchanged by the fault option', () => {
  assert.equal(operate().Q, 0.002427906716326719);
});

test('both faults give an identical dashboard in every case, outside cavitation', () => {
  for (const cond of CONDITIONS) {
    const [a, b] = FAULTS.map(fault => makeCase(cond, fault));
    for (const k of ['flow', 'head', 'power', 'eff']) near(a.faulted.dashboard[k], b.faulted.dashboard[k], 1e-12, `${cond.id} ${k}`);
    near(a.faulted.dashboard.flow, cond.flowLeft * a.healthy.dashboard.flow, 1e-6, `${cond.id}: flow cut as specified`);
    for (const c of [a, b]) assert.ok(c.faulted.npshMargin >= 2 && !c.faulted.cavitating, `${cond.id} ${c.fault}: NPSH margin ${c.faulted.npshMargin}`);
  }
});

test('local readings clearly separate the faults; clean sections read exactly the Q²-scaled healthy value', () => {
  for (const cond of CONDITIONS) for (const fault of FAULTS) {
    const c = makeCase(cond, fault), other = FAULTS.find(x => x !== fault);
    assert.equal(classify(c, fault), 'higher', `${cond.id}: faulted section reads high`);
    assert.equal(classify(c, other), 'same', `${cond.id}: clean section reads like a clean one`);
    assert.ok(c.faulted.taps[fault] > 5 * cleanExpected(c, fault), `${cond.id} ${fault}: margin`);
    near(c.faulted.taps[other], cleanExpected(c, other), 1e-9, `${cond.id}: ${other} = healthy × (Q/Q₀)²`);
  }
});

test('the right repair restores the healthy baseline; the wrong one (or a new pump) changes nothing', () => {
  for (const cond of CONDITIONS) for (const fault of FAULTS) {
    const c = makeCase(cond, fault);
    const right = repair(c, fault === 'strainer' ? 'clean-strainer' : 'clear-discharge');
    assert.ok(right.fixed); near(right.state.dashboard.flow, c.healthy.dashboard.flow, 1e-12, 'restored');
    for (const wrong of [fault === 'strainer' ? 'clear-discharge' : 'clean-strainer', 'replace-pump']) {
      const w = repair(c, wrong); assert.ok(!w.fixed); near(w.state.dashboard.flow, c.faulted.dashboard.flow, 1e-12, `${wrong} leaves flow unchanged`);
      near(w.state.taps[fault], c.faulted.taps[fault], 1e-12, `${wrong}: the faulted section still reads high`);
    }
  }
});

test('new cases change the operating point; a pressure number remembered from the guided case does not carry over', () => {
  const g = CONDITIONS[0];
  for (const cond of CONDITIONS.slice(1)) {
    assert.ok(cond.lift !== g.lift || cond.rpm !== g.rpm, 'different static lift or pump speed');
    for (const fault of FAULTS) {
      const G = makeCase(g, fault), N = makeCase(cond, fault);
      assert.ok(Math.abs(N.faulted.taps[fault] / G.faulted.taps[fault] - 1) > 0.15, `${cond.id}: fouled reading differs from the guided one`);
      assert.ok(Math.abs(N.healthy.taps[fault] / G.healthy.taps[fault] - 1) > 0.1 || Math.abs(N.faulted.dashboard.flow / G.faulted.dashboard.flow - 1) > 0.05, `${cond.id}: references differ`);
      assert.ok(Math.abs(N.faulted.dashboard.flow / G.faulted.dashboard.flow - 1) > 0.05, `${cond.id}: flow differs from the guided case`);
    }
  }
  // every seed yields a guided case at the guided condition and an unseen case elsewhere, and both faults occur
  const seen = new Set();
  for (let s = 0; s < 16; s++) { const k = casesForSeed(s); assert.equal(k.guided.cond.id, 'guided'); assert.notEqual(k.unseen.cond.id, 'guided'); seen.add(k.guided.fault + k.unseen.fault); }
  assert.equal(seen.size, 4, 'all fault combinations occur');
});
