// Engine assembly rules. Pure functions: a build is { fitted: [{ id, option }], log: [] }.
// Choices made here (bearing clearance, ring gap, oil fill) flow into the physics models.

export const PARTS = [
  { id: 'mainShells', name: 'Main bearing shells', needs: [], why: 'They line the block where the crankshaft turns, so the shaft rides on oil, not on bare iron.',
    options: [
      { id: 'std', name: 'Standard (25 µm clearance)', clearance: 25e-6 },
      { id: 'tight', name: 'Tight (8 µm)', clearance: 8e-6, warn: 'Too tight: as parts heat up there is no room for an oil film — risk of seizing.' },
      { id: 'worn', name: 'Worn (60 µm)', clearance: 60e-6, warn: 'Loose: oil escapes from the sides, so oil pressure falls, especially with hot thin oil.' },
    ] },
  { id: 'crank', name: 'Crankshaft', needs: ['mainShells'], why: 'Turns the pistons’ up-and-down push into rotation.',
    blocked: { mainShells: 'The crankshaft has nothing to sit on. Fit the main bearing shells first.' } },
  { id: 'rings', name: 'Piston rings', needs: [], why: 'Seal the gas above the piston and scrape oil off the cylinder wall.',
    options: [
      { id: 'std', name: 'Correct end gap (0.3 mm)', gap: 'ok' },
      { id: 'small', name: 'Gap too small (0.05 mm)', gap: 'small', warn: 'Rings grow when hot. With almost no gap the ends butt together and scuff the cylinder.' },
      { id: 'large', name: 'Gap too large (1.2 mm)', gap: 'large', warn: 'Gas leaks past the rings (blow-by): less compression, less power, oil gets dirty faster.' },
    ] },
  { id: 'pistons', name: 'Pistons and rods', needs: ['rings', 'crank', 'rodShells'], why: 'The piston takes the gas pressure; the rod carries it to the crankshaft.',
    blocked: { rings: 'Rings go on the piston before it goes into the bore — you cannot reach them afterwards.', rodShells: 'Fit the rod bearing shells first, or the rod would run directly on the crank pin.', crank: 'There is no crankshaft yet for the rods to connect to.' } },
  { id: 'rodShells', name: 'Rod bearing shells', needs: ['crank'], why: 'The hardest-working bearings: they carry every combustion push.',
    blocked: { crank: 'Rod bearings wrap the crank pins — fit the crankshaft first.' } },
  { id: 'pump', name: 'Oil pump and pickup', needs: ['crank'], why: 'Driven by the crankshaft; pulls oil from the sump and pushes it to every bearing.',
    blocked: { crank: 'The pump is driven by the crankshaft. Fit the crankshaft first.' } },
  { id: 'sump', name: 'Oil sump', needs: ['pump', 'pistons'], why: 'Closes the bottom of the engine and holds the oil.',
    blocked: { pump: 'Once the sump is on you cannot reach the pump. Fit the pump first.', pistons: 'The rods are fitted from below — do that before closing the sump.' } },
  { id: 'head', name: 'Cylinder head and spark plugs', needs: ['pistons'], why: 'Closes the top of each cylinder; holds valves and spark plugs.',
    blocked: { pistons: 'Fit the pistons first — the head closes the cylinders over them.' } },
  { id: 'oil', name: 'Fill with oil', needs: ['sump'], why: 'Nothing above works without it.',
    blocked: { sump: 'There is nothing to hold the oil yet. Fit the sump first.' },
    options: [
      { id: 'std', name: 'Correct (3.5 L)', litres: 3.5 },
      { id: 'low', name: 'Low (2.0 L)', litres: 2.0, warn: 'Low oil: in hard corners or braking the pickup can suck air, and the oil runs hotter.' },
      { id: 'over', name: 'Overfilled (5.0 L)', litres: 5.0, warn: 'Overfilled: the crankshaft whips the oil into foam, which pumps badly and adds drag.' },
    ] },
];

export const emptyBuild = () => ({ fitted: [], log: [] });
export const complete = () => ({ fitted: PARTS.map(p => ({ id: p.id, option: p.options ? p.options[0].id : null })), log: [] });
export const has = (b, id) => b.fitted.some(f => f.id === id);
export const option = (b, id) => { const f = b.fitted.find(x => x.id === id); const p = PARTS.find(x => x.id === id); return f && p.options ? p.options.find(o => o.id === f.option) : null; };
export const isComplete = b => PARTS.every(p => has(b, p.id));

export function fit(b, id, optionId) {
  const part = PARTS.find(p => p.id === id);
  if (has(b, id)) return { ok: false, build: b, message: `${part.name} already fitted.` };
  const missing = part.needs.find(n => !has(b, n));
  if (missing) return { ok: false, build: { ...b, log: [...b.log, { id, ok: false }] }, message: part.blocked[missing] };
  const opt = part.options ? part.options.find(o => o.id === optionId) || part.options[0] : null;
  const build = { fitted: [...b.fitted, { id, option: opt ? opt.id : null }], log: [...b.log, { id, ok: true }] };
  return { ok: true, build, message: `${part.name} fitted${opt ? `: ${opt.name.toLowerCase()}` : ''}. ${part.why}`, warn: opt?.warn };
}

// Removing a part also removes everything that depends on it (you cannot take out the crank with pistons on it).
export function remove(b, id) {
  const drop = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const p of PARTS) if (!drop.has(p.id) && p.needs.some(n => drop.has(n)) && has(b, p.id)) { drop.add(p.id); grew = true; } }
  return { ...b, fitted: b.fitted.filter(f => !drop.has(f.id)) };
}

// What the build means for the physics.
export function buildEffects(b) {
  const shells = option(b, 'mainShells'), rings = option(b, 'rings'), fill = option(b, 'oil');
  return {
    clearance: shells ? shells.clearance : 25e-6,
    ringGap: rings ? rings.gap : 'ok',
    oilLitres: fill ? fill.litres : 3.5,
    compressionFactor: rings?.gap === 'large' ? 0.9 : 1,      // blow-by: ~10 % less indicated work (assumption)
    frictionFactor: (fill?.litres > 4 ? 1.08 : 1) * (rings?.gap === 'small' ? 1.05 : 1), // oil churning, ring drag (assumption)
    warnings: PARTS.map(p => option(b, p.id)?.warn).filter(Boolean),
  };
}
