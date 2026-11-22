// Cross-sections. Units: mm. Returns area A (mm²), second moment I (mm⁴) about the bending axis,
// c = distance from neutral axis to the extreme fibre (mm), depth (for drawing).

// spec.count (default 1) models several identical members side by side (e.g. two girders under a deck).
export function section(spec) {
  const n = spec.count || 1;
  if (n > 1) {
    const one = section({ ...spec, count: 1 });
    return { ...one, A: one.A * n, I: one.I * n, label: `${n} × ${one.label}` };
  }
  const { shape } = spec;
  if (shape === 'rect') {
    const { b, h } = spec;
    return { ...spec, A: b * h, I: b * h ** 3 / 12, c: h / 2, depth: h, label: `${b}×${h} mm rectangle` };
  }
  if (shape === 'circle') {
    const { d } = spec;
    return { ...spec, A: Math.PI * d * d / 4, I: Math.PI * d ** 4 / 64, c: d / 2, depth: d, label: `Ø${d} mm solid rod` };
  }
  if (shape === 'tube') {
    const { d, t } = spec, di = d - 2 * t;
    return { ...spec, A: Math.PI * (d * d - di * di) / 4, I: Math.PI * (d ** 4 - di ** 4) / 64, c: d / 2, depth: d, label: `Ø${d}×${t} mm tube` };
  }
  if (shape === 'rhs') {   // rectangular hollow section, uniform wall t, bending about the axis parallel to b
    const { b, h, t } = spec, bi = b - 2 * t, hi = h - 2 * t;
    return { ...spec, A: b * h - bi * hi, I: (b * h ** 3 - bi * hi ** 3) / 12, c: h / 2, depth: h, label: `${b}×${h}×${t} mm hollow` };
  }
  if (shape === 'I') {
    const { h, b, tw, tf } = spec, hw = h - 2 * tf;
    const I = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
    return { ...spec, A: 2 * b * tf + hw * tw, I, c: h / 2, depth: h, label: `I-beam ${h}×${b} mm` };
  }
  throw new Error('Unknown section shape ' + shape);
}

// Same-weight comparison helper: how a section's stiffness and strength compare per kg.
export const efficiency = s => ({ stiffnessPerArea: s.I / s.A, strengthPerArea: s.I / s.c / s.A });
