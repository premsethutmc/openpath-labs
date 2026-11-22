// Stiffness vs strength — pure helpers for the Mount bench's readout, stress–strain view and two-run comparison.
// They read the existing model (stand(), SPEC, materials, sections) and never change it. Units: mm, N, MPa, µε.
//   deflection under the load  δ = P·a²·b² / (3·E·I·L)   → set by E·I (stiffness)
//   bending stress at the mount σ = M·c / I = M / (I/c)  → set by the load and the section, not by E (strength demand)
//   factor of safety on yield  FoS = yield ÷ σ           → required ≥ SPEC.yieldFactor (allowable = yield ÷ 2)
//   linear elastic (Hooke)      σ = E·ε, valid only for σ ≤ yield; nothing beyond yield is modelled
import { SPEC, stand, sectionOf } from './model.mjs';
import { MATERIALS } from '../core/materials.mjs';

export const factorOfSafety = (yieldStrength, stress) => (Math.abs(stress) > 0 ? yieldStrength / Math.abs(stress) : Infinity);

// Stiffness and strength properties of a design: E·I (N·mm²) and the section modulus I/c (mm³).
export function properties(design) {
  const m = MATERIALS[design.material], s = sectionOf(design);
  return { E: m.E, I: s.I, c: s.c, EI: m.E * s.I, Z: s.I / s.c, yield: m.yield, allowable: m.yield / SPEC.yieldFactor };
}

// The design under the operating load at mount position `mount`, judged at the mount (deflection and peak moment are both there).
export function splitReadout(design, mount) {
  const st = stand(design, { mount, loaded: true }), at = st.at(mount), p = properties(design);
  const deflection = at.deflection, stress = Math.abs(at.stress), strain = Math.abs(at.strain) * 1e6;
  return { ...p, mount, load: SPEC.load,
    deflection, tolerance: SPEC.tolerance, deflectionRatio: deflection / SPEC.tolerance, stiff: deflection <= SPEC.tolerance,
    stress, strain, stressRatio: stress / p.allowable, strong: stress <= p.allowable,
    fos: factorOfSafety(p.yield, stress), fosRequired: SPEC.yieldFactor, beyondYield: stress > p.yield };
}

// One strain reading placed on the material's linear-elastic line. strain in µε (sign kept), E and yield in MPa.
export function stressStrainPoint({ E, yield: fy }, strainMicro) {
  const stress = E * strainMicro * 1e-6, yieldStrain = fy / E * 1e6;
  return { strain: strainMicro, stress, yieldStrain, yield: fy, allowable: fy / SPEC.yieldFactor,
    fractionOfYield: Math.abs(stress) / fy, beyondYield: Math.abs(stress) > fy };
}

// Two saved runs ({ setup: { design, mount, loaded, dialX, strainX }, outputs: { deflection, stress } }) compared as ratios B ÷ A.
// Deflection should follow 1/(E·I) and stress should follow 1/(I/c) when the load, mount and gauge positions match.
export function runRatios(a, b) {
  const pa = properties(a.setup.design), pb = properties(b.setup.design);
  const r = (x, y) => (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) > 1e-12 ? y / x : null);
  const sa = a.setup, sb = b.setup, issues = [];
  if (!sa.loaded || !sb.loaded) issues.push('both readings must be under load');
  if (sa.mount !== sb.mount) issues.push('the machine mount moved');
  if (sa.dialX !== sb.dialX) issues.push('the dial gauge moved');
  if (sa.strainX !== sb.strainX) issues.push('the strain gauge moved');
  return {
    deflection: r(a.outputs.deflection?.value, b.outputs.deflection?.value), stiffness: pb.EI ? pa.EI / pb.EI : null,   // (E·I)A ÷ (E·I)B
    stress: r(a.outputs.stress?.value, b.outputs.stress?.value), section: pb.Z ? pa.Z / pb.Z : null,                   // (I/c)A ÷ (I/c)B
    E: pb.E / pa.E, EI: { a: pa.EI, b: pb.EI }, Z: { a: pa.Z, b: pb.Z }, comparable: issues.length === 0, issues,
  };
}
