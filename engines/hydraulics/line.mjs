// Series pipe line between two reservoirs: steady, incompressible, one-dimensional.
// Reuses Pump House's checked physics (hydraulics.mjs): water properties, Darcy–Weisbach with Colebrook/laminar
// friction, Crane fitting and gate-valve coefficients, the model centrifugal pump. Adds only: an arbitrary series
// order of parts, elevations along the line, sudden bore changes (Borda–Carnot), a sharp-edged orifice plate
// (ISO 5167-2 pressure-loss relation) and pressures at every junction.
//
// line = [source, ...parts, sink]
//   source { type:'source', surface, outlet, inlet:'square'|'footValve' }   (m, datum of the learner's choosing)
//   sink   { type:'sink', surface }
//   pipe   { type:'pipe', D, L, material, rise }   elbow { type:'elbow' }   valve { type:'valve', open }
//   checkValve { type:'checkValve' }   orifice { type:'orifice', beta }   pump { type:'pump', rpm, D2 }
// Fittings, valves, orifices and pumps take the bore of the nearest pipe before them (else after them).
import { water, atmPressure, G, pipeLoss, gateK, FITTINGS, pumpAt, STOCK_PUMP, MATERIALS } from './hydraulics.mjs';

export const ORIFICE_C = 0.61;                 // discharge coefficient of a sharp-edged orifice, typical (ISO 5167-2 range)
export const ENTRY_K = { square: 0.5, footValve: FITTINGS.footValve };
export const EXIT_K = FITTINGS.exit;

export class LineError extends Error { constructor(code, message, at = null) { super(message); this.code = code; this.at = at; } }

// Topology this solver supports. Anything else is refused with the reason — never solved approximately.
export function checkLine(line) {
  if (!line.length) throw new LineError('empty', 'Nothing to solve yet: start with a source reservoir, add parts, end with a receiving reservoir.');
  if (line[0].type !== 'source') throw new LineError('no-source', 'A line must start at a source reservoir (the water it draws from).', 0);
  if (line.at(-1).type !== 'sink' || line.length < 2) throw new LineError('no-sink', 'A line must end at a receiving reservoir (where the water goes).', line.length - 1);
  line.forEach((p, i) => {
    if (p.type === 'tee') throw new LineError('branch', 'A tee splits the flow into branches. This solver handles one series line only; branched networks need a network solver that is not built yet.', i);
    if ((p.type === 'source' && i !== 0) || (p.type === 'sink' && i !== line.length - 1)) throw new LineError('mid-reservoir', 'A reservoir in the middle of a line makes two separate lines. Keep one source at the start and one receiving reservoir at the end.', i);
  });
  const pumps = line.filter(p => p.type === 'pump');
  if (pumps.length > 1) throw new LineError('two-pumps', 'Two pumps in one line (series pumping) is not supported yet. Pump House compares two pumps in series or parallel.', line.indexOf(pumps[1]));
  if (!line.some(p => p.type === 'pipe')) throw new LineError('no-pipe', 'Add at least one pipe: fittings and pumps take their bore from the pipe they sit in.', null);
}

// bore at each part: a fitting takes the bore of the pipe before it; on the outlet side of a pump (before the next
// pipe) it takes the bore of the pipe after it. The pump casing itself makes the change from inlet to outlet bore.
function bores(line) {
  return line.map((p, i) => {
    if (p.type === 'pipe') return p.D;
    const prev = (() => { for (let j = i - 1; j >= 0; j--) { if (line[j].type === 'pipe') return line[j].D; if (line[j].type === 'pump') return null; } return null; })();
    if (prev !== null && p.type !== 'pump') return prev;
    if (p.type === 'pump') { for (let j = i - 1; j >= 0; j--) if (line[j].type === 'pipe') return line[j].D; }
    for (let j = i + 1; j < line.length; j++) if (line[j].type === 'pipe') return line[j].D;
    for (let j = i - 1; j >= 0; j--) if (line[j].type === 'pipe') return line[j].D;
    return null;
  });
}

const area = D => Math.PI * D * D / 4;
// head change across part i at flow Q (m; negative = loss), plus details
function partHead(line, i, Q, w, D) {
  const p = line[i], V = Q / area(D[i]), vh = V * V / (2 * G);
  switch (p.type) {
    case 'source': return { dH: -ENTRY_K[p.inlet] * vh, kind: 'entrance', K: ENTRY_K[p.inlet], V };
    case 'sink': return { dH: -EXIT_K * vh, kind: 'exit', K: EXIT_K, V };
    case 'pipe': { const r = pipeLoss(Q, { D: p.D, L: p.L, material: p.material, K: 0 }, w); return { dH: -r.hf, kind: 'friction', V, Re: r.Re, f: r.f, regime: r.regime }; }
    case 'elbow': return { dH: -FITTINGS.elbow * vh, kind: 'fitting', K: FITTINGS.elbow, V };
    case 'checkValve': return { dH: -FITTINGS.checkValve * vh, kind: 'fitting', K: FITTINGS.checkValve, V };
    case 'valve': { const K = gateK(p.open); return { dH: -K * vh, kind: 'fitting', K, V }; }
    case 'orifice': {
      const b = p.beta, C = ORIFICE_C, tap = (1 - b ** 4) / (C * C * b ** 4) * vh;                  // tap differential, m
      const s = Math.sqrt(1 - b ** 4 * (1 - C * C)), ratio = (s - C * b * b) / (s + C * b * b);  // ISO 5167-2 pressure loss / Δp
      return { dH: -ratio * tap, kind: 'orifice', tapHead: tap, lossRatio: ratio, V };
    }
    case 'pump': { const r = pumpAt(Q, { ...STOCK_PUMP, rpm: p.rpm, D2: p.D2 }, w); return { dH: r.H, kind: 'pump', V, pump: r }; }
    default: throw new LineError('unknown', `unknown part ${p.type}`, i);
  }
}
// sudden bore change between part i and i+1 (Borda–Carnot expansion; Crane contraction), on the smaller-bore velocity
function junctionHead(line, D, i, Q) {
  if (line[i].type === 'pump') return null;                 // the pump casing goes from inlet to outlet bore
  const a = D[i], b = D[i + 1];
  if (a === b || a === null || b === null) return null;
  if (b > a) { const V = Q / area(a); return { dH: -((1 - (a / b) ** 2) ** 2) * V * V / (2 * G), kind: 'expansion' }; }
  const V = Q / area(b); return { dH: -0.5 * (1 - (b / a) ** 2) * V * V / (2 * G), kind: 'contraction' };
}

function march(line, Q, w, D, src) {
  const steps = [];
  let H = src;
  line.forEach((p, i) => {
    const r = partHead(line, i, Q, w, D); H += r.dH; steps.push({ index: i, part: p.type, ...r, Hafter: H });
    if (i < line.length - 1) { const j = junctionHead(line, D, i, Q); if (j) { H += j.dH; steps.push({ index: i, part: 'junction', ...j, Hafter: H }); } }
  });
  return { H, steps };
}

export function solveLine(line, { temp = 20, altitude = 0 } = {}) {
  checkLine(line);
  const w = water(temp), patm = atmPressure(altitude), D = bores(line);
  const src = line[0].surface, sink = line.at(-1).surface;
  const residual = Q => march(line, Q, w, D, src).H - sink;
  const hasPump = line.some(p => p.type === 'pump');
  let Q = 0, noFlow = false;
  if (residual(1e-9) <= 0) {
    if (!hasPump && src < sink) throw new LineError('reverse', 'The receiving reservoir is higher than the source and there is no pump: water would flow backwards. Reverse flow is not modelled — raise the source, lower the receiver, or add a pump.');
    noFlow = true;
  } else {
    let lo = 1e-9, hi = 1e-4;
    while (residual(hi) > 0 && hi < 2) hi *= 2;
    if (residual(hi) > 0) throw new LineError('too-fast', 'The flow would exceed 2 m³/s: outside this model\'s range.');
    for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (residual(m) > 0) lo = m; else hi = m; }
    Q = (lo + hi) / 2;
  }
  const { steps } = march(line, Q, w, D, src);
  // junctions: junction j sits between part j and part j+1 (j = 0 … n−2)
  let z = line[0].outlet;
  const junctions = [];
  for (let j = 0; j < line.length - 1; j++) {
    if (line[j].type === 'pipe') z += line[j].rise;
    const H = [...steps].reverse().find(s => s.index <= j).Hafter;                // after part j and its junction change
    const Dj = D[j + 1] ?? D[j], V = Q / area(Dj), vh = V * V / (2 * G);
    const gauge = w.rho * G * (H - z - vh);
    junctions.push({ junction: j, between: [j, j + 1], z, H, V, D: Dj, gauge, abs: gauge + patm });
  }
  const pi = line.findIndex(p => p.type === 'pump');
  let pump = null;
  if (pi >= 0) {
    const r = steps.find(s => s.index === pi && s.part === 'pump').pump, inlet = junctions[pi - 1];
    const npsha = (inlet.abs - w.pv) / (w.rho * G) + inlet.V ** 2 / (2 * G);
    pump = { index: pi, head: r.H, shaftPower: Q > 0 ? r.Pshaft : pumpAt(0, { ...STOCK_PUMP, rpm: line[pi].rpm, D2: line[pi].D2 }, w).Pshaft,
      efficiency: Q > 0 ? w.rho * G * Q * r.H / r.Pshaft : 0, npsha, npshr: r.npshr, cavitating: Q > 0 && npsha < r.npshr, rpm: line[pi].rpm };
  }
  return { Q, noFlow, water: w, patm, bores: D, steps, junctions, pump, closure: noFlow ? 0 : residual(Q) };
}

// Pressure-change budget between two junctions (a < b): what each part contributed, in pascals.
// Δp_static = −ρg·Σ(head losses) + ρg·(pump head) − ρg·Δz − ρ·Δ(V²/2). The parts sum to the gauge difference.
export function budget(sol, a, b) {
  if (!(a < b)) throw new LineError('order', 'choose an upstream gauge and a downstream gauge');
  const ja = sol.junctions[a], jb = sol.junctions[b], rg = sol.water.rho * G;
  // a junction's reading already includes a bore change at that junction, so: every step after junction a up to and
  // including junction b
  const items = sol.steps.filter(s => s.index > a && s.index <= b).map(s => ({ index: s.index, part: s.part, kind: s.kind, pa: rg * s.dH }));
  const elevation = -rg * (jb.z - ja.z), velocity = -sol.water.rho * (jb.V ** 2 - ja.V ** 2) / 2;
  const total = jb.gauge - ja.gauge;
  return { items, elevation, velocity, total, check: items.reduce((s, x) => s + x.pa, 0) + elevation + velocity - total };
}
export const PIPE_MATERIALS = MATERIALS;
