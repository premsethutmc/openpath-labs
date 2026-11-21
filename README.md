# OpenPath Labs

Open-ended simulation worlds for engineering students: make things, break them, discover the subject.

## The Workshop — Strength of Materials (first slice)

`strength-lab/` is a static page with no build step, backend or external assets.

- **Lathe:** turn down sections (sharp or rounded steps) and cut grooves (sharp or round tool) in mild steel, aluminium or cast iron bars (20 mm × 120 mm).
- **Test rig:** pull or twist the part to failure; live load–stretch / torque–twist graph, dials with slight measurement wobble, fracture shape (cup-and-cone, flat, 45° helix).
- **Notebook and quests:** every test is logged in the browser (localStorage) with comparison to the previous test; six discovery quests tick off automatically.

Model: σ = F/A, τ = 16T/πd³, δ = ΣFL/AE, θ = ΣTL/GJ; ductile failure at the smallest net section, brittle failure at the highest Kt·σ. Kt values are approximate fits to Peterson's charts. Teaching model, not a design tool.

```sh
node --test strength-lab/model.test.mjs
node --test tests/workshop.e2e.mjs   # needs playwright + chromium
python3 -m http.server -d strength-lab 4190
```
