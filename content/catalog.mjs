// Content catalogue: every competency-graph file and item-generator file (docs/JOURNEYS.md, "Files and owners").
// The journey page merges all of them, so a school-maths node defined for one journey is there for every journey.
// A file that is missing or fails to load is skipped (and reported on the page), never fatal.
export const GRAPH = [() => import('./graph/statics.mjs'), () => import('./graph/school-math.mjs'), () => import('./graph/fluids.mjs')];
export const ITEMS = [() => import('./items/statics.mjs'), () => import('./items/school-math.mjs'), () => import('./items/fluids.mjs')];
