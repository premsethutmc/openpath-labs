# Roadmap

## Stage 1 — Proof it works *(now)*

- [x] Vision, architecture, learning design, curriculum, validation docs
- [x] Shared formats: materials, sections, scenarios
- [x] Solids engine v1: 2D frame FEM (bending + axial), reactions, member forces, stress, buckling, safety factor — validated against textbook cases
- [x] Dashboard: all labs across the mechanical path, with status
- [x] Force Playground v1: real objects (shelf bracket, footbridge, truss bridge, crane, diving board), drag loads live, swap material and section, scenarios, live deformation, stress colours, live equations, safety meter, failure; guided path with pause-and-think
- [x] Build your own: draw members (rigid or pin joints), supports, delete, move joints, undo, material used; edit any preset; designs saved in the browser
- [ ] Solids v2: 2D plane stress (holes, notches, stress concentrations), shear stress, torsion members

### Engine World (first deep vertical)
- [x] 3D see-through running engine (own WebGL renderer), drag to rotate, combustion glow, oil gallery filling, bearing colours
- [x] Oil engine: ASTM D341 viscosity, SAE J300-anchored cold behaviour, pour point, blends, aged-oil assumption
- [x] Cylinder model, friction, cranking, oil-pressure delay, Ocvirk bearing film, cooling and warm-up — each labelled Reliable / Approximate / Assumption
- [x] Fit the parts (assembly with order rules and consequential choices), coolant and antifreeze, fast-forward warm-up timeline
- [x] Valves and airflow: cams, springs, runner tuning, valve float, valve-to-piston contact, dyno curve, animated valves
- [x] Spark timing and knock, octane, compression ratio, mixture and emissions trends, turbo and intercooler
- [x] High-fidelity test bench: 1D gas dynamics model of a real engine (K12M), physics-validated, ±4 % on published power
- [ ] Full-curve validation against measured benchmark data (EPA packages); intake VVT; component friction; dynamically loaded bearings; turbo maps
- [ ] Gearbox and vehicle (engine → wheels), fuel consumption on a drive cycle

## Stage 2 — Proof people want it

- Pilot with 2–3 Tamil Nadu engineering colleges; faculty interviews
- Notebook sync and simple accounts; faculty view of student actions
- Materials engine v1: alloy families, heat treatment, temperature effects
- Motion engine v1: linkages, gears, cams

## Stage 3 — Proof it teaches better

- Before/after concept tests with pilot classes
- Thermo-fluids v1: property tables, engine cycle, lubrication and viscosity, the "Alaska cold start"
- AI edge helper, labelled, with logged edge questions

## Stage 4 — Funding and scale

- Circuits engine; civil and electrical paths
- Public API for the engines
- Design Studio and capstone projects (gearbox, engine, vehicle)

## Later

- Multiple interface languages (platform-wide, all at once — not one language as a selling point)

## Fluids
- Done: Flow Tunnel (live LBM, 6 CE3391 missions, draw-your-own).
- Next: pumps and pipe networks (Units IV–V: Darcy losses, Moody chart, centrifugal pump curves); finer grid / GPU for higher Re.
