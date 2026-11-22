// Shared pieces for the visible-only journey tests (a learner's hand calculations and page helpers). Nothing here reads
// page internals, imports content or answer keys, or writes storage: it only clicks what is shown and reads what is shown.
// Extracted from the patterns in tests/journey-support-visible.e2e.mjs (left unchanged).
import assert from 'node:assert/strict';

// ---------- the learner's own handbook and beam formulas ----------
// Handbook values the learner brings (checked against the bench's own visible E and yield).
export const HANDBOOK = { steel: { E: 200000, yield: 250, rho: 7850, name: 'Structural steel' }, aluminium: { E: 69000, yield: 276, rho: 2700, name: 'Aluminium 6061-T6' } };
export const n = s => parseFloat(String(s).replace(/,/g, ''));   // a shown number, with any unit after it
export const close = (a, b, rel = 0.005, abs = 0) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
export function sectionOf(d) {   // A mm², I mm⁴ (bending about the horizontal axis), c mm
  if (d.shape === 'rect') return { A: d.b * d.h, I: d.b * d.h ** 3 / 12, c: d.h / 2 };
  if (d.shape === 'rhs') { const bi = d.b - 2 * d.t, hi = d.h - 2 * d.t; return { A: d.b * d.h - bi * hi, I: (d.b * d.h ** 3 - bi * hi ** 3) / 12, c: d.h / 2 }; }
  const hw = d.h - 2 * d.tf;   // I-section: two flanges b × tf and a web tw × (h − 2 tf)
  return { A: 2 * d.b * d.tf + d.tw * hw, I: (d.b * d.h ** 3 - (d.b - d.tw) * hw ** 3) / 12, c: d.h / 2 };
}
// Simply supported span L (pin–roller), point load P at a from the left bolt. N, mm, MPa.
export const deflUnder = (P, L, a, EI) => P * a * a * (L - a) ** 2 / (3 * EI * L);
export function beamHand(brief, d, a = brief.mount) {
  const m = HANDBOOK[d.material], s = sectionOf(d), M = brief.P * a * (brief.L - a) / brief.L;
  const defl = deflUnder(brief.P, brief.L, a, m.E * s.I), stress = M * s.c / s.I, mass = m.rho * s.A * 1e-9 * brief.L;
  return { ...s, M, defl, stress, mass, fos: m.yield / stress, allow: m.yield / brief.factor,
    ok: { defl: defl <= brief.tol, stress: stress <= m.yield / brief.factor, mass: mass <= brief.massLimit, envelope: d.b <= brief.env.b && d.h <= brief.env.h,
      walls: d.shape === 'rect' || (d.shape === 'rhs' ? d.t >= 3 : d.tw >= 3 && d.tf >= 3) } };
}
export const meets = h => Object.values(h.ok).every(Boolean);

// What the journey page shows for a Mount design, in words, written out independently here.
const NAME = { steel: 'Structural steel', aluminium: 'Aluminium 6061-T6' }, SEC = { rect: 'Solid rectangle', rhs: 'Hollow rectangle', I: 'I-section' };
export const shownFor = (d, mount) => ({ Material: NAME[d.material],
  Section: `${SEC[d.shape]}, ${d.b} × ${d.h} mm${d.shape === 'rhs' ? `, wall ${d.t} mm` : d.shape === 'I' ? `, web ${d.tw} mm, flanges ${d.tf} mm` : ''}`,
  'Machine at': `${mount} mm from the left bolt`, 'Operating load': 'on', Gauges: `dial at ${mount} mm, strain gauge at ${mount} mm` });
export const DIM_LABEL = { b: /^(Flange width b|Width b)/, h: /^Depth h/, t: /^Wall t/, tw: /^Web tw/, tf: /^Flange tf/ };

// ---------- page helpers ----------
export function pageKit(page, vp, server) {
  const app = page.locator('#app');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = new URL(r.url()); if (u.protocol !== 'blob:' && u.origin !== server.origin && !u.host.includes('fonts.g')) errors.push(`network: ${r.url()}`); });
  const btn = name => app.getByRole('button', { name, exact: true });
  return {
    app, errors, btn,
    phase: () => page.locator('body').getAttribute('data-phase'),
    has: async name => (await btn(name).count()) > 0 && await btn(name).first().isEnabled(),
    tap: async loc => { await loc.scrollIntoViewIfNeeded(); await (vp.hasTouch ? loc.tap() : loc.click()); },
    noOverflow: async where => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${where}`),
    setupShown: async () => Object.fromEntries(await app.locator('dl.setup').first().evaluate(dl => [...dl.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]))),
    scoredRows: async caption => app.locator('table.scored', { has: page.locator('caption', { hasText: caption }) }).locator('tbody tr')
      .evaluateAll(trs => trs.map(tr => ({ prompt: tr.cells[0].textContent, you: tr.cells[1].textContent, engine: tr.cells[2].textContent, result: tr.cells[3].textContent }))),
  };
}

// ---------- the Mount bench, through its visible controls ----------
export function mountBench(page, kit, brief) {
  const { tap } = kit;
  const tab = async id => { await tap(page.locator(`#tab-${id}`)); await page.locator(`[data-module="${id}"]:not([hidden])`).waitFor(); };
  const setDims = async dims => {
    for (const [k, v] of Object.entries(dims)) {
      const lab = page.locator('#dims label.range').filter({ hasText: DIM_LABEL[k] });
      await lab.locator('input').fill(String(v));
      assert.equal(await lab.locator('output').innerText(), `${v} mm`);
    }
  };
  const benchProps = async () => {
    const t = await page.locator('#secprops').innerText();
    return { I: n(t.match(/I = ([\d,]+) mm⁴/)[1]), mass: n(t.match(/mass ([\d.]+) kg/)[1]), notAllowed: /Not allowed/.test(t) };
  };
  // one reading of the current design: load on, both gauges at the machine, take it; read it back from Runs
  const readDesign = async d => {
    const h = beamHand(brief, d), p = await benchProps();
    assert.ok(Math.abs(p.I - h.I) <= 1, `I on the bench ${p.I} vs hand ${h.I}`);
    assert.ok(Math.abs(p.mass - h.mass) <= 0.006, `mass on the bench ${p.mass} vs hand ${h.mass}`);
    assert.equal(p.notAllowed, false);
    await tab('stand');
    await tap(page.locator('#load-on'));
    await page.locator('#dial-x').selectOption({ label: `${brief.mount} mm` });
    await page.locator('#strain-x').selectOption({ label: `${brief.mount} mm` });
    const before = await page.locator('#runs tbody tr').count();
    await tap(page.locator('#take'));
    await page.locator('#status', { hasText: `LOADED · ${brief.P / 1000} kN at ${brief.mount} mm` }).waitFor();
    assert.equal(await page.locator('#r-dial').innerText(), `${h.defl.toFixed(3)} mm @ ${brief.mount}`, 'dial gauge reads the hand deflection');
    const strain = n((await page.locator('#r-strain').innerText()).match(/^(-?[\d.]+) µε/)[1]);
    assert.ok(Math.abs(strain - h.stress / HANDBOOK[d.material].E * 1e6) <= 1, `strain ${strain} µε`);
    await tab('runs');
    const rows = page.locator('#runs tbody tr');
    assert.equal(await rows.count(), before + 1);
    const row = await rows.last().evaluate(tr => [...tr.cells].map(c => ({ text: c.textContent, cls: c.className })));
    // Reading | Dial | Alignment | Strain | σ | ≤ yield ÷ 2 | Mass
    assert.ok(Math.abs(n(row[4].text) - h.stress) <= 0.051, `σ on the bench ${row[4].text} vs hand ${h.stress}`);
    const verdict = { defl: row[2].text === 'within', stress: row[5].text === 'OK', mass: row[6].cls === 'ok' };
    assert.deepEqual(verdict, { defl: h.ok.defl, stress: h.ok.stress, mass: h.ok.mass }, 'the bench judges the three limits as the hand calculation does');
    await tab('design');
    return { name: row[0].text, h, verdict };
  };
  return { tab, setDims, benchProps, readDesign };
}

// ---------- items on the open solids benches, solved by hand from their visible text ----------
// The statics and solids questions the open loop may ask on the learner's own truss or beam: equilibrium in 2D and what
// it rests on (free-body diagram, support reactions, moment of a force, a linear equation), factor of safety and what it
// rests on (yield and the elastic limit, normal stress). Moments of a force reuse the Journey 1 learner (support-hand.mjs).
// Returns { text } for a number box (value and unit) or { option } for a choice. tests/solids-hand.test.mjs checks this
// learner against the item generators over many seeds (the browser tests never import them).
import { solve as solveMoment } from './support-hand.mjs';
const sig = v => String(+v.toPrecision(6));
const rad = d => d * Math.PI / 180;
export function solveItem(prompt, options = []) {
  let m;
  const pick = re => { const i = options.findIndex(o => re.test(o.trim())); assert.ok(i >= 0, `no option ${re} in ${JSON.stringify(options)}`); return { option: i }; };
  const num = (v, unit) => ({ text: `${sig(v)}${unit ? ` ${unit}` : ''}` });
  if (options.length) {
    // free-body diagram: one unknown per movement a support stops (pin 2, roller 1, fixed 3)
    if ((m = prompt.match(/^Draw the free-body diagram of (.+), carrying a known/))) return pick(new RegExp(`^${/two pins/.test(m[1]) ? 4 : 3}$`));
    if (/Which is the complete free-body diagram/.test(prompt)) return pick(/^The box’s weight, the wall’s upward force and the wall’s moment$/);
    if ((m = prompt.match(/^What can a (roller|pin|fixed) support push or pull on a beam with\?/)))
      return pick({ roller: /^one force at right angles to the surface/, pin: /^a force in any direction \(two components\), but no moment$/, fixed: /^a force in any direction and a moment$/ }[m[1]]);
    if (/You want B’s reaction with one equation/.test(prompt)) return pick(/^ΣM about A = 0/);
    if ((m = prompt.match(/at or below yield ÷ ([\d.]+)\. What does this mean/))) return pick(new RegExp(`^FoS = yield ÷ stress must be at least ${m[1].replace('.', '\\.')}$`));
    if ((m = prompt.match(/Rod B has (\d+) times/))) return pick(new RegExp(`^B has 1/${m[1]} of`));
    if (/Then the load doubles/.test(prompt)) return pick(/past yield/);
    return solveMoment(prompt, options.map(o => o.trim()));
  }
  // equilibrium: ΣM about the pivot or the pin
  if ((m = prompt.match(/The load presses ([\d,]+) N on it (\d+) mm from the pivot; you push down (\d+) mm from the pivot/))) { const [W, a, b] = m.slice(1).map(n); return num(W * a / b, 'N'); }
  if ((m = prompt.match(/A crane arm ([\d,]+) mm long is pinned to a mast\. A tie rod runs from the arm’s tip to the mast ([\d,]+) mm above the pin\. A (\d+) kg load hangs at the tip.*g = ([\d.]+)/))) {
    const [L, h, kg, g] = m.slice(1).map(n); return num(kg * g * L / (L * h / Math.hypot(L, h)), 'N');   // T × (lever arm of the tie) = W × L
  }
  if ((m = prompt.match(/^Solve for R: R × ([\d,]+) − ([\d,]+) × ([\d,]+) = 0/))) { const [L, P, a] = m.slice(1).map(n); return num(P * a / L, 'N'); }
  // a pin–roller beam under a sloping load: the roller cannot push sideways, so the pin takes F cos θ
  if ((m = prompt.match(/A ([\d,]+) N force pushes down on it [\d.]+ m from A, sloping at (\d+)° to the beam\. What horizontal force does the pin at A carry/))) return num(n(m[1]) * Math.cos(rad(n(m[2]))), 'N');
  // stress, yield and factor of safety
  const STAND = /bolts (\d+) mm apart, a ([\d,]+) N machine (\d+) mm from the left bolt\), the support is an? (?:steel|aluminium) bar (\d+) mm wide and (\d+) mm deep \(h vertical; E = ([\d,]+) MPa, yield (\d+) MPa\)/;
  if ((m = prompt.match(STAND))) {
    const [L, P, a, b, h, , Y] = m.slice(1).map(n), s = P * a * (L - a) / L * (h / 2) / (b * h ** 3 / 12);   // σ = M·c/I under the machine
    if (/up to yield/.test(prompt)) return num(P * Y / s, 'N');
    if (/factor of safety/.test(prompt)) return num(Y / s, '');
  }
  if ((m = prompt.match(/yield (\d+) MPa\) works at a stress of (\d+) MPa/))) return num(n(m[1]) / n(m[2]), '');
  if ((m = prompt.match(/yield (\d+) MPa\) must have a factor of safety of ([\d.]+) against yield\. What is the largest working stress/))) return num(n(m[1]) / n(m[2]), 'MPa');
  if ((m = prompt.match(/cross-section of (\d+) mm² \(E = [\d,]+ MPa, yield (\d+) MPa\)\. At what pull does it reach yield, in kN/))) return num(n(m[1]) * n(m[2]) / 1000, 'kN');
  if ((m = prompt.match(/has E = ([\d,]+) MPa, yield (\d+) MPa\. What is the largest strain it can take and still be elastic/))) return num(n(m[2]) / n(m[1]) * 1e6, 'µε');
  if ((m = prompt.match(/A flat steel bar (\d+) mm wide and (\d+) mm thick is pulled along its length with ([\d,]+) kN/))) return num(n(m[3]) * 1000 / (n(m[1]) * n(m[2])), 'MPa');
  if ((m = prompt.match(/A solid rectangular bar (\d+) mm wide and (\d+) mm deep \(h vertical\) carries a bending moment of ([\d,]+) N·m/))) {
    const [b, h, M] = m.slice(1).map(n); return num(M * 1000 * (h / 2) / (b * h ** 3 / 12), 'MPa');
  }
  if ((m = prompt.match(/A (\d+) mm diameter steel bolt holds a bracket up with a pull of ([\d,]+) N/))) return num(n(m[2]) / (Math.PI * n(m[1]) ** 2 / 4), 'MPa');
  return solveMoment(prompt, []);
}
