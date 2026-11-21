# Architecture

One dashboard, five engines, shared formats. Everything runs in the learner's browser; there is no server cost per experiment.

```
                 ┌────────────────────────── Dashboard ──────────────────────────┐
                 │  labs · learning paths · notebook · challenges · faculty view │
                 └───────────────┬───────────────────────────────┬───────────────┘
                                 │ experiences (playgrounds, guided paths)
        ┌──────────────┬─────────┴────┬──────────────┬───────────┴───┬──────────────┐
        │   Solids     │    Motion    │ Thermo-fluids│   Circuits    │  Materials   │
        │ (structures) │ (multibody)  │ (energy/flow)│ (fields/logic)│ (properties) │
        └──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┴──────┬───────┘
               └──────────────┴── shared formats: Part · Material · Scenario · Result ──┘
                                              │
                                       AI edge (labelled)
```

## Engines

| Engine | Models | First disciplines | Status |
|---|---|---|---|
| **Solids** | Statics, stress, strain, bending, torsion, buckling, failure. 2D frame FEM first; 2D plane stress next. | Mechanical, civil, aerospace; later biomedical | **In build** |
| **Motion** | Rigid bodies, joints, gears, cams, belts, friction, vibration | Mechanical, automobile, robotics | Started (crank kinematics) |
| **Thermo-fluids** | Property tables (water/steam, air, refrigerants, oils), cycles, pipe networks, pumps, lubrication | Mechanical, chemical, civil hydraulics | **First models live** (oil, engine cycle, friction, bearings) |
| **Circuits** | DC/AC circuits, motors, batteries, sensors, digital logic | Electrical, electronics, computer | Planned |
| **Materials** | Material database; alloy rules (Fe–C, Al, Cu–Zn), heat treatment, temperature dependence, failure data | All | Seeded (`core/materials.mjs`) |

Each engine is a pure JavaScript module: **inputs in, results out, no DOM, no randomness.** That makes it testable, reusable in the API, and runnable in a Web Worker when models grow.

## Shared formats

- **Material** — `{ id, name, E, G, density, yield, ultimate, ductile, alpha, … , confidence, source }`. Every value carries where it came from.
- **Section** — cross-section geometry → `{ A, I, c }` (area, second moment, distance to extreme fibre).
- **Part / Structure** — nodes, members (material + section), supports, loads. Solids reads it; Motion will add joints and masses to the same structure.
- **Scenario** — environment and use, as data: temperature, gravity, wind, snow, crowd, quake, duration. A scenario *transforms* a structure or machine (adds loads, changes material behaviour); engines never special-case a scenario.
- **Result** — what an engine returns: values plus `checks` (what passed/failed and why) and `explain` hooks used by the UI's live equations.

## Experiences

An experience (e.g. Force Playground) is a UI that:
1. loads a **preset** (a real object: shelf, bridge, crane),
2. lets the learner change things **directly** (drag loads and supports, swap materials and sections, pick scenarios),
3. re-solves the engine on every change (target: < 16 ms per solve for real-time),
4. shows the principle live: deformation, colour-coded stress, force arrows, the equation with live numbers, safety factor,
5. offers **guided** (a short path of steps with "pause and think" questions) and **open** modes on the same scene.

## AI edge

When a learner asks something outside an engine's model, the dashboard routes it to an AI helper. Its answers are labelled "AI reasoning", never shown as simulation output, and where possible converted into engine inputs to test. Logged edge questions drive which models to deepen next. (Not built yet.)

## Delivery

- Static web app (no build step for now), deployable anywhere.
- Engines exposed later as an API (same modules on a server).
- Notebook and progress stored locally first; accounts and faculty views when colleges pilot.

## Repository layout

```
docs/                 vision, architecture, learning design, curriculum, validation, roadmap
core/                 shared formats: materials, sections, scenarios; gl3d.mjs (dependency-free WebGL renderer)
engine-world/         Engine World experience
engines/solids/       Solids engine (frame FEM) + tests
index.html            dashboard
playground/           Force Playground experience
tests/                browser tests
```
