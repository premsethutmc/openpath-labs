import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

for (const width of [380, 1280]) test(`Engine World ${width}px: oil, history, Alaska cold start, drive`, async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/index.html');
    await page.locator('.obj.feature', { hasText: 'Engine World' }).click();
    await page.locator('body[data-ready="true"]').waitFor();
    assert.ok(await page.locator('#nogl').isHidden(), 'WebGL scene renders');
    await page.getByRole('button', { name: 'Skip: use a ready-built engine' }).click();
    assert.ok(await page.locator('#blendbox').isHidden());
    const turn = async () => { await page.locator('#key').click(); await page.waitForFunction(() => ['running', 'failed'].includes(document.body.dataset.phase)); };
    const reset = () => page.getByRole('button', { name: 'Reset and try again' }).click();

    // Chennai, fresh 5W-30: starts, quick oil pressure
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'running');
    assert.match(await page.locator('#start-results').innerText(), /Time until oil reaches the bearings\s+1\.0 s/);

    // Alaska, 4 days, 5W-30: too slow to fire; prediction recorded
    await reset();
    await page.getByRole('radio', { name: /Alaska/ }).click();
    assert.match(await page.locator('#g-temp').textContent(), /-35 °C/);
    await page.getByRole('button', { name: 'Yes, it starts' }).click();
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'failed');
    assert.match(await page.locator('#start-results').innerText(), /too slowly to fire[\s\S]*prediction was wrong/);

    // 20W-50: solid oil
    await reset();
    await page.getByRole('radio', { name: '20W-50' }).click();
    await turn();
    assert.match(await page.locator('#start-results').innerText(), /almost solid/);

    // 0W-20: starts, but oil takes several seconds to arrive
    await reset();
    await page.getByRole('radio', { name: '0W-20' }).click();
    await turn();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'running');
    const t = await page.locator('#start-results').innerText();
    assert.match(t, /It started, but the bearings ran without fresh oil/);
    // Desert-aged 0W-20 thickens: cranking slower than fresh
    const fresh = +t.match(/Cranking speed\s+(\d+) rpm/)[1];
    await reset();
    await page.getByRole('radio', { name: /50,000 km/ }).click();
    assert.ok(await page.locator('#age-box').isVisible());
    await turn();
    const aged = +(await page.locator('#start-results').innerText()).match(/Cranking speed\s+(\d+) rpm/)[1];
    assert.ok(aged < fresh, `aged ${aged} < fresh ${fresh}`);

    // Coolant with no antifreeze freezes in Alaska: do not start
    await reset();
    await page.locator('#gly').fill('0');
    assert.match(await page.locator('#coolant-note').innerText(), /frozen solid/);
    await turn();
    assert.match(await page.locator('#start-results').innerText(), /coolant is frozen/);
    await page.locator('#gly').fill('50'); // changing an input resets the start

    // Blend your own shows the blend controls
    await page.getByRole('radio', { name: 'Blend your own' }).click();
    assert.ok(await page.locator('#blendbox').isVisible());

    // Drive: cold oil costs far more friction than warm oil
    await page.getByRole('radio', { name: '5W-30' }).click();
    const friction = async T => { await page.locator('#ot').fill(String(T)); return +(await page.locator('#drive-results').innerText()).match(/Lost to friction\s+([\d.]+) kW/)[1]; };
    const cold = await friction(-10), warm = await friction(95);
    assert.ok(cold > 2 * warm, `cold ${cold} vs warm ${warm}`);
    assert.match(await page.locator('#drive-results').innerText(), /Peak cylinder pressure\s+\d+ bar/);
    assert.equal(await page.locator('#pv polyline').count(), 1);
    assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), 'no sideways scroll');
    await page.screenshot({ path: `/tmp/engine-${width}.png` });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('Engine World: build the engine part by part, then feel the consequences', async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/engine-world/index.html');
    await page.locator('body[data-ready="true"]').waitFor();
    const msg = () => page.locator('#build-msg').innerText();
    const fitPart = name => page.locator('#parts li', { hasText: name }).getByRole('button', { name: 'Fit' }).click();

    await fitPart('Crankshaft');
    assert.match(await msg(), /main bearing shells first/);
    await page.getByRole('tab', { name: 'Run it' }).click();
    assert.match(await msg(), /Finish building first/);

    await page.getByRole('radio', { name: 'Worn (60 µm)' }).click();
    await fitPart('Main bearing shells');
    assert.match(await msg(), /oil pressure falls/);
    await fitPart('Crankshaft');
    await fitPart('Piston rings');
    await fitPart('Pistons and rods');
    assert.match(await msg(), /rod bearing shells first/);
    for (const p of ['Rod bearing shells', 'Pistons and rods', 'Oil pump', 'Oil sump', 'Cylinder head', 'Fill with oil']) await fitPart(p);
    assert.match(await page.locator('#build-progress').innerText(), /9 of 9 fitted — ready to run/);

    // Take off the crank: everything on it comes off too
    await page.locator('#parts li', { hasText: 'Crankshaft' }).getByRole('button', { name: 'Take off' }).click();
    assert.match(await page.locator('#build-progress').innerText(), /^2 of 9/);
    for (const p of ['Crankshaft', 'Rod bearing shells', 'Pistons and rods', 'Oil pump', 'Oil sump', 'Cylinder head', 'Fill with oil']) await fitPart(p);

    await page.getByRole('tab', { name: 'Run it' }).click();
    await page.locator('#key').click();
    await page.waitForFunction(() => document.body.dataset.phase === 'running');
    assert.ok(await page.locator('#warmbox').isVisible());
    // Hot oil + worn bearings = oil pressure warning
    await page.locator('#ot').fill('110');
    await page.locator('#rpm').fill('1000');
    const drive = await page.locator('#drive-results').innerText();
    assert.match(drive, /Oil pressure\s+[\d.]+ bar — warning light on/);
    assert.match(drive, /Your build: Loose/);
    // Fast-forward warm-up reaches 90 °C
    await page.getByRole('button', { name: 'Fast-forward the warm-up' }).click();
    await page.waitForFunction(() => document.getElementById('ot').value === '90');
    assert.match(await page.locator('#warm').innerHTML(), /friction at idle/);
    await page.screenshot({ path: '/tmp/assembly.png' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('Engine World: valves and airflow — cams, springs, runners, valve-to-piston contact', async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(server.origin + '/engine-world/index.html');
    await page.locator('body[data-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Skip: use a ready-built engine' }).click();
    const peak = async () => +(await page.locator('body').getAttribute('data-peak-power'));
    const torque = async () => +(await page.locator('#drive-results').innerText()).match(/Torque\s+(-?\d+) N·m/)[1];

    await page.locator('#rpm').fill('1500'); await page.locator('#thr').fill('100');
    const stock = await peak();
    await page.getByRole('radio', { name: 'Economy' }).click();
    const ecoLow = await torque(), ecoPeak = await peak();
    await page.getByRole('radio', { name: 'Sport' }).click();
    const sportLow = await torque(), sportPeak = await peak();
    assert.ok(ecoLow > sportLow, `economy pulls harder low down (${ecoLow} vs ${sportLow})`);
    assert.ok(sportPeak > ecoPeak && sportPeak > stock, 'sport makes the most peak power');
    assert.match(await page.locator('#dyno').innerHTML(), /dashed: Economy cam/);
    assert.match(await page.locator('#breathe-results').innerText(), /idle rough/);

    // Soft springs: valve float at high speed
    await page.getByRole('radio', { name: 'Stock' }).click();
    await page.getByRole('radio', { name: 'Soft' }).click();
    await page.locator('#rpm').fill('7200');
    assert.match(await page.locator('#drive-results').innerText(), /Valve float/);

    // Longer runners move the resonance lower
    const tuned = async () => +(await page.locator('#breathe-results').innerText()).match(/helps near\s+([\d,]+) rpm/)[1].replace(/,/g, '');
    const short = await tuned();
    await page.locator('#runner').fill('65');
    assert.ok(await tuned() < short);

    // A wild custom cam: valves hit the pistons on the first turn
    await page.locator('#lift').fill('13'); await page.locator('#dur').fill('310');
    assert.match(await page.locator('#breathe-results').innerText(), /Valves will hit the pistons/);
    await page.locator('#key').click();
    await page.waitForFunction(() => document.body.dataset.phase === 'failed');
    assert.match(await page.locator('#start-results').innerText(), /Crunch/);
    await page.locator('#s-breathe').screenshot({ path: '/tmp/breathe.png' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
