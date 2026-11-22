// School mathematics nodes that the engineering journeys rest on. Ids, titles and the one direct edge kept here are
// the school engine's (premsethutmc/openpath main 62b17d3f, content/mathematics/curriculum.v1.json); the full school
// chain below each node lives in the school engine, which is where a gap here is taught (learnUrl is set later).
// `requires` holds only direct school edges between nodes listed in this file; an indirect school edge is `support`.
const school = (id, title, grade, requires, items, support = []) => ({ id, title, grade, requires, support, items, school: true, learnUrl: null });

export const NODES = [
  school('MATH.measurement.unit-conversions', 'Convert common metric units', 4, [], 'math.units'),
  school('MATH.measurement.rectangle-area', 'Calculate rectangle area', 5, ['MATH.measurement.unit-conversions'], 'math.area'),
  school('MATH.number.exponents', 'Use integer exponent laws', 7, [], 'math.powers'),
  school('MATH.algebra.linear-equations', 'Solve linear equations', 7, [], 'math.linear'),
  school('MATH.algebra.inverse-proportion', 'Solve inverse proportion problems', 8, [], 'math.inverse'),
  school('MATH.algebra.linear-systems', 'Solve pairs of linear equations', 10, [], 'math.pair', ['MATH.algebra.linear-equations']),
  school('MATH.trigonometry.ratios', 'Use trigonometric ratios', 10, [], 'math.trig-ratios'),
  school('MATH.trigonometry.functions', 'Use trigonometric functions and identities', 11, [], 'math.trig', ['MATH.trigonometry.ratios']),
  school('MATH.vectors.algebra', 'Operate on vectors', 12, [], 'math.vectors'),
  school('MATH.vectors.products', 'Use dot and cross products', 12, ['MATH.vectors.algebra'], 'math.cross'),
];
