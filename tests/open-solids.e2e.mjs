// Open solids benches, used like a student with their own project: only visible controls are used and visible text read.
// 1. Force Playground: from an empty workspace, build an A-frame truss that no preset has, load it, read the support
//    forces and own weight in the Moments panel and the material used, check them by hand (ΣM = 0, ρ·g·A·L), save a run.
// 2. Mount lab, opened: a fixed–fixed grey cast-iron beam of the student's own span, load, position and limits; the dial,
//    strain gauge, mass and factor of safety checked against beam-table formulas; the reading is a reproducible run.
// 3. The LEARN descriptors import and evaluate in the browser on the saved projects (the "Predict and learn" page that
//    uses them is integrated separately).
// Phone 390 × 844 with touch and desktop 1280 × 900.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { PRESETS } from '../playground/presets.mjs';

const n = s => parseFloat(String(s).replace(/,/g, ''));
const near = (a, b, abs, msg) => assert.ok(Math.abs(a - b) <= abs, `${msg}: shown ${a}, by hand ${b}`);
const g = 9.81;
const VIEWPORTS = [
  { label: 'phone', vp: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { label: 'desktop', vp: { viewport: { width: 1280, height: 900 } } },
];

// ---------- the student's own truss and its hand calculation ----------
// Joints (mm): 1 (0,0) 2 (3000,0) 3 (6000,0) 4 (3000,1500). Pin joints. Pin at joint 1, roller at joint 3. Steel tube Ø114×5.
const J = [[0, 0], [3000, 0], [6000, 0], [3000, 1500]], BARS = [[0, 1], [1, 2], [0, 3], [3, 2], [1, 3]];
const tubeA = Math.PI * (114 ** 2 - 104 ** 2) / 4, length = BARS.reduce((s, [a, b]) => s + Math.hypot(J[b][0] - J[a][0], J[b][1] - J[a][1]), 0);
const kgSteel = 7850 * tubeA * 1e-9 * length, W = kgSteel * g, CAR = 1200 * g;   // own weight acts at x = 3000 by symmetry
const roller = (CAR * 1500 + W * 3000) / 6000, pin = CAR + W - roller;          // ΣM about joint 1, then ΣFy = 0

// ---------- the student's own mount and its hand calculation (fixed–fixed, load at a from the left) ----------
const MOUNT = { span: 1500, load: 4000, mount: 600, b: 45, h: 70, limits: { defl: 0.6, fos: 4, mass: 40 } };
const CI = { E: 100000, strength: 200, rho: 7200 };   // grey cast iron: the lower of its tension (200) and compression (700) strengths
const mountHand = (() => {
  const { span: L, load: P, mount: a, b: B, h: H } = MOUNT, b = L - a, I = B * H ** 3 / 12, c = H / 2;
  const defl = P * a ** 3 * b ** 3 / (3 * CI.E * I * L ** 3), M = 2 * P * a * a * b * b / L ** 3, stress = M * c / I;
  const peak = P * a * b * b / L ** 2 * c / I;   // the largest moment of a clamped beam is at the nearer clamp: P·a·b²/L²
  return { I, defl, stress, strain: stress / CI.E * 1e6, mass: CI.rho * B * H * 1e-9 * L, fos: CI.strength / stress, fosPeak: CI.strength / peak };
})();

for (const V of VIEWPORTS) test(`open solids benches · ${V.label}: own truss and own mount, checked by hand, saved and reproducible`, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await (await browser.newContext(V.vp)).newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const tap = async loc => { await loc.scrollIntoViewIfNeeded(); await (V.vp.hasTouch ? loc.tap() : loc.click()); };
    const tab = async id => { await tap(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); };
    const noOverflow = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`);

    // ================= 1. Force Playground: own truss from an empty workspace =================
    const keys = J.map(([x, y]) => `${x},${y}`).sort().join(' ');
    for (const p of PRESETS) assert.notEqual(p.nodes.map(q => `${q.x},${q.y}`).sort().join(' '), keys, `not the ${p.id} preset`);
    await page.goto(server.origin + '/playground/index.html#build');
    await page.locator('body[data-ready="true"]').waitFor();
    await tap(page.getByRole('button', { name: 'Clear' }));
    assert.match(await page.locator('#verdict').textContent(), /Nothing built yet/);
    const at = async ([x, y]) => {   // a point of the drawing grid on the scene (the grid is 0.5 m)
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const p = await page.evaluate(([x, y]) => window.__labs.toScreen(x, y), [x, y]), box = await page.locator('#scene').boundingBox();
      if (V.vp.hasTouch) await page.touchscreen.tap(box.x + p.x, box.y + p.y); else await page.mouse.click(box.x + p.x, box.y + p.y);
    };
    await tap(page.getByRole('radio', { name: 'Draw' }));
    await tap(page.getByRole('radio', { name: 'Pin joints' }));
    for (const [a, b] of BARS) { await at(J[a]); await at(J[b]); }
    assert.match(await page.locator('.mass').textContent(), /5 members/);
    await tap(page.getByRole('radio', { name: 'Supports' }));
    await at(J[0]); await at(J[2]); await at(J[2]);          // joint 1: pin; joint 3: pin → roller
    await tab('loads');
    await tap(page.getByRole('button', { name: '+ Car' }));
    assert.doesNotMatch(await page.locator('#verdict').textContent(), /move freely|Nothing built/);
    near(n(await page.locator('#b-mass').textContent()), kgSteel, 0.5, 'material used (kg)');
    // support forces and own weight, read from the Moments panel (F column, kN to 2 decimals)
    await tap(page.locator('#t-moment'));
    await page.locator('#m-sum').waitFor();
    const F = async label => n(await page.locator('.mtable tbody tr', { has: page.locator('th', { hasText: label }) }).first().locator('td').first().textContent());
    near(await F('Pin force'), pin / 1000, 0.006, 'pin force (kN)');
    near(await F('Roller force'), roller / 1000, 0.006, 'roller force (kN)');
    near(await F('Own weight'), W / 1000, 0.006, 'own weight (kN)');
    assert.equal(await page.locator('#m-sum').textContent(), '0');
    await noOverflow('playground');
    await tab('experiments');
    await page.locator('#experiments .nb-name').fill('My A-frame truss');
    await tap(page.locator('#experiments .nb-save'));
    const truss = page.locator('#experiments .nb-runs li', { hasText: 'My A-frame truss' });
    await truss.waitFor();
    assert.equal(await truss.locator('[data-reproduced]').getAttribute('data-reproduced'), 'true');
    // reload: the saved project comes back on the bench through ?project=current, not the last preset
    await page.goto(server.origin + '/playground/?project=current');
    await page.locator('body[data-ready="true"]').waitFor();
    assert.match(await page.locator('.mass').textContent(), /5 members/);

    // ================= 2. Mount lab, opened =================
    await page.goto(server.origin + '/mount/?mode=open');
    await page.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    assert.equal(await page.locator('h1').textContent(), 'Open bench: your own support');
    await tab('stand');
    const setNum = async (id, v) => { const el = page.locator(`#${id}`); await el.scrollIntoViewIfNeeded(); await el.fill(String(v)); await el.press('Tab'); };
    await page.locator('#ob-supports').selectOption({ label: 'Fixed – fixed (both ends clamped)' });
    await setNum('ob-span', MOUNT.span);
    await setNum('ob-load', MOUNT.load);
    await page.locator('#mount-x').selectOption({ label: `${MOUNT.mount} mm` });
    await setNum('ob-lim-defl', MOUNT.limits.defl);
    await setNum('ob-lim-fos', MOUNT.limits.fos);
    await setNum('ob-lim-mass', MOUNT.limits.mass);
    assert.equal(await page.locator('#ob-msg').textContent(), '');
    assert.match(await page.locator('#span-label').textContent(), /^1500 mm between bolts · mount at 600 mm/);
    // the last station is 50 mm short of the far support
    assert.equal(await page.locator('#mount-x option').last().textContent(), '1450 mm');
    await tab('design');
    await tap(page.getByRole('radio', { name: 'Grey cast iron' }));
    for (const [k, v] of [['b', MOUNT.b], ['h', MOUNT.h]]) {
      const lab = page.locator('#dims label.range').filter({ hasText: k === 'b' ? /^Width b/ : /^Depth h/ });
      await lab.locator('input').fill(String(v));
      assert.equal(await lab.locator('output').innerText(), `${v} mm`);
    }
    const props = await page.locator('#secprops').innerText();
    near(n(props.match(/I = ([\d,]+) mm⁴/)[1]), mountHand.I, 1, 'I (mm⁴)');
    near(n(props.match(/mass ([\d.]+) kg/)[1]), mountHand.mass, 0.006, 'mass (kg)');
    assert.match(props, /limit 40 kg/);
    // the readout judges the stress where the bending moment is largest: at the left clamp, not under the machine
    near(n(await page.locator('#ss-fos-val').textContent()), mountHand.fosPeak, 0.006, 'factor of safety at the left clamp');
    assert.match(await page.locator('#ss-cond').textContent(), /stress where the bending moment is largest \(0 mm from the left end\)/);
    await tab('stand');
    await tap(page.locator('#load-on'));
    await page.locator('#dial-x').selectOption({ label: `${MOUNT.mount} mm` });
    await page.locator('#strain-x').selectOption({ label: `${MOUNT.mount} mm` });
    await tap(page.locator('#take'));
    near(n(await page.locator('#r-dial').textContent()), mountHand.defl, 0.0006, 'dial (mm)');
    near(n(await page.locator('#r-strain').textContent()), mountHand.strain, 0.6, 'strain (µε)');
    assert.equal(await page.locator('#r-load').textContent(), `${MOUNT.load} N`);
    // the student's own limits judge the reading: 0.48 mm ≤ 0.6 mm; 18.8 MPa ≤ 200 ÷ 4; 34.0 kg ≤ 40 kg
    await tab('runs');
    const row = page.locator('#runs tbody tr').first(), cells = await row.locator('td').allTextContents();
    assert.deepEqual([cells[1], cells[4], cells[5]], [mountHand.defl <= 0.6 ? 'within' : 'outside', mountHand.stress <= 200 / 4 ? 'OK' : 'over', `${mountHand.mass.toFixed(2)} kg`]);
    assert.match(await page.locator('#runs thead').textContent(), /Alignment ≤ 0\.6 mm.*≤ strength ÷ 4.*Mass ≤ 40 kg/);
    await tab('experiments');
    const reading = page.locator('#experiments .nb-runs li', { hasText: 'Reading 1' });
    await reading.waitFor();
    assert.equal(await reading.locator('[data-reproduced]').getAttribute('data-reproduced'), 'true');
    await noOverflow('mount');
    // reopened as the learning loop will open it, the set-up comes back
    await page.goto(server.origin + '/mount/?project=current');
    await page.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    await tab('stand');
    assert.equal(await page.locator('#ob-supports').inputValue(), 'fixed-fixed');
    assert.equal(await page.locator('#ob-span').inputValue(), String(MOUNT.span));
    assert.equal(await page.locator('#mount-x').inputValue(), String(MOUNT.mount));

    // ================= 3. the LEARN descriptors, in the browser, on the saved projects =================
    const learn = await page.evaluate(async () => {
      const cur = d => { const db = JSON.parse(localStorage.getItem(`openpath.projects.${d}`)); return db.projects.find(p => p.id === db.current); };
      const out = {};
      for (const [k, path, d] of [['mount', '/mount/learn.mjs', 'mount-stand'], ['playground', '/playground/learn.mjs', 'solids-frame']]) {
        const L = (await import(path)).LEARN, p = cur(d), run = p.runs[p.runs.length - 1], ad = await L.adapter(), r = ad.evaluate(run.setup);
        const outs = L.outputsFor(run.setup);
        out[k] = { domain: L.domain, page: L.page, ok: r.ok, outputs: Object.fromEntries(Object.entries(outs).map(([key, o]) => [key, { competency: o.competency, value: r.outputs[key].value }])),
          describe: L.describe(run.setup).map(x => x.label), levers: L.levers(run.setup).map(l => l.path) };
      }
      return out;
    });
    assert.equal(learn.mount.ok, true); assert.equal(learn.playground.ok, true);
    assert.equal(learn.mount.page, '../mount/?project=current'); assert.equal(learn.playground.page, '../playground/?project=current');
    near(learn.mount.outputs.deflection.value, mountHand.defl, 1e-9, 'LEARN deflection');
    near(learn.mount.outputs.momentLeft.value, MOUNT.load * MOUNT.mount * (MOUNT.span - MOUNT.mount) ** 2 / MOUNT.span ** 2 / 1000, 1e-6, 'LEARN fixing moment (N·m)');
    assert.equal(learn.mount.outputs.momentLeft.competency, 'ENG.statics.support-reactions');
    assert.equal(learn.mount.outputs.fos.competency, 'ENG.solids.factor-of-safety');
    near(learn.playground.outputs['reaction:0'].value, pin, 1e-6, 'LEARN pin reaction (N)');
    near(learn.playground.outputs['reaction:2'].value, roller, 1e-6, 'LEARN roller reaction (N)');
    assert.equal(learn.playground.outputs['reaction:0'].competency, 'ENG.statics.equilibrium-2d');
    for (const p of ['bench.span', 'bench.load', 'bench.supports', 'mount', 'design.material']) assert.ok(learn.mount.levers.includes(p), p);
    for (const p of ['state.material', 'state.section', 'object.supports.0.type']) assert.ok(learn.playground.levers.includes(p), p);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
