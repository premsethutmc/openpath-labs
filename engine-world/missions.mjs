// Guided missions through Engine World, mapped to the Anna University R2021 syllabus ME3451 Thermal Engineering.
// Every prediction's correct answer is computed by the simulation at the moment it is asked — never hard-coded.

export const COURSE = 'Anna University ME3451 Thermal Engineering';

export function makeMissions(api) {
  const { S, set, model } = api;
  return [
    {
      id: 'build', unit: 'Unit IV · IC engine components and their functions', title: 'Put an engine together',
      intro: 'An engine is a stack of parts that must go in a certain order. Fit all nine parts on the right.',
      show: ['build-panel'], tab: 'build',
      predict: { q: 'Which must go in first?', options: ['Crankshaft', 'Main bearing shells'], answer: () => (model.fitFirst('crank') ? 'Crankshaft' : 'Main bearing shells') },
      explain: 'The crankshaft never touches the block directly: it runs on thin shells with an oil film between. Wrong order? The build tells you why.',
      task: 'Fit all nine parts (or press “Skip: use a ready-built engine”).', done: () => model.complete(),
    },
    {
      id: 'pv', unit: 'Unit IV · Ideal and actual p-v diagrams', title: 'Read the pressure–volume loop',
      intro: 'Each cycle the gas is squeezed, burned and expands. The area inside the p–V loop is the work done per cycle.',
      show: ['s-drive'], setup: () => { set('rpm', 3000); set('thr', 0.3); },
      predict: { q: 'Push the accelerator from 30 % to 100 %. Will the loop get bigger or smaller?', options: ['Bigger', 'Smaller'],
        answer: () => (model.work({ thr: 1 }) > model.work({ thr: 0.3 }) ? 'Bigger' : 'Smaller') },
      explain: 'More throttle lets more air in, so more fuel burns: higher pressures, a fatter loop, more work. At part throttle the engine also pays to suck air past the closed throttle (pumping loss).',
      task: 'Move the accelerator and watch the loop and the torque change.', after: () => set('thr', 1),
    },
    {
      id: 'valves', unit: 'Unit IV · Valve timing diagrams', title: 'Valve timing decides where the engine is strong',
      intro: 'When the valves open and close, and how far, controls how well the cylinders fill at each speed.',
      show: ['s-breathe'], setup: () => { model.cam('economy'); set('rpm', 1500); set('thr', 1); },
      predict: { q: 'At 1500 rpm, which camshaft pulls harder: Economy or Sport?', options: ['Economy', 'Sport'],
        answer: () => (model.torqueWithCam('economy', 1500) > model.torqueWithCam('sport', 1500) ? 'Economy' : 'Sport') },
      explain: 'A sport cam keeps the inlet open long after bottom dead centre. At low speed the rising piston pushes some charge back out; at high speed the moving air keeps flowing in. Mild cams win low down, wild cams win at the top.',
      task: 'Switch between Economy, Stock and Sport and compare the dyno curves (the previous one is dashed).',
    },
    {
      id: 'mixture', unit: 'Unit IV · Air–fuel ratio: lean and rich mixtures', title: 'Rich for power, lean for economy',
      intro: 'λ = 1 means exactly enough air to burn all the fuel (14.7 kg of air per kg of petrol).',
      show: ['s-burn'], setup: () => { set('rpm', 3000); set('thr', 1); set('lam', 1); },
      predict: { q: 'Which uses less fuel for each kWh of work: a lean mixture (λ 1.15) or a rich one (λ 0.88)?', options: ['Lean', 'Rich'],
        answer: () => (model.bsfc({ lam: 1.15 }) < model.bsfc({ lam: 0.88 }) ? 'Lean' : 'Rich') },
      explain: 'Rich: extra fuel that cannot find oxygen, but a cooler, faster burn gives slightly more power. Lean: every drop of fuel burns, so economy is best — until the flame struggles and misfires. Engines with catalysts run near λ = 1.',
      task: 'Slide the mixture and watch power, fuel per kWh and the exhaust bars.', after: () => set('lam', 1),
    },
    {
      id: 'knock', unit: 'Unit IV · Knocking: phenomena and control', title: 'Knock — and how engines avoid it',
      intro: 'Firing the spark earlier gives the flame more time — up to a point. Then the unburned gas ahead of the flame explodes on its own.',
      show: ['s-burn'], setup: () => { set('rpm', 2000); set('thr', 1); model.fuel(91); model.ecu(false); set('adv', 40); },
      predict: { q: 'Regular fuel (RON 91), spark at 40° before top dead centre, full throttle at 2000 rpm. Will it knock?', options: ['Yes', 'No'],
        answer: () => (model.knocks() ? 'Yes' : 'No') },
      explain: 'Knock is controlled three ways: retard the spark (the engine computer does this using a knock sensor), use higher-octane fuel, or lower the compression ratio.',
      task: 'Switch to “Engine computer + knock sensor”, then try Racing fuel and see how far the spark can advance.', after: () => model.ecu(true),
    },
    {
      id: 'lube', unit: 'Unit V · Lubrication systems', title: 'A cold start in Alaska',
      intro: 'Oil thickens enormously as it cools. The starter and the oil pump both have to fight it.',
      show: ['s-oil', 's-park', 's-key'], setup: () => { model.oil('5W-30'); model.place('alaska'); set('hours', 96); },
      predict: { q: 'Fresh 5W-30, four days parked in Alaska (−35 °C). Will the engine start?', options: ['Yes', 'No'],
        answer: () => (model.starts() ? 'Yes' : 'No') },
      explain: 'The “5W” rating promises cranking down to about −30 °C. Below that, the oil is too thick for a cold battery. 0W-20 is rated to −35 °C.',
      task: 'Turn the key. Then try 0W-20, and 20W-50.',
    },
    {
      id: 'cooling', unit: 'Unit V · Cooling systems', title: 'Antifreeze',
      intro: 'Coolant is water mixed with antifreeze (ethylene glycol). Pure water freezes at 0 °C and expands about 9 % — enough to crack an engine block.',
      show: ['s-park'], setup: () => { model.place('alaska'); set('gly', 30); },
      predict: { q: 'Coolant with 30 % antifreeze, parked in Alaska at −35 °C. Will it freeze?', options: ['Yes', 'No'],
        answer: () => (model.frozen() ? 'Yes' : 'No') },
      explain: 'A 30 % mix only protects to about −16 °C. A 50 % mix protects to about −37 °C; more than 60 % gets worse again.',
      task: 'Move the antifreeze slider until the coolant is safe.', after: () => set('gly', 50),
    },
    {
      id: 'turbo', unit: 'Unit V · Supercharging and turbocharging', title: 'Forcing more air in',
      intro: 'A turbocharger uses exhaust energy to compress the intake air, so more air — and more fuel — fits into each cylinder.',
      show: ['s-burn'], setup: () => { model.place('chennai'); set('rpm', 5000); set('thr', 1); set('boost', 0); model.ecu(true); },
      predict: { q: 'Add 0.8 bar of boost with no intercooler. What happens to the temperature of the air entering the cylinders?', options: ['Hotter', 'Same', 'Colder'],
        answer: () => { const d = model.airTemp({ boost: 0.8, ic: 'none' }) - model.airTemp({ boost: 0 }); return d > 2 ? 'Hotter' : d < -2 ? 'Colder' : 'Same'; } },
      explain: 'Compressing air heats it (the same reason a bicycle pump gets warm). Hot air is less dense and knocks sooner, so turbo engines use an intercooler.',
      task: 'Set boost to 0.8 bar, then compare intercooler None / Basic / Large.',
    },
    {
      id: 'bench', unit: 'Unit V · Performance parameters and testing', title: 'The test bench',
      intro: 'Engines are measured on a dynamometer. Here a high-fidelity model of a real 1.2 L Maruti Suzuki engine runs the test.',
      show: ['s-breathe'], setup: () => { model.cam('stock'); set('rpm', 4500); set('thr', 1); },
      predict: { q: 'The maker publishes this engine’s maximum torque at 4500 rpm. Which is closest?', options: ['95 N·m', '113 N·m', '135 N·m'],
        answer: () => { const t = model.published(); return ['95 N·m', '113 N·m', '135 N·m'].reduce((a, b) => (Math.abs(parseFloat(b) - t) < Math.abs(parseFloat(a) - t) ? b : a)); } },
      explain: 'Torque × speed = power. The test bench simulates pressure waves in every pipe; its result is checked against the maker’s figures.',
      task: 'Press “Run the test bench at this speed” and look at the pressure waves in the cylinder and inlet pipe.',
    },
  ];
}
