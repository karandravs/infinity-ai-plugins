# Changelog

All notable changes to the **Pega, Automated — the Pega Build Spine** MCP surface.

## [Unreleased]

### Changed
- **The tool is `plan_pega_change({ question, contracts_dir?, namespace? })`.** A free-text Pega
  how-to question → ONE defensible answer: `verdict` (`yes`/`alternative`/`no`/`unsure`), `answer`,
  `closest`, `partial`, per-`clauses` verdicts, ordered `steps` (payload + `provenance` + `checks` +
  `unresolved` + `prerequisites`), `inputs_required`, `caveats`, `looked_at`, `provenance`.
  **It writes nothing** — `out_dir`/`outPath`, the `plan_id` store, `values`/`fillPlan`, `sor_base_url`
  and the old `coverage` flag are gone; every non-`yes` verdict names what to do instead.
- **No branch prescription.** The planner names no branch and no Change Request: the caller supplies
  the active Change Request when it builds with Pega's Authoring MCP.
- **`checks` are structural only** (AJV schema + platform-truth pre-flight); the authoritative
  validation of a payload is the **Infinity Authoring MCP's runtime validator**.
- **Corpus discovery needs no env var**: the planner resolves the neighbouring
  `infinity-ai-plugins/claude/resources/<ver>` corpus itself (`PEGA_CORPUS_ROOT` to override,
  `PEGA_CORPUS` deprecated, `PEGA_GRAPH` ignored). Credentials come from the process environment —
  **no `.env` reads** in the shipped `mcp/` or `lib/`.
- **Licensing:** `LICENSE` (Pega Infinity AI Plugins License v1.0) + `NOTICE` (derived from Pega
  Infinity AI Plugins © Pegasystems Inc., modified by the blueprint-planner authors).

### Added
- **`eval/demo-transcript.md`** — five Pega how-to questions answered end to end (verdict, steps,
  closest, inputs) by `plan_pega_change`; **`eval/head-to-head.md`** — planner vs the plugin baseline
  on the same questions, with computed baseline metrics.
- **`coverage` flag on the plan result**: a top-level `coverage` (`{ covered, capability, phrase, reason }`)
  plus a `caveats[]` entry when `covered:false` — an honest "no authoring rule family in the corpus declares
  this capability" signal (e.g. "Configure Email Account", "Configure SSO", access control). Advisory: a plan
  is still returned, but an uncovered goal is a **human step, not a build**.
- **Offline proof scripts** (deterministic, no Pega environment): `harness/eval-integration.mjs` (SOR
  integration chain plans end-to-end), `harness/eval-backlog.mjs` (whole Blueprint backlog through
  plan → compose → verify), `harness/eval-mcp.mjs` (the shipped MCP over the real stdio protocol),
  `harness/dryrun-build.mjs` (the exact `create-rule` calls the build path would make) and
  `blueprint/verify-blueprint.mjs` (the Blueprint recipe-layer contract).

### Changed
- Routing stability → **100%** (set + primary): the correct rule-authoring family is selected for every
  probed goal, not just one of those returned.
- Rule content is **goal-derived**: composed values/text come from the goal (Jev selects enum values, code
  composes) with each field tagged by provenance.
- Integration is **contract-grounded**: endpoint values are filled from the OpenAPI contracts in
  `contracts/` instead of templated placeholders.
- CI runs the keyless Blueprint contract proof (`node blueprint/verify-blueprint.mjs`).

### Fixed
- The **`coverage` signal is surfaced to the acting agent** — the `pega-build` SKILL.md workflow and the
  `plan_pega_build` tool description now say `covered:false` ⇒ flag for a human, do not build — so an
  uncovered goal is no longer silently built from a structurally-valid substitute rule.

## [0.2.0] — 2026-10-15

Release candidate: the MCP (blueprint building + planning) reviewed, scoped, and packaged.

### Added
- **Ships the workflow with the MCP**: `mcp/pega-plan/skills/pega-build/SKILL.md` + an MCP **prompt** `pega-build` — so any client gets the how-to from the MCP, not a bespoke agent prompt.
- **The planner MCP** (`mcp/pega-plan`, tool `plan_pega_build`): goal → plan with routing, build
  order (`REQUIRES`), typed-container composing, and **`blanks`** — `value` / `reference` / `entries`
  slots the calling agent fills.
- **Plan store + freeze**: `planId` (deterministic), `savePlan`/`loadPlan`; a 2nd call with
  `values` fills the **same frozen plan** (no re-plan nondeterminism).
- **Reference blanks**: rule references (`pyValidateActivity`, `pyWhenRule`, `pyFlowName`,
  `pyExpression`, `pyIntegrationSystemId`, …) surfaced so the agent names rules that exist.
- **Skills-graph loader** (`graph-lib`): keywords enrich routing; `REQUIRES` drives build order;
  `SIMILAR` for expansion.
- **Structural composer** (`compose-lib`): learn an item catalog from examples, Jev selects, code emits.
- Docs: `docs/pega-platform-truths.md` (real platform constraints), `docs/blueprint-delta-audit.md`.

### Changed
- `validateSchema` scoped to `requiredManual` (no false positives on Pega-derived keys);
  `loadSchema` now returns `required`.
- Product/harness split: internal loop scripts moved to `harness/` (not shipped).

### Fixed (release review)
- `npm test` no longer crashes on a clean, keyless checkout.
- Removed a phantom `stage` field from the tool description.
- `fillPlan` persists the artifact (`outPath`) and re-freezes the store.
- A rule's **own** composed name is no longer flagged as a dangling reference.
- Jev client: 30s `AbortSignal.timeout` (no indefinite hangs).
- `loadPlan(id)` rejects non-12-hex ids (path-traversal guard).
- Namespace composition no longer emits a trailing dash.

## [0.1.0] — 2026-10-12
- Initial prototype: goal → payload plan (route/fill/gate/score); Blueprint Playwright drivers.
