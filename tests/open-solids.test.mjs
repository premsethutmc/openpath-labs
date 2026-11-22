// Open solids benches: the opened Mount lab model and the LEARN descriptors of the Mount lab and the Force Playground.
// Hand formulas are written out here (Euler–Bernoulli beam tables), independent of the engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as P from '../core/project.mjs';
import { NODES as STATICS } from '../content/graph/statics.mjs';
import { NODES as SOLIDS } from '../content/graph/solids.mjs';
import { GENERATORS as GS } from '../content/items/statics.mjs';
import { GENERATORS as GSOL } from '../content/items/solids.mjs';
import { READING_ADAPTER, evaluateReading, defaultBench, stations, SUPPORTS, DIMS } from '../mount/model.mjs';
import { SOLIDS_ADAPTER } from '../playground/model.mjs';
import MOUNT, { applyLever as mountApply } from '../mount/learn.mjs';
import PLAY from '../playground/learn.mjs';
import { PRESETS } from '../playground/presets.mjs';

const close = (a, b, rel = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${msg} ${a} vs ${b}`);
const LEGACY = JSON.parse(readFileSync(new URL('./fixtures/legacy-solids-runs.json', import.meta.url)));
const NODE = new Map([...STATICS, ...SOLIDS].map(n => [n.id, n])), GEN = { ...GS, ...GSOL };
const hasGenerator = id => NODE.has(id) && !!GEN[NODE.get(id).items];
const leaves = (o, pre = '') => (o === null || typeof o !== 'object' ? [pre] : Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)));

// ---------- old runs ----------
test('runs saved before the open bench still reproduce, on both benches (fixture saved with the a89d81e adapters)', () => {
  for (const [project, adapter] of [[LEGACY.mount, READING_ADAPTER], [LEGACY.playground, SOLIDS_ADAPTER]]) {
    assert.ok(project.runs.length >= 19);
    for (const run of project.runs) assert.deepEqual(P.reproduceRun(run, adapter), { ok: true, diffs: [] }, run.name);
  }
});

const ALU = { material: 'aluminium', shape: 'rect', b: 40, h: 30 }, STEEL_RHS = { material: 'steel', shape: 'rhs', b: 40, h: 60, t: 4 };
test('Mount: the default bench gives exactly the guided values (every old output and verdict, bit for bit)', () => {
  for (const design of [ALU, STEEL_RHS]) for (const mount of [100, 200, 350, 500]) for (const loaded of [true, false]) {
    const s = { design, mount, loaded, dialX: mount, strainX: 250 }, a = evaluateReading(s), b = evaluateReading({ ...s, bench: defaultBench() });
    assert.deepEqual(Object.keys(a.outputs), ['deflection', 'strain', 'stress', 'mass', 'I', 'E']);
    for (const k of Object.keys(a.outputs)) assert.equal(b.outputs[k].value, a.outputs[k].value, k);
    for (const k of Object.keys(a.verdicts)) assert.equal(b.verdicts[k].value, a.verdicts[k].value, k);
  }
  // a setup without a bench keeps the mission's rules: two materials, machine 100–500 mm
  assert.equal(evaluateReading({ design: { ...ALU, material: 'timber' }, mount: 200, loaded: true, dialX: 200, strainX: 200 }).ok, false);
  assert.equal(evaluateReading({ design: ALU, mount: 50, loaded: true, dialX: 50, strainX: 50 }).ok, false);
});

// ---------- the opened Mount model against beam tables ----------
const I = d => d.b * d.h ** 3 / 12;
const read = (design, bench, mount) => evaluateReading({ design, mount, loaded: true, dialX: mount, strainX: mount, bench: { ...defaultBench(), ...bench } });
test('Mount open bench: pin–roller, fixed–fixed, propped and cantilever beams against hand formulas', () => {
  const d = { material: 'steel', shape: 'rect', b: 50, h: 80 }, E = 200000, EI = E * I(d), c = 40;
  // simply supported, 1200 mm, 6000 N at the centre: δ = PL³/48EI, R = P/2, M = PL/4
  let r = read(d, { span: 1200, load: 6000 }, 600).outputs, P = 6000, L = 1200;
  close(r.deflection.value, P * L ** 3 / (48 * EI)); close(r.reactionLeft.value, P / 2); close(r.maxMoment.value, P * L / 4 / 1000);
  // off-centre a = 300: δ = P a² b² / (3 E I L), R_left = P b / L
  r = read(d, { span: 1200, load: 6000 }, 300).outputs;
  close(r.deflection.value, P * 300 ** 2 * 900 ** 2 / (3 * EI * L)); close(r.reactionLeft.value, P * 900 / L); close(r.reactionRight.value, P * 300 / L);
  // fixed–fixed, centre load: δ = PL³/192EI, end moments PL/8, R = P/2, peak stress (PL/8)·c/I
  r = read(d, { span: 1200, load: 6000, supports: 'fixed-fixed' }, 600).outputs;
  close(r.deflection.value, P * L ** 3 / (192 * EI)); close(r.momentLeft.value, P * L / 8 / 1000); close(r.momentRight.value, P * L / 8 / 1000);
  close(r.reactionLeft.value, P / 2); close(r.maxStress.value, P * L / 8 * c / I(d)); close(r.fos.value, 250 / (P * L / 8 * c / I(d)));
  // fixed–fixed, load at a = 400, b = 800: δ under load = P a³ b³ / (3 E I L³), M_A = P a b² / L², R_A = P b² (3a + b) / L³
  r = read(d, { span: 1200, load: 6000, supports: 'fixed-fixed' }, 400).outputs;
  close(r.deflection.value, P * 400 ** 3 * 800 ** 3 / (3 * EI * L ** 3)); close(r.momentLeft.value, P * 400 * 800 ** 2 / L ** 2 / 1000); close(r.reactionLeft.value, P * 800 ** 2 * (3 * 400 + 800) / L ** 3);
  // propped cantilever (fixed left, roller right), centre load: δ under load = 7PL³/768EI, roller reaction 5P/16, wall moment 3PL/16
  r = read(d, { span: 1200, load: 6000, supports: 'fixed-roller' }, 600).outputs;
  close(r.deflection.value, 7 * P * L ** 3 / (768 * EI)); close(r.reactionRight.value, 5 * P / 16); close(r.momentLeft.value, 3 * P * L / 16 / 1000);
  // cantilever 900 mm, 2000 N at the tip: δ = PL³/3EI, wall reaction P, wall moment PL; load at a = 450: δ = P a³/3EI
  P = 2000; L = 900;
  r = read(d, { span: 900, load: 2000, supports: 'cantilever' }, 900).outputs;
  close(r.deflection.value, P * L ** 3 / (3 * EI)); close(r.reactionLeft.value, P); close(r.momentLeft.value, P * L / 1000); assert.equal(r.reactionRight, undefined);
  r = read(d, { span: 900, load: 2000, supports: 'cantilever' }, 450).outputs;
  close(r.deflection.value, P * 450 ** 3 / (3 * EI)); close(r.maxDeflection.value, P * 450 ** 2 * (3 * L - 450) / (6 * EI));
  // mass follows the span: ρ A L
  close(r.mass.value, 7850 * 50 * 80 * 1e-9 * 900);
});

test('Mount open bench: every material, brittle strength, own limits, refused set-ups', () => {
  const d = { material: 'timber', shape: 'rect', b: 50, h: 80 }, L = 2000, P = 1500, M = P * L / 4, sigma = M * 40 / I(d);
  const r = read(d, { span: L, load: P, limits: { deflection: 5, yieldFactor: 1.5, mass: 10 } }, 1000);
  assert.ok(r.ok); close(r.outputs.maxStress.value, sigma); close(r.outputs.fos.value, 30 / sigma);   // timber: lower of 40 tension, 30 compression
  close(r.outputs.deflection.value, P * L ** 3 / (48 * 11000 * I(d)));
  assert.equal(r.verdicts.alignment.value, P * L ** 3 / (48 * 11000 * I(d)) <= 5 ? 'pass' : 'fail');
  assert.equal(r.verdicts.strength.value, sigma <= 30 / 1.5 ? 'pass' : 'fail');
  for (const m of ['steel', 'aluminium', 'timber', 'bamboo', 'castIron']) assert.ok(read({ ...d, material: m }, {}, 300).ok, m);
  assert.equal(read(d, { span: 1210 }, 300).ok, false);
  assert.equal(read(d, { load: 0 }, 300).ok, false);
  assert.equal(read(d, { supports: 'pin-pin-pin' }, 300).ok, false);
  assert.equal(read(d, { span: 600 }, 600).ok, false);                               // on the roller
  assert.ok(read(d, { span: 600, supports: 'cantilever' }, 600).ok);                  // the free end is a station
  assert.equal(read(d, { limits: { deflection: 0.1, yieldFactor: 0.5, mass: 1 } }, 300).ok, false);
  assert.deepEqual(stations({ span: 300, supports: 'pin-roller' }), [50, 100, 150, 200, 250]);
  assert.deepEqual(stations({ span: 200, supports: 'cantilever' }), [50, 100, 150, 200]);
});

// ---------- LEARN descriptors ----------
const MOUNT_SETUPS = [
  { design: ALU, mount: 200, loaded: true, dialX: 200, strainX: 200 },                                   // a journey / mission setup
  { design: STEEL_RHS, mount: 300, loaded: false, dialX: 100, strainX: 300, bench: defaultBench() },
  { design: { material: 'castIron', shape: 'I', b: 40, h: 80, tw: 5, tf: 6 }, mount: 700, loaded: true, dialX: 700, strainX: 350, bench: { span: 1500, load: 4000, supports: 'fixed-fixed', limits: { deflection: 0.5, yieldFactor: 3, mass: 8 } } },
  { design: { material: 'bamboo', shape: 'rect', b: 40, h: 60 }, mount: 800, loaded: true, dialX: 800, strainX: 50, bench: { span: 800, load: 300, supports: 'cantilever', limits: { deflection: 10, yieldFactor: 2, mass: 3 } } },
  { design: ALU, mount: 450, loaded: true, dialX: 450, strainX: 450, bench: { span: 900, load: 2000, supports: 'fixed-roller', limits: { deflection: 1, yieldFactor: 2, mass: 2 } } },
];
const KEYS = ['id', 'name', 'editable', 'copiedFrom', 'setting', 'gap', 'view', 'deckWidth', 'sideHeight', 'hang', 'question', 'nodes', 'members', 'supports', 'groups', 'materials', 'sections', 'loadChoices'];
const presetSetup = p => ({ object: Object.fromEntries(KEYS.filter(k => p[k] !== undefined).map(k => [k, JSON.parse(JSON.stringify(p[k]))])), state: { material: p.material, section: p.section, scenario: 'normal', loads: p.loads }, v: 2 });
const PLAY_SETUPS = [...PRESETS.map(presetSetup), ...LEGACY.playground.runs.slice(-1).map(r => ({ ...r.setup, v: 2 }))];

for (const [name, L, setups, adapter] of [['Mount', MOUNT, MOUNT_SETUPS, READING_ADAPTER], ['Force Playground', PLAY, PLAY_SETUPS, SOLIDS_ADAPTER]]) {
  test(`${name} LEARN: shape, page and adapter`, async () => {
    assert.equal(L.domain, adapter.domain);
    assert.match(L.page, /\?project=current$/);
    assert.equal(await L.adapter(), adapter);
    for (const k of ['describe', 'levers', 'outputsFor']) assert.equal(typeof L[k], 'function');
  });
  test(`${name} LEARN: every output's competency is in the graph with an item generator, and every key is a real output`, () => {
    for (const [k, o] of Object.entries(L.outputs)) assert.ok(hasGenerator(o.competency), `${k} → ${o.competency}`);
    for (const s of setups) {
      const r = adapter.evaluate(s), outs = L.outputsFor(s);
      assert.ok(r.ok, JSON.stringify(s).slice(0, 80));
      assert.ok(Object.keys(outs).length >= 3);
      for (const [k, o] of Object.entries(outs)) { assert.ok(k in r.outputs, `${k} is an output`); assert.ok(hasGenerator(o.competency), `${k} → ${o.competency}`); assert.equal(typeof o.label, 'string'); }
    }
  });
  test(`${name} LEARN: describe covers every path of the setup`, () => {
    for (const s of setups) {
      const rows = L.describe(s), covered = new Set(rows.flatMap(r => r.paths));
      for (const r of rows) { assert.equal(typeof r.label, 'string'); assert.ok(String(r.value).length > 0, r.label); assert.ok(!/undefined|NaN/.test(r.value), `${r.label}: ${r.value}`); }
      for (const p of leaves(s)) assert.ok(covered.has(p), `path ${p} is described`);
    }
  });
  test(`${name} LEARN: every lever value gives a valid setup`, () => {
    const apply = L.applyLever ?? ((s, l, v) => L.setPath(s, l.path, v));
    for (const s of setups) {
      const ls = L.levers(s);
      assert.ok(ls.length >= 3, `${ls.length} levers`);
      for (const l of ls) {
        assert.ok(l.kind === 'option' ? l.options.length > 1 && l.optionLabels.length === l.options.length : l.min < l.max && l.step > 0, l.path);
        const values = l.kind === 'option' ? l.options : [l.min, l.max, ...[0.2, 0.5, 0.8].map(f => l.min + Math.round((l.max - l.min) * f / l.step) * l.step)];
        for (const v of values) { const r = adapter.evaluate(apply(s, l, v)); assert.ok(r.ok, `${l.path} = ${v}: ${r.reason}`); }
      }
    }
  });
}

test('Mount LEARN: levers cover material (every material on the open bench), shape, dimensions, span, load, position and supports', () => {
  const open = MOUNT_SETUPS[1], paths = MOUNT.levers(open).map(l => l.path);
  for (const p of ['design.material', 'design.shape', 'design.b', 'design.h', 'design.t', 'mount', 'bench.span', 'bench.load', 'bench.supports']) assert.ok(paths.includes(p), p);
  assert.equal(MOUNT.levers(open).find(l => l.path === 'design.material').options.length, 5);
  assert.deepEqual(MOUNT.levers(MOUNT_SETUPS[0]).find(l => l.path === 'design.material').options, ['steel', 'aluminium']);   // the mission's own setup
  assert.deepEqual(MOUNT.levers(open).find(l => l.path === 'bench.supports').options, Object.keys(SUPPORTS));
  // a new shape brings its own dimensions; moving the machine takes the gauges that sat under it
  const toI = mountApply(open, MOUNT.levers(open).find(l => l.path === 'design.shape'), 'I');
  assert.deepEqual(Object.keys(toI.design).sort(), ['material', 'shape', ...DIMS.I.map(d => d[0])].sort());
  const moved = mountApply(MOUNT_SETUPS[0], MOUNT.levers(MOUNT_SETUPS[0]).find(l => l.path === 'mount'), 400);
  assert.deepEqual([moved.mount, moved.dialX, moved.strainX], [400, 400, 400]);
  // cantilever reactions map to the fixed-support competency, simply supported to beam reactions
  assert.equal(MOUNT.outputsFor(MOUNT_SETUPS[3]).reactionLeft.competency, 'ENG.statics.cantilever-reactions');
  assert.equal(MOUNT.outputsFor(MOUNT_SETUPS[1]).reactionLeft.competency, 'ENG.statics.beam-reactions');
  assert.equal(MOUNT.outputsFor(MOUNT_SETUPS[0]).fos, undefined);   // a setup without a bench has the six old outputs only
});

test('Force Playground: reactions balance the loads by hand, and the shelf is a cantilever', () => {
  // the learner's own truss from the fixture: ΣFy = 0 → the reactions carry the car plus the structure's own weight
  const s = PLAY_SETUPS[PLAY_SETUPS.length - 1], r = SOLIDS_ADAPTER.evaluate(s).outputs, o = PLAY.outputsFor(s);
  const tube = d => Math.PI * (d.d ** 2 - (d.d - 2 * d.t) ** 2) / 4, lengths = [3000, 3000, Math.hypot(3000, 2000), Math.hypot(3000, 2000), 2000];
  const self = 7850 * tube({ d: 114, t: 5 }) * 1e-9 * lengths.reduce((a, b) => a + b) * 9.81;
  close(r['reaction:0'].value + r['reaction:2'].value, 1200 * 9.81 + self, 1e-6);
  close(r.mass.value * 9.81, self, 1e-9);
  assert.equal(o['reaction:0'].competency, 'ENG.statics.equilibrium-2d');
  const shelf = presetSetup(PRESETS.find(p => p.id === 'shelf'));
  assert.equal(PLAY.outputsFor(shelf)['moment:0'].competency, 'ENG.statics.cantilever-reactions');
  // without v (a run saved before), the five old outputs only
  assert.deepEqual(Object.keys(SOLIDS_ADAPTER.evaluate({ ...s, v: undefined }).outputs), ['sf', 'stress', 'movement', 'load', 'mass']);
});

test('Mount LEARN: a defence question that puts the section shape back gives Revision 1’s own section, worked by hand', async () => {
  const { defendFrom } = await import('../core/open-loop.mjs');
  const bench = { span: 1200, load: 600, supports: 'cantilever', limits: { deflection: 12, yieldFactor: 2, mass: 5 } };
  const R1 = { design: { material: 'timber', shape: 'rect', b: 50, h: 80 }, mount: 900, loaded: true, dialX: 900, strainX: 900, bench };
  const R2 = { ...R1, design: { material: 'timber', shape: 'I', b: 50, h: 80, tw: 6, tf: 10 } };
  const qs = defendFrom(MOUNT, R2, { from: R1, picked: ['maxDeflection', 'fos'], adapter: READING_ADAPTER });
  assert.equal(qs.length, 1);
  assert.match(qs[0].prompt, /^What would the largest deflection \(under the operating load\) be if the section shape went back to its Revision 1 value \(Solid rectangle instead of I-section\)\?$/);
  const back = { ...R2, ...qs[0].change };
  assert.deepEqual(back.design, R1.design);   // not the bench's default 40 × 30 rectangle
  // cantilever, load P at a: tip deflection P·a²·(3L − a) / (6·E·I)
  const I = 50 * 80 ** 3 / 12, hand = 600 * 900 ** 2 * (3 * 1200 - 900) / (6 * 11000 * I);
  close(READING_ADAPTER.evaluate(back).outputs.maxDeflection.value, hand, 1e-6, 'tip deflection');
  // without Revision 1 (a lever tried on its own) a new shape still brings the bench's defaults
  assert.deepEqual(mountApply(R2, MOUNT.levers(R2).find(l => l.path === 'design.shape'), 'rect').design, { material: 'timber', shape: 'rect', b: 40, h: 30 });
});
