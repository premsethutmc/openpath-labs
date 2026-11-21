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
  const items = [], th = theta * Math.PI / 180;
  const has = id => !o.parts || o.parts.has(id);
  const glowOf = id => (o.flash && o.flash.id === id ? o.flash.amount : 0);
  const add = (shape, m, color, extra = {}) => items.push({ shape, m, color, ...extra });
  const part = (id, shape, m, color, extra = {}) => { if (has(id)) add(shape, m, color, { ...extra, glow: (extra.glow || 0) + glowOf(id) }); };
  // crankshaft and its bearings
  for (let k = 0; k <= 4; k++) {
    const x = (k - 2) * pitch;
    part('crank', 'cyl', cylX(x, 0, 0, 2.25, 2.4), STEEL, { shine: 0.6 });
    part('mainShells', 'cyl', cylX(x, 0, 0, 2.55, 1.9), o.regime ? [...REGIME[o.regime].slice(0, 3), 0.75] : [0.8, 0.6, 0.2, has('crank') ? 0.6 : 1]);
  }
  part('crank', 'cyl', cylX(-21.8, 0, 0, 9.5, 1.6), DARK, { shine: 0.4 });           // flywheel
  part('crank', 'cyl', cylX(20.5, 0, 0, 4.2, 2.2), DARK);                            // pulley
  for (let i = 0; i < 4; i++) {
    const phi = th + THROW[i], x = X(i), py = r * Math.cos(phi), pz = r * Math.sin(phi);
    part('crank', 'cyl', cylX(x, py, pz, 2.0, 2.0), STEEL, { shine: 0.6 });         // crank pin
    part('rodShells', 'cyl', cylX(x, py, pz, 2.25, 1.6), [0.8, 0.6, 0.2, 0.7]);
    for (const dx of [-1.45, 1.45]) {
      part('crank', 'box', box(x + dx, (r / 2) * Math.cos(phi), (r / 2) * Math.sin(phi), 0.9, r + 4.6, 4.6, phi), FORGED);
      part('crank', 'box', box(x + dx, -2.6 * Math.cos(phi), -2.6 * Math.sin(phi), 0.9, 3.2, 7.2, phi), FORGED); // counterweight
    }
    // connecting rod
    const yp = pistonY(phi), dy = yp - py, dz = -pz, ang = Math.atan2(dz, dy);
    part('pistons', 'box', box(x, (py + yp) / 2, pz / 2, 1.5, Math.hypot(dy, dz), 1.1, ang), ROD, { shine: 0.5 });
    // piston and rings (rings sit on the bench beside the block until the pistons go in)
    part('pistons', 'cyl', cylY(x, yp + 1.6, 0, bore / 2 - 0.08, 5.0), PISTON, { shine: 0.7 });
    if (has('rings')) for (const ry of [3.2, 3.7, 4.2]) add('cyl', has('pistons') ? cylY(x, yp + ry, 0, bore / 2 - 0.02, 0.18) : cylY(x, -20 + ry, 14, bore / 2 - 0.02, 0.18), DARK, { glow: glowOf('rings') });
    // combustion glow during the first part of the power stroke
    const phase = ((theta - ENGINE.firing[i]) % 720 + 720) % 720;
    const top = yp + 4.1;
    if (o.running && phase < 70 && has('head')) {
      const f = 1 - phase / 70, k = o.knock && phase > 8 && phase < 40;
      add('cyl', cylY(x, (top + DECK) / 2, 0, bore / 2 - 0.15, Math.max(DECK - top, 0.2)), k ? [1, 1, 1, 0.85] : [1, 0.55 + 0.3 * f, 0.15, 0.25 + 0.45 * f], { glow: k ? 2 : 1.2 * f });
      if (k) add('cyl', cylY(x, top + 0.3, 0, bore / 2 - 0.05, 0.4), [1, 0.15, 0.1, 0.9], { glow: 1.5 });
    }
    // cylinder liner (see-through) so the piston can be watched inside its bore
    add('cyl', cylY(x, (r + l - 2 + DECK) / 2 - 3, 0, bore / 2 + 0.25, DECK - (l - r) + 2), [0.75, 0.82, 0.9, 0.2]);
    // valves: two inlet (blue) and two exhaust (rust) per cylinder, opened by the cam; air streams in while the inlet is open
    if (o.valves && has('head')) {
      const ph = ((theta - ENGINE.firing[i]) % 720 + 720) % 720;
      const li = o.valves.intakeLift(ph, o.valves.cam) / 10, le = o.valves.exhaustLift(ph, o.valves.cam) / 10;
      const hit = o.valves.crash && (li > 0 || le > 0) && (ph > 330 && ph < 390);
      for (const dx of [-1.6, 1.6]) {
        add('cyl', cylY(x + dx, DECK - li, -1.7, 1.15, 0.22), hit ? hex('#ff2a1a') : hex('#6fa8dc'), { shine: 0.6, glow: hit ? 0.8 : 0 });
        add('cyl', cylY(x + dx, DECK - li + 2.2, -1.7, 0.25, 4.2), hex('#8a97a3'));
        add('cyl', cylY(x + dx, DECK - le, 1.7, 1.0, 0.22), hit ? hex('#ff2a1a') : hex('#c0703b'), { shine: 0.6, glow: hit ? 0.8 : 0 });
        add('cyl', cylY(x + dx, DECK - le + 2.2, 1.7, 0.25, 4.2), hex('#8a97a3'));
      }
      if (o.running && li > 0.05) for (let k = 0; k < 4; k++) {
        const u = ((k / 4 + (theta % 60) / 60) % 1);
        add('box', box(x + (k % 2 ? 1 : -1) * 1.2, DECK + 3 - u * 5.5, -4.5 + u * 3.6, 0.35, 0.35, 0.35), [0.75, 0.88, 1, 0.85], { glow: 0.8 });
      }
    }
    // spark plug
    part('head', 'cyl', cylY(x, DECK + 5.8, 0, 0.55, 2.4), hex('#e8e2d6'));
  }
  // oil system: sump, oil, pickup, gallery with the filled portion in oil colour
  const oil = hex(o.oilColor || '#c98a22');
  part('oil', 'box', box(0, -12 + 3.2 * o.oilLevel, 0, 33.5, 6.4 * o.oilLevel, 13.5), oil, { shine: 0.9 });
  part('pump', 'cyl', cylY(6, -5, 0, 0.6, 12), DARK);
  part('pump', 'box', box(18.5, -2.5, -2, 3, 4, 4), hex('#5a6470'));
  const galleryY = -3.2, gz = -6.2, L = 38, fill = Math.max(0, Math.min(1, o.galleryFill ?? 1));
  add('cyl', cylX(0, galleryY, gz, 0.75, L), [0.25, 0.28, 0.3, 0.35]);
  if (fill > 0.01 && has('oil')) add('cyl', cylX(-L / 2 + (L * fill) / 2, galleryY, gz, 0.62, L * fill), oil, { glow: 0.15 });
  if (fill > 0.01 && o.flow > 0 && has('oil')) for (let k = 0; k < 10; k++) {
    const u = ((k / 10 + (o.flowPhase || 0)) % 1) * fill;
    add('box', box(-L / 2 + u * L, galleryY, gz, 0.7, 0.35, 0.35), hex('#fff3c8'), { glow: 0.6 });
  }
  // turbocharger on the exhaust side: snail housing with a spinning wheel
  if (o.turbo && has('head')) {
    add('cyl', m4.chain(m4.translate(-6, DECK - 2, 11), m4.rotX(Math.PI / 2), m4.scale(4.2, 3.2, 4.2)), hex('#7c6a58'), { shine: 0.5 });
    for (let k = 0; k < 6; k++) add('box', m4.chain(m4.translate(-6, DECK - 2, 12.8), m4.rotZ(th * 3 + k * Math.PI / 3), m4.scale(0.35, 3.4, 0.3)), hex('#c9cfd6'));
    add('cyl', cylX(-1, DECK - 2, 8.5, 0.9, 10), hex('#7c6a58'));
  }
  // block, head and sump shells (see-through cutaway)
  const heat = o.heat || 0, frost = o.frost || 0;
  const shell = [0.6 + 0.35 * heat, 0.66 - 0.1 * heat, 0.72 - 0.25 * heat];
  add('box', box(0, (DECK + 5.5) / 2, 0, 36, DECK - 5.5, 10.6), [...shell, 0.13 + 0.05 * frost], { glow: 0.25 * heat });
  part('head', 'box', box(0, DECK + 2.6, 0, 36, 5.2, 11), [0.42, 0.47, 0.52, 0.26]);
  part('sump', 'box', box(0, -7.5, 0, 34.5, 15, 14.2), [0.5, 0.55, 0.6, 0.12 + 0.3 * glowOf('sump')]);
  if (frost > 0) add('box', box(0, 7, 0, 38.5, 39, 16.5), [0.93, 0.97, 1, 0.12 * frost]);
  return items;
}

export const SCENE_TARGET = [0, 6, 0];
