# Engine World — first vertical

Goal: one deep, immersive experience that proves the vision. A learner chooses an oil, gives it a history, parks the car anywhere on Earth, turns the key, then drives — watching a see-through four-cylinder engine respond, with every number labelled by how far it can be trusted.

## Learner path

0. **Build the engine** — fit nine parts from a tray in a sensible order (wrong order is refused with the reason). Choices matter: bearing clearance (standard / tight / worn), ring gap (correct / too small / too large), oil fill (correct / low / overfilled). Taking off a part removes everything fitted on top of it.
1. **The oil** — 0W-20, 5W-30, 10W-40, 20W-50, SAE 40, or a blend of two. Live viscosity–temperature chart.
2. **Its history** — fresh, or 50,000 km in the desert never changed (thickening is a visible, adjustable *assumption*).
3. **Where it is parked** — Chennai +38 °C to Alaska −35 °C, 0–4 days. Engine cools towards ambient.
4. **Turn the key** — predict first; then cranking speed, start / no-start, seconds until oil reaches the bearings, bearing regime, wear index, warm-up time.
5. **Drive** — engine speed, accelerator, oil temperature → torque, power, efficiency, friction loss, peak pressure, rod-bearing oil film, oil pressure, pressure–volume diagram.
6. **Valves and airflow** — Economy / Stock / Sport cams or a custom one (duration, lift, lobe centre), valve springs, intake runner length → valve events, overlap and idle quality, cylinder filling, runner resonance, valve-float speed, valve-to-piston gap, and a full-throttle dyno curve compared with the previous setup. Valves open and close in the 3D engine; a cam that reaches the pistons crashes on the first turn.
7. **Spark, fuel and boost** — fuel octane (RON 91 / 95 / 100), compression ratio, spark timing (engine computer with knock sensor, or by hand), mixture λ, turbo boost and intercooler → spark chosen and how far it is held back from best torque, knock, intake air temperature, boost and turbo lag, fuel per kWh, emission trends; torque-vs-spark chart with the knock zone. Knocking cylinders flash white in 3D; a turbo appears and spins.

## Two levels of model

- **Fast model** (everything above, instant): single-zone cycle with correlations — for exploring.
- **Test bench** (step 6, runs in a background thread): 1D gas dynamics of the real Maruti Suzuki K12M — pressure waves in every pipe, calibrated once and checked against published figures (see VALIDATION.md). The fast model's dyno chart shows the test-bench curve in green and the published figures as crosses; learners can run the test bench for their own cam and runner setup and see the pressure waves in the cylinder and inlet runner.

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
| Oil pressure | Pump flow through bearing side-leakage ∝ c³/μ, relief valve 4.5 bar; calibrated to ≈1.2 bar hot idle | Approximate |
| Coolant freezing | Ethylene-glycol table by volume | Reliable |
| Tight bearings when hot | Rule: < 12 µm clearance above 60 °C → metal contact, seizure risk | Assumption (rule of thumb) |
| Ring gap, oil level | Compression −10 % (large gap), drag +5 % (small gap), +8 % (overfill) | Assumption |
| Valve events and lift | Cam duration, lift and lobe centre; 1 − cos lift profile | Reliable (geometry) |
| Cylinder filling (volumetric efficiency) | Low speed: V(IVC)/V(BDC) push-back; high speed: inertia; Taylor inlet Mach index limit; Helmholtz runner bump; overlap backflow | Approximate (Heywood ch. 6) |
| Valve float | Spring force vs valve-train mass × peak deceleration; cam-ramp factor 1.8 | Approximate (factor assumed) |
| Valve-to-piston gap | Piston position + lift around overlap TDC; squish 1.0 mm + pocket 1.6 mm assumed | Reliable geometry, assumed dimensions |
| Exhaust valve opening | Expansion work ends at EVO (blowdown); late EVO adds exhaust pumping at speed | Approximate |
| Spark timing, MBT | Cylinder model swept over spark advance | Approximate |
| Knock | Livengood–Wu integral, Douaud–Eyzat delay; calibration ×2.4 so RON 91 at 10.5:1, 2000 rpm is knock-limited near 15° | Approximate (calibration assumed) |
| Mixture λ | Heat release vs λ, burn speed, γ, rich charge cooling, lean misfire | Approximate |
| Emissions | CO / HC / NOx shapes vs λ; catalyst works only near λ = 1 | Assumption (trend only) |
| Turbo | Compressor outlet temperature (isentropic, 72 %); intercooler effectiveness; spool-up 1500–3500 rpm; back-pressure 0.85 × boost | Reliable (temperature) / Approximate |
| Warm-up timeline | Lumped heat balance, 5 kW into the engine at idle, thermostat at 90 °C | Approximate |

Reference engine: 1.2 L inline-four, bore 73 mm, stroke 71.6 mm, rod 128 mm, 10.5:1, firing order 1-3-4-2. Behaviour checked in tests: ≈62 kW at 6000 rpm, peak pressure 8–25° after TDC, efficiency 25–40 %, each oil grade cranks at its rated cold temperature, 20W-50 fails at −35 °C, 0W-20 starts.

## Not modelled

Fuel evaporation in extreme cold, combustion chemistry, 3D oil flow, component lifetime, real engine-specific calibration. The path to deeper fidelity: offline high-fidelity runs → fast surrogate models in the browser (see ARCHITECTURE.md).

## Next in this vertical

- Valve train and intake/exhaust flow (1D), turbocharging.
