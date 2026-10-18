// compose-lib.mjs — the structural composer. A rule's container (pySteps, pyProperties, …) holds
// repeatable, TYPED items (an activity step's method, a transform action's type). We learn a
// CATALOG of item types from the examples, let Jev SELECT which the goal needs, and code emits
// them. Jev chooses; code constructs. No generation.
import { systemOne, resolveApiKey } from "../../lib/jev-lib.mjs";

async function jev({ state, questions }) {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("TYPESAFE_API_KEY not set");
  return systemOne({ apiKey, state, questions });
}

// the item key that "names" the type — the string field with the most (but not too many) distinct
// short values across the items (e.g. pyStepsActivityName for steps, pyActionName for transforms).
export function pickDiscriminator(items) {
  const keys = new Set();
  for (const it of items || []) for (const k of Object.keys(it || {})) keys.add(k);
  let best = null, bestN = 0;
  for (const k of keys) {
    const vals = [...new Set((items || []).map(it => it[k]).filter(v => typeof v === "string" && v.length > 0 && v.length <= 40))];
    if (vals.length >= 2 && vals.length <= 20 && vals.length > bestN) { best = k; bestN = vals.length; }
  }
  return best;
}

// compose a container from the goal: catalog by discriminator → Jev selects the types the goal
// needs (one noul each) → emit those items (deep-copied from the example templates).
export async function composeContainer(goal, items, { discriminator, jevFn = jev, threshold = 0.5 } = {}) {
  const disc = discriminator || pickDiscriminator(items);
  if (!disc) return [];
  const catalog = new Map();
  for (const it of items || []) { const v = it?.[disc]; if (typeof v === "string" && v && !catalog.has(v)) catalog.set(v, it); }
  const names = [...catalog.keys()];
  if (!names.length) return [];
  const questions = {};
  names.forEach((n, i) => { questions[`sel_${i}`] = { type: "noul", instructions: `Does the build goal (in the state) require a "${n}" entry/step in this rule? Consider every clause of the goal; answer true only if it applies.` }; });
  let answers = {};
  try { const r = await jevFn({ state: { goal }, questions }); answers = r.answers || {}; } catch { return []; }
  const out = [];
  names.forEach((n, i) => { const p = answers[`sel_${i}`]?.noul; if (typeof p === "number" && p >= threshold) out.push(JSON.parse(JSON.stringify(catalog.get(n)))); });
  return out;
}
