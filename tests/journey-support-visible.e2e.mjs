// Journey 1, "The support that holds", played like a learner: only visible controls are used and only visible text is
// read. Nothing here reads window.__journey, imports an item generator or answer key, writes storage or calls the
// runner. Every answer is worked out by the learner's own hand calculation (tests/support-hand.mjs: statics, simply
// supported beam formulas) from the question's visible text, and checked against what the page and the Mount bench show.
//
// Two different designs that both meet the brief are taken through the whole journey, one on a phone (390 × 844,
// touch) and one on a desktop (1280 × 900); on the bench each learner first tries a design the bench must flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { HANDBOOK, n, hand, meets, close, predict, defend, shownFor, readBrief, learnerPage, playLoop, mountBench } from './support-hand.mjs';

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

      const h = learnerPage(page, { touch: L.vp.hasTouch }), { app, phase, btn, tap, noOverflow, setupShown, scoredRows } = h;

      // ---------- brief: read the task ----------
      await page.goto(`${server.origin}/journeys/journey.html?j=support`);
      await page.locator('body[data-ready="true"]').waitFor();
      assert.equal(await phase(), 'brief');
      const { brief, R1 } = await readBrief(app);
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
      const seen = await playLoop(page, h, { target: 'Moment of a force about a point' });
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
      const bench = mountBench(page, h, brief), { tab } = bench;
      // the bench opens on the learner's own design (R1)
      await tab('design');
      assert.equal(await page.locator(`[data-mat="${R1.material}"]`).getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('[data-shape="rect"]').getAttribute('aria-checked'), 'true');
      await tap(page.getByRole('radio', { name: HANDBOOK[L.material].name }));
      await tap(page.getByRole('radio', { name: L.shape }));
      const design = { material: L.material, shape: L.shapeId, ...L.defaults };
      // the bench's own material data matches the learner's handbook values
      const rigText = await page.locator('#rig').textContent();
      const em = rigText.match(/E (\d+) GPa · yield (\d+) MPa/);
      assert.equal(n(em[1]) * 1000, HANDBOOK[L.material].E); assert.equal(n(em[2]), HANDBOOK[L.material].yield);

      // first idea: flagged by the bench
      await bench.setDesign({ ...design, ...L.invalid }); Object.assign(design, L.invalid);
      const bad = await bench.read({ ...design });
      assert.equal(meets(bad.h), false); assert.equal(bad.verdict[L.why], false, `the bench flags ${L.why}`);
      // the revision: meets every limit, by hand and on the bench
      await bench.setDesign({ ...design, ...L.valid }); Object.assign(design, L.valid);
      const good = await bench.read({ ...design });
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
        const v = defend(prompt, brief, design);
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
      // a prerequisite answered right in the diagnostic is named as that, never as the journey's own unaided check
      const pre = await app.locator('ul.trail li[data-role="prerequisite"]').evaluateAll(ls => ls.map(l => [l.dataset.status, l.querySelector('.st').textContent]));
      assert.ok(pre.length >= 1);
      for (const [st, words] of pre) assert.deepEqual([st, words], ['independent', 'Answered right in the diagnostic (unaided)']);
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
