// LEARN descriptors of the fluid line, machine and thermal benches (docs/OPEN_LOOP.md): every output competency exists
// in the merged graph with an item generator; every output the adapter really produces is either mapped or on the
// bench's stated not-mapped list (dynamic gauge, bearing and thermometer keys included); every lever value is a valid
// setup that differs from the current one only at the lever's path; describe() covers every setup path. Checked on
// the presets and on many lines built from the empty workspace that no preset describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, buildItems, checkItems } from '../core/graph.mjs';
import { setupDiff } from '../core/project.mjs';
import { rng } from '../core/rng.mjs';
import * as CATALOG from '../content/catalog.mjs';
import PIPE from '../content/journeys/pipe.mjs';
import FLUID, { describe as describeLine } from '../circuit/learn.mjs';
import MACHINE from '../machine/learn.mjs';
import THERMAL from '../thermal/learn.mjs';
import * as C from '../circuit/model.mjs';
import * as M from '../machine/model.mjs';
import * as T from '../thermal/model.mjs';

const graph = buildGraph(...(await Promise.all(CATALOG.GRAPH.map(f => f()))).map(m => m.NODES));
const items = buildItems(...(await Promise.all(CATALOG.ITEMS.map(f => f()))).map(m => m.GENERATORS));
const flat = (o, pre = '') => o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, pre ? `${pre}.${k}` : k)) : [[pre, o]];
const covered = (rows, path) => rows.some(r => (r.paths ?? []).some(p => path === p || path.startsWith(`${p}.`)));

// ---- lines built from the empty workspace, part by part, with the bench's own edit functions ----
function randomLine(seed) {
  const r = rng(`line:${seed}`), s = C.emptySetup(), bore = () => r.pick([0.025, 0.032, 0.04, 0.05, 0.065, 0.08]);
  const pumped = r.next() < 0.75, src = pumped ? r.int(-30, 30) / 10 : r.int(40, 150) / 10;
  C.addPart(s, 'source', { surface: src, outlet: Math.min(src, 0), inlet: r.pick(['square', 'footValve']) });
  C.addPart(s, 'pipe', { D: bore(), L: r.int(1, 10), material: r.pick(['pvc', 'steel', 'gi', 'ci']), rise: 0 });
  if (pumped) C.addPart(s, 'pump', { rpm: r.pick([1450, 2000, 2900, 3000]), D2: r.int(110, 160) / 1000, motorId: r.pick(['none', '2p-2.2', '4p-1.5', '2p-3.0']) });
  const n = r.int(1, 4);
  for (let i = 0; i < n; i++) {
    const extra = r.pick(['elbow', 'valve', 'checkValve', 'orifice', null]);
    if (extra === 'valve') C.addPart(s, 'valve', { open: r.int(4, 20) * 5 / 100 }); else if (extra === 'orifice') C.addPart(s, 'orifice', { beta: r.pick([0.4, 0.5, 0.6]) }); else if (extra) C.addPart(s, extra);
    C.addPart(s, 'pipe', { D: bore(), L: r.int(2, 120), material: r.pick(['pvc', 'steel', 'gi', 'oldgi']), rise: r.int(0, 8) });
  }
  C.addPart(s, 'sink', { surface: pumped ? r.int(0, 15) : r.int(0, 30) / 10 });
  for (const p of s.chain.slice(0, -1)) if (r.next() < 0.4) C.toggleGauge(s, p.id);
  if (r.next() < 0.5) C.setRequiredFlow(s, r.int(5, 40) / 10);
  C.setTemp(s, r.pick([15, 20, 30, 40]));
  return s;
}
const LINES = [...C.PRESETS.map(p => C.fromPreset(p.id)), ...Array.from({ length: 80 }, (_, i) => randomLine(i)).filter(s => C.ADAPTER.evaluate(s).ok)];
test('fluid line: most random lines built from the empty workspace solve', () => assert.ok(LINES.length - C.PRESETS.length >= 40, String(LINES.length - C.PRESETS.length)));
const SHAFTS = M.PRESETS.map(p => M.fromPreset(p.id));
{ // a shaft from the empty bench: two segments, two bearings, a disc and a torque pair, rotating
  const s = M.emptySetup(); const a = M.addSegment(s, { L: 300, d: 30 }); M.addSegment(s, { L: 300, d: 40 }, a);
  M.addBearing(s, 0); M.addBearing(s, 600); M.addForce(s, 350, 400, 40, 20); M.addTorque(s, 50, 75); M.addTorque(s, 350, -75); SHAFTS.push(s);
}
const PATHS = T.PRESETS.map(p => T.fromPreset(p.id));
{ // a wall from the empty bench with a heat source start
  const s = T.emptySetup(); T.setArea(s, 3); T.setStart(s, 'heat', 300); T.setAmbient(s, 5);
  T.addLayer(s, 'conduction', { material: 'brick', t: 0.2 }); const g = T.addLayer(s, 'conduction', { material: 'glassWool', t: 0.05 }); T.addLayer(s, 'convection', { mode: 'h', h: 20 });
  T.toggleThermometer(s, 'start'); T.toggleThermometer(s, g); PATHS.push(s);
}

const BENCHES = [
  { name: 'fluid line', L: FLUID, model: C, setups: LINES, notMapped: ['npshr', 'motorRating'], dynamic: [/^gauge:/] },
  { name: 'machine', L: MACHINE, model: M, setups: SHAFTS, notMapped: ['slope', 'mass', 'fatigueSF', 'Se', 'amplitude', 'speed', /^L10h:/, /^R:/], dynamic: [/^R:/] },
  { name: 'thermal', L: THERMAL, model: T, setups: PATHS, notMapped: ['finEta', 'finEff', 'tipT', 'rCrit', 'tTime', 'startT'], dynamic: [/^T:/] },
];
const listed = (list, k) => list.some(x => (x instanceof RegExp ? x.test(k) : x === k));

test('graph: the catalogue with the new machine and thermal nodes builds, and every node has its generator', () => {
  assert.deepEqual(checkItems(graph, items), []);
  for (const id of ['ENG.machine.torque-power', 'ENG.machine.torsion-stress', 'ENG.machine.combined-stress', 'ENG.machine.critical-speed',
    'ENG.thermal.conduction-resistance', 'ENG.thermal.convection-resistance', 'ENG.thermal.series-resistance']) {
    const n = graph.node(id); assert.ok(n, id); assert.ok(items.has(n.items), `${id}: generator ${n.items}`);
  }
});

for (const B of BENCHES) {
  test(`${B.name}: descriptor shape, domain and every output competency exists with a generator`, async () => {
    const adapter = await B.L.adapter();
    assert.equal(adapter.domain, B.L.domain); assert.equal(adapter, B.model.ADAPTER);
    assert.match(B.L.page, /^\.\.\/[a-z]+\/$/);
    for (const f of ['describe', 'output', 'outputsFor', 'levers', 'applyLever', 'concepts']) assert.equal(typeof B.L[f], 'function', f);
    const comps = new Set(Object.values(B.L.outputs).map(o => o.competency));
    for (const s of B.setups) { Object.values(B.L.outputsFor(s)).forEach(o => comps.add(o.competency)); B.L.concepts(s).forEach(c => comps.add(c)); }
    for (const c of comps) { const n = graph.node(c); assert.ok(n, `${B.name}: unknown competency ${c}`); assert.ok(n.items && items.has(n.items), `${c}: no generator`); assert.ok(items.make(n.items, 1, 'procedure').prompt); }
  });

  test(`${B.name}: every real output is mapped or stated as not mapped; dynamic keys described`, () => {
    let dyn = 0;
    for (const s of B.setups) {
      const r = B.model.ADAPTER.evaluate(s); assert.ok(r.ok, r.reason);
      const mapped = B.L.outputsFor(s);
      for (const k of Object.keys(mapped)) assert.ok(k in r.outputs, `${k} is not an adapter output`);
      for (const [k, o] of Object.entries(r.outputs)) {
        if (mapped[k]) {
          assert.equal(mapped[k].unit, o.unit, k); assert.ok(mapped[k].label && mapped[k].what, k);
          assert.deepEqual(B.L.output(k, s).competency, mapped[k].competency);
          if (B.dynamic.some(re => re.test(k))) { dyn++; assert.doesNotMatch(mapped[k].label, /undefined|null|NaN/, k); }
        } else assert.ok(listed(B.notMapped, k) || o.source !== 'simulated', `${B.name}: output ${k} neither mapped nor listed as not mapped`);
      }
    }
    assert.ok(dyn > 0, `${B.name}: some dynamic keys were exercised`);
  });

  test(`${B.name}: levers give only valid setups, each changing only its own path`, () => {
    let n = 0;
    for (const s of B.setups) for (const l of B.L.levers(s)) {
      assert.ok(['number', 'option'].includes(l.kind) && l.values.length, l.path);
      if (l.kind === 'option') for (const v of l.values) assert.ok(v in l.options, `${l.path}: ${v}`);
      for (const v of l.values) {
        const t = B.L.applyLever(s, l.path, v), r = B.model.ADAPTER.evaluate(t);
        assert.ok(r.ok, `${l.path} = ${v}: ${r.reason}`); assert.notEqual(v, l.value);
        const d = setupDiff(B.name === 'machine' ? M.upgrade(s) : s, t).map(x => x.path ?? x);
        assert.ok(d.length >= 1 && d.every(p => p === l.path || (B.name === 'thermal' && /\.kind$|^layers\.\d+\.kind$/.test(p)) || (B.name === 'machine' && /^raisers/.test(p))), `${l.path}: diff ${JSON.stringify(d)}`);
        n++;
      }
    }
    assert.ok(n > 20, `${B.name}: ${n} lever values checked`);
  });

  test(`${B.name}: describe covers every setup path`, () => {
    for (const s0 of B.setups) {
      const s = B.name === 'machine' ? M.upgrade(s0) : s0, rows = B.L.describe(s);
      assert.ok(rows.every(r => typeof r.label === 'string' && typeof r.value === 'string' && !/undefined|NaN|\[object/.test(r.value) && Array.isArray(r.paths)), JSON.stringify(rows));
      for (const [p] of flat(s)) if (p !== 'nextId') assert.ok(covered(rows, p), `${B.name}: ${p} not described`);
    }
  });
}

test('fluid line: one describer for the open loop and the pipe worked example; the empty workspace reads sensibly', () => {
  assert.equal(PIPE.describe, describeLine);
  const rows = describeLine(C.emptySetup());
  assert.deepEqual(rows.map(r => r.label), ['Target flow', 'Water temperature', 'Pressure gauges']);
  assert.equal(rows[0].value, 'none set');
});

test('fluid line: gauge keys name the joint; a stale gauge key is not offered; flow without a pump is a system-curve question', () => {
  const s = C.fromPreset('farm'), o = FLUID.outputsFor(s);
  assert.equal(o['gauge:p5'].label, 'Gauge pressure between #5 Gate valve and #6 Pipe');
  assert.equal(o['gauge:p6'].competency, 'ENG.fluids.energy-equation');
  assert.equal(FLUID.output('gauge:p99', s), null); assert.equal(FLUID.output('npshr', s), null);
  assert.equal(o.torque.competency, 'ENG.machine.torque-power'); assert.equal(o.flow.competency, 'ENG.fluids.operating-point');
  assert.equal(FLUID.outputsFor(C.fromPreset('gravity')).flow.competency, 'ENG.fluids.system-curve');
  assert.deepEqual(FLUID.outputsFor(C.emptySetup()), {});
  // the bore lever steps to the neighbouring standard sizes
  assert.deepEqual(FLUID.levers(s).find(l => l.path === 'chain.5.D').values, [0.025, 0.04]);
});

test('machine and thermal: reactions only on two bearings; a fixed start temperature is an input, not a prediction', () => {
  const line = M.fromPreset('line');
  assert.equal(Object.keys(MACHINE.outputsFor(line)).filter(k => k.startsWith('R:')).length, 0);
  const pul = M.fromPreset('pulley');
  assert.equal(Object.keys(MACHINE.outputsFor(pul)).filter(k => k.startsWith('R:')).length, 2);
  assert.equal(THERMAL.output('startT', T.fromPreset('wall')), null);
  assert.ok(THERMAL.outputsFor(T.fromPreset('device')).startT);
  assert.match(THERMAL.outputsFor(T.fromPreset('wall'))['T:L2'].label, /after #2/);
});
