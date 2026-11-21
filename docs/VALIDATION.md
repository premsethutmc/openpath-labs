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

## Engine test bench (1D gas dynamics) — `engines/thermofluids/gasdyn.mjs`

The same class of model professional engine tools use: compressible flow in every pipe (finite volume, MUSCL + HLL, Heun),
wall friction and heat transfer, 0D cylinders (temperature-dependent cv, Wiebe heat release at best-torque phasing,
Woschni heat transfer), valves as quasi-steady compressible orifices, open pipe ends with Riemann-flux boundaries,
airbox, plenum, exhaust collector, catalyst and muffler volumes.

| Check | Result (automated) |
|---|---|
| Sod shock tube vs exact Riemann solution | L1 density error < 1.2 % at 100 cells; halves with 4× refinement |
| Closed pipe | mass and energy conserved to 1e-12 |
| Quarter-wave pipe (closed–open) | rings at a/4L within 5 % |
| Orifice | chokes at the critical pressure ratio |
| **Real engine: Maruti Suzuki K12M** (published 113 N·m @ 4500 rpm, 85 PS = 62.5 kW @ 6000 rpm) | calibrated at the torque point (one constant, `conversion` = 0.923); **power predicted at 60.1 kW, −3.8 %** |

**One calibration constant.** `conversion` (share of fuel energy released as useful heat beyond modelled wall loss) is the only
value fitted, and only at the torque point. Everything else is geometry, textbook correlations, or a typical value listed in `K12M`.

**Known gaps to world standard:**
- Only two published data points exist for this engine; a full measured curve (e.g. EPA benchmarking packages for the Mazda 2.0 Skyactiv or Toyota 2.5) is needed for full-curve validation (±5 % target). The EPA packages are zip files this workspace cannot download.
- Unpublished geometry (valve sizes, cam timing, rod length, pipe lengths) uses typical values; the real K12M also has intake VVT, not modelled, so mid-range torque dips (3000–3500 rpm) are likely deeper than the real engine's.
- Constant γ within each pipe; single gas species; no fuel-film or evaporation; no knock-limited spark at full load (combustion phased for best torque); friction from a correlation, not components.
- Valve flow uses a quasi-steady orifice with an anti-overshoot limit; professional codes use characteristic or junction-Riemann valve boundaries.
