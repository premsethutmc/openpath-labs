// Both real journeys (support design, pipe sizing) played end to end through the one journey page on a phone viewport:
// brief → stuck → diagnose → teach → apply → check → return (bench and back) → R2 → decide → defend → summary.
// Answers come from the item keys (the engine); predictions are deliberately off so the loop opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const id of ['support', 'pipe']) {
  test(`real journey "${id}" at 390px: whole loop, record and ledger`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(`${server.origin}/journeys/journey.html?j=${id}`);
      await page.locator('body[data-ready="true"]').waitFor();
      const app = page.locator('#app'), phase = () => page.evaluate(() => document.body.dataset.phase);
      const btn = name => app.getByRole('button', { name, exact: true });
      const has = async name => (await btn(name).count()) > 0 && await btn(name).first().isEnabled();
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll in ${await phase()}`);
      const answerItem = async (ok = true) => {
        const a = await page.evaluate(() => { const r = window.__journey.state().item.ref; return window.__journey.items.make(r.generator, r.seed, r.aspect).answer; });
        if (a.kind === 'choice') { const c = typeof a.correct === 'number' ? a.correct : a.options.indexOf(a.correct); await app.locator('input[name="opt"]').nth(ok ? c : (c + 1) % a.options.length).check(); }
        else await app.locator('#answer').fill(ok ? `${a.value} ${a.unit}`.trim() : `${a.value * 3 + 7} ${a.unit}`.trim());
        await btn('Check').click();
      };
      const fillPredictions = async () => { for (const f of await app.locator('[data-field]').all()) if (await f.isEditable()) await f.fill('999999'); };
      const seen = new Set();
      let benchVisited = false, ranAfter = false;
      for (let step = 0; step < 150; step++) {
        const ph = await phase(); seen.add(ph);
        if (ph === 'summary') break;
        await noOverflow();
        if (ph === 'brief') await btn('Start · save R1').click();
        else if (ph === 'stuck') {
          if (await has('Lock predictions')) { await fillPredictions(); await btn('Lock predictions').click(); }
          else if (await has('Run the bench')) await btn('Run the bench').click();
          else await btn('Find what is blocking me').click();
        } else if (['diagnose', 'teach', 'apply', 'check'].includes(ph)) {
          if (await app.locator('#answer, input[name="opt"]').count() && await has('Check')) await answerItem(ph !== 'diagnose');   // the diagnostic is answered wrongly, so teaching opens
          else {
            const next = ['Next', 'Practise', 'Continue', 'Continue to the check', 'Back to my design'];
            let done = false;
            for (const n of next) if (await has(n)) { await btn(n).click(); done = true; break; }
            assert.ok(done, `stuck in ${ph}: ${await app.innerText()}`);
          }
        } else if (ph === 'return') {
          if (!benchVisited) {
            benchVisited = true;
            await app.locator('#bench').click();
            if (id === 'support') {
              // the real Mount bench opens the learner's own design, unlocked; change it and save a reading
              await page.locator('body[data-stage="free"]').waitFor();
              await page.locator('[data-mat="steel"]').click();
              await page.locator('[data-dim="h"]').fill('50');
              await page.locator('#tab-stand').click();
              await page.locator('#load-on').click();
              await page.locator('#take').click();
              await page.locator('body[data-runs="1"]').waitFor();
            } else {
              // the fluid line bench opens the current project; apply the journey's first "what if" change as the learner's edit
              await page.locator('body[data-ready="true"]').waitFor();
              await page.evaluate(async () => {
                const P = await import('/core/project.mjs'), spec = (await import('/content/journeys/pipe.mjs')).default;
                const adapter = await spec.bench.adapter(), st = P.openStore('fluids-line'), p = st.current();
                const q = spec.defend(p.setup, adapter.evaluate(p.setup).outputs)[0];
                p.setup = { ...p.setup, ...q.change }; P.saveRun(p, adapter, 'bigger delivery pipes'); st.put(p);
              });
            }
            await page.goBack();
            await page.locator('body[data-phase="return"]').waitFor();
            await btn('I’ve saved a change').click();
            assert.match(await app.innerText(), /Changed since R1/);
            continue;
          }
          if (!ranAfter && await has('Lock predictions')) { await fillPredictions(); await btn('Lock predictions').click(); }
          else if (await has('Run the bench')) { await btn('Run the bench').click(); ranAfter = true; }
          else await btn('Save as R2').click();
        } else if (ph === 'decide') {
          await app.locator('#claim').fill('The revised design meets the brief; the runs show it.');
          await app.locator('#rejected').fill('The original design: it missed the limit.');
          await app.locator('.checks input').first().check();
          await btn('Save the decision').click();
        } else if (ph === 'defend') {
          for (const f of await app.locator('[data-field]').all()) await f.fill('1');
          await btn('Submit').click();
        } else assert.fail(`unexpected phase ${ph}`);
      }
      assert.equal(await phase(), 'summary', (await app.innerText()).slice(0, 1500));
      for (const ph of ['brief', 'stuck', 'diagnose', 'teach', 'apply', 'check', 'return', 'decide', 'defend']) assert.ok(seen.has(ph), `passed through ${ph}`);
      const text = await app.innerText();
      assert.match(text, /Solved on your own after help/);
      assert.match(text, /Design R1 → R2[\s\S]*Decision/);
      assert.equal(await app.locator('.badmsg').count(), 0, 'every run reproduces');
      await noOverflow();
      const domain = id === 'support' ? 'mount-stand' : 'fluids-line';
      const rec = await page.evaluate(d => ({ store: JSON.parse(localStorage.getItem(`openpath.projects.${d}`)), ledger: JSON.parse(localStorage.getItem('openpath.ledger')) }), domain);
      const proj = rec.store.projects.find(p => p.origin === `journey:${id}`);
      assert.ok(proj, 'journey project on the bench record');
      assert.equal(proj.version, 2); assert.equal(proj.decisions.length, 1); assert.ok(proj.decisions[0].defence.length >= 1);
      const kinds = new Set(rec.ledger.events.filter(e => e.journey === id).map(e => `${e.kind}/${e.provenance}`));
      for (const k of ['evidence/diagnostic', 'evidence/practice', 'evidence/check']) assert.ok(kinds.has(k), k);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
