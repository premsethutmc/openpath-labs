// How the engine breathes: cam timing, valve lift, intake runner tuning, valve springs.
// Crank angle frame (720°): 0 = TDC firing, 180 BDC, 360 TDC overlap, 540 BDC, 720 TDC.
// References: Heywood, ICE Fundamentals ch. 6 (volumetric efficiency, Taylor's inlet Mach index Z).

import { ENGINE, cylinderVolume, swept } from './engine.mjs';
import { piston } from '../motion/crank.mjs';

export const CAMS = {
  economy: { id: 'economy', name: 'Economy', duration: 220, lift: 7, centre: 100, spring: 'standard' },
  stock: { id: 'stock', name: 'Stock', duration: 240, lift: 8, centre: 105, spring: 'standard' },
  sport: { id: 'sport', name: 'Sport', duration: 272, lift: 10.5, centre: 108, spring: 'standard' },
};
export const SPRINGS = { soft: { name: 'Soft', seat: 250, rate: 20 }, standard: { name: 'Standard', seat: 300, rate: 30 }, stiff: { name: 'Stiff', seat: 380, rate: 42 } }; // N, N/mm
export const VALVES = { count: 2, diameter: 0.026, exhaustDiameter: 0.023, massKg: 0.06, squishMm: 1.0, pocketMm: 1.6 };
export const DEFAULT_BREATHING = { cam: CAMS.stock, runner: 0.35 };

// Timing events (crank degrees in the 720° frame) for a cam with given duration and lobe centres.
export function timing(cam) {
  const ic = 360 + cam.centre, ec = 360 - cam.centre, half = cam.duration / 2;
  const t = { ivo: ic - half, ivc: ic + half, evo: ec - half, evc: ec + half };
  return { ...t, overlap: Math.max(0, t.evc - t.ivo), ivcABDC: t.ivc - 540, evoBBDC: 180 - t.evo };
}

// Valve lift (mm) at crank angle θ for a valve opening at `open` for `dur` degrees (1 − cos profile).
export function lift(theta, open, dur, L) {
  let x = ((theta - open) % 720 + 720) % 720;
  return x <= dur ? (L / 2) * (1 - Math.cos((2 * Math.PI * x) / dur)) : 0;
}
export const intakeLift = (theta, cam) => lift(theta, timing(cam).ivo, cam.duration, cam.lift);
export const exhaustLift = (theta, cam) => lift(theta, timing(cam).evo, cam.duration, cam.lift * 0.95);

// Discharge coefficient of a poppet valve rises with lift/diameter and saturates (≈0.55 above L/D ≈ 0.25).
const cd = (L, D) => 0.55 * Math.min(1, L / D / 0.25);
export function meanFlowCoefficient(cam, D = VALVES.diameter * 1000) {
  let s = 0; const n = 120;
  for (let k = 0; k < n; k++) s += cd((cam.lift / 2) * (1 - Math.cos((2 * Math.PI * (k + 0.5)) / n)), D);
  return (s / n) * Math.sqrt(cam.duration / 240);
}

// Taylor's inlet Mach index Z = (B² / (n·Dv²)) · Sp / (Ci·a). Volumetric efficiency falls steeply above Z ≈ 0.6.
export function machIndex(rpm, cam, e = ENGINE) {
  const Sp = 2 * e.stroke * rpm / 60, a = 350;
  return (e.bore ** 2 / (VALVES.count * VALVES.diameter ** 2)) * Sp / (meanFlowCoefficient(cam) * a);
}

// Helmholtz-resonator tuning of the intake runner (Engelman): N ≈ 60·f / 2. APPROXIMATE.
export function tunedRpm(runner, e = ENGINE) {
  const A = Math.PI / 4 * 0.034 ** 2, Veff = swept(e) / 2 * (e.cr + 1) / (e.cr - 1);
  const f = (350 / (2 * Math.PI)) * Math.sqrt(A / (runner * Veff));
  return (60 * f) / 2;
}

// Highest speed before the valve leaves the cam (float): spring force < valve-train mass × peak deceleration.
// Real cam ramps raise peak acceleration over a pure cosine; factor 1.8 is a labelled assumption.
export function floatRpm(cam, springKey = cam.spring) {
  const sp = SPRINGS[springKey], F = sp.seat + sp.rate * cam.lift;
  const D = (cam.duration * Math.PI) / 180, k = (cam.lift / 1000 / 2) * (2 * Math.PI / D) ** 2 * 1.8;
  const w = Math.sqrt(F / (VALVES.massKg * k));
  return (w * 60) / (2 * Math.PI);
}

// Smallest gap (mm) between a valve and the piston crown around the overlap TDC. RELIABLE geometry, assumed dimensions.
export function valveClearance(cam, e = ENGINE) {
  const r = e.stroke / 2; let min = Infinity, at = 360;
  for (let th = 300; th <= 420; th += 0.5) {
    const down = piston((th * Math.PI) / 180, r, e.rod).disp * 1000;
    const L = Math.max(intakeLift(th, cam), exhaustLift(th, cam));
    const gap = VALVES.squishMm + VALVES.pocketMm + down - L;
    if (gap < min) { min = gap; at = th; }
  }
  return { mm: min, at, contact: min < 0.3 };
}

// Volumetric efficiency at wide-open throttle. APPROXIMATE (teaching model, right trends):
//  - low speed: gas is pushed back out until the inlet valve closes → V(IVC)/V(BDC)
//  - high speed: inertia keeps filling → ≈1; the valve's flow capacity (Mach index) then limits it
//  - runner resonance adds a bump near the tuned speed; valve float collapses filling above float speed
export function volumetricEfficiency(rpm, br = DEFAULT_BREATHING, e = ENGINE) {
  const t = timing(br.cam);
  const low = cylinderVolume(((t.ivc % 720) * Math.PI) / 180, e) / cylinderVolume(Math.PI, e);
  const w = rpm * rpm / (rpm * rpm + 3200 * 3200);
  const timingVE = (1 - w) * low + w * 1.0;
  const Z = machIndex(rpm, br.cam, e);
  const flowVE = 1 / (1 + (Z / 0.85) ** 8);
  const ram = 0.07 * Math.exp(-(((rpm - tunedRpm(br.runner, e)) / 1400) ** 2));
  const fl = floatRpm(br.cam, br.spring || br.cam.spring);
  const floatLoss = rpm > fl ? Math.max(0.55, 1 - (rpm - fl) / 1500) : 1;
  const overlapLoss = 1 - 0.0012 * Math.max(0, t.overlap - 30) * Math.exp(-rpm / 1500); // exhaust backflow at low speed
  return { ve: 0.95 * timingVE * flowVE * (1 + ram) * floatLoss * overlapLoss, Z, timingVE, flowVE, ram, floating: rpm > fl, floatRpm: fl };
}

export const idleQuality = cam => { const o = timing(cam).overlap; return o <= 30 ? 'smooth' : o <= 55 ? 'slightly lumpy' : 'rough (lots of overlap)'; };
