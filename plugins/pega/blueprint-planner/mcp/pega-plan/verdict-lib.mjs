// verdict-lib.mjs — the decision layer: per-clause routing evidence → ONE defensible verdict.
//
// The planner's answer is only as good as the distinction it draws between three very different
// situations that all look like "nothing found":
//   * positive evidence of absence — the clause asks for a capability nothing in the corpus authors
//     (and the registry offers no config/manual path)                → `no`
//   * evidence that is not good enough — routing sits on the cutoff, the family cannot be composed,
//     two candidates disagree about authorability, or the judgment service is down → `unsure`
//   * a supported path that is not this tool's to author — the registry names the App Studio /
//     manual step                                             → `alternative`
//
// AUTHORABILITY IS EVIDENCE, NOT A TABLE. A capability is authorable when a routed family carries
// BOTH a schema and an example payload. `capabilities.json` holds ONLY non-authorable capabilities
// (`kind: "config" | "manual"`) and can therefore only tell decide() what to offer INSTEAD. It can
// downgrade a verdict; it can never manufacture a `no` (spec §The verdict model, rev 1's fatal flaw).
//
// PRECEDENCE — per clause, first match wins (spec §Precedence, controller ruling D4):
//   1. the clause's routing failed (jevDown)                         → unsure
//   2. zero routed families above the cutoff:
//        registry hit                                               → alternative
//        the clause names no capability (ambiguous)                  → unsure
//        the clause names a capability                               → no  (positive absence)
//   3. any routed family AT/ABOVE THE ROUTING FLOOR within NEAR_CUTOFF
//      of the cutoff (R18: a sub-floor family is not a candidate)  → unsure
//   4. the best-routed family has no schema or no example            → unsure
//   5. the top two candidates are tied within TIE **and disagree on
//      authorability** (so the tie decides the verdict)              → unsure
//   6. registry hit                                                 → alternative (downgrade cap)
//   7. a lower-routed family cannot be composed                     → alternative (supported subset)
//   8. otherwise (every routed family is composable)                → yes
//
// MERGE — the overall verdict is the WORST clause (`no` > `unsure` > `alternative` > `yes`), with
// one exception (ruling D5): a `no` clause cannot stand beside an answerable clause and call the
// whole question impossible — part of it IS answerable, so the question is `alternative` and the
// unsupported part is named in `closest`. A multi-clause question's per-clause verdicts stay intact
// in `perClause`.
//
// Three deliberate reading decisions, all documented here so a reviewer can challenge them:
//   * AMBIGUOUS ≠ ABSENT. `no` requires more than an empty routed set: the clause must NAME a
//     capability. "make it fly" names no capability at all, and silence about a goal we could not
//     parse is not evidence of absence (spec §Verdict model: "ambiguous clause → unsure"). The
//     caller supplies `capability: null` for such a clause; extraction is a routing concern, not
//     this module's.
//   * A TIE ONLY MATTERS WHEN IT DECIDES THE ANSWER. Two candidates tied within TIE that are BOTH
//     composable are not a coin flip — the plan composes both. A tie between a composable and a
//     non-composable candidate is, because the verdict flips with the routing wobble (anti-goal:
//     "hiding routing instability behind an averaged score").
//   * "A ROUTED FAMILY LACKS SCHEMA OR EXAMPLE" (D4 row 3) is applied to the family the answer
//     RESTS ON — the best-routed one. A secondary family that cannot be composed cannot erase a
//     composable top, so it downgrades the clause to `alternative` with the supported subset named
//     (D3: "or the supported subset description"); leaving the whole clause `unsure` would throw
//     away a plan we can actually review. Nothing composable at the top is `unsure`, as ruled.
//
// decide() IS PURE: no model call, no file read, no mutation of its inputs. registryValid() reads
// the corpus (read-only) to catch registry drift; nothing here ever writes.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const NEAR_CUTOFF = 0.05; // spec: `margin < band` is a near-cutoff clause
export const TIE = 0.05;         // spec: two candidates within `tie` are a routing coin flip
export const KINDS = ["config", "manual"];
export const CAPABILITIES_URL = new URL("./capabilities.json", import.meta.url);

const SEVERITY = { yes: 0, alternative: 1, unsure: 2, no: 3 };
const str = (v) => String(v ?? "").trim();
// Coerce what a caller actually hands over: a numeric string ("0.9" out of a JSON payload) is a
// number, not a missing value. Anything unparseable falls back to `d` — never silently to 0.
const num = (v, d = 0) => {
  if (Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return d;
};
const isAuthorable = (r) => !!(r && r.hasSchema === true && r.hasExample === true);

// R18: A FAMILY BELOW THE ROUTING FLOOR IS NOT A CANDIDATE. The floor is the router's absolute
// "this goal requires X" threshold; a family scoring under it is noise the recall-oriented
// shortlist kept for context, not a candidate whose selection could flip. Jitter around a
// sub-floor score must therefore never manufacture `unsure` — the clause falls back to its
// evidence-free rows (`no` when it names a concrete capability, `unsure` only when it names none).
// `floor` is ROUTING DATA, carried with the evidence; a caller that reports no floor keeps every
// family it supplied (the rule then cannot be applied, so nothing is silently dropped).
export function routedAboveFloor(routed, floor) {
  const list = Array.isArray(routed) ? routed.filter(Boolean) : [];
  return Number.isFinite(floor) ? list.filter((r) => num(r.score) >= floor) : list;
}

// The shipped registry, parsed on demand. It is a plain array of entries; keeping the file an array
// means `decide(clauses, registry)` takes exactly what the file contains (no wrapper to unwrap).
export function loadRegistry(url = CAPABILITIES_URL) {
  const parsed = JSON.parse(readFileSync(url, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

// The registry entry a clause's capability resolves to: the capability key itself, or any alias.
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

// A registry-derived `closest`. `closestOf` can only fail for a hand-built registry that skipped the
// shape check (the shipped file is validated), so the fallback stays honest rather than throwing.
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

// A routed family as the ARTEFACT it authors, for the `unsure` text. The router works in FAMILY
// names ("connect-rest", "declare-pages"); a reader needs the Pega artefact ("a connector", "a data
// page"). Presentation only — nothing decides on it — so an unlisted family falls back to its own
// words. (R14: an `unsure` verdict must NAME the competing candidates.)
const FAMILY_NOUN = {
  "connect-rest": "a connector",
  "connect-soap": "a SOAP connector",
  "connect-sql": "an SQL connector",
  "declare-pages": "a data page",
  "obj-casetype": "a case type",
  "obj-servicelevel": "a service-level agreement",
  "obj-flow": "a flow",
  "obj-model": "a data transform",
  "obj-activity": "an activity",
  "obj-property": "a property",
  "obj-class": "a class",
  "obj-corr": "a correspondence rule",
  "declare-decision-table": "a decision table",
  "ui-view": "a UI view",
};
export function familyNoun(family) {
  const bare = str(family).replace(/^rules-rule-/, "");
  if (FAMILY_NOUN[bare]) return FAMILY_NOUN[bare];
  // An unlisted family reads as "the obj-flowaction family", never as a manufactured phrase
  // ("a obj flowaction"): the reader needs the family's own name to act on, not fake English.
  return bare ? `the ${bare} family` : "a routed family";
}

// The competing candidates an `unsure` clause must name: the artefacts its routed families author,
// each with its family name so the reader can act on it. Ordered by routing score (the input order).
function candidateText(routed) {
  const seen = [];
  for (const r of routed) {
    const fam = str(r?.family);
    if (!fam) continue;
    const label = `${familyNoun(fam)} ("${fam}")`;
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
}

// ---- per-clause decision: the precedence table above, in code ----
function decideClause(clause, registry) {
  const text = str(clause?.text);
  const capability = str(clause?.capability) || null;
  // R18: only families at or above the routing floor are candidates (see routedAboveFloor).
  const routed = routedAboveFloor(clause?.routed, clause?.floor);
  const entry = entryFor(capability, registry);
  const base = { text, capability, authorable: [] };

  // 1. the judgment service. A routing failure is not evidence either way (spec: Jev unavailable).
  if (clause?.jevDown === true) {
    return { ...base, verdict: "unsure", signal: "jev-down",
      closest: { what: "a working judgment service (retry when routing is available)",
        why: "routing could not be scored, so this clause has no evidence either way" } };
  }

  // 2. zero routed families above the cutoff — the only branch that can produce `no`.
  if (!routed.length) {
    if (entry) {
      return { ...base, verdict: "alternative", signal: "registry",
        closest: registryClosest(entry),
        partial: { planable: 0, manual: 1, missing: 0 } };
    }
    if (!capability) {
      return { ...base, verdict: "unsure", signal: "ambiguous",
        closest: { what: "a goal that names what to build",
          why: "this clause names no capability, so absent routing evidence is not evidence of absence" } };
    }
    return { ...base, verdict: "no", signal: "evidence-absent",
      closest: { what: `no authoring family for "${capability}"`,
        why: "nothing routed above the cutoff and the registry lists no config or manual path, so the capability is absent — not merely unhandled" } };
  }

  const ranked = [...routed].sort((a, b) => num(b.score) - num(a.score));
  const top = ranked[0];

  // 3. near cutoff: the family is a coin flip, so the verdict would be too. This row runs only on
  //    families AT OR ABOVE the routing floor (R18 dropped the sub-floor ones above), i.e. on real
  //    candidates whose selection could flip. A routed family that does not report a margin is
  //    treated as sitting ON the cutoff (0), not as safely clear of it. The candidates are NAMED
  //    (R14): "a CRM lookup could be a connector or a data page".
  const near = routed.find((r) => num(r.margin, 0) < NEAR_CUTOFF);
  if (near) {
    const cands = candidateText(routed);
    const what = cands.length > 1
      ? `a clearer statement of the goal — this clause could be ${cands.slice(0, 4).join(" or ")}; name which one it needs`
      : `a clearer statement of the goal, or a re-run of routing for "${str(near.family) || "the routed family"}"`;
    return { ...base, verdict: "unsure", signal: "near-cutoff",
      closest: { what,
        why: `it sits on the cutoff (score ${num(near.score).toFixed(2)}, margin ${num(near.margin).toFixed(2)} < ${NEAR_CUTOFF}), so membership flips between samples` } };
  }

  // 4. the best candidate cannot be composed: no schema, or no example payload to learn from.
  if (!isAuthorable(top)) {
    const missing = [top.hasSchema ? null : "a schema", top.hasExample ? null : "an example payload"].filter(Boolean).join(" and ");
    const others = candidateText(ranked.slice(1));
    const alt = others.length ? ` — the other routed candidates are ${others.slice(0, 3).join(" or ")}` : "";
    return { ...base, verdict: "unsure", signal: "not-composable",
      closest: { what: `a corpus ${missing} for "${str(top.family) || "the routed family"}"${alt}`,
        why: "the best-routed family has no composable payload, so a plan cannot be reviewed against anything" } };
  }

  const authorable = ranked.filter(isAuthorable);
  const gaps = ranked.filter((r) => !isAuthorable(r));

  // 5. a tie that decides authorability: the answer flips with the routing wobble.
  const second = ranked[1];
  if (second && num(top.score) - num(second.score) <= TIE && isAuthorable(second) !== isAuthorable(top)) {
    const [first, next] = candidateText([top, second]);
    return { ...base, verdict: "unsure", signal: "tied",
      closest: { what: `a disambiguation between ${first || `"${str(top.family)}"`} and ${next || `"${str(second.family)}"`} (say which one the goal actually needs), or a re-run of routing`,
        why: `they are tied within ${TIE} and disagree on authorability (score ${num(top.score).toFixed(2)} vs ${num(second.score).toFixed(2)}), so which one is the answer is a coin flip` } };
  }

  // 6. the registry caps the clause at `alternative`: the capability itself is not authorable, and a
  //    routed lookalike does not change that. Downgrade-only — never a `no`.
  if (entry) {
    return { ...base, verdict: "alternative", signal: "registry", authorable: authorable.map((r) => str(r.family)),
      closest: registryClosest(entry),
      partial: { planable: authorable.length, manual: 1, missing: 0 } };
  }

  // 7. part of the clause is composable, part of it is not: a supported subset.
  if (gaps.length) {
    const families = authorable.map((r) => str(r.family)).filter(Boolean);
    return { ...base, verdict: "alternative", signal: "supported-subset", authorable: families,
      closest: { what: `a plan for the authorable part only: ${families.join(", ")}`,
        why: `${gaps.map((r) => str(r.family) || "a routed family").join(", ")} routed with this clause but has no schema and example to compose from` },
      partial: { planable: families.length, manual: 0, missing: gaps.length } };
  }

  // 8. every routed family is composable. `partial` stays null: the documented contract is that only
  //    an `alternative` clause carries one (there is nothing partial about a `yes`).
  return { ...base, verdict: "yes", signal: "authorable", closest: null,
    authorable: authorable.map((r) => str(r.family)) };
}

// ---- decide: per-clause verdicts → one overall verdict ----
// → { verdict, closest, partial, perClause, evidenceAbsent }
//   closest        null only for `yes`; { what, why, source? } otherwise (ruling D3)
//   partial        CLAUSE COUNTS, only for `alternative`, else null:
//                    planable = clauses answered `yes`, manual = clauses downgraded to
//                    `alternative`, missing = clauses with positive evidence of absence.
//                    (A per-clause `partial` carries the finer step/part detail, and exists only
//                    on an `alternative` clause — the contract the return shape documents.)
//   perClause      [{ text, capability, verdict, signal, closest, authorable, partial? }]
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
  // ruling D5: a `no` clause beside an answerable clause is a supported subset, not an impossibility.
  const answerable = perClause.some((c) => c.verdict === "yes" || c.verdict === "alternative");
  const downgraded = worst === "no" && perClause.length > 1 && answerable;
  const verdict = downgraded ? "alternative" : worst;

  let closest = null;
  if (verdict !== "yes") {
    // The driver is chosen from the PRE-DOWNGRADE verdicts: after a D5 downgrade there is no clause
    // whose verdict is `alternative` yet, and looking one up would mask the `no` clause that is the
    // whole reason the question is not a `yes`.
    const driver = perClause.find((c) => c.verdict === worst) || perClause[0];
    closest = driver.closest || null;
    if (downgraded && driver.verdict === "no") {
      const subset = perClause.filter((c) => c.verdict === "yes" || c.verdict === "alternative").map((c) => c.text).filter(Boolean);
      closest = { what: `the answerable subset only: ${subset.join("; ") || "see perClause"}`,
        why: `"${driver.text}" has no authorable family and no config or manual path — say so for that part only` };
    }
  }

  const partial = verdict === "alternative"
    ? { planable: perClause.filter((c) => c.verdict === "yes").length,
      manual: perClause.filter((c) => c.verdict === "alternative").length,
      missing: perClause.filter((c) => c.verdict === "no").length }
    : null;

  return { verdict, closest, partial, perClause,
    evidenceAbsent: perClause.filter((c) => c.signal === "evidence-absent").map((c) => c.text) };
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
