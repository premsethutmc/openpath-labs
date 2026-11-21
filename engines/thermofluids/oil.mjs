// Engine oil properties. Units: °C, cSt (mm²/s) for kinematic viscosity, mPa·s (cP) for dynamic viscosity.
//
// Confidence:
//  - 0–150 °C: ASTM D341 (Walther) fit through each oil's 40 °C and 100 °C viscosities — RELIABLE (standard method).
//  - below 0 °C: multigrade oils contain polymers, so the Walther line over-predicts. We bend the curve so the oil
//    sits at 80 % of its SAE J300 cold-cranking (CCS) limit at that grade's test temperature — APPROXIMATE.
//  - below the pour point the oil stops flowing (treated as gelled) — APPROXIMATE threshold.

export const OILS = {
  '0W-20': { name: '0W-20', kv40: 44, kv100: 8.5, pour: -45, ccs: { T: -35, limit: 6200 }, mrvT: -40 },
  '5W-30': { name: '5W-30', kv40: 64, kv100: 11, pour: -39, ccs: { T: -30, limit: 6600 }, mrvT: -35 },
  '10W-40': { name: '10W-40', kv40: 95, kv100: 14.5, pour: -33, ccs: { T: -25, limit: 7000 }, mrvT: -30 },
  '20W-50': { name: '20W-50', kv40: 165, kv100: 19, pour: -21, ccs: { T: -15, limit: 9500 }, mrvT: -20 },
  'SAE 40': { name: 'SAE 40 (single grade)', kv40: 140, kv100: 14.5, pour: -15, ccs: null, mrvT: null },
};

const K = T => T + 273.15;
const lg = Math.log10;

// Walther / ASTM D341: log10(log10(ν + 0.7)) = A − B·log10(T_K)
export function waltherFit(kv40, kv100) {
  const y1 = lg(lg(kv40 + 0.7)), y2 = lg(lg(kv100 + 0.7)), x1 = lg(K(40)), x2 = lg(K(100));
  const B = (y1 - y2) / (x2 - x1);
  return { A: y1 + B * x1, B };
}
export function waltherNu({ A, B }, T) { return 10 ** (10 ** (A - B * lg(K(T)))) - 0.7; }

export const density = T => 0.86 * (1 - 0.00065 * (T - 15)); // g/cm³, typical mineral/synthetic base

// Blend two oils by mass fraction using the Refutas viscosity blending number (ASTM D7152 style).
const vbn = nu => 14.534 * Math.log(Math.log(nu + 0.8)) + 10.975;
const fromVbn = v => Math.exp(Math.exp((v - 10.975) / 14.534)) - 0.8;
export function blend(a, b, fractionA) {
  const f = Math.max(0, Math.min(1, fractionA));
  const mix = (x, y) => fromVbn(f * vbn(x) + (1 - f) * vbn(y));
  const W = (oa, ob, key) => oa[key] === null || ob[key] === null ? null : f * oa[key] + (1 - f) * ob[key];
  // Pour point and cold limits of a blend are not linear; a weighted value is a labelled approximation.
  return {
    name: `Blend ${Math.round(f * 100)}% ${a.name} + ${Math.round((1 - f) * 100)}% ${b.name}`,
    kv40: mix(a.kv40, b.kv40), kv100: mix(a.kv100, b.kv100),
    pour: Math.max(a.pour, b.pour) * 0.5 + (f * a.pour + (1 - f) * b.pour) * 0.5,
    ccs: a.ccs && b.ccs ? { T: f * a.ccs.T + (1 - f) * b.ccs.T, limit: f * a.ccs.limit + (1 - f) * b.ccs.limit } : null,
    mrvT: W(a, b, 'mrvT'), blended: true,
  };
}

// Aged oil: thickening from oxidation and soot is an ASSUMPTION the learner can see and change.
export const ageOil = (oil, factor) => (factor === 1 ? oil : { ...oil, name: `${oil.name}, aged ×${factor.toFixed(2)}`, kv40: oil.kv40 * factor, kv100: oil.kv100 * factor, aged: factor });

export function viscosity(oil, T) {
  const fit = waltherFit(oil.kv40, oil.kv100);
  let nu = waltherNu(fit, T);
  let band = 'reliable';
  if (T < 0 && oil.ccs) {
    const target = 0.8 * oil.ccs.limit * (oil.aged || 1) / density(oil.ccs.T); // cSt at CCS temperature
    const walther = waltherNu(fit, oil.ccs.T);
    const f = target / walther, w = -T / -oil.ccs.T; // 0 at 0 °C, 1 at the CCS temperature
    nu *= f ** w;
    band = 'approximate';
  } else if (T < 0) band = 'approximate';
  if (T > 150) band = 'approximate';
  const gelled = T < oil.pour;
  const mu = nu * density(T); // mPa·s
  return { nu, mu, gelled, band };
}
