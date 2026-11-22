// Machine design bench, stage 2: the same open bench answers two new questions with no lesson code.
// (a) "Why does the machine shake at one speed?"  (b) "Why does the shaft fail after long running?"
// Evidence saved, compared and reproduced after a reload. Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as M from '../machine/model.mjs';

for (const width of [360, 1280]) test(`Machine dynamics ${width}px: shake at one speed, fail after long running`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/machine/index.html'); await page.locator('body[data-ready="true"]').waitFor();
    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const set = async (sel, v) => { const el = page.locator(sel); if (await el.evaluate(e => e.tagName) === 'SELECT') await el.selectOption(String(v)); else { await el.fill(String(v)); await el.dispatchEvent('change'); } };
    const out = async k => parseFloat(await page.locator(`[data-out="${k}"] dd`).textContent());
    const save = async name => { await tab('Experiments'); await page.locator('.nb-name').fill(name); await page.locator('.nb-save').click(); await page.locator('#m-experiments .msg.okmsg').waitFor(); };
    const noSideways = async what => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no sideways scroll: ${what}`);
    const speedInput = String(M.inputs(M.fromPreset('fan')).findIndex(i => i.label === 'Operating speed (rpm)'));
    const sweepPeak = async () => {
      await tab('Sweep'); await set('#sw-in', speedInput); await set('#sw-q', 'amplitude'); await set('#sw-from', 100); await set('#sw-to', 4000);
      await page.getByRole('button', { name: 'Run sweep' }).click();
      return +(await page.locator('#sweep-worst').getAttribute('data-at'));
    };
    assert.equal(await page.locator('.mission, [data-module="guide"]').count(), 0, 'no lesson on this bench');

    // ---- (a) why does the machine shake at one speed? ----
    await page.getByRole('button', { name: 'Preset: Fan shaft near its critical speed' }).click();
    assert.equal(await page.locator('#speedbox').isVisible(), true, 'speed-response plot shown');
    assert.match(await page.locator('[data-check="critical"]').textContent(), /over/);
    assert.match(await page.locator('[data-check="amplitude"]').textContent(), /over/);
    const crit1 = await out('critical'), ref = M.evaluate(M.fromPreset('fan'));
    assert.equal(crit1, +ref.outputs.critical.value.toFixed(0));
    await tab('Explain'); assert.match(await page.locator('#explain-head').textContent(), /^Vibration \(unbalance\) governs/);
    assert.ok((await page.locator('#movers th').allTextContents()).some(m => /Segment 1 diameter/.test(m)));
    await save('fan as given');
    const peak1 = await sweepPeak();
    assert.ok(Math.abs(peak1 - crit1) <= 100, `sweep peak ${peak1} rpm vs critical ${crit1} rpm`);
    // the learner thickens the shaft: the critical speed and the peak move up
    await tab('Shaft'); await set('[data-seg="s1"][data-key="d"]', 40);
    const crit2 = await out('critical'), peak2 = await sweepPeak();
    assert.ok(crit2 > 1.4 * crit1 && Math.abs(peak2 - crit2) <= 100, `peak ${peak2} rpm, critical ${crit2} rpm`);
    assert.match(await page.locator('[data-check="critical"]').textContent(), /OK/);
    assert.match(await page.locator('[data-check="amplitude"]').textContent(), /OK/);
    await save('Ø40');
    // ... or shortens the bearing span instead: the critical speed rises too
    await tab('Shaft'); await set('[data-seg="s1"][data-key="d"]', 32);
    await tab('Bearings'); await set('[data-bearing="b2"][data-key="x"]', 150); await set('[data-bearing="b3"][data-key="x"]', 750);
    assert.ok(await out('critical') > 1.3 * crit1);
    await noSideways('bearings with C and type');
    await tab('Experiments'); await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.equal(await page.locator('.nb-changed').textContent(), 'segments.0.d');

    // ---- (b) why does the shaft fail after long running? ----
    await page.locator('.nb-new').click();
    await page.getByRole('button', { name: 'Preset: Gear shaft with a sharp shoulder' }).click();
    assert.match(await page.locator('[data-check="strength"]').textContent(), /OK/);
    assert.match(await page.locator('[data-check="fatigue"]').textContent(), /over/);
    await tab('Explain');
    assert.match(await page.locator('#explain-head').textContent(), /^Fatigue \(DE-Goodman\) governs/);
    assert.match(await page.locator('#m-explain .note').first().textContent(), /Kf 2\.70/);
    const movers = await page.locator('#movers th').allTextContents();
    assert.ok(movers.some(m => /Stress raiser 1 Kt/.test(m)) && movers.some(m => /Segment 1 diameter/.test(m)), movers.join(' | '));
    await save('sharp shoulder');
    await tab('Shaft'); await noSideways('stress raisers');
    await set('[data-raiser="k9"][data-key="kind"]', 'roundFillet');
    assert.match(await page.locator('[data-check="fatigue"]').textContent(), /OK/);
    const fixed = M.fromPreset('shoulder'); M.setRaiser(fixed, 'k9', 'kind', 'roundFillet');
    assert.equal(await out('fatigueSF'), +M.evaluate(fixed).outputs.fatigueSF.value.toFixed(2));
    await save('rounded fillet');
    await tab('Experiments'); await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.match(await page.locator('.nb-changed').textContent(), /raisers\.0\.kind/);
    assert.equal(await page.locator('.nb-cmp tr.chg th', { hasText: 'Fatigue (DE-Goodman)' }).count(), 1);

    // ---- an operating speed is optional: empty = static check, and the fatigue limit says why it cannot be assessed ----
    await tab('Speed'); await set('#speed', '');
    assert.match(await page.locator('[data-check="fatigue"]').textContent(), /cannot assess/);
    assert.equal(await page.locator('#speedbox').isVisible(), false);
    await set('#speed', 1450);

    // ---- everything reopens and reproduces ----
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor(); await tab('Experiments');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    await page.locator('.nb-open').selectOption({ index: 0 });
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    for (const t of ['Loads', 'Speed', 'Limits', 'Learn']) { await tab(t); await noSideways(t); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
