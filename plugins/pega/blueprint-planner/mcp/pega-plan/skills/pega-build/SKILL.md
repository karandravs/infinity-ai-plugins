---
name: pega-build
description: Use when building a Pega application from a Blueprint's backlog — turning Agile Workbench user stories (US-*) into working Pega rules via the pega-plan MCP (design + plan) and Pega's Authoring MCP (create-rule). Covers planning a story, filling the plan's blanks, and creating the rules in build order.
---

# Build Pega from the Blueprint backlog

Two MCPs do the work: **`pega-plan`** (goal → plan: rules, build order, payloads, `blanks`) and
**`pega-infinity-authoring`** (create/update rules). You drive them; you don't write files or shell.

## Guardrails
- **Write only into branch `build_on`** — pass `branchID: "build_on"` on every `create-rule`. Never `BP-1`.
- **One story at a time.** Plan → build that story → record → next. Never bulk-create.
- **The plan is the contract.** Trust the structure; you supply the values/references it asks for.

## The loop (per story)
1. **Preflight.** `pega-infinity-authoring` `get-application`. On `auth-required`, stop and tell the user.
2. **Backlog.** `run-data-page { dataPage: "D_pxWorkBenchUserStories", dataPageType: "list" }` →
   `Pega-Agile-Work-UserStory` items not `Resolved-Completed`; prefer lower `pyPriority`.
3. **Read the story.** `get-case-details` on its `pzInsKey` → `pyLabel`, `pyDescription`,
   `pyUserStoryAcceptanceCriteria` (**the acceptance criteria are "done"**).
4. **Plan.** `pega-plan` `plan_pega_build({ query: "<label> — <description> (Acceptance: <criteria>)",
   namespace: "MyOrg-Disputes" })`. Keep the `planId` and each plan's `blanks`.
5. **Fill.** Build a `values` map keyed `"<ruleType>|<path>"` for every blank:
   `kind:"value"` → a sensible value from the story; `kind:"reference"` → an **existing** rule name
   (check with `list-rules`/`search-rules`) or `""` to clear; `kind:"entries"` → the row array.
   Then `plan_pega_build({ query, plan_id, values })` to fill the **frozen** plan and re-verify.
6. **Build.** For each plan **in order**: `create-rule { ruleType: <payload.pxObjClass>,
   content: JSON.stringify(<payload>), branchID: "build_on", changeDescription: "US-x: <label>" }`.
   On rejection, apply the platform truth or record the reason.
7. **Record & continue.** Per story: what built, what failed and why → next story.

## Boundaries — report, don't force
- **`access` stories** (persona case/data access): Pega's plugin doesn't expose access authoring →
  **human step**. Report and skip.
- **References** to missing rules: create the referenced rule first (build order) or clear the ref —
  never leave a dangling reference.
- **Classes** must exist: use only real classes from `list-casetypes`/`list-application-objects`.
