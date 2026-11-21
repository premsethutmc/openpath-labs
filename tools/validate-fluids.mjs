// Schäfer & Turek (1996) benchmark 2D-2: cylinder in a channel, Re = 100. Reference: St 0.295–0.305,
// Cd,max 3.22–3.24, Cl,max 0.99–1.01. Slow (~1 min); results are recorded in docs/VALIDATION.md.
import { Tunnel, shapes } from '../engines/fluids/lbm.mjs';
const D = 20, U = 0.04, nu = U * D / 100, nx = 22 * D, ny = Math.round(4.1 * D) + 2;
const t = new Tunnel(nx, ny, { nu, u0: U, walls: 'walls', profile: 'parabolic' });
t.paint(shapes.circle(2 * D, 0.5 + 2 * D, D / 2), 2);
const per = D / U; t.step(Math.round(30 * per));
const cd = [], cl = [];
for (let k = 0; k < Math.round(12 * per); k++) { t.step(1); cd.push(2 * t.fx / (U * U * D)); cl.push(2 * t.fy / (U * U * D)); }
const ups = []; for (let k = 1; k < cl.length; k++) if (cl[k - 1] < 0 && cl[k] >= 0) ups.push(k);
const St = D / ((ups.at(-1) - ups[0]) / (ups.length - 1) * U);
console.log(JSON.stringify({ D, St: +St.toFixed(4), cdMean: +(cd.reduce((a, b) => a + b) / cd.length).toFixed(3), cdMax: +Math.max(...cd).toFixed(3), clMax: +Math.max(...cl).toFixed(3) }));
