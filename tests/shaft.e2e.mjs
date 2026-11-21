import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860, mobile: true }, { width: 1280, height: 900 }]) {
  test(`Engine World ${vp.width}px: from cylinder work to shaft power — scrub, chain, A/B runner experiment, non-convergence`, async () => {
    const server = await serve();
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
      page.setDefaultTimeout(90000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(server.origin + '/engine-world/index.html');
      await page.locator('body[data-ready="true"]').waitFor();
      await page.getByRole('radio', { name: 'Explore' }).click();
      await page.getByRole('tab', { name: 'Work → power' }).click();
      const state = () => page.evaluate(() => document.body.dataset.xState);
      assert.equal(await state(), 'none');

      // Run A (stock) at 4500 rpm
      await page.getByRole('button', { name: 'Run A: stock engine' }).click();
      await page.waitForFunction(() => document.body.dataset.xState === 'A');
      assert.match(await page.locator('#x-status').innerText(), /stock K12M at 4500 rpm, converged after \d+ cycles/);
      const chain = await page.locator('#x-chain').innerText();
      assert.match(chain, /IMEP = W \/ Vd = [\d.]+ J ÷ [\d.]+ cm³ = 13\.56 bar/);
      assert.match(chain, /Friction \(modelled, not measured\)/);
      assert.match(chain, /T = BMEP · Vd · z \/ 4π = .* = 113\.0 N·m/);
      assert.match(chain, /bench’s own torque for this run is 112\.96 N·m; the chain above gives 112\.96 N·m/);
      assert.match(await page.locator('#x-caveat').innerText(), /do not validate the full curve/);

      // Scrub to intake-valve closing: instruments agree on one crank angle; 3D view follows
      await page.locator('#x-scrub').fill('588');
      const read = await page.locator('#x-read').innerText();
      assert.match(read, /588°[\s\S]*Compression[\s\S]*IVC — intake valve closes/);
      assert.equal(await page.locator('#x-pv .xloop').count(), 1);
      await page.waitForFunction(() => /crank angle from the experiment/.test(document.getElementById('hud-speed').textContent));

      // A/B: prediction required before Run B
      const runB = page.getByRole('button', { name: 'Run B' });
      assert.ok(await runB.isDisabled());
      await page.locator('#x-runner').fill('25');
      assert.ok(await runB.isDisabled(), 'locked until the learner predicts');
      await page.getByRole('button', { name: 'Down', exact: true }).click();
      await runB.click();
      await page.waitForFunction(() => document.body.dataset.xState === 'AB');
      assert.equal(await page.locator('#x-pv .xloop').count(), 2, 'Run A and Run B overlaid on the same axes');
      const ab = await page.locator('#x-ab').innerText();
      assert.match(ab, /You predicted Down\. Brake torque 113\.0 → 90\.8 N·m \(−19\.6 %\): Down/);
      assert.match(ab, /FMEP\s+1\.71 bar\s+1\.71 bar\s+±0\.0 %/);
      assert.match(ab, /not measurements/);
      await page.locator('#mod-shaft').screenshot({ path: `/tmp/shaft-${vp.width}.png` });

      // Run A is unchanged; a non-converged Run B is not plotted or compared
      assert.match(await page.locator('#x-chain').innerText(), /113\.0 N·m/);
      await page.evaluate(() => window.__shaft.setMaxCycles(2));
      await page.getByRole('button', { name: 'New Run B' }).click();
      await page.getByRole('button', { name: 'Down', exact: true }).click();
      await runB.click();
      await page.waitForFunction(() => document.body.dataset.xState === 'B-invalid');
      assert.match(await page.locator('#x-ab').innerText(), /Run B did not converge — it is not plotted or compared/);
      assert.equal(await page.locator('#x-pv .xloop').count(), 1, 'only the valid Run A is drawn');
      assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
