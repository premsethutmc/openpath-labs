// Solids engine v1: linear-elastic 2D frame/truss analysis (direct stiffness method).
// Units: mm, N, MPa. Global axes: x right, y up. Pure function, deterministic, no DOM.
//
// structure = {
//   nodes:   [{ x, y }],
//   members: [{ i, j, material, section, type: 'frame'|'truss', tags? }],   material/section are resolved objects
//   supports:[{ node, type: 'fixed'|'pin'|'roller'|'guide' }],               roller: vertical only; guide: sideways only
//   loads:   [{ node, fx, fy, m }],                                           nodal loads (global)
//   memberLoads: [{ member, at (0..1), px, py }  |  { member, wx, wy }],     point or uniform loads (global components)
//   selfWeight: true, gravity: 1, temperatureChange: 0 (°C, uniform)
// }

const G0 = 9.81;

function solveDense(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null; // mechanism / unstable
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (f) for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

function geometry(s, m) {
  const a = s.nodes[m.i], b = s.nodes[m.j];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return { L, c: dx / L, s: dy / L };
}

function localStiffness(m, L) {
  const { E } = m.material, { A, I } = m.section;
  const a = E * A / L;
  if (m.type === 'truss') return [[a, 0, 0, -a, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [-a, 0, 0, a, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
  const k1 = 12 * E * I / L ** 3, k2 = 6 * E * I / L ** 2, k3 = 4 * E * I / L, k4 = 2 * E * I / L;
  return [
    [a, 0, 0, -a, 0, 0], [0, k1, k2, 0, -k1, k2], [0, k2, k3, 0, -k2, k4],
    [-a, 0, 0, a, 0, 0], [0, -k1, -k2, 0, k1, -k2], [0, k2, k4, 0, -k2, k3],
  ];
}

const rot = (c, s) => [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]];
const mul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const tr = A => A[0].map((_, j) => A.map(r => r[j]));
const mv = (A, v) => A.map(r => r.reduce((s, x, k) => s + x * v[k], 0));

// Loads on a member, in local components: point loads {a, p (transverse), q (axial)} and uniform {w, wa}.
function localMemberLoads(s, index, g, gravity) {
  const m = s.members[index], point = [], uniform = [];
  const toLocal = (fx, fy) => ({ q: fx * g.c + fy * g.s, p: -fx * g.s + fy * g.c });
  for (const ld of s.memberLoads || []) {
    if (ld.member !== index) continue;
    if (ld.at !== undefined) { const { p, q } = toLocal(ld.px || 0, ld.py || 0); point.push({ a: ld.at * g.L, p, q }); }
    else { const { p, q } = toLocal(ld.wx || 0, ld.wy || 0); uniform.push({ w: p, wa: q }); }
  }
  if (s.selfWeight) {
    const wy = -m.material.density * 1e-9 * m.section.A * G0 * (gravity ?? 1);
    const { p, q } = toLocal(0, wy); uniform.push({ w: p, wa: q, self: true });
  }
  return { point, uniform };
}

// Fixed-end forces (forces exerted on the member ends when both ends are clamped), local.
function fixedEndForces(m, g, loads, dT) {
  const L = g.L, f = [0, 0, 0, 0, 0, 0], truss = m.type === 'truss';
  for (const { a, p, q } of loads.point) {
    const b = L - a;
    f[0] += -q * b / L; f[3] += -q * a / L;
    if (truss) { f[1] += -p * b / L; f[4] += -p * a / L; continue; }
    f[1] += -p * b * b * (3 * a + b) / L ** 3; f[4] += -p * a * a * (a + 3 * b) / L ** 3;
    f[2] += -p * a * b * b / L ** 2; f[5] += p * a * a * b / L ** 2;
  }
  for (const { w, wa } of loads.uniform) {
    f[0] += -wa * L / 2; f[3] += -wa * L / 2;
    f[1] += -w * L / 2; f[4] += -w * L / 2;
    if (!truss) { f[2] += -w * L * L / 12; f[5] += w * L * L / 12; }
  }
  if (dT) { const N = m.material.E * m.section.A * m.material.alpha * dT; f[0] += N; f[3] -= N; }
  return f;
}

export function solve(structure) {
  const s = structure, n = s.nodes.length, ndof = 3 * n;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const F = new Array(ndof).fill(0);
  const dT = s.temperatureChange || 0;
  const els = s.members.map((m, index) => {
    const g = geometry(s, m), T = rot(g.c, g.s), kl = localStiffness(m, g.L);
    const kg = mul(mul(tr(T), kl), T);
    const loads = localMemberLoads(s, index, g, s.gravity);
    const fef = fixedEndForces(m, g, loads, dT);
    const dofs = [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2];
    dofs.forEach((r, a) => dofs.forEach((c, b) => { K[r][c] += kg[a][b]; }));
    const eq = mv(tr(T), fef).map(v => -v);
    dofs.forEach((r, a) => { F[r] += eq[a]; });
    return { m, g, T, kl, fef, loads, dofs };
  });
  for (const l of s.loads || []) { F[3 * l.node] += l.fx || 0; F[3 * l.node + 1] += l.fy || 0; F[3 * l.node + 2] += l.m || 0; }

  const fixed = new Set();
  for (const sp of s.supports) {
    const b = 3 * sp.node;
    if (sp.type === 'fixed') { fixed.add(b); fixed.add(b + 1); fixed.add(b + 2); }
    else if (sp.type === 'pin') { fixed.add(b); fixed.add(b + 1); }
    else if (sp.type === 'roller') fixed.add(b + 1);
    else if (sp.type === 'guide') fixed.add(b); // wall guide: stops sideways movement only
  }
  // Nodes touched only by truss members have no rotational stiffness: hold their rotation.
  for (let i = 0; i < n; i++) if (!s.members.some(m => m.type !== 'truss' && (m.i === i || m.j === i))) fixed.add(3 * i + 2);

  const free = [...Array(ndof).keys()].filter(d => !fixed.has(d));
  const x = solveDense(free.map(r => free.map(c => K[r][c])), free.map(r => F[r]));
  if (!x) return { ok: false, reason: 'unstable', message: 'The structure can move freely — add a support or a member.' };
  const d = new Array(ndof).fill(0);
  free.forEach((dof, k) => { d[dof] = x[k]; });

  const Kd = mv(K, d);
  const reactions = s.supports.map(sp => {
    const b = 3 * sp.node;
    return { node: sp.node, type: sp.type, fx: Kd[b] - F[b], fy: Kd[b + 1] - F[b + 1], m: sp.type === 'fixed' ? Kd[b + 2] - F[b + 2] : 0 };
  });
  // Clean round-off on unrestrained reaction components
  for (const r of reactions) { if (r.type === 'roller') r.fx = 0; if (r.type === 'guide') r.fy = 0; if (r.type !== 'fixed') r.m = 0; }

  const members = els.map(({ m, g, T, kl, fef, loads, dofs }) => {
    const dl = mv(T, dofs.map(k => d[k]));
    const q = mv(kl, dl).map((v, k) => v + fef[k]);
    return { L: g.L, c: g.c, s: g.s, local: dl, end: q, loads, type: m.type, member: m };
  });
  return { ok: true, displacements: d, reactions, members };
}

// Internal forces and local deflection along a member at fraction t (0..1).
// N: tension positive. V: shear. M: sagging positive (bottom fibre in tension, local y up).
export function internalAt(res, mr, t) {
  const L = mr.L, x = t * L, [Xi, Yi, Mi] = mr.end;
  let N = -Xi, V = Yi, M = -Mi + Yi * x;
  for (const { a, p, q } of mr.loads.point) if (a < x) { N -= q; V += p; M += p * (x - a); }
  for (const { w, wa } of mr.loads.uniform) { N -= wa * x; V += w * x; M += w * x * x / 2; }
  // Pin-ended (truss) members still bend between their ends if loaded along their length: fef gives simple-beam reactions.
  return { N, V, M };
}

export function deflectionAt(mr, t) {
  const L = mr.L, x = t * L, [u1, v1, r1, u2, v2, r2] = mr.local;
  const u = u1 + (u2 - u1) * t;
  if (mr.type === 'truss') return { u, v: v1 + (v2 - v1) * t };
  const h1 = 1 - 3 * t * t + 2 * t ** 3, h2 = x * (1 - t) ** 2, h3 = 3 * t * t - 2 * t ** 3, h4 = x * (t * t - t);
  let v = h1 * v1 + h2 * r1 + h3 * v2 + h4 * r2;
  const EI = mr.member.material.E * mr.member.section.I;
  for (const { a, p } of mr.loads.point) {
    const b = L - a;
    v += x <= a
      ? p * b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * EI * L ** 3)
      : p * a * a * (L - x) ** 2 * (3 * b * L - (L - x) * (3 * b + a)) / (6 * EI * L ** 3);
  }
  for (const { w } of mr.loads.uniform) v += w * x * x * (L - x) ** 2 / (24 * EI);
  return { u, v };
}

// Global displaced position of a point at fraction t along member k, with exaggeration scale.
export function displacedPoint(structure, res, k, t, scale = 1) {
  const m = structure.members[k], a = structure.nodes[m.i], b = structure.nodes[m.j], mr = res.members[k];
  const { u, v } = deflectionAt(mr, t);
  return { x: a.x + (b.x - a.x) * t + scale * (u * mr.c - v * mr.s), y: a.y + (b.y - a.y) * t + scale * (u * mr.s + v * mr.c) };
}
