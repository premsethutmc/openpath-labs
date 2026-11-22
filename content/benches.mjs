// Bench registry for the open loop (docs/OPEN_LOOP.md): every bench whose learning loop attaches to the student's own
// project. Each loader resolves to a module exporting LEARN. A bench that has not written its learn.mjs yet (or fails
// to load) is skipped, never fatal.
export const BENCHES = [
  () => import('../playground/learn.mjs'),
  () => import('../mount/learn.mjs'),
  () => import('../circuit/learn.mjs'),
  () => import('../machine/learn.mjs'),
  () => import('../thermal/learn.mjs'),
];
