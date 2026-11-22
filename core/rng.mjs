// Seeded pseudo-random numbers for item generators: the same seed always gives the same item, on any device.
// mulberry32 over a 32-bit seed; a string seed is hashed first (FNV-1a), so 'apply:3' and 7 are both valid seeds.
//   rng(seed) → { next() → [0,1), int(a, b) → integer in [a, b] inclusive, pick(arr) → one element }
// No Math.random anywhere: an item is reproducible from its seed alone.
const hash = s => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; };

export function rng(seed = 0) {
  let a = (typeof seed === 'number' && Number.isFinite(seed) ? Math.trunc(seed) : hash(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => {
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new RangeError(`int(${lo}, ${hi}): need integers with lo ≤ hi`);
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const pick = arr => { if (!arr?.length) throw new RangeError('pick() needs a non-empty array'); return arr[Math.floor(next() * arr.length)]; };
  return { next, int, pick };
}
