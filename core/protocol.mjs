// Learning protocol shared by guided cases: a prediction recorded — and locked — before the result is known,
// scored afterwards; feedback that must be given before the next case unlocks; answers checked with explanations.
// It stores no runs and no results: saved evidence lives in the shared project record (core/project.mjs).
export class Protocol {
  constructor() { this.predictions = new Map(); this.feedback = new Set(); }
  predict(id, value) {
    const p = this.predictions.get(id);
    if (p?.locked) throw new Error(`Prediction "${id}" is locked: the result is already being produced.`);
    this.predictions.set(id, { value, locked: false });
  }
  retract(id) { this.predictions.delete(id); }            // withdraw so the step can be redone
  hasPrediction(id) { return this.predictions.has(id); }
  prediction(id) { return this.predictions.get(id)?.value ?? null; }
  isLocked(id) { return !!this.predictions.get(id)?.locked; }
  lock(id) { const p = this.predictions.get(id); if (!p) throw new Error(`No prediction recorded for "${id}".`); p.locked = true; }
  score(id, actual) {
    const p = this.predictions.get(id);
    if (!p?.locked) throw new Error(`Prediction "${id}" was not locked before the result.`);
    return { predicted: p.value, actual, correct: p.value === actual };
  }
  giveFeedback(caseId) { this.feedback.add(caseId); }
  canAdvance(caseId) { return this.feedback.has(caseId); }
}
// Check a learner's answers against what the runs support; every answer gets an explanation.
export function checkAnswers(answers, truths) {
  const items = Object.entries(truths).map(([id, t]) => ({ id, given: answers[id] ?? null, expected: t.expected, ok: answers[id] === t.expected, explain: t.explain }));
  return { complete: items.every(i => i.given !== null), allCorrect: items.every(i => i.ok), items };
}
