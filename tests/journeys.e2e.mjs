// Journey page, end to end, on the fixture journey (tests/fixtures/journey.mjs) played on the Mount test stand adapter:
// brief → stuck → diagnose → teach → apply → check → return (bench and back) → R2 → decide → defend → portfolio.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { READING_ADAPTER } from '../mount/model.mjs';
import { applyPatch } from '../core/journey.mjs';

const SRC = '/journeys/journey.html?src=../tests/fixtures/journey.mjs';
const R2_DESIGN = { material: 'steel', shape: 'rect', b: 40, h: 50 };
const TESTED = { ...R2_DESIGN, h: 45 };                            // edited after the R4 run, then predicted and run (R5): this becomes R2

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`journey page ${vp.width}px: the whole loop lands on the project record and the ledger`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600, acceptDownloads: true });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(server.origin + SRC);
      await page.locator('body[data-ready="true"]').waitFor();
      const app = page.locator('#app'), phase = () => page.evaluate(() => document.body.dataset.phase);
      const btn = name => app.getByRole('button', { name, exact: true });
      const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${vp.width}-${name}.png`, fullPage: true }); };
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll in ${await phase()}`);
      const key = () => page.evaluate(() => { const r = window.__journey.state().item.ref; return window.__journey.items.make(r.generator, r.seed, r.aspect).answer; });
      const answer = async ok => {
        const a = await key();
        if (a.kind === 'choice') { const c = typeof a.correct === 'number' ? a.correct : a.options.indexOf(a.correct); await app.locator('input[name="opt"]').nth(ok ? c : (c + 1) % a.options.length).check(); }
        else await app.locator('#answer').fill(ok ? `${a.value} ${a.unit}`.trim() : `${a.value * 3 + 7} ${a.unit}`.trim());
        await btn('Check').click();
      };

      // brief → R1
      assert.match(await app.innerText(), /Fixture: the stiff bracket[\s\S]*Starting design/);
      await noOverflow();
      await btn('Start · save R1').click();
      // stuck: a refusal keeps the typed text; locked predictions are scored against the engine
      await app.locator('[data-field="defl"]').fill('lots');
      await btn('Lock predictions').click();
      assert.match(await app.innerText(), /start with a number/);
      assert.equal(await app.locator('[data-field="defl"]').inputValue(), 'lots');
      await app.locator('[data-field="defl"]').fill('0.2');
      await btn('Lock predictions').click();
      assert.ok(await app.locator('[data-field="defl"]').isDisabled(), 'locked');
      await btn('Run the bench').click();
      const truth = READING_ADAPTER.evaluate({ design: { material: 'aluminium', shape: 'rect', b: 40, h: 30 }, loaded: true, mount: 200, dialX: 200, strainX: 200 }).outputs.deflection.value;
      assert.match(await app.innerText(), new RegExp(`0\\.200 mm[\\s\\S]*${truth.toFixed(3)} mm[\\s\\S]*off`));
      await noOverflow();
      await btn('Find what is blocking me').click();

      // diagnose: an unreadable answer is not counted; target misses lead to a prerequisite question
      assert.equal(await phase(), 'diagnose');
      if ((await key()).kind === 'number') { await app.locator('#answer').fill('no idea'); await btn('Check').click(); assert.match(await app.innerText(), /Not read[\s\S]*Nothing was counted/); }
      for (let i = 0; i < 3 && !(await app.innerText()).includes('What we found'); i++) {
        const title = await app.locator('.item .eyebrow').innerText();
        await answer(!/turning|multiplying/i.test(title));
        await btn('Next').click();
      }
      assert.match(await app.innerText(), /What we found[\s\S]*First: Multiplying quantities/, await app.innerText());
      await noOverflow();
      await btn('Continue').click();

      // teach: prerequisite first (school maths), then the target with its bench link; help is recorded
      assert.match(await app.innerText(), /Learn 1 of 2[\s\S]*Multiplying quantities[\s\S]*School maths/i);
      await btn('Practise').click();
      await btn('Show the solution').click();
      assert.equal(await app.locator('.solution li').count(), 1);
      await answer(true); await btn('Next').click();
      assert.match(await app.innerText(), /Learn 2 of 2[\s\S]*Turning effect/i);
      assert.equal(await app.locator('#explore').getAttribute('href'), '../playground/?preset=shelf');
      await shot('teach');
      await btn('Practise').click();
      for (let k = 0; k < 2; k++) {
        if (await btn('Hint').count()) { await btn('Hint').click(); assert.equal(await app.locator('.hints li').count(), 1); }
        await answer(true); await btn('Next').click();
      }
      // apply: fresh items, no help on offer, then the transfer link
      assert.equal(await phase(), 'apply');
      for (let k = 0; k < 2; k++) {
        assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'no help in apply');
        await answer(true); assert.ok(await app.locator('.solution').count(), 'worked solution after the answer'); await btn('Next').click();
      }
      assert.equal(await app.locator('#transfer').getAttribute('href'), '../playground/?preset=crane');
      await btn('Continue to the check').click();
      // unaided check after help
      await answer(true); await btn('Next').click();
      assert.equal(await app.locator('#status').innerText(), 'Solved on your own after help.');
      await noOverflow();
      await btn('Back to my design').click();

      // return: predict on their own design, run, then go to the bench, change and save there, come back
      assert.equal(await phase(), 'return');
      await app.locator('[data-field="defl"]').fill('1.4'); await app.locator('[data-field="stress"]').fill('55');
      await btn('Lock predictions').click(); await btn('Run the bench').click();
      assert.equal(await app.locator('.round').count(), 1);
      await app.locator('#bench').click();
      await page.waitForURL(/\/mount\/\?project=current$/);
      await page.locator('body[data-stage="free"]').waitFor();
      // the bench opens the learner's own R1 design, unlocked: change it with the real controls and save a reading
      assert.equal(await page.locator('[data-mat="aluminium"]').getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('[data-mat="steel"]').isDisabled(), false);
      await page.locator('[data-mat="steel"]').click();
      await page.locator('[data-dim="h"]').fill(String(R2_DESIGN.h));
      await page.locator('#tab-stand').click();
      await page.locator('#load-on').click();
      await page.locator('#take').click();
      await page.locator('body[data-runs="1"]').waitFor();
      await page.goBack();
      await page.locator('body[data-phase="return"]').waitFor();
      await btn('I’ve saved a change').click();
      assert.match(await app.innerText(), /Changed since R1: design\.material, design\.h/);
      const own = READING_ADAPTER.evaluate({ design: R2_DESIGN, loaded: true, mount: 200, dialX: 200, strainX: 200 }).outputs;
      await app.locator('[data-field="defl"]').fill(own.deflection.value.toFixed(4)); await app.locator('[data-field="stress"]').fill(`${own.stress.value.toFixed(2)} MPa`);
      await btn('Lock predictions').click(); await btn('Run the bench').click();
      assert.equal(await app.locator('.round').count(), 2);
      assert.equal(await app.locator('.round').nth(1).locator('.res-correct').count(), 2);
      assert.match(await app.locator('#tested-status').innerText(), /Last tested: run R4\. This design is tested \(run R4\)/);
      await noOverflow(); await shot('return');

      // R2 is a tested design: edit on the bench after the run (as the bench saves it), then try to save the edit
      const edit = h => page.evaluate(async h => { const P = await import('/core/project.mjs'), st = P.openStore('mount-stand'), p = st.current(); p.setup = { ...p.setup, design: { ...p.setup.design, h } }; st.put(p); }, h);
      await edit(TESTED.h);
      await btn('Save as R2').click();                                   // the page was drawn before the edit: the runner refuses
      assert.equal(await phase(), 'return');
      assert.match(await app.locator('#choose').innerText(), /changed since run R4, and R2 must be a design you predicted and ran/);
      assert.match(await app.locator('#tested-status').innerText(), /Last tested: run R4\. This design is not tested: changed since run R4 \(design\.h\)/);
      assert.equal(await app.locator('#save').count(), 0);
      await noOverflow(); await shot('untested');
      // a reload keeps the binding: still not tested, both choices offered
      await page.reload(); await page.locator('body[data-phase="return"]').waitFor();
      assert.match(await app.locator('#tested-status').innerText(), /run R4\. This design is not tested/);
      // choice 1: predict and run this design (a fresh round)
      await btn('Predict and run this design').click();
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.field), 'defl');
      const ownT = READING_ADAPTER.evaluate({ design: TESTED, loaded: true, mount: 200, dialX: 200, strainX: 200 }).outputs;
      await app.locator('[data-field="defl"]').fill(ownT.deflection.value.toFixed(4)); await app.locator('[data-field="stress"]').fill(ownT.stress.value.toFixed(2));
      await btn('Lock predictions').click(); await btn('Run the bench').click();
      assert.match(await app.locator('#tested-status').innerText(), /This design is tested \(run R5\)/);
      assert.equal(await app.locator('#choose').count(), 0);
      // choice 2: edit again, then save the last tested design (run R5) as R2; the edit stays in the project, not in R2
      await edit(48); await btn('I’ve saved a change').click();
      assert.equal(await btn('Save as R2').count(), 0);
      await btn('Save the last tested design as R2').click();

      // decide → defend (keyed by the engine on patched copies of R2)
      assert.equal(await phase(), 'decide');
      assert.match(await app.locator('#saved-note').innerText(), /Saved R2 from run R5, the last design you predicted and ran\. Your later edits are still in the project on the bench, but they are not part of R2\./);
      assert.match(await app.innerText(), /From R1 to R6 \(tested in run R5\)/);
      await noOverflow(); await shot('decide');
      await btn('Save the decision').click();
      assert.match(await app.innerText(), /Say what you decided/);
      await app.locator('#claim').fill('Steel and a 45 mm deep section keep the dial reading inside 0.15 mm.');
      await app.locator('#rejected').fill('Aluminium 40 × 50: still too flexible');
      await app.locator('.checks input[value="R3"]').check();
      await btn('Save the decision').click();
      assert.equal(await phase(), 'defend'); await shot('defend');
      const r2 = { design: TESTED, loaded: true, mount: 200, dialX: 200, strainX: 200 };
      const t0 = READING_ADAPTER.evaluate(applyPatch(r2, { design: { material: 'steel' } })).outputs.deflection.value;
      const t1 = READING_ADAPTER.evaluate(applyPatch(r2, { mount: 300, dialX: 300, strainX: 300 })).outputs.stress.value;
      await app.locator('[data-field="0"]').fill(t0.toPrecision(4)); await app.locator('[data-field="1"]').fill(`${(t1 / 1000).toPrecision(4)} GPa`);
      await btn('Submit').click();

      // portfolio entry and export
      assert.equal(await phase(), 'summary');
      const text = await app.innerText();
      assert.match(text, /Design R1 → R2[\s\S]*Decision[\s\S]*Steel and a 45 mm deep section/);
      assert.equal(await app.locator('.res-correct').count(), 2, 'both defence answers within tolerance (GPa converted)');
      assert.match(text, /Turning effect of a force · Solved on your own after help/);
      assert.equal(await app.locator('.badmsg').count(), 0, 'every run reproduces');
      await noOverflow(); await shot('summary');
      const [dl] = await Promise.all([page.waitForEvent('download'), btn('Export portfolio (JSON)').click()]);
      const pf = JSON.parse(await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
      assert.equal(pf.format, 'openpath.portfolio');
      assert.deepEqual([pf.design.from.run, pf.design.to.run, pf.design.to.tested, pf.decision.from, pf.decision.to], ['R1', 'R6', 'R5', 'R1', 'R6']);
      assert.deepEqual(pf.design.to.setup.design, TESTED, 'R2 is the tested design, not the later edit');
      assert.deepEqual(pf.decision.defence.map(d => d.truth), [t0, t1]);
      assert.deepEqual(pf.trail.taught, ['FIX.product', 'FIX.lever']);
      // the record in the bench's store: version 2 with the decision; the ledger holds the journey's events
      const rec = await page.evaluate(() => ({ store: JSON.parse(localStorage.getItem('openpath.projects.mount-stand')), ledger: JSON.parse(localStorage.getItem('openpath.ledger')) }));
      const proj = rec.store.projects.find(p => p.origin === 'journey:fixture-bracket');
      assert.equal(proj.version, 2); assert.equal(proj.decisions.length, 1); assert.deepEqual(proj.runs.map(r => r.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
      assert.equal(proj.setup.design.h, 48, 'the learner\'s current edit is kept, not overwritten');
      const kinds = new Set(rec.ledger.events.map(e => `${e.kind}/${e.provenance}`));
      for (const k of ['evidence/diagnostic', 'shown_solution/practice', 'evidence/practice', 'evidence/check']) assert.ok(kinds.has(k), k);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}

test('journey list and a journey that cannot open', async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.origin + '/journeys/');
    await page.locator('body[data-ready="true"]').waitFor();
    assert.match(await page.locator('#learner').innerText(), /^Learner L-[0-9a-f]{12} · 0 answers/);
    const n = await page.locator('#list a').count();
    for (let i = 0; i < n; i++) assert.match(await page.locator('#list a').nth(i).getAttribute('href'), /^\.\/journey\.html\?j=/);
    if (!n) assert.match(await page.locator('#list').innerText(), /No journeys are available yet/);
    await page.goto(server.origin + '/journeys/journey.html?j=no-such-journey');
    await page.locator('body[data-ready="error"]').waitFor();
    assert.match(await page.locator('#app').innerText(), /No journey “no-such-journey”/);
    await page.goto(server.origin + '/journeys/journey.html?src=https://example.com/x.mjs');
    await page.locator('body[data-ready="error"]').waitFor();
    assert.match(await page.locator('#app').innerText(), /relative path/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
