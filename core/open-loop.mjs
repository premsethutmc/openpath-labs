// Open loop: a runner spec (core/journey.mjs) built from the learner's own project on any open bench (docs/OPEN_LOOP.md).
// No DOM, no physics, no content: everything comes from the bench's LEARN descriptor and its adapter.
//
//   openSpec({ learn, project, picked?, graph?, items?, results? }) → spec
//     learn    the bench's LEARN: { domain, page, adapter, describe, outputs, levers, concepts?, title?, content? }
//     project  the learner's project (core/project.mjs): Revision 1 will be a run of its current setup, on this project
//     picked   output keys already chosen (optional): otherwise the learner picks 1–3 of them on the page
//     graph, items   core/graph.mjs buildGraph / buildItems (optional): teach entries with worked examples
//     results  adapter.evaluate(project.setup).outputs (optional): only outputs this run really has are offered
//   The target is the competency of the picked output missed most (relative error); a tie goes to the first picked.
//   Defence questions come from learn.levers: every lever changed between Revision 1 and Revision 2, put back to its
//   Revision 1 value; if none changed, the first two levers at +20 % (else −20 %) or the next option. Only setups the
//   adapter accepts are kept, and the answers are adapter.evaluate on the patched copy (the runner computes them).
export const DEFAULT_TOL = 0.05;
export const MAX_PICK = 3;
const clone = v => JSON.parse(JSON.stringify(v));
const parts = path => String(path).split('.');
export const getAt = (o, path) => parts(path).reduce((v, k) => (v == null ? undefined : v[k]), o);
function setAt(o, keys, value) {
  if (!keys.length) return clone(value);
  const [k, ...rest] = keys, out = Array.isArray(o) ? [...o] : { ...(o ?? {}) };
  out[k] = setAt(out[k], rest, value);
  return out;
}
// A runner patch that sets one path: the whole top-level field is given, so lists inside it stay lists.
export function patchAt(setup, path, value) {
  const [top, ...rest] = parts(path);
  return { [top]: setAt(clone(setup?.[top]), rest, value) };
}

// The outputs the learner may predict: { key: { label, unit, competency, tol } }, in the bench's order.
export function outputsOf(learn, setup, results) {
  // a bench may know which outputs this very setup produces (dynamic keys, e.g. one per joint or per instrument)
  const all = typeof learn.outputsFor === 'function' ? { ...(typeof learn.outputs === 'object' ? learn.outputs : {}), ...learn.outputsFor(clone(setup)) }
    : typeof learn.outputs === 'function' ? learn.outputs(clone(setup), results ? clone(results) : undefined) : learn.outputs;
  return Object.fromEntries(Object.entries(all || {}).filter(([k, o]) => o?.competency && (!results || results[k])).map(([k, o]) => [k, { ...o, label: o.label ?? results?.[k]?.label ?? k, unit: o.unit ?? results?.[k]?.unit ?? '' }]));
}

export const relError = (predicted, truth) => (!Number.isFinite(truth) || !Number.isFinite(predicted) ? Infinity : truth === 0 ? Math.abs(predicted) : Math.abs(predicted - truth) / Math.abs(truth));
// The picked output missed most: the largest relative error among the misses (among all rows if nothing missed);
// ties go to the first picked; with no scored round at all, the first picked.
export function mostMissed(scored, picked = []) {
  const rows = (scored || []).filter(r => picked.length === 0 || picked.includes(r.id));
  const pool = rows.some(r => r.result === 'incorrect') ? rows.filter(r => r.result === 'incorrect') : rows;
  let best = null, err = -1;
  for (const r of [...pool].sort((a, b) => picked.indexOf(a.id) - picked.indexOf(b.id))) { const e = relError(r.predicted, r.truth); if (e > err) { best = r.id; err = e; } }
  return best ?? picked[0] ?? null;
}

const fmt = (v, unit) => (typeof v === 'number' ? `${+v.toPrecision(4)}${unit ? ` ${unit}` : ''}` : String(v));
// Benches describe a lever's options as [value | { value, label }], as a { value: label } map, or as values with a parallel
// optionLabels list; numbers may carry a display scale (a bore held in m, shown in mm).
const optionValue = o => (o && typeof o === 'object' ? o.value : o);
const optionValues = l => (Array.isArray(l.options) ? l.options.map(optionValue) : l.options && typeof l.options === 'object' ? Object.keys(l.options) : []);
const optionLabel = (lever, v) => {
  if (lever.options && !Array.isArray(lever.options) && typeof lever.options === 'object') return lever.options[v] ?? String(v);
  const i = (lever.options || []).findIndex(x => optionValue(x) === v), o = lever.options?.[i];
  return o && typeof o === 'object' ? o.label ?? String(v) : lever.optionLabels?.[i] ?? String(v);
};
const show = (lever, v) => (lever.kind === 'option' ? optionLabel(lever, v) : fmt(typeof v === 'number' ? +(v * (lever.scale ?? 1)).toPrecision(6) : v, lever.unit));
// "Material" reads "the material" inside a sentence; labels that start with a name or a symbol are kept.
const inSentence = label => (/^[A-Z][a-z]/.test(label) ? `the ${label[0].toLowerCase()}${label.slice(1)}` : label);
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b));

// Defence questions for Revision 2 (`setup`) against Revision 1 (`from`), asked about the picked outputs in turn.
// One lever change as a runner patch. A lever may carry apply(setup, value) (one change that moves several paths), or the
// bench may give applyLever(setup, path, value) (its own edit function); the whole new setup is then the patch.
function leverPatch(learn, setup, l, value) {
  if (typeof l.apply === 'function') return clone(l.apply(clone(setup), value));
  if (typeof learn.applyLever === 'function') { try { const s = learn.applyLever(clone(setup), l.path, value); if (s && typeof s === 'object') return clone(s); } catch { return null; } }
  return patchAt(setup, l.path, value);
}

export function defendFrom(learn, setup, { from, picked = [], adapter } = {}, outs = outputsOf(learn, setup)) {
  const reads = picked.filter(k => outs[k]);
  if (!reads.length || typeof learn.levers !== 'function') return [];
  const levers = learn.levers(clone(setup)) || [];
  const valid = (change, read) => { if (!change) return false; if (!adapter) return true; const s = { ...clone(setup), ...clone(change) }; const r = adapter.evaluate(s); return !!(r?.ok && r.outputs?.[read] && Number.isFinite(r.outputs[read].value)); };
  const ask = (k, prompt, change) => { const read = reads[k % reads.length]; return { prompt: prompt(outs[read]), change, read, tol: outs[read].tol ?? DEFAULT_TOL }; };
  const qs = [];
  for (const l of levers) {
    const was = getAt(from, l.path), now = getAt(setup, l.path);
    if (from == null || was === undefined || same(was, now)) continue;
    const change = leverPatch(learn, setup, l, was), read = reads[qs.length % reads.length];
    if (valid(change, read)) qs.push(ask(qs.length, o => `What would ${o.what ?? inSentence(o.label)} be if ${inSentence(l.label)} went back to its Revision 1 value (${show(l, was)} instead of ${show(l, now)})?`, change));
  }
  if (qs.length) return qs;
  for (const l of levers) {
    if (qs.length >= 2) break;
    const now = getAt(setup, l.path), read = reads[qs.length % reads.length];
    let tries = [];
    if (Array.isArray(l.values) && l.values.length) tries = l.values.filter(v => !same(v, now));
    else if (l.kind === 'option') { const vals = optionValues(l), i = vals.findIndex(v => v === now); tries = vals.slice(i + 1).concat(vals.slice(0, Math.max(i, 0))).filter(v => v !== now); }
    else if (typeof now === 'number' && now !== 0) tries = [+(now * 1.2).toPrecision(4), +(now * 0.8).toPrecision(4)];
    for (const v of tries) {
      const change = leverPatch(learn, setup, l, v);
      if (!valid(change, read)) continue;
      qs.push(ask(qs.length, o => `What would ${o.what ?? inSentence(o.label)} be if ${inSentence(l.label)} were ${show(l, v)} instead of ${show(l, now)}?`, change));
      break;
    }
  }
  return qs;
}

// Teach entries for every competency a picked output could point to, and its mandatory prerequisites that have items.
function teachFrom(learn, outs, setup, graph, items) {
  if (!graph) return {};
  const seeds = [...new Set([...Object.values(outs).map(o => o.competency), ...(typeof learn.concepts === 'function' ? learn.concepts(clone(setup), clone(outs)) || [] : [])])].filter(c => graph.has(c));
  const teach = {};
  const entry = (c, own) => {
    const n = graph.node(c), gen = n.items && items?.has(n.items) ? n.items : null;
    let steps = Array.isArray(n.steps) ? [...n.steps] : [];
    if (!steps.length && gen) { try { const it = items.make(gen, 1, items.generators[gen].aspects.includes('procedure') ? 'procedure' : items.generators[gen].aspects[0]); steps = [`Worked example: ${it.prompt}`, ...(it.solution || [])]; } catch {} }
    return { steps, ...(gen ? { items: gen } : {}), ...(own && learn.page ? { explore: { page: learn.page } } : {}) };
  };
  for (const c of seeds) {
    teach[c] ??= entry(c, true);
    for (const p of graph.prerequisitesOf(c, 1)) if (!teach[p] && graph.node(p).items && (!items || items.has(graph.node(p).items))) teach[p] = entry(p, false);
  }
  return teach;
}

export function openSpec({ learn, project, picked = null, graph = null, items = null, results = null }) {
  if (!learn?.domain) throw new Error('a bench needs a LEARN descriptor with a domain');
  if (!project?.id) throw new Error('open a saved project first');
  if (project.domain !== learn.domain) throw new Error(`this project belongs to ${project.domain}, not ${learn.domain}`);
  const outs = outputsOf(learn, project.setup, results), keys = Object.keys(outs);
  if (!keys.length) throw new Error('This bench has nothing to predict yet.');
  const max = Math.min(MAX_PICK, keys.length);
  const chosen = picked ? [...new Set(picked)].filter(k => outs[k]).slice(0, max) : null;
  if (picked && !chosen.length) throw new Error('none of the picked outputs can be predicted on this design');
  // later designs may have other dynamic outputs: read the label from the run when the bench no longer lists it
  const prediction = k => ({ id: k, prompt: outs[k].label, unit: outs[k].unit ?? '', tol: outs[k].tol ?? DEFAULT_TOL, truth: (s, r) => r?.[k]?.value ?? NaN });
  const predictions = ids => ids.filter(k => outs[k]).map(prediction);
  return {
    id: `open:${learn.domain}:${project.id}`, title: 'Your design', course: project.name, semester: null,
    bench: { page: learn.page, domain: learn.domain, adapter: learn.adapter },
    ...(learn.content ? { content: learn.content } : {}),
    ...(typeof learn.describe === 'function' ? { describe: learn.describe } : {}),
    ...(learn.labels ? { labels: learn.labels } : {}),
    brief: 'Predict how your own design behaves. If a prediction misses, find what is blocking you, learn it, show you can do it on your own, then come back and improve your design.',
    anchor: { project: project.id, setup: clone(project.setup), revision: 'Revision 1' },
    stuck: { choose: { options: keys.map(k => ({ id: k, prompt: outs[k].label, unit: outs[k].unit ?? '' })), min: 1, max, ...(chosen ? { picked: chosen } : {}) }, predictions },
    target: ({ scored, picked: ids }) => outs[mostMissed(scored, ids)]?.competency ?? outs[ids?.[0] ?? keys[0]].competency,
    teach: teachFrom(learn, outs, project.setup, graph, items),
    apply: { count: 3, ...(learn.page ? { transfer: { page: learn.page, prompt: 'Try the same idea on your own design: change one thing on the bench and say what should move before you look.' } } : {}) },
    check: { count: 1 },
    return: { predictions, decision: true },
    defend: (setup, _outputs, ctx = {}) => defendFrom(learn, setup, ctx, outputsOf(learn, setup)),
  };
}
