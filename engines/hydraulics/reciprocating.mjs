// Reciprocating (piston) pump — the textbook model (Bansal ch. 20, Modi & Seth): crank-driven piston in simple
// harmonic motion, rigid water columns in the suction and delivery pipes (acceleration head), Darcy friction with a
// constant friction factor, optional air vessels next to the cylinder (uniform flow beyond them), and separation
// when the absolute pressure in the cylinder falls below ~2.5 m of water.
import { G, water, atmPressure, friction, MATERIALS } from './hydraulics.mjs';

export const SEPARATION_HEAD = 2.5;   // m of water absolute (textbook value for water with dissolved air)
export const STOCK_RECIP = {
  D: 0.1, stroke: 0.2, rpm: 60, acting: 'single', Cd: 0.95,
  hs: 3, hd: 18,                                   // suction lift and delivery height (m)
  suction: { L: 4, d: 0.075 }, delivery: { L: 25, d: 0.075 }, material: 'gi',
  vesselS: false, vesselD: false, temp: 30, altitude: 0,
};

export function recip(p = STOCK_RECIP) {
  const w = water(p.temp), Hatm = atmPressure(p.altitude) / (w.rho * G);
  const A = Math.PI * p.D ** 2 / 4, r = p.stroke / 2, om = 2 * Math.PI * p.rpm / 60, k = p.acting === 'double' ? 2 : 1;
  const Qth = k * A * p.stroke * p.rpm / 60, Q = p.Cd * Qth;
  const pipe = (pp, vessel) => {
    const a = Math.PI * pp.d ** 2 / 4, ratio = A / a, vmax = ratio * om * r, vmean = Qth / a;
    const { f } = friction(Math.max(vmean, 1e-6) * pp.d / w.nu, MATERIALS[p.material].eps / pp.d);   // f fixed at the mean velocity
    const haMax = vessel ? 0 : pp.L / G * ratio * om * om * r;
    const hfMax = f * pp.L / pp.d * vmax ** 2 / (2 * G), hfVessel = f * pp.L / pp.d * vmean ** 2 / (2 * G);
    return { a, ratio, vmax, vmean, f, haMax, hfMax, hfVessel, vessel };
  };
  const s = pipe(p.suction, p.vesselS), d = pipe(p.delivery, p.vesselD);
  // cylinder pressure head (gauge, m of water) at crank angle θ: suction stroke 0…π, delivery stroke π…2π
  const head = th => {
    if (th <= Math.PI) {
      const ha = s.vessel ? 0 : s.haMax * Math.cos(th), hf = s.vessel ? s.hfVessel : s.hfMax * Math.sin(th) ** 2;
      return -(p.hs + ha + hf);
    }
    const t = th - Math.PI, ha = d.vessel ? 0 : d.haMax * Math.cos(t), hf = d.vessel ? d.hfVessel : d.hfMax * Math.sin(t) ** 2;
    return p.hd + ha + hf;
  };
  const diagram = [];
  for (let i = 0; i <= 360; i += 3) { const th = i * Math.PI / 180, x = r * (1 - Math.cos(th)); diagram.push({ th: i, x, h: head(th) }); }
  // work per cycle per side = A ρ g ∮ h dx  (numerical), power for all sides
  let loop = 0; const n = 1440, dth = 2 * Math.PI / n;
  for (let i = 0; i < n; i++) { const th = (i + 0.5) * dth, dx = r * Math.abs(Math.sin(th)) * dth; loop += (th <= Math.PI ? -head(th) : head(th)) * dx; }
  const power = k * A * w.rho * G * loop * p.rpm / 60;
  const minAbsSuction = Hatm - p.hs - s.haMax, minAbsDelivery = Hatm + p.hd - d.haMax;
  // highest speed before separation (acceleration head ∝ N²)
  const nMax = (h0, ha) => (ha > 0 ? p.rpm * Math.sqrt(Math.max(0, h0 - SEPARATION_HEAD) / ha) : Infinity);
  const sepRpm = Math.min(nMax(Hatm - p.hs, s.haMax), nMax(Hatm + p.hd, d.haMax));
  return {
    Qth, Q, slip: 1 - p.Cd, power, Hatm, suction: s, delivery: d, diagram, head,
    minAbsSuction, minAbsDelivery, separation: minAbsSuction < SEPARATION_HEAD || minAbsDelivery < SEPARATION_HEAD,
    separationWhere: minAbsSuction < SEPARATION_HEAD ? 'suction' : minAbsDelivery < SEPARATION_HEAD ? 'delivery' : null,
    sepRpm, A, r, om, k, water: w,
    powerFormula: w.rho * G * Qth * (p.hs + p.hd + (p.vesselS ? s.hfVessel : 2 / 3 * s.hfMax) + (p.vesselD ? d.hfVessel : 2 / 3 * d.hfMax)),
  };
}
