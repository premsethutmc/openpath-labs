// Item generators for stress, strain, Hooke's law, yield and factor of safety (content/graph/solids.mjs; Journey 3,
// "Stiff enough, not just strong"). Deterministic in seed (core/rng.mjs). Every number item states all its givens in the
// prompt, so it can be answered from the visible text alone.
// key 'engine': the answer comes from the Mount bench's own model (mount/model.mjs stand, which runs the Solids engine);
// tests/stiffness-content.test.mjs re-runs the stand from the item's params and checks a hand calculation.
// key 'formula': checked there against an independent hand calculation.
// Units: N, kN, mm, MPa (N/mm²), µε. A factor of safety has no unit (unit '').
// The linear model (σ = E·ε) holds only below yield: no item asks what happens after yield.
import { rng } from '../../core/rng.mjs';
import { numberItem, choiceItem, fmt } from './school-math.mjs';
import { MATERIALS } from '../../core/materials.mjs';
import { stand, SPEC } from '../../mount/model.mjs';

const R = (v, n = 4) => +v.toPrecision(n);
const MAT = { steel: MATERIALS.steel, aluminium: MATERIALS.aluminium };
const word = id => (id === 'steel' ? 'steel' : 'aluminium');
const an = id => (id === 'steel' ? 'a steel' : 'an aluminium'), A_ = id => (id === 'steel' ? 'A steel' : 'An aluminium');
const props = id => `E = ${fmt(MAT[id].E)} MPa, yield ${MAT[id].yield} MPa`;
const g = (id, competency, aspects, make) => [id, { competency, aspects, make: (seed, aspect = aspects[0]) => make(rng(`${id}:${aspect}:${seed}`), { gen: id, seed, aspect: aspects.includes(aspect) ? aspect : aspects[0], competency }) }];
// The Mount stand, as the bench's model runs it: a solid rectangular bar, machine at `a` mm from the left bolt.
const standCase = r => {
  const material = r.pick(['steel', 'aluminium']), b = r.int(6, 10) * 5, h = r.int(6, 16) * 5, a = r.int(2, 10) * 50;
  const st = stand({ material, shape: 'rect', b, h }, { mount: a, loaded: true }), at = st.at(a);
  return { material, b, h, a, st, stress: at.stress, strain: at.strain, M: at.moment, I: st.section.I, c: st.section.c,
    where: `On the mount test stand (bolts ${SPEC.span} mm apart, a ${fmt(SPEC.load)} N machine ${a} mm from the left bolt), the support is ${an(material)} bar ${b} mm wide and ${h} mm deep (h vertical; ${props(material)}).` };
};
const standSteps = c => [`M under the machine = P·a·(L − a)/L = ${fmt(SPEC.load)} × ${c.a} × ${SPEC.span - c.a} / ${SPEC.span} = ${fmt(c.M)} N·mm.`,
  `I = b·h³/12 = ${fmt(c.I)} mm⁴, c = h/2 = ${c.c} mm, so σ = M·c/I = ${R(c.stress)} MPa.`];

export const GENERATORS = Object.fromEntries([
  // ---- normal stress ----
  g('solids.normal-stress', 'ENG.solids.normal-stress', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const k = r.pick([2, 3, 4]), F = r.int(4, 40) * 250;
      return choiceItem({ ...base, prompt: `Two steel tie rods each carry a pull of ${fmt(F)} N. Rod B has ${k} times the cross-sectional area of rod A. How does the stress in B compare with the stress in A?`,
        options: [{ text: `B has 1/${k} of A’s stress`, correct: true }, { text: 'The same: they carry the same force', misconception: { id: 'force-not-stress', label: 'took force for stress (stress is force per area)' } },
          { text: `B has ${k} times A’s stress`, misconception: { id: 'area-direct', label: 'made stress grow with area' } }, { text: `B has 1/${k * k} of A’s stress`, misconception: { id: 'area-squared', label: 'squared the area ratio' } }],
        solution: ['σ = F / A.', `Same F, ${k}× the area: σ_B = σ_A / ${k}.`] });
    }
    if (base.aspect === 'procedure') {
      if (r.next() < 0.5) {   // axial
        const b = r.int(4, 10) * 5, t = r.int(2, 8) * 2, A = b * t, F = r.int(2, Math.floor(0.6 * MAT.steel.yield * A / 2000)) * 2, s = F * 1000 / A;   // σ ≤ 0.6 × yield
        return numberItem({ ...base, params: { case: 'axial', b, t, F }, prompt: `A flat steel bar ${b} mm wide and ${t} mm thick is pulled along its length with ${F} kN. What is the tensile stress in it, in MPa?`,
          value: s, unit: 'MPa', misconceptions: [{ id: 'kn-not-converted', value: F / A, label: 'left the force in kN (1 kN = 1,000 N)' }, { id: 'pa-for-mpa', value: s * 1e6, label: 'gave the value in Pa but called it MPa (1 MPa = 1,000,000 Pa)' },
            { id: 'perimeter', value: F * 1000 / (2 * (b + t)), label: 'divided by the perimeter, not the area' }],
          solution: [`A = b × t = ${b} × ${t} = ${fmt(A)} mm².`, `σ = F / A = ${fmt(F * 1000)} N / ${fmt(A)} mm² = ${R(s)} MPa (N/mm² = MPa).`] });
      }
      const b = r.int(4, 10) * 5, h = r.int(6, 16) * 5, I = b * h ** 3 / 12, M = r.int(2, Math.floor(0.6 * MAT.steel.yield * I / (h / 2) / 50000)) * 50, s = M * 1000 * (h / 2) / I;   // M in N·m; σ ≤ 0.6 × yield
      return numberItem({ ...base, params: { case: 'bending', b, h, M }, prompt: `A solid rectangular bar ${b} mm wide and ${h} mm deep (h vertical) carries a bending moment of ${fmt(M)} N·m. What is the largest bending stress in it, in MPa?`,
        value: s, unit: 'MPa', misconceptions: [{ id: 'c-full-depth', value: 2 * s, label: 'used the full depth h as c (c = h/2)' }, { id: 'nm-not-converted', value: s / 1000, label: 'left the moment in N·m with lengths in mm' },
          { id: 'pa-for-mpa', value: s * 1e6, label: 'gave the value in Pa but called it MPa' }],
        solution: [`M = ${fmt(M)} N·m = ${fmt(M * 1000)} N·mm.`, `I = b·h³/12 = ${fmt(I)} mm⁴, c = h/2 = ${h / 2} mm.`, `σ = M·c/I = ${R(s)} MPa.`] });
    }
    const d = r.int(4, 12) * 2, A = Math.PI * d * d / 4, F = r.int(4, Math.floor(0.6 * MAT.steel.yield * A / 250)) * 250, s = F / A;   // σ ≤ 0.6 × yield
    return numberItem({ ...base, params: { d, F }, prompt: `A ${d} mm diameter steel bolt holds a bracket up with a pull of ${fmt(F)} N along its axis. What is the tensile stress in the bolt, in MPa? (Area of a circle = π·d²/4.)`,
      value: s, unit: 'MPa', misconceptions: [{ id: 'radius-as-diameter', value: F / (Math.PI * d * d), label: 'used π·d² (the diameter as the radius)' }, { id: 'no-pi', value: F / (d * d), label: 'used d² as the area' },
        { id: 'pa-for-mpa', value: s * 1e6, label: 'gave the value in Pa but called it MPa' }],
      solution: [`A = π·d²/4 = π × ${d}² / 4 = ${R(A)} mm².`, `σ = F / A = ${fmt(F)} / ${R(A)} = ${R(s)} MPa.`] });
  }),

  // ---- strain ----
  g('solids.strain', 'ENG.solids.strain', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const p = r.pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5]);
      return choiceItem({ ...base, prompt: `A test bar is stretched to a strain of ${p} %. Which of these is the same strain?`,
        options: [{ text: `${R(p / 100)} (= ${fmt(R(p * 1e4))} µε)`, correct: true }, { text: `${p} (no unit)`, misconception: { id: 'percent-as-absolute', label: 'read a strain in % as a plain number' } },
          { text: `${R(p / 10)} (= ${fmt(R(p * 1e5))} µε)`, misconception: { id: 'percent-factor', label: 'divided by 10 instead of 100' } },
          { text: `${fmt(R(p * 100))} µε`, misconception: { id: 'micro-factor', label: 'multiplied by 100 to get µε (1 µε = 0.000001)' } }],
        solution: ['Strain has no unit: ε = ΔL / L.', `${p} % = ${p} / 100 = ${R(p / 100)}, and 1 µε = 0.000001, so ${R(p / 100)} = ${fmt(R(p * 1e4))} µε.`] });
    }
    if (base.aspect === 'procedure') {
      const L = r.int(2, 20) * 100, dL = r.int(5, 90) / 100, e = dL / L;
      return numberItem({ ...base, params: { L, dL }, prompt: `A bar ${fmt(L)} mm long stretches by ${dL} mm under load. What is its strain, in µε (microstrain)?`,
        value: e * 1e6, unit: 'µε', misconceptions: [{ id: 'percent-as-micro', value: e * 100, label: 'gave the strain in % but called it µε' }, { id: 'absolute-as-micro', value: e, label: 'gave the plain ratio ΔL/L but called it µε' },
          { id: 'inverted', value: L / dL, label: 'divided L by ΔL' }],
        solution: [`ε = ΔL / L = ${dL} / ${fmt(L)} = ${R(e)}.`, `In microstrain: × 1,000,000 = ${R(e * 1e6)} µε.`] });
    }
    const s = r.int(4, 60) * 25, L = r.int(2, 12) * 50, dL = s * 1e-6 * L;
    return numberItem({ ...base, params: { s, L }, prompt: `A strain gauge on the bottom face of a support reads ${fmt(s)} µε. Taking the strain as the same along a ${L} mm stretch of that face, how much longer has that stretch become, in mm?`,
      value: dL, unit: 'mm', minTol: 0.00005, misconceptions: [{ id: 'micro-as-milli', value: s * 1e-3 * L, label: 'took µε as thousandths (1 µε = 0.000001)' }, { id: 'percent-as-micro', value: s / 100 * L, label: 'read the µε number as a percentage' },
        { id: 'divided', value: s * 1e-6 / L, label: 'divided by the length instead of multiplying' }],
      solution: [`ε = ${fmt(s)} µε = ${R(s * 1e-6)}.`, `ΔL = ε × L = ${R(s * 1e-6)} × ${L} = ${R(dL)} mm.`] });
  }),

  // ---- Hooke's law ----
  g('solids.hooke', 'ENG.solids.hookes-law', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const s = r.int(4, 12) * 10;
      return choiceItem({ ...base, prompt: `A steel bar (${props('steel')}) and an aluminium bar (${props('aluminium')}) are both loaded to a stress of ${s} MPa, below yield. Which one has the larger strain?`,
        options: [{ text: 'The aluminium bar: ε = σ / E, and its E is about 2.9× smaller', correct: true }, { text: 'The steel bar: the larger E, the larger the strain', misconception: { id: 'direct-e', label: 'made strain grow with E (ε = σ / E)' } },
          { text: 'Both the same: the same stress gives the same strain in any metal', misconception: { id: 'material-ignored', label: 'thought strain depends on stress alone' } },
          { text: 'The steel bar: its yield strength is lower, so it gives more', misconception: { id: 'yield-for-e', label: 'used the yield strength where E belongs' } }],
        solution: ['Below yield, σ = E·ε, so ε = σ / E.', `ε_steel = ${s} / ${fmt(MAT.steel.E)}, ε_aluminium = ${s} / ${fmt(MAT.aluminium.E)}: aluminium strains ${R(MAT.steel.E / MAT.aluminium.E, 3)}× as much.`] });
    }
    const m = r.pick(['steel', 'aluminium']), E = MAT[m].E, Y = MAT[m].yield;
    if (base.aspect === 'procedure') {
      if (r.next() < 0.5) {   // strain gauge → stress
        const s = r.int(1, Math.floor(0.6 * Y / E * 1e6 / 50)) * 50, sig = E * s * 1e-6;
        return numberItem({ ...base, params: { case: 'gauge', material: m, s }, prompt: `A strain gauge on ${an(m)} part (${props(m)}) reads ${fmt(s)} µε. What is the stress there, in MPa?`,
          value: sig, unit: 'MPa', misconceptions: [{ id: 'yield-for-e', value: Y * s * 1e-6, label: 'used the yield strength where E belongs' }, { id: 'micro-dropped', value: E * s, label: 'used the µε number as the strain (1 µε = 0.000001)' },
            { id: 'pa-for-mpa', value: sig * 1e6, label: 'gave the value in Pa but called it MPa' }],
          solution: [`ε = ${fmt(s)} µε = ${R(s * 1e-6)}.`, `σ = E·ε = ${fmt(E)} × ${R(s * 1e-6)} = ${R(sig)} MPa.`] });
      }
      const L = r.int(5, 30) * 100, A = r.int(4, 40) * 10, F = r.int(2, Math.floor(0.6 * Y * A / 500)) * 500, dL = F * L / (A * E);   // σ = F/A ≤ 0.6 × yield
      return numberItem({ ...base, params: { case: 'rod', material: m, L, A, F }, prompt: `${A_(m)} tie rod ${fmt(L)} mm long, with a cross-section of ${A} mm², carries ${fmt(F)} N (${props(m)}). How much does it stretch, in mm?`,
        value: dL, unit: 'mm', minTol: 0.0005, misconceptions: [{ id: 'strain-for-stretch', value: F / (A * E), label: 'stopped at the strain (ΔL = ε × L)' }, { id: 'yield-for-e', value: F * L / (A * Y), label: 'used the yield strength where E belongs' }],
        solution: [`σ = F / A = ${fmt(F)} / ${A} = ${R(F / A)} MPa (below yield, so Hooke’s law holds).`, `ε = σ / E = ${R(F / A)} / ${fmt(E)} = ${R(F / A / E)}.`, `ΔL = ε × L = ${R(dL)} mm.`] });
    }
    const c = standCase(r), mu = c.strain * 1e6;
    return numberItem({ ...base, key: 'engine', params: { material: c.material, b: c.b, h: c.h, a: c.a }, prompt: `${c.where} What will the strain gauge on its bottom face under the machine read, in µε?`,
      value: mu, unit: 'µε', misconceptions: [{ id: 'yield-for-e', value: c.stress / MAT[c.material].yield * 1e6, label: 'divided by the yield strength instead of E' }, { id: 'c-full-depth', value: 2 * mu, label: 'used the full depth h as c (c = h/2)' },
        { id: 'percent-as-micro', value: c.strain * 100, label: 'gave the strain in % but called it µε' }],
      solution: [...standSteps(c), `ε = σ / E = ${R(c.stress)} / ${fmt(MAT[c.material].E)} = ${R(c.strain)} = ${R(mu)} µε.`] });
  }),

  // ---- yield and the elastic limit ----
  g('solids.yield', 'ENG.solids.yield-elastic-limit', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const f = r.pick([0.6, 0.7, 0.8, 0.9]), f2 = R(2 * f);
      return choiceItem({ ...base, prompt: `A steel part works at ${f} × its yield stress under its normal load. Then the load doubles. What can the linear elastic model (σ = E·ε) tell you?`,
        options: [{ text: `It gives ${f2} × yield, which is past yield: the part would yield, and the linear model says nothing reliable beyond that point`, correct: true },
          { text: `The stress becomes ${f2} × yield and the part springs back to its old shape when unloaded, as before`, misconception: { id: 'hooke-beyond-yield', label: 'applied the linear (Hooke’s law) model beyond yield' } },
          { text: `The stress stays at ${f} × yield: it is the same material`, misconception: { id: 'stress-is-material', label: 'took stress as a property of the material, not of the load' } },
          { text: `The part is fine while ${f2} × yield is below E`, misconception: { id: 'e-as-yield', label: 'used E as the strength limit' } }],
        solution: ['Below yield, stress is proportional to load: doubling the load doubles the stress.', `2 × ${f} = ${f2} > 1, so the stress would pass yield. Beyond yield the material deforms permanently and σ = E·ε no longer holds.`] });
    }
    const m = r.pick(['steel', 'aluminium']), E = MAT[m].E, Y = MAT[m].yield;
    if (base.aspect === 'procedure') {
      if (r.next() < 0.5) {
        const A = r.int(5, 80) * 5, F = Y * A / 1000;
        return numberItem({ ...base, params: { case: 'load', material: m, A }, prompt: `${A_(m)} tie rod has a cross-section of ${A} mm² (${props(m)}). At what pull does it reach yield, in kN?`,
          value: F, unit: 'kN', misconceptions: [{ id: 'allowable-for-yield', value: F / 2, label: 'used yield ÷ 2 (the allowable stress), not yield' }, { id: 'e-as-yield', value: E * A / 1000, label: 'used E as the yield strength' },
            { id: 'n-as-kn', value: Y * A, label: 'gave the answer in N but called it kN' }],
          solution: [`At yield σ = ${Y} MPa = ${Y} N/mm².`, `F = σ × A = ${Y} × ${A} = ${fmt(Y * A)} N = ${R(F)} kN.`] });
      }
      return numberItem({ ...base, params: { case: 'strain', material: m }, prompt: `${A_(m)} part has ${props(m)}. What is the largest strain it can take and still be elastic (at yield), in µε?`,
        value: Y / E * 1e6, unit: 'µε', misconceptions: [{ id: 'percent-as-micro', value: Y / E * 100, label: 'gave the strain in % but called it µε' }, { id: 'inverted', value: E / Y, label: 'divided E by the yield strength' }],
        solution: ['Up to yield, σ = E·ε, so ε_yield = yield / E.', `= ${Y} / ${fmt(E)} = ${R(Y / E)} = ${R(Y / E * 1e6)} µε.`] });
    }
    const c = standCase(r), Py = SPEC.load * MAT[c.material].yield / c.stress;
    return numberItem({ ...base, key: 'engine', params: { material: c.material, b: c.b, h: c.h, a: c.a }, prompt: `${c.where} While it stays elastic, its stress is proportional to the machine’s load. What machine load would just bring the stress under the machine up to yield, in N?`,
      value: Py, unit: 'N', misconceptions: [{ id: 'allowable-for-yield', value: Py / 2, label: 'used yield ÷ 2 (the allowable stress), not yield' }, { id: 'inverted', value: SPEC.load * c.stress / MAT[c.material].yield, label: 'multiplied by stress ÷ yield instead of yield ÷ stress' },
        { id: 'e-as-yield', value: SPEC.load * MAT[c.material].E / c.stress, label: 'used E as the yield strength' }],
      solution: [...standSteps(c), `Stress ∝ load up to yield: P_yield = ${fmt(SPEC.load)} × ${MAT[c.material].yield} / ${R(c.stress)} = ${R(Py)} N.`] });
  }),

  // ---- allowable stress and factor of safety ----
  g('solids.fos', 'ENG.solids.factor-of-safety', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const k = r.pick([1.5, 2, 2.5, 3]);
      return choiceItem({ ...base, prompt: `A brief says the stress must stay at or below yield ÷ ${k}. What does this mean for the factor of safety against yield?`,
        options: [{ text: `FoS = yield ÷ stress must be at least ${k}`, correct: true }, { text: `FoS = stress ÷ yield must be at least ${k}`, misconception: { id: 'fos-inverted', label: 'turned the factor of safety upside down (it is yield ÷ working stress)' } },
          { text: `The stress may go up to ${k} × yield`, misconception: { id: 'fos-multiplied', label: 'multiplied the yield strength by the factor instead of dividing' } },
          { text: `The deflection must be at most 1/${k} of its limit`, misconception: { id: 'stiffness-for-strength', label: 'mixed a strength limit with a stiffness limit' } }],
        solution: ['FoS = yield ÷ working stress.', `stress ≤ yield ÷ ${k}  ⇔  yield ÷ stress ≥ ${k}.`] });
    }
    const m = r.pick(['steel', 'aluminium']), E = MAT[m].E, Y = MAT[m].yield;
    if (base.aspect === 'procedure') {
      if (r.next() < 0.5) {
        const s = r.int(20, 160);
        return numberItem({ ...base, params: { case: 'fos', material: m, s }, prompt: `${A_(m)} part (${props(m)}) works at a stress of ${s} MPa. What is its factor of safety against yield? (No unit.)`,
          value: Y / s, unit: '', misconceptions: [{ id: 'fos-inverted', value: s / Y, label: 'turned the factor of safety upside down (it is yield ÷ working stress)' }, { id: 'e-as-yield', value: E / s, label: 'used E as the yield strength' }],
          solution: ['FoS = yield ÷ working stress.', `= ${Y} / ${s} = ${R(Y / s, 3)}.`] });
      }
      const k = r.pick([1.5, 2, 2.5, 3, 4]);
      return numberItem({ ...base, params: { case: 'allowable', material: m, k }, prompt: `${A_(m)} part (${props(m)}) must have a factor of safety of ${k} against yield. What is the largest working stress allowed, in MPa?`,
        value: Y / k, unit: 'MPa', misconceptions: [{ id: 'fos-multiplied', value: Y * k, label: 'multiplied the yield strength by the factor instead of dividing' }, { id: 'e-as-yield', value: E / k, label: 'used E as the yield strength' }],
        solution: ['Allowable stress = yield ÷ FoS.', `= ${Y} / ${k} = ${R(Y / k)} MPa.`] });
    }
    const c = standCase(r), Y2 = MAT[c.material].yield, fos = Y2 / c.stress;
    return numberItem({ ...base, key: 'engine', params: { material: c.material, b: c.b, h: c.h, a: c.a }, prompt: `${c.where} What is its factor of safety against yield under the machine? (No unit.)`,
      value: fos, unit: '', misconceptions: [{ id: 'fos-inverted', value: 1 / fos, label: 'turned the factor of safety upside down (it is yield ÷ working stress)' }, { id: 'allowable-for-yield', value: fos / 2, label: 'divided the allowable stress (yield ÷ 2) by the stress' },
        { id: 'e-as-yield', value: MAT[c.material].E / c.stress, label: 'used E as the yield strength' }],
      solution: [...standSteps(c), `FoS = yield ÷ σ = ${Y2} / ${R(c.stress)} = ${R(fos, 3)}.`] });
  }),

  // ---- stiffness vs strength (the target of Journey 3) ----
  g('solids.stiff-strong', 'ENG.solids.stiffness-vs-strength', ['concept', 'procedure', 'transfer'], (r, base) => {
    if (base.aspect === 'concept') {
      const thing = r.pick(['machine support', 'wall shelf', 'robot arm link', 'conveyor beam']);
      if (r.next() < 0.5) return choiceItem({ ...base, prompt: `A ${thing} passes its strength check with room to spare (its stress is well below yield ÷ 2), but it bends too far under load. Which change is sure to cut its deflection?`,
        options: [{ text: 'Make E·I larger: a material with a higher E, or a deeper section (larger I)', correct: true },
          { text: 'Use an alloy with the same E but a higher yield strength', misconception: { id: 'yield-reduces-deflection', label: 'expected a higher yield strength to reduce deflection' } },
          { text: 'Nothing: a part that is strong enough is stiff enough', misconception: { id: 'stiffness-is-strength', label: 'took strength (yield) and stiffness (E·I) as the same thing' } },
          { text: 'Ask for a lower factor of safety', misconception: { id: 'fos-for-stiffness', label: 'used the factor of safety, a strength margin, to fix stiffness' } }],
        solution: ['Deflection ∝ 1 / (E·I): only E and I set it.', 'Yield strength and the factor of safety set how much stress is allowed; they do not change how far the part bends.'] });
      return choiceItem({ ...base, prompt: `A ${thing} in aluminium bends within its limit, but its stress is above yield ÷ 2. It is remade in steel with the same section (steel’s E is about 2.9× aluminium’s, its yield a little lower). What happens?`,
        options: [{ text: 'The deflection falls about 2.9×, but the stress stays the same: it still fails the strength check', correct: true },
          { text: 'The deflection and the stress both fall about 2.9×', misconception: { id: 'stress-scales-with-e', label: 'expected a stiffer material to lower the stress (stress = M·c/I does not contain E)' } },
          { text: 'The stress falls; the deflection stays the same', misconception: { id: 'stiffness-is-strength', label: 'swapped what E changes and what it leaves alone' } },
          { text: 'Nothing changes: the section is the same', misconception: { id: 'material-ignored', label: 'thought only the shape matters for deflection' } }],
        solution: ['Stress σ = M·c / I depends on the load and the section, not on E.', 'Deflection ∝ 1 / (E·I): steel’s larger E cuts it about 2.9×. The steel yield (250 MPa) is a little lower, so the strength check gets no easier.'] });
    }
    if (base.aspect === 'procedure') {
      if (r.next() < 0.6) {   // same section, other material
        const from = r.pick(['steel', 'aluminium']), to = from === 'steel' ? 'aluminium' : 'steel', d1 = r.int(5, 60) / 100, s1 = r.int(10, 120);
        const [E1, E2, Y1, Y2] = [MAT[from].E, MAT[to].E, MAT[from].yield, MAT[to].yield], ask = r.pick(['deflection', 'stress', 'fos']);
        const head = `${A_(from)} support (${props(from)}) deflects ${d1} mm under the machine, and its stress there is ${s1} MPa. It is remade in ${to} (${props(to)}) with the same section, load and position.`;
        const params = { case: 'material', from, to, d1, s1, ask };
        if (ask === 'deflection') return numberItem({ ...base, params, prompt: `${head} What is the new deflection, in mm?`, value: d1 * E1 / E2, unit: 'mm', minTol: 0.0005,
          misconceptions: [{ id: 'yield-reduces-deflection', value: d1 * Y1 / Y2, label: 'scaled the deflection with the yield strength instead of E' }, { id: 'material-ignored', value: d1, label: 'thought the material does not change the deflection' },
            { id: 'direct-e', value: d1 * E2 / E1, label: 'scaled with E instead of 1/E' }],
          solution: ['δ ∝ 1/(E·I); the section is the same, so δ ∝ 1/E.', `δ₂ = ${d1} × ${fmt(E1)} / ${fmt(E2)} = ${R(d1 * E1 / E2, 3)} mm.`] });
        if (ask === 'stress') return numberItem({ ...base, params, prompt: `${head} What is the new stress under the machine, in MPa?`, value: s1, unit: 'MPa',
          misconceptions: [{ id: 'stress-scales-with-e', value: s1 * E1 / E2, label: 'expected a change of E to change the stress (σ = M·c/I does not contain E)' }, { id: 'stress-direct-e', value: s1 * E2 / E1, label: 'scaled the stress with E' },
            { id: 'stress-scales-with-yield', value: s1 * Y2 / Y1, label: 'scaled the stress with the yield strength' }],
          solution: ['σ = M·c / I: the same load, position and section give the same M, c and I.', `So the stress is unchanged: ${s1} MPa. Only the deflection depends on E.`] });
        return numberItem({ ...base, params, prompt: `${head} What is its new factor of safety against yield? (No unit.)`, value: Y2 / s1, unit: '',
          misconceptions: [{ id: 'fos-inverted', value: s1 / Y2, label: 'turned the factor of safety upside down (it is yield ÷ working stress)' }, { id: 'old-yield', value: Y1 / s1, label: `kept the ${from} yield strength` },
            { id: 'e-as-yield', value: E2 / s1, label: 'used E as the yield strength' }],
          solution: [`The stress is unchanged (σ = M·c/I has no E): ${s1} MPa.`, `FoS = yield ÷ σ = ${Y2} / ${s1} = ${R(Y2 / s1, 3)}.`] });
      }
      // same width and material, deeper (or shallower) solid rectangle
      const m = r.pick(['steel', 'aluminium']), b = r.int(6, 10) * 5, h1 = r.int(6, 12) * 5, h2 = h1 + r.pick([-10, -5, 5, 10, 15, 20]), d1 = r.int(5, 60) / 100, ask = r.pick(['deflection', 'stress']);
      const s1 = r.int(10, Math.floor(Math.min(120, 0.6 * MAT[m].yield * (h2 / h1) ** 2)));   // the new stress stays ≤ 0.6 × yield
      const head = `A solid rectangular ${word(m)} support ${b} mm wide and ${h1} mm deep (h vertical) deflects ${d1} mm under the machine, and its stress there is ${s1} MPa. It is remade ${h2} mm deep, with the same width, material, load and position.`;
      const k = h1 / h2, params = { case: 'depth', material: m, b, h1, h2, d1, s1, ask };
      if (ask === 'deflection') return numberItem({ ...base, params, prompt: `${head} What is the new deflection, in mm?`, value: d1 * k ** 3, unit: 'mm', minTol: 0.0005,
        misconceptions: [{ id: 'strength-rule-for-stiffness', value: d1 * k ** 2, label: 'used the stress rule (∝ 1/h²) for the deflection (∝ 1/I ∝ 1/h³)' }, { id: 'h-linear', value: d1 * k, label: 'scaled with h instead of h³' },
          { id: 'direct', value: d1 / k ** 3, label: 'made a deeper section bend more' }],
        solution: ['δ ∝ 1/(E·I), and I = b·h³/12, so δ ∝ 1/h³.', `δ₂ = ${d1} × (${h1}/${h2})³ = ${R(d1 * k ** 3, 3)} mm.`] });
      return numberItem({ ...base, params, prompt: `${head} What is the new stress under the machine, in MPa?`, value: s1 * k ** 2, unit: 'MPa',
        misconceptions: [{ id: 'stiffness-rule-for-strength', value: s1 * k ** 3, label: 'used the stiffness rule (∝ 1/I ∝ 1/h³) for the stress (∝ c/I ∝ 1/h²)' }, { id: 'h-linear', value: s1 * k, label: 'scaled with h instead of h²' },
          { id: 'unchanged', value: s1, label: 'thought the section does not change the stress' }],
        solution: ['σ = M·c/I with c = h/2 and I = b·h³/12, so σ = 6M/(b·h²) ∝ 1/h².', `σ₂ = ${s1} × (${h1}/${h2})² = ${R(s1 * k ** 2)} MPa.`] });
    }
    // transfer: two tie rods, the same idea in tension
    const A = r.int(4, 40) * 10, L = r.int(5, 30) * 100, F = r.int(2, Math.floor(0.6 * MAT.steel.yield * A / 500)) * 500, s = F / A, ask = r.pick(['stretch', 'stress', 'fos']);
    const head = `Two tie rods of the same size, ${A} mm² in cross-section and ${fmt(L)} mm long, each carry ${fmt(F)} N: one aluminium (${props('aluminium')}), one steel (${props('steel')}).`;
    const params = { A, L, F, ask };
    if (ask === 'stretch') return numberItem({ ...base, params, prompt: `${head} How much does the steel rod stretch, in mm?`, value: F * L / (A * MAT.steel.E), unit: 'mm', minTol: 0.0005,
      misconceptions: [{ id: 'material-ignored', value: F * L / (A * MAT.aluminium.E), label: 'used aluminium’s E for the steel rod' }, { id: 'e-as-yield', value: F * L / (A * MAT.steel.yield), label: 'used the yield strength where E belongs' }],
      solution: [`σ = F / A = ${fmt(F)} / ${A} = ${R(s)} MPa in both rods.`, `ΔL = σ·L / E = ${R(s)} × ${fmt(L)} / ${fmt(MAT.steel.E)} = ${R(F * L / (A * MAT.steel.E), 3)} mm.`] });
    if (ask === 'stress') return numberItem({ ...base, params, prompt: `${head} What is the stress in the steel rod, in MPa?`, value: s, unit: 'MPa',
      misconceptions: [{ id: 'stress-scales-with-e', value: s * MAT.aluminium.E / MAT.steel.E, label: 'expected the stiffer rod to carry less stress' }, { id: 'pa-for-mpa', value: s * 1e6, label: 'gave the value in Pa but called it MPa' }],
      solution: ['σ = F / A: the same force on the same area, whatever the material.', `σ = ${fmt(F)} / ${A} = ${R(s)} MPa.`] });
    return numberItem({ ...base, params, prompt: `${head} What is the steel rod’s factor of safety against yield? (No unit.)`, value: MAT.steel.yield / s, unit: '',
      misconceptions: [{ id: 'fos-inverted', value: s / MAT.steel.yield, label: 'turned the factor of safety upside down (it is yield ÷ working stress)' }, { id: 'wrong-yield', value: MAT.aluminium.yield / s, label: 'used aluminium’s yield strength' },
        { id: 'e-as-yield', value: MAT.steel.E / s, label: 'used E as the yield strength' }],
      solution: [`σ = F / A = ${R(s)} MPa.`, `FoS = yield ÷ σ = ${MAT.steel.yield} / ${R(s)} = ${R(MAT.steel.yield / s, 3)}.`] });
  }),
]);
