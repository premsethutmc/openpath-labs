import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const width of [360, 1280]) test(`Labs ${width}px: dashboard → playground, guided path, drag, inspect, scenarios`, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 820 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const mod = name => page.getByRole('tab', { name }).click();
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(r.url()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    errors.length = 0;
    await page.goto(server.origin + '/');
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('.stage').count(), 10);
    assert.equal(await page.locator('.stage.live .obj').count(), 9); // six structures + Engine World, Flow Tunnel, Pump House
    await page.locator('.obj', { hasText: 'Footbridge' }).click();
    await page.waitForURL(/playground\/(index\.html)?#footbridge/);
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#title').textContent(), 'Footbridge');
    assert.match(await page.locator('#verdict').textContent(), /Comfortably safe/);

    // Guided path: step 1 → predict (near support) → crowd → aluminium
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Less', exact: true }).click();
    assert.match(await page.locator('.result').textContent(), /You were right: less\. Biggest movement: [\d.]+ mm → [\d.]+ mm/);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Unsafe', exact: true }).click();
    assert.match(await page.locator('.result').textContent(), /Not quite: safe\. Safety factor: [\d.]+ → 2\.0/);
    assert.equal(await page.locator('#scenarios [aria-checked="true"]').textContent(), 'Festival crowd');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    assert.match(await page.locator('.result').textContent(), /You were right: more/);

    // Inspect shows live equation
    assert.match(await page.locator('#inspect').textContent(), /σ = N\/A ± M·c\/I/);

    // Drag the person along the deck: deflection changes
    await mod('Scenario');
    await page.getByRole('radio', { name: 'Normal day' }).click();
    const before = await page.locator('#s-defl').textContent();
    const load = page.locator('.load.draggable').first();
    await page.locator('#scene').scrollIntoViewIfNeeded();
    const box = await load.boundingBox(), scene = await page.locator('#scene').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(scene.x + scene.width * 0.5, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    assert.notEqual(await page.locator('#s-defl').textContent(), before);

    // Truss bridge in Explore: truck makes it work hard; tap a member to inspect
    await page.getByRole('radio', { name: 'Explore' }).click();
    assert.ok(await page.locator('#guide').isHidden());
    await page.locator('#objects button', { hasText: 'Truss bridge' }).click();
    await mod('Loads');
    await page.getByRole('button', { name: '+ Loaded truck' }).click();
    const sf = +(await page.locator('body').getAttribute('data-sf'));
    assert.ok(sf > 1 && sf < 3, 'truck loads the truss');
    await page.locator('.hit[data-member="4"]').dispatchEvent('pointerdown');
    assert.match(await page.locator('#inspect h2').textContent(), /Top chord 5/);
    assert.match(await page.locator('#inspect').textContent(), /Buckling load P = π²EI\/L²/);

    // Bamboo + two trucks fails visibly
    await mod('Material & size');
    await page.getByRole('radio', { name: 'Bamboo' }).click();
    await mod('Loads');
    await page.getByRole('button', { name: '+ Loaded truck' }).click();
    assert.match(await page.locator('#verdict').textContent(), /^Failed/);

    // Column: rod vs tube
    await page.locator('#objects button', { hasText: 'Building column' }).click();
    const rod = +(await page.locator('body').getAttribute('data-sf'));
    await mod('Material & size');
    await page.getByRole('radio', { name: /tube/ }).click();
    assert.ok(+(await page.locator('body').getAttribute('data-sf')) > 4 * rod);

    // Forces toggle shows reactions
    await page.getByRole('button', { name: 'Forces' }).click();
    assert.ok(await page.locator('#scene .force').count() >= 1);

    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
    for (const b of await page.locator('main button:visible, .bar button:visible').all()) {
      const r = await b.boundingBox();
      assert.ok(r.height >= 36, `touch target ${await b.textContent()}`);
    }
    await page.locator('#objects button', { hasText: 'Truss bridge' }).click();
    await page.screenshot({ path: `/tmp/labs-${width}.png`, fullPage: width < 700 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
