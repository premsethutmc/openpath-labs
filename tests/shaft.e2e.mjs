import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const open = async (page, mode) => {
  await page.goto(page.__origin + '/engine-world/index.html');
  await page.locator('body[data-ready="true"]').waitFor();
  await page.getByRole('radio', { name: mode }).click();
  await page.getByRole('tab', { name: 'Work → power' }).click();
};
const setup = async (vp) => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  page.setDefaultTimeout(90000); page.__origin = server.origin;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return { server, browser, page, errors, state: s => page.waitForFunction(v => document.body.dataset.xState === v, s), exp: page.locator('#x-exp') };
};

test('Engine World 390px, Learn mode: guided 34 → 24 cm lesson — scrub, chain, two speeds, cite the intake trace, conclude, unseen point', async () => {
  const { server, browser, page, errors, state, exp } = await setup({ width: 390, height: 860, mobile: true });
  try {
    await open(page, 'Learn');
    await page.getByRole('button', { name: 'Run A: stock engine' }).click();
    await state('A');
    assert.match(await page.locator('#x-status').innerText(), /stock K12M \(runner 34 cm\) at 4500 rpm, converged after \d+ cycles/);
    const chain = await page.locator('#x-chain').innerText();
    assert.match(chain, /IMEP = W \/ Vd = [\d.]+ J ÷ [\d.]+ cm³ = 13\.56 bar/);
    assert.match(chain, /Friction \(modelled, not measured\)/);
    assert.match(chain, /bench’s own torque for this run is 112\.96 N·m; the chain gives 112\.96 N·m/);
    await page.locator('#x-scrub').fill('588');
    assert.match(await page.locator('#x-read').innerText(), /588°[\s\S]*Compression[\s\S]*IVC — intake valve closes/);
    await page.waitForFunction(() => /crank angle from the experiment/.test(document.getElementById('hud-speed').textContent));
    // guided: the length is fixed, no slider
    assert.equal(await page.locator('#x-runner').count(), 0);
    assert.match(await exp.innerText(), /Guided lesson: Run B uses a 24 cm runner \(34 cm → 24 cm\)/);
    const runB = page.getByRole('button', { name: 'Run B', exact: true });
    assert.ok(await runB.isDisabled(), 'locked until the learner predicts');
    await exp.getByRole('button', { name: 'Down', exact: true }).click();
    await runB.click();
    await state('first');
    assert.equal(await page.locator('#x-pv .xloop').count(), 2);
    let t = await exp.innerText();
    assert.match(t, /At 4500 rpm you predicted Down\. Brake torque 113\.0 → 90\.8 N·m \(−19\.6 %\): Down/);
    assert.match(t, /Intake runner \(solver\)\s+34 cm\s+24 cm/);
    assert.match(t, /reflects where the runner meets the plenum/);
    assert.match(t, /One crank angle is not enough/);
    await exp.getByRole('radio', { name: '6000 rpm' }).click();
    await exp.getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('button', { name: 'Run A and B at 6000 rpm' }).click();
    await state('repeat');
    t = await exp.innerText();
    assert.match(t, /At 6000 rpm you predicted Up\. Brake torque 95\.7 → 110\.2 N·m \(\+15\.1 %\): Up/);
    assert.match(t, /Changing the runner from 34 cm to 24 cm lost 19\.6 % torque at 4500 rpm and gained 15\.1 % at 6000 rpm/);
    assert.equal(await page.locator('#x-exp svg.evidence').count(), 2, 'intake-event trace for each speed');
    assert.equal(await page.locator('#x-view [data-xview]').count(), 2, 'both speeds kept');
    // cite each speed, then conclude
    await exp.locator('[data-cite="4500"][data-v="same"]').click();
    await exp.locator('[data-cite="6000"][data-v="unclear"]').click();
    t = await exp.innerText();
    assert.match(t, /4500 rpm — matches the data: late-intake pressure 1\.291 → 1\.050 bar/);
    assert.match(t, /6000 rpm — the data say “same way”: late-intake pressure 1\.204 → 1\.297 bar, whole-event 0\.862 → 0\.861 bar/);
    await exp.locator('[data-why="friction"]').click();
    assert.match(await exp.innerText(), /FMEP\) is identical/);
    await exp.locator('[data-why="inconclusive"]').click();
    assert.match(await exp.innerText(), /A defensible, cautious answer/);
    await exp.locator('[data-why="wave"]').click();
    assert.match(await exp.innerText(), /Supported: at both speeds the late-intake pressure clearly moved the same way/);
    // unseen point
    await exp.getByRole('radio', { name: '7000 rpm' }).click();
    await exp.getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('button', { name: 'Test 7000 rpm' }).click();
    await state('unseen');
    assert.match(await exp.innerText(), /At 7000 rpm you predicted Up\. Brake torque 82\.7 → 94\.8 N·m \(\+14\.6 %\): Up/);
    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
    await page.locator('#mod-shaft').screenshot({ path: '/tmp/shaft-390.png' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('Engine World 1280px, Explore: any length — 34 → 50 cm needs no “shorter runner” story; non-converged runs never shown', async () => {
  const { server, browser, page, errors, state, exp } = await setup({ width: 1280, height: 900 });
  try {
    await open(page, 'Explore');
    await page.locator('[data-xrpm="6000"]').click();
    await page.getByRole('button', { name: 'Run A: stock engine' }).click();
    await state('A');
    await page.locator('#x-runner').fill('50');
    assert.match(await page.locator('#x-runner-out').innerText(), /50 cm \(Run A: 34 cm\)/);
    await exp.getByRole('button', { name: 'Down', exact: true }).click();
    await page.getByRole('button', { name: 'Run B', exact: true }).click();
    await state('first');
    let t = await exp.innerText();
    assert.match(t, /At 6000 rpm you predicted Down\. Brake torque 95\.7 → 81\.7 N·m \(−14\.7 %\): Down/);
    await exp.getByRole('radio', { name: '4500 rpm' }).click();
    await exp.getByRole('button', { name: 'Down', exact: true }).click();
    await page.getByRole('button', { name: 'Run A and B at 4500 rpm' }).click();
    await state('repeat');
    t = await exp.innerText();
    assert.match(t, /Changing the runner from 34 cm to 50 cm lost 14\.7 % torque at 6000 rpm and lost 9\.1 % at 4500 rpm/);
    assert.doesNotMatch(t, /shorter runner/);
    await exp.locator('[data-cite="6000"][data-v="same"]').click();
    await exp.locator('[data-cite="4500"][data-v="same"]').click();
    await exp.locator('[data-why="wave"]').click();
    assert.match(await exp.innerText(), /Supported/);
    // a forced non-converged unseen run is reported, never plotted or offered
    await page.evaluate(() => window.__shaft.setMaxCycles(2));
    await exp.getByRole('radio', { name: '7000 rpm' }).click();
    await exp.getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('button', { name: 'Test 7000 rpm' }).click();
    await state('unseen-invalid');
    assert.match(await exp.innerText(), /Run A at 7000 rpm did not converge — not plotted, no numbers shown/);
    assert.equal(await page.locator('#x-view [data-xview]').count(), 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
