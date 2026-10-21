# Changelog

All notable changes to the **Pega, Automated — the Pega Build Spine** MCP surface.

## [Unreleased]

### Changed — the routing + verdict layer is a TAXONOMY, not a set of thresholds
- **Routing is one `Choice` per taxonomy level** (`mcp/pega-plan/taxonomy-lib.mjs`, new): the corpus's
  own two-level taxonomy — **14 concepts** (the skills-graph's concept tags) and **37 rule families**
  (the manifest's `rules-rule-*`) — asked as `intent_<i>` (Choice over the 14 + `none_of_these`),
  `family_<i>` (Choice over the 37, criteria `"<Rule-Obj-X> — <manifest description> — keywords:
  <graph keywords>"`) and `any_<i>` (a companion Noul, because a `none of the above` option is
  unreliable on its own). **All questions for all clauses go in ONE request**; the state is the whole
  normalised question. The option order is **rotated deterministically per clause** (a hash of the
  clause text), because jev-1.13 leans toward the first option, and the answer is read from the
  distribution with a tie-break that cannot depend on position.
- **The verdict reads that classification and nothing else** (`verdict-lib.mjs`, rewritten). The six
  hand-rolled heuristics are **gone from the verdict**: the routing `floor`, the `cutoff`, the `band`
  of leniency, the `tie` window, lexical support (`familyNamedIn`) and structural closure. The new
  precedence, documented in the module header, is: Jev down → `unsure`; `any` < 0.35 → `no` (naming
  the concept it came closest to); `conceptConfidence` < 0.5 → `unsure` (reporting the **parent** and
  its families); family `separation` (top ÷ second) < 1.2 → `unsure` (naming the top 2–3 families
  with their probabilities); the `security` concept → `alternative` through `capabilities.json`;
  otherwise `yes` with the chosen family. The structural prerequisite table still decides the ORDER
  of the steps and what must exist first — it no longer decides the verdict.
- **`looked_at` is the classification trail**: per clause `{concept, conceptConfidence, conceptProbs,
  family, familyProbs, separation, any}`, plus the taxonomy's size. `cutoff`, `families[].score/
  margin/role/used` are gone (there is no cutoff to sit on, and no family is weighed as a
  competitor). A step's `rule` now carries `concept`, the family's `confidence` and the
  distribution's `separation` instead of `margin_to_cutoff`.
- **`planPegaBuild` classifies its own goal** through the same taxonomy (one call) when it is not
  handed a classification, so the standalone path and the shipped `plan_pega_change` path compose
  through one composer. `routeSkills`/`routeClauses`/`rankFamilies`/`deriveCandidates`/`loadToc` and
  `clauseCapability` are removed with the thresholds they served.
- **The shared judgment client moved to `jev-client.mjs`**, so the classifier and the composer share
  one call counter and the suite proves "one judgment call per question" across modules.
- **Measured**: 10/10 Pega-term questions and 9–10/10 plain-English questions land on the expected
  concept/family; the 18-goal coverage matrix classifies 18/18; a typical question answers in
  ~300 ms; every question spends exactly **one** judgment call.
- **`docs/demo-transcript.md` / `docs/head-to-head.md` were regenerated**, and two demo rows were
  re-baselined with a disclosure (the flagship is now `yes` — its third clause is a separated data
  page, not a hand-tuned near-cutoff case; the demo's `unsure` row is now the vague-experience
  question, because "make the case fly" is a genuine coin flip and is reported as a REPLACED row in
  the head-to-head instead of pinned).

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
- **Routing stability is a property of the taxonomy now** (see the section above): the family is the
  top of a `Choice` distribution, so a question is `yes` only when its top family is separated from
  the runner-up by ≥1.2× and `unsure` (naming both) when it is not. `docs/head-to-head.md` reports
  the one question whose distribution is a genuine coin flip instead of pinning it to a class.
- Rule content is **goal-derived**: composed values/text come from the goal — code *selects* enum
  values (the value the goal names, else the family's example) and code *composes* the free text; the
  shipped path makes no judgment call here. Each field is tagged by provenance.
- Integration is **contract-grounded**: endpoint values are filled from the OpenAPI contracts in
  `contracts/` instead of templated placeholders.
- CI runs the keyless Blueprint contract proof (`node blueprint/verify-blueprint.mjs`) and a keyless
  corpus-discovery smoke.

### Added
- **`docs/demo-transcript.md`** — five Pega how-to questions answered end to end (verdict, steps,
  closest, inputs) by `plan_pega_change`; **`docs/head-to-head.md`** — planner vs the plugin baseline
  on the same questions, with computed baseline metrics.
- **Offline proof scripts** (deterministic, no Pega environment): `harness/eval-integration.mjs` (SOR
  integration chain plans end-to-end), `harness/eval-backlog.mjs` (whole Blueprint backlog through
  plan → compose → verify), `harness/eval-mcp.mjs` (the shipped MCP over the real stdio protocol),
  `harness/dryrun-build.mjs` (the exact `create-rule` calls the build path would make) and
  `blueprint/verify-blueprint.mjs` (the Blueprint recipe-layer contract).

### Fixed
- **Superseded: the structural-complement and named-family tie-breaks are gone with the
  thresholds.** Two `Fixed` entries from this cycle (a structural prerequisite/dependent is not a
  competing candidate; a clause that names a family does not lose a near-tie to an unnamed one) fixed
  symptoms of the cutoff-and-band verdict. The verdict is now read from the taxonomy distribution
  (`verdict-lib.mjs`), so neither rule exists: the prerequisite table orders the steps and says what
  must exist first, and a clause's wording is no longer a tie-breaker — `separation` is.
- **A relative clause is one goal; a fragment is never a goal.** "How do I create a decision table
  that routes claims by risk band and amount?" split at the "and" **inside** the relative clause
  ("that routes … and amount"), leaving `["create a decision table that routes claims by risk band",
  "amount"]`. `amount` is not a goal: it routed to nothing, came back `unsure`, and the worst-clause
  merge dragged an answerable question down with it. `splitClauses` now refuses a boundary whose
  preceding text holds a relative pronoun (`that|which|who|whose|where`) followed by a verb — the
  clause that pronoun opened is still running — and merges any surviving fragment (one word, or no
  verb and no determiner to head it) back into the clause before it. A determiner-led phrase like
  "an SLA" is **not** a fragment: it is what the user asked for. The question above is now ONE clause
  and answers `yes`; "configure a case type and an SLA" is still two.
- **A named family does not lose a near-tie to an unnamed one** — a `Fixed` entry of this cycle,
  now **superseded** by the taxonomy verdict (a `Choice` distribution plus `separation` replaced the
  lexical `familyNamedIn` table). Kept for the record: it was the measured finding that a near-tie
  between `obj-flow` (named) and `obj-casetype` (unnamed) was not a real ambiguity.

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
