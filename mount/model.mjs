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
import { MATERIALS, limits } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';

export const SPEC = {
  span: 600, load: 2500, tolerance: 0.15, yieldFactor: 2, massLimit: 2.5,
  envelope: { b: 50, h: 80 }, minWall: 3, step: 50,
  guidedMount: 200, transferMount: 300, mountRange: [100, 500],
};
export const MATERIAL_IDS = ['steel', 'aluminium'];
export const ORIGINAL = { material: 'aluminium', shape: 'rect', b: 40, h: 30 };
// Section dimensions the bench offers: [key, label, min, max] in mm (sliders, and the levers of mount/learn.mjs).
export const DIMS = { rect: [['b', 'Width b', 10, 50], ['h', 'Depth h', 10, 80]], rhs: [['b', 'Width b', 20, 50], ['h', 'Depth h', 20, 80], ['t', 'Wall t', 3, 10]], I: [['b', 'Flange width b', 20, 50], ['h', 'Depth h', 20, 80], ['tw', 'Web tw', 3, 10], ['tf', 'Flange tf', 3, 12]] };
export const DEFAULT_DIMS = { rect: { b: 40, h: 30 }, rhs: { b: 40, h: 50, t: 3 }, I: { b: 40, h: 60, tw: 3, tf: 4 } };
export const GAUGE_POSITIONS = Array.from({ length: SPEC.span / SPEC.step - 1 }, (_, i) => (i + 1) * SPEC.step);   // 50 … 550 mm

// Section of a design, with the honest limits of what we model.
// open: the open bench, where every material in core/materials.mjs may be chosen (the mission offers two).
export function check(design, { open = false } = {}) {
  const e = SPEC.envelope, errors = [];
  if (!(open ? Object.hasOwn(MATERIALS, design.material) : MATERIAL_IDS.includes(design.material))) errors.push('unknown material');
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
export const massOf = (d, span = SPEC.span) => MATERIALS[d.material].density * sectionOf(d).A * 1e-9 * span;   // kg (span between bolts)

// ---------- open bench ----------
// The guided mission uses SPEC. The open bench lets the student set the span, the load, the support type, any material
// in core/materials.mjs and their own limits. A setup carries these as `bench`; a setup without `bench` (every run saved
// before the bench was opened, the guided mission and the journeys' setups) is evaluated exactly as before.
export const SUPPORTS = {
  'pin-roller': { label: 'Pinned – roller (simply supported)', ends: ['pin', 'roller'] },
  'fixed-fixed': { label: 'Fixed – fixed (both ends clamped)', ends: ['fixed', 'fixed'] },
  'fixed-roller': { label: 'Fixed – roller (propped cantilever)', ends: ['fixed', 'roller'] },
  cantilever: { label: 'Cantilever (fixed at the left, free at the right)', ends: ['fixed', null] },
};
export const DEFAULT_BENCH = Object.freeze({ span: SPEC.span, load: SPEC.load, supports: 'pin-roller', limits: Object.freeze({ deflection: SPEC.tolerance, yieldFactor: SPEC.yieldFactor, mass: SPEC.massLimit }) });
export const OPEN_RANGE = { span: [200, 3000], load: [100, 50000] };
export const defaultBench = () => JSON.parse(JSON.stringify(DEFAULT_BENCH));
export const benchOf = setup => { const b = setup?.bench ?? {}; return { ...DEFAULT_BENCH, ...b, limits: { ...DEFAULT_BENCH.limits, ...(b.limits ?? {}) } }; };
// Stations along the beam (mm from the left end) where the machine and the gauges can sit: every 50 mm, not on a support.
export const stations = ({ span, supports } = DEFAULT_BENCH) => Array.from({ length: span / SPEC.step - (SUPPORTS[supports]?.ends[1] ? 1 : 0) }, (_, i) => (i + 1) * SPEC.step);
export function checkBench(b) {
  const e = [], [s0, s1] = OPEN_RANGE.span, [l0, l1] = OPEN_RANGE.load, L = b.limits ?? {};
  if (!SUPPORTS[b.supports]) e.push('unknown support type');
  if (!(b.span >= s0 && b.span <= s1) || b.span % SPEC.step) e.push(`span must be ${s0}–${s1} mm in ${SPEC.step} mm steps`);
  if (!(b.load >= l0 && b.load <= l1)) e.push(`load must be ${l0}–${l1} N`);
  if (!(L.deflection > 0) || !(L.yieldFactor >= 1) || !(L.mass > 0)) e.push('limits must be positive (factor of safety at least 1)');
  return e;
}
// The stress a material can take in bending before it stops behaving elastically: yield for ductile metals, the lower
// of the tension and compression strengths for brittle or natural materials (both faces of a symmetric section work).
export const strengthOf = m => (m.ductile ? m.yield : Math.min(limits(m).tension, limits(m).compression));
export const strengthWord = m => (m.ductile ? 'yield' : 'failure strength');

// One test-stand state. mount: x of the machine mount (mm); loaded: operating load on or off.
// Called as before (no span/load/supports) it is the guided stand; with them it is the open bench.
export function stand(design, { mount, loaded, span, load, supports } = {}) {
  const open = span !== undefined || load !== undefined || supports !== undefined;
  const B = { span: span ?? SPEC.span, load: load ?? SPEC.load, supports: supports ?? 'pin-roller' };
  if (!open) { if (mount < SPEC.mountRange[0] || mount > SPEC.mountRange[1] || mount % SPEC.step) throw new Error(`mount must be on a ${SPEC.step} mm grid within ${SPEC.mountRange.join('–')} mm`); }
  else { const e = checkBench({ ...B, limits: DEFAULT_BENCH.limits }); if (e.length) throw new Error(e.join('; ')); if (!stations(B).includes(mount)) throw new Error(`mount must be on a ${SPEC.step} mm station along the beam, off the supports`); }
  const mat = MATERIALS[design.material], sec = sectionOf(design), n = B.span / SPEC.step + 1, [e0, e1] = SUPPORTS[B.supports].ends;
  const structure = {
    nodes: Array.from({ length: n }, (_, i) => ({ x: i * SPEC.step, y: 0 })),
    members: Array.from({ length: n - 1 }, (_, i) => ({ i, j: i + 1, material: mat, section: sec, type: 'frame' })),
    supports: [{ node: 0, type: e0 }, ...(e1 ? [{ node: n - 1, type: e1 }] : [])],
    loads: loaded ? [{ node: mount / SPEC.step, fx: 0, fy: -B.load, m: 0 }] : [],
  };
  const res = solve(structure);
  // bending moment at each node (sagging +) from the member end forces; deflection downward positive
  const M = Array.from({ length: n }, (_, i) => (i < n - 1 ? -res.members[i].end[2] : res.members[n - 2].end[5]));
  const defl = Array.from({ length: n }, (_, i) => -res.displacements[3 * i + 1]);
  const at = x => { const i = x / SPEC.step; return { deflection: defl[i], moment: M[i], stress: M[i] * sec.c / sec.I, strain: M[i] * sec.c / sec.I / mat.E }; };
  const maxStress = Math.max(...M.map(m => Math.abs(m) * sec.c / sec.I));
  return {
    design, mount, loaded, material: mat, section: sec, mass: massOf(design, B.span), res, structure, defl, M, at, maxStress, bench: B,
    reactions: res.reactions.map(r => r.fy), supportMoments: res.reactions.map(r => r.m), EI: mat.E * sec.I, yieldStrength: open ? strengthOf(mat) : mat.yield,
    elastic: maxStress < (open ? strengthOf(mat) : mat.yield),
  };
}

// The three limits, judged on the true state (used for feedback after the learner's own readings).
// bench (optional): an open-bench set-up; its limits replace the mission's.
export function verdict(design, mount, bench) {
  const B = bench ? benchOf({ bench }) : null, L = B ? B.limits : { deflection: SPEC.tolerance, yieldFactor: SPEC.yieldFactor, mass: SPEC.massLimit };
  const s = stand(design, B ? { mount, loaded: true, span: B.span, load: B.load, supports: B.supports } : { mount, loaded: true }), d = s.at(mount).deflection;
  return {
    alignment: d <= L.deflection, yield: s.maxStress <= s.yieldStrength / L.yieldFactor, mass: s.mass <= L.mass,
    deflection: d, maxStress: s.maxStress, mass_kg: s.mass, allowable: s.yieldStrength / L.yieldFactor,
    get all() { return this.alignment && this.yield && this.mass; },
  };
}

// ---------- shared experiment record (core/project.mjs) ----------
// One reading on the test stand: the design, where the machine sits, load on or off, and where the gauges are.
// An open-bench reading also carries `bench`: { span, load, supports, limits: { deflection, yieldFactor, mass } }.
export const READING_LABELS = { mount: 'Machine mount position', loaded: 'Load', dialX: 'Dial gauge position', strainX: 'Strain gauge position',
  'design.material': 'Material', 'design.shape': 'Section', 'design.b': 'Width b', 'design.h': 'Depth h', 'design.t': 'Wall t', 'design.tw': 'Web tw', 'design.tf': 'Flange tf',
  'bench.span': 'Span', 'bench.load': 'Operating load', 'bench.supports': 'Supports', 'bench.limits.deflection': 'Deflection limit', 'bench.limits.yieldFactor': 'Required factor of safety', 'bench.limits.mass': 'Mass limit' };
// Outputs every reading has. An open-bench reading adds the design's values under the operating load (whether or not the
// load is on the stand at that moment): support reactions, the largest bending moment and stress, and the factor of safety.
// A setup without `bench` returns exactly the six outputs it always did, so every run saved before still reproduces.
export function evaluateReading(s) {
  if (!s?.design) return { ok: false, reason: 'Put a support on the test stand first.' };
  const open = !!s.bench, B = benchOf(s), L = B.limits;
  const c = check(s.design, { open }); if (!c.ok) return { ok: false, reason: `This support cannot be tested: ${c.errors.join('; ')}.` };
  if (open) { const e = checkBench(B); if (e.length) return { ok: false, reason: `This bench set-up cannot be tested: ${e.join('; ')}.` }; }
  const pos = open ? stations(B) : GAUGE_POSITIONS;
  if (!pos.includes(s.dialX) || !pos.includes(s.strainX) || !pos.includes(s.mount) || (!open && (s.mount < SPEC.mountRange[0] || s.mount > SPEC.mountRange[1]))) return { ok: false, reason: 'gauges and the mount sit at the marked stations' };
  const opt = loaded => (open ? { mount: s.mount, loaded, span: B.span, load: B.load, supports: B.supports } : { mount: s.mount, loaded });
  const st = stand(s.design, opt(!!s.loaded)), dd = st.at(s.dialX), ss = st.at(s.strainX), mat = MATERIALS[s.design.material], E = mat.E;
  const strain = ss.strain * 1e6, stress = ss.strain * E, allow = (open ? strengthOf(mat) : mat.yield) / L.yieldFactor;
  const na = why => ({ value: 'not-applicable', reason: why });
  const outputs = { deflection: { label: 'Dial reading (deflection)', value: dd.deflection, unit: 'mm', source: 'measured' }, strain: { label: 'Strain reading', value: strain, unit: 'µε', source: 'measured' },
    stress: { label: 'Stress from strain (E·ε)', value: stress, unit: 'MPa', source: 'measured' }, mass: { label: 'Support mass', value: st.mass, unit: 'kg', source: 'simulated' },
    I: { label: 'Second moment of area I', value: sectionOf(s.design).I, unit: 'mm⁴', source: 'simulated' }, E: { label: 'Elastic modulus E', value: E, unit: 'MPa', source: 'table' } };
  if (open) {
    const on = stand(s.design, opt(true)), ends = SUPPORTS[B.supports].ends, sim = (label, value, unit) => ({ label, value, unit, source: 'simulated' });
    const side = ['left', 'right'];
    on.res.reactions.forEach((r, k) => {
      const w = side[r.node === 0 ? 0 : 1], W = w[0].toUpperCase() + w.slice(1);
      outputs[`reaction${W}`] = sim(`${W} support reaction (under the operating load)`, r.fy, 'N');
      if (ends[r.node === 0 ? 0 : 1] === 'fixed') outputs[`moment${W}`] = sim(`${W} fixing moment (under the operating load)`, Math.abs(r.m) / 1000, 'N·m');
    });
    outputs.maxMoment = sim('Largest bending moment (under the operating load)', Math.max(...on.M.map(Math.abs)) / 1000, 'N·m');
    outputs.maxStress = sim('Largest bending stress (under the operating load)', on.maxStress, 'MPa');
    outputs.maxDeflection = sim('Largest deflection (under the operating load)', Math.max(...on.defl), 'mm');
    outputs.fos = sim(`Factor of safety on ${strengthWord(mat)} (under the operating load)`, strengthOf(mat) / on.maxStress, '');
  }
  return { ok: true, outputs,
    verdicts: {
      alignment: !s.loaded ? na('no load on the stand') : s.dialX !== s.mount ? na('dial gauge not at the mount') : { value: dd.deflection <= L.deflection ? 'pass' : 'fail', reason: `deflection ≤ ${L.deflection} mm at the mount` },
      strength: !s.loaded ? na('no load on the stand') : s.strainX !== s.mount ? na('strain gauge not at the mount') : { value: stress <= allow ? 'pass' : 'fail', reason: `stress ≤ ${open ? strengthWord(mat) : 'yield'} ÷ ${L.yieldFactor}` },
      mass: { value: st.mass <= L.mass ? 'pass' : 'fail', reason: `mass ≤ ${L.mass} kg` } } };
}
export const READING_ADAPTER = { domain: 'mount-stand', title: 'Mount', evaluate: evaluateReading };
