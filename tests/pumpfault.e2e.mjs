import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

// seed bits (pumps/faults.mjs): bit 0 → guided fault, bit 1 → unseen fault, higher bits → unseen condition.
// seed 1: guided discharge · seed 2: guided strainer, unseen discharge at 6 m lift · seed 4: guided strainer, unseen strainer at 2600 rpm
async function launch(vp) {
  const server = await serve(), browser = await chromium.launch();
  const page = await browser.newPage({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const go = async seed => { await page.goto(`${server.origin}/pumps/fault.html?seed=${seed}`); await page.locator('body[data-ready="true"]').waitFor(); };
  const mission = page.locator('#mission');
  const pick = name => mission.getByRole('button', { name, exact: true }).click();
  return { server, browser, page, errors, go, mission, pick, close: async () => { await browser.close(); server.close(); } };
}
const snapshotUI = page => page.evaluate(() => ({
  mission: document.getElementById('mission').innerText, readings: document.querySelector('.readings').innerText,
  diagram: document.getElementById('loop').outerHTML, status: document.getElementById('status').innerText,
  data: { ...document.body.dataset }, log: document.getElementById('log').innerText, journal: JSON.stringify(window.__fault.journal().runs ? [...window.__fault.journal().runs.values()] : []),
}));

test('fault lab: the hidden cause is not exposed — both faults render the same interface until a gauge is placed', async () => {
  const t = await launch({ width: 390, height: 860 });
  try {
    await t.go(1); const a = await snapshotUI(t.page);
    await t.go(2); const b = await snapshotUI(t.page);
    assert.deepEqual(a, b, 'identical interface, journal and data attributes for a discharge fault and a strainer fault');
    // choosing a hypothesis reveals nothing either
    await t.pick('Fouled inlet strainer'); const b2 = await snapshotUI(t.page);
    await t.go(1); await t.pick('Fouled inlet strainer'); const a2 = await snapshotUI(t.page);
    assert.deepEqual(a2, b2);
    // the two gauge positions are offered identically (no highlight)
    const btns = await t.mission.locator('[data-measure]').evaluateAll(els => els.map(e => [e.className, e.getAttribute('aria-pressed'), getComputedStyle(e).backgroundColor, getComputedStyle(e).borderColor]));
    assert.deepEqual(btns[0], btns[1]);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('fault lab 390px: wrong hypothesis, clean-section reading, wrong repair shows readings, right repair restores; unseen case passes', async () => {
  const t = await launch({ width: 390, height: 860 });
  try {
    await t.go(2);   // guided: strainer fault
    assert.match(await t.mission.innerText(), /Healthy \(commissioning\)\s+Today[\s\S]*Flow\s+3\.82 L\/s\s+2\.75 L\/s/);
    assert.equal(await t.page.locator('#g-q').innerText(), '2.75 L/s');
    await t.pick('Restriction on the discharge side');
    await t.pick('Across taps B (discharge section)');
    assert.match(await t.mission.innerText(), /Δp across the discharge section: 5\.13 kPa at 2\.75 L\/s/);
    assert.match(await t.page.locator('#loop').innerHTML(), /Δp 5\.13 kPa/);
    assert.match(await t.mission.innerText(), /Hint: a clean section’s loss scales with flow²/);
    await t.pick('About the same');
    await t.pick('This section reads like a clean one at today’s flow, so it is not restricted; the flow is down, so the extra loss must be in the other section.');
    await t.mission.locator('[data-q="diagnosis"][data-v="strainer"]').click();
    // wrong repair first: readings, not just "wrong"
    await t.pick('Clear the discharge restriction');
    await t.mission.getByRole('button', { name: 'Carry out the repair and re-run the loop' }).click();
    let m = await t.mission.innerText();
    assert.match(m, /Nothing changed: flow is still 2\.75 L\/s \(healthy 3\.82 L\/s\), pump head 25\.8 m\. The gauge across the discharge section still reads 5\.13 kPa/);
    assert.match(m, /Flow\s+3\.82 L\/s\s+2\.75 L\/s\s+−28\.0 %/);
    await t.pick('Clean the inlet strainer');
    await t.mission.getByRole('button', { name: 'Carry out the repair and re-run the loop' }).click();
    await t.page.waitForFunction(() => document.body.dataset.result === 'guided-done');
    m = await t.mission.innerText();
    assert.match(m, /Your starting hypothesis \(restriction on the discharge side\) was not the fault/);
    assert.match(m, /Your reading: correct\. 5\.13 kPa measured; a clean discharge section would read 9\.90 kPa × \(2\.75 \/ 3\.82\)² = 5\.13 kPa/);
    assert.match(m, /Diagnosis: correct/);
    assert.match(m, /Flow is back to the healthy value/);
    assert.equal(await t.page.locator('#g-q').innerText(), '3.82 L/s');
    // log uses the shared journal: healthy, faulted, two repairs, with units
    await t.page.getByRole('tab', { name: 'Run log' }).click();
    assert.match(await t.page.locator('#log').innerText(), /guided: healthy[\s\S]*guided: today, faulted[\s\S]*Δp across the discharge section\s+5\.13 kPa[\s\S]*#1[\s\S]*#2/i);
    await t.page.getByRole('tab', { name: 'Mission' }).click();
    // new case, no hints: discharge fault at 6 m lift
    await t.mission.getByRole('button', { name: 'Next: a new case without hints' }).click();
    m = await t.mission.innerText();
    assert.match(m, /Static lift 6 m, pump at 2900 rpm/);
    await t.pick('Fouled inlet strainer');
    await t.pick('Across taps A (inlet strainer)');
    m = await t.mission.innerText();
    assert.doesNotMatch(m, /Hint|Why does that rule out/);
    assert.match(m, /Δp across the inlet strainer: 8\.81 kPa at 3\.70 L\/s/);
    await t.pick('About the same');
    await t.mission.locator('[data-q="diagnosis"][data-v="discharge"]').click();
    await t.pick('Clear the discharge restriction');
    await t.mission.getByRole('button', { name: 'Carry out the repair and re-run the loop' }).click();
    await t.page.waitForFunction(() => document.body.dataset.result === 'passed');
    assert.match(await t.mission.innerText(), /Passed: you diagnosed an unfamiliar case/);
    assert.ok(await t.page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
    await t.page.screenshot({ path: '/tmp/fault-390.png', fullPage: true });
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('fault lab 1280px: correct guided diagnosis; in the unseen case a misread reading does not pass even with the right repair', async () => {
  const t = await launch({ width: 1280, height: 900 });
  try {
    await t.go(4);   // guided strainer; unseen strainer at 2600 rpm
    await t.pick('Fouled inlet strainer');
    await t.pick('Across taps A (inlet strainer)');
    assert.match(await t.mission.innerText(), /Δp across the inlet strainer: 100\.61 kPa/);
    await t.pick('Much higher');
    await t.pick('This section loses far more than a clean one would at this flow; a restriction elsewhere would have lowered the flow and made this reading smaller, so the restriction is here.');
    await t.mission.locator('[data-q="diagnosis"][data-v="strainer"]').click();
    await t.pick('Clean the inlet strainer');
    await t.mission.getByRole('button', { name: 'Carry out the repair and re-run the loop' }).click();
    await t.page.waitForFunction(() => document.body.dataset.result === 'guided-done');
    assert.match(await t.mission.innerText(), /starting hypothesis \(fouled inlet strainer\) was right/);
    await t.mission.getByRole('button', { name: 'Next: a new case without hints' }).click();
    assert.match(await t.mission.innerText(), /Static lift 12 m, pump at 2600 rpm/);
    await t.pick('Fouled inlet strainer');
    await t.pick('Across taps A (inlet strainer)');
    const reading = (await t.mission.innerText()).match(/inlet strainer: ([\d.]+) kPa/)[1];
    assert.notEqual(reading, '100.61', 'not the guided number');
    await t.pick('About the same');   // misread: it is far higher than a clean strainer at this flow
    await t.mission.locator('[data-q="diagnosis"][data-v="strainer"]').click();
    await t.pick('Clean the inlet strainer');
    await t.mission.getByRole('button', { name: 'Carry out the repair and re-run the loop' }).click();
    await t.page.waitForFunction(() => document.body.dataset.result === 'not-passed');
    assert.match(await t.mission.innerText(), /Your reading: not supported\. 56\.31 kPa measured/);
    await t.page.screenshot({ path: '/tmp/fault-1280.png' });
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});
