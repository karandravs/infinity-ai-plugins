# Demo — 3 minutes: spec → blueprint → plan → build

## 0 · Setup (once)
```bash
cd plugins/pega/blueprint-planner
npm install                 # yaml, zod, @modelcontextprotocol/sdk, playwright-core
# merge the `mcp` block from opencode.json into your opencode config;
# set <your-pega-base-url> (env root, no /prweb); the planner finds the sibling
# infinity-ai-plugins corpus by itself — set PEGA_CORPUS_ROOT only to point elsewhere
```
Prereqs: **Java 17** (Authoring MCP), a reachable Pega env, a Blueprint (or use the maker below).

## 1 · Blueprint (the design hand) — ~60s
```bash
node blueprint/recipe1-create.cjs          # dashboard → create → wizard → Generate (Pega's AI designs it)
node blueprint/recipe2-complete.cjs        # case type + systems (OpenAPI import) + personas → summary
```
→ **Import** the blueprint into Infinity → Pega emits the **Agile Workbench backlog** (`US-*`).

*(Playwright attaches to Chrome on `:9222`; the human does login/import — those steps are surfaced, not hidden.)*

## 2 · Backlog
Ask the agent (or curl the MCP): *fetch the backlog* →
`run-data-page(D_pxWorkBenchUserStories)` → the `US-*` stories with **acceptance criteria**.

## 3 · Plan (the planner MCP) — the money shot — ~60s
```
plan_pega_change({ question: "How do I configure a dispute case with an SLA and a CRM lookup?",
                  namespace: "Disputes", contracts_dir: "contracts" })
```
→ **one answer**: a verdict + the steps, laid out **per rule**:
```
verdict: unsure (clauses 1-2 yes; clause 3 unsure — name which one it needs)
steps:  1. Create the class  2. Create the case type  3. Create the service level
  step 2 · obj-casetype · payload keys: pyLabel, pyClassName, pyStages, …
  checks: schemaIssues [] · platformTruthIssues [pyClassName — kind "verify-live": the class must
          already exist (Rule-Obj-Class) in the target application; only a live app can verify it]
  unresolved: 17 elements (pyClassName → reference "must name an existing class"; pyStages → borrowed entries; …)
  inputs_required: flow, namespace
```
Ask a second one whose capability the corpus does not author (e.g. email account, SSO) — the answer is
`no` with `closest`, not a plausible-looking plan. And a **connector** one (the API SOR integration,
grounded in `contracts/`).

## 4 · Build (the *agent*, via Pega's Authoring MCP) — ~30s
The agent **resolves the `unresolved` elements / `inputs_required`**, then calls `create-rule` **in
step order** — in the Change Request *you* have open (the planner prescribes no branch).
Show one rule appear in the app. *(Needs a live env. The offline equivalent — the exact `create-rule`
calls a plan yields, composed + schema-checked with no environment — is **not shipped**: it records a
real build and prescribes a branch, so it lives in the engineering repo as `docs/build-path.md`.)*

## 5 · The proof (evals) — 30s
```bash
node eval/eval-plan.mjs              # 35 goals × 5 industries
node eval/eval-integration.mjs       # 16 goals: connector→transforms→data page
node blueprint/verify-blueprint.mjs  # 15 asserts over the blueprint recipes (offline)
```
Open `eval/eval-report.md` → **primary-route stability 100%, set-stability 100%, avgFit 0.39** (the two
stability figures were measured on the **legacy per-goal path, 3 samples per goal**; the shipped
`plan_pega_change` path uses **1 batched sample**, so a near-cutoff question can flip — see
`eval/head-to-head.md`), gated plans,
per-rule layout; `eval/eval-integration.md` → the **SOR integration chain routes 16/16, avgFit 0.49**;
`eval/blueprint-proof.md` → the blueprint layer's contract (7/7 sections, 15/15 asserts, every artifact→family);
`eval/mcp-proof.md` → the **shipped MCP surface (26/26)**; `eval/demo-transcript.md` + `eval/head-to-head.md`
→ the `plan_pega_change` verdict contract, end to end. (The two harness-generated reports —
`backlog-proof` and `build-path` — are **not shipped**: they record a real build and prescribe a branch;
they stay in the engineering repo.)

---
### The line to end on
> *Planning is ours; **building is the agent's**. The plan is an artifact you can measure — and we did.*
