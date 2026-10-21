# Blueprint Maker + Planner (for Pega Infinity Authoring)

A thin layer **on top of** the Pega Infinity Authoring plugin that adds two things:

1. **Blueprint maker** (`blueprint/`) — Playwright drivers for `pega.com/blueprint` (create the app,
   systems, personas; wire data objects), so a *spec* becomes a Blueprint — and, on import, Pega's
   **Agile Workbench backlog** (US-\*) of what's left to build.
2. **Planner** (`mcp/pega-plan/`, MCP tool `plan_pega_change`) — answers a Pega how-to question (or
   an Agile-Workbench story) with **one defensible answer**: a `verdict`
   (`yes` / `alternative` / `no` / `unsure`), ordered `steps` with composed payloads, `closest`
   (what to do instead, or what would resolve it), `inputs_required`, `checks` and `unresolved[]`.
   It reads the **plugin's own bundled corpus**
   (`plugins/pega/infinity-ai-plugins/claude/resources/26-1`) — no corpus duplication, and no env
   var needed: the neighbouring plugin's corpus is discovered automatically.

**Philosophy:** *code for guarantees, the model for judgment.* Deterministic structure from the
corpus + schemas; judgment (routing, value selection) from Jev; the **agent** supplies the free text
and does the building via Pega's Authoring MCP.

> The build itself is done by the agent using this MCP + `pega-infinity-authoring`.
> This layer **does not write rules** — and the planner **writes nothing at all**: no plan store, no
> server-side state, no branch or Change Request prescription. You supply the active Change Request
> when you build.

> **For use with Pega Platform under the Pega Infinity AI Plugins License.** See `LICENSE` + `NOTICE`.

## Wiring
Merge the `mcp` block from `opencode.json` into your opencode config (replace
`<absolute-path-to>` with this repo's path and `<your-pega-base-url>` with your environment root —
**no `/prweb`**). It registers two MCPs: `pega-plan` (this layer) and `pega-infinity-authoring`.

The MCP **ships its workflow**: an MCP **prompt** `pega-build` and a skill file
(`mcp/pega-plan/skills/pega-build/SKILL.md`). Any agent can use it:
fetch the backlog (`D_pxWorkBenchUserStories`) → `plan_pega_change` the story (or question) → read the
`verdict` and the `steps` → resolve `inputs_required` / `unresolved` → `create-rule` via the
Authoring MCP, in your Change Request.

## Boundaries (surfaced, not hidden)
- **Access** authoring (persona case/data access) is **not exposed** by the plugin → a human step
  (the answer says so: `alternative`/`no` with `closest`).
- Rule **references** to non-existent rules are surfaced as `unresolved` entries → the agent names them.
- The corpus is version-specific (`resources/<ver>/`) — `PEGA_CORPUS_ROOT` overrides the version
  picked up automatically from the neighbouring plugin.

## Layout
```
blueprint/        Playwright drivers (the design hand)
mcp/pega-plan/    the planner MCP (change-lib, plan-lib, server, corpus-lib, verdict-lib, …) + skills/pega-build
eval/             the proof: blueprint, mcp-surface, demo transcript, head-to-head reports
lib/jev-lib.mjs   Jev HTTP client (remote judgment service; key from the process env only)
contracts/        demo OpenAPI SOR contracts
opencode.json     MCP wiring (merge into your config)
LICENSE / NOTICE  Pega Infinity AI Plugins License v1.0 + attribution
```

## Setup
```bash
cd plugins/pega/blueprint-planner
npm install          # yaml, zod, ajv, ajv-formats, @modelcontextprotocol/sdk, playwright-core
```
Then merge the `mcp` block from `opencode.json` into your opencode config. The planner discovers the
neighbouring plugin's bundled corpus by itself
(`plugins/pega/infinity-ai-plugins/claude/resources/<ver>`) — no env var needed; set
`PEGA_CORPUS_ROOT` only to point at a different corpus root. Credentials (`TYPESAFE_API_KEY`) come
from the process environment; the planner reads no `.env` file.
