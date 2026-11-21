// Scenarios are data that transform a structure: temperature, gravity and extra loads.
// Engines never special-case a scenario. Loads in N and N/mm; temperatures in °C.
// Code-like values are order-of-magnitude references and are labelled illustrative.

export const SCENARIOS = {
  normal: { id: 'normal', name: 'Normal day', icon: '☀', temperature: 27, gravity: 1, note: 'Room temperature, Earth gravity.' },
  crowd: {
    id: 'crowd', name: 'Festival crowd', icon: '👥', temperature: 30, gravity: 1,
    deckPressure: 0.005, // 5 kN/m² = 0.005 N/mm² on walkable decks
    note: 'Packed crowd ≈ 5 kN per square metre of deck (typical code value for footbridges).',
  },
  snow: {
    id: 'snow', name: 'Heavy snow', icon: '❄', temperature: -10, gravity: 1,
    deckPressure: 0.0015, note: 'Snow ≈ 1.5 kN per square metre (illustrative).',
  },
  arctic: {
    id: 'arctic', name: 'Arctic cold', icon: '🧊', temperature: -35, gravity: 1,
    note: '−35 °C. Fixed ends try to stop the steel from shrinking; ordinary steel also becomes less tough.',
  },
  desert: {
    id: 'desert', name: 'Desert heat', icon: '🔥', temperature: 55, gravity: 1,
    note: '+55 °C in the sun. Members try to expand.',
  },
  wind: {
    id: 'wind', name: 'Cyclone wind', icon: '🌀', temperature: 28, gravity: 1,
    sidePressure: 0.0015, note: 'Strong wind ≈ 1.5 kN per square metre on exposed faces (illustrative).',
  },
  moon: { id: 'moon', name: 'On the Moon', icon: '🌙', temperature: 27, gravity: 0.165, note: 'Gravity is 1/6 of Earth’s. Everything weighs less — including the structure.' },
};

export const REFERENCE_TEMPERATURE = 27; // structures are assumed built (stress-free) at this temperature

// Returns { loads, temperatureChange, gravity } contributions from a scenario for a structure.
// structure.deckWidth (mm) converts area pressure to line load on members tagged 'deck';
// structure.sideHeight (mm) converts wind pressure to sideways line load on members tagged 'exposed'.
export function applyScenario(structure, scenario) {
  const memberLoads = [];
  structure.members.forEach((m, index) => {
    if (scenario.deckPressure && m.tags?.includes('deck'))
      memberLoads.push({ member: index, wx: 0, wy: -scenario.deckPressure * (structure.deckWidth || 1000), source: scenario.id });
    if (scenario.sidePressure && m.tags?.includes('exposed'))
      memberLoads.push({ member: index, wx: scenario.sidePressure * (structure.sideHeight || 300), wy: 0, source: scenario.id });
  });
  return { memberLoads, temperatureChange: scenario.temperature - REFERENCE_TEMPERATURE, gravity: scenario.gravity };
}
