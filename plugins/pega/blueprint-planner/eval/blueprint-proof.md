# Blueprint layer — offline proof

> **What this is.** A reproducible, offline proof of the Blueprint recipe layer's *contract*: what
> the `blueprint/*.cjs` recipes produce (case types, data model/fields, systems/OpenAPI, personas),
> how they drive `pega.com/blueprint`, and how each produced artifact maps onto a planner rule
> family. The live browser/site cannot be exercised headlessly right now, so this proof covers
> everything knowable **without** a browser or network — and states plainly what it cannot.

- **Verifier:** `blueprint/verify-blueprint.mjs` (new file).
- **Run:** `node blueprint/verify-blueprint.mjs` — no network, no browser, no `TYPESAFE_API_KEY`, no Jev.
- **Deterministic:** verified identical output across repeated runs.
- **Exit code:** `0` iff every assertion passes (currently `1` — one honest dead-code finding, below).

The verifier is **structural only**: it reads the recipe sources and the planner corpus and never
executes a recipe, opens a socket, or writes a file.

---

## 1. Assertions

`14 / 15` assertions pass. Each is printed `PASS`/`FAIL` live by the script.

| # | Assertion | Result | Detail |
|---|-----------|--------|--------|
| 1 | Every recipe parses as valid JavaScript | **PASS** | 14/14 (`vm.Script` compile) |
| 2 | Every `require()` target resolves (packages + relative files) | **PASS** | `playwright-core` |
| 3 | Every OpenAPI contract referenced exists in `contracts/` | **PASS** | `payments.yaml, crm.yaml, risk.yaml, notifications.yaml, documents.yaml` |
| 4 | Every sibling recipe spawned by a recipe exists | **PASS** | `eval-recipes.cjs` → `recipe1-create.cjs`, `recipe3-personas.cjs`, `add-sys-guarded.cjs`, `del-blueprint.cjs` |
| 5 | All extracted selectors are non-empty strings | **PASS** | 154 selectors across 14 recipes |
| 6 | DOM-driving recipes all contain ≥1 selector | **PASS** | every recipe |
| 7 | Ordered `create → complete` chain exists and is ordered | **PASS** | `recipe1-create → recipe2-complete → recipe3-personas → recipe4-summary` |
| 8 | `create → complete` chain covers the Blueprint sections | **PASS** | `create, case-type, systems, personas, summary` |
| 9 | Full recipe set covers every section (incl. fields + lifecycle) | **PASS** | 7/7 sections |
| 10 | No `TODO`/`FIXME`/placeholder markers | **PASS** | none |
| 11 | No duplicate top-level function definitions | **PASS** | none |
| 12 | No helper defined but never called | **FAIL** | `recipe3-personas.cjs:body`, `wire-bp.cjs:realDlg` |
| 13 | Planner corpus manifest present and enumerable | **PASS** | 55 families (37 `rules-rule-*`) |
| 14 | `plan-lib` derives `ruleType` from the family name | **PASS** | `plan-lib.mjs`: `skill.replace(/^rules-rule-/, "")` |
| 15 | Every mapped family exists in the planner corpus | **PASS** | 11 mapping rows resolve |

### Section coverage (detected per recipe)

| recipe | sections |
|--------|----------|
| `recipe1-create.cjs` | create, case-type |
| `recipe2-complete.cjs` | case-type, systems, personas, summary |
| `recipe3-personas.cjs` | personas |
| `recipe4-summary.cjs` | summary |
| `add-field.cjs` | data-model |
| `add-sys-guarded.cjs` | systems |
| `wire-all.cjs` / `wire-bp.cjs` | systems |
| `add-persona.cjs` | personas |
| `set-step-notes.cjs` | lifecycle |
| `check-fields.cjs`, `cleanup-blueprints.cjs`, `del-blueprint.cjs`, `eval-recipes.cjs` | (verification / housekeeping — no section fill) |

**Sections covered collectively:** `create, case-type, data-model, systems, personas, lifecycle, summary` (7/7).

---

## 2. Artifact → planner rule family mapping

The family names are **not invented**: they are read from the planner's own corpus
(`index/pega-infinity-ai-plugins-resources-26-1/manifest.json`), and the family → rule-type
derivation is read from `mcp/pega-plan/plan-lib.mjs` itself
(`ruleType = skill.replace(/^rules-rule-/, "")`). Assertion 15 fails if any name below is unknown
to the corpus.

| Blueprint artifact | Evidence in recipes | Planner rule family | Rule type |
|---|---|---|---|
| Context wizard / create | `recipe1-create`: `#purpose-combobox`, "Create a Blueprint" | *`methodology-blueprint-delivered` (near)* | Blueprint itself (no rule) |
| **Case type** | `recipe2-complete`: `addCaseType()` / `#case-type-name` | `rules-rule-obj-casetype` | `Rule-Obj-CaseType` |
| **Field / property** | `add-field.cjs`: `#field-type-create`, "Add a Field" | `rules-rule-obj-property` | `Rule-Obj-Property` |
| Data object / class | `add-field.cjs`: "Case Data Model" tab | `rules-rule-obj-class` | `Rule-Obj-Class` |
| **System + API (OpenAPI import)** | `recipe2-complete`: `addSystem()` / `#data-schemas` | `rules-rule-connect-rest` | `Rule-Connect-REST` |
| ↳ JSON request/response map | `methodology-integration`: "JSON Data Transforms" | `rules-rule-obj-model` | `Rule-Obj-Model` |
| ↳ Data page (SOR wiring) | `wire-all`/`wire-bp`: `#integration-sor`, `#integration-resource` | `rules-rule-declare-pages` | `Rule-Declare-Pages` |
| **Persona** | `recipe2`/`recipe3`: `#persona-name-default`, "Add a Persona" | *`methodology-application-security` (near)* | Access Group (`Data-Admin-Operator-AccessGroup`) — **not a `rules-rule-*` family; documented human step** |
| Case lifecycle / step notes | `set-step-notes.cjs`: `#lifecycle-step-fields-modal-notes` | `rules-rule-obj-casetype` | `Rule-Obj-CaseType` (`pyStages`/`pyProcesses`) |
| Notification | `recipe2` personas/DESC: "customer notification" | `rules-rule-notification` | `Rule-Notification` |
| AI summary / classification | `recipe1` DESC: "AI-assisted summarization, classification" | `rules-rule-ai-agent` | `Rule-AI-Agent` |

Rows in *italics* have no direct authoring `rules-rule-*` family: the Blueprint itself is not a
rule, and persona access is an access-group concern (see §3). This matches
`docs/blueprint-delta-audit.md`, which records that the Blueprint produced the case type + data
model + flows + data pages + views, but **no connectors** (`Rule-Connect-REST` = 0) — i.e. the
system/API rows above are exactly the authoring gap the planner fills.

---

## 3. Offline-provable vs. genuinely needs a live browser

| Claim | Offline-provable now? | Why |
|---|---|---|
| Recipes are syntactically valid | ✅ | static compile (`vm.Script`) |
| Every referenced file/package/contract/sibling exists | ✅ | filesystem resolution |
| Selectors are well-formed non-empty strings | ✅ | static extraction |
| The create → complete chain covers every Blueprint section | ✅ | token scan per recipe |
| Each artifact maps to a real planner rule family | ✅ | corpus manifest + `plan-lib.mjs` derivation |
| **Selectors still match the live `pega.com/blueprint` DOM** | ❌ | needs a live page; CSS/DOM can drift |
| **Sign-in / Blueprint-agreement / "Create" actually succeeds** | ❌ | needs an authenticated CDP session |
| **OpenAPI import generates the expected integrations** | ❌ | server-side generation; needs the live site |
| **Case type / fields / systems / personas persist after reload** | ❌ | needs the live app + re-read |
| **The generated Blueprint imports into App Studio as the audit describes** | ❌ | needs Pega Infinity + Autopilot import |

The live path exists today as `blueprint/eval-recipes.cjs` (spawns the self-contained recipes
against a CDP Chrome at `127.0.0.1:9222` and checks each recipe's own stdout assertion). This
offline verifier is the deterministic complement: it proves the *shape* of the layer even when the
browser path cannot run.

---

## 4. Gaps found (honest)

1. **Dead helpers (assertion 12 FAIL).**
   - `recipe3-personas.cjs` defines `body(p)` (line 4) but never calls it — it reads the page inline
     via `p.evaluate` instead.
   - `wire-bp.cjs` defines `realDlg(p)` (line 9) but never calls it — it re-derives the dialog inline.
   - These are unused code paths, not broken steps, but they are dead weight in recipes that drive a
     live site. Not fixed here (this change is new-files-only by instruction).
2. **Token-based section detection is approximate.** `recipe1-create.cjs` is credited with
   `case-type` because it *waits for* the case-types screen (`Add a Case Type` in a wait regex), not
   because it fills it. Coverage assertions still hold; per-file attribution is a heuristic.
3. **Persona is not directly authorable.** The corpus exposes no `rules-rule-*` family that creates
   an access group; `mcp/pega-plan/skills/pega-build/SKILL.md` marks `access` stories a **human
   step**. The mapping states this rather than inventing a family.
4. **`docs/eval-integration.md` shows as modified in the working tree** — pre-existing, not produced
   by this verifier (the verifier performs no filesystem writes).

---

## 5. Reproduce

```bash
cd /Users/karan/Code/pega-automated
node blueprint/verify-blueprint.mjs      # prints the assertions + mapping table; exit 0 iff all pass
```

Current result: **14/15 assertions pass**, 7/7 sections covered, 11 mapping rows —
the single FAIL is the dead-helper lint (§4.1).
