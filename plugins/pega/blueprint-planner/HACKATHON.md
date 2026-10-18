# Blueprint → Plan — a spec becomes a *build-ready* Pega plan

**One line:** the official Pega Infinity Authoring plugin **plus one thin layer** that turns a
blueprint's backlog into a **clear, per-rule implementation** — across industries, deterministically.

> **Thesis:** *Playwright + Index + Jev is all you need.* Code for guarantees; the model for judgment.

## The problem
The Authoring plugin can **create** rules, but *what* to build, in *what order*, with *what payload*,
is left to the model to improvise — no measurable plan, no proof it's right.

## What we add (`plugins/pega/blueprint-planner/`)
| Piece | What it does |
|---|---|
| **Blueprint maker** (`blueprint/`) | Playwright drives `pega.com/blueprint`: spec → Blueprint (case types, data model, systems, personas). |
| **Planner** (`mcp/pega-plan/`, tool `plan_pega_build`) | A blueprint story → **plan**: which rules, **build order**, payloads, and the exact **`blanks`** (value / reference / entry) the agent fills. Reads the **plugin's own bundled corpus** — no duplication. |

**It never writes rules.** The **agent** + `pega-infinity-authoring` build. The workflow **ships with
the MCP** (skill + prompt), not a bespoke agent prompt — so *any* agent can use it.

## The proof (evals-first)
`eval/eval-report.md` — **5 industries** (Banking·Disputes, Insurance·Claims, Healthcare·Onboarding,
Telecom·Service Order, Retail·Returns) × 7 blueprint-shaped goals
(case type · data model · **API SOR integration** · decision · correspondence · SLA · UI):

```
35 goals · PRIMARY-ROUTE STABILITY 100% (35/35) · set-stability 83%
plans gated required-keys-present: 37 · plans with references to fill: 6
```

Every rule is laid out — **skill · source example · gate · goalFit · payload keys · references**:
```
obj-casetype · skill rules-rule-obj-casetype · example adhoc-processes… · verify required-keys-present
  payload keys: pyClassName, pyLabel, pyDescription, …
  references:   pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; … (to fill)
connect-rest · skill rules-rule-connect-rest · example get-runtime-url.md · verify required-keys-present
```

**Why this metric matters:** the *plan* is deterministic where it must be — the primary rule a story
maps to is **100% stable** across repeated calls (Jev's stochasticity only shows in the recall
*margin*). The plan is an artifact an agent can execute; `verify` + `goalFit` grade it.

## Boundaries, stated honestly
- **References** to non-existent rules are surfaced as `reference` blanks → the agent names real rules.
- **Access** authoring (persona case/data access) is **not exposed** by the plugin → a **human step**.
- Some rules are **version/corpus-dependent** (`resources/<ver>/`); set `PEGA_CORPUS` to match.

## Why it lands
It's a **fork, not a rewrite** (one layer on the official plugin); it's **measurable** (stability,
gate, goalFit) and **hill-climbed on real platform feedback**; and it draws a **clean boundary** —
planning is ours, *building is the agent's*.
