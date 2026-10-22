// change-lib.mjs — the shipped answer: one free-text Pega question in, ONE defensible verdict out.
//
// This file is the integration point of the decision layer. Every piece below is already a module
// of its own; this file only routes work between them and assembles the answer:
//   question-lib   normalise a question to a goal, split it into clauses        (pure)
//   plan-lib       route + compose + validate ONE goal (Jev-backed engine)      (the engine)
//   verdict-lib    per-clause evidence → one verdict                            (pure, given evidence)
//   prereq-lib     structural prerequisites → extra steps / `inputs_required`   (pure)
//   preflight-lib  platform-truth fixes                                         (applied by plan-lib)
//   validate-lib   AJV structural gate                                          (delegated by plan-lib)
//
// WHAT THIS FILE ADDS: clause-level evidence (the capability a clause names + which routing scores
// count as evidence for it), step numbering with prerequisites resolved to step numbers, the
// `inputs_required` bill of materials, the deterministic `answer` template, `looked_at` /
// `provenance` trail, and the failure semantics (a Jev outage is an `unsure` ANSWER, never a throw).
//
// It writes nothing and remembers nothing: plans are composed per call, and the result IS the
// answer. `checks` are STRUCTURAL — the authoritative validation of a payload is the Infinity
// Authoring MCP's runtime validator, never this tool.
import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  planPegaBuild, loadSchema, extractCreateRule, pickBestExample, fillForSkill, applySchema,
  validateSchema, blanksFor, resolveUnnamedSor, routingFrom, CORPUS,
} from "./plan-lib.mjs";
import { applyPlatformTruths } from "./preflight-lib.mjs";
import { resolvePrereqs } from "./prereq-lib.mjs";
import { decide, loadRegistry, describeClosest } from "./verdict-lib.mjs";
import { classifyClauses, taxonomySummary } from "./taxonomy-lib.mjs";
import { normaliseHistory, memoryTurn, worthSaving, MEMORY_THRESHOLD } from "./memory-lib.mjs";
import { splitClauses, normaliseQuestion } from "./question-lib.mjs";
import { corpusPaths } from "./corpus-lib.mjs";
import { JEV_MODEL, JevError, JevUnavailable } from "../../lib/jev-lib.mjs";

// The question is STATE, never instructions, and it is capped: a caller cannot smuggle a document
// (or a prompt) through it, and the answer stays a reviewable size. The MCP schema caps it too; the
// check here keeps a direct in-process caller honest.
export const QUESTION_MAX = 2000;

function assertQuestion(question) {
  if (typeof question !== "string")
    throw new TypeError(`planPegaChange: \`question\` must be a string (got ${question === null ? "null" : typeof question})`);
  if (question.length > QUESTION_MAX)
    throw new Error(`planPegaChange: \`question\` is ${question.length} characters — the cap is ${QUESTION_MAX}. Ask one question; split several goals into several calls.`);
  return question;
}

// ---- 0. every clause is a GOAL ----
// A goal statement leads with its verb ("Configure an SLA"); splitting a question can leave a
// fragment ("an SLA", "a CRM lookup", "2 stages"), and a fragment routes far weaker because the
// router is asked about a bare noun phrase: measured, "a CRM lookup" put its best authorable family
// at 0.437–0.450 against the 0.45 floor (margin ≈ 0 → unsure), while "Configure a CRM lookup" clears
// it (0.503–0.523, margin 0.05–0.07). So a fragment inherits the QUESTION's own verb — the goal the
// user actually asked for — and a question that leads with no verb at all gets a neutral one.
// The word boundary in FRAGMENT_LEAD matters: without it "^a" would match "Add" and prefix a goal
// ("Add a UI view…") with a second verb.
const FRAGMENT_LEAD = /^(?:a|an|the|this|that|these|those)\b|^\d/i;
const NEUTRAL_VERB = "configure";
// words that can lead a question but are not its verb (the interrogative/auxiliary closed class):
// if one survives normalisation, the question named no verb and the neutral one stands in.
const NON_VERB_LEAD = new Set([
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
  "is", "are", "am", "was", "were", "do", "does", "did", "can", "could", "should", "would", "will", "must",
]);

// the verb the question itself leads with ("How do I configure an SLA?" → "configure").
export function questionVerb(question) {
  const first = String(normaliseQuestion(question)).split(/\s+/)[0]?.toLowerCase() || "";
  return first && !FRAGMENT_LEAD.test(first) && !NON_VERB_LEAD.has(first) ? first : NEUTRAL_VERB;
}

// the goal a clause is planned as: itself when it already leads with its verb, else verb + clause.
export function goalForClause(clause, verb = NEUTRAL_VERB) {
  const goal = normaliseQuestion(clause) || String(clause ?? "").trim();
  if (!goal || !FRAGMENT_LEAD.test(goal)) return goal;
  // the fragment's own leading capital was only ever sentence case ("An SLA") — the prefixed goal
  // re-cases from the verb, so the fragment must not keep it ("Configure An SLA" reads as a name).
  const prefixed = `${verb} ${goal.charAt(0).toLowerCase()}${goal.slice(1)}`;
  return normaliseQuestion(prefixed) || prefixed;
}

// ---- 1. the registry path a SECURITY clause resolves to (deterministic; no model call) ----
// The verdict no longer extracts a "capability" from the clause: the taxonomy says WHETHER the clause
// is about the `security` concept, and `capabilities.json` says what to do instead. The one lexical
// question left is which registered security surface the clause names ("sso" vs "access"), and the
// clause's own words answer it. The longest matching alias wins, so "case access" is not shadowed by
// a generic "access"; a security clause that names neither falls back to the concept's default
// surface (access groups / roles).
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordIn = (word, text) => new RegExp(`(?<![a-z0-9])${escapeRe(word)}(?![a-z0-9])`, "i").test(text);

function registryAlias(text, registry) {
  const t = String(text ?? "").toLowerCase();
  if (!t) return null;
  let best = null;
  for (const entry of Array.isArray(registry) ? registry : []) {
    for (const alias of Array.isArray(entry?.aliases) ? entry.aliases : []) {
      const a = String(alias || "").trim().toLowerCase();
      if (!a || !wordIn(a, t)) continue;
      if (!best || a.length > best.alias.length) best = { entry, alias: a };
    }
  }
  return best?.entry || null;
}

// → the registry capability a security clause resolves to ("access" when it names no other surface).
export function securityCapability(clause, registry) {
  const named = registryAlias(clause, registry);
  if (named) return String(named.capability || "").trim().toLowerCase() || null;
  return "access";
}

// ---- 2. the honesty channel: every `blanks` kind becomes a readable `unresolved` entry ----
const UNRESOLVED_WHY = {
  reference: "must name an existing rule",
  value: "example text not grounded in the question",
  entries: "array borrowed from the example",
};
// A class placeholder is NOT free text the caller can write anything into: the class must exist in
// the target application (Rule-Obj-Class). When the class was not composed from a supplied
// namespace — i.e. it is the example's — it is reported as a `reference`, not a value.
const CLASS_KEY = /(ClassName|Class)$/;
const classIsExampleDefault = (plan, path) => {
  const top = String(path || "").split(/[.[]/)[0];
  const source = plan?.provenance?.[top]?.source;
  return source !== "namespace";
};
export function unresolvedFor(plan) {
  return (plan?.blanks || []).map((b) => {
    let kind = b.kind || "value";
    let why = b.why || UNRESOLVED_WHY[kind] || "not grounded in the question";
    if (kind === "value" && CLASS_KEY.test(b.path) && classIsExampleDefault(plan, b.path)) {
      kind = "reference";
      why = "must name an existing class";
    }
    const out = { path: b.path, kind, why };
    if (b.example !== undefined) out.example = b.example;
    if (b.count !== undefined) out.count = b.count;
    return out;
  });
}

// family names arrive bare ("obj-casetype") from the taxonomy and prefixed ("rules-rule-obj-casetype")
// from the corpus: one normaliser, so the two can be compared.
const bareFamily = (f) => String(f ?? "").trim().replace(/^rules-rule-/, "");
const skillFamily = (f) => {
  const s = String(f ?? "").trim();
  return s.startsWith("methodology") ? s : `rules-rule-${bareFamily(s)}`;
};

// ---- 3. a step's title, derived from the rule's own Pega class (cosmetic only) ----
// "Rule-Obj-CaseType" → "case type"; "Rule-Connect-REST" → "REST connector". Nothing decides on a
// title; the rule/`source` fields carry the truth.
const CONNECT_NOUN = "connector";
function labelFor(pxObjClass, family) {
  const parts = String(pxObjClass || "").replace(/^Rule-/, "").split("-").filter(Boolean);
  const kind = parts.shift() || "";
  const words = parts.join(" ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  if (!words) return bareFamily(family).replace(/-/g, " ");
  if (kind === "Connect") return `${words === "rest" ? "REST" : words} ${CONNECT_NOUN}`;
  return words;
}
// The title names the ARTEFACT ("Create the REST connector"); the payload carries its rule name and
// `source` carries the family + example, so a name composed from a fragmentary goal never leaks into
// the answer as its headline.
function titleFor(pxObjClass, family) {
  return `Create the ${labelFor(pxObjClass, family)}`;
}

// ---- 4. compose a PREREQUISITE family with the same engine (no routing, no scoring) ----
// A prerequisite is a structural dependency, not routed evidence. It is composed with exactly the
// stages a routed plan goes through — fillForSkill → schema auto-fill → platform-truth pre-flight →
// AJV gate — and only shipped when it comes out CLEAN. A prerequisite that cannot be composed is a
// step with `payload: null` and a caveat: a fabricated payload would be worse than none.
async function composeFamily(family, { namespace } = {}) {
  const skill = skillFamily(family);
  const empty = { payload: null, example: null, schemaIssues: [], preflightIssues: [], unresolved: [] };
  const examples = await extractCreateRule(skill);
  if (!examples.length) return { ...empty, why: "the corpus carries no example payload for it" };
  const schema = await loadSchema(skill);
  if (!schema.hasSchema) return { ...empty, why: "the corpus carries no schema for it" };
  const template = pickBestExample(examples, { requiredManual: schema.requiredManual });
  let payload = fillForSkill(skill, template.payload, { schema });
  applySchema(payload, schema);
  // the same SOR rule as a routed plan: no contract matched a prerequisite either, so an embedded
  // URL is omitted and reported (blank → unresolved, verify-live → checks.preflightIssues).
  const sor = resolveUnnamedSor(payload, {
    hadEmbeddedUrl: "pyEmbeddedURL" in (schema.properties || {}),
    baseUrl: null, // a prerequisite has no contract of its own — the caller names the SOR
    exampleUrl: template.payload?.pyEmbeddedURL?.pyBaseURL || null,
  });
  const preflight = applyPlatformTruths(payload.pxObjClass || (schema.autoFill || {}).pxObjClass, payload, { namespace });
  payload = preflight.payload;
  if (sor) preflight.issues.push(sor.issue);
  const schemaIssues = validateSchema(payload, schema);
  // The omitted SOR is REPORTED (blank + issue) but it is not a reason to withhold the payload: a
  // routed plan ships in the same state, and the caller is told what to supply. Every other
  // required-key / schema failure still makes this prerequisite "not clean".
  const blocking = sor ? schemaIssues.filter((m) => !m.startsWith("pyEmbeddedURL")) : schemaIssues;
  const missing = (schema.requiredManual || []).filter((k) => !(k in payload) && !(sor && k === "pyEmbeddedURL"));
  if (missing.length || blocking.length) {
    return {
      ...empty, example: template.file, schemaIssues, preflightIssues: preflight.issues,
      why: missing.length ? `required keys are missing (${missing.join(", ")})` : `it does not pass the schema gate (${blocking[0]})`,
    };
  }
  // A prerequisite is composed with NO goal: nothing in it came from the question. Its provenance
  // must say so, or `blanksFor` sees no borrowed value and the step reports `unresolved: 0` — a claim
  // that an all-example payload was grounded. Every top-level key that is neither the platform's own
  // auto-fill nor composed from the supplied namespace is `example-default`.
  const provenance = provenanceForComposed(payload, schema, { namespace });
  const blanks = blanksFor({ payload, provenance });
  if (sor) blanks.unshift(sor.blank);
  return {
    payload, example: template.file, schemaIssues, preflightIssues: preflight.issues, provenance,
    unresolved: unresolvedFor({ payload, provenance, blanks }),
  };
}

// The provenance of a payload composed without a goal (a structural prerequisite). Only the keys the
// PLATFORM supplies (`x-pega-autoFill`) or that were composed from the caller's namespace are not the
// example's; everything else is `example-default`, which is what makes it a blank.
function provenanceForComposed(payload, schema, { namespace } = {}) {
  const autoFill = schema.autoFill || {};
  const provenance = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (key in autoFill) { provenance[key] = { value, source: "schema-autofill" }; continue; }
    const fromNamespace = !!namespace && typeof value === "string" && value.startsWith(`${namespace}-`);
    provenance[key] = { value, source: fromNamespace ? "namespace" : "example-default" };
  }
  return provenance;
}

// ---- 5. steps ----
// A step's `rule` carries the CLASSIFICATION it was chosen by: the family's probability and the
// top/second separation of the distribution it won. (The old `margin_to_cutoff` is gone — a taxonomy
// Choice has no cutoff to sit on; `separation` is the ambiguity metric the verdict reads.)
function ruleStep(plan, classification) {
  const family = bareFamily(plan.skill);
  const confidence = classification
    ? Number(classification.familyConfidence ?? classification.familyProbs?.[family] ?? 0)
    : null;
  return {
    n: null, // numbered by the caller
    kind: "rule",
    title: titleFor(plan.payload?.pxObjClass, family),
    rule: {
      ruleType: plan.ruleType || family,
      family,
      skill: plan.skill,
      example: plan.sourceExample || null,
      concept: classification?.concept || null,
      confidence,
      separation: classification ? Number(classification.separation) : null,
    },
    payload: plan.payload,
    provenance: plan.provenance || {},
    checks: { schemaIssues: plan.schemaIssues || [], platformTruthIssues: plan.preflightIssues || [] },
    unresolved: unresolvedFor(plan),
    prerequisites: [],
    source: `${family} / ${plan.sourceExample || "no example"}`,
  };
}

function prereqStep(family, composed) {
  const skill = skillFamily(family);
  return {
    n: null,
    kind: "rule",
    title: titleFor(composed.payload?.pxObjClass, family),
    rule: {
      ruleType: bareFamily(family), family: bareFamily(family), skill,
      example: composed.example, concept: null, confidence: null, separation: null,
    },
    payload: composed.payload,
    provenance: composed.provenance || {},
    checks: { schemaIssues: composed.schemaIssues || [], platformTruthIssues: composed.preflightIssues || [] },
    unresolved: composed.unresolved || [],
    prerequisites: [],
    source: `${bareFamily(family)} / ${composed.example || "no example"} (structural prerequisite)`,
  };
}

// A registry alternative is a step the caller TAKES, not one this tool can author: it ships as a
// step so the ordered plan is complete, with no payload and the registry's own source.
function manualStep(clause, entry) {
  const closest = entry?.closest || {};
  return {
    n: null,
    kind: entry?.kind === "manual" ? "manual" : "config",
    title: String(closest.what || "the supported manual path"),
    rule: null,
    payload: null,
    provenance: {},
    checks: { schemaIssues: [], platformTruthIssues: [] },
    unresolved: [],
    prerequisites: [],
    why: String(closest.why || "this is a supported Pega surface this tool does not author"),
    source: String(closest.source || ""),
    clause: String(clause || ""),
  };
}

// ---- 6. the answer: a deterministic template (no model prose) ----
const VERDICT_HEAD = {
  yes: "Yes.",
  alternative: "Not exactly as asked.",
  no: "No.",
  unsure: "Not sure yet.",
};
const sentence = (text) => {
  const s = String(text || "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
};
function composeAnswer({ verdict, perClause, steps, closest, inputs }) {
  const opinion = closest ? ` ${sentence(describeClosest(closest))}.` : " Every clause maps to authorable rule families.";
  const clauseText = perClause.length > 1
    ? ` Clauses: ${perClause.map((c) => `"${c.text}" → ${c.verdict}${c.steps?.length ? ` (steps ${c.steps.join(", ")})` : ""}`).join("; ")}.`
    : "";
  const stepsText = steps.length
    ? ` ${steps.length} step(s), in order: ${steps.map((s) => `${s.n}. ${s.title}`).join("; ")}.`
    : " No steps to author.";
  const inputText = inputs.length ? ` Inputs required before building: ${inputs.map((i) => i.name).join(", ")}.` : "";
  return `${VERDICT_HEAD[verdict] || "Not sure yet."}${opinion}${clauseText}${stepsText}${inputText}`;
}

// ---- 7. provenance ----
// corpus_version from the discovered corpus; model from the pinned Jev client; the registry
// (capabilities.json) carries no version field of its own, so its version IS the corpus version.
// `routing_samples` is the number of independent judgment readings behind the classification: ONE
// — the taxonomy asks every clause's concept, family and `any` questions in a single request.
// `timing_ms` is the MEASURED cost: routing = that one judgment call, compose = everything else
// (examples, payload composition, gates), total = end to end.
function provenanceOf({ routing_samples = 1, timing_ms = null } = {}) {
  const { version } = corpusPaths();
  return {
    corpus_version: version, model: JEV_MODEL, registry_version: version, routing_samples,
    ...(timing_ms ? { timing_ms } : {}),
  };
}

const isJevError = (e) =>
  e instanceof JevUnavailable || e instanceof JevError || e?.name === "JevUnavailable" || e?.name === "JevError";

// A Jev outage is an ANSWER, not a tool error: the verdict is `unsure` (no evidence either way)
// and the reason is the first caveat. The contract shape is kept, with no steps — an outage must
// never look like a plan. The memory gate never ran, so nothing is worth saving: `worth_saving` is
// false rather than absent, and `turn` records the unanswered request honestly.
function outageAnswer(e, timing_ms = null, { question = null, namespace = null } = {}) {
  const why = `judgment service unavailable: ${String(e?.message || e).slice(0, 300)}`;
  return {
    verdict: "unsure",
    answer: `Not sure yet. The clauses could not be classified, so there is no evidence either way. Re-run the question once the judgment service is reachable.`,
    closest: { what: "a working judgment service (retry the question)", why: "classification could not be scored, so this question has no evidence either way" },
    partial: null,
    clauses: [],
    steps: [],
    inputs_required: [],
    caveats: [why],
    looked_at: {
      clauses: [], taxonomy: taxonomySummary(), evidence_absent: [],
      memory: { remember: null, threshold: MEMORY_THRESHOLD, worth_saving: false },
    },
    provenance: provenanceOf({ timing_ms }),
    memory: { worth_saving: false, turn: memoryTurn({ question, verdict: "unsure", families: [], namespace }) },
  };
}

// ---- 8. the answer ----
// ONE judgment call classifies every clause (taxonomy-lib) — and carries the memory GATE in the same
// request, because it ignores the answer. Everything after it is deterministic: planPegaBuild
// composes the family each clause was classified into (it makes no routing call of its own when
// handed the classification), the structural prerequisite walk (prereq-lib) emits the steps in BUILD
// order, and verdict-lib turns the classification into the verdict.
//
// MEMORY IS THE CALLER'S. `history` (the caller's saved turns, at most HISTORY_MAX of them) is
// injected into the classifier's state, and the answer reports `memory` — what the gate thought of
// THIS question, plus the turn to save. The planner keeps nothing: a caller that wants continuity
// passes the previous `memory.turn` back in `history`.
export async function planPegaChange({ question, contracts_dir, namespace, history, planFn = planPegaBuild, jevFn, classifyFn = classifyClauses } = {}) {
  assertQuestion(question);
  // the caller-owned memory is validated BEFORE any call: a malformed turn is its error, not the
  // model's, and no judgment call should be spent on a request that cannot be answered honestly.
  const earlier = normaliseHistory(history);
  const started = Date.now();

  const registry = loadRegistry();
  const clauseTexts = splitClauses(question);
  const verb = questionVerb(question);
  // Every clause is COMPOSED as a goal (a fragment inherits the question's verb, so the composer gets
  // a goal statement), while the CLASSIFIER is given the clause as the user wrote it: the taxonomy
  // reads what the clause asks for, not the imperative wrapper put around it.
  const goals = clauseTexts.map((clause) => goalForClause(clause, verb) || clause);

  // A) ONE classification call for the WHOLE question. The clauses together are the state, so a bare
  // "an SLA" is judged knowing the dispute case beside it — and the caller's earlier turns ride in
  // that same state, so a follow-up can resolve against them.
  const planned = [];
  let routingMs = 0;
  let remember = null;
  try {
    const tClassification = Date.now();
    const classifications = await classifyFn(clauseTexts, {
      question: normaliseQuestion(question),
      ...(earlier.length ? { history: earlier } : {}),
      ...(jevFn ? { jevFn } : {}),
    });
    routingMs = Date.now() - tClassification;
    // the gate belongs to the QUESTION, so it is read off the classification set, not per clause. A
    // caller-supplied classifier that returns no gate leaves it null — nothing is saved by default.
    remember = (Array.isArray(classifications) ? classifications.remember : classifications?.remember) ?? null;
    for (let i = 0; i < clauseTexts.length; i++) {
      const clause = clauseTexts[i];
      const goal = goals[i];
      const classification = classifications[i] || null;
      const plan = await planFn({
        query: goal, contracts_dir, namespace,
        routing: routingFrom(classification), ...(jevFn ? { jevFn } : {}),
      });
      // the registry is consulted ONLY for a clause the taxonomy put in the security concept
      const capability = classification?.concept === "security" ? securityCapability(clause, registry) : null;
      planned.push({ clause, goal, plan, classification, capability, stepNumbers: [] });
    }
  } catch (e) {
    if (isJevError(e)) return outageAnswer(e, { routing: routingMs, compose: Date.now() - started - routingMs, total: Date.now() - started }, { question, namespace });
    throw e;
  }

  // B) the verdict, from the classification alone (verdict-lib documents the precedence).
  const decision = decide(
    planned.map((p) => ({ text: p.clause, capability: p.capability, classification: p.classification })),
    registry
  );
  planned.forEach((p, i) => {
    p.verdict = decision.perClause[i]?.verdict || "unsure";
    p.signal = decision.perClause[i]?.signal || null;
    p.closest = decision.perClause[i]?.closest || null;
  });

  // C) steps, in BUILD order. A step's structural prerequisites are emitted BEFORE it — even when
  // the clause that authors one appears later in the question — then numbering is assigned, so
  // `prerequisites` is always a step number SMALLER than the step itself.
  const steps = [];
  const caveats = [];
  const inputs = new Map();
  for (const p of planned) for (const c of p.plan?.caveats || []) if (!caveats.includes(c)) caveats.push(c);

  const authored = (p) => (p.plan?.plans || []).filter((pl) => pl && pl.payload && String(pl.skill || "").startsWith("rules-rule-"));
  const chosenFamily = (p) => (p.classification?.family ? bareFamily(p.classification.family) : null);
  // A STEP SHIPS ONLY WHEN ITS FAMILY IS THE ONE THE CLAUSE WAS CLASSIFIED INTO. planPegaBuild is
  // handed that family as its routing, so this is normally the only plan it composes — the filter is
  // the guard that keeps a composed payload from becoming a step the verdict never rested on.
  const steppable = (p) => authored(p).filter((pl) => bareFamily(pl.skill) === chosenFamily(p));

  // one draft per (clause, plan) in the order the question asked for; a registry alternative
  // contributes the manual/config step it stands for.
  const drafts = [];
  for (const p of planned) {
    // ONLY an answered clause ships steps: `no` is a rejection, and `unsure` is a question — neither
    // is a plan. Their candidates live in `closest`, so nothing unbuildable is handed over.
    if (p.verdict !== "yes" && p.verdict !== "alternative") continue;
    if (p.signal === "registry") {
      const entry = registry.find((e) => String(e.capability).toLowerCase() === String(p.capability || "").toLowerCase())
        || registry.find((e) => (e.aliases || []).some((a) => String(a).toLowerCase() === String(p.capability || "").toLowerCase()));
      if (entry) drafts.push({ kind: "manual", entry, clause: p.clause, clausePlan: p });
      // A REGISTRY ALTERNATIVE HAS NO AUTHORABLE PART. The classified family is meaningless for this
      // clause (the corpus authors no access/SSO rule, which is why it is an `alternative`), so a
      // composed payload for it would be a step the verdict never rested on. Only the manual step ships.
      continue;
    }
    for (const pl of steppable(p)) drafts.push({ kind: "rule", family: bareFamily(pl.skill), plan: pl, clause: p.clause, clausePlan: p });
  }
  const ruleDraft = new Map();
  for (const d of drafts) if (d.kind === "rule" && !ruleDraft.has(d.family)) ruleDraft.set(d.family, d);

  const emitted = new Map(); // bare family → step
  const visiting = new Set(); // cycle guard: the prerequisite table is one level, but never loop
  const push = (step) => { steps.push(step); step.n = steps.length; return step; };
  const addInputs = (family) => {
    for (const input of resolvePrereqs([family]).inputs) if (!inputs.has(input.name)) inputs.set(input.name, input);
  };
  const composePrereqStep = async (family) => {
    // A prerequisite's OWN prerequisites are prerequisites too. resolvePrereqs is deliberately ONE
    // level (prereq-lib) so an answer stays auditable, which puts the walk here: without it a
    // `ui-view` question ships a case type with no class and still answers `yes` — a `yes` with an
    // unlisted prerequisite. `visiting` guards a cycle.
    if (visiting.has(family)) return null;
    visiting.add(family);
    for (const sub of resolvePrereqs([family]).steps) {
      if (emitted.has(sub)) continue;
      if (ruleDraft.has(sub)) await emit(ruleDraft.get(sub));
      else await composePrereqStep(sub);
    }
    visiting.delete(family);
    const composed = await composeFamily(family, { namespace });
    const step = push(prereqStep(family, composed));
    emitted.set(family, step);
    addInputs(family);
    caveats.push(composed.payload
      ? `prerequisite ${family} composed from the corpus (step ${step.n}) — it is a structural dependency, not routed evidence, so it carries no classification score`
      : `prerequisite ${family}: no composed payload — ${composed.why} (step ${step.n} is listed so the dependency is visible)`);
    return step;
  };
  const emit = async (draft) => {
    const plan = draft.clausePlan;
    if (draft.kind === "manual") {
      const step = push(manualStep(draft.clause, draft.entry));
      plan.stepNumbers.push(step.n);
      return;
    }
    const already = emitted.get(draft.family);
    if (already) {
      if (!plan.stepNumbers.includes(already.n)) plan.stepNumbers.push(already.n);
      return;
    }
    if (visiting.has(draft.family)) return;
    visiting.add(draft.family);
    for (const family of resolvePrereqs([draft.family]).steps) {
      if (emitted.has(family)) continue;
      // the same family authored by ANOTHER clause is pulled forward, not composed twice
      if (ruleDraft.has(family)) await emit(ruleDraft.get(family));
      else await composePrereqStep(family);
    }
    addInputs(draft.family);
    visiting.delete(draft.family);
    const step = emitted.get(draft.family) || push(ruleStep(draft.plan, plan.classification));
    emitted.set(draft.family, step);
    if (!plan.stepNumbers.includes(step.n)) plan.stepNumbers.push(step.n);
  };
  for (const draft of drafts) await emit(draft);

  // prerequisites → step numbers. Emitted before their dependent step above, so every number is
  // smaller; the filter is a guard, not the ordering mechanism.
  const stepIndex = new Map([...emitted].map(([family, step]) => [family, step.n]));
  for (const step of steps) {
    if (!step.rule) continue;
    step.prerequisites = resolvePrereqs([step.rule.family]).steps
      .map((f) => stepIndex.get(bareFamily(f)))
      .filter((n) => Number.isInteger(n) && n < step.n)
      .sort((a, b) => a - b);
  }

  // The spec's `yes` definition, made structural: every structural prerequisite in the closure of
  // every emitted family is either a STEP or an `inputs_required` entry. The walk above already
  // guarantees it; this pass turns the guarantee into a check, so a family that ever slips through is
  // reported as an input the caller must supply instead of silently missing from the answer.
  const accounted = new Set(emitted.keys());
  const queue = [...accounted];
  while (queue.length) {
    const family = queue.pop();
    for (const need of resolvePrereqs([family]).steps) if (!accounted.has(need)) { accounted.add(need); queue.push(need); }
    for (const input of resolvePrereqs([family]).inputs) if (!inputs.has(input.name)) inputs.set(input.name, input);
  }
  for (const family of accounted) if (!emitted.has(family) && !inputs.has(family))
    inputs.set(family, { name: family, why: "a structural prerequisite of a step above that this planner could not compose — create it first, or name the existing rule" });

  // D) the bill of materials. A class name cannot be invented: when a payload carries an example
  // class and no namespace was supplied, the caller owes us one.
  const carriesExampleClass = (payload) =>
    !!payload && typeof payload === "object"
    && Object.entries(payload).some(([k, v]) => CLASS_KEY.test(k) && typeof v === "string" && v.includes("-"));
  if (!namespace && steps.some((s) => carriesExampleClass(s.payload)))
    inputs.set("namespace", { name: "namespace", why: "class names cannot be invented" });
  const inputsRequired = [...inputs.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // E) the remaining caveats: what a reviewer must check before authoring.
  for (const step of steps) {
    const live = (step.checks?.platformTruthIssues || []).filter((i) => i.kind === "verify-live");
    if (live.length) caveats.push(`step ${step.n} (${step.rule?.ruleType || step.kind}): ${live.length} platform-truth issue(s) can only be resolved against the live application — see checks.platformTruthIssues`);
    if (step.unresolved?.length) caveats.push(`step ${step.n} (${step.rule?.ruleType || step.kind}): ${step.unresolved.length} unresolved element(s) are drafts, not grounded content — see unresolved`);
  }
  // A `yes` whose family could not be composed (the corpus has a schema but no example) must not
  // read as "build this" with nothing to build.
  for (const p of planned) {
    if (p.verdict !== "yes" || p.stepNumbers.length) continue;
    caveats.push(`clause "${p.clause}" was classified into ${chosenFamily(p) || "no family"} but no payload could be composed for it — the corpus has no example to compose from, so there is no step`);
  }

  // F) the trail: the classification the verdict rests on, per clause.
  const clauses = planned.map((p) => ({
    text: p.clause, goal: p.goal, verdict: p.verdict, signal: p.signal,
    concept: p.classification?.concept || null,
    family: p.classification?.family || null,
    steps: p.stepNumbers, closest: p.closest,
  }));
  const lookedAt = {
    clauses: planned.map((p) => ({
      clause: p.clause,
      goal: p.goal,
      concept: p.classification?.concept || null,
      conceptConfidence: p.classification?.conceptConfidence ?? null,
      conceptProbs: p.classification?.conceptProbs || {},
      family: p.classification?.family || null,
      familyProbs: p.classification?.familyProbs || {},
      separation: p.classification?.separation ?? null,
      any: p.classification?.any ?? null,
    })),
    taxonomy: taxonomySummary(),
    evidence_absent: decision.evidenceAbsent,
  };

  // G) the memory. The gate already ran, inside the classification call: this is the cookbook's
  // "save the request plus the answer" step, handed to the caller instead of written down. `turn`
  // mirrors `as_memory()` — the question, the verdict, the families it chose — so passing it back as
  // `history` is enough for the next turn to resolve a reference to it.
  const memory = {
    worth_saving: worthSaving(remember),
    turn: memoryTurn({ question, verdict: decision.verdict, families: clauses.map((c) => c.family), namespace }),
  };
  // the probability the decision was read from, next to the threshold it was read against, so a
  // reviewer can audit a saved (or dropped) memory instead of trusting it.
  lookedAt.memory = { remember, threshold: MEMORY_THRESHOLD, worth_saving: memory.worth_saving };

  return {
    verdict: decision.verdict,
    answer: composeAnswer({ verdict: decision.verdict, perClause: clauses, steps, closest: decision.closest, inputs: inputsRequired }),
    closest: decision.closest,
    partial: decision.partial,
    clauses,
    steps,
    inputs_required: inputsRequired,
    caveats,
    looked_at: lookedAt,
    provenance: provenanceOf({ timing_ms: { routing: routingMs, compose: Date.now() - started - routingMs, total: Date.now() - started } }),
    memory,
  };
}
