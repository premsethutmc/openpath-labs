# Mechanical engineering curriculum map

*Blueprint for OpenPath Labs — the single source of truth. Every merge adds a line to the change log at the end, with the PR, the merge commit and how to verify it. Map updated 22 Nov 2026 (main after PRs #2–#14); four-year journey added 22 Nov 2026.*

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

## Four-year journey (planning pass, 22 Nov 2026)

Planning only: no new simulator, merge or deployment. One branch, Mechanical Engineering. The branch table above stays as the subject-coverage map; this section is the student's path through the degree.

### Cohort

Anna University, non-autonomous affiliated colleges, **Regulations 2025 (Revised 1, 2026)**, which applies from AY 2026–27: the students entering now. 173 credits. Autonomous colleges publish their own R2025 versions, and earlier batches stay on R2021 (the table above). Course titles and semesters below come from the R2025 document. Unit-level content has been read for the first-year courses, ME25C09 and CE25C12. For the other courses only the titles have been checked; read their units before building for them.

Engineering Mechanics moved from semester III (R2021) to **semester II** (ME25C02). Statics, moments and equilibrium are now first-year work.

### Words used in the map

- **Teaches:** OpenPath diagnoses a gap, teaches it, then checks the learner on a fresh question with no help, and records that evidence. Only the school engine (premsethutmc/openpath) does this today, and only for school mathematics.
- **Simulates:** a Labs bench computes and records the physics. Its Protocol can lock a prediction and score it, but nothing teaches the learner or checks what they can do alone.
- **Not covered:** nothing yet.

### Eight-semester map

| Sem | Courses that carry the mechanical thread | The student should be able to | Prerequisites | Lab or project where they show it | OpenPath today |
|---|---|---|---|---|---|
| I | MA25C01 Applied Calculus; ME25C03 Introduction to ME; ME25C01 Engineering Drawing; PH25C01 Applied Physics I; CS25C02 Python; ME25C16 Makerspace A | Sketch, dimension and project a part to BIS; model it in 2D/3D CAD; reason with force, energy and power in SI units; measure an elastic modulus; use derivatives and integrals for rates and areas | Class 11–12 trig, vectors, calculus; units; school physics | Engineering Drawing CAD project; Makerspace teardown, welding, CAD and 3D printing | **Teaches:** school calculus, vectors, trig (school engine). **Simulates:** workshop measuring and fits; stiffness and Young's modulus in the Mount lab. **Not covered:** drawing, projection, CAD, Python, welding, optics |
| II | ME25C02 Engineering Mechanics; MA25C02 Linear Algebra; PH25C05 Applied Physics II; EE25C01 BEEE; ME25C05 Re-Engineering for Innovation | Draw free-body diagrams; take moments; find reactions; check equilibrium in 2D/3D; find centroids and second moments; handle friction; read the iron–carbon diagram | Vectors and cross product, resolving components, simultaneous linear equations, integration for area | ME25C05 lab; **first-year journey below** | **Teaches:** vectors, vector products, trig, linear equations (school level). **Simulates:** Force Playground (reactions, bending), 2D frame/truss solver, Mount lab, thermal bench conduction. **Not covered:** friction, centroids and second moment *taught* (the Mount lab computes I but does not teach it), electrical, phase diagrams |
| III | ME25C07 Applied Engineering Mechanics; CE25C11 Strength of Materials (with lab); ME25301 Engineering Thermodynamics; ME25C08 Metallurgy and Materials Science; MA25C09 Computational DEs | Stress, strain, bending, torsion, deflection, buckling, cylinders; energy balances; choose a material and heat treatment | Statics (sem II); calculus; ODEs | SOM lab tests (tension, torsion, deflection, hardness) | **Simulates:** bending, axial, buckling, thermal stress, safety factor (Force Playground, Mount lab); shaft torsion (machine bench); engine cycle. **Not covered:** property tables, entropy, cycles beyond the engine; materials testing; phase diagrams |
| IV | ME25C09 Kinematics and Dynamics of Machines (lab); CE25C12 Fluid Mechanics and Machinery (lab); ME25401 Thermal Engineering I; ME25402 Manufacturing Processes I (lab); ME25C10 Standards; CS25C16 Applied Data Science | Analyse linkages, cams and gear trains; balance; find critical speeds; size pipes and pumps; read pump and turbine curves; choose and set up a process | SOM; dynamics; Bernoulli | Labs: four-bar, cams, gear trains, gyroscope, free and torsional vibration, critical speed; metacentric height, venturi, pipe friction, Pelton wheel, centrifugal and reciprocating pumps | **Simulates:** pipe friction, pumps, cavitation (Pump House, fluid line bench, piston pump, drive check); critical speed (shaft bench); slider-crank (Engine World); lathe (workshop). **Not covered:** four-bar, cams, gear trains, gyroscope, turbines, metacentric height, casting, forming, welding |
| V | Design of Machine Elements; Manufacturing Processes II; Thermal Engineering II; Measurements and Instrumentation; PE-I; Capstone Design Project I (honours) | Size shafts, keys, fasteners, springs and bearings for strength, fatigue and life; choose an instrument and state its uncertainty | SOM, materials, fits | Capstone Design Project I; instrumentation lab | **Simulates:** shaft static, fatigue, bearing life, unbalance (machine bench); instrument uncertainty and fits (workshop). **Not covered:** keys, bolts, springs, welds, gears; compressors, refrigeration; sensors |
| VI | Design of Transmission Systems; Heat and Mass Transfer (lab); FEM Applications (lab); Power Generation Technologies; Computer Aided Modelling Lab; CDP II | Design gears, belts and chains; size insulation, fins and exchangers; set up and check an FE model; model parts in CAD | Machine elements; ODEs; linear algebra | Heat transfer lab; FEM lab; CAD modelling lab; CDP II | **Simulates:** conduction, convection, fins, transients (thermal bench); 2D frame stiffness method (`engines/solids/frame.mjs`); Engine World. **Not covered:** transmissions, heat exchangers, mass transfer, continuum FEM, CAD, power plants |
| VII | Mechatronics and Automation (lab); Engineering Entrepreneurship Development; Project Management; Climate Change and Sustainability; PE-IV, V; industrial training; CDP III | Choose sensors and actuators; tune a control loop; plan, cost and run a project | Electrical basics; dynamics | Mechatronics lab; CDP III | **Not covered:** control, sensors, PLC. Stage 4, the pump set test run, could serve as a cross-subject capstone rig |
| VIII | Project Work / Internship cum Project (8) | Take a real problem to a defended design with evidence | Everything above | The project itself | **Simulates:** benches as virtual test rigs; the project record as the evidence base. **Not covered:** CAD hand-off |

What the map shows: nothing in the degree is **taught** by OpenPath today. Labs simulates parts of semesters II–VI well. The school engine teaches the school mathematics underneath semesters I–II. The first journey is the place where the two meet.

### One learning loop for all four years

1. **Anchor.** Start from the learner's own work, saved as a revision on the project record: a design, a measurement or a course task. The anchor is never thrown away.
2. **Find the block.** A locked prediction misses, a verdict the learner can't explain, or "I'm stuck". A short diagnostic separates a concept gap, a procedure gap, a recall gap, a missing prerequisite and a known misconception. A wrong answer alone is never taken as proof of a missing prerequisite.
3. **Teach the prerequisite.** Where possible, teach on a bench the learner can move, not on text. Gaps in school mathematics go to the school engine.
4. **Apply.** Fresh items from the engine (different numbers, so answers can't be copied), then a near twin of the learner's design, never the design itself.
5. **Check independence.** A fresh unaided question. Record it as "solved independently after help", apart from the help that came before. A later delayed check is stronger evidence; it is never called mastery.
6. **Return and defend.** Back to the anchor. The learner predicts, runs, revises, and writes a decision: what changed, why, which runs show it, and what was rejected. Then they answer two or three "what if" questions built from their own numbers and checked by the engine, with no AI.

The same loop runs every year; only the anchor and the prerequisite chain get deeper. Example: in semester V a shaft fatigue failure traces back through stress concentration and torsion (III), to moments (II), to vectors (school).

**Portfolio entry** = design revision + reproducible runs + the decision and its defence + the prerequisite trail (what blocked the learner, what was taught, the unaided evidence). Designs, measurements and decisions, not videos watched.

### Portability and room for CAD (not built now)

- The record is already a plain JSON file (`core/project.mjs` serialize/deserialize, Experiments panel export/import). To keep it portable: publish its schema with a version, add decision entries, and make a portfolio export (JSON, plus a readable page, plus CSV of runs).
- Keep part geometry as **named parameters with units** (material, section type, b, h, t, span, hole positions), never as pixels or meshes. Parametric CAD, Pro/E and Creo included, models parts as dimensioned features with parameters and relations. A named-parameter part can later map to a CAD part through parameter tables or a neutral format such as STEP. Which bridge to use is decided when CAD integration starts.
- Every number keeps its provenance (entered, measured, sourced, simulated), so a design that goes into CAD and comes back keeps its evidence.

### First-year journey: "The support that holds" (semester II, ME25C02)

Uses only what exists, apart from the gaps listed after it.

| Step | What the student does | What we use (exists) |
|---|---|---|
| 0 Anchor | Brief from the Mount lab: carry a 2,500 N machine on a support bolted 600 mm apart, within a 50 × 80 mm envelope: deflection at the mount ≤ 0.15 mm, stress ≤ yield ÷ 2, mass ≤ 2.5 kg. The student picks material and section; the design is saved as **revision R1** | `mount/` (model.mjs `SPEC`, `check`, `stand`, `verdict`); `core/project.mjs` |
| 1 Stuck | Protocol asks the student to predict the bolt reactions and where the bending is largest when the machine moves from 200 to 300 mm. The prediction misses, or the student can't explain the verdict | `core/protocol.mjs` (predict, lock, score) |
| 2 Find the block | Diagnostic on **moment of a force about a point**. If that fails, check what it rests on: perpendicular distance and resolving components (trig), cross product, two equations in two unknowns | School engine: `packages/learning/src/diagnostic.ts` (diagnostic@1), `misconception-evidence.ts`; school competencies `MATH.trigonometry.functions`, `MATH.vectors.products`, `MATH.algebra.linear-equations` |
| 3 Teach | Maths gaps go to the school engine's modules. The moment itself is taught on the Force Playground: drag a load along the wall shelf, see the reaction and the bending at the wall change, and take ΣM = 0 by hand while the bench checks it | School engine `intervention.ts` (Explore → Strategy → Chapter → Practise → Verify, recovery); `playground/` shelf preset; `engines/solids/frame.mjs` as the answer key |
| 4 Apply | Fresh parametric beams (different span, load and position) solved unaided; transfer to the jib crane preset | `playground/presets.mjs` (crane); frame solver |
| 5 Check | One fresh unaided item, recorded as "solved independently after help" | School engine evidence policy (`evidence.ts`, `records.ts`: assisted vs unaided provenance) |
| 6 Return and defend | Back to R1: predict the reactions and the peak bending moment for *their* section, lock, run the test stand (dial and strain gauge), compare, revise to **R2**, write the decision, and answer engine-checked "what if" questions (machine moved 100 mm, aluminium swapped for steel) | `mount/` test stand; `core/project.mjs` `saveRun`, `compareRuns`, `forkProject`, reproduce badge |
| Later | A delayed check on moments surfaces weeks later; the R1 → R2 entry stays in the portfolio | School engine `plan.ts` (due delayed checks) |

**Where the lab fits:** it is the anchor, the return and the evidence (steps 0, 1 and 6), and a place to explore (step 3). It is not the teacher. Diagnosis, teaching order and evidence come from the school engine's loop.

### Gaps that actually block this journey

1. **No engineering prerequisite graph.** There are no competencies for moment of a force, couple, free-body diagram, support reactions, equilibrium, bending moment from loads or second moment of area, and no edges from them to the school maths ids. About 10–15 nodes. The school engine's graph takes its mandatory edges only from the mathematics package (`graph.ts`), so it needs a second, domain-neutral content source.
2. **No items for those competencies.** The journey needs fresh parametric questions with deterministic answers (the frame solver can be the key) and diagnostic items tagged with misconceptions: slant distance used instead of perpendicular distance, a missing reaction, sign errors, a moment taken about the wrong point.
3. **No shared learner or evidence link.** The Labs record lives in the browser per bench. School-engine evidence lives in OpenPath accounts. Neither knows the other's learner. The journey needs one learner id and Labs writing assisted and unaided evidence events into the same ledger.
4. **The engines can't be combined as built.** The school engine is TypeScript packages; Labs is no-build ES modules. Recommended: compile the domain-neutral pieces (diagnostic, evidence policy, recovery) to one vendored ES module bundle, with the engineering graph and items as Labs content. Don't call a server for each step.
5. **No return-and-defend step.** The record holds runs, not decisions. It needs a decision entry (claim, linked runs, alternatives rejected) and "what if" questions generated from the learner's own design and checked by the engine.
6. **The moment is not visible as a moment.** The Force Playground shows reactions and the bending diagram, but no lever arm, perpendicular distance or ΣM about a chosen point. Teaching step 3 needs this view; it is a view on an existing engine, not a new simulator.

**Status (22 Nov 2026, PR #16):** both journeys play end to end for a student in one runner (`journeys/`). Gaps 1, 2, 5 and 6 are closed for these two topics: statics and fluids graphs (13 + 12 nodes, 16 school-maths nodes), item generators keyed by the engines, decisions and defence on the record, and the moment view in the Force Playground. Gap 4 is closed by porting the school engine's diagnostic@1 into `core/diagnostic.mjs`, not by a vendored bundle. Gap 3 is half closed: Labs keeps a local pseudonymous ledger using the school engine's evidence semantics, but there is no sync with OpenPath accounts yet, and school-maths gaps are practised in Labs with no link to the school engine's lessons (`learnUrl` is null).

Not blocking this journey, but on the path: a versioned public schema and portfolio export (portability); drawing, projection and CAD (all of semester I); unit-level reading of the semester III–VIII syllabi.

### Product shape and the first proof (decided 22 Nov 2026)

OpenPath does the assembly a bright student could do with AI (a tutorial, a simulator, a project), does it once, checks that it works, and makes it available to every student and professor.

- **Curriculum = where to enter:** a semester, a concept the student is stuck on, or a design they want to try. The prerequisite graph says what matters and where to go next.
- **Journey = the unit of product:** a problem, an editable starting setup on a bench, what to observe, predictions to lock, how to help when the student is stuck (the loop above), a fresh problem to check learning, and "what if" questions to defend a design. A professor opens **Journey N**, runs it live, pauses for predictions, and sends the same starting setup to the class (a shareable project file or link, no server). Students then take it in their own direction.
- **Deck = a view of the journey:** slides generated on demand (20-minute demo or full class) from the journey's verified text, bench snapshots and engine results, then editable by the professor. A template does the generating, with no AI. AI may later reword the presentation, but it never changes the physics, the numbers or the objective. Checking a deck means checking its journey once.
- **Cost at scale:** AI helps author and adapt material. Routine simulation, checking and progression run in tested code, so most learning actions are not token calls.

**First proof: two Mechanical topics in one system.**

| Journey | Topic | Bench (exists) | Prerequisite chain |
|---|---|---|---|
| 1 | Support design: moments, reactions, bending (sem II, ME25C02) | Mount lab + Force Playground | moment → perpendicular distance, components, cross product, two equations (school engine) |
| 2 | Pipe sizing: friction losses and the pump operating point (sem IV, CE25C12, which includes a pipe-friction lab) | Fluid line bench + drive check | head loss → Darcy–Weisbach, Reynolds number, energy equation → unit conversion, ratios |

The two journeys use different engines on purpose: solids and hydraulics.

Acceptance tests:
1. A journey is a data file (a spec): anchor bench and setup, observations, predictions, items, help, defence questions. One shared runner plays any journey. **Journey 2 adds a spec and content only, with zero changes to the runner, the deck generator or the app shell** (checked by diff).
2. A professor can open either journey, run the demo, and get a deck. Every number on a slide is reproduced from an engine run in the test suite.
3. A student can open the same journey, get stuck, be sent to a prerequisite, pass a fresh unaided check, and return to their own saved design, revise it and defend it. The revision and the evidence land on the project record.
4. A shared starting setup opens identically on another device (same project file, same results).

Blocking for test 3: gaps 1–6 above. Tests 1, 2 and 4 need only gaps 2 and 6, plus the journey spec, the runner and the deck generator.

## Evidence ladder and the next capability (22 Nov 2026, PR #17)

Four levels, each stricter than the one before:

- **Mapped:** the capability is in the eight-semester map or is a node in the competency graph (`content/graph/`).
- **Simulated:** a bench computes it, and its runs reproduce on the project record.
- **Taught:** a journey's teach step covers it, with items, help that is recorded, and practice.
- **Independently checked:** a fresh unaided item on it is answered and recorded as evidence, and a browser test proves this through visible controls only. The test has no access to page internals or answer keys and never writes to the record.

| | Mapped (graph nodes) | Simulated | Taught | Independently checked |
|---|---|---|---|---|
| Statics and solids (sem II–III) | 13 | reactions, bending moment, stress, deflection (Mount lab, Force Playground, frame solver) | 6 in Journey 1, plus 2 school-maths nodes | 1: moment about a point (the Journey 1 check) |
| Fluids (sem IV) | 12 | flow, losses, operating point, shaft power, NPSH (fluid line bench, Pump House) | 9 in Journey 2, plus 2 school-maths nodes | 1: Darcy–Weisbach head loss (the Journey 2 check) |
| School maths underneath | 16 | — | 4 | 0 |
| The other courses in the eight-semester map | course level only | see the map | 0 | 0 |

The rest of the degree is mapped only. Only the two journey targets are independently checked: `tests/journey-support-visible.e2e.mjs` and `tests/journey-pipe-visible.e2e.mjs` prove them on phone and desktop. Each test solves every question from its visible text with its own hand calculation. It covers a wrong prediction, help, a fresh unaided check, a reload that brings back the exact saved design, a revision made on the real bench and tested, a decision citing the linked run, and a defence. It passes two different valid designs per brief and one design the bench rejects. `tests/journey-r2-bench.e2e.mjs` proves, on the real Mount bench (phone and desktop), that a design edited after its tested run stays untested through a reload and cannot become Revision 2 until it is predicted and run; that saving the last tested design gives exactly that design, its tested run, decision, defence and portfolio while the edit stays current and editable on the bench; and that help on a prerequisite is recorded apart from the unaided check, with the portfolio naming a prerequisite "Answered right in the diagnostic (unaided)" or "Practised with help", never "solved on your own" without a fresh unaided item on it.

Still not proved:
- **Real students learning.** The tests prove only that the software behaves correctly.
- **A delayed retention check.** None is scheduled or tested.
- **The diagnostic's calibration.** It still uses the school engine's draft likelihoods and mostly ends "insufficient evidence".
- **Prerequisites taught from the school engine.** There is no link from Labs to its lessons.
- **The edit after the tested run on the fluid line bench.** Proved on the real bench for Journey 1 only; Journey 2 relies on the same runner, its unit tests and the fixture e2e.
- **A prerequisite checked on its own after teaching.** A taught prerequisite gets practice with help but no fresh unaided item, so the portfolio can only say "Practised with help" for it.
- **The other nine graph nodes of each topic** that no journey targets.

**Next capability: axial stress, strain and Hooke's law, through yield and allowable stress (factor of safety).** Syllabus: PH25C01 Applied Physics I, semester I, *Properties of matter: elasticity, Young's modulus*; CE25C11 Strength of Materials, semester III, which has a laboratory (its unit text was not read in this pass).

Why it comes next:

1. **It is a gap inside the journey we just proved.** Journey 1 judges every design by "stress ≤ yield ÷ 2" and by E·I. The Mount lab measures strain and reports stress = E·ε. But the graph has no node for stress, strain, E, yield or factor of safety: `ENG.solids.bending-stress` and `ENG.solids.beam-stiffness` use them without teaching them. A student who doesn't know what yield ÷ 2 means can pass the journey without understanding its acceptance test.
2. **It sits underneath the most later courses:** bending and torsion (CE25C11, semester III), fatigue, shafts and bearings in Design of Machine Elements (semester V), transmission systems and FEM (semester VI), and materials testing (ME25C08, semester III).
3. **It needs no new simulator.** The Mount lab's strain gauge, `core/materials.mjs` (E, yield) and the frame solver's axial members already compute it, so the step is content and teaching: graph nodes, items and a journey. This PR does not build it.

## Sources

- Anna University B.E. Mechanical Engineering, Regulations 2021, curriculum and syllabi (non-autonomous affiliated colleges), as published by [K.G. Institute of Technology](https://www.kgkite.ac.in/wp-content/uploads/2023/12/B.E.Mechanical-Engineering-R2021-Syllabus.pdf).
- Anna University B.E. Mechanical Engineering, Regulations 2025 (Revised 1, 2026, from AY 2026–27), non-autonomous affiliated institutions: [cac.annauniv.edu](https://cac.annauniv.edu/aidetails/afug_2025_fu%20-%20revision/Mech/B.E.%20Mechanical%20Engineering.pdf) — the cohort for the four-year journey.
- School engine read at premsethutmc/openpath main 62b17d3f (`packages/learning/src`, `content/mathematics/curriculum.v1.json`).
- Shared doc version (no longer updated): https://claude.ai/artifact/1PY9sJa947eweL8eCmvK4Z

## Change log (verify any line with `git show <commit>` and the tests named)

Run all tests: `node --test --test-concurrency=1 tests/*.test.mjs engines/**/*.test.mjs core/*.test.mjs */*.test.mjs` and `PLAYWRIGHT_BROWSERS_PATH=<browsers> node --test --test-concurrency=1 tests/*.e2e.mjs`.

| Date | PR | Merge commit | What changed | Proof (tests) |
|---|---|---|---|---|
| 2026-11-21 | #7 | dee5133 | Pump set drive check: two verdicts (flow, motor); cavitation → cannot assess | pumpset/model.test.mjs, tests/pumpset.e2e.mjs |
| 2026-11-21 | #8 | 90e9fc3 | Shared project/evidence record; fluid line bench; Force Playground on the record | core/project.test.mjs, engines/hydraulics/line.test.mjs, circuit/model.test.mjs, tests/workshop-open.e2e.mjs |
| 2026-11-21 | #9 | d619c60 | Machine design bench (shafts): learner limits, Explain, sensitivity, sweep | engines/machine/shaft.test.mjs, machine/model.test.mjs, tests/machine.e2e.mjs |
| 2026-11-21 | #10 | 3cfc1ae | Workshop lathe and fits on the shared record (includes #6) | workshop/model.test.mjs, tests/workshop.e2e.mjs |
| 2026-11-21 | #11 | 611701d | Whole-reading verification incl. uncertainty; old attempts shown as history | workshop/model.test.mjs, tests/workshop-legacy.e2e.mjs |
| 2026-11-22 | #2 | 264302e | Engine World: signed airflow at the intake valve | tests/shaft.e2e.mjs |
| 2026-11-22 | #12 | 245cf4a | Fault lab and mount lab on the shared record (includes #3, #4); protocol replaces journal | pumps/faults.test.mjs, mount/model.test.mjs, core/protocol.test.mjs, tests/pumpfault.e2e.mjs, tests/mount.e2e.mjs |
| 2026-11-22 | #14 | 670a1bf | Stage 2: fatigue, bearing life, critical speed, unbalance on the shaft bench | engines/machine/*.test.mjs, machine/model.test.mjs, tests/machine-dynamics.e2e.mjs |
| 2026-11-22 | #13 | c3ca460 | Stage 3 started: thermal bench | engines/thermal/thermal.test.mjs, thermal/model.test.mjs, tests/thermal.e2e.mjs |

Totals at c3ca460: 155 unit tests and 37 browser tests passing. At #16: 192 unit and 44 browser.
| 2026-11-22 | #15 (draft) | — not merged | Planning only: R2025 eight-semester map, cross-year learning loop, first-year journey, blocking gaps; product shape (journey, deck) and two-topic proof spec. No code | Docs only; tests unchanged |
| 2026-11-22 | #16 | cbb3941 | Student journeys: one runner, local ledger, ported diagnostic, decisions on the record; Journey 1 support design, Journey 2 pipe sizing; moment view; Mount opens the learner's own design | core/journey.test.mjs (no journey words in the runner), tests/support-content.test.mjs, tests/pipe-content.test.mjs, playground/moments.test.mjs, tests/journeys.e2e.mjs, tests/journeys-real.e2e.mjs, tests/moments.e2e.mjs |
| 2026-11-22 | — | 0f4c684 | Home page links to the student journeys | tests/*.e2e.mjs (home) |
| 2026-11-22 | #17 (draft) | — not merged | Revision 2 must be a tested design; both journeys proved through visible controls only (phone and desktop, two valid designs each); revisions labelled "Revision 1/2", designs shown in words; fluid line bench and Pump House open `?preset=` without touching saved projects; Mount free bench has a way back; evidence ladder and the next capability; real-bench edit after the tested run proved through a reload in both ways out; the Mount lab opens the project's current design, not the latest run (a saved older Revision 2 had replaced the learner's edit on the stand); status words say where evidence came from (a prerequisite right in the diagnostic no longer reads "Solved on your own"); bench link after Revision 2 | core/journey.test.mjs (loophole, red before the fix), tests/journeys.e2e.mjs, tests/journey-support-visible.e2e.mjs, tests/journey-pipe-visible.e2e.mjs, tests/pipe-hand.test.mjs, tests/journey-r2-bench.e2e.mjs, core/ledger.test.mjs (status rule) |
