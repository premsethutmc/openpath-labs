// Thermal bench: the same open bench answers two different questions with no lesson code.
// Q1 "Design a cooling system for a 20 W device" — the learner's temperature limit fails, Explain shows the fin array's
//    convection dominates, the learner raises h and it passes.
// Q2 "Why does a sleeve on this thin pipe increase its heat loss?" — critical radius, a sweep with a peak, thermometers
//    whose layer-by-layer drops add up to the difference of their readings.
// Plus: build from an empty bench = preset, runs saved, compared and reproduced after reload. Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as M from '../thermal/model.mjs';

for (const width of [360, 1280]) test(`Thermal bench ${width}px: two questions, one bench`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/thermal/index.html'); await page.locator('body[data-ready="true"]').waitFor();
    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const set = async (sel, v) => { const el = page.locator(sel); if (await el.evaluate(e => e.tagName) === 'SELECT') await el.selectOption(String(v)); else { await el.fill(String(v)); await el.dispatchEvent('change'); } };
    const out = k => page.locator(`[data-out="${k}"] dd`).textContent();
    const save = async name => { await tab('Experiments'); await page.locator('.nb-name').fill(name); await page.locator('.nb-save').click(); await page.locator('#m-experiments .msg.okmsg').waitFor(); };
    assert.equal(await page.locator('.mission, [data-module="guide"]').count(), 0, 'no lesson on this bench');

    // ---- build the cooling setup from an empty bench; it must equal the preset ----
    await page.getByRole('button', { name: 'Empty bench' }).click();
    assert.match(await page.locator('#status').textContent(), /Add at least one layer/);
    await tab('Build');
    await page.getByRole('radio', { name: 'Heat source' }).click(); await set('#startQ', 20); await set('#area', 0.0025); await set('#ambient', 35);
    await page.getByRole('button', { name: '+ Contact resistance' }).click(); await set('#lp-Rc', 1);
    await page.getByRole('button', { name: '+ Conduction layer' }).click(); await set('#lp-material', 'alAlloy'); await set('#lp-t', 4);
    await page.getByRole('button', { name: '+ Fin array' }).click();
    for (const [k, v] of [['N', 8], ['L', 25], ['t', 1.5], ['w', 50], ['material', 'alAlloy'], ['h', 8], ['tip', 'convective']]) await set(`#lp-${k}`, v);
    await tab('Measure'); for (const a of ['start', 'L1', 'L2']) await page.locator(`[data-tm="${a}"]`).check();
    await tab('Limits'); await set('#lim-maxStartT', 80);
    const scratch = await page.locator('#readings dd').allTextContents();
    await page.getByRole('button', { name: 'Preset: Cooling a 20 W device' }).click();
    assert.deepEqual(await page.locator('#readings dd').allTextContents(), scratch, 'built by hand = preset');

    // ---- Q1: design a cooling system ----
    const dev = M.evaluate(M.fromPreset('device'));
    assert.equal(await out('startT'), `${dev.outputs.startT.value.toFixed(1)} °C`);
    assert.match(await page.locator('[data-check="maxStartT"]').textContent(), /over/);
    await tab('Explain');
    assert.match(await page.locator('#explain-head').textContent(), /^Start-face temperature governs: .* of your limit \(not met\)\.$/);
    assert.match(await page.locator('#explain-limiting').textContent(), /^#3 Fin array: .* limits the heat flow: 99 % of the total resistance/);
    const movers = await page.locator('#movers th').allTextContents();
    assert.ok(movers.some(m => /h on the fins/.test(m)) && movers.some(m => /Number of fins/.test(m)), movers.join(' | '));
    await save('natural convection');
    await tab('Build'); await page.locator('[data-sel="L3"]').click(); await set('#lp-h', 25);
    assert.match(await page.locator('[data-check="maxStartT"]').textContent(), /OK/);
    const fan = M.fromPreset('device'); M.setParam(fan, 'L3', 'h', 25);
    assert.equal(await out('startT'), `${M.evaluate(fan).outputs.startT.value.toFixed(1)} °C`);
    await save('small fan, h 25');
    await tab('Experiments'); await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.equal(await page.locator('.nb-changed').textContent(), 'layers.2.h');

    // ---- Q2: why does the sleeve on this thin pipe increase the heat loss? (new project, same bench) ----
    await page.locator('.nb-new').click();
    await page.getByRole('button', { name: 'Preset: Thin hot-water pipe, PTFE sleeve' }).click();
    await tab('Explain');
    const facts = (await page.locator('#m-explain .note').allTextContents()).join(' ');
    assert.match(facts, /Critical insulation radius .* increases the heat loss/); assert.match(facts, /heat flow rises by/);
    const pipe = M.fromPreset('pipe'), ins = M.inputs(pipe), i = ins.findIndex(x => x.label === '#3 Thickness (mm)');
    await tab('Sweep'); await set('#sw-in', i); await set('#sw-q', 'Q'); await set('#sw-from', 0.5); await set('#sw-to', 40);
    await page.getByRole('button', { name: 'Run sweep' }).click();
    const w = M.sweep(pipe, ins[i].ref, 'Q', 0.0005, 0.04, 40);
    assert.ok(w.peak);
    assert.match(await page.locator('#sweep-best').textContent(), new RegExp(`^Highest ${w.max.q.toFixed(2)} at ${(w.max.v * 1000).toFixed(2)} — a peak inside the range`));
    // thermometers on interfaces: tap one on the drawing, then explain the drop between two of them
    await page.locator('#path').scrollIntoViewIfNeeded();
    await page.locator('[data-thermo="start"]').dispatchEvent('click');
    assert.equal(await out('T:start'), '90.0 °C');
    await tab('Measure'); await set('#tmFrom', 'L1'); await set('#tmTo', 'L3');
    const e = M.evaluate(pipe), drop = e.outputs['T:L1'].value - e.outputs['T:L3'].value;
    assert.equal(await page.locator('#budget-total').textContent(), drop.toFixed(2));
    const rows = (await page.locator('.explain tbody tr:not(.chg) td:last-child').allTextContents()).map(Number);
    assert.equal(rows.length, 2); assert.ok(Math.abs(rows.reduce((a, b) => a + b, 0) - drop) < 0.011, 'the drops add up to the difference of the readings');
    await save('PTFE 2 mm');
    await tab('Sweep'); await set('#sw-in', i); await set('#sw-from', 0.5); await set('#sw-to', 40); await page.getByRole('button', { name: 'Run sweep' }).click();
    await page.locator('#useMin').click();
    await save('PTFE at the low end');

    // ---- an unsupported setup is explained, not solved ----
    await tab('Build'); await page.locator('[data-sel="L4"]').click(); await page.getByRole('button', { name: '+ Fin array' }).click();
    assert.match(await page.locator('#status').textContent(), /annular fins, which are not built/);
    await page.locator('[data-del="L5"]').click();

    // ---- everything reopens and reproduces ----
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor(); await tab('Experiments');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    assert.equal(await page.locator('[data-reproduced="false"]').count(), 0);
    assert.equal((await page.locator('.nb-open option').allTextContents()).length, 2);
    await page.locator('.nb-open').selectOption({ index: 0 });
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    await page.screenshot({ path: `/tmp/thermal-${width}.png`, fullPage: width < 700 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
