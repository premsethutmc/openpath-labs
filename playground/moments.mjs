// Moment view: the moment of every force on a solved structure about a point the learner picks, with its line of action
// and perpendicular lever arm. A view on the Solids engine's own results (engines/solids/frame.mjs solve): the loads are
// read from the structure and from the solver's member loads (self-weight and scenario loads included), the reactions
// from res.reactions. No new physics. Units: mm, N, N·mm. Anticlockwise moments are positive (x right, y up).
//
// momentsAbout(structure, res, O, { labels }) → { O, rows: [{ id, label, kind, at, F, M, d, foot }], sum, sumLoads, scale }
//   kind: 'load' | 'reaction' | 'couple' | 'distributed'. A couple has no line of action (at, F, d, foot are null).
//   d = |M| / |F|, the perpendicular distance from O to the line of action; foot = the foot of that perpendicular.

const cross = (rx, ry, F) => rx * F.y - ry * F.x;

function row(id, label, kind, at, F, O) {
  const F2 = F.x * F.x + F.y * F.y, M = cross(at.x - O.x, at.y - O.y, F);
  // Foot of the perpendicular from O to the line through `at` along F: O + M·(Fy, −Fx)/|F|².
  return { id, label, kind, at, F, M, d: F2 > 0 ? Math.abs(M) / Math.sqrt(F2) : 0, foot: F2 > 0 ? { x: O.x + M * F.y / F2, y: O.y - M * F.x / F2 } : { ...at } };
}

// Combine several parallel or general forces into one resultant row placed on its own line of action.
function resultant(id, label, kind, parts, O) {
  const F = parts.reduce((s, p) => ({ x: s.x + p.F.x, y: s.y + p.F.y }), { x: 0, y: 0 }), M = parts.reduce((s, p) => s + cross(p.at.x - O.x, p.at.y - O.y, p.F), 0);
  const F2 = F.x * F.x + F.y * F.y;
  if (F2 < 1e-12) return { id, label, kind: 'couple', at: null, F: null, M, d: null, foot: null };
  const foot = { x: O.x + M * F.y / F2, y: O.y - M * F.x / F2 };
  return { id, label, kind, at: foot, F, M, d: Math.abs(M) / Math.sqrt(F2), foot };
}

export function momentsAbout(structure, res, O, { labels = [], includeReactions = true } = {}) {
  const s = structure, rows = [];
  const pointOn = (k, t) => { const m = s.members[k], a = s.nodes[m.i], b = s.nodes[m.j]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; };
  // Point loads on members, as given (global components). Their order is the order of state.loads in the playground.
  (s.memberLoads || []).forEach((l, k) => {
    if (l.at === undefined) return;
    rows.push(row(`load-${k}`, labels[k] || `Load ${k + 1}`, 'load', pointOn(l.member, l.at), { x: l.px || 0, y: l.py || 0 }, O));
  });
  // Distributed loads from the solver's own member loads (local w, wa per mm → global resultant at mid-member).
  const groups = { self: [], other: [] };
  res.members.forEach((mr, k) => mr.loads.uniform.forEach(u => {
    const L = mr.L, F = { x: (u.wa * mr.c - u.w * mr.s) * L, y: (u.wa * mr.s + u.w * mr.c) * L };
    (u.self ? groups.self : groups.other).push({ at: pointOn(k, 0.5), F });
  }));
  if (groups.self.length) rows.push(resultant('self', 'Own weight', 'distributed', groups.self, O));
  if (groups.other.length) rows.push(resultant('spread', 'Spread load', 'distributed', groups.other, O));
  // Nodal loads, if any (the playground uses member loads; other structures may not).
  (s.loads || []).forEach((l, k) => {
    const at = s.nodes[l.node];
    if (l.fx || l.fy) rows.push(row(`nodal-${k}`, `Joint load ${k + 1}`, 'load', at, { x: l.fx || 0, y: l.fy || 0 }, O));
    if (l.m) rows.push({ id: `nodal-m-${k}`, label: `Applied moment ${k + 1}`, kind: 'couple', at: null, F: null, M: l.m, d: null, foot: null });
  });
  const sumLoads = rows.reduce((a, r) => a + r.M, 0);
  if (includeReactions) res.reactions.forEach((r, k) => {
    const at = s.nodes[r.node], name = { fixed: 'Fixed support', pin: 'Pin', roller: 'Roller', guide: 'Wall guide' }[r.type] || 'Support';
    if (Math.abs(r.fx) > 1e-9 || Math.abs(r.fy) > 1e-9) rows.push(row(`reaction-${k}`, `${name} force`, 'reaction', { ...at }, { x: r.fx, y: r.fy }, O));
    if (Math.abs(r.m) > 1e-9) rows.push({ id: `reaction-m-${k}`, label: `${name} moment`, kind: 'couple', at: null, F: null, M: r.m, d: null, foot: null });
  });
  const sum = rows.reduce((a, r) => a + r.M, 0), scale = rows.reduce((a, r) => Math.max(a, Math.abs(r.M)), 0);
  return { O, rows, sum, sumLoads, scale };
}

// ΣM counts as zero when it is a tiny fraction of the largest single moment (round-off in the solver).
export const balanced = m => Math.abs(m.sum) <= Math.max(1e-6 * m.scale, 1e-6);

// The point a tap picks: a joint or support within `snapMm`, else the tapped point rounded to 10 mm.
export function pickPoint(structure, p, snapMm) {
  let best = null, bd = snapMm;
  structure.nodes.forEach((n, k) => { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d <= bd) { bd = d; best = k; } });
  return best !== null ? { x: structure.nodes[best].x, y: structure.nodes[best].y, node: best } : { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10, node: null };
}
