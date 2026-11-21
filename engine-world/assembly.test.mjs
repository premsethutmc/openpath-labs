import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PARTS, emptyBuild, fit, remove, isComplete, buildEffects, complete } from './assembly.mjs';
import { oilPressure, coolantFreezePoint, warmUpSeries } from '../engines/thermofluids/engine.mjs';
import { OILS } from '../engines/thermofluids/oil.mjs';

test('assembly order is enforced with a reason; a correct order completes the engine', () => {
  let b = emptyBuild();
  const r = fit(b, 'crank');
  assert.equal(r.ok, false); assert.match(r.message, /main bearing shells first/);
  assert.match(fit(b, 'oil').message, /Fit the sump first/);
  for (const id of ['mainShells', 'crank', 'rings', 'rodShells', 'pistons', 'pump', 'sump', 'head', 'oil']) {
    const step = fit(b, id); assert.ok(step.ok, `${id}: ${step.message}`); b = step.build;
  }
  assert.ok(isComplete(b));
  assert.equal(PARTS.length, 9);
});

test('removing a part removes what depends on it', () => {
  const b = remove(complete(), 'crank');
  assert.deepEqual(b.fitted.map(f => f.id).sort(), ['mainShells', 'rings']);
});

test('choices flow into the physics: worn shells drop oil pressure; tight ones warn; overfill adds drag', () => {
  let b = emptyBuild(); b = fit(b, 'mainShells', 'worn').build;
  const fx = buildEffects(b);
  assert.equal(fx.clearance, 60e-6); assert.equal(fx.warnings.length, 1);
  const hot = { oil: OILS['5W-30'], T: 100, rpm: 800 };
  const std = oilPressure({ ...hot, clearance: 25e-6 }), worn = oilPressure({ ...hot, clearance: 60e-6 });
  assert.ok(std.bar > 0.8 && std.bar < 2, `standard idle ${std.bar}`);
  assert.ok(worn.low, 'worn bearings: low oil pressure warning');
  assert.ok(oilPressure({ oil: OILS['5W-30'], T: -10, rpm: 2500 }).relief, 'cold thick oil hits the relief valve');
  let o = emptyBuild(); for (const id of ['mainShells', 'crank', 'rings', 'rodShells', 'pistons', 'pump', 'sump']) o = fit(o, id).build;
  assert.ok(buildEffects(fit(o, 'oil', 'over').build).frictionFactor > 1);
  assert.equal(buildEffects(fit(o, 'rings', 'large').build).compressionFactor, 1); // rings already fitted: unchanged
});

test('coolant freezing points follow the glycol table; warm-up series rises to 90 °C', () => {
  assert.equal(coolantFreezePoint(0), 0); assert.equal(coolantFreezePoint(50), -37); assert.equal(coolantFreezePoint(45), -31);
  const s = warmUpSeries(-35, -35, 40);
  assert.equal(s[0].T, -35); assert.equal(s.at(-1).T, 90);
  assert.ok(s.every((p, i) => i === 0 || p.T >= s[i - 1].T));
});
