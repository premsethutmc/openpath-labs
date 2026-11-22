// Machine Design bench — shafts first. The learner builds a shaft (segments, material), places bearings, applies
// their own forces and torques and sets their own limits. Physics: engines/machine/shaft.mjs. The tools that answer
// questions are generic — checks against the learner's limits, what governs, what moves a result (computed
// sensitivities) and a sweep of any input — so different questions need no lesson code.
// Stage 2 adds the rotating shaft: operating speed, fatigue (engines/machine/fatigue.mjs), bearing life
// (engines/machine/bearing.mjs), critical speed and unbalance response (engines/machine/rotor.mjs). They are evaluated
// only when an operating speed is set; a setup without one (every setup saved before stage 2) evaluates exactly as before.
import { solveShaft, ShaftError, lengthOf } from '../engines/machine/shaft.mjs';
import { shaftFatigue, FatigueError, SURFACE, RELIABILITY, RAISER_KINDS } from '../engines/machine/fatigue.mjs';
import { rotor, RotorError, magnification } from '../engines/machine/rotor.mjs';
import { ratingLife } from '../engines/machine/bearing.mjs';
import { MATERIALS } from '../core/materials.mjs';
export { SURFACE, RELIABILITY, RAISER_KINDS };

export class EditError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));
export const SHAFT_MATERIALS = ['steel', 'aluminium', 'castIron'];

// speed: operating speed in rpm, or null for a static check only (default 1450 rpm: a 4-pole induction motor on 50 Hz).
export const emptySetup = () => ({ material: 'steel', selfWeight: true, segments: [], bearings: [], loads: [], raisers: [],
  speed: 1450, damping: 0.02, finish: 'machined', reliability: 50,
  limits: { minSF: 2, deflection: null, slope: null, fatigueSF: null, lifeHours: null, critPct: null, amplitude: null }, nextId: 1 });
// Fill fields added after a setup was saved, with values that keep it evaluating exactly as it did (no speed → static only).
export function upgrade(s0) {
  const s = clone(s0);
  if (!('speed' in s)) s.speed = null;
  s.damping ??= 0.02; s.finish ??= 'machined'; s.reliability ??= 50; s.raisers ??= [];
  for (const k of ['fatigueSF', 'lifeHours', 'critPct', 'amplitude']) if (!(k in s.limits)) s.limits[k] = null;
  s.bearings.forEach(b => { if (!('rating' in b)) b.rating = null; if (!('C' in b)) b.C = null; b.type ??= 'ball'; });
  s.loads.forEach(l => { if (l.kind === 'force') { l.mass ??= 0; l.ecc ??= 0; } });
  return s;
}
const nid = (s, p) => `${p}${s.nextId++}`;
const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new EditError(`${what} must be between ${lo} and ${hi}`); return v; };
const byId = (list, id, what) => { const x = list.find(i => i.id === id); if (!x) throw new EditError(`no such ${what}`); return x; };

// ---------- edits (validate first, change nothing on refusal) ----------
export function setMaterial(s, id) { if (!SHAFT_MATERIALS.includes(id)) throw new EditError('choose a listed material'); s.material = id; }
export function setSelfWeight(s, on) { s.selfWeight = !!on; }
export function addSegment(s, { L = 100, d = 30, bore = 0 } = {}, afterId = null) {
  num(L, 1, 3000, 'segment length (mm)'); num(d, 3, 500, 'diameter (mm)'); num(bore, 0, d - 1, 'bore (mm)');
  const seg = { id: nid(s, 's'), L, d, bore }, i = afterId ? s.segments.findIndex(x => x.id === afterId) + 1 : s.segments.length;
  s.segments.splice(i, 0, seg); return seg.id;
}
export function setSegment(s, id, key, v) {
  const seg = byId(s.segments, id, 'segment'), next = { ...seg, [key]: v };
  if (key === 'L') num(v, 1, 3000, 'segment length (mm)'); else if (key === 'd') num(v, 3, 500, 'diameter (mm)'); else if (key === 'bore') num(v, 0, 499, 'bore (mm)'); else throw new EditError('unknown setting');
  if (next.bore >= next.d - 0.5) throw new EditError('the bore must be smaller than the diameter');
  Object.assign(seg, next);
}
export const removeSegment = (s, id) => { byId(s.segments, id, 'segment'); s.segments = s.segments.filter(x => x.id !== id); };
export function addBearing(s, x, rating = null, C = null, type = 'ball') {
  num(x, 0, 6000, 'bearing position (mm)'); if (rating !== null) num(rating, 1, 1e7, 'bearing load limit (N)'); if (C !== null) num(C, 1, 1e7, 'dynamic load rating C (N)');
  if (!['ball', 'roller'].includes(type)) throw new EditError('bearing type must be ball or roller');
  const id = nid(s, 'b'); s.bearings.push({ id, x, rating, C, type }); return id;
}
export function setBearing(s, id, key, v) {
  const b = byId(s.bearings, id, 'bearing');
  if (key === 'x') b.x = num(v, 0, 6000, 'bearing position (mm)');
  else if (key === 'rating') b.rating = v === null ? null : num(v, 1, 1e7, 'bearing load limit (N)');
  else if (key === 'C') b.C = v === null ? null : num(v, 1, 1e7, 'dynamic load rating C (N)');
  else if (key === 'type') { if (!['ball', 'roller'].includes(v)) throw new EditError('bearing type must be ball or roller'); b.type = v; }
  else throw new EditError('unknown setting');
}
export const removeBearing = (s, id) => { byId(s.bearings, id, 'bearing'); s.bearings = s.bearings.filter(x => x.id !== id); };
// A force may carry a rotating mass (kg, e.g. a pulley or gear) with an eccentricity (µm) — used only for critical speed
// and unbalance; the force itself is what the static check uses (include the part's weight in F if it matters).
export function addForce(s, x, F, mass = 0, ecc = 0) {
  num(x, 0, 6000, 'load position (mm)'); num(F, -1e6, 1e6, 'force (N)'); num(mass, 0, 1e4, 'mass (kg)'); num(ecc, 0, 1e4, 'eccentricity (µm)');
  const id = nid(s, 'f'); s.loads.push({ id, kind: 'force', x, F, mass, ecc }); return id;
}
export function addTorque(s, x, T) { num(x, 0, 6000, 'torque position (mm)'); num(T, -1e5, 1e5, 'torque (N·m)'); const id = nid(s, 't'); s.loads.push({ id, kind: 'torque', x, T }); return id; }
export function setLoad(s, id, key, v) {
  const l = byId(s.loads, id, 'load');
  if (key === 'x') l.x = num(v, 0, 6000, 'position (mm)');
  else if (key === 'F' && l.kind === 'force') l.F = num(v, -1e6, 1e6, 'force (N)');
  else if (key === 'T' && l.kind === 'torque') l.T = num(v, -1e5, 1e5, 'torque (N·m)');
  else if (key === 'mass' && l.kind === 'force') l.mass = num(v, 0, 1e4, 'mass (kg)');
  else if (key === 'ecc' && l.kind === 'force') l.ecc = num(v, 0, 1e4, 'eccentricity (µm)');
  else throw new EditError('unknown setting');
}
export const removeLoad = (s, id) => { byId(s.loads, id, 'load'); s.loads = s.loads.filter(x => x.id !== id); };
const LIMITS = { minSF: [1, 20, 'minimum safety factor'], deflection: [0.001, 100, 'deflection limit (mm)'], slope: [0.01, 100, 'bearing slope limit (mrad)'],
  fatigueSF: [1, 20, 'minimum fatigue safety factor'], lifeHours: [1, 1e7, 'required bearing life (h)'], critPct: [5, 300, 'speed limit (% of critical)'], amplitude: [0.1, 1e5, 'vibration limit (µm)'] };
export function setLimit(s, key, v) {
  if (!(key in LIMITS)) throw new EditError('unknown limit');
  if (v === null) { if (key === 'minSF') throw new EditError('a minimum safety factor is always checked'); s.limits[key] = null; return; }
  const [lo, hi, what] = LIMITS[key]; s.limits[key] = num(v, lo, hi, what);
}
// Rotation and fatigue settings.
export function setSpeed(s, v) { s.speed = v === null ? null : num(v, 10, 100000, 'operating speed (rpm)'); }
export function setDamping(s, v) { s.damping = num(v, 0.001, 0.5, 'damping ratio'); }
export function setFinish(s, v) { if (!SURFACE[v]) throw new EditError('choose a listed surface finish'); s.finish = v; }
export function setReliability(s, v) { if (!RELIABILITY[v]) throw new EditError('choose a listed reliability'); s.reliability = +v; }
// Stress raisers (shoulder fillets, keyseats, grooves): Kt in bending and Kts in torsion, supplied by the learner.
export function addRaiser(s, { x, kind = 'custom', kt, kts }) {
  const k = RAISER_KINDS[kind]; if (!k) throw new EditError('unknown kind of stress raiser');
  kt ??= k.kt ?? 2; kts ??= k.kts ?? kt;
  num(x, 0, 6000, 'position (mm)'); num(kt, 1, 10, 'Kt'); num(kts, 1, 10, 'Kts');
  const id = nid(s, 'k'); s.raisers.push({ id, x, kind, kt, kts }); return id;
}
export function setRaiser(s, id, key, v) {
  const q = byId(s.raisers, id, 'stress raiser');
  if (key === 'x') q.x = num(v, 0, 6000, 'position (mm)');
  else if (key === 'kt' || key === 'kts') { q[key] = num(v, 1, 10, key === 'kt' ? 'Kt' : 'Kts'); q.kind = 'custom'; }
  else if (key === 'kind') { const k = RAISER_KINDS[v]; if (!k) throw new EditError('unknown kind of stress raiser'); q.kind = v; if (k.kt) { q.kt = k.kt; q.kts = k.kts; } }
  else throw new EditError('unknown setting');
}
export const removeRaiser = (s, id) => { byId(s.raisers, id, 'stress raiser'); s.raisers = s.raisers.filter(x => x.id !== id); };
const EDITS = { setMaterial, setSelfWeight, addSegment, setSegment, addBearing, setBearing, addForce, addTorque, setLoad, setLimit, setSpeed, setDamping, setFinish, setReliability, addRaiser, setRaiser };
// Route a (list, id, key) reference to its edit function, so Explain/Sweep "Apply" goes through the same validation.
export function applyRef(s, ref, v) {
  if (ref.list === 'setup') return ({ speed: setSpeed, damping: setDamping, finish: setFinish, material: setMaterial, reliability: setReliability })[ref.key](s, v);
  return ({ segments: setSegment, bearings: setBearing, loads: setLoad, raisers: setRaiser })[ref.list](s, ref.id, ref.key, v);
}

// ---------- presets: edit scripts replayed into an empty setup ----------
export const PRESETS = [
  { id: 'pulley', name: 'Overhung pulley shaft', script: [
    ['addSegment', { L: 400, d: 30 }], ['addBearing', 0], ['addBearing', 250], ['addForce', 380, 1500], ['addTorque', 20, 40], ['addTorque', 380, -40],
    ['setLimit', 'minSF', 2], ['setLimit', 'deflection', 0.15]] },
  { id: 'countershaft', name: 'Gearbox countershaft', script: [
    ['addSegment', { L: 60, d: 25 }], ['addSegment', { L: 180, d: 32 }], ['addSegment', { L: 60, d: 25 }], ['addBearing', 30, 3000], ['addBearing', 270, 3000],
    ['addForce', 100, 1800], ['addTorque', 100, 60], ['addForce', 220, 3200], ['addTorque', 220, -60], ['setLimit', 'minSF', 2.5], ['setLimit', 'deflection', 0.05]] },
  { id: 'line', name: 'Line shaft on three bearings', script: [
    ['addSegment', { L: 1500, d: 40 }], ['addBearing', 0], ['addBearing', 750], ['addBearing', 1500], ['addForce', 375, 2000], ['addForce', 1125, 2000],
    ['addTorque', 0, 150], ['addTorque', 375, -75], ['addTorque', 1125, -75], ['setLimit', 'minSF', 2], ['setLimit', 'deflection', 0.5]] },
  // Runs close to its first critical speed: a 20 kg fan disc with 40 µm eccentricity on a slender 900 mm span.
  { id: 'fan', name: 'Fan shaft near its critical speed', script: [
    ['addSegment', { L: 900, d: 32 }], ['addBearing', 0, null, 10000], ['addBearing', 900, null, 10000], ['addForce', 450, 196, 20, 40], ['addTorque', 20, 20], ['addTorque', 450, -20],
    ['setSpeed', 1450], ['setDamping', 0.02], ['setLimit', 'minSF', 2], ['setLimit', 'critPct', 70], ['setLimit', 'amplitude', 50], ['setLimit', 'lifeHours', 20000]] },
  // Statically strong, but a sharp shoulder fillet next to the gear sits where the reversing bending moment is high.
  { id: 'shoulder', name: 'Gear shaft with a sharp shoulder', script: [
    ['addSegment', { L: 100, d: 30 }], ['addSegment', { L: 120, d: 40 }], ['addSegment', { L: 100, d: 30 }], ['addBearing', 20], ['addBearing', 300],
    ['addForce', 130, 2500, 6, 0], ['addTorque', 0, 100], ['addTorque', 130, -100], ['addRaiser', { x: 100, kind: 'sharpFillet' }], ['addRaiser', { x: 220, kind: 'roundFillet' }],
    ['setSpeed', 1450], ['setFinish', 'machined'], ['setLimit', 'minSF', 2], ['setLimit', 'fatigueSF', 1.5]] },
];
export function fromPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) throw new EditError('no such preset');
  const s = emptySetup(); for (const [fn, ...args] of p.script) EDITS[fn](s, ...args); return s;
}
export const SCRIPT_EDITS = EDITS;

// ---------- solve, checks, governing ----------
const toShaft = s => ({ material: s.material, selfWeight: s.selfWeight, segments: s.segments, bearings: s.bearings, loads: s.loads.map(l => (l.kind === 'torque' ? { ...l, T: l.T * 1000 } : l)) });
export const bearingLabel = (s, id) => `Bearing ${s.bearings.findIndex(b => b.id === id) + 1}`;
const fmt = (v, d) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toFixed(d));
// Values sweeps and sensitivities cannot change through the edit functions: reject them here with a reason.
function invalid(s) {
  if (s.speed !== null && !(s.speed > 0)) return 'The operating speed must be above zero (leave it empty for a static check only).';
  if (!(s.damping > 0 && s.damping < 1)) return 'The damping ratio must be between 0 and 1.';
  const L = lengthOf(s);
  for (const [i, q] of s.raisers.entries()) {
    if (!(q.kt >= 1 && q.kts >= 1)) return `Stress raiser ${i + 1}: Kt and Kts cannot be below 1.`;
    if (s.segments.length && (q.x < 0 || q.x > L)) return `Stress raiser ${i + 1} at ${q.x} mm is off the shaft (0–${L} mm).`;
  }
  for (const l of s.loads) if (l.kind === 'force' && (l.mass < 0 || l.ecc < 0)) return 'Masses and eccentricities cannot be negative.';
  return null;
}

export function evaluate(s0) {
  const s = upgrade(s0);
  let r;
  try { r = solveShaft(toShaft(s), s.raisers.length ? { stations: s.raisers.map(q => q.x) } : {}); }
  catch (e) { if (e instanceof ShaftError) return { ok: false, code: e.code, reason: e.message }; throw e; }
  const bad = invalid(s); if (bad) return { ok: false, code: 'setting', reason: bad };
  const checks = [{ key: 'strength', label: `Strength (${r.criterion})`, value: r.sf, limit: s.limits.minSF, unit: '', util: s.limits.minSF / r.sf,
    where: r.worst.x, text: `safety factor ${r.sf.toFixed(2)} (needs ≥ ${s.limits.minSF})` }];
  if (s.limits.deflection !== null) checks.push({ key: 'deflection', label: 'Deflection', value: Math.abs(r.maxDefl.v), limit: s.limits.deflection, unit: 'mm', util: Math.abs(r.maxDefl.v) / s.limits.deflection, where: r.maxDefl.x,
    text: `${Math.abs(r.maxDefl.v).toFixed(4)} mm (limit ${s.limits.deflection} mm)` });
  if (s.limits.slope !== null) checks.push({ key: 'slope', label: 'Slope at bearings', value: Math.abs(r.maxSlope.slope) * 1000, limit: s.limits.slope, unit: 'mrad', util: Math.abs(r.maxSlope.slope) * 1000 / s.limits.slope, where: r.maxSlope.x,
    text: `${(Math.abs(r.maxSlope.slope) * 1000).toFixed(3)} mrad (limit ${s.limits.slope} mrad)` });
  s.bearings.forEach((b, i) => { if (b.rating !== null) checks.push({ key: `R:${b.id}`, label: `${bearingLabel(s, b.id)} load`, value: Math.abs(r.reactions[i].R), limit: b.rating, unit: 'N', util: Math.abs(r.reactions[i].R) / b.rating, where: b.x,
    text: `${Math.abs(r.reactions[i].R).toFixed(0)} N (limit ${b.rating} N)` }); });

  // ---- rotating shaft (only with an operating speed) ----
  const dyn = { speed: s.speed };
  const cannot = (key, label, reason, where = 0) => checks.push({ key, label, cannot: true, reason, where, text: `cannot assess: ${reason}` });
  if (s.speed !== null) {
    try { dyn.fatigue = shaftFatigue(r, s.material, s.raisers, { finish: s.finish, reliability: s.reliability }); } catch (e) { if (!(e instanceof FatigueError)) throw e; dyn.fatigueWhy = e.message; }
    const masses = s.loads.filter(l => l.kind === 'force' && l.mass > 0).map(l => ({ x: l.x, m: l.mass, e: l.ecc * 1e-3 }));
    try { dyn.rotor = rotor(toShaft(s), { masses, shaftMass: s.selfWeight }); } catch (e) { if (!(e instanceof RotorError)) throw e; dyn.rotorWhy = e.message; }
    if (dyn.rotor) {
      dyn.ratio = s.speed / dyn.rotor.rpm; dyn.mag = magnification(dyn.ratio, s.damping);
      dyn.unbalanced = masses.some(m => m.e > 0);
      if (dyn.unbalanced) dyn.amplitude = dyn.rotor.eModal * 1000 * dyn.mag;   // µm
    }
    dyn.lives = s.bearings.map((b, i) => (b.C === null ? null : { ...ratingLife({ C: b.C, P: Math.abs(r.reactions[i].R), type: b.type, rpm: s.speed }), P: Math.abs(r.reactions[i].R), C: b.C, type: b.type }));
  }
  const noSpeed = 'set an operating speed (Speed tab); these checks are for a rotating shaft';
  const L = s.limits;
  if (L.fatigueSF !== null) {
    if (s.speed === null) cannot('fatigue', 'Fatigue', noSpeed);
    else if (!dyn.fatigue) cannot('fatigue', 'Fatigue', dyn.fatigueWhy);
    else { const n = dyn.fatigue.n; checks.push({ key: 'fatigue', label: 'Fatigue (DE-Goodman)', value: n, limit: L.fatigueSF, unit: '', util: L.fatigueSF / n, where: dyn.fatigue.x, text: `fatigue safety factor ${Number.isFinite(n) ? n.toFixed(2) : 'unlimited'} (needs ≥ ${L.fatigueSF})` }); }
  }
  if (L.lifeHours !== null) s.bearings.forEach((b, i) => {
    if (b.C === null) return;
    const key = `L:${b.id}`, label = `${bearingLabel(s, b.id)} life`;
    if (s.speed === null) return cannot(key, label, noSpeed, b.x);
    const h = dyn.lives[i].hours;
    checks.push({ key, label, value: h, limit: L.lifeHours, unit: 'h', util: L.lifeHours / h, where: b.x, text: `L10 ${Number.isFinite(h) ? fmt(h, 0) : 'unlimited'} h (needs ≥ ${L.lifeHours} h)` });
  });
  if (L.critPct !== null) {
    if (s.speed === null) cannot('critical', 'Critical speed', noSpeed);
    else if (!dyn.rotor) cannot('critical', 'Critical speed', dyn.rotorWhy);
    else { const pct = dyn.ratio * 100; checks.push({ key: 'critical', label: 'Critical speed margin', value: pct, limit: L.critPct, unit: '%', util: pct / L.critPct, where: dyn.rotor.xref, text: `running at ${pct.toFixed(0)} % of the first critical speed (limit ${L.critPct} %)` }); }
  }
  if (L.amplitude !== null) {
    if (s.speed === null) cannot('amplitude', 'Vibration', noSpeed);
    else if (!dyn.rotor) cannot('amplitude', 'Vibration', dyn.rotorWhy);
    else if (!dyn.unbalanced) cannot('amplitude', 'Vibration', 'no unbalance given: give a load a mass and an eccentricity (Loads tab)');
    else checks.push({ key: 'amplitude', label: 'Vibration (unbalance)', value: dyn.amplitude, limit: L.amplitude, unit: 'µm', util: dyn.amplitude / L.amplitude, where: dyn.rotor.xref, text: `whirl ${dyn.amplitude.toFixed(1)} µm (limit ${L.amplitude} µm)` });
  }
  checks.forEach(c => { c.pass = c.cannot ? null : c.util <= 1 + 1e-12; });
  const governing = checks.filter(c => !c.cannot).reduce((a, c) => (c.util > a.util ? c : a));
  const outputs = {};
  s.bearings.forEach((b, i) => { outputs[`R:${b.id}`] = { label: `${bearingLabel(s, b.id)} reaction (x = ${b.x} mm)`, value: r.reactions[i].R, unit: 'N', source: 'simulated' }; });
  Object.assign(outputs, { stress: { label: `Highest ${r.criterion} stress`, value: r.worst.eq, unit: 'MPa', source: 'simulated' }, sf: { label: 'Safety factor', value: r.sf, unit: '', source: 'simulated' },
    deflection: { label: 'Largest deflection', value: Math.abs(r.maxDefl.v), unit: 'mm', source: 'simulated' }, slope: { label: 'Largest bearing slope', value: Math.abs(r.maxSlope.slope) * 1000, unit: 'mrad', source: 'simulated' },
    torque: { label: 'Largest torque carried', value: r.maxTorque / 1000, unit: 'N·m', source: 'simulated' }, mass: { label: 'Shaft mass', value: r.mass, unit: 'kg', source: 'simulated' } });
  if (s.speed !== null) {
    const put = (k, label, value, unit, source = 'simulated') => { if (Number.isFinite(value)) outputs[k] = { label, value, unit, source }; };
    put('speed', 'Operating speed', s.speed, 'rpm', 'input');
    if (dyn.fatigue) { put('fatigueSF', 'Fatigue safety factor (DE-Goodman)', dyn.fatigue.n, ''); put('Se', 'Endurance limit Se where fatigue governs', dyn.fatigue.Se, 'MPa'); }
    if (dyn.rotor) { put('critical', 'First critical speed (Rayleigh)', dyn.rotor.rpm, 'rpm'); put('dunkerley', 'Critical speed, Dunkerley check', dyn.rotor.dunkerleyRpm, 'rpm'); put('critPct', 'Operating speed, % of critical', dyn.ratio * 100, '%'); }
    if (dyn.amplitude !== undefined) put('amplitude', 'Unbalance whirl amplitude (teaching estimate)', dyn.amplitude, 'µm');
    s.bearings.forEach((b, i) => { if (dyn.lives[i]) put(`L10h:${b.id}`, `${bearingLabel(s, b.id)} life L10`, dyn.lives[i].hours, 'h'); });
  }
  const verdicts = Object.fromEntries(checks.map(c => [c.key, { label: c.label, value: c.cannot ? 'cannot-assess' : c.pass ? 'pass' : 'fail', reason: c.text }]));
  return { ok: true, s, r, dyn, checks, governing, outputs, verdicts };
}
export const ADAPTER = { domain: 'machine-shaft', title: 'Shaft', evaluate: s => { const e = evaluate(s); return e.ok ? { ok: true, outputs: e.outputs, verdicts: e.verdicts } : { ok: false, reason: e.reason }; } };

// Speed-response curve of the evaluated setup (the model's own magnification; no extra physics).
export function speedResponse(e, n = 120) {
  if (!e.ok || !e.dyn.rotor) return null;
  const top = Math.max(1.6 * e.dyn.rotor.rpm, 1.2 * e.s.speed), em = e.dyn.unbalanced ? e.dyn.rotor.eModal * 1000 : null;
  return { unit: em === null ? 'r/e' : 'µm', critical: e.dyn.rotor.rpm, speed: e.s.speed,
    points: Array.from({ length: n + 1 }, (_, k) => { const rpm = top * k / n, m = magnification(rpm / e.dyn.rotor.rpm, e.s.damping); return { rpm, q: em === null ? m : em * m }; }) };
}

// ---------- generic question tools ----------
// Higher is better for these quantities; lower is better for every other one.
export const higherIsBetter = key => ['sf', 'fatigueSF', 'critical', 'dunkerley', 'Se'].includes(key) || key.startsWith('L10h:');
// Quantities any tool can ask about: those the current setup produces.
const QUNIT = { fatigueSF: '', critPct: '%', critical: 'rpm', dunkerley: 'rpm', amplitude: 'µm', Se: 'MPa' };
export function quantities(s) {
  const e = evaluate(s), extra = e.ok ? Object.keys(e.outputs).filter(k => k in QUNIT || k.startsWith('L10h:')) : [];
  return [{ key: 'deflection', label: 'Largest deflection (mm)' }, { key: 'sf', label: 'Safety factor' }, { key: 'stress', label: 'Highest stress (MPa)' }, { key: 'slope', label: 'Largest bearing slope (mrad)' },
    ...s.bearings.map(b => ({ key: `R:${b.id}`, label: `${bearingLabel(s, b.id)} reaction (N)` })),
    ...extra.map(k => ({ key: k, label: `${e.outputs[k].label}${e.outputs[k].unit ? ` (${e.outputs[k].unit})` : ''}` }))];
}
const read = (e, key) => (!e.outputs[key] ? null : key.startsWith('R:') ? Math.abs(e.outputs[key].value) : e.outputs[key].value);
// Inputs a learner can vary.
export function inputs(s0) {
  const s = upgrade(s0), forces = s.loads.filter(l => l.kind === 'force');
  return [...s.segments.map((g, i) => ({ ref: { list: 'segments', id: g.id, key: 'd' }, label: `Segment ${i + 1} diameter (mm)`, value: g.d, step: 1 })),
    ...s.bearings.map(b => ({ ref: { list: 'bearings', id: b.id, key: 'x' }, label: `${bearingLabel(s, b.id)} position (mm)`, value: b.x, step: 5 })),
    ...forces.map(l => ({ ref: { list: 'loads', id: l.id, key: 'x' }, label: `Force ${forces.indexOf(l) + 1} position (mm)`, value: l.x, step: 5 })),
    ...(s.speed !== null ? [{ ref: { list: 'setup', key: 'speed' }, label: 'Operating speed (rpm)', value: s.speed, step: 50 }] : []),
    ...(s.speed !== null ? forces.filter(l => l.mass > 0).map(l => ({ ref: { list: 'loads', id: l.id, key: 'mass' }, label: `Force ${forces.indexOf(l) + 1} mass (kg)`, value: l.mass, step: 1 })) : []),
    ...s.raisers.map((q, i) => ({ ref: { list: 'raisers', id: q.id, key: 'kt' }, label: `Stress raiser ${i + 1} Kt`, value: q.kt, step: 0.1 }))];
}
const apply = (s, ref, v) => { const t = upgrade(s); if (ref.list === 'setup') t[ref.key] = v; else t[ref.list].find(x => x.id === ref.id)[ref.key] = v; return t; };

// What moves a result: change each input by one small step either way and report the effect (computed, not assumed).
export function sensitivity(s, key) {
  const base = evaluate(s); if (!base.ok) throw new EditError(base.reason);
  const q0 = read(base, key); if (q0 === null) throw new EditError('this result is not available for this setup');
  const rows = [], tiny = 1e-12 * Math.max(1, Math.abs(q0));
  for (const inp of inputs(s)) for (const dir of [1, -1]) {
    const v = +(inp.value + dir * inp.step).toFixed(6), e = evaluate(apply(s, inp.ref, v)), q = e.ok ? read(e, key) : null;
    if (q !== null) rows.push({ input: inp.label, change: `${dir > 0 ? '+' : '−'}${inp.step}`, ref: inp.ref, to: v, delta: q - q0 });
  }
  const choices = [...SHAFT_MATERIALS.filter(m => m !== s.material).map(m => ({ input: 'Material', change: `→ ${MATERIALS[m].name}`, ref: { list: 'setup', key: 'material' }, to: m })),
    ...(base.s.speed !== null ? Object.keys(SURFACE).filter(f => f !== base.s.finish).map(f => ({ input: 'Surface', change: `→ ${SURFACE[f].label}`, ref: { list: 'setup', key: 'finish' }, to: f })) : [])];
  for (const c of choices) { const e = evaluate(apply(s, c.ref, c.to)), q = e.ok ? read(e, key) : null; if (q !== null && (c.input === 'Material' || Math.abs(q - q0) > tiny)) rows.push({ ...c, delta: q - q0 }); }
  return { quantity: key, value: q0, rows: rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}
// Sweep one input over a range and record a quantity; positions where the setup is impossible are reported as such.
export function sweep(s, ref, key, from, to, steps = 20) {
  if (!(steps >= 2 && steps <= 200) || !(to > from)) throw new EditError('choose a range with the end above the start');
  const pts = Array.from({ length: steps + 1 }, (_, k) => { const v = from + (to - from) * k / steps, e = evaluate(apply(s, ref, v)), q = e.ok ? read(e, key) : null; return { v, q, why: !e.ok ? e.reason : q === null ? 'this result is not available there' : null }; });
  const ok = pts.filter(p => p.q !== null), hi = higherIsBetter(key);
  const best = ok.length ? ok.reduce((a, p) => (hi ? (p.q > a.q ? p : a) : (p.q < a.q ? p : a))) : null, worst = ok.length ? ok.reduce((a, p) => (hi ? (p.q < a.q ? p : a) : (p.q > a.q ? p : a))) : null;
  return { ref, key, points: pts, best, worst, higherIsBetter: hi };
}
// The quantity behind each check, so Explain can ask what moves it.
const checkQuantity = c => (c.key === 'strength' ? 'sf' : c.key === 'fatigue' ? 'fatigueSF' : c.key === 'critical' ? 'critPct' : c.key.startsWith('L:') ? `L10h:${c.key.slice(2)}` : c.key);
// Why the governing check governs: the facts of the solved shaft plus the three inputs that move it most.
export function explain(s) {
  const e = evaluate(s); if (!e.ok) throw new EditError(e.reason);
  const g = e.governing, key = checkQuantity(g), hi = higherIsBetter(key);
  // the computed changes that help most (lower the quantity, or raise it when higher is better)
  const sens = sensitivity(s, key).rows.filter(r => (hi ? r.delta > 0 : r.delta < 0)).slice(0, 3);
  const where = `at x = ${g.where.toFixed(0)} mm`, d = e.dyn, f2 = v => v.toFixed(2);
  let facts;
  if (g.key === 'strength') facts = `Highest ${e.r.criterion} stress ${e.r.worst.eq.toFixed(1)} MPa ${where} (bending ${Math.abs(e.r.worst.sigma).toFixed(1)} MPa from M = ${(Math.abs(e.r.worst.M) / 1000).toFixed(1)} N·m on Ø${e.r.worst.d} mm, shear ${Math.abs(e.r.worst.tau).toFixed(1)} MPa from T = ${(Math.abs(e.r.worst.T) / 1000).toFixed(1)} N·m), against ${e.r.allow} MPa for ${e.r.material.name}.`;
  else if (g.key === 'deflection') facts = `The shaft deflects most ${where}: ${g.value.toFixed(4)} mm.`;
  else if (g.key === 'slope') facts = `The steepest slope is at the bearing ${where}: ${g.value.toFixed(3)} mrad.`;
  else if (g.key === 'fatigue') { const q = d.fatigue; facts = `The shaft turns under bending, so the bending stress reverses every revolution. At x = ${g.where.toFixed(0)} mm on Ø${q.d} mm: alternating bending σa = Kf ${f2(q.Kf)} × ${(q.sa / q.Kf).toFixed(1)} = ${q.sa.toFixed(1)} MPa; steady torsion τm = Kfs ${f2(q.Kfs)} × ${(q.Kfs ? q.tm / q.Kfs : 0).toFixed(1)} = ${q.tm.toFixed(1)} MPa. Endurance limit Se = ka ${f2(q.ka)} × kb ${f2(q.kb)} × ke ${f2(q.ke)} × ${q.Se1.toFixed(1)} = ${q.Se.toFixed(1)} MPa; Sut ${q.Sut} MPa. DE-Goodman: 1/n = ${q.sa_eq.toFixed(1)}/${q.Se.toFixed(1)} + ${q.sm_eq.toFixed(1)}/${q.Sut} → n = ${f2(q.n)}.`; }
  else if (g.key.startsWith('L:')) { const i = e.s.bearings.findIndex(b => `L:${b.id}` === g.key), l = d.lives[i]; facts = `${bearingLabel(e.s, e.s.bearings[i].id)} carries P = ${l.P.toFixed(0)} N (radial only). L10 = (C/P)^${l.type === 'ball' ? '3' : '10/3'} = (${l.C}/${l.P.toFixed(0)})^${l.type === 'ball' ? '3' : '10/3'} = ${fmt(l.L10, 1)} million revolutions = ${fmt(l.hours, 0)} h at ${e.s.speed} rpm.`; }
  else if (g.key === 'critical') facts = `First critical speed ${d.rotor.rpm.toFixed(0)} rpm (Rayleigh; Dunkerley check ${d.rotor.dunkerleyRpm.toFixed(0)} rpm). Running at ${e.s.speed} rpm is ${(d.ratio * 100).toFixed(0)} % of it; near 100 % any unbalance is magnified ${d.mag.toFixed(1)}×.`;
  else if (g.key === 'amplitude') facts = `Speed ratio ω/ω₁ = ${e.s.speed}/${d.rotor.rpm.toFixed(0)} = ${d.ratio.toFixed(2)}; with damping ratio ${e.s.damping} the equivalent eccentricity ${(d.rotor.eModal * 1000).toFixed(1)} µm is magnified ${d.mag.toFixed(2)}× → whirl ≈ ${d.amplitude.toFixed(1)} µm, largest at x = ${d.rotor.xref.toFixed(0)} mm.`;
  else facts = `${g.label.replace(' load', '')} carries ${g.value.toFixed(0)} N.`;
  return { check: g, pass: g.pass, headline: `${g.label} governs: ${g.text} — ${(g.util * 100).toFixed(0)} % of your limit.`, facts, movers: sens, quantity: key };
}

// ---------- learning notes (on request; never change a tool or a result) ----------
export const TOPICS = [
  { id: 'reactions', title: 'Bearing reactions', concept: 'With two bearings the reactions follow from force and moment balance. With three or more the shaft is statically indeterminate: reactions also depend on how the shaft bends, so the solver uses stiffness.', equation: 'ΣF = 0,  ΣM = 0;  two bearings: R₂ = Σ F·(x − x₁) / (x₂ − x₁)' },
  { id: 'bending', title: 'Bending stress', concept: 'Bending moment makes tension on one side of the shaft and compression on the other, largest at the surface.', equation: 'σ = M·c / I;  solid shaft σ = 32 M / (π d³);  hollow I = π(d⁴ − dᵢ⁴)/64' },
  { id: 'torsion', title: 'Torsion', concept: 'Torque is carried between where power enters and where it leaves; elsewhere the shaft carries none.', equation: 'τ = T·r / J;  solid shaft τ = 16 T / (π d³);  J = π(d⁴ − dᵢ⁴)/32' },
  { id: 'combined', title: 'Combined stress', concept: 'Ductile materials yield on distortion energy (von Mises); brittle ones crack on the largest principal stress.', equation: 'ductile σ_eq = √(σ² + 3τ²);  brittle σ₁ = σ/2 + √(σ²/4 + τ²);  safety factor = strength / σ_eq' },
  { id: 'deflection', title: 'Deflection and slope', concept: 'Curvature is moment divided by stiffness EI; integrating twice gives slope and deflection. Bearings and gears need small slopes and deflections to run properly.', equation: 'E·I·v″ = M;  centre load on span L: v = F L³ / (48 E I)' },
  { id: 'fatigue', title: 'Fatigue of a rotating shaft', concept: 'A shaft turning under a steady bending load sees each surface fibre go from tension to compression once per revolution. Millions of cycles at a stress well below yield can start a crack — usually at a shoulder, keyseat or groove. Torque from steady power is a steady (mean) stress. The bench uses the DE-Goodman criterion (Shigley): alternating stress against the endurance limit, mean stress against the ultimate strength.', equation: "1/n = σa'/Se + σm'/Sut;  σa' = Kf·32M/(πd³),  σm' = √3·Kfs·16T/(πd³)\nSe = ka·kb·kc·kd·ke·Se';  Se' = 0.5·Sut (steel);  ka = a·Sut^b;  kb = 1.24 d^−0.107 (2.79–51 mm), 1.51 d^−0.157 (51–254 mm)", limits: 'Shigley, Mechanical Engineering Design, 10th ed., eqs. 6-8, 6-18 to 6-20, 7-7, Tables 6-2 and 6-5. Kt and Kts are yours to supply (starting values from Shigley Table 7-1); the bench takes Kf = Kt (notch sensitivity 1, conservative). kc = 1 and kd = 1 (room temperature). Aluminium has no endurance limit: its value is the fatigue strength at 5×10⁸ cycles. Grey cast iron is not assessed. No first-cycle yield check with Kt, no variable loading, no corrosion.' },
  { id: 'raisers', title: 'Stress raisers', concept: 'A sudden change of section (a shoulder, keyseat or groove) concentrates stress locally. A generous fillet radius lowers Kt; so does moving the step away from the highest bending moment.', equation: 'σ_peak = Kt · σ_nominal;  sharp shoulder Kt ≈ 2.7, rounded Kt ≈ 1.7, keyseat Kt ≈ 2.14, ring groove Kt ≈ 5 (Shigley Table 7-1, first estimates)' },
  { id: 'life', title: 'Bearing life', concept: 'A rolling bearing eventually fails by surface fatigue of its races. The basic rating life L10 is the life that 90 % of identical bearings reach. Life falls steeply with load: double the load and a ball bearing lasts one eighth as long.', equation: 'L10 = (C/P)^a million revolutions,  a = 3 ball, 10/3 roller;  L10h = L10·10⁶ / (60 n)', limits: 'ISO 281 basic rating life. C is the catalogue dynamic load rating you enter; P is the radial reaction only (no axial load, no life-adjustment factors, no lubrication or contamination effects).' },
  { id: 'critical', title: 'Critical (whirling) speed', concept: 'A shaft carrying masses is a spring with masses on it. When it turns at its natural frequency, any small unbalance drives it into large whirling. Thicker shafts and shorter spans raise the critical speed; heavier attached masses lower it. Common practice keeps the running speed well away from it (for example below about 70–75 % of it).', equation: 'Rayleigh: ω₁² = g·Σ mᵢ|yᵢ| / Σ mᵢyᵢ²  (static deflection yᵢ under the weights)\nDunkerley: 1/ω² = 1/ω_shaft² + Σ 1/ωᵢ²;  one disc on a light shaft: ω = √(k/m) = √(g/δ)', limits: 'Rigid bearings, no gyroscopic effects, first mode only. Dunkerley is shown as a check; it underestimates and Rayleigh overestimates. The shaft\'s own mass counts only when its own weight is switched on. Masses come from the loads you give a mass; the static check uses the force you enter.' },
  { id: 'unbalance', title: 'Unbalance response (teaching estimate)', concept: 'A mass whose centre is off the shaft axis by e pulls the shaft round in a whirl. Below the critical speed the whirl grows with speed; at the critical speed only damping limits it; well above it the shaft spins about the mass centre and the whirl settles to about e.', equation: 'r = e·ρ² / √((1 − ρ²)² + (2ζρ)²),  ρ = ω/ω₁  (Jeffcott rotor)', limits: 'A single-mode estimate: the Rayleigh shape is treated as one Jeffcott rotor, all unbalances in phase (worst case). The damping ratio ζ is yours to set (default 0.02). Real rotors have bearing stiffness and damping, several modes and phase between unbalances; use this to understand why a machine shakes at one speed, not to predict a measured amplitude.' },
  { id: 'limits', title: 'What this bench does not model', concept: 'Strength, stiffness, fatigue, bearing life and first critical speed of a shaft loaded in one plane.', equation: '', limits: 'Not modelled: loads in two planes, axial loads, bearing stiffness and damping, shear deflection, gyroscopic effects and higher modes, variable-amplitude loading. Material values are typical, not a specific grade. Leave the operating speed empty for the static check only.' },
];
export const shaftLength = s => (s.segments.length ? lengthOf(s) : 0);
