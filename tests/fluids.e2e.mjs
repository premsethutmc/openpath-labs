import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

test('Flow Tunnel: six syllabus missions answered by experiments, explore, draw your own', async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 860 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/index.html');
    await page.locator('.obj.feature', { hasText: 'Flow Tunnel' }).click();
    await page.locator('body[data-ready="true"]').waitFor();
    const mission = page.locator('#mission');
    assert.match(await mission.innerText(), /Mission 1 of 6[\s\S]*CE3391 Fluid Mechanics and Machinery · Unit I · Continuity/);
    assert.ok(await page.getByRole('tab', { name: 'Object' }).isDisabled(), 'Learn mode locks the controls until the answer');
    const expected = ['Faster', 'Lower', 'Centre', 'Yes', 'Wing', '13 m/s'];
    for (let n = 1; n <= 6; n++) {
      if (n > 1) await page.getByRole('button', { name: 'Next mission' }).click();
      await mission.getByRole('button', { name: expected[n - 1], exact: true }).click();
      await mission.locator('.result').waitFor();
      assert.match(await mission.innerText(), new RegExp(`Right — the experiment says: ${expected[n - 1].replace('/', '\\/')}`), `mission ${n}: ${await mission.innerText()}`);
    }
    // Explore: vortex shedding behind a cylinder at Re ≈ 120
    await page.getByRole('radio', { name: 'Explore' }).click();
    await page.getByRole('tab', { name: 'Object' }).click();
    await page.getByRole('radio', { name: 'Cylinder' }).click();
    await page.getByRole('tab', { name: 'Flow' }).click();
    await page.locator('#re').fill('80');
    await page.locator('#re').dispatchEvent('change');
    await page.waitForFunction(() => document.body.dataset.regime === 'Vortex shedding', null, { timeout: 90000 });
    await page.waitForFunction(() => /St /.test(document.getElementById('g-x').textContent), null, { timeout: 60000 });
    const st = parseFloat((await page.locator('#g-x').textContent()).slice(3));
    assert.ok(st > 0.12 && st < 0.25, `Strouhal ${st}`);
    // Draw your own
    await page.getByRole('tab', { name: 'Object' }).click();
    await page.getByRole('radio', { name: 'Draw your own' }).click();
    const solids = () => page.evaluate(() => window.__tunnel.T.solid.reduce((a, v) => a + (v === 2), 0));
    assert.equal(await solids(), 0);
    await page.locator('#field').scrollIntoViewIfNeeded();
    const box = await page.locator('#field').boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7, { steps: 10 }); await page.mouse.up();
    assert.ok(await solids() > 20);
    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth));
    await page.screenshot({ path: '/tmp/fluids-phone.png' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
