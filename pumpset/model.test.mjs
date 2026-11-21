import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { operate, water, STOCK_SYSTEM, STOCK_PUMP, G } from '../engines/hydraulics/hydraulics.mjs';

test('acceptance: one pipework change flips the motor verdict while both variants meet the same flow target', () => {
  const proj = M.projectFromPreset('tank4');
  const a = M.saveRun(proj, '40 mm delivery');
  M.setPipe(proj, 'delivery', { D: 0.05 });
  const b = M.saveRun(proj, '50 mm delivery');
  assert.equal(a.result.flow.pass, true); assert.equal(b.result.flow.pass, true);
  assert.equal(a.result.drive.state, 'pass'); assert.equal(b.result.drive.state, 'fail');
  assert.ok(b.result.operating.flow > a.result.operating.flow && b.result.operating.shaftPower > a.result.operating.shaftPower, 'the freer pipe draws more flow and more power');
  assert.equal(a.result.design, true); assert.equal(b.result.design, false);
  assert.deepEqual(M.changedInputs(a, b), ['system.delivery.D']);
  // save, reopen, reproduce numbers and verdicts
  const reopened = M.deserialize(M.serialize(proj));
  assert.equal(reopened.runs.length, 2);
  for (const r of reopened.runs) { const rep = M.reproduce(r); assert.ok(rep.ok, `${r.name}: ${rep.diffs}`); }
  assert.deepEqual(M.evaluate(reopened), M.evaluate(proj), 'the reopened project evaluates identically');
  assert.equal(M.evaluate(reopened).drive.state, 'fail');
});

test('motor passes but flow fails: a passing drive does not make the design succeed', () => {
  const proj = M.projectFromPreset('tank4');
  M.setSystem(proj, { tankHeight: 24 });
  const r = M.evaluate(proj);
  assert.equal(r.drive.state, 'pass'); assert.equal(r.flow.pass, false); assert.equal(r.design, false);
  assert.match(r.flow.reason, /short of 2 L\/s/);
});

test('power-to-torque is checked independently', () => {
  assert.ok(Math.abs(M.torqueOf(1500, 2900) - 4.93935) < 1e-4);                 // 1500 / (2π·2900/60) by hand
  const proj = M.projectFromPreset('tank4'), r = M.evaluate(proj), w = water(proj.system.temp);
  const hydraulic = w.rho * G * (r.operating.flow / 1000) * r.operating.head;   // ρ g Q H
  const shaft = hydraulic / r.operating.efficiency;
  assert.ok(Math.abs(shaft - r.operating.shaftPower) / shaft < 1e-9, 'shaft power = ρgQH / η');
  assert.ok(Math.abs(r.operating.torque - shaft * 60 / (2 * Math.PI * proj.pump.rpm)) < 1e-9);
  assert.ok(Math.abs(r.drive.ratedTorqueAtSpeed - 1500 * 60 / (2 * Math.PI * 2900)) < 1e-9);
});

test('the pump side is Pump House’s solver, unchanged', () => {
  const r = M.evaluate(M.newProject()), o = operate(STOCK_SYSTEM, STOCK_PUMP);
  assert.equal(r.operating.flow, o.Q * 1000); assert.equal(r.operating.head, o.H); assert.equal(r.operating.shaftPower, o.power);
});

test('a preset and the same project configured by hand are identical', () => {
  for (const id of ['tank4', 'farm']) {
    const pre = M.projectFromPreset(id), own = M.newProject(pre.name);
    if (id === 'farm') { M.setSystem(own, { tankHeight: 6, sumpLevel: -4 }); M.setPipe(own, 'delivery', { D: 0.05, L: 60, material: 'pvc', elbows: 3 }); M.setTarget(own, 3); M.setMotor(own, '2p-2.2'); }
    else { M.setTarget(own, 2); M.setMotor(own, '2p-1.5'); }
    assert.deepEqual(own, pre); assert.deepEqual(M.evaluate(own), M.evaluate(pre));
  }
});

test('a motor rating is only used at speeds where it holds; refused inputs change nothing', () => {
  const proj = M.projectFromPreset('tank4');
  M.setMotor(proj, '4p-2.2');
  const r = M.evaluate(proj);
  assert.equal(r.drive.state, 'not-applicable'); assert.equal(r.drive.pass, null); assert.equal(r.design, false);
  const before = JSON.stringify(proj);
  assert.throws(() => M.setPipe(proj, 'delivery', { D: 0.05, L: -3 }), /length/);
  assert.throws(() => M.setSystem(proj, { tankHeight: 20, temp: 200 }), /temperature/);
  assert.throws(() => M.setPump(proj, { rpm: 5000 }), /speed/);
  assert.throws(() => M.setMotor(proj, 'x'), /motor/);
  assert.equal(JSON.stringify(proj), before);
  assert.throws(() => M.deserialize('{"version":2}'), /version 1/);
});

test('no flow and cavitation fail the flow verdict with a reason', () => {
  const p = M.projectFromPreset('tank4'); M.setSystem(p, { tankHeight: 40 });
  assert.match(M.evaluate(p).flow.reason, /no flow/);
  const c = M.projectFromPreset('tank4'); M.setSystem(c, { sumpLevel: -7, temp: 80 });
  const r = M.evaluate(c);
  assert.equal(r.operating.cavitating, true); assert.equal(r.flow.pass, false); assert.match(r.flow.reason, /cavitating/);
});
