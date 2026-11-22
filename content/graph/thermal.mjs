// Competency graph: steady conduction and convection through a series path, a small first set for Heat and Mass
// Transfer (sem VI, Anna University R2025; the blueprint's eight-semester map, docs/CURRICULUM_MAP.md). Contract:
// docs/JOURNEYS.md → Competency graph. These nodes cover what the thermal bench (thermal/) computes along one heat
// path: a layer's conduction resistance, a surface's convection resistance, and the heat flow and interface
// temperatures of resistances in series. Generators: content/items/thermal.mjs (formula-keyed, checked by hand in
// tests/machine-thermal-content.test.mjs). Fins, radiation, critical insulation radius and transients are not covered.
const node = (id, title, requires, support, items) => ({ id, title, requires, support, items });

export const NODES = [
  node('ENG.thermal.conduction-resistance', 'Conduction resistance of a plane layer: R = L/(kA) (Heat and Mass Transfer, sem VI)',
    ['MATH.measurement.unit-conversions'], ['MATH.algebra.inverse-proportion'], 'thermal.conduction'),
  node('ENG.thermal.convection-resistance', 'Convection resistance of a surface: R = 1/(hA) (Heat and Mass Transfer, sem VI)',
    ['MATH.measurement.unit-conversions'], ['MATH.algebra.inverse-proportion'], 'thermal.convection'),
  node('ENG.thermal.series-resistance', 'Resistances in series: Q = ΔT/ΣR and the temperature at each interface (Heat and Mass Transfer, sem VI)',
    ['ENG.thermal.conduction-resistance', 'ENG.thermal.convection-resistance'], [], 'thermal.series'),
];
