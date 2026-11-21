import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMS, timing, intakeLift, exhaustLift, machIndex, tunedRpm, floatRpm, valveClearance, volumetricEfficiency, idleQuality } from './breathing.mjs';
import { operatingPoint, cycle } from './engine.mjs';
import { OILS } from './oil.mjs';

const wot = (cam, rpm) => {
  const br = { cam, runner: 0.35 }, v = volumetricEfficiency(rpm, br);
  return operatingPoint({ rpm, throttle: 1, oil: OILS['5W-30'], oilTemp: 95, ve: v.ve, evo: timing(cam).evo });
};

test('cam timing events, lift profile and overlap', () => {
  const t = timing(CAMS.stock);
  assert.deepEqual([t.ivo, t.ivc, t.evo, t.evc, t.overlap], [345, 585, 135, 375, 30]);
  assert.equal(intakeLift(465, CAMS.stock), 8);          // full lift at the lobe centre
  assert.equal(intakeLift(200, CAMS.stock), 0);          // closed during expansion
  assert.ok(exhaustLift(255, CAMS.stock) > 7.5);
  assert.equal(idleQuality(CAMS.sport), 'rough (lots of overlap)');
});

test('the classic trade-off: mild cam wins low down, wild cam wins at the top', () => {
  assert.ok(wot(CAMS.economy, 1500).torque > wot(CAMS.sport, 1500).torque * 1.1);
  assert.ok(wot(CAMS.sport, 7000).power > wot(CAMS.economy, 7000).power * 1.3);
  assert.ok(machIndex(6000, CAMS.economy) > machIndex(6000, CAMS.sport), 'smaller lift chokes the flow');
  assert.ok(machIndex(6000, CAMS.stock) > machIndex(3000, CAMS.stock));
});

test('runner tuning, valve float and valve-to-piston contact', () => {
  assert.ok(tunedRpm(0.7) < tunedRpm(0.35), 'longer runners tune lower');
  assert.ok(floatRpm(CAMS.stock, 'soft') < floatRpm(CAMS.stock, 'stiff'));
  const fl = floatRpm(CAMS.stock, 'soft');
  assert.ok(volumetricEfficiency(fl + 800, { cam: CAMS.stock, runner: 0.35, spring: 'soft' }).floating);
  assert.equal(valveClearance(CAMS.stock).contact, false);
  assert.equal(valveClearance({ ...CAMS.sport, lift: 12.5, duration: 300 }).contact, true);
});

test('opening the exhaust early throws away expansion work', () => {
  assert.ok(cycle({ rpm: 2000, evo: 100 }).work < cycle({ rpm: 2000, evo: 150 }).work);
});
