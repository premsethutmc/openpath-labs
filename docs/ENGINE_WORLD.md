# Engine World — first vertical

Goal: one deep, immersive experience that proves the vision. A learner chooses an oil, gives it a history, parks the car anywhere on Earth, turns the key, then drives — watching a see-through four-cylinder engine respond, with every number labelled by how far it can be trusted.

## Learner path

1. **The oil** — 0W-20, 5W-30, 10W-40, 20W-50, SAE 40, or a blend of two. Live viscosity–temperature chart.
2. **Its history** — fresh, or 50,000 km in the desert never changed (thickening is a visible, adjustable *assumption*).
3. **Where it is parked** — Chennai +38 °C to Alaska −35 °C, 0–4 days. Engine cools towards ambient.
4. **Turn the key** — predict first; then cranking speed, start / no-start, seconds until oil reaches the bearings, bearing regime, wear index, warm-up time.
5. **Drive** — engine speed, accelerator, oil temperature → torque, power, efficiency, friction loss, peak pressure, rod-bearing oil film, pressure–volume diagram.

## Models and confidence

| Quantity | Model | Confidence |
|---|---|---|
| Piston motion | Exact slider-crank geometry | Reliable |
| Oil viscosity 0–150 °C | ASTM D341 (Walther) through 40 °C and 100 °C data | Reliable |
| Oil viscosity below 0 °C | Walther bent to 80 % of the SAE J300 cold-cranking limit at the grade's test temperature | Approximate |
| Pour point (solid oil) | Typical pour point per grade | Approximate |
| Blends | Refutas viscosity blending number | Approximate |
| Aged oil | Viscosity × learner-set factor (default +25 %, published range ≈10–40 %) | Assumption |
| Parked engine temperature | Newton cooling, time constant 3 h | Reliable (trend) |
| Cylinder pressure | Single-zone first-law model, Wiebe burn, fixed wall-loss fraction; reduces to ideal Otto (tested) | Approximate |
| Friction | Chen–Flynn FMEP; viscous terms scaled (μ/μref)^0.6 | Approximate |
| Cranking speed | Starter torque–speed line × cold-battery factor vs. T₀ + k·μ·ω; k calibrated so each grade at its J300 CCS limit cranks ≈100 rpm | Approximate |
| Time to oil pressure | Gallery volume ÷ min(pump flow, Hagen–Poiseuille suction flow) | Approximate |
| Bearing oil film | Ocvirk short-bearing solution of the Reynolds equation, steady load; regime by film/roughness ratio | Approximate |
| Wear index | Dry seconds × contact regime | Assumption (trend only) |

Reference engine: 1.2 L inline-four, bore 73 mm, stroke 71.6 mm, rod 128 mm, 10.5:1, firing order 1-3-4-2. Behaviour checked in tests: ≈62 kW at 6000 rpm, peak pressure 8–25° after TDC, efficiency 25–40 %, each oil grade cranks at its rated cold temperature, 20W-50 fails at −35 °C, 0W-20 starts.

## Not modelled

Fuel evaporation in extreme cold, combustion chemistry, 3D oil flow, component lifetime, real engine-specific calibration. The path to deeper fidelity: offline high-fidelity runs → fast surrogate models in the browser (see ARCHITECTURE.md).

## Next in this vertical

- Fit the parts: assemble piston, rings, rod, crank, bearings and pump from a parts tray; wrong fits caught by rules.
- Coolant and antifreeze mix (freezing, cracked block).
- Warm-up as a live timeline instead of a summary number.
- Valve train and intake/exhaust flow (1D), turbocharging.
