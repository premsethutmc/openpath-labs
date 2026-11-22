// Journey registry: every journey the student page lists. A module that is missing or fails to load is skipped.
export const JOURNEYS = [() => import('./support.mjs'), () => import('./pipe.mjs'), () => import('./stiffness.mjs')];
