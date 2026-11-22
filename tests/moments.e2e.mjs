import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const vp of [{ width: 390, height: 860, phone: true }, { width: 1280, height: 900, phone: false }]) test(`Moment view ${vp.width}px: pick a point, lever arms, ΣM = 0 with reactions, loads alone without`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.phone, hasTouch: vp.phone });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/playground/?view=moment&preset=shelf');   // the link a journey's teach step builds
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.locator('body[data-ready="true"]').waitFor();
    const moments = () => page.evaluate(() => window.__labs.moments());
    const tap = async (x, y) => {
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const p = await page.evaluate(([x, y]) => window.__labs.toScreen(x, y), [x, y]), box = await page.locator('#scene').boundingBox();
      if (vp.phone) await page.touchscreen.tap(box.x + p.x, box.y + p.y); else await page.mouse.click(box.x + p.x, box.y + p.y);
    };

    // Opened from a journey link: moments on, about the wall (the fixed support), reactions included.
    assert.equal(await page.locator('#t-moment').getAttribute('aria-pressed'), 'true');
    await page.locator('#moments').waitFor({ state: 'visible' });
    let m = await moments();
    assert.deepEqual([m.O.x, m.O.y, m.O.node], [0, 0, 0]);
    const books = m.rows.find(r => r.label === 'Books'), W = 15 * 9.81;
    assert.ok(Math.abs(books.M + W * 400) < 1e-6 && Math.abs(books.d - 400) < 1e-9, 'books at mid-shelf: M = −W × 400 mm');
    assert.ok(Math.abs(m.sum) < 1e-6 * m.scale);
    assert.equal(await page.locator('#m-sum').textContent(), '0');
    assert.match(await page.locator('#m-verdict').textContent(), /equilibrium/);
    assert.ok(await page.locator('#scene .moments .loa').count() >= 2, 'lines of action drawn');
    assert.match(await page.locator('.mtable').textContent(), /Fixed support moment/);

    // Loads alone: the wall must supply the opposite moment.
    await page.locator('#m-react').click();
    m = await moments();
    assert.ok(m.rows.every(r => r.kind !== 'reaction' && !r.id.startsWith('reaction')));
    assert.ok(m.sum < 0 && Math.abs(m.sum - m.sumLoads) < 1e-9);
    assert.match(await page.locator('#m-verdict').textContent(), /supports must supply .* ↺/);
    await page.locator('#m-react').click();

    // Tap the shelf right under the books: their line of action passes through O, so their moment is zero; ΣM stays zero.
    await tap(400, 0);
    m = await moments();
    assert.deepEqual([m.O.x, m.O.y, m.O.node], [400, 0, null]);
    assert.ok(Math.abs(m.rows.find(r => r.label === 'Books').M) < 1e-6);
    assert.ok(Math.abs(m.sum) < 1e-6 * m.scale);
    // Snap to the free end by tapping near it, and pick the wall again from the joint chips.
    await tap(790, 15);
    assert.equal((await moments()).O.node, 1);
    await page.getByRole('radio', { name: 'Joint 1 (support)' }).click();
    assert.equal((await moments()).O.node, 0);

    // Off: the overlay goes; on again from the scene button on another preset.
    await page.locator('#t-moment').click();
    assert.equal(await page.locator('#scene .moments').count(), 0);
    await page.locator('#objects button', { hasText: 'Jib crane' }).click();
    await page.locator('#t-moment').click();
    m = await moments();
    const bucket = m.rows.find(r => r.label === 'Concrete bucket');
    assert.ok(Math.abs(bucket.d - 3000) < 1e-6, 'bucket lever arm about the mast foot is its horizontal distance');
    assert.ok(Math.abs(m.sum) < 1e-6 * m.scale);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
