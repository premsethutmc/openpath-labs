// Test fixture: item generators for the journey runner tests (formula-keyed, deterministic in seed).
import { rng } from '../../core/rng.mjs';

export const GENERATORS = {
  'fix.lever': {
    competency: 'FIX.lever', aspects: ['concept', 'procedure', 'transfer'],
    make(seed, aspect) {
      const r = rng(seed), F = r.int(2, 9) * 100, d = r.int(2, 8) / 10;
      if (aspect === 'concept') return { prompt: 'Which change doubles the turning effect of a force about a pivot?', answer: { kind: 'choice', options: ['Double the perpendicular distance', 'Halve the force', 'Move the force onto the pivot'], correct: 0 },
        misconceptions: [{ id: 'force-only', option: 1, label: 'Turning effect taken as the force alone' }], solution: ['Turning effect = force × perpendicular distance.', 'Doubling either factor doubles it.'], key: 'formula' };
      if (aspect === 'transfer') { const deg = r.pick([30, 60]), s = d / Math.sin(deg * Math.PI / 180);
        return { prompt: `A ${F} N force acts along a line whose perpendicular distance from the pivot is ${d} m (the slant distance is ${s.toFixed(3)} m). Turning effect about the pivot?`, figure: { kind: 'lever', params: { F, d, deg } },
          answer: { kind: 'number', value: F * d, unit: 'N·m', tol: 0.01 }, misconceptions: [{ id: 'slant', value: F * s, label: 'Slant distance used instead of the perpendicular distance' }],
          solution: ['Use the perpendicular distance, not the slant one.', `M = ${F} × ${d} = ${F * d} N·m`], key: 'formula' }; }
      return { prompt: `A ${F} N force acts ${d} m from a pivot, at right angles to the arm. Turning effect about the pivot?`, figure: { kind: 'lever', params: { F, d, deg: 90 } },
        answer: { kind: 'number', value: F * d, unit: 'N·m', tol: 0.01 }, misconceptions: [{ id: 'divide', value: F / d, label: 'Force divided by distance' }],
        solution: ['M = F × d', `M = ${F} × ${d} = ${F * d} N·m`], key: 'formula' };
    },
  },
  'fix.product': {
    competency: 'FIX.product', aspects: ['procedure'],
    make(seed) { const r = rng(seed), a = r.int(3, 12), b = r.int(3, 12);
      return { prompt: `${a} × ${b} = ?`, answer: { kind: 'number', value: a * b, unit: '', tol: 0 }, misconceptions: [{ id: 'add', value: a + b, label: 'Added instead of multiplied' }], solution: [`${a} × ${b} = ${a * b}`], key: 'formula' }; },
  },
  'fix.ratio': {
    competency: 'FIX.ratio', aspects: ['procedure'],
    make(seed) { const r = rng(seed), b = r.int(2, 9), a = b * r.int(2, 6);
      return { prompt: `${a} ÷ ${b} = ?`, answer: { kind: 'number', value: a / b, unit: '', tol: 0 }, misconceptions: [], solution: [`${a} ÷ ${b} = ${a / b}`], key: 'formula' }; },
  },
};
