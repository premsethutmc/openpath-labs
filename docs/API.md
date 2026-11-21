# OpenPath Labs simulation API

The same engines the labs use, over HTTP. JSON in, JSON out. No dependencies (`node server/api.mjs`, Node 22+).

- `GET /health` — liveness.
- `GET /v1` — catalogue: every endpoint with a working example body, materials, sections, pipe materials, oil grades, flow scenes.
- `POST /v1/<engine>` — run a simulation. Every response states the model, method, units, validity and what is **not** modelled.

| Endpoint | What it computes | Time |
|---|---|---|
| `/v1/solids/beam` | simply supported beam, point load: reactions, deflection, moment, bending stress, profile | ms |
| `/v1/solids/frame` | any 2D frame/truss: displacements, reactions, member stresses, buckling, safety factor | ms |
| `/v1/hydraulics/pump-system` | centrifugal pump operating point, NPSH and cavitation | ms |
| `/v1/hydraulics/reciprocating` | reciprocating pump: flow, power, acceleration head, separation, indicator diagram | ms |
| `/v1/thermofluids/oil-viscosity` | oil viscosity vs temperature (grade or custom kv40/kv100) | ms |
| `/v1/thermofluids/engine-cycle` | single-zone SI cycle: IMEP, peak pressure, efficiency, knock | ms |
| `/v1/thermofluids/engine-bench` | 1D gas-dynamics K12M-class bench: torque, power, VE, IMEP/FMEP/BMEP | 1–3 s |
| `/v1/fluids/flow-probe` | 2D lattice-Boltzmann flow: Cd, Cl (Re 5–300) | 1–6 s |

Example:

```sh
curl -X POST https://<host>/v1/solids/beam -H 'content-type: application/json' -H 'x-api-key: <key>' \
  -d '{"span":600,"load":2500,"position":200,"material":"aluminium","section":{"shape":"rect","b":40,"h":30}}'
```

**Limits.** 64 KB body; `RATE_PER_MIN` requests per IP per minute (default 60); at most 2 slow simulations at once (others get 429), 30 s timeout. Invalid input → 400/422 with a reason; a non-converged or unstable run returns an error, never numbers.

**Keys.** Set `API_KEYS` (comma-separated) in the host environment; POST requests must then send `x-api-key`. GET routes stay open. Keys are never stored in the repo.

**Status.** Teaching models with stated assumptions — not design certification.
