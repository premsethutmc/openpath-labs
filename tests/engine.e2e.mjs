import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const width of [380, 1280]) test(`Engine World ${width}px: oil, history, Alaska cold start, drive`, async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/index.html');
    await page.locator('.obj.feature', { hasText: 'Engine World' }).click();
    await page.locator('body[data-ready="true"]').waitFor();
    assert.ok(await page.locator('#nogl').isHidden(), 'WebGL scene renders');
    assert.ok(await page.locator('#blendbox').isHidden());
    const turn = async () => { await page.locator('#key').click(); await page.waitForFunction(() => ['running', 'failed'].includes(document.body.dataset.phase)); };
    const reset = () => page.getByRole('button', { name: 'Reset and try again' }).click();

    // Chennai, fresh 5W-30: starts, quick oil pressure
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'running');
    assert.match(await page.locator('#start-results').innerText(), /Time until oil reaches the bearings\s+1\.0 s/);

    // Alaska, 4 days, 5W-30: too slow to fire; prediction recorded
    await reset();
    await page.getByRole('radio', { name: /Alaska/ }).click();
    assert.match(await page.locator('#g-temp').textContent(), /-35 °C/);
    await page.getByRole('button', { name: 'Yes, it starts' }).click();
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'failed');
    assert.match(await page.locator('#start-results').innerText(), /too slowly to fire[\s\S]*prediction was wrong/);

    // 20W-50: solid oil
    await reset();
    await page.getByRole('radio', { name: '20W-50' }).click();
    await turn();
    assert.match(await page.locator('#start-results').innerText(), /almost solid/);

    // 0W-20: starts, but oil takes several seconds to arrive
    await reset();
    await page.getByRole('radio', { name: '0W-20' }).click();
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'running');
    const t = await page.locator('#start-results').innerText();
    assert.match(t, /It started, but the bearings ran without fresh oil/);
    // Desert-aged 0W-20 thickens: cranking slower than fresh
    const fresh = +t.match(/Cranking speed\s+(\d+) rpm/)[1];
    await reset();
    await page.getByRole('radio', { name: /50,000 km/ }).click();
    assert.ok(await page.locator('#age-box').isVisible());
    await turn();
    const aged = +(await page.locator('#start-results').innerText()).match(/Cranking speed\s+(\d+) rpm/)[1];
    assert.ok(aged < fresh, `aged ${aged} < fresh ${fresh}`);

    // Blend your own shows the blend controls
    await page.getByRole('radio', { name: 'Blend your own' }).click();
    assert.ok(await page.locator('#blendbox').isVisible());

    // Drive: cold oil costs far more friction than warm oil
    await page.getByRole('radio', { name: '5W-30' }).click();
    const friction = async T => { await page.locator('#ot').fill(String(T)); return +(await page.locator('#drive-results').innerText()).match(/Lost to friction\s+([\d.]+) kW/)[1]; };
    const cold = await friction(-10), warm = await friction(95);
    assert.ok(cold > 2 * warm, `cold ${cold} vs warm ${warm}`);
    assert.match(await page.locator('#drive-results').innerText(), /Peak cylinder pressure\s+\d+ bar/);
    assert.equal(await page.locator('#pv polyline').count(), 1);
    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
    await page.screenshot({ path: `/tmp/engine-${width}.png` });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
