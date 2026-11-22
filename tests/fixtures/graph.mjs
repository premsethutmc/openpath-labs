// Test fixture: a tiny competency graph for the journey runner tests (not product content).
export const NODES = [
  { id: 'FIX.lever', title: 'Turning effect of a force', requires: ['FIX.product', 'FIX.ratio'], items: 'fix.lever' },
  { id: 'FIX.product', title: 'Multiplying quantities', requires: [], items: 'fix.product', school: true, learnUrl: null },
  { id: 'FIX.ratio', title: 'Ratios', requires: [], items: 'fix.ratio', school: true, learnUrl: null },
];
