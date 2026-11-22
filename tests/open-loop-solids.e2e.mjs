// The whole open loop on the REAL solids benches, on designs the student builds (no preset or journey describes them).
// Played like a learner, through visible controls only: nothing here reads window.__journey, imports an item generator or
// answer key, writes storage or calls the runner. Every prediction, item answer and defence answer is this file's own
// hand calculation (statics of a pin-jointed truss, cantilever beam formulas, σ = M·c/I, FoS = strength ÷ σ; the items
// through tests/visible-helpers.mjs solveItem) from the visible text. The portfolio is read from the file its visible
// export button downloads.
//
// A. Force Playground, phone 390 × 844 (touch): a 5-joint, 7-member pin-jointed truss built from a cleared workspace,
//    pin at joint 1, roller at joint 3, a car on its first member; a run saved → Experiments: Predict and learn →
//    "Your design" in words → predict both support reactions (dynamic keys) and miss → the target is the competency of
//    the reaction missed most → find the block (a prerequisite gap), learn with help on that prerequisite only, apply,
//    an unaided check on the target → Change it on the bench opens THEIR project (?project=current keeps it) → lighter
//    tubes (section), run saved → back, reload: the changed design is shown → predict and run → Revision 2 → decide,
//    citing the tested run and the bench run → defend (the reaction with the old tubes, by hand) → portfolio on their
//    project: every run reproduces, check evidence only on the target.
// B. Mount lab opened (?mode=open), desktop 1280 × 900: a timber cantilever, 1.2 m, 600 N at 900 mm, own limits, a
//    reading → the same loop on the fixing moment, the tip deflection and the factor of safety (the target) → on return:
//    bamboo, an I-section (a shape change) and the machine moved to 600 mm → three defence questions, one per lever,
//    including putting the section shape back (Revision 1's own rectangle, worked by hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { n, learnerPage, playLoop } from './support-hand.mjs';
import { solveItem } from './visible-helpers.mjs';
import { PRESETS } from '../playground/presets.mjs';

const near = (a, b, rel, msg, abs = 0) => assert.ok(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${msg}: shown ${a}, by hand ${b}`);
const relErr = (p, t) => Math.abs(p - t) / Math.abs(t);
const sig = v => String(+v.toPrecision(6));
const g = 9.81;

// ---------- A: the student's own truss, by hand ----------
// Joints (mm) in the order they are drawn; pin-jointed members; pin at joint 1, roller at joint 3; a 1200 kg car at the
// middle of member 1 (x = 1 m). Own weight: ρ·g·A·ΣL, symmetric about x = 2 m. ΣM about joint 1, then ΣFy = 0.
const J = [[0, 0], [2000, 0], [4000, 0], [1000, 1500], [3000, 1500]];
const BARS = [[0, 1], [1, 2], [0, 3], [3, 1], [1, 4], [4, 2], [3, 4]];
const LEN = BARS.reduce((s, [a, b]) => s + Math.hypot(J[b][0] - J[a][0], J[b][1] - J[a][1]), 0);
const TUBE = { big: { d: 114, t: 5, label: 'Ø114×5 mm tube' }, small: { d: 60, t: 4, label: 'Ø60×4 mm tube' } };
const CAR = 1200 * g;
function truss(tube) {
  const A = Math.PI * (tube.d ** 2 - (tube.d - 2 * tube.t) ** 2) / 4, kg = 7850 * A * 1e-9 * LEN, W = kg * g;
  const R3 = (CAR * 1000 + W * 2000) / 4000;
  return { kg, W, R1: CAR + W - R3, R3 };
}
const TARGET_A = 'Equilibrium in 2D: ΣF = 0, ΣM = 0';

// ---------- B: the student's own cantilever, by hand ----------
// Fixed at the left, free at the right; point load P at a. Root moment P·a; root stress P·a·c/I; tip deflection
// P·a²·(3L − a) / (6·E·I). Strength in bending of a brittle or natural material: the lower of tension and compression.
const MAT = { timber: { name: 'Timber (pine, along grain)', short: 'Timber', E: 11000, strength: Math.min(40, 30), rho: 500 }, bamboo: { name: 'Bamboo', short: 'Bamboo', E: 18000, strength: Math.min(120, 50), rho: 700 } };
const BENCH = { span: 1200, load: 600, supports: 'Cantilever (fixed at the left, free at the right)', limits: { defl: 12, fos: 2, mass: 5 } };
const SEC = d => {
  if (d.shape === 'rect') return { A: d.b * d.h, I: d.b * d.h ** 3 / 12, c: d.h / 2 };
  const hw = d.h - 2 * d.tf; return { A: 2 * d.b * d.tf + d.tw * hw, I: (d.b * d.h ** 3 - (d.b - d.tw) * hw ** 3) / 12, c: d.h / 2 };
};
function cantilever(d, a) {
  const { span: L, load: P } = BENCH, m = MAT[d.material], s = SEC(d), M = P * a, stress = M * s.c / s.I;
  return { ...s, moment: M / 1000, stress, fos: m.strength / stress, tip: P * a * a * (3 * L - a) / (6 * m.E * s.I), under: P * a ** 3 / (3 * m.E * s.I), mass: m.rho * s.A * 1e-9 * L };
}
const B1 = { design: { material: 'timber', shape: 'rect', b: 50, h: 80 }, mount: 900, strainX: 50 };
const B2 = { design: { material: 'bamboo', shape: 'I', b: 50, h: 80, tw: 6, tf: 10 }, mount: 600, strainX: 50 };
const TARGET_B = 'Allowable stress and factor of safety: FoS = yield ÷ working stress';

// ---------- one browser, one learner ----------
async function learner(vp, server) {
  const browser = await chromium.launch(), page = await browser.newPage({ ...vp, acceptDownloads: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = new URL(r.url()); if (u.protocol !== 'blob:' && u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const h = learnerPage(page, { touch: !!vp.hasTouch });
  const tab = async id => { await h.tap(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); };
  const download = async button => { const [d] = await Promise.all([page.waitForEvent('download'), h.tap(button)]); return JSON.parse(await readFile(await d.path(), 'utf8')); };
  return { browser, page, errors, h, tab, download };
}

// The part of the loop that is the same on every bench: pick, miss, learn, check; and the portfolio's trail checks.
async function pickAndMiss(L, { picks, options, wrong, truth }) {
  const { h: { app, btn, tap, noOverflow } } = L;
  await tap(btn('Start · save Revision 1'));
  await L.page.locator('body[data-phase="stuck"]').waitFor();
  assert.deepEqual((await app.locator('#pick label').allInnerTexts()).map(t => t.trim()), options, 'the outputs this design really has');
  for (const p of picks) await tap(app.locator('#pick label', { hasText: p }).locator('input'));
  await tap(btn('Predict these'));
  const fields = app.locator('label.field');
  assert.equal(await fields.count(), picks.length);
  for (const f of await fields.all()) { const prompt = (await f.innerText()).trim(); await f.locator('input').fill(sig(wrong(prompt))); }
  await noOverflow('predict');
  await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
  const rows = await L.h.scoredRows('Your prediction against the engine');
  assert.equal(rows.length, picks.length);
  for (const r of rows) { near(n(r.engine), truth(r.prompt), 0.001, `engine ${r.prompt}`, 0.001); assert.equal(r.result, 'off', r.prompt); }
  // the most missed, by relative error, from what the table shows
  const errs = rows.map(r => relErr(n(r.you), n(r.engine)));
  return rows[errs.indexOf(Math.max(...errs))].prompt;
}
async function learn(L, target) {
  const { h } = L;
  await L.h.tap(h.btn('Find what is blocking me'));
  await L.page.locator('body[data-phase="diagnose"]').waitFor();
  const seen = await playLoop(L.page, h, { target, prereqDontKnow: true, help: 'prereq', solver: solveItem });
  const prereq = seen.dontKnow.find(t => t !== target);
  assert.ok(prereq, `a prerequisite was asked after the target miss: ${JSON.stringify(seen.dontKnow)}`);
  assert.match(seen.found, new RegExp(`First: ${prereq.replace(/[()·.÷=+]/g, '.')}\\. Then ${target.replace(/[()·.÷=+]/g, '.')}`), 'the diagnosis names the prerequisite gap');
  assert.deepEqual(seen.helpedOn, [prereq], 'help only on the prerequisite');
  assert.equal(seen.check, 1);
  assert.equal((await h.app.locator('#status').innerText()).trim(), 'Solved on your own after help.');
  await h.tap(h.btn('Back to my design'));
  await L.page.locator('body[data-phase="return"]').waitFor();
  return prereq;
}
async function portfolio(L, { target, prereq, pid, name }) {
  const { h: { app, noOverflow } } = L;
  for (const r of await L.h.scoredRows('Defence')) assert.equal(r.result, 'close', r.prompt);
  assert.equal(await app.locator('.badmsg').count(), 0, 'every run reproduces');
  assert.ok(await app.locator('.okmsg', { hasText: 'reproduced from its saved setup' }).count() >= 4);
  const trail = await app.locator('ul.trail li').evaluateAll(ls => ls.map(l => ({ title: l.querySelector('b').textContent, status: l.dataset.status, role: l.dataset.role, text: l.querySelector('.st').textContent, line: l.textContent })));
  const tT = trail.find(t => t.title === target), tP = trail.find(t => t.title === prereq);
  assert.deepEqual([tT.role, tT.status, tT.text], ['target', 'independent-after-help', 'Solved on your own after help']);
  assert.deepEqual([tP.role, tP.status, tP.text], ['prerequisite', 'helped', 'Practised with help; no unaided question since']);
  for (const t of trail.filter(t => t.role === 'prerequisite')) assert.doesNotMatch(t.text, /Solved on your own/, `${t.title} is not claimed as solved on its own`);
  await noOverflow('summary');
  const pf = await L.download(app.locator('#export'));
  assert.deepEqual([pf.project.id, pf.project.name], [pid, name], 'the portfolio is on their own project');
  const tid = Object.keys(pf.trail.status).find(k => pf.trail.status[k].title === target), pidC = Object.keys(pf.trail.status).find(k => pf.trail.status[k].title === prereq);
  assert.deepEqual([pf.trail.status[tid].status, pf.trail.status[tid].basis], ['independent-after-help', { provenance: 'check', result: 'correct' }]);
  assert.deepEqual([pf.trail.status[pidC].status, pf.trail.status[pidC].basis], ['helped', null]);
  const checks = pf.trail.events.filter(e => e.provenance === 'check');
  assert.equal(checks.length, 1);
  assert.ok(checks.every(e => e.competency === tid && e.kind === 'evidence' && e.result === 'correct'), 'the check assesses only the target');
  assert.ok(pf.trail.events.some(e => e.competency === pidC && (e.kind === 'hint' || e.kind === 'shown_solution')), 'help on the prerequisite is recorded as help');
  assert.equal(pf.trail.events.filter(e => e.competency === tid && (e.kind === 'hint' || e.kind === 'shown_solution')).length, 0, 'no hint or solution on the target');
  assert.ok(pf.decision.defence.every(d => d.result === 'correct'));
  return pf;
}

// ======================= A. Force Playground, phone =======================
test('open loop on the Force Playground: own truss, phone, visible controls only', async () => {
  const server = await serve(), L = await learner({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, server);
  const { page, h, tab } = L, { app, btn, tap, noOverflow, setupShown, scoredRows } = h;
  try {
    const keys = J.map(([x, y]) => `${x},${y}`).sort().join(' ');
    for (const p of PRESETS) assert.notEqual(p.nodes.map(q => `${q.x},${q.y}`).sort().join(' '), keys, `not the ${p.id} preset`);
    const T1 = truss(TUBE.big), T2 = truss(TUBE.small);

    // ---------- build it from a cleared workspace ----------
    await page.goto(server.origin + '/playground/index.html#build');
    await page.locator('body[data-ready="true"]').waitFor();
    await tap(page.getByRole('button', { name: 'Clear' }));
    assert.match(await page.locator('#verdict').textContent(), /Nothing built yet/);
    const at = async ([x, y]) => {   // a point of the 0.5 m drawing grid, tapped on the scene
      await page.locator('#scene').scrollIntoViewIfNeeded();
      const p = await page.evaluate(([x, y]) => window.__labs.toScreen(x, y), [x, y]), box = await page.locator('#scene').boundingBox();
      await page.touchscreen.tap(box.x + p.x, box.y + p.y);
    };
    await tap(page.getByRole('radio', { name: 'Draw' }));
    await tap(page.getByRole('radio', { name: 'Pin joints' }));
    for (const [a, b] of BARS) { await at(J[a]); await at(J[b]); }
    assert.match(await page.locator('.mass').textContent(), /7 members/);
    await tap(page.getByRole('radio', { name: 'Supports' }));
    await at(J[0]); await at(J[2]); await at(J[2]);          // joint 1: pin; joint 3: pin → roller
    await tab('loads');
    await tap(page.getByRole('button', { name: '+ Car' }));
    assert.doesNotMatch(await page.locator('#verdict').textContent(), /move freely|Nothing built/);
    near(n(await page.locator('#b-mass').textContent()), T1.kg, 0, 'material used (kg)', 0.5);
    await tab('experiments');
    await page.locator('#experiments .nb-name').fill('My Warren truss');
    await tap(page.locator('#experiments .nb-save'));
    const mine = page.locator('#experiments .nb-runs li', { hasText: 'My Warren truss' });
    await mine.waitFor();
    assert.equal(await mine.locator('[data-reproduced]').getAttribute('data-reproduced'), 'true');

    // ---------- Predict and learn, from Experiments ----------
    const link = page.locator('#experiments').getByRole('link', { name: 'Predict and learn' });
    const pid = (await link.getAttribute('href')).match(/^\/journeys\/journey\.html\?open=solids-frame&project=([\w-]+)$/)?.[1];
    assert.ok(pid, 'the link opens the loop on this project, the bench found by its domain');
    await tap(link);
    await page.waitForURL(/journey\.html\?open=solids-frame&project=/);
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await app.locator('h1').innerText(), 'Your design');
    const members = (tube, bars = BARS) => bars.map(([a, b], k) => `${k + 1}: joints ${a + 1}–${b + 1}, pin-jointed, Structural steel, ${tube.label}`).join('; ');
    const described = tube => ({ Structure: 'Build your own: 5 joints, 7 members (0 rigid, 7 pin-jointed)', Joints: '1 (0 m, 0 m); 2 (2 m, 0 m); 3 (4 m, 0 m); 4 (1 m, 1.5 m); 5 (3 m, 1.5 m)',
      Members: members(tube), 'Material (main members)': 'Structural steel', 'Section (main members)': tube.label, Supports: 'pin at joint 1; roller at joint 3',
      Loads: 'Car (1200 kg) on member 1 at 50 % of its length; plus the structure’s own weight', Conditions: 'Normal day' });
    assert.deepEqual(await setupShown(), described(TUBE.big), 'their own truss, in words');
    const projectName = (await app.innerText()).match(/a run on your own project “([^”]+)”/)?.[1];
    assert.equal(projectName, 'Structure 1');
    await noOverflow('brief');

    // ---------- predict both support reactions; the student splits the car half and half and forgets the own weight ----------
    const R1label = 'Vertical reaction at joint 1 (pin, x = 0.0 m)', R3label = 'Vertical reaction at joint 3 (roller, x = 4.0 m)';
    const missed = await pickAndMiss(L, {
      picks: [R1label, R3label],
      options: ['Safety factor', 'Highest stress (MPa)', 'Biggest movement (mm)', `${R1label} (N)`, `${R3label} (N)`],
      wrong: () => CAR / 2,
      truth: p => (p.startsWith(R1label) ? T1.R1 : T1.R3),
    });
    assert.equal(missed, relErr(CAR / 2, T1.R1) > relErr(CAR / 2, T1.R3) ? R1label : R3label, 'the most missed reaction, by hand');
    const prereq = await learn(L, TARGET_A);

    // ---------- back to THEIR project on the bench; lighter tubes; a run saved ----------
    assert.deepEqual(await setupShown(), described(TUBE.big));
    await tap(app.getByRole('link', { name: 'Change it on the bench' }));
    await page.waitForURL(/\/playground\/\?project=current$/);
    await page.locator('body[data-ready="true"]').waitFor();
    assert.match(await page.locator('.mass').textContent(), /7 members/, 'their own truss is on the bench');
    near(n(await page.locator('#b-mass').textContent()), T1.kg, 0, 'their tubes', 0.5);
    await tab('experiments');
    assert.equal((await page.locator('#experiments .nb-open option:checked').innerText()).trim(), 'Structure 1 · 2 runs', '?project=current opened their project and kept it');
    assert.match(await page.locator('#experiments .nb-learn').getAttribute('href'), new RegExp(`project=${pid}$`));
    await tab('material');
    await tap(page.getByRole('radio', { name: TUBE.small.label }));
    near(n(await page.locator('#b-mass').textContent()), T2.kg, 0, 'lighter tubes (kg)', 0.5);
    await tab('experiments');
    await page.locator('#experiments .nb-name').fill('Lighter tubes');
    await tap(page.locator('#experiments .nb-save'));
    await page.locator('#experiments .nb-runs li', { hasText: 'Lighter tubes' }).waitFor();
    assert.equal((await page.locator('#experiments .nb-open option:checked').innerText()).trim(), 'Structure 1 · 3 runs');
    await noOverflow('bench');
    await page.goBack();
    await page.locator('body[data-phase="return"]').waitFor();
    await tap(btn('I’ve saved a change'));
    await page.reload();
    await page.locator('body[data-phase="return"]').waitFor();
    assert.match(await app.innerText(), /Changed since Revision 1: Section \(main members\)\./);
    assert.deepEqual(await setupShown(), described(TUBE.small), 'after a reload, the changed design');

    // ---------- predict and run the change, by hand; Revision 2 ----------
    for (const f of await app.locator('#predict-card label.field').all()) {
      const p = (await f.innerText()).trim(); await f.locator('input').fill(sig(p.startsWith(R1label) ? T2.R1 : T2.R3));
    }
    await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
    for (const r of await scoredRows('Prediction run 1')) { assert.equal(r.result, 'close', r.prompt); near(n(r.engine), r.prompt.startsWith(R1label) ? T2.R1 : T2.R3, 0.001, r.prompt); }
    const tested = (await app.locator('table.scored caption', { hasText: 'Prediction run 1' }).innerText()).match(/run (R\d+)$/)[1];
    assert.match(await app.locator('#tested-status').innerText(), new RegExp(`This design is tested \\(run ${tested}\\)`));
    await tap(app.getByRole('button', { name: /^Save as Revision 2/ }));
    await page.locator('body[data-phase="decide"]').waitFor();

    // ---------- decide, citing the tested run and the bench run of the same design ----------
    const line = (await app.locator('#decide-design').innerText()).match(/^From (R\d+) to (R\d+) \(tested in run (R\d+)\): (.*)\.$/);
    assert.ok(line); assert.equal(line[3], tested); assert.equal(line[4], 'Section (main members)');
    const runLabels = (await app.locator('.checks label').allInnerTexts()).map(t => t.trim()), idOf = name => runLabels.find(t => t.endsWith(` · ${name}`))?.split(' · ')[0];
    const cite = [tested, idOf('Lighter tubes')];
    assert.ok(cite[1], JSON.stringify(runLabels));
    for (const id of cite) await app.locator('.checks label', { hasText: `${id} · ` }).locator('input').check();
    await app.locator('#claim').fill(`Ø60×4 tubes: ${(T1.kg - T2.kg).toFixed(0)} kg lighter; the pin then carries ${T2.R1.toFixed(0)} N and the roller ${T2.R3.toFixed(0)} N (ΣM about joint 1, ΣFy = 0).`);
    await tap(btn('Save the decision'));

    // ---------- defend: the pin reaction with the old tubes, by hand ----------
    await page.locator('body[data-phase="defend"]').waitFor();
    const qs = await app.locator('label.field').all();
    assert.equal(qs.length, 1, 'one lever changed, one question');
    const prompt = (await qs[0].innerText()).trim();
    assert.match(prompt, /^What would the vertical reaction at joint 1 \(pin, x = 0\.0 m\) be if the section of the main members went back to its Revision 1 value \(Ø114×5 mm tube instead of Ø60×4 mm tube\)\?/);
    await qs[0].locator('input').fill(sig(T1.R1));
    await tap(btn('Submit'));

    // ---------- portfolio on their project ----------
    await page.locator('body[data-phase="summary"]').waitFor();
    assert.equal((await app.locator('#r2-run').innerText()).trim(), `Revision 2 is run ${line[2]}, the design you predicted and ran in run ${tested}.`);
    const runsLine = await app.locator('#claim-text + p').innerText();
    for (const id of [line[2], ...cite]) assert.ok(runsLine.includes(id), `decision cites ${id}`);
    const pf = await portfolio(L, { target: TARGET_A, prereq, pid, name: 'Structure 1' });
    assert.equal(pf.design.to.setup.state.section, 0);
    assert.deepEqual(pf.design.to.setup.object.nodes.map(q => [q.x, q.y]), J, 'Revision 2 is their own truss');
    // their bench still opens on their project, with the change
    await tap(app.locator('#bench').last());
    await page.waitForURL(/\/playground\/\?project=current$/);
    await page.locator('body[data-ready="true"]').waitFor();
    near(n(await page.locator('#b-mass').textContent()), T2.kg, 0, 'the current design', 0.5);
    await tab('experiments');
    assert.equal((await page.locator('#experiments .nb-open option:checked').innerText()).trim(), 'Structure 1 · 5 runs');
    assert.equal(await page.locator('#experiments [data-reproduced="false"]').count(), 0);
    assert.deepEqual(L.errors, []);
  } finally { await L.browser.close(); server.close(); }
});

// ======================= B. Mount lab, opened, desktop =======================
test('open loop on the opened Mount lab: own timber cantilever, desktop, visible controls only', async () => {
  const server = await serve(), L = await learner({ viewport: { width: 1280, height: 900 } }, server);
  const { page, h, tab } = L, { app, btn, tap, noOverflow, setupShown, scoredRows } = h;
  const DIM = { b: /^(Flange width b|Width b)/, h: /^Depth h/, tw: /^Web tw/, tf: /^Flange tf/ };
  const setDesign = async d => {
    await tab('design');
    await tap(page.getByRole('radio', { name: MAT[d.material].name }));
    await tap(page.getByRole('radio', { name: d.shape === 'rect' ? 'Solid rectangle' : 'I-section' }));
    for (const k of ['b', 'h', 'tw', 'tf']) if (d[k] != null) {
      const lab = page.locator('#dims label.range').filter({ hasText: DIM[k] });
      await lab.locator('input').fill(String(d[k]));
      assert.equal(await lab.locator('output').innerText(), `${d[k]} mm`);
    }
    const t = await page.locator('#secprops').innerText(), hd = cantilever(d, 0 + BENCH.span);
    near(n(t.match(/I = ([\d,]+) mm⁴/)[1]), hd.I, 0, 'I (mm⁴)', 1);
    near(n(t.match(/mass ([\d.]+) kg/)[1]), hd.mass, 0, 'mass (kg)', 0.006);
  };
  // one loaded reading: dial under the machine, strain gauge at the root (50 mm, the first station)
  const reading = async s => {
    await tab('stand');
    await tap(page.locator('#load-on'));
    await page.locator('#dial-x').selectOption({ label: `${s.mount} mm` });
    await page.locator('#strain-x').selectOption({ label: `${s.strainX} mm` });
    await tap(page.locator('#take'));
    const hd = cantilever(s.design, s.mount);
    assert.equal(await page.locator('#r-dial').innerText(), `${hd.under.toFixed(3)} mm @ ${s.mount}`, 'dial under the machine: P·a³/(3·E·I)');
    const strain = n(await page.locator('#r-strain').innerText()), rootStress = BENCH.load * (s.mount - s.strainX) * hd.c / hd.I;
    near(strain, -rootStress / MAT[s.design.material].E * 1e6, 0, 'strain near the root (µε; hogging, so negative)', 0.6);
    await tab('experiments');
  };
  try {
    const H1 = cantilever(B1.design, B1.mount), H2 = cantilever(B2.design, B2.mount);

    // ---------- their own set-up on the open bench ----------
    await page.goto(server.origin + '/mount/?mode=open');
    await page.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    await tab('stand');
    const setNum = async (id, v) => { const el = page.locator(`#${id}`); await el.scrollIntoViewIfNeeded(); await el.fill(String(v)); await el.press('Tab'); };
    await page.locator('#ob-supports').selectOption({ label: BENCH.supports });
    await setNum('ob-span', BENCH.span);
    await setNum('ob-load', BENCH.load);
    await page.locator('#mount-x').selectOption({ label: `${B1.mount} mm` });
    await setNum('ob-lim-defl', BENCH.limits.defl); await setNum('ob-lim-fos', BENCH.limits.fos); await setNum('ob-lim-mass', BENCH.limits.mass);
    assert.equal(await page.locator('#ob-msg').textContent(), '');
    assert.equal(await page.locator('#mount-x option').last().textContent(), `${BENCH.span} mm`, 'a cantilever: the machine may sit at the free end');
    await setDesign(B1.design);
    // a brittle, natural material is judged on its failure strength, not on a yield it does not have
    await tab('split');
    near(n(await page.locator('#ss-fos-val').textContent()), H1.fos, 0, 'factor of safety at the root', 0.006);
    assert.match(await page.locator('#ss-fos').innerText(), /^Factor of safety on failure strength /);
    const chart = await page.locator('#ss-chart').textContent();
    assert.match(chart, /linear to failure strength at 30 MPa/); assert.match(chart, /beyond failure strength/); assert.doesNotMatch(chart, /yield/);
    await reading(B1);
    const r1 = page.locator('#experiments .nb-runs li', { hasText: 'Reading 1' });
    await r1.waitFor();
    assert.equal(await r1.locator('[data-reproduced]').getAttribute('data-reproduced'), 'true');

    // ---------- Predict and learn ----------
    const link = page.locator('#experiments').getByRole('link', { name: 'Predict and learn' });
    const pid = (await link.getAttribute('href')).match(/^\/journeys\/journey\.html\?open=mount-stand&project=([\w-]+)$/)?.[1];
    assert.ok(pid);
    await tap(link);
    await page.locator('body[data-ready="true"]').waitFor();
    assert.equal(await app.locator('h1').innerText(), 'Your design');
    const described = s => ({ Material: MAT[s.design.material].name,
      Section: s.design.shape === 'rect' ? `Solid rectangle, ${s.design.b} × ${s.design.h} mm` : `I-section, ${s.design.b} × ${s.design.h} mm, web ${s.design.tw} mm, flanges ${s.design.tf} mm`,
      'Span and supports': `${BENCH.span} mm, ${BENCH.supports}`, Machine: `${BENCH.load} N at ${s.mount} mm from the left end`, 'Operating load': 'on',
      Gauges: `dial at ${s.mount} mm, strain gauge at ${s.strainX} mm`, 'Your limits': `deflection ≤ ${BENCH.limits.defl} mm at the machine, stress ≤ strength ÷ ${BENCH.limits.fos}, mass ≤ ${BENCH.limits.mass} kg` });
    assert.deepEqual(await setupShown(), described(B1));
    assert.equal((await app.innerText()).match(/a run on your own project “([^”]+)”/)?.[1], 'My support 1');

    // ---------- predict the fixing moment, the tip deflection and the factor of safety; miss ----------
    // the student's slips: the moment arm from the free end, the deflection under the load (not the tip), and E as the strength
    const M = 'Left fixing moment (under the operating load)', D = 'Largest deflection (under the operating load)', F = 'Factor of safety on failure strength (under the operating load)';
    const missed = await pickAndMiss(L, {
      picks: [M, D, F],
      options: ['Dial reading (deflection) (mm)', 'Strain reading (µε)', 'Stress from strain (E·ε) (MPa)', 'Second moment of area I (mm⁴)', 'Left support reaction (under the operating load) (N)',
        `${M} (N·m)`, 'Largest bending moment (under the operating load) (N·m)', 'Largest bending stress (under the operating load) (MPa)', `${D} (mm)`, F],
      wrong: p => (p.startsWith(M) ? BENCH.load * (BENCH.span - B1.mount) / 1000 : p.startsWith(D) ? H1.under : MAT.timber.E / H1.stress),
      truth: p => (p.startsWith(M) ? H1.moment : p.startsWith(D) ? H1.tip : H1.fos),
    });
    assert.equal(missed, F, 'the factor of safety is missed most');
    const prereq = await learn(L, TARGET_B);

    // ---------- back to THEIR project: bamboo, an I-section, the machine nearer the wall; a reading ----------
    assert.deepEqual(await setupShown(), described(B1));
    await tap(app.getByRole('link', { name: 'Change it on the bench' }));
    await page.waitForURL(/\/mount\/\?project=current$/);
    await page.locator('body[data-ready="true"][data-stage="free"]').waitFor();
    await tab('stand');
    assert.deepEqual([await page.locator('#ob-supports').inputValue(), await page.locator('#ob-span').inputValue(), await page.locator('#ob-load').inputValue(), await page.locator('#mount-x').inputValue()],
      ['cantilever', String(BENCH.span), String(BENCH.load), String(B1.mount)], 'their own set-up is on the bench');
    await tab('design');
    assert.equal(await page.locator('[data-mat="timber"]').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('[data-shape="rect"]').getAttribute('aria-checked'), 'true');
    await tab('experiments');
    assert.equal((await page.locator('#experiments .nb-open option:checked').innerText()).trim(), 'My support 1 · 2 runs');
    await setDesign(B2.design);
    await tab('stand');
    await page.locator('#mount-x').selectOption({ label: `${B2.mount} mm` });
    await reading(B2);
    const r2 = page.locator('#experiments .nb-runs li', { hasText: 'Reading 2' });
    await r2.waitFor();
    const r2name = (await r2.locator('b').innerText()).trim();
    assert.equal(r2name, `Reading 2 · Bamboo I 50×80 (tw 6, tf 10) · loaded · mount ${B2.mount} mm`);
    await noOverflow('bench');
    await page.goBack();
    await page.locator('body[data-phase="return"]').waitFor();
    await tap(btn('I’ve saved a change'));
    await page.reload();
    await page.locator('body[data-phase="return"]').waitFor();
    assert.match(await app.innerText(), /Changed since Revision 1: Material, Section, Machine, Gauges\./);
    assert.deepEqual(await setupShown(), described(B2));

    // ---------- predict and run, by hand; Revision 2 ----------
    const byHand = (p, H) => (p.startsWith(M) ? H.moment : p.startsWith(D) ? H.tip : H.fos);
    for (const f of await app.locator('#predict-card label.field').all()) await f.locator('input').fill(sig(byHand((await f.innerText()).trim(), H2)));
    await tap(btn('Lock predictions')); await tap(btn('Run the bench'));
    for (const r of await scoredRows('Prediction run 1')) { assert.equal(r.result, 'close', r.prompt); near(n(r.engine), byHand(r.prompt, H2), 0.002, r.prompt); }
    const tested = (await app.locator('table.scored caption', { hasText: 'Prediction run 1' }).innerText()).match(/run (R\d+)$/)[1];
    await tap(app.getByRole('button', { name: /^Save as Revision 2/ }));
    await page.locator('body[data-phase="decide"]').waitFor();
    const line = (await app.locator('#decide-design').innerText()).match(/^From (R\d+) to (R\d+) \(tested in run (R\d+)\): (.*)\.$/);
    assert.ok(line); assert.equal(line[3], tested); assert.equal(line[4], 'Material, Section, Machine, Gauges');
    const runLabels = (await app.locator('.checks label').allInnerTexts()).map(t => t.trim()), cite = [tested, runLabels.find(t => t.endsWith(` · ${r2name}`))?.split(' · ')[0]];
    assert.ok(cite[1], JSON.stringify(runLabels));
    for (const id of cite) await app.locator('.checks label', { hasText: `${id} · ` }).locator('input').check();
    await app.locator('#claim').fill(`Bamboo I-section with the machine at ${B2.mount} mm: FoS ${H2.fos.toFixed(2)} ≥ ${BENCH.limits.fos}, tip ${H2.tip.toFixed(2)} mm, ${H2.mass.toFixed(2)} kg.`);
    await tap(btn('Save the decision'));

    // ---------- defend: one question per lever changed, each put back to its Revision 1 value, by hand ----------
    await page.locator('body[data-phase="defend"]').waitFor();
    const qs = await app.locator('label.field').all();
    const prompts = await Promise.all(qs.map(async q => (await q.innerText()).trim()));
    const expect = [
      [/^What would the left fixing moment \(under the operating load\) be if the material went back to its Revision 1 value \(Timber \(pine, along grain\) instead of Bamboo\)\?/, cantilever({ ...B2.design, material: 'timber' }, B2.mount).moment],
      [/^What would the largest deflection \(under the operating load\) be if the section shape went back to its Revision 1 value \(Solid rectangle instead of I-section\)\?/, cantilever({ material: 'bamboo', shape: 'rect', b: 50, h: 80 }, B2.mount).tip],
      [/^What would the factor of safety on failure strength \(under the operating load\) be if the machine position \(mm from the left end\) went back to its Revision 1 value \(900 instead of 600\)\?/, cantilever(B2.design, B1.mount).fos],
    ];
    assert.equal(prompts.length, expect.length, JSON.stringify(prompts));
    for (const [i, [re, v]] of expect.entries()) { assert.match(prompts[i], re); await qs[i].locator('input').fill(sig(v)); }
    // the shape question is about Revision 1's own rectangle (50 × 80), not the bench's default one (40 × 30)
    assert.ok(relErr(cantilever({ material: 'bamboo', shape: 'rect', b: 40, h: 30 }, B2.mount).tip, expect[1][1]) > 0.5);
    await tap(btn('Submit'));

    // ---------- portfolio on their project ----------
    await page.locator('body[data-phase="summary"]').waitFor();
    assert.equal((await app.locator('#r2-run').innerText()).trim(), `Revision 2 is run ${line[2]}, the design you predicted and ran in run ${tested}.`);
    const pf = await portfolio(L, { target: TARGET_B, prereq, pid, name: 'My support 1' });
    assert.deepEqual(pf.design.to.setup.design, B2.design);
    assert.equal(pf.decision.defence.length, 3);
    assert.deepEqual(L.errors, []);
  } finally { await L.browser.close(); server.close(); }
});
