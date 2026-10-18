# Demo — 3 minutes: spec → blueprint → plan → build

## 0 · Setup (once)
```bash
cd plugins/pega/blueprint-planner
npm install                 # yaml, zod, @modelcontextprotocol/sdk, playwright-core
# merge the `mcp` block from opencode.json into your opencode config;
# set <your-pega-base-url> (env root, no /prweb) and PEGA_CORPUS=<…/claude/resources/26-1>
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
plan_pega_build({ query: "Configure Data Model - Dispute Record" })
```
→ a plan, laid out **per rule**:
```
obj-property · skill rules-rule-obj-property · example … · verify required-keys-present · goalFit …
  payload keys: pyPropertyName, pyClassName, pyLabel, pyPropertyMode, …
  references:   —            blanks: pyLabel (value), pyClassName (namespace)
```
Show a second one with **references** (e.g. an activity), and a **connector** (the API SOR
integration, from `contracts/`).

## 4 · Build (the *agent*, via Pega's Authoring MCP) — ~30s
The agent **fills the plan's `blanks`**, then calls `create-rule` in **build order**, into the branch.
Show one rule appear in the app.

## 5 · The proof (evals) — 30s
```bash
node eval/eval-plan.mjs         # 35 goals × 5 industries
node eval/eval-integration.mjs  # 16 goals: connector→transforms→data page
```
Open `eval/eval-report.md` → **primary-route stability 100%, set-stability 97%**, gated plans,
per-rule layout; `eval/eval-integration.md` → the **SOR integration chain routes 16/16**.

---
### The line to end on
> *Planning is ours; **building is the agent's**. The plan is an artifact you can measure — and we did.*
