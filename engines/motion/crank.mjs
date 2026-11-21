// Slider-crank kinematics (exact). Units: m, rad, s. θ = 0 at top dead centre (TDC).
// r = crank radius (stroke / 2), l = connecting-rod length.

export function piston(theta, r, l) {
  const s = Math.sin(theta), c = Math.cos(theta), root = Math.sqrt(l * l - r * r * s * s);
  const x = r * c + root;                // crank centre → piston pin
  const disp = r + l - x;                 // distance down from TDC
  const dx = -r * s - (r * r * s * c) / root;                            // dx/dθ
  const ddx = -r * c - (r * r * (c * c - s * s)) / root - (r ** 4 * s * s * c * c) / root ** 3; // d²x/dθ²
  const beta = Math.asin((r * s) / l);    // rod angle
  return { x, disp, dDisp: -dx, ddDisp: -ddx, beta };
}

// Velocity (m/s) and acceleration (m/s²) of the piston at engine speed rpm.
export function pistonMotion(theta, r, l, rpm) {
  const w = (rpm * 2 * Math.PI) / 60, p = piston(theta, r, l);
  return { ...p, v: p.dDisp * w, a: p.ddDisp * w * w };
}

export const meanPistonSpeed = (stroke, rpm) => (2 * stroke * rpm) / 60;
