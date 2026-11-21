import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860, mobile: true }, { width: 1280, height: 860 }]) {
  test(`Pump House ${vp.width}px: seven missions, scenarios, charts`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      await page.goto(server.origin + '/index.html');
      await page.locator('.obj.feature', { hasText: 'Pump House' }).click();
      await page.locator('body[data-ready="true"]').waitFor();
      const mission = page.locator('#mission');
      assert.match(await mission.innerText(), /Mission 1 of 7[\s\S]*Unit II/);
      assert.ok(await page.getByRole('tab', { name: 'Pump' }).isDisabled(), 'controls locked until the learner predicts');
      assert.equal(await page.locator('.side .module:not([hidden])').count(), 1, 'one module at a time');
      const expected = ['Turbulent', 'Drops, but by much less than half', 'About 30 times', 'Less power', 'A quarter', 'Yes', 'It rises, but less than double'];
      for (let n = 0; n < 7; n++) {
        if (n) await page.getByRole('button', { name: 'Next mission' }).click();
        await mission.getByRole('button', { name: expected[n], exact: true }).click();
        assert.match(await mission.innerText(), new RegExp(`Right — the model says: ${expected[n]}`), `mission ${n + 1}`);
        if (n === 4) assert.equal(await page.evaluate(() => document.body.dataset.status), 'noflow', 'half speed cannot reach the tank');
        if (n === 5) assert.equal(await page.evaluate(() => document.body.dataset.status), 'cavitating');
      }
      await page.getByRole('radio', { name: 'Explore' }).click();
      assert.ok(await page.getByRole('tab', { name: 'Mission' }).isHidden());
      await page.getByRole('tab', { name: 'Situations' }).click();
      await page.getByRole('radio', { name: '12-storey tower' }).click();
      assert.equal(await page.evaluate(() => document.body.dataset.status), 'noflow');
      await page.getByRole('tab', { name: 'Pump' }).click();
      await page.getByRole('radio', { name: 'Two in series' }).click();
      assert.equal(await page.evaluate(() => document.body.dataset.status), 'running');
      await page.getByRole('tab', { name: 'Situations' }).click();
      await page.getByRole('radio', { name: 'Hill station, Ooty 2240 m' }).click();
      assert.equal(await page.evaluate(() => document.body.dataset.status), 'cavitating');
      await page.getByRole('radio', { name: 'Hostel block' }).click();
      const q0 = await page.evaluate(() => window.__pumps.op.Q);
      await page.getByRole('tab', { name: 'Pipes' }).click();
      await page.getByRole('radio', { name: '25 mm' }).click();
      assert.ok(await page.evaluate(() => window.__pumps.op.Q) < q0 * 0.8, 'thinner pipe, less flow');
      await page.getByRole('tab', { name: 'Charts' }).click();
      for (const tab of ['Energy line', 'Impeller', 'Pump vs pipes']) {
        await page.getByRole('radio', { name: tab }).click();
        assert.ok((await page.locator('#chart polyline, #chart line').count()) > 2, tab);
        if (!vp.mobile) await page.locator('#chart').screenshot({ path: `/tmp/pumps-${tab.split(' ')[0]}.png` });
      }
      assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
      await page.screenshot({ path: `/tmp/pumps-${vp.width}.png`, fullPage: !vp.mobile });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
