// validate-lib.mjs — REAL structural validation of a rule payload against its corpus JSON schema.
//
// The corpus schemas are draft 2020-12 documents that lean on three things a hand-written property
// walker cannot see: `$ref` (29/37 schemas — a stage's, a column's, a parameter's shape lives in
// `$defs`), `pattern` (22/37 — version ids, property paths, max lengths) and `allOf` (15/37 — the
// composed platform constraints). A walker that only reads inline `properties`/`required` therefore
// reported "structurally valid" for payloads the platform rejects. This module asks the schema
// itself, with AJV — the same 2020-12 semantics the corpus declares — instead of reinterpreting it.
//
// Shipped module: reads schemas, never writes anything, no network, no state beyond the compiled
// validator cache (a pure function of the schema).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// `strict: false` because the corpus carries its own annotations (`x-pega-autoFill`,
// `x-pega-autoDerived`, `x-pega-…`) which are keywords AJV does not know — they document what Pega
// supplies, they are not constraints to enforce. `allErrors: true` so one pass reports every problem
// (the agent-fill loop wants the whole list, not the first one).
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

// AJV registers a schema by its `$id` and refuses a second registration of the same id, so the same
// corpus schema must reuse the validator compiled from it (it is parsed repeatedly: the startup
// compile check, the per-plan gate, a caller validating its own copy). The cache key is the `$id`
// PLUS a hash of the document body: keying on `$id` alone would let a DIFFERENT document that reuses
// an id silently answer with the first one's validator. With the body in the key that case is a
// cache miss, and AJV then reports the duplicate id loudly instead of validating against the wrong
// schema. A schema with no `$id` (a caller's inline fixture) is cached by body, which is safe
// because AJV registers nothing for it.
const validators = new Map(); // cacheKey -> (payload) => boolean
const suppliedKeys = new Map(); // cacheKey -> Set<key> (platform-supplied keys per document)

function bodyHash(value) {
  try {
    return createHash("sha1").update(JSON.stringify(value) ?? "").digest("hex");
  } catch {
    return null; // circular / unserialisable: do not cache, do not pretend to know its identity
  }
}

function cacheKey(schema) {
  const hash = bodyHash(schema);
  if (!hash) return null;
  return `${typeof schema?.$id === "string" ? schema.$id : ""}#${hash}`;
}

function compile(schema) {
  const key = cacheKey(schema);
  if (key && validators.has(key)) return validators.get(key);
  const validate = ajv.compile(schema);
  if (key) validators.set(key, validate);
  return validate;
}

// Every key the schema document marks `x-pega-autoFill` / `x-pega-autoDerived`, at any depth: a
// top-level pyRuleName, or a nested embedded page's pxObjClass — supplied by Pega at create time,
// never by the caller. Memoised with the validator cache: the answer is a pure function of the
// document, and the same document is asked on every plan of that family.
export function platformSuppliedKeys(schema) {
  const none = new Set();
  if (!schema || typeof schema !== "object") return none;
  const key = cacheKey(schema);
  if (key && suppliedKeys.has(key)) return suppliedKeys.get(key);
  const keys = new Set();
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const [k, prop] of Object.entries(node.properties || {}))
      if (prop && typeof prop === "object" && (prop["x-pega-autoDerived"] || prop["x-pega-autoFill"] !== undefined)) keys.add(k);
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v);
  };
  walk(schema);
  if (key) suppliedKeys.set(key, keys);
  return keys;
}

// AJV reports JSON pointers (`/pyColumns/0`); callers and the plan's `schemaIssues` speak dotted
// paths (`pyColumns[0]`), which is what `blanksFor`/`setByPath` use too. A missing property is a
// property of the OBJECT in AJV's pointer (instancePath points at the parent, the name is in
// `params.missingProperty`), so the path is extended to name the key that is actually missing.
function toPath(err) {
  let pointer = String(err.instancePath || "");
  const missing = err.keyword === "required" ? err.params?.missingProperty : null;
  if (missing) pointer += "/" + String(missing).replace(/~/g, "~0").replace(/\//g, "~1");
  const segments = pointer.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let out = "";
  for (const segment of segments) out += /^\d+$/.test(segment) ? `[${segment}]` : (out ? `.${segment}` : segment);
  return out || "(root)";
}

// The concrete values behind the keyword, so the message is actionable on its own: which key is
// missing, which values were allowed. (AJV's own text names the missing key but never the enum.)
function detail(err) {
  const p = err.params || {};
  if (err.keyword === "required" && p.missingProperty) return ` — missing key ${JSON.stringify(p.missingProperty)}`;
  if (err.keyword === "enum" && Array.isArray(p.allowedValues))
    return ` — allowed: ${p.allowedValues.map((v) => JSON.stringify(v)).join(", ")}`;
  return "";
}

function formatError(err) {
  return `${toPath(err)}: ${err.message}${detail(err)} (${err.keyword})`;
}

// Validate a payload against a PARSED schema object → `string[]` of
// "<dotted path>: <message>[ — detail] (<keyword>)".
// `ignoreRequiredFor` (optional Set): the keys Pega supplies. ONLY a `required` error for one of
// them is excused — a wrong-typed / const / enum / pattern value on the same key is a real defect
// of the payload and must surface.
// Never throws: a schema that cannot compile, or a validator that blows up on hostile input, is
// reported as a single issue — a planner must not die on the document it was asked to check.
export function validatePayload(payload, schema, { ignoreRequiredFor } = {}) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return ["(schema): not a JSON schema object"];
  let validate;
  try {
    validate = compile(schema);
  } catch (e) {
    return [`(schema): cannot compile: ${String(e.message || e).slice(0, 240)}`];
  }
  let valid;
  try {
    valid = validate(payload);
  } catch (e) {
    return [`(payload): validator threw: ${String(e.message || e).slice(0, 240)}`];
  }
  if (valid) return [];
  const excused = ignoreRequiredFor instanceof Set ? ignoreRequiredFor : null;
  return (validate.errors || [])
    // `if` is a branch marker, not a constraint: when a then/else branch fails AJV also reports the
    // `if` error, and the real violation is reported beside it. Dropping it keeps the list readable.
    .filter((e) => e.keyword !== "if")
    .filter((e) => !(excused && e.keyword === "required" && excused.has(e.params?.missingProperty)))
    .map(formatError);
}

// Every `skills/<skill>/schema/*.json` under a corpus root, sorted for a stable report.
function schemaFiles(dir, failed) {
  const out = [];
  const skills = path.join(dir, "skills");
  if (!existsSync(skills)) {
    failed.push({ file: dir, error: "missing-skills: the corpus root has no skills/ directory, so no schema could be compiled" });
    return out;
  }
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json") && path.basename(path.dirname(full)) === "schema") out.push(full);
    }
  };
  walk(skills);
  return out.sort();
}

// The startup/test check: does every schema the planner relies on actually compile under the
// dialect it declares? → `{ ok, failed: [{ file, error }] }`. A schema that does not compile is a
// corpus bug that would otherwise surface as a silent "no issues" on every payload — and a corpus
// root that does not exist is a failure, never an empty success.
export function compileAllSchemas(corpusDir) {
  const out = { ok: 0, failed: [] };
  if (!corpusDir || !existsSync(corpusDir))
    return { ok: 0, failed: [{ file: String(corpusDir), error: "missing-root: no such corpus directory" }] };
  for (const file of schemaFiles(corpusDir, out.failed)) {
    let schema;
    try {
      schema = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      out.failed.push({ file, error: `invalid JSON: ${String(e.message || e).slice(0, 240)}` });
      continue;
    }
    try {
      compile(schema);
      out.ok++;
    } catch (e) {
      out.failed.push({ file, error: String(e.message || e).slice(0, 240) });
    }
  }
  return out;
}
