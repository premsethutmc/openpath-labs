// Open benches, the student's own project (docs/OPEN_LOOP.md): on a phone (390 × 844, touch) and a desktop (1280 × 900),
// through visible controls only. On the fluid line bench the student builds, from the EMPTY workspace, a line no preset
// describes — a two-level tank transfer through commercial steel pipe with a 4-pole pump at 1450 rpm — saves a run,
// and every reading is checked against their own hand calculation (tests/pipe-hand.mjs: Darcy–Weisbach with
// Colebrook, K·V²/2g, the energy equation, T = P/ω, NPSH). On the machine design bench they build a shaft from scratch
// with the torque from their motor (T = P/ω) and check torque, combined stress, reactions and critical speed by hand.
// Nothing here reads the page's internals until the end, where the bench's learn.mjs module is imported in the page and
// run on the saved project (the "Predict and learn" link is built in parallel; this proves the module loads and evaluates
// in a browser on the student's own setup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import * as H from './pipe-hand.mjs';
import { PRESETS as LINE_PRESETS, fromPreset as linePreset } from '../circuit/model.mjs';

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
];
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b} (±${rel * 100} %)`);

// ---------- the student's design, in their own terms ----------
// Lower tank surface 1.5 m above the pump centreline; upper tank surface 7 m. Steel (new): ε = 0.045 mm (Moody chart).
const STEEL_EPS = 0.045e-3, rho = H.WATER20.rho, g = H.G, nu = H.WATER20.nu;
const LINE = { src: 1.5, sink: 7, suction: { D: 0.065, L: 4 }, main: { D: 0.05, L: 30 }, riser: { D: 0.04, L: 6, rise: 6 }, rpm: 1450 };
const PATM = 101.325e3, PV20 = 2.339e3;   // Pa: standard atmosphere; vapour pressure of water at 20 °C (steam tables)
const hand = Q => {   // Q in m³/s → heads in m
  const vs = H.vhead(Q, LINE.suction.D), vm = H.vhead(Q, LINE.main.D), vr = H.vhead(Q, LINE.riser.D);
  const hfS = H.hf(Q, { ...LINE.suction, eps: STEEL_EPS }, nu), hfM = H.hf(Q, { ...LINE.main, eps: STEEL_EPS }, nu), hfR = H.hf(Q, { ...LINE.riser, eps: STEEL_EPS }, nu);
  const contraction = 0.5 * (1 - (LINE.riser.D / LINE.main.D) ** 2) * vr;
  const system = (LINE.sink - LINE.src) + H.K.square * vs + hfS + H.K.gateOpen * vm + hfM + H.K.elbow * vm + contraction + hfR + H.K.exit * vr;
  return { vs, vm, hfS, hfM, system };
};
// Shaft: 30 mm steel, bearings 800 mm apart, a 40 kg disc at mid-span; a 7.5 kW motor at 960 rpm drives it at 50 mm and
// the disc takes the power off at 400 mm. Own weight left out. Handbook steel: E = 200 GPa.
const SHAFT = { L: 800, d: 30, m: 40, P: 7.5, N: 960, xIn: 50, xOut: 400 };

for (const V of VIEWPORTS) {
  test(`open benches from scratch through visible controls, ${V.name} ${V.viewport.width}×${V.viewport.height}`, { timeout: 120000 }, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: V.viewport, isMobile: V.isMobile, hasTouch: V.hasTouch });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const press = async loc => { await loc.scrollIntoViewIfNeeded(); await (V.hasTouch ? loc.tap() : loc.click()); };
      const ready = () => page.locator('body[data-ready="true"]').waitFor();
      const tab = async name => press(page.locator('.dock').getByRole('tab', { name, exact: true }));
      const set = async (loc, v) => { await loc.fill(String(v)); await loc.blur(); };
      const reading = async label => { const dd = page.locator('#readings div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) }).locator('dd'); return parseFloat(await dd.innerText()); };
      const noOverflow = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`);
      const saveRun = async name => {
        await tab('Experiments');
        await page.getByLabel('Run name').fill(name);
        await press(page.getByRole('button', { name: 'Save run' }));
        await page.locator('#m-experiments .msg').filter({ hasText: `Saved “${name}”` }).waitFor();
        assert.match(await page.locator('#m-experiments .nb-runs li').filter({ hasText: name }).innerText(), /reproduced from its saved setup/);
      };

      // ================= fluid line bench: a line built from the empty workspace =================
      await page.goto(`${server.origin}/circuit/`); await ready();
      await press(page.getByRole('button', { name: 'Empty workspace' }));
      assert.match(await page.locator('#scheme').innerHTML(), /Empty workspace/);
      const build = page.locator('#m-build');
      const add = async (name, fields = {}) => {
        await press(build.getByRole('button', { name: `+ ${name}`, exact: true }));
        for (const [label, v] of Object.entries(fields)) {
          const f = build.getByLabel(label, { exact: false }).first();
          if (await f.evaluate(el => el.tagName) === 'SELECT') await f.selectOption({ label: v }); else await set(f, v);
        }
      };
      await add('Source reservoir', { 'Water surface': LINE.src });
      await add('Pipe', { Bore: LINE.suction.D * 1000, Length: LINE.suction.L, Material: 'Commercial steel (new)' });
      await add('Centrifugal pump', { Speed: LINE.rpm, 'Impeller diameter': 160, Motor: '1.5 kW, 4-pole (1400–1500 rpm)' });
      await add('Gate valve');
      await add('Pipe', { Bore: LINE.main.D * 1000, Length: LINE.main.L, Material: 'Commercial steel (new)' });
      await add('90° elbow');
      await add('Pipe', { Bore: LINE.riser.D * 1000, Length: LINE.riser.L, Material: 'Commercial steel (new)', 'Rise (end − start)': LINE.riser.rise });
      await add('Receiving reservoir', { 'Water surface': LINE.sink });
      const parts = (await build.locator('.parts .sel').allInnerTexts()).map(t => t.trim());
      assert.deepEqual(parts, ['#1 Source reservoir', '#2 Pipe Ø65 × 4 m', '#3 Centrifugal pump', '#4 Gate valve 100 %', '#5 Pipe Ø50 × 30 m', '#6 90° elbow', '#7 Pipe Ø40 × 6 m', '#8 Receiving reservoir']);
      await tab('Measure');
      await page.locator('#m-measure').getByLabel(/after #4 Gate valve/).check();
      await page.locator('#m-measure').getByLabel(/after #5 Pipe/).check();
      await tab('Duty & motor');
      await set(page.getByLabel(/Flow the job needs/), 2.5);
      await noOverflow('fluid line bench');

      const st = await page.locator('#status').innerText();
      assert.match(st, /^Solved: [\d.]+ L\/s through 8 parts\.$/, st);
      const R = { Q: await reading('Flow'), H: await reading('Pump head'), P: await reading('Shaft power'), T: await reading('Shaft torque'), npsha: await reading('NPSH available'),
        g4: await reading('G after #4'), g5: await reading('G after #5') };
      const h = hand(R.Q / 1000);
      near(h.system, R.H, 0.01, 'system head at the bench flow vs the bench pump head');
      near(h.hfM, (R.g4 - R.g5) * 1000 / (rho * g), 0.02, 'Darcy–Weisbach on the level 50 mm main vs the gauge drop');
      // energy equation from the lower tank surface to the gauge after the valve (z = 0 at the pump line)
      near(rho * g * (LINE.src - H.K.square * h.vs - h.hfS + R.H - H.K.gateOpen * h.vm - h.vm) / 1000, R.g4, 0.01, 'energy equation to gauge #4');
      near(R.P * 1000 / (2 * Math.PI * LINE.rpm / 60), R.T, 0.01, 'T = P/ω on the pump shaft');
      near((PATM - PV20) / (rho * g) + LINE.src - H.K.square * h.vs - h.hfS, R.npsha, 0.01, 'NPSH available');
      assert.match(await page.locator('[data-verdict="flow"]').innerText(), /Yes\s+[\d.]+ L\/s against 2\.5 L\/s required/);
      assert.match(await page.locator('[data-verdict="drive"]').innerText(), /Yes\s+needs [\d.]+ kW of 1\.5 kW/);
      await saveRun('My tank transfer: 4-pole pump, 65/50/40 mm steel');

      // the saved project is the student's own: no preset describes it, and the bench's learn module reads it in the page
      const fromBrowser = await page.evaluate(async () => {
        const L = (await import('/circuit/learn.mjs')).default, P = await import('/core/project.mjs');
        const proj = P.openStore(L.domain).current(), outs = L.outputsFor(proj.runs.at(-1).setup);
        return { setup: proj.runs.at(-1).setup, runs: proj.runs.length, describe: L.describe(proj.setup), outs, levers: L.levers(proj.setup).map(l => ({ path: l.path, values: l.values })),
          concepts: L.concepts(proj.setup), page: L.page, flow: (await L.adapter()).evaluate(proj.setup).outputs.flow.value };
      });
      assert.equal(fromBrowser.runs, 1);
      for (const p of LINE_PRESETS) assert.notDeepEqual(fromBrowser.setup.chain, linePreset(p.id).chain, `not the ${p.id} preset`);
      const rows = Object.fromEntries(fromBrowser.describe.map(r => [r.label, r.value]));
      assert.equal(rows['2. Pipe'], 'bore 65 mm, length 4 m, material Commercial steel (new), rise (end − start) 0 m');
      assert.equal(rows['3. Centrifugal pump'], 'speed 1450 rpm, impeller diameter 160 mm, motor 1.5 kW, 4-pole (1400–1500 rpm)');
      assert.equal(rows['Pressure gauges'], 'between #4 Gate valve and #5 Pipe; between #5 Pipe and #6 90° elbow');
      assert.deepEqual(Object.keys(fromBrowser.outs).sort(), ['flow', 'gauge:p4', 'gauge:p5', 'npsha', 'pumpHead', 'shaftPower', 'torque']);
      assert.equal(fromBrowser.outs['gauge:p5'].competency, 'ENG.fluids.energy-equation');
      assert.equal(fromBrowser.outs.torque.competency, 'ENG.machine.torque-power');
      assert.equal(fromBrowser.outs.flow.competency, 'ENG.fluids.operating-point');
      assert.ok(Math.abs(fromBrowser.flow - R.Q) <= 0.005, `learn adapter flow ${fromBrowser.flow} vs shown ${R.Q}`);
      assert.deepEqual(fromBrowser.levers.find(l => l.path === 'chain.4.D').values, [0.04, 0.065]);
      assert.ok(fromBrowser.levers.some(l => l.path === 'chain.2.rpm') && fromBrowser.levers.some(l => l.path === 'chain.2.motorId'));
      assert.ok(fromBrowser.concepts.includes('ENG.fluids.darcy-weisbach'));
      assert.equal(fromBrowser.page, '../circuit/');

      // ================= machine design bench: a shaft from scratch =================
      await page.goto(`${server.origin}/machine/`); await ready();
      await press(page.getByRole('button', { name: 'Empty bench' }));
      await press(page.getByRole('button', { name: '+ Add segment' }));
      const seg = page.locator('#m-shaft ul.rows li').first();
      await set(seg.getByLabel('Length mm'), SHAFT.L); await set(seg.getByLabel('Ø mm'), SHAFT.d);
      await page.getByLabel("Include the shaft's own weight").uncheck();
      await tab('Bearings');
      await press(page.getByRole('button', { name: '+ Add bearing' })); await press(page.getByRole('button', { name: '+ Add bearing' }));
      const brg = page.locator('#m-bearings ul.rows li');
      await set(brg.nth(0).getByLabel('Position mm'), 0); await set(brg.nth(1).getByLabel('Position mm'), SHAFT.L);
      await tab('Loads');
      const F = +(SHAFT.m * g).toFixed(2), T = +(SHAFT.P * 1000 / (2 * Math.PI * SHAFT.N / 60)).toFixed(2);   // the student's T = P/ω, typed to 0.01 N·m
      await press(page.getByRole('button', { name: '+ Add force' }));
      const loads = page.locator('#m-loads ul.rows li');
      await set(loads.nth(0).getByLabel('Position mm'), SHAFT.L / 2); await set(loads.nth(0).getByLabel('Force N'), F); await set(loads.nth(0).getByLabel('Mass kg'), SHAFT.m);
      await press(page.getByRole('button', { name: '+ Add torque' }));
      await set(loads.nth(1).getByLabel('Position mm'), SHAFT.xIn); await set(loads.nth(1).getByLabel('Torque N·m'), T);
      await press(page.getByRole('button', { name: '+ Add torque' }));
      await set(loads.nth(2).getByLabel('Position mm'), SHAFT.xOut); await set(loads.nth(2).getByLabel('Torque N·m'), -T);
      await tab('Speed');
      await set(page.locator('#m-speed').getByLabel(/Operating speed/), SHAFT.N);
      await noOverflow('machine bench');
      assert.doesNotMatch(await page.locator('#status').innerText(), /Not solved/);

      // the student's hand calculation
      const d = SHAFT.d, Mmid = F * SHAFT.L / 1000 / 4, sigma = 32 * Mmid * 1000 / (Math.PI * d ** 3), tau = 16 * T * 1000 / (Math.PI * d ** 3);
      const I = Math.PI * (d / 1000) ** 4 / 64, delta = F * (SHAFT.L / 1000) ** 3 / (48 * 200e9 * I), Ncrit = Math.sqrt(g / delta) * 60 / (2 * Math.PI);
      near(T, SHAFT.P * 1000 / (2 * Math.PI * SHAFT.N / 60), 1e-3, 'typed torque');
      near(await reading('Largest torque carried'), T, 0.002, 'torque carried = P/ω');
      near(await reading('Highest von Mises stress'), Math.sqrt(sigma ** 2 + 3 * tau ** 2), 0.005, 'von Mises at mid-span: √(σ² + 3τ²)');
      near(await reading('Bearing 1 reaction'), F / 2, 0.002, 'reaction = F/2');
      near(await reading('First critical speed (Rayleigh)'), Ncrit, 0.002, 'critical speed √(g/δ), δ = mgL³/48EI');
      await saveRun('My fan shaft: 7.5 kW at 960 rpm, 30 mm');
      const fromMachine = await page.evaluate(async () => {
        const L = (await import('/machine/learn.mjs')).default, P = await import('/core/project.mjs');
        const proj = P.openStore(L.domain).current(), outs = L.outputsFor(proj.runs.at(-1).setup);
        return { runs: proj.runs.length, outs, describe: L.describe(proj.setup), levers: L.levers(proj.setup).length };
      });
      assert.equal(fromMachine.runs, 1);
      assert.equal(fromMachine.outs.torque.competency, 'ENG.machine.torque-power');
      assert.equal(fromMachine.outs.stress.competency, 'ENG.machine.combined-stress');
      assert.equal(fromMachine.outs.critical.competency, 'ENG.machine.critical-speed');
      assert.equal(Object.keys(fromMachine.outs).filter(k => k.startsWith('R:')).length, 2);
      const mrows = Object.fromEntries(fromMachine.describe.map(r => [r.label, r.value]));
      assert.equal(mrows['Segment 1'], `length ${SHAFT.L} mm, diameter ${SHAFT.d} mm`);
      assert.equal(mrows['Torque 1'], `${T} N·m at ${SHAFT.xIn} mm`);
      assert.equal(mrows["Shaft's own weight"], 'left out');
      assert.ok(fromMachine.levers >= 5);

      // the thermal descriptor imports and evaluates in the page too
      const th = await page.evaluate(async () => { const L = (await import('/thermal/learn.mjs')).default, T = await import('/thermal/model.mjs'); return Object.keys(L.outputsFor(T.fromPreset('wall'))); });
      assert.ok(th.includes('Q') && th.includes('T:L1'));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
