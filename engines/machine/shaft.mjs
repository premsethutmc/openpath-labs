// Shaft on bearings: reactions, bending, torsion, combined stress, deflection and bearing slope.
// Bending and deflection come from the existing solids engine (engines/solids/frame.mjs, direct stiffness, Euler–
// Bernoulli beams): the shaft is a row of beam elements, bearings are simple supports (they carry force, not moment).
// Torsion: the torque carried between applied torques (they must balance). Combined stress: von Mises for ductile
// materials, maximum principal stress for brittle ones. Static check only. Units: mm, N, N·mm, MPa.
//
// shaft = { material, selfWeight, segments: [{ L, d, bore }], bearings: [{ x }], loads: [{ kind: 'force', x, F } | { kind: 'torque', x, T }] }
//   F positive downward (N); T in N·mm, sign gives direction; positions from the left end (mm).
import { solve } from '../solids/frame.mjs';
import { MATERIALS, limits } from '../../core/materials.mjs';
import { section } from '../../core/sections.mjs';

export class ShaftError extends Error { constructor(code, message, at = null) { super(message); this.code = code; this.at = at; } }
const near = (a, b) => Math.abs(a - b) < 1e-6;

export function geometry(shaft) {
  let x = 0; return shaft.segments.map((s, i) => { const g = { i, x0: x, x1: x + s.L, d: s.d, bore: s.bore || 0 }; x += s.L; return g; });
}
export const lengthOf = shaft => shaft.segments.reduce((a, s) => a + s.L, 0);
const segAt = (geo, x) => geo.find(g => x >= g.x0 - 1e-9 && x <= g.x1 + 1e-9);
export const sectionOf = g => (g.bore > 0 ? section({ shape: 'tube', d: g.d, t: (g.d - g.bore) / 2 }) : section({ shape: 'circle', d: g.d }));
export const polarJ = g => Math.PI * (g.d ** 4 - g.bore ** 4) / 32;

export function checkShaft(shaft) {
  if (!MATERIALS[shaft.material]) throw new ShaftError('material', 'Choose a material.');
  if (!shaft.segments.length) throw new ShaftError('no-shaft', 'Add at least one shaft segment.');
  shaft.segments.forEach((s, i) => { if (!(s.L > 0 && s.d > 0 && (s.bore || 0) >= 0 && (s.bore || 0) < s.d - 0.5)) throw new ShaftError('segment', `Segment ${i + 1}: length and diameter must be positive and the bore smaller than the diameter.`, i); });
  const L = lengthOf(shaft);
  if (shaft.bearings.length < 2) throw new ShaftError('bearings', 'A shaft needs at least two bearings here. One bearing alone cannot hold it (a single bearing would need to resist moment, which these simple bearings do not).');
  shaft.bearings.forEach((b, i) => { if (b.x < -1e-9 || b.x > L + 1e-9) throw new ShaftError('bearing-off', `Bearing ${i + 1} at ${b.x} mm is off the shaft (0–${L} mm).`, i); });
  const xs = shaft.bearings.map(b => b.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 1) throw new ShaftError('bearing-same', 'Two bearings are at the same place: move one of them.');
  shaft.loads.forEach((l, i) => { if (l.x < -1e-9 || l.x > L + 1e-9) throw new ShaftError('load-off', `Load ${i + 1} at ${l.x} mm is off the shaft (0–${L} mm).`, i); });
  const torque = shaft.loads.filter(l => l.kind === 'torque').reduce((a, l) => a + l.T, 0);
  if (Math.abs(torque) > 1e-6) throw new ShaftError('torque', `Torques do not balance (net ${(torque / 1000).toFixed(2)} N·m). Power goes in at one place and out at another: add the matching torque where it leaves.`);
}

export function solveShaft(shaft, { resolution = 80 } = {}) {
  checkShaft(shaft);
  const mat = MATERIALS[shaft.material], geo = geometry(shaft), L = lengthOf(shaft);
  const stations = [0, L, ...geo.map(g => g.x1), ...shaft.bearings.map(b => b.x), ...shaft.loads.map(l => l.x), ...Array.from({ length: resolution + 1 }, (_, i) => L * i / resolution)];
  const xs = [...new Set(stations.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
  const nodes = xs.map(x => ({ x, y: 0 }));
  const members = xs.slice(1).map((x, k) => { const g = segAt(geo, (xs[k] + x) / 2); return { i: k, j: k + 1, type: 'frame', material: mat, section: sectionOf(g), seg: g.i }; });
  const order = shaft.bearings.map((b, i) => ({ i, x: b.x })).sort((a, b) => a.x - b.x);
  const node = x => xs.findIndex(v => near(v, x));
  const supports = order.map((b, k) => ({ node: node(b.x), type: k === 0 ? 'pin' : 'roller', bearing: b.i }));
  const loads = shaft.loads.filter(l => l.kind === 'force').map(l => ({ node: node(l.x), fx: 0, fy: -l.F, m: 0 }));
  const r = solve({ nodes, members, supports, loads, selfWeight: !!shaft.selfWeight, gravity: 1 });
  if (!r.ok) throw new ShaftError('unstable', 'The shaft can move freely: check the bearings.');

  // torque carried by each element = sum of applied torques to its left
  const torques = shaft.loads.filter(l => l.kind === 'torque');
  const elemT = members.map((m, k) => torques.filter(t => t.x <= xs[k] + 1e-9).reduce((a, t) => a + t.T, 0));
  const lim = limits(mat), ductile = !!mat.ductile;
  const points = [];
  members.forEach((m, k) => {
    const g = geo[m.seg], sec = m.section, J = polarJ(g), T = elemT[k];
    for (const [end, x, M] of [[0, xs[k], -r.members[k].end[2]], [1, xs[k + 1], r.members[k].end[5]]]) {
      const sigma = M * sec.c / sec.I, tau = T * (g.d / 2) / J;
      const eq = ductile ? Math.sqrt(sigma ** 2 + 3 * tau ** 2) : Math.abs(sigma) / 2 + Math.sqrt(sigma ** 2 / 4 + tau ** 2);
      points.push({ x, element: k, end, seg: g.i, d: g.d, M, T, sigma, tau, eq });
    }
  });
  const allow = ductile ? lim.tension : lim.tension;    // yield for ductile; tensile strength for brittle
  const worst = points.reduce((a, p) => (p.eq > a.eq ? p : a));
  const defl = xs.map((x, i) => ({ x, v: -r.displacements[3 * i + 1], slope: r.displacements[3 * i + 2] }));
  const maxDefl = defl.reduce((a, p) => (Math.abs(p.v) > Math.abs(a.v) ? p : a));
  const reactions = shaft.bearings.map((b, i) => { const s = supports.find(q => q.bearing === i), rr = r.reactions.find(q => q.node === s.node); return { bearing: i, x: b.x, R: rr.fy, slope: r.displacements[3 * s.node + 2] }; });
  const massKg = geo.reduce((a, g) => a + mat.density * Math.PI / 4 * (g.d ** 2 - g.bore ** 2) * (g.x1 - g.x0) * 1e-9, 0);
  return { length: L, material: mat, ductile, criterion: ductile ? 'von Mises' : 'maximum principal stress', allow,
    reactions, points, worst, sf: allow / worst.eq, defl, maxDefl, maxSlope: reactions.reduce((a, b) => (Math.abs(b.slope) > Math.abs(a.slope) ? b : a)), mass: massKg,
    maxTorque: Math.max(0, ...elemT.map(Math.abs)) };
}
