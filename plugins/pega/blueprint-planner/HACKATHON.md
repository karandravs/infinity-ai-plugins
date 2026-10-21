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
| **Planner** (`mcp/pega-plan/`, tool `plan_pega_change`) | A blueprint story or how-to question → **one defensible answer**: a `verdict` (`yes`/`alternative`/`no`/`unsure`), ordered `steps` (which rules, which order, payloads), `closest`, the `inputs_required` bill of materials, and the `unresolved` elements the agent resolves. Reads the **plugin's own bundled corpus** — no duplication, no env var. |

**It never writes rules.** The **agent** + `pega-infinity-authoring` build. The workflow **ships with
the MCP** (skill + prompt), not a bespoke agent prompt — so *any* agent can use it.

## The proof (evals-first)
`eval/eval-report.md` — **5 industries** (Banking·Disputes, Insurance·Claims, Healthcare·Onboarding,
Telecom·Service Order, Retail·Returns) × 7 blueprint-shaped goals
(case type · data model · **API SOR integration** · decision · correspondence · SLA · UI):

```
35 goals · PRIMARY-ROUTE STABILITY 100% (35/35) · set-stability 100% (35/35) · avgFit 0.41
plans gated required-keys-present: 40 · plans with references to fill: 11
per industry: Banking 7/7 · Insurance 7/7 · Healthcare 7/7 · Telecom 7/7 · Retail 7/7

+ SOR integration chain (eval/eval-integration.md) — 4 industries × 4 steps
  (REST connector → request transform → response transform → data page):
  16 goals · routed 16/16 · expected-family match 16/16 · gated 16/16 · refs 17 · avgFit 0.49

+ The WHOLE blueprint backlog, offline (engineering repo: `docs/backlog-proof.md` — **not shipped**:
  it records a real build and prescribes a branch) — all 40 stories →
  plan → the ordered `create-rule` calls, with no live environment:
  40/40 planned · 40/40 composed · verify PASS 40/40
  …and the planner **flags the 12** whose capability the corpus does not declare
  (email-account, SSO, access-control) instead of silently substituting — 0 false flags on the 51 eval goals

+ The shipped MCP surface (eval/mcp-proof.md) — the real server spawned over stdio:
  26/26 asserts · tool `plan_pega_change` + prompt `pega-build` + shipped skill, end-to-end

+ Blueprint layer, offline (eval/blueprint-proof.md + `blueprint/verify-blueprint.mjs`) —
  recipes parse, refs resolve, selectors well-formed, the create→complete chain covers 7/7 sections,
  and every Blueprint artifact maps to a real corpus family: **15/15 asserts, no gaps**

+ Build path, offline (engineering repo: `docs/build-path.md` — **not shipped**: it records a real
  build and prescribes a branch) — the exact `create-rule` calls a plan yields,
  composed + schema-checked with NO live environment: 6 rules · verify PASS 6/6
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
- **References** to non-existent rules are surfaced as `unresolved` (`kind: reference`) → the agent names real rules.
- **Access** authoring (persona case/data access) is **not exposed** by the plugin → a **human step** (`alternative`/`no`).
- Some rules are **version/corpus-dependent** (`resources/<ver>/`); set `PEGA_CORPUS_ROOT` to match.
- The **integration chain** routes + gates 16/16 and is now **grounded on the contracts** — the SOR the
  goal names, its real endpoint path, and goal-derived chain refs (refs 17; avgFit 0.49; weak-fit 1/16 —
  one connector whose noul is intrinsically low) — we publish the numbers rather than hide them.
- **All 40 backlog stories plan + compose** (the legacy `plan_pega_build` run), and 12 are
  **capability-not-in-corpus** (no family for email-account/SSO/access-control) — *flagged, never
  silently substituted*. Under the `plan_pega_change` contract that flag **is the verdict**: such a
  goal comes back `no` (or `alternative`) with `closest` naming the absent capability. The
  `verify PASS 40/40` is **near-tautological** (the planner only composes rules
  whose `verify` it set) — the honest signals are *planned/composed*, *the verdict*, and the published gap.
- Blueprint behaviour that needs a **live browser** (selectors matching the real DOM, login/import) is
  **not** among the offline asserts — the verifier says so instead of pretending.

## Why it lands
It's a **fork, not a rewrite** (one layer on the official plugin); it's **measurable** (stability,
gate, goalFit) and **hill-climbed on real platform feedback**; and it draws a **clean boundary** —
planning is ours, *building is the agent's*.

`npm test` → **44 checks** (keyless-safe; CI runs the offline blueprint proof too).

**Presenting it:** [`SLIDES.md`](SLIDES.md) (the deck) · [`DEMO.md`](DEMO.md) (the 3-minute script) ·
[`eval/`](eval/) (the proof artifacts).
