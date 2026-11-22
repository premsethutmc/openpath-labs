// Rolling-bearing basic rating life (ISO 281; Shigley 10th ed. eq. 11-1/11-3):
//   L10 = (C / P)^a  million revolutions,  a = 3 for ball bearings, 10/3 for roller bearings;
//   L10h = L10·10⁶ / (60·n) hours at n rpm.
// C = basic dynamic load rating (from the bearing catalogue, entered by the learner); P = equivalent dynamic load.
// Here P is the radial reaction only (no axial load, no application or reliability adjustment factors a1, aISO):
// 90 % of a large group of identical bearings reach this life.
export const EXPONENT = { ball: 3, roller: 10 / 3 };
export function ratingLife({ C, P, type = 'ball', rpm }) {
  const a = EXPONENT[type]; if (!a) throw new Error('bearing type must be ball or roller');
  const L10 = P > 0 ? (C / P) ** a : Infinity;          // million revolutions
  return { L10, hours: L10 * 1e6 / (60 * rpm), exponent: a };
}
