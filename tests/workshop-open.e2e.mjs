// Open workshop: two different jobs in the same fluid bench with no script, scratch = preset, and the same shared
// project/evidence tools on a non-fluid bench (Force Playground). Phone and desktop.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as C from '../circuit/model.mjs';

async function open(browser, server, width, path) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 700, isMobile: width < 700 });
  page.setDefaultTimeout(6000);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(server.origin + path); await page.locator('body[data-ready="true"]').waitFor();
  return page;
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const set = async (page, sel, v) => { const el = page.locator(sel); if (await el.evaluate(e => e.tagName) === 'SELECT') await el.selectOption(String(v)); else { await el.fill(String(v)); await el.dispatchEvent('change'); } };
const add = async (page, name, params = {}) => { await tab(page, 'Build'); await page.getByRole('button', { name: `+ ${name}`, exact: true }).click(); for (const [k, v] of Object.entries(params)) await set(page, `#pp-${k}`, v); };
const readings = page => page.locator('#readings dd').allTextContents();
const saveRun = async (page, name) => { await tab(page, 'Experiments'); await page.locator('.nb-name').fill(name); await page.locator('.nb-save').click(); await page.locator('.nb-runs .okmsg, #m-experiments .msg.okmsg, .msg.okmsg').first().waitFor(); };

for (const width of [360, 1280]) test(`Open workshop ${width}px: two jobs, scratch = preset, shared evidence on a solids bench`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    // ---- Job 1: assemble a pumped line from an empty workspace and check a motor against my own flow target ----
    const page = await open(browser, server, width, '/circuit/index.html');
    await page.getByRole('button', { name: 'Empty workspace' }).click();
    assert.match(await page.locator('#status').textContent(), /start with a source reservoir/);
    await add(page, 'Source reservoir', { surface: -2, outlet: -2, inlet: 'footValve' });
    await add(page, 'Pipe', { D: 50, L: 5, material: 'steel', rise: 2 });
    await add(page, 'Centrifugal pump');
    assert.match(await page.locator('#status').textContent(), /must end at a receiving reservoir/, 'an unfinished line is explained, not solved');
    await add(page, 'Pipe', { D: 40, L: 25, material: 'steel', rise: 12 });
    await add(page, 'Receiving reservoir', { surface: 12 });
    await tab(page, 'Duty & motor'); await set(page, '#req', 2.5); await set(page, '#motor', '2p-1.1');
    // same line through the model
    const mine = C.emptySetup();
    C.addPart(mine, 'source', { surface: -2, outlet: -2, inlet: 'footValve' }); C.addPart(mine, 'pipe', { D: 0.05, L: 5, material: 'steel', rise: 2 }); C.addPart(mine, 'pump');
    C.addPart(mine, 'pipe', { D: 0.04, L: 25, material: 'steel', rise: 12 }); C.addPart(mine, 'sink', { surface: 12 }); C.setRequiredFlow(mine, 2.5); C.setParam(mine, 'p3', 'motorId', '2p-1.1');
    const m = C.evaluate(mine);
    const word = { pass: 'Yes', fail: 'No', 'cannot-assess': 'Cannot assess', 'not-applicable': 'Not applicable' };
    assert.equal(await page.locator('[data-verdict="flow"] .vword').textContent(), word[m.verdicts.flow.value]);
    assert.equal(await page.locator('[data-verdict="drive"] .vword').textContent(), word[m.verdicts.drive.value]);
    assert.equal(await page.locator('[data-out="flow"] dd').textContent(), `${m.outputs.flow.value.toFixed(2)} L/s`);
    await saveRun(page, 'my pump line, 1.1 kW');
    await tab(page, 'Duty & motor'); await set(page, '#motor', '2p-2.2');
    await saveRun(page, 'my pump line, 2.2 kW');

    // ---- Job 2: a different learner starts from a preset, adds a restriction, chooses where to measure, explains the loss ----
    await tab(page, 'Experiments'); await page.locator('.nb-new').click();
    await page.getByRole('button', { name: 'Preset: Gravity feed between two tanks' }).click();
    await saveRun(page, 'gravity, no plate');
    const q0 = await page.locator('[data-out="flow"] dd').textContent();
    await tab(page, 'Build'); await page.locator('[data-sel="p3"]').click();             // the valve
    await add(page, 'Orifice plate', { beta: 0.4 });
    await tab(page, 'Measure'); await page.locator('[data-gauge="p2"]').uncheck(); await page.locator('[data-gauge="p6"]').check();
    assert.notEqual(await page.locator('[data-out="flow"] dd').textContent(), q0, 'the restriction changes the flow');
    await set(page, '#exFrom', 'p3'); await set(page, '#exTo', 'p6');
    const rows = await page.locator('.explain tbody tr').evaluateAll(rs => rs.map(r => [r.children[0].textContent, r.children[1].textContent]));
    assert.match(rows[0][0], /#4 Orifice plate .* orifice plate \(permanent loss\)/);
    const g3 = parseFloat(await page.locator('[data-out="gauge:p3"] dd').textContent()), g6 = parseFloat(await page.locator('[data-out="gauge:p6"] dd').textContent());
    assert.ok(Math.abs(parseFloat(await page.locator('#explain-total').textContent()) - (g6 - g3)) < 0.011, 'the explanation adds up to the two gauge readings');
    await saveRun(page, 'gravity, β 0.4 plate');
    await tab(page, 'Experiments'); await page.locator('[data-cmp="0"]').check(); await page.locator('[data-cmp="1"]').check();
    assert.match(await page.locator('.nb-changed').textContent(), /chain\.3/);
    // unsupported: a branch gets a specific explanation and cannot be saved
    await add(page, 'Tee (branch)');
    assert.match(await page.locator('#status').textContent(), /Tee \(branch\): Branches need a network solver/);
    await tab(page, 'Experiments'); await page.locator('.nb-save').click();
    assert.match(await page.locator('#m-experiments .msg').textContent(), /Not saved: #\d+ Tee/);
    await tab(page, 'Build'); await page.locator('[data-del="p7"]').click();
    // reopen: both projects and their runs reproduce
    await page.reload(); await page.locator('body[data-ready="true"]').waitFor();
    await tab(page, 'Experiments');
    assert.equal(await page.locator('[data-reproduced="true"]').count(), 2);
    const projects = await page.locator('.nb-open option').allTextContents();
    assert.equal(projects.length, 2); assert.match(projects[0], /2 runs/);

    // ---- scratch = preset: build the gravity preset by hand from an empty workspace ----
    await page.locator('.nb-new').click();
    await page.getByRole('button', { name: 'Empty workspace' }).click();
    await add(page, 'Source reservoir', { surface: 10, outlet: 8 });
    await add(page, 'Pipe', { L: 20, rise: -8 }); await add(page, 'Gate valve'); await add(page, 'Pipe', { L: 30 }); await add(page, 'Receiving reservoir', { surface: 0 });
    await tab(page, 'Measure'); await page.locator('[data-gauge="p2"]').check(); await page.locator('[data-gauge="p3"]').check();
    const hand = await readings(page);
    await page.getByRole('button', { name: 'Preset: Gravity feed between two tanks' }).click();
    assert.deepEqual(await readings(page), hand);
    const pre = C.evaluate(C.fromPreset('gravity')).outputs;
    assert.equal(hand[0], `${pre.flow.value.toFixed(2)} L/s`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    assert.deepEqual(page.errors, []);

    // ---- the same project and evidence tools on a non-fluid bench: Force Playground (solids) ----
    const pg = await open(browser, server, width, '/playground/index.html#shelf');
    await pg.getByRole('radio', { name: 'Learn' }).click();
    assert.equal(await pg.getByRole('button', { name: 'Edit this structure' }).count(), 1, 'editing is not locked behind a guidance mode');
    await saveRun(pg, 'timber shelf');
    await tab(pg, 'Material & size'); await pg.locator('#materials button', { hasText: 'Aluminium' }).click();
    await saveRun(pg, 'aluminium shelf');
    await tab(pg, 'Experiments'); await pg.locator('[data-cmp="0"]').check(); await pg.locator('[data-cmp="1"]').check();
    assert.equal(await pg.locator('.nb-changed').textContent(), 'state.material');
    const sf = await pg.locator('.nb-cmp tbody tr').first().evaluate(r => [...r.children].map(c => c.textContent));
    assert.equal(sf[0], 'Safety factor'); assert.notEqual(sf[1], sf[2]);
    await pg.reload(); await pg.locator('body[data-ready="true"]').waitFor(); await tab(pg, 'Experiments');
    assert.equal(await pg.locator('[data-reproduced="true"]').count(), 2);

    // Truss bridge: an editable copy keeps the scenario and member roles, so the learner's edit is what changes the result
    await pg.getByRole('button', { name: 'Truss bridge', exact: true }).click();
    await tab(pg, 'Scenario'); await pg.getByRole('radio', { name: /Festival crowd/ }).click();
    const sf0 = await pg.locator('#s-sf').textContent();
    await saveRun(pg, 'truss, crowd');
    await pg.getByRole('button', { name: 'Edit this structure' }).click();
    assert.equal(await pg.locator('#s-sf').textContent(), sf0, 'the copy solves exactly like the original');
    await tab(pg, 'Scenario'); assert.equal(await pg.getByRole('radio', { name: /Festival crowd/ }).getAttribute('aria-checked'), 'true');
    await saveRun(pg, 'copy, untouched');
    await tab(pg, 'Experiments'); await pg.locator('[data-cmp="2"]').check(); await pg.locator('[data-cmp="3"]').check();
    assert.equal(await pg.locator('.nb-cmp tr.chg').count(), 0, 'no output differs between the original and its copy');
    const meta = (await pg.locator('.nb-changed').textContent()).split(', ');
    assert.ok(meta.every(p => /^object\.(id|name|editable|copiedFrom|setting|gap|view\.|question)/.test(p)), `only the editing frame differs: ${meta}`);
    // one intentional edit: delete the diagonal from (3 m, 3 m) to (6 m, 0) — member 12 of the preset
    await pg.getByRole('radio', { name: 'Delete' }).click();
    // (on a phone the crowd and the car are drawn over the diagonal, so the tap goes to the member's own hit area)
    await pg.locator('#scene .hit[data-member="11"]').dispatchEvent('pointerdown', { bubbles: true, pointerId: 1 });
    assert.notEqual(await pg.locator('#s-sf').textContent(), sf0, 'the edit changes the result');
    await saveRun(pg, 'copy, one diagonal removed');
    await tab(pg, 'Experiments'); await pg.locator('[data-cmp="2"]').uncheck(); await pg.locator('[data-cmp="4"]').check();
    assert.match(await pg.locator('.nb-changed').textContent(), /object\.members/);
    assert.equal(await pg.locator('.nb-cmp tbody tr').first().evaluate(r => r.classList.contains('chg')), true, 'safety factor differs');
    // the untouched original is still there to compare and to load back
    await pg.locator('.nb-load[data-run="R3"]').click();
    assert.equal(await pg.locator('#s-sf').textContent(), sf0);
    await tab(pg, 'Scenario'); assert.equal(await pg.getByRole('radio', { name: /Festival crowd/ }).getAttribute('aria-checked'), 'true');
    assert.deepEqual(pg.errors, []);
  } finally { await browser.close(); server.close(); }
});
