// Shared material database. Units: MPa (N/mm²), kg/m³, 1/°C.
// Typical room-temperature values from standard engineering references; not a specific grade certificate.
// `strength` fields: yield for ductile metals; for brittle/natural materials tension and compression limits.

export const MATERIALS = {
  steel: {
    id: 'steel', name: 'Structural steel', colour: '#7d8a96',
    E: 200000, G: 77000, density: 7850, alpha: 12e-6,
    yield: 250, ultimate: 410, ductile: true,
    coldBrittleBelow: -20, // ordinary structural steels lose toughness in deep cold (illustrative threshold)
    source: 'Typical S275 / IS 2062 E250 values', confidence: 'high',
  },
  aluminium: {
    id: 'aluminium', name: 'Aluminium 6061-T6', colour: '#b9c3cc',
    E: 69000, G: 26000, density: 2700, alpha: 23e-6,
    yield: 276, ultimate: 310, ductile: true,
    source: 'Typical 6061-T6 values', confidence: 'high',
  },
  timber: {
    id: 'timber', name: 'Timber (pine, along grain)', colour: '#b98b53',
    E: 11000, G: 700, density: 500, alpha: 5e-6,
    tension: 40, compression: 30, ductile: false,
    source: 'Typical softwood bending/compression strengths', confidence: 'medium',
  },
  bamboo: {
    id: 'bamboo', name: 'Bamboo', colour: '#a7a85b',
    E: 18000, G: 900, density: 700, alpha: 4e-6,
    tension: 120, compression: 50, ductile: false,
    source: 'Typical culm values (varies widely by species)', confidence: 'low',
  },
  castIron: {
    id: 'castIron', name: 'Grey cast iron', colour: '#5d6166',
    E: 100000, G: 40000, density: 7200, alpha: 11e-6,
    tension: 200, compression: 700, ductile: false,
    source: 'Typical grey iron (e.g. FG 200)', confidence: 'medium',
  },
};

// Allowable stress limits (before any safety factor) for tension and compression.
export function limits(m) {
  return m.ductile ? { tension: m.yield, compression: m.yield } : { tension: m.tension, compression: m.compression };
}

export const failureWord = (m, sign) => m.ductile ? 'yields' : sign > 0 ? 'cracks in tension' : 'crushes';
