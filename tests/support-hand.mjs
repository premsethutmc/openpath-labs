// Shared by the Journey 1 browser tests that play like a learner (tests/journey-support-visible.e2e.mjs,
// tests/journey-r2-bench.e2e.mjs). Only visible controls are used and only visible text is read: nothing here reads
// window.__journey, imports an item generator or answer key, writes storage or calls the runner. Every answer is the
// learner's own hand calculation (statics, simply supported beam formulas) from the question's visible text.
import assert from 'node:assert/strict';

// ---------- the learner's own hand calculations ----------
// Handbook values the learner brings (checked against the bench's own visible E and yield).
export const HANDBOOK = { steel: { E: 200000, yield: 250, rho: 7850, name: 'Structural steel', short: 'Steel' }, aluminium: { E: 69000, yield: 276, rho: 2700, name: 'Aluminium 6061-T6', short: 'Aluminium' } };
const rad = d => d * Math.PI / 180;
export const n = s => parseFloat(String(s).replace(/,/g, ''));   // a shown number, with any unit after it
export function sectionOf(d) {   // A mm², I mm⁴ (bending about the horizontal axis), c mm
  if (d.shape === 'rect') return { A: d.b * d.h, I: d.b * d.h ** 3 / 12, c: d.h / 2 };
  if (d.shape === 'rhs') { const bi = d.b - 2 * d.t, hi = d.h - 2 * d.t; return { A: d.b * d.h - bi * hi, I: (d.b * d.h ** 3 - bi * hi ** 3) / 12, c: d.h / 2 }; }
  const hw = d.h - 2 * d.tf;   // I-section: two flanges b × tf and a web tw × (h − 2 tf)
  return { A: 2 * d.b * d.tf + d.tw * hw, I: (d.b * d.h ** 3 - (d.b - d.tw) * hw ** 3) / 12, c: d.h / 2 };
}
// Simply supported span L, point load P at a from the left bolt (pin–roller). N, mm.
const beam = (P, L, a) => ({ RA: P * (L - a) / L, RB: P * a / L, Mmax: P * a * (L - a) / L, peakAt: a });
const deflUnder = (P, L, a, EI) => P * a * a * (L - a) ** 2 / (3 * EI * L);            // δ under the load
export const hand = (brief, d, a = brief.mount) => {
  const m = HANDBOOK[d.material], s = sectionOf(d), bm = beam(brief.P, brief.L, a);
  const defl = deflUnder(brief.P, brief.L, a, m.E * s.I), stress = bm.Mmax * s.c / s.I, mass = m.rho * s.A * 1e-9 * brief.L;
  return { ...bm, ...s, defl, stress, mass, allow: m.yield / brief.factor,
    ok: { defl: defl <= brief.tol, stress: stress <= m.yield / brief.factor, mass: mass <= brief.massLimit, envelope: d.b <= brief.env.b && d.h <= brief.env.h,
      walls: d.shape === 'rect' || (d.shape === 'rhs' ? d.t >= 3 : d.tw >= 3 && d.tf >= 3) } };
};
export const meets = h => Object.values(h.ok).every(Boolean);
export const close = (a, b, rel = 0.005, abs = 0) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

// An item, solved from its visible prompt (and options). Returns { text } for a number or { option } for a choice.
export function solve(prompt, options) {
  let m;
  const pick = re => { const i = options.findIndex(o => re.test(o)); assert.ok(i >= 0, `no option ${re} in ${JSON.stringify(options)}`); return { option: i }; };
  if (options.length) {
    if (/line of action passes straight through the bolt/.test(prompt)) return pick(/^Zero$/);
    if (/slid along its own line of action/.test(prompt)) return pick(/stays the same/);
    if (/moved twice as far from the wall/.test(prompt)) return pick(/doubles/);
    if (/not at right angles to it\. Which distance/.test(prompt)) return pick(/perpendicular distance from O to the force’s line of action/);
    assert.fail(`this learner cannot answer: ${prompt}`);
  }
  if ((m = prompt.match(/bracket sticks out ([\d,]+) mm from a wall at O\. At its tip a cable pulls with ([\d,]+) N, downwards and outwards at (\d+)° to the bracket/))) {
    const [L, F, th] = [n(m[1]), n(m[2]), n(m[3])];   // lever arm = L sin θ
    return { text: `${(F * L * Math.sin(rad(th)) / 1000).toFixed(4)} N·m` };
  }
  if ((m = prompt.match(/fixed at O\. ([\d,]+) N pushes down on it (\d+) mm from O, and ([\d,]+) N pushes up (\d+) mm from O/))) {
    const [F1, x1, F2, x2] = m.slice(1).map(n);   // opposite senses
    return { text: `${(Math.abs(F1 * x1 - F2 * x2) / 1000).toFixed(4)} N·m` };
  }
  if ((m = prompt.match(/mast is ([\d.]+) m tall\. A (\d+) kg load hangs from the arm ([\d.]+) m out from the mast.*g = ([\d.]+)/))) {
    const [, mass, x, g] = m.slice(1).map(n);   // the weight's line of action is x from the mast, whatever the height
    return { text: `${(mass * g * x / 1000).toFixed(5)} kN·m` };
  }
  if ((m = prompt.match(/leaves point A at (\d+)° to a rod\. Point B is on the rod, (\d+) mm from A/))) return { text: `${(n(m[2]) * Math.sin(rad(n(m[1])))).toFixed(3)} mm` };
  if ((m = prompt.match(/spanner handle is (\d+) mm long .*You pull at (\d+)° to the handle/))) return { text: `${(n(m[1]) * Math.sin(rad(n(m[2])))).toFixed(3)} mm` };
  if ((m = prompt.match(/crane arm sticks out ([\d,]+) mm from the mast\. A tie rod runs from the arm’s tip up to the mast, ([\d,]+) mm above the arm/))) {
    const [L, h] = [n(m[1]), n(m[2])]; return { text: `${(L * h / Math.hypot(L, h)).toFixed(3)} mm` };
  }
  if ((m = prompt.match(/with ([\d,]+) N at (\d+)° (?:above the horizontal|to the horizontal arm)\. What is its (vertical|horizontal) component/))) {
    const [F, th] = [n(m[1]), n(m[2])]; return { text: `${(m[3] === 'vertical' ? F * Math.sin(rad(th)) : F * Math.cos(rad(th))).toFixed(3)} N` };
  }
  assert.fail(`this learner cannot answer: ${prompt}`);
}

// A prediction box, from its visible prompt, for a design at mount position a.
export function predict(prompt, brief, d, a) {
  const at = Number(prompt.match(/(?:at|to|machine) (\d+) mm/)?.[1] ?? a), h = hand(brief, d, at);
  if (/left bolt carry/.test(prompt)) return h.RA;
  if (/right bolt/.test(prompt)) return h.RB;
  if (/how far from the left bolt is the bending moment largest/.test(prompt)) return h.peakAt;
  if (/largest bending moment/.test(prompt)) return h.Mmax / 1000;
  if (/dial gauge read/.test(prompt)) return h.defl;
  assert.fail(`cannot predict: ${prompt}`);
}
// A "what if" defence question, from its visible prompt, answered by hand for design d (the design being defended).
export function defend(prompt, brief, d) {
  let m;
  if ((m = prompt.match(/machine is moved 100 mm, to (\d+) mm from the left bolt/))) return hand(brief, d, n(m[1])).defl;
  if ((m = prompt.match(/remade in (steel|aluminium), same section/))) return hand(brief, { ...d, material: m[1] }).defl;
  if ((m = prompt.match(/(deeper|shallower) \(h = (\d+) mm\).*What stress/))) return hand(brief, { ...d, h: n(m[2]) }).stress;
  assert.fail(`cannot defend: ${prompt}`);
}

// What the journey page shows for a design, in words (spec.describe), written out independently here.
const NAME = { steel: 'Structural steel', aluminium: 'Aluminium 6061-T6' }, SEC = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
export const shownFor = (d, mount) => ({ Material: NAME[d.material],
  Section: `${SEC[d.shape]}, ${d.b} × ${d.h} mm${d.shape === 'rhs' ? `, wall ${d.t} mm` : d.shape === 'I' ? `, web ${d.tw} mm, flanges ${d.tf} mm` : ''}`,
  'Machine at': `${mount} mm from the left bolt`, 'Operating load': 'on', Gauges: `dial at ${mount} mm, strain gauge at ${mount} mm` });
// The bench's visible names for a material and a section shape, and its dimension sliders.
export const SHAPE_NAME = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
export const DIM_LABEL = { b: /^(Flange width b|Width b)/, h: /^Depth h/, t: /^Wall t/, tw: /^Web tw/, tf: /^Flange tf/ };

// Read the brief from its visible text.
export async function readBrief(app) {
  const briefText = await app.locator('.card .lead').first().innerText();
  const bm = briefText.match(/A ([\d,]+) N machine must sit on a support bolted (\d+) mm apart, inside a (\d+) × (\d+) mm envelope\. Under the machine the support may deflect at most ([\d.]+) mm, its stress must stay at or below yield ÷ (\d+), and it may weigh at most ([\d.]+) kg\. The existing support is a (\w+) (\d+) × (\d+) mm solid bar, with the machine (\d+) mm from the left bolt/);
  assert.ok(bm, briefText);
  const brief = { P: n(bm[1]), L: n(bm[2]), env: { b: n(bm[3]), h: n(bm[4]) }, tol: n(bm[5]), factor: n(bm[6]), massLimit: n(bm[7]), mount: n(bm[11]) };
  return { brief, R1: { material: bm[8], shape: 'rect', b: n(bm[9]), h: n(bm[10]) } };
}

// Browser helpers for one learner page. touch: tap instead of click.
export function learnerPage(page, { touch = false } = {}) {
  const app = page.locator('#app');
  const h = {
    app,
    phase: () => page.locator('body').getAttribute('data-phase'),
    btn: name => app.getByRole('button', { name, exact: true }),
    tap: async loc => { await loc.scrollIntoViewIfNeeded(); await (touch ? loc.tap() : loc.click()); },
    noOverflow: async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`),
    setupShown: async (scope = app) => Object.fromEntries(await scope.locator('dl.setup').first().evaluate(dl => [...dl.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]))),
    scoredRows: async caption => app.locator('table.scored', { has: page.locator('caption', { hasText: caption }) }).locator('tbody tr').evaluateAll(trs => trs.map(tr => ({ prompt: tr.cells[0].textContent, you: tr.cells[1].textContent, engine: tr.cells[2].textContent, result: tr.cells[3].textContent }))),
  };
  h.has = async name => (await h.btn(name).count()) > 0 && await h.btn(name).first().isEnabled();
  return h;
}

// Diagnose → teach → apply → check, answering what is shown. The journey's own skill (`target`, its visible title) is
// honestly not known in the diagnostic. prereqDontKnow: also "I don't know" for the first prerequisite asked (so the
// diagnosis names it as a gap and teaches it). help: 'first' (help on the first practice question only) or
// 'prereq' (help on the first practice question of each prerequisite taught, none on the target).
// solver: the learner's hand solver (default: this file's Journey 1 learner; the open solids loop passes its own).
export async function playLoop(page, h, { target, prereqDontKnow = false, help = 'first', solver = solve }) {
  const { app, phase, btn, has, tap, noOverflow } = h;
  const card = () => app.locator('.card.item');
  const answerShown = async () => {
    const prompt = await card().locator('p.lead').innerText(), options = await card().locator('fieldset.options label').allInnerTexts();
    const s = solver(prompt, options.map(o => o.trim()));
    if ('option' in s) await tap(card().locator('input[name="opt"]').nth(s.option)); else await card().locator('#answer').fill(s.text);
    await tap(btn('Check'));
    return prompt;
  };
  const seen = { diagnose: 0, practice: 0, hint: 0, shown: 0, apply: 0, check: 0, dontKnow: [], helpedOn: [], found: null };
  let lessonTitle = null, helpedThis = new Set();
  for (let guard = 0; guard < 60; guard++) {
    const ph = await phase();
    await noOverflow(ph);
    if (ph === 'diagnose') {
      if (await card().count() === 0) { seen.found = await app.innerText(); assert.match(seen.found, /What we found/); await tap(btn('Continue')); continue; }
      if (await has('Check')) {
        seen.diagnose++;
        const title = (await card().locator('.eyebrow').textContent()).trim();   // (innerText would be upper-cased by CSS)
        if (title === target || (prereqDontKnow && !seen.dontKnow.some(t => t !== target))) { seen.dontKnow.push(title); await tap(btn('I don’t know')); }
        else { await answerShown(); assert.match(await card().locator('.feedback').innerText(), /^Right/, 'prerequisites are known'); }
      }
      await tap(btn('Next'));
    } else if (ph === 'teach') {
      if (await card().count() === 0) {
        assert.ok(await app.locator('ol.steps li').count() > 0, 'a lesson has steps');
        lessonTitle = (await app.locator('.card h2').first().evaluate(e => e.firstChild.textContent)).trim();
        await tap(btn('Practise')); continue;
      }
      if (await has('Check')) {
        seen.practice++;
        const wantHelp = help === 'first' ? seen.practice === 1 : lessonTitle !== target && !helpedThis.has(lessonTitle);
        if (wantHelp) {   // relevant help on this practice question
          helpedThis.add(lessonTitle); seen.helpedOn.push(lessonTitle);
          if (await has('Hint')) { await tap(btn('Hint')); assert.ok(await card().locator('ol.hints li').count() >= 1); seen.hint++; }
          else { await tap(btn('Show the solution')); assert.ok(await card().locator('ol.solution li').count() >= 1); seen.shown++; }
        }
        await answerShown();
        assert.match(await card().locator('.feedback').innerText(), /^Right/);
      }
      await tap(btn('Next'));
    } else if (ph === 'apply') {
      if (await card().count() === 0) { await tap(btn('Continue to the check')); continue; }
      seen.apply++; await answerShown();
      assert.match(await card().locator('.feedback').innerText(), /^Right/);
      assert.ok(await card().locator('ol.solution li').count() >= 1, 'the worked solution follows the answer');
      await tap(btn('Next'));
    } else if (ph === 'check') {
      if (await card().count() === 0) break;
      assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'the check is unaided');
      seen.check++; await answerShown();
      assert.match(await card().locator('.feedback').innerText(), /^Right/);
      await tap(btn('Next'));
    } else assert.fail(`unexpected phase ${ph}`);
  }
  assert.equal(await phase(), 'check');
  return seen;
}

// The real Mount bench, opened from a journey (?project=current), through its visible controls.
export function mountBench(page, h, brief) {
  const { tap } = h;
  const B = {
    tab: async id => { await tap(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); },
    // the design on the stand, as the Design tab shows it (checked radios and slider outputs)
    shown: async () => {
      await B.tab('design');
      const material = await page.locator('[data-mat][aria-checked="true"]').getAttribute('data-mat'), shape = await page.locator('[data-shape][aria-checked="true"]').getAttribute('data-shape');
      const dims = Object.fromEntries(await page.locator('#dims label.range').evaluateAll(ls => ls.map(l => [l.querySelector('input').dataset.dim, parseFloat(l.querySelector('output').textContent)])));
      return { material, shape, ...dims };
    },
    // every control a learner uses to change and test the design is enabled
    editable: async () => {
      await B.tab('design');
      for (const sel of ['[data-mat]', '[data-shape]', '#dims input']) for (const el of await page.locator(sel).all()) assert.ok(await el.isEnabled(), `${sel} is enabled`);
      await B.tab('stand');
      assert.ok(await page.locator('#take').isEnabled(), 'a reading can be taken'); assert.ok(await page.locator('#load-on').isEnabled());
      await B.tab('design');
    },
    setDesign: async d => {
      await B.tab('design');
      await tap(page.getByRole('radio', { name: HANDBOOK[d.material].name }));
      await tap(page.getByRole('radio', { name: SHAPE_NAME[d.shape] }));
      for (const k of ['b', 'h', 't', 'tw', 'tf']) if (d[k] != null) {
        const lab = page.locator('#dims label.range').filter({ hasText: DIM_LABEL[k] });
        await lab.locator('input').fill(String(d[k]));
        assert.equal(await lab.locator('output').innerText(), `${d[k]} mm`);
      }
    },
    props: async () => {
      const t = await page.locator('#secprops').innerText();
      return { I: n(t.match(/I = ([\d,]+) mm⁴/)[1]), mass: n(t.match(/mass ([\d.]+) kg/)[1]), notAllowed: /Not allowed/.test(t) };
    },
    // one reading of the current design: load on, both gauges at the machine, take it; read it back from Runs
    read: async d => {
      const hd = hand(brief, d), p = await B.props();
      assert.ok(Math.abs(p.I - hd.I) <= 1, `I on the bench ${p.I} vs hand ${hd.I}`);
      assert.ok(Math.abs(p.mass - hd.mass) <= 0.006, `mass on the bench ${p.mass} vs hand ${hd.mass}`);
      assert.equal(p.notAllowed, false);
      await B.tab('stand');
      await tap(page.locator('#load-on'));
      await page.locator('#dial-x').selectOption({ label: `${brief.mount} mm` });
      await page.locator('#strain-x').selectOption({ label: `${brief.mount} mm` });
      const before = await page.locator('#runs tbody tr').count();
      await tap(page.locator('#take'));
      await page.locator('#status', { hasText: `LOADED · ${brief.P / 1000} kN at ${brief.mount} mm` }).waitFor();
      assert.equal(await page.locator('#r-dial').innerText(), `${hd.defl.toFixed(3)} mm @ ${brief.mount}`, 'dial gauge reads the hand deflection');
      const strain = n((await page.locator('#r-strain').innerText()).match(/^(-?[\d.]+) µε/)[1]);
      assert.ok(Math.abs(strain - hd.stress / HANDBOOK[d.material].E * 1e6) <= 1, `strain ${strain} µε`);
      await B.tab('runs');
      const rows = page.locator('#runs tbody tr');
      assert.equal(await rows.count(), before + 1);
      const row = await rows.last().evaluate(tr => [...tr.cells].map(c => ({ text: c.textContent, cls: c.className })));
      // Reading | Dial | Alignment | Strain | σ | ≤ yield ÷ 2 | Mass
      assert.ok(Math.abs(n(row[4].text) - hd.stress) <= 0.051, `σ on the bench ${row[4].text} vs hand ${hd.stress}`);
      const verdict = { defl: row[2].text === 'within', stress: row[5].text === 'OK', mass: row[6].cls === 'ok' };
      assert.equal(row[2].cls, verdict.defl ? 'ok' : 'no'); assert.equal(row[5].cls, verdict.stress ? 'ok' : 'no');
      assert.deepEqual(verdict, { defl: hd.ok.defl, stress: hd.ok.stress, mass: hd.ok.mass }, 'the bench judges the three limits as the hand calculation does');
      await B.tab('design');
      return { name: row[0].text, h: hd, verdict };
    },
  };
  return B;
}
