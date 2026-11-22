// Learner ledger: local and pseudonymous evidence of what a learner did, per competency. No content and no physics.
// Event semantics follow the school engine (premsethutmc/openpath 62b17d3f, packages/learning/src/evidence.ts) so the
// two can be synced later:
//   evidence            a first, unaided answer to a fresh item              (counts towards what was shown alone)
//   assisted_response   an answer given after a hint, a shown solution or feedback on that item
//   hint                one solution step revealed                            (help; carries no result)
//   shown_solution      the whole worked solution revealed                    (help; carries no result)
// provenance: diagnostic | practice | check | retention.   result: correct | incorrect | unresolved.
// An unresolved answer (unreadable, ambiguous, no unit or a unit of another kind) earns no credit, costs nothing and
// is not counted. Derived status is what the records show, never a mastery claim.
//
// Answer keys. Number: { kind: 'number', value, unit, tol } where tol is RELATIVE (0.02 = ±2 % of value; a value of
// 0 is matched within ±tol absolute). Choice: { kind: 'choice', options: [text…], correct: index | text }.
export const FORMAT = 'openpath.ledger', VERSION = 1;
export const KINDS = ['evidence', 'assisted_response', 'hint', 'shown_solution'];
export const PROVENANCE = ['diagnostic', 'practice', 'check', 'retention'];
export const RESULTS = ['correct', 'incorrect', 'unresolved'];
export const STATUSES = ['not-seen', 'not-yet', 'helped', 'independent-after-help', 'independent'];
export class LedgerError extends Error {}

// ---------- units: a value in a known unit converts to the key's unit; an unknown unit must match exactly ----------
const DIM = {};
const unit = (dim, f, ...names) => names.forEach(n => { DIM[norm(n)] = [dim, f]; });
export function norm(u) {
  return String(u ?? '').trim()
    .replace(/[²]/g, '2').replace(/[³]/g, '3').replace(/[⁴]/g, '4').replace(/\^/g, '')
    .replace(/μ/g, 'µ').replace(/\s*([·*.⋅×-]|\s)\s*/g, '·').replace(/·*\/·*/g, '/');
}
unit('L', 1e-3, 'mm'); unit('L', 1e-2, 'cm'); unit('L', 1, 'm'); unit('L', 1e3, 'km');
unit('F', 1, 'N'); unit('F', 1e3, 'kN'); unit('F', 1e6, 'MN');
unit('FL', 1, 'N·m', 'Nm'); unit('FL', 1e-3, 'N·mm', 'Nmm'); unit('FL', 1e3, 'kN·m', 'kNm'); unit('FL', 1, 'J'); unit('FL', 1e3, 'kJ');
unit('P', 1, 'Pa', 'N/m2'); unit('P', 1e3, 'kPa'); unit('P', 1e6, 'MPa', 'N/mm2'); unit('P', 1e9, 'GPa'); unit('P', 1e5, 'bar');
unit('M', 1, 'kg'); unit('M', 1e-3, 'g'); unit('M', 1e3, 't');
unit('W', 1, 'W'); unit('W', 1e3, 'kW'); unit('W', 1e6, 'MW');
unit('T', 1, 's'); unit('T', 60, 'min'); unit('T', 3600, 'h');
unit('V', 1, 'm/s'); unit('Q', 1, 'm3/s'); unit('Q', 1e-3, 'L/s', 'l/s'); unit('Q', 1e-3 / 60, 'L/min', 'l/min'); unit('Q', 1 / 3600, 'm3/h');
unit('A', 1e-6, 'mm2'); unit('A', 1, 'm2'); unit('I', 1e-12, 'mm4'); unit('I', 1, 'm4'); unit('D', 1, 'kg/m3');
unit('e', 1e-6, 'µε', 'microstrain'); unit('ang', 1, 'deg', '°'); unit('ang', 180 / Math.PI, 'rad');
unit('n', 1, 'rpm', 'rev/min'); unit('%', 1, '%');

const NUM = /^([-+−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/;
// Read a typed number with its unit. → { value, unit } | { unresolved: reason }
export function readNumber(text) {
  const s = String(text ?? '').trim();
  if (!s) return { unresolved: 'no answer' };
  if (/\d,\d/.test(s)) return { unresolved: 'write the number without commas (2500, or 2.5 for a decimal)' };
  const m = s.match(NUM);
  if (!m) return { unresolved: 'start with a number' };
  const value = Number(m[1].replace('−', '-'));
  if (!Number.isFinite(value)) return { unresolved: 'not a number' };
  if (/\d/.test(m[2])) return { unresolved: 'more than one number' };
  return { value, unit: m[2].trim() };
}
// Convert a value in unit `from` to unit `to`. → number | null (different kinds of quantity, or an unknown unit)
export function convert(value, from, to) {
  const a = norm(from), b = norm(to);
  if (a === b) return value;
  const A = DIM[a], B = DIM[b];
  if (!A || !B || A[0] !== B[0]) return null;
  return value * A[1] / B[1];
}
export const within = (value, truth, tol = 0) => Math.abs(value - truth) <= (truth === 0 ? tol : tol * Math.abs(truth)) + 1e-12 * Math.max(1, Math.abs(truth));

// Check a number against a key { value, unit, tol }. requireUnit: false lets a bare number count in the key's unit
// (used for predictions and defence answers, where the page shows the unit beside the box).
export function checkNumber(key, response, { requireUnit = true } = {}) {
  const r = typeof response === 'object' && response !== null ? { value: Number(response.value), unit: response.unit ?? '' } : readNumber(response);
  if (r.unresolved) return { result: 'unresolved', reason: r.unresolved };
  if (!Number.isFinite(r.value)) return { result: 'unresolved', reason: 'not a number' };
  const want = key.unit ?? '';
  let u = r.unit;
  if (!u && norm(want) && !requireUnit) u = want;
  if (!u && norm(want)) return { result: 'unresolved', reason: `give the unit too` };
  if (u && !norm(want)) return { result: 'unresolved', reason: 'this answer has no unit' };
  const v = convert(r.value, u, want);
  if (v === null) return { result: 'unresolved', reason: `“${u}” is not a unit for this answer` };
  return { result: within(v, key.value, key.tol ?? 0) ? 'correct' : 'incorrect', value: v, unit: want };
}

// checkResponse(item, response) → { result, value?, misconception?, reason? }
//   number items: response is text ('1250 N·m') or { value, unit }.  choice items: an option index or its exact text.
export function checkResponse(item, response) {
  const a = item?.answer;
  if (!a) throw new LedgerError('item has no answer key');
  if (response && typeof response === 'object' && response.dontKnow) return { result: 'incorrect', dontKnow: true };
  if (a.kind === 'number') {
    const c = checkNumber(a, response);
    if (c.result !== 'incorrect') return c;
    const m = (item.misconceptions || []).find(x => typeof x.value === 'number' && within(c.value, x.value, a.tol ?? 0));
    return m ? { ...c, misconception: m.id } : c;
  }
  if (a.kind === 'choice') {
    const idx = typeof response === 'number' ? response : typeof response === 'string' && /^\d+$/.test(response.trim()) ? +response : a.options.indexOf(response);
    if (!Number.isInteger(idx) || idx < 0 || idx >= a.options.length) return { result: 'unresolved', reason: 'pick one of the options' };
    const correct = typeof a.correct === 'number' ? a.correct : a.options.indexOf(a.correct);
    if (idx === correct) return { result: 'correct', value: idx };
    const m = (item.misconceptions || []).find(x => x.option === idx || x.option === a.options[idx]);
    return { result: 'incorrect', value: idx, ...(m ? { misconception: m.id } : {}) };
  }
  throw new LedgerError(`unknown answer kind ${a.kind}`);
}

// ---------- derived status (pure) ----------
const HELP = new Set(['hint', 'shown_solution', 'assisted_response']);
// statusOf(events, competency) → { status, basis, unaided: { right, total }, practice: { right, total }, assisted: { right, total }, help, delayed }
// Only a FRESH UNAIDED item on this exact competency can show what the learner does alone: an 'evidence' event with
// provenance diagnostic, check or retention. Teach practice is always help (assisted_response); an unaided answer in
// practice (the apply phase) is counted in `practice` and never decides the status.
//   not-seen                no resolved event          not-yet   answered alone, no help, latest fresh answer wrong
//   helped                  help received, and the latest fresh unaided answer since the latest help (if any) is wrong
//   independent-after-help  the latest fresh unaided answer after the latest help is right
//   independent             latest fresh unaided answer right, never helped on this competency
// basis: the fresh unaided answer the status rests on, { provenance, result } (null when none: not-seen, or helped with
// no fresh answer since the help). delayed: the latest retention check ('none' | 'passed' | 'failed'); it strengthens
// the evidence and is never "mastered".
export const FRESH = new Set(['diagnostic', 'check', 'retention']);
const isFresh = e => e.kind === 'evidence' && FRESH.has(e.provenance);
export function statusOf(events, competency) {
  const mine = events.filter(e => e.competency === competency && e.result !== 'unresolved');
  const unaided = mine.filter(isFresh), practice = mine.filter(e => e.kind === 'evidence' && !FRESH.has(e.provenance)), assisted = mine.filter(e => e.kind === 'assisted_response');
  const lastHelp = mine.reduce((i, e, k) => (HELP.has(e.kind) ? k : i), -1);
  const ret = unaided.filter(e => e.provenance === 'retention').at(-1);
  const count = list => ({ right: list.filter(e => e.result === 'correct').length, total: list.length });
  const out = { unaided: count(unaided), practice: count(practice), assisted: count(assisted),
    help: mine.filter(e => HELP.has(e.kind)).length, delayed: ret ? (ret.result === 'correct' ? 'passed' : 'failed') : 'none' };
  const basisOf = e => (e ? { provenance: e.provenance, result: e.result } : null);
  let status, basis;
  if (!mine.length) { status = 'not-seen'; basis = null; }
  else if (lastHelp >= 0) { const e = mine.slice(lastHelp + 1).filter(isFresh).at(-1); status = e?.result === 'correct' ? 'independent-after-help' : 'helped'; basis = basisOf(e); }
  else { const e = unaided.at(-1); status = e?.result === 'correct' ? 'independent' : 'not-yet'; basis = basisOf(e); }
  return { status, basis, ...out };
}

// describeStatus(s) → the learner-facing words for a statusOf result. It says where the evidence came from, so a
// prerequisite answered right in the diagnostic never reads like the journey's own unaided check, and help is named as help.
const WHERE = { diagnostic: 'in the diagnostic', check: 'in the check', retention: 'in a later check' };
export function describeStatus(s) {
  const at = s?.basis ? WHERE[s.basis.provenance] ?? '' : '';
  switch (s?.status) {
    case 'independent': return s.basis?.provenance === 'diagnostic' ? 'Answered right in the diagnostic (unaided)' : `Solved on your own ${at}`.trim();
    case 'independent-after-help': return s.basis?.provenance === 'diagnostic' ? 'Practised with help, then answered right in a diagnostic (unaided)' : 'Solved on your own after help';
    case 'helped': return s.basis ? `Practised with help; not yet right on your own ${at}`.trim() : 'Practised with help; no unaided question since';
    case 'not-yet': return s.basis?.provenance === 'diagnostic' ? 'Not right in the diagnostic (unaided)' : 'Not yet on your own';
    case 'not-seen': return 'Not seen yet';
  }
  return String(s?.status ?? '');
}

// ---------- the browser ledger ----------
const KEY = 'openpath.ledger';
const newLearner = () => { const b = new Uint8Array(6); globalThis.crypto.getRandomValues(b); return 'L-' + [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
export function validateEvent(e) {
  if (!e || typeof e !== 'object') throw new LedgerError('not an event');
  for (const k of ['journey', 'competency', 'item']) if (typeof e[k] !== 'string' || !e[k]) throw new LedgerError(`event needs ${k}`);
  if (!KINDS.includes(e.kind)) throw new LedgerError(`unknown kind ${e.kind}`);
  if (!PROVENANCE.includes(e.provenance)) throw new LedgerError(`unknown provenance ${e.provenance}`);
  const help = e.kind === 'hint' || e.kind === 'shown_solution';
  if (help ? e.result !== undefined : !RESULTS.includes(e.result)) throw new LedgerError(help ? 'help events carry no result' : `unknown result ${e.result}`);
  return e;
}

// openLedger(storage?) → { learner, events(), record(event), status(competency), statuses(ids), exportJSON(), importJSON(text) }
export function openLedger(storage = globalThis.localStorage, { now = () => new Date().toISOString() } = {}) {
  const read = () => { try { const d = JSON.parse(storage.getItem(KEY)); if (d?.format === FORMAT && Array.isArray(d.events)) return d; } catch {} return null; };
  let db = read();
  if (!db) { db = { format: FORMAT, version: VERSION, learner: newLearner(), events: [] }; write(); }
  function write() { try { storage.setItem(KEY, JSON.stringify(db)); } catch {} }
  return {
    get learner() { return db.learner; },
    events: () => db.events.map(e => ({ ...e })),
    record(e) {
      const ev = validateEvent({ t: now(), learner: db.learner, ...e });
      for (const k of Object.keys(ev)) if (ev[k] === undefined) delete ev[k];
      db.events.push(ev); write(); return ev;
    },
    status: competency => statusOf(db.events, competency),
    statuses: ids => Object.fromEntries(ids.map(id => [id, statusOf(db.events, id).status])),
    exportJSON: () => JSON.stringify(db, null, 2),
    importJSON(text) {
      let d; try { d = JSON.parse(text); } catch { throw new LedgerError('not a ledger file'); }
      if (d?.format !== FORMAT || d.version !== VERSION || typeof d.learner !== 'string' || !Array.isArray(d.events)) throw new LedgerError('not an OpenPath ledger file (version 1)');
      d.events.forEach(validateEvent);
      db = d; write(); return db.events.length;
    },
    reload() { db = read() ?? db; },
  };
}
