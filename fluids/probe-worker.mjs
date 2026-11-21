// Runs flow experiments for missions off the main thread.
import { probe } from '../engines/fluids/scenes.mjs';
self.onmessage = ({ data }) => {
  const runs = data.runs.map(([scene, Re, opts]) => probe(scene, Re, opts || {}));
  self.postMessage({ id: data.id, results: runs });
};
