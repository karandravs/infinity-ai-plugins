---
name: pega-build
description: Use when answering a Pega how-to question or turning a Blueprint user story into rules — ask the pega-plan MCP's `plan_pega_change` for a verdict, ordered steps with composed payloads, and the inputs you must supply, then create the rules yourself with Pega's Authoring MCP in the Change Request you already have open.
---

# Build Pega from a question or the Blueprint backlog

Two MCPs do the work: **`pega-plan`** (one question → one defensible answer: verdict, ordered steps,
payloads, `unresolved`) and **`pega-infinity-authoring`** (create/update rules). You drive them; you
don't write files or shell.

## Guardrails
- **The planner never writes.** `plan_pega_change` reads the corpus and the contracts and *returns*
  the answer — no files, no plan store, no server-side state. Nothing it produces lands on disk.
- **You supply the target.** The active Change Request (and the branch it implies) is yours to pick
  in the Authoring MCP. The planner names no branch and no CR — that is deliberate, not an omission.
- **One question at a time.** One call, one question; several goals in one question still answer as
  one question. Never bulk-ask the backlog.
- **The answer is the contract.** Trust the structure and the verdict; you supply what it says it
  owes you. Every payload is a **DRAFT** until the platform validator accepts it.

## The loop (per question or story)
1. **Preflight.** `pega-infinity-authoring` `get-application`. On `auth-required`, stop and tell the user.
2. **Ask.** `plan_pega_change({ question: "<label> — <description> (Acceptance: <criteria>)",
   namespace: "MyOrg-Disputes", contracts_dir: "contracts" })`. Pass the story's acceptance criteria
   in the question — they are what "done" means. `namespace` and `contracts_dir` are optional, and
   omitting them costs you composed class names or grounded endpoints, not the answer.
3. **Read the `verdict`** — the whole point of the call (with `answer`, a deterministic one-paragraph
   summary of the same thing, and `clauses[]`, the per-clause verdicts with the steps each one owns):
   - **`yes`** — every clause maps to authorable rule families. Build the steps.
   - **`alternative`** — part of it is authorable, or there is a supported Pega surface this tool
     does not author. Build the steps; the rest is in `closest` (and `partial`) — a human/config step.
   - **`no`** — nothing in the corpus authors what was asked. **Do not build it.** `closest` **names
     the absent capability** (`no authoring family for "<capability>"`) and why it is absent — it is a
     diagnosis, not a recipe. Route it to a human.
   - **`unsure`** — there is no evidence either way (near-cutoff routing, a clause that names no
     object, or the judgment service being down). **Do not build that clause and do not call it
     impossible.** The overall verdict is the WORST clause, so a question can be `unsure` while other
     clauses are `yes`/`alternative`: build **the steps of the `yes`/`alternative` clauses** (their
     numbers are in `clauses[].steps`) and stop at the `unsure` one. An `unsure` or `no` clause
     contributes **no steps** of its own. `closest` names the candidates or what would resolve it —
     usually a sharper question. A structural **prerequisite or dependent of the winning family is a
     complement, never a competing candidate**: it is part of the same answer (and already a step), so
     its routing score cannot make a clause `unsure`. The candidates an `unsure` names are unrelated
     families.
   `looked_at` is the trail (every family considered, with its score/margin, whether it was used, and
   its `role` — `candidate`, or `prerequisite`/`dependent` when it is a structural complement of the
   winner and therefore was not weighed as a competitor);
   `provenance` is the corpus version, the pinned model, the registry version, the routing sample
   count and the measured `timing_ms`. Neither changes the answer — quote them when you report one.
4. **Read the `steps[]`, in order.** Each step has `n`, a `title`, `rule` (family, skill, example,
   routing score/margin — `null` for a structural prerequisite), a composed `payload`, `provenance`,
   `prerequisites` (step numbers, always smaller than its own), `checks` and `unresolved`.
   **A step is only buildable when it carries a `payload`.** Three cases do not: `kind: "manual"` or
   `"config"` (a Pega surface this tool does not author — `why` says so; do it by hand), and a
   `kind: "rule"` step whose structural prerequisite could not be composed — it is still listed so the
   dependency is visible, but its `payload` is `null` and a caveat says why. **That rule step is not
   buildable: skip it and report it.** Never invent a payload for it.
5. **Pay the bill of materials.** `inputs_required` is what no payload can invent (a namespace, an
   existing flow). Each step's `unresolved[]` is what is still a draft — a rule reference you must
   name, example text not grounded in the question, a borrowed array. Resolve them (check with
   `list-rules`/`search-rules`), or say plainly that you could not.
6. **Build.** For each rule step **that has a payload**, in order: `create-rule { ruleType:
   <payload.pxObjClass>, content: JSON.stringify(<payload>), changeDescription: "US-x: <label>" }` —
   scoped to the Change Request you already have open, one step at a time. On rejection, apply the
   platform truth or record the reason.
7. **Validate for real.** `checks` are **STRUCTURAL only** — `schemaIssues` from the corpus JSON
   schemas, `platformTruthIssues` for env-independent fixes (a `kind: "verify-live"` issue needs the
   live application). **The authoritative validation of a payload is the Authoring MCP's runtime
   validator**, never this tool. Let the platform be the judge.
8. **Record & continue.** Per question: what built, what failed and why → next.

## Coverage — a `no` is a human step
There is no `coverage` flag to consult any more: **the verdict is the coverage signal.** `no` means
*no authoring rule family in the corpus declares the capability* (e.g. "Configure Email Account",
"Configure SSO", access control) and `alternative` means the supported path is a Pega surface this
tool does not author. Either way: **flag it for a human — do not build it.** And read **`caveats[]`**
before you build: it carries what a reviewer must check (prerequisites composed rather than routed,
drafts that are not grounded content, platform-truth issues only the live app can settle).

## Boundaries — report, don't force
- **`access` stories** (persona case/data access): Pega's plugin doesn't expose access authoring →
  **human step**. Report and skip.
- **References** to missing rules: create the referenced rule first (the step order says so) or clear
  the ref — never leave a dangling reference.
- **Classes** must exist: use only real classes from `list-casetypes`/`list-application-objects`;
  a class you invented is not a class.
