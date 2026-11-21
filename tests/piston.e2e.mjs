import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860, mobile: true }, { width: 1280, height: 860 }]) {
  test(`Piston Pump ${vp.width}px: four missions, indicator diagram, air vessels, separation`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(server.origin + '/index.html');
      await page.locator('.obj.feature', { hasText: 'Piston Pump' }).click();
      await page.locator('body[data-ready="true"]').waitFor();
      const mission = page.locator('#mission');
      assert.match(await mission.innerText(), /Mission 1 of 4/);
      const expected = ['Doubles', 'At the start of the stroke', 'Yes', 'About 85 %'];
      for (let n = 0; n < 4; n++) {
        if (n) await page.getByRole('button', { name: 'Next mission' }).click();
        await mission.getByRole('button', { name: expected[n], exact: true }).click();
        assert.match(await mission.innerText(), new RegExp(`Right — the model says: ${expected[n]}`), `mission ${n + 1}`);
        if (n === 2) assert.equal(await page.evaluate(() => document.body.dataset.status), 'separation');
        if (n === 3) assert.equal(await page.evaluate(() => document.body.dataset.status), 'running', 'air vessels at 120 rpm: no separation');
      }
      await page.getByRole('radio', { name: 'Explore' }).click();
      await page.getByRole('tab', { name: 'Indicator diagram' }).click();
      assert.equal(await page.locator('#ind polygon').count(), 1);
      assert.match(await page.locator('#ind-note').innerText(), /Power from the diagram ([\d.]+) kW = formula \1 kW/);
      await page.getByRole('tab', { name: 'Pump' }).click();
      await page.getByRole('radio', { name: 'Double-acting' }).click();
      assert.ok(await page.evaluate(() => window.__piston.R.k) === 2);
      assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth));
      await page.screenshot({ path: `/tmp/piston-${vp.width}.png` });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
