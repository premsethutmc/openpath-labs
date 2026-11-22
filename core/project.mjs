// Shared project and evidence record for every bench, in any domain (fluids, solids, …).
// No physics and no rendering here. A bench supplies an adapter:
//   { domain, title, evaluate(setup) → { ok:true, outputs, verdicts } | { ok:false, reason } }
//   outputs:  { key: { label, value, unit, source: 'input' | 'simulated' | 'measured' | 'table' } }
//   verdicts: { key: { label, value: 'pass' | 'fail' | 'cannot-assess' | 'not-applicable', reason } }
// A project holds the learner's current setup and the runs they chose to save. A run freezes the setup it was taken
// on together with its results, so it can be recomputed later and compared with any other run.
// Version 2 adds decisions: a claim about a revision, the runs that show it, what was rejected and its defence.
// Version 1 files still load (they simply have no decisions yet).
export const FORMAT = 'openpath.project', VERSION = 2, VERSIONS = [1, 2];

export class ProjectError extends Error {}
const clone = v => JSON.parse(JSON.stringify(v));

export function createProject({ domain, name, setup, origin = 'scratch' }) {
  if (!domain) throw new ProjectError('a project needs a domain');
  return { format: FORMAT, version: VERSION, domain, id: null, name: name || 'Untitled', origin, setup: clone(setup), runs: [], nextRun: 1, decisions: [] };
}
const sameDomain = (project, adapter) => { if (project.domain !== adapter.domain) throw new ProjectError(`this project belongs to ${project.domain}, not ${adapter.domain}`); };

// Save the current setup as a run. A setup the model does not support is refused with its reason: no made-up result.
export function saveRun(project, adapter, name) {
  sameDomain(project, adapter);
  const r = adapter.evaluate(clone(project.setup));
  if (!r.ok) throw new ProjectError(`Not saved: ${r.reason}`);
  const run = { id: `R${project.nextRun++}`, name: (name || '').trim() || `Run ${project.nextRun - 1}`, setup: clone(project.setup), outputs: clone(r.outputs), verdicts: clone(r.verdicts || {}) };
  project.runs.push(run);
  return run;
}

const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);
// Recompute a saved run from its own frozen setup and report any difference.
export function reproduceRun(run, adapter) {
  const r = adapter.evaluate(clone(run.setup));
  if (!r.ok) return { ok: false, diffs: [`no longer solvable: ${r.reason}`] };
  const diffs = [];
  for (const k of new Set([...Object.keys(run.outputs), ...Object.keys(r.outputs)])) if (!close(run.outputs[k]?.value, r.outputs[k]?.value)) diffs.push(k);
  for (const k of new Set([...Object.keys(run.verdicts), ...Object.keys(r.verdicts || {})])) if (run.verdicts[k]?.value !== r.verdicts?.[k]?.value) diffs.push(`verdict ${k}`);
  return { ok: diffs.length === 0, diffs };
}

// Setup differences as flat paths, e.g. 'chain.3.beta' or 'state.material'.
export function setupDiff(a, b) {
  const flat = (o, pre = '') => o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, pre ? `${pre}.${k}` : k)) : [[pre, o]];
  const A = new Map(flat(a)), B = new Map(flat(b));
  return [...new Set([...A.keys(), ...B.keys()])].filter(k => !close(A.get(k), B.get(k))).map(path => ({ path, a: A.get(path), b: B.get(path) }));
}
export function compareRuns(a, b) {
  const keys = [...new Set([...Object.keys(a.outputs), ...Object.keys(b.outputs)])];
  return {
    changed: setupDiff(a.setup, b.setup),
    outputs: keys.map(k => { const x = a.outputs[k], y = b.outputs[k]; return { key: k, label: (x || y).label, unit: (x || y).unit, a: x?.value ?? null, b: y?.value ?? null, changed: !close(x?.value, y?.value) }; }),
    verdicts: [...new Set([...Object.keys(a.verdicts), ...Object.keys(b.verdicts)])].map(k => ({ key: k, label: (a.verdicts[k] || b.verdicts[k]).label, a: a.verdicts[k]?.value ?? null, b: b.verdicts[k]?.value ?? null, changed: a.verdicts[k]?.value !== b.verdicts[k]?.value })),
  };
}

// Fork: a new project starting from this project's setup (or from one of its runs). Evidence stays with the original.
export function forkProject(project, { name, fromRun } = {}) {
  const run = fromRun ? project.runs.find(r => r.id === fromRun) : null;
  if (fromRun && !run) throw new ProjectError('no such run');
  return { ...createProject({ domain: project.domain, name: name || `${project.name} (fork)`, setup: run ? run.setup : project.setup }), origin: `fork:${project.id ?? project.name}${run ? `@${run.id}` : ''}` };
}

// A decision on the record: from one run (revision) to another, what is claimed, which runs show it, what was rejected,
// and the "what if" defence with its engine-computed truths. Every run it names must be on this project.
export function addDecision(project, { from, to, claim, runs = [], rejected = [], defence = [] }) {
  const has = id => project.runs.some(r => r.id === id);
  for (const id of [from, to, ...runs]) if (!has(id)) throw new ProjectError(`no run ${id} on this project`);
  if (!String(claim ?? '').trim()) throw new ProjectError('a decision needs a claim');
  if (!Array.isArray(rejected) || !Array.isArray(defence)) throw new ProjectError('rejected and defence are lists');
  project.decisions ??= [];
  const d = { id: `D${project.decisions.length + 1}`, from, to, claim: String(claim).trim(), runs: [...new Set(runs)],
    rejected: rejected.map(t => String(t).trim()).filter(Boolean), defence: clone(defence) };
  project.decisions.push(d);
  project.version = VERSION;
  return d;
}

export const serialize = project => JSON.stringify(project, null, 2);
export function deserialize(text, domain) {
  let p; try { p = JSON.parse(text); } catch { throw new ProjectError('not a project file'); }
  if (p?.format !== FORMAT || !VERSIONS.includes(p.version)) throw new ProjectError(`not an OpenPath project file (version ${VERSIONS.join(' or ')})`);
  if (domain && p.domain !== domain) throw new ProjectError(`this file is a ${p.domain} project; open it in that bench`);
  if (!Array.isArray(p.runs) || typeof p.setup !== 'object') throw new ProjectError('project file is incomplete');
  if (p.version === 1) p.decisions = [];                       // a version 1 file loads as it was; decisions start empty
  else if (!Array.isArray(p.decisions)) throw new ProjectError('project file is incomplete');
  return p;
}

// Browser store: every project of one domain under one key, plus which one is open.
export function openStore(domain, storage = globalThis.localStorage) {
  const key = `openpath.projects.${domain}`;
  const read = () => { try { return JSON.parse(storage.getItem(key)) || { current: null, projects: [], next: 1 }; } catch { return { current: null, projects: [], next: 1 }; } };
  let db = read();
  const write = () => { try { storage.setItem(key, JSON.stringify(db)); } catch {} };
  return {
    list: () => db.projects.map(p => ({ id: p.id, name: p.name, runs: p.runs.length, origin: p.origin })),
    get: id => db.projects.find(p => p.id === id) ?? null,
    current: () => db.projects.find(p => p.id === db.current) ?? null,
    put(project) {
      if (project.domain !== domain) throw new ProjectError(`store for ${domain} cannot hold a ${project.domain} project`);
      if (!project.id) project.id = `P${db.next++}`;
      const i = db.projects.findIndex(p => p.id === project.id);
      if (i >= 0) db.projects[i] = project; else db.projects.push(project);
      write(); return project;
    },
    open(id) { if (!db.projects.some(p => p.id === id)) throw new ProjectError('no such project'); db.current = id; write(); return this.current(); },
    remove(id) { db.projects = db.projects.filter(p => p.id !== id); if (db.current === id) db.current = null; write(); },
    reload() { db = read(); },
  };
}
