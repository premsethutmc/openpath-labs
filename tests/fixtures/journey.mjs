// Test fixture journey: plays on a real bench adapter (the Mount lab's test stand) with the tiny fixture graph and items.
// Not product content: it exists so the runner and the page are exercised end to end without depending on any journey.
const at = x => ({ mount: x, dialX: x, strainX: x });
export default {
  id: 'fixture-bracket', title: 'Fixture: the stiff bracket', semester: 2, course: 'TEST 101',
  bench: { page: '../mount/?project=current', domain: 'mount-stand', adapter: () => import('../../mount/model.mjs').then(m => m.READING_ADAPTER) },
  content: { graph: [() => import('./graph.mjs')], items: [() => import('./items.mjs')] },
  brief: 'A bracket carries a machine 200 mm from the left bolt. Keep the dial reading at the machine within 0.15 mm.',
  anchor: { setup: { design: { material: 'aluminium', shape: 'rect', b: 40, h: 30 }, loaded: true, ...at(200) }, revision: 'Revision 1' },
  stuck: { predictions: [{ id: 'defl', prompt: 'Dial reading at the machine under load', unit: 'mm', tol: 0.1, truth: (s, r) => r.deflection.value }] },
  target: 'FIX.lever',
  teach: {
    'FIX.lever': { explore: { page: '../playground/', preset: 'shelf' }, steps: ['Pick the pivot.', 'Turning effect = force × perpendicular distance.'], items: 'fix.lever' },
    'FIX.product': { steps: ['Multiply the numbers, then the units.'], count: 1 },
  },
  apply: { count: 2, transfer: { page: '../playground/', preset: 'crane', prompt: 'Try the same reasoning on the jib crane.' } },
  check: { count: 1 },
  return: { predictions: [{ id: 'defl', prompt: 'Dial reading at the machine under load', unit: 'mm', tol: 0.1, truth: (s, r) => r.deflection.value },
    { id: 'stress', prompt: 'Stress at the machine', unit: 'MPa', tol: 0.1, truth: (s, r) => r.stress.value }], decision: true },
  defend: setup => [
    { prompt: 'Same section in steel: dial reading at the machine?', change: { design: { material: 'steel' } }, read: 'deflection', tol: 0.05 },
    { prompt: `Machine moved to ${setup.mount + 100} mm: stress there?`, change: at(setup.mount + 100), read: 'Stress from strain (E·ε)', tol: 0.05 },
  ],
  figures: { lever: ({ F, d, deg }) => `<svg viewBox="0 0 200 80" role="img" aria-label="Lever: ${F} N at ${d} m, ${deg}°"><line x1="20" y1="60" x2="180" y2="60" stroke="currentColor" stroke-width="4"/><circle cx="20" cy="60" r="6" fill="currentColor"/><text x="150" y="20" fill="currentColor" font-size="12">${F} N</text></svg>` },
};
