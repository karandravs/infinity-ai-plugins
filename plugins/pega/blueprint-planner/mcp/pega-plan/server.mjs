#!/usr/bin/env node
// pega-plan — MCP server: build-goal query + Jev + skill corpus => concrete payload plan.
// Tool: plan_pega_build({ query, out_dir? }) — like find-car: stateless, reads the vendored
// Pega skill corpus in index/pega-infinity-ai-plugins-resources-26-1, routes + validates
// via Jev (judgment only; no LLM authoring — values come from parsing the goal/contracts),
// and emits a {ruleType, skill, payload, verify, provenance, blanks}[] plan written as a JSON file.
//
// Env: TYPESAFE_API_KEY required (Jev). Optional PEGA_CORPUS path override.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planPegaBuild, fillPlan, loadPlan, planIdFor } from "./plan-lib.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const server = new McpServer({ name: "pega-plan", version: "0.2.0" });

// the workflow ships WITH the MCP: exposed as an MCP prompt so any client can fetch it,
// and as a skill file (mcp/pega-plan/skills/pega-build/SKILL.md) for filesystem-skill clients.
server.registerPrompt(
  "pega-build",
  { title: "Build Pega from the Blueprint backlog", description: "How to use this MCP (+ Pega's Authoring MCP) to turn Agile-Workbench user stories into rules — plan, fill the plan's blanks, create-rule in build order, into branch `build_on`." },
  () => ({ messages: [{ role: "user", content: { type: "text", text: readFileSync(path.join(__dir, "skills/pega-build/SKILL.md"), "utf8") } }] })
);

server.registerTool(
  "plan_pega_build",
  {
    title: "Plan Pega build from a goal: Jev routes skills, code fills payload from the vendor corpus, Jev validates.",
    description:
      "Given a plain-English build goal for Pega Infinity (e.g. 'REST connector that calls the Payments API and maps the response'), resolve the relevant rule-authoring skills, load their real example payloads from the vendored skill corpus, fill payload keys deterministically, and have Jev score each payload against its example. Writes a plan JSON (ruleType, skill, payload, verify, provenance, blanks) and returns a summary plus the written outPath. Reads only the vendored corpus + Jev; no LLM authoring, no live Pega needed. Pass out_dir verbatim when the harness supplies an approved write path; omit it and the plan is written to a fresh temp directory. Values are goal-derived where possible (Jev selects enum values, code composes text) and each field is tagged with provenance; each plan lists its `blanks` (value/reference/entry slots the caller fills). Check the top-level `coverage` (`{ covered, capability, phrase, reason }`) and `caveats[]` before building: when `coverage.covered` is false, NO authoring rule family declares the goal's capability (e.g. 'Configure Email Account', 'Configure SSO', access control) — routing still returns a structurally-valid plan, but route the goal to a human, do not build it (the same message rides in `caveats[]`). When `out_dir` is given it is created and the plan JSON is written there (also returned as `outPath`).",
    inputSchema: {
      query: z.string().describe("Plain-English build goal for a Pega rule/plan, e.g. 'Build a REST connector that calls the Payments API (GET /transactions/{id}, POST /refunds) and maps the JSON response onto the case.'"),
      out_dir: z.string().optional().describe("Write directory for the plan JSON. Pass the harness-provided approved path verbatim; omit to default to a fresh temp dir (returned as outPath)."),
      contracts_dir: z.string().optional().describe("Optional path to OpenAPI contracts (e.g. contracts) used to fill endpoint values. Defaults to none (values stay templated)."),
      sor_base_url: z.string().optional().describe("Base URL stamped into integration payloads (pyEmbeddedURL). Defaults to the demo SOR base."),
      namespace: z.string().optional().describe("Optional app namespace (e.g. 'MyOrg-MyApp') used to compose identity class names; omit to keep the example's values."),
      values: z.record(z.any()).optional().describe("Agent-authored fill values, keyed '<ruleType>|<path>' (paths from each plan's `blanks`; an `entries` blank's value is an ARRAY of row objects). Pass with plan_id (call 1's) so the tool fills THAT frozen plan — re-planning would select differently and misalign the fills."),
      plan_id: z.string().optional().describe("The planId returned by call 1. Pass it with `values` so call 2 fills the SAME frozen plan (deterministic) instead of re-planning."),
    },
  },
  async ({ query, out_dir, contracts_dir, sor_base_url, namespace, values, plan_id }) => {
    let out;
    if (values) {
      // CALL 2 — fill the FROZEN plan (never re-plan); fall back to a fresh plan if none is stored
      try { out = await fillPlan(loadPlan(plan_id || planIdFor({ query, namespace, contracts_dir })), values); }
      catch { out = await planPegaBuild({ query, out_dir, contracts_dir, sor_base_url, namespace, values }); }
    } else {
      out = await planPegaBuild({ query, out_dir, contracts_dir, sor_base_url, namespace });
    }
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

await server.connect(new StdioServerTransport());