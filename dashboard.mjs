import { PRESETS } from './playground/presets.mjs';

const progress = (() => { try { return JSON.parse(localStorage.getItem('labs.progress')) || {}; } catch { return {}; } })();
const lastPreset = (() => { try { return JSON.parse(localStorage.getItem('labs.preset')); } catch { return null; } })();

const ENGINES = [
  { name: 'Solids', does: 'forces, stress, bending, buckling, failure', status: 'live' },
  { name: 'Motion', does: 'crank trains, linkages, gears, vibration', status: 'seeded' },
  { name: 'Thermo-fluids', does: 'engines, oil, pipe waves, flow tunnel, pumps', status: 'live' },
  { name: 'Circuits', does: 'current, motors, sensors, logic', status: 'planned' },
  { name: 'Materials', does: 'alloys, heat treatment, temperature', status: 'seeded' },
];
const STATUS = { live: 'Live', next: 'Building next', planned: 'Planned', seeded: 'Started' };

const STAGES = [
  { title: 'Forces around you', q: 'What forces act on it? Does it stay put?', engines: ['Solids'], status: 'live', objects: ['shelf', 'crane'] },
  { title: 'Strength of materials', q: 'How hard is the material working inside? How much does it bend? When does it fail? How do I make it stronger or lighter?', engines: ['Solids', 'Materials'], status: 'live', objects: ['footbridge', 'truss', 'diving', 'column'] },
  { title: 'Materials', q: 'What is it made of, why does it fail, and can I make a better one?', engines: ['Materials', 'Solids'], status: 'planned', soon: 'Blend your own alloy, quench and temper it, take it to the Arctic.' },
  { title: 'Making things', q: 'How are shapes made, and what does that do to strength?', engines: ['Solids', 'Materials'], status: 'planned', soon: 'Lathe, milling, welding, casting, 3D printing — then test what you made.' },
  { title: 'Machines', q: 'How is motion transformed?', engines: ['Motion'], status: 'next', soon: 'Linkages, cams, gear trains, steering — drag them and watch them move.' },
  { title: 'Dynamics', q: 'What happens when things move fast or shake?', engines: ['Motion', 'Solids'], status: 'planned', soon: 'Balancing, flywheels, governors, earthquakes.' },
  { title: 'Energy', q: 'Where does the energy go, and how much is wasted?', engines: ['Thermo-fluids', 'Motion'], status: 'live', links: [{ name: 'Engine World', href: './engine-world/index.html', sub: 'Choose the oil, park the car in Alaska, turn the key' }, { name: 'Flow Tunnel', href: './fluids/index.html', sub: 'Watch fluid flow around pipes, wings, cars — and your own drawings' }, { name: 'Pump House', href: './pumps/index.html', sub: 'Pump water to the hostel tank — pipes, pump curves, cavitation' }, { name: 'Piston Pump', href: './pumps/piston.html', sub: 'Crank, valves, indicator diagram, air vessels, separation' }] },
  { title: 'Heat', q: 'How does heat move, and how do we control it?', engines: ['Thermo-fluids'], status: 'planned', soon: 'Fins, insulation, radiators, heat exchangers.' },
  { title: 'Design', q: 'How do I size real parts safely?', engines: ['All engines'], status: 'planned', soon: 'Bolts, gears, bearings, shafts, clutches, brakes.' },
  { title: 'Your project', q: 'Can I build a whole working machine?', engines: ['All engines'], status: 'planned', soon: 'A gearbox, an engine, a vehicle, a robot — yours.' },
];

document.getElementById('engines').innerHTML = ENGINES.map(e => `<div class="engine ${e.status}"><b>${e.name}</b><span>${e.does}</span><em>${STATUS[e.status]}</em></div>`).join('');

document.getElementById('stages').innerHTML = STAGES.map((s, i) => {
  const links = (s.links || []).map(k => `<a class="obj feature" href="${k.href}"><span>${k.name}</span><small>${k.sub}</small></a>`).join('');
  const objects = links + (s.objects || []).map(id => {
    const p = PRESETS.find(x => x.id === id), done = progress[id] || 0, total = p.steps.length;
    return `<a class="obj" href="./playground/index.html#${id}"><span>${p.name}</span><small>${done ? `${Math.min(done, total)}/${total} steps` : p.question}</small></a>`;
  }).join('');
  return `<li class="stage ${s.status}">
    <div class="snum">${i + 1}</div>
    <div class="sbody">
      <div class="stitle"><h3>${s.title}</h3><em>${STATUS[s.status]}</em></div>
      <p class="sq">${s.q}</p>
      ${objects ? `<div class="objs">${objects}</div>` : `<p class="soon-line">${s.soon}</p>`}
      <p class="eng">${s.engines.join(' · ')}</p>
    </div></li>`;
}).join('');

if (lastPreset && PRESETS.some(p => p.id === lastPreset)) {
  const c = document.getElementById('continue');
  c.href = `./playground/index.html#${lastPreset}`;
  c.textContent = `Continue: ${PRESETS.find(p => p.id === lastPreset).name}`;
}
document.body.dataset.ready = 'true';
