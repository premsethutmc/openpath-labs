// The open loop on the learner's OWN project (docs/OPEN_LOOP.md), on the fixture bench (tests/fixtures/bench/: the
// Mount test stand's physics under the domain 'fixture-stand', the tiny fixture concepts). Played through visible
// controls only: nothing here reads window.__journey, imports an item generator or writes storage. Fixture questions
// are answered by hand from their visible text; predictions and defence answers are computed apart from the page with
// the engine (READING_ADAPTER) for the design the learner built.
// Flow: build a design on the bench → Experiments: Predict and learn → pick two outputs → miss → find the block →
// learn → apply → unaided check → back to their own project on the bench → change it → predict and run → Revision 2 →
// decide → defend → portfolio. Then the journeys list offers that project under "Start from your own design".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { pageKit } from './visible-helpers.mjs';
import { READING_ADAPTER } from '../mount/model.mjs';

const at = design => ({ design: { shape: 'rect', ...design }, loaded: true, mount: 200, dialX: 200, strainX: 200 });
const engine = design => READING_ADAPTER.evaluate(at(design)).outputs;
// a learner's hand answers to the fixture questions, from the visible prompt
function hand(prompt) {
  let m;
  if ((m = prompt.match(/^(\d+) × (\d+) = \?/))) return String(m[1] * m[2]);
  if ((m = prompt.match(/^(\d+) ÷ (\d+) = \?/))) return String(m[1] / m[2]);
  if ((m = prompt.match(/^A (\d+) N force acts (?:along a line whose perpendicular distance from the pivot is )?([\d.]+) m/))) return `${+(m[1] * m[2]).toFixed(6)} N·m`;
  if (/doubles the turning effect/.test(prompt)) return { choice: 'Double the perpendicular distance' };
  throw new Error(`no hand answer for: ${prompt}`);
}

for (const [label, vp, mine, revised] of [
  ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { material: 'aluminium', b: 35, h: 42 }, { material: 'steel', b: 35, h: 48 }],
  ['desktop', { viewport: { width: 1280, height: 900 } }, { material: 'steel', b: 30, h: 36 }, { material: 'steel', b: 45, h: 36 }],
]) {
  test(`open loop on the learner's own project, visible controls only (${label})`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage(vp);
      page.setDefaultTimeout(8000);
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const K = pageKit(page, { hasTouch: !!vp.hasTouch }, server), { app, btn, tap, noOverflow } = K;
      const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/open-${label}-${name}.png`, fullPage: true }); };
      const setDesign = async d => {
        await page.locator('#material').selectOption(d.material);
        for (const k of ['b', 'h']) { await page.locator(`#${k}`).fill(String(d[k])); await page.locator(`#${k}`).press('Tab'); }
      };
      const answer = async ok => {
        const prompt = await app.locator('.item .lead').innerText(), a = hand(prompt);
        if (typeof a === 'object') {
          const opts = app.locator('.options label');
          const texts = await opts.allInnerTexts(), i = texts.findIndex(t => t.trim() === a.choice);
          await tap(app.locator('input[name="opt"]').nth(ok ? i : (i + 1) % texts.length));
        } else await app.locator('#answer').fill(ok ? a : `${parseFloat(a) * 3 + 7}${a.includes('N·m') ? ' N·m' : ''}`);
        await tap(btn('Check'));
      };

      // 1. the learner's own design on an open bench; the Experiments panel offers Predict and learn
      await page.goto(server.origin + '/tests/fixtures/bench/');
      await page.locator('body[data-ready="true"]').waitFor();
      await setDesign(mine);
      const link = page.locator('#experiments').getByRole('link', { name: 'Predict and learn' });
      assert.match(await link.getAttribute('href'), /^\/journeys\/journey\.html\?open=fixture-stand&project=P1&learn=/);
      await tap(link);
      await page.waitForURL(/journey\.html\?open=fixture-stand&project=P1/);
      await page.locator('body[data-ready="true"]').waitFor();

      // 2. brief: "Your design", their own design in words; Revision 1 goes on their project
      assert.equal(await app.locator('h1').innerText(), 'Your design');
      const shown = await K.setupShown();
      assert.deepEqual(shown, { Material: mine.material, Section: `${mine.b} mm wide × ${mine.h} mm deep`, Load: 'at 200 mm' });
      assert.match(await app.innerText(), /a run on your own project “Fixture stand 1”/);
      await noOverflow('brief'); await shot('brief');
      await tap(btn('Start · save Revision 1'));

      // 3. pick what to predict: none is refused; then two of the bench's outputs
      assert.equal(await K.phase(), 'stuck');
      await tap(btn('Predict these'));
      assert.match(await app.locator('#pick-card').innerText(), /Pick 1 to 3\./);
      await tap(app.getByLabel('Dial reading (mm)')); await tap(app.getByLabel('Stress at the gauge (MPa)'));
      await tap(btn('Predict these'));
      assert.deepEqual(await app.locator('[data-field]').evaluateAll(els => els.map(e => e.dataset.field)), ['deflection', 'stress']);
      await noOverflow('pick'); await shot('pick');
      // miss the stress badly (×4) and the dial reading a little (×1.5): the stress concept is the target
      const o1 = engine(mine);
      await app.locator('[data-field="deflection"]').fill((o1.deflection.value * 1.5).toPrecision(4));
      await app.locator('[data-field="stress"]').fill(`${(o1.stress.value * 4).toPrecision(4)} MPa`);
      await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
      const rows = await K.scoredRows('Your prediction against the engine');
      assert.deepEqual(rows.map(r => [r.prompt, r.result]), [['Dial reading', 'off'], ['Stress at the gauge', 'off']]);
      assert.ok(Math.abs(parseFloat(rows[1].engine) - o1.stress.value) <= 0.001 * o1.stress.value + 0.001, 'engine stress shown');
      await tap(btn('Find what is blocking me'));

      // 4. find the block: miss the target and what it rests on
      for (let i = 0; i < 4 && !(await app.innerText()).includes('What we found'); i++) {
        const title = await app.locator('.item .eyebrow').innerText();
        await answer(!/turning|multiplying/i.test(title)); await tap(btn('Next'));
      }
      assert.match(await app.innerText(), /What we found[\s\S]*Then Turning effect of a force/);
      await tap(btn('Continue'));

      // 5. learn: lessons with a worked example, practice with help (recorded as help)
      for (let g = 0; g < 20 && (await K.phase()) === 'teach'; g++) {
        if (await K.has('Practise')) { assert.match(await app.innerText(), /Worked example: /); await tap(btn('Practise')); continue; }
        if (await K.has('Show the solution')) await tap(btn('Show the solution'));
        await answer(true); await tap(btn('Next'));
      }
      // 6. apply on their own (no help), then the same idea on their own design, then the unaided check
      assert.equal(await K.phase(), 'apply');
      for (let k = 0; k < 3; k++) { assert.equal(await btn('Show the solution').count(), 0); await answer(true); await tap(btn('Next')); }
      assert.equal(await app.locator('#transfer').getAttribute('href'), '../tests/fixtures/bench/');
      await tap(btn('Continue to the check'));
      await answer(true); await tap(btn('Next'));
      assert.equal(await app.locator('#status').innerText(), 'Solved on your own after help.');
      await noOverflow('check');
      await tap(btn('Back to my design'));

      // 7. back to THEIR project on the bench: it opens their design; change it there and come back
      assert.equal(await K.phase(), 'return');
      await tap(app.getByRole('link', { name: 'Change it on the bench' }));
      await page.waitForURL(/\/tests\/fixtures\/bench\/$/);
      await page.locator('body[data-ready="true"]').waitFor();
      assert.equal(await page.locator('#h').inputValue(), String(mine.h), 'their own project is open on the bench');
      assert.match(await page.locator('#experiments .nb-open option:checked').innerText(), /^Fixture stand 1 · 1 run/);
      await setDesign(revised);
      await page.goBack(); await page.locator('body[data-phase="return"]').waitFor();
      await tap(btn('I’ve saved a change'));
      assert.match(await app.innerText(), /Changed since Revision 1: /);
      const o2 = engine(revised);
      await app.locator('[data-field="deflection"]').fill(o2.deflection.value.toPrecision(5));
      await app.locator('[data-field="stress"]').fill(o2.stress.value.toPrecision(5));
      await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
      assert.deepEqual((await K.scoredRows('Prediction run 1')).map(r => r.result), ['close', 'close']);
      assert.match(await app.locator('#tested-status').innerText(), /This design is tested \(run R2\)/);
      await noOverflow('return'); await shot('return');
      await tap(btn('Save as Revision 2'));

      // 8. decide and defend: questions from the levers the learner changed, answered from the engine apart from the page
      assert.equal(await K.phase(), 'decide');
      await app.locator('#claim').fill('My revised section keeps the dial reading and the stress down.');
      await tap(btn('Save the decision'));
      assert.equal(await K.phase(), 'defend');
      const prompts = await app.locator('.field').allInnerTexts();
      const changed = Object.keys(revised).filter(k => revised[k] !== mine[k]);
      assert.equal(prompts.length, changed.length);
      const reads = ['deflection', 'stress'], LABEL = { deflection: 'the dial reading', stress: 'the stress at the gauge' }, NAME = { material: 'the material', b: 'the width', h: 'the depth' };
      const order = ['material', 'h', 'b'].filter(k => changed.includes(k));
      for (const [i, k] of order.entries()) {
        const read = reads[i % 2];
        assert.match(prompts[i], new RegExp(`^What would ${LABEL[read].toLowerCase()} be if ${NAME[k]} went back to its Revision 1 value`));   // read as a sentence (1c2df9e)
        const t = engine({ ...revised, [k]: mine[k] })[read].value;
        await app.locator(`[data-field="${i}"]`).fill(t.toPrecision(5));
      }
      await tap(btn('Submit'));

      // 9. portfolio on their own project
      assert.equal(await K.phase(), 'summary');
      const text = await app.innerText();
      assert.match(text, /Design Revision 1 → Revision 2/);
      assert.equal(await app.locator('.res-correct').count(), order.length, 'every defence answer within tolerance');
      assert.match(text, /Turning effect of a force · Solved on your own after help/);
      assert.match(text, /Revision 2 is run R3, the design you predicted and ran in run R2/);
      assert.equal(await app.locator('.badmsg').count(), 0, 'every run reproduces');
      await noOverflow('summary'); await shot('summary');

      // 10. the journeys list: their project under "Start from your own design", the fixed journeys as worked examples.
      // The fixture bench is registered for this page only (the registry module is served with it added).
      await page.route('**/content/benches.mjs', r => r.fulfill({ contentType: 'text/javascript', body: "export const BENCHES = [() => import('../tests/fixtures/bench/learn.mjs'), () => import('./no-such-bench.mjs')];" }));
      await page.goto(server.origin + '/journeys/');
      await page.locator('body[data-ready="true"]').waitFor();
      assert.match(await page.locator('main').innerText(), /Start from your own design[\s\S]*Fixture stand 1[\s\S]*Predict and learn[\s\S]*Worked examples/);
      for (const a of await page.locator('#list a').all()) assert.match(await a.getAttribute('href'), /^\.\/journey\.html\?j=/);
      const own = page.locator('#own a');
      assert.equal(await own.count(), 1);
      assert.equal(await own.getAttribute('href'), './journey.html?open=fixture-stand&project=P1');
      await noOverflow('list');
      // the bench is found by its domain in the registry: the same loop resumes at the portfolio
      await tap(own);
      await page.locator('body[data-phase="summary"]').waitFor();
      assert.match(await app.innerText(), /Design Revision 1 → Revision 2/);
      assert.deepEqual(K.errors, []);
    } finally { await browser.close(); server.close(); }
  });
}

test('Predict and learn on a bench that has no learn descriptor, and on a project that is gone', async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.origin + '/journeys/journey.html?open=no-such-bench&project=P1');
    await page.locator('body[data-ready="error"]').waitFor();
    assert.match(await page.locator('#app').innerText(), /Not ready for this bench yet[\s\S]*Your project is safe on the bench/);
    await page.goto(server.origin + '/journeys/journey.html?open=fixture-stand&project=P9&learn=../tests/fixtures/bench/learn.mjs');
    await page.locator('body[data-ready="error"]').waitFor();
    assert.match(await page.locator('#app').innerText(), /Project not found[\s\S]*not saved in this browser/);
    assert.equal(await page.locator('#bench').getAttribute('href'), '../tests/fixtures/bench/');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
