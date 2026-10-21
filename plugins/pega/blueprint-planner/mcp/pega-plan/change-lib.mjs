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
  validateSchema, blanksFor, corpusVocabulary, goalCapability, goalCapabilityHead, CORPUS,
  resolveUnnamedSor, routeClauses, ROUTE,
} from "./plan-lib.mjs";
import { applyPlatformTruths } from "./preflight-lib.mjs";
import { resolvePrereqs } from "./prereq-lib.mjs";
import { decide, loadRegistry, describeClosest, routedAboveFloor, NEAR_CUTOFF } from "./verdict-lib.mjs";
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

// ---- 1. which capability does a clause NAME? (deterministic; no model call) ----
// decide() needs a capability: it is what the registry is looked up with, and what a `no` is NAMED
// after. Two rules, in order (controller ruling for this task):
//   * a registry alias in the clause → the registry's capability key (decide offers its manual path);
//   * otherwise the clause names a CONCRETE OBJECT when a determiner introduces the head noun
//     ("an email account") or the head noun is in the corpus's declared vocabulary ("an SLA").
// A clause that names no object at all ("make the case fly") passes null → decide says `unsure`.
const DETERMINER_RE = /\b(?:a|an|the|this|that|these|those)\s+([a-z0-9][a-z0-9-]*(?:[\s-]+[a-z0-9][a-z0-9-]*){0,2})\s*$/i;

// Words that END a clause as a bare predicate rather than as the head of the object it names. The
// planner has no part-of-speech tagger, so this closed list is the one lexical fact it uses, and it
// is used in ONE direction only: a phrase whose last word is here is NOT treated as a concrete
// object, so its clause can only reach `unsure` — never `no`. A missing verb therefore costs
// accuracy (a `no` where `unsure` was warranted); it can never turn a real object into a rejection.
const PREDICATE_WORD = new Set([
  "fly", "run", "work", "fail", "succeed", "exist", "happen", "appear", "seem", "look", "sound",
  "feel", "become", "remain", "stay", "live", "die", "grow", "help", "show", "tell", "say", "speak",
  "ask", "answer", "begin", "start", "stop", "end", "finish", "open", "close", "break", "fix",
  "hold", "keep", "give", "take", "put", "send", "move", "walk", "talk", "think", "know", "want",
  "need", "try", "play", "win", "lose", "fight", "sing", "dance", "eat", "sleep", "drink", "cry",
  "laugh", "shine", "burn", "breathe", "rise", "fall", "sit", "stand", "lie", "wear", "drive",
  "ride", "swim", "jump", "climb", "cook", "clean", "wash", "buy", "sell", "pay", "cost", "matter",
  "apply", "belong", "depend", "refer", "match", "fit", "suit", "count", "affect", "cause", "change",
  "turn", "return", "repeat", "continue", "proceed", "follow", "lead", "form", "behave", "respond",
]);

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordIn = (word, text) => new RegExp(`(?<![a-z0-9])${escapeRe(word)}(?![a-z0-9])`, "i").test(text);

// the vocabulary corpusVocabulary() returns is { text, acronyms }; accept the bare text too
const vocabularyText = (vocabulary) => (typeof vocabulary === "string" ? vocabulary : String(vocabulary?.text || ""));
const vocabularyAcronyms = (vocabulary) => (vocabulary && typeof vocabulary === "object" && vocabulary.acronyms instanceof Set ? vocabulary.acronyms : new Set());

// The LONGEST matching alias wins, so a specific "case access" is not shadowed by a generic "access".
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

// → the capability key a clause names, or null when it names none.
export function clauseCapability(clause, { registry = [], vocabulary = "" } = {}) {
  const entry = registryAlias(clause, registry);
  if (entry) return String(entry.capability || "").trim().toLowerCase() || null;
  const phrase = goalCapability(clause); // "an email account" · "the case fly"
  const determiner = phrase.match(DETERMINER_RE);
  if (determiner) {
    const object = determiner[1].trim();
    const head = object.split(/\s+/).pop();
    if (head && !PREDICATE_WORD.has(head.toLowerCase())) return object.toLowerCase();
  }
  const head = goalCapabilityHead(clause);
  if (head && (wordIn(head, vocabularyText(vocabulary)) || vocabularyAcronyms(vocabulary).has(head))) return head;
  return null;
}

// ---- 2. per-family composability — the second piece of evidence decide() reads ----
// hasSchema from the corpus schema, hasExample from the family's examples/*.md. Memoised: one
// readdir per family per process, not per clause.
const _familyEvidence = new Map();
const bareFamily = (f) => String(f ?? "").trim().replace(/^rules-rule-/, "");
const skillFamily = (f) => {
  const s = String(f ?? "").trim();
  return s.startsWith("methodology") ? s : `rules-rule-${bareFamily(s)}`;
};
async function familyEvidence(family) {
  const bare = bareFamily(family);
  if (_familyEvidence.has(bare)) return _familyEvidence.get(bare);
  const skill = skillFamily(bare);
  const schema = await loadSchema(skill);
  const files = await readdir(path.join(CORPUS, "skills", skill, "examples")).catch(() => []);
  const value = { hasSchema: schema.hasSchema === true, hasExample: files.some((f) => f.endsWith(".md")) };
  _familyEvidence.set(bare, value);
  return value;
}

// ---- 3. the honesty channel: every `blanks` kind becomes a readable `unresolved` entry ----
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

// ---- 4. a step's title, derived from the rule's own Pega class (cosmetic only) ----
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

// ---- 5. compose a PREREQUISITE family with the same engine (no routing, no scoring) ----
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

// ---- 6. steps ----
function ruleStep(plan, routed) {
  const family = bareFamily(plan.skill);
  return {
    n: null, // numbered by the caller
    kind: "rule",
    title: titleFor(plan.payload?.pxObjClass, family),
    rule: {
      ruleType: plan.ruleType || family,
      family,
      skill: plan.skill,
      example: plan.sourceExample || null,
      confidence: routed ? routed.score : null,
      margin_to_cutoff: routed ? routed.margin : null,
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
      example: composed.example, confidence: null, margin_to_cutoff: null,
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

// ---- 7. the answer: a deterministic template (no model prose) ----
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

// ---- 8. provenance ----
// corpus_version from the discovered corpus; model from the pinned Jev client; the registry
// (capabilities.json) carries no version field of its own, so its version IS the corpus version.
// `routing_samples` is the number of independent judgment readings behind each routing score: 3 on
// the legacy per-goal path (routeSkills averages that many calls), 1 on the shipped path (routeClauses
// batches every clause × family into ONE call — R15).
// `timing_ms` is the MEASURED cost (R16): routing = the one judgment call, compose = everything
// else (examples, payload composition, gates), total = end to end.
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
// never look like a plan.
function outageAnswer(e, timing_ms = null) {
  const why = `judgment service unavailable: ${String(e?.message || e).slice(0, 300)}`;
  return {
    verdict: "unsure",
    answer: `Not sure yet. Routing could not be scored, so there is no evidence either way. Re-run the question once the judgment service is reachable.`,
    closest: { what: "a working judgment service (retry the question)", why: "routing could not be scored, so this question has no evidence either way" },
    partial: null,
    clauses: [],
    steps: [],
    inputs_required: [],
    caveats: [why],
    looked_at: { families: [], cutoff: null, evidence_absent: [] },
    provenance: provenanceOf({ timing_ms }),
  };
}

// The near-cutoff band the assembly uses to decide what counts as evidence is verdict-lib's own
// NEAR_CUTOFF (imported above): a family within that band below the cutoff is a near-threshold
// signal, and the spec's `no` row excludes exactly that case.

// ---- 9. the answer ----
export async function planPegaChange({ question, contracts_dir, namespace, planFn = planPegaBuild, jevFn } = {}) {
  assertQuestion(question);
  const started = Date.now();

  const registry = loadRegistry();
  const vocabulary = await corpusVocabulary();
  const clauseTexts = splitClauses(question);
  const verb = questionVerb(question);
  // every clause is planned as a GOAL: a fragment inherits the question's verb (see goalForClause)
  const goals = clauseTexts.map((clause) => goalForClause(clause, verb) || clause);

  // A) ONE routing call for the WHOLE question (R15): routeClauses batches every clause × family
  // into a single judgment call. An INJECTED planFn owns its own routing (the offline test seam),
  // so the batch is taken only on the shipped path (planFn === the real planPegaBuild).
  const planned = [];
  let routingMs = 0;
  try {
    let routingByGoal = null;
    if (planFn === planPegaBuild) {
      const tRouting = Date.now();
      // the WHOLE normalised question is the batched call's context (R17): one reading per family,
      // judged against every clause together.
      routingByGoal = await routeClauses(goals, { question: normaliseQuestion(question), ...(jevFn ? { jevFn } : {}) });
      routingMs = Date.now() - tRouting;
    }
    for (let i = 0; i < clauseTexts.length; i++) {
      const clause = clauseTexts[i];
      const goal = goals[i];
      const route = routingByGoal ? routingByGoal.get(goal) : null;
      const plan = await planFn({ query: goal, contracts_dir, namespace, ...(route ? { routing: route } : {}), ...(jevFn ? { jevFn } : {}) });
      const capability = clauseCapability(clause, { registry, vocabulary });
      const seen = Array.isArray(plan?.routing?.routed) ? plan.routing.routed : [];
      const measured = [];
      for (const r of seen) measured.push({ family: bareFamily(r.family), score: r.score, margin: r.margin, cleared: r.cleared !== false, ...(await familyEvidence(r.family)) });
      // WHICH SCORES ARE EVIDENCE (documented, deterministic):
      //   * methodology-* are meta-docs, never candidate plans (they carry no schema/example BY
      //     DESIGN) — using them as evidence of non-authorability would turn every tie with a guide
      //     into `unsure`, so they are reported in `looked_at` and never scored as a candidate;
      //   * R18: a family BELOW the routing floor is not a candidate at all. It is noise the
      //     recall-oriented shortlist kept for context, and jitter around a sub-floor score must not
      //     manufacture `unsure` — that is what makes an honest `no` reachable ("email account");
      //   * a family at/above the floor is evidence; so is one within NEAR_CUTOFF below the CUTOFF
      //     (the spec's `no` row requires "no near-threshold signal") — the latter arrives with a
      //     negative margin, so decide() reads it as near-cutoff, not as a hit;
      //   * and (see below) a clause that names NO capability carries no routing evidence at all.
      const floor = Number.isFinite(plan?.routing?.floor) ? plan.routing.floor : ROUTE.floor;
      const evidence = capability
        ? routedAboveFloor(measured.filter((r) => !r.family.startsWith("methodology") && Number(r.margin) >= -NEAR_CUTOFF), floor)
        : [];
      planned.push({
        clause, goal, plan, capability, seen: measured, routed: evidence, floor,
        cutoff: Number.isFinite(plan?.routing?.cutoff) ? plan.routing.cutoff : null,
      });
    }
  } catch (e) {
    if (isJevError(e)) return outageAnswer(e, { routing: routingMs, compose: Date.now() - started - routingMs, total: Date.now() - started });
    throw e;
  }

  // B) the verdict, from the evidence decide() documents (per clause, worst clause wins).
  const decision = decide(
    planned.map((p) => ({ text: p.clause, capability: p.capability, routed: p.routed, cutoff: p.cutoff, floor: p.floor })),
    registry
  );
  planned.forEach((p, i) => { p.verdict = decision.perClause[i]?.verdict || "unsure"; p.signal = decision.perClause[i]?.signal || null; p.closest = decision.perClause[i]?.closest || null; p.stepNumbers = []; });

  // C) steps, in BUILD order. A step's structural prerequisites are emitted BEFORE it — even when
  // the clause that authors one appears later in the question — then numbering is assigned, so
  // `prerequisites` is always a step number SMALLER than the step itself.
  const steps = [];
  const caveats = [];
  const inputs = new Map();
  for (const p of planned) for (const c of p.plan?.caveats || []) if (!caveats.includes(c)) caveats.push(c);

  const authored = (p) => (p.plan?.plans || []).filter((pl) => pl && pl.payload && String(pl.skill || "").startsWith("rules-rule-"));
  // A STEP SHIPS ONLY WHEN ITS FAMILY IS EVIDENCE FOR THE CLAUSE. planPegaBuild is RECALL-oriented:
  // it composes a plan for whatever the router shortlisted, even when nothing cleared the cutoff —
  // so a clause about case access arrives with a case-type plan. Handing that over as a step would
  // contradict the clause's own verdict (spec §alternative: "part of it is authorable"; a registry
  // hit with `authorable: []` has no authorable part), so steps are filtered to the families the
  // verdict rests on. A `yes` clause always has at least one (the verdict requires it), and the
  // prerequisite steps those families pull in are kept.
  const evidenceOf = (p) => new Set(p.routed.map((r) => r.family));
  const steppable = (p) => authored(p).filter((pl) => evidenceOf(p).has(bareFamily(pl.skill)));

  // one draft per (clause, plan) in the order the question asked for; a registry alternative
  // contributes the manual/config step it stands for.
  const drafts = [];
  for (const p of planned) {
    // ONLY an answered clause ships steps (R18/Important 2): `no` is a rejection, and `unsure` is a
    // question — neither is a plan. Their candidates live in `closest`, so nothing unbuildable is
    // ever handed over as "build these".
    if (p.verdict !== "yes" && p.verdict !== "alternative") continue;
    p.routedByFamily = new Map(p.routed.map((r) => [r.family, r]));
    if (p.signal === "registry") {
      const entry = registry.find((e) => String(e.capability).toLowerCase() === String(p.capability || "").toLowerCase())
        || registry.find((e) => (e.aliases || []).some((a) => String(a).toLowerCase() === String(p.capability || "").toLowerCase()));
      if (entry) drafts.push({ kind: "manual", entry, clause: p.clause, clausePlan: p });
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
    // unlisted prerequisite, which the spec forbids. `visiting` guards a cycle.
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
      ? `prerequisite ${family} composed from the corpus (step ${step.n}) — it is a structural dependency, not routed evidence, so it carries no routing score`
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
    const step = emitted.get(draft.family) || push(ruleStep(draft.plan, plan.routedByFamily.get(draft.family)));
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

  // F) the trail: what was looked at, with the scores the verdict rests on.
  const cutoffs = planned.map((p) => p.cutoff).filter((n) => Number.isFinite(n));
  const clauses = planned.map((p) => ({ text: p.clause, goal: p.goal, verdict: p.verdict, signal: p.signal, capability: p.capability, steps: p.stepNumbers, closest: p.closest }));
  const lookedAt = {
    families: planned.flatMap((p) => p.seen.map((r) => ({
      clause: p.clause,
      family: r.family,
      score: r.score,
      margin: r.margin,
      hasSchema: r.hasSchema,
      hasExample: r.hasExample,
      // false → methodology meta-doc or a candidate below the near-cutoff band: reported, not used
      authoring: !r.family.startsWith("methodology"),
      used: p.routed.some((x) => x.family === r.family),
    }))),
    cutoff: cutoffs.length ? Math.max(...cutoffs) : null,
    evidence_absent: decision.evidenceAbsent,
  };

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
  };
}
