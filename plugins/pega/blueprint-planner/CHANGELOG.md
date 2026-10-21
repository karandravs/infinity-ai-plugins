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
- Routing stability → **100%** on the **legacy per-goal path** (`planPegaBuild`/`routeSkills`, 3
  averaged samples per goal): the correct rule-authoring family was selected for every probed goal.
  The **shipped** `plan_pega_change` path spends **1 batched sample** for the whole question, so a
  question sitting near the cutoff can flip between runs — `eval/head-to-head.md` names the
  near-cutoff questions it had to replace instead of pinning one question to one class.
- Rule content is **goal-derived**: composed values/text come from the goal — code *selects* enum
  values (the value the goal names, else the family's example) and code *composes* the free text; the
  shipped path makes no judgment call here. Each field is tagged by provenance.
- Integration is **contract-grounded**: endpoint values are filled from the OpenAPI contracts in
  `contracts/` instead of templated placeholders.
- CI runs the keyless Blueprint contract proof (`node blueprint/verify-blueprint.mjs`) and a keyless
  corpus-discovery smoke.

### Added
- **`eval/demo-transcript.md`** — five Pega how-to questions answered end to end (verdict, steps,
  closest, inputs) by `plan_pega_change`; **`eval/head-to-head.md`** — planner vs the plugin baseline
  on the same questions, with computed baseline metrics.
- **Offline proof scripts** (deterministic, no Pega environment): `harness/eval-integration.mjs` (SOR
  integration chain plans end-to-end), `harness/eval-backlog.mjs` (whole Blueprint backlog through
  plan → compose → verify), `harness/eval-mcp.mjs` (the shipped MCP over the real stdio protocol),
  `harness/dryrun-build.mjs` (the exact `create-rule` calls the build path would make) and
  `blueprint/verify-blueprint.mjs` (the Blueprint recipe-layer contract).

> **Superseded by the `plan_pega_change` contract above** (kept for the record, not as current
> behaviour): the top-level `coverage` flag and its `caveats[]` entry, the `covered:false` ⇒
> "flag a human, do not build" guidance in `SKILL.md` and the tool description, the `plan_pega_build`
> workflow with its `blanks` fill and the `verify`/`goalFit` grading. The **verdict** is that signal
> now: a goal whose capability no corpus family declares comes back `no` (or `alternative`) with
> `closest` naming the absent capability.

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
