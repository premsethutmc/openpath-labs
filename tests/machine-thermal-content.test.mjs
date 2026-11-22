// Machine (Design of Machine Elements, sem V) and thermal (Heat and Mass Transfer, sem VI) content: graph nodes and
// item generators. Every number item is solved here from its PROMPT TEXT alone (regexes over what the learner sees)
// with this file's own hand calculation, over many seeds; the typed answer is accepted by the ledger. A few items are
// also re-run on the benches themselves (critical speed, pure torsion, a plane wall) to show the formulas agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODES as MN } from '../content/graph/machine.mjs';
import { NODES as TN } from '../content/graph/thermal.mjs';
import { GENERATORS as MG, MISCONCEPTIONS as MM } from '../content/items/machine.mjs';
import { GENERATORS as TG, MISCONCEPTIONS as TM } from '../content/items/thermal.mjs';
import { checkResponse } from '../core/ledger.mjs';
import * as M from '../machine/model.mjs';
import * as T from '../thermal/model.mjs';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 11);
const n = s => parseFloat(String(s).replace(/−/g, '-'));
const PI = Math.PI;
const w = N => 2 * PI * N / 60;

// ---------- the learner's hand methods, from the visible text only ----------
const pick = (o, text) => { const i = o.indexOf(text); assert.ok(i >= 0, `option “${text}” not offered: ${o.join(' | ')}`); return { choice: i }; };
const RULES = [
  [/^A gearbox passes the same power to a shaft turning at a lower speed\. The torque on that shaft…$/, (m, o) => pick(o, 'It rises: half the speed gives twice the torque')],
  [/^A solid shaft is replaced by one of twice the diameter, carrying the same torque\. The largest shear stress…$/, (m, o) => pick(o, 'It falls to one eighth')],
  [/von Mises\) criterion compare with the yield strength\?$/, (m, o) => pick(o, '√(σ² + 3τ²)')],
  [/^A disc sits on a light shaft\. A stiffer shaft deflects less under the disc's weight\. Its first critical speed…$/, (m, o) => pick(o, 'It rises')],
  [/^A wall layer is made twice as thick, with the same material and area\. Its conduction resistance…$/, (m, o) => pick(o, 'It doubles')],
  [/^A fan raises the convection coefficient h over a hot surface\. The surface's convection resistance…$/, (m, o) => pick(o, 'It falls')],
  [/^Heat passes through three layers, one after another\. Their total thermal resistance is…$/, (m, o) => pick(o, 'The sum of the three resistances')],

  [/^A motor delivers ([\d.]+) kW at (\d+) rpm\. Find the torque on its shaft\.$/, m => ({ value: n(m[1]) * 1000 / w(n(m[2])), unit: 'N·m' })],
  [/^A pump shaft carries ([\d.]+) N·m at (\d+) rpm\. What power does it transmit\?$/, m => ({ value: n(m[1]) * w(n(m[2])) / 1000, unit: 'kW' })],
  [/^A solid shaft of (\d+) mm diameter carries a torque of ([\d.]+) N·m\. Find the largest shear stress in it\.$/, m => ({ value: 16 * n(m[2]) * 1e3 / (PI * n(m[1]) ** 3), unit: 'MPa' })],
  [/^A solid shaft transmits ([\d.]+) kW at (\d+) rpm\. The allowable shear stress is (\d+) MPa\. Find the smallest diameter it can have\.$/,
    m => { const Tn = n(m[1]) * 1e3 / w(n(m[2])); return { value: Math.cbrt(16 * Tn * 1e3 / (PI * n(m[3]))), unit: 'mm' }; }],
  [/^At one section of a solid (\d+) mm shaft the bending moment is ([\d.]+) N·m and the torque is ([\d.]+) N·m\. Find the von Mises equivalent stress there\.$/,
    m => { const d = n(m[1]), s = 32 * n(m[2]) * 1e3 / (PI * d ** 3), t = 16 * n(m[3]) * 1e3 / (PI * d ** 3); return { value: Math.sqrt(s * s + 3 * t * t), unit: 'MPa' }; }],
  [/^A solid (\d+) mm steel shaft \(yield strength (\d+) MPa\) carries a bending moment of ([\d.]+) N·m and a torque of ([\d.]+) N·m at its worst section\. Find its safety factor against yielding \(von Mises\)\.$/,
    m => { const d = n(m[1]), s = 32 * n(m[3]) * 1e3 / (PI * d ** 3), t = 16 * n(m[4]) * 1e3 / (PI * d ** 3); return { value: n(m[2]) / Math.sqrt(s * s + 3 * t * t), unit: '' }; }],
  [/^A disc on a light shaft deflects it ([\d.]+) mm under its own weight\. Find the first critical speed \(g = ([\d.]+) m\/s²\)\.$/,
    m => ({ value: Math.sqrt(n(m[2]) / (n(m[1]) / 1000)) * 60 / (2 * PI), unit: 'rpm' })],
  [/^A (\d+) kg disc sits at mid-span of a light steel shaft, (\d+) mm in diameter, on bearings (\d+) mm apart \(simply supported, E = 200 GPa, g = ([\d.]+) m\/s²\)\. Find the first critical speed\.$/,
    m => { const g = n(m[4]), I = PI * (n(m[2]) / 1000) ** 4 / 64, k = 48 * 200e9 * I / (n(m[3]) / 1000) ** 3; return { value: Math.sqrt(k / n(m[1])) * 60 / (2 * PI), unit: 'rpm' }; }],

  [/^A (\d+) mm layer of .+ \(k = ([\d.]+) W\/m·K\) covers ([\d.]+) m²\. Find its conduction resistance\.$/, m => ({ value: n(m[1]) / 1000 / (n(m[2]) * n(m[3])), unit: 'K/W' })],
  [/^(\d+) W flows steadily through a (\d+) mm slab of area ([\d.]+) m² whose faces differ by (\d+) K\. Find the slab's thermal conductivity\.$/,
    m => ({ value: n(m[1]) * n(m[2]) / 1000 / (n(m[3]) * n(m[4])), unit: 'W/m·K' })],
  [/^A surface of ([\d.]+) m² has a convection coefficient h = (\d+) W\/m²·K\. Find its convection resistance\.$/, m => ({ value: 1 / (n(m[1]) * n(m[2])), unit: 'K/W' })],
  [/^A ([\d.]+) m² surface at (\d+) °C loses heat to air at (\d+) °C with h = (\d+) W\/m²·K\. Find the heat flow\.$/, m => ({ value: n(m[4]) * n(m[1]) * (n(m[2]) - n(m[3])), unit: 'W' })],
  [/^A wall of ([\d.]+) m²: inside film h = (\d+) W\/m²·K, then (\d+) mm of .+ \(k = ([\d.]+) W\/m·K\), then outside film h = (\d+) W\/m²·K\. Inside air (-?\d+) °C, outside air (-?\d+) °C\. Find the (heat flow through the wall|temperature of the wall's inside surface)\.$/,
    m => { const A = n(m[1]), R1 = 1 / (n(m[2]) * A), R = R1 + n(m[3]) / 1000 / (n(m[4]) * A) + 1 / (n(m[5]) * A), Q = (n(m[6]) - n(m[7])) / R;
      return m[8].startsWith('heat') ? { value: Q, unit: 'W' } : { value: n(m[6]) - Q * R1, unit: '°C' }; }],
];
function solve(prompt, options) {
  for (const [re, f] of RULES) { const m = prompt.match(re); if (m) return f(m, options); }
  throw new Error(`no hand method for: ${prompt}`);
}
const typed = a => `${+a.value.toPrecision(5)}${a.unit ? ` ${a.unit}` : ''}`;

const SETS = [
  { name: 'machine', nodes: MN, gens: MG, mis: MM, prefix: /^ENG\.machine\.[a-z-]+$/, term: /Design of Machine Elements, sem V/ },
  { name: 'thermal', nodes: TN, gens: TG, mis: TM, prefix: /^ENG\.thermal\.[a-z-]+$/, term: /Heat and Mass Transfer, sem VI/ },
];

for (const S of SETS) {
  test(`${S.name}: nodes are small, named for their course, and each has its own generator`, () => {
    assert.ok(S.nodes.length >= 3 && S.nodes.length <= 6);
    for (const x of S.nodes) { assert.match(x.id, S.prefix); assert.match(x.title, S.term); assert.ok(S.gens[x.items], x.items); assert.equal(S.gens[x.items].competency, x.id); }
    for (const [gid, g] of Object.entries(S.gens)) assert.ok(S.nodes.some(x => x.items === gid), `${gid} has no node`);
  });

  test(`${S.name}: every item over ${SEEDS.length} seeds is solved by hand from its visible text, and the typed answer is accepted`, () => {
    let count = 0;
    for (const [gid, g] of Object.entries(S.gens)) {
      assert.deepEqual(g.aspects, ['concept', 'procedure', 'transfer'], gid);
      for (const aspect of g.aspects) {
        const prompts = new Set();
        for (const seed of SEEDS) {
          const it = g.make(seed, aspect), tag = `${gid}/${aspect}/${seed}`;
          assert.deepEqual(g.make(seed, aspect), it, `${tag}: deterministic`);
          assert.deepEqual(JSON.parse(JSON.stringify(it)), it, `${tag}: plain data`);
          assert.equal(it.competency, g.competency); assert.equal(it.aspect, aspect); assert.equal(it.key, 'formula');
          for (const t of [it.prompt, ...it.solution, ...(it.answer.options ?? [])]) {
            assert.doesNotMatch(t, /NaN|undefined|Infinity|\[object/, `${tag}: ${t}`);
            assert.doesNotMatch(t, /\.\d*([1-9]0{5,}[1-9]|9{6,})/, `${tag} float noise: ${t}`);
          }
          // every given in figure.params is shown in the prompt
          for (const [k, v] of Object.entries(it.figure.params)) if (typeof v === 'number') assert.ok(it.prompt.includes(String(v)), `${tag}: given ${k} = ${v} not in the prompt`);
          for (const m of it.misconceptions) { assert.equal(m.label, S.mis[m.id], `${tag}: ${m.id}`); }
          const a = solve(it.prompt, it.answer.options ?? []);
          if (it.answer.kind === 'choice') {
            assert.equal(a.choice, it.answer.correct, tag);
            assert.equal(checkResponse(it, a.choice).result, 'correct');
            for (const m of it.misconceptions) assert.ok(m.option !== it.answer.correct && m.option >= 0, tag);
          } else {
            assert.ok(Math.abs(a.value - it.answer.value) <= 1e-9 * Math.abs(a.value), `${tag}: hand ${a.value} vs key ${it.answer.value}`);
            assert.equal(a.unit, it.answer.unit, tag);
            assert.equal(checkResponse(it, typed(a)).result, 'correct', `${tag}: typed “${typed(a)}”`);
            for (const m of it.misconceptions) {
              assert.ok(Number.isFinite(m.value) && Math.abs(m.value - it.answer.value) > it.answer.tol * Math.abs(it.answer.value), `${tag}: ${m.id} too close`);
              assert.equal(checkResponse(it, typed({ value: m.value, unit: it.answer.unit })).misconception ?? m.id, m.id, `${tag}: ${m.id} named`);
            }
          }
          prompts.add(it.prompt); count++;
        }
        if (aspect !== 'concept') assert.ok(prompts.size > 20, `${gid}/${aspect}: ${prompts.size} distinct prompts`);
      }
    }
    assert.ok(count >= S.nodes.length * 3 * SEEDS.length);
  });
}

// ---------- the same formulas on the benches ----------
test('machine: the critical-speed item agrees with the shaft bench (one disc, light shaft, rigid bearings)', () => {
  for (const seed of SEEDS.slice(0, 30)) {
    const it = MG['machine.critical'].make(seed, 'transfer'), { m, L, d } = it.figure.params;
    const s = M.emptySetup(); M.setSelfWeight(s, false); M.addSegment(s, { L, d }); M.addBearing(s, 0); M.addBearing(s, L); M.addForce(s, L / 2, m * 9.81, m, 0); M.setSpeed(s, 1000);
    const e = M.evaluate(s); assert.ok(e.ok, e.reason);
    assert.ok(Math.abs(e.outputs.critical.value - it.answer.value) <= 1e-6 * it.answer.value, `${e.outputs.critical.value} vs ${it.answer.value}`);
  }
});
test('machine: pure torsion on the shaft bench gives von Mises √3·τ with τ from the torsion item formula', () => {
  for (const seed of SEEDS.slice(0, 30)) {
    const it = MG['machine.torsion'].make(seed, 'procedure'), { d, T: Tq } = it.figure.params;
    const s = M.emptySetup(); M.setSelfWeight(s, false); M.addSegment(s, { L: 500, d }); M.addBearing(s, 0); M.addBearing(s, 500); M.addTorque(s, 100, Tq); M.addTorque(s, 400, -Tq); M.setSpeed(s, null);
    const e = M.evaluate(s); assert.ok(e.ok, e.reason);
    assert.ok(Math.abs(e.outputs.stress.value - Math.sqrt(3) * it.answer.value) <= 1e-6 * it.answer.value);
    assert.ok(Math.abs(e.outputs.torque.value - Tq) <= 1e-9 * Tq);
  }
});
test('thermal: the series-wall item agrees with the thermal bench (plane wall, two films)', () => {
  const MAT = { 'common brick': 'brick', concrete: 'concrete', 'glass-fibre blanket': 'glassWool', 'extruded polystyrene': 'polystyrene', softwood: 'softwood', 'plaster board': 'plaster' };
  for (const seed of SEEDS.slice(0, 30)) {
    const it = TG['thermal.series'].make(seed, 'procedure'), p = it.figure.params, name = it.prompt.match(/mm of (.+) \(k =/)[1];
    assert.equal(T.MATERIALS[MAT[name]].k, p.k, name);
    const s = T.emptySetup(); T.setArea(s, p.A); T.setStart(s, 'temp', p.Ti); T.setAmbient(s, p.To);
    T.addLayer(s, 'convection', { mode: 'h', h: p.h1 }); T.addLayer(s, 'conduction', { material: MAT[name], t: p.t / 1000 }); T.addLayer(s, 'convection', { mode: 'h', h: p.h2 });
    const e = T.evaluate(s); assert.ok(e.ok, e.reason);
    assert.ok(Math.abs(e.outputs.Q.value - it.answer.value) <= 1e-6 * Math.abs(it.answer.value), `${e.outputs.Q.value} vs ${it.answer.value}`);
  }
});
