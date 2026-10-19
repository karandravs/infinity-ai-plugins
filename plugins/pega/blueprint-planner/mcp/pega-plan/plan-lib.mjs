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
const ROUTE = { floor: 0.45, margin: 0.11, cap: 8, tie: 0.05, samples: 3, band: 0.04 }; // recall-oriented shortlist (see routeSkills)
const PICK = { requiredWeight: 5, methodWeight: 1.5, variantPenalty: 0.3, variantRe: /auth|dynamic|grouped/i };
const CORPUS_CHOICE = { min: 2, max: 12, maxLen: 32, maxWords: 4 }; // a small observed vocabulary is a usable menu

const VALUE_FLOOR = 0.5; // goal-choice confidence below this is flagged for review
const PY_ADMIN = new Set([
  "pyRuleAvailable", "pyMethodStatus", "pyRuleSet", "pyRuleSetVersion",
  "pyJavaGenerateAPIVersion", "pyOldActivityType", "pyDisplayMode", "pyBaseClass",
  "pyRuleName", "pxObjClass", "pyAccessGroup", "pyAccessGroupContext",
  // NOTE: pyUsage is deliberately NOT here. It is a free-text "usage note" describing what the
  // rule is for (the obj-class schema even marks it required), so it must be goal-derived like
  // any other purpose text — otherwise a dispute data model ships "Data class for address records".
  // a wire-format flag, not goal text: it says whether the POST body is form-encoded. The
  // corpus exposes it as a two-value "vocabulary" (URL_ENCODED / ""), so a corpus-choice question
  // made Jev stamp URL_ENCODED onto JSON APIs whose body mapping is plainly JSON — a wrong
  // contract. It is derived from the matched operation's request content type instead (see
  // groundIntegration), never picked by the model.
  "pyPOSTDataMappingType",
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

// the same document carries the SOR's identity: its server base URL, title, and the operations it
// exposes. The connector must call the SOR the GOAL names and its endpoint, so we keep the URL to
// stamp into pyEmbeddedURL, the title/stem to match the goal against the right contract, and the
// operations to ground the connector's URL path.
export function contractInfo(text) {
  let doc;
  try { doc = parseYaml(text); } catch { return { paths: {}, baseUrl: null, title: "", operations: [] }; }
  const server = Array.isArray(doc?.servers) ? doc.servers.find(s => s && typeof s.url === "string") : null;
  const paths = endpointsFromOpenAPI(text);
  const operations = [];
  for (const [p, item] of Object.entries(doc?.paths || {})) {
    if (!item || typeof item !== "object") continue;
    for (const [m, o] of Object.entries(item)) {
      if (!HTTP_METHODS.has(m.toLowerCase())) continue;
      const text = [p, o?.operationId, o?.summary, o?.description].filter(Boolean).join(" ");
      const reqProps = refProps(doc, o?.requestBody?.content?.["application/json"]?.schema);
      // a form-encoded request body is the one case that sets pyPOSTDataMappingType=URL_ENCODED;
      // a JSON body must leave the field absent (see PY_ADMIN / groundIntegration).
      const form = Object.keys(o?.requestBody?.content || {}).some(ct => /x-www-form-urlencoded/i.test(ct));
      const status = Object.keys(o?.responses || {}).find(s => /^2/.test(s));
      const resProps = status ? refProps(doc, o.responses[status]?.content?.["application/json"]?.schema) : [];
      operations.push({ path: p, method: m.toUpperCase(), text, reqProps, resProps, form });
    }
  }
  return {
    paths,
    baseUrl: server ? server.url : null,
    title: doc?.info?.title ? String(doc.info.title) : "",
    operations,
  };
}

// the property names a JSON schema (or an array of them) declares — resolving $ref to components.
function refProps(doc, schema) {
  let s = schema;
  if (s && typeof s === "object" && typeof s.$ref === "string") s = doc?.components?.schemas?.[s.$ref.split("/").pop()];
  if (s && typeof s === "object" && s.type === "array" && s.items) return refProps(doc, s.items);
  return s && typeof s === "object" && s.properties ? Object.keys(s.properties) : [];
}

// ---- goal -> contract operation (verb + vocabulary overlap) ----
// The goal's verbs name the HTTP method ("look up" → GET, "issue a refund" → POST); among the
// contract's operations of those methods, the one sharing the most vocabulary with the goal wins.
const OP_STOP = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "on", "in", "into", "from", "with", "by", "that", "this", "it", "its", "up", "back", "new", "our", "api", "rest", "call", "calls", "external", "system"]);
const VERB_METHOD = {
  look: "GET", fetch: "GET", get: "GET", retrieve: "GET", read: "GET", search: "GET", find: "GET", query: "GET", list: "GET", view: "GET",
  submit: "POST", send: "POST", post: "POST", issue: "POST", refund: "POST", extract: "POST", score: "POST", write: "POST",
  update: "PATCH", modify: "PATCH", patch: "PATCH", change: "PATCH",
  delete: "DELETE", remove: "DELETE", cancel: "DELETE",
};
const stem = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const opTokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !OP_STOP.has(w)).map(stem));
export function preferredMethods(goal) {
  const out = new Set();
  for (const w of String(goal || "").toLowerCase().split(/[^a-z]+/)) if (VERB_METHOD[w]) out.add(VERB_METHOD[w]);
  return out;
}
export function bestOperation(goal, contract) {
  const ops = contract?.operations || [];
  if (!ops.length) return null;
  const g = opTokens(goal);
  const wanted = preferredMethods(goal);
  const pool = wanted.size ? ops.filter(o => wanted.has(o.method)) : [];
  const use = pool.length ? pool : ops;
  let best = null, bestScore = -1;
  for (const o of use) {
    const score = [...opTokens(o.text)].filter(t => g.has(t)).length;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}
// WHICH operations a connector must expose. The rule MUST carry all five method array sets (each
// is a required key) but the skill's rule is "populate only the methods you actually use" — the
// builder fills empty stubs for the rest. The template is picked for SCHEMA completeness, so it
// arrives with EVERY method populated (a CRUD example's conditional-update If-Match/etag/body
// mappings); a "look up a transaction and issue a refund" goal would then ship PUT/PATCH/DELETE
// mappings it never calls, borrowed from an unrelated example. Used = the contract operations that
// share vocabulary with the GOAL, plus the best-scoring one; a goal verb the contract does not
// offer (e.g. "write back" against a PATCH endpoint) is still caught by the vocabulary pass.
const METHOD_BLOCK_RE = /^py(GET|POST|PUT|PATCH|DELETE)(RequestHeaders|RequestParameters|RequestData|RequestDataList|ResponseHeaders|ResponseParameters|ResponseDataList)$/;
export function usedMethods(goal, contract) {
  const ops = contract?.operations || [];
  const wanted = preferredMethods(goal);
  if (!ops.length) return wanted;
  const g = opTokens(goal);
  const used = new Set();
  const best = bestOperation(goal, contract);
  if (best) used.add(best.method);
  for (const o of ops) if ([...opTokens(o.text)].some(t => g.has(t))) used.add(o.method);
  return used;
}

// {param} path segments become URL path parameters (mirrors the corpus connector examples).
export function pathParameters(path) {
  return String(path || "").split("/").filter(Boolean)
    .map(seg => ({ pyParameterName: seg, pyMapFrom: "CONSTANT", pyMapFromKey: seg, pyEmptyBehavior: "REQUIRED", pyEncoding: "URL" }));
}

// which contract describes the goal's system of record? Match whole words from the contract's file
// stem and title against the goal (word boundaries, so "risk" never matches "brisk"). No match →
// null and the caller keeps its supplied/default base URL.
export function matchContract(goal, contracts) {
  const g = ` ${String(goal || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best = null, bestScore = 0;
  for (const c of contracts || []) {
    const toks = new Set([...c.stem.split(/[^a-z0-9]+/i), ...c.title.split(/[^a-z0-9]+/i)]
      .filter(t => t.length >= 3).map(t => t.toLowerCase()));
    let score = 0;
    for (const t of toks) if (g.includes(` ${t} `)) score++;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore > 0 ? best : null;
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

// Ground an integration payload in the goal + its contract. A connector's URL path and a rule's
// NAMED REFERENCES (connector / request & response data transform / DT) must be derived from the
// goal, not left borrowed from an unrelated example: a data page "that retrieves transaction data
// from the payments REST connector" must not source from "GetProduct", and a connector "that calls
// the payments API to look up a transaction" must expose the contract's transaction path.
const REFERENCE_NAME_SUFFIX = { pyConnectorName: "", pyReqDataTransform: "Request", pyResDataTransform: "Response", pyDTName: "Transform" };
// a rule's class is the example's placeholder namespace with a GOAL-derived type segment, so the
// rule stops claiming to be about "APIResource"/"MyDataType". Pega system classes are never rehomed.
const SYSTEM_CLASS = /^(@baseclass|Code-Pega|Pega-|Pega$|Rule-|Web-|Embed-|px)/i;
export function groundIntegration(payload, { goal, contract, templateClass } = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const base = conciseName(goal, pascalCase(composeLabel(goal)));
  const typeSeg = conciseName(goal, "");
  const walkName = (val) => {
    if (Array.isArray(val)) { val.forEach(walkName); return; }
    if (!val || typeof val !== "object") return;
    for (const [k, v] of Object.entries(val)) {
      if (typeof v === "string" && k in REFERENCE_NAME_SUFFIX && v) val[k] = base + REFERENCE_NAME_SUFFIX[k];
      else walkName(v);
    }
  };
  walkName(payload);
  const op = bestOperation(goal, contract);
  const used = usedMethods(goal, contract);
  if (payload.pyEmbeddedURL && typeof payload.pyEmbeddedURL === "object" && (contract?.operations || []).length) {
    if (op) payload.pyEmbeddedURL.pyResourcePathParameters = pathParameters(op.path);
    // the description states what THIS connector does: the endpoints the goal needs. Listing every
    // endpoint the SOR offers (a refund connector advertising the transaction lookup and the
    // dispute update) describes a different connector — and the judge reads the description as the
    // connector's purpose. The goal is kept so the purpose is stated, not just the URL.
    const listed = contract.operations.filter(o => !used.size || used.has(o.method)).slice(0, 6)
      .map(o => `${o.method} ${o.path}`).join(", ");
    const sor = contract.title || "external system";
    payload.pyDescription = listed ? `REST connector to the ${sor}: ${listed}. ${goal}` : `REST connector to the ${sor}. ${goal}`;
    // the POST body wire format follows the SOR's contract: URL_ENCODED only for a form-encoded
    // request body, absent for the (overwhelmingly common) JSON body. An example's URL_ENCODED flag
    // must not ride along onto a JSON API — that is a contract the connector cannot honour.
    if (op && op.form) payload.pyPOSTDataMappingType = "URL_ENCODED";
    else delete payload.pyPOSTDataMappingType;
  }
  // empty the method blocks the goal does not use: the keys stay (all five sets are required) but
  // their borrowed example mappings go, leaving the empty stub the builder expects. Only when the
  // goal/contract name the methods to keep — otherwise leave the template untouched.
  if ("pyEmbeddedURL" in payload && used.size) {
    for (const k of Object.keys(payload)) {
      const m = METHOD_BLOCK_RE.exec(k);
      if (m && Array.isArray(payload[k]) && !used.has(m[1])) payload[k] = [];
    }
  }
  // rehome the rule's class (and every class field that held the same example placeholder) so the
  // rule stops claiming to be about "APIResource"/"MyDataType" and reflects the goal's domain.
  const top = payload.pyClassName;
  if (typeof top === "string" && top && !SYSTEM_CLASS.test(top) && typeSeg) {
    const segs = top.split("-");
    if (segs.length >= 2) {
      const cls = [...segs.slice(0, -1), typeSeg].join("-");
      const placeholder = templateClass || top;
      const walkClass = (val) => {
        if (Array.isArray(val)) { val.forEach(walkClass); return; }
        if (!val || typeof val !== "object") return;
        for (const [k, v] of Object.entries(val)) {
          if (typeof v === "string" && /(ClassName|Class)$/.test(k)) { if (v === placeholder && !SYSTEM_CLASS.test(v)) val[k] = cls; }
          else walkClass(v);
        }
      };
      payload.pyClassName = cls;
      walkClass(payload);
    }
  }
  // a JSON data transform's mapping should move the CONTRACT's real fields, not sit on a bare
  // "automap" comment: derive SET mappings from the matched operation's request/response schema.
  if (payload.pyMappingModel && typeof payload.pyMappingModel === "object" && contract) {
    const mapping = integrationMappings(goal, contract);
    if (mapping) {
      payload.pyMappingModel.pyProperties = mapping.props;
      payload.pyMappingModel.pyAutomapAll = "false";
      for (const pr of Array.isArray(payload.pyParameters) ? payload.pyParameters : []) {
        if (pr && pr.pyParametersParamName === "executionMode") pr.pyParametersParamDefaultValue = mapping.request ? "SERIALIZE" : "DESERIALIZE";
      }
    }
  }
  return payload;
}

// the SET mappings a data transform needs to move the contract's fields on/off the clipboard. A
// "request" transform (clipboard → JSON payload) uses the operation's request body; otherwise the
// response body (JSON → clipboard). Property names follow Pega's .py<PascalCase(field)> convention.
function integrationMappings(goal, contract) {
  const op = bestOperation(goal, contract);
  if (!op) return null;
  const request = /\brequest\b/i.test(String(goal)) && !/\bresponse\b/i.test(String(goal));
  const fields = (request ? op.reqProps : op.resProps) || [];
  if (!fields.length) return null;
  const props = fields.slice(0, 16).map(f => ({
    pxObjClass: "Embed-MappingParams", pyActionName: "SET", pyElementType: "Objects",
    pyPropertiesName: `.py${pascalCase(f)}`, pyPropertiesValue: f,
  }));
  return { request, props };
}

// ---- grounding for non-integration rules ----
// The judge (and the builder) read the payload as "what THIS rule is". When a goal names the rule's
// own domain content — the stages of a case type, the duration of an SLA — that must land in the
// payload. Left alone it carries the EXAMPLE's words (Create/Fulfillment/Completed, a 1-day goal),
// which describes a different rule. These derivations are structural (a named list, a duration),
// never a lookup of specific goals.

export function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

// "a, b and c" / "a, b, and c" / "a; b; c" -> ["a","b","c"]
export function splitEnumeration(s) {
  return String(s || "")
    .split(/\s*,\s*|\s*;\s*|\s+and\s+|\s+or\s+/i)
    .map(x => x.trim().replace(/^(?:and|or)\s+/i, "").replace(/[.;:]+$/, "").trim())
    .filter(Boolean);
}

// the stages a goal names: "with stages for intake, investigation, and resolution" -> [Intake, …].
// No named list (e.g. "with two lifecycle stages") -> [] and the example's stages are kept.
export function goalStageNames(goal) {
  const m = String(goal || "").match(/\bstages?\s*(?:for|of|:)\s*([^.;:]+)/i);
  if (!m) return [];
  const names = splitEnumeration(m[1]).filter(w => w.length <= 40 && w.split(/\s+/).length <= 4);
  return names.length >= 2 ? names.map(titleCase) : [];
}

// Ground a case type's lifecycle in the goal: the goal's stage names replace the example's, on the
// example's structural scaffold (valid IDs / transitions / terminal flags).
export function groundCaseTypeStages(payload, goal) {
  const names = goalStageNames(goal);
  if (!payload || names.length < 2) return false;
  const stages = Array.isArray(payload.pyStages) ? payload.pyStages : [];
  if (!stages.length) return false;
  payload.pyStages = names.map((label, i) => {
    const st = JSON.parse(JSON.stringify(stages[Math.min(i, stages.length - 1)]));
    st.pyStageID = `PRIM${i}`;
    st.pyStageName = label;
    const first = i === 0, last = i === names.length - 1;
    st.pyIsInitializationStage = first ? "true" : "false";
    st.pyIsTerminalStage = last ? "true" : "false";
    if (last) {
      st.pyStageTransition = "resolution";
      st.pyStageWorkStatus = st.pyStageWorkStatus || "Resolved-Completed";
      st.pyCleanupProcess = "true";
      delete st.pyStageEntryStatus;
    } else {
      st.pyStageTransition = "automatic";
      delete st.pyStageWorkStatus;
      delete st.pyCleanupProcess;
      if (!first && !st.pyStageEntryStatus) st.pyStageEntryStatus = "Open-InProgress";
      else if (first) delete st.pyStageEntryStatus;
    }
    if (Array.isArray(st.pyProcesses)) for (const pr of st.pyProcesses) { pr.pyLabel = label; pr.pyFlowName = label; }
    return st;
  });
  payload.pyStageIDMax = String(names.length);
  return true;
}

// Ground a property in the goal: its NAME is the rule's own identity, and its page/link fields must
// agree with its mode. An exemplar's "LinkedEnhancement : PegaProjMgmt-Work-Enhancement" page is a
// different rule; on a non-page property an exemplar's Page fields are plain leakage.
export function groundObjectProperty(payload, goal) {
  if (!payload || typeof payload !== "object") return [];
  const authored = [];
  const name = conciseName(goal, "");
  if (name) { payload.pyPropertyName = name; authored.push("pyPropertyName"); }
  const pageMode = /^(Page|PageList|PageGroup)$/.test(String(payload.pyPropertyMode || ""));
  if (pageMode && payload.pyClassName) {
    payload.pyPageClass = payload.pyClassName; authored.push("pyPageClass");
    delete payload.pyDataObject; delete payload.pyDOParamList; delete payload.pyDOKeyList;
  } else {
    for (const k of ["pyPageClass", "pyDataObject", "pyDataObjectClass", "pyDOParamList", "pyDOKeyList", "pyDataRetrievalType"]) delete payload[k];
  }
  // attachment/validation leftovers belong to the exemplar, not to any property in this goal
  delete payload.pyCategoryName; delete payload.pyEditValidate;
  return authored;
}

// the decision factors a goal names: "routes disputes by risk band and amount" -> [risk band,
// amount]. A decision table decides on named conditions; they come from the goal, not the exemplar
// (whose locale/date-format columns describe a totally different decision).
export function goalDecisionFactors(goal) {
  const m = String(goal || "").match(/\b(?:by|based on|using)\s+([^.;:]+)/i);
  if (!m) return [];
  return splitEnumeration(m[1]).filter(w => w.length <= 40 && w.split(/\s+/).length <= 4);
}

// Ground a decision table's condition columns in the goal's factors.
export function groundDecisionTable(payload, goal) {
  const factors = goalDecisionFactors(goal);
  if (!payload || !factors.length) return [];
  const prop = f => "." + f.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  payload.pyColumns = factors.map(f => ({ pyProperty: prop(f), pyPropertyLabel: titleCase(f), pyColumnDataType: "text", pyCondition: [] }));
  payload.pyPropertyColumns = factors.map(f => ({ pyProperty: prop(f), pyPropertyLabel: titleCase(f), pyPropertyValues: [], pyDefaultPropertySetOperator: "=" }));
  // the exemplar's result rows belong to the exemplar's conditions — drop them with the columns.
  delete payload.pyResults; delete payload.pyDefaultResultPropSet;
  return ["pyColumns", "pyPropertyColumns"];
}

// per-family dispatch: names the rule's OWN content from the goal; returns the grounded top-level
// keys so provenance can record them as goal-derived (the agent then does not re-fill them).
export function groundPlan(payload, { goal, skill } = {}) {
  const grounded = [];
  const fam = String(skill || "");
  if (fam.endsWith("obj-casetype") && groundCaseTypeStages(payload, goal)) grounded.push("pyStages");
  if (fam.endsWith("obj-servicelevel") && groundServiceLevel(payload, goal)) grounded.push("pyGoalDefaultDays");
  if (fam.endsWith("obj-property")) grounded.push(...groundObjectProperty(payload, goal));
  if (fam.endsWith("declare-decision-table")) grounded.push(...groundDecisionTable(payload, goal));
  return grounded;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };

// the duration a goal states, in days: "after five days" -> 5, "1-business-day" -> 1, "within 2
// hours" -> 0.083. Null when the goal states no duration.
export function goalDurationDays(goal) {
  const m = String(goal || "").match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)[\s-]*(?:(?:business|working)[\s-]+)?(day|days|week|weeks|month|months|hour|hours|minute|minutes)\b/i);
  if (!m) return null;
  const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("hour")) return n / 24;
  if (unit.startsWith("minute")) return n / 1440;
  if (unit.startsWith("week")) return n * 7;
  if (unit.startsWith("month")) return n * 30;
  return n;
}

// Ground an SLA in the goal's duration: an escalation "after five days" must set a five-day goal,
// not keep the example's one day.
export function groundServiceLevel(payload, goal) {
  const d = goalDurationDays(goal);
  if (!payload || d == null || !("pyGoalDefaultDays" in payload)) return false;
  payload.pyGoalDefaultDays = String(Math.floor(d));
  payload.pyGoalDefaultHours = String(Math.round((d % 1) * 24));
  payload.pyGoalDefaultMinutes = "0";
  payload.pyGoalDefaultSeconds = "0";
  return true;
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

// the goal as a plain STATEMENT of what the rule is for (leading imperative verb dropped and the
// result capitalised), for purpose/usage text that describes THIS rule rather than an example's.
export function goalStatement(goal) {
  const s = String(goal || "").trim().replace(/^\s*(send|create|add|build|schedule|define|author|map|validate|write|configure|set|make|design|implement|provide|extend|enable|allow|support)\b[:\s]*/i, "");
  return s ? s[0].toUpperCase() + s.slice(1) : String(goal || "");
}

export function composeLabel(goal) {
  const stripped = String(goal).trim().replace(/^\s*(send|create|add|build|schedule|define|author|map|validate|write)\b[:\s]*/i, "");
  const titled = stripped.split(/\s+/).filter(Boolean).slice(0, 5)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return titled || "Auto-generated rule";
}

// a rule's IDENTITY name (pyServiceName/pyModelName/pyPageName) — like pyLabel it must be derived
// from the goal, never borrowed from another family's example or offered as a Jev menu of unrelated
// example names (a "retrieves transaction data" page must not be named D_AllPlayerGameSessions).
// composeLabel keeps the first words verbatim (good for a display label); a rule name wants the
// DOMAIN words only, so leading verbs, stopwords, and generic rule-type nouns are dropped.
const NAME_STOP = new Set(["a", "an", "the", "that", "which", "to", "and", "or", "of", "for", "on", "onto", "from", "with", "in", "into", "by", "is", "it", "its", "this", "these", "those", "as", "at", "be", "are", "using", "use", "then", "when", "where", "so", "can", "should", "must", "calls", "call"]);
const NAME_GENERIC = new Set(["send", "create", "add", "build", "define", "author", "map", "maps", "validate", "write", "schedule", "response", "request", "data", "transform", "page", "rest", "connector", "json", "api", "case", "properties", "property", "payload", "fields", "field"]);
export function conciseName(goal, fallback = "") {
  const words = String(goal || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter(w => w && !NAME_STOP.has(w) && !NAME_GENERIC.has(w));
  const name = words.map(w => w[0].toUpperCase() + w.slice(1)).join("").slice(0, 48);
  return name || fallback;
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
  // a rule's "usage"/purpose text must state what THIS rule is for. Left to the example it reads
  // "Data class for address records" on a dispute data model — a different rule's words.
  pyUsage: (goal) => goalStatement(goal),
  // rule-identity names: the rule's own name, derived from the goal (family-appropriate convention)
  pyServiceName: (goal) => conciseName(goal, pascalCase(composeLabel(goal))),
  pyModelName: (goal) => conciseName(goal, pascalCase(composeLabel(goal))),
  pyPageName: (goal) => "D_" + conciseName(goal, pascalCase(composeLabel(goal))),
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
// class, not a rule, so they are deliberately not references. pyHandlerFlow names the connector's
// error-handler FLOW and pyAuthenticationProfile* name a Rule-Connect-AuthProfile — both are real
// rule references the sample carries; pyModelName names another Rule-Obj-Model when it appears on a
// pyProperties row (an APPLY_MODEL step), which is why it is guarded against the rule's own name.
const REFERENCE_LEAF = /(pyValidateActivity|pyLocalActionActivity|pyPreProcessingActivity|pyPreProcessingTransformRule|pyActionTransformRule|pyWhenRule|pyActionWhen|pyIntegrationSystemId|pyActivityName|pyStreamName|pyFlowName|pyHandlerFlow|pyAuthenticationProfile|pyAuthenticationProfileForSetting|pyModelName|pyImplementation|pyExpression|pyConnectorName|pyReqDataTransform|pyResDataTransform|pyDTName|pyPostActivity|pyLoadActivity)$/;
// keys whose value IS this rule's own name — a reference only when NESTED (an APPLY_MODEL row's
// pyModelName names a different data transform; the rule-root pyModelName names this one).
const SELF_NAME_KEYS = new Set(["pyRuleName", "pyLabel", "pyServiceName", "pyModelName", "pyPageName", "pyActivityName", "pyStreamName", "pyPurpose", "pyEmailTemplateName"]);

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
      } else if (role === "text" && COMPOSE[key] && (key !== "pyUsage" || key in template || (schema.requiredManual || []).includes(key))) {
        // pyUsage is a family-specific "usage note": compose it only where the rule family carries
        // one (or the schema requires it) — e.g. a ruleset-name's pyUsage holds a ruleset name
        // convention, not a goal statement. Other COMPOSE text is a rule's own description and is
        // filled wherever the schema declares it.
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
        const conf = ans.confidence ?? null;
        // A below-floor guess is not a decision: the model itself rates it < VALUE_FLOOR. Keep the
        // exemplar's value (it was selected for intent-fit) instead of letting an unconfident enum
        // guess replace it — and record the attempt so it is still flagged for review.
        const keepExample = typeof conf === "number" && conf < VALUE_FLOOR && (k in pp.template);
        pp.values[k] = keepExample ? pp.template[k] : ans.choice;
        pp.provenance[k] = {
          value: pp.values[k], source: keepExample ? "example-default" : "goal-choice",
          candidatesFrom: pp.candidatesFrom[k], confidence: conf,
          ...(keepExample ? { attemptedChoice: ans.choice } : {}),
        };
      } else if (k in pp.template) {
        pp.provenance[k] = { value: pp.template[k], source: "example-default" };
      }
    }
  }

  return perPlan.map(pp => {
    const lowConfidence = Object.entries(pp.provenance)
      .filter(([, p]) => p.attemptedChoice !== undefined || (p.source === "goal-choice" && typeof p.confidence === "number" && p.confidence < VALUE_FLOOR))
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
      const selfName = SELF_NAME_KEYS.has(key) && !/[.[]/.test(clean);
      if (val && REFERENCE_LEAF.test(key) && !ownName && !selfName && !out.some(o => o.path === clean)) out.push({ path: clean, kind: "reference", example: val });
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
  const contracts = [];
  if (contracts_dir) {
    const files = (await readdir(contracts_dir).catch(() => [])).filter(f => /\.ya?ml$/.test(f)).sort();
    for (const f of files) {
      const info = contractInfo(await readFile(path.join(contracts_dir, f), "utf8"));
      openapi = { ...openapi, ...info.paths };
      contracts.push({ stem: f.replace(/\.ya?ml$/, ""), title: info.title, baseUrl: info.baseUrl, operations: info.operations });
    }
  }
  const neededMethods = [...new Set(Object.values(openapi).flat())];
  // stamp the base URL of the SOR the GOAL names (its contract's server URL); fall back to the
  // supplied/default demo SOR base when no contract matches.
  const matched = matchContract(query, contracts);
  const baseUrl = matched?.baseUrl || sor_base_url;

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
    const filled = groundIntegration(fillForSkill(o.skill, { ...o.template.payload, ...o.values }, { baseUrl, schema: o.schema }), { goal: query, contract: matched, templateClass: o.template.payload.pyClassName });
    // ground the rule's OWN domain content in the goal (stages, durations…), then record it as
    // goal-derived so the agent-fill loop does not treat it as borrowed example content.
    for (const k of groundPlan(filled, { goal: query, skill: o.skill })) o.provenance[k] = { value: filled[k], source: "goal-composed" };
    // ensure pxObjClass (the rule type) is present — from the examples when the schema doesn't carry it
    if (!filled.pxObjClass) { const ex = (o.examples || []).map(e => e.pxObjClass).filter(Boolean); if (ex.length) filled.pxObjClass = ex[0]; }
    // deterministic gate: inject schema auto-fill defaults, then diff the manual-required keys.
    const missing = applySchema(filled, o.schema);
    // grounding may drop a key that does not belong on this rule (e.g. an example's
    // pyPOSTDataMappingType on a JSON API): keep provenance honest by dropping entries whose key
    // is no longer in the payload.
    for (const k of Object.keys(o.provenance || {})) if (!(k in filled)) delete o.provenance[k];
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