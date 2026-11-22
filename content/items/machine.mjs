// Item generators for the shaft nodes in content/graph/machine.mjs (Design of Machine Elements, sem V).
// Contract: docs/JOURNEYS.md → Items. Deterministic in (generator, aspect, seed) through core/rng.mjs. Every item is
// formula-keyed: every given appears in the visible prompt, figure.params holds the same givens, and
// tests/machine-thermal-content.test.mjs solves each item from its prompt text alone with its own hand calculation.
// Number tol is relative (core/ledger.mjs). Choice `correct` and a misconception's `option` are option indexes.
import { rng } from '../../core/rng.mjs';

export const MISCONCEPTIONS = {
  'rpm-as-rad-per-s': 'Used the speed in rpm as if it were rad/s (forgot ω = 2πN/60)',
  'kw-not-converted': 'Did not convert between kW and W',
  'torque-proportional-to-speed': 'Took torque as proportional to speed at the same power',
  'radius-for-diameter': 'Used the radius where the formula needs the diameter',
  'nm-not-converted': 'Did not convert N·m to N·mm before dividing by mm³',
  'stress-linear-in-d': 'Took shaft stress as inversely proportional to d instead of d³',
  'stress-square-in-d': 'Took shaft stress as inversely proportional to d² instead of d³',
  'no-cube-root': 'Forgot to take the cube root',
  'stresses-added': 'Added the bending and shear stresses directly',
  'bending-only': 'Left out the torsion',
  'mm-not-converted': 'Did not convert millimetres to metres',
  'omega-as-rpm': 'Gave ω in rad/s as the speed in rpm',
  'critical-falls-with-stiffness': 'Took a stiffer shaft as whirling at a lower speed',
};

export const G = 9.81;
const sig = (x, n = 4) => { if (x === 0 || !Number.isFinite(x)) return String(x); const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return (+x.toFixed(Math.min(d, 12))).toString(); };
const num = (value, unit, rel = 0.02) => ({ kind: 'number', value, unit, tol: rel });
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
    // a wrong answer too close to the right one cannot name a misconception
    if (body.answer.kind === 'number' && body.misconceptions) body.misconceptions = body.misconceptions.filter(m => Math.abs(m.value - body.answer.value) > 1.5 * body.answer.tol * Math.abs(body.answer.value));
    return { id: `${id}:${aspect}:${seed}`, competency, aspect, misconceptions: [], key: 'formula', ...body };
  } };
}

const POWERS = [0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22];   // kW, standard motor ratings
const SPEEDS = [720, 960, 1440, 1450, 2880, 2900];                       // rpm, induction motors on 50 Hz
const DIAS = [20, 25, 30, 35, 40, 45, 50, 60];                           // mm
const omega = N => 2 * Math.PI * N / 60;
const tauOf = (T, d) => 16 * T * 1000 / (Math.PI * d ** 3);              // N·m, mm → MPa
const sigOf = (M, d) => 32 * M * 1000 / (Math.PI * d ** 3);
// a moment or torque (N·m, a multiple of 5) giving a stress near `target` MPa on a d mm shaft
const loadFor = (target, d, k) => Math.max(5, Math.round(target * Math.PI * d ** 3 / (k * 1000) / 5) * 5);

export const GENERATORS = {
  'machine.torque': gen('machine.torque', 'ENG.machine.torque-power', {
    concept: r => {
      const c = choice(r, 'It rises: half the speed gives twice the torque', ['It falls in proportion to the speed', 'It stays the same', 'It rises with the square of the speed ratio'],
        { 'It falls in proportion to the speed': 'torque-proportional-to-speed' });
      return { prompt: 'A gearbox passes the same power to a shaft turning at a lower speed. The torque on that shaft…', ...c, figure: { kind: 'none', params: {} },
        solution: ['P = T·ω, so at the same power T = P/ω.', 'Lower ω means higher T: half the speed, twice the torque.'] };
    },
    procedure: r => {
      const P = r.pick(POWERS), N = r.pick(SPEEDS), w = omega(N), T = P * 1000 / w;
      return { prompt: `A motor delivers ${P} kW at ${N} rpm. Find the torque on its shaft.`, answer: num(T, 'N·m'), figure: { kind: 'none', params: { P, N } },
        misconceptions: [mis('rpm-as-rad-per-s', P * 1000 / N), mis('kw-not-converted', P / w)],
        solution: [`ω = 2π × ${N} / 60 = ${sig(w)} rad/s.`, `T = P/ω = ${P} × 1000 / ${sig(w)} = ${sig(T)} N·m.`] };
    },
    transfer: r => {
      const T = r.int(2, 80) * 5, N = r.pick(SPEEDS), w = omega(N), P = T * w / 1000;
      return { prompt: `A pump shaft carries ${T} N·m at ${N} rpm. What power does it transmit?`, answer: num(P, 'kW'), figure: { kind: 'none', params: { T, N } },
        misconceptions: [mis('rpm-as-rad-per-s', T * N / 1000)],
        solution: [`ω = 2π × ${N} / 60 = ${sig(w)} rad/s.`, `P = T·ω = ${T} × ${sig(w)} = ${sig(T * w)} W = ${sig(P)} kW.`] };
    },
  }),
  'machine.torsion': gen('machine.torsion', 'ENG.machine.torsion-stress', {
    concept: r => {
      const c = choice(r, 'It falls to one eighth', ['It halves', 'It falls to one quarter', 'It stays the same'], { 'It halves': 'stress-linear-in-d', 'It falls to one quarter': 'stress-square-in-d' });
      return { prompt: 'A solid shaft is replaced by one of twice the diameter, carrying the same torque. The largest shear stress…', ...c, figure: { kind: 'none', params: {} },
        solution: ['τ = 16T/(πd³): the stress goes with 1/d³.', 'Twice the diameter: 2³ = 8, so one eighth of the stress.'] };
    },
    procedure: r => {
      const d = r.pick(DIAS), T = loadFor(r.int(20, 90), d, 16), tau = tauOf(T, d);
      return { prompt: `A solid shaft of ${d} mm diameter carries a torque of ${T} N·m. Find the largest shear stress in it.`, answer: num(tau, 'MPa'), figure: { kind: 'shaft', params: { d, T } },
        misconceptions: [mis('radius-for-diameter', tauOf(T, d / 2)), mis('nm-not-converted', tau / 1000)],
        solution: [`T = ${T} N·m = ${T * 1000} N·mm.`, `τ = 16T/(πd³) = 16 × ${T * 1000} / (π × ${d}³) = ${sig(tau)} MPa (N/mm²).`] };
    },
    transfer: r => {
      const P = r.pick(POWERS), N = r.pick(SPEEDS), ta = r.pick([30, 40, 45, 50, 60]), T = P * 1e6 / omega(N), d3 = 16 * T / (Math.PI * ta), d = Math.cbrt(d3);
      return { prompt: `A solid shaft transmits ${P} kW at ${N} rpm. The allowable shear stress is ${ta} MPa. Find the smallest diameter it can have.`, answer: num(d, 'mm'),
        figure: { kind: 'shaft', params: { P, N, ta } }, misconceptions: [mis('rpm-as-rad-per-s', Math.cbrt(16 * (P * 1e6 / N) / (Math.PI * ta)))],
        solution: [`T = P/ω = ${P} × 10⁶ / (2π × ${N} / 60) = ${sig(T)} N·mm.`, `d³ = 16T/(π τ) = 16 × ${sig(T)} / (π × ${ta}) = ${sig(d3)} mm³.`, `d = ${sig(d)} mm.`] };
    },
  }),
  'machine.combined': gen('machine.combined', 'ENG.machine.combined-stress', {
    concept: r => {
      const c = choice(r, '√(σ² + 3τ²)', ['σ + τ', 'σ alone', '√(σ² + τ²)'], { 'σ + τ': 'stresses-added', 'σ alone': 'bending-only' });
      return { prompt: 'At one section of a ductile steel shaft, bending gives a normal stress σ and torsion a shear stress τ. Which equivalent stress does the distortion-energy (von Mises) criterion compare with the yield strength?',
        ...c, figure: { kind: 'none', params: {} }, solution: ['Distortion energy: σ_eq = √(σ² + 3τ²).', 'Yielding starts when σ_eq reaches the yield strength.'] };
    },
    procedure: r => {
      const d = r.pick(DIAS), M = loadFor(r.int(20, 80), d, 32), T = loadFor(r.int(10, 60), d, 16), s = sigOf(M, d), t = tauOf(T, d), eq = Math.hypot(s, Math.sqrt(3) * t);
      return { prompt: `At one section of a solid ${d} mm shaft the bending moment is ${M} N·m and the torque is ${T} N·m. Find the von Mises equivalent stress there.`, answer: num(eq, 'MPa'),
        figure: { kind: 'shaft', params: { d, M, T } }, misconceptions: [mis('stresses-added', s + t), mis('bending-only', s)],
        solution: [`σ = 32M/(πd³) = 32 × ${M * 1000} / (π × ${d}³) = ${sig(s)} MPa.`, `τ = 16T/(πd³) = 16 × ${T * 1000} / (π × ${d}³) = ${sig(t)} MPa.`, `σ_eq = √(σ² + 3τ²) = ${sig(eq)} MPa.`] };
    },
    transfer: r => {
      const d = r.pick(DIAS), M = loadFor(r.int(20, 80), d, 32), T = loadFor(r.int(10, 60), d, 16), Sy = r.pick([250, 350, 420]);
      const s = sigOf(M, d), t = tauOf(T, d), eq = Math.hypot(s, Math.sqrt(3) * t), n = Sy / eq;
      return { prompt: `A solid ${d} mm steel shaft (yield strength ${Sy} MPa) carries a bending moment of ${M} N·m and a torque of ${T} N·m at its worst section. Find its safety factor against yielding (von Mises).`,
        answer: num(n, ''), figure: { kind: 'shaft', params: { d, M, T, Sy } }, misconceptions: [mis('bending-only', Sy / s), mis('stresses-added', Sy / (s + t))],
        solution: [`σ = 32M/(πd³) = ${sig(s)} MPa; τ = 16T/(πd³) = ${sig(t)} MPa.`, `σ_eq = √(σ² + 3τ²) = ${sig(eq)} MPa.`, `n = ${Sy} / ${sig(eq)} = ${sig(n, 3)}.`] };
    },
  }),
  'machine.critical': gen('machine.critical', 'ENG.machine.critical-speed', {
    concept: r => {
      const c = choice(r, 'It rises', ['It falls', 'It stays the same', 'It becomes zero'], { 'It falls': 'critical-falls-with-stiffness' });
      return { prompt: 'A disc sits on a light shaft. A stiffer shaft deflects less under the disc\'s weight. Its first critical speed…', ...c, figure: { kind: 'none', params: {} },
        solution: ['ω = √(k/m) = √(g/δ).', 'Less static deflection δ means a higher critical speed.'] };
    },
    procedure: r => {
      const dmm = r.int(2, 200) / 100, w = Math.sqrt(G / (dmm / 1000)), N = w * 60 / (2 * Math.PI);
      return { prompt: `A disc on a light shaft deflects it ${dmm} mm under its own weight. Find the first critical speed (g = ${G} m/s²).`, answer: num(N, 'rpm'),
        figure: { kind: 'none', params: { delta: dmm } }, misconceptions: [mis('mm-not-converted', Math.sqrt(G / dmm) * 60 / (2 * Math.PI)), mis('omega-as-rpm', w)],
        solution: [`δ = ${dmm} mm = ${sig(dmm / 1000)} m.`, `ω = √(g/δ) = √(${G} / ${sig(dmm / 1000)}) = ${sig(w)} rad/s.`, `N = 60ω/(2π) = ${sig(N)} rpm.`] };
    },
    transfer: r => {
      const m = r.int(2, 8) * 5, L = r.int(4, 12) * 100, d = r.pick([25, 30, 35, 40, 45, 50]), E = 200e9;
      const I = Math.PI * (d / 1000) ** 4 / 64, delta = m * G * (L / 1000) ** 3 / (48 * E * I), w = Math.sqrt(G / delta), N = w * 60 / (2 * Math.PI);
      return { prompt: `A ${m} kg disc sits at mid-span of a light steel shaft, ${d} mm in diameter, on bearings ${L} mm apart (simply supported, E = 200 GPa, g = ${G} m/s²). Find the first critical speed.`,
        answer: num(N, 'rpm'), figure: { kind: 'shaft', params: { m, L, d } }, misconceptions: [mis('omega-as-rpm', w)],
        solution: [`I = πd⁴/64 = ${sig(I)} m⁴.`, `δ = mgL³/(48EI) = ${m} × ${G} × ${L / 1000}³ / (48 × 2×10¹¹ × ${sig(I)}) = ${sig(delta)} m.`, `ω = √(g/δ) = ${sig(w)} rad/s; N = 60ω/(2π) = ${sig(N)} rpm.`] };
    },
  }),
};
