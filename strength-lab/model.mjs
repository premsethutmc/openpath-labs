// Strength of Materials workshop model. Units: mm, N, MPa (N/mm²), degrees for twist.
// Teaching model: textbook formulas with approximate stress-concentration factors.
// Not a design tool.

export const BAR = { length: 120, diameter: 20 }; // gauge length between grips

export const MATERIALS = {
  steel: { name: 'Mild steel', E: 200000, G: 80000, Sy: 250, Su: 410, elongation: 0.25, ductile: true },
  aluminium: { name: 'Aluminium', E: 69000, G: 26000, Sy: 270, Su: 310, elongation: 0.12, ductile: true },
  castIron: { name: 'Cast iron', E: 100000, G: 40000, Sy: null, Su: 200, elongation: 0.006, ductile: false },
};

export const newPart = () => ({ ops: [], fillet: 0.5 });
const turns = part => part.ops.filter(o => o.type === 'turn');
const grooves = part => part.ops.filter(o => o.type === 'groove');

const round = (n, step) => Math.round(n / step) * step;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// A turned section reduces the diameter between `from` and `to` (mm from the left grip).
export function addTurn(part, { from, to, diameter }) {
  [from, to] = [Math.min(from, to), Math.max(from, to)].map(v => clamp(round(v, 1), 0, BAR.length));
  diameter = clamp(round(diameter, 0.5), 8, BAR.diameter);
  if (to - from < 5 || diameter >= BAR.diameter) return part;
  return { ...part, ops: [...part.ops, { type: 'turn', from, to, diameter }] };
}

// A groove is a round-bottomed notch cut with a form tool of tip radius r.
export function addGroove(part, { at, depth, radius }) {
  at = clamp(round(at, 1), 5, BAR.length - 5);
  depth = clamp(round(depth, 0.25), 0.5, 4);
  radius = clamp(radius, 0.25, 4);
  return { ...part, ops: [...part.ops, { type: 'groove', at, depth, radius }] };
}

export const setFillet = (part, fillet) => ({ ...part, fillet: clamp(fillet, 0.25, 4) });
export const undo = part => ({ ...part, ops: part.ops.slice(0, -1) });

// Diameter of the turned profile at x, before grooves.
export function turnedDiameter(part, x) {
  let d = BAR.diameter;
  for (const t of turns(part)) if (x >= t.from && x <= t.to) d = Math.min(d, t.diameter);
  return d;
}

export function diameterAt(part, x) {
  let d = turnedDiameter(part, x);
  for (const g of grooves(part)) {
    const dx = Math.abs(x - g.at);
    if (dx <= g.radius) {
      const root = turnedDiameter(part, g.at) - 2 * g.depth;
      const lift = g.radius - Math.sqrt(g.radius ** 2 - dx ** 2); // circular groove bottom
      d = Math.min(d, Math.max(root + 2 * lift, root));
    } else if (dx <= g.radius + 0.001) d = Math.min(d, turnedDiameter(part, g.at));
  }
  return Math.max(d, 4);
}

// Approximate Kt fits, calibrated to Peterson's charts near D/d≈1.2 (U-groove and shoulder fillet).
export function kt(kind, shape, t, r) {
  const s = Math.sqrt(t / r);
  const c = { groove: { tension: 0.92, torsion: 0.42 }, shoulder: { tension: 0.7, torsion: 0.28 } }[shape][kind];
  return Math.min(1 + c * s, kind === 'tension' ? 5 : 3);
}

// Places where the bar might fail: the plain minimum section, each groove root and each shoulder.
export function criticalSections(part) {
  const out = [];
  const xs = [];
  for (let x = 0; x <= BAR.length; x += 0.5) xs.push(x);
  let minX = 0, minD = Infinity;
  for (const x of xs) { const d = turnedDiameter(part, x); if (d < minD - 1e-9) { minD = d; minX = x; } }
  // Middle of the thinnest plain stretch, as a real neck forms away from shoulders.
  const thin = xs.filter(x => Math.abs(turnedDiameter(part, x) - minD) < 1e-9 && !grooves(part).some(g => Math.abs(x - g.at) <= g.radius));
  if (thin.length) minX = thin[Math.floor(thin.length / 2)];
  out.push({ x: minX, d: minD, ktTension: 1, ktTorsion: 1, kind: 'plain' });
  for (const g of grooves(part)) {
    const D = turnedDiameter(part, g.at);
    const d = Math.max(D - 2 * g.depth, 4);
    out.push({ x: g.at, d, ktTension: kt('tension', 'groove', g.depth, g.radius), ktTorsion: kt('torsion', 'groove', g.depth, g.radius), kind: 'groove', radius: g.radius });
  }
  for (let i = 1; i < xs.length; i++) {
    const a = turnedDiameter(part, xs[i - 1]), b = turnedDiameter(part, xs[i]);
    if (Math.abs(a - b) > 1e-9) {
      const d = Math.min(a, b), t = Math.abs(a - b) / 2;
      out.push({ x: a < b ? xs[i - 1] : xs[i], d, ktTension: kt('tension', 'shoulder', t, part.fillet), ktTorsion: kt('torsion', 'shoulder', t, part.fillet), kind: 'shoulder', radius: part.fillet });
    }
  }
  return out;
}

const area = d => Math.PI * d * d / 4;
const polarJ = d => Math.PI * d ** 4 / 32;
const shearZ = d => Math.PI * d ** 3 / 16;

// Elastic compliance of the whole gauge length: mm per N (tension) or rad per N·mm (torsion).
function compliance(part, kind, m) {
  let c = 0;
  for (let x = 0.25; x < BAR.length; x += 0.5) {
    const d = diameterAt(part, x);
    c += kind === 'tension' ? 0.5 / (area(d) * m.E) : 0.5 / (polarJ(d) * m.G);
  }
  return c;
}

// Length over which plastic deformation concentrates at the governing section.
function plasticLength(part, sec) {
  if (sec.kind === 'groove') return Math.max(2 * sec.radius, 1);
  let n = 0;
  for (let x = 0.25; x < BAR.length; x += 0.5) if (diameterAt(part, x) <= sec.d + 0.05) n += 0.5;
  return Math.max(n, 2);
}

export function runTest(part, materialKey, kind) {
  const m = MATERIALS[materialKey];
  const secs = criticalSections(part);
  const k = kind === 'tension' ? 'ktTension' : 'ktTorsion';
  const cap = kind === 'tension' ? area : shearZ;
  const yieldStress = m.ductile ? (kind === 'tension' ? m.Sy : 0.577 * m.Sy) : null;
  const ultStress = m.ductile ? (kind === 'tension' ? m.Su : 0.75 * m.Su) : m.Su; // brittle torsion fails in tension at 45°
  const C = compliance(part, kind, m);
  const toDisplay = kind === 'tension' ? (v => v) : (v => v * 180 / Math.PI); // mm or degrees

  let governing, maxLoad, firstYield = null, points;
  if (!m.ductile) {
    governing = secs.reduce((a, s) => (ultStress * cap(s.d) / s[k] < ultStress * cap(a.d) / a[k] ? s : a));
    maxLoad = ultStress * cap(governing.d) / governing[k];
    points = [[0, 0], [toDisplay(maxLoad * C), maxLoad]];
  } else {
    // Ductile bars neck at the smallest section; on a tie the plain stretch wins (stress peaks yield away).
    governing = secs.reduce((a, s) => (s.d < a.d - 1e-9 ? s : a));
    firstYield = Math.min(...secs.map(s => yieldStress * cap(s.d) / s[k]));
    const fullYield = yieldStress * cap(governing.d);
    maxLoad = ultStress * cap(governing.d);
    const Lp = plasticLength(part, governing);
    const eu = 0.6 * m.elongation, ef = m.elongation;
    const r = governing.d / 2;
    // Plastic deformation (extension in mm, or twist in rad) at the governing section.
    const plastic = e => (kind === 'tension' ? e * Lp : (4 * e) * Lp / r);
    points = [[0, 0]];
    const elasticAt = F => F * C;
    points.push([toDisplay(elasticAt(firstYield)), firstYield]);
    points.push([toDisplay(elasticAt(fullYield) + plastic(0.002)), fullYield]);
    for (let i = 1; i <= 8; i++) {
      const f = i / 8, F = fullYield + (maxLoad - fullYield) * Math.sin(f * Math.PI / 2);
      points.push([toDisplay(elasticAt(F) + plastic(0.002 + (eu - 0.002) * f)), F]);
    }
    const drop = kind === 'tension' ? 0.82 : 0.97; // necking in tension; little load loss in torsion
    for (let i = 1; i <= 4; i++) {
      const f = i / 4, F = maxLoad * (1 - (1 - drop) * f * f);
      points.push([toDisplay(elasticAt(F) + plastic(eu + (ef - eu) * f)), F]);
    }
  }
  points = points.map(([x, y]) => ({ x: +x.toFixed(4), y: +y.toFixed(1) }));
  const avgStress = maxLoad / cap(governing.d);
  return {
    kind, material: materialKey, maxLoad, firstYield, breakAt: governing.x, governing,
    finalReading: points.at(-1).x, points,
    nominalStressAtBreak: avgStress, peakStressAtBreak: m.ductile ? null : avgStress * governing[k],
    mode: fractureMode(m, kind),
  };
}

export function fractureMode(m, kind) {
  if (kind === 'tension') return m.ductile ? 'cup-and-cone' : 'flat';
  return m.ductile ? 'flat-shear' : 'helix-45';
}

// Plain-language explanation of what happened, for a Class 12 / first-year engineering learner.
export function explain(result, part) {
  const m = MATERIALS[result.material];
  const g = result.governing;
  const where = g.kind === 'groove' ? 'at the groove' : g.kind === 'shoulder' ? 'at the sharp step (shoulder)' : 'where the bar was thinnest';
  const lines = [];
  const unit = result.kind === 'tension' ? 'kN' : 'N·m';
  if (result.kind === 'tension') {
    lines.push(m.ductile
      ? `${m.name} stretched, thinned in one spot (necking) and tore ${where}, leaving a cup-and-cone break.`
      : `${m.name} hardly stretched at all. It snapped ${where} with a flat break.`);
  } else {
    lines.push(m.ductile
      ? `${m.name} twisted round and round before shearing off ${where} with a flat break.`
      : `${m.name} snapped ${where} along a 45° spiral. Twisting pulls the surface apart on a slant, and cast iron is weak when pulled.`);
  }
  if (!m.ductile && g.kind !== 'plain')
    lines.push(`Near the root of the cut, the stress was about ${g[result.kind === 'tension' ? 'ktTension' : 'ktTorsion'].toFixed(1)}× the average. Brittle metals cannot spread that peak out, so a crack started there. A rounder cut (bigger tip radius) would carry more.`);
  else if (m.ductile && g.kind === 'groove')
    lines.push(`All the stretching happened inside the short groove, so the bar stretched much less before breaking than a plain bar would.`);
  else if (m.ductile && part.ops.length && g.kind === 'plain')
    lines.push(`A ductile metal yields and spreads out stress peaks, so the strength depends mainly on the smallest cross-section.`);
  return lines.join(' ');
}

export const loadLabel = (kind, n) => kind === 'tension' ? `${(n / 1000).toFixed(1)} kN` : `${(n / 1000).toFixed(0)} N·m`;
