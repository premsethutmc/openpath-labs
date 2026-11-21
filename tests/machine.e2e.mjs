// Machine design bench: the same open bench answers two different questions with no lesson code.
// Q1 "Why does this shaft bend too far?"  Q2 "Where should I move the bearings to cut the load on one of them?"
// Plus: build from an empty bench, scratch = preset, drag a bearing, evidence saved and reproduced. Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as M from '../machine/model.mjs';

for (const width of [360, 1280]) test(`Machine design ${width}px: two questions, one bench`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/machine/index.html'); await page.locator('body[data-ready="true"]').waitFor();
    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const set = async (sel, v) => { const el = page.locator(sel); if (await el.evaluate(e => e.tagName) === 'SELECT') await el.selectOption(String(v)); else { await el.fill(String(v)); await el.dispatchEvent('change'); } };
    const out = async k => parseFloat(await page.locator(`[data-out="${k}"] dd`).textContent());
    const save = async name => { await tab('Experiments'); await page.locator('.nb-name').fill(name); await page.locator('.nb-save').click(); await page.locator('#m-experiments .msg.okmsg').waitFor(); };
    assert.equal(await page.locator('.mission, [data-module="guide"]').count(), 0, 'no lesson on this bench');

    // ---- build a shaft from an empty bench ----
    await page.getByRole('button', { name: 'Empty bench' }).click();
    assert.match(await page.locator('#status').textContent(), /at least one shaft segment/);
    await tab('Shaft'); await page.getByRole('button', { name: '+ Add segment' }).click();
    await set('[data-seg="s1"][data-key="L"]', 500);
    await tab('Bearings'); await page.getByRole('button', { name: '+ Add bearing' }).click();
    assert.match(await page.locator('#status').textContent(), /at least two bearings/);
    await page.getByRole('button', { name: '+ Add bearing' }).click();
    assert.match(await page.locator('#status').textContent(), /same place/);
    await set('[data-bearing="b2"][data-key="x"]', 0); await set('[data-bearing="b3"][data-key="x"]', 500);
    await tab('Loads'); await page.getByRole('button', { name: '+ Add force' }).click();
    const mine = M.emptySetup(); M.addSegment(mine, { L: 500, d: 30 }); M.addBearing(mine, 0); M.addBearing(mine, 500); M.addForce(mine, 250, 1000);
    const me = M.evaluate(mine);
    assert.equal(await out('R:b2'), +me.outputs['R:b2'].value.toFixed(1));
    assert.equal(await out('deflection'), +me.outputs.deflection.value.toFixed(4));

    // ---- Q1: why does this shaft bend too far? (preset, then the learner's own changes) ----
    await page.getByRole('button', { name: 'Preset: Overhung pulley shaft' }).click();
    assert.match(await page.locator('[data-check="deflection"]').textContent(), /over/);
    await tab('Explain');
    assert.match(await page.locator('#explain-head').textContent(), /^Deflection governs: .* of your limit\.$/);
    const movers = await page.locator('#movers th').allTextContents();
    assert.ok(movers.some(m => /Segment 1 diameter/.test(m)) && movers.some(m => /Bearing 2 position/.test(m)), movers.join(' | '));
    await save('pulley as given');
    // move bearing 2 towards the pulley: drag on the drawing (desktop) or type it (phone)
    if (width >= 700) {
      await page.locator('#shaft').scrollIntoViewIfNeeded();
      const box = await page.locator('#shaft').boundingBox(), px = x => box.x + (40 + x / 400 * 520) / 600 * box.width, py = box.y + (92 + 40) / 210 * box.height;
      await page.mouse.move(px(250), py); await page.mouse.down(); await page.mouse.move(px(320), py, { steps: 6 }); await page.mouse.move(px(360), py, { steps: 6 }); await page.mouse.up();
      await tab('Bearings'); assert.equal(await page.locator('[data-bearing="b3"][data-key="x"]').inputValue(), '360');
    } else { await tab('Bearings'); await set('[data-bearing="b3"][data-key="x"]', 360); }
    await tab('Shaft'); await set('[data-seg="s1"][data-key="d"]', 35);
    assert.match(await page.locator('[data-check="deflection"]').textContent(), /OK/);
    const fixed = M.fromPreset('pulley'); M.setBearing(fixed, 'b3', 'x', 360); M.setSegment(fixed, 's1', 'd', 35);
    assert.equal(await out('deflection'), +M.evaluate(fixed).outputs.deflection.value.toFixed(4));
    await save('bearing 2 at 360, Ø35');

    // ---- Q2: where should I move the bearings to cut the load on bearing 2? (same bench, different preset) ----
    await tab('Experiments'); await page.locator('.nb-new').click();
    await page.getByRole('button', { name: 'Preset: Gearbox countershaft' }).click();
    assert.match(await page.locator('[data-check="R:b5"]').textContent(), /over/);
    await save('countershaft as given');
    await tab('Sweep'); await set('#sw-in', String(M.inputs(M.fromPreset('countershaft')).findIndex(i => i.label === 'Bearing 2 position (mm)')));
    await set('#sw-q', 'R:b5'); await set('#sw-from', 225); await set('#sw-to', 300); await page.getByRole('button', { name: 'Run sweep' }).click();
    assert.match(await page.locator('#sweep-best').textContent(), /^Lowest at 300\.0/);
    await page.getByRole('button', { name: 'Use 300.0' }).click();
    assert.match(await page.locator('[data-check="R:b5"]').textContent(), /OK/);
    await save('bearing 2 at 300');
    await tab('Experiments'); await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.equal(await page.locator('.nb-changed').textContent(), 'bearings.1.x');

    // ---- scratch = preset, and everything reopens ----
    await page.getByRole('button', { name: 'Preset: Gearbox countershaft' }).click();
    const preset = await page.locator('#readings dd').allTextContents();
    await page.getByRole('button', { name: 'Empty bench' }).click();
    await tab('Shaft'); for (const [L, d] of [[60, 25], [180, 32], [60, 25]]) { await page.getByRole('button', { name: '+ Add segment' }).click(); const id = (await page.locator('[data-seg][data-key="L"]').last().getAttribute('data-seg')); await set(`[data-seg="${id}"][data-key="L"]`, L); await set(`[data-seg="${id}"][data-key="d"]`, d); }
    await tab('Bearings'); for (const x of [30, 270]) { await page.getByRole('button', { name: '+ Add bearing' }).click(); const id = await page.locator('[data-bearing][data-key="x"]').last().getAttribute('data-bearing'); await set(`[data-bearing="${id}"][data-key="x"]`, x); await set(`[data-bearing="${id}"][data-key="rating"]`, 3000); }
    await tab('Loads'); for (const [kind, x, v] of [['force', 100, 1800], ['torque', 100, 60], ['force', 220, 3200], ['torque', 220, -60]]) {
      await page.getByRole('button', { name: kind === 'force' ? '+ Add force' : '+ Add torque' }).click();
      const id = await page.locator('[data-load][data-key="x"]').last().getAttribute('data-load');
      await set(`[data-load="${id}"][data-key="x"]`, x); await set(`[data-load="${id}"][data-key="${kind === 'force' ? 'F' : 'T'}"]`, v);
    }
    await tab('Limits'); await set('#lim-minSF', 2.5); await set('#lim-deflection', 0.05);
    assert.deepEqual(await page.locator('#readings dd').allTextContents(), preset, 'built by hand = preset');
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor(); await tab('Experiments');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    assert.equal((await page.locator('.nb-open option').allTextContents()).length, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
