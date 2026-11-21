// Turns a solved frame into what a learner needs: stresses, safety factors, failure mode, explanations.
import { solve, internalAt, displacedPoint } from './frame.mjs';
import { limits, failureWord } from '../../core/materials.mjs';

export const SAMPLES = 24;

export function analyze(structure) {
  const res = solve(structure);
  if (!res.ok) return res;
  const members = res.members.map((mr, k) => {
    const { material: mat, section: sec } = mr.member;
    const lim = limits(mat);
    const samples = [];
    let worst = { sf: Infinity };
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES, f = internalAt(res, mr, t);
      const axial = f.N / sec.A, bend = Math.abs(f.M) * sec.c / sec.I;
      const top = axial - f.M * sec.c / sec.I, bottom = axial + f.M * sec.c / sec.I;
      const tens = Math.max(top, bottom, 0), comp = Math.max(-top, -bottom, 0);
      const sfT = tens > 1e-9 ? lim.tension / tens : Infinity, sfC = comp > 1e-9 ? lim.compression / comp : Infinity;
      const sf = Math.min(sfT, sfC);
      const s = { t, ...f, axial, bend, top, bottom, sigma: Math.max(tens, comp), sf };
      samples.push(s);
      if (sf < worst.sf) worst = { sf, t, sign: sfT <= sfC ? 1 : -1, sample: s };
    }
    // Euler buckling of members in compression (effective length = member length: pinned-pinned assumption)
    const Nmin = Math.min(...samples.map(s => s.N));
    const Pcr = Math.PI ** 2 * mat.E * sec.I / mr.L ** 2;
    const sfBuckle = Nmin < -1e-6 ? Pcr / -Nmin : Infinity;
    const mode = sfBuckle < worst.sf ? 'buckling' : worst.sign > 0 ? 'tension' : 'compression';
    const sf = Math.min(worst.sf, sfBuckle);
    return { index: k, samples, sf, mode, worst, Pcr, sfBuckle, maxSigma: Math.max(...samples.map(s => s.sigma)), material: mat, section: sec, L: mr.L };
  });
  let maxDefl = { d: 0 };
  structure.members.forEach((m, k) => {
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES, p0 = { x: structure.nodes[m.i].x + (structure.nodes[m.j].x - structure.nodes[m.i].x) * t, y: structure.nodes[m.i].y + (structure.nodes[m.j].y - structure.nodes[m.i].y) * t };
      const p = displacedPoint(structure, res, k, t, 1), d = Math.hypot(p.x - p0.x, p.y - p0.y);
      if (d > maxDefl.d) maxDefl = { d, member: k, t, dx: p.x - p0.x, dy: p.y - p0.y };
    }
  });
  const governing = members.reduce((a, b) => (b.sf < a.sf ? b : a));
  const coldWarning = members.some(m => m.material.coldBrittleBelow !== undefined && structure.temperature !== undefined && structure.temperature < m.material.coldBrittleBelow);
  return { ok: true, res, members, governing, sf: governing.sf, maxDefl, coldWarning };
}

export function verdict(a) {
  if (!a.ok) return { level: 'unstable', text: a.message };
  const g = a.governing, m = g.material;
  const what = g.mode === 'buckling' ? 'buckles sideways' : failureWord(m, g.mode === 'tension' ? 1 : -1);
  if (a.sf < 1) return { level: 'failed', text: `Failed: member ${g.index + 1} ${what}.` };
  if (a.sf < 1.5) return { level: 'danger', text: `Unsafe: member ${g.index + 1} is close to ${g.mode === 'buckling' ? 'buckling' : 'failing'} (safety factor ${a.sf.toFixed(2)}).` };
  if (a.sf < 2.5) return { level: 'ok', text: `Safe, but working hard (safety factor ${a.sf.toFixed(1)}).` };
  return { level: 'safe', text: `Comfortably safe (safety factor ${a.sf > 99 ? '99+' : a.sf.toFixed(1)}).` };
}
