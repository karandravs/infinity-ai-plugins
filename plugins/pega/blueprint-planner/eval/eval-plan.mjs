#!/usr/bin/env node
// eval-plan.mjs — proof of working: plan blueprint-shaped goals across industries and lay out,
// PER RULE, the skill + source example + payload + references + gate + goalFit, plus a STABILITY
// score (does the same goal route to the same rules on repeated calls?). Writes docs/eval-report.md.
import { planPegaBuild } from "../mcp/pega-plan/plan-lib.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.join(ROOT, "contracts");

// blueprint-shaped goals per industry: case type · data model · API SOR integration · decision ·
// correspondence · SLA · UI. (The blueprint emits these; we plan each.)
const INDUSTRIES = {
  "Banking · Disputes": [
    "Create a dispute case type with stages for intake, investigation, and resolution.",
    "Add a data model for dispute records with transaction and customer references.",
    "Build a REST connector that calls the payments API to look up a transaction and issue a refund.",
    "Add a decision table that routes disputes by risk band and amount.",
    "Create correspondence for approval and rejection letters.",
    "Configure an SLA that escalates a stalled dispute to the manager after five days.",
    "Add a UI view to capture dispute details.",
  ],
  "Insurance · Claims": [
    "Create a claims case type with stages for reporting, assessment, and settlement.",
    "Add a data model for claim records with policy and claimant references.",
    "Build a REST connector that calls the CRM API to look up the policyholder.",
    "Add a decision table that routes claims by claim amount and fraud score.",
    "Create correspondence for settlement approval and rejection.",
    "Configure an SLA that escalates a stalled claim to the assessor's manager.",
    "Add a UI view to capture claim evidence.",
  ],
  "Healthcare · Patient Onboarding": [
    "Create a patient onboarding case type with stages for registration, verification, and activation.",
    "Add a data model for patient records with identity and contact references.",
    "Build a REST connector that calls the documents API to extract fields from an ID document.",
    "Add a decision table that routes onboarding by risk and missing documents.",
    "Create correspondence for onboarding confirmation and requests for more information.",
    "Configure an SLA that escalates a stalled registration after two days.",
    "Add a UI view to capture patient demographics.",
  ],
  "Telecom · Service Order": [
    "Create a service order case type with stages for capture, provisioning, and activation.",
    "Add a data model for service orders with account and address references.",
    "Build a REST connector that calls the risk API to score a new line request.",
    "Add a decision table that routes orders by credit band.",
    "Create correspondence for order confirmation and rejection.",
    "Configure an SLA that escalates a stalled provisioning order.",
    "Add a UI view to capture the service order.",
  ],
  "Retail · Returns": [
    "Create a returns case type with stages for request, inspection, and refund.",
    "Add a data model for return records with order and item references.",
    "Build a REST connector that calls the payments API to refund the order.",
    "Add a decision table that routes returns by reason and value.",
    "Create correspondence for refund approval and rejection.",
    "Configure an SLA that escalates a stalled return.",
    "Add a UI view to capture return details.",
  ],
};

const refKinds = (refs) => refs.length ? refs.map(r => `${r.path}=${JSON.stringify(r.example).slice(0, 30)}`).join(" ; ") : "—";
const keys = (payload) => payload ? Object.keys(payload).slice(0, 6).join(", ") : "—";

const md = ["# Eval — blueprint → plan, across industries\n", `Generated ${new Date().toISOString().slice(0, 10)}. Planner: \`plan_pega_build\`. Stability = 2 calls route to the same rule set.\n`];
let totalGoals = 0, stable = 0, gated = 0, withRefs = 0, fits = [], perIndustry = [];

for (const [industry, goals] of Object.entries(INDUSTRIES)) {
  md.push(`\n## ${industry}\n`);
  let iStable = 0;
  for (const goal of goals) {
    totalGoals++;
    const a = await planPegaBuild({ query: goal, contracts_dir: CONTRACTS });
    const b = await planPegaBuild({ query: goal, contracts_dir: CONTRACTS });
    const setA = a.plans.filter(p => p.payload).map(p => p.ruleType).sort().join(",");
    const setB = b.plans.filter(p => p.payload).map(p => p.ruleType).sort().join(",");
    const isStable = setA === setB && setA.length > 0;
    if (isStable) { stable++; iStable++; }
    md.push(`### “${goal}”\n`);
    md.push(`- **routed**: ${setA || "(none)"} · **stable**: ${isStable ? "✅" : "⚠️"}${setA !== setB ? ` (varies: ${setB || "(none)"})` : ""}\n`);
    for (const p of a.plans) {
      if (!p.payload) { md.push(`- \`${p.ruleType}\` — no example\n`); continue; }
      const refs = (p.blanks || []).filter(x => x.kind === "reference");
      const pass = p.verify === "required-keys-present";
      if (pass) gated++;
      if (refs.length) withRefs++;
      if (typeof p.goalFit === "number") fits.push(p.goalFit);
      md.push(`  - **${p.ruleType}** · skill \`${p.skill}\` · example \`${p.sourceExample || "—"}\` · verify **${p.verify}** · goalFit ${p.goalFit}\n`);
      md.push(`    - payload keys: ${keys(p.payload)}\n`);
      md.push(`    - references: ${refKinds(refs)}\n`);
    }
  }
  perIndustry.push([industry, iStable, goals.length]);
}

const avgFit = fits.length ? (fits.reduce((a, x) => a + x, 0) / fits.length).toFixed(2) : "—";
md.unshift("");
md.splice(2, 0,
  `\n**Summary** — goals: ${totalGoals} · planning **stable**: ${stable}/${totalGoals} (${Math.round(100 * stable / totalGoals)}%) · plans gated \`required-keys-present\`: ${gated} · plans with references to fill: ${withRefs} · avg goalFit: ${avgFit}\n`,
  `Per industry (stable/total): ${perIndustry.map(([i, s, t]) => `${i} ${s}/${t}`).join(" · ")}\n`);

writeFileSync(path.join(ROOT, "docs/eval-report.md"), md.join(""));
console.log(`eval: ${totalGoals} goals · stable ${stable}/${totalGoals} (${Math.round(100 * stable / totalGoals)}%) · gated ${gated} · with-refs ${withRefs} · avgFit ${avgFit}`);
console.log(`wrote docs/eval-report.md · per industry: ${perIndustry.map(([i, s, t]) => `${i} ${s}/${t}`).join(" | ")}`);
