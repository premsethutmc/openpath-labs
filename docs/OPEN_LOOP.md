# Open loop: learning from the student's own project

**Direction (22 Nov 2026):** OpenPath Labs is an open-ended sandbox. The student builds whatever they want on an open bench, and the learning loop attaches to *their* project. Fixed journeys (support, pipe, stiffness) stay as optional worked examples; they are not the product and not a prerequisite. Blueprint: `docs/CURRICULUM_MAP.md`. The runner contract stays `docs/JOURNEYS.md`.

## The loop on any project

1. The student is on any open bench with their own project, built from empty or from an editable preset.
2. They press **Predict and learn** in the bench's Experiments panel. The page opens `journeys/journey.html?open=<domain>&project=<projectId>`.
3. The page builds a journey spec from their project (`core/open-loop.mjs`, `openSpec(...)`):
   - **Brief:** "Your design", their own setup, described by the bench.
   - **Anchor:** their project's current setup, saved as Revision 1 on *their* project, not a new one.
   - **Predictions:** the student picks one to three of the bench's outputs to predict (any output the adapter declares). The truths come from `adapter.evaluate`.
   - **Target:** the competency behind the output they missed most (relative error), from the bench's concept map. If several were missed equally, the first one picked wins.
   - **Teach, apply, check:** as in the runner, from the graph and items for that target.
   - **Return:** back to their own project on their own bench page. They revise freely; Revision 2 must be a tested design.
   - **Defend:** generated from the bench's levers. For each lever the student changed between Revision 1 and Revision 2, ask "what would <output> be if <lever> went back to its Revision 1 value?", answered by `adapter.evaluate` on that patched setup. If they changed none, ask about the first two levers at ±20 % or the next option, keeping only valid setups.
4. Nothing is fixed: no preset brief, no fixed load, span, material list or network. Any valid design is accepted. The bench judges validity and the student's own limits, never a preferred design.

## What each bench provides (`<bench>/learn.mjs`, no DOM imports)

```js
export const LEARN = {
  domain: 'fluids-line',
  page: '../circuit/',                        // opens the current project (the Mount bench needs ?project=current)
  adapter: () => import('./model.mjs').then(m => m.ADAPTER),
  describe(setup) → [{ label, value, paths }],                         // the design in words (as spec.describe)
  outputs: { flow: { label: 'Flow delivered', unit: 'L/s', competency: 'ENG.fluids.operating-point' }, … },   // predictable outputs
  levers(setup) → [{ path, label, kind: 'number' | 'option', options? }],   // what the student can change, for defence questions
  concepts(setup, outputs) → [competencyId],                          // optional: extra concepts this run depends on
};
```

- Every `competency` must exist in `content/graph/` and have an item generator. A test checks this.
- Output keys must be the adapter's real output keys, as dynamic as needed. A gauge key like `gauge:p5` is described by the bench.
- Fluids, machine and thermal benches (`circuit/learn.mjs`, `machine/learn.mjs`, `thermal/learn.mjs`) also give `output(key, setup)` → `{ label, unit, competency, what } | null` for any key, fixed or dynamic (`gauge:<partId>`, `R:<bearingId>`, `T:<at>`), `outputsFor(setup)` → the predictable outputs this setup really produces, and `applyLever(setup, path, value)` → a new setup changed through the bench's own edit function. Each lever carries `values`: alternatives the bench accepts and solves. Outputs a bench does not map are listed in its header and checked in `tests/learn-descriptors.test.mjs`.
- A bench registers itself in `content/benches.mjs`: `export const BENCHES = [() => import('../circuit/learn.mjs'), …]`.

## Owners for this change

| Area | Files | Owner |
|---|---|---|
| Open loop core and page | `core/open-loop.mjs`, `core/journey.mjs` (only what a dynamic spec needs: anchoring to an existing project, picked predictions), `journeys/`, `core/notebook.mjs` (the **Predict and learn** link), `content/benches.mjs`, `tests/open-loop*.test.mjs`, `tests/open-loop.e2e.mjs` (on a fixture bench) | Agent 1 |
| Solids benches | `playground/learn.mjs` (move the solids adapter into a DOM-free module if needed), `mount/` (open: free span, load, support type, every material in `core/materials.mjs`; old runs must still reproduce), `content/graph/statics.mjs` / `solids.mjs` and items if a mapped concept lacks items, `tests/open-solids*.e2e.mjs` | Agent 2 |
| Fluids and machine benches | `circuit/learn.mjs`, `machine/learn.mjs`, `thermal/learn.mjs` (where graph nodes exist; otherwise map no outputs and say so), `content/graph/fluids.mjs` and items if needed, `tests/open-fluids*.e2e.mjs` | Agent 3 |

## Acceptance

1. A student builds a design from an empty or edited bench that no journey describes, such as their own truss in the Force Playground or their own pipe network. They start the loop from it, miss a prediction, are taught the prerequisite, pass an unaided check, return to *their* project, revise, test, decide and defend. This is shown through visible controls at phone and desktop widths, with answers computed independently in the test.
2. The runner and page still contain no journey or bench words (the existing grep test, extended to `core/open-loop.mjs`).
3. Old saved runs on every bench still reproduce, and existing journeys and tests still pass.
4. No AI calls, and no network beyond the static files.

## As built: open loop core and page (Agent 1)

- `openSpec({ learn, project, picked?, graph?, items?, results? })` in `core/open-loop.mjs`. Spec id `open:<domain>:<projectId>`, title "Your design", course = the project's name. `results` (from `adapter.evaluate(project.setup).outputs`) limits the choices to outputs the run really has. Prediction tolerance is the output's `tol`, else 5 % (relative). Teach entries cover every output's competency (with an "Explore on the bench" link to `learn.page`) and its mandatory prerequisites with items; the lesson steps are the node's `steps` or a worked example from its generator. Apply 3 (transfer: `learn.page`), check 1.
- LEARN fields the core reads: `domain`, `page`, `adapter()`, `outputs` (object, or `(setup, results) → object`; each `{ label, unit, competency, tol? }`), `levers(setup)` (`{ path, label, kind: 'number' | 'option', options?: [value | { value, label }], unit? }`), `describe(setup)`, optional `concepts(setup, outputs)`, `title`, `content` (`{ graph: [loader], items: [loader] }`, else the shared catalogue), `labels`.
- Defence: changed levers go back to their Revision 1 value, read against the picked outputs in turn; a revert the adapter refuses is dropped; with no valid revert, the first two levers that give a valid setup at +20 %, else −20 % (4 significant figures), or the next option.
- Runner additions (`core/journey.mjs`, backward compatible): `anchor.project` (Revision 1 = a run of that existing project's current setup; the project keeps its name and origin), `stuck.choose` + `choose(ids)` with `predictions` as functions of the picked ids, `target` as a function `({ scored, picked, setup }) → competency` fixed when the stuck round ends (kept in `state.target`), and `defend(setup, outputs, { from, picked, adapter })`.
- Page: `journeys/journey.html?open=<domain>&project=<id>` (`&learn=<path.mjs>` for tests). The bench is found in `content/benches.mjs`; a bench without LEARN, a missing project or a design the bench cannot run gets a plain explanation and a link back. The Experiments panel (`core/notebook.mjs`) shows **Predict and learn** (`.nb-learn`) on every bench that keeps its projects in this browser. The journeys list leads with "Start from your own design" (`#own`), the fixed journeys under "Worked examples" (`#list`).
- Tests: `tests/open-loop.test.mjs`, `tests/open-loop.e2e.mjs` on the fixture bench `tests/fixtures/bench/`.
