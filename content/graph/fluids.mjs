// Competency graph for Journey 2 (pipe sizing: friction losses and the pump operating point; sem IV, CE25C12).
// Contract: docs/JOURNEYS.md. Engineering nodes are ENG.fluids.*; the school maths underneath reuses the school
// engine's ids (premsethutmc/openpath main 62b17d3f, content/mathematics/curriculum.v1.json) with school: true.
// `requires` = mandatory prerequisites; `support` = useful, never a gate; `items` = generator id in content/items/fluids.mjs.
const M = (id, title, items) => ({ id, title, school: true, learnUrl: null, requires: [], support: [], items });

export const NODES = [
  // ---- school maths (ids from the school engine) ----
  M('MATH.measurement.unit-conversions', 'Convert common metric units (mm ↔ m, L/s ↔ m³/s)', 'fluids.math.units'),
  M('MATH.measurement.circle-area', 'Calculate circle area from a diameter', 'fluids.math.circle-area'),
  M('MATH.number.square-roots', 'Find squares and square roots', 'fluids.math.squares'),
  M('MATH.number.ratio', 'Represent and simplify ratios', 'fluids.math.ratio'),
  M('MATH.number.proportion', 'Solve direct proportions', 'fluids.math.proportion'),
  M('MATH.number.scientific-notation', 'Use scientific notation', 'fluids.math.sci'),
  M('MATH.algebra.quadratics', 'Solve quadratic equations (where two curves meet)', 'fluids.math.intersect'),

  // ---- fluid mechanics ----
  { id: 'ENG.fluids.flow-rate', title: 'Flow rate and mean velocity (Q = A·V)',
    requires: ['MATH.measurement.unit-conversions', 'MATH.measurement.circle-area'], support: [], items: 'fluids.flow-rate' },
  { id: 'ENG.fluids.continuity', title: 'Continuity: the same flow through every section',
    requires: ['ENG.fluids.flow-rate', 'MATH.number.ratio', 'MATH.number.square-roots'], support: [], items: 'fluids.continuity' },
  { id: 'ENG.fluids.energy-equation', title: 'Energy equation with losses (pressure, elevation and velocity head)',
    requires: ['ENG.fluids.flow-rate', 'MATH.number.square-roots'], support: ['ENG.fluids.continuity'], items: 'fluids.energy' },
  { id: 'ENG.fluids.reynolds', title: 'Reynolds number and flow regime',
    requires: ['ENG.fluids.flow-rate', 'MATH.number.scientific-notation'], support: [], items: 'fluids.reynolds' },
  { id: 'ENG.fluids.relative-roughness', title: 'Relative roughness (ε/D)',
    requires: ['MATH.measurement.unit-conversions', 'MATH.number.ratio'], support: [], items: 'fluids.roughness' },
  { id: 'ENG.fluids.friction-factor', title: 'Darcy friction factor (laminar 64/Re; turbulent Colebrook–White)',
    requires: ['ENG.fluids.reynolds', 'ENG.fluids.relative-roughness'], support: [], items: 'fluids.friction-factor' },
  { id: 'ENG.fluids.darcy-weisbach', title: 'Pipe friction head loss (Darcy–Weisbach)',
    requires: ['ENG.fluids.friction-factor', 'ENG.fluids.energy-equation', 'MATH.number.square-roots'], support: ['MATH.number.proportion'], items: 'fluids.head-loss' },
  { id: 'ENG.fluids.minor-losses', title: 'Fitting and valve losses (K · V²/2g)',
    requires: ['ENG.fluids.flow-rate', 'MATH.number.square-roots'], support: ['ENG.fluids.energy-equation'], items: 'fluids.minor-loss' },
  { id: 'ENG.fluids.system-curve', title: 'System curve: static head plus losses ∝ Q²',
    requires: ['ENG.fluids.darcy-weisbach', 'ENG.fluids.minor-losses', 'MATH.number.proportion'], support: [], items: 'fluids.system-curve' },
  { id: 'ENG.fluids.operating-point', title: 'Pump curve and operating point',
    requires: ['ENG.fluids.system-curve', 'MATH.algebra.quadratics'], support: [], items: 'fluids.operating-point' },
  { id: 'ENG.fluids.shaft-power', title: 'Pump shaft power (P = ρgQH/η) and the motor',
    requires: ['ENG.fluids.flow-rate', 'MATH.measurement.unit-conversions'], support: ['ENG.fluids.operating-point'], items: 'fluids.shaft-power' },
  { id: 'ENG.fluids.npsh', title: 'NPSH available and the cavitation margin',
    requires: ['ENG.fluids.energy-equation'], support: ['ENG.fluids.darcy-weisbach'], items: 'fluids.npsh' },
];
