import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860, mobile: true }, { width: 1280, height: 900 }]) {
  test(`Engine World ${vp.width}px: cylinder work to shaft power — scrub, chain, A/B at two speeds, defend, unseen point, non-convergence`, async () => {
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
      const state = s => page.waitForFunction(v => document.body.dataset.xState === v, s);
      const exp = page.locator('#x-exp');

      // 1–3: Run A, chain, scrub
      await page.getByRole('button', { name: 'Run A: stock engine' }).click();
      await state('A');
      assert.match(await page.locator('#x-status').innerText(), /stock K12M \(runner 34 cm\) at 4500 rpm, converged after \d+ cycles/);
      const chain = await page.locator('#x-chain').innerText();
      assert.match(chain, /IMEP = W \/ Vd = [\d.]+ J ÷ [\d.]+ cm³ = 13\.56 bar/);
      assert.match(chain, /Friction \(modelled, not measured\)/);
      assert.match(chain, /= 113\.0 N·m/);
      assert.match(chain, /bench’s own torque for this run is 112\.96 N·m; the chain gives 112\.96 N·m/);
      assert.match(await page.locator('#x-caveat').innerText(), /do not validate the full curve/);
      await page.locator('#x-scrub').fill('588');
      assert.match(await page.locator('#x-read').innerText(), /588°[\s\S]*Compression[\s\S]*IVC — intake valve closes/);
      await page.waitForFunction(() => /crank angle from the experiment/.test(document.getElementById('hud-speed').textContent));

      // 4: A/B at 4500 with the solver's own lengths (34 → 24 cm); prediction gate
      const runB = page.getByRole('button', { name: 'Run B', exact: true });
      await page.locator('#x-runner').fill('24');
      assert.match(await page.locator('#x-runner-out').innerText(), /24 cm \(Run A: 34 cm\)/);
      assert.ok(await runB.isDisabled(), 'locked until the learner predicts');
      await exp.getByRole('button', { name: 'Down', exact: true }).click();
      await runB.click();
      await state('first');
      assert.equal(await page.locator('#x-pv .xloop').count(), 2, 'A and B on the same axes');
      let t = await exp.innerText();
      assert.match(t, /At 4500 rpm you predicted Down\. Brake torque 113\.0 → 90\.8 N·m \(−19\.6 %\): Down/);
      assert.match(t, /Intake runner \(solver\)\s+34 cm\s+24 cm/);
      assert.match(t, /FMEP\s+1\.71 bar\s+1\.71 bar\s+±0\.0 %/);
      assert.match(t, /reflects where the runner meets the plenum/);

      // 5: same comparison at 6000 rpm; both pairs kept
      await exp.getByRole('radio', { name: '6000 rpm' }).click();
      await exp.getByRole('button', { name: 'Up', exact: true }).click();
      await page.getByRole('button', { name: 'Run A and B at 6000 rpm' }).click();
      await state('repeat');
      t = await exp.innerText();
      assert.match(t, /At 6000 rpm you predicted Up\. Brake torque 95\.7 → 110\.2 N·m \(\+15\.1 %\): Up/);
      assert.equal(await page.locator('#x-view [data-xview]').count(), 2, 'both speeds kept');
      await page.locator('#x-view').getByRole('radio', { name: '4500 rpm' }).click();
      assert.match(await page.locator('#x-chain').innerText(), /Run A, 4500 rpm/);

      // 6: defend the reversal with the evidence
      assert.match(t, /cost 19\.6 %\s*at 4500 rpm but gained 15\.1 %\s*at 6000 rpm/);
      await exp.locator('[data-why="fmep"]').click();
      assert.match(await exp.innerText(), /identical modelled friction/);
      await exp.locator('[data-why="wave"]').click();
      t = await exp.innerText();
      assert.match(t, /That is what the evidence shows/);
      assert.match(t, /4500 rpm: valve-side pressure near BDC 1\.35 bar \(A\) vs 1\.02 bar \(B\)/);
      assert.match(t, /6000 rpm: valve-side pressure near BDC 1\.22 bar \(A\) vs 1\.37 bar \(B\)/);

      // 7: an unseen operating point — first a forced non-converged run (never shown), then a real one
      await page.evaluate(() => window.__shaft.setMaxCycles(2));
      await exp.getByRole('radio', { name: '7000 rpm' }).click();
      await exp.getByRole('button', { name: 'Up', exact: true }).click();
      await page.getByRole('button', { name: 'Test 7000 rpm' }).click();
      await state('unseen-invalid');
      assert.match(await exp.innerText(), /Run A at 7000 rpm did not converge — not plotted, no numbers shown/);
      assert.equal(await page.locator('#x-view [data-xview]').count(), 2, 'the invalid run is not offered for viewing');
      await page.evaluate(() => window.__shaft.setMaxCycles(undefined));
      await page.getByRole('button', { name: 'Try another speed' }).click();
      await exp.getByRole('radio', { name: '7000 rpm' }).click();
      await exp.getByRole('button', { name: 'Up', exact: true }).click();
      await page.getByRole('button', { name: 'Test 7000 rpm' }).click();
      await state('unseen');
      assert.match(await exp.innerText(), /At 7000 rpm you predicted Up\. Brake torque 82\.7 → 94\.8 N·m \(\+14\.6 %\): Up/);
      assert.equal(await page.locator('#x-view [data-xview]').count(), 3);
      assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
      await page.locator('#mod-shaft').screenshot({ path: `/tmp/shaft-${vp.width}.png` });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
