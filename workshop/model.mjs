// Workshop model: round stock → lathe operations → revisions → measurements → fit against a mating shaft.
// Pure functions over plain data. No rendering, no network, no randomness that is not seeded from the data.
//
// Three different numbers are kept apart everywhere:
//   • target   — what the drawing asks for (part.spec). Never used to decide a fit.
//   • as-cut   — the simulated true size after an operation (commanded size + a labelled simulated offset).
//                Hidden from the user unless they choose to reveal the simulation truth. Never used to decide a fit.
//   • reading  — what a chosen instrument shows, with that instrument's resolution and maximum error.
//                Fit and drawing checks use readings only.
//
// What is simulated: the order of operations, the geometry they leave, a repeatable simulated offset per operation,
// and instrument readings. What is NOT simulated: cutting forces, tool deflection, chatter, tool wear, heat,
// surface finish, roundness, taper, chucking distortion, material-specific cutting error, press-fit force,
// gear teeth. Material affects mass only.

// ---------- materials (density only; that is all the model uses) ----------
export const MATERIALS = {
  al6061: { id: 'al6061', name: 'Aluminium 6061-T6', density: 2700, source: 'ASM Aerospace Specification Metals, 6061-T6 data sheet: 2.70 g/cm³' },
  steel1045: { id: 'steel1045', name: 'Steel AISI 1045 (C45)', density: 7870, source: 'MatWeb, AISI 1045 steel: 7.87 g/cm³' },
  brass360: { id: 'brass360', name: 'Free-cutting brass C36000', density: 8500, source: 'Copper Development Association, C36000: 8.50 g/cm³' },
};

export const STOCK_DIAMETERS = [25, 32, 40, 50, 65, 80];   // mm, round bar
export const STOCK_LENGTH = [10, 150];                      // mm
export const DRILLS = Array.from({ length: 41 }, (_, i) => 5 + i * 0.5);   // 5.0 … 25.0 mm jobber drills
export const MIN_WALL = 2;                                  // mm radial wall the lathe bench will allow

// Simulated machining offsets (mm on diameter or length): as-cut = commanded + bias + uniform(−spread, +spread).
// Illustrative values chosen to be typical of a manual lathe; they are labelled simulated, identical for every
// material, and not derived from cutting physics.
export const OFFSETS = {
  face: { bias: 0, spread: 0.02, note: 'facing to length' },
  turn: { bias: 0.004, spread: 0.006, note: 'turning the outside diameter' },
  drill: { bias: 0.03, spread: 0.03, note: 'twist drills cut slightly oversize' },
  bore: { bias: -0.006, spread: 0.004, note: 'a boring pass tends to leave the hole slightly small' },
};

// Instruments: resolution (smallest step shown) and maximum error of a reading (incl. resolution), in mm.
// Typical class values for the instrument type; not a calibration certificate.
export const INSTRUMENTS = {
  caliper: { id: 'caliper', name: 'Vernier caliper', resolution: 0.02, maxError: 0.03, features: ['bore', 'od', 'length', 'shaft'] },
  boreGauge: { id: 'boreGauge', name: 'Dial bore gauge', resolution: 0.001, maxError: 0.003, features: ['bore'], range: [10, 50] },
  micrometer: { id: 'micrometer', name: 'Outside micrometer', resolution: 0.001, maxError: 0.002, features: ['od', 'length', 'shaft'] },
};
export const FEATURES = { bore: 'Bore', od: 'Outside diameter', length: 'Length', shaft: 'Shaft diameter' };

// Mating shafts on the fit bench. `size` is the simulated true diameter — revealed only with the simulation truth.
export const SHAFTS = [
  { id: 'g20a', name: 'Ø20 ground shaft, batch A', nominal: 20, size: 19.9935, material: 'steel1045' },
  { id: 'g20b', name: 'Ø20 ground shaft, batch B', nominal: 20, size: 19.979, material: 'steel1045' },
  { id: 'd20', name: 'Ø20 bright-drawn bar', nominal: 20, size: 19.962, material: 'steel1045' },
  { id: 'g25', name: 'Ø25 ground shaft', nominal: 25, size: 24.994, material: 'steel1045' },
  { id: 'd25', name: 'Ø25 bright-drawn bar', nominal: 25, size: 24.955, material: 'steel1045' },
];

// Quick-fill fit ranges: ISO 286-2 limits for nominal sizes over 18 up to 30 mm (clearance = bore − shaft, mm;
// negative = interference). Any range can be typed instead.
export const FIT_RANGES = [
  { id: 'H7/g6', name: 'H7/g6 sliding', min: 0.007, max: 0.041 },
  { id: 'H7/h6', name: 'H7/h6 locational clearance', min: 0, max: 0.034 },
  { id: 'H7/k6', name: 'H7/k6 transition', min: -0.015, max: 0.019 },
  { id: 'H7/p6', name: 'H7/p6 light press', min: -0.035, max: -0.001 },
];

// Editable starting points. A preset is only stock + material + an operation list + a drawing spec; opening one
// replays the operations through cut(), exactly as if they had been entered by hand.
export const PRESETS = [
  { id: 'gear20', name: 'Gear blank, Ø20 bore', material: 'al6061', stock: { D: 65, L: 30 },
    ops: [{ type: 'face', L: 25 }, { type: 'turn', D: 60 }, { type: 'drill', D: 18 }, { type: 'bore', D: 19.95 }],
    spec: { target: 20, lower: 0, upper: 0.021 } },
  { id: 'hub25', name: 'Steel hub, Ø25 bore', material: 'steel1045', stock: { D: 50, L: 40 },
    ops: [{ type: 'face', L: 35 }, { type: 'turn', D: 45 }, { type: 'drill', D: 22 }, { type: 'bore', D: 24.9 }],
    spec: { target: 25, lower: 0, upper: 0.021 } },
];

// ---------- seeded numbers ----------
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const unit = key => { let t = (fnv(key) + 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (key, a) => (unit(key) * 2 - 1) * a;
const r4 = v => Math.round(v * 1e4) / 1e4;
const fix = (v, step) => +(Math.round(v / step) * step).toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
// The plan key deliberately leaves out the material: offsets do not depend on material in this model.
const planKey = (stock, ops) => JSON.stringify({ stock, ops });

// ---------- geometry ----------
export class CutError extends Error {}

function step(g, op, key) {
  const off = OFFSETS[op.type]; if (!off) throw new CutError(`unknown operation ${op.type}`);
  const v = op.type === 'drill' || op.type === 'bore' || op.type === 'turn' ? op.D : op.L;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CutError('enter a size in mm');
  const real = r4(v + off.bias + between(key, off.spread));
  const n = { ...g, nominal: { ...g.nominal } };
  if (op.type === 'face') {
    if (v < 5) throw new CutError('a part shorter than 5 mm cannot be held — choose a longer length');
    if (v >= g.L - 0.005) throw new CutError(`facing makes the part shorter: choose a length below ${g.nominal.L} mm`);
    n.L = real; n.nominal.L = v;
  } else if (op.type === 'turn') {
    if (v >= g.od - 0.005) throw new CutError(`turning makes the outside smaller: choose a diameter below ${g.nominal.od} mm`);
    if (g.bore !== null && v < g.bore + 2 * MIN_WALL) throw new CutError(`that would leave a wall under ${MIN_WALL} mm around the bore`);
    if (v < 5) throw new CutError('diameter too small to hold');
    n.od = real; n.nominal.od = v;
  } else if (op.type === 'drill') {
    if (!DRILLS.includes(v)) throw new CutError('choose a drill from the stand (5.0–25.0 mm in 0.5 mm steps)');
    if (g.bore !== null && v <= g.bore) throw new CutError('the hole is already larger than this drill — it would not cut');
    if (v > g.od - 2 * MIN_WALL) throw new CutError(`that would leave a wall under ${MIN_WALL} mm`);
    n.bore = real; n.nominal.bore = v;
  } else {
    if (g.bore === null) throw new CutError('drill a hole first — a boring bar needs a hole to enter');
    if (v <= g.bore + 0.001) throw new CutError('the boring bar would not cut: the hole is already at least this size. A bore can only be made larger.');
    if (v > g.od - 2 * MIN_WALL) throw new CutError(`that would leave a wall under ${MIN_WALL} mm`);
    n.bore = real; n.nominal.bore = v;
  }
  // The commanded size passed; now check what the cut would actually leave (commanded + simulated offset).
  // Material can only be removed, and the finished wall must respect the minimum. Otherwise refuse the cut.
  if (op.type === 'face' && n.L >= g.L) throw new CutError('the facing tool would not cut at this length — choose a shorter length');
  if (op.type === 'turn' && n.od >= g.od) throw new CutError('the turning tool would not cut at this diameter — choose a smaller diameter');
  if ((op.type === 'drill' || op.type === 'bore') && g.bore !== null && n.bore <= g.bore) throw new CutError(`the ${op.type === 'drill' ? 'drill' : 'boring bar'} would not cut at this size: a hole can only be made larger — choose a larger size`);
  if (n.bore !== null && (n.od - n.bore) / 2 < MIN_WALL) throw new CutError(`the finished wall would be under ${MIN_WALL} mm — choose ${op.type === 'turn' ? 'a larger diameter' : 'a smaller hole'}`);
  return n;
}

// Every revision of a part: rev 0 is the stock as received; rev k is after operation k.
export function revisions(part) {
  const g0 = { od: part.stock.D, L: part.stock.L, bore: null, nominal: { od: part.stock.D, L: part.stock.L, bore: null } };
  const out = [{ rev: 0, op: null, ...g0 }];
  part.ops.forEach((op, i) => out.push({ ...step(out[i], op, planKey(part.stock, part.ops.slice(0, i + 1))), rev: i + 1, op }));
  return out;
}
export const currentRev = part => part.ops.length;
export function mass(part, rev = currentRev(part)) {   // kg, from the simulated as-cut geometry
  const g = revisions(part)[rev], r = MATERIALS[part.material].density;
  return r * Math.PI / 4 * (g.od ** 2 - (g.bore ?? 0) ** 2) * g.L * 1e-9;
}

// ---------- instruments ----------
export class MeasureError extends Error {}
function read(truth, inst, key) {
  const reading = fix(truth + between(key, inst.maxError - inst.resolution / 2) * 0.999, inst.resolution);
  return { reading, maxError: inst.maxError, resolution: inst.resolution, instrument: inst.id };
}
export function measurePart(part, feature, instrumentId, n = 0, rev = currentRev(part)) {
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) throw new MeasureError('choose an instrument');
  if (!inst.features.includes(feature) || feature === 'shaft') throw new MeasureError(`a ${inst.name.toLowerCase()} cannot measure the ${FEATURES[feature].toLowerCase()}`);
  const g = revisions(part)[rev];
  const truth = g[feature === 'length' ? 'L' : feature];
  if (truth === null) throw new MeasureError('there is no bore yet — drill one first');
  if (inst.range && (truth < inst.range[0] || truth > inst.range[1])) throw new MeasureError(`outside this gauge's range (${inst.range.join('–')} mm)`);
  return { feature, rev, n, ...read(truth, inst, `${planKey(part.stock, part.ops.slice(0, rev))}|${feature}|${inst.id}|${n}`) };
}
export function measureShaft(shaftId, instrumentId, n = 0) {
  const s = SHAFTS.find(x => x.id === shaftId), inst = INSTRUMENTS[instrumentId];
  if (!s) throw new MeasureError('choose a shaft');
  if (!inst?.features.includes('shaft')) throw new MeasureError(`a ${inst ? inst.name.toLowerCase() : 'that instrument'} cannot measure a shaft`);
  return { feature: 'shaft', shaftId, n, ...read(s.size, inst, `shaft|${s.id}|${inst.id}|${n}`) };
}

// ---------- decisions from readings only ----------
const EPS = 1e-9;
// clearance = bore − shaft; worst-case band = ± (bore max error + shaft max error).
export function fitCheck(bore, shaft, range) {
  if (!(range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min < range.max)) throw new MeasureError('set a fit range with min below max');
  const clearance = r4(bore.reading - shaft.reading), band = bore.maxError + shaft.maxError;
  const lo = r4(clearance - band), hi = r4(clearance + band);
  let outcome;
  if (hi < range.min - EPS) outcome = 'tight';
  else if (lo > range.max + EPS) outcome = 'loose';
  else if (lo >= range.min - EPS && hi <= range.max + EPS) outcome = 'ok';
  else outcome = 'inconclusive';
  return { clearance, lo, hi, band, range: { min: range.min, max: range.max }, outcome };
}
export function drawingCheck(reading, spec) {
  const min = spec.target + spec.lower, max = spec.target + spec.upper, lo = reading.reading - reading.maxError, hi = reading.reading + reading.maxError;
  const outcome = hi < min - EPS || lo > max + EPS ? 'nonconforming' : lo >= min - EPS && hi <= max + EPS ? 'conforms' : 'inconclusive';
  return { min: r4(min), max: r4(max), lo: r4(lo), hi: r4(hi), outcome };
}
export const OUTCOME_TEXT = {
  tight: 'Too tight', loose: 'Too loose', ok: 'Within range', inconclusive: 'Can’t confirm with this instrument',
  conforms: 'Meets drawing', nonconforming: 'Outside drawing',
};

// ---------- the workshop: parts and readings ----------
const clone = v => JSON.parse(JSON.stringify(v));
export function newWorkshop() { return { parts: [], readings: [], nextId: 1, current: null, fit: { shaftId: 'g20a', range: { ...FIT_RANGES[0] } } }; }
const partOf = (ws, id) => { const p = ws.parts.find(x => x.id === id); if (!p) throw new CutError('no such part'); return p; };

export function addPartFromStock(ws, { material, D, L, name }) {
  if (!MATERIALS[material]) throw new CutError('choose a material');
  if (!STOCK_DIAMETERS.includes(D)) throw new CutError(`choose a bar size: ${STOCK_DIAMETERS.join(', ')} mm`);
  if (!(L >= STOCK_LENGTH[0] && L <= STOCK_LENGTH[1])) throw new CutError(`saw a length between ${STOCK_LENGTH.join(' and ')} mm`);
  const id = `P${ws.nextId++}`;
  ws.parts.push({ id, name: name || `Part ${id}`, material, stock: { D, L }, ops: [], spec: { target: 20, lower: 0, upper: 0.021 }, from: 'stock' });
  ws.current = id;
  return id;
}
// A preset goes through exactly the same calls a person would make by hand.
export function addPartFromPreset(ws, presetId) {
  const p = PRESETS.find(x => x.id === presetId); if (!p) throw new CutError('no such preset');
  const id = addPartFromStock(ws, { material: p.material, D: p.stock.D, L: p.stock.L, name: p.name });
  for (const op of p.ops) cut(ws, id, op);
  setSpec(ws, id, p.spec);
  partOf(ws, id).from = `preset:${p.id}`;
  return id;
}
export function cut(ws, id, op) {
  const part = partOf(ws, id), next = { ...part, ops: [...part.ops, clone(op)] };
  revisions(next);                // throws CutError if the operation is impossible; nothing is changed then
  part.ops = next.ops;
  return currentRev(part);
}
export function setStock(ws, id, { material, D, L }) {
  const part = partOf(ws, id);
  if (part.ops.length) throw new CutError('this blank has been cut — start a new blank to change stock or material');
  if (material !== undefined) { if (!MATERIALS[material]) throw new CutError('choose a material'); part.material = material; }
  if (D !== undefined) { if (!STOCK_DIAMETERS.includes(D)) throw new CutError('choose a listed bar size'); part.stock.D = D; }
  if (L !== undefined) { if (!(L >= STOCK_LENGTH[0] && L <= STOCK_LENGTH[1])) throw new CutError('length out of range'); part.stock.L = L; }
}
// The drawing is not the part: changing it never creates a revision and never changes a reading or a fit.
export function setSpec(ws, id, spec) {
  const s = { target: +spec.target, lower: +spec.lower, upper: +spec.upper };
  if (![s.target, s.lower, s.upper].every(Number.isFinite) || s.target <= 0 || s.lower > s.upper) throw new CutError('drawing: target above 0 and lower limit ≤ upper limit');
  partOf(ws, id).spec = s;
}
// Fork: a new blank that repeats this part's operations up to `rev` (optionally in another material).
// Readings never transfer — they belong to the physical part they were taken on.
export function forkPart(ws, id, { rev, material, name } = {}) {
  const src = partOf(ws, id), upto = rev ?? currentRev(src);
  const nid = addPartFromStock(ws, { material: material ?? src.material, D: src.stock.D, L: src.stock.L, name: name || `${src.name} (fork of ${src.id} r${upto})` });
  const dst = partOf(ws, nid);
  for (const op of src.ops.slice(0, upto)) cut(ws, nid, op);
  dst.spec = { ...src.spec }; dst.from = `fork:${src.id}@${upto}`;
  return nid;
}
export function takeReading(ws, id, feature, instrumentId) {
  const part = partOf(ws, id), rev = currentRev(part);
  const n = ws.readings.filter(r => r.partId === id && r.rev === rev && r.feature === feature && r.instrument === instrumentId).length;
  const r = { partId: id, ...measurePart(part, feature, instrumentId, n) };
  ws.readings.push(r); return r;
}
export function takeShaftReading(ws, shaftId, instrumentId) {
  const n = ws.readings.filter(r => r.shaftId === shaftId && r.instrument === instrumentId).length;
  const r = measureShaft(shaftId, instrumentId, n);
  ws.readings.push(r); return r;
}
export const readingsFor = (ws, id) => ws.readings.filter(r => r.partId === id);
export const latest = (list, pred) => [...list].reverse().find(pred) ?? null;

// Fit bench state for one part + shaft + range, using the latest bore reading of the CURRENT revision and the
// latest reading of the chosen shaft. Older revisions' readings are evidence about a part that no longer exists.
export function fitState(ws, id, { shaftId, range }) {
  const part = partOf(ws, id), rev = currentRev(part);
  const bores = ws.readings.filter(r => r.partId === id && r.feature === 'bore');
  const bore = latest(bores, r => r.rev === rev), older = latest(bores, r => r.rev < rev);
  const shaft = latest(ws.readings, r => r.shaftId === shaftId);
  if (!bore) return { state: older ? 'stale' : 'needs-bore', rev, staleRev: older?.rev ?? null, shaft };
  if (!shaft) return { state: 'needs-shaft', rev, bore };
  return { state: 'result', rev, bore, shaft, ...fitCheck(bore, shaft, range) };
}

// ---------- shared experiment record (core/project.mjs) ----------
// A project's setup is the whole workshop: parts, their operations and every reading taken. A saved run freezes it
// with the evidence for the part on the bench. Reproducing a run re-takes every reading from its part, revision,
// instrument and reading number, and re-cuts every operation — the same seeded model, so the numbers must match.
const FIT_VALUE = { ok: 'pass', tight: 'fail', loose: 'fail', inconclusive: 'cannot-assess' };
export function evaluateWorkshop(w) {
  const part = w.parts.find(p => p.id === w.current);
  if (!part) return { ok: false, reason: 'No part on the bench yet: start from stock or open a preset.' };
  try {
    for (const p of w.parts) revisions(p);
    // a reading is only trusted if all of it — value, instrument, its resolution and maximum error, the revision
    // and reading number — is exactly what the simulated instrument gives for that part
    for (const r of w.readings) {
      const owner = r.partId ? w.parts.find(p => p.id === r.partId) : null;
      if (r.partId && !owner) return { ok: false, reason: `a reading belongs to part ${r.partId}, which is not in this workshop` };
      const again = r.partId ? { partId: r.partId, ...measurePart(owner, r.feature, r.instrument, r.n, r.rev) } : measureShaft(r.shaftId, r.instrument, r.n);
      const keys = new Set([...Object.keys(again), ...Object.keys(r)]);
      const bad = [...keys].filter(k => again[k] !== r[k]);
      if (bad.length) return { ok: false, reason: `a ${FEATURES[r.feature]?.toLowerCase() ?? 'saved'} reading (${r.reading} mm) does not match what its instrument gives: ${bad.join(', ')} differ${bad.length === 1 ? 's' : ''}` };
    }
  } catch (e) { if (e instanceof CutError || e instanceof MeasureError) return { ok: false, reason: e.message }; throw e; }
  const f = fitState(w, part.id, w.fit), rev = currentRev(part);
  const shaft = SHAFTS.find(s => s.id === w.fit.shaftId);
  const outputs = { revision: { label: 'Revision', value: rev, unit: '', source: 'input' }, mass: { label: 'Mass', value: mass(part) * 1000, unit: 'g', source: 'simulated' } };
  const verdicts = {};
  if (f.bore) {
    outputs.bore = { label: `Bore reading (${INSTRUMENTS[f.bore.instrument].name})`, value: f.bore.reading, unit: 'mm', source: 'measured' };
    outputs.boreError = { label: 'Bore reading ±', value: f.bore.maxError, unit: 'mm', source: 'table' };
    const d = drawingCheck(f.bore, part.spec);
    verdicts.drawing = { label: 'Bore meets the drawing?', value: d.outcome === 'conforms' ? 'pass' : d.outcome === 'nonconforming' ? 'fail' : 'cannot-assess', reason: `${d.lo}…${d.hi} mm against ${d.min}…${d.max} mm` };
  }
  if (f.shaft) outputs.shaft = { label: `${shaft.name} reading (${INSTRUMENTS[f.shaft.instrument].name})`, value: f.shaft.reading, unit: 'mm', source: 'measured' };
  if (f.state === 'result') {
    Object.assign(outputs, { clearance: { label: 'Clearance', value: f.clearance, unit: 'mm', source: 'measured' }, clearanceLo: { label: 'Clearance, lowest possible', value: f.lo, unit: 'mm', source: 'measured' }, clearanceHi: { label: 'Clearance, highest possible', value: f.hi, unit: 'mm', source: 'measured' } });
    verdicts.fit = { label: `Fits ${shaft.name} (${w.fit.range.min} to ${w.fit.range.max} mm)?`, value: FIT_VALUE[f.outcome], reason: OUTCOME_TEXT[f.outcome] };
  } else verdicts.fit = { label: `Fits ${shaft.name}?`, value: 'not-applicable', reason: { 'needs-bore': 'bore not measured on this revision', stale: `part recut since the last bore reading (r${f.staleRev})`, 'needs-shaft': 'shaft not measured' }[f.state] };
  return { ok: true, outputs, verdicts };
}
export const ADAPTER = { domain: 'workshop-parts', title: 'Workshop', evaluate: evaluateWorkshop };
