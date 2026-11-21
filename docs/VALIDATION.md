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

## Fluids — Flow Tunnel (2D lattice Boltzmann, D2Q9 TRT)

| Check | Result | Reference | Verdict |
|---|---|---|---|
| Poiseuille channel, peak velocity | −0.34 % | analytic parabola | ✓ |
| Mass conservation over 4000 steps | balanced | — | ✓ |
| Venturi: continuity / Bernoulli | throat speed ×2.7, pressure falls | A₁V₁ = A₂V₂, Bernoulli | ✓ qualitative |
| Cylinder Re 20 steady drag (Schäfer–Turek 2D-1, D = 20 cells) | Cd 5.79 | 5.58 | +4 % |
| Cylinder Re 100 (Schäfer–Turek 2D-2), Strouhal number | 0.297 | 0.295–0.305 | ✓ |
| Same, peak drag / peak lift | 3.74 / 1.17 | 3.22–3.24 / 0.99–1.01 | +16 % / +17 % (coarse grid) |
| Shedding onset | steady at Re 20, shedding at Re 100 | onset ≈ Re 47 | ✓ |

**What is reliable:** flow patterns, steady vs shedding regimes, shedding frequency, trends (streamlined vs blunt, continuity, Bernoulli, laminar profile).
**Approximate:** force coefficients (±5 % steady, ~±15–20 % peak values on the coarse live grid).
**Not modelled:** 3D effects, turbulence at everyday Reynolds numbers (10⁴–10⁶), compressibility. The tunnel caps the Reynolds number where the grid can no longer resolve the flow and says so ("max").

## Hydraulics — Pump House (pipes and centrifugal pumps)

| Check | Result | Reference | Verdict |
|---|---|---|---|
| Water density / viscosity / vapour pressure, 20–100 °C | within 0.1 % / 2 % / 1 % | IAPWS tables | ✓ |
| Friction factor, Re 10⁵, ε/D 0.001 | 0.0222 | Moody chart 0.0222 | ✓ |
| Smooth pipe, Re 10⁵ | within 3 % | Blasius 0.0178 | ✓ |
| Fully rough, ε/D 0.01 | 0.038 | Moody 0.038 | ✓ |
| Affinity law H ∝ N² | exact (hydraulic head) | similarity laws | ✓ |
| Operating point energy balance | pump head = static + all losses (1e-6) | Bernoulli with losses | ✓ |
| Atmospheric pressure, 2240 m | 77 kPa | standard atmosphere | ✓ |

**Reliable:** pipe losses, operating point for a given pump curve, affinity trends, series/parallel behaviour, NPSH available.
**Approximate:** the pump itself is a physics-based model (Euler + slip + loss model) tuned to behave like a ~1.5 kW monoblock pump (shut-off 28 m, best efficiency ≈ 51 % at 4 L/s). NPSH required uses the Pfleiderer eye model — typical, not catalogue data. Fitting K values are typical (Crane TP-410), real fittings vary ±30 %.
**Not modelled:** transients and water hammer, air entrainment, motor characteristics, gradual head loss under incipient cavitation.

## Hydraulics — Piston Pump (reciprocating)

| Check | Result | Reference | Verdict |
|---|---|---|---|
| Theoretical discharge | A·L·N/60 exactly; ×2 double-acting | textbook | ✓ |
| Acceleration head | (L/g)(A/a)ω²r, maximum at stroke start | textbook | ✓ |
| Indicator-diagram area vs power formula ρgQ(hs+hd+⅔hfs+⅔hfd) | within 0.2 % | textbook | ✓ |
| Friction work saved by air vessel | 84.8 % single, 39.2 % double | textbook values 84.8 % / 39.2 % | ✓ |
| Separation | none at 60 rpm, suction separates at 120 rpm (limit 72 rpm); air vessels prevent it | 2.5 m abs criterion | ✓ |

**Assumptions:** simple harmonic piston motion (long connecting rod), rigid water columns, constant friction factor (taken at mean velocity), air vessels adjacent to the cylinder, slip as one coefficient of discharge.
