// Returning to the exact project (PR #19 review): through visible controls only. A learner builds design A on a bench,
// runs two variants, saves and compares them without answering anything, starts the optional learning from A, switches
// to a new project B in another tab, then comes back from the learning page. The bench must reopen A with its own
// settings and readings, and B must be untouched. Also: a saved design's "Open design" link, the open benches list, and
// a project that no longer exists (said so, with a picker; never a different project opened in its place).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const watch = (page, server, errors) => {
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
  return page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
};
const projectOf = url => new URL(url).searchParams.get('project');

test('Mount lab, phone: learning from A, B made in another tab, the return reopens A exactly and B is untouched', { timeout: 120000 }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    const errors = [], tabA = await ctx.newPage(); await watch(tabA, server, errors);
    const tap = async (page, loc) => { await loc.scrollIntoViewIfNeeded(); await loc.tap(); };
    const tab = (page, id) => tap(page, page.locator(`#tab-${id}`));
    const setNum = async (page, id, v) => { const el = page.locator(`#${id}`); await el.scrollIntoViewIfNeeded(); await el.fill(String(v)); await el.press('Tab'); };
    const state = async page => {
      await tab(page, 'stand');
      const st = { load: await page.locator('#ob-load').inputValue(), span: await page.locator('#ob-span').inputValue(), mount: await page.locator('#mount-x').inputValue(),
        dial: await page.locator('#dial-x').inputValue(), strain: await page.locator('#strain-x').inputValue(), dialReading: (await page.locator('#r-dial').textContent()).trim() };
      await tab(page, 'experiments');
      st.name = await page.locator('.nb-rename').inputValue();
      st.runs = await page.locator('.nb-runs b').allTextContents();
      st.reproduced = await page.locator('[data-reproduced]').evaluateAll(es => es.map(e => e.dataset.reproduced));
      return st;
    };

    // ---- design A on the open bench: two variants, saved and compared, nothing answered ----
    await tabA.goto(server.origin + '/mount/?mode=open');
    await tabA.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    await tab(tabA, 'stand');
    await setNum(tabA, 'ob-span', 1200); await setNum(tabA, 'ob-load', 3000);
    await tabA.locator('#mount-x').selectOption({ label: '400 mm' });
    await tap(tabA, tabA.locator('#load-on'));
    await tabA.locator('#dial-x').selectOption({ label: '400 mm' }); await tabA.locator('#strain-x').selectOption({ label: '400 mm' });
    await tap(tabA, tabA.locator('#take'));
    await tabA.locator('#dial-x').selectOption({ label: '600 mm' });                     // variant 2: the dial moved
    await tap(tabA, tabA.locator('#take'));
    await tab(tabA, 'experiments');
    await tabA.locator('.nb-rename').fill('Design A'); await tabA.locator('.nb-rename').press('Tab');
    const boxes = tabA.locator('.nb-runs [data-cmp]');
    assert.equal(await boxes.count(), 2, 'two readings on A');
    await tap(tabA, boxes.nth(0)); await tap(tabA, boxes.nth(1));
    assert.match(await tabA.locator('.nb-changed').textContent(), /dialX/, 'the comparison names what changed');
    assert.equal(await tabA.locator('.nb-cmp').count(), 1);
    const A = await state(tabA);
    assert.deepEqual([A.load, A.span, A.mount, A.dial, A.strain, A.name], ['3000', '1200', '400', '600', '400', 'Design A']);
    assert.equal(A.runs.length, 2); assert.deepEqual(A.reproduced, ['true', 'true']);

    // ---- optional learning from A ----
    await tap(tabA, tabA.locator('a.nb-learn'));
    await tabA.locator('body[data-ready="true"]').waitFor();
    const idA = projectOf(tabA.url());
    assert.ok(idA && idA !== 'current');
    const back = tabA.locator('#to-design');
    assert.equal(await back.textContent(), '← Back to my design on the bench');
    assert.match(await back.getAttribute('href'), new RegExp(`\\?project=${idA}$`), 'the return names A, never project=current');

    // ---- another tab: a new project B with a different load and gauges ----
    const tabB = await ctx.newPage(); await watch(tabB, server, errors);
    await tabB.goto(server.origin + '/mount/?mode=open');
    await tabB.locator('body[data-ready="true"]').waitFor();
    await tab(tabB, 'experiments');
    await tap(tabB, tabB.locator('.nb-new'));
    await tabB.locator('.nb-rename').fill('Design B'); await tabB.locator('.nb-rename').press('Tab');
    await tab(tabB, 'stand');
    await setNum(tabB, 'ob-load', 5000);
    await tabB.locator('#mount-x').selectOption({ label: '300 mm' });
    await tabB.locator('#dial-x').selectOption({ label: '300 mm' }); await tabB.locator('#strain-x').selectOption({ label: '200 mm' });
    if (!(await tabB.locator('#load-on').isDisabled())) await tap(tabB, tabB.locator('#load-on'));
    await tap(tabB, tabB.locator('#take'));
    const B = await state(tabB);
    const idB = await tabB.locator('.nb-open').inputValue();
    assert.notEqual(idB, idA);
    assert.deepEqual([B.load, B.mount, B.dial, B.strain, B.name, B.runs.length], ['5000', '300', '300', '200', 'Design B', 1]);

    // ---- back from the learning page in tab A: A exactly, not B (which is now the last-opened project) ----
    await tap(tabA, back);
    await tabA.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    assert.equal(projectOf(tabA.url()), idA);
    assert.deepEqual(await state(tabA), A, 'A comes back with its own load, span, position, gauges, last reading and runs');

    // ---- B untouched ----
    await tabB.goto(`${server.origin}/mount/?project=${idB}`);
    await tabB.locator('body[data-ready="true"]').waitFor();
    assert.deepEqual(await state(tabB), B, 'B is untouched');

    // ---- the Journeys page: open benches stay listed; a saved design's main action opens that exact project ----
    await tabA.goto(server.origin + '/journeys/');
    await tabA.locator('body[data-ready="true"]').waitFor();
    assert.ok(await tabA.locator('#benches a').count() >= 2, 'open benches listed even with saved designs');
    const rowA = tabA.locator(`#own li.design[data-project="${idA}"]`);
    assert.deepEqual(await rowA.locator('.acts a').allTextContents(), ['Open design', 'Predict and learn']);
    await tap(tabA, rowA.getByRole('link', { name: 'Open design' }));
    await tabA.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    assert.equal(projectOf(tabA.url()), idA);
    assert.deepEqual(await state(tabA), A, 'Open design opens A with its settings and readings');

    // ---- a project that no longer exists: said so, with a picker; not another project in its place ----
    await tabA.goto(`${server.origin}/mount/?project=P-gone`);
    await tabA.locator('body[data-ready="true"]').waitFor();
    const notice = tabA.locator('.nb-missing');
    assert.match(await notice.textContent(), /not saved in this browser any more/);
    const picked = await tabA.locator('.nb-missing .nb-pick option').allTextContents();
    assert.ok(picked.some(t => t.startsWith('Design A')) && picked.some(t => t.startsWith('Design B')), picked.join(' | '));
    await tab(tabA, 'experiments');
    assert.doesNotMatch(await tabA.locator('.nb-rename').inputValue(), /^Design [AB]$/, 'neither A nor B was opened in its place');
    await tabA.locator('.nb-missing .nb-pick').selectOption({ label: picked.find(t => t.startsWith('Design A')) });
    await tabA.waitForURL(new RegExp(`project=${idA}`));
    await tabA.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    assert.deepEqual(await state(tabA), A);
    assert.ok(await tabA.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('fluid line bench, desktop: the same return reopens line A exactly; line B untouched', { timeout: 120000 }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = [], tabA = await ctx.newPage(); await watch(tabA, server, errors);
    const click = async loc => { await loc.scrollIntoViewIfNeeded(); await loc.click(); };
    const dock = (page, name) => click(page.locator('.dock').getByRole('tab', { name, exact: true }));
    const pick = async (page, prefix) => { const b = page.locator('#m-build .parts .sel').filter({ hasText: prefix }); if (await b.getAttribute('aria-pressed') !== 'true') await click(b); };
    const field = (page, label) => page.locator('#m-build').getByLabel(label, { exact: false }).first();
    const setField = async (page, label, v) => { const f = field(page, label); await f.fill(String(v)); await f.blur(); };
    const save = async (page, name) => { await dock(page, 'Experiments'); await page.getByLabel('Run name').fill(name); await click(page.getByRole('button', { name: 'Save run' })); };
    const state = async page => {
      await dock(page, 'Build');
      const parts = (await page.locator('#m-build .parts .sel').allInnerTexts()).map(t => t.trim());
      await pick(page, '#2 Pipe'); const bore2 = await field(page, 'Bore').inputValue(), len2 = await field(page, 'Length').inputValue();
      await pick(page, '#4 Pipe'); const bore4 = await field(page, 'Bore').inputValue();
      await dock(page, 'Experiments');
      return { parts, bore2, len2, bore4, name: await page.locator('.nb-rename').inputValue(), runs: await page.locator('.nb-runs b').allTextContents(),
        reproduced: await page.locator('[data-reproduced]').evaluateAll(es => es.map(e => e.dataset.reproduced)) };
    };

    // ---- line A from an editable preset: two variants saved and compared, nothing answered ----
    await tabA.goto(server.origin + '/circuit/');
    await tabA.locator('body[data-ready="true"]').waitFor();
    await dock(tabA, 'Build');
    await click(tabA.getByRole('button', { name: 'Preset: Gravity feed between two tanks' }));
    await pick(tabA, '#2 Pipe'); await setField(tabA, 'Bore', 40);
    await save(tabA, 'A1 · 40 mm');
    await dock(tabA, 'Build'); await pick(tabA, '#2 Pipe'); await setField(tabA, 'Length', 35);
    await save(tabA, 'A2 · 35 m');
    await tabA.locator('.nb-rename').fill('Line A'); await tabA.locator('.nb-rename').press('Tab');
    const boxes = tabA.locator('.nb-runs [data-cmp]');
    await click(boxes.nth(0)); await click(boxes.nth(1));
    assert.match(await tabA.locator('.nb-changed').textContent(), /chain/, 'the comparison names what changed');
    const A = await state(tabA);
    assert.deepEqual([A.bore2, A.len2, A.bore4, A.name, A.runs], ['40', '35', '50', 'Line A', ['A1 · 40 mm', 'A2 · 35 m']]);

    // ---- optional learning from A, then B in another tab ----
    await click(tabA.locator('a.nb-learn'));
    await tabA.locator('body[data-ready="true"]').waitFor();
    const idA = projectOf(tabA.url());
    const back = tabA.locator('#to-design');
    assert.match(await back.getAttribute('href'), new RegExp(`\\?project=${idA}$`));

    const tabB = await ctx.newPage(); await watch(tabB, server, errors);
    await tabB.goto(server.origin + '/circuit/');
    await tabB.locator('body[data-ready="true"]').waitFor();
    await dock(tabB, 'Experiments'); await click(tabB.locator('.nb-new'));
    await tabB.locator('.nb-rename').fill('Line B'); await tabB.locator('.nb-rename').press('Tab');
    await dock(tabB, 'Build'); await pick(tabB, '#2 Pipe'); await setField(tabB, 'Bore', 25); await setField(tabB, 'Length', 12);
    await pick(tabB, '#4 Pipe'); await setField(tabB, 'Bore', 32);
    await save(tabB, 'B1');
    const B = await state(tabB), idB = await tabB.locator('.nb-open').inputValue();
    assert.deepEqual([B.bore2, B.len2, B.bore4, B.name, B.runs], ['25', '12', '32', 'Line B', ['B1']]);

    // ---- back to A from the learning page ----
    await click(back);
    await tabA.locator('body[data-ready="true"]').waitFor();
    assert.equal(projectOf(tabA.url()), idA);
    assert.deepEqual(await state(tabA), A, 'line A comes back with its own pipes and runs');
    await tabB.goto(`${server.origin}/circuit/?project=${idB}`);
    await tabB.locator('body[data-ready="true"]').waitFor();
    assert.deepEqual(await state(tabB), B, 'line B is untouched');

    // ---- the saved design's Open design link ----
    await tabA.goto(server.origin + '/journeys/');
    await tabA.locator('body[data-ready="true"]').waitFor();
    await click(tabA.locator(`#own li.design[data-project="${idA}"]`).getByRole('link', { name: 'Open design' }));
    await tabA.locator('body[data-ready="true"]').waitFor();
    assert.equal(projectOf(tabA.url()), idA);
    assert.deepEqual(await state(tabA), A);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
