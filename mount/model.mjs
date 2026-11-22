// "The Mount That Didn't Break" — model. A machine support bolted at two points, loaded by the machine at its mount.
// Bounded elastic beam model, solved by the existing Solids engine (engines/solids/frame.mjs, direct stiffness).
// Units: mm, N, MPa (N/mm²), kg.
//
// Assumptions (stated to the learner):
// • Euler–Bernoulli beam, linear elastic, small deflection; shear deformation neglected (a few % for the deepest sections).
// • Bolted ends act as a pin and a roller (simply supported): bolts give some fixity in reality, which would stiffen it.
// • The machine's operating load is one static vertical point load at the mount; the support's own weight is neglected
//   (≤ 1 % of the load for every design inside the mass limit — tested).
// • Not modelled: bolt slip, stress concentrations at holes and corners, fatigue under repeated load, local buckling of
//   thin walls (so walls are limited to ≥ 3 mm), lateral-torsional buckling, dynamic loading, temperature.
import { solve } from '../engines/solids/frame.mjs';
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';

export const SPEC = {
  span: 600, load: 2500, tolerance: 0.15, yieldFactor: 2, massLimit: 2.5,
  envelope: { b: 50, h: 80 }, minWall: 3, step: 50,
  guidedMount: 200, transferMount: 300, mountRange: [100, 500],
};
export const MATERIAL_IDS = ['steel', 'aluminium'];
export const ORIGINAL = { material: 'aluminium', shape: 'rect', b: 40, h: 30 };
export const GAUGE_POSITIONS = Array.from({ length: SPEC.span / SPEC.step - 1 }, (_, i) => (i + 1) * SPEC.step);   // 50 … 550 mm

// Section of a design, with the honest limits of what we model.
export function check(design) {
  const e = SPEC.envelope, errors = [];
  if (!MATERIAL_IDS.includes(design.material)) errors.push('unknown material');
  if (design.b > e.b || design.h > e.h) errors.push(`outside the mounting envelope (${e.b} × ${e.h} mm)`);
  if (['rhs', 'I'].includes(design.shape)) {
    const walls = design.shape === 'rhs' ? [design.t] : [design.tw, design.tf];
    if (walls.some(w => w < SPEC.minWall)) errors.push(`walls thinner than ${SPEC.minWall} mm (local buckling is not modelled)`);
    if (design.shape === 'rhs' && 2 * design.t >= Math.min(design.b, design.h)) errors.push('wall too thick for this size');
    if (design.shape === 'I' && (2 * design.tf >= design.h || design.tw >= design.b)) errors.push('flanges or web too thick for this size');
  }
  return { ok: errors.length === 0, errors };
}
export const sectionOf = d => section(d.shape === 'rect' ? { shape: 'rect', b: d.b, h: d.h } : d.shape === 'rhs' ? { shape: 'rhs', b: d.b, h: d.h, t: d.t } : { shape: 'I', h: d.h, b: d.b, tw: d.tw, tf: d.tf });
export const massOf = d => MATERIALS[d.material].density * sectionOf(d).A * 1e-9 * SPEC.span;   // kg (span between bolts)

// One test-stand state. mount: x of the machine mount (mm); loaded: operating load on or off.
export function stand(design, { mount, loaded }) {
  if (mount < SPEC.mountRange[0] || mount > SPEC.mountRange[1] || mount % SPEC.step) throw new Error(`mount must be on a ${SPEC.step} mm grid within ${SPEC.mountRange.join('–')} mm`);
  const mat = MATERIALS[design.material], sec = sectionOf(design), n = SPEC.span / SPEC.step + 1;
  const structure = {
    nodes: Array.from({ length: n }, (_, i) => ({ x: i * SPEC.step, y: 0 })),
    members: Array.from({ length: n - 1 }, (_, i) => ({ i, j: i + 1, material: mat, section: sec, type: 'frame' })),
    supports: [{ node: 0, type: 'pin' }, { node: n - 1, type: 'roller' }],
    loads: loaded ? [{ node: mount / SPEC.step, fx: 0, fy: -SPEC.load, m: 0 }] : [],
  };
  const res = solve(structure);
  // bending moment at each node (sagging +) from the member end forces; deflection downward positive
  const M = Array.from({ length: n }, (_, i) => (i < n - 1 ? -res.members[i].end[2] : res.members[n - 2].end[5]));
  const defl = Array.from({ length: n }, (_, i) => -res.displacements[3 * i + 1]);
  const at = x => { const i = x / SPEC.step; return { deflection: defl[i], moment: M[i], stress: M[i] * sec.c / sec.I, strain: M[i] * sec.c / sec.I / mat.E }; };
  const maxStress = Math.max(...M.map(m => Math.abs(m) * sec.c / sec.I));
  return {
    design, mount, loaded, material: mat, section: sec, mass: massOf(design), res, structure, defl, M, at, maxStress,
    reactions: res.reactions.map(r => r.fy), EI: mat.E * sec.I, yieldStrength: mat.yield,
    elastic: maxStress < mat.yield,
  };
}

// The three limits, judged on the true state (used for feedback after the learner's own readings).
export function verdict(design, mount) {
  const s = stand(design, { mount, loaded: true }), d = s.at(mount).deflection;
  return {
    alignment: d <= SPEC.tolerance, yield: s.maxStress <= s.yieldStrength / SPEC.yieldFactor, mass: s.mass <= SPEC.massLimit,
    deflection: d, maxStress: s.maxStress, mass_kg: s.mass, allowable: s.yieldStrength / SPEC.yieldFactor,
    get all() { return this.alignment && this.yield && this.mass; },
  };
}

// ---------- shared experiment record (core/project.mjs) ----------
// One reading on the test stand: the design, where the machine sits, load on or off, and where the gauges are.
export const READING_LABELS = { mount: 'Machine mount position', loaded: 'Load', dialX: 'Dial gauge position', strainX: 'Strain gauge position',
  'design.material': 'Material', 'design.shape': 'Section', 'design.b': 'Width b', 'design.h': 'Depth h', 'design.t': 'Wall t', 'design.tw': 'Web tw', 'design.tf': 'Flange tf' };
export function evaluateReading(s) {
  if (!s?.design) return { ok: false, reason: 'Put a support on the test stand first.' };
  const c = check(s.design); if (!c.ok) return { ok: false, reason: `This support cannot be tested: ${c.errors.join('; ')}.` };
  if (!GAUGE_POSITIONS.includes(s.dialX) || !GAUGE_POSITIONS.includes(s.strainX) || !GAUGE_POSITIONS.includes(s.mount)) return { ok: false, reason: 'gauges and the mount sit at the marked stations' };
  const st = stand(s.design, { mount: s.mount, loaded: !!s.loaded }), dd = st.at(s.dialX), ss = st.at(s.strainX), E = MATERIALS[s.design.material].E;
  const strain = ss.strain * 1e6, stress = ss.strain * E, allow = MATERIALS[s.design.material].yield / SPEC.yieldFactor;
  const na = why => ({ value: 'not-applicable', reason: why });
  return { ok: true,
    outputs: { deflection: { label: 'Dial reading (deflection)', value: dd.deflection, unit: 'mm', source: 'measured' }, strain: { label: 'Strain reading', value: strain, unit: 'µε', source: 'measured' },
      stress: { label: 'Stress from strain (E·ε)', value: stress, unit: 'MPa', source: 'measured' }, mass: { label: 'Support mass', value: st.mass, unit: 'kg', source: 'simulated' },
      I: { label: 'Second moment of area I', value: sectionOf(s.design).I, unit: 'mm⁴', source: 'simulated' }, E: { label: 'Elastic modulus E', value: E, unit: 'MPa', source: 'table' } },
    verdicts: {
      alignment: !s.loaded ? na('no load on the stand') : s.dialX !== s.mount ? na('dial gauge not at the mount') : { value: dd.deflection <= SPEC.tolerance ? 'pass' : 'fail', reason: `deflection ≤ ${SPEC.tolerance} mm at the mount` },
      strength: !s.loaded ? na('no load on the stand') : s.strainX !== s.mount ? na('strain gauge not at the mount') : { value: stress <= allow ? 'pass' : 'fail', reason: `stress ≤ yield ÷ ${SPEC.yieldFactor}` },
      mass: { value: st.mass <= SPEC.massLimit ? 'pass' : 'fail', reason: `mass ≤ ${SPEC.massLimit} kg` } } };
}
export const READING_ADAPTER = { domain: 'mount-stand', title: 'Mount', evaluate: evaluateReading };
