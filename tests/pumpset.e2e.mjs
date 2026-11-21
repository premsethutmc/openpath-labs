// Pump set drive check: one pipework change flips the motor verdict with flow met in both; save, reopen, reproduce;
// motor passes but flow fails; preset equals a hand-configured project. Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as M from '../pumpset/model.mjs';

for (const width of [360, 1280]) test(`Pump set ${width}px: drive check journey`, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 860 }, hasTouch: width < 700, isMobile: width < 700 });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/pumpset/index.html');
    await page.locator('body[data-ready="true"]').waitFor();

    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const set = async (id, v) => { await page.locator(`#${id}`).fill(String(v)); await page.locator(`#${id}`).dispatchEvent('change'); };
    const verdicts = async () => [await page.locator('#vf-word').textContent(), await page.locator('#vd-word').textContent()];
    const readings = async () => page.locator('.readings dd').allTextContents();
    const expectReadings = proj => { const r = M.evaluate(proj); return [`${r.operating.flow.toFixed(2)} L/s`, `${r.operating.head.toFixed(2)} m`, `${(r.operating.shaftPower / 1000).toFixed(3)} kW`, `${r.operating.torque.toFixed(2)} N·m`, `${r.drive.rated / 1000} kW`, `${r.drive.margin >= 0 ? '+' : ''}${(r.drive.margin * 100).toFixed(1)} %`]; };

    // preset, run A
    await page.getByRole('button', { name: 'Preset: Overhead tank, 4-storey building' }).click();
    const ref = M.projectFromPreset('tank4');
    assert.deepEqual(await readings(), expectReadings(ref));
    assert.deepEqual(await verdicts(), ['Yes', 'Yes']);
    await tab('Runs'); await page.locator('#runName').fill('40 mm delivery'); await page.getByRole('button', { name: 'Save run' }).click();
    // one pipework change: 50 mm delivery bore → flow still met, motor overloaded
    await tab('Pipework'); await set('dD', 50);
    M.setPipe(ref, 'delivery', { D: 0.05 });
    assert.deepEqual(await readings(), expectReadings(ref));
    assert.deepEqual(await verdicts(), ['Yes', 'No']);
    assert.match(await page.locator('#design').textContent(), /flow is met, but the motor is overloaded/);
    await tab('Runs'); await page.locator('#runName').fill('50 mm delivery'); await page.getByRole('button', { name: 'Save run' }).click();
    const before = await readings();

    // reopen: numbers and verdicts reproduce
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor();
    assert.deepEqual(await readings(), before); assert.deepEqual(await verdicts(), ['Yes', 'No']);
    await tab('Runs');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.match(await page.locator('#m-runs').textContent(), /Changed between them: system\.delivery\.D/);
    const cmpRows = await page.locator('.cmp tbody tr').evaluateAll(rs => rs.map(r => [...r.children].map(c => c.textContent)));
    assert.deepEqual(cmpRows.find(r => r[0] === 'Flow met?'), ['Flow met?', 'yes', 'yes']);
    assert.deepEqual(cmpRows.find(r => r[0] === 'Motor OK?'), ['Motor OK?', 'yes', 'no']);

    // motor passes, flow fails
    await tab('Pipework'); await set('dD', 40); await set('tankH', 24);
    assert.deepEqual(await verdicts(), ['No', 'Yes']);
    assert.match(await page.locator('#design').textContent(), /motor copes, but the flow falls short/);

    // cavitation: the drive cannot be assessed (not a pass)
    await set('tankH', 18); await set('sumpL', -5); await set('wT', 80);
    assert.deepEqual(await verdicts(), ['No', 'Cannot assess']);
    assert.equal(await page.locator('#r-margin').textContent(), 'n/a');
    assert.match(await page.locator('#vd-why').textContent(), /cannot assess at this operating point/);
    await set('sumpL', -2.5); await set('wT', 30);

    // a hand-configured project equals the preset
    await page.getByRole('button', { name: '+ New project' }).click();
    await tab('Pipework'); await set('tankH', 6); await set('sumpL', -4); await set('dD', 50); await set('dL', 60); await page.locator('#dMat').selectOption('pvc'); await set('dE', 3);
    await tab('Required flow'); await set('req', 3);
    await tab('Motor'); await page.getByRole('radio', { name: /2\.2 kW, 2-pole/ }).click();
    const own = await readings();
    await page.getByRole('button', { name: 'Preset: Farm sump to field channel' }).click();
    assert.deepEqual(await readings(), own);
    assert.deepEqual(own, expectReadings(M.projectFromPreset('farm')));

    // refused input changes nothing
    await tab('Pipework'); await set('dL', -5);
    assert.match(await page.locator('#m-pipework .msg').textContent(), /length/);
    assert.deepEqual(await readings(), own);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
