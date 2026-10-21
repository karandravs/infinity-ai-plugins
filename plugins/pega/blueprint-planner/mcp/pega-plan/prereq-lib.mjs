// prereq-lib.mjs — STRUCTURAL prerequisites: what a rule genuinely cannot be authored without.
//
// This is deliberately NOT the skills-graph. The graph's REQUIRES edges are a relatedness/reading
// relation, and as a prerequisite source they are wrong in BOTH directions:
//   * the graph's only inbound edge to obj-class comes from ui-view — a view needs a class as part
//     of building a view, which tells you nothing about case types needing one — and there is no
//     obj-casetype → obj-class edge at all, although a case type cannot exist without its class;
//   * conversely ui-view claims to need a class when what it actually needs is the case type.
// Using them as prerequisites invented steps and missed real ones, so the graph is kept for
// PRESENTATION ORDER only (graph-lib.mjs `requireOrder` — reading order, not authoring order) and
// the domain facts live here.
//
// ONE LEVEL ONLY: resolvePrereqs returns the DIRECT prerequisites of what it was given. A caller
// that needs second-order prerequisites must re-resolve over the returned `steps` itself — this
// module never walks the chain, so an answer stays auditable and a cycle cannot loop.
// structuralClosure is the same fact read both ways (what a family needs AND what needs it), which is
// how the answer assembly tells a dependency apart from a competing candidate.
//
// Pure: no imports, no corpus read, no graph load. The table is the whole declaration; a family
// without an entry needs nothing (never invent edges to look helpful).

// family → what it needs. `needs` are authorable rule families that become STEPS (the corpus has a
// schema + an example for them). `mustExist` are application artefacts this planner cannot author:
// they are reported as INPUTS the caller must supply.
export const STRUCTURAL_PREREQS = {
  // a case type is defined ON a class: without the class there is nowhere to put pyStages/pyProcesses
  "obj-casetype": { needs: ["obj-class"], mustExist: ["flow"] },
  // a view renders the case type's fields; the case type defines them
  "ui-view": { needs: ["obj-casetype"], mustExist: [] },
  // a data page whose source is a connector has to name one that exists
  "declare-pages": { needs: ["connect-rest"], mustExist: [] },
  // a flow action is a step INSIDE a flow (the graph has this edge backwards)
  "obj-flowaction": { needs: ["obj-flow"], mustExist: [] },
  // a case-level test runs a case type through its stages
  "test-unit-case": { needs: ["obj-casetype"], mustExist: [] },
  "test-application-case": { needs: ["obj-casetype"], mustExist: [] },
  "test-application-businessaction": { needs: ["obj-casetype"], mustExist: [] },
};

// Why a `mustExist` artefact is not a step. Without this the caller gets a bare name and cannot act.
const MUST_EXIST_WHY = {
  flow:
    "a case type attaches its stages to a flow that must already exist in the application — the case-type rule references it rather than authoring it, so it is an input, not a step",
};

// A `mustExist` artefact is also supplied by planning the family that AUTHORS it: a plan that
// includes obj-flow creates the stage flow, so the caller does not owe it as an input.
const ARTEFACT_ALIASES = { flow: ["obj-flow"] };
const isSupplied = (name, present) => present.has(name) || (ARTEFACT_ALIASES[name] || []).some((a) => present.has(a));

const whyFor = (name) =>
  MUST_EXIST_WHY[name] || `the rule references "${name}", which must already exist in the application — this planner cannot author it`;

// family names arrive bare ("obj-casetype") from routing/verdict evidence and graph-prefixed
// ("rules-rule-obj-casetype") from the corpus. The table is keyed bare; accept both. `mustExist`
// goes through the same normaliser so a prefixed artefact name cannot dodge the already-present check.
const bareName = (f) => String(f ?? "").trim().replace(/^rules-rule-/, "");

// Resolve ONE level of structural prerequisites for a set of families (see the header: one level
// only — re-resolve over `steps` for second-order prerequisites).
// Returns { steps, inputs }: both arrays are sorted (deterministic, independent of input order),
// deduped, and never include a family that is already in the input. Steps are not expanded again,
// so the caller sees exactly the direct prerequisites of what it asked about.
export function resolvePrereqs(families) {
  if (!Array.isArray(families)) throw new TypeError(`resolvePrereqs(families): expected an array of family names, got ${families === null ? "null" : typeof families}`);
  const present = new Set(families.map(bareName).filter(Boolean));
  const steps = new Set();
  const inputs = new Map();
  // walk in sorted order so two answers can never differ by input order
  for (const fam of [...present].sort()) {
    const entry = STRUCTURAL_PREREQS[fam];
    if (!entry) continue;
    for (const n of entry.needs || []) {
      const p = bareName(n);
      if (p && p !== fam && !present.has(p)) steps.add(p);
    }
    for (const n of entry.mustExist || []) {
      const p = bareName(n);
      if (p && !isSupplied(p, present) && !inputs.has(p)) inputs.set(p, whyFor(p));
    }
  }
  return {
    steps: [...steps].sort(),
    inputs: [...inputs].map(([name, why]) => ({ name, why })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}

// The COMPLEMENTS of one family: itself, what it NEEDS, and what NEEDS IT — one level each way, from
// the same table (no walk, so no cycle and nothing invented). A caller uses this to tell a dependency
// apart from a COMPETITOR: two families in one closure are parts of a single answer, so a near-cutoff
// score on one is not a disagreement about WHAT to build. A `mustExist` artefact is not a family and
// never enters the closure. Returns bare names, the input family included; an unknown (or blank)
// family closes over itself (or nothing), never over invented edges.
export function structuralClosure(family) {
  const self = bareName(family);
  if (!self) return new Set();
  const out = new Set([self]);
  for (const need of STRUCTURAL_PREREQS[self]?.needs || []) {
    const p = bareName(need);
    if (p && p !== self) out.add(p);
  }
  for (const [fam, entry] of Object.entries(STRUCTURAL_PREREQS)) {
    if (fam === self) continue;
    if ((entry.needs || []).some((n) => bareName(n) === self)) out.add(fam);
  }
  return new Set([...out].sort());
}
