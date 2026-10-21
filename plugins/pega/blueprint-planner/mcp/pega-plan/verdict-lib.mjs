// verdict-lib.mjs — the decision layer: a taxonomy classification per clause → ONE defensible verdict.
//
// WHAT CHANGED, AND WHY. This module used to decide with six hand-rolled thresholds over 37
// independent noul scores per clause: a routing `floor`, a `cutoff` (top − margin), a `band` of
// leniency, a `tie` window, lexical support (did the clause NAME the family?), structural closure
// (is the near family a prerequisite/dependent of the winner?) and a sub-floor exemption. Every one
// of those was a calibration knob fitted to the corpus, and together they made the answer flip
// between samples on questions that had not changed.
//
// The router is now a two-level Choice (taxonomy-lib.mjs): the model returns a full probability
// distribution per level, its own `confidence`, and — for the "is this even a Pega authoring goal?"
// question — a companion Noul. The verdict reads those numbers and nothing else:
//   * `conceptConfidence` is the model's own confidence in the KIND of work (level 1);
//   * `separation = p1 / p2` over the family distribution is the documented ambiguity metric
//     (docs.typesafe.ai/cookbooks/hierarchical_classification: "near 1× is ambiguous, a large ratio
//     means clear separation");
//   * `any` is the Noul that pairs with the unreliable `none_of_these` option
//     (docs.typesafe.ai/primitives/choice: "a `none of the above` option may not work well … ask a
//     companion Noul and read the Choice only when the Noul says yes").
//
// PRECEDENCE — per clause, first match wins:
//   1. the classification failed (jevDown)                                  → unsure
//   2. any.noul < 0.35 — it does not ask for something an authoring
//      family builds                                                       → no
//        `closest` names the concept it is closest to.
//   3. conceptConfidence < 0.5 — the KIND of work is unclear                → unsure
//        `closest` reports the PARENT: "this is a `<concept>` question (p=…); name which part",
//        listing that concept's families. A `none_of_these` winner says so instead.
//   4. family separation < 1.2 — two families are a coin flip              → unsure
//        `closest` names the top 2–3 families with their probabilities.
//   5. the `security` concept (access / SSO) — a supported surface this
//      corpus authors no rule for, so the registry says what to do instead → alternative
//   6. otherwise — a confident concept and a clearly separated family      → yes
//        the chosen family is the answer.
//
// WHAT IS *NOT* A VERDICT INPUT ANY MORE: routing scores, cutoffs, margins, bands, ties, whether the
// clause spells the family's name, whether two families are structural complements, and whether a
// score sits under a floor. The structural prerequisite table (prereq-lib.mjs) still decides the
// ORDER of the steps and what must exist first — it no longer decides the verdict.
//
// MERGE — the overall verdict is the WORST clause (`no` > `unsure` > `alternative` > `yes`), with one
// exception: a `no` clause beside an answerable clause cannot make the whole question impossible —
// part of it IS answerable, so the question is `alternative` and the unsupported part is named in
// `closest`. A multi-clause question's per-clause verdicts stay intact in `perClause`.
//
// decide() IS PURE: no model call, no file read, no mutation of its inputs. registryValid() reads the
// corpus (read-only) to catch registry drift; nothing here ever writes.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { CONCEPT_FAMILIES } from "./taxonomy-lib.mjs";

// The three documented decision points. Each is a NAME for a published rule, not a fitted knob:
//   ANY_FLOOR         a Noul is read as "yes" from 0.5; 0.35 is the "not even close" end of it.
//   CONCEPT_FLOOR     the model's own `confidence` below which the docs say "treat a low-confidence
//                     answer as a reason to ask rather than act" (docs/primitives/choice, 0.5).
//   SEPARATION_FLOOR  a top/second ratio under 1.2 is the cookbook's "near 1× is ambiguous".
export const ANY_FLOOR = 0.35;
export const CONCEPT_FLOOR = 0.5;
export const SEPARATION_FLOOR = 1.2;

export const KINDS = ["config", "manual"];
export const CAPABILITIES_URL = new URL("./capabilities.json", import.meta.url);

const SEVERITY = { yes: 0, alternative: 1, unsure: 2, no: 3 };
const str = (v) => String(v ?? "").trim();
// Coerce what a caller actually hands over: a numeric string ("0.9" out of a JSON payload) is a
// number, not a missing value. Anything unparseable falls back to `d` — never silently to 0.
// `Infinity` is a VALID separation (a single-peak distribution has nothing to be ambiguous with), so
// it is preserved rather than read as "missing".
const num = (v, d = 0) => {
  if (v === Infinity) return Infinity;
  if (Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return d;
};

// The shipped registry, parsed on demand. It is a plain array of entries; keeping the file an array
// means `decide(clauses, registry)` takes exactly what the file contains (no wrapper to unwrap).
export function loadRegistry(url = CAPABILITIES_URL) {
  const parsed = JSON.parse(readFileSync(url, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

// The registry entry a capability resolves to: the capability key itself, or any alias.
// Case-insensitive, because callers hand back whatever the question said ("Access Group").
function entryFor(capability, registry) {
  const key = str(capability).toLowerCase();
  if (!key) return null;
  for (const entry of Array.isArray(registry) ? registry : []) {
    if (!entry || typeof entry !== "object") continue;
    if (str(entry.capability).toLowerCase() === key) return entry;
    if (Array.isArray(entry.aliases) && entry.aliases.some((a) => str(a).toLowerCase() === key)) return entry;
  }
  return null;
}

// A registry `closest` is {what, why, source}; decide() returns the same shape for every
// non-`yes` verdict (with a synthesized what/why where no registry entry applies), so a consumer
// never has to branch on verdict to read it.
function closestOf(entry) {
  const c = entry && entry.closest;
  if (!c) return null;
  const out = { what: str(c.what), why: str(c.why) };
  if (str(c.source)) out.source = str(c.source);
  return out;
}

function registryClosest(entry) {
  return closestOf(entry) || { what: "the registered manual step", why: "the registry lists a path this tool does not author" };
}

// One-line rendering for the answer template: "what — why (source)".
export function describeClosest(closest) {
  if (!closest) return "";
  const why = closest.why ? ` — ${closest.why}` : "";
  const src = closest.source ? ` (${closest.source})` : "";
  return `${closest.what}${why}${src}`;
}

// A family as the ARTEFACT it authors, for the `unsure` text. The taxonomy works in family names
// ("obj-casetype"); a reader needs the Pega artefact ("a case type"). Presentation only — nothing
// decides on it — so an unlisted family falls back to its own words rather than fake English.
const FAMILY_NOUN = {
  "admin-system-settings": "an application setting",
  "ai-agent": "an AI agent",
  "ai-tool": "an AI tool",
  "async-jobscheduler": "a job scheduler",
  "async-queueprocessor": "a queue processor",
  classmetadata: "class metadata",
  "connect-generativeai": "a GenerativeAI connector",
  "connect-rest": "a REST connector",
  corrtype: "a correspondence type",
  "decision-dataset": "a data set",
  "declare-decision-table": "a decision table",
  "declare-pages": "a data page",
  "edit-validate": "an edit validate",
  notification: "a notification",
  "obj-activity": "an activity",
  "obj-attachmentcategory": "an attachment category",
  "obj-casetype": "a case type",
  "obj-class": "a class",
  "obj-corr": "a correspondence rule",
  "obj-fieldvalue": "a field value",
  "obj-flow": "a flow",
  "obj-flowaction": "a flow action",
  "obj-model": "a data transform",
  "obj-property": "a property",
  "obj-report-definition": "a report definition",
  "obj-servicelevel": "a service-level agreement",
  "obj-validate": "a validate rule",
  "obj-when": "a when condition",
  "ruleset-branch": "a ruleset branch",
  "ruleset-name": "a ruleset name",
  "ruleset-version": "a ruleset version",
  "service-mcp": "an MCP service",
  "test-application-businessaction": "a business action",
  "test-application-case": "an application test",
  "test-unit-case": "a PegaUnit test",
  "ui-theme": "a theme",
  "ui-view": "a UI view",
};
export function familyNoun(family) {
  const bare = str(family).replace(/^rules-rule-/, "");
  if (FAMILY_NOUN[bare]) return FAMILY_NOUN[bare];
  return bare ? `the ${bare} family` : "a family";
}

// "a data page (`declare-pages`)" — the artefact AND the family name, so a reader can act on it.
export function familyLabel(family) {
  const bare = str(family).replace(/^rules-rule-/, "");
  if (!bare) return "a family";
  const noun = familyNoun(bare);
  return noun === `the ${bare} family` ? noun : `${noun} (\`${bare}\`)`;
}

// The families a concept owns, most relevant first (taxonomy-lib's presentation mapping).
export function conceptFamilies(concept) {
  return [...(CONCEPT_FAMILIES[str(concept)] || [])];
}

// The top `n` options of a probability distribution, with their probabilities. Deterministic:
// probability descending, then option name ascending — never the order the options were sent in.
export function topProbabilities(probabilities, n = 3) {
  return Object.entries(probabilities || {})
    .map(([option, p]) => [option, num(p)])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n);
}

const pct = (p) => `p=${num(p).toFixed(2)}`;

// "a case type (`obj-casetype`) 0.52, a flow (`obj-flow`) 0.31" — the candidates an `unsure` clause
// names (R14: an unsure verdict must name what it cannot choose between).
function candidatesText(probabilities, n = 3) {
  return topProbabilities(probabilities, n)
    .filter(([, p]) => p > 0)
    .map(([family, p]) => `${familyLabel(family)} ${p.toFixed(2)}`)
    .join(", ");
}

// ---- per-clause decision: the precedence table above, in code ----
function decideClause(clause, registry) {
  const text = str(clause?.text);
  const c = clause?.classification || null;
  const base = { text, concept: c?.concept || null, family: c?.family || null, authorable: [] };

  // 1. the judgment service. A classification failure is not evidence either way.
  if (clause?.jevDown === true || !c) {
    return { ...base, verdict: "unsure", signal: "jev-down",
      closest: { what: "a working judgment service (retry when classification is available)",
        why: "the clause could not be classified, so it has no evidence either way" } };
  }

  const any = num(c.any);
  const conceptConfidence = num(c.conceptConfidence);
  const separation = num(c.separation);

  // 2. it does not ask for something an authoring family builds — positive evidence of absence, and
  //    the concept it came closest to is named so the answer is not a bare "no".
  if (any < ANY_FLOOR) {
    const near = c.concept
      ? `the closest concept is \`${c.concept}\` (${pct(c.conceptProbs?.[c.concept] ?? conceptConfidence)})`
      : `no concept fits either (none_of_these ${pct(c.conceptProbs?.none_of_these)})`;
    return { ...base, verdict: "no", signal: "no-authoring-family",
      closest: { what: `no Pega authoring family builds "${text}" — ${near}`,
        why: `the clause asks for something no Pega rule type authors (any = ${any.toFixed(2)} < ${ANY_FLOOR}), so this is an absence, not an unhandled case` } };
  }

  // 3. the KIND of work is unclear. Report the parent: the concept the model did pick (with its
  //    probability) and the parts that concept contains, so the caller can name which one it means.
  if (conceptConfidence < CONCEPT_FLOOR) {
    if (!c.concept) {
      const near = topProbabilities(c.conceptProbs, 2).filter(([k]) => k !== "none_of_these");
      return { ...base, verdict: "unsure", signal: "concept-ambiguous",
        closest: { what: `which part of Pega this is — the model put ${pct(c.conceptProbs?.none_of_these)} on "none of these concepts"` +
            (near.length ? ` and its nearest concept is \`${near[0][0]}\` (${pct(near[0][1])})` : "") +
            `; say what the case should DO`,
          why: `no Pega authoring concept was identified confidently enough (best ${conceptConfidence.toFixed(2)} < ${CONCEPT_FLOOR}), so naming a family would be a guess` } };
    }
    const parts = conceptFamilies(c.concept).slice(0, 3);
    return { ...base, verdict: "unsure", signal: "concept-ambiguous",
      closest: { what: `which part of \`${c.concept}\` this is — it is a \`${c.concept}\` question (${pct(c.conceptProbs?.[c.concept] ?? conceptConfidence)})` +
          (parts.length ? `, and its parts are ${parts.map(familyLabel).join(", ")}` : "") +
          `; name which one the goal needs`,
        why: `the kind of work is not settled (concept confidence ${conceptConfidence.toFixed(2)} < ${CONCEPT_FLOOR}), so the family below it cannot be trusted` } };
  }

  // 4. two families are a coin flip: the verdict would flip with the distribution.
  if (separation < SEPARATION_FLOOR) {
    return { ...base, verdict: "unsure", signal: "family-ambiguous",
      closest: { what: `a clearer statement of the goal — this clause could be ${candidatesText(c.familyProbs, 3)}; name which one it needs`,
        why: `the top two families are not separated (top/second = ${separation.toFixed(2)} < ${SEPARATION_FLOOR}), so which one is the answer is a coin flip` } };
  }

  // 5. the security concept: access and SSO are supported Infinity surfaces that this corpus authors
  //    no rule for. The registry says what to do instead — a downgrade, never a `no`.
  if (c.concept === "security") {
    const entry = entryFor(clause?.capability, registry) || entryFor("access", registry);
    if (entry) {
      return { ...base, verdict: "alternative", signal: "registry",
        closest: registryClosest(entry),
        partial: { planable: 0, manual: 1, missing: 0 } };
    }
  }

  // 6. a confident concept and a clearly separated family: the family is the answer.
  return { ...base, verdict: "yes", signal: "classified", closest: null,
    authorable: [c.family].filter(Boolean) };
}

// ---- decide: per-clause verdicts → one overall verdict ----
// → { verdict, closest, partial, perClause, evidenceAbsent }
//   closest        null only for `yes`; { what, why, source? } otherwise
//   partial        CLAUSE COUNTS, only for `alternative`, else null:
//                    planable = clauses answered `yes`, manual = clauses downgraded to
//                    `alternative`, missing = clauses with positive evidence of absence.
//   perClause      [{ text, concept, family, verdict, signal, closest, authorable, partial? }]
//   evidenceAbsent clause texts with positive evidence of absence (feeds `looked_at.evidence_absent`)
export function decide(clauses = [], registry = []) {
  const list = Array.isArray(clauses) ? clauses : [];
  const perClause = list.map((clause) => decideClause(clause, registry));

  if (!perClause.length) {
    return { verdict: "unsure",
      closest: { what: "a question with at least one goal in it", why: "there is no clause to decide" },
      partial: null, perClause: [], evidenceAbsent: [] };
  }

  // worst clause wins (no > unsure > alternative > yes)
  const worst = perClause.reduce((w, c) => (SEVERITY[c.verdict] > SEVERITY[w] ? c.verdict : w), "yes");
  // a `no` clause beside an answerable clause is a supported subset, not an impossibility.
  const answerable = perClause.some((c) => c.verdict === "yes" || c.verdict === "alternative");
  const downgraded = worst === "no" && perClause.length > 1 && answerable;
  const verdict = downgraded ? "alternative" : worst;

  let closest = null;
  if (verdict !== "yes") {
    // The driver is chosen from the PRE-DOWNGRADE verdicts: after a downgrade there is no clause whose
    // verdict is `alternative` yet, and looking one up would mask the `no` clause that is the whole
    // reason the question is not a `yes`.
    const driver = perClause.find((c) => c.verdict === worst) || perClause[0];
    closest = driver.closest || null;
    if (downgraded && driver.verdict === "no") {
      const subset = perClause.filter((c) => c.verdict === "yes" || c.verdict === "alternative").map((c) => c.text).filter(Boolean);
      closest = { what: `the answerable subset only: ${subset.join("; ") || "see perClause"}`,
        why: `"${driver.text}" has no authoring family and no config or manual path — say so for that part only` };
    }
  }

  const partial = verdict === "alternative"
    ? { planable: perClause.filter((c) => c.verdict === "yes").length,
      manual: perClause.filter((c) => c.verdict === "alternative").length,
      missing: perClause.filter((c) => c.verdict === "no").length }
    : null;

  return { verdict, closest, partial, perClause,
    evidenceAbsent: perClause.filter((c) => c.signal === "no-authoring-family").map((c) => c.text) };
}

// ---- registry validation: drift fails the build ----
// Asserts, against the discovered corpus: shape (kind ∈ config|manual, closest.what/why/source),
// UNIQUE aliases across the whole registry, a resolvable closest.source (a corpus skill, or a file
// under one), and — for any entry that names `families[]` — that each family EXISTS with BOTH a
// schema and an example payload. `families[]` is the authorable part of an alternative (the
// supported subset); an entry may not point at a family that cannot actually be composed.
// Read-only: this is the one function here that touches the corpus, and it never writes.
export function registryValid(capabilities, paths = {}) {
  const problems = [];
  const list = Array.isArray(capabilities) ? capabilities : null;
  if (!list) return { ok: false, problems: ["registry: expected a JSON array of capability entries"] };

  const root = str(paths?.corpus);
  if (!root) problems.push("registry: no corpus path — the registry cannot be validated without the corpus");
  const skills = root ? path.join(root, "skills") : "";
  const readDir = (dir) => { try { return readdirSync(dir); } catch { return []; } };

  const capabilitiesSeen = new Map(); // capability -> index
  const aliasesSeen = new Map();      // alias (lowercased) -> capability

  list.forEach((entry, i) => {
    const at = `entry ${i}${str(entry?.capability) ? ` (${str(entry.capability)})` : ""}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { problems.push(`${at}: not an object`); return; }

    const capability = str(entry.capability);
    if (!capability) problems.push(`${at}: missing capability`);
    else if (capabilitiesSeen.has(capability.toLowerCase())) problems.push(`${at}: capability is declared twice`);
    else capabilitiesSeen.set(capability.toLowerCase(), i);

    if (!KINDS.includes(entry.kind)) problems.push(`${at}: kind must be one of ${KINDS.join(" | ")} (got ${JSON.stringify(entry.kind)})`);

    if (!Array.isArray(entry.aliases) || !entry.aliases.length) problems.push(`${at}: aliases must be a non-empty array`);
    else {
      for (const alias of entry.aliases) {
        const a = str(alias).toLowerCase();
        if (!a) { problems.push(`${at}: an alias is empty`); continue; }
        const owner = aliasesSeen.get(a);
        if (owner !== undefined && owner !== capability) problems.push(`${at}: alias "${a}" is already taken by "${owner}" — aliases must be unique`);
        else aliasesSeen.set(a, capability);
      }
    }

    const c = entry.closest;
    if (!c || typeof c !== "object") problems.push(`${at}: closest is required (what / why / source)`);
    else {
      for (const key of ["what", "why", "source"]) if (!str(c[key])) problems.push(`${at}: closest.${key} is required`);
      const source = str(c.source);
      if (source && root) {
        const under = path.join(skills, source);
        const resolves = source.endsWith(".md")
          ? existsSync(under)                                   // a doc path inside the skill tree
          : existsSync(path.join(under, "SKILL.md"));            // a skill family
        if (!resolves) problems.push(`${at}: closest.source "${source}" does not resolve to a corpus doc`);
      }
    }

    if (entry.families !== undefined) {
      if (!Array.isArray(entry.families)) problems.push(`${at}: families must be an array`);
      else for (const family of entry.families) {
        const f = str(family);
        if (!f) { problems.push(`${at}: a families[] entry is empty`); continue; }
        if (!root) continue;
        const dir = path.join(skills, f);
        if (!existsSync(dir)) { problems.push(`${at}: family "${f}" does not exist in the corpus`); continue; }
        if (!readDir(path.join(dir, "schema")).some((n) => n.endsWith(".json"))) problems.push(`${at}: family "${f}" has no schema`);
        if (!readDir(path.join(dir, "examples")).some((n) => n.endsWith(".md"))) problems.push(`${at}: family "${f}" has no example`);
      }
    }
  });

  // A capability key that is another entry's ALIAS is the same ambiguity as a shared alias: a clause
  // naming it cannot be resolved to one entry (the alias may have been registered later, so this is
  // a post-pass rather than a check inside the loop).
  for (const [capability, index] of capabilitiesSeen) {
    const owner = aliasesSeen.get(capability);
    if (owner && owner.toLowerCase() !== capability) {
      problems.push(`entry ${index} (${capability}): capability key collides with the alias of "${owner}"`);
    }
  }

  return { ok: problems.length === 0, problems };
}
