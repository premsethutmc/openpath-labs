// The open loop on the REAL fluid line bench (docs/OPEN_LOOP.md), on a line the student builds from the EMPTY workspace
// (no preset describes it): on a phone (390 × 844, touch) with a pumped line, and on a desktop (1280 × 900) with a gravity
// line. Played through visible controls only: nothing here reads window.__journey, imports an item generator or answer
// key, writes storage or calls the runner. Every question is answered from its visible text by the hand methods in
// tests/pipe-hand.mjs; whole-line quantities come from the bench's visible readings, checked against the student's own
// calculation (system head at the bench's flow = the bench's pump head; T = P/ω), or, for the gravity line, from an
// independent series-line solver written here (Darcy–Weisbach with Colebrook, K·V²/2g, Borda–Carnot, energy equation).
// Flow: build → save a run → Experiments: Predict and learn → "Your design" in words → pick outputs (flow included) →
// a deliberately wrong prediction → run → target from the most-missed output → find the block → learn (hint and worked
// solution on a prerequisite) → apply → unaided check → "Change it on the bench" opens THEIR project → change two levers,
// save a run → back, reload, the changed design is shown → predict and run → Revision 2 → decide citing the bench run →
// defend (by hand, or by setting the lever back on the bench and reading it) → portfolio on their project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';
import * as H from './pipe-hand.mjs';

const rhoG = H.WATER20.rho * H.G;
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b} (±${rel * 100} %)`);
const num = s => parseFloat(String(s).replace(/−/g, '-'));

// ---------- the student's own series-line calculation (gravity line, no pump) ----------
// line: { surface (source water surface, m), sink (m), entryK, parts: [{ pipe: { D, L, eps } } | { K }] } (fittings take the
// bore of the pipe before them). Returns heads at Q (m³/s).
function lineLosses(line, Q, nu = H.WATER20.nu) {
  let loss = 0, D = null;
  const firstD = line.parts.find(p => p.pipe).pipe.D;
  loss += line.entryK * H.vhead(Q, firstD);
  for (const p of line.parts) {
    if (p.pipe) {
      if (D !== null && p.pipe.D !== D) loss += p.pipe.D > D ? (1 - (D / p.pipe.D) ** 2) ** 2 * H.vhead(Q, D) : 0.5 * (1 - (p.pipe.D / D) ** 2) * H.vhead(Q, p.pipe.D);
      D = p.pipe.D; loss += H.hf(Q, p.pipe, nu);
    } else loss += p.K * H.vhead(Q, D ?? firstD);
  }
  return loss + H.K.exit * H.vhead(Q, D);
}
// gravity flow: the static head is used up by the losses (bisection on Q, L/s)
function gravityFlow(line) {
  let lo = 1e-4, hi = 50;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (lineLosses(line, m / 1000) < line.surface - line.sink) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// gauge (kPa) on the junction after line.parts[k] (level line at z = 0, same bore on both sides of the junction)
function gaugeAfter(line, Qlps, k) {
  const Q = Qlps / 1000, sub = { ...line, parts: line.parts.slice(0, k + 1) };
  const D = [...sub.parts].reverse().find(p => p.pipe).pipe.D;
  const lost = lineLosses(sub, Q) - H.K.exit * H.vhead(Q, D);
  return rhoG * (line.surface - lost - H.vhead(Q, D)) / 1000;
}

// ---------- the two student-built lines ----------
const PVC = H.PVC_EPS;
const PUMPED = {   // phone: a suction lift through a foot valve, a 2-pole pump, a check valve, a 40 mm main and a 32 mm riser
  name: 'My well pump to the roof tank',
  parts: [
    ['Source reservoir', { 'Water surface': -1.5, 'Pipe leaves at': -1.5, 'Pipe inlet': 'Foot valve with strainer (K 5)' }],
    ['Pipe', { Bore: 50, Length: 3, 'Rise (end − start)': 1.5 }],
    ['Centrifugal pump', { Speed: 2900, 'Impeller diameter': 130 }],
    ['Non-return valve'],
    ['Pipe', { Bore: 40, Length: 25 }],
    ['90° elbow'],
    ['Pipe', { Bore: 32, Length: 8, 'Rise (end − start)': 8 }],
    ['Receiving reservoir', { 'Water surface': 8 }],
  ],
  listed: ['#1 Source reservoir', '#2 Pipe Ø50 × 3 m', '#3 Centrifugal pump', '#4 Non-return valve', '#5 Pipe Ø40 × 25 m', '#6 90° elbow', '#7 Pipe Ø32 × 8 m', '#8 Receiving reservoir'],
  gauges: [/after #4 Non-return valve/],
  // the student's system curve, in their own terms (lift 9.5 m, PVC)
  system: (Q, d = {}) => {
    const main = d.main ?? 0.04, riser = 0.032, s = { D: 0.05, L: 3, eps: PVC };
    let h = 9.5 + H.K.footValve * H.vhead(Q, s.D) + H.hf(Q, s, H.WATER20.nu);
    h += H.K.checkValve * H.vhead(Q, main) + H.hf(Q, { D: main, L: 25, eps: PVC }, H.WATER20.nu) + H.K.elbow * H.vhead(Q, main);
    h += riser < main ? 0.5 * (1 - (riser / main) ** 2) * H.vhead(Q, riser) : riser > main ? (1 - (main / riser) ** 2) ** 2 * H.vhead(Q, main) : 0;
    return h + H.hf(Q, { D: riser, L: 8, eps: PVC }, H.WATER20.nu) + H.K.exit * H.vhead(Q, riser);
  },
  pick: ['Flow (L/s)', 'Shaft torque (N·m)'], keys: ['flow', 'torque'],
  // miss the torque most (×4), the flow a little (×1.5): the target is the torque–power concept
  wrong: { flow: 1.5, torque: 4 }, target: 'Torque from power and speed: T = P/ω, ω = 2πN/60 (Design of Machine Elements, sem V)',
  revise: [['#5 Pipe', { Bore: 50 }], ['#3 Centrifugal pump', { Speed: 2600 }]],
  brief: { '1. Source reservoir': 'water surface -1.5 m, pipe leaves at -1.5 m, pipe inlet Foot valve with strainer (K 5)', '3. Centrifugal pump': 'speed 2900 rpm, impeller diameter 130 mm, motor No motor chosen',
    '7. Pipe': 'bore 32 mm, length 8 m, material PVC (new), rise (end − start) 8 m', 'Pressure gauges': 'between #4 Non-return valve and #5 Pipe' },
  changedRows: { '3. Centrifugal pump': /^speed 2600 rpm,/, '5. Pipe': /^bore 50 mm, length 25 m,/ },
};
const GRAVITY = {   // desktop: a gravity line from a header tank 6 m up through a 40 mm pipe, a gate valve, an elbow and a 32 mm pipe
  name: 'My header tank to the garden trough',
  parts: [
    ['Source reservoir', { 'Water surface': 6, 'Pipe leaves at': 0 }],
    ['Pipe', { Bore: 40, Length: 20 }],
    ['Gate valve'],
    ['90° elbow'],
    ['Pipe', { Bore: 32, Length: 30 }],
    ['Receiving reservoir', { 'Water surface': 0 }],
  ],
  listed: ['#1 Source reservoir', '#2 Pipe Ø40 × 20 m', '#3 Gate valve 100 %', '#4 90° elbow', '#5 Pipe Ø32 × 30 m', '#6 Receiving reservoir'],
  gauges: [/after #3 Gate valve/],
  line: (d = {}) => ({ surface: 6, sink: 0, entryK: H.K.square, parts: [{ pipe: { D: 0.04, L: d.L1 ?? 20, eps: PVC } }, { K: H.K.gateOpen }, { K: H.K.elbow }, { pipe: { D: d.D2 ?? 0.032, L: 30, eps: PVC } }] }),
  pick: ['Flow (L/s)', 'Gauge pressure between #3 Gate valve and #4 90° elbow (kPa (gauge))'], keys: ['flow', 'gauge:p3'],
  wrong: { flow: 2, 'gauge:p3': 1.3 }, target: 'System curve: static head plus losses ∝ Q²',
  revise: [['#2 Pipe', { Length: 35 }], ['#5 Pipe', { Bore: 40 }]],
  brief: { '1. Source reservoir': 'water surface 6 m, pipe leaves at 0 m, pipe inlet Square-edged entrance (K 0.5)', '3. Gate valve': 'opening 100 %',
    '5. Pipe': 'bore 32 mm, length 30 m, material PVC (new), rise (end − start) 0 m', 'Pressure gauges': 'between #3 Gate valve and #4 90° elbow' },
  changedRows: { '2. Pipe': /^bore 40 mm, length 35 m,/, '5. Pipe': /^bore 40 mm, length 30 m,/ },
};

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, net: PUMPED },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, net: GRAVITY },
];

for (const V of VIEWPORTS) {
  const N = V.net;
  test(`open loop on the real fluid line bench, a line built from empty, ${V.name} ${V.viewport.width}×${V.viewport.height}`, { timeout: 240000 }, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: V.viewport, isMobile: V.isMobile, hasTouch: V.hasTouch, acceptDownloads: true });
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.protocol !== 'blob:' && u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      page.on('dialog', d => d.accept());
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const press = async loc => { await loc.scrollIntoViewIfNeeded(); await (V.hasTouch ? loc.tap() : loc.click()); };
      const ready = () => page.locator('body[data-ready="true"]').waitFor();
      const app = page.locator('#app'), btn = name => app.getByRole('button', { name, exact: true });
      const has = async name => (await btn(name).count()) > 0 && await btn(name).first().isEnabled();
      const phase = () => page.locator('body').getAttribute('data-phase');
      const noOverflow = async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`);
      const pairs = async () => { const dl = app.locator('dl.setup').first(); const dts = await dl.locator('dt').allInnerTexts(), dds = await dl.locator('dd').allInnerTexts(); return Object.fromEntries(dts.map((k, i) => [k.trim(), dds[i].trim()])); };
      const scored = async caption => app.locator('table.scored', { has: page.locator('caption', { hasText: caption }) }).locator('tbody tr')
        .evaluateAll(trs => trs.map(tr => ({ prompt: tr.cells[0].textContent, you: tr.cells[1].textContent, engine: tr.cells[2].textContent, result: tr.cells[3].textContent })));
      const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/olf-${V.name}-${name}.png`, fullPage: true }); };

      // ---------- the bench, only through what it shows ----------
      const B = {
        tab: async name => press(page.locator('.dock').getByRole('tab', { name, exact: true })),
        set: async (label, v) => {
          const f = page.locator('#m-build').getByLabel(label, { exact: false }).first();
          if (await f.evaluate(el => el.tagName) === 'SELECT') await f.selectOption({ label: v }); else { await f.fill(String(v)); await f.blur(); }
        },
        pick: async prefix => { const b = page.locator('#m-build .parts .sel').filter({ hasText: prefix }); assert.equal(await b.count(), 1, `one part ${prefix}`); if (await b.getAttribute('aria-pressed') !== 'true') await press(b); },
        edit: async (prefix, fields) => { await B.tab('Build'); await B.pick(prefix); for (const [k, v] of Object.entries(fields)) await B.set(k, v); },
        listed: async () => (await page.locator('#m-build .parts .sel').allInnerTexts()).map(t => t.trim()),
        reading: async label => { const dd = page.locator('#readings div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`) }) }).locator('dd'); return num(await dd.innerText()); },
        status: () => page.locator('#status').innerText(),
        read: async () => {
          const st = await B.status();
          assert.match(st, /^Solved: /, st);
          const r = { Q: await B.reading('Flow') };
          if (N === PUMPED) Object.assign(r, { H: await B.reading('Pump head'), P: await B.reading('Shaft power'), T: await B.reading('Shaft torque'), g: await B.reading('G after #4') });
          else r.g = await B.reading('G after #3');
          return r;
        },
        save: async name => {
          await B.tab('Experiments');
          await page.getByLabel('Run name').fill(name);
          await press(page.getByRole('button', { name: 'Save run' }));
          await page.locator('#m-experiments .msg').filter({ hasText: `Saved “${name}”` }).waitFor();
          assert.match(await page.locator('#m-experiments .nb-runs li').filter({ hasText: name }).innerText(), /reproduced from its saved setup/);
        },
      };
      // the student's own check of a bench reading
      const handCheck = (r, d, what) => {
        if (N === PUMPED) {
          near(N.system(r.Q / 1000, d), r.H, 0.01, `${what}: system head at the bench flow vs the bench pump head`);
          near(r.P * 1000 / (2 * Math.PI * (d.rpm ?? 2900) / 60), r.T, 0.01, `${what}: T = P/ω`);
        } else {
          const l = N.line(d), Q = gravityFlow(l);
          near(Q, r.Q, 0.01, `${what}: hand gravity flow vs the bench`);
          near(gaugeAfter(l, r.Q, 1), r.g, 0.01, `${what}: energy equation to the gauge after the valve`);
        }
      };

      // ---------- items, answered from their visible text ----------
      const solved = [];
      const answer = async ({ wrong = false } = {}) => {
        const card = app.locator('.item'), prompt = (await card.locator('p.lead').innerText()).trim();
        const options = (await card.locator('.options label').allInnerTexts()).map(t => t.trim());
        const a = H.solveItem(prompt, options);
        if (a.choice !== undefined) await press(card.locator('.options label').nth(wrong ? (a.choice + 1) % options.length : a.choice));
        else await card.getByLabel('Your answer, with its unit').fill(H.typed(wrong ? { ...a, value: a.value * 3 + 1 } : a));
        await press(btn('Check'));
        const fb = (await app.locator('.feedback').innerText()).trim();
        if (!wrong) assert.match(fb, /^Right/, `hand answer accepted for: ${prompt} → ${JSON.stringify(a)} (${fb})`);
        solved.push(prompt);
        return prompt;
      };

      // ===== 1. build the line from the EMPTY workspace, through the Build, Measure and Experiments tabs =====
      await page.goto(`${server.origin}/circuit/`); await ready();
      await press(page.getByRole('button', { name: 'Empty workspace' }));
      assert.match(await page.locator('#scheme').innerHTML(), /Empty workspace/);
      assert.deepEqual(await B.listed(), []);
      for (const [name, fields = {}] of N.parts) {
        await press(page.locator('#m-build').getByRole('button', { name: `+ ${name}`, exact: true }));
        for (const [k, v] of Object.entries(fields)) await B.set(k, v);
      }
      assert.deepEqual(await B.listed(), N.listed);
      await B.tab('Measure');
      for (const g of N.gauges) await page.locator('#m-measure').getByLabel(g).check();
      await noOverflow('bench');
      const R1 = await B.read();
      handCheck(R1, {}, 'Revision 1');
      await B.save('My first line');
      const projectName = (await page.locator('#m-experiments .nb-open option:checked').innerText()).split(' · ')[0];

      // ===== 2. Predict and learn: "Your design" in words, on their own project =====
      const link = page.locator('#m-experiments').getByRole('link', { name: 'Predict and learn' });
      assert.match(await link.getAttribute('href'), /^\/journeys\/journey\.html\?open=fluids-line&project=[\w-]+$/);
      await press(link);
      await page.waitForURL(/journey\.html\?open=fluids-line&project=/); await ready();
      assert.equal(await app.locator('h1').innerText(), 'Your design');
      const shown1 = await pairs();
      if (process.env.DEBUG) console.log(shown1);
      assert.equal(Object.keys(shown1).filter(k => /^\d+\. /.test(k)).length, N.parts.length);
      for (const [k, v] of Object.entries(N.brief)) assert.equal(shown1[k], v, `brief: ${k}`);
      assert.match(await app.innerText(), new RegExp(`a run on your own project “${projectName}”`));
      await noOverflow('brief'); await shot('brief');
      await press(btn('Start · save Revision 1'));

      // ===== 3. pick outputs (flow included), predict wrong on purpose, run =====
      assert.equal(await phase(), 'stuck');
      for (const p of N.pick) await press(app.locator('#pick label').filter({ hasText: p }));
      await press(btn('Predict these'));
      assert.deepEqual(await app.locator('[data-field]').evaluateAll(els => els.map(e => e.dataset.field)), N.keys);
      const truth1 = { flow: R1.Q, torque: R1.T, 'gauge:p3': R1.g };
      for (const k of N.keys) await app.locator(`[data-field="${k}"]`).fill((truth1[k] * N.wrong[k]).toPrecision(3));
      await press(btn('Lock predictions')); await press(btn('Run the bench'));
      const rows1 = await scored('Your prediction against the engine');
      assert.deepEqual(rows1.map(r => r.result), N.keys.map(() => 'off'));
      rows1.forEach((r, i) => near(num(r.engine), truth1[N.keys[i]], 0.005, `engine ${r.prompt} = the bench reading`));
      await noOverflow('predict'); await shot('predict');
      await press(btn('Find what is blocking me'));

      // ===== 4. find the block: "I don't know" is an honest answer =====
      for (let i = 0; i < 6 && !(await app.innerText()).includes('What we found'); i++) {
        if (await has('I don’t know')) await press(btn('I don’t know')); else await press(btn('Next'));
      }
      const found = await app.innerText();
      if (process.env.DEBUG) console.log(found);
      assert.match(found, /What we found/); assert.ok(found.includes(`Then ${N.target}.`), found);
      await press(btn('Continue'));

      // ===== 5. learn: a hint and the worked solution on a prerequisite, then practice answered by hand =====
      let helpedOn = null, lessons = [];
      for (let g = 0; g < 60 && (await phase()) === 'teach'; g++) {
        if (await app.locator('.item').count() === 0) { lessons.push((await app.locator('.card h2').first().innerText()).replace('School maths', '').trim()); await press(app.locator('[data-do="next"]')); continue; }
        if (await has('Check')) {
          const title = (await app.locator('h2').first().innerText()).trim();
          if (!helpedOn && title !== N.target) {
            if (await has('Hint')) { await press(btn('Hint')); assert.ok(await app.locator('ol.hints li').count() > 0); }
            if (await has('Show the solution')) { await press(btn('Show the solution')); assert.ok(await app.locator('ol.solution li').count() > 0); }
            helpedOn = title;
          }
          await answer();
        } else await press(btn('Next'));
      }
      if (process.env.DEBUG) console.log({ lessons, helpedOn });
      assert.ok(helpedOn, 'help used on a prerequisite');
      assert.equal(lessons.at(-1), N.target, 'the target is taught last');

      // ===== 6. apply on their own, then the unaided check =====
      assert.equal(await phase(), 'apply');
      for (let g = 0; g < 10 && (await phase()) === 'apply'; g++) {
        if (await app.locator('.item').count()) {
          if (await has('Check')) { assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'no help when applying'); await answer(); }
          else await press(btn('Next'));
        } else {
          assert.match(await app.locator('#transfer').getAttribute('href'), /^\.\.\/circuit\/\?project=P\d+$/);
          await press(btn('Continue to the check'));
        }
      }
      assert.equal(await phase(), 'check');
      assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'the check is unaided');
      await answer(); await press(btn('Next'));
      assert.equal((await app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
      await noOverflow('check'); await shot('check');
      await press(btn('Back to my design'));

      // ===== 7. back to THEIR project on the bench: the same line opens; change two levers, save a run =====
      assert.equal(await phase(), 'return');
      assert.match(await app.innerText(), /As saved in Revision 1\./);
      await press(app.getByRole('link', { name: 'Change it on the bench' }));
      await page.waitForURL(/\/circuit\/\?project=P\d+$/); await ready();
      assert.deepEqual(await B.listed(), N.listed, 'their own line is open on the bench');
      assert.match(await page.locator('#m-experiments .nb-open option:checked').innerText(), new RegExp(`^${projectName} · 2 runs`));
      for (const [prefix, fields] of N.revise) await B.edit(prefix, fields);
      const d2 = N === PUMPED ? { main: 0.05, rpm: 2600 } : { L1: 35, D2: 0.04 };
      const Rv = await B.read();
      handCheck(Rv, d2, 'revised line');
      await B.save('Revised line');
      await page.goBack(); await ready();
      await page.reload(); await ready();
      assert.equal(await phase(), 'return');
      const text2 = await app.innerText();
      assert.match(text2, /Changed since Revision 1: /);
      const shown2 = await pairs();
      for (const [k, re] of Object.entries(N.changedRows)) { assert.match(shown2[k], re, `the changed design after a reload: ${k}`); assert.ok(text2.includes(k.replace(/^\d+\. /, '')), k); }
      assert.equal(await app.locator('dl.setup').first().locator('dd.chg').count(), Object.keys(N.changedRows).length, 'the changed rows are marked');

      // ===== 8. predict and run the revised design (from the student's own reading and check), save Revision 2 =====
      const truth2 = { flow: Rv.Q, torque: Rv.T, 'gauge:p3': Rv.g };
      for (const k of N.keys) await app.locator(`[data-field="${k}"]`).fill(String(+truth2[k].toPrecision(4)));
      await press(btn('Lock predictions')); await press(btn('Run the bench'));
      assert.deepEqual((await scored('Prediction run 1')).map(r => r.result), N.keys.map(() => 'close'));
      const tested = (await app.locator('#tested-status').innerText()).match(/This design is tested \(run (R\d+)\)/)[1];
      await noOverflow('return'); await shot('return');
      await press(btn('Save as Revision 2'));

      // ===== 9. decide, citing the bench run of the revised line =====
      assert.equal(await phase(), 'decide');
      const runLabel = app.locator('.checks label').filter({ hasText: 'Revised line' });
      const benchRun = (await runLabel.innerText()).trim().split(' · ')[0];
      await press(runLabel.locator('input'));
      await app.locator('#claim').fill(`I changed ${N.revise.map(r => r[0]).join(' and ')}. Run ${benchRun} on the bench gives ${Rv.Q} L/s.`);
      await app.locator('#rejected').fill('Leaving the line as it was');
      await press(btn('Save the decision'));

      // ===== 10. defend: each "what if it went back" question, answered by hand or read off the bench =====
      assert.equal(await phase(), 'defend');
      const qs = (await app.locator('.field').allInnerTexts()).map(t => t.trim());
      if (process.env.DEBUG) console.log(qs);
      assert.equal(qs.length, 2);
      const answers = [];
      for (const [i, q] of qs.entries()) {
        let m;
        if (N === GRAVITY) {
          const d = { ...d2 };
          if ((m = q.match(/#2 Pipe: length went back to its Revision 1 value \(20 m instead of 35 m\)/))) d.L1 = 20;
          else if ((m = q.match(/#5 Pipe: bore went back to its Revision 1 value \(32 mm instead of 40 mm\)/))) d.D2 = 0.032;
          else assert.fail(`no hand method for: ${q}`);
          const l = N.line(d), Q = gravityFlow(l);
          answers.push(/^What would flow be/.test(q) ? Q : /^What would the gauge pressure on the joint between #3 Gate valve and #4 90° elbow be/.test(q) ? gaugeAfter(l, Q, 1) : assert.fail(q));
        } else {
          // a student puts that one lever back on the bench, reads it, and restores their Revision 2 line
          let back, again;
          if (/#5 Pipe: bore went back to its Revision 1 value \(40 mm instead of 50 mm\)/.test(q)) { back = ['#5 Pipe', { Bore: 40 }]; again = ['#5 Pipe', { Bore: 50 }]; }
          else if (/#3 Centrifugal pump: speed went back to its Revision 1 value \(2900 rpm instead of 2600 rpm\)/.test(q)) { back = ['#3 Centrifugal pump', { Speed: 2900 }]; again = ['#3 Centrifugal pump', { Speed: 2600 }]; }
          else assert.fail(`no method for: ${q}`);
          await press(app.getByRole('link', { name: 'Open my design on the bench' }));
          await page.waitForURL(/\/circuit\/\?project=P\d+$/); await ready();
          await B.edit(...back);
          const r = await B.read(), d = { ...d2, ...(back[0] === '#5 Pipe' ? { main: 0.04 } : { rpm: 2900 }) };
          handCheck(r, d, `defence variant ${i + 1}`);
          answers.push(/^What would flow be/.test(q) ? r.Q : /^What would shaft torque be/.test(q) ? r.T : assert.fail(q));
          await B.edit(...again);
          await page.goBack(); await ready();
          assert.equal(await phase(), 'defend');
        }
      }
      for (const [i, a] of answers.entries()) await app.locator(`[data-field="${i}"]`).fill(String(+a.toPrecision(4)));
      await press(btn('Submit'));

      // ===== 11. portfolio on their project: Revision 1 → Revision 2, every run reproduces, check evidence only on the target =====
      assert.equal(await phase(), 'summary');
      const text = await app.innerText();
      assert.match(text, /Design Revision 1 → Revision 2/);
      assert.match(text, new RegExp(`Revision 2 is run R\\d+, the design you predicted and ran in run ${tested}`));
      assert.equal(await app.locator('table.scored .res-correct').count(), 2, 'both defence answers within tolerance');
      assert.match(await app.locator('#claim-text').innerText(), new RegExp(`Run ${benchRun}`));
      assert.match(text, new RegExp(`Runs: [^\\n]*\\b${benchRun}\\b`));
      const names = await app.locator('.card').filter({ has: page.locator('h2', { hasText: /^Runs$/ }) }).locator('li').allInnerTexts();
      for (const nm of ['My first line', 'Revised line', 'Revision 1', 'Revision 2']) assert.ok(names.some(t => t.includes(nm)), `run listed: ${nm}`);
      assert.ok(names.every(t => /reproduced from its saved setup/.test(t)), 'every run reproduces');
      assert.equal(await app.locator('.badmsg').count(), 0);
      const trail = await app.locator('ul.trail li').evaluateAll(lis => lis.map(li => ({ title: li.querySelector('b').textContent, status: li.dataset.status, text: li.textContent })));
      assert.match(trail.find(t => t.title === N.target).text, /Solved on your own after help/);
      await noOverflow('summary'); await shot('summary');
      const download = async name => { const [d] = await Promise.all([page.waitForEvent('download'), press(btn(name))]); return JSON.parse(await readFile(await d.path(), 'utf8')); };
      const port = await download('Export portfolio (JSON)'), proj = await download('Export project file');
      assert.equal(proj.name, projectName); assert.equal(proj.origin, 'scratch');
      const checks = port.trail.events.filter(e => e.kind === 'evidence' && e.provenance === 'check');
      assert.ok(checks.length >= 1 && checks.every(e => port.trail.status[e.competency]?.role === 'target'), `check evidence only on the target: ${checks.map(e => e.competency)}`);
      assert.ok(port.runs.every(r => r.reproduced));
      const pre = Object.entries(port.trail.status).find(([, st]) => st.title === helpedOn)?.[0];
      assert.ok(pre && port.trail.status[pre].role === 'prerequisite', `help was on a prerequisite: ${helpedOn}`);
      const helpKinds = new Set(port.trail.events.filter(e => e.competency === pre).map(e => `${e.kind}/${e.provenance}`));
      for (const k of ['hint/practice', 'shown_solution/practice']) assert.ok(helpKinds.has(k), `ledger has ${k} on ${pre}: ${[...helpKinds]}`);
      const dec = proj.decisions[0], r2 = proj.runs.find(r => r.id === dec.to), cited = proj.runs.find(r => r.id === benchRun);
      assert.ok(dec.runs.includes(benchRun)); assert.deepEqual(r2.setup, cited.setup, 'Revision 2 is exactly the line saved on the bench');

      // the journeys list offers their line under "Your designs"; it resumes at the portfolio
      await page.goto(`${server.origin}/journeys/`); await ready();
      const own = page.locator('#own a[data-act="learn"]');
      assert.match(await page.locator('#own').innerText(), new RegExp(projectName));
      assert.match(await own.first().getAttribute('href'), /^\.\/journey\.html\?open=fluids-line&project=/);
      await press(own.first());
      await page.locator('body[data-phase="summary"]').waitFor();
      assert.deepEqual(errors, []);
      console.log(`# ${V.name}: ${N.name}; R1 ${R1.Q} L/s, revised ${Rv.Q} L/s; ${solved.length} items by hand; help on ${helpedOn}; target ${N.target}`);
    } finally { await browser.close(); server.close(); }
  });
}
