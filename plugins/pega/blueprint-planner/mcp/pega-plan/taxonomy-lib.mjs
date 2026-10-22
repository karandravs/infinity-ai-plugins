// taxonomy-lib.mjs — the corpus's two-level authoring taxonomy, classified in ONE judgment call.
//
// The corpus already declares the taxonomy we need, so this module DERIVES it instead of inventing a
// routing vocabulary:
//   level 1 — 14 CONCEPTS (the skills-graph's own concept tags): what KIND of Pega work a clause is.
//   level 2 — 37 rule FAMILIES (manifest `rules-rule-*`): which rule authors it.
//
// WHY A CHOICE, NOT A NOUL PER FAMILY. The previous router asked 37 independent yes/no questions per
// clause and then applied hand-rolled cutoffs (`floor`, `margin`, `band`, `tie`). TypeSafe documents
// the better primitive for "which one of a fixed set" (docs.typesafe.ai/primitives/choice): one
// Choice over the options, with the FULL probability distribution returned, so the code gets a
// ranked answer instead of 37 compressed probabilities it has to threshold. `confidence` is computed
// by the model from that distribution, so there is no cutoff to calibrate.
//
// THE PATTERNS THIS FOLLOWS (all from docs.typesafe.ai):
//   * hierarchical_classification — classify level by level; `separation = top / second` is the
//     ambiguity metric (near 1× means ambiguous, a large ratio means clear separation). HERE the
//     "second" is the best family that is NOT structurally related to the top one (structuralSeparation
//     below): a data page and the connector it requires are one answer, so they are a chain, not a tie.
//   * choice — the answer is `choice` + `confidence` + `probabilities`; a `none of the above` option
//     is unreliable, so it is paired with a companion NOUL (`any_<i>`) that asks whether ANY listed
//     family builds what the clause asks for. Code reads the Choice only when that Noul says yes.
//   * fan-out — every question for every clause goes in ONE request; questions are evaluated in
//     parallel, so extra speculative questions cost tokens, not wall-clock.
//   * jev-1.13 model card — "Choice option order matters (leans to the first)", so the option order
//     is ROTATED deterministically per clause (a hash of the clause text), and the answer is read
//     from the distribution by a tie-break that cannot depend on position (probability, then name).
//
// PURE, GIVEN THE JUDGMENT: no writes, no state, no files at call time (the taxonomy is read once
// from the vendored corpus and memoised).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { corpusPaths } from "./corpus-lib.mjs";
import { familyProfile } from "./graph-lib.mjs";
import { jev } from "./jev-client.mjs";
import { gateQuestion, normaliseHistory, MEMORY_KEY } from "./memory-lib.mjs";
import { structuralClosure } from "./prereq-lib.mjs";

// ---- level 1: the 14 concepts --------------------------------------------------------------
// One line each, kept deliberately DISTINCT: the descriptions are the only thing separating the
// options, so each says what it covers AND what belongs to a neighbouring concept (the docs' advice
// for similar options: "give it what the option covers, what belongs to a neighbouring option").
export const CONCEPTS = {
  "case-lifecycle":
    "the case itself: case types, stages, processes, assignments, approvals, the attachments and documents held on the case, and how a piece of work moves from intake to resolution",
  correspondence:
    "content a person receives or reads: email and letter templates, correspondence types, notification messages and their delivery channels (NOT the screen an agent types into)",
  integration:
    "calling or receiving data from another system: REST/SOAP connectors, data pages that source external data, MCP services, environment URLs and credentials",
  sla:
    "time limits, deadlines, goals, escalation and urgency on an assignment or a case (NOT a scheduled background job)",
  "ui-views":
    "screens and forms: views, the fields and layout an agent sees and types into, and the visual theme (NOT the case's data or the documents attached to it)",
  security:
    "who may see or do what: access groups, roles, privileges, case access, attachment security, authentication and single sign-on",
  "decision-logic":
    "choosing an outcome by rules: decision tables, when conditions, data sets, expressions and routing logic (NOT a manual flow diagram)",
  reporting:
    "reading data back out: report definitions, list and summary reports, counts, filters and joins",
  "data-model":
    "the shape of the data: classes, properties, data transforms, clipboard pages, and how records relate",
  validation:
    "checking that input is correct before it is saved: validate rules, edit validates, error messages and constraints",
  branching:
    "versioning and change management: rulesets, branches, ruleset versions and application settings",
  automation:
    "work the system does without a person: activities, job schedulers, queue processors, background steps and AI agents acting on the case",
  genai:
    "generative AI: AI agents, AI tools, generative-AI connectors, prompts and model configuration",
  testing:
    "proving it works: PegaUnit test cases, application tests and business actions in a test",
};

// The unreliable-option companion (docs/choice: a `none of the above` option may not work well; pair
// it with a Noul). It is still offered so the model has somewhere to put "none" — code does not
// trust it alone.
export const NONE_OF_THESE = "none_of_these";
export const NONE_DESCRIPTION =
  "a goal that is not about any of the above — e.g. a non-Pega object (a printer, an email account), a policy or process question, or something no Pega rule authors";

// ---- level 2: the concept's families -------------------------------------------------------
// Which families a concept owns. This is the PRESENTATION mapping the `unsure` verdict needs ("this
// is a <concept> question; name which part — it could be a case type or a flow"), so it is kept
// small and curated rather than read from the graph's noisy concept→node lists (the graph tags
// obj-flow with 13 of the 14 concepts, which would make the message useless). Every one of the 37
// families appears here at least once, and the taxonomy test asserts that.
export const CONCEPT_FAMILIES = {
  "case-lifecycle": ["obj-casetype", "obj-flow", "obj-flowaction", "classmetadata", "obj-attachmentcategory"],
  correspondence: ["obj-corr", "corrtype", "notification", "obj-fieldvalue"],
  integration: ["connect-rest", "declare-pages", "service-mcp", "admin-system-settings"],
  sla: ["obj-servicelevel"],
  "ui-views": ["ui-view", "ui-theme"],
  security: ["obj-attachmentcategory", "admin-system-settings"],
  "decision-logic": ["declare-decision-table", "obj-when", "decision-dataset"],
  reporting: ["obj-report-definition"],
  "data-model": ["obj-class", "obj-property", "obj-model"],
  validation: ["obj-validate", "edit-validate"],
  branching: ["ruleset-name", "ruleset-branch", "ruleset-version"],
  automation: ["obj-activity", "async-jobscheduler", "async-queueprocessor"],
  genai: ["ai-agent", "ai-tool", "connect-generativeai"],
  testing: ["test-unit-case", "test-application-case", "test-application-businessaction"],
};

// ---- the family menu, derived from the corpus ----------------------------------------------
// A family's routing text is `<Rule-Obj-X> — <manifest description> — keywords: <graph keywords>`:
// the rule class names the ARTEFACT, the description says what it is for, and the graph's keywords
// carry the vocabulary a user actually writes ("escalate", "view", "connector").
const DESCRIPTION_BOILERPLATE = /^(?:authoring guide for|load when (?:creating|authoring|updating)(?: or (?:creating|updating))?|schema and reference guide for)\s*/i;
// The graph's keywords are harvested tokens, so the ones that appear on EVERY family carry no signal
// and would only lengthen the criteria (the model pays for them in tokens and attention).
const KEYWORD_NOISE = new Set([
  "rules", "rule", "examples", "stub", "minimal", "name", "description", "payload", "references",
  "create", "update", "type", "value", "values", "fields", "field", "pxobjclass", "ids", "key",
]);

// Families whose manifest prose and examples never spell the rule class out. Presentation only.
const RULE_CLASS_FALLBACK = {
  "rules-rule-test-application-businessaction": "Rule-Test-Application-BusinessAction",
};

let _taxonomy = null;

// A few families describe their rule in words only ("Pega Business Action rules for application
// tests"), so the rule class comes from the corpus's own example payload instead of a guess.
function ruleClassFromExamples(corpus, skill) {
  const dir = path.join(corpus, "skills", skill, "examples");
  for (const name of (() => { try { return readdirSync(dir).sort(); } catch { return []; } })()) {
    if (!name.endsWith(".md")) continue;
    let text = "";
    try { text = readFileSync(path.join(dir, name), "utf8"); } catch { continue; }
    const found = /"pxObjClass"\s*:\s*"(Rule-[A-Za-z][A-Za-z0-9-]*)"/.exec(text);
    if (found) return found[1];
  }
  return null;
}

function ruleClassOf(family, description, corpus) {
  // the manifest prose names the rule class, with or without parentheses ("Pega case type rules
  // (Rule-Obj-CaseType)" / "Rule-Service-MCP rules"). Take it from there, so the option's identifier
  // is the corpus's own and not something this module guessed from the family's lowercase name.
  const named = /(?:^|[\s(])(Rule-[A-Za-z][A-Za-z0-9-]*)/.exec(description || "");
  if (named) return named[1];
  // Only trust an example's pxObjClass when it IS this family's rule: a family's examples may carry
  // another rule's class (the application-test example embeds a business action), and borrowing it
  // would label the option with the wrong identifier.
  const fromExample = ruleClassFromExamples(corpus, family);
  const wanted = family.replace(/^rules-rule-/, "").replace(/-/g, "").toLowerCase();
  if (fromExample && fromExample.replace(/^Rule-/, "").replace(/-/g, "").toLowerCase() === wanted) return fromExample;
  // presentation only: a compound word the corpus never spells as a rule class
  if (RULE_CLASS_FALLBACK[family]) return RULE_CLASS_FALLBACK[family];
  // last resort: the family's own name, so the option still reads as an identifier rather than prose
  return "Rule-" + family.replace(/^rules-rule-/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
}

export function taxonomy() {
  if (_taxonomy) return _taxonomy;
  const { corpus } = corpusPaths();
  const manifest = JSON.parse(readFileSync(path.join(corpus, "manifest.json"), "utf8"));
  const descriptions = new Map();
  for (const skill of manifest.skills || []) {
    const family = String(skill.name || "").split("/")[0];
    if (!family.startsWith("rules-rule-") || descriptions.has(family)) continue;
    descriptions.set(family, String(skill.description || ""));
  }
  const families = [...descriptions.keys()].sort().map((skill) => {
    const family = skill.replace(/^rules-rule-/, "");
    const raw = descriptions.get(skill);
    const clean = raw.replace(DESCRIPTION_BOILERPLATE, "").replace(/\s*--.*$/, "").replace(/\s+/g, " ").trim();
    const keywords = [...new Set((familyProfile(skill).keywords || [])
      .map((k) => String(k).toLowerCase())
      .filter((k) => k.length > 3 && !KEYWORD_NOISE.has(k)))]
      .slice(0, 8);
    const ruleClass = ruleClassOf(skill, raw, corpus);
    const criteria = `${ruleClass} — ${clean.slice(0, 160)}${keywords.length ? ` — keywords: ${keywords.join(", ")}` : ""}`;
    return { family, skill, ruleClass, description: clean, keywords, criteria };
  });
  _taxonomy = { concepts: Object.keys(CONCEPTS), families };
  return _taxonomy;
}

// ---- deterministic option rotation ---------------------------------------------------------
// jev-1.13 "leans toward the option that comes first", so a fixed menu would systematically favour
// whichever family happens to sort first. The order is therefore rotated by a hash of the clause:
// deterministic (same clause ⇒ same menu, so two runs are comparable) and different per clause (so a
// multi-clause question does not present the same bias twice).
export function hashSeed(text) {
  let h = 0x811c9dc5; // FNV-1a, 32-bit
  for (const ch of String(text ?? "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function rotationOffset(text, length) {
  if (!length) return 0;
  return hashSeed(text) % length;
}

export function rotateOptions(options, offset) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return [];
  const at = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(at), ...list.slice(0, at)];
}

// ---- reading a Choice answer, order-independently ------------------------------------------
// The answer is read from `probabilities`, never from `choice` (the API's `choice` is its own argmax;
// reading the distribution lets us apply ONE tie-break that cannot depend on option order). Ties go
// to the alphabetically first option, so reversing the menu cannot change the answer.
export function argmax(probabilities, allowed = null) {
  const allow = allowed ? new Set(allowed) : null;
  const entries = Object.entries(probabilities || {})
    .filter(([k, v]) => Number.isFinite(Number(v)) && (!allow || allow.has(k)))
    .map(([k, v]) => [k, Number(v)]);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { option: entries[0][0], probability: entries[0][1] };
}

// `separation = top / second` (docs/hierarchical_classification). A second probability of 0 means the
// distribution has a single peak: there is nothing to be ambiguous with, so separation is Infinity
// rather than a division by zero.
export function separationOf(probabilities) {
  const values = Object.values(probabilities || {})
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => b - a);
  if (!values.length) return 0;
  const second = values[1] ?? 0;
  return second > 0 ? values[0] / second : Infinity;
}

// The ambiguity metric the VERDICT reads: the top family against the best family it is NOT
// structurally related to. A family and its structural relatives (prereq-lib's table read both ways)
// are ONE answer — a data page REQUIRES the REST connector it names, and the planner already emits
// that connector as a prerequisite step — so comparing them would call a chain a coin flip. Two
// unrelated families at the same probability are still a genuine tie. A distribution that is a single
// chain has nothing to be ambiguous with, so it is Infinity (decisive), not 1× (a coin flip).
export function structuralSeparation(probabilities) {
  const ranked = Object.entries(probabilities || {})
    .map(([option, p]) => [option, Number(p)])
    .filter(([, p]) => Number.isFinite(p) && p > 0)
    // probability descending, then name ascending — never the order the options were sent in
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (!ranked.length) return 0;
  const [top, topP] = ranked[0];
  const related = structuralClosure(top);
  const unrelated = ranked.slice(1).find(([option]) => !related.has(option));
  return unrelated ? topP / unrelated[1] : Infinity;
}

// The option menu as the API wants it: an OBJECT map of option name → description (the docs' shape).
function menu(options, describe) {
  const out = {};
  for (const option of options) out[option] = describe(option);
  return out;
}

// ---- classifyClauses — ONE judgment call for the WHOLE question -----------------------------
// For each clause, three questions in the SAME request:
//   intent_<i>  Choice over the 14 concepts (+ none_of_these)  — what kind of work is this?
//   family_<i>  Choice over the 37 rule families               — which rule authors it?
//   any_<i>     Noul                                           — does ANY listed family build it?
// `state` is the whole normalised question: the clauses together are the context a single reading
// lacks ("an SLA" beside "a dispute case" is judged knowing the case).
//
// MEMORY (cookbook `basic_memory`, see memory-lib.mjs) adds two things to that SAME request:
//   remember    Noul  — the gate: does THIS question state a lasting fact worth remembering?
//   state[MEMORY_KEY] — the CALLER's earlier turns, when it passed any. Injecting them is the whole
//                       wrapper: the questions do not change, the model reads the whole state, and a
//                       follow-up ("the data page one") resolves because the prior turn is there.
// The planner keeps no memory of its own; `history` is validated + capped by the caller's module and
// the gate's probability is returned as `remember` on the result array (it belongs to the QUESTION,
// not to a clause, so it is not a field of any one entry).
//
// Returns one entry per clause: { concept, conceptConfidence, conceptProbs, family, familyProbs,
// separation, any }. `concept` is null when the model put its probability on `none_of_these`.
export async function classifyClauses(clauses, { question = null, history = [], jevFn = jev, order = {} } = {}) {
  const list = (Array.isArray(clauses) ? clauses : [clauses]).map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!list.length) { const none = []; none.remember = null; return none; } // no clause → no call (Jev rejects an empty question set with a 422)

  const { concepts, families } = taxonomy();
  const familyIds = families.map((f) => f.family);
  const familyById = new Map(families.map((f) => [f.family, f]));
  const conceptIds = [...concepts, NONE_OF_THESE];
  const conceptDescription = (id) => (id === NONE_OF_THESE ? NONE_DESCRIPTION : CONCEPTS[id]);

  const whole = question ? String(question) : list.join("; ");
  const earlier = normaliseHistory(history);
  // The family menu is in `state` because the companion Noul has no criteria of its own: it can only
  // ask whether the clause names something in the state. The RULE CLASSES (not the full criteria) are
  // enough for that judgment and keep the state small (jev-1.13 degrades on unrelated detail).
  // With no history the state is EXACTLY what it always was — an existing caller sees no change.
  const state = { question: whole, clauses: list, pega_rule_types: families.map((f) => f.ruleClass) };
  if (earlier.length) state[MEMORY_KEY] = earlier;
  const questions = {};
  // A follow-up is resolved by the Choices READING the earlier turns, not by code rewriting the clause
  // (pointing at the state is context, not an anaphora heuristic).
  const context = earlier.length
    ? ` Earlier turns of this conversation are in \`${MEMORY_KEY}\`: when this clause refers back to an earlier turn, resolve what it means from them.`
    : "";

  list.forEach((clause, i) => {
    const conceptOrder = order.concepts ? order.concepts(i, conceptIds) : rotateOptions(conceptIds, rotationOffset(`concept:${clause}`, conceptIds.length));
    const familyOrder = order.families ? order.families(i, familyIds) : rotateOptions(familyIds, rotationOffset(`family:${clause}`, familyIds.length));

    questions[`intent_${i}`] = {
      type: "choice",
      instructions:
        `The clause under judgement is clauses[${i}]: "${clause}". Which kind of Pega work does THAT clause ask for? ` +
        `Answer for the clause, using the whole question only as context.` + context,
      criteria: menu(conceptOrder, conceptDescription),
    };
    questions[`family_${i}`] = {
      type: "choice",
      instructions:
        `The clause under judgement is clauses[${i}]: "${clause}". Which ONE rule type would a Pega developer author to deliver that clause? ` +
        `Choose the rule the clause would be CREATED as — the artefact itself, not a step or a reference inside another rule. ` +
        `(A case type for tracking a case; a flow for a process inside it; a view for a screen; a connector for a call to another system; a report definition for a report.) ` +
        `Use the whole question only as context.` + context,
      criteria: menu(familyOrder, (id) => familyById.get(id)?.criteria || id),
    };
    questions[`any_${i}`] = {
      type: "noul",
      instructions:
        `Does clauses[${i}] ask for something that at least one of the Pega rule types in pega_rule_types authors? ` +
        `Answer false when the clause asks for something no Pega rule builds (a printer, an email account, a policy).`,
    };
  });
  // the memory gate: same request, one Noul, judged on the question alone (see memory-lib.mjs)
  questions.remember = gateQuestion();

  const response = await jevFn({ state, questions });
  const answers = response?.answers || {};
  const remember = typeof answers.remember?.noul === "number" ? answers.remember.noul : null;

  const result = list.map((clause, i) => {
    const intent = answers[`intent_${i}`] || {};
    const conceptProbs = { ...(intent.probabilities || {}) };
    const chosenConcept = argmax(conceptProbs, conceptIds);
    const isNone = chosenConcept?.option === NONE_OF_THESE;
    const concept = chosenConcept && !isNone ? chosenConcept.option : null;
    const conceptConfidence = concept ? Number(intent.confidence ?? chosenConcept.probability ?? 0) : 0;

    const familyAnswer = answers[`family_${i}`] || {};
    const familyProbs = { ...(familyAnswer.probabilities || {}) };
    const chosenFamily = argmax(familyProbs, familyIds);
    const any = Number(answers[`any_${i}`]?.noul ?? 0);

    return {
      clause,
      concept,
      conceptConfidence,
      conceptProbs,
      family: chosenFamily?.option || null,
      familyConfidence: Number(familyAnswer.confidence ?? chosenFamily?.probability ?? 0),
      familyProbs,
      // the ambiguity metric, read as a chain rather than a tie (see structuralSeparation)
      separation: structuralSeparation(familyProbs),
      any,
    };
  });
  // P(remember) belongs to the QUESTION (one gate per request), so it rides on the array, not on an
  // entry. It is a non-index property: spread/map/JSON of the array are unaffected.
  result.remember = remember;
  return result;
}

// The taxonomy's own summary, for `looked_at` (a reader can see the menu the model chose from).
export function taxonomySummary() {
  const { concepts, families } = taxonomy();
  return { concepts: concepts.length, families: families.length };
}
