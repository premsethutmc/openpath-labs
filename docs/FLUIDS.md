# Flow Tunnel

A live 2D wind/water tunnel (`fluids/`). Engine: `engines/fluids/lbm.mjs` (D2Q9 lattice Boltzmann, TRT collision, half-way bounce-back, momentum-exchange forces, outlet sponge). Scenes and measurements: `engines/fluids/scenes.mjs`.

- **Learn:** six missions on Anna University CE3391 Units I–III (continuity, Bernoulli, laminar pipe flow, Reynolds' experiment, boundary-layer separation, similitude). The learner commits to a prediction; the answer comes from an experiment run in a background worker (`fluids/probe-worker.mjs`), not from a stored key.
- **Explore:** cylinder, wing (angle of attack), flat plate, square, car, venturi, channel, or draw your own shape. Views: speed, swirl, pressure, smoke. Live drag, lift, Strouhal number, and the lift trace.
- Every Reynolds number is translated into real-world equivalents (same object in air or water), with an honest note when everyday flow is turbulent/3D and beyond a 2D tunnel.

Validation: see `VALIDATION.md` → Fluids.
