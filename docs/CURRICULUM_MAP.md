# Mechanical engineering curriculum map

*Blueprint for OpenPath Labs. Map updated 22 Nov 2026 (main after PRs #2–#14).*

## Goal

OpenPath Labs makes mechanical engineering learnable by doing. A learner designs, makes, tests or diagnoses something, and the model shows which constraint it hits. The screw, the lathe, the engine and the pump are examples of questions people bring; none of them is the product.

A learner can come in three ways:

- **From a concept:** "show me why a thicker beam is stiffer" — an open bench with the right engine and nothing scripted.
- **From a problem:** "why does this machine shake at 1,450 rpm and not at 1,200?" — a fault or a measurement to explain.
- **From a project of their own:** "design the cooling for my battery box" — several benches sharing one design, so a decision in one shows up in another.

Learning support (hints, equations, none) never changes the controls or the physics.

## The map

Anna University B.E. Mechanical Engineering, Regulations 2021, grouped into twelve branches. **Live** = on main and published; **draft** = open PR.

Five branches are well supported (engineering mechanics, strength of materials, fluids and pumps, engines, metrology), six are started (manufacturing, machine design, materials, thermodynamics, theory of machines, heat transfer), and one (mechatronics) has almost nothing. The biggest core gaps are vibration, fatigue and heat exchangers.

| Branch (R2021 courses) | Students should be able to | What we have now | Missing |
|---|---|---|---|
| **Engineering mechanics** (ME3351) | Free-body diagrams; equilibrium, trusses, friction, centroids; particle and rigid-body motion | **Live:** Force Playground, 2D frame/truss solver (`playground/`, `engines/solids/frame.mjs`, `analyze.mjs`) | Friction, rigid-body dynamics, impact |
| **Strength of materials** (CE3491) | Stress, strain, deflection in beams, shafts, columns, cylinders, springs; combined stress; failure | **Live:** bending, axial, buckling, thermal stress, safety factor; 5 materials, 5 sections (`core/materials.mjs`, `core/sections.mjs`); mount lab with dial and strain gauges (`mount/`); torsion, combined stress, hollow sections and indeterminate shafts (`machine/`) | Shear stress, Mohr's circle, thin/thick cylinders, springs |
| **Materials and metallurgy** (ME3392, PH3251) | Choose a material; read phase diagrams; plan heat treatment; tensile, hardness, impact tests | **Live:** typical properties for 5 materials; 3 materials with sourced densities (`workshop/`) | Tensile bench, heat treatment, phase diagrams, hardness, impact, S–N curves (shaft bench has endurance data for steel and 6061-T6 only) |
| **Manufacturing** (ME3393, ME3493) | Choose how to make a part; set parameters; plan operations; predict cost, time, quality | **Live:** workshop lathe — face, turn, drill, bore, revisions, labelled simulated offsets, every cut checked on its as-cut geometry (`workshop/`) | Cutting forces and tool life, milling, casting, forming, welding, CNC, process planning and cost |
| **Metrology and measurements** (ME3592) | Pick an instrument; state uncertainty; apply limits, fits, GD&T; pass / fail / inconclusive | **Live:** readings with resolution and maximum error, ISO 286 fits, "can't confirm" (`workshop/`); dial and strain gauges (`mount/`); pressure gauges placed by the learner (`circuit/`); pump gauges | Roundness and runout, surface roughness, gauge R&R, calibration |
| **Engineering thermodynamics** (ME3391) | Energy and entropy balances; property tables; power and refrigeration cycles | **Live:** single-zone engine cycle with knock (`engines/thermofluids/engine.mjs`, `combustion.mjs`) | Property engine (steam, refrigerants), Rankine, Brayton, refrigeration cycles |
| **Fluid mechanics and machinery; hydraulics and pneumatics** (CE3391, ME3492) | Size pipes and pumps; losses and cavitation; pump curves; hydraulic circuits | **Live:** Pump House, Piston Pump (`engines/hydraulics/`); fluid line bench — learner-built series lines, gauges, pressure budgets, orifice meter (`circuit/`); pump set drive check (`pumpset/`); fault lab (`pumps/fault.html`); 2D flow tunnel (`engines/fluids/lbm.mjs`) | Turbines, pipe networks, hydraulic/pneumatic circuits, non-water fluids, pump viscosity correction |
| **Thermal engineering** (ME3451; RAC, power plant electives) | Engine testing and performance; compressors, refrigeration, steam plant | **Live:** Engine World — 1D gas-dynamics bench, oil, cold start, work-to-shaft-power, signed airflow at the intake valve (`engines/thermofluids/gasdyn.mjs`, `engine-world/`) | Air compressors, refrigeration and AC, boilers, steam and gas turbines |
| **Heat and mass transfer** (ME3691) | Size insulation, fins, heat exchangers; predict temperatures; find the limiting resistance | **Live:** open thermal bench — one steady heat path of plane or cylindrical layers, side-by-side layers, contact resistance, convection (h entered or natural/forced air correlations with stated ranges), linearised radiation, fin arrays (efficiency, effectiveness), critical insulation radius, thermometers on interfaces, resistance shares, learner's limits, sensitivity and sweep; lumped-body warm-up/cool-down with a Biot check (`engines/thermal/thermal.mjs`, `thermal/`); lumped engine warm-up (`engine.mjs`); thermal expansion in the frame solver | 2D/3D and transient conduction beyond a lumped body, internal and fin-channel flow, radiation exchange, heat exchangers, bearing temperature into oil viscosity |
| **Theory of machines: kinematics, dynamics, vibration** (ME3491) | Linkages, cams, gear trains; balancing; flywheels; diagnose resonance | **Live:** slider-crank kinematics in Engine World (`engines/motion/crank.mjs`). **Live:** whirling of shafts — first critical speed by Rayleigh with a Dunkerley check, unbalance response of a single-mode (Jeffcott) rotor with learner-set damping, speed sweep showing the resonance peak (`engines/machine/rotor.mjs`, `machine/`) | Linkages, cams, gears, balancing (static/dynamic, reciprocating), flywheels, governors, free/forced vibration of general systems, torsional vibration, higher modes |
| **Design of machine elements; transmission design** (ME3591, elective) | Size shafts, keys, bolts, springs, bearings, gears, belts for strength, fatigue, life | **Live:** open shaft bench — stepped/hollow shafts, bearings, forces and torques, combined stress, deflection, slope, learner's limits, sensitivity and sweep (`machine/`); shaft-to-hub fits (`workshop/`); motor sizing on a learner's own line (`pumpset/`, `circuit/`). **Live:** operating speed, shaft fatigue (Marin factors, learner-supplied Kt/Kts, DE-Goodman; `engines/machine/fatigue.mjs`), rolling-bearing L10 life from radial reactions (`engines/machine/bearing.mjs`) | Two-plane loads, axial loads and bearing equivalent load, keys, gears, fasteners, springs, belts and chains |
| **Mechatronics, automation, manufacturing systems** (ME3791, ME3792, GE3792) | Sensors and actuators; tune a control loop; plan a production line | Nothing yet | Sensors, actuators, control loops, PLC logic, line balancing |

Cross-cutting **evidence**: every bench and lab keeps its runs on one shared project record (`core/project.mjs`, Experiments panel `core/notebook.mjs`): workshop, fluid line bench, machine design, thermal bench, Force Playground, mount lab, fault lab. Guided cases add only a protocol on top (`core/protocol.mjs`: prediction locked before the result, feedback before the next case). Engine World's 1D bench runs take seconds each, so its runs are not yet on the record.

Cross-cutting **CAD and computation**: a 2D frame finite-element solver and a 2D flow solver exist; no 3D geometry or continuum stress analysis. **Delivery:** simulation API over the live engines (`server/api.mjs`, [openpath-labs-api.onrender.com/v1](https://openpath-labs-api.onrender.com/v1)).

## What the map shows

The engines are separate islands: each lab owns its own state, and nothing decided in one bench reaches another. Three shared foundations come first:

1. **A design record** — one project file holding parts, materials, revisions, operating conditions and decisions. The workshop part model (PR #6) is the seed.
2. **Typed quantities with provenance** — every number says whether it was entered, measured with an instrument, taken from a sourced table, or simulated by a named model with stated limits.
3. **Benches that read and write the record** — each takes what it needs (a shaft diameter, a flow, a temperature) and adds its results. Presets and scratch builds are the same object.

Reusable: frame solver, pipe and pump engine, oil properties, instrument and fit model, API. Needing new engines: heat transfer, general vibration (rotor dynamics of a single shaft is in draft), machine elements (gears, fasteners, springs; shaft fatigue and bearing life are in draft), thermodynamic properties.

## Connecting project: a motor-driven pump set

An electric motor driving a centrifugal pump on one shaft. It touches six subjects, three already have engines, and learners in India recognise it (farm bore-wells, building water supply).

```
Pump duty (fluids, live) ──torque──▶ Shaft and bearings (machine design, new) ──shaft Ø──▶ Rotor dynamics (vibration, new)
   │ speed, loads, water                │ shaft Ø, fit range                                  ▲            │ critical-speed margin
   ▼                                    ▼                                                     │            │
Bearing heat (heat transfer, new)   Make and measure (workshop, draft) ─measured runout → unbalance┘            │
   │ bearing temperature                │ fit verdict                                                      │
   └──────────────────────────────▶  TEST RUN: shakes? cavitates? overheats?  ◀────────────────────────────┘
```

- **Fluids → drive → machine design:** a pipework or delivery-height change moves the operating point on the pump curve; the pump solver gives the new shaft power and speed, so torque is calculated (T = P / ω), never assumed. More head does not automatically mean more torque — on a centrifugal pump flow often falls, and shaft power with it. Shaft size follows from the calculated torque and bending loads.
- **Machine design → vibration:** a thinner shaft is cheaper but its critical speed falls; near running speed the set shakes.
- **Manufacturing → vibration:** a measured fit gives only the possible radial clearance. Where the hub actually sits depends on how it is located (key, set screw, taper) and is found by measuring runout on the assembled rotor, or modelled separately. Unbalance comes from that eccentricity, not from the fit alone.
- **Heat transfer → machine design:** most pump losses go into the water, not the bearings. Bearing temperature comes from bearing friction (load, speed, oil viscosity) and how the housing sheds heat; it in turn changes oil viscosity (existing oil model) and bearing life. Hotter water separately cuts NPSH margin (already modelled).
- **Test run:** smooth, shakes, cavitates or overheats; the learner traces the symptom back to a decision.

The project is a spine, not the product: every bench also opens alone.

## Roadmap

| Stage | What it builds | Gate to pass |
|---|---|---|
| 0 · Minimal design record | Project file: quantities with units and their source — only what milestone 1 uses; no draft merges required | Save and reopen: identical project, identical results |
| **1 · Drive check (first milestone)** | Change a pipe or delivery height; the pump solver recalculates operating point and shaft demand; the same saved project shows whether the chosen motor still copes | One pipework change flips the motor verdict, end to end |
| 2 · Machine design and vibration engines | Shaft fatigue, bearing life, critical speed, unbalance response; also opens alone ("why does it shake at one speed?") | Matches hand calculations; a thin shaft shakes at resonance |
| 3 · Heat transfer engine | Conduction, convection, fins, transient heating, heat exchangers; also opens alone ("design a cooling system") | Matches textbook cases; bearing temperature sets oil viscosity |
| 4 · Pump set test run | All benches on one project; symptoms traced to decisions; no script | All four failures (shake, cavitate, overheat, misfit) reachable, unscripted, phone and desktop |
| 5 · Widen the map | Thermodynamic properties and cycles, mechanisms and gears, materials testing, more processes, mechatronics, a second project | Each new engine meets the same evidence bar |

The first milestone is a design decision, not a data handoff: change a pipe or the delivery height, the pump solver recalculates the operating point and shaft demand, and the same saved project shows whether the chosen motor can still do the job. Vibration, bearings and heat come only after that works end to end. It brings in only what it uses (Pump House on main, a minimal project file, a motor rating check); none of the open drafts is a prerequisite.

Every bench stays usable on its own, and every engine meets the workshop's evidence bar: preset equals scratch build, results match hand calculations or published cases, numbers carry their source, guidance never changes controls or physics.

## Progress against the roadmap (22 Nov 2026)

| Stage | Status |
|---|---|
| 0 · Minimal design record | **Done** — shared project record and Experiments panel on every bench and lab (PRs #8, #10, #11, #12) |
| 1 · Drive check | **Done** — pipework decision changes the motor decision (PR #7); also on the learner-built fluid line bench (PR #8) |
| 2 · Machine design and vibration | **Gate met** — static shaft design live (PR #9); fatigue, bearing life, critical speed and unbalance response on the same open bench (PR #14): every formula checked against a hand calculation, a thin fan shaft whirls at its critical speed and a speed sweep shows the peak there; old saved runs reproduce. Waits for review and merge; not yet linked to the pump set |
| 3 · Heat transfer | **Started** — open thermal bench live (steady one-path networks, convection correlations, radiation, fin arrays, critical radius, lumped transients; PR #13); heat exchangers and the bearing-temperature link to oil viscosity not yet |
| 4 · Pump set test run | Not started |
| 5 · Widen the map | Workshop lathe and fits, mount lab, fault lab live; the rest not started |

## Risks and what we will not build yet

- **The project becomes the product again** — every engine also opens alone, from a concept or a problem.
- **False precision** — each engine states its model, validity and omissions; unsourced numbers are labelled assumed or simulated.
- **A shared record that is too clever** — start with the few quantities the pump set passes between benches (torque, shaft diameter, fit, temperature).
- **Phone screens** — keep the workbench layout: one instrument, four readings, one module open.

Not yet: 3D CAD or 3D finite-element stress analysis, a general multi-physics solver, CNC programming, combustion chemistry beyond the engine model, any claim of design certification.

**Decided (21 Nov 2026):** pump set first; the full curriculum stays the goal; every bench stays independently usable.

## Sources

- Anna University B.E. Mechanical Engineering, Regulations 2021, curriculum and syllabi (non-autonomous affiliated colleges), as published by [K.G. Institute of Technology](https://www.kgkite.ac.in/wp-content/uploads/2023/12/B.E.Mechanical-Engineering-R2021-Syllabus.pdf).
- Shared doc version: https://claude.ai/artifact/1PY9sJa947eweL8eCmvK4Z
