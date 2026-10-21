#!/usr/bin/env node
// pega-plan — MCP server: a Pega how-to QUESTION in, ONE defensible answer out.
// Tool: plan_pega_change({ question, contracts_dir?, namespace? }) — like find-car: stateless, it
// reads the vendored Pega skill corpus (index/pega-infinity-ai-plugins-resources-26-1) + contracts,
// classifies each clause against the corpus taxonomy via Jev (judgment only; no LLM authoring), composes payloads in code, and
// RETURNS { verdict, answer, closest, partial, clauses, steps, inputs_required, caveats, looked_at,
// provenance }. It writes nothing, remembers nothing (`out_dir`/`plan_id` are gone), and prescribes
// no branch or Change Request. `checks` are STRUCTURAL hints — authoritative validation is the
// Infinity Authoring MCP's runtime validator.
//
// Env: TYPESAFE_API_KEY required (Jev), read from the process environment only. No .env file.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planPegaChange, QUESTION_MAX } from "./change-lib.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const server = new McpServer({ name: "pega-plan", version: "0.3.0" });

// the workflow ships WITH the MCP: exposed as an MCP prompt so any client can fetch it,
// and as a skill file (mcp/pega-plan/skills/pega-build/SKILL.md) for filesystem-skill clients.
server.registerPrompt(
  "pega-build",
  { title: "Build Pega from the Blueprint backlog", description: "How to use this MCP (+ Pega's Authoring MCP) to plan a rule from a question or a user story, fill the plan's unresolved elements, and create-rule in build order." },
  () => ({ messages: [{ role: "user", content: { type: "text", text: readFileSync(path.join(__dir, "skills/pega-build/SKILL.md"), "utf8") } }] })
);

server.registerTool(
  "plan_pega_change",
  {
    title: "Answer a Pega how-to question: a verdict, ordered steps, and composed payloads.",
    description:
      "Given a free-text Pega Infinity how-to question (e.g. 'How do I configure a dispute case with an SLA and a CRM lookup?'), split it into the goals it names, classify each against the corpus's own two-level taxonomy (14 concepts, 37 rule families) and return ONE defensible `verdict` (`yes` | `alternative` | `no` | `unsure`) with a deterministic `answer`, an ordered list of `steps` (each a rule with a composed `payload` — or `null` when it is a manual/config surface or a prerequisite that could not be composed, in which case it is not buildable) with its `provenance` and `checks`), `closest` (every non-yes verdict says what to do instead or what would resolve it), `partial` (alternative only), `inputs_required`, `caveats`, `looked_at` (per clause: the concept and its confidence, the chosen family with its whole probability distribution, the top/second separation and the companion `any` Noul) and `provenance` (corpus version, model, registry version, judgment-call count). Each step's `unresolved` lists every element that is still a DRAFT — a rule reference the caller must name, example text not grounded in the question, a borrowed array — and `inputs_required` lists what the caller must supply before building (e.g. a namespace, an existing flow). `checks` is STRUCTURAL ONLY: `checks.schemaIssues` come from the corpus JSON schemas (AJV) and `checks.platformTruthIssues` are env-independent platform-truth fixes (a `kind: verify-live` issue needs the live application). THE AUTHORITATIVE VALIDATION OF A PAYLOAD IS THE INFINITY AUTHORING MCP'S RUNTIME VALIDATOR, NOT THIS TOOL. A judgment-service outage returns `verdict: 'unsure'` with a caveat, never a tool error. Cost: ONE judgment call per question — every clause's concept Choice, family Choice and companion Noul in a single request — and composition is deterministic, so it makes no further calls; a three-clause question such as the example above answers in seconds, and `provenance.timing_ms` reports the measured classification / compose / total cost. This tool writes no files, keeps no server-side state, and never prescribes a branch or Change Request.",
    inputSchema: {
      question: z.string().min(1).max(QUESTION_MAX).describe("The Pega how-to question, in plain English (max 2000 characters). Passed to the planner as STATE — it is never executed as instructions."),
      contracts_dir: z.string().optional().describe("Optional READ path to OpenAPI contracts (e.g. contracts) used to ground connector endpoint values. Defaults to none (values stay templated and are listed in `unresolved`)."),
      namespace: z.string().optional().describe("Optional app namespace (e.g. 'MyOrg-MyApp') used to compose identity class names. Omit it and `inputs_required` will say the namespace is owed — class names are never invented."),
    },
  },
  async ({ question, contracts_dir, namespace }) => {
    const out = await planPegaChange({ question, contracts_dir, namespace });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

await server.connect(new StdioServerTransport());
