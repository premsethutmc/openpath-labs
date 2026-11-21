// Pump House fault lab — a factory cooling loop with one hidden fault. Pump House physics only (hydraulics.mjs);
// nothing here is shared with other labs.
//
// Deterministic lab fixture (simulated, not manufacturer test data):
// • Cooling-loop water at 32 °C is drawn from the cooling-tower basin (water 4 m above the pump centreline, so the
//   suction is flooded and far from cavitation), through an inlet strainer, by the stock model monoblock pump, then
//   through a discharge section (non-return valve + isolating gate valve) and 40 m of pipe to the return header.
// • The fault is an added local loss R·Q² either in the strainer or in the discharge section. R is the same for both
//   candidate faults in a case, so the aggregate system curve — and therefore flow, pump head, power and efficiency —
//   is identical whichever section is at fault. Guessing from the dashboard cannot work.
// • Differential-pressure taps sit either side of each section on the same pipe, at equal elevation and diameter, so
//   the reading is purely that section's loss: Δp = ρg(K_clean·V²/2g + R_section·Q²).
import { operate, water, FITTINGS, gateK, STOCK_SYSTEM, STOCK_PUMP, arrangedHead, systemHead, G } from '../engines/hydraulics/hydraulics.mjs';

export const SECTIONS = {
  strainer: { name: 'inlet strainer', side: 'suction', Kclean: () => FITTINGS.footValve },
  discharge: { name: 'discharge section (non-return valve + gate valve)', side: 'delivery', Kclean: s => FITTINGS.checkValve + gateK(s.valveOpen) },
};
export const FAULTS = ['strainer', 'discharge'];
export const ACTIONS = {
  'clean-strainer': { name: 'Clean the inlet strainer', fixes: 'strainer' },
  'clear-discharge': { name: 'Clear the discharge restriction', fixes: 'discharge' },
  'replace-pump': { name: 'Replace the pump with a new identical unit', fixes: null },
};
const LOOP = {
  ...STOCK_SYSTEM, temp: 32, sumpLevel: 4, tankHeight: 12, valveOpen: 1, arrangement: 'single',
  suction: { D: 0.05, L: 3, material: 'steel', elbows: 1 }, delivery: { D: 0.04, L: 40, material: 'steel', elbows: 6 },
};
// Operating conditions: the guided case and the unseen cases (different static lift or pump speed).
// headerElevation: return-header water surface above the pump centreline (m). The basin elevation is fixed by LOOP.
// Static lift is never stored — it is derived from the elevations the solver receives (see elevations()).
// The severity differs per condition (fraction of healthy flow left), so no reading repeats between cases.
export const CONDITIONS = [
  { id: 'guided', headerElevation: 12, rpm: 2900, flowLeft: 0.72 },
  { id: 'low-lift', headerElevation: 6, rpm: 2900, flowLeft: 0.85 },
  { id: 'slow', headerElevation: 12, rpm: 2600, flowLeft: 0.80 },
  { id: 'high-fast', headerElevation: 16, rpm: 3100, flowLeft: 0.78 },
];

const systemFor = (cond, extra) => ({ ...LOOP, tankHeight: cond.headerElevation, extraLoss: extra });
// The elevations exactly as the solver receives them, and the static lift derived from them (m, relative to the pump
// centreline): static lift = header elevation − basin elevation.
export function elevations(cond) {
  const s = systemFor(cond);
  return { header: s.tankHeight, basin: s.sumpLevel, staticLift: s.tankHeight - s.sumpLevel };
}
const pumpFor = cond => ({ ...STOCK_PUMP, rpm: cond.rpm });

// Added loss R (m per (m³/s)²) that brings the flow down to cond.flowLeft × healthy at this condition.
export function severity(cond) {
  const healthy = operate(systemFor(cond), pumpFor(cond)), w = water(LOOP.temp), Qf = cond.flowLeft * healthy.Q;
  const Hp = arrangedHead(Qf, pumpFor(cond), w, 'single').H, Hs = systemHead(Qf, systemFor(cond), w).H;
  return (Hp - Hs) / (Qf * Qf);
}

// One state of the loop: healthy, faulted, or after a repair. Returns dashboard readings and both tap readings.
export function loopState(cond, fault = null, R = 0) {
  const extra = fault ? { [SECTIONS[fault].side]: R } : undefined;
  const s = systemFor(cond, extra), op = operate(s, pumpFor(cond)), w = op.water;
  const tap = id => {
    const sec = SECTIONS[id], pipe = sec.side === 'suction' ? op.suction : op.delivery;
    const dh = sec.Kclean(s) * pipe.vh + (fault === id ? R * op.Q * op.Q : 0);
    return w.rho * G * dh;   // Pa
  };
  return {
    dashboard: { flow: op.Q, head: op.H, power: op.power, eff: op.eff },
    taps: { strainer: tap('strainer'), discharge: tap('discharge') },
    npshMargin: op.npsha - op.npshr, cavitating: op.cavitating,
  };
}

// A case: the hidden fault and the condition, chosen deterministically from a seed.
export function makeCase(cond, fault) {
  const R = severity(cond);
  return { cond, fault, R, healthy: loopState(cond), faulted: loopState(cond, fault, R) };
}
export function repair(c, actionId) {
  const fixed = ACTIONS[actionId].fixes === c.fault;
  return { fixed, state: fixed ? c.healthy : c.faulted };
}
// What a clean section would read at today's flow: healthy reading scaled by (Q/Q₀)² (turbulent loss ∝ V²).
export const cleanExpected = (c, section) => c.healthy.taps[section] * (c.faulted.dashboard.flow / c.healthy.dashboard.flow) ** 2;
// Seed bits: bit 0 → guided fault, bit 1 → unseen fault, higher bits → which unseen condition.
export const casesForSeed = seed => ({
  guided: makeCase(CONDITIONS[0], FAULTS[seed & 1]),
  unseen: makeCase(CONDITIONS[1 + ((seed >> 2) % 3)], FAULTS[(seed >> 1) & 1]),
});
