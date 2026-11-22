// Journey 1 on the REAL Mount bench: an edit made after a tested run never becomes Revision 2 by itself, a reload
// cannot turn it into a tested design, and help on a prerequisite is kept apart from the unaided check.
// Played like a learner, through visible controls only: nothing here reads window.__journey, imports an item generator
// or answer key, writes storage or calls the runner. Every answer is the learner's own hand calculation
// (tests/support-hand.mjs) from the visible text. The learning record and the portfolio are read from the files the
// visible export buttons download.
//
// Flow: a missed block → the diagnostic names a prerequisite gap (answered "I don't know") → help on that prerequisite
// in teach → an unaided check on the journey's own skill → back to the design. On the bench: design A (valid), a
// reading; back: predict and run A. Bench again (A on the stand): edit to B (other material and section), a reading;
// back, then RELOAD: B is the current design, marked not tested, and "Save as Revision 2" is not offered.
//   variant "save A": "Save the last tested design as Revision 2" → Revision 2 is exactly A; B stays current and
//                     editable on the bench; the decision, the defence (answered by hand for A) and the portfolio all
//                     point at A's tested run.
//   variant "run B":  "Predict and run this design" → B is predicted and run → "Save as Revision 2" → Revision 2 is B.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { n, hand, meets, close, predict, defend, shownFor, readBrief, learnerPage, playLoop, mountBench } from './support-hand.mjs';

const STEEL_I = { material: 'steel', shape: 'I', b: 40, h: 70, tw: 3, tf: 3 };        // steel I 40×70, web and flanges 3 mm
const ALU_TUBE = { material: 'aluminium', shape: 'rhs', b: 45, h: 80, t: 5 };         // aluminium tube 45×80, wall 5 mm
const PHONE = { label: 'phone', vp: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }, A: STEEL_I, B: ALU_TUBE };
const DESKTOP = { label: 'desktop', vp: { viewport: { width: 1280, height: 900 }, acceptDownloads: true }, A: ALU_TUBE, B: STEEL_I };
const TARGET = 'Moment of a force about a point';
const shownDesign = d => { const s = shownFor(d, 200); return { Material: s.Material, Section: s.Section }; };

for (const [L, variant] of [[PHONE, 'save A'], [DESKTOP, 'save A'], [PHONE, 'run B'], [DESKTOP, 'run B']]) {
  test(`support journey, real bench: edit after the run, reload, then ${variant} (${L.label})`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage(L.vp);
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('request', r => { const u = new URL(r.url()); if (u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const h = learnerPage(page, { touch: !!L.vp.hasTouch }), { app, phase, btn, tap, noOverflow, setupShown, scoredRows } = h;
      const download = async button => { const [d] = await Promise.all([page.waitForEvent('download'), tap(button)]); return JSON.parse(await readFile(await d.path(), 'utf8')); };
      const toJourney = async ph => { await tap(page.locator('#back-journey')); await page.locator(`body[data-phase="${ph}"]`).waitFor(); };
      const openBench = async () => { await tap(app.locator('#bench')); await page.waitForURL(/\/mount\/\?project=current$/); await page.locator('body[data-stage="free"]').waitFor(); };
      const fillPredictions = async d => {
        for (const f of await app.locator('#predict-card label.field').all()) await f.locator('input').fill(String(+predict((await f.innerText()).trim(), brief, d, brief.mount).toPrecision(6)));
        await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
      };
      const testedStatus = () => app.locator('#tested-status').innerText();

      // ---------- brief → "I'm stuck" ----------
      await page.goto(`${server.origin}/journeys/journey.html?j=support`);
      await page.locator('body[data-ready="true"]').waitFor();
      const { brief, R1 } = await readBrief(app);
      const { A, B } = L;
      const [hA, hB] = [hand(brief, A), hand(brief, B)];
      assert.ok(meets(hA) && meets(hB), 'by hand, A and B both meet the brief');
      await tap(btn('Start · save Revision 1'));
      await page.locator('body[data-phase="stuck"]').waitFor();
      await tap(btn('I’m stuck'));
      await page.locator('body[data-phase="diagnose"]').waitFor();

      // ---------- a prerequisite gap, help on it, an unaided check on the journey's own skill ----------
      const seen = await playLoop(page, h, { target: TARGET, prereqDontKnow: true, help: 'prereq' });
      const prereq = seen.dontKnow.find(t => t !== TARGET);
      assert.ok(prereq, `a prerequisite was asked after the target miss: ${JSON.stringify(seen.dontKnow)}`);
      assert.match(seen.found, new RegExp(`First: ${prereq.replace(/[()]/g, '.')}\\. Then ${TARGET}`), 'the diagnosis names the prerequisite gap');
      assert.deepEqual(seen.helpedOn, [prereq], 'help only on the prerequisite');
      assert.equal(seen.check, 1);
      assert.equal((await app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
      await tap(btn('Back to my design'));
      await page.locator('body[data-phase="return"]').waitFor();

      // ---------- bench: design A, a reading ----------
      await openBench();
      const bench = mountBench(page, h, brief);
      await bench.setDesign(A);
      const readA = await bench.read(A);
      await bench.tab('mission'); await toJourney('return');
      assert.deepEqual(await setupShown(), shownFor(A, brief.mount));

      // ---------- predict and run A ----------
      await fillPredictions(A);
      for (const r of await scoredRows('Prediction run 1')) { assert.equal(r.result, 'close', r.prompt); assert.ok(close(n(r.engine), predict(r.prompt, brief, A, brief.mount), 0.005, 0.0005)); }
      const runA = (await app.locator('table.scored caption', { hasText: 'Prediction run 1' }).innerText()).match(/run (R\d+)$/)[1];
      assert.match(await testedStatus(), new RegExp(`This design is tested \\(run ${runA}\\)`));
      assert.equal(await app.getByRole('button', { name: /^Save as Revision 2/ }).count(), 1, 'a tested design can be saved');

      // ---------- bench again: A is on the stand; edit to B, a reading ----------
      await openBench();
      assert.deepEqual(await bench.shown(), A, 'the bench opens on the current design, A');
      await bench.setDesign(B);
      const readB = await bench.read(B);
      await bench.tab('mission'); await toJourney('return');

      // ---------- reload: B is current, not tested, and cannot become Revision 2 ----------
      await page.reload();
      await page.locator('body[data-phase="return"]').waitFor();
      assert.deepEqual(await setupShown(), shownFor(B, brief.mount), 'after a reload B is the current design');
      const st = await testedStatus();
      assert.match(st, new RegExp(`^Last tested: run ${runA}\\. This design is not tested: changed since run ${runA} \\(Material, Section\\)\\.$`));
      assert.equal(await app.locator('#tested-status.no').count(), 1);
      assert.equal(await app.getByRole('button', { name: /^Save as Revision 2/ }).count(), 0, 'B cannot be saved as Revision 2 untested');
      assert.match(await app.locator('#choose').innerText(), /Revision 2 must be a design you predicted and ran/);
      assert.equal(await btn('Predict and run this design').count(), 1);
      assert.equal(await btn('Save the last tested design as Revision 2').count(), 1);
      await noOverflow('return, B untested');

      let R2design, testedRun;
      if (variant === 'save A') {
        await tap(btn('Save the last tested design as Revision 2'));
        await page.locator('body[data-phase="decide"]').waitFor();
        R2design = A; testedRun = runA;
        const note = await app.locator('#saved-note').innerText();
        assert.match(note, new RegExp(`Saved Revision 2 from run ${runA}, the last design you predicted and ran\\. Your later edits are still in the project on the bench, but they are not part of Revision 2\\.`));
        // B is still the current design, on the stand and editable
        await openBench();
        assert.deepEqual(await bench.shown(), B, 'B, not Revision 2, is on the stand');
        await bench.editable();
        await bench.tab('mission'); await toJourney('decide');
      } else {
        await tap(btn('Predict and run this design'));
        await fillPredictions(B);
        for (const r of await scoredRows('Prediction run 2')) { assert.equal(r.result, 'close', r.prompt); assert.ok(close(n(r.engine), predict(r.prompt, brief, B, brief.mount), 0.005, 0.0005)); }
        testedRun = (await app.locator('table.scored caption', { hasText: 'Prediction run 2' }).innerText()).match(/run (R\d+)$/)[1];
        assert.match(await testedStatus(), new RegExp(`This design is tested \\(run ${testedRun}\\)`));
        await tap(app.getByRole('button', { name: /^Save as Revision 2/ }));
        await page.locator('body[data-phase="decide"]').waitFor();
        R2design = B;
      }
      const other = R2design === A ? B : A;

      // ---------- decide: cite the tested run and the reading of the Revision 2 design ----------
      const decideLine = await app.locator('#decide-design').innerText();
      const r2 = decideLine.match(/^From R1 to (R\d+) \(tested in run (R\d+)\): (.*)\.$/);
      assert.ok(r2, decideLine); assert.equal(r2[2], testedRun); assert.equal(r2[3], R2design.material === R1.material ? 'Section' : 'Material, Section', 'what changed since Revision 1');
      const r2Run = r2[1];
      const runLabels = (await app.locator('.checks label').allInnerTexts()).map(t => t.trim());
      const idOf = name => runLabels.find(t => t.endsWith(` · ${name}`))?.split(' · ')[0];
      const readR2 = R2design === A ? readA : readB, readOther = R2design === A ? readB : readA;
      const cite = [testedRun, idOf(readR2.name)];
      assert.ok(cite[1], `the bench reading of the Revision 2 design is a run: ${JSON.stringify(runLabels)}`);
      for (const id of cite) await app.locator('.checks label', { hasText: `${id} · ` }).locator('input').check();
      const checked = await app.locator('.checks input:checked').evaluateAll(cs => cs.map(c => c.value));
      assert.deepEqual(checked.sort(), [r2Run, ...cite].sort());
      const hR2 = hand(brief, R2design);
      const claim = `Revision 2: deflection ${hR2.defl.toFixed(3)} mm ≤ ${brief.tol} mm, stress ${hR2.stress.toFixed(1)} MPa ≤ ${hR2.allow} MPa, mass ${hR2.mass.toFixed(2)} kg ≤ ${brief.massLimit} kg.`;
      await app.locator('#claim').fill(claim);
      await tap(btn('Save the decision'));

      // ---------- defend: by hand for the Revision 2 design (A in "save A"), not for the other one ----------
      await page.locator('body[data-phase="defend"]').waitFor();
      const qs = await app.locator('label.field').all();
      assert.ok(qs.length >= 3);
      let differs = 0;
      for (const q of qs) {
        const prompt = (await q.innerText()).trim(), v = defend(prompt, brief, R2design);
        if (!close(v, defend(prompt, brief, other), 0.03)) differs++;
        await q.locator('input').fill(String(+v.toPrecision(5)));
      }
      assert.ok(differs >= 2, 'the answers for the two designs differ, so "close" shows which design the engine used');
      await tap(btn('Submit'));

      // ---------- portfolio: Revision 2, its tested run, the decision, the defence, the trail ----------
      await page.locator('body[data-phase="summary"]').waitFor();
      assert.equal((await app.locator('#r2-run').innerText()).trim(), `Revision 2 is run ${r2Run}, the design you predicted and ran in run ${testedRun}.`);
      const shown = await setupShown();
      assert.deepEqual({ Material: shown.Material, Section: shown.Section }, shownDesign(R2design), 'Revision 2 is exactly the tested design');
      const runsLine = await app.locator('#claim-text + p').innerText();
      for (const id of [r2Run, ...cite]) assert.ok(runsLine.includes(id), `decision cites ${id}`);
      assert.ok(!runsLine.includes(`${idOf(readOther.name)},`) && !runsLine.endsWith(idOf(readOther.name)), 'the other design is not cited');
      for (const r of await scoredRows('Defence')) assert.equal(r.result, 'close', r.prompt);
      // the trail: help on the prerequisite stays help; only the target has an unaided check
      const trail = await app.locator('ul.trail li').evaluateAll(ls => ls.map(l => ({ title: l.querySelector('b').textContent, status: l.dataset.status, role: l.dataset.role, text: l.querySelector('.st').textContent, line: l.textContent })));
      const tT = trail.find(t => t.title === TARGET), tP = trail.find(t => t.title === prereq);
      assert.deepEqual([tT.role, tT.status, tT.text], ['target', 'independent-after-help', 'Solved on your own after help']);
      assert.deepEqual([tP.role, tP.status, tP.text], ['prerequisite', 'helped', 'Practised with help; no unaided question since']);
      assert.match(tP.line, /0\/1 right on fresh questions alone, \d+ answers? with help, [1-9]\d* help events?/);
      for (const t of trail.filter(t => t.role === 'prerequisite')) assert.doesNotMatch(t.text, /Solved on your own/, `${t.title} is not claimed as solved on its own`);
      await noOverflow('summary');

      // the portfolio file, from the visible export button
      const pf = await download(app.locator('#export'));
      assert.equal(pf.design.to.run, r2Run); assert.equal(pf.design.to.tested, testedRun);
      assert.deepEqual(pf.design.to.setup.design, R2design, 'Revision 2 setup is the tested design');
      assert.deepEqual(pf.decision.to, r2Run); assert.deepEqual([...pf.decision.runs].sort(), [r2Run, ...cite].sort());
      assert.equal(pf.decision.defence.length, qs.length); assert.ok(pf.decision.defence.every(d => d.result === 'correct'));
      const pid = Object.keys(pf.trail.status).find(k => pf.trail.status[k].title === prereq), tid = Object.keys(pf.trail.status).find(k => pf.trail.status[k].title === TARGET);
      assert.deepEqual([pf.trail.status[pid].status, pf.trail.status[pid].basis, pf.trail.status[pid].role], ['helped', null, 'prerequisite']);
      assert.deepEqual([pf.trail.status[tid].status, pf.trail.status[tid].basis], ['independent-after-help', { provenance: 'check', result: 'correct' }]);
      const kinds = c => pf.trail.events.filter(e => e.competency === c && e.result !== 'unresolved').map(e => `${e.kind}/${e.provenance}`);
      assert.deepEqual(kinds(pid).filter(k => k.startsWith('evidence')), ['evidence/diagnostic'], 'the prerequisite was never assessed unaided after its help');
      assert.ok(kinds(pid).some(k => /^(hint|shown_solution)\/practice$/.test(k)) && kinds(pid).includes('assisted_response/practice'), 'help on the prerequisite is recorded as help');
      assert.ok(pf.trail.events.filter(e => e.provenance === 'check').every(e => e.competency === tid && e.kind === 'evidence'), 'the check assesses only the journey’s own skill');

      // the project still holds B as the current design (variant "save A"); the portfolio link to the bench works
      if (variant === 'save A') {
        await openBench();
        assert.deepEqual(await bench.shown(), B, 'after the portfolio, B is still on the stand');
        await bench.tab('mission'); await toJourney('summary');
      }

      // the learning record file, from the visible export on the journeys page
      await tap(page.locator('header a.back'));
      await page.locator('body[data-ready="true"]').waitFor();
      const record = await download(page.getByRole('button', { name: 'Export record', exact: true }));
      assert.equal(record.format, 'openpath.ledger');
      const mine = c => record.events.filter(e => e.competency === c && e.journey === 'support');
      assert.ok(mine(pid).some(e => e.kind === 'hint' || e.kind === 'shown_solution'), 'help on the prerequisite is in the record');
      assert.ok(mine(pid).filter(e => e.kind === 'evidence').every(e => e.provenance === 'diagnostic'), 'no unaided check on the prerequisite');
      assert.ok(mine(tid).some(e => e.kind === 'evidence' && e.provenance === 'check' && e.result === 'correct'), 'the unaided check on the target');
      assert.equal(mine(tid).filter(e => e.kind === 'hint' || e.kind === 'shown_solution').length, 0, 'no hint or solution on the target in this play');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
