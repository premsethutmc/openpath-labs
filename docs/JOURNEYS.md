# Journeys — the contract (student side)

Blueprint: `docs/CURRICULUM_MAP.md` → "Four-year journey" and "Product shape and the first proof". Student side only; there is no professor view and no deck for now.

A **journey** is a module that exports data and pure functions (no DOM). One **runner** plays any journey. Journey 2 must add content only: no change to the runner, the ledger, the diagnostic or the app shell. A test enforces this — the runner files must not mention any journey id.

## Files and owners

| Area | Files | Owner |
|---|---|---|
| Runner, ledger, diagnostic, decisions, page | `core/journey.mjs`, `core/ledger.mjs`, `core/diagnostic.mjs`, `core/graph.mjs`, `core/project.mjs` (decisions), `journeys/` (page), `tests/journeys*.e2e.mjs` | Agent A |
| Journey 1, support design | `content/journeys/support.mjs`, `content/graph/statics.mjs`, `content/graph/school-math.mjs`, `content/items/statics.mjs`, `content/items/school-math.mjs`, moment view in `playground/` | Agent B |
| Journey 2, pipe sizing | `content/journeys/pipe.mjs`, `content/graph/fluids.mjs`, `content/items/fluids.mjs`, any small additions to `circuit/` or `pumpset/` | Agent C |

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
Checking (`core/ledger.mjs checkResponse`): an unreadable or ambiguous response is **unresolved** (no credit, no penalty, not counted). A number with the wrong unit or none is unresolved. Values within tolerance are correct.

## Learner ledger (`core/ledger.mjs`)

Local and pseudonymous: a random learner id in localStorage, with import and export as JSON. The events use the school engine's semantics so they can be synced later:

```js
{ t, learner, journey, competency, item, aspect,
  kind: 'evidence' | 'assisted_response' | 'hint' | 'shown_solution',
  provenance: 'diagnostic' | 'practice' | 'check' | 'retention',
  result: 'correct' | 'incorrect' | 'unresolved', misconception?: id }
```
Derived status per competency: `not-seen`, `helped` (right only with help), `independent-after-help` (a fresh unaided correct answer after help), `independent` (unaided, with no help on that competency). A delayed retention check strengthens the evidence but never reads "mastered".

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

## Acceptance (the whole proof)

1. Both journeys play end to end in the one runner on a phone viewport: anchor → stuck → diagnose → teach → apply → unaided check → return → revise → defend. The revision, the decision and the ledger events land on the record.
2. Journey 2 touches no runner, ledger, diagnostic or page file (a test greps for journey ids in `core/journey.mjs`, `core/ledger.mjs`, `core/diagnostic.mjs` and `journeys/`).
3. Every engine-keyed item and every defence answer is recomputed in a unit test from the engine. Formula-keyed items are checked against an independent hand calculation.
4. Saving, exporting and importing gives the same record and the same results.
5. No AI calls, and no network beyond the static files.
