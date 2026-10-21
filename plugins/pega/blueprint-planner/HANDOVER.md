# Handover — the planner MCP (planner only)

This package ships **one MCP tool**: `plan_pega_change`. It is a **planner**, not an authoring tool.

```
question ──▶ verdict (yes | alternative | no | unsure)
             + ordered steps, each with a composed payload
             + checks, unresolved, inputs_required, closest, looked_at, timing
```

It **never** creates or updates a rule, **never** writes a file, keeps **no** server-side state,
reads **no** `.env`, and prescribes **no** branch or Change Request. The only network call is the
judgment service (Jev). It does **not** need a Pega instance or Pega credentials.

## Requirements

| | |
|---|---|
| Node | **20+** (ESM) |
| Judgment key | `TYPESAFE_API_KEY` in the **process environment** |
| Corpus | a Pega Infinity AI Plugins `resources/<version>` tree (see below) |
| Pega instance | **not required** |
| Authoring MCP | **not required** (pair it only if the caller wants to build) |

## The corpus — pick one

The planner reads the same corpus the official plugin reads (`manifest.json`, `skills/*/schema`,
`skills/*/examples`, `graphs/skills-graph.json`). It bundles **no** copy.

1. **Beside the plugin** (recommended): install `infinity-ai-plugins` next to this package; discovery
   finds `../infinity-ai-plugins/claude/resources/<version>` automatically.
2. **Explicit path**: set `PEGA_CORPUS_ROOT=/path/to/resources/26-1`.

A missing corpus is a **loud startup error** listing every path tried. (`PEGA_CORPUS` still works as a
deprecated alias; `PEGA_GRAPH` is ignored — the graph is derived from the root.)

## MCP config (planner only)

```jsonc
{
  "mcp": {
    "pega-plan": {
      "type": "local",
      "command": ["node", "<path-to>/mcp/pega-plan/server.mjs"],
      "environment": {
        "TYPESAFE_API_KEY": "{env:TYPESAFE_API_KEY}",
        "PEGA_CORPUS_ROOT": "<path-to>/infinity-ai-plugins/claude/resources/26-1"
      },
      "enabled": true
    }
  }
}
```

That is the whole integration. Nothing else is required.

## A call

```jsonc
// plan_pega_change
{ "question": "How do I configure a dispute case with an SLA and a CRM lookup?" }
```

Measured on the five-question demo (stable across runs):

| question | verdict |
|---|---|
| dispute case + SLA + CRM lookup | `unsure` — clauses 1–2 `yes`; clause 3 names its candidates (data page / service-mcp / flow) |
| REST connector → Payments API | `yes` (contract-grounded) |
| case access for the dispute analyst | `alternative` (App Studio → Users & Roles) |
| configure an email account | `no` (not authorable) |
| "make the case fly" | `unsure` |

Cost: **one** judgment call per question; composition is deterministic. Typical latency **0.4–0.9 s**,
reported in `provenance.timing_ms`.

## What the caller must know

- **`verdict` ≠ Pega acceptance.** `checks` are **structural** (AJV against the corpus schemas +
  env-independent platform-truth fixes). The authoritative validation is the Infinity Authoring MCP's
  **runtime** validator, against a live application.
- **`steps[].payload` is a draft.** `unresolved[]` lists every element still to be supplied: a rule
  reference to name, example text not grounded in the question, a borrowed array.
- **`inputs_required[]`** is part of the answer — e.g. `namespace` when class names cannot be invented.
- **`unsure` is a real answer**, and it names the competing candidates. Do not build from it.

## Licence

For use with **Pega Platform** under the **Pega Infinity AI Plugins License** (see `LICENSE` and
`NOTICE`). The corpus is Pegasystems' Work; it is not redistributed here.
