// Experiment journal shared by the labs (Engine World's Work → power experiment and the Pump House fault lab).
// It holds only what an experiment needs regardless of the physics:
//   • a prediction recorded — and locked — before the result is known;
//   • named runs saved with their inputs and outputs, each with a unit, frozen once saved;
//   • a comparison of two saved runs, quantity by quantity;
//   • feedback that must be given before the next case unlocks.
// No physics, no rendering, no network.

const freeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && freeze(v)); return Object.freeze(o); };
const qty = (value, unit = '', label = '') => ({ value, unit, label });

export class Journal {
  constructor() { this.predictions = new Map(); this.runs = new Map(); this.feedback = new Set(); }

  // ---- predictions ----
  predict(id, value) {
    const p = this.predictions.get(id);
    if (p?.locked) throw new Error(`Prediction "${id}" is locked: the result is already being produced.`);
    this.predictions.set(id, { value, locked: false, at: Date.now() });
  }
  // withdraw a prediction so the step can be redone (e.g. a run that did not converge)
  retract(id) { this.predictions.delete(id); }
  hasPrediction(id) { return this.predictions.has(id); }
  prediction(id) { return this.predictions.get(id)?.value ?? null; }
  lock(id) {
    const p = this.predictions.get(id);
    if (!p) throw new Error(`No prediction recorded for "${id}".`);
    p.locked = true;
  }
  score(id, actual) {
    const p = this.predictions.get(id);
    if (!p?.locked) throw new Error(`Prediction "${id}" was not locked before the result.`);
    return { predicted: p.value, actual, correct: p.value === actual };
  }

  // ---- named runs: { inputs: { key: { value, unit, label } }, outputs: { … } } ----
  saveRun(name, { inputs = {}, outputs = {}, note = '' }) {
    if (this.runs.has(name)) throw new Error(`A run named "${name}" already exists.`);
    const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' && v !== null && 'value' in v ? qty(v.value, v.unit, v.label || k) : qty(v, '', k)]));
    const run = freeze({ name, inputs: norm(inputs), outputs: norm(outputs), note });
    this.runs.set(name, run);
    return run;
  }
  run(name) { return this.runs.get(name) ?? null; }
  runNames() { return [...this.runs.keys()]; }
  forget(prefix) { for (const k of [...this.runs.keys()]) if (k.startsWith(prefix)) this.runs.delete(k); }

  // ---- feedback before the next case ----
  giveFeedback(caseId) { this.feedback.add(caseId); }
  canAdvance(caseId) { return this.feedback.has(caseId); }
}

// Compare two saved runs quantity by quantity (outputs by default, or inputs). Units must agree.
export function compareRuns(a, b, keys, part = 'outputs') {
  return (keys || Object.keys(a[part])).map(k => {
    const x = a[part][k], y = b[part][k];
    if (!x || !y) throw new Error(`"${k}" is missing from ${!x ? a.name : b.name}.`);
    if (x.unit !== y.unit) throw new Error(`Units differ for "${k}": ${x.unit} vs ${y.unit}.`);
    const delta = y.value - x.value;
    return { key: k, label: x.label, unit: x.unit, a: x.value, b: y.value, delta, rel: x.value ? delta / Math.abs(x.value) : null };
  });
}
// Which inputs differ between two runs (a controlled comparison should change exactly one).
export function changedInputs(a, b) {
  const keys = new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)]);
  return [...keys].filter(k => a.inputs[k]?.value !== b.inputs[k]?.value || a.inputs[k]?.unit !== b.inputs[k]?.unit);
}
// Check a learner's answers against what the runs support; every answer gets an explanation.
export function checkAnswers(answers, truths) {
  const items = Object.entries(truths).map(([id, t]) => ({ id, given: answers[id] ?? null, expected: t.expected, ok: answers[id] === t.expected, explain: t.explain }));
  return { complete: items.every(i => i.given !== null), allCorrect: items.every(i => i.ok), items };
}
