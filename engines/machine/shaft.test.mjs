import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveShaft, ShaftError } from './shaft.mjs';
import { MATERIALS } from '../../core/materials.mjs';

const rel = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b}`);
const E = MATERIALS.steel.E;

test('simply supported, central load: reactions F/2, deflection FL³/48EI, stress 32M/πd³', () => {
  const F = 2000, L = 600, d = 30, I = Math.PI * d ** 4 / 64;
  const r = solveShaft({ material: 'steel', selfWeight: false, segments: [{ L, d }], bearings: [{ x: 0 }, { x: L }], loads: [{ kind: 'force', x: 300, F }] });
  rel(r.reactions[0].R, F / 2, 1e-9); rel(r.reactions[1].R, F / 2, 1e-9);
  rel(r.maxDefl.v, F * L ** 3 / (48 * E * I), 1e-6); rel(r.maxDefl.x, 300, 1e-9);
  rel(r.worst.eq, 32 * (F * L / 4) / (Math.PI * d ** 3), 1e-9);
  rel(Math.abs(r.reactions[0].slope), F * L * L / (16 * E * I), 1e-6);   // end slope FL²/16EI
});

test('overhung load: lever reactions and tip deflection F a² (L + a) / 3EI', () => {
  const F = 1000, L = 400, a = 100, d = 40, I = Math.PI * d ** 4 / 64;
  const r = solveShaft({ material: 'steel', selfWeight: false, segments: [{ L: L + a, d }], bearings: [{ x: 0 }, { x: L }], loads: [{ kind: 'force', x: L + a, F }] });
  rel(r.reactions[1].R, F * (L + a) / L, 1e-9); rel(r.reactions[0].R, -F * a / L, 1e-9);
  rel(r.maxDefl.v, F * a * a * (L + a) / (3 * E * I), 1e-6); rel(r.maxDefl.x, L + a, 1e-9);
});

test('torsion and combined stress: τ = 16T/πd³, von Mises √(σ² + 3τ²), brittle uses maximum principal stress', () => {
  const T = 200e3, d = 25;
  const pure = solveShaft({ material: 'steel', selfWeight: false, segments: [{ L: 300, d }], bearings: [{ x: 0 }, { x: 300 }], loads: [{ kind: 'torque', x: 50, T }, { kind: 'torque', x: 250, T: -T }] });
  rel(pure.worst.tau, 16 * T / (Math.PI * d ** 3), 1e-9); rel(pure.worst.eq, Math.sqrt(3) * 16 * T / (Math.PI * d ** 3), 1e-9);
  const both = { material: 'steel', selfWeight: false, segments: [{ L: 300, d }], bearings: [{ x: 0 }, { x: 300 }], loads: [{ kind: 'force', x: 150, F: 1000 }, { kind: 'torque', x: 0, T }, { kind: 'torque', x: 300, T: -T }] };
  const r = solveShaft(both), s = 32 * 75000 / (Math.PI * d ** 3), t = 16 * T / (Math.PI * d ** 3);
  rel(r.worst.eq, Math.sqrt(s * s + 3 * t * t), 1e-9);
  const ci = solveShaft({ ...both, material: 'castIron' });
  rel(ci.worst.eq, s / 2 + Math.sqrt(s * s / 4 + t * t), 1e-9); assert.equal(ci.criterion, 'maximum principal stress');
});

test('hollow and stepped shafts; three bearings (indeterminate) give the classic 5/8 F centre reaction', () => {
  const h = solveShaft({ material: 'steel', selfWeight: false, segments: [{ L: 600, d: 40, bore: 30 }], bearings: [{ x: 0 }, { x: 600 }], loads: [{ kind: 'force', x: 300, F: 1000 }] });
  rel(h.maxDefl.v, 1000 * 600 ** 3 / (48 * E * Math.PI * (40 ** 4 - 30 ** 4) / 64), 1e-6);
  // continuous beam, two equal spans, uniform load (self-weight only): centre reaction = 10/8 · w·l, ends 3/8 · w·l
  const w = solveShaft({ material: 'steel', selfWeight: true, segments: [{ L: 1000, d: 30 }], bearings: [{ x: 0 }, { x: 500 }, { x: 1000 }], loads: [] }, { resolution: 200 });
  const wl = 7850 * 9.81 * Math.PI / 4 * 30 * 30 * 1e-9 * 500;
  rel(w.reactions[1].R, 10 / 8 * wl, 1e-6); rel(w.reactions[0].R, 3 / 8 * wl, 1e-6);
});

test('impossible setups are refused with a specific reason', () => {
  const base = { material: 'steel', selfWeight: false, segments: [{ L: 300, d: 25 }], bearings: [{ x: 0 }, { x: 300 }], loads: [] };
  const code = s => { try { solveShaft(s); return 'ok'; } catch (e) { assert.ok(e instanceof ShaftError && e.message.length > 20); return e.code; } };
  assert.equal(code(base), 'ok');
  assert.equal(code({ ...base, bearings: [{ x: 0 }] }), 'bearings');
  assert.equal(code({ ...base, bearings: [{ x: 0 }, { x: 400 }] }), 'bearing-off');
  assert.equal(code({ ...base, bearings: [{ x: 100 }, { x: 100.5 }] }), 'bearing-same');
  assert.equal(code({ ...base, loads: [{ kind: 'torque', x: 10, T: 5000 }] }), 'torque');
  assert.equal(code({ ...base, loads: [{ kind: 'force', x: 500, F: 10 }] }), 'load-off');
  assert.equal(code({ ...base, segments: [{ L: 300, d: 25, bore: 25 }] }), 'segment');
});
