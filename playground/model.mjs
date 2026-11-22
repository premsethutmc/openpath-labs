// Force Playground — the DOM-free model behind the shared experiment record (core/project.mjs).
// A setup is what the playground saves: { object: <the structure: nodes, members, supports, sections, …>,
//   state: { material, section, scenario, loads: [{ obj, member, at }] }, v? }.
// SOLIDS_ADAPTER.evaluate runs the Solids engine (engines/solids/analyze.mjs, direct-stiffness frame solver).
//
// Output keys. Every setup: sf, stress, movement, load, mass (unchanged since the first saved runs).
// Setups saved with v ≥ 2 (every run saved from now on) also carry the support reactions, as dynamic keys:
//   reaction:<node>  vertical support reaction at that joint (N, upward +; self-weight and scenario loads included)
//   moment:<node>    fixing moment at a fixed support (N·m, magnitude)
// A run saved before v 2 has no `v`, so it is recomputed with exactly the five outputs it was saved with and still
// reproduces (core/project.mjs reproduceRun compares the union of output keys).
import { analyze } from '../engines/solids/analyze.mjs';
import { LOAD_OBJECTS } from './presets.mjs';
import { mass, buildStructure } from './build.mjs';

export const SETUP_VERSION = 2;

export function evaluate(setup) {
  if (!setup?.object?.members?.length) return { ok: false, reason: 'nothing is built yet' };
  const st = buildStructure(setup.object, setup.state), a = analyze(st);
  if (!a.ok) return { ok: false, reason: a.message || 'the structure is a mechanism: it can move freely' };
  const kg = setup.state.loads.reduce((s, l) => s + LOAD_OBJECTS[l.obj].kg, 0);
  const used = mass(setup.object, m => st.members[setup.object.members.indexOf(m)]);
  const outputs = { sf: { label: 'Safety factor', value: a.sf, unit: '', source: 'simulated' }, stress: { label: 'Highest stress', value: Math.max(...a.members.map(m => m.maxSigma)), unit: 'MPa', source: 'simulated' },
    movement: { label: 'Biggest movement', value: a.maxDefl.d, unit: 'mm', source: 'simulated' }, load: { label: 'Load carried', value: kg, unit: 'kg', source: 'input' }, mass: { label: 'Material used', value: used, unit: 'kg', source: 'simulated' } };
  if ((setup.v ?? 1) >= 2) for (const r of a.res.reactions) {
    const x = (setup.object.nodes[r.node].x / 1000).toFixed(1);
    if (r.type !== 'guide') outputs[`reaction:${r.node}`] = { label: `Vertical reaction at joint ${r.node + 1} (${r.type}, x = ${x} m)`, value: r.fy, unit: 'N', source: 'simulated' };
    if (r.type === 'fixed') outputs[`moment:${r.node}`] = { label: `Fixing moment at joint ${r.node + 1} (x = ${x} m)`, value: Math.abs(r.m) / 1000, unit: 'N·m', source: 'simulated' };
  }
  return { ok: true, outputs, verdicts: { holds: { label: 'Holds the load?', value: a.sf >= 1 ? 'pass' : 'fail', reason: `safety factor ${a.sf.toFixed(2)}` } } };
}

export const SOLIDS_ADAPTER = { domain: 'solids-frame', title: 'Structure', evaluate };
