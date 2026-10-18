// plan-lib.mjs — pega-plan core: query + Jev + vendored skill corpus => payload plan.
// Judgment-only Jev (no LLM authoring): values are code-filled from goal + OpenAPI contracts
// into the REAL example payload templates from the corpus; Jev scores each against its example
// and we gate on a deterministic mandatory-key diff.
import { readFile, readdir, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { systemOne, JevUnavailable } from "../../lib/jev-lib.mjs";
import { requireOrder, familyProfile, expandFamilies, loadGraph } from "./graph-lib.mjs";
import { composeContainer } from "./compose-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../.."); // pega-automated/
export const CORPUS = process.env.PEGA_CORPUS || path.join(ROOT, "index/pega-infinity-ai-plugins-resources-26-1");

// a plan STORE so the agent-fill loop can FREEZE a plan across two MCP calls: call 1 saves it and
// returns a deterministic planId; call 2 loads that same plan (no re-plan → fills never misalign).
export const PLAN_STORE = process.env.PEGA_PLAN_STORE || path.join(os.tmpdir(), "pega-plan-store");
export function planIdFor({ query, namespace, expand, contracts_dir }) {
  return createHash("sha1").update(JSON.stringify([query, namespace || null, !!expand, contracts_dir || null])).digest("hex").slice(0, 12);
}
export function savePlan(id, result) { mkdirSync(PLAN_STORE, { recursive: true }); writeFileSync(path.join(PLAN_STORE, id + ".json"), JSON.stringify(result)); }
export function loadPlan(id) {
  if (!/^[a-f0-9]{12}$/.test(String(id))) throw new Error(`invalid planId: ${JSON.stringify(id)}`);
  return JSON.parse(readFileSync(path.join(PLAN_STORE, id + ".json"), "utf8"));
}

// ---- tunables (named, not inline magic) ----
const AUTHORING_PREFIXES = ["methodology", "rules-rule"]; // which corpus families are rules to author
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const DEFAULT_SOR_BASE_URL = "https://127.0.0.1:8123"; // demo systems-of-record base; override via planPegaBuild
const ROUTE = { floor: 0.45, margin: 0.11, cap: 8, tie: 0.05, samples: 2, band: 0.04 }; // recall-oriented shortlist (see routeSkills)
const PICK = { requiredWeight: 5, methodWeight: 1.5, variantPenalty: 0.3, variantRe: /auth|dynamic|grouped/i };
const CORPUS_CHOICE = { min: 2, max: 12, maxLen: 32, maxWords: 4 }; // a small observed vocabulary is a usable menu

const VALUE_FLOOR = 0.5; // goal-choice confidence below this is flagged for review
const PY_ADMIN = new Set([
  "pyRuleAvailable", "pyMethodStatus", "pyUsage", "pyRuleSet", "pyRuleSetVersion",
  "pyJavaGenerateAPIVersion", "pyOldActivityType", "pyDisplayMode", "pyBaseClass",
  "pyRuleName", "pxObjClass", "pyAccessGroup", "pyAccessGroupContext",
]);

const key = () => {
  const k = process.env.TYPESAFE_API_KEY;
  if (k) return k;
  try { const m = readFileSync(path.join(ROOT, ".env"), "utf8").match(/^TYPESAFE_API_KEY=(.+)$/m); return m?.[1]?.trim(); } catch { return null; }
};

async function jev({ state, questions }) {
  const apiKey = key();
  if (!apiKey) throw new JevUnavailable("TYPESAFE_API_KEY not set");
  return systemOne({ apiKey, state, questions });
}

// ---- 1. TOC (cheap, feedable state) ----
export async function loadToc({ prefixes = AUTHORING_PREFIXES } = {}) {
  const m = JSON.parse(await readFile(path.join(CORPUS, "manifest.json"), "utf8"));
  // one entry per authoring family (dedupe by the family name) so the Jev route criteria stays small
  const families = new Map();
  for (const s of m.skills) {
    if (!prefixes.some(p => s.name.startsWith(p))) continue;
    const fam = s.name.split("/")[0];
    if (!families.has(fam)) families.set(fam, s);
  }
  return [...families.values()].map(s => ({ name: s.name.split("/")[0], desc: (s.description || "").slice(0, 120) }));
}

// ---- 2. extract `create-rule` JSON blocks from an example .md ----
export async function extractCreateRule(skillName) {
  const dir = path.join(CORPUS, "skills", skillName, "examples");
  let files = [];
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const md = await readFile(path.join(dir, f), "utf8");
    // the frontmatter `description` states what the example IS FOR (e.g. "read-only data page
    // sourced from a REST connector"); it is the strongest intent signal for example selection.
    const desc = (md.match(/^---\n[\s\S]*?\bdescription:\s*(.+)$/m) || [])[1]?.trim() || "";
    // pull the last ```json ... ``` block (the create-rule payload) per file
    const blocks = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map(b => b[1]);
    for (const b of blocks) {
      try {
        const j = JSON.parse(b);
        out.push({ file: f, name: j.pyLabel || j.pyServiceName || j.pyModelName || f, desc, payload: j });
      } catch { /* skip non-JSON example blocks */ }
    }
  }
  return out;
}

// ---- 3. OpenAPI endpoint extraction (path -> methods) from a contract document ----
// Real YAML/JSON parse (no indentation heuristics): reads the OpenAPI `paths` object.
export function endpointsFromOpenAPI(text) {
  let doc;
  try { doc = parseYaml(text); } catch { return {}; }
  const paths = doc && typeof doc === "object" ? doc.paths : null;
  if (!paths || typeof paths !== "object") return {};
  const out = {};
  for (const [p, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    const methods = Object.keys(item).filter(k => HTTP_METHODS.has(k.toLowerCase())).map(m => m.toUpperCase());
    if (methods.length) out[p] = [...new Set(methods)];
  }
  return out;
}

// ---- 4. fill a payload from the goal/contracts (code, no LLM) ----
// Detection is SCHEMA-DRIVEN, not by rule name: any rule whose schema declares an embedded URL
// (pyEmbeddedURL) is an integration rule and gets the SOR base URL stamped in. Everything else
// keeps its template verbatim + a default description. Method request/response arrays are already
// supplied by the schema's x-pega-autoFill values (see applySchema).
export function fillForSkill(skill, template, { baseUrl = DEFAULT_SOR_BASE_URL, schema = {} } = {}) {
  const p = JSON.parse(JSON.stringify(template));
  const hasEmbeddedUrl = "pyEmbeddedURL" in (schema.properties || {});
  if (hasEmbeddedUrl && p.pyEmbeddedURL) {
    p.pyEmbeddedURL.pyBaseURL = baseUrl;
    p.pyEmbeddedURL.pyEndpointURL = baseUrl;
  }
  p.pyDescription = p.pyDescription || "Auto-generated from pega-plan.";
  return p;
}

// ---- 5. the rule's SCHEMA (the Index contract) ----
// Reads skills/<skill>/schema/*.json and classifies required keys: x-pega-autoDerived (Pega
// derives, e.g. pyRuleName) and x-pega-autoFill (Pega supplies a default, e.g. pxObjClass) are
// NOT ours to provide; the rest must be present in the payload.
export async function loadSchema(skill) {
  const dir = path.join(CORPUS, "skills", skill, "schema");
  const files = await readdir(dir).catch(() => []);
  const jf = files.find(f => f.endsWith(".json"));
  if (!jf) return { hasSchema: false, requiredManual: [], autoFill: {}, properties: {} };
  let schema;
  try { schema = JSON.parse(await readFile(path.join(dir, jf), "utf8")); } catch { return { hasSchema: false, requiredManual: [], autoFill: {}, properties: {} }; }
  const props = schema.properties || {};
  const autoFill = {}; const requiredManual = [];
  for (const k of (schema.required || [])) {
    const p = props[k] || {};
    if (p["x-pega-autoDerived"]) continue;
    if (p["x-pega-autoFill"] !== undefined) { autoFill[k] = p["x-pega-autoFill"]; continue; }
    requiredManual.push(k);
  }
  return { hasSchema: true, requiredManual, autoFill, properties: props, required: schema.required || [] };
}
// inject schema auto-fill defaults; return the manual-required keys still absent
export function applySchema(payload, schema) {
  for (const [k, v] of Object.entries(schema.autoFill || {})) if (!(k in payload)) payload[k] = v;
  return (schema.requiredManual || []).filter(k => !(k in payload));
}

// Deep, deterministic gate: walk the payload against the schema and report TYPE / ENUM /
// nested-required / array-item violations (a superset of the presence-only check). Code, not Jev.
export function validateSchema(payload, schema = {}) {
  const issues = [];
  const props = schema.properties || {};
  const walk = (val, sch, path) => {
    if (!sch || typeof sch !== "object") return;
    if (sch.type === "string" && typeof val !== "string") issues.push(`${path}: expected string`);
    if (sch.type === "array" && !Array.isArray(val)) issues.push(`${path}: expected array`);
    if (sch.type === "object" && (val === null || typeof val !== "object" || Array.isArray(val))) issues.push(`${path}: expected object`);
    if (Array.isArray(sch.enum) && !sch.enum.includes(val)) issues.push(`${path}: "${val}" not in enum`);
    if (sch.type === "object" && val && typeof val === "object" && !Array.isArray(val) && sch.properties) {
      for (const k of (sch.required || [])) if (!(k in val)) issues.push(`${path}.${k}: required missing`);
      for (const [k, v] of Object.entries(val)) if (sch.properties[k]) walk(v, sch.properties[k], `${path}.${k}`);
    }
    if (sch.type === "array" && Array.isArray(val) && sch.items) val.forEach((it, i) => walk(it, sch.items, `${path}[${i}]`));
  };
  for (const k of (schema.requiredManual || schema.required || [])) if (!(k in (payload || {}))) issues.push(`${k}: required missing`);
  for (const [k, v] of Object.entries(payload || {})) if (props[k]) walk(v, props[k], k);
  return issues;
}

// ---- 6. score all filled payloads vs their examples in one Jev call ----
// Score each filled payload against its example (structural) AND judge whether it fulfils the
// build goal's intent for that rule (semantic noul). Payload-less plans are skipped.
export async function jevValidate(goal, plans, { jevFn = jev } = {}) {
  const withPayload = plans.map((p, i) => ({ i, p })).filter(({ p }) => p && p.payload);
  if (!withPayload.length) return plans.map(() => ({ score: null, goalFit: null }));
  const questions = {};
  withPayload.forEach(({ i, p }) => {
    questions[`p${i}_struct`] = { type: "score", criteria: ["totally wrong", "somewhat similar", "mostly valid", "fully matches example structure"], instructions: `How closely does payload ${i} (for the "${p.skill}" rule) match its reference example's structure?` };
    questions[`p${i}_fit`] = { type: "noul", instructions: `Does payload ${i} (for the "${p.skill}" rule) correctly fulfil the build goal's intent for that rule? Judge the values, not just the shape.` };
  });
  const state = { goal, plans: withPayload.map(({ i, p }) => ({ i, rule: p.skill, payload: p.payload })) };
  const r = await jevFn({ state, questions });
  return plans.map((_, i) => ({ score: r.answers?.[`p${i}_struct`]?.score ?? null, goalFit: r.answers?.[`p${i}_fit`]?.noul ?? null }));
}

// ---- build order from the skills-graph: prerequisites (REQUIRES) before dependents ----
// Rule families are topologically ordered so a plan reads in build order (e.g. properties and
// data transforms before the case type that requires them); non-rule families are preserved after.
export function orderFamilies(names) {
  const rules = names.filter(n => n.startsWith("rules-rule-"));
  const rest = names.filter(n => !n.startsWith("rules-rule-"));
  return [...requireOrder(rules), ...rest];
}

// ---- "which example" — prefer the SCHEMA-COMPLETE example, then goal/method fit ----
// Dominant factor is coverage of the schema's manual-required keys (so a complete example like
// goal-deadline.md beats an incomplete stub). Then connector method coverage, then avoid
// specialised variants. Goal-independent safety: completeness wins for every rule type.
export function pickBestExample(examples, { neededMethods = [], requiredManual = [] } = {}) {
  const score = (e) => {
    const keys = Object.keys(e.payload || {});
    const lower = keys.map(k => k.toLowerCase());
    let s = 0;
    if (requiredManual.length) s += PICK.requiredWeight * (requiredManual.filter(k => keys.includes(k)).length / requiredManual.length);
    for (const m of neededMethods) if (lower.includes(`py${String(m).toLowerCase()}requestheaders`)) s += PICK.methodWeight;
    if (PICK.variantRe.test(e.file)) s -= PICK.variantPenalty;
    return s;
  };
  return [...examples].sort((a, b) => score(b) - score(a))[0] || examples[0];
}

// pick WHICH example to use as the template. Jev reads the goal against each example's identity
// (semantic fit); the schema-completeness heuristic is only the fallback. One example → no call.
// GUARANTEE (code, not judgment): if the contract requires methods (GET/POST/…) and some examples
// stub ALL of them while others do not, only the covering examples are valid templates — a connector
// that cannot express the SOR's operations would plan a rule that cannot call the API. Jev then
// still picks the intent-best one; the heuristic is the fallback.
export async function selectExample(goal, examples, { schema = {}, neededMethods = [], jevFn = jev } = {}) {
  if (!examples || !examples.length) return null;
  if (examples.length === 1) return examples[0];
  const coversAll = (e) => {
    const keys = Object.keys(e.payload || {}).map(k => k.toLowerCase());
    return neededMethods.every(m => keys.includes(`py${String(m).toLowerCase()}requestheaders`));
  };
  const covering = neededMethods.length ? examples.filter(coversAll) : [];
  const pool = covering.length ? covering : examples;
  if (pool.length === 1) return pool[0];
  const criteria = {};
  pool.forEach((e, i) => { criteria[String(i)] = `${i}: ${e.name || e.file}${e.desc ? ` — ${e.desc.slice(0, 110)}` : ""}`; });
  try {
    const r = await jevFn({ state: { goal }, questions: { ex: { type: "choice", instructions: "Which example is the same rule type AND closest in intent to the build goal? Use each option's description, not just its name. Pick one by its number.", criteria } } });
    const idx = Number(r.answers?.ex?.choice);
    if (Number.isInteger(idx) && pool[idx]) return pool[idx];
  } catch { /* fall through to the heuristic */ }
  return pickBestExample(pool, { neededMethods, requiredManual: schema.requiredManual });
}

// ---- candidate authoring families — DERIVED FROM THE INDEX (all rules-rule-* + methodology-*) ----
// No hand-curated subset: every family in the corpus is routable. The manifest description of
// each family is the plain-language routing text.
let _candCache = null;
export async function deriveCandidates() {
  if (_candCache) return _candCache;
  const m = JSON.parse(await readFile(path.join(CORPUS, "manifest.json"), "utf8"));
  const fams = new Map();
  for (const s of m.skills) {
    if (!AUTHORING_PREFIXES.some(p => s.name.startsWith(p))) continue;
    const fam = s.name.split("/")[0];
    if (!fams.has(fam)) fams.set(fam, s.description || "");
  }
  _candCache = [...fams.entries()].map(([f, desc]) => {
    // trim the boilerplate so the routing question reads plainly, then add the graph's keywords
    // (the corpus skills-graph tags each family) as extra routing signal.
    const clean = desc.replace(/^(Authoring guide for|Use when)\s*/i, "").replace(/\s*--.*$/, "").trim();
    const kw = (familyProfile(f).keywords || []).filter(k => k.length > 3).slice(0, 8).join(", ");
    return { f, desc: `${clean.slice(0, 110)}${kw ? ` [${kw}]` : ""}` };
  });
  return _candCache;
}

// families the skills-graph explicitly relates to `root` (SIMILAR or REQUIRES, either direction).
// Used to resolve boundary coin-flips deterministically (see routeSkills' `band`).
function relatedTo(root) {
  const { similarOf, requiresOf } = loadGraph();
  const out = new Set([...(similarOf.get(root) || []), ...(requiresOf.get(root) || [])]);
  for (const [f, set] of similarOf) if (set.has(root)) out.add(f);
  for (const [f, set] of requiresOf) if (set.has(root)) out.add(f);
  return out;
}

// ---- routing: one noul per family (plain desc) over the WHOLE corpus ----
// Recall-oriented shortlist. Jev's absolute confidence for "this goal requires family X" is
// compressed (0.5-0.8), so an absolute cut drops the right family. Two things matter:
//   1. The cutoff is ANCHORED ON THE BEST AUTHORABLE FAMILY (rules-rule-*), not on the overall
//      top. methodology-* are meta-docs (no create-rule payload); letting a 0.97 methodology
//      score set the cutoff starves the plan set (e.g. "data model" goals) and makes the set
//      flip when a rule family wobbles across the inflated cutoff.
//   2. The margin is small (`tie`-scale): the junk second candidates sit far below the best
//      rule, while genuinely-required second rules sit close to it; a wide margin keeps
//      adding near-boundary families, which is exactly what makes repeated calls disagree.
// Precision is still enforced downstream by the schema gate + per-payload Jev score.
export async function routeSkills(query, { floor = ROUTE.floor, margin = ROUTE.margin, cap = ROUTE.cap, tie = ROUTE.tie, samples = ROUTE.samples, band = ROUTE.band } = {}) {
  const cands = await deriveCandidates();
  const indexOf = new Map(cands.map((c, i) => [c.f, i])); // corpus order: a deterministic tie-break
  const isRule = (f) => f.startsWith("rules-rule-");
  const questions = {};
  cands.forEach((c, i) => {
    questions[`fam${i}`] = { type: "noul", instructions: `The build goal (in the state) requires authoring/working on: ${c.desc}. Consider EVERY clause of the goal; answer true if ANY part requires it.` };
  });
  // Jev's noul wobbles ~±0.02 per call; a single sample makes the cutoff a coin-flip for any
  // family sitting on it. Average `samples` independent calls to shrink that variance (the
  // expected score is unchanged, so recall is not traded away) before applying the cutoff.
  const runs = await Promise.all(Array.from({ length: Math.max(1, samples) }, () => jev({ state: `Build goal: "${query}"`, questions })));
  const ranked = cands
    .map((c, i) => ({
      f: c.f,
      p: runs.reduce((sum, r) => sum + (r.answers?.[`fam${i}`]?.noul ?? 0), 0) / runs.length,
    }))
    .sort((a, b) => b.p - a.p || indexOf.get(a.f) - indexOf.get(b.f));
  // anchor on the best AUTHORABLE rule family (fall back to the overall top only if none)
  const topRule = ranked.find(x => isRule(x.f)) || ranked[0];
  const top = topRule?.p ?? 0;
  const cutoff = Math.max(floor, top - margin);
  // A family sitting ON the cutoff flips membership between calls: its own score AND the anchor
  // both jitter by ~`band`, so the comparison is a coin-flip. Two rules keep the shortlist honest
  // AND stable:
  //   - the best-companion families (rank 1-2) and graph-related families get a `band` of leniency
  //     around the cutoff, so a genuinely-required companion is never dropped by jitter;
  //   - a THIRD-or-later family that merely scrapes past the cutoff is the noise that makes sets
  //     flap (e.g. a "dataset" rule matching a "data model" goal), so it must clear the cutoff by
  //     `band` — a decisive margin — to be kept.
  const ruleRank = new Map();
  { let rr = 0; for (const x of ranked) if (isRule(x.f)) ruleRank.set(x.f, ++rr); }
  const related = topRule ? relatedTo(topRule.f) : new Set();
  const lenient = (f) => (ruleRank.get(f) ?? 99) <= 2 || related.has(f);
  const flagged = ranked
    .filter(x => x.f === topRule?.f || x.p >= cutoff + band || (x.p >= cutoff - band && lenient(x.f)))
    .slice(0, cap);
  // never return an EMPTY rule shortlist when the model has any signal: if methodology docs
  // starved the cut (a low-confidence route), keep every rule family statistically tied with
  // the best one (`tie`). Precision is enforced downstream, so recall-safe beats "(none)".
  if (!flagged.some(x => isRule(x.f)) && topRule) {
    for (const x of ranked) if (isRule(x.f) && x.p >= top - tie && !flagged.includes(x)) flagged.push(x);
  }
  if (!flagged.length && ranked.length) flagged.push(ranked[0]);
  // primary = the best AUTHORABLE family. Two rule families within `tie` are a statistical tie
  // (Jev's noul jitter is ~±0.02); break it by corpus order so identical goals don't flip.
  const ruleEntries = flagged.filter(x => isRule(x.f));
  let primaryEntry;
  if (ruleEntries.length) {
    const bestRule = Math.max(...ruleEntries.map(x => x.p));
    primaryEntry = ruleEntries
      .filter(x => x.p >= bestRule - tie)
      .sort((a, b) => indexOf.get(a.f) - indexOf.get(b.f))[0];
  } else primaryEntry = flagged[0];
  const unique = [...new Set([primaryEntry?.f, ...flagged.map(x => x.f)].filter(Boolean))];
  return { flagged, ranked, primary: primaryEntry?.f || null, unique, candidateCount: cands.length };
}

// ---- 7. goal -> values: role classification + deterministic text composition ----
// Roles are read from the rule SCHEMA (generic across all families): enum -> choice (Jev
// selects), /Class$/ -> namespace (from an optional app namespace), plain string -> text
// (composed in code), Pega admin/autoFill keys -> meta (never goal-derived), arrays/objects
// -> opaque (left as the example).
export function classifyField(key, prop = {}) {
  if (PY_ADMIN.has(key) || /^pz[A-Z]/.test(key) || prop["x-pega-autoFill"] !== undefined || prop["x-pega-autoDerived"]) return "meta";
  if (Array.isArray(prop.enum)) return "choice";
  if (/(ClassName|Class)$/.test(key)) return "namespace";
  if (prop.type === "string") return "text";
  return "opaque";
}

export function pascalCase(s) {
  return String(s).replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join("").slice(0, 64);
}

export function composeLabel(goal) {
  const stripped = String(goal).trim().replace(/^\s*(send|create|add|build|schedule|define|author|map|validate|write)\b[:\s]*/i, "");
  const titled = stripped.split(/\s+/).filter(Boolean).slice(0, 5)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return titled || "Auto-generated rule";
}

// which text keys we compose from the goal (others keep the example, tagged)
const COMPOSE = {
  pyLabel: (goal) => composeLabel(goal),
  pyStreamName: (goal) => pascalCase(composeLabel(goal)),
  pyActivityName: (goal) => pascalCase(composeLabel(goal)),
  pyPurpose: (goal) => pascalCase(composeLabel(goal)),
  pyEmailTemplateName: (goal) => pascalCase(composeLabel(goal)),
  pyDescription: (goal) => String(goal),
  pySubject: (goal) => String(goal),
  pyMemo: (goal) => String(goal),
};

// the fields whose value IS the rule's name — a name question is asked once per plan for these
const NAME_KEYS = new Set(["pyLabel", "pyStreamName", "pyActivityName", "pyPurpose", "pyEmailTemplateName"]);

// containers we can COMPOSE from the goal (typed catalog → Jev selects). Each maps a container to
// the key whose value is its item TYPE. Data-driven (verified against the corpus), not guessed.
const CONTAINER_DISCRIMINATORS = {
  pySteps: "pyStepsActivityName",
  pyProperties: "pyActionName",
  pyDataSourceList: "pyDeclarePagesDataSource",
  pyExpectedResults: "pyAssertionType",
};

// leaves that hold FREE-TEXT blanks the agent should write (value-bearing), vs structural/selectable
// leaves (method names, block names, logging flags) that code/Jev already decided — never blank those.
const BLANK_LEAF = /(PropertiesName|PropertiesValue|Message|Description|Subject|Memo|Text|Label|Stream|pyClassName)$/i;
// fields that hold a REFERENCE to another rule — if left as the sample's value they dangle on build.
// The planner surfaces them as `reference` blanks so the agent names a rule that exists (or clears it).
// The integration chain (data page → connector → request/response data transforms) wires the steps
// together THROUGH these keys, so they are references even though they name a rule from a different
// family (pyConnectorName → Rule-Connect-*, pyReq/ResDataTransform & pyDTName → Rule-Obj-Model,
// pyPost/LoadActivity → Rule-Obj-Activity). pyConnectorList/pyConnectorClassName name a rule TYPE /
// class, not a rule, so they are deliberately not references.
const REFERENCE_LEAF = /(pyValidateActivity|pyLocalActionActivity|pyPreProcessingActivity|pyPreProcessingTransformRule|pyActionTransformRule|pyWhenRule|pyActionWhen|pyIntegrationSystemId|pyActivityName|pyStreamName|pyFlowName|pyImplementation|pyExpression|pyConnectorName|pyReqDataTransform|pyResDataTransform|pyDTName|pyPostActivity|pyLoadActivity)$/;

// code generates candidate NAMES; Jev picks the best for the goal (Jev cannot write text, only select)
export function nameCandidates(goal, templateLabel) {
  const composed = composeLabel(goal);
  const short = composed.split(/\s+/).slice(0, 3).join(" ");
  const fromExample = typeof templateLabel === "string" ? templateLabel.trim() : "";
  return [...new Set([composed, short, fromExample].filter(Boolean))];
}

// keep an example class-name's trailing segments when re-homing to a new app namespace
function suffixOf(v) {
  const parts = String(v || "").split("-");
  return parts.length >= 3 ? parts.slice(2).join("-") : String(v || "");
}

// the `criteria` map the Jev choice API expects ({ value: label }), blanks/dedupes dropped
function enumOptions(en) {
  return Object.fromEntries([...new Set((en || []).filter(c => c !== "" && c != null))].map(c => [String(c), String(c)]));
}

// A field with no schema enum can still get a menu: the distinct values observed for that field
// across the family's example payloads — a small, short-token vocabulary is Pega's own controlled
// vocabulary (e.g. pyCorrType = Mail/Fax/Email/PhoneText). Returns the candidate list, or null
// when the set is too large/long/sentence-like to be a menu.
export function observedCandidates(values) {
  if (!Array.isArray(values)) return null;
  const uniq = [...new Set(values)];
  if (uniq.length < CORPUS_CHOICE.min || uniq.length > CORPUS_CHOICE.max) return null;
  const ok = uniq.every(v => typeof v === "string" && v.length <= CORPUS_CHOICE.maxLen && v.split(/\s+/).length <= CORPUS_CHOICE.maxWords && !/[.?!]/.test(v));
  return ok ? uniq : null;
}

// ---- 8. deriveValues — batch every `choice` field across all plans into ONE Jev call ----
// Code classifies roles and composes text; Jev only SELECTS (a value is written back only
// when it is a valid schema-enum member). Every field is tagged with its provenance.
export async function deriveValues(goal, targets, { namespace, jevFn = jev } = {}) {
  const perPlan = [];
  for (const { schema = {}, template = {}, examples = [] } of targets) {
    const props = schema.properties || {};
    const autoFill = schema.autoFill || {};
    const values = {}; const provenance = {}; const questions = {}; const enums = {}; const candidatesFrom = {};
    // distinct observed values per field across the family's examples (the corpus vocabulary)
    const observed = {};
    for (const payload of examples) for (const [k, v] of Object.entries(payload || {})) if (typeof v === "string") (observed[k] ||= []).push(v);
    for (const [key, prop] of Object.entries(props)) {
      if (key in autoFill) { provenance[key] = { value: autoFill[key], source: "schema-autofill" }; continue; }
      const role = classifyField(key, prop);
      if (role === "choice") {
        const opts = enumOptions(prop.enum);
        if (Object.keys(opts).length) { questions[key] = { type: "choice", criteria: opts }; enums[key] = prop.enum; candidatesFrom[key] = "enum"; }
      } else if (role === "namespace") {
        const composed = (namespace && template[key]) ? `${namespace}-${suffixOf(template[key])}` : (key in template ? template[key] : undefined);
        if (composed !== undefined) { values[key] = composed; provenance[key] = { value: composed, source: namespace ? "namespace" : "example-default" }; }
      } else if (role === "text" && COMPOSE[key]) {
        values[key] = COMPOSE[key](goal); provenance[key] = { value: values[key], source: "goal-text" };
      } else if (role === "text") {
        const cands = observedCandidates(observed[key]);
        if (cands) { questions[key] = { type: "choice", criteria: Object.fromEntries(cands.map(v => [v, v])) }; enums[key] = cands; candidatesFrom[key] = "corpus"; }
        else if (key in template) provenance[key] = { value: template[key], source: "example-default" };
      } else if (key in template) {
        provenance[key] = { value: template[key], source: "example-default" };
      }
    }
    // one NAME question per plan: Jev picks the best name for the goal (candidates from code + example)
    const nameKeys = Object.keys(props).filter(k => NAME_KEYS.has(k) && !(k in autoFill));
    const nameCands = nameKeys.length ? nameCandidates(goal, template[nameKeys[0]]) : [];
    if (nameCands.length >= 2) { questions.__name = { type: "choice", criteria: Object.fromEntries(nameCands.map(v => [v, v])) }; enums.__name = nameCands; candidatesFrom.__name = "name"; }
    // COMPOSE a container (pySteps, pyProperties, …) from the goal: learn the typed catalog from
    // the examples, Jev selects the entries the goal needs, code emits them (replaces the example's).
    for (const [prop, disc] of Object.entries(CONTAINER_DISCRIMINATORS)) {
      if (!props[prop] || props[prop].type !== "array") continue;
      const items = examples.flatMap(e => Array.isArray(e[prop]) ? e[prop] : []);
      const composedItems = items.length ? await composeContainer(goal, items, { discriminator: disc, jevFn }) : [];
      if (composedItems.length) { values[prop] = composedItems; provenance[prop] = { value: composedItems, source: "goal-composed", count: composedItems.length }; }
      else if (prop in template) provenance[prop] = { value: template[prop], source: "example-default" };
    }
    perPlan.push({ template, values, provenance, questions, enums, candidatesFrom, nameKeys });
  }

  // per-plan context so two plans exposing the same enum key are distinguishable to Jev
  const plans = perPlan.map((pp, i) => ({ skill: targets[i]?.skill ?? null, fields: Object.keys(pp.questions) }));

  const batched = {}; const origin = {};
  perPlan.forEach((pp, i) => {
    for (const [k, q] of Object.entries(pp.questions)) {
      const qid = `p${i}_${k}`;
      const who = plans[i].skill ? `the "${plans[i].skill}" rule` : "this rule";
      const instr = k === "__name"
        ? `Which name best captures ${who} for the build goal (in the state)? Pick one.`
        : `Build goal (in the state): which ${k} should ${who} use? Pick the single best fit.`;
      batched[qid] = { ...q, instructions: instr };
      origin[qid] = { i, k };
    }
  });
  if (Object.keys(batched).length) {
    const r = await jevFn({ state: { goal, plans }, questions: batched });
    for (const [qid, { i, k }] of Object.entries(origin)) {
      const ans = r.answers?.[qid] || {};
      const pp = perPlan[i];
      if (k === "__name") {
        if (ans.choice !== undefined && pp.enums.__name.includes(ans.choice)) {
          for (const nk of pp.nameKeys) { const val = nk === "pyLabel" ? ans.choice : pascalCase(ans.choice); pp.values[nk] = val; pp.provenance[nk] = { value: val, source: "goal-choice", candidatesFrom: "name", confidence: ans.confidence ?? null }; }
        }
        continue;
      }
      if (ans.choice !== undefined && pp.enums[k].includes(ans.choice)) {
        pp.values[k] = ans.choice;
        pp.provenance[k] = { value: ans.choice, source: "goal-choice", candidatesFrom: pp.candidatesFrom[k], confidence: ans.confidence ?? null };
      } else if (k in pp.template) {
        pp.provenance[k] = { value: pp.template[k], source: "example-default" };
      }
    }
  }

  return perPlan.map(pp => {
    const lowConfidence = Object.entries(pp.provenance)
      .filter(([, p]) => p.source === "goal-choice" && typeof p.confidence === "number" && p.confidence < VALUE_FLOOR)
      .map(([k]) => k);
    const valueSources = {};
    for (const p of Object.values(pp.provenance)) valueSources[p.source] = (valueSources[p.source] || 0) + 1;
    return { values: pp.values, provenance: pp.provenance, lowConfidence, valueSources };
  });
}

// ---- 9. the agent-fill loop: emit BLANKS (free-text leaves we couldn't select), accept VALUES ----
// The planner can't write free text (Jev only selects). So it lists the blanks — nested string
// leaves that still hold the EXAMPLE's words — and the calling agent generates them; a second call
// passes `values` back and the tool merges + re-verifies. Code for guarantees, the agent for words.

// set a value at a dotted/indexed path ("pySteps[0].pyParamArray[1].PropertiesName")
export function setByPath(obj, path, value) {
  const parts = [...String(path).matchAll(/[^.[\]]+/g)].map(m => m[0]);
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]; o = o?.[k]; if (o == null) return false; }
  if (o == null) return false;
  const last = parts[parts.length - 1];
  o[/^\d+$/.test(last) ? Number(last) : last] = value;
  return true;
}

// the blanks for a plan: string leaves that are still the example's — inside a goal-composed
// container, and top-level fields we left example-default. Each carries its current (borrowed) value.
export function blanksFor(plan) {
  const out = [];
  const payload = plan.payload || {};
  const walk = (val, path) => {
    const key = path.split(/[.[]/).pop();
    if (typeof val === "string") { if (BLANK_LEAF.test(key)) out.push({ path, example: val }); }
    else if (Array.isArray(val)) val.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (val && typeof val === "object") for (const [k, v] of Object.entries(val)) walk(v, `${path}.${k}`);
  };
  for (const prop of Object.keys(CONTAINER_DISCRIMINATORS))
    if (plan.provenance?.[prop]?.source === "goal-composed" && payload[prop]) walk(payload[prop], prop);
  // EVERY other borrowed array is a blank (list-fill) — not just a hand-picked few. If we didn't
  // author it (goal-composed/choice/text/namespace/autofill/agent) it still holds the example's rows.
  const AUTHORED = new Set(["goal-composed", "goal-choice", "goal-text", "namespace", "schema-autofill", "agent-authored"]);
  for (const [prop, val] of Object.entries(payload)) {
    if (AUTHORED.has(plan.provenance?.[prop]?.source)) continue;
    if (Array.isArray(val) && val.length)
      out.push(typeof val[0] === "object" && val[0]
        ? { path: prop, kind: "entries", count: val.length, fields: Object.keys(val[0]), template: val[0] }
        : { path: prop, kind: "entries", count: val.length, template: val[0] });
  }
  for (const [k, p] of Object.entries(plan.provenance || {}))
    if (p.source === "example-default" && typeof payload[k] === "string" && BLANK_LEAF.test(k)) out.push({ path: k, example: payload[k] });
  // reference blanks: any string leaf naming another rule (validate-activity, when-rule, transform,
  // system id…) is surfaced so the agent points it at a rule that EXISTS (or clears it).
  const refWalk = (val, path) => {
    const key = path.split(/[.[]/).pop();
    const clean = path.replace(/^\./, "");
    if (typeof val === "string") {
      const topKey = clean.split(/[.[]/)[0];
      const ownName = NAME_KEYS.has(topKey) && ["goal-choice", "goal-text", "goal-composed"].includes(plan.provenance?.[topKey]?.source);
      if (val && REFERENCE_LEAF.test(key) && !ownName && !out.some(o => o.path === clean)) out.push({ path: clean, kind: "reference", example: val });
    }
    else if (Array.isArray(val)) val.forEach((v, i) => refWalk(v, `${path}[${i}]`));
    else if (val && typeof val === "object") for (const [k, v] of Object.entries(val)) refWalk(v, `${path}.${k}`);
  };
  refWalk(payload, "");
  return out;
}

// FROZEN plan fill: apply agent values to an EXISTING plan result (not a re-plan), then re-gate
// and re-fit. Re-planning on the 2nd call is nondeterministic (Jev selects differently) and would
// misalign path-keyed fills — so the agent-fill loop MUST operate on the frozen call-1 plan.
export async function fillPlan(result, values) {
  const plans = result.plans || [];
  let n = 0;
  for (const p of plans) {
    if (!p.payload) continue;
    const schema = await loadSchema(p.skill);
    for (const [key, val] of Object.entries(values || {})) {
      const i = String(key).indexOf("|"); if (i < 0 || key.slice(0, i) !== p.ruleType) continue;
      if (setByPath(p.payload, key.slice(i + 1), val)) {
        p.provenance = p.provenance || {};
        const top = key.slice(i + 1).split(/[.[]/)[0];
        p.provenance[top] = { value: p.provenance[top]?.value ?? null, source: "agent-authored" };
        n++;
      }
    }
    const missing = (schema.requiredManual || []).filter(k => !(k in p.payload));
    p.schemaIssues = validateSchema(p.payload, schema);
    p.verify = !schema.hasSchema ? "no-schema" : missing.length ? `missing-required: ${missing.join(",")}` : "required-keys-present";
    p.blanks = blanksFor(p);
  }
  if (plans.length) {
    const scored = await jevValidate(result.query, plans);
    plans.forEach((p, i) => { if (p && p.payload) { p.jevScore = scored[i]?.score ?? null; p.goalFit = scored[i]?.goalFit ?? null; } });
  }
  result.agentFilled = n;
  // persist the filled plan: rewrite the artifact at outPath and re-freeze in the store, so the
  // on-disk plan and the returned plan agree (the un-filled paths would otherwise go stale).
  try {
    if (result.outPath) await writeFile(result.outPath, JSON.stringify(result, null, 2));
    if (result.planId) savePlan(result.planId, result);
  } catch { /* persistence is best-effort; the mutated result is still returned */ }
  return result;
}


// ---- main ----
export async function planPegaBuild({ query, out_dir, contracts_dir, sor_base_url = DEFAULT_SOR_BASE_URL, namespace, expand = false, values }) {
  // read contracts first (methods inform both routing and example choice)
  let openapi = {};
  if (contracts_dir) {
    const files = await readdir(contracts_dir).catch(() => []);
    for (const f of files.filter(f => /\.ya?ml$/.test(f))) {
      const parsed = endpointsFromOpenAPI(await readFile(path.join(contracts_dir, f), "utf8"));
      openapi = { ...openapi, ...parsed };
    }
  }
  const neededMethods = [...new Set(Object.values(openapi).flat())];

  // A) Jev route over ALL authoring families in the Index (corpus-derived, not a curated subset).
  const { flagged, primary: primarySkill, unique } = await routeSkills(query);
  // build order: prerequisites (from the skills-graph REQUIRES edges) before dependents
  const ordered = orderFamilies(expand ? expandFamilies(unique) : unique);

  // B) fetch real examples for the chosen skills, then derive goal values in ONE Jev call
  const order = [];
  for (const skill of ordered) {
    const examples = await extractCreateRule(skill);
    // methodology-* are meta-docs (no create-rule payload) — keep in routedSkills, skip as a plan
    if (!examples.length) { order.push({ skill, kind: "missing" }); continue; }
    const schema = await loadSchema(skill);
    const template = await selectExample(query, examples, { schema, neededMethods });
    // the selected exemplar is the most intent-consistent one, so its OWN container items (pySteps,
    // pyDataSourceList, pyProperties…) seed the composer's catalog first — a data page then wires its
    // Connector source from the exemplar Jev judged closest to the goal, not from whichever sibling
    // example happened to sort first.
    order.push({ skill, kind: "plan", schema, template, examples: [template.payload, ...examples.filter(e => e !== template).map(e => e.payload)] });
  }
  const targets = order.filter(o => o.kind === "plan");
  const derived = await deriveValues(query, targets.map(o => ({ skill: o.skill, schema: o.schema, template: o.template.payload, examples: o.examples })), { namespace });
  targets.forEach((o, i) => Object.assign(o, derived[i]));

  const plans = [];
  for (const o of order) {
    if (o.kind === "missing") { if (!o.skill.startsWith("methodology")) plans.push({ ruleType: o.skill.replace(/^rules-rule-/, ""), skill: o.skill, payload: null, verify: "no example found" }); continue; }
    const filled = fillForSkill(o.skill, { ...o.template.payload, ...o.values }, { baseUrl: sor_base_url, schema: o.schema });
    // ensure pxObjClass (the rule type) is present — from the examples when the schema doesn't carry it
    if (!filled.pxObjClass) { const ex = (o.examples || []).map(e => e.pxObjClass).filter(Boolean); if (ex.length) filled.pxObjClass = ex[0]; }
    // deterministic gate: inject schema auto-fill defaults, then diff the manual-required keys.
    const missing = applySchema(filled, o.schema);
    const schemaIssues = validateSchema(filled, o.schema);
    plans.push({ ruleType: o.skill.replace(/^rules-rule-/, ""), skill: o.skill, sourceExample: o.template.file, payload: filled, schemaRequired: o.schema.requiredManual.length, verify: !o.schema.hasSchema ? "no-schema" : missing.length ? `missing-required: ${missing.join(",")}` : "required-keys-present", schemaIssues, provenance: o.provenance, valueSources: o.valueSources, lowConfidence: o.lowConfidence });
  }

  // C) Jev score each filled payload vs its example (one batch). Guard the empty case: an
  // unroutable goal (no families, or methodology-only) yields no plans, and Jev rejects an
  // empty question set with a 422 — so skip the call and report the plan set as not routable.
  if (plans.length) {
    const scored = await jevValidate(query, plans);
    plans.forEach((p, i) => { if (p && p.payload) { p.jevScore = scored[i]?.score ?? null; p.goalFit = scored[i]?.goalFit ?? null; } });
  }

  // attach the blanks (free-text leaves still holding the example's words) to every plan
  for (const p of plans) if (p.payload) p.blanks = blanksFor(p);

  // agent-fill loop: the caller passes `values` keyed "<ruleType>|<path>"; merge, re-gate, re-fit.
  let agentFilled = 0;
  if (values && typeof values === "object") {
    const schemaOf = new Map(order.filter(o => o.kind === "plan").map(o => [o.skill, o.schema]));
    for (const p of plans) {
      if (!p.payload) continue;
      for (const [key, val] of Object.entries(values)) {
        const i = String(key).indexOf("|"); if (i < 0 || key.slice(0, i) !== p.ruleType) continue;
        if (setByPath(p.payload, key.slice(i + 1), val)) {
          p.provenance = p.provenance || {};
          const top = key.slice(i + 1).split(/[.[]/)[0];
          p.provenance[top] = { value: p.provenance[top]?.value ?? null, source: "agent-authored" };
          agentFilled++;
        }
      }
      p.schemaIssues = validateSchema(p.payload, schemaOf.get(p.skill) || {});
      p.blanks = blanksFor(p);
    }
    if (agentFilled && plans.length) {
      const scored = await jevValidate(query, plans);
      plans.forEach((p, i) => { if (p && p.payload) { p.jevScore = scored[i]?.score ?? null; p.goalFit = scored[i]?.goalFit ?? null; } });
    }
  }

  const result = {
    query,
    neededMethods,
    primary: primarySkill || null,
    routable: plans.length > 0,
    routedSkills: ordered,
    routing: flagged.map(x => ({ skill: x.f, confidence: Number(x.p.toFixed(2)) })),
    agentFilled,
    planId: planIdFor({ query, namespace, expand, contracts_dir }),
    plans,
  };
  if (out_dir) { await mkdir(out_dir, { recursive: true }); }
  const dir = out_dir || await mkdtemp(path.join(os.tmpdir(), "pega-plan-"));
  const outPath = path.join(dir, "pega-plan.json");
  result.outPath = outPath;
  await writeFile(outPath, JSON.stringify(result, null, 2));
  savePlan(result.planId, result); // FREEZE: the 2nd call loads this exact plan
  return result;
}