---
marp: true
theme: default
paginate: true
size: 16:9
---

# Pega, Automated
## Blueprint → Plan → Build

**One thin layer turns a spec into a build-ready Pega plan — across industries, deterministically.**

*Pega Build Spine · hackathon submission*

---

## The problem

Pega's AI assistant plugin can **create** rules.

But **what** to build, in **what order**, with **what payload** — and whether it's even *right* —
is left to the model to improvise.

> No artifact. No measurement. No proof.

---

## The thesis

> **Playwright + Index + Jev is all you need.**

- **Playwright** designs it → a Pega **Blueprint**
- **Index + Jev** plan it → a per-rule **build plan**
- The **agent** builds it → via Pega's Authoring MCP

**Code for guarantees. The model for judgment.**

---

## The shape

```
 spec ──▶ Blueprint ──▶ backlog ──▶ PLAN ──▶ agent + Authoring MCP ──▶ rules
          (Playwright)  (US-*)     (this)        (not this)
```

**This submission is the PLAN.** It never writes rules.
The workflow **ships with the MCP** (skill + prompt) — no bespoke agent prompt.

---

## What we added

`plugins/pega/blueprint-planner/` — a layer on the **official** plugin (a fork, not a rewrite):

| Piece | What it does |
|---|---|
| **Blueprint maker** (`blueprint/`) | Playwright drives `pega.com/blueprint`: case types, data model, systems (OpenAPI), personas |
| **Planner** (`mcp/pega-plan/`) | A story or question → **a verdict, ordered steps, payloads, and the exact `unresolved` elements** to resolve |
| Reuses the plugin's **own corpus** | No vendored docs — the planner reads `claude/resources/26-1` |

---

## The proof — the numbers

```
Plan eval     35 goals × 5 industries (Banking·Disputes, Insurance·Claims,
              Healthcare·Onboarding, Telecom·Service Order, Retail·Returns)
              PRIMARY-ROUTE STABILITY  100% (35/35)
              set-stability            100% (35/35)
              plans gated              40
              per industry             7/7 · 7/7 · 7/7 · 7/7 · 7/7

SOR integration chain   16 goals · routed 16/16 · expected-family 16/16
                        connectors grounded 4/4 · avgFit 0.49
```

**The primary rule a story maps to is deterministic across repeated calls.**
(Jev's stochasticity shows only in the recall *margin*; `plan_id` freezes a plan for execution.)

---

## The proof — the whole backlog

**Every one of the 40 Blueprint stories → plan → the ordered `create-rule` calls — offline:**

```
stories 40 · planned 40/40 · composed 40/40 · verify-pass 40/40
…and the planner FLAGS the 12 whose capability the corpus doesn't declare
   (email-account, SSO, access-control) — 0 false flags on the 51 industry goals
```

> It **flags** what it can't do — it does not silently substitute.

---

## The proof — the other three surfaces

```
Blueprint layer, offline   15/15 asserts · 7/7 sections · every artifact→corpus family
Shipped MCP surface        27/27 asserts — real server over stdio:
                           tool plan_pega_change · prompt pega-build · shipped skill
Build path, offline        6 rules · verify PASS 6/6 (no live env needed)
```

`npm test` → **44 checks** (keyless-safe) · CI runs the offline proof.

---

## Example — a plan, per rule

```
obj-casetype · skill rules-rule-obj-casetype · verify required-keys-present · goalFit 0.76
  payload keys : pyClassName, pyLabel, pyDescription, pyStages…
  stages       : from the goal  ("intake → investigation → resolution")
  references   : pyStages[0].pyProcesses[0].pyFlowName = "…"   ← agent fills
connect-rest · skill rules-rule-connect-rest · verify required-keys-present
  grounded on  : the SOR the goal names — base URL, endpoint path, used methods only
```

Every rule carries: **skill · source example · gate · goalFit · payload keys · references.**

---

## Example — the SOR integration chain

```
REST connector ─▶ request transform ─▶ response transform ─▶ data page
16/16 routed · 16/16 expected-family · connectors grounded 4/4 from contracts/
refs: the data page names its connector + transforms  → agent points them at real rules
```

- SOR matched from the goal (**not** a random one — generic/unnamed goals match nothing)
- Real endpoint path stamped; only the methods the goal needs are populated

---

## Boundaries, stated honestly

- **References** to rules that don't exist yet are surfaced as `unresolved` (`kind: reference`) → the agent resolves them.
- **Access** authoring (persona case/data access) isn't exposed by the plugin → a **human step**.
- 12/40 backlog stories hit a **capability gap** (no email/SSO/access family) → **flagged**, not faked.
- Blueprint behaviour needing a **live browser** (DOM, login/import) is **not** among the offline asserts.
- The **live build** needs a running, authed env (ours is powered off) — the offline proofs stand in.

---

## The demo (3 minutes)

```
1. spec → Blueprint          (Playwright)
2. import → Agile Workbench backlog (US-*)
3. plan_pega_change("How do I configure a dispute case with an SLA and a CRM lookup?") → verdict + steps
4. the agent resolves the unresolved + create-rule (Authoring MCP) → rule in YOUR Change Request
5. the evals → 100% primary-route stability · 40/40 backlog · 15/15 blueprint
```

> *Planning is ours; **building is the agent's.** The plan is an artifact you can measure — and we did.*

---

## Why it lands

| Claim | Evidence |
|---|---|
| **Fork, not a rewrite** | one layer on the official plugin; reuses its corpus |
| **Deterministic where it must be** | 100% primary-route + set stability |
| **Per rule, executable** | skill · example · payload · references · gate |
| **Honest** | flags capability gaps; states what's unproven |
| **Evals-first** | measurable + hill-climbed on real platform feedback |

**Next:** run the live build when the env is awake; close the remaining `ui-view`/`correspondence` goalFit.
