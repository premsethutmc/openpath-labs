# Validation

Trust is the product. Every engine ships with automated checks against known answers, run on every change.

## Solids (frame FEM)

| Case | Reference | Tolerance |
|---|---|---|
| Cantilever, end load: tip deflection | PL³ / 3EI | 0.1 % |
| Cantilever, end load: root moment | PL | 0.1 % |
| Simply supported, central load: mid deflection | PL³ / 48EI | 0.1 % |
| Simply supported, central load: max moment, reactions | PL/4, P/2 | 0.1 % |
| Uniform load, simply supported: mid deflection | 5wL⁴ / 384EI | 1 % |
| Fixed–fixed, central load: mid deflection | PL³ / 192EI | 0.1 % |
| Pin-jointed truss | Method of joints | 0.1 % |
| Axial bar | δ = PL / AE | 0.1 % |
| Column buckling (pinned–pinned) | π²EI / L² | 0.1 % |
| Global equilibrium | ΣF = 0, ΣM = 0 | 1e-6 relative |

## Materials

Values are typical room-temperature properties from standard engineering references, tagged with `source` and `confidence`. Temperature effects are only applied where a documented model exists.

## Scenarios

Scenario loads follow published code values where they exist (e.g. pedestrian crowd ≈ 5 kN/m², IS 875 / Eurocode order of magnitude), and are labelled as illustrative otherwise.

## Honesty in the interface

- Each result shows the model behind it ("linear elastic, small deflection").
- When a design goes outside the model (e.g. huge deflection, yielding), the interface says so instead of showing a confident number.
