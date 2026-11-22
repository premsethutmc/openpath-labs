// Stress, strain, Hooke's law, yield and factor of safety (PH25C01 Applied Physics I, sem I, "Properties of matter:
// elasticity, Young's modulus"; CE25C11 Strength of Materials, sem III), for Journey 3, "Stiff enough, not just strong".
// requires = mandatory prerequisites (the diagnostic may test them); support = useful, never a gate.
// Links into content/graph/statics.mjs (ENG.solids.bending-stress, ENG.solids.beam-stiffness, ENG.statics.second-moment-area)
// and school maths (content/graph/school-math.mjs).
//
// ENG.solids.bending-stress requires ENG.solids.normal-stress and ENG.solids.beam-stiffness requires ENG.solids.hookes-law;
// those edges live on the beam nodes in content/graph/statics.mjs (a node is defined in one file only).

const node = (id, title, requires, support, items) => ({ id, title, requires, support, items });

export const NODES = [
  node('ENG.solids.normal-stress', 'Normal stress: σ = F / A (axial) and σ = M·c / I (bending)',
    ['MATH.measurement.rectangle-area', 'MATH.measurement.unit-conversions'], ['ENG.solids.bending-stress'], 'solids.normal-stress'),
  node('ENG.solids.strain', 'Strain: ε = ΔL / L (no unit; µε and %)', ['MATH.measurement.unit-conversions'], [], 'solids.strain'),
  node('ENG.solids.hookes-law', 'Hooke’s law and Young’s modulus: σ = E·ε below the elastic limit',
    ['ENG.solids.normal-stress', 'ENG.solids.strain'], ['MATH.algebra.linear-equations'], 'solids.hooke'),
  node('ENG.solids.yield-elastic-limit', 'Yield strength and the elastic limit (the linear model holds only below yield)',
    ['ENG.solids.hookes-law'], [], 'solids.yield'),
  node('ENG.solids.factor-of-safety', 'Allowable stress and factor of safety: FoS = yield ÷ working stress',
    ['ENG.solids.yield-elastic-limit', 'ENG.solids.normal-stress'], ['ENG.solids.bending-stress'], 'solids.fos'),
  node('ENG.solids.stiffness-vs-strength', 'Stiffness vs strength: E·I sets the deflection, yield and I/c set the stress',
    ['ENG.solids.hookes-law', 'ENG.solids.factor-of-safety', 'ENG.solids.beam-stiffness', 'ENG.solids.bending-stress'],
    ['ENG.statics.second-moment-area', 'MATH.algebra.inverse-proportion'], 'solids.stiff-strong'),
];
