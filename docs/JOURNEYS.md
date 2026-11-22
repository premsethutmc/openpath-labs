# Journeys — the contract (student side)

Blueprint: `docs/CURRICULUM_MAP.md` → "Four-year journey" and "Product shape and the first proof". Student side only; there is no professor view and no deck for now.

A **journey** is a module that exports data and pure functions (no DOM). One **runner** plays any journey. Journey 2 must add content only: no change to the runner, the ledger, the diagnostic or the app shell. A test enforces this — the runner files must not mention any journey id.

## Files and owners

| Area | Files | Owner |
|---|---|---|
| Runner, ledger, diagnostic, decisions, page | `core/journey.mjs`, `core/ledger.mjs`, `core/diagnostic.mjs`, `core/graph.mjs`, `core/project.mjs` (decisions), `journeys/` (page), `tests/journeys*.e2e.mjs` | Agent A |
| Journey 1, support design | `content/journeys/support.mjs`, `content/graph/statics.mjs`, `content/graph/school-math.mjs`, `content/items/statics.mjs`, `content/items/school-math.mjs`, moment view in `playground/` | Agent B |
| Journey 2, pipe sizing | `content/journeys/pipe.mjs`, `content/graph/fluids.mjs`, `content/items/fluids.mjs`, any small additions to `circuit/` or `pumpset/` | Agent C |
| Journey 3, stiffness vs strength | `content/journeys/stiffness.mjs`, `content/graph/solids.mjs`, `content/items/solids.mjs` | Agent B |

Agents B and C may add school-maths nodes and items, but only in their own files (`school-math.mjs` belongs to B; C puts its own in `fluids.mjs` with `MATH.*` ids).

## Competency graph (`content/graph/*.mjs`)

```js
export const NODES = [
  { id: 'ENG.statics.moment-about-point', title: 'Moment of a force about a point',
    requires: ['MATH.trigonometry.functions', 'ENG.statics.perpendicular-distance'],   // mandatory prerequisites
    support: [],                                                                       // useful, never a gate
    items: 'statics.moment' },                                                         // item generator id
];
```
School maths reuses the school engine's ids (`MATH.trigonometry.functions`, `MATH.vectors.products`, `MATH.algebra.linear-equations`, …; source premsethutmc/openpath main 62b17d3f, `content/mathematics/curriculum.v1.json`), with `school: true` and `learnUrl` left null for now. `core/graph.mjs` merges all node files, rejects unknown ids, rejects cycles, and gives `prerequisitesOf(id, depth)`.

## Items (`content/items/*.mjs`)

```js
export const GENERATORS = {
  'statics.moment': {
    competency: 'ENG.statics.moment-about-point',
    aspects: ['concept', 'procedure', 'transfer'],            // what an item of each aspect probes
    make(seed, aspect) → Item,                                // deterministic in seed (use core/rng.mjs)
  },
};
// Item
{ id, competency, aspect, prompt, figure?: {kind, params},   // figure is data; the page draws it
  answer: { kind: 'number', value, unit, tol } | { kind: 'choice', options: [...], correct },
  misconceptions: [{ id, value | option, label }],           // a wrong answer equal to `value` (within tol) names the misconception
  solution: [step text …],                                   // shown only as help
  key: 'engine' | 'formula' }                                // engine = value computed by an existing engine (solids, hydraulics)
```
Tolerances (`tol` on answers, predictions and defence questions) are **relative** — 0.02 means ±2 % — and absolute only when the true value is 0. Choice `correct` and a misconception's `option` are option indexes.

Checking (`core/ledger.mjs checkResponse`): an unreadable or ambiguous response is **unresolved** (no credit, no penalty, not counted). A number with the wrong unit or none is unresolved. Values within tolerance are correct.

## Learner ledger (`core/ledger.mjs`)

Local and pseudonymous: a random learner id in localStorage, with import and export as JSON. The events use the school engine's semantics so they can be synced later:

```js
{ t, learner, journey, competency, item, aspect,
  kind: 'evidence' | 'assisted_response' | 'hint' | 'shown_solution',
  provenance: 'diagnostic' | 'practice' | 'check' | 'retention',
  result: 'correct' | 'incorrect' | 'unresolved', misconception?: id }
```
Derived status per competency: `not-seen`, `helped` (help received, no fresh unaided right answer since), `independent-after-help` (a fresh unaided correct answer after help), `independent` (fresh unaided, with no help on that competency), `not-yet` (answered alone, latest fresh answer wrong). A delayed retention check strengthens the evidence but never reads "mastered".

**Status wording rule** (`statusOf` and `describeStatus` in `core/ledger.mjs`, unit-tested in `core/ledger.test.mjs`):
- Only a **fresh unaided item on that exact competency** decides what the learner did alone: an `evidence` event with provenance `diagnostic`, `check` or `retention`. `statusOf` returns it as `basis: { provenance, result }` (null when there is none).
- Teach practice is help: every answer in the teach phase is an `assisted_response`, and hints and shown solutions are help events. An unaided answer in the apply phase (provenance `practice`) is counted in `practice` and never decides the status.
- The words say where the evidence came from: "Answered right in the diagnostic (unaided)" for a prerequisite right in the diagnostic; "Solved on your own after help" or "Solved on your own in the check" only when the deciding answer is a check (or retention); "Practised with help; no unaided question since" for a skill that was only practised with help. Help on a prerequisite never changes the target's status, and the target's check never changes a prerequisite's.
- The portfolio's prerequisite trail gives each competency its `role` (`target` or `prerequisite`), `basis`, the words (`text`), and its counts: fresh unaided, unaided practice, answers with help, help events. Before this rule, a prerequisite right in the diagnostic read "Solved on your own", the same words as the journey's own check.

## Diagnostic (`core/diagnostic.mjs`)

A port of the school engine's diagnostic@1 (`packages/learning/src/diagnostic.ts` at 62b17d3f), domain-neutral. The hypotheses are concept, procedure, recall, transfer, prerequisite and misconception. Questions are chosen by expected information gain, and the diagnostic stops when one hypothesis is clearly ahead or after three questions ("insufficient evidence"). The prerequisite hypothesis only rises when a prerequisite item is also wrong; a wrong answer is never proof on its own. Cite the source commit in the header.

## Journey spec (`content/journeys/*.mjs`)

```js
export default {
  id: 'support', title, semester: 2, course: 'ME25C02 Engineering Mechanics',
  bench: { page: '../mount/', domain: 'mount-stand', adapter: () => import('../../mount/model.mjs').then(m => m.READING_ADAPTER) },
  brief: 'text',                                    // the anchor task
  anchor: { setup, revision: 'R1' },                // starting setup saved on the project record
  stuck: { predictions: [Prediction] },             // locked before results; a miss (or "I'm stuck") opens the loop
  target: 'ENG.statics.moment-about-point',         // the competency the miss points to
  teach: { [competency]: { explore: { page, preset }, steps: [text], items: generatorId } },
  apply: { count: 3, transfer: { page, preset } },
  check: { count: 1 },
  return: { predictions: [Prediction], decision: true },
  defend: (setup, results) → [{ prompt, change: setupPatch, read: outputLabel, tol }],   // answers come from adapter.evaluate(patched setup)
};
// Prediction
{ id, prompt, unit, tol, truth: (setup, results) → number }       // results = adapter.evaluate(setup).outputs
```

## Decisions on the project record (`core/project.mjs`)

`addDecision(project, { from, to, claim, runs: [runId], rejected: [text], defence: [{ prompt, answer, truth, result }] })`. This bumps the file to version 2; version 1 files still load.

## R2 is a tested design

R2 can only be a design that has a locked prediction and a run in the return phase. The learner may revise freely, but `saveRevision()` refuses when the current design differs from every tested one (compared with `setupDiff` against the run on the project record — the record is the authority, so a reload or an edited page state never turns an untested design into a tested one). The page then offers two choices: **Predict and run this design** (`#predict-current` → `predictCurrent()`, clears a stale lock for a fresh round) or **Save the last tested design as R2** (`#save-tested` → `saveTestedRevision()`: saves that run's own setup as a new reproducible run, leaves the current edit in the project and says so). `view()` in return gives `lastTested { run, setup }`, `currentTested` (run id or null) and `sinceTested` (diff); `#tested-status` shows them. The decision's `to`, the portfolio's `design.to` (with `tested`: the prediction run) and the defence questions all use the R2 run's setup. After R2 is saved, the decide page and the portfolio keep a link to the bench ("Open my design on the bench"): the learner's later edit stays the project's current design and is never blocked; the portfolio says which run R2 is and which run tested it (`#r2-run`). The Mount lab opened with `?project=current` puts the project's current design (`setup`) on the stand, not the latest run, because "Save the last tested design" adds an older design as the latest run.

## Showing the design

Revisions are labelled `Revision 1` and `Revision 2` (from `spec.anchor.revision`), so they never read like bench run ids (`R1`, `R2`, … on the project record). A journey may give `describe(setup) → [{ label, value, paths }]` so the page shows the design in words and units and names what changed; without it the page lists every setup field with `spec.labels`.

## Bench pages

A journey's `bench.page` opens the learner's own design. The fluid line bench opens the current project; with `?preset=<id>`, as "Explore on the bench" links it, it opens a scratch bench on that preset that never changes the saved projects (Pump House `?preset=` opens the named lesson). The Mount lab needs `?project=current` (free design, no guided mission, the project's current design on the stand); its mission shows a “Back to the journey” link built from the project's `journey:<id>` origin. `tests/journey-support-visible.e2e.mjs`, `tests/journey-pipe-visible.e2e.mjs` and `tests/journey-stiffness-visible.e2e.mjs` play the three journeys through visible controls only, each with two different valid designs (shared helpers: `tests/visible-helpers.mjs`). `tests/journey-r2-bench.e2e.mjs` plays Journey 1 on the real Mount bench with an edit after the tested run and a reload, in both ways out (save the last tested design, or predict and run the edit), with help on a prerequisite kept apart from the check; the Journey 1 learner's hand calculations are shared in `tests/support-hand.mjs`.

## Acceptance (the whole proof)

1. Both journeys play end to end in the one runner on a phone viewport: anchor → stuck → diagnose → teach → apply → unaided check → return → revise → defend. The revision, the decision and the ledger events land on the record.
2. Journey 2 touches no runner, ledger, diagnostic or page file (a test greps for journey ids in `core/journey.mjs`, `core/ledger.mjs`, `core/diagnostic.mjs` and `journeys/`).
3. Every engine-keyed item and every defence answer is recomputed in a unit test from the engine. Formula-keyed items are checked against an independent hand calculation.
4. Saving, exporting and importing gives the same record and the same results.
5. No AI calls, and no network beyond the static files.
