// Journey 2 (pipe sizing, farm tank) played only through what a student sees and touches: on a phone (390 × 844,
// touch) and on a desktop (1280 × 900). Nothing here reads the runner, the store or an answer key. Every answer is
// worked out from the question's visible text by the hand methods in tests/pipe-hand.mjs; every bench quantity is
// read off the real fluid line bench after a run and checked against an independent system-curve calculation.
// Each viewport sizes the line differently — both designs meet the brief — and tries designs the bench must reject.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';
import * as H from './pipe-hand.mjs';

const TOL = { flow: 0.02, head: 0.01, mainLoss: 0.02 };   // independent estimate vs the bench (relative)
// The student's own description of each line they build (what they typed on the Build tab), for the hand calculation.
const line = ({ main = 0.032, riser = 0.032, L = 80, elbows = 2 }) => ({ lift: 12 - -2, entryK: H.K.footValve, suction: { D: 0.05, L: 3 },
  fittingsAfterPump: [H.K.checkValve, H.K.gateOpen], delivery: [{ D: main, L, elbowsAfter: elbows }, { D: riser, L: 12 }] });
const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    design: { key: 'A', main: 0.04, riser: 0.04, L: 80, addElbows: 0, run: 'Design A: 40 mm main and riser' } },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false,
    design: { key: 'B', main: 0.04, riser: 0.04, L: 90, addElbows: 2, run: 'Design B: 40 mm, 90 m route round the shed, 2 more elbows' } },
];
const OVERLOAD = { main: 0.05, riser: 0.05, run: 'Tried: 50 mm main and riser' };
const SHORT = { main: 0.04, riser: 0.032, run: 'Tried: 40 mm main, 32 mm riser' };
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b} (±${rel * 100} %)`);

for (const V of VIEWPORTS) {
  test(`pipe journey through visible controls only, ${V.name} ${V.viewport.width}×${V.viewport.height}: design ${V.design.key}`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: V.viewport, isMobile: V.isMobile, hasTouch: V.hasTouch, acceptDownloads: true });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      page.on('dialog', d => d.accept());
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

      const press = async loc => { await loc.scrollIntoViewIfNeeded(); await (V.hasTouch ? loc.tap() : loc.click()); };
      const app = page.locator('#app');
      const btn = name => app.getByRole('button', { name, exact: true });
      const has = async name => (await btn(name).count()) > 0 && await btn(name).first().isEnabled();
      const ready = () => page.locator('body[data-ready="true"]').waitFor();
      const step = async () => (await app.locator('.progress p').innerText()).replace(/^Step \d+ of \d+ · /, '');
      const noOverflow = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`);
      const setupShown = async () => (await app.locator('dl.setup').first().innerText()).trim();
      const pairs = async () => { const dts = await app.locator('dl.setup').first().locator('dt').allInnerTexts(), dds = await app.locator('dl.setup').first().locator('dd').allInnerTexts(); return Object.fromEntries(dts.map((k, i) => [k.trim(), dds[i].trim()])); };

      // ---------- an item, answered from its visible text ----------
      const visibleItem = async () => {
        const card = app.locator('.item');
        return { prompt: (await card.locator('p.lead').innerText()).trim(), options: (await card.locator('.options label').allInnerTexts()).map(t => t.trim()), card };
      };
      const answerVisible = async () => {
        const { prompt, options, card } = await visibleItem();
        const a = H.solveItem(prompt, options);
        if (a.choice !== undefined) await press(card.locator('.options label').nth(a.choice));
        else await card.getByLabel('Your answer, with its unit').fill(H.typed(a));
        await press(btn('Check'));
        const fb = (await app.locator('.feedback').innerText()).trim();
        assert.match(fb, /^Right/, `hand answer accepted for: ${prompt} → ${JSON.stringify(a)} (${fb})`);
        solved.push(prompt.slice(0, 40));
        return prompt;
      };

      // ---------- the bench, read only from what it shows ----------
      const B = {
        status: () => page.locator('#status').innerText(),
        reading: async label => { const dd = page.locator('#readings div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd'); return parseFloat(await dd.innerText()); },
        verdict: async key => (await page.locator(`[data-verdict="${key}"]`).innerText()).trim(),
        tab: async name => press(page.locator('.dock').getByRole('tab', { name, exact: true })),
        pick: async re => { const b = page.locator('#m-build .parts .sel').filter({ hasText: re }); if (await b.getAttribute('aria-pressed') !== 'true') await press(b); },
        set: async (label, value) => { const f = page.locator('#m-build').getByLabel(label); await f.fill(String(value)); await f.blur(); },
        // read the operating point after the bench has solved the edited line
        point: async () => {
          const st = await B.status();
          assert.doesNotMatch(st, /cavitating|Not solved/, st);
          return { Q: await B.reading('Flow'), H: await B.reading('Pump head'), P: await B.reading('Shaft power'),
            g5: await B.reading('G after #5'), g6: await B.reading('G after #6'), flowV: await B.verdict('flow'), driveV: await B.verdict('drive') };
        },
        build: async ({ main, riser, L = 80, addElbows = 0 }) => {
          await B.tab('Build');
          await B.pick(/^#6 Pipe/); await B.set('Bore', main * 1000); if (L !== 80) await B.set('Length', L);
          for (let i = 0; i < addElbows; i++) { await B.pick(/^#6 Pipe/); await press(page.locator('#m-build').getByRole('button', { name: '+ 90° elbow' })); }
          await B.pick(new RegExp(`^#${9 + addElbows} Pipe`)); await B.set('Bore', riser * 1000);
          const parts = await page.locator('#m-build .parts .sel').allInnerTexts();
          assert.match(parts[5], new RegExp(`Ø${main * 1000} × ${L} m`)); assert.match(parts[8 + addElbows], new RegExp(`Ø${riser * 1000} × 12 m`));
          assert.equal(parts.filter(t => /90° elbow/.test(t)).length, 2 + addElbows);
        },
        save: async name => {
          await B.tab('Experiments');
          await page.getByLabel('Run name').fill(name);
          await press(page.getByRole('button', { name: 'Save run' }));
          await page.locator('#m-experiments .msg').filter({ hasText: `Saved “${name}”` }).waitFor();
          const li = page.locator('#m-experiments .nb-runs li').filter({ hasText: name });
          assert.match(await li.innerText(), /reproduced from its saved setup/);
        },
      };
      const rhoG = H.WATER20.rho * H.G;
      // the bench's reading vs the student's own estimate: system head at the bench's flow = the bench's pump head,
      // and the gauge drop across the level main = friction along it
      const checkAgainstHand = (pt, l, what) => {
        near(H.systemHead(l, pt.Q / 1000), pt.H, TOL.head, `${what}: system head at the bench's flow vs its pump head`);
        near(H.mainLossAt(l, pt.Q / 1000), (pt.g5 - pt.g6) * 1000 / rhoG, TOL.mainLoss, `${what}: Darcy–Weisbach on the main vs the gauge drop`);
      };

      await page.goto(`${server.origin}/journeys/journey.html?j=pipe`);
      await ready();
      const seen = new Set(), solved = [];
      let helped = 0, shownSolution = false, explored = false, transferOpened = false, target = null, stuckDone = false;
      let r1Shown = null, design = null, bench = null, pump = null, runId = null, ranReturn = false, guard = 0;

      while (guard++ < 200) {
        const s = await step(); seen.add(s);
        await noOverflow(s);
        if (s === 'Portfolio') break;

        if (s === 'Brief') {
          assert.match(await app.innerText(), /at least 2\.5 L\/s[\s\S]*motor must not be overloaded/);
          await press(btn('Start · save Revision 1'));

        } else if (s === 'Predict') {
          if (await has('Lock predictions')) {
            // a deliberately wrong guess: the 32 mm line will easily make it (it will not)
            const f = app.locator('[data-field]');
            assert.equal(await f.count(), 3);
            await f.nth(0).fill('4'); await f.nth(1).fill('1'); await f.nth(2).fill('3.5');
            await press(btn('Lock predictions'));
          } else if (await has('Run the bench')) await press(btn('Run the bench'));
          else {
            const t = await app.locator('table.scored').innerText();
            assert.match(t, /off/); assert.match(t, /1\.651? L\/s/, 'the engine shows the 32 mm line short of 2.5 L/s');
            assert.match(await app.innerText(), /A miss is useful/);
            stuckDone = true;
            await press(btn('Find what is blocking me'));
          }

        } else if (s === 'Find the block') {
          if (await app.locator('.item').count()) {
            if (await has('I don’t know')) await press(btn('I don’t know')); else await press(btn('Next'));
          } else {
            assert.match(await app.innerText(), /What we found/);
            await press(btn('Continue'));
          }

        } else if (s === 'Learn') {
          if (await app.locator('.item').count() === 0) {
            const title = (await app.locator('.card h2').first().innerText()).replace('School maths', '').trim();
            // "Explore on the bench" opens the preset in a scratch bench; it must not touch the journey's project
            const ex = app.getByRole('link', { name: 'Explore on the bench' });
            if (!explored && await ex.count() && /circuit/.test(await ex.getAttribute('href'))) {
              explored = true;
              await press(ex); await ready();
              assert.match(await page.locator('#explore').innerText(), /Exploring the preset .*Your saved projects are not changed/);
              const name = (await page.locator('#title').innerText());
              assert.match(name, /^Exploring: /);
              await press(page.locator('#starts').getByRole('button', { name: /Preset: Pump set/ }));   // play with another preset too
              assert.match(await B.status(), /^Solved/);
              await page.goBack(); await ready();
              assert.equal(await step(), 'Learn');
            }
            target = title;
            await press(app.locator('[data-do="next"]'));
          } else if (await has('Check')) {
            // help in teaching: a hint on every practice item, and the worked solution once
            if (await has('Hint')) { await press(btn('Hint')); assert.ok(await app.locator('ol.hints li').count() > 0, 'hint shown'); helped++; }
            if (!shownSolution && await has('Show the solution')) {
              await press(btn('Show the solution'));
              assert.ok(await app.locator('ol.solution li').count() > 0, 'worked solution shown'); shownSolution = true; helped++;
            }
            await answerVisible();
          } else await press(btn('Next'));

        } else if (s === 'Apply') {
          if (await app.locator('.item').count()) {
            if (await has('Check')) { assert.equal(await btn('Hint').count(), 0, 'no hints when applying'); await answerVisible(); } else await press(btn('Next'));
          } else {
            const tr = app.getByRole('link', { name: 'Open it on the bench' });
            if (!transferOpened && await tr.count()) {
              transferOpened = true;
              await press(tr); await ready();
              assert.match(await page.locator('#title').innerText(), /^Exploring: Orchard tank/);
              assert.match(await page.locator('[data-verdict="flow"]').innerText(), /No/);
              await page.goBack(); await ready();
            }
            await press(btn('Continue to the check'));
          }

        } else if (s === 'Check') {
          if (await app.locator('.item').count()) {
            if (await has('Check')) { assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'the check is unaided'); await answerVisible(); }
            else await press(btn('Next'));
          } else {
            assert.equal((await app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
            await press(btn('Back to my design'));
          }

        } else if (s === 'Your design') {
          if (!design) {
            // R1 is still the starting design: exploring presets on the bench did not change it
            assert.match(await app.innerText(), /As saved in Revision 1\./);
            r1Shown = await pairs();
            assert.match(r1Shown['6. Pipe'], /^bore 32 mm, length 80 m,/);

            // ---- the real fluid line bench, through its visible link ----
            await press(app.getByRole('link', { name: 'Change it on the bench' }));
            await ready();
            assert.match(await page.locator('#title').innerText(), /Pipe sizing/, 'the bench opens the journey project');
            assert.equal(await page.locator('#explore').isHidden(), true);
            const P0 = await B.point();
            assert.equal(P0.Q, 1.65); assert.match(P0.flowV, /No/);
            checkAgainstHand(P0, line({}), 'R1 (32 mm)');

            // an invalid design: plenty of water, but the 1.5 kW motor is overloaded
            await B.build(OVERLOAD);
            const P1 = await B.point();
            assert.match(P1.flowV, /Yes/); assert.match(P1.driveV, /No\s+needs [\d.]+ kW, [\d.]+ kW over 1\.5 kW/);
            assert.ok(P1.P > 1.5);
            checkAgainstHand(P1, line(OVERLOAD), '50 mm line');
            await B.save(OVERLOAD.run);
            // another invalid design: within the motor, but short of 2.5 L/s
            await B.build(SHORT);
            const P2 = await B.point();
            assert.match(P2.flowV, /No\s+[\d.]+ L\/s, [\d.]+ L\/s short of 2\.5 L\/s/); assert.match(P2.driveV, /Yes/);
            checkAgainstHand(P2, line(SHORT), '40/32 line');
            await B.save(SHORT.run);

            // the student's pump curve from the three runs they measured; their own operating point for the design
            pump = H.fitPump([P0, P1, P2]);
            const d = V.design, mine = line({ main: d.main, riser: d.riser, L: d.L, elbows: 2 + d.addElbows });
            const estimate = H.operatingPoint(mine, pump);
            assert.ok(estimate >= 2.5, `hand estimate meets the brief: ${estimate}`);
            await B.build(d);
            const P3 = await B.point();
            assert.match(P3.flowV, /Yes\s+[\d.]+ L\/s against 2\.5 L\/s required/); assert.match(P3.driveV, /Yes\s+needs [\d.]+ kW of 1\.5 kW/);
            assert.ok(P3.Q >= 2.5 && P3.P <= 1.5);
            near(estimate, P3.Q, TOL.flow, `design ${d.key}: hand operating point vs the bench's flow`);
            checkAgainstHand(P3, mine, `design ${d.key}`);
            await B.save(d.run);
            bench = { P0, P1, P2, P3, estimate, mine };
            design = d;
            await noOverflow('bench');

            await page.goBack(); await ready();
            assert.equal(await step(), 'Your design');
            await press(btn('I’ve saved a change'));
            const text = await app.innerText();
            assert.match(text, /Changed since Revision 1: .*6\. Pipe/);
            const shown = await pairs();
            assert.match(shown['6. Pipe'], new RegExp(`^bore ${+(d.main * 1000).toPrecision(4)} mm, length ${d.L} m,`)); assert.match(shown[`${9 + d.addElbows}. Pipe`], new RegExp(`^bore ${+(d.riser * 1000).toPrecision(4)} mm,`));
            assert.equal(Object.keys(shown).filter(k => /^\d+\. 90° elbow$/.test(k)).length, 2 + d.addElbows);

            // reload the journey page mid-way: the exact saved design comes back
            const before = await setupShown();
            await page.reload(); await ready();
            assert.equal(await step(), 'Your design');
            assert.equal(await setupShown(), before, 'the same design after a reload');
            assert.match(await app.innerText(), /Changed since Revision 1/);
            continue;
          }
          if (!ranReturn && await has('Lock predictions')) {
            // predictions for the revised line: flow from the student's own operating point, main loss by
            // Darcy–Weisbach at that flow, shaft power read off the bench run
            const f = app.locator('[data-field]');
            await f.nth(0).fill(bench.estimate.toFixed(2));
            await f.nth(1).fill(H.mainLossAt(bench.mine, bench.estimate / 1000).toFixed(2));
            await f.nth(2).fill(String(bench.P3.P));
            await press(btn('Lock predictions'));
          } else if (await has('Run the bench')) {
            await press(btn('Run the bench')); ranReturn = true;
            const t = await app.locator('table.scored').last().innerText();
            assert.doesNotMatch(t, /\boff\b/, `all three predictions close: ${t}`);
          } else {
            const save = app.getByRole('button', { name: /Save as Revision 2/ });
            await press(save.first());
          }

        } else if (s === 'Decide') {
          // cite the bench run of the chosen design
          const label = app.locator('.checks label').filter({ hasText: design.run });
          runId = (await label.innerText()).trim().split(' · ')[0];
          await press(label.locator('input'));
          assert.ok(await label.locator('input').isChecked());
          await app.locator('#claim').fill(`${design.run}. Run ${runId} on the bench delivers ${bench.P3.Q} L/s (2.5 needed) with the motor at ${bench.P3.P} of 1.5 kW, no cavitation; my hand estimate was ${bench.estimate.toFixed(2)} L/s.`);
          await app.locator('#rejected').fill(`${OVERLOAD.run}: motor overloaded (${bench.P1.P} kW)\n${SHORT.run}: ${bench.P2.Q} L/s, short of 2.5 L/s`);
          await press(btn('Save the decision'));

        } else if (s === 'Defend') {
          // "what if" questions, answered with the student's pump curve (now four measured points) and system curve
          const curve = H.fitPump([bench.P0, bench.P1, bench.P2, bench.P3]);
          const fields = app.locator('[data-field]'), n = await fields.count();
          assert.equal(n, 3);
          for (let i = 0; i < n; i++) {
            const q = (await app.locator(`label[for="f-${i}"]`).innerText()).trim(), l = JSON.parse(JSON.stringify(bench.mine));
            let m;
            if ((m = q.match(/one size larger \(([\d., ]+) → ([\d., ]+) mm\)/))) { const to = m[2].split(',').map(Number); l.delivery.forEach((p, k) => { p.D = (to[k] ?? to[0]) / 1000; }); }
            else if ((m = q.match(/main \((\d+) m\) were twice as long/))) { assert.equal(+m[1], design.L); l.delivery[0].L *= 2; }
            else if (/two more 90° elbows on the main/.test(q)) l.delivery[0].elbowsAfter += 2;
            else assert.fail(`no hand method for the question: ${q}`);
            await fields.nth(i).fill(H.operatingPoint(l, curve).toFixed(3));
          }
          await press(btn('Submit'));
        } else assert.fail(`unexpected step ${s}`);
      }

      // ---------- the portfolio ----------
      assert.equal(await step(), 'Portfolio', (await app.innerText()).slice(0, 1500));
      for (const s of ['Brief', 'Predict', 'Find the block', 'Learn', 'Apply', 'Check', 'Your design', 'Decide', 'Defend']) assert.ok(seen.has(s), `passed through ${s}`);
      assert.ok(stuckDone && explored && transferOpened && shownSolution && helped >= 2);
      assert.ok(solved.length >= 5, `items solved by hand: ${solved.length}`);
      const text = await app.innerText();
      assert.match(text, /Design Revision 1 → Revision 2/);
      const flowRow = (await app.locator('table.tbl').first().locator('tr').filter({ hasText: /^Flow/ }).innerText()).split('\t').map(t => t.trim());
      near(+flowRow[1], 1.651, 0.002, 'R1 flow'); near(+flowRow[2], bench.P3.Q, 0.003, 'R2 flow = the bench run of the design');
      assert.equal((await app.locator('#claim-text').innerText()).includes(`Run ${runId}`), true);
      assert.match(text, new RegExp(`Runs: [^\\n]*\\b${runId}\\b`), 'the decision cites the bench run');
      assert.match(text, /Rejected: Tried: 50 mm/);
      const defence = await app.locator('table.scored').innerText();
      assert.doesNotMatch(defence, /\boff\b/, `every "what if" answered within tolerance: ${defence}`);
      assert.match(text, new RegExp(`${target.replace(/[()]/g, '.')} · Solved on your own after help`));
      const runs = app.locator('.card').filter({ has: page.locator('h2', { hasText: /^Runs$/ }) }).locator('li');
      const names = await runs.allInnerTexts();
      for (const nm of [OVERLOAD.run, SHORT.run, design.run, 'Revision 1 · starting design', 'Revision 2 · revised design']) assert.ok(names.some(t => t.includes(nm)), `run listed: ${nm}`);
      assert.ok(names.every(t => /reproduced from its saved setup/.test(t)), 'every run reproduces');
      assert.equal(await app.locator('.badmsg').count(), 0);
      await noOverflow('portfolio');
      // the two files a student can download from here: the project (the bench record) and the portfolio
      const download = async name => { const [d] = await Promise.all([page.waitForEvent('download'), press(btn(name))]); return JSON.parse(await readFile(await d.path(), 'utf8')); };
      const proj = await download('Export project file'), port = await download('Export portfolio (JSON)');
      assert.equal(proj.format, 'openpath.project'); assert.equal(proj.version, 2); assert.equal(proj.origin, 'journey:pipe');
      assert.equal(proj.decisions.length, 1);
      const dec = proj.decisions[0];
      assert.ok(dec.runs.includes(runId)); assert.equal(dec.defence.length, 3); assert.ok(dec.defence.every(x => x.result === 'correct'));
      const r2 = proj.runs.find(r => r.id === dec.to), linked = proj.runs.find(r => r.id === runId);
      assert.deepEqual(r2.setup, linked.setup, 'R2 is exactly the design run on the bench');
      assert.equal(port.design.to.run, dec.to); assert.ok(port.runs.every(r => r.reproduced));
      const kinds = new Set(port.trail.events.map(e => `${e.kind}/${e.provenance}`));
      for (const k of ['evidence/diagnostic', 'hint/practice', 'shown_solution/practice', 'evidence/check']) assert.ok(kinds.has(k), `ledger has ${k}: ${[...kinds]}`);
      assert.deepEqual(errors, []);
      console.log(`# ${V.name}: ${solved.length} items solved by hand, ${helped} help uses; design ${design.key}: bench ${bench.P3.Q} L/s, ${bench.P3.H} m, ${bench.P3.P} kW; hand ${bench.estimate.toFixed(3)} L/s; ` +
        `rejected 50 mm ${bench.P1.Q} L/s ${bench.P1.P} kW, 40/32 ${bench.P2.Q} L/s ${bench.P2.P} kW`);
    } finally { await browser.close(); server.close(); }
  });
}

// Learn-step links into Pump House (Reynolds, roughness, system curve, operating point) open the named mission.
test('"Explore on the bench" links into Pump House open their mission', async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    for (const [preset, title] of [['regime', 'Smooth or chaotic?'], ['length', 'A longer pipe'], ['diameter', 'A thinner pipe'], ['valve', 'Close the valve']]) {
      await page.goto(`${server.origin}/pumps/?preset=${preset}`);
      await page.locator('body[data-ready="true"]').waitFor();
      assert.equal((await page.locator('#mission h2').innerText()).trim(), title);
    }
  } finally { await browser.close(); server.close(); }
});
