// Item generators for the heat-path nodes in content/graph/thermal.mjs (Heat and Mass Transfer, sem VI).
// Contract: docs/JOURNEYS.md → Items. Deterministic in (generator, aspect, seed) through core/rng.mjs. Every item is
// formula-keyed: every given appears in the visible prompt, figure.params holds the same givens, and
// tests/machine-thermal-content.test.mjs solves each item from its prompt text alone with its own hand calculation.
// Number tol is relative (core/ledger.mjs); temperatures carry an absolute ±0.3 K expressed relative to the answer.
import { rng } from '../../core/rng.mjs';

export const MISCONCEPTIONS = {
  'mm-not-converted': 'Did not convert millimetres to metres',
  'resistance-inverted': 'Used the conductance (kA/L or hA) as the resistance',
  'films-ignored': 'Left out the surface film (convection) resistances',
  'series-as-parallel': 'Combined resistances in series as if they were in parallel',
};

const sig = (x, n = 4) => { if (x === 0 || !Number.isFinite(x)) return String(x); const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return (+x.toFixed(Math.min(d, 12))).toString(); };
const num = (value, unit, rel = 0.02, abs = 0) => ({ kind: 'number', value, unit, tol: value === 0 ? abs : Math.max(rel, abs / Math.abs(value)) });
const mis = (id, value) => ({ id, value, label: MISCONCEPTIONS[id] });
function choice(r, correct, wrong, tags = {}) {
  const opts = [correct, ...wrong];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { answer: { kind: 'choice', options: opts, correct: opts.indexOf(correct) },
    misconceptions: Object.entries(tags).map(([text, id]) => ({ id, option: opts.indexOf(text), label: MISCONCEPTIONS[id] })) };
}
function gen(id, competency, builders) {
  return { competency, aspects: Object.keys(builders), make(seed, aspect) {
    const b = builders[aspect]; if (!b) throw new Error(`${id}: no aspect ${aspect}`);
    const body = b(rng(`${id}:${aspect}:${seed}`));
    if (body.answer.kind === 'number' && body.misconceptions) body.misconceptions = body.misconceptions.filter(m => Math.abs(m.value - body.answer.value) > 1.5 * body.answer.tol * Math.abs(body.answer.value));
    return { id: `${id}:${aspect}:${seed}`, competency, aspect, misconceptions: [], key: 'formula', ...body };
  } };
}

// Conductivities (W/m·K) as the thermal bench lists them (engines/thermal/thermal.mjs), stated in every prompt that uses one.
const WALL = [['common brick', 0.72], ['concrete', 1.4], ['glass-fibre blanket', 0.038], ['extruded polystyrene', 0.027], ['softwood', 0.12], ['plaster board', 0.17]];
const AREAS = [0.5, 1, 2, 2.5, 4, 5, 8, 10, 12, 15, 20];   // m²

export const GENERATORS = {
  'thermal.conduction': gen('thermal.conduction', 'ENG.thermal.conduction-resistance', {
    concept: r => {
      const c = choice(r, 'It doubles', ['It halves', 'It stays the same', 'It becomes four times larger'], { 'It halves': 'resistance-inverted' });
      return { prompt: 'A wall layer is made twice as thick, with the same material and area. Its conduction resistance…', ...c, figure: { kind: 'none', params: {} },
        solution: ['R = L/(kA): the resistance grows in proportion to the thickness L.', 'Twice as thick, twice the resistance.'] };
    },
    procedure: r => {
      const [name, k] = r.pick(WALL), t = r.int(1, 30) * 10, A = r.pick(AREAS), R = t / 1000 / (k * A);
      return { prompt: `A ${t} mm layer of ${name} (k = ${k} W/m·K) covers ${A} m². Find its conduction resistance.`, answer: num(R, 'K/W'), figure: { kind: 'layer', params: { t, k, A } },
        misconceptions: [mis('mm-not-converted', t / (k * A)), mis('resistance-inverted', k * A / (t / 1000))],
        solution: [`L = ${t} mm = ${t / 1000} m.`, `R = L/(kA) = ${t / 1000} / (${k} × ${A}) = ${sig(R)} K/W.`] };
    },
    transfer: r => {
      const t = r.int(1, 20) * 5, A = r.pick(AREAS), dT = r.int(2, 30), Q = r.int(4, 80) * 5, k = Q * (t / 1000) / (A * dT);
      return { prompt: `${Q} W flows steadily through a ${t} mm slab of area ${A} m² whose faces differ by ${dT} K. Find the slab's thermal conductivity.`, answer: num(k, 'W/m·K'),
        figure: { kind: 'layer', params: { Q, t, A, dT } }, misconceptions: [mis('mm-not-converted', Q * t / (A * dT))],
        solution: [`Q = kAΔT/L, so k = Q·L/(A·ΔT).`, `k = ${Q} × ${t / 1000} / (${A} × ${dT}) = ${sig(k)} W/m·K.`] };
    },
  }),
  'thermal.convection': gen('thermal.convection', 'ENG.thermal.convection-resistance', {
    concept: r => {
      const c = choice(r, 'It falls', ['It rises', 'It stays the same', 'It becomes zero'], { 'It rises': 'resistance-inverted' });
      return { prompt: 'A fan raises the convection coefficient h over a hot surface. The surface\'s convection resistance…', ...c, figure: { kind: 'none', params: {} },
        solution: ['R = 1/(hA).', 'A larger h gives a smaller resistance (but never zero).'] };
    },
    procedure: r => {
      const h = r.pick([5, 8, 10, 15, 25, 40, 50, 100, 500]), A = r.pick([0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]), R = 1 / (h * A);
      return { prompt: `A surface of ${A} m² has a convection coefficient h = ${h} W/m²·K. Find its convection resistance.`, answer: num(R, 'K/W'), figure: { kind: 'surface', params: { h, A } },
        misconceptions: [mis('resistance-inverted', h * A)], solution: [`R = 1/(hA) = 1 / (${h} × ${A}) = ${sig(R)} K/W.`] };
    },
    transfer: r => {
      const A = r.pick([0.05, 0.1, 0.2, 0.5, 1, 2]), h = r.pick([5, 8, 10, 15, 25, 50]), Ta = r.int(15, 35), Ts = Ta + r.int(5, 60), Q = h * A * (Ts - Ta);
      return { prompt: `A ${A} m² surface at ${Ts} °C loses heat to air at ${Ta} °C with h = ${h} W/m²·K. Find the heat flow.`, answer: num(Q, 'W'), figure: { kind: 'surface', params: { A, h, Ts, Ta } },
        misconceptions: [mis('resistance-inverted', (Ts - Ta) / (h * A))], solution: [`Q = hA(Ts − T∞) = ${h} × ${A} × (${Ts} − ${Ta}) = ${sig(Q)} W.`] };
    },
  }),
  'thermal.series': gen('thermal.series', 'ENG.thermal.series-resistance', {
    concept: r => {
      const c = choice(r, 'The sum of the three resistances', ['The largest of the three', 'One over the sum of their inverses', 'The average of the three'], { 'One over the sum of their inverses': 'series-as-parallel' });
      return { prompt: 'Heat passes through three layers, one after another. Their total thermal resistance is…', ...c, figure: { kind: 'none', params: {} },
        solution: ['The same heat flows through each layer in turn: the temperature drops add up.', 'So the resistances add: R_total = R₁ + R₂ + R₃.'] };
    },
    procedure: r => {
      const w = wall(r);
      return { prompt: `A wall of ${w.A} m²: inside film h = ${w.h1} W/m²·K, then ${w.t} mm of ${w.name} (k = ${w.k} W/m·K), then outside film h = ${w.h2} W/m²·K. Inside air ${w.Ti} °C, outside air ${w.To} °C. Find the heat flow through the wall.`,
        answer: num(w.Q, 'W'), figure: { kind: 'wall', params: w.params }, misconceptions: [mis('films-ignored', (w.Ti - w.To) / w.R2), mis('mm-not-converted', (w.Ti - w.To) / (w.R1 + w.t / (w.k * w.A) + w.R3))],
        solution: [`R = 1/(h₁A) + L/(kA) + 1/(h₂A) = ${sig(w.R1)} + ${sig(w.R2)} + ${sig(w.R3)} = ${sig(w.R)} K/W.`, `Q = ΔT/R = (${w.Ti} − ${w.To}) / ${sig(w.R)} = ${sig(w.Q)} W.`] };
    },
    transfer: r => {
      const w = wall(r), Ts = w.Ti - w.Q * w.R1;
      return { prompt: `A wall of ${w.A} m²: inside film h = ${w.h1} W/m²·K, then ${w.t} mm of ${w.name} (k = ${w.k} W/m·K), then outside film h = ${w.h2} W/m²·K. Inside air ${w.Ti} °C, outside air ${w.To} °C. Find the temperature of the wall's inside surface.`,
        answer: num(Ts, '°C', 0.01, 0.3), figure: { kind: 'wall', params: w.params }, misconceptions: [mis('films-ignored', w.Ti)],
        solution: [`R = ${sig(w.R1)} + ${sig(w.R2)} + ${sig(w.R3)} = ${sig(w.R)} K/W; Q = (${w.Ti} − ${w.To}) / ${sig(w.R)} = ${sig(w.Q)} W.`, `The inside film drops Q·R₁ = ${sig(w.Q)} × ${sig(w.R1)} = ${sig(w.Q * w.R1)} K.`, `T_surface = ${w.Ti} − ${sig(w.Q * w.R1)} = ${sig(Ts)} °C.`] };
    },
  }),
};
// A plane wall with a film each side (shared by the series items).
function wall(r) {
  const [name, k] = r.pick(WALL), t = r.int(2, 30) * 10, A = r.pick(AREAS), h1 = r.pick([5, 8, 10]), h2 = r.pick([15, 20, 25, 30]), Ti = r.int(18, 26), To = r.int(-5, 12);
  const R1 = 1 / (h1 * A), R2 = t / 1000 / (k * A), R3 = 1 / (h2 * A), R = R1 + R2 + R3, Q = (Ti - To) / R;
  return { name, k, t, A, h1, h2, Ti, To, R1, R2, R3, R, Q, params: { k, t, A, h1, h2, Ti, To } };
}
