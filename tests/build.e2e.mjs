import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const width of [380, 1200]) test(`Build your own ${width}px: replace a failing plank with a truss, supports, undo, persistence, edit a preset`, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/playground/index.html#build');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('body[data-ready="true"]').waitFor();
    await page.locator('#scene').scrollIntoViewIfNeeded();
    assert.match(await page.locator('#verdict').textContent(), /^Failed/);
    const sf = async () => +(await page.locator('body').getAttribute('data-sf'));
    const tap = async (x, y) => {
      const p = await page.evaluate(([x, y]) => window.__labs.toScreen(x, y), [x, y]);
      const box = await page.locator('#scene').boundingBox();
      await page.mouse.click(box.x + p.x, box.y + p.y);
    };
    const plank = await sf();

    await page.getByRole('radio', { name: 'Delete' }).click();
    await page.locator('.hit[data-member="0"]').dispatchEvent('pointerdown');
    assert.match(await page.locator('#verdict').textContent(), /Nothing built yet/);

    await page.getByRole('radio', { name: 'Draw' }).click();
    await tap(0, 0); await tap(4000, 0); await tap(4000, 0); await tap(8000, 0);
    await page.getByRole('radio', { name: 'Pin joints' }).click();
    await tap(0, 0); await tap(4000, 2000); await tap(4000, 2000); await tap(8000, 0); await tap(4000, 2000); await tap(4000, 0);
    assert.match(await page.locator('.mass').textContent(), /5 members/);
    assert.match(await page.locator('#verdict').textContent(), /move freely/);

    await page.getByRole('radio', { name: 'Supports' }).click();
    await tap(0, 0); await tap(8000, 0); await tap(8000, 0);
    await page.getByRole('button', { name: '+ Car' }).click();
    const truss = await sf();
    assert.ok(truss > 1 && truss > 2 * plank, `truss ${truss} vs plank ${plank}`);

    await page.getByRole('button', { name: 'Undo' }).click(); // removes the car
    assert.equal(await page.locator('.load').count(), 0);
    await page.getByRole('button', { name: '+ Car' }).click();

    await page.reload();
    await page.locator('body[data-ready="true"]').waitFor();
    assert.match(await page.locator('.mass').textContent(), /5 members/);
    assert.equal((await sf()).toFixed(2), truss.toFixed(2), 'design survives reload');

    // Edit a preset: remove a diagonal from the truss bridge
    await page.getByRole('radio', { name: 'Explore' }).click();
    await page.locator('#objects button', { hasText: 'Truss bridge' }).click();
    const before = await sf();
    await page.getByRole('button', { name: 'Edit this structure' }).click();
    assert.equal(await page.locator('#title').textContent(), 'Your truss bridge');
    assert.equal((await sf()).toFixed(3), before.toFixed(3));
    await page.getByRole('radio', { name: 'Delete' }).click();
    await page.locator('.hit[data-member="11"]').dispatchEvent('pointerdown');
    assert.notEqual((await sf()).toFixed(3), before.toFixed(3));
    assert.match(await page.locator('.mass').textContent(), /12 members/);
    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth));
    await page.screenshot({ path: `/tmp/build-${width}.png` });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
