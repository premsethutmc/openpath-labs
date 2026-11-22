// Short diagnostic (diagnostic@1), domain-neutral. A port of the school engine's diagnostic@1:
//   premsethutmc/openpath @ 62b17d3f, packages/learning/src/diagnostic.ts (evidence semantics from evidence.ts and
//   misconception-evidence.ts). Changes from the source, all on purpose:
//   • Questions are (competency, aspect) pairs answered on freshly generated items, not fixed question ids.
//   • Hypotheses: secure (kept from the source, so a learner who knows it is not forced into a gap), concept,
//     procedure, recall, transfer, prerequisite and misconception. In the source a written misconception points to one
//     of the other hypotheses; here items name misconceptions without a hypothesis, so a matching wrong answer weighs
//     towards "misconception" instead.
//   • Prerequisite: a wrong answer on the target is never evidence of a missing prerequisite. Target answers leave the
//     prerequisite hypothesis's share exactly where it was; it only moves on answers to prerequisite items, and only a
//     wrong prerequisite answer raises it. Prerequisite items are asked only after a target answer was wrong.
//   Questions are chosen by expected information gain; the diagnosis stops when one hypothesis reaches stopAt, or
//   after maxQuestions (or when nothing is left to ask), with "insufficient-evidence" if none is confidently ahead.
//   Only first, unaided, resolved answers count. Likelihoods are draft values for review, not calibrated estimates.
export const HYPOTHESES = ['secure', 'concept', 'procedure', 'recall', 'transfer', 'prerequisite', 'misconception'];
export const POLICY = {
  version: 'diagnostic@1-labs',
  prior: { secure: 0.35, concept: 0.13, procedure: 0.13, recall: 0.12, transfer: 0.1, prerequisite: 0.1, misconception: 0.07 },
  confident: 0.6, stopAt: 0.75, maxQuestions: 3, misconceptionWeight: 3,
  untaggedUnderMisconception: 0.5,              // a wrong answer that matches no written misconception is less typical of one
  prerequisiteRight: { prerequisite: 0.2, other: 0.85 },
};
// P(right | hypothesis), by the aspect the item probes (source table; misconception row added).
const RIGHT = {
  concept: { secure: 0.9, concept: 0.15, procedure: 0.6, recall: 0.6, transfer: 0.8, misconception: 0.25 },
  procedure: { secure: 0.9, concept: 0.3, procedure: 0.15, recall: 0.5, transfer: 0.8, misconception: 0.4 },
  recall: { secure: 0.9, concept: 0.3, procedure: 0.5, recall: 0.15, transfer: 0.8, misconception: 0.6 },
  transfer: { secure: 0.85, concept: 0.2, procedure: 0.3, recall: 0.4, transfer: 0.15, misconception: 0.3 },
};
export const DIAGNOSIS_TEXT = {
  secure: 'You seem to know this already. One check on your own, then back to your design.',
  concept: 'We start with what it means, on a bench you can move.',
  procedure: 'We go through the method step by step.',
  recall: 'We rebuild the fact this uses from what you already know.',
  transfer: 'You can do it in the familiar form; the new kind of problem needs practice of its own.',
  prerequisite: 'We check a skill this builds on first, then come back.',
  misconception: 'One of your answers matches a known mix-up. We look at why it goes wrong.',
  'insufficient-evidence': 'Not enough to tell yet. We start gently and see how it goes.',
};

const normalise = p => { const t = HYPOTHESES.reduce((s, h) => s + p[h], 0); return Object.fromEntries(HYPOTHESES.map(h => [h, p[h] / t])); };
const entropy = p => -HYPOTHESES.reduce((s, h) => s + (p[h] > 0 ? p[h] * Math.log2(p[h]) : 0), 0);
// likelihood of one answer under each hypothesis
function likelihood(p, q, right, tagged, target) {
  const L = {};
  if (q.competency !== target) {
    const pr = POLICY.prerequisiteRight;
    for (const h of HYPOTHESES) { const r = h === 'prerequisite' ? pr.prerequisite : pr.other; L[h] = right ? r : 1 - r; }
    return L;
  }
  const table = RIGHT[q.aspect] ?? RIGHT.procedure;
  for (const h of HYPOTHESES) if (h !== 'prerequisite') {
    L[h] = right ? table[h] : 1 - table[h];
    if (!right && h === 'misconception') L[h] *= tagged ? POLICY.misconceptionWeight : POLICY.untaggedUnderMisconception;
  }
  // neutral for the prerequisite hypothesis: its share of the posterior does not move on a target answer
  const others = HYPOTHESES.filter(h => h !== 'prerequisite'), mass = others.reduce((s, h) => s + p[h], 0);
  L.prerequisite = others.reduce((s, h) => s + p[h] * L[h], 0) / mass;
  return L;
}
const update = (p, q, right, tagged, target) => { const L = likelihood(p, q, right, tagged, target); return normalise(Object.fromEntries(HYPOTHESES.map(h => [h, p[h] * L[h]]))); };
function expectedEntropy(p, q, target) {
  const Lr = likelihood(p, q, true, false, target), pRight = HYPOTHESES.reduce((s, h) => s + p[h] * Lr[h], 0);
  return pRight * entropy(update(p, q, true, false, target)) + (1 - pRight) * entropy(update(p, q, false, false, target));
}
const same = (a, b) => a.competency === b.competency && a.aspect === b.aspect;

// diagnose({ target, candidates, answers }) → Diagnosis
//   target      the competency the block points to
//   candidates  [{ competency, aspect }] that can be asked: the target's aspects, and prerequisites (with an aspect)
//   answers     [{ competency, aspect, result: 'correct'|'incorrect'|'unresolved', misconception?, assisted? }] in order
// Diagnosis: { asked: [{ competency, aspect, right, misconception }], posterior, next: candidate | null,
//              result: hypothesis | 'insufficient-evidence' | null, confidence, gaps: [prerequisite ids answered wrong],
//              misconceptions: [ids], policy }
export function diagnose({ target, candidates, answers = [] }) {
  let p = { ...POLICY.prior };
  const asked = [];
  for (const a of answers) {
    if (a.result === 'unresolved' || a.assisted || !candidates.some(c => same(c, a)) || asked.some(x => same(x, a))) continue;
    const right = a.result === 'correct';
    p = update(p, a, right, !right && !!a.misconception, target);
    asked.push({ competency: a.competency, aspect: a.aspect, right, misconception: right ? null : a.misconception ?? null });
  }
  const best = HYPOTHESES.reduce((b, h) => (p[h] > p[b] ? h : b), 'secure');
  const targetMissed = asked.some(x => x.competency === target && !x.right);
  const remaining = candidates.filter(c => !asked.some(x => same(x, c)) && (c.competency === target || targetMissed));
  const done = p[best] >= POLICY.stopAt || asked.length >= POLICY.maxQuestions || remaining.length === 0;
  const next = done ? null : remaining.map((c, i) => ({ c, i, e: expectedEntropy(p, c, target) })).sort((a, b) => a.e - b.e || a.i - b.i)[0].c;
  return {
    asked, posterior: p, next,
    result: !done ? null : p[best] >= POLICY.confident ? best : 'insufficient-evidence',
    confidence: Math.round(p[best] * 100) / 100,
    gaps: [...new Set(asked.filter(x => x.competency !== target && !x.right).map(x => x.competency))],
    misconceptions: [...new Set(asked.map(x => x.misconception).filter(Boolean))],
    policy: POLICY.version,
  };
}
