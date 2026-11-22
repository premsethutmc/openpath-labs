// Independent hand calculations for Journey 2 (pipe sizing), used by tests/journey-pipe-visible.e2e.mjs.
// Written from textbook formulas only: nothing here imports an engine, an item generator or an answer key.
// solveItem(prompt, options) reads a question exactly as the page shows it and answers it the way a student would.
export const G = 9.81;
export const area = D => Math.PI * D * D / 4;

// Darcy friction factor: laminar 64/Re; turbulent by Colebrook–White, iterated from Swamee–Jain.
export function swameeJain(Re, rr) { return 0.25 / Math.log10(rr / 3.7 + 5.74 / Re ** 0.9) ** 2; }
export function colebrook(Re, rr) {
  let f = swameeJain(Re, rr);
  for (let i = 0; i < 50; i++) { const g = -2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(f))); f = 1 / (g * g); }
  return f;
}
export const frictionFactor = (Re, rr) => Re < 2000 ? 64 / Re : colebrook(Re, rr);
// Darcy–Weisbach friction head (m) for Q (m³/s) in a pipe { D, L, eps } (m) with kinematic viscosity nu (m²/s)
export function hf(Q, { D, L, eps }, nu) { const V = Q / area(D), Re = V * D / nu; return frictionFactor(Re, eps / D) * L / D * V * V / (2 * G); }
export const vhead = (Q, D) => { const V = Q / area(D); return V * V / (2 * G); };

// Water near 20 °C (steam tables): ρ = 998.2 kg/m³, ν = 1.004 × 10⁻⁶ m²/s. New PVC: ε ≈ 0.0015 mm.
export const WATER20 = { rho: 998.2, nu: 1.004e-6 };
export const PVC_EPS = 0.0015e-3;
// Loss coefficients a student finds in the bench's Learn notes and any Crane-type table.
export const K = { footValve: 5, square: 0.5, elbow: 0.75, checkValve: 2, gateOpen: 0.15, exit: 1 };

// A series pump line described in the student's own terms (the design they built on the bench):
// { lift, suction: {D, L}, fittingsAfterPump: [K...] (at the bore of the first delivery pipe), delivery: [{ D, L, elbowsAfter }] }
// System head at flow Q (m³/s): static lift + every loss, entry to exit.
export function systemHead(line, Q, nu = WATER20.nu) {
  const s = line.suction, d = line.delivery;
  let h = line.lift + line.entryK * vhead(Q, s.D) + hf(Q, { ...s, eps: PVC_EPS }, nu);
  h += line.fittingsAfterPump.reduce((a, k) => a + k, 0) * vhead(Q, d[0].D);
  d.forEach((p, i) => {
    h += hf(Q, { ...p, eps: PVC_EPS }, nu) + (p.elbowsAfter || 0) * K.elbow * vhead(Q, p.D);
    const next = d[i + 1];
    if (next && next.D !== p.D) {
      if (next.D > p.D) h += (1 - (p.D / next.D) ** 2) ** 2 * vhead(Q, p.D);               // sudden enlargement (Borda–Carnot)
      else h += 0.5 * (1 - (next.D / p.D) ** 2) * vhead(Q, next.D);                           // sudden contraction
    }
  });
  return h + K.exit * vhead(Q, d.at(-1).D);
}
// The main = the longest delivery pipe; its friction head at Q.
export const mainLossAt = (line, Q, nu = WATER20.nu) => { const m = line.delivery.reduce((a, b) => b.L > a.L ? b : a); return hf(Q, { ...m, eps: PVC_EPS }, nu); };

// Pump curve fitted through measured (Q L/s, H m) points: least squares H = a + bQ + cQ².
export function fitPump(points) {
  const S = (f) => points.reduce((a, p) => a + f(p), 0), n = points.length;
  const A = [[n, S(p => p.Q), S(p => p.Q ** 2)], [S(p => p.Q), S(p => p.Q ** 2), S(p => p.Q ** 3)], [S(p => p.Q ** 2), S(p => p.Q ** 3), S(p => p.Q ** 4)]];
  const y = [S(p => p.H), S(p => p.Q * p.H), S(p => p.Q * p.Q * p.H)];
  // Gaussian elimination on the 3 × 3 normal equations, then back substitution
  const M = A.map((r, i) => [...r, y[i]]);
  for (let i = 0; i < 3; i++) for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let r = M[i][3]; for (let j = i + 1; j < 3; j++) r -= M[i][j] * x[j]; x[i] = r / M[i][i]; }
  const [a, b, c] = x;
  return Q => a + b * Q + c * Q * Q;               // Q in L/s → H in m
}
// Operating point: where the fitted pump curve meets the line's system curve (bisection on Q in L/s).
export function operatingPoint(line, pumpH) {
  let lo = 0.01, hi = 10;
  const r = q => pumpH(q) - systemHead(line, q / 1000);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (r(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- a question, as the page shows it → the answer a student would type or pick ----------
const n = s => parseFloat(String(s).replace(/−/g, '-').replace(/\s/g, ''));
const one = (x, unit) => ({ value: x, unit });
const pick = (options, text) => { const i = options.indexOf(text); if (i < 0) throw new Error(`option “${text}” not offered: ${options.join(' | ')}`); return { choice: i }; };
const regime = Re => Re < 2000 ? 'Laminar' : Re > 4000 ? 'Turbulent' : 'Transitional (uncertain)';

const RULES = [
  // ---- choice items: the right option text follows from the stem ----
  [/^A pump delivers 1 L\/s\. How much is that in m³\/s\?$/, (m, o) => pick(o, '0.001 m³/s')],
  [/^A pipe bore is doubled\. Its cross-sectional area becomes…$/, (m, o) => pick(o, '4 times')],
  [/^The velocity in a pipe becomes (\d+) times larger\. The velocity head V²\/2g becomes…$/, (m, o) => pick(o, `${m[1] ** 2} times`)],
  [/^Simplify the ratio of bores ([\d.]+) mm : ([\d.]+) mm\.$/, (m, o) => pick(o, `${n(m[1]) / n(m[2])} : 1`)],
  [/^At the same flow, friction loss is proportional to pipe length\. The pipe length is doubled\. The friction loss…$/, (m, o) => pick(o, 'It doubles')],
  [/^Water at 20 °C has a kinematic viscosity of about 1 × 10⁻⁶ m²\/s\. Which decimal is 1 × 10⁻⁶\?$/, (m, o) => pick(o, '0.000001')],
  [/^Where does ([\d.]+) × 10\^(\d+) lie\?$/, (m, o) => { const x = n(m[1]) * 10 ** n(m[2]); return pick(o, x < 2000 ? 'Below 2000' : x > 4000 ? 'Above 4000' : 'Between 2000 and 4000'); }],
  [/^Two curves are drawn on one graph\. What does the point where they meet give you\?$/, (m, o) => pick(o, 'The x and y where both equations hold at once')],
  [/^The same flow passes from a pipe into one with half the bore\. In the smaller pipe the water moves…$/, (m, o) => pick(o, '4 times faster')],
  [/^Water flows steadily from a wide pipe into a narrow one\. The volume flow rate \(L\/s\) is…$/, (m, o) => pick(o, 'The same in both')],
  [/^In a level pipe of constant bore, the pressure falls steadily along the flow\. Why\?$/, (m, o) => pick(o, 'Friction turns some of the water\'s energy into heat')],
  [/^Water at ([\d.]+) °C \(ν = ([\d.e-]+) m²\/s\) flows at ([\d.]+) L\/s in a ([\d.]+) mm bore\. Which regime\?$/, (m, o) => {
    const D = n(m[4]) / 1000, V = n(m[3]) / 1000 / area(D); return pick(o, regime(V * D / n(m[2]))); }],
  [/^A .+ pipe is replaced by a smaller bore of the same material\. Its relative roughness ε\/D…$/, (m, o) => pick(o, 'It rises')],
  [/^Which pipe is relatively rougher\? New galvanised iron \(ε = ([\d.]+) mm\) at (\d+) mm bore, or rusted galvanised iron \(ε = ([\d.]+) mm\) at (\d+) mm bore\?$/, (m, o) => {
    const a = n(m[1]) / n(m[2]), b = n(m[3]) / n(m[4]); return pick(o, a > b ? `New GI, ${m[2]} mm` : b > a ? `Rusted GI, ${m[4]} mm` : 'They are equal'); }],
  [/^Flow in a pipe has Re = (\d+)\. How do you find the Darcy friction factor\?$/, (m, o) => pick(o, n(m[1]) < 2000 ? '64/Re' : 'Colebrook–White (or the Moody chart) with Re and ε/D')],
  [/^In turbulent flow \(f roughly constant\), the flow through a pipe doubles\. The friction head loss becomes…$/, (m, o) => pick(o, 'About 4 times larger')],
  [/^At the same flow and bore, the pipe is made twice as long\. The friction head loss becomes…$/, (m, o) => pick(o, 'Twice as large')],
  [/^A fitting's head loss is a multiple K of…$/, (m, o) => pick(o, 'The velocity head at its bore (h = K·V²/2g)')],
  [/^A pump lifts water into an open tank\. At zero flow, the system curve starts at…$/, (m, o) => pick(o, 'The static lift (tank level minus sump level)')],
  [/^A centrifugal pump is connected to a pipe line\. Where does it run\?$/, (m, o) => pick(o, 'Where its head–flow curve meets the system curve')],
  [/^The motor must supply at least…$/, (m, o) => pick(o, 'The shaft power ρgQH/η')],
  [/^The same pump draws hotter water from the same sump\. What happens\?$/, (m, o) => pick(o, 'NPSH available falls, so cavitation is more likely')],

  // ---- number items ----
  [/^Convert a flow of ([\d.]+) L\/s to m³\/s\.$/, m => one(n(m[1]) / 1000, 'm³/s')],
  [/^A (\d+) mm bore pipe carries ([\d.]+) L\/s\. .* Q\/D in m²\/s\.$/, m => one((n(m[2]) / 1000) / (n(m[1]) / 1000), 'm²/s')],
  [/^Find the flow area of a pipe with a (\d+) mm bore, in m²\.$/, m => one(area(n(m[1]) / 1000), 'm²')],
  [/^How many (\d+) mm pipes together have the same flow area as one (\d+) mm pipe\?/, m => one((n(m[2]) / n(m[1])) ** 2, 'pipes')],
  [/^Water flows at ([\d.]+) m\/s\. Find the velocity head V²\/2g \(g = ([\d.]+) m\/s²\)\.$/, m => one(n(m[1]) ** 2 / (2 * n(m[2])), 'm')],
  [/^A pitot tube shows a velocity head of ([\d.]+) m of water\. What is the velocity\? \(g = ([\d.]+) m\/s²\)$/, m => one(Math.sqrt(2 * n(m[2]) * n(m[1])), 'm/s')],
  [/^A (\d+) mm pipe narrows to (\d+) mm\. Find the area ratio A₁ : A₂ as a single number\.$/, m => one((n(m[1]) / n(m[2])) ** 2, '')],
  [/^A pipe wall has bumps ([\d.]+) mm high in a (\d+) mm bore\./, m => one(n(m[1]) / n(m[2]), '')],
  [/^A pipe loses ([\d.]+) m of head over (\d+) m at a certain flow\. At the same flow and bore, how much over (\d+) m\?$/, m => one(n(m[1]) * n(m[3]) / n(m[2]), 'm')],
  [/^The losses in a line are ([\d.]+) m at ([\d.]+) L\/s\. Losses grow with Q²\. What are they at ([\d.]+) L\/s\?$/, m => one(n(m[1]) * (n(m[3]) / n(m[2])) ** 2, 'm')],
  [/^Work out ([\d.]+) × ([\d.]+) ÷ \(([\d.]+) × 10⁻⁶\)\.$/, m => one(n(m[1]) * n(m[2]) / (n(m[3]) * 1e-6), '')],
  [/^Solve ([\d.]+) − ([\d.]+)x² = ([\d.]+) \+ ([\d.]+)x² for x > 0\.$/, m => one(Math.sqrt((n(m[1]) - n(m[3])) / (n(m[2]) + n(m[4]))), '')],
  [/^y = ([\d.]+) − ([\d.]+)x² and y = ([\d.]+) \+ ([\d.]+)x²\. Find y where they meet \(x > 0\)\.$/, m => { const x2 = (n(m[1]) - n(m[3])) / (n(m[2]) + n(m[4])); return one(n(m[3]) + n(m[4]) * x2, ''); }],
  [/^([\d.]+) L\/s flows in a (\d+) mm bore pipe\. Find the mean velocity\.$/, m => one(n(m[1]) / 1000 / area(n(m[2]) / 1000), 'm/s')],
  [/^Water arrives at a (\d+) L tank through a (\d+) mm pipe at ([\d.]+) m\/s\. How many minutes to fill it\?$/, m => one(n(m[1]) / 1000 / (area(n(m[2]) / 1000) * n(m[3])) / 60, 'min')],
  [/^Water at ([\d.]+) m\/s in a (\d+) mm pipe passes into a (\d+) mm pipe\. Find the velocity in the smaller pipe\.$/, m => one(n(m[1]) * (n(m[2]) / n(m[3])) ** 2, 'm/s')],
  [/^A pump's (\d+) mm suction pipe runs at ([\d.]+) m\/s\. .*What flow \(L\/s\) arrives at the tank\?$/, m => one(area(n(m[1]) / 1000) * n(m[2]) * 1000, 'L/s')],
  [/^Point 1: (\d+) kPa \(gauge\) at 0 m\. Point 2 is (\d+) m higher in the same bore\. The loss between them is ([\d.]+) m\. Find the pressure at point 2 \(ρ = 1000 kg\/m³, g = ([\d.]+)\)\.$/,
    m => one(n(m[1]) - 1000 * n(m[4]) * (n(m[2]) + n(m[3])) / 1000, 'kPa')],
  [/^On the fluid line bench, gauges at both ends of a level ([\d.]+) mm × (\d+) m main read a drop of ([\d.-]+) kPa \(water at ([\d.]+) °C, ρ = ([\d.]+) kg\/m³, g = ([\d.]+) m\/s²\)\. What head is lost to friction in the main\?$/,
    m => one(n(m[3]) * 1000 / (n(m[5]) * n(m[6])), 'm')],
  [/^Find the Reynolds number for ([\d.]+) L\/s of water at ([\d.]+) °C \(ν = ([\d.e-]+) m²\/s\) in a (\d+) mm bore\.$/, m => { const D = n(m[4]) / 1000; return one(n(m[1]) / 1000 / area(D) * D / n(m[3]), ''); }],
  [/^A (\d+) mm capillary in a lab carries water at ([\d.]+) °C \(ν = ([\d.e-]+) m²\/s\)\. Above what velocity does the flow stop being laminar \(Re = 2000\)\?$/, m => one(2000 * n(m[3]) / (n(m[1]) / 1000), 'm/s')],
  [/^.+ has a roughness ε = ([\d.]+) mm\. Find ε\/D for a (\d+) mm bore\.$/, m => one(n(m[1]) / n(m[2]), '')],
  [/^Turbulent flow: Re = (\d+), ε\/D = ([\d.e-]+)\. Find the Darcy friction factor/, m => one(colebrook(n(m[1]), n(m[2])), '')],
  [/^([\d.]+) L\/s of water at ([\d.]+) °C \(ν = ([\d.e-]+) m²\/s\) in a (\d+) mm .+ pipe \(ε = ([\d.]+) mm\)\. Find the friction factor\.$/, m => {
    const D = n(m[4]) / 1000, Re = n(m[1]) / 1000 / area(D) * D / n(m[3]); return one(frictionFactor(Re, n(m[5]) / 1000 / D), ''); }],
  [/^A (\d+) mm pipe (\d+) m long carries water at V = ([\d.]+) m\/s with f = ([\d.]+)\. Find the friction head loss \(g = ([\d.]+)\)\.$/,
    m => one(n(m[4]) * n(m[2]) / (n(m[1]) / 1000) * n(m[3]) ** 2 / (2 * n(m[5])), 'm')],
  [/^A farm main: (\d+) m of (\d+) mm .+ \(ε = ([\d.]+) mm\) carrying ([\d.]+) L\/s of water at ([\d.]+) °C \(ν = ([\d.e-]+) m²\/s\)\. Find the friction head loss \(g = ([\d.]+) m\/s²\)\.$/, m => {
    const D = n(m[2]) / 1000, V = n(m[4]) / 1000 / area(D), Re = V * D / n(m[6]); return one(frictionFactor(Re, n(m[3]) / 1000 / D) * n(m[1]) / D * V * V / (2 * n(m[7])), 'm'); }],
  [/^A delivery line has (\d+) elbows \(K = ([\d.]+) each\) and one non-return valve \(K = ([\d.]+)\)\. The water moves at ([\d.]+) m\/s\. Find their total head loss \(g = ([\d.]+) m\/s²\)\.$/,
    m => one((n(m[1]) * n(m[2]) + n(m[3])) * n(m[4]) ** 2 / (2 * n(m[5])), 'm')],
  [/^A suction line of (\d+) mm bore carries ([\d.]+) L\/s through a foot valve with strainer \(K = ([\d.]+)\) and (\d+) elbows \(K = ([\d.]+)\)\. Find the fitting losses \(g = ([\d.]+) m\/s²\)\.$/, m => {
    const V = n(m[2]) / 1000 / area(n(m[1]) / 1000); return one((n(m[3]) + n(m[4]) * n(m[5])) * V * V / (2 * n(m[6])), 'm'); }],
  [/^A line has a static lift of (\d+) m and losses of ([\d.]+) m at ([\d.]+) L\/s\. What head must the pump supply to push ([\d.]+) L\/s\?$/, m => one(n(m[1]) + n(m[2]) * (n(m[4]) / n(m[3])) ** 2, 'm')],
  [/^A line needs ([\d.]+) m of pump head at ([\d.]+) L\/s: (\d+) m of lift and ([\d.]+) m of losses\. The tank is raised (\d+) m\. What head is needed at the same flow\?$/, m => one(n(m[3]) + n(m[4]) + n(m[5]), 'm')],
  [/^Pump: H = ([\d.]+) − ([\d.]+)Q²\. System: H = ([\d.]+) \+ ([\d.]+)Q² \(H in m, Q in L\/s\)\. Find the operating flow\.$/, m => one(Math.sqrt((n(m[1]) - n(m[3])) / (n(m[2]) + n(m[4]))), 'L/s')],
  [/^Pump: H = ([\d.]+) − ([\d.]+)Q²\. System: H = ([\d.]+) \+ ([\d.]+)Q² \(H in m, Q in L\/s\)\. What head does the pump deliver at its operating point\?$/, m => {
    const Q2 = (n(m[1]) - n(m[3])) / (n(m[2]) + n(m[4])); return one(n(m[3]) + n(m[4]) * Q2, 'm'); }],
  [/^A pump delivers ([\d.]+) L\/s against (\d+) m at (\d+) % efficiency\. Find the shaft power \(ρ = (\d+) kg\/m³, g = ([\d.]+)\)\.$/,
    m => one(n(m[4]) * n(m[5]) * n(m[1]) / 1000 * n(m[2]) / (n(m[3]) / 100) / 1000, 'kW')],
  [/^The fluid line bench runs at ([\d.]+) L\/s with ([\d.]+) m of pump head and ([\d.]+) kW of shaft power \(water at ([\d.]+) °C, ρ = ([\d.]+) kg\/m³, g = ([\d.]+) m\/s²\)\. What is the pump's efficiency\?$/,
    m => one(n(m[5]) * n(m[6]) * n(m[1]) / 1000 * n(m[2]) / (n(m[3]) * 1000) * 100, '%')],
  // ---- school maths and the pump shaft (open loop on a student's own line: unit conversions, T = P/ω) ----
  [/^A bracket is ([\d,.]+) mm long\. How long is it in metres\?$/, m => one(n(m[1].replace(/,/g, '')) / 1000, 'm')],
  [/^The solver reports a bending moment of ([\d,.]+) N·mm\. What is it in N·m\?$/, m => one(n(m[1].replace(/,/g, '')) / 1000, 'N·m')],
  [/^A gearbox passes the same power to a shaft turning at a lower speed\. The torque on that shaft…$/, (m, o) => pick(o, 'It rises: half the speed gives twice the torque')],
  [/^A motor delivers ([\d.]+) kW at (\d+) rpm\. Find the torque on its shaft\.$/, m => one(n(m[1]) * 1000 / (2 * Math.PI * n(m[2]) / 60), 'N·m')],
  [/^A pump shaft carries (\d+) N·m at (\d+) rpm\. What power does it transmit\?$/, m => one(n(m[1]) * 2 * Math.PI * n(m[2]) / 60 / 1000, 'kW')],
  [/^A pump sits ([\d.]+) m above an open sump\. Atmospheric pressure ([\d.]+) kPa, vapour pressure ([\d.]+) kPa \(water at \d+ °C\), suction losses ([\d.]+) m\. Find NPSH available \(ρ = (\d+) kg\/m³, g = ([\d.]+)\)\.$/,
    m => one((n(m[2]) - n(m[3])) * 1000 / (n(m[5]) * n(m[6])) - n(m[1]) - n(m[4]), 'm')],
  [/^A pump needs NPSH ([\d.]+) m and you want a ([\d.]+) m margin\. Atmospheric ([\d.]+) kPa, vapour pressure ([\d.]+) kPa, suction losses ([\d.]+) m\. How high above the sump can the pump sit \(ρ = (\d+) kg\/m³, g = ([\d.]+)\)\?$/,
    m => one((n(m[3]) - n(m[4])) * 1000 / (n(m[6]) * n(m[7])) - n(m[5]) - n(m[1]) - n(m[2]), 'm')],
];

// → { choice: index } | { value, unit }. Throws if the visible text is not enough to answer (a content defect).
export function solveItem(prompt, options = []) {
  const p = prompt.trim();
  for (const [re, f] of RULES) { const m = p.match(re); if (m) return f(m, options); }
  throw new Error(`no hand method for: ${p}`);
}
// the text a student types: value to 4 significant figures, then the unit
export const typed = a => { const v = Math.abs(a.value) >= 1e-3 && Math.abs(a.value) < 1e6 ? +a.value.toPrecision(4) : a.value.toExponential(3); return a.unit ? `${v} ${a.unit}` : String(v); };
