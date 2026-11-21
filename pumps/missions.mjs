// Guided missions for the Pump House — Anna University CE3391 Unit II (flow through pipes) and Unit IV (pumps).
// Every answer is computed by the hydraulics engine at the moment the learner commits.
import { operate, pumpAt, water, pipeLoss, STOCK_SYSTEM as S0, STOCK_PUMP as P0, MATERIALS } from '../engines/hydraulics/hydraulics.mjs';

export const COURSE = 'Anna University CE3391 Fluid Mechanics and Machinery';
const Ls = q => `${(q * 1000).toFixed(2)} L/s`;

export const MISSIONS = [
  {
    id: 'regime', unit: 'Unit II · Reynolds’ experiment', title: 'Smooth or chaotic?',
    intro: 'The hostel pump is filling the overhead tank through a 40 mm pipe. Water moves at about 2 m/s.',
    setup: {}, q: 'Is the flow inside the delivery pipe laminar (smooth layers) or turbulent (chaotic eddies)?', options: ['Laminar', 'Turbulent'],
    answer: () => { const o = operate(S0); return { a: o.delivery.Re > 4000 ? 'Turbulent' : 'Laminar', m: `Reynolds number = VD/ν = ${Math.round(o.delivery.Re).toLocaleString('en-IN')} — far above 4000.` }; },
    explain: 'Laminar pipe flow needs Re below about 2000. For water that means a few centimetres per second in a pipe this size. Almost every practical water pipe is turbulent.',
    task: 'Lower the pump speed and close the valve: how slow must the water go before it turns laminar?',
  },
  {
    id: 'length', unit: 'Unit II · Darcy–Weisbach, losses in pipes', title: 'A longer pipe',
    intro: 'The warden wants the tank moved to the far block, doubling the delivery pipe from 30 m to 60 m.',
    setup: {}, q: 'What happens to the flow into the tank?', options: ['Halves', 'Drops, but by much less than half', 'No change'],
    answer: () => { const a = operate(S0), b = operate({ ...S0, delivery: { ...S0.delivery, L: 60 } }); const r = b.Q / a.Q; return { a: r > 0.97 ? 'No change' : r > 0.6 ? 'Drops, but by much less than half' : 'Halves', m: `Flow ${Ls(a.Q)} → ${Ls(b.Q)} (${Math.round((1 - r) * 100)} % less).` }; },
    explain: 'Most of the pump’s work goes into lifting water 20 m — the static head. Only the friction part grows with length (h_f = f·L/D·V²/2g), and the pump answers by moving along its curve to a slightly higher head.',
    task: 'Drag the delivery length and watch the operating point slide along the pump curve.', after: { delivery: { ...S0.delivery, L: 60 } },
  },
  {
    id: 'diameter', unit: 'Unit II · Flow through pipes, Moody diagram', title: 'A thinner pipe',
    intro: 'Same flow rate, 2.4 litres every second. A plumber suggests a pipe half as wide to save money.',
    setup: {}, q: 'Halving the diameter multiplies the friction loss by roughly…', options: ['2 times', '4 times', 'About 30 times'],
    answer: () => {
      const w = water(30), Q = 0.0024, a = pipeLoss(Q, { D: 0.04, L: 30, material: 'gi', K: 0 }, w), b = pipeLoss(Q, { D: 0.02, L: 30, material: 'gi', K: 0 }, w), r = b.hf / a.hf;
      return { a: r > 15 ? 'About 30 times' : r > 3 ? '4 times' : '2 times', m: `Friction loss ${a.hf.toFixed(1)} m → ${b.hf.toFixed(0)} m: ×${r.toFixed(0)}.` };
    },
    explain: 'Same flow through half the diameter: speed ×4, and h_f ∝ V²/D, so roughly ×32 — the “fifth-power law”. The friction factor also changes a little (Moody diagram).',
    task: 'Choose a 25 mm delivery pipe and see the system curve shoot up.',
  },
  {
    id: 'valve', unit: 'Unit IV · Centrifugal pump performance curves', title: 'Close the valve',
    intro: 'The delivery valve is nearly closed (10 % open) — the pump runs against it.',
    setup: {}, q: 'Compared with full flow, does the motor draw more power or less?', options: ['More power', 'Less power', 'The same'],
    answer: () => { const a = operate(S0), b = operate({ ...S0, valveOpen: 0.1 }); return { a: b.power < 0.95 * a.power ? 'Less power' : b.power > 1.05 * a.power ? 'More power' : 'The same', m: `Shaft power ${(a.power / 1000).toFixed(2)} kW → ${(b.power / 1000).toFixed(2)} kW, while head rises ${a.H.toFixed(1)} → ${b.H.toFixed(1)} m.` }; },
    explain: 'For a centrifugal pump with backward-curved blades, power rises with flow. So these pumps are started with the delivery valve closed: the motor starts against the lowest load. (Do not run it closed for long — the trapped water heats up.)',
    task: 'Slide the valve and watch power, head and efficiency on the pump curve.', after: { valveOpen: 0.1 },
  },
  {
    id: 'affinity', unit: 'Unit IV · Similarity (affinity) laws, specific speed', title: 'Half the speed',
    intro: 'A variable-speed drive slows the pump from 2900 to 1450 rpm.',
    setup: {}, q: 'The highest head the pump can make (valve shut) becomes…', options: ['Half', 'A quarter', 'Unchanged'],
    answer: () => { const w = water(30), a = pumpAt(0, P0, w).H, b = pumpAt(0, { ...P0, rpm: 1450 }, w).H, r = b / a; return { a: r < 0.35 ? 'A quarter' : r < 0.7 ? 'Half' : 'Unchanged', m: `Shut-off head ${a.toFixed(1)} m → ${b.toFixed(1)} m (×${r.toFixed(2)}).` }; },
    explain: 'Affinity laws: Q ∝ N, H ∝ N², P ∝ N³. Half speed gives a quarter of the head — not enough to reach the tank 20 m up, so the flow stops completely.',
    task: 'Find the slowest speed that still fills the tank.', after: { rpm: 1450 },
  },
  {
    id: 'cavitation', unit: 'Unit IV · Cavitation in pumps (NPSH)', title: 'Hot water',
    intro: 'The pump lifts water from a sump 4 m below it. With water at 30 °C it runs quietly. Now it must pump hot water at 85 °C from the solar heater sump.',
    setup: { sumpLevel: -4 }, q: 'Will the pump cavitate (water boiling into bubbles at the impeller eye)?', options: ['Yes', 'No'],
    answer: () => { const c = operate({ ...S0, sumpLevel: -4 }), h = operate({ ...S0, sumpLevel: -4, temp: 85 }); return { a: h.cavitating ? 'Yes' : 'No', m: `NPSH available ${c.npsha.toFixed(1)} m at 30 °C → ${h.npsha.toFixed(1)} m at 85 °C; the pump needs ${h.npshr.toFixed(1)} m.` }; },
    explain: 'Hot water boils at a much higher pressure (vapour pressure 58 kPa at 85 °C vs 4 kPa at 30 °C). Suction lift lowers the pressure at the impeller eye further; when it falls below vapour pressure, bubbles form and collapse, pitting the impeller. Fix: put the pump below the water (flooded suction).',
    task: 'Raise the sump level until cavitation stops.', after: { sumpLevel: -4, temp: 85 },
  },
  {
    id: 'parallel', unit: 'Unit IV · Pumps in parallel and series', title: 'Two pumps',
    intro: 'The tank empties too fast in the morning. A second identical pump is connected in parallel.',
    setup: {}, q: 'Does the flow into the tank double?', options: ['Yes, it doubles', 'It rises, but less than double', 'No change'],
    answer: () => { const a = operate(S0), b = operate({ ...S0, arrangement: 'parallel' }); const r = b.Q / a.Q; return { a: r > 1.9 ? 'Yes, it doubles' : r > 1.05 ? 'It rises, but less than double' : 'No change', m: `Flow ${Ls(a.Q)} → ${Ls(b.Q)} (×${r.toFixed(2)}).` }; },
    explain: 'More flow means more friction in the same pipe, so the system curve rises and each pump works at a higher head and lower flow. Parallel pumps add flow; series pumps add head — for a tall building you would put them in series.',
    task: 'Choose the 12-storey tower scenario: one pump fails to lift — which arrangement fixes it?', after: { arrangement: 'parallel' },
  },
];
export { MATERIALS };
