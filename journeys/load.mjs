// Load a journey and everything it plays on: the bench adapter, the competency graph and the item generators.
// Content comes from the journey's own `content` ({ graph: [loader], items: [loader] }) when it has one, otherwise
// from the shared content catalogue (content/catalog.mjs). A content file that is missing is skipped and reported,
// so one journey's unfinished content never stops another from playing.
import { buildGraph, buildItems, checkItems } from '../core/graph.mjs';

const settle = async loaders => (await Promise.allSettled((loaders || []).map(f => f()))).map((r, i) => (r.status === 'fulfilled' ? { ok: true, mod: r.value } : { ok: false, i, why: String(r.reason?.message ?? r.reason) }));

export async function loadContent(spec, catalog) {
  const src = spec.content ?? catalog ?? (await import('../content/catalog.mjs'));
  const [g, it] = await Promise.all([settle(src.graph ?? src.GRAPH), settle(src.items ?? src.ITEMS)]);
  const skipped = [...g, ...it].filter(r => !r.ok).map(r => r.why);
  const graph = buildGraph(...g.filter(r => r.ok).map(r => r.mod.NODES ?? []));
  const items = buildItems(...it.filter(r => r.ok).map(r => r.mod.GENERATORS ?? {}));
  return { graph, items, skipped, problems: checkItems(graph, items) };
}

export async function loadJourney(spec, catalog) {
  const [adapter, content] = await Promise.all([spec.bench.adapter(), loadContent(spec, catalog)]);
  return { adapter, ...content };
}

// The registry lists journey modules as loaders; one that fails to load is left out of the list.
export async function listJourneys(registry) {
  const mods = await settle(registry);
  return mods.filter(r => r.ok && r.mod?.default?.id).map(r => r.mod.default);
}
