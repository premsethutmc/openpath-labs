// LEARN descriptor for the Force Playground (domain 'solids-frame'). Contract: docs/OPEN_LOOP.md. No DOM imports.
// The student's own structure (any truss or frame, built from empty or from an edited preset) is described in words,
// its predictable outputs are mapped to graph competencies, and its levers are what the student can change.
import { MATERIALS } from '../core/materials.mjs';
import { section } from '../core/sections.mjs';
import { SCENARIOS } from '../core/scenarios.mjs';
import { LOAD_OBJECTS } from './presets.mjs';
import { evaluate } from './model.mjs';

const clone = o => JSON.parse(JSON.stringify(o));
const m1 = v => `${+(v / 1000).toFixed(2)} m`;
// every leaf path under a prefix of this setup, so describe() names each path a saved setup can hold
function leaves(o, pre) {
  if (o === null || typeof o !== 'object') return [pre];
  const e = Object.entries(o);
  return e.length ? e.flatMap(([k, v]) => leaves(v, `${pre}.${k}`)) : [pre];
}
const leavesOf = (setup, ...prefixes) => prefixes.flatMap(p => { const v = p.split('.').reduce((o, k) => o?.[k], setup); return v === undefined ? [] : leaves(v, p); });

const SUPPORT_WORD = { pin: 'pin', roller: 'roller', fixed: 'fixed', guide: 'wall guide' };
const memberSection = (setup, m) => { const g = m.group && m.group !== 'main' ? setup.object.groups?.[m.group] : null; return g ? { material: g.material, section: g.section } : { material: setup.state.material, section: setup.object.sections[setup.state.section] }; };

export function describe(setup) {
  const o = setup.object, s = setup.state, rows = [];
  const rigid = o.members.filter(m => m.type !== 'truss').length;
  rows.push({ label: 'Structure', value: `${o.name ?? 'Your structure'}: ${o.nodes.length} joints, ${o.members.length} members (${rigid} rigid, ${o.members.length - rigid} pin-jointed)${o.copiedFrom ? `, edited from the ${o.copiedFrom} preset` : ''}`,
    paths: [...leavesOf(setup, 'object.id', 'object.name', 'object.editable', 'object.copiedFrom', 'object.setting', 'object.gap', 'object.view', 'object.question', 'object.hang', 'object.deckWidth', 'object.sideHeight'), ...(setup.v !== undefined ? ['v'] : [])] });
  rows.push({ label: 'Joints', value: o.nodes.map((n, k) => `${k + 1} (${m1(n.x)}, ${m1(n.y)})`).join('; '), paths: leavesOf(setup, 'object.nodes') });
  rows.push({ label: 'Members', value: o.members.map((m, k) => { const ms = memberSection(setup, m); return `${k + 1}: joints ${m.i + 1}–${m.j + 1}, ${m.type === 'truss' ? 'pin-jointed' : 'rigid'}, ${MATERIALS[ms.material]?.name ?? ms.material}, ${section(ms.section).label}`; }).join('; '),
    paths: leavesOf(setup, 'object.members', 'object.groups') });
  rows.push({ label: 'Material (main members)', value: MATERIALS[s.material]?.name ?? s.material, paths: ['state.material', ...leavesOf(setup, 'object.materials')] });
  rows.push({ label: 'Section (main members)', value: section(o.sections[s.section]).label, paths: ['state.section', ...leavesOf(setup, 'object.sections')] });
  rows.push({ label: 'Supports', value: o.supports.length ? o.supports.map(sp => `${SUPPORT_WORD[sp.type] ?? sp.type} at joint ${sp.node + 1}`).join('; ') : 'none', paths: leavesOf(setup, 'object.supports') });
  rows.push({ label: 'Loads', value: s.loads.length ? s.loads.map(l => `${LOAD_OBJECTS[l.obj].name} (${LOAD_OBJECTS[l.obj].kg} kg) on member ${l.member + 1} at ${Math.round(l.at * 100)} % of its length`).join('; ') + '; plus the structure’s own weight' : 'only the structure’s own weight',
    paths: [...leavesOf(setup, 'state.loads', 'object.loadChoices')] });
  rows.push({ label: 'Conditions', value: SCENARIOS[s.scenario]?.name ?? s.scenario, paths: ['state.scenario'] });
  return rows;
}

// Fixed outputs (every setup). Mass and load carried are not predictions with a competency behind them, so not listed.
export const OUTPUTS = {
  sf: { label: 'Safety factor', unit: '', competency: 'ENG.solids.factor-of-safety' },
  stress: { label: 'Highest stress', unit: 'MPa', competency: 'ENG.solids.normal-stress' },
  movement: { label: 'Biggest movement', unit: 'mm', competency: 'ENG.solids.beam-stiffness' },
};
// Reactions: one support with a fixed end alone is a cantilever; a determinate pin + roller pair is ordinary
// equilibrium; anything else (extra fixity, several supports) is about what each support type can carry.
function reactionCompetency(setup) {
  const sp = setup.object.supports;
  if (sp.length === 1 && sp[0].type === 'fixed') return 'ENG.statics.cantilever-reactions';
  if (sp.length === 2 && sp.every(x => x.type === 'pin' || x.type === 'roller') && sp.some(x => x.type === 'roller')) return 'ENG.statics.equilibrium-2d';
  return 'ENG.statics.support-reactions';
}
// The outputs of this setup, with the dynamic reaction keys (reaction:<node>, moment:<node>) that evaluate() returns.
export function outputsFor(setup) {
  const r = evaluate({ ...setup, v: Math.max(2, setup.v ?? 1) }), out = clone(OUTPUTS);
  if (!r.ok) return out;
  const c = reactionCompetency(setup);
  for (const [k, o] of Object.entries(r.outputs)) if (/^(reaction|moment):/.test(k)) out[k] = { label: o.label, unit: o.unit, competency: c };
  return out;
}

// What the student can change. Options are only those that keep the structure solvable.
const SUPPORT_TYPES = ['pin', 'roller', 'fixed', 'guide'];
const valid = s => evaluate(s).ok;
export function setPath(setup, path, value) {
  const s = clone(setup), ks = path.split('.'), last = ks.pop();
  ks.reduce((o, k) => o[k], s)[last] = value;
  return s;
}
export function levers(setup) {
  const o = setup.object, s = setup.state, out = [];
  const opt = (path, label, values, labelOf = v => String(v)) => {
    const options = values.filter(v => valid(setPath(setup, path, v)));
    if (options.length > 1) out.push({ path, label, kind: 'option', options, optionLabels: options.map(labelOf) });
  };
  opt('state.material', 'Material of the main members', o.materials, m => MATERIALS[m].name);
  opt('state.section', 'Section of the main members', o.sections.map((_, k) => k), k => section(o.sections[k]).label);
  s.loads.forEach((l, k) => {
    opt(`state.loads.${k}.obj`, `Load ${k + 1}: what it is`, o.loadChoices ?? Object.keys(LOAD_OBJECTS), id => `${LOAD_OBJECTS[id].name} (${LOAD_OBJECTS[id].kg} kg)`);
    const decks = o.members.map((m, i) => i).filter(i => o.members[i].tags?.includes('deck'));
    opt(`state.loads.${k}.member`, `Load ${k + 1}: which member it sits on`, decks, i => `member ${i + 1}`);
    if (valid(setPath(setup, `state.loads.${k}.at`, 0)) && valid(setPath(setup, `state.loads.${k}.at`, 1)))
      out.push({ path: `state.loads.${k}.at`, label: `Load ${k + 1}: position along member ${l.member + 1} (fraction of its length)`, kind: 'number', min: 0, max: 1, step: 0.05 });
  });
  o.supports.forEach((sp, k) => opt(`object.supports.${k}.type`, `Support at joint ${sp.node + 1}`, SUPPORT_TYPES, t => SUPPORT_WORD[t]));
  opt('state.scenario', 'Conditions', Object.keys(SCENARIOS), id => SCENARIOS[id].name);
  return out;
}

export const LEARN = {
  domain: 'solids-frame',
  page: '../playground/?project=current',
  adapter: () => import('./model.mjs').then(m => m.SOLIDS_ADAPTER),
  describe,
  outputs: OUTPUTS,
  outputsFor,
  levers,
  setPath,
};
export default LEARN;
