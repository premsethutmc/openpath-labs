// OpenPath Labs simulation API — the existing engines over HTTP. Node built-ins only; no new physics.
//   GET  /health, GET /v1 (catalogue)
//   POST /v1/solids/beam, /v1/solids/frame, /v1/hydraulics/pump-system, /v1/hydraulics/reciprocating,
//        /v1/thermofluids/oil-viscosity, /v1/thermofluids/engine-cycle, /v1/thermofluids/engine-bench, /v1/fluids/flow-probe
// Every result states its model, units, validity and what is not modelled. Teaching models, not design certification.
// Environment: PORT, API_KEYS (comma-separated; when set, POST requests need header x-api-key), RATE_PER_MIN (default 60).
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';
import { solve } from '../engines/solids/frame.mjs';
import { analyze } from '../engines/solids/analyze.mjs';
import { operate, STOCK_SYSTEM, STOCK_PUMP, MATERIALS as PIPE_MATERIALS } from '../engines/hydraulics/hydraulics.mjs';
import { recip, STOCK_RECIP } from '../engines/hydraulics/reciprocating.mjs';
import { OILS, viscosity } from '../engines/thermofluids/oil.mjs';
import { cycle, ENGINE } from '../engines/thermofluids/engine.mjs';
import { SCENES } from '../engines/fluids/scenes.mjs';

export const VERSION = '1.0.0';
const commit = () => (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'local';

// ---------- validation ----------
class InputError extends Error { constructor(msg, status = 422) { super(msg); this.status = status; } }
const num = (o, k, lo, hi, dflt) => {
  const v = o?.[k] ?? dflt;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InputError(`${k} must be a number`);
  if (v < lo || v > hi) throw new InputError(`${k} must be between ${lo} and ${hi}`);
  return v;
};
const pick = (o, k, allowed, dflt) => { const v = o?.[k] ?? dflt; if (!allowed.includes(v)) throw new InputError(`${k} must be one of: ${allowed.join(', ')}`); return v; };
const SECTION_SHAPES = ['rect', 'circle', 'tube', 'I', 'rhs'];
function sectionIn(s) {
  if (!s || typeof s !== 'object') throw new InputError('section is required, e.g. { "shape": "rect", "b": 40, "h": 30 } (mm)');
  const shape = pick(s, 'shape', SECTION_SHAPES);
  const d = { shape };
  if (shape === 'rect') Object.assign(d, { b: num(s, 'b', 1, 2000), h: num(s, 'h', 1, 2000) });
  if (shape === 'circle') d.d = num(s, 'd', 1, 2000);
  if (shape === 'tube') { Object.assign(d, { d: num(s, 'd', 2, 2000), t: num(s, 't', 0.5, 500) }); if (2 * d.t >= d.d) throw new InputError('tube wall too thick'); }
  if (shape === 'rhs') { Object.assign(d, { b: num(s, 'b', 2, 2000), h: num(s, 'h', 2, 2000), t: num(s, 't', 0.5, 500) }); if (2 * d.t >= Math.min(d.b, d.h)) throw new InputError('rhs wall too thick'); }
  if (shape === 'I') { Object.assign(d, { h: num(s, 'h', 4, 2000), b: num(s, 'b', 2, 2000), tw: num(s, 'tw', 0.5, 500), tf: num(s, 'tf', 0.5, 500) }); if (2 * d.tf >= d.h || d.tw >= d.b) throw new InputError('I-section flanges or web too thick'); }
  return d;
}
const materialIn = id => { if (!MATERIALS[id]) throw new InputError(`material must be one of: ${Object.keys(MATERIALS).join(', ')}`); return MATERIALS[id]; };

// ---------- engines ----------
const SOLIDS_NOT_MODELLED = ['bolt slip and real end fixity', 'stress concentrations', 'fatigue', 'local and lateral-torsional buckling', 'dynamic loads', 'shear deformation', 'plasticity beyond yield'];
const handlers = {
  'solids/beam': b => {
    const span = num(b, 'span', 10, 100000), load = num(b, 'load', -1e7, 1e7), at = num(b, 'position', 0, span);
    const mat = materialIn(b.material ?? 'steel'), secSpec = sectionIn(b.section), sec = section(secSpec);
    const n = Math.min(200, Math.max(2, Math.round(num(b, 'points', 2, 200, 41)) - 1));
    const xs = [...new Set([...Array.from({ length: n + 1 }, (_, i) => span * i / n), at])].sort((p, q) => p - q);
    const s = { nodes: xs.map(x => ({ x, y: 0 })), members: xs.slice(1).map((_, i) => ({ i, j: i + 1, material: mat, section: sec, type: 'frame' })),
      supports: [{ node: 0, type: 'pin' }, { node: xs.length - 1, type: 'roller' }], loads: [{ node: xs.indexOf(at), fx: 0, fy: -load, m: 0 }] };
    const r = solve(s);
    const M = xs.map((_, i) => (i < xs.length - 1 ? -r.members[i].end[2] : r.members[xs.length - 2].end[5]));
    const defl = xs.map((_, i) => -r.displacements[3 * i + 1]);
    const k = defl.reduce((a, d, i) => (Math.abs(d) > Math.abs(defl[a]) ? i : a), 0), km = M.reduce((a, m, i) => (Math.abs(m) > Math.abs(M[a]) ? i : a), 0);
    const yieldS = mat.yield ?? Math.min(mat.tension, mat.compression);
    return {
      model: { name: 'Simply supported elastic beam (Euler–Bernoulli), point load', method: 'direct stiffness method (OpenPath Solids engine)', notModelled: [...SOLIDS_NOT_MODELLED, 'self-weight'] },
      units: { length: 'mm', force: 'N', moment: 'N·mm', stress: 'MPa', deflection: 'mm (downward positive)', mass: 'kg' },
      inputs: { span, load, position: at, material: mat.id, section: secSpec },
      result: {
        reactions: { left: r.reactions[0].fy, right: r.reactions[1].fy },
        deflectionUnderLoad: defl[xs.indexOf(at)], maxDeflection: { value: defl[k], at: xs[k] },
        maxMoment: { value: M[km], at: xs[km] }, maxBendingStress: Math.abs(M[km]) * sec.c / sec.I,
        stressRatioToYield: Math.abs(M[km]) * sec.c / sec.I / yieldS,
        section: { A: sec.A, I: sec.I, c: sec.c, label: sec.label }, EI: mat.E * sec.I, mass: mat.density * sec.A * 1e-9 * span,
        profile: xs.map((x, i) => ({ x, deflection: defl[i], moment: M[i] })),
      },
    };
  },
  'solids/frame': b => {
    if (!Array.isArray(b.nodes) || b.nodes.length < 2 || b.nodes.length > 200) throw new InputError('nodes: 2–200 items of { x, y } (mm)');
    if (!Array.isArray(b.members) || !b.members.length || b.members.length > 400) throw new InputError('members: 1–400 items');
    if (!Array.isArray(b.supports) || !b.supports.length) throw new InputError('supports: at least one { node, type: fixed|pin|roller|guide }');
    const nodes = b.nodes.map((p, i) => ({ x: num(p, 'x', -1e6, 1e6), y: num(p, 'y', -1e6, 1e6), _i: i }));
    const nodeIdx = (o, k) => { const v = num(o, k, 0, nodes.length - 1); if (!Number.isInteger(v)) throw new InputError(`${k} must be a node index`); return v; };
    const members = b.members.map(m => ({ i: nodeIdx(m, 'i'), j: nodeIdx(m, 'j'), material: materialIn(m.material ?? 'steel'), section: section(sectionIn(m.section)), type: pick(m, 'type', ['frame', 'truss'], 'frame') }));
    if (members.some(m => m.i === m.j)) throw new InputError('a member must join two different nodes');
    const supports = b.supports.map(sp => ({ node: nodeIdx(sp, 'node'), type: pick(sp, 'type', ['fixed', 'pin', 'roller', 'guide']) }));
    const loads = (b.loads || []).slice(0, 400).map(l => ({ node: nodeIdx(l, 'node'), fx: num(l, 'fx', -1e8, 1e8, 0), fy: num(l, 'fy', -1e8, 1e8, 0), m: num(l, 'm', -1e12, 1e12, 0) }));
    const a = analyze({ nodes, members, supports, loads, selfWeight: !!b.selfWeight, gravity: 1 });
    if (!a.ok) throw new InputError(a.message || 'structure is unstable (a mechanism)', 422);
    return {
      model: { name: 'Linear-elastic 2D frame/truss', method: 'direct stiffness method; stresses N/A ± Mc/I; Euler buckling of compression members (pinned length)', notModelled: SOLIDS_NOT_MODELLED },
      units: { length: 'mm', force: 'N', moment: 'N·mm', stress: 'MPa', displacement: 'mm' },
      result: {
        safetyFactor: a.sf, governing: { member: a.governing.index, mode: a.governing.mode },
        maxDisplacement: { value: a.maxDefl.d, member: a.maxDefl.member },
        reactions: a.res.reactions, displacements: nodes.map((_, i) => ({ node: i, dx: a.res.displacements[3 * i], dy: a.res.displacements[3 * i + 1], rotation: a.res.displacements[3 * i + 2] })),
        members: a.members.map(m => ({ member: m.index, maxStress: m.maxSigma, safetyFactor: m.sf, mode: m.mode, bucklingLoad: m.Pcr })),
      },
    };
  },
  'hydraulics/pump-system': b => {
    const pipe = (o, base) => o === undefined ? base : ({ D: num(o, 'D', 0.005, 2, base.D), L: num(o, 'L', 0.1, 10000, base.L), material: pick(o, 'material', Object.keys(PIPE_MATERIALS), base.material), elbows: num(o, 'elbows', 0, 50, base.elbows) });
    const s = { ...STOCK_SYSTEM, temp: num(b, 'temp', 1, 95, STOCK_SYSTEM.temp), altitude: num(b, 'altitude', 0, 5000, 0), sumpLevel: num(b, 'sumpLevel', -9, 20, STOCK_SYSTEM.sumpLevel),
      tankHeight: num(b, 'tankHeight', 0, 200, STOCK_SYSTEM.tankHeight), valveOpen: num(b, 'valveOpen', 0.02, 1, 1), arrangement: pick(b, 'arrangement', ['single', 'parallel', 'series'], 'single'),
      suction: pipe(b.suction, STOCK_SYSTEM.suction), delivery: pipe(b.delivery, STOCK_SYSTEM.delivery) };
    const p = { ...STOCK_PUMP, rpm: num(b, 'rpm', 300, 6000, STOCK_PUMP.rpm), D2: num(b, 'impellerDiameter', 0.05, 0.4, STOCK_PUMP.D2) };
    const o = operate(s, p);
    return {
      model: { name: 'Pump in a pipe system: operating point', method: 'centrifugal pump from impeller geometry (Euler + Wiesner slip + losses); Darcy–Weisbach with Colebrook; NPSH (Pfleiderer)', notModelled: ['transients and water hammer', 'air entrainment', 'motor characteristics', 'gradual head loss near cavitation'], note: 'model pump, not a catalogue pump' },
      units: { flow: 'm³/s', head: 'm', power: 'W', efficiency: 'fraction', npsh: 'm', velocity: 'm/s' },
      result: { flow: o.Q, head: o.H, shaftPower: o.power, efficiency: o.eff, staticHead: o.staticHead, npshAvailable: o.npsha, npshRequired: o.npshr, cavitating: o.cavitating, noFlow: o.noFlow,
        delivery: { velocity: o.delivery.V, reynolds: o.delivery.Re, frictionFactor: o.delivery.f, regime: o.delivery.regime, frictionLoss: o.delivery.hf }, suctionGauge: o.inletGauge, deliveryGauge: o.outletGauge },
    };
  },
  'hydraulics/reciprocating': b => {
    const P = { ...STOCK_RECIP, D: num(b, 'D', 0.01, 1, STOCK_RECIP.D), stroke: num(b, 'stroke', 0.01, 2, STOCK_RECIP.stroke), rpm: num(b, 'rpm', 1, 600, STOCK_RECIP.rpm), acting: pick(b, 'acting', ['single', 'double'], 'single'),
      Cd: num(b, 'Cd', 0.5, 1, STOCK_RECIP.Cd), hs: num(b, 'hs', 0, 9, STOCK_RECIP.hs), hd: num(b, 'hd', 0, 500, STOCK_RECIP.hd),
      suction: { L: num(b.suction, 'L', 0.1, 500, STOCK_RECIP.suction.L), d: num(b.suction, 'd', 0.005, 1, STOCK_RECIP.suction.d) }, delivery: { L: num(b.delivery, 'L', 0.1, 5000, STOCK_RECIP.delivery.L), d: num(b.delivery, 'd', 0.005, 1, STOCK_RECIP.delivery.d) },
      vesselS: !!b.airVesselSuction, vesselD: !!b.airVesselDelivery, temp: num(b, 'temp', 1, 95, 30), altitude: num(b, 'altitude', 0, 5000, 0) };
    const r = recip(P);
    return {
      model: { name: 'Reciprocating pump (textbook model)', method: 'SHM piston, rigid water columns (acceleration head), Darcy friction, air vessels, separation at 2.5 m abs', notModelled: ['valve dynamics', 'water hammer after separation', 'compressibility'] },
      units: { flow: 'm³/s', power: 'W', head: 'm of water', speed: 'rpm' },
      result: { theoreticalFlow: r.Qth, flow: r.Q, power: r.power, separation: r.separation, separationAt: r.separationWhere, separationSpeed: Number.isFinite(r.sepRpm) ? r.sepRpm : null,
        accelerationHead: { suction: r.suction.haMax, delivery: r.delivery.haMax }, frictionHeadPeak: { suction: r.suction.hfMax, delivery: r.delivery.hfMax },
        indicatorDiagram: r.diagram.map(d => ({ crankAngle: d.th, pistonPosition: d.x, head: d.h })) },
    };
  },
  'thermofluids/oil-viscosity': b => {
    const oil = b.grade !== undefined ? (OILS[b.grade] || (() => { throw new InputError(`grade must be one of: ${Object.keys(OILS).join(', ')}`); })())
      : { name: 'custom', kv40: num(b, 'kv40', 2, 2000), kv100: num(b, 'kv100', 1, 200) };
    const temps = Array.isArray(b.temperatures) ? b.temperatures.slice(0, 100) : [-30, 0, 40, 100];
    return {
      model: { name: 'Oil viscosity vs temperature', method: 'ASTM D341 (Walther) fit through 40 °C and 100 °C data; below 0 °C anchored to SAE J300 cold-cranking limits', notModelled: ['shear thinning', 'ageing (unless supplied)', 'wax crystallisation detail'] },
      units: { temperature: '°C', kinematic: 'mm²/s (cSt)', dynamic: 'mPa·s' },
      inputs: { grade: oil.name, kv40: oil.kv40, kv100: oil.kv100 },
      result: temps.map(T => { const t = num({ T }, 'T', -50, 160); const v = viscosity(oil, t); return { temperature: t, ...v }; }),
    };
  },
  'thermofluids/engine-cycle': b => {
    const opts = { rpm: num(b, 'rpm', 500, 9000, 3000), manifold: num(b, 'manifoldBar', 0.2, 3, 1.0), ignition: num(b, 'ignitionDeg', -60, 10, -15), lambda: num(b, 'lambda', 0.7, 1.6, 1), T1: num(b, 'intakeTempK', 230, 400, 320) };
    if (b.octane !== undefined) opts.octane = num(b, 'octane', 70, 110);
    const c = cycle(opts);
    return {
      model: { name: 'Single-zone four-stroke closed cycle (1.2 L reference engine)', method: 'first law with Wiebe heat release, fixed wall-loss fraction; knock by Livengood–Wu / Douaud–Eyzat (calibrated)', notModelled: ['gas exchange (use engine-bench)', 'detailed heat transfer', 'combustion chemistry'] },
      units: { pressure: 'Pa', work: 'J', angle: 'degrees after firing TDC' },
      inputs: { ...opts, engine: { bore: ENGINE.bore, stroke: ENGINE.stroke, rod: ENGINE.rod, cr: ENGINE.cr } },
      result: { imep: c.imep, pmax: c.pmax, peakAngle: c.thPmax, indicatedEfficiency: c.etaIndicated, work: c.work, knock: c.knock, knockAngle: c.knockAngle, burnDuration: c.burnDeg,
        trace: b.trace ? c.trace.map(p => ({ angle: p.theta, volume: p.V, pressure: p.p })) : undefined },
    };
  },
};

// heavy engines run in a worker with a time limit
const HEAVY = {
  'thermofluids/engine-bench': b => ({ kind: 'bench', rpm: num(b, 'rpm', 1000, 7500, 4500), cam: { duration: num(b.cam, 'duration', 200, 310, 240), lift: num(b.cam, 'lift', 6, 13, 8), centre: num(b.cam, 'centre', 95, 120, 105) }, runner: num(b, 'runnerLength', 0.1, 1.2, 0.34), trace: !!b.trace }),
  'fluids/flow-probe': b => ({ kind: 'probe', scene: pick(b, 'scene', Object.keys(SCENES)), Re: num(b, 'reynolds', 5, 300), aoa: num(b, 'aoaDeg', -10, 25, 0) }),
};
const BUSY_LIMIT = 2, TIMEOUT_MS = 30000;
let busy = 0;
function runHeavy(job) {
  if (busy >= BUSY_LIMIT) throw new InputError('busy: too many simulations running, retry in a few seconds', 429);
  busy++;
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: job });
    const t = setTimeout(() => { w.terminate(); reject(new InputError('simulation timed out', 504)); }, TIMEOUT_MS);
    w.once('message', m => { clearTimeout(t); m.error ? reject(new InputError(m.error, 422)) : resolve(m); });
    w.once('error', e => { clearTimeout(t); reject(e); });
  }).finally(() => { busy--; });
}

// ---------- catalogue ----------
const CATALOGUE = {
  name: 'OpenPath Labs simulation API', version: VERSION,
  note: 'Teaching models with stated assumptions and limits — not design certification. All POST bodies are JSON; responses include model, units and what is not modelled.',
  auth: 'When the server has API keys configured, send header x-api-key with POST requests.',
  endpoints: [
    { method: 'POST', path: '/v1/solids/beam', example: { span: 600, load: 2500, position: 200, material: 'aluminium', section: { shape: 'rect', b: 40, h: 30 } } },
    { method: 'POST', path: '/v1/solids/frame', example: { nodes: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], members: [{ i: 0, j: 1, material: 'steel', section: { shape: 'I', h: 200, b: 100, tw: 6, tf: 9 } }], supports: [{ node: 0, type: 'fixed' }], loads: [{ node: 1, fy: -5000 }] } },
    { method: 'POST', path: '/v1/hydraulics/pump-system', example: { tankHeight: 18, sumpLevel: -2.5, rpm: 2900, delivery: { D: 0.04, L: 30, material: 'gi', elbows: 4 } } },
    { method: 'POST', path: '/v1/hydraulics/reciprocating', example: { D: 0.1, stroke: 0.2, rpm: 60, hs: 3, hd: 18, suction: { L: 4, d: 0.075 }, delivery: { L: 25, d: 0.075 }, airVesselDelivery: true } },
    { method: 'POST', path: '/v1/thermofluids/oil-viscosity', example: { grade: '5W-30', temperatures: [-30, 0, 40, 100] } },
    { method: 'POST', path: '/v1/thermofluids/engine-cycle', example: { rpm: 3000, manifoldBar: 1, ignitionDeg: -15, lambda: 1, octane: 91 } },
    { method: 'POST', path: '/v1/thermofluids/engine-bench', example: { rpm: 4500, runnerLength: 0.34 }, note: '1D gas dynamics of a K12M-class engine, ~1–3 s; one fitted torque point, one power check — not a validated full curve' },
    { method: 'POST', path: '/v1/fluids/flow-probe', example: { scene: 'cylinder', reynolds: 100 }, note: '2D lattice Boltzmann, Re 5–300, ~1–6 s' },
  ],
  materials: Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, { name: m.name, E: m.E, density: m.density, yield: m.yield ?? null, source: m.source }])),
  sections: SECTION_SHAPES, pipeMaterials: Object.keys(PIPE_MATERIALS), oilGrades: Object.keys(OILS), flowScenes: Object.keys(SCENES),
};

// ---------- HTTP ----------
const MAX_BODY = 64 * 1024;
function rateLimited(hits, ip, limit) {
  const now = Date.now(), w = hits.get(ip) || [];
  const recent = w.filter(t => now - t < 60000); recent.push(now); hits.set(ip, recent);
  if (hits.size > 10000) hits.clear();
  return recent.length > limit;
}
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-api-key', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = req => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
  req.on('end', () => { if (size > MAX_BODY) return reject(new InputError('body too large (64 KB max)', 413)); try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new InputError('body must be valid JSON', 400)); } });
  req.on('error', reject);
});

export function createApp({ keys = (process.env.API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean), ratePerMin = +(process.env.RATE_PER_MIN || 60) } = {}) {
  const hits = new Map();
  return createServer(async (req, res) => {
    const t0 = Date.now(), url = new URL(req.url, 'http://x'), path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (req.method === 'GET' && (path === '/health' || path === '/')) return send(res, 200, { ok: true, service: 'openpath-labs-api', version: VERSION, commit: commit() });
      if (req.method === 'GET' && path === '/v1') return send(res, 200, CATALOGUE);
      const route = path.startsWith('/v1/') ? path.slice(4) : null;
      if (!route || (!handlers[route] && !HEAVY[route])) return send(res, 404, { ok: false, error: 'not found — see GET /v1' });
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'use POST' });
      if (keys.length && !keys.includes(req.headers['x-api-key'])) return send(res, 401, { ok: false, error: 'missing or invalid x-api-key' });
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (rateLimited(hits, ip, ratePerMin)) return send(res, 429, { ok: false, error: `rate limit: ${ratePerMin} requests per minute` });
      const body = await readBody(req);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InputError('body must be a JSON object', 400);
      const out = handlers[route] ? handlers[route](body) : await runHeavy(HEAVY[route](body));
      return send(res, 200, { ok: true, engine: route, version: VERSION, ...out, elapsedMs: Date.now() - t0 });
    } catch (e) {
      if (e instanceof InputError) return send(res, e.status, { ok: false, error: e.message });
      console.error(e);
      return send(res, 500, { ok: false, error: 'internal error' });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +(process.env.PORT || 10000);
  createApp().listen(port, '0.0.0.0', () => console.log(`openpath-labs-api ${VERSION} listening on :${port}${process.env.API_KEYS ? ' (API keys required for POST)' : ''}`));
}
