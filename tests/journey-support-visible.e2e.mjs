// Journey 1, "The support that holds", played like a learner: only visible controls are used and only visible text is
// read. Nothing here reads window.__journey, imports an item generator or answer key, writes storage or calls the
// runner. Every answer is worked out by this file's own hand calculation (statics, simply supported beam formulas)
// from the question's visible text, and checked against what the page and the Mount bench show.
//
// Two different designs that both meet the brief are taken through the whole journey, one on a phone (390 × 844,
// touch) and one on a desktop (1280 × 900); on the bench each learner first tries a design the bench must flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

// ---------- the learner's own hand calculations ----------
// Handbook values the learner brings (checked below against the bench's own visible E and yield).
const HANDBOOK = { steel: { E: 200000, yield: 250, rho: 7850, name: 'Structural steel', short: 'Steel' }, aluminium: { E: 69000, yield: 276, rho: 2700, name: 'Aluminium 6061-T6', short: 'Aluminium' } };
const G = 9.81;
const rad = d => d * Math.PI / 180;
const n = s => parseFloat(String(s).replace(/,/g, ''));   // a shown number, with any unit after it
function sectionOf(d) {   // A mm², I mm⁴ (bending about the horizontal axis), c mm
  if (d.shape === 'rect') return { A: d.b * d.h, I: d.b * d.h ** 3 / 12, c: d.h / 2 };
  if (d.shape === 'rhs') { const bi = d.b - 2 * d.t, hi = d.h - 2 * d.t; return { A: d.b * d.h - bi * hi, I: (d.b * d.h ** 3 - bi * hi ** 3) / 12, c: d.h / 2 }; }
  const hw = d.h - 2 * d.tf;   // I-section: two flanges b × tf and a web tw × (h − 2 tf)
  return { A: 2 * d.b * d.tf + d.tw * hw, I: (d.b * d.h ** 3 - (d.b - d.tw) * hw ** 3) / 12, c: d.h / 2 };
}
// Simply supported span L, point load P at a from the left bolt (pin–roller). N, mm.
const beam = (P, L, a) => ({ RA: P * (L - a) / L, RB: P * a / L, Mmax: P * a * (L - a) / L, peakAt: a });
const deflUnder = (P, L, a, EI) => P * a * a * (L - a) ** 2 / (3 * EI * L);            // δ under the load
const hand = (brief, d, a = brief.mount) => {
  const m = HANDBOOK[d.material], s = sectionOf(d), bm = beam(brief.P, brief.L, a);
  const defl = deflUnder(brief.P, brief.L, a, m.E * s.I), stress = bm.Mmax * s.c / s.I, mass = m.rho * s.A * 1e-9 * brief.L;
  return { ...bm, ...s, defl, stress, mass, allow: m.yield / brief.factor,
    ok: { defl: defl <= brief.tol, stress: stress <= m.yield / brief.factor, mass: mass <= brief.massLimit, envelope: d.b <= brief.env.b && d.h <= brief.env.h,
      walls: d.shape === 'rect' || (d.shape === 'rhs' ? d.t >= 3 : d.tw >= 3 && d.tf >= 3) } };
};
const meets = h => Object.values(h.ok).every(Boolean);
const close = (a, b, rel = 0.005, abs = 0) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

// An item, solved from its visible prompt (and options). Returns { text } for a number or { option } for a choice.
function solve(prompt, options) {
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
function predict(prompt, brief, d, a) {
  const at = Number(prompt.match(/(?:at|to|machine) (\d+) mm/)?.[1] ?? a), h = hand(brief, d, at);
  if (/left bolt carry/.test(prompt)) return h.RA;
  if (/right bolt/.test(prompt)) return h.RB;
  if (/how far from the left bolt is the bending moment largest/.test(prompt)) return h.peakAt;
  if (/largest bending moment/.test(prompt)) return h.Mmax / 1000;
  if (/dial gauge read/.test(prompt)) return h.defl;
  assert.fail(`cannot predict: ${prompt}`);
}

// ---------- the two learners ----------
const LEARNERS = [
  { label: 'phone · steel I-section', vp: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    material: 'steel', shape: 'I-section', shapeId: 'I', defaults: { b: 40, h: 60, tw: 3, tf: 4 },
    invalid: { h: 80 }, why: 'mass',                       // steel I 40×80 (tw 3, tf 4): stiff enough, but too heavy
    valid: { h: 70, tf: 3 } },                             // steel I 40×70 (tw 3, tf 3)
  { label: 'desktop · aluminium hollow tube', vp: { viewport: { width: 1280, height: 900 } },
    material: 'aluminium', shape: 'Hollow rectangle', shapeId: 'rhs', defaults: { b: 40, h: 50, t: 3 },
    invalid: { h: 80 }, why: 'defl',                       // aluminium 40×80×3 tube: light, but bends too far
    valid: { b: 45, t: 5 } },                              // aluminium 45×80×5 tube
];
// What the journey page shows beside each part of the design (its visible labels).
const NAME = { steel: 'Structural steel', aluminium: 'Aluminium 6061-T6' }, SEC = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
// what the journey page shows for a design, in words (spec.describe), written out independently here
const shownFor = (d, mount) => ({ Material: NAME[d.material],
  Section: `${SEC[d.shape]}, ${d.b} × ${d.h} mm${d.shape === 'rhs' ? `, wall ${d.t} mm` : d.shape === 'I' ? `, web ${d.tw} mm, flanges ${d.tf} mm` : ''}`,
  'Machine at': `${mount} mm from the left bolt`, 'Operating load': 'on', Gauges: `dial at ${mount} mm, strain gauge at ${mount} mm` });
const SHOWN = { material: 'Material', shape: 'Section (rect solid, rhs hollow, I)', b: 'Width b (mm)', h: 'Depth h (mm)', t: 'Wall t (mm)', tw: 'Web tw (mm)', tf: 'Flange tf (mm)',
  mount: 'Machine position (mm from the left bolt)', loaded: 'Operating load', dialX: 'Dial gauge at (mm)', strainX: 'Strain gauge at (mm)' };
const DIM_LABEL = { b: /^(Flange width b|Width b)/, h: /^Depth h/, t: /^Wall t/, tw: /^Web tw/, tf: /^Flange tf/ };

for (const L of LEARNERS) {
  test(`support journey through visible controls only (${L.label})`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage(L.vp);
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

      const app = page.locator('#app');
      const phase = () => page.locator('body').getAttribute('data-phase');
      const btn = name => app.getByRole('button', { name, exact: true });
      const has = async name => (await btn(name).count()) > 0 && await btn(name).first().isEnabled();
      const tap = async loc => { await loc.scrollIntoViewIfNeeded(); await (L.vp.hasTouch ? loc.tap() : loc.click()); };
      const noOverflow = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`);
      const setupShown = async (scope = app) => Object.fromEntries(await scope.locator('dl.setup').first().evaluate(dl => [...dl.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
      const scoredRows = async caption => app.locator('table.scored', { has: page.locator('caption', { hasText: caption }) }).locator('tbody tr').evaluateAll(trs => trs.map(tr => ({ prompt: tr.cells[0].textContent, you: tr.cells[1].textContent, engine: tr.cells[2].textContent, result: tr.cells[3].textContent })));

      // ---------- brief: read the task ----------
      await page.goto(`${server.origin}/journeys/journey.html?j=support`);
      await page.locator('body[data-ready="true"]').waitFor();
      assert.equal(await phase(), 'brief');
      const briefText = await app.locator('.card .lead').first().innerText();
      const bm = briefText.match(/A ([\d,]+) N machine must sit on a support bolted (\d+) mm apart, inside a (\d+) × (\d+) mm envelope\. Under the machine the support may deflect at most ([\d.]+) mm, its stress must stay at or below yield ÷ (\d+), and it may weigh at most ([\d.]+) kg\. The existing support is a (\w+) (\d+) × (\d+) mm solid bar, with the machine (\d+) mm from the left bolt/);
      assert.ok(bm, briefText);
      const brief = { P: n(bm[1]), L: n(bm[2]), env: { b: n(bm[3]), h: n(bm[4]) }, tol: n(bm[5]), factor: n(bm[6]), massLimit: n(bm[7]), mount: n(bm[11]) };
      const R1 = { material: bm[8], shape: 'rect', b: n(bm[9]), h: n(bm[10]) };
      assert.deepEqual([brief.P, brief.L, brief.env, brief.tol, brief.factor, brief.massLimit], [2500, 600, { b: 50, h: 80 }, 0.15, 2, 2.5]);
      assert.ok(!meets(hand(brief, R1)), 'by hand, the existing support fails the brief');
      await noOverflow('brief');
      await tap(btn('Start · save Revision 1'));

      // ---------- stuck: predictions for R1, one deliberately wrong ----------
      await page.locator('body[data-phase="stuck"]').waitFor();
      const r1Shown = await setupShown();
      assert.deepEqual(r1Shown, shownFor(R1, brief.mount));
      const fields = await app.locator('label.field').all();
      assert.equal(fields.length, 5);
      let wrongPrompt;
      for (const [i, f] of fields.entries()) {
        const prompt = (await f.innerText()).trim();
        let v = predict(prompt, brief, R1, brief.mount);
        if (i === 0) { assert.match(prompt, /left bolt carry/); v = hand(brief, R1).RB; wrongPrompt = prompt; }   // the shares swapped: a real mix-up
        await f.locator('input').fill(String(+v.toFixed(3)));
      }
      await tap(btn('Lock predictions'));
      await tap(btn('Run the bench'));
      const stuckRows = await scoredRows('Your prediction against the engine');
      assert.equal(stuckRows.length, 5);
      for (const r of stuckRows) {
        const truth = predict(r.prompt, brief, R1, brief.mount);
        assert.ok(close(n(r.engine), truth, 0.005, 0.5), `engine ${r.engine} vs hand ${truth} for ${r.prompt}`);
        assert.equal(r.result, wrongPrompt.startsWith(r.prompt) ? 'off' : 'close', r.prompt);
      }
      await noOverflow('stuck');
      await tap(btn('Find what is blocking me'));

      // ---------- diagnose / teach / apply / check: answer what is shown ----------
      await page.locator('body[data-phase="diagnose"]').waitFor();
      const target = 'Moment of a force about a point';
      const card = () => app.locator('.card.item');
      const answerShown = async () => {
        const prompt = await card().locator('p.lead').innerText(), options = await card().locator('fieldset.options label').allInnerTexts();
        const s = solve(prompt, options.map(o => o.trim()));
        if ('option' in s) await tap(card().locator('input[name="opt"]').nth(s.option)); else await card().locator('#answer').fill(s.text);
        await tap(btn('Check'));
        return prompt;
      };
      const seen = { diagnose: 0, practice: 0, hint: 0, shown: 0, apply: 0, check: 0 };
      for (let guard = 0; guard < 40; guard++) {
        const ph = await phase();
        await noOverflow(ph);
        if (ph === 'diagnose') {
          if (await card().count() === 0) { assert.match(await app.innerText(), /What we found/); await tap(btn('Continue')); continue; }
          if (await has('Check')) {
            seen.diagnose++;
            const title = (await card().locator('.eyebrow').textContent()).trim();   // (innerText would be upper-cased by CSS)
            if (title === target) await tap(btn('I don’t know'));       // the block: honestly not known yet
            else { await answerShown(); assert.match(await card().locator('.feedback').innerText(), /^Right/, 'prerequisites are known'); }
          }
          await tap(btn('Next'));
        } else if (ph === 'teach') {
          if (await card().count() === 0) { assert.ok(await app.locator('ol.steps li').count() > 0, 'a lesson has steps'); await tap(btn('Practise')); continue; }
          if (await has('Check')) {
            seen.practice++;
            if (seen.practice === 1) {   // relevant help on the first practice question
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
          seen.check++; await answerShown();
          assert.match(await card().locator('.feedback').innerText(), /^Right/);
          await tap(btn('Next'));
        } else assert.fail(`unexpected phase ${ph}`);
      }
      assert.equal(await phase(), 'check');
      assert.equal((await app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
      assert.ok(seen.diagnose >= 1 && seen.practice >= 1 && seen.hint + seen.shown === 1 && seen.apply === 3 && seen.check === 1, JSON.stringify(seen));
      await tap(btn('Back to my design'));

      // ---------- return: the design as saved, then the real Mount bench ----------
      await page.locator('body[data-phase="return"]').waitFor();
      assert.match(await app.innerText(), /As saved in Revision 1/);
      await tap(app.locator('#bench'));
      await page.waitForURL(/\/mount\/\?project=current$/);
      await page.locator('body[data-stage="free"]').waitFor();
      await noOverflow('bench');
      const mission = page.locator('#mission');
      assert.match(await mission.innerText(), new RegExp(`${brief.P} N at ${brief.mount} mm from the left bolt`));
      const tab = async id => { await tap(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); };
      // the bench opens on the learner's own design (R1)
      await tab('design');
      assert.equal(await page.locator(`[data-mat="${R1.material}"]`).getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('[data-shape="rect"]').getAttribute('aria-checked'), 'true');
      const setDims = async dims => {
        for (const [k, v] of Object.entries(dims)) {
          const lab = page.locator('#dims label.range').filter({ hasText: DIM_LABEL[k] });
          await lab.locator('input').fill(String(v));
          assert.equal(await lab.locator('output').innerText(), `${v} mm`);
        }
      };
      const benchProps = async () => {
        const t = await page.locator('#secprops').innerText();
        return { I: n(t.match(/I = ([\d,]+) mm⁴/)[1]), mass: n(t.match(/mass ([\d.]+) kg/)[1]), notAllowed: /Not allowed/.test(t) };
      };
      await tap(page.getByRole('radio', { name: HANDBOOK[L.material].name }));
      await tap(page.getByRole('radio', { name: L.shape }));
      const design = { material: L.material, shape: L.shapeId, ...L.defaults };
      // the bench's own material data matches the learner's handbook values
      const rigText = await page.locator('#rig').textContent();
      const em = rigText.match(/E (\d+) GPa · yield (\d+) MPa/);
      assert.equal(n(em[1]) * 1000, HANDBOOK[L.material].E); assert.equal(n(em[2]), HANDBOOK[L.material].yield);

      // one reading of the current design: load on, both gauges at the machine, take it; read it back from Runs
      const readDesign = async d => {
        const h = hand(brief, d), p = await benchProps();
        assert.ok(Math.abs(p.I - h.I) <= 1, `I on the bench ${p.I} vs hand ${h.I}`);
        assert.ok(Math.abs(p.mass - h.mass) <= 0.006, `mass on the bench ${p.mass} vs hand ${h.mass}`);
        assert.equal(p.notAllowed, false);
        await tab('stand');
        await tap(page.locator('#load-on'));
        await page.locator('#dial-x').selectOption({ label: `${brief.mount} mm` });
        await page.locator('#strain-x').selectOption({ label: `${brief.mount} mm` });
        const before = await page.locator('#runs tbody tr').count();
        await tap(page.locator('#take'));
        await page.locator('#status', { hasText: `LOADED · ${brief.P / 1000} kN at ${brief.mount} mm` }).waitFor();
        const dial = await page.locator('#r-dial').innerText();
        assert.equal(dial, `${h.defl.toFixed(3)} mm @ ${brief.mount}`, 'dial gauge reads the hand deflection');
        const strain = n((await page.locator('#r-strain').innerText()).match(/^(-?[\d.]+) µε/)[1]);
        assert.ok(Math.abs(strain - h.stress / HANDBOOK[d.material].E * 1e6) <= 1, `strain ${strain} µε`);
        await tab('runs');
        const rows = page.locator('#runs tbody tr');
        assert.equal(await rows.count(), before + 1);
        const row = await rows.last().evaluate(tr => [...tr.cells].map(c => ({ text: c.textContent, cls: c.className })));
        // Reading | Dial | Alignment | Strain | σ | ≤ yield ÷ 2 | Mass
        assert.ok(Math.abs(n(row[4].text) - h.stress) <= 0.051, `σ on the bench ${row[4].text} vs hand ${h.stress}`);
        const verdict = { defl: row[2].text === 'within', stress: row[5].text === 'OK', mass: row[6].cls === 'ok' };
        assert.equal(row[2].cls, verdict.defl ? 'ok' : 'no'); assert.equal(row[5].cls, verdict.stress ? 'ok' : 'no');
        assert.deepEqual(verdict, { defl: h.ok.defl, stress: h.ok.stress, mass: h.ok.mass }, 'the bench judges the three limits as the hand calculation does');
        await tab('design');
        return { name: row[0].text, h, verdict };
      };

      // first idea: flagged by the bench
      await setDims(L.invalid); Object.assign(design, L.invalid);
      const bad = await readDesign({ ...design });
      assert.equal(meets(bad.h), false); assert.equal(bad.verdict[L.why], false, `the bench flags ${L.why}`);
      // the revision: meets every limit, by hand and on the bench
      await setDims(L.valid); Object.assign(design, L.valid);
      const good = await readDesign({ ...design });
      assert.ok(meets(good.h), `by hand the revised design meets the brief: ${JSON.stringify(good.h.ok)}`);
      assert.deepEqual(good.verdict, { defl: true, stress: true, mass: true });
      // every reading is a reproducible run on the project
      await tab('experiments');
      assert.equal(await page.locator('#experiments .badmsg').count(), 0);
      assert.ok(await page.locator('#experiments [data-reproduced="true"]').count() >= 3);
      await tab('mission');
      await noOverflow('bench after readings');
      await tap(page.locator('#back-journey'));

      // ---------- back on the journey: the saved design, also after a reload ----------
      await page.locator('body[data-phase="return"]').waitFor();
      const expectShown = shownFor(design, brief.mount);
      assert.deepEqual(await setupShown(), expectShown);
      const changedLine = (await app.innerText()).match(/Changed since Revision 1: ([^\n]*)\./)?.[1] ?? '';
      assert.equal(changedLine.includes('Material'), design.material !== R1.material, `changed since Revision 1: ${changedLine}`);
      assert.equal(changedLine.includes('Section'), ['shape', 'b', 'h'].some(k => String(design[k]) !== String(R1[k])), `changed since Revision 1: ${changedLine}`);
      await page.reload();
      await page.locator('body[data-phase="return"]').waitFor();
      assert.deepEqual(await setupShown(), expectShown, 'after a reload the exact saved design is shown');
      await noOverflow('return');

      // locked predictions for the revised design, then run
      for (const f of await app.locator('label.field').all()) {
        const prompt = (await f.innerText()).trim();
        await f.locator('input').fill(String(+predict(prompt, brief, design, brief.mount).toPrecision(6)));
      }
      await tap(btn('Lock predictions'));
      await tap(btn('Run the bench'));
      const retRows = await scoredRows('Prediction run');
      assert.equal(retRows.length, 4);
      for (const r of retRows) {
        assert.equal(r.result, 'close', r.prompt);
        assert.ok(close(n(r.engine), predict(r.prompt, brief, design, brief.mount), 0.005, 0.0005), `${r.prompt}: engine ${r.engine}`);
      }
      await tap(app.getByRole('button', { name: /^Save as Revision 2/ }));

      // ---------- decide: cite the runs ----------
      await page.locator('body[data-phase="decide"]').waitFor();
      const runLabels = await app.locator('.checks label').allInnerTexts();
      const cite = runLabels.map(t => t.trim()).filter(t => t.includes(good.name) || /Prediction run/.test(t));
      assert.equal(cite.length, 2, JSON.stringify(runLabels));
      for (const t of cite) await app.locator('.checks label', { hasText: t }).locator('input').check();
      const checked = await app.locator('.checks input:checked').evaluateAll(cs => cs.map(c => c.value));
      assert.ok(checked.length >= 3, 'R2 and the two cited runs');
      const claim = `Revised to ${good.name.split(' · ')[1]}: deflection ${good.h.defl.toFixed(3)} mm ≤ ${brief.tol} mm, stress ${good.h.stress.toFixed(1)} MPa ≤ ${good.h.allow} MPa, mass ${good.h.mass.toFixed(2)} kg ≤ ${brief.massLimit} kg.`;
      await app.locator('#claim').fill(claim);
      await app.locator('#rejected').fill(`${bad.name.split(' · ')[1]}: ${L.why === 'mass' ? 'too heavy' : 'bends too far'}\nThe original ${R1.material} ${R1.b} × ${R1.h} bar: bends too far`);
      await tap(btn('Save the decision'));

      // ---------- defend: the "what if" questions from the learner's own beam calculation ----------
      await page.locator('body[data-phase="defend"]').waitFor();
      const qs = await app.locator('label.field').all();
      assert.ok(qs.length >= 3, 'three what-if questions');
      for (const q of qs) {
        const prompt = (await q.innerText()).trim();
        let m, v;
        if ((m = prompt.match(/machine is moved 100 mm, to (\d+) mm from the left bolt/))) v = hand(brief, design, n(m[1])).defl;
        else if ((m = prompt.match(/remade in (steel|aluminium), same section/))) v = hand(brief, { ...design, material: m[1] }).defl;
        else if ((m = prompt.match(/(deeper|shallower) \(h = (\d+) mm\).*What stress/))) v = hand(brief, { ...design, h: n(m[2]) }).stress;
        else assert.fail(`cannot defend: ${prompt}`);
        await q.locator('input').fill(String(+v.toPrecision(5)));
      }
      await tap(btn('Submit'));

      // ---------- portfolio ----------
      await page.locator('body[data-phase="summary"]').waitFor();
      const text = await app.innerText();
      assert.match(text, /Design Revision 1 → Revision 2/);
      assert.deepEqual(await setupShown(), expectShown, 'R2 is the tested revised design');
      const outRow = async label => app.locator('table.tbl:not(.scored) tbody tr', { has: page.locator('th', { hasText: label }) }).evaluate(tr => [...tr.cells].slice(1).map(c => c.textContent));
      const [d1, d2] = (await outRow('Dial reading')).map(n);
      assert.ok(close(d1, hand(brief, R1).defl, 0.01), `R1 deflection ${d1}`); assert.ok(close(d2, good.h.defl, 0.01), `R2 deflection ${d2}`);
      const [, s2] = (await outRow('Stress from strain')).map(n); assert.ok(close(s2, good.h.stress, 0.01));
      const [, m2] = (await outRow('Support mass')).map(n); assert.ok(close(m2, good.h.mass, 0.01));
      assert.equal((await app.locator('#claim-text').innerText()).trim(), claim);
      const runsLine = await app.locator('#claim-text + p').innerText();
      for (const id of checked) assert.ok(runsLine.includes(id), `decision cites run ${id}`);
      assert.match(runsLine, /Rejected: /);
      const defence = await scoredRows('Defence');
      assert.equal(defence.length, qs.length);
      for (const r of defence) assert.equal(r.result, 'close', r.prompt);
      assert.match(text, /Moment of a force about a point · Solved on your own after help/);
      const runItems = await app.locator('.card', { has: page.locator('h2', { hasText: /^Runs$/ }) }).locator('li').allInnerTexts();
      assert.ok(runItems.length >= 5, runItems.join('\n'));   // R1, two bench readings, the prediction run, R2
      assert.ok(runItems.some(t => t.includes(good.name)) && runItems.some(t => t.includes(bad.name)));
      for (const t of runItems) assert.match(t, /reproduced from its saved setup/);
      assert.equal(await app.locator('.badmsg').count(), 0);
      await noOverflow('summary');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}

test('Mount free bench from a journey: visible way back, reading names never repeat across visits (phone)', async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(`${server.origin}/journeys/journey.html?j=support`);
    await page.locator('body[data-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Start · save Revision 1' }).tap();
    await page.locator('body[data-phase="stuck"]').waitFor();
    const names = [];
    for (let visit = 0; visit < 2; visit++) {
      await page.goto(`${server.origin}/mount/?project=current`);
      await page.locator('body[data-stage="free"]').waitFor();
      await page.locator('#tab-stand').tap();
      await page.locator('#take').tap();
      await page.locator('#tab-experiments').tap();
      names.push(...(await page.locator('#experiments .nb-runs b').allInnerTexts()));
      await page.locator('#tab-mission').tap();
      assert.equal(await page.locator('#back-journey').getAttribute('href'), '../journeys/journey.html?j=support');
    }
    const readings = [...new Set(names.filter(t => t.startsWith('Reading ')))];
    assert.deepEqual(readings.map(t => t.split(' · ')[0]), ['Reading 1', 'Reading 2']);
    await page.locator('#back-journey').tap();
    await page.locator('body[data-phase="stuck"]').waitFor();
  } finally { await browser.close(); server.close(); }
});
