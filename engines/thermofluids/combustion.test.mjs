import assert from 'node:assert/strict';
import { test } from 'node:test';
import { turbo, sparkSweep, ecuTiming, emissionsTrend } from './combustion.mjs';
import { cycle, operatingPoint, ENGINE } from './engine.mjs';
import { OILS } from './oil.mjs';

const base = (o = {}) => ({ rpm: 2000, throttle: 1, oil: OILS['5W-30'], oilTemp: 95, ve: 0.9, octane: 91, T1: 320, ...o });

test('spark timing: torque peaks at MBT; the knock limit moves with octane, compression and heat', () => {
  const s = sparkSweep(base());
  assert.ok(s.mbt >= 18 && s.mbt <= 32, `MBT ${s.mbt}`);
  assert.ok(s.pts[0].torque < s.pts.find(p => p.adv === s.mbt).torque, 'too little advance wastes work');
  const k91 = s.knockLimit, k100 = sparkSweep(base({ octane: 100 })).knockLimit;
  assert.ok(k100 > k91, 'higher octane allows more advance');
  assert.ok(sparkSweep(base({ cr: 12.5 })).knockLimit < k91, 'higher compression knocks earlier');
  assert.ok(sparkSweep(base({ T1: 350 })).knockLimit < k91, 'hot intake air knocks earlier');
  const e = ecuTiming(base());
  assert.equal(e.timing, Math.min(e.mbt, e.knockLimit));
});

test('higher compression is more efficient (Otto) when knock is avoided', () => {
  const lo = operatingPoint(base({ cr: 9, octane: 100, ignition: -20 })), hi = operatingPoint(base({ cr: 12, octane: 100, ignition: -20 }));
  assert.ok(hi.efficiency > lo.efficiency);
});

test('mixture: best power slightly rich, best economy slightly lean, misfire when very lean', () => {
  const at = l => cycle({ rpm: 3000, ve: 0.9, lambda: l });
  const power = [0.8, 0.88, 1, 1.15].map(l => at(l).imep);
  assert.ok(power[1] > power[0] && power[1] > power[2] && power[2] > power[3]);
  assert.ok(at(1.15).etaIndicated > at(0.88).etaIndicated);
  assert.ok(at(1.55).etaIndicated < at(1.15).etaIndicated);
  assert.ok(emissionsTrend(0.85).co > emissionsTrend(1.1).co);
  assert.ok(emissionsTrend(1.08).nox > emissionsTrend(0.85).nox);
  assert.equal(emissionsTrend(1).cat, true);
});

test('turbo: compressor heats the air (isentropic), intercooler cools it, boost builds with speed', () => {
  const t = turbo({ target: 0.8, rpm: 5000, intercooler: 'none', ambientC: 30 });
  const T2 = 303.15 * (1 + (1.8 ** (0.4 / 1.4) - 1) / 0.72);
  assert.ok(Math.abs(t.Tcomp - T2) < 1e-9);
  assert.ok(turbo({ target: 0.8, rpm: 5000, intercooler: 'good' }).T1 < t.T1);
  assert.ok(turbo({ target: 0.8, rpm: 1600 }).boost < 0.05, 'turbo lag at low speed');
  const n = operatingPoint(base({ rpm: 5000, ve: 0.95, ignition: -20, octane: 100 }));
  const tb = turbo({ target: 0.6, rpm: 5000, intercooler: 'good' });
  const b = operatingPoint(base({ rpm: 5000, ve: 0.95, ignition: -20, octane: 100, boost: tb.boost, T1: tb.T1, pExhaust: tb.pExhaust }));
  assert.ok(b.power > 1.3 * n.power, `boosted ${b.power} vs ${n.power}`);
  assert.equal(ENGINE.cr, 10.5, 'reference engine unchanged by overrides');
});
