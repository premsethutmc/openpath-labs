// Workshop: stock-built and preset parts match; calipers can't confirm, a gauge can; recut evidence; four outcomes;
// drawing target and guidance level never change a result or a control. Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const width of [360, 1280]) test(`Workshop ${width}px: make, measure, recut, fit`, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 860 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/workshop/index.html');
    await page.locator('body[data-ready="true"]').waitFor();

    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const radio = (group, name) => page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: false }).click();
    const cutOp = async (op, size) => {
      await tab('Lathe'); await radio('Operation', op);
      if (op === 'Drill') await page.locator('#opSize').selectOption(size); else await page.locator('#opSize').fill(size);
      await page.getByRole('button', { name: 'Cut', exact: true }).click();
      await page.locator('#lathe .msg.okmsg').waitFor();
    };
    const readBore = async inst => { await tab('Measure'); await radio('Feature', 'Bore'); await radio('Instrument', inst); await page.getByRole('button', { name: 'Take reading' }).click(); };
    const readShaft = async (shaft, inst) => { await tab('Fit'); await radio('Shaft', shaft); await radio('Shaft instrument', inst); await page.getByRole('button', { name: 'Measure shaft' }).click(); };
    const fitText = async () => { await tab('Fit'); return (await page.locator('#fit .result').first().textContent()).trim(); };
    const readings = async () => { await tab('Measure'); return page.locator('#measure tbody td:nth-child(4)').allTextContents(); };

    // ---- from stock, by hand: the same plan as the "Gear blank" preset ----
    await page.getByRole('button', { name: '+ New from stock' }).click();
    await radio('Material', 'Aluminium'); await radio('Bar diameter', 'Ø65');
    await page.locator('#stockL').fill('30'); await page.locator('#stockL').dispatchEvent('change');
    await cutOp('Face', '25'); await cutOp('Turn OD', '60'); await cutOp('Drill', '18.0'); await cutOp('Bore', '19.95');
    await cutOp('Bore', '20');
    assert.equal(await page.locator('#r-rev').textContent(), 'r5');
    // calipers cannot settle a sliding fit
    await readBore('Vernier caliper'); await readShaft('Ø20 ground shaft, batch A', 'Vernier caliper');
    await page.getByRole('button', { name: 'H7/g6 sliding' }).click();
    assert.equal(await fitText(), 'Can’t confirm with this instrument');
    // a better gauge can: too tight
    await readBore('Dial bore gauge'); await readShaft('Ø20 ground shaft, batch A', 'Outside micrometer');
    assert.equal(await fitText(), 'Too tight');
    const tight = await page.locator('#fit .result + .note').textContent();
    // changing only the drawing target never changes the fit
    await tab('Drawing'); await page.locator('#sT').fill('19.98'); await page.locator('#sU').fill('0.01'); await page.getByRole('button', { name: 'Apply drawing' }).click();
    assert.equal(await fitText(), 'Too tight'); assert.equal(await page.locator('#fit .result + .note').textContent(), tight);
    assert.equal(await page.locator('#r-rev').textContent(), 'r5');
    // guidance level: same controls, same result
    const controls = async () => page.locator('.side button, .side input, .side select').evaluateAll(els => els.map(e => `${e.tagName}:${e.textContent.trim() || e.id}:${e.disabled}:${e.getAttribute('aria-checked')}`));
    const before = [await controls(), await fitText()];
    for (const g of ['Equations', 'Off', 'Hints']) { await page.getByRole('radio', { name: g, exact: true }).click(); assert.deepEqual([await controls(), await fitText()], before, `guidance ${g}`); }
    // recut: old evidence stays on r5, a fresh reading is required
    const shownBefore = await readings();
    await cutOp('Bore', '20.02');
    assert.match(await page.locator('#r-bore').textContent(), /stale \(r5\)/);
    assert.match(await fitText(), /recut since your last bore reading \(r5\)/);
    await tab('Measure');
    assert.equal(await page.locator('#measure tbody tr.old').count(), shownBefore.length);
    assert.deepEqual(await readings(), shownBefore, 'old readings unchanged, now marked superseded');
    await readBore('Dial bore gauge');
    assert.equal(await fitText(), 'Within range');
    // a different shaft
    await readShaft('Ø20 bright-drawn bar', 'Outside micrometer');
    assert.equal(await fitText(), 'Too loose');
    await tab('Experiments'); await page.locator('.nb-name').fill('stock-built, bright bar'); await page.locator('.nb-save').click();
    assert.match(await page.locator('#experiments .msg').textContent(), /Saved/);
    const stockReadings = await readings();

    // ---- the preset: same object, same results ----
    await page.getByRole('button', { name: 'Preset: Gear blank, Ø20 bore' }).click();
    assert.equal(await page.locator('#r-rev').textContent(), 'r4');
    assert.match(await page.locator('#subtitle').textContent(), /opened from a preset/);
    await cutOp('Bore', '20');
    await readBore('Vernier caliper'); await readBore('Dial bore gauge');
    await cutOp('Bore', '20.02'); await readBore('Dial bore gauge');
    assert.deepEqual(await readings(), stockReadings, 'preset and stock-built parts give identical readings');
    await readShaft('Ø20 bright-drawn bar', 'Outside micrometer');
    assert.equal(await fitText(), 'Too loose');
    await tab('Experiments'); await page.locator('.nb-name').fill('preset, bright bar'); await page.locator('.nb-save').click();
    await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    const changed = await page.locator('.nb-cmp tr.chg th').allTextContents();
    // same bore reading on both parts; the shaft is one physical object, so measuring it again gives the
    // micrometer's next reading, and the clearance follows it
    assert.ok(!changed.some(t => /^Bore reading/.test(t)), `bore reading should match: ${changed}`);
    assert.ok(changed.some(t => /bright-drawn bar reading/.test(t)) && changed.some(t => /^Clearance/.test(t)), `unexpected differences: ${changed}`);
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2, 'both runs re-cut and re-measure to the same numbers');

    // ---- return later ----
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#r-rev').textContent(), 'r6');
    assert.equal(await page.locator('#r-fit').textContent(), 'Too loose');
    await tab('Experiments'); assert.equal(await page.locator('[data-reproduced="true"]').count(), 2, 'runs reproduce after reopening');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
