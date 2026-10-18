#!/usr/bin/env node
// verify-blueprint.mjs — an offline, deterministic PROOF of the Blueprint recipe layer's contract.
//
// The live site (pega.com/blueprint) cannot be exercised headlessly right now, so this verifies
// everything about the layer that is knowable WITHOUT a browser or network:
//
//   1. REFERENCES RESOLVE — every blueprint/*.{cjs,mjs} recipe parses (syntax), and every file,
//      helper package, OpenAPI contract and spawned sibling it references actually exists.
//   2. SELECTORS — the selectors the recipes drive are non-empty strings.
//   3. SECTION COVERAGE — the ordered create -> complete chain covers the Blueprint sections
//      (context wizard, case type, systems/OpenAPI, personas, summary), and the full recipe set
//      additionally covers the data model (fields) and case-lifecycle steps.
//   4. NO DEAD STEPS — no TODO/placeholder markers, no duplicate function defs, no helper defined
//      but never called.
//   5. ARTIFACT -> RULE FAMILY MAPPING — each Blueprint artifact maps onto a planner rule family
//      that ACTUALLY EXISTS in the planner's own corpus (mcp/pega-plan + the index manifest).
//      The map is grounded, never invented: the family names come from the corpus, and the
//      family -> ruleType derivation is read from plan-lib.mjs itself.
//
// WHAT THIS CANNOT PROVE (stated honestly, see docs/blueprint-proof.md): that the live
// pega.com/blueprint DOM still matches these selectors, that Sign-in/agreement/Create/OpenAPI
// import actually succeed, or that Pega persists the result. Those genuinely need a live CDP
// browser session (the eval-recipes.cjs path).
//
// NO network. NO browser. NO Jev. Deterministic.
//
// Run:  node blueprint/verify-blueprint.mjs     (exit 0 == every assertion passed)

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // .../blueprint
const ROOT = path.resolve(__dirname, "..");                     // pega-automated/
const SELF = path.basename(fileURLToPath(import.meta.url));      // never analyze ourselves
const CORPUS = path.join(ROOT, "index", "pega-infinity-ai-plugins-resources-26-1");
const PLAN_LIB = path.join(ROOT, "mcp", "pega-plan", "plan-lib.mjs");
const CONTRACTS = path.join(ROOT, "contracts");
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

// ---------------------------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------------------------
const results = [];
const fail = (name, note = "") => { results.push({ name, ok: false, note }); return false; };
const pass = (name, note = "") => { results.push({ name, ok: true, note }); return true; };
const check = (name, ok, note = "") => (ok ? pass(name, note) : fail(name, note));
const sec = (t) => console.log(`\n\u2500\u2500 ${t} ${"\u2500".repeat(Math.max(0, 72 - t.length))}`);

// ---------------------------------------------------------------------------------------------
// 0. inventory: the recipe files (the layer under test)
// ---------------------------------------------------------------------------------------------
const RECIPE_RE = /\.(cjs|mjs)$/;
const recipeFiles = readdirSync(__dirname)
  .filter((f) => RECIPE_RE.test(f) && f !== SELF && statSync(path.join(__dirname, f)).isFile())
  .sort();

// the Blueprint sections the recipes fill, keyed by a signature token set (selectors + labels)
const SECTIONS = [
  { id: "create",      label: "Context wizard / create", tokens: ["Create a Blueprint", "Create an Application Blueprint", "#purpose-combobox", "#description", "generate-deep-thinking:split-button:default-button"] },
  { id: "case-type",   label: "Case type",               tokens: ["Add a Case Type", "#case-type-name", "#case-type-description"] },
  { id: "data-model",  label: "Data model / fields",     tokens: ["Add a Field", "#field-name-create", "#field-type-create", "#field-description-create", "#checkbox-primary-create", "Case Data Model"] },
  { id: "systems",     label: "Systems / OpenAPI",       tokens: ["Add System", "#edit-sor-name", "#edit-sor-description", "#data-schemas", "#integration-sor", "#integration-resource"] },
  { id: "personas",    label: "Personas",                tokens: ["Add a Persona", "#persona-name-default", "#persona-description-default"] },
  { id: "lifecycle",   label: "Case lifecycle / steps",  tokens: ["Case Lifecycle", "#lifecycle-step-fields-modal-notes"] },
  { id: "summary",     label: "Summary",                 tokens: ["SUMMARY reached", "SUMMARY:", "Summary$"] },
];

// the ordered "create -> complete" chain (numeric recipe prefix)
const chain = recipeFiles.filter((f) => /^recipe\d+-/.test(f));

// ---------------------------------------------------------------------------------------------
// static extractors (string/regex based — deterministic, no execution)
// ---------------------------------------------------------------------------------------------
const STR_CALL_RE = /\b(?:locator|querySelectorAll|querySelector|getByText|setInputFiles)\s*\(\s*(['"`])([\s\S]*?)\1/g;
const REQUIRE_RE = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const FUNCTION_RE = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const SPAWN_RE = /\brun\s*\(\s*(['"])([^'"]+\.(?:cjs|mjs))\1/g;
const SCREENSHOT_RE = /screenshot\s*\(\s*\{\s*path\s*:\s*(['"])([^'"]+)\1/g;
const ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const ARGV_RE = /process\.argv\.(?:slice\s*\(\s*2\s*\)|\[(\d+)\])/g;
const YAML_RE = /(['"])([A-Za-z0-9_-]+\.ya?ml)\1/g;
// placeholder markers; XXX only as a standalone token (not the `BP-xxx` usage example)
const DEAD_MARKER_RE = /\b(TODO|FIXME|PLACEHOLDER|HACK)\b|(?<![-\w])XXX\b/i;

function matchAll(src, re) { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(src))) out.push(m); return out; }

function extractSelectors(src) {
  const out = [];
  for (const m of matchAll(src, STR_CALL_RE)) out.push(m[2]);
  return out;
}
function extractRequires(src) {
  return [...new Set(matchAll(src, REQUIRE_RE).map((m) => m[2]))];
}
function countCalls(src, name) {
  return matchAll(src, new RegExp(`\\b${name}\\s*\\(`, "g")).length;
}
function fileSections(src) {
  return SECTIONS.filter((s) => s.tokens.some((t) => src.includes(t))).map((s) => s.id);
}

// ---------------------------------------------------------------------------------------------
// read every recipe
// ---------------------------------------------------------------------------------------------
const recipes = recipeFiles.map((file) => {
  const abs = path.join(__dirname, file);
  const src = readFileSync(abs, "utf8");
  return {
    file, abs, src,
    bytes: Buffer.byteLength(src),
    selectors: extractSelectors(src),
    requires: extractRequires(src),
    sections: fileSections(src),
    helpers: [...new Set(matchAll(src, FUNCTION_RE).map((m) => m[1]))],
    screenshots: matchAll(src, SCREENSHOT_RE).map((m) => m[2]),
    env: [...new Set(matchAll(src, ENV_RE).map((m) => m[1]))],
    spawns: [...new Set(matchAll(src, SPAWN_RE).map((m) => m[2]))],
    yamls: [...new Set(matchAll(src, YAML_RE).map((m) => m[2]))],
    argvs: matchAll(src, ARGV_RE).map((m) => m[0].trim()),
  };
});

console.log("Blueprint layer — offline contract proof");
console.log(`repo:   ${ROOT}`);
console.log(`recipes: ${recipes.length}  (${recipeFiles.join(", ")})`);

// ---------------------------------------------------------------------------------------------
// 1. references resolve
// ---------------------------------------------------------------------------------------------
sec("1. references resolve");

const syntaxFail = [];
for (const r of recipes) {
  try { new vm.Script(r.src, { filename: r.file }); }
  catch (e) { syntaxFail.push(`${r.file}: ${String(e.message).slice(0, 120)}`); }
}
check("every recipe parses as valid JavaScript", recipes.length > 0 && syntaxFail.length === 0,
  syntaxFail.length ? syntaxFail.join(" | ") : `${recipes.length}/${recipes.length} parse`);

const requireFail = [];
const requireSeen = [];
const require = createRequire(path.join(__dirname, "_probe.cjs"));
for (const r of recipes) {
  for (const spec of r.requires) {
    if (BUILTINS.has(spec) || spec.startsWith("node:")) continue;
    let ok = false;
    try { require.resolve(spec); ok = true; } catch { ok = existsSync(path.join(__dirname, spec)) || existsSync(path.join(ROOT, "node_modules", spec)); }
    requireSeen.push(spec);
    if (!ok) requireFail.push(`${r.file} -> ${spec}`);
  }
}
check("every require() target resolves (packages + relative files)",
  requireFail.length === 0,
  requireFail.length ? requireFail.join(" | ") : [...new Set(requireSeen)].join(", "));

const yamlFail = [];
const yamlSeen = [];
for (const r of recipes) for (const y of r.yamls) {
  yamlSeen.push(`${r.file}:${y}`);
  if (!existsSync(path.join(CONTRACTS, y))) yamlFail.push(`${r.file} -> contracts/${y}`);
}
check("every OpenAPI contract referenced exists in contracts/",
  yamlFail.length === 0,
  yamlFail.length ? yamlFail.join(" | ") : [...new Set(yamlSeen.map((s) => s.split(":")[1]))].join(", "));

const spawnFail = [];
const spawnSeen = [];
for (const r of recipes) for (const s of r.spawns) {
  spawnSeen.push(`${r.file} -> ${s}`);
  if (!existsSync(path.join(__dirname, s))) spawnFail.push(`${r.file} -> ${s}`);
}
check("every sibling recipe spawned by a recipe exists",
  spawnFail.length === 0,
  spawnFail.length ? spawnFail.join(" | ") : (spawnSeen.length ? spawnSeen.join(", ") : "no spawns (n/a)"));

// ---------------------------------------------------------------------------------------------
// 2. selectors are non-empty strings
// ---------------------------------------------------------------------------------------------
sec("2. selectors");

const allSelectors = recipes.flatMap((r) => r.selectors);
const emptySelectors = recipes.flatMap((r) => r.selectors.filter((s) => s.trim() === "").map((s) => `${r.file}:<empty>`));
const selectorless = recipes.filter((r) => r.selectors.length === 0).map((r) => r.file);
check("all extracted selectors are non-empty strings",
  allSelectors.length > 0 && emptySelectors.length === 0,
  emptySelectors.length ? emptySelectors.join(" | ") : `${allSelectors.length} selectors across ${recipes.length} recipes`);
check("recipes that drive the DOM all contain at least one selector",
  selectorless.length === 0,
  selectorless.length ? `no selectors: ${selectorless.join(", ")}` : "every recipe has selectors");

// ---------------------------------------------------------------------------------------------
// 3. section coverage
// ---------------------------------------------------------------------------------------------
sec("3. Blueprint section coverage");

const byFile = Object.fromEntries(recipes.map((r) => [r.file, r.sections]));
for (const r of recipes) console.log(`  ${r.file.padEnd(26)} [${r.sections.join(", ") || "none"}]`);

const chainSections = [...new Set(chain.flatMap((f) => byFile[f] || []))];
const CHAIN_REQUIRED = ["create", "case-type", "systems", "personas", "summary"];
const chainMissing = CHAIN_REQUIRED.filter((s) => !chainSections.includes(s));
check("ordered create -> complete chain exists and is ordered",
  chain.length >= 2 && /create/.test(chain[0]) && /complete/.test(chain[1]),
  `chain: ${chain.join(" -> ")}`);
check("create -> complete chain covers the Blueprint sections",
  chainMissing.length === 0,
  chainMissing.length ? `missing: ${chainMissing.join(", ")}` : `covers ${chainSections.filter((s) => CHAIN_REQUIRED.includes(s)).join(", ")}`);

const ALL_REQUIRED = ["create", "case-type", "data-model", "systems", "personas", "lifecycle", "summary"];
const allCovered = [...new Set(recipes.flatMap((r) => r.sections))];
const allMissing = ALL_REQUIRED.filter((s) => !allCovered.includes(s));
check("full recipe set covers every Blueprint section (incl. fields + lifecycle)",
  allMissing.length === 0,
  allMissing.length ? `missing: ${allMissing.join(", ")}` : `${ALL_REQUIRED.length}/${ALL_REQUIRED.length} sections covered`);

// ---------------------------------------------------------------------------------------------
// 4. no dead steps
// ---------------------------------------------------------------------------------------------
sec("4. no dead steps");

const markerHits = [];
for (const r of recipes) { const m = r.src.match(DEAD_MARKER_RE); if (m) markerHits.push(`${r.file} contains '${m[1]}'`); }
check("no TODO/FIXME/placeholder markers", markerHits.length === 0, markerHits.join(" | ") || "none");

const dupDefs = [];
for (const r of recipes) {
  const seen = new Set();
  for (const m of matchAll(r.src, FUNCTION_RE)) { if (seen.has(m[1])) dupDefs.push(`${r.file}:${m[1]}`); seen.add(m[1]); }
}
check("no duplicate top-level function definitions", dupDefs.length === 0, dupDefs.join(" | ") || "none");

const unusedHelpers = [];
for (const r of recipes) {
  for (const name of r.helpers) {
    // a helper is "used" if `name(` appears anywhere beyond its own definition
    if (countCalls(r.src, name) <= 1) unusedHelpers.push(`${r.file}:${name}`);
  }
}
check("no helper is defined but never called",
  unusedHelpers.length === 0,
  unusedHelpers.length ? `unused helpers: ${unusedHelpers.join(", ")}` : `${recipes.reduce((n, r) => n + r.helpers.length, 0)} helpers, all called`);

// ---------------------------------------------------------------------------------------------
// 5. artifact -> planner rule family mapping (grounded in the planner corpus)
// ---------------------------------------------------------------------------------------------
sec("5. artifact -> planner rule family mapping");

// (a) ground the family list in the corpus manifest the planner actually reads
let corpusFamilies = [];
let corpusOk = false;
try {
  const man = JSON.parse(readFileSync(path.join(CORPUS, "manifest.json"), "utf8"));
  corpusFamilies = [...new Set((man.skills || []).map((s) => String(s.name).split("/")[0]))];
  corpusOk = corpusFamilies.length > 0;
} catch (e) { /* corpus missing */ }
const ruleFamilies = corpusFamilies.filter((f) => f.startsWith("rules-rule-"));
check("planner corpus manifest is present and enumerable",
  corpusOk, corpusOk ? `${corpusFamilies.length} families (${ruleFamilies.length} rules-rule-*)` : `missing ${path.relative(ROOT, CORPUS)}/manifest.json`);

// (b) ground the family -> ruleType derivation in plan-lib.mjs itself
let planLibSrc = "";
try { planLibSrc = readFileSync(PLAN_LIB, "utf8"); } catch { /* noop */ }
const derivation = /replace\(\s*\/\^rules-rule-\/\s*,\s*""\s*\)/.test(planLibSrc);
check("plan-lib derives ruleType from family name (family == ruleType minus 'rules-rule-')",
  derivation, derivation ? 'plan-lib.mjs: skill.replace(/^rules-rule-/, "")' : "derivation not found in plan-lib.mjs");

// the mapping: Blueprint artifact -> planner family. `evidence` cites the recipe token it comes from.
// `family` must exist in the corpus; `near` is used when the artifact is deliberately NOT an
// authorable rules-rule-* family (persona access is a documented human step).
const MAPPING = [
  { artifact: "Context wizard / create",       evidence: "recipe1-create: '#purpose-combobox', 'Create a Blueprint'",                family: null, near: "methodology-blueprint-delivered", ruleType: "Blueprint itself (no rule)" },
  { artifact: "Case type",                     evidence: "recipe2-complete: addCaseType() / '#case-type-name'",                     family: "rules-rule-obj-casetype", ruleType: "Rule-Obj-CaseType" },
  { artifact: "Field / property",              evidence: "add-field.cjs: '#field-type-create', 'Add a Field'",                       family: "rules-rule-obj-property", ruleType: "Rule-Obj-Property" },
  { artifact: "Data object / class",           evidence: "add-field.cjs: 'Case Data Model' tab (object roots)",                      family: "rules-rule-obj-class",    ruleType: "Rule-Obj-Class" },
  { artifact: "System + API (OpenAPI import)", evidence: "recipe2-complete: addSystem() / '#data-schemas', 'Add System'",             family: "rules-rule-connect-rest", ruleType: "Rule-Connect-REST" },
  { artifact: "  \u2514 JSON request/response map", evidence: "methodology-integration: 'JSON Data Transforms' per system",            family: "rules-rule-obj-model",    ruleType: "Rule-Obj-Model" },
  { artifact: "  \u2514 Data page (SOR wiring)",  evidence: "wire-all/wire-bp: '#integration-sor', '#integration-resource'",           family: "rules-rule-declare-pages",ruleType: "Rule-Declare-Pages" },
  { artifact: "Persona",                       evidence: "recipe2/recipe3: '#persona-name-default', 'Add a Persona'",               family: null, near: "methodology-application-security", ruleType: "Access Group (Data-Admin-Operator-AccessGroup) \u2014 not a rules-rule-* family; documented human step" },
  { artifact: "Case lifecycle / step notes",   evidence: "set-step-notes.cjs: '#lifecycle-step-fields-modal-notes'",                family: "rules-rule-obj-casetype", ruleType: "Rule-Obj-CaseType (pyStages/pyProcesses)" },
  { artifact: "Notification",                  evidence: "recipe2 PERSONAS/DESC: 'customer notification'",                          family: "rules-rule-notification", ruleType: "Rule-Notification" },
  { artifact: "AI summary / classification",   evidence: "recipe1 DESC: 'AI-assisted summarization, classification'",              family: "rules-rule-ai-agent",     ruleType: "Rule-AI-Agent" },
];

const unknownFamilies = [];
for (const row of MAPPING) {
  if (row.family && !corpusFamilies.includes(row.family)) unknownFamilies.push(`${row.artifact} -> ${row.family}`);
  if (row.near && !corpusFamilies.includes(row.near)) unknownFamilies.push(`${row.artifact} -> (near) ${row.near}`);
}
check("every mapped family exists in the planner corpus (grounded, not invented)",
  unknownFamilies.length === 0,
  unknownFamilies.length ? unknownFamilies.join(" | ") : `${MAPPING.length} mapping rows resolve against the corpus`);

// render the mapping table with dynamic column widths
const cArt = Math.max(20, ...MAPPING.map((r) => r.artifact.length));
const cFam = Math.max(20, ...MAPPING.map((r) => (r.family || `${r.near} (near)`).length));
const cRule = Math.max(20, ...MAPPING.map((r) => r.ruleType.length));
const w = (s, n) => { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); };
console.log("");
console.log(`  ${w("BLUEPRINT ARTIFACT", cArt)}  ${w("PLANNER RULE FAMILY", cFam)}  ${w("RULE TYPE", cRule)}  EVIDENCE`);
console.log(`  ${"-".repeat(cArt)}  ${"-".repeat(cFam)}  ${"-".repeat(cRule)}  ${"-".repeat(10)}`);
for (const row of MAPPING) {
  const fam = row.family || `${row.near} (near)`;
  const mark = row.family ? " " : "\u2022";
  console.log(`${mark} ${w(row.artifact, cArt)}  ${w(fam, cFam)}  ${w(row.ruleType, cRule)}  ${row.evidence}`);
}
console.log("\n  \u2022 = no direct rules-rule-* authoring family (handled as methodology / human step).");

// ---------------------------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------------------------
sec("summary");
const passed = results.filter((r) => r.ok).length;
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  \u2014 ${r.note}` : ""}`);
console.log(`\n  ${passed}/${results.length} assertions passed`);

const gaps = results.filter((r) => !r.ok);
if (gaps.length) {
  console.log("\nGAPS (honest findings):");
  for (const g of gaps) console.log(`  - ${g.name}: ${g.note}`);
} else {
  console.log("\nNo gaps. (Live-browser behaviour is still unproven \u2014 see docs/blueprint-proof.md.)");
}

const sectionsCovered = [...new Set(recipes.flatMap((r) => r.sections))];
console.log(`\nsections covered (recipes): ${sectionsCovered.join(", ")}`);
console.log(`mapping rows: ${MAPPING.length}`);

process.exit(gaps.length ? 1 : 0);
