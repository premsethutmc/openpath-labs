// Mount bench, "Stiffness vs strength": played through visible controls only (tabs, chips, sliders, selects, buttons) on a
// phone (390 × 844, touch) and a desktop (1280 × 900). Every expected number is this file's own hand calculation
// (simply supported beam, point load under the mount); nothing reads page internals or imports the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const MAT = { aluminium: { E: 69000, fy: 276, name: 'Aluminium 6061-T6' }, steel: { E: 200000, fy: 250, name: 'Structural steel' } };
const P = 2500, L = 600, a = 200, TOL = 0.15;
function hand(material, b, h) {
  const { E, fy } = MAT[material], I = b * h ** 3 / 12, c = h / 2, Z = I / c, M = P * a * (L - a) / L;
  const defl = P * a * a * (L - a) ** 2 / (3 * E * I * L), stress = M / Z;
  return { E, fy, I, Z, EI: E * I, defl, stress, strain: stress / E * 1e6, allow: fy / 2, fos: fy / stress };
}
// the bars' stated log scales (shown on the page): deflection 0.015–1.5 mm, stress 10–1000 MPa
const pos = (v, lo, hi) => Math.max(0, Math.min(1, Math.log(v / lo) / Math.log(hi / lo)));

for (const vp of [{ width: 390, height: 844, touch: true }, { width: 1280, height: 900, touch: false }]) {
  test(`Mount stiffness vs strength ${vp.width}px: material moves deflection not stress, depth moves both, beyond-yield flagged, two-run ratios`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.touch, hasTouch: vp.touch });
      page.setDefaultTimeout(8000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const press = l => (vp.touch ? l.tap() : l.click());
      const tab = async id => { await press(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); };
      const text = id => page.locator(`#${id}`).innerText();
      const noOverflow = async where => assert.ok(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth), `no sideways scroll: ${where}`);

      // normal mode first: the readout stays hidden while the learner must find the problem from readings
      await page.goto(`${server.origin}/mount/`); await page.locator('body[data-ready="true"]').waitFor();
      await tab('design');
      assert.match(await text('ss-hidden'), /Shown after your diagnosis/); assert.equal(await page.locator('#ss-bars').isVisible(), false);
      await tab('split'); assert.equal(await page.locator('#ss-chart').isVisible(), false);

      // the open bench (as a journey opens it)
      await page.goto(`${server.origin}/mount/?project=current`); await page.locator('body[data-stage="free"]').waitFor();
      await tab('design');
      const setDesign = async (material, dims) => {
        await press(page.locator('#mat').getByRole('radio', { name: MAT[material].name }));
        for (const [k, v] of Object.entries(dims)) {
          const lab = page.locator('#dims label.range').filter({ hasText: k === 'b' ? 'Width b' : 'Depth h' });
          await lab.locator('input').fill(String(v)); assert.equal(await lab.locator('output').innerText(), `${v} mm`);
        }
      };
      const fill = async id => { const [f, t] = await Promise.all([page.locator(`#${id} .ss-fill`).boundingBox(), page.locator(`#${id}`).boundingBox()]); return f.width / t.width; };
      const readout = async (material, b, h) => {
        const x = hand(material, b, h);
        assert.equal(await text('ss-defl-val'), `${x.defl.toFixed(3)} mm vs ${TOL} mm limit`);
        assert.equal(await text('ss-defl-verdict'), x.defl <= TOL ? 'PASS' : 'FAIL');
        assert.equal(await text('ss-stress-val'), `${x.stress.toFixed(1)} MPa vs ${x.allow.toFixed(0)} MPa (yield ÷ 2)`);
        assert.equal(await text('ss-stress-verdict'), x.stress <= x.allow ? 'PASS' : 'FAIL');
        assert.equal(await text('ss-fos-val'), x.fos.toFixed(2));
        assert.equal(await text('ss-ei'), `E·I = ${(x.EI / 1e9).toFixed(2)} kN·m²`);
        assert.equal(await text('ss-z'), `I/c = ${Math.round(x.Z).toLocaleString('en-IN')} mm³`);
        const fd = await fill('ss-defl-bar'), fs = await fill('ss-stress-bar');
        assert.ok(Math.abs(fd - pos(x.defl, 0.015, 1.5)) < 0.01, `deflection bar ${fd} vs ${pos(x.defl, 0.015, 1.5)}`);
        assert.ok(Math.abs(fs - pos(x.stress, 10, 1000)) < 0.01, `stress bar ${fs} vs ${pos(x.stress, 10, 1000)}`);
        assert.match(await page.getByRole('meter', { name: /Deflection at the mount/ }).getAttribute('aria-valuetext'), x.defl <= TOL ? /pass$/ : /fail$/);
        return { x, fd, fs };
      };
      assert.match(await text('ss-cond'), /2500 N at 200 mm[\s\S]*deflection 0\.015–1\.5 mm, stress 10–1000 MPa/);

      // 1 · aluminium → steel: deflection bar drops (E ratio 0.345), stress bar does not move
      const al = await readout('aluminium', 40, 30);
      await setDesign('steel', {});
      const st = await readout('steel', 40, 30);
      assert.ok(al.fd - st.fd > 0.1, 'deflection bar visibly drops'); assert.ok(Math.abs(al.fs - st.fs) < 0.002, 'stress bar unchanged');
      assert.ok(Math.abs(st.x.defl / al.x.defl - 69 / 200) < 1e-9);
      // 2 · deeper section (h 30 → 60): both move — deflection ÷8, stress ÷4
      await setDesign('steel', { h: 60 });
      const deep = await readout('steel', 40, 60);
      assert.ok(st.fd - deep.fd > 0.1 && st.fs - deep.fs > 0.1, 'both bars drop');
      await noOverflow('design readout');

      // 3 · three loaded readings, gauges at the mount: aluminium 40×30, steel 40×30, steel 40×60
      const reading = async (material, b, h) => {
        await tab('design'); await setDesign(material, { b, h });
        await tab('stand');
        await press(page.locator('#load-on'));
        await page.locator('#dial-x').selectOption({ label: `${a} mm` }); await page.locator('#strain-x').selectOption({ label: `${a} mm` });
        await press(page.locator('#take'));
        assert.equal(await text('r-dial'), `${hand(material, b, h).defl.toFixed(3)} mm @ ${a}`);
      };
      await reading('aluminium', 40, 30); await reading('steel', 40, 30); await reading('steel', 40, 60);

      // stress–strain view: the live strain-gauge point on steel's Hooke line, the yield and allowable lines, the not-modelled region
      await tab('split');
      const x3 = hand('steel', 40, 60);
      assert.equal(await text('ss-point'), `Strain gauge at ${a} mm under load: ε = ${x3.strain.toFixed(0)} µε → σ = E·ε = ${x3.stress.toFixed(1)} MPa, ${(x3.stress / x3.fy * 100).toFixed(0)} % of yield.`);
      const chart = await page.locator('#ss-chart').textContent();
      assert.match(chart, /yield 250 MPa/); assert.match(chart, /allowable 125 MPa \(yield ÷ 2\)/); assert.match(chart, /not modelled/); assert.match(chart, /beyond yield/);
      assert.match(chart, new RegExp(`${(250 / 200000 * 1e6).toFixed(0)}`), 'yield strain on the axis');
      assert.match(await text('ss-model'), /Linear-elastic model[\s\S]*not modelled/);
      assert.equal(await page.locator('#ss-beyond').isVisible(), false); assert.equal(await page.locator('#ss-dot').count(), 1);

      // 4 · two-run comparison as ratios B ÷ A
      const opts = await page.locator('#ss-cmp-a option').allInnerTexts(), pick = k => opts.find(o => o.startsWith(`Reading ${k} ·`));
      const compare = async (A, B) => { await page.locator('#ss-cmp-a').selectOption({ label: pick(A) }); await page.locator('#ss-cmp-b').selectOption({ label: pick(B) }); };
      const ratio = async id => (await page.locator(`#${id} td`).last().innerText()).trim();
      await compare(1, 2);
      const r1 = hand('aluminium', 40, 30), r2 = hand('steel', 40, 30);
      assert.equal(await ratio('ss-r-defl'), `×${(r2.defl / r1.defl).toFixed(3)}`); assert.equal(await ratio('ss-r-ei'), `×${(r2.EI / r1.EI).toFixed(3)}`);
      assert.equal(await ratio('ss-r-stress'), '×1.000'); assert.equal(await ratio('ss-r-z'), '×1.000'); assert.equal(await ratio('ss-r-e'), `×${(200 / 69).toFixed(3)}`);
      assert.match(await text('ss-cmp-stiff'), new RegExp(`deflection ×${(r2.defl / r1.defl).toFixed(3)}; 1 ÷ \\(E·I change\\) ×${(r1.EI / r2.EI).toFixed(3)} → deflection follows E·I`));
      assert.match(await text('ss-cmp-strength'), /stress ×1\.000; 1 ÷ \(I\/c change\) ×1\.000; E ×2\.899 → stress follows the load and the section, not the material/);
      assert.equal(await page.locator('#ss-cmp-note').count(), 0, 'a like-for-like pair');
      await compare(2, 3);
      assert.equal(await ratio('ss-r-defl'), `×${(x3.defl / r2.defl).toFixed(3)}`); assert.equal(await ratio('ss-r-ei'), '×8.000');
      assert.equal(await ratio('ss-r-stress'), `×${(x3.stress / r2.stress).toFixed(3)}`); assert.equal(await ratio('ss-r-z'), '×4.000');
      assert.match(await text('ss-cmp-strength'), /stress ×0\.250; 1 ÷ \(I\/c change\) ×0\.250; E ×1\.000 → stress follows the load and the section\./);
      await noOverflow('comparison');

      // 5 · a reading past yield is flagged, not extrapolated: aluminium 10 × 10, σ = 333 333 ÷ 166.7 = 2000 MPa
      await reading('aluminium', 10, 10);
      const t = hand('aluminium', 10, 10);
      await tab('split');
      assert.ok(await page.locator('#ss-beyond').isVisible());
      assert.match(await text('ss-beyond'), new RegExp(`Beyond yield: σ = E·ε would give ${t.stress.toFixed(0)} MPa, more than the 276 MPa yield strength\\. The linear model does not apply here`));
      assert.equal(await page.locator('#ss-dot').count(), 0, 'no point drawn on an invented curve');
      assert.match(await page.locator('#ss-chart').textContent(), /reading off the model/);
      await tab('design');
      assert.equal(await text('ss-fos-val'), t.fos.toFixed(2)); assert.match(await text('ss-fos'), /below 1: past yield, not modelled/);
      await tab('runs');
      assert.match(await page.locator('#runs tbody tr').last().innerText(), new RegExp(`${t.stress.toFixed(1)} MPa beyond yield: not modelled`));
      await noOverflow('beyond yield');
      await page.screenshot({ path: `/tmp/mount-stiffness-${vp.width}.png`, fullPage: vp.touch });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
