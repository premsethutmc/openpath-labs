// 3D model of the reference inline-four, built from boxes and cylinders. Units: cm. Crank axis = x.
import { m4, hex } from '../core/gl3d.mjs';
import { ENGINE } from '../engines/thermofluids/engine.mjs';

const r = ENGINE.stroke * 50, l = ENGINE.rod * 100, bore = ENGINE.bore * 100, pitch = 8.6;
const X = i => (i - 1.5) * pitch;
const THROW = [0, Math.PI, Math.PI, 0];
const DECK = r + l + 3.4; // top of the bore (piston crown at TDC sits just below)

const cylX = (x, y, z, rad, len) => m4.chain(m4.translate(x, y, z), m4.rotZ(Math.PI / 2), m4.scale(rad, len, rad));
const cylY = (x, y, z, rad, len) => m4.chain(m4.translate(x, y, z), m4.scale(rad, len, rad));
const box = (x, y, z, sx, sy, sz, ax = 0) => m4.chain(m4.translate(x, y, z), m4.rotX(ax), m4.scale(sx, sy, sz));

const STEEL = hex('#9aa6b2'), DARK = hex('#46505a'), FORGED = hex('#7b858f'), PISTON = hex('#c9cfd6'), ROD = hex('#8e99a5');
const REGIME = { 'full film': hex('#3fae6a'), mixed: hex('#e6a522'), boundary: hex('#d7261e') };

export function pistonY(phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  return r * c + Math.sqrt(l * l - r * r * s * s);
}

// theta: crank angle of cylinder 1 in degrees within the 720° cycle.
export function engineItems(theta, o) {
  const items = [], add = (shape, m, color, extra = {}) => items.push({ shape, m, color, ...extra });
  const th = theta * Math.PI / 180;
  // crankshaft
  for (let k = 0; k <= 4; k++) {
    const x = (k - 2) * pitch;
    add('cyl', cylX(x, 0, 0, 2.25, 2.4), STEEL, { shine: 0.6 });
    add('cyl', cylX(x, 0, 0, 2.55, 1.9), o.regime ? [...REGIME[o.regime].slice(0, 3), 0.75] : [0.8, 0.6, 0.2, 0.6]);
  }
  add('cyl', cylX(-21.8, 0, 0, 9.5, 1.6), DARK, { shine: 0.4 });           // flywheel
  add('cyl', cylX(20.5, 0, 0, 4.2, 2.2), DARK);                            // pulley
  for (let i = 0; i < 4; i++) {
    const phi = th + THROW[i], x = X(i), py = r * Math.cos(phi), pz = r * Math.sin(phi);
    add('cyl', cylX(x, py, pz, 2.0, 2.0), STEEL, { shine: 0.6 });         // crank pin
    for (const dx of [-1.45, 1.45]) {
      add('box', box(x + dx, (r / 2) * Math.cos(phi), (r / 2) * Math.sin(phi), 0.9, r + 4.6, 4.6, phi), FORGED);
      add('box', box(x + dx, -2.6 * Math.cos(phi), -2.6 * Math.sin(phi), 0.9, 3.2, 7.2, phi), FORGED); // counterweight
    }
    // connecting rod
    const yp = pistonY(phi), dy = yp - py, dz = -pz, ang = Math.atan2(dz, dy);
    add('box', box(x, (py + yp) / 2, pz / 2, 1.5, Math.hypot(dy, dz), 1.1, ang), ROD, { shine: 0.5 });
    // piston and rings
    add('cyl', cylY(x, yp + 1.6, 0, bore / 2 - 0.08, 5.0), PISTON, { shine: 0.7 });
    for (const ry of [3.2, 3.7, 4.2]) add('cyl', cylY(x, yp + ry, 0, bore / 2 - 0.02, 0.18), DARK);
    // combustion glow during the first part of the power stroke
    const phase = ((theta - ENGINE.firing[i]) % 720 + 720) % 720;
    const top = yp + 4.1;
    if (o.running && phase < 70) {
      const f = 1 - phase / 70;
      add('cyl', cylY(x, (top + DECK) / 2, 0, bore / 2 - 0.15, Math.max(DECK - top, 0.2)), [1, 0.55 + 0.3 * f, 0.15, 0.25 + 0.45 * f], { glow: 1.2 * f });
    }
    // cylinder liner (see-through) so the piston can be watched inside its bore
    add('cyl', cylY(x, (r + l - 2 + DECK) / 2 - 3, 0, bore / 2 + 0.25, DECK - (l - r) + 2), [0.75, 0.82, 0.9, 0.2]);
    // spark plug
    add('cyl', cylY(x, DECK + 5.8, 0, 0.55, 2.4), hex('#e8e2d6'));
  }
  // oil system: sump, oil, pickup, gallery with the filled portion in oil colour
  const oil = hex(o.oilColor || '#c98a22');
  add('box', box(0, -12 + 3.2 * o.oilLevel, 0, 33.5, 6.4 * o.oilLevel, 13.5), oil, { shine: 0.9 });
  add('cyl', cylY(6, -5, 0, 0.6, 12), DARK);
  const galleryY = -3.2, gz = -6.2, L = 38, fill = Math.max(0, Math.min(1, o.galleryFill ?? 1));
  add('cyl', cylX(0, galleryY, gz, 0.75, L), [0.25, 0.28, 0.3, 0.35]);
  if (fill > 0.01) add('cyl', cylX(-L / 2 + (L * fill) / 2, galleryY, gz, 0.62, L * fill), oil, { glow: 0.15 });
  if (fill > 0.01 && o.flow > 0) for (let k = 0; k < 10; k++) {
    const u = ((k / 10 + (o.flowPhase || 0)) % 1) * fill;
    add('box', box(-L / 2 + u * L, galleryY, gz, 0.7, 0.35, 0.35), hex('#fff3c8'), { glow: 0.6 });
  }
  // block, head and sump shells (see-through cutaway)
  const heat = o.heat || 0, frost = o.frost || 0;
  const shell = [0.6 + 0.35 * heat, 0.66 - 0.1 * heat, 0.72 - 0.25 * heat];
  add('box', box(0, (DECK + 5.5) / 2, 0, 36, DECK - 5.5, 10.6), [...shell, 0.13 + 0.05 * frost], { glow: 0.25 * heat });
  add('box', box(0, DECK + 2.6, 0, 36, 5.2, 11), [0.42, 0.47, 0.52, 0.26]);
  add('box', box(0, -7.5, 0, 34.5, 15, 14.2), [0.5, 0.55, 0.6, 0.12]);
  if (frost > 0) add('box', box(0, 7, 0, 38.5, 39, 16.5), [0.93, 0.97, 1, 0.12 * frost]);
  return items;
}

export const SCENE_TARGET = [0, 6, 0];
