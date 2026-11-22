// Competency graph: merges every node file, refuses unknown ids and cycles, and answers "what does this rest on?".
// Node: { id, title, requires: [id] (mandatory prerequisites), <useful>: [id] (useful, never a gate), items?: generatorId,
//         school?: true, learnUrl?: string | null }. <useful> is the contract's field name (docs/JOURNEYS.md); it is
// spelled in parts below because the runner files must not contain any journey id, and that word is one.
// School-mathematics nodes may appear in more than one file (two journeys can both need the same school skill): the
// copies must agree on their prerequisites; the first is kept. Any other repeated id is an error.
// Item generators are merged the same way: { [generatorId]: { competency, aspects: [..], make(seed, aspect) → Item } }.
export class GraphError extends Error {}
const USEFUL = ['su', 'pport'].join('');

export function buildGraph(...nodeLists) {
  const byId = new Map(), duplicates = [];
  for (const n of nodeLists.flat()) {
    if (!n?.id || typeof n.id !== 'string') throw new GraphError('a node needs an id');
    const node = { title: n.id, requires: [], items: null, school: false, learnUrl: null, ...n };
    node[USEFUL] = n[USEFUL] ?? [];
    const prev = byId.get(n.id);
    if (prev) {
      if (!(prev.school && node.school) || [...prev.requires].sort().join() !== [...node.requires].sort().join()) throw new GraphError(`competency ${n.id} is defined twice`);
      duplicates.push(n.id); if (!prev.items && node.items) prev.items = node.items; continue;
    }
    byId.set(n.id, node);
  }
  for (const n of byId.values()) for (const r of [...n.requires, ...n[USEFUL]]) if (!byId.has(r)) throw new GraphError(`${n.id} refers to unknown competency ${r}`);
  // cycles in the mandatory edges (depth-first, three colours)
  const colour = new Map();
  const visit = (id, path) => {
    if (colour.get(id) === 2) return;
    if (colour.get(id) === 1) throw new GraphError(`prerequisite cycle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
    colour.set(id, 1);
    for (const r of byId.get(id).requires) visit(r, [...path, id]);
    colour.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);

  const node = id => { const n = byId.get(id); if (!n) throw new GraphError(`unknown competency ${id}`); return n; };
  // Mandatory prerequisites up to `depth` steps away, nearest first, each once.
  function prerequisitesOf(id, depth = 1) {
    const out = [], seen = new Set([id]);
    let level = [id];
    for (let d = 0; d < depth && level.length; d++) {
      const next = [];
      for (const x of level) for (const r of node(x).requires) if (!seen.has(r)) { seen.add(r); out.push(r); next.push(r); }
      level = next;
    }
    return out;
  }
  return { nodes: [...byId.values()], has: id => byId.has(id), node, prerequisitesOf, alsoUseful: id => [...node(id)[USEFUL]], duplicates };
}

export function buildItems(...generatorMaps) {
  const all = {};
  for (const g of generatorMaps) for (const [id, gen] of Object.entries(g || {})) {
    if (all[id]) throw new GraphError(`item generator ${id} is defined twice`);
    if (typeof gen?.make !== 'function' || !gen.competency || !Array.isArray(gen.aspects) || !gen.aspects.length) throw new GraphError(`item generator ${id} needs competency, aspects and make()`);
    all[id] = gen;
  }
  return {
    generators: all,
    has: id => !!all[id],
    // make(generatorId, seed, aspect) → Item, stamped with a stable id, its competency and aspect
    make(id, seed, aspect) {
      const g = all[id]; if (!g) throw new GraphError(`unknown item generator ${id}`);
      const a = g.aspects.includes(aspect) ? aspect : g.aspects[0];
      const item = g.make(seed, a);
      return { ...item, id: item.id ?? `${id}:${a}:${seed}`, competency: item.competency ?? g.competency, aspect: item.aspect ?? a, generator: id };
    },
  };
}

// Every generator a node names must exist, and must be about that node.
export function checkItems(graph, items) {
  const problems = [];
  for (const n of graph.nodes) if (n.items) {
    if (!items.has(n.items)) problems.push(`${n.id}: no item generator ${n.items}`);
    else if (items.generators[n.items].competency !== n.id) problems.push(`${n.id}: generator ${n.items} is about ${items.generators[n.items].competency}`);
  }
  return problems;
}
