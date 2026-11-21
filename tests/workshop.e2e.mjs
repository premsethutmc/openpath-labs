import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../strength-lab/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html')));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try { res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

for (const width of [320, 390, 900]) test(`Workshop ${width}px: make parts, break them, notebook and quests`, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: true, isMobile: width < 700, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (!r.url().startsWith(server.origin)) errors.push(r.url()); });
    await page.goto(server.origin + '/');
    await page.locator('body[data-ready="true"]').waitFor();
    const result = page.locator('#result');
    const start = page.getByRole('button', { name: /Start test|Fit a new bar/ });
    const run = async () => { if ((await start.textContent()) !== 'Start test') await start.click(); await start.click(); await page.getByRole('button', { name: 'Fit a new bar' }).waitFor(); };

    // 1. Plain steel in tension
    await run();
    assert.match(await result.textContent(), /^Broke at 128\.8 kN, 60 mm .*cup-and-cone/);
    // 2. Sharp groove in steel
    await page.getByRole('radio', { name: 'Cut a groove' }).click();
    await page.getByRole('button', { name: 'Cut', exact: true }).click();
    assert.match(await page.locator('#part-readout').textContent(), /2 mm groove at 60, sharp tip.*Smallest diameter 16\.0 mm/);
    await run();
    assert.match(await result.textContent(), /at the groove.*36% weaker than test #1/);
    // 3. Cast iron, sharp then round groove
    await page.getByRole('radio', { name: 'Cast iron' }).click();
    await run();
    const sharp = await result.textContent();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Round (2 mm)' }).click();
    await page.getByRole('button', { name: 'Cut', exact: true }).click();
    await run();
    assert.match(sharp, /× the average/);
    assert.match(await result.textContent(), /stronger than test #3/);
    // 4. Twist cast iron
    await page.getByRole('radio', { name: 'Twist it' }).click();
    await run();
    assert.match(await result.textContent(), /45° spiral/);
    assert.equal(await page.locator('#graph polyline').count(), 1);
    // 5. Turned middle: steel vs cast iron
    await page.getByRole('radio', { name: 'Pull it' }).click();
    await page.getByRole('button', { name: 'New bar' }).click();
    await page.getByRole('radio', { name: 'Turn down' }).click();
    await page.getByRole('button', { name: 'Cut', exact: true }).click();
    await run();
    assert.match(await result.textContent(), /30 mm from the left grip.*sharp step/);
    await page.getByRole('radio', { name: 'Mild steel' }).click();
    await run();
    assert.match(await result.textContent(), /60 mm from the left grip.*thinnest/);
    assert.equal(await page.locator('#graph polyline').count(), 2, 'previous test shown for comparison');

    assert.equal(await page.locator('#notebook tr').count(), 7);
    assert.equal(await page.locator('#quests li.done').count(), 5);
    assert.ok(await page.evaluate(() => innerWidth === document.documentElement.scrollWidth), 'no sideways scroll');
    for (const b of await page.locator('main button:visible').all()) {
      const box = await b.boundingBox();
      assert.ok(box.height >= 44, `${await b.textContent()} touch target`);
    }
    if (width === 390) await page.screenshot({ path: '/tmp/workshop-390.png', fullPage: true });
    // Notebook survives reload
    await page.reload();
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#notebook tr').count(), 7);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
