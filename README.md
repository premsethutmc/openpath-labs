# OpenPath Labs

**Vision: put a world-class industrial R&D lab — like Shell's — in every individual's hands.**

Connected simulation engines behind one dashboard. Learners meet a principle in a real object, isolate it, own it, and push it to the edge — live, in any scenario, at no cost per experiment.

Start with the docs:

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md) — five engines, shared formats, plug-and-play scenarios
- [Learning design](docs/LEARNING_DESIGN.md) — meet → isolate → own → edge; guided and open modes
- [Mechanical engineering, distilled](docs/MECHANICAL_ENGINEERING.md) — the path from first force to your own engine
- [Validation](docs/VALIDATION.md) — how results are checked
- [Roadmap](docs/ROADMAP.md)

## What runs today

- `index.html` — dashboard: engines, the ten-stage mechanical path, progress.
- `playground/` — **Force Playground** (Solids engine): wall shelf, footbridge, truss bridge, jib crane, diving board, building column. Drag loads live; swap material and size; scenarios (crowd, snow, Arctic, desert, cyclone, Moon); live deformation and stress colours; tap any member for its equations with live numbers; safety factor and failure (yield, fracture, crushing, buckling). Learn mode adds guided steps with pause-and-think predictions computed by the engine.
- `engines/solids/` — 2D frame/truss solver (direct stiffness), stresses, buckling, safety; validated against textbook cases.
- `core/` — shared materials, sections, scenarios.

No build step. Serve the repository root with any static server:

```sh
python3 -m http.server 4190      # then open http://127.0.0.1:4190/
node --test engines/             # engine validation
node --test tests/               # browser tests (needs playwright + chromium)
```
