# Open workshop

OpenPath Labs is a workshop, not a set of fixed labs: the learner builds the setup, decides what to measure, and keeps their own evidence. Scope is the curriculum in [CURRICULUM_MAP.md](./CURRICULUM_MAP.md).

## Layers

| Layer | Files | Shared across domains? |
|---|---|---|
| Project and evidence record: setup, saved runs (frozen setup + outputs with units and source + verdicts), reproduce, compare, fork, file export/import | `core/project.mjs` | Yes — no physics |
| Experiments panel (projects, runs, compare, fork, export/import) | `core/notebook.mjs` | Yes — used by the workshop lathe, the fluid line bench, the machine design bench, the thermal bench, Force Playground, the mount lab and the Pump House fault lab |
| Workbench layout (instrument, readings, one module open) | `core/workbench.mjs`, `core/workbench.css` | Yes |
| Bench editor + adapter `{ domain, title, evaluate(setup) }` | `circuit/` (fluids), `machine/` (machine design), `thermal/` (heat transfer), `playground/` (structures) | No — one per domain |
| Physics | `engines/hydraulics/line.mjs` (uses `hydraulics.mjs`), `engines/machine/shaft.mjs` (uses `engines/solids/frame.mjs`), `engines/thermal/thermal.mjs`, `engines/solids/` | No — specific to each domain |

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

## Machine design bench (`machine/`) — shafts first

- Empty bench or preset (overhung pulley shaft, gearbox countershaft, three-bearing line shaft), one editor.
- Shaft: material, stepped segments (length, diameter, bore), own weight on/off. Bearings: position (type or drag), optional load limit. Loads: forces anywhere, torques in and out (must balance).
- Limits are the learner's: minimum safety factor, deflection, bearing slope, bearing load.
- Results: reactions, bending moment and deflection along the shaft, von Mises (ductile) or maximum principal (brittle) stress, safety factor, slope at bearings; which check governs and where.
- Generic question tools, no lesson code: **Explain** (what governs, the facts, and the computed one-step changes that help most), **What moves…** (sensitivity of any result to every input), **Sweep** (any input over a range against any result, with the best value).
- Not modelled: fatigue and stress concentrations, loads in two planes, bearing stiffness and life, shear deflection, critical speed, axial loads.

## Thermal bench (`thermal/`) — heat transfer along one path

- Empty bench or preset (cooling a 20 W device with a fin array, thin hot-water pipe with a PTFE sleeve, cold-room wall), one editor; presets are edit scripts.
- Geometry: plane wall (area) or pipe (inner radius, length). Start face: a fixed temperature or a heat source (W); ambient temperature.
- Layers, start to ambient: conduction (14 tabulated materials, Incropera Tables A.1/A.3, or your own k), side-by-side materials in one plane layer, contact resistance, convection at the first or last surface (h entered, or natural convection on a vertical plate or horizontal pipe, forced flow along a plate or across a pipe — air, stated ranges, refused outside them) with optional radiation (linearised h_r, iterated), and a fin array on the outer surface (rectangular or pin fins, insulated or convective tip; efficiency, effectiveness, tip temperature).
- Measure: thermometers on the start face or any interface (or tap the drawing); explain the drop between two thermometers layer by layer (ΔT = Q·R, the rows add up to the difference of the readings). The drawing shows the temperature profile and each resistance's share of the total.
- Limits are the learner's: highest start-face temperature, highest outer-surface temperature, most heat flow allowed, least heat flow needed.
- Same generic question tools as the machine bench: **Explain** (what governs, which resistance limits the heat flow, fin and film facts, the critical insulation radius on pipes with a re-solved check, the computed changes that help most), **What moves…**, **Sweep** (any input against any result; highest and lowest point, peaks flagged). **Transient**: an optional lumped body heating or cooling in the same ambient (refused when Bi > 0.1).
- Not modelled (explained when attempted): convection between two solid layers, heat sources into a fluid film, fins on pipes (annular), side-by-side layers in a pipe, fins closer than 2 mm (fin-channel flow), internal pipe-flow correlations, film temperatures outside 250–500 K; also 2D/3D conduction, heat generation inside a layer, radiation exchange between surfaces, heat exchangers.

## Workshop lathe and fit bench (`workshop/`) on the shared record

A project holds the whole workshop: parts, their operations and every reading. A saved run freezes it with the evidence for the part on the bench (bore and shaft readings, clearance band, fit and drawing verdicts; readings tagged *measured*). Reproducing a run re-cuts every operation and re-takes every reading from its part, revision, instrument and reading number; a changed reading is reported, never trusted.
