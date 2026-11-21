import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve, internalAt, deflectionAt } from './frame.mjs';
import { analyze } from './analyze.mjs';
import { MATERIALS } from '../../core/materials.mjs';
import { section } from '../../core/sections.mjs';
import { applyScenario, SCENARIOS } from '../../core/scenarios.mjs';

const steel = MATERIALS.steel, sec = section({ shape: 'rect', b: 50, h: 100 });
const EI = steel.E * sec.I, EA = steel.E * sec.A;
const near = (a, b, tol = 1e-3, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12), `${msg} ${a} vs ${b}`);
const beam = (L, supports, extra = {}, parts = 1) => ({
  nodes: Array.from({ length: parts + 1 }, (_, k) => ({ x: L * k / parts, y: 0 })),
  members: Array.from({ length: parts }, (_, k) => ({ i: k, j: k + 1, material: steel, section: sec, type: 'frame' })),
  supports, ...extra,
});
const vAt = (res, node) => res.displacements[3 * node + 1];

test('cantilever, end load: tip deflection PL³/3EI, root moment PL', () => {
  const L = 2000, P = 10000;
  const r = solve(beam(L, [{ node: 0, type: 'fixed' }], { loads: [{ node: 1, fy: -P }] }));
  near(vAt(r, 1), -P * L ** 3 / (3 * EI));
  near(r.reactions[0].fy, P); near(r.reactions[0].m, P * L);
  near(internalAt(r, r.members[0], 0).M, -P * L, 1e-6, 'hogging at root');
});

test('simply supported, central point load on the member: PL³/48EI, PL/4, P/2', () => {
  const L = 4000, P = 20000;
  const r = solve(beam(L, [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], { memberLoads: [{ member: 0, at: 0.5, py: -P }] }));
  near(deflectionAt(r.members[0], 0.5).v, -P * L ** 3 / (48 * EI));
  near(internalAt(r, r.members[0], 0.5).M, P * L / 4);
  near(r.reactions[0].fy, P / 2); near(r.reactions[1].fy, P / 2);
  // off-centre load: M = P a b / L under the load
  const r2 = solve(beam(L, [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], { memberLoads: [{ member: 0, at: 0.25, py: -P }] }));
  near(internalAt(r2, r2.members[0], 0.25).M, P * 1000 * 3000 / L);
});

test('uniform load: 5wL⁴/384EI simply supported; same answer when split into elements', () => {
  const L = 6000, w = 5;
  const r = solve(beam(L, [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], { memberLoads: [{ member: 0, wy: -w }] }));
  near(deflectionAt(r.members[0], 0.5).v, -5 * w * L ** 4 / (384 * EI));
  near(internalAt(r, r.members[0], 0.5).M, w * L * L / 8);
  const r4 = solve(beam(L, [{ node: 0, type: 'pin' }, { node: 4, type: 'roller' }], { memberLoads: [0, 1, 2, 3].map(member => ({ member, wy: -w })) }, 4));
  near(vAt(r4, 2), -5 * w * L ** 4 / (384 * EI));
});

test('fixed-fixed, central load: PL³/192EI', () => {
  const L = 3000, P = 15000;
  const r = solve(beam(L, [{ node: 0, type: 'fixed' }, { node: 2, type: 'fixed' }], { loads: [{ node: 1, fy: -P }] }, 2));
  near(vAt(r, 1), -P * L ** 3 / (192 * EI));
});

test('axial bar δ = PL/AE; inclined member gives same result', () => {
  const L = 1500, P = 30000;
  const r = solve(beam(L, [{ node: 0, type: 'fixed' }], { loads: [{ node: 1, fx: P }] }));
  near(r.displacements[3], P * L / EA);
  const c = Math.cos(0.6), s = Math.sin(0.6);
  const inc = solve({ nodes: [{ x: 0, y: 0 }, { x: L * c, y: L * s }], members: [{ i: 0, j: 1, material: steel, section: sec, type: 'frame' }], supports: [{ node: 0, type: 'fixed' }], loads: [{ node: 1, fx: P * c, fy: P * s }] });
  near(Math.hypot(inc.displacements[3], inc.displacements[4]), P * L / EA);
});

test('pin-jointed truss matches method of joints', () => {
  // Triangle: base 4 m, apex at 2 m high, load 10 kN down at apex. Each rafter force = -P/(2 sinθ); tie = P/(2 tanθ).
  const P = 10000, tube = section({ shape: 'tube', d: 60, t: 4 });
  const t = { nodes: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 2000, y: 2000 }],
    members: [[0, 2], [1, 2], [0, 1]].map(([i, j]) => ({ i, j, material: steel, section: tube, type: 'truss' })),
    supports: [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], loads: [{ node: 2, fy: -P }] };
  const r = solve(t), th = Math.PI / 4;
  near(internalAt(r, r.members[0], 0.5).N, -P / (2 * Math.sin(th)));
  near(internalAt(r, r.members[2], 0.5).N, P / (2 * Math.tan(th)));
});

test('Euler buckling and analysis: safety factor and modes', () => {
  const L = 3000, rod = section({ shape: 'circle', d: 30 });
  const col = { nodes: [{ x: 0, y: 0 }, { x: 0, y: L }], members: [{ i: 0, j: 1, material: steel, section: rod, type: 'truss' }],
    supports: [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], loads: [{ node: 1, fy: -5000 }] };
  col.supports = [{ node: 0, type: 'pin' }, { node: 1, type: 'guide' }]; // top held sideways, free to move down
  const a = analyze(col);
  const Pcr = Math.PI ** 2 * steel.E * rod.I / L ** 2;
  near(a.members[0].Pcr, Pcr);
  near(a.members[0].sfBuckle, Pcr / 5000);
  assert.equal(a.governing.mode, 'buckling');
  const short = analyze({ ...col, nodes: [{ x: 0, y: 0 }, { x: 0, y: 300 }], loads: [{ node: 1, fy: -200000 }] });
  assert.equal(short.governing.mode, 'compression');
  near(short.sf, 250 / (200000 / rod.A));
});

test('global equilibrium holds for a loaded frame with self-weight, temperature and scenario loads', () => {
  const portal = {
    nodes: [{ x: 0, y: 0 }, { x: 0, y: 3000 }, { x: 5000, y: 3000 }, { x: 5000, y: 0 }],
    members: [[0, 1], [1, 2], [2, 3]].map(([i, j], k) => ({ i, j, material: steel, section: sec, type: 'frame', tags: k === 1 ? ['deck'] : ['exposed'] })),
    supports: [{ node: 0, type: 'fixed' }, { node: 3, type: 'fixed' }], deckWidth: 2000, sideHeight: 500,
    loads: [{ node: 1, fx: 4000 }], memberLoads: [{ member: 1, at: 0.3, py: -12000 }], selfWeight: true,
  };
  for (const sc of Object.values(SCENARIOS)) {
    const extra = applyScenario(portal, sc);
    const s = { ...portal, memberLoads: [...portal.memberLoads, ...extra.memberLoads], temperatureChange: extra.temperatureChange, gravity: extra.gravity };
    const r = solve(s);
    let fx = 4000, fy = -12000;
    for (const ld of extra.memberLoads) { const L = 5000, Lc = 3000; const len = ld.member === 1 ? L : Lc; fx += (ld.wx || 0) * len; fy += (ld.wy || 0) * len; }
    const weight = portal.members.reduce((sum, m, k) => sum + m.material.density * 1e-9 * m.section.A * 9.81 * sc.gravity * (k === 1 ? 5000 : 3000), 0);
    fy -= weight;
    const R = r.reactions.reduce((a, b) => ({ fx: a.fx + b.fx, fy: a.fy + b.fy }), { fx: 0, fy: 0 });
    near(R.fx, -fx, 1e-6, sc.id + ' ΣFx'); near(R.fy, -fy, 1e-6, sc.id + ' ΣFy');
  }
});

test('heating a beam between fixed walls causes compression EAαΔT; free beam has none', () => {
  const s = beam(5000, [{ node: 0, type: 'fixed' }, { node: 1, type: 'fixed' }], { temperatureChange: 30 });
  const r = solve(s);
  near(internalAt(r, r.members[0], 0.5).N, -EA * steel.alpha * 30);
  const free = solve(beam(5000, [{ node: 0, type: 'fixed' }], { temperatureChange: 30 }));
  near(internalAt(free, free.members[0], 0.5).N, 0, 1e-9);
  near(free.displacements[3], steel.alpha * 30 * 5000);
});

test('a structure that can move is reported, not solved', () => {
  const r = solve(beam(2000, [{ node: 0, type: 'roller' }], { loads: [{ node: 1, fy: -100 }] }));
  assert.equal(r.ok, false);
});

test('a pin-ended member loaded between its ends still bends like a simple beam (PL/4)', () => {
  const L = 4000, P = 8000, rod = section({ shape: 'tube', d: 60, t: 4 });
  const s = { nodes: [{ x: 0, y: 0 }, { x: L, y: 0 }], members: [{ i: 0, j: 1, material: steel, section: rod, type: 'truss' }],
    supports: [{ node: 0, type: 'pin' }, { node: 1, type: 'roller' }], memberLoads: [{ member: 0, at: 0.5, py: -P }] };
  const r = solve(s);
  near(internalAt(r, r.members[0], 0.5).M, P * L / 4);
});
