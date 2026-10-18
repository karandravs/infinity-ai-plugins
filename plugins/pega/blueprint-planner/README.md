# Blueprint Maker + Planner (for Pega Infinity Authoring)

A thin layer **on top of** the Pega Infinity Authoring plugin that adds two things:

1. **Blueprint maker** (`blueprint/`) — Playwright drivers for `pega.com/blueprint` (create the app,
   systems, personas; wire data objects), so a *spec* becomes a Blueprint — and, on import, Pega's
   **Agile Workbench backlog** (US-\*) of what's left to build.
2. **Planner** (`mcp-pega-plan/`, MCP tool `plan_pega_build`) — turns each story into a **clear
   implementation**: which rules, in build order, with the payloads and the **`blanks`** the caller
   fills. It reads the **plugin's own bundled corpus**
   (`plugins/pega/infinity-ai-plugins/claude/resources/26-1`) — no corpus duplication.

**Philosophy:** *code for guarantees, the model for judgment.* Deterministic structure from the
corpus + schemas; judgment (routing, value selection) from Jev; the **agent** supplies the free text
and does the building via Pega's Authoring MCP.

> The build itself is done by the agent using this MCP + `pega-infinity-authoring`.
> This layer **does not write rules**.

## Wiring
Merge the `mcp` block from `opencode.json` into your opencode config (replace
`<absolute-path-to>` with this repo's path and `<your-pega-base-url>` with your environment root —
**no `/prweb`**). It registers two MCPs: `pega-plan` (this layer) and `pega-infinity-authoring`.

The MCP **ships its workflow**: an MCP **prompt** `pega-build` and a skill file
(`mcp-pega-plan/skills/pega-build/SKILL.md`). Any agent can use it:
fetch the backlog (`D_pxWorkBenchUserStories`) → `plan_pega_build` a story → fill the plan's
`blanks` → `create-rule` (branch-scoped) via the Authoring MCP.

## Boundaries (surfaced, not hidden)
- **Access** authoring (persona case/data access) is **not exposed** by the plugin → a human step.
- Rule **references** to non-existent rules are surfaced as `reference` blanks → the agent fills/clears.
- The corpus is version-specific (`resources/<ver>/`) — set `PEGA_CORPUS` to match your Infinity version.

## Layout
```
blueprint/        Playwright drivers (the design hand)
mcp-pega-plan/    the planner MCP (plan-lib, server, compose-lib, graph-lib) + skills/pega-build
lib/jev-lib.mjs   Jev HTTP client (remote judgment service)
contracts/        demo OpenAPI SOR contracts
opencode.json     MCP wiring (merge into your config)
```

## Setup
```bash
cd plugins/pega/blueprint-planner
npm install          # yaml, zod, @modelcontextprotocol/sdk, playwright-core
```
Then merge the `mcp` block from `opencode.json` into your opencode config. The planner reads the
plugin's bundled corpus via `PEGA_CORPUS` (point it at
`plugins/pega/infinity-ai-plugins/claude/resources/<ver>` for your Infinity version).
