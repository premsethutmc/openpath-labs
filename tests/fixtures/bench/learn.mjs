// Test fixture: an open bench's LEARN descriptor (docs/OPEN_LOOP.md) on a fixture domain. Not product content.
// The physics is the Mount lab's test stand (READING_ADAPTER) under another domain, so answers are real engine numbers;
// the concepts are the tiny fixture graph (tests/fixtures/graph.mjs, items.mjs).
import { READING_ADAPTER } from '../../../mount/model.mjs';

export const ADAPTER = { domain: 'fixture-stand', title: 'Fixture stand', evaluate: s => READING_ADAPTER.evaluate(s) };
export const MATERIALS = [{ value: 'aluminium', label: 'aluminium' }, { value: 'steel', label: 'steel' }];
export const LEARN = {
  domain: 'fixture-stand', title: 'Fixture stand',
  page: '../tests/fixtures/bench/',
  adapter: async () => ADAPTER,
  content: { graph: [() => import('../graph.mjs')], items: [() => import('../items.mjs')] },
  describe: s => [
    { label: 'Material', value: s.design.material, paths: ['design.material'] },
    { label: 'Section', value: `${s.design.b} mm wide × ${s.design.h} mm deep`, paths: ['design.b', 'design.h'] },
    { label: 'Load', value: s.loaded ? `at ${s.mount} mm` : 'off', paths: ['loaded', 'mount'] },
  ],
  outputs: {
    deflection: { label: 'Dial reading', unit: 'mm', competency: 'FIX.ratio' },
    stress: { label: 'Stress at the gauge', unit: 'MPa', competency: 'FIX.lever' },
    mass: { label: 'Mass', unit: 'kg', competency: 'FIX.product', tol: 0.02 },
  },
  levers: () => [
    { path: 'design.material', label: 'the material', kind: 'option', options: MATERIALS },
    { path: 'design.h', label: 'the depth', kind: 'number', unit: 'mm' },
    { path: 'design.b', label: 'the width', kind: 'number', unit: 'mm' },
  ],
};
