// Guided missions for the Flow Tunnel, mapped to Anna University R2021 CE3391 Fluid Mechanics and Machinery.
// Answers come from experiments run by the simulation (in a background thread) — or, for similitude, from the
// Reynolds-number relation itself.

export const COURSE = 'Anna University CE3391 Fluid Mechanics and Machinery';
const NU_AIR = 1.5e-5, NU_WATER = 1.0e-6;

export const MISSIONS = [
  {
    id: 'continuity', unit: 'Unit I · Continuity equation', title: 'Squeeze the pipe',
    intro: 'Water flows through a pipe that narrows to less than half its width, then widens again (a venturi).',
    scene: ['venturi', 40], view: 'speed',
    q: 'In the narrow throat, is the flow faster, the same, or slower?', options: ['Faster', 'Same', 'Slower'],
    probe: ['venturi', 40], answer: r => (r.speedRatio > 1.05 ? 'Faster' : r.speedRatio < 0.95 ? 'Slower' : 'Same'),
    measured: r => `Throat speed ÷ inlet speed = ${r.speedRatio.toFixed(2)}.`,
    explain: 'What goes in must come out: the same volume passes every second, so where the area is smaller the fluid must move faster (A₁V₁ = A₂V₂).',
    task: 'Switch to Smoke and watch the streaks bunch together and speed up in the throat.',
  },
  {
    id: 'bernoulli', unit: 'Unit I · Energy equation (Bernoulli)', title: 'Where is the pressure lowest?',
    intro: 'Same venturi. Now look at pressure instead of speed.',
    scene: ['venturi', 40], view: 'pressure',
    q: 'Where the flow speeds up in the throat, is the pressure higher, the same, or lower?', options: ['Higher', 'Same', 'Lower'],
    probe: ['venturi', 40], answer: r => (r.pressureDrop > 0 ? 'Lower' : 'Higher'),
    measured: () => 'Measured pressure is lower in the throat than at the inlet.',
    explain: 'Bernoulli: along a streamline, pressure + ½ρV² stays nearly constant. Speed up the fluid and its pressure falls. A venturi meter uses this pressure drop to measure flow rate.',
    task: 'Change the Reynolds number and see the low-pressure throat stay low.',
  },
  {
    id: 'laminar', unit: 'Unit II · Laminar flow through conduits', title: 'Inside a pipe',
    intro: 'Slow, smooth (laminar) flow through a straight pipe. The fluid sticks to the walls (no-slip).',
    scene: ['pipe', 40], view: 'speed',
    q: 'Where across the pipe is the fluid fastest?', options: ['Centre', 'Near the walls', 'Same everywhere'],
    probe: ['pipe', 40], answer: r => { const p = r.profile, i = p.indexOf(Math.max(...p)); return Math.abs(i - p.length / 2) < p.length * 0.15 ? 'Centre' : 'Near the walls'; },
    measured: r => `Centre speed ÷ average speed = ${r.centreOverMean.toFixed(2)} (exact for this 2D channel: 1.5; for a round pipe it is 2).`,
    explain: 'Each layer of fluid drags on the next (viscosity). At the wall the speed is zero; the profile is a parabola — the Hagen–Poiseuille solution.',
    task: 'Switch to Smoke: the middle streaks race ahead of those near the walls.',
  },
  {
    id: 'reynolds', unit: 'Unit II · Reynolds’ experiment, laminar and unsteady flow', title: 'When does the wake start to swing?',
    intro: 'A cylinder in a slow, syrupy stream (Reynolds number 20). The wake behind it is two still, swirling bubbles.',
    scene: ['cylinder', 20], view: 'swirl',
    q: 'Raise the Reynolds number to 100 (faster flow or thinner fluid). Will the wake start to swing from side to side?', options: ['Yes', 'No'],
    probe: ['cylinder', 100], answer: r => (r.clAmp > 0.15 ? 'Yes' : 'No'),
    measured: r => `At Re ${Math.round(r.Re)} the sideways force swings by ±${r.clAmp.toFixed(2)} (lift coefficient).`,
    explain: 'Re = ρVD/μ compares inertia with viscosity. Above about Re 47, vortices peel off alternately from each side — a von Kármán vortex street. This is why chimneys and cables sway in wind.',
    task: 'Slide the Reynolds number from low to high and find where the swinging starts.', after: api => api.setRe(100),
  },
  {
    id: 'separation', unit: 'Unit II · Boundary layer concepts', title: 'Why streamlining works',
    intro: 'The thin layer of slowed fluid next to a surface is the boundary layer. On a blunt body it breaks away (separates) and leaves a wide, low-pressure wake.',
    scene: ['cylinder', 150], view: 'swirl',
    q: 'A wing section and a cylinder face the same flow (Re 150). Which feels less drag for its size?', options: ['Wing', 'Cylinder', 'About the same'],
    probe: [['wing', 150, { aoa: 0 }], ['cylinder', 150]], answer: ([w, c]) => (w.cd < 0.7 * c.cd ? 'Wing' : c.cd < 0.7 * w.cd ? 'Cylinder' : 'About the same'),
    measured: ([w, c]) => `Drag coefficients: wing ${w.cd.toFixed(2)}, cylinder ${c.cd.toFixed(2)}.`,
    explain: 'On the tapered wing the boundary layer stays attached almost to the tail, so the wake is thin. Most of a cylinder’s drag comes from the low pressure in its separated wake.',
    task: 'Choose Wing and raise its angle above about 15°: watch the flow separate on top — that is a stall.', after: api => api.setScene('wing', 150),
  },
  {
    id: 'similitude', unit: 'Unit III · Similitude and model studies', title: 'Testing a model car in water',
    intro: 'Engineers test small models. The flow looks the same if the Reynolds number is the same (dynamic similarity).',
    scene: ['car', 150], view: 'smoke',
    q: 'A 1:10 scale model of a car that drives at 20 m/s in air is tested in water. How fast must the water flow to match the Reynolds number?', options: ['1.3 m/s', '13 m/s', '200 m/s'],
    probe: null,
    answer: () => { const v = 20 * 10 * (NU_WATER / NU_AIR); return ['1.3 m/s', '13 m/s', '200 m/s'].reduce((a, b) => (Math.abs(parseFloat(b) - v) < Math.abs(parseFloat(a) - v) ? b : a)); },
    measured: () => `Re equal: V_model = V_real × (L_real ÷ L_model) × (ν_water ÷ ν_air) = 20 × 10 × (1.0×10⁻⁶ ÷ 1.5×10⁻⁵) ≈ ${(20 * 10 * NU_WATER / NU_AIR).toFixed(1)} m/s.`,
    explain: 'Water is about 15 times less “slippery” in the Reynolds sense (lower kinematic viscosity) than air, which lets a small model reach the full-size Reynolds number at a manageable speed.',
    task: 'In this tunnel every shape is shown by its Reynolds number. Draw your own shape and compare drag at the same Re.',
  },
];
