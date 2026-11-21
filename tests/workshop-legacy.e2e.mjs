// A workshop saved before experiment records: parts, cuts and readings carry over and still replay; old named
// attempts are shown as historical snapshots, not as runs, and are not duplicated on reopening.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as M from '../workshop/model.mjs';

test('Workshop: legacy attempts become historical snapshots', async () => {
  const ws = M.newWorkshop(), id = M.addPartFromPreset(ws, 'gear20');
  M.cut(ws, id, { type: 'bore', D: 20.02 }); M.takeReading(ws, id, 'bore', 'caliper'); M.takeShaftReading(ws, 'g20a', 'caliper');
  const f = M.fitState(ws, id, ws.fit);
  ws.attempts = [
    { name: 'calipers on batch A', partId: id, partName: 'Gear blank, Ø20 bore', rev: 5, material: 'al6061', stock: ws.parts[0].stock, ops: ws.parts[0].ops, spec: ws.parts[0].spec, shaftId: 'g20a', range: ws.fit.range, bore: f.bore, shaft: f.shaft, outcome: f.outcome, clearance: f.clearance, lo: f.lo, hi: f.hi },
    { name: 'before measuring', partId: id, partName: 'Gear blank, Ø20 bore', rev: 5, material: 'al6061', stock: ws.parts[0].stock, ops: ws.parts[0].ops, spec: ws.parts[0].spec, shaftId: 'g20a', range: ws.fit.range, bore: null, shaft: null, outcome: 'needs-bore', clearance: null, lo: null, hi: null },
  ];
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 860 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(legacy => { if (!localStorage.getItem('seeded')) { localStorage.setItem('workshop.v1', legacy); localStorage.setItem('seeded', '1'); } }, JSON.stringify(ws));
    await page.goto(server.origin + '/workshop/index.html'); await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#r-rev').textContent(), 'r5', 'parts and cuts carried over');
    await page.getByRole('tab', { name: 'Experiments', exact: true }).click();
    assert.match(await page.locator('.nb-runs').first().textContent(), /No runs saved yet/, 'old attempts are not presented as runs');
    assert.equal(await page.locator('#history [data-history]').count(), 2);
    assert.match(await page.locator('#history').textContent(), /not recomputed, not checked, and are not runs/);
    assert.match(await page.locator('#history').textContent(), /calipers on batch A.*Can’t confirm with this instrument \(as saved\)/s);
    await page.locator('.nb-save').click();                                 // the carried-over readings still replay
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 1);
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor();
    await page.getByRole('tab', { name: 'Experiments', exact: true }).click();
    assert.equal(await page.locator('#history [data-history]').count(), 2, 'not duplicated on reopening');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
