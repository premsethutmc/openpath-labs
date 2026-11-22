// Competency graph: shafts, a small first set for Design of Machine Elements (sem V, Anna University R2025; the
// blueprint's eight-semester map, docs/CURRICULUM_MAP.md). Contract: docs/JOURNEYS.md → Competency graph.
// These nodes cover what the machine design bench (machine/) and the fluid line bench (pump shaft torque) compute:
// torque from power and speed, shear stress in a solid shaft, combined bending and torsion with a safety factor, and
// the first critical speed of a shaft carrying one disc. Generators: content/items/machine.mjs (formula-keyed, checked
// by hand in tests/machine-thermal-content.test.mjs). Prerequisites reuse existing nodes (school maths, statics, solids).
const node = (id, title, requires, support, items) => ({ id, title, requires, support, items });

export const NODES = [
  node('ENG.machine.torque-power', 'Torque from power and speed: T = P/ω, ω = 2πN/60 (Design of Machine Elements, sem V)',
    ['MATH.measurement.unit-conversions'], [], 'machine.torque'),
  node('ENG.machine.torsion-stress', 'Shear stress in a solid shaft under torque: τ = 16T/(πd³) (Design of Machine Elements, sem V)',
    ['MATH.number.exponents', 'MATH.measurement.unit-conversions'], ['ENG.machine.torque-power'], 'machine.torsion'),
  node('ENG.machine.combined-stress', 'Combined bending and torsion in a shaft: σ = 32M/(πd³), σ_eq = √(σ² + 3τ²), safety factor (Design of Machine Elements, sem V)',
    ['ENG.machine.torsion-stress', 'ENG.solids.bending-stress', 'ENG.solids.factor-of-safety'], [], 'machine.combined'),
  node('ENG.machine.critical-speed', 'First critical (whirling) speed of a shaft with one disc: N = (60/2π)·√(g/δ) (Design of Machine Elements, sem V; also ME25C09)',
    ['MATH.number.square-roots', 'MATH.measurement.unit-conversions'], ['ENG.solids.beam-stiffness'], 'machine.critical'),
];
