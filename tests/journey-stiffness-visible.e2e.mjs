// Journey 3, "Stiff enough, not just strong", played like a learner: only visible controls are used and only visible
// text is read. Nothing here reads window.__journey, imports content, an item generator or an answer key, writes storage
// or calls the runner. Every answer is this file's own hand calculation (σ = F/A, σ = M·c/I, σ = E·ε, FoS = yield ÷ σ,
// simply supported beam formulas) from the question's visible text, checked against what the page and the bench show.
//
// Two different valid designs, one on a phone (390 × 844, touch) and one on a desktop (1280 × 900). On the bench each
// learner first remakes the anchor tube in steel (same section) and compares the two runs in Experiments: the dial moves
// by the E ratio, the stress does not; that tube is too heavy, so they then choose their own section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { HANDBOOK, n, close, beamHand, meets, shownFor, pageKit, mountBench } from './visible-helpers.mjs';

const TARGET = 'Stiffness vs strength: E·I sets the deflection, yield and I/c set the stress';
const fix = v => String(+v.toPrecision(6));

// ---------- an item, solved from its visible prompt (and options) ----------
function solve(prompt, options) {
  let m;
  const pick = re => { const i = options.findIndex(o => re.test(o)); assert.ok(i >= 0, `no option ${re} in ${JSON.stringify(options)}`); return { option: i }; };
  if (options.length) {
    if (/passes its strength check .* bends too far/.test(prompt)) return pick(/^Make E·I larger/);
    if (/remade in steel with the same section .* What happens/.test(prompt)) return pick(/deflection falls about 2\.9×, but the stress stays the same/);
    if ((m = prompt.match(/Rod B has (\d+) times/))) return pick(new RegExp(`^B has 1/${m[1]} of`));
    if ((m = prompt.match(/at or below yield ÷ ([\d.]+)\. What does this mean/))) return pick(new RegExp(`^FoS = yield ÷ stress must be at least ${m[1].replace('.', '\\.')}$`));
    if (/Which one has the larger strain/.test(prompt)) return pick(/^The aluminium bar/);   // ε = σ/E, smaller E
    if (/load doubles/.test(prompt)) return pick(/past yield/);
    if ((m = prompt.match(/strain of ([\d.]+) %/))) return pick(new RegExp(`^${fix(n(m[1]) / 100).replace('.', '\\.')} \\(`));
    assert.fail(`this learner cannot answer: ${prompt}`);
  }
  const unit = prompt.includes('No unit') ? '' : prompt.match(/in (MPa|mm|µε|kN|N)[?,)]/)?.[1];
  assert.ok(unit !== undefined, `unit of ${prompt}`);
  const v = number(prompt);
  return { text: `${fix(v)}${unit ? ` ${unit}` : ''}` };
}
function number(p) {
  let m;
  const STAND = /bolts (\d+) mm apart, a ([\d,]+) N machine (\d+) mm from the left bolt\), the support is an? (steel|aluminium) bar (\d+) mm wide and (\d+) mm deep \(h vertical; E = ([\d,]+) MPa, yield (\d+) MPa\)/;
  if ((m = p.match(STAND))) {
    const [span, P, a, , b, h, E, Y] = [n(m[1]), n(m[2]), n(m[3]), m[4], n(m[5]), n(m[6]), n(m[7]), n(m[8])];
    const s = P * a * (span - a) / span * (h / 2) / (b * h ** 3 / 12);
    if (/strain gauge/.test(p)) return s / E * 1e6;
    if (/up to yield/.test(p)) return P * Y / s;
    return Y / s;
  }
  // stiffness vs strength: same section, other material
  if ((m = p.match(/support \(E = ([\d,]+) MPa, yield \d+ MPa\) deflects ([\d.]+) mm under the machine, and its stress there is (\d+) MPa\. It is remade in (?:steel|aluminium) \(E = ([\d,]+) MPa, yield (\d+) MPa\)/))) {
    const [E1, d1, s1, E2, Y2] = m.slice(1).map(n);
    return /new deflection/.test(p) ? d1 * E1 / E2 : /new stress/.test(p) ? s1 : Y2 / s1;
  }
  if ((m = p.match(/(\d+) mm deep \(h vertical\) deflects ([\d.]+) mm under the machine, and its stress there is (\d+) MPa\. It is remade (\d+) mm deep/))) {
    const [h1, d1, s1, h2] = m.slice(1).map(n);
    return /new deflection/.test(p) ? d1 * (h1 / h2) ** 3 : s1 * (h1 / h2) ** 2;
  }
  if ((m = p.match(/(\d+) mm² in cross-section and ([\d,]+) mm long, each carry ([\d,]+) N: .*one steel \(E = ([\d,]+) MPa, yield (\d+) MPa\)/))) {
    const [A, L, F, E, Y] = m.slice(1).map(n);
    return /stretch/.test(p) ? F * L / (A * E) : /factor of safety/.test(p) ? Y * A / F : F / A;
  }
  // Hooke's law, factor of safety (the prerequisites the diagnostic may ask)
  if ((m = p.match(/strain gauge on an? (?:steel|aluminium) part \(E = ([\d,]+) MPa, yield \d+ MPa\) reads ([\d,]+) µε/))) return n(m[1]) * n(m[2]) * 1e-6;
  if ((m = p.match(/tie rod ([\d,]+) mm long, with a cross-section of (\d+) mm², carries ([\d,]+) N \(E = ([\d,]+) MPa/))) return n(m[3]) * n(m[1]) / (n(m[2]) * n(m[4]));
  if ((m = p.match(/yield (\d+) MPa\) works at a stress of (\d+) MPa/))) return n(m[1]) / n(m[2]);
  if ((m = p.match(/yield (\d+) MPa\) must have a factor of safety of ([\d.]+)/))) return n(m[1]) / n(m[2]);
  // beam stiffness and bending stress (statics items)
  if ((m = p.match(/(\d+) mm wide, (\d+) mm deep .* support deflects ([\d.]+) mm at the load\. The depth is increased to (\d+) mm/))) return n(m[3]) * (n(m[2]) / n(m[4])) ** 3;
  if ((m = p.match(/A ([\d,]+) mm beam on two supports carries ([\d,]+) N at ([\d,]+) mm from the left support\. It is a (\d+) mm wide × (\d+) mm deep rectangle/))) {
    const [L, P, a, b, h] = m.slice(1).map(n); return P * a * (L - a) / L * (h / 2) / (b * h ** 3 / 12);
  }
  assert.fail(`this learner cannot answer: ${p}`);
}

// A prediction box, from its visible prompt, for the brief's anchor (stuck) or the learner's design (return).
function predict(prompt, brief, d) {
  const h = beamHand(brief, d);
  if (/remade in structural steel/.test(prompt)) return beamHand(brief, { ...d, material: 'steel' }).defl;
  if (/in the steel tube/.test(prompt)) return beamHand(brief, { ...d, material: 'steel' }).stress;
  let m;
  if ((m = prompt.match(/made (\d+) mm deep .*dial gauge/))) return beamHand(brief, { ...d, h: n(m[1]) }).defl;
  if ((m = prompt.match(/that (\d+) mm deep aluminium tube/))) return beamHand(brief, { ...d, h: n(m[1]) }).stress;
  if (/factor of safety/.test(prompt)) return h.fos;
  if (/dial gauge read/.test(prompt)) return h.defl;
  if (/stress will the strain gauge/.test(prompt)) return h.stress;
  assert.fail(`cannot predict: ${prompt}`);
}

const LEARNERS = [
  { label: 'phone · steel I-section', vp: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    final: { material: 'steel', shape: 'I', b: 40, h: 70, tw: 3, tf: 3 }, shapeName: 'I-section', dims: { h: 70, tf: 3 } },   // from the I defaults 40 × 60, tw 3, tf 4
  { label: 'desktop · aluminium hollow tube', vp: { viewport: { width: 1280, height: 900 } },
    final: { material: 'aluminium', shape: 'rhs', b: 50, h: 80, t: 5 }, shapeName: null, dims: { h: 80, t: 5 } },             // the anchor tube, deeper and thicker
];

for (const L of LEARNERS) {
  test(`stiffness journey through visible controls only (${L.label})`, async () => {
    const server = await serve(), browser = await chromium.launch();
    try {
      const page = await browser.newPage({ ...L.vp, acceptDownloads: true });
      page.setDefaultTimeout(8000);
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const kit = pageKit(page, L.vp, server), { app, btn, has, tap, phase, noOverflow, setupShown, scoredRows, errors } = kit;

      // ---------- brief ----------
      await page.goto(`${server.origin}/journeys/journey.html?j=stiffness`);
      await page.locator('body[data-ready="true"]').waitFor();
      assert.equal(await phase(), 'brief');
      const briefText = await app.locator('.card .lead').first().innerText();
      const bm = briefText.match(/A ([\d,]+) N machine must sit on a support bolted (\d+) mm apart, inside a (\d+) × (\d+) mm envelope\. Under the machine the support may deflect at most ([\d.]+) mm, its stress must stay at or below yield ÷ (\d+) \(a factor of safety of at least \d+\), and it may weigh at most ([\d.]+) kg\. The existing support is an (aluminium) (\d+) × (\d+) mm hollow tube with a (\d+) mm wall, with the machine (\d+) mm from the left bolt/);
      assert.ok(bm, briefText);
      assert.match(briefText, /linear elastic model .* does not predict what happens after yield/);
      const brief = { P: n(bm[1]), L: n(bm[2]), env: { b: n(bm[3]), h: n(bm[4]) }, tol: n(bm[5]), factor: n(bm[6]), massLimit: n(bm[7]), mount: n(bm[12]) };
      const R1 = { material: bm[8], shape: 'rhs', b: n(bm[9]), h: n(bm[10]), t: n(bm[11]) };
      const h1 = beamHand(brief, R1);
      assert.deepEqual(h1.ok, { defl: false, stress: true, mass: true, envelope: true, walls: true }, 'by hand: strong enough, too flexible');
      await noOverflow('brief');
      await tap(btn('Start · save Revision 1'));

      // ---------- stuck: one deliberate mix-up (a stiffer material lowers the stress) ----------
      await page.locator('body[data-phase="stuck"]').waitFor();
      assert.deepEqual(await setupShown(), shownFor(R1, brief.mount));
      const fields = await app.locator('label.field').all();
      assert.equal(fields.length, 5);
      let wrongPrompt;
      for (const f of fields) {
        const prompt = (await f.innerText()).trim();
        let v = predict(prompt, brief, R1);
        if (/in the steel tube/.test(prompt)) { v = h1.stress * HANDBOOK.aluminium.E / HANDBOOK.steel.E; wrongPrompt = prompt; }
        await f.locator('input').fill(fix(v));
      }
      assert.ok(wrongPrompt);
      await tap(btn('Lock predictions'));
      await tap(btn('Run the bench'));
      const stuckRows = await scoredRows('Your prediction against the engine');
      assert.equal(stuckRows.length, 5);
      for (const r of stuckRows) {
        assert.ok(close(n(r.engine), predict(r.prompt, brief, R1), 0.006, 0.0005), `engine ${r.engine} for ${r.prompt}`);
        assert.equal(r.result, wrongPrompt.startsWith(r.prompt) ? 'off' : 'close', r.prompt);
      }
      await tap(btn('Find what is blocking me'));

      // ---------- diagnose / teach / apply / check ----------
      await page.locator('body[data-phase="diagnose"]').waitFor();
      const card = () => app.locator('.card.item');
      const answerShown = async () => {
        const prompt = await card().locator('p.lead').innerText(), options = await card().locator('fieldset.options label').allInnerTexts();
        const s = solve(prompt, options.map(o => o.trim()));
        if ('option' in s) await tap(card().locator('input[name="opt"]').nth(s.option)); else await card().locator('#answer').fill(s.text);
        await tap(btn('Check'));
        return prompt;
      };
      const seen = { diagnose: 0, practice: 0, hint: 0, shown: 0, apply: 0, check: 0, checkTitle: null };
      for (let guard = 0; guard < 40; guard++) {
        const ph = await phase();
        await noOverflow(ph);
        if (ph === 'diagnose') {
          if (await card().count() === 0) { assert.match(await app.innerText(), /What we found/); await tap(btn('Continue')); continue; }
          if (await has('Check')) {
            seen.diagnose++;
            const title = (await card().locator('.eyebrow').textContent()).trim();
            if (title === TARGET) await tap(btn('I don’t know'));
            else { await answerShown(); assert.match(await card().locator('.feedback').innerText(), /^Right/, `prerequisite ${title} is known`); }
          }
          await tap(btn('Next'));
        } else if (ph === 'teach') {
          if (await card().count() === 0) {
            assert.ok(await app.locator('ol.steps li').count() > 0);
            assert.match(await app.innerText(), /does not predict what happens after yield/);
            assert.match(await app.locator('#explore').getAttribute('href'), /^\.\.\/playground\/\?preset=diving$/);
            await tap(btn('Practise')); continue;
          }
          if (await has('Check')) {
            seen.practice++;
            if (seen.practice === 1) {
              if (await has('Hint')) { await tap(btn('Hint')); assert.ok(await card().locator('ol.hints li').count() >= 1); seen.hint++; }
              else { await tap(btn('Show the solution')); assert.ok(await card().locator('ol.solution li').count() >= 1); seen.shown++; }
            }
            await answerShown();
            assert.match(await card().locator('.feedback').innerText(), /^Right/);
          }
          await tap(btn('Next'));
        } else if (ph === 'apply') {
          if (await card().count() === 0) { await tap(btn('Continue to the check')); continue; }
          seen.apply++; await answerShown();
          assert.match(await card().locator('.feedback').innerText(), /^Right/);
          await tap(btn('Next'));
        } else if (ph === 'check') {
          if (await card().count() === 0) break;
          seen.check++;
          seen.checkTitle = (await card().locator('.eyebrow').textContent()).trim();
          assert.equal(await btn('Hint').count() + await btn('Show the solution').count(), 0, 'no help in the check');
          await answerShown();
          assert.match(await card().locator('.feedback').innerText(), /^Right/);
          await tap(btn('Next'));
        } else assert.fail(`unexpected phase ${ph}`);
      }
      assert.equal((await app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
      assert.ok(seen.diagnose >= 1 && seen.practice >= 1 && seen.hint + seen.shown === 1 && seen.apply === 3 && seen.check === 1, JSON.stringify(seen));
      assert.equal(seen.checkTitle, TARGET);
      await tap(btn('Back to my design'));

      // ---------- return: the real Mount bench ----------
      await page.locator('body[data-phase="return"]').waitFor();
      assert.match(await app.innerText(), /As saved in Revision 1/);
      await tap(app.locator('#bench'));
      await page.waitForURL(/\/mount\/\?project=current$/);
      await page.locator('body[data-stage="free"]').waitFor();
      await noOverflow('bench');
      const bench = mountBench(page, kit, brief);
      await bench.tab('design');
      assert.equal(await page.locator('[data-mat="aluminium"]').getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('[data-shape="rhs"]').getAttribute('aria-checked'), 'true');
      // the bench's material data matches the handbook
      for (const m of ['steel', 'aluminium']) {
        await tap(page.getByRole('radio', { name: HANDBOOK[m].name }));
        const em = (await page.locator('#rig').textContent()).match(/E (\d+) GPa · yield (\d+) MPa/);
        assert.equal(n(em[1]) * 1000, HANDBOOK[m].E); assert.equal(n(em[2]), HANDBOOK[m].yield);
      }
      // 1) the anchor's own section, remade in steel: stiff enough now, same stress, too heavy
      await tap(page.getByRole('radio', { name: HANDBOOK.steel.name }));
      const steelTube = await bench.readDesign({ ...R1, material: 'steel' });
      assert.deepEqual(steelTube.verdict, { defl: true, stress: true, mass: false });
      // two runs compared in Experiments: Revision 1 (aluminium) against the steel tube
      await bench.tab('experiments');
      const runLi = name => page.locator('#experiments .nb-runs li', { has: page.locator('b', { hasText: name }) });
      await tap(runLi('Revision 1 · starting design').locator('input[type="checkbox"]'));
      await tap(runLi(steelTube.name).locator('input[type="checkbox"]'));
      assert.equal((await page.locator('#experiments .nb-changed').innerText()).trim(), 'design.material', 'only the material changed');
      const cmp = Object.fromEntries(await page.locator('#experiments table.nb-cmp tbody tr').evaluateAll(trs => trs.map(tr => [tr.cells[0].textContent, [tr.cells[1].textContent, tr.cells[2].textContent]])));
      const [dA, dB] = cmp['Dial reading (deflection) (mm)'].map(n), [sA, sB] = cmp['Stress from strain (E·ε) (MPa)'].map(n);
      assert.ok(close(dA, h1.defl, 0.01) && close(dB, steelTube.h.defl, 0.01), `dial ${dA} → ${dB}`);
      assert.ok(close(dB / dA, HANDBOOK.aluminium.E / HANDBOOK.steel.E, 0.01), 'the dial falls by the E ratio');
      assert.equal(sA, sB, 'the stress does not change with the material');
      assert.ok(close(sA, h1.stress, 0.001));
      // 2) the learner's own design: meets every limit
      await bench.tab('design');
      if (L.final.material !== 'steel') await tap(page.getByRole('radio', { name: HANDBOOK[L.final.material].name }));
      if (L.shapeName) await tap(page.getByRole('radio', { name: L.shapeName }));
      await bench.setDims(L.dims);
      const good = await bench.readDesign(L.final);
      assert.ok(meets(good.h), JSON.stringify(good.h.ok));
      assert.deepEqual(good.verdict, { defl: true, stress: true, mass: true });
      await bench.tab('experiments');
      assert.equal(await page.locator('#experiments .badmsg').count(), 0);
      await bench.tab('mission');
      await noOverflow('bench after readings');
      await tap(page.locator('#back-journey'));

      // ---------- back on the journey ----------
      await page.locator('body[data-phase="return"]').waitFor();
      assert.deepEqual(await setupShown(), shownFor(L.final, brief.mount));
      for (const f of await app.locator('label.field').all()) {
        const prompt = (await f.innerText()).trim();
        await f.locator('input').fill(fix(predict(prompt, brief, L.final)));
      }
      await tap(btn('Lock predictions'));
      await tap(btn('Run the bench'));
      const retRows = await scoredRows('Prediction run');
      assert.equal(retRows.length, 3);
      for (const r of retRows) { assert.equal(r.result, 'close', r.prompt); assert.ok(close(n(r.engine), predict(r.prompt, brief, L.final), 0.006, 0.0005), r.prompt); }
      await tap(app.getByRole('button', { name: /^Save as Revision 2/ }));

      // ---------- decide: cite the runs ----------
      await page.locator('body[data-phase="decide"]').waitFor();
      const runLabels = (await app.locator('.checks label').allInnerTexts()).map(t => t.trim());
      const cite = runLabels.filter(t => t.includes(good.name) || t.includes(steelTube.name) || /Prediction run/.test(t));
      assert.equal(cite.length, 3, JSON.stringify(runLabels));
      for (const t of cite) await app.locator('.checks label', { hasText: t }).locator('input').check();
      const checked = await app.locator('.checks input:checked').evaluateAll(cs => cs.map(c => c.value));
      const g = good.h, claim = `Revised to ${good.name.split(' · ')[1]}: deflection ${g.defl.toFixed(3)} mm ≤ ${brief.tol} mm (stiffness), stress ${g.stress.toFixed(1)} MPa, factor of safety ${g.fos.toFixed(1)} ≥ ${brief.factor} (strength), mass ${g.mass.toFixed(2)} kg.`;
      await app.locator('#claim').fill(claim);
      await app.locator('#rejected').fill(`${steelTube.name.split(' · ')[1]}: stiff enough and the same stress, but ${steelTube.h.mass.toFixed(2)} kg is too heavy\nThe original aluminium tube: strong (FoS ${h1.fos.toFixed(1)}) but bends ${h1.defl.toFixed(3)} mm`);
      await tap(btn('Save the decision'));

      // ---------- defend ----------
      await page.locator('body[data-phase="defend"]').waitFor();
      const qs = await app.locator('label.field').all();
      assert.equal(qs.length, 3);
      for (const q of qs) {
        const prompt = (await q.innerText()).trim();
        let m, v;
        if ((m = prompt.match(/remade in (steel|aluminium) \(.*\), same section\. What will the dial gauge/))) v = beamHand(brief, { ...L.final, material: m[1] }).defl;
        else if ((m = prompt.match(/remade in (steel|aluminium) with the same section\. What stress/))) v = beamHand(brief, { ...L.final, material: m[1] }).stress;   // = the own stress
        else if ((m = prompt.match(/(deeper|shallower) \(h = (\d+) mm\).*dial gauge/))) v = beamHand(brief, { ...L.final, h: n(m[2]) }).defl;
        else assert.fail(`cannot defend: ${prompt}`);
        await q.locator('input').fill(fix(v));
      }
      await tap(btn('Submit'));

      // ---------- portfolio ----------
      await page.locator('body[data-phase="summary"]').waitFor();
      const text = await app.innerText();
      assert.match(text, /Design Revision 1 → Revision 2/);
      assert.deepEqual(await setupShown(), shownFor(L.final, brief.mount));
      assert.equal((await app.locator('#claim-text').innerText()).trim(), claim);
      const runsLine = await app.locator('#claim-text + p').innerText();
      for (const id of checked) assert.ok(runsLine.includes(id), `decision cites run ${id}`);
      for (const r of await scoredRows('Defence')) assert.equal(r.result, 'close', r.prompt);
      assert.match(text, new RegExp(`${TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Solved on your own after help`));
      assert.equal(await app.locator('.badmsg').count(), 0);
      await noOverflow('summary');

      // the portfolio, downloaded through its visible button: check evidence only for the skill the check tests
      const [dl] = await Promise.all([page.waitForEvent('download'), tap(app.locator('#export'))]);
      const pf = JSON.parse(readFileSync(await dl.path(), 'utf8'));
      assert.equal(pf.journey.id, 'stiffness');
      const target = Object.entries(pf.trail.status).find(([, s]) => s.title === TARGET)?.[0];
      assert.ok(target, 'the target is in the trail');
      assert.equal(pf.trail.status[target].status, 'independent-after-help');
      const checks = pf.trail.events.filter(e => e.provenance === 'check');
      assert.equal(checks.length, 1, JSON.stringify(checks));
      assert.deepEqual([checks[0].competency, checks[0].kind, checks[0].result], [target, 'evidence', 'correct']);
      assert.ok(pf.trail.events.filter(e => e.competency !== target).every(e => e.provenance === 'diagnostic'), 'prerequisites carry diagnostic evidence only');
      assert.ok(pf.trail.events.filter(e => e.competency === target && e.provenance === 'practice').some(e => e.kind === 'hint' || e.kind === 'shown_solution'), 'the help is recorded apart');
      assert.deepEqual(pf.design.to.setup.design, L.final);
      assert.deepEqual(pf.design.from.setup.design, R1);
      assert.equal(pf.decision.defence.length, 3);
      assert.ok(pf.runs.every(r => r.reproduced));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); server.close(); }
  });
}
