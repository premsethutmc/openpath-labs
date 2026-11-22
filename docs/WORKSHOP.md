# Open workshop

OpenPath Labs is a workshop, not a set of fixed labs: the learner builds the setup, decides what to measure, and keeps their own evidence. Scope is the curriculum in [CURRICULUM_MAP.md](./CURRICULUM_MAP.md).

## Layers

| Layer | Files | Shared across domains? |
|---|---|---|
| Project and evidence record: setup, saved runs (frozen setup + outputs with units and source + verdicts), reproduce, compare, fork, file export/import | `core/project.mjs` | Yes — no physics |
| Experiments panel (projects, runs, compare, fork, export/import) | `core/notebook.mjs` | Yes — used by the workshop lathe, the fluid line bench, the machine design bench, Force Playground, the mount lab and the Pump House fault lab |
| Workbench layout (instrument, readings, one module open) | `core/workbench.mjs`, `core/workbench.css` | Yes |
| Bench editor + adapter `{ domain, title, evaluate(setup) }` | `circuit/` (fluids), `machine/` (machine design), `playground/` (structures) | No — one per domain |
| Physics | `engines/hydraulics/line.mjs` (uses `hydraulics.mjs`), `engines/machine/shaft.mjs` (uses `engines/solids/frame.mjs`), `engines/solids/` | No — specific to each domain |

An adapter returns `{ ok:false, reason }` for a setup its model does not support; such a setup is explained on screen and cannot be saved as a run. There is no universal solver.

## Fluid line bench (`circuit/`)

- Start from an empty workspace or a preset (gravity feed, pump set, orifice meter). A preset is a script of the same edits a person makes, replayed into an empty setup.
- Parts: source reservoir, pipe, 90° elbow, gate valve, non-return valve, orifice plate, centrifugal pump (with an optional motor), receiving reservoir. Add after any part, reorder, remove, edit settings.
- Measure: pressure gauges on any joint; explain the change between two gauges part by part (friction, fittings, orifice, bore changes, pump head, level, velocity) — the rows add up to the gauge difference.
- Duty: your own flow requirement and motor; two separate verdicts (flow, motor), with cavitation reported as "cannot assess".
- Learn: concepts, equations and limits for the parts on the bench, shown on request; they never change a tool or a result.
- Not supported (explained when attempted): branches (tee), two pumps in one line, reservoirs in mid-line, reverse flow, lines without a pipe.

## Evidence tools on the solids bench (Force Playground)

The Experiments panel works the same way: save the current structure as a run, change material, section, loads or the structure itself, save again, compare (which setup paths changed, safety factor, stress, movement, mass), fork, reopen and reproduce.

## Machine design bench (`machine/`) — shafts, standing still and running

- Empty bench or preset (overhung pulley shaft, gearbox countershaft, three-bearing line shaft, fan shaft near its critical speed, gear shaft with a sharp shoulder), one editor.
- Shaft: material, stepped segments (length, diameter, bore), own weight on/off, surface finish and reliability for fatigue, stress raisers (position, Kt in bending, Kts in torsion — supplied by the learner; the kinds offer Shigley Table 7-1 first estimates). Bearings: position (type or drag), optional load limit, optional dynamic load rating C and ball/roller. Loads: forces anywhere (each may carry a rotating mass in kg and an eccentricity in µm), torques in and out (must balance).
- Speed: operating speed in rpm (default 1450; empty = static check only) and damping ratio (default 0.02, a teaching estimate).
- Limits are the learner's: minimum safety factor, deflection, bearing slope, bearing load, minimum fatigue safety factor, required bearing life (h), speed below a % of critical, vibration (µm whirl).
- Results: reactions, bending moment and deflection along the shaft, von Mises (ductile) or maximum principal (brittle) stress, safety factor, slope at bearings; with a speed also fatigue safety factor (DE-Goodman, Marin factors, Kf = Kt), endurance limit, L10 life per bearing (radial load only), first critical speed (Rayleigh, with Dunkerley as a check), % of critical, unbalance whirl (single-mode Jeffcott estimate, labelled as such) and a speed-response plot; which check governs and where.
- What cannot be assessed says why and gives no number: fatigue of grey cast iron, a diameter outside the size-factor fit, a rotor with no mass, vibration with no unbalance, any rotating check without a speed.
- Generic question tools, no lesson code: **Explain** (what governs, the facts with the computed equation, and the computed one-step changes that help most), **What moves…** (sensitivity of any result to every input, including operating speed, attached masses, Kt and surface finish), **Sweep** (any input over a range against any result, with the best and the worst value — a speed sweep of the whirl shows the resonance peak at the critical speed).
- Setups saved before stage 2 have no speed: they evaluate exactly as before and their runs still reproduce (fixture test).
- Not modelled: loads in two planes, axial loads, bearing stiffness and damping, shear deflection, gyroscopic effects and higher modes, variable-amplitude loading, first-cycle yield with Kt.

## Workshop lathe and fit bench (`workshop/`) on the shared record

A project holds the whole workshop: parts, their operations and every reading. A saved run freezes it with the evidence for the part on the bench (bore and shaft readings, clearance band, fit and drawing verdicts; readings tagged *measured*). Reproducing a run re-cuts every operation and re-takes every reading from its part, revision, instrument and reading number; a changed reading is reported, never trusted.
