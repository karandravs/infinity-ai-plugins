// graph-lib.mjs — read the corpus skills-graph (nodes/edges/concepts) for routing + build ORDER.
// The manifest gives a flat family list; the graph gives RELATEDNESS (SIMILAR), PREREQUISITES
// (REQUIRES → build order), concept tags, and keywords. We load it, we don't re-derive it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
export const GRAPH = process.env.PEGA_GRAPH || path.join(ROOT, "index/pega-infinity-ai-plugins-resources-26-1/graphs/skills-graph.json");

const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
let _g = null;

export function loadGraph() {
  if (_g) return _g;
  const g = JSON.parse(readFileSync(GRAPH, "utf8"));
  const conceptOf = new Map(); const requiresOf = new Map(); const similarOf = new Map(); const nodeOf = new Map();
  for (const [c, nodes] of Object.entries(g.concepts || {})) for (const n of nodes) add(conceptOf, String(n).split("/")[0], c);
  for (const e of g.edges || []) {
    const s = String(e.source).split("/")[0], t = String(e.target).split("/")[0];
    if (s === t) continue;
    if (e.relation === "REQUIRES") add(requiresOf, s, t);
    else if (String(e.relation).startsWith("SIMILAR")) add(similarOf, s, t);
  }
  for (const n of g.nodes || []) nodeOf.set(n.id, n);
  return (_g = { raw: g, conceptOf, requiresOf, similarOf, nodeOf });
}

const arr = (s) => [...(s || [])].sort();

export function familyProfile(name) {
  const { conceptOf, requiresOf, similarOf, nodeOf } = loadGraph();
  const n = nodeOf.get(name) || {};
  return {
    name,
    concepts: arr(conceptOf.get(name)),
    requires: arr(requiresOf.get(name)),
    similar: arr(similarOf.get(name)),
    keywords: n.keywords || [],
    degree: n.degree ?? 0,
  };
}

// dependency/build order: within `names`, emit prerequisites before dependents (stable, cycle-safe)
export function requireOrder(names) {
  const { requiresOf } = loadGraph();
  const set = new Set(names); const out = []; const done = new Set(); const onStack = new Set();
  const visit = (n) => {
    if (done.has(n) || onStack.has(n)) return;
    onStack.add(n);
    for (const dep of (requiresOf.get(n) || [])) if (set.has(dep)) visit(dep);
    onStack.delete(n); done.add(n); out.push(n);
  };
  for (const n of names) visit(n);
  return out;
}

// related families for expansion: SIMILAR neighbours, then same-concept families ranked by overlap
export function relatedFamilies(name, k = 6) {
  const { similarOf, conceptOf } = loadGraph();
  const out = new Set(similarOf.get(name) || []);
  const mine = conceptOf.get(name) || new Set();
  if (out.size < k) {
    const ranked = [...conceptOf.entries()]
      .map(([f, cs]) => [f, [...cs].filter(x => mine.has(x)).length])
      .filter(([f, n]) => f !== name && n > 0 && !out.has(f))
      .sort((a, b) => b[1] - a[1]);
    for (const [f] of ranked) { if (out.size >= k) break; out.add(f); }
  }
  return [...out].slice(0, k);
}

// expansion: append graph neighbours (SIMILAR, rule families only) of the routed families, capped,
// so a plan doesn't miss companion rules (e.g. a case-type goal also pulls its data/flow parts).
export function expandFamilies(names, { k = 3, cap = 4 } = {}) {
  const extra = [];
  for (const f of names.filter(n => n.startsWith("rules-rule-")))
    for (const r of relatedFamilies(f, k))
      if (r.startsWith("rules-rule-") && !names.includes(r) && !extra.includes(r)) extra.push(r);
  return [...names, ...extra.slice(0, cap)];
}
