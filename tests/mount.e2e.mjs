import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860 }, { width: 1280, height: 900 }]) {
  test(`mount lab ${vp.width}px: investigate → diagnose (hints only after an attempt) → redesign trade-offs → defend → unseen case`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
      page.setDefaultTimeout(8000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(server.origin + '/index.html');
      await page.locator('.obj.feature', { hasText: 'The mount that didn’t break' }).click();
      await page.locator('body[data-ready="true"]').waitFor();
      const mission = page.locator('#mission'), tab = name => page.getByRole('tab', { name }).click();
      const reading = async ({ load, dial, strain }) => {
        await tab('Test stand');
        await page.getByRole('button', { name: load ? 'Apply operating load' : 'Remove load' }).click();
        if (dial) await page.locator('#dial-x').selectOption(String(dial));
        if (strain) await page.locator('#strain-x').selectOption(String(strain));
        await page.getByRole('button', { name: 'Take a reading' }).click();
      };
      const design = async (material, shape, dims) => {
        await tab('Design');
        await page.locator('#mat').getByRole('radio', { name: material }).click();
        await page.locator('#shape').getByRole('radio', { name: shape }).click();
        for (const [k, v] of Object.entries(dims)) await page.locator(`[data-dim="${k}"]`).fill(String(v));
      };
      const last = () => page.evaluate(() => { const r = window.__mount.runs().at(-1); return { name: r.name, d: r.outputs.deflection.value, s: r.outputs.stress.value, m: r.outputs.mass.value }; });

      // 1 · investigate the existing support (design locked)
      assert.match(await mission.innerText(), /Aluminium 40×30 solid/);
      assert.ok(await page.locator('#mat [data-mat="steel"]').isDisabled(), 'redesign locked until diagnosis');
      await reading({ load: true });                    // dial 100, strain 400 by default
      assert.match(await page.locator('#rig').innerHTML(), /deflection drawn ×\d+/);
      await reading({ load: false });
      let t = await mission.innerText();
      assert.doesNotMatch(t, /hints/i, 'no hints before an attempt');
      await page.getByRole('tab', { name: 'Mission' }).click();
      await mission.locator('[data-diag="flexible"]').click();
      await page.locator('#ev-defl').selectOption({ index: 1 }); await page.locator('#ev-stress').selectOption({ index: 1 });
      await mission.getByRole('button', { name: 'Check my diagnosis' }).click();
      t = await mission.innerText();
      assert.match(t, /hints[\s\S]*your dial was at 100 mm[\s\S]*your strain gauge was at 400 mm/i, 'hints after a meaningful attempt, specific to what was missed');
      await reading({ load: true, dial: 200, strain: 200 });
      let r = await last(); assert.equal(r.d.toFixed(3), '1.431'); assert.equal(r.s.toFixed(1), '55.6');
      // unloading returns to zero: no yield
      await reading({ load: false }); r = await last(); assert.equal(Math.abs(r.d).toFixed(3), '0.000');
      await tab('Mission');
      await page.locator('#ev-defl').selectOption({ label: (await page.locator('#ev-defl option').allInnerTexts()).find(o => o.startsWith('R3 ·')) });
      await page.locator('#ev-stress').selectOption({ label: (await page.locator('#ev-stress option').allInnerTexts()).find(o => o.startsWith('R3 ·')) });
      await mission.getByRole('button', { name: 'Check my diagnosis' }).click();
      t = await mission.innerText();
      assert.match(t, /1\.431 mm at the mount under load — 9\.5 × the 0\.15 mm tolerance/);
      assert.match(t, /σ = E·ε = 55\.6 MPa at the peak[\s\S]*20 % of the 276 MPa yield/);
      assert.match(t, /It didn’t break, but it still failed/);

      // 2 · redesign: the trade-offs are real
      await mission.getByRole('button', { name: 'Start the redesign' }).click();
      // after the diagnosis the stiffness-vs-strength readout opens on the original design: too flexible, strong enough
      assert.equal(await page.locator('#ss-defl-val').innerText(), '1.431 mm vs 0.15 mm limit'); assert.equal(await page.locator('#ss-defl-verdict').innerText(), 'FAIL');
      assert.equal(await page.locator('#ss-stress-verdict').innerText(), 'PASS'); assert.equal(await page.locator('#ss-fos-val').innerText(), (276 / (1e6 / 3 / 6000)).toFixed(2));
      await design('Aluminium 6061-T6', 'Hollow rectangle', { b: 50, h: 60, t: 4 }); await reading({ load: true, dial: 200, strain: 200 });
      r = await last(); assert.ok(r.d > 0.15 && r.s < 138 && r.m < 2.5, 'strong and light, but too flexible');
      await design('Structural steel', 'Solid rectangle', { b: 50, h: 60 }); await reading({ load: true, dial: 200, strain: 200 });
      r = await last(); assert.ok(r.d <= 0.15 && r.m > 2.5, 'stiff enough, too heavy');
      await design('Structural steel', 'I-section', { b: 50, h: 80, tw: 3, tf: 3 }); await reading({ load: true, dial: 200, strain: 200 });
      r = await last(); assert.ok(r.d <= 0.15 && r.s <= 125 && r.m <= 2.5, 'meets every limit');
      const good = r.name;
      await design('Aluminium 6061-T6', 'I-section', { b: 50, h: 80, tw: 3, tf: 8 }); await reading({ load: true, dial: 200, strain: 200 });
      r = await last(); assert.ok(r.d <= 0.15 && r.s <= 138 && r.m <= 2.5, 'a second, different design meets every limit');
      // compare two saved readings: what changed
      await tab('Runs');
      const names = await page.locator('#cmp-a option').allInnerTexts();
      await page.locator('#cmp-a').selectOption(names.find(n => n.startsWith('R5 ·'))); await page.locator('#cmp-b').selectOption(names.find(n => n.startsWith('R7 ·')));
      assert.match(await page.locator('#cmp').innerText(), /Changed between the two: Material, Section[\s\S]*Dial reading \(deflection\)/);
      assert.match(await page.locator('#runs').innerText(), /R5 · Aluminium 50×60×4 hollow[^\n]*outside[\s\S]*R7 · Steel I 50×80[^\n]*within/);

      // 3 · defend with cited readings; explanation is reviewed, not keyword-scored
      await tab('Mission');
      await mission.getByRole('button', { name: 'I have a design to defend' }).click();
      await page.locator('#df-run').selectOption(good); await page.locator('#df-align').selectOption(good); await page.locator('#df-yield').selectOption(good);
      await mission.locator('[data-why="EI"]').click(); await mission.locator('[data-limit="bolts"]').click();
      await page.locator('#df-text').fill('The aluminium bar was strong enough but too flexible: 1.431 mm at the mount. A steel I-section raised E·I; 0.081 mm in R7. Bolt slip is not modelled.');
      await mission.getByRole('button', { name: 'Submit my defence' }).click();
      t = await mission.innerText();
      assert.match(t, /scored criteria: 7 \/ 7/i); assert.match(t, /Reviewer rubric/); assert.match(t, /not auto-scored/i);

      // 4 · unseen case: the guided winner that only just passed fails at mid-span; recall is not enough
      await mission.getByRole('button', { name: 'Next: a new case without hints' }).click();
      t = await mission.innerText();
      assert.match(t, /The machine moves to mid-span[\s\S]*2500 N at 300 mm/); assert.doesNotMatch(t, /^hints$/im, 'no hints section in the new case');
      await design('Structural steel', 'I-section', { b: 40, h: 70, tw: 3, tf: 3 });   // also meets every guided limit
      assert.match(await page.locator('#ss-hidden').innerText(), /Hidden in the new case/); assert.equal(await page.locator('#ss-bars').isVisible(), false, 'no model answers before the attempt is scored');
      // shortcut 1: load and read before locking — blocked, even if the button is forced
      await tab('Test stand');
      assert.ok(await page.getByRole('button', { name: 'Apply operating load' }).isDisabled(), 'no load before the lock');
      assert.match(await page.locator('#stand-note').innerText(), /lock your prediction and design/);
      await page.evaluate(() => { const b = document.getElementById('load-on'); b.disabled = false; b.click(); });
      await page.locator('#dial-x').selectOption('300'); await page.locator('#strain-x').selectOption('300');
      await page.getByRole('button', { name: 'Take a reading' }).click();
      r = await last(); assert.equal(Math.abs(r.d).toFixed(3), '0.000', 'only an unloaded reading is possible before the lock');
      assert.equal(await page.locator('#status').innerText(), 'UNLOADED');
      await tab('Mission');
      await mission.locator('[data-pa="meets"]').click(); await mission.locator('[data-py="meets"]').click();
      await mission.getByRole('button', { name: 'Lock prediction and design' }).click();
      assert.ok(await page.locator('#mat [data-mat="aluminium"]').isDisabled(), 'design locked with the prediction');
      await reading({ load: true, dial: 200, strain: 200 });   // old mount position: does not check the new case
      await tab('Mission'); assert.equal(await mission.locator('.check li.done').count(), 0);
      await reading({ load: true, dial: 300, strain: 300 });
      await tab('Mission');
      await mission.locator('[data-va="fails"]').click(); await mission.locator('[data-vy="meets"]').click();
      await mission.getByRole('button', { name: 'Submit' }).click();
      await page.waitForFunction(() => document.body.dataset.transfer === 'not-passed-1');
      t = await mission.innerText();
      assert.match(t, /prediction for alignment \(meets\) — not what happened: 0\.168 mm at 300 mm/);
      await mission.getByRole('button', { name: 'Redesign and lock again' }).click();
      await design('Structural steel', 'I-section', { b: 50, h: 80, tw: 3, tf: 3 }); await tab('Mission');
      await mission.locator('[data-pa="meets"]').click(); await mission.locator('[data-py="meets"]').click();
      await mission.getByRole('button', { name: 'Lock prediction and design' }).click();
      await reading({ load: true, dial: 300, strain: 300 }); await tab('Mission');
      await mission.locator('[data-va="fails"]').click(); await mission.locator('[data-vy="meets"]').click();   // misread on purpose
      await mission.getByRole('button', { name: 'Submit' }).click();
      await page.waitForFunction(() => document.body.dataset.transfer === 'not-passed-2');
      // shortcut 2: re-lock the same design and reuse attempt 2's readings — not accepted
      await mission.getByRole('button', { name: 'Redesign and lock again' }).click();
      await tab('Test stand'); assert.ok(await page.getByRole('button', { name: 'Apply operating load' }).isDisabled(), 'load blocked again before the new lock');
      // the shared Experiments panel cannot be used to record a loaded result before the lock
      const before = await page.evaluate(() => window.__mount.runs().length);
      await tab('Experiments'); await page.locator('.nb-save').click();
      assert.equal(await page.evaluate(() => window.__mount.runs().at(-1).setup.loaded), false);
      assert.equal(await page.evaluate(() => window.__mount.runs().length), before + 1);
      await tab('Mission');
      await mission.locator('[data-pa="meets"]').click(); await mission.locator('[data-py="meets"]').click();
      await mission.getByRole('button', { name: 'Lock prediction and design' }).click();
      t = await mission.innerText();
      assert.equal(await mission.locator('.check li.done').count(), 0, 'readings from an earlier attempt do not count');
      assert.equal(await mission.locator('[data-va]').count(), 0, 'no verdict without fresh readings');
      assert.match(t, /Only readings taken after this lock count/);
      await reading({ load: true, dial: 300, strain: 300 }); await tab('Mission');
      assert.equal(await mission.locator('.check li.done').count(), 2);
      await mission.locator('[data-va="meets"]').click(); await mission.locator('[data-vy="meets"]').click();
      await mission.getByRole('button', { name: 'Submit' }).click();
      await page.waitForFunction(() => document.body.dataset.transfer === 'passed');
      assert.match(await mission.innerText(), /Passed on design 3/);
      // every reading is on the shared record and reproduces from its setup
      await tab('Experiments');
      const n = await page.evaluate(() => window.__mount.runs().length);
      assert.equal(await page.locator('[data-reproduced="true"]').count(), n); assert.ok(n >= +await page.evaluate(() => document.body.dataset.runs));
      assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
      await page.screenshot({ path: `/tmp/mount-${vp.width}.png`, fullPage: vp.width < 600 });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
