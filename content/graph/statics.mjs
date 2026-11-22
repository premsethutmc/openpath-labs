// Engineering statics and beam bending for Journey 1, "The support that holds" (ME25C02 Engineering Mechanics, sem II).
// requires = mandatory prerequisites (the diagnostic may test them); support = useful, never a gate.
// School ids are defined in content/graph/school-math.mjs. Every node names its item generator (content/items/*.mjs).
const node = (id, title, requires, support, items) => ({ id, title, requires, support, items });

export const NODES = [
  node('ENG.statics.free-body-diagram', 'Free-body diagram', ['MATH.vectors.algebra'], [], 'statics.fbd'),
  node('ENG.statics.force-components', 'Resolve a force into components', ['MATH.trigonometry.functions'], ['MATH.vectors.algebra'], 'statics.components'),
  node('ENG.statics.support-reactions', 'Support reactions: pin, roller, fixed', ['ENG.statics.free-body-diagram'], [], 'statics.supports'),
  node('ENG.statics.perpendicular-distance', 'Perpendicular distance to a line of action (lever arm)', ['MATH.trigonometry.functions'], ['MATH.trigonometry.ratios'], 'statics.lever-arm'),
  node('ENG.statics.moment-about-point', 'Moment of a force about a point',
    ['MATH.trigonometry.functions', 'ENG.statics.perpendicular-distance', 'ENG.statics.force-components'], ['MATH.vectors.products'], 'statics.moment'),
  node('ENG.statics.couple', 'Couple', ['ENG.statics.moment-about-point'], [], 'statics.couple'),
  node('ENG.statics.equilibrium-2d', 'Equilibrium in 2D: ΣF = 0, ΣM = 0',
    ['ENG.statics.moment-about-point', 'ENG.statics.free-body-diagram', 'ENG.statics.support-reactions', 'MATH.algebra.linear-equations'], ['MATH.algebra.linear-systems', 'ENG.statics.couple'], 'statics.equilibrium'),
  node('ENG.statics.beam-reactions', 'Reactions of a simply supported beam with a point load', ['ENG.statics.equilibrium-2d'], ['MATH.algebra.linear-systems'], 'statics.beam-reactions'),
  node('ENG.statics.cantilever-reactions', 'Reactions at a fixed support (cantilever)', ['ENG.statics.equilibrium-2d'], ['ENG.statics.couple'], 'statics.cantilever'),
  node('ENG.statics.bending-moment', 'Bending moment from loads (largest under a point load)', ['ENG.statics.beam-reactions', 'ENG.statics.moment-about-point'], ['ENG.statics.cantilever-reactions'], 'statics.bending-moment'),
  node('ENG.statics.second-moment-area', 'Second moment of area: rectangle, hollow rectangle, I-section', ['MATH.measurement.rectangle-area', 'MATH.number.exponents'], [], 'statics.second-moment'),
  node('ENG.solids.bending-stress', 'Bending stress σ = M·c / I', ['ENG.statics.bending-moment', 'ENG.statics.second-moment-area', 'ENG.solids.normal-stress', 'MATH.measurement.unit-conversions'], [], 'solids.bending-stress'),
  node('ENG.solids.beam-stiffness', 'Beam stiffness: deflection ∝ 1 / (E·I)', ['ENG.statics.second-moment-area', 'ENG.statics.bending-moment', 'ENG.solids.hookes-law'], ['MATH.algebra.inverse-proportion', 'MATH.number.exponents'], 'solids.stiffness'),
];
