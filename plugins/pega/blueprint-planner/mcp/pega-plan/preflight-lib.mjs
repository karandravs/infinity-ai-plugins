// preflight-lib.mjs — PLATFORM-TRUTH pre-flight: apply the create-time fixes a live build must
// apply, BEFORE the plan is handed back, and DECLARE the ones that need the live application.
//
// Ground truth is harness/build-all.mjs `PLATFORM_FIXES`: a case type's pyPurpose is the constant
// "pyDefault", an initial urgency is an integer, a UI view cannot be circumstanced, a view's
// metadata is a JSON string. A plan that ships those un-applied fails at create-rule time — the
// failure belongs in the plan, not in a build loop 40 rules later.
//
// The port is deliberately PARTIAL. `build-all` runs inside a live application, where it can remap
// a sample class to a real one, point a flow action at a real activity, and read the app's class
// list. This module has no app: it applies only the rules that are true of the platform itself
// (env-independent), and REPORTS — as `issues: { path, why, kind }` — everything that would need
// one. Fabricating an activity name or a class remap would be a lie inside a structurally valid
// payload.
//
// Every issue carries `kind`, so `preflightIssues` is triageable:
//   * "fixed"       — the pre-flight changed a value because it was not buildable as written; the
//                     plan ships the platform's value (an invalid urgency, a rejected param type).
//   * "verify-live" — the pre-flight cannot decide this without the live application; the plan
//                     ships the value it cannot verify, and a human/build must resolve it.
//
// Contract: `applyPlatformTruths(ruleType, payload, { namespace }) → { payload, issues }`.
// Mutates a CLONE (the caller's payload stays untouched) and never throws.
const fixed = (path, why) => ({ path, why, kind: "fixed" });
const verifyLive = (path, why) => ({ path, why, kind: "verify-live" });

// Parameter vocabularies the platform accepts (verbatim from build-all.mjs): anything else is
// rejected at create-rule time, so it is normalised to the platform's default of that kind.
const PARAM_TYPES = new Set(["STRING", "BOOLEAN", "Date", "DateTime", "Decimal", "Double", "INTEGER", "JAVAOBJECT", "PAGE", "TimeOfDay", "TrueFalse", ""]);
const LOCAL_PARAM_TYPES = new Set(["String", "Boolean", "char", "double", "int", "Decimal", "Object", "StringBuffer"]);

// The fixes that hold for every application. Each returns the issues it could not resolve itself.
const FIXES = {
  // a case type's purpose is the invariant key pyDefault; its urgency is a number, and a stage's
  // required categories are NAMES (the sample sometimes carries the full category objects).
  "Rule-Obj-CaseType": (p) => {
    const issues = [];
    p.pyPurpose = "pyDefault";
    if (typeof p.pyInitialCaseUrgency === "string") {
      const raw = p.pyInitialCaseUrgency;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) p.pyInitialCaseUrgency = n;
      else {
        p.pyInitialCaseUrgency = 10;
        issues.push(fixed("pyInitialCaseUrgency", `${JSON.stringify(raw)} is not a number — a case type's initial urgency must be an integer (the platform default 10 was applied)`));
      }
    }
    for (const stage of (p.pyStages || []))
      if (Array.isArray(stage.pyRequiredCategories))
        stage.pyRequiredCategories = stage.pyRequiredCategories
          .map((x) => typeof x === "string" ? x : (x && (x.pyLabel || x.pyName || x.pyCategory || x.pyValue)) || "")
          .filter(Boolean);
    return issues;
  },
  // a flow's purpose is a boolean-ish flag, not prose
  "Rule-Obj-Flow": (p) => {
    if (!["true", "false", ""].includes(p.pyPurpose)) p.pyPurpose = "";
    return [];
  },
  // parameter types are a closed vocabulary per parameter kind (activity vs local parameter)
  "Rule-Obj-Activity": (p) => {
    const issues = [];
    for (const x of (p.pyParameters || []))
      if (x && x.pyParametersParamType != null && !PARAM_TYPES.has(x.pyParametersParamType)) {
        issues.push(fixed("pyParameters", `parameter type ${JSON.stringify(x.pyParametersParamType)} is not a platform type — coerced to "STRING"`));
        x.pyParametersParamType = "STRING";
      }
    for (const x of (p.pyLocalParameters || []))
      if (x && x.pyParametersParamType != null && !LOCAL_PARAM_TYPES.has(x.pyParametersParamType)) {
        issues.push(fixed("pyLocalParameters", `local parameter type ${JSON.stringify(x.pyParametersParamType)} is not a platform type — coerced to "String"`));
        x.pyParametersParamType = "String";
      }
    return issues;
  },
  // A flow action: build-all CLEARS the references the sample borrowed (section, the assignment
  // flow/cover/workbasket when there is no next assignment, pre-processing activity/transform,
  // action transform) — those are env-independent, so they are cleared here. Only
  // pyValidateActivity needs the live app (build-all points it at the app's first activity), so it
  // is reported instead of guessed.
  "Rule-Obj-FlowAction": (p) => {
    if (p.pyViewReference) p.pySectionReference = "";
    if (!p.pyNextAssignment || p.pyNextAssignment === "false") {
      p.pyNextAssignmentFlow = "";
      p.pyNextAssignmentCover = "";
      p.pyNextAssignmentWorkBasket = "";
    }
    p.pyPreProcessingActivity = "";
    p.pyPreProcessingTransformRule = "";
    p.pyActionTransformRule = "";
    return [verifyLive("pyValidateActivity", "build-all points pyValidateActivity at an activity that exists in the application (its first listed activity) — only a live app can name or verify it; the borrowed section/assignment/pre-processing/action-transform references ARE cleared here, since those need no application")];
  },
  // a property never carries an edit-validate/table/stream binding borrowed from a sample
  "Rule-Obj-Property": (p) => {
    p.pyEditValidate = "";
    p.pyTableClass = "";
    p.pyStreamName = "";
    p.pyTableOption = "";
    if (Array.isArray(p.pyPromptTableList) && !p.pyPromptTableList.length) delete p.pyPromptTableList;
    return [];
  },
  // data pages: the two flags the platform expects to be explicitly false
  "Rule-Declare-Pages": (p) => {
    p.pyEnableRetrievePageByKey = "false";
    p.pyUseNewGenPageForEditableDataPage = "false";
    return [];
  },
  // a circumstanced view (from a sample) cannot be created as-is; the metadata fields are strings
  "Rule-UI-View": (p) => {
    for (const k of Object.keys(p)) if (/^pyCircumstance/i.test(k)) delete p[k];
    for (const k of ["pxViewMetadata", "pxContextMetadata"]) if (p[k] && typeof p[k] === "object") p[k] = JSON.stringify(p[k]);
    return [];
  },
  // an agent must be available and in basic display mode; knowledge tools are real rule references
  "Rule-AI-Agent": (p) => {
    p.pyRuleAvailable = "Yes";
    p.pyDisplayMode = "basic";
    if (!p.pzDynamicSuggestionInfo) p.pzDynamicSuggestionInfo = {};
    if (Array.isArray(p.pzKnowledgeTools)) p.pzKnowledgeTools = p.pzKnowledgeTools.filter((t) => t && t.pyPurpose && !/^pz/.test(t.pyPurpose));
    return [];
  },
};

// Deep copy that NEVER hands back the caller's object: when the payload cannot be copied, the
// pre-flight is skipped (reported) rather than mutating the caller's data.
function clone(value) {
  try {
    return structuredClone(value);
  } catch { /* functions/symbols — try the JSON shape below */ }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

// Apply the env-independent platform truths to a clone of `payload`.
// `namespace` (e.g. "Org-App") lets the pre-flight say whether the rule's class even belongs to the
// application being planned for — it never rewrites the class (that is the live remap's job).
export function applyPlatformTruths(ruleType, payload, { namespace } = {}) {
  const issues = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { payload, issues };
  const out = clone(payload);
  if (out === null)
    return { payload, issues: [verifyLive("(preflight)", "the payload could not be copied (it holds an unserialisable value), so the pre-flight was skipped rather than mutating the caller's object")] };
  try {
    const fix = FIXES[ruleType];
    if (fix) issues.push(...fix(out));
    // A rule must live in a class that already exists in the target application. There is no app
    // here, so the class is reported for verification instead of being remapped to a guessed one.
    if (typeof out.pyClassName === "string" && out.pyClassName) {
      const outsideNamespace = namespace && !out.pyClassName.startsWith(`${namespace}-`);
      issues.push(verifyLive("pyClassName", outsideNamespace
        ? `class "${out.pyClassName}" is outside the ${namespace} application namespace — build-all remaps an unknown sample class to the app's own class against the LIVE application, which the pre-flight cannot do`
        : `class "${out.pyClassName}" must already exist (Rule-Obj-Class) in the target application — verifying/remapping it needs a live app, so the pre-flight leaves it for the build`));
    }
    // the platform expects a buildable rule to be non-startable; build-all forces this to "false"
    if (out.pyInputMayStart === "true") {
      out.pyInputMayStart = "false";
      issues.push(fixed("pyInputMayStart", `pyInputMayStart was "true" — the platform requires a buildable rule to be non-startable (build-all forces "false" before create)`));
    }
  } catch (e) {
    issues.push(verifyLive("(preflight)", `pre-flight could not complete: ${String(e.message || e).slice(0, 200)}`));
  }
  return { payload: out, issues };
}
