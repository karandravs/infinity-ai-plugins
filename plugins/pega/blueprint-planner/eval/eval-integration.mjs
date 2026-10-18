#!/usr/bin/env node
// eval-integration.mjs — proof that the API SOR integration chain plans out end-to-end:
// REST connector -> request data transform -> response data transform -> data page, per industry.
// For each goal it lays out, PER RULE, the ruleType · skill · source example · verify · goalFit,
// the payload keys, and the references (blanks where kind==="reference"). Writes
// docs/eval-integration.md and prints a summary (goals, gated, rules, refs).
import { planPegaBuild } from "../mcp/pega-plan/plan-lib.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.join(ROOT, "contracts");

// For each industry: the system of record its contract describes, and the four-rule chain a
// blueprint's "systems" imply. `expect` is the rule family that SHOULD carry that step; it is
// compared with what the planner actually routed so gaps are visible, never patched.
const INTEGRATIONS = {
  "Banking · Payments": {
    sor: "payments",
    steps: [
      { goal: "Build a REST connector that calls the payments API to look up a transaction and issue a refund.", expect: "connect-rest" },
      { goal: "Add a request data transform that maps dispute case properties to the payments refund request payload.", expect: "obj-model" },
      { goal: "Add a response data transform that maps the payments transaction JSON response onto the dispute case.", expect: "obj-model" },
      { goal: "Add a data page that retrieves transaction data from the payments REST connector.", expect: "declare-pages" },
    ],
  },
  "Insurance · CRM": {
    sor: "crm",
    steps: [
      { goal: "Build a REST connector that calls the CRM API to look up the policyholder and write back case status.", expect: "connect-rest" },
      { goal: "Add a request data transform that maps claim case properties to the CRM customer request payload.", expect: "obj-model" },
      { goal: "Add a response data transform that maps the CRM customer JSON response onto the claim case.", expect: "obj-model" },
      { goal: "Add a data page that retrieves customer data from the CRM REST connector.", expect: "declare-pages" },
    ],
  },
  "Healthcare · Documents": {
    sor: "documents",
    steps: [
      { goal: "Build a REST connector that calls the documents API to extract fields from an ID document.", expect: "connect-rest" },
      { goal: "Add a request data transform that maps patient onboarding case properties to the documents extraction request payload.", expect: "obj-model" },
      { goal: "Add a response data transform that maps the documents JSON response onto the patient case.", expect: "obj-model" },
      { goal: "Add a data page that retrieves document extraction data from the documents REST connector.", expect: "declare-pages" },
    ],
  },
  "Retail · Payments": {
    sor: "payments",
    steps: [
      { goal: "Build a REST connector that calls the payments API to refund the order.", expect: "connect-rest" },
      { goal: "Add a request data transform that maps return case properties to the payments refund request payload.", expect: "obj-model" },
      { goal: "Add a response data transform that maps the payments refund JSON response onto the return case.", expect: "obj-model" },
      { goal: "Add a data page that retrieves order transaction data from the payments REST connector.", expect: "declare-pages" },
    ],
  },
};

const refKinds = (refs) => refs.length ? refs.map(r => `${r.path}=${JSON.stringify(r.example).slice(0, 30)}`).join(" ; ") : "—";
const keys = (payload) => payload ? Object.keys(payload).slice(0, 6).join(", ") : "—";

const md = [
  "# Eval — API SOR integration chain (connector → transforms → data page)\n",
  `Generated ${new Date().toISOString().slice(0, 10)}. Planner: \`plan_pega_build\` with \`contracts_dir=contracts/\`.`,
  "Each industry is planned as a four-rule chain; every step is checked against the family that should carry it.\n",
];
let totalGoals = 0, routed = 0, matched = 0, gated = 0, rules = 0, refsTotal = 0, fits = [];
let extraRuleSteps = 0, weakFit = 0, plansNoRefs = 0;
const perIndustry = [];

for (const [industry, { sor, steps }] of Object.entries(INTEGRATIONS)) {
  md.push(`\n## ${industry}\n`);
  md.push(`System of record: \`${sor}\` (\`contracts/${sor}.yaml\`). Chain: connector → request transform → response transform → data page.\n`);
  let iRouted = 0, iMatched = 0;
  for (const { goal, expect } of steps) {
    totalGoals++;
    const r = await planPegaBuild({ query: goal, contracts_dir: CONTRACTS });
    const live = r.plans.filter(p => p.payload);
    const routedTypes = live.map(p => p.ruleType);
    const isRouted = live.length > 0;
    const hit = routedTypes.includes(expect);
    if (isRouted) { routed++; iRouted++; }
    if (hit) { matched++; iMatched++; }
    if (live.length > 1) extraRuleSteps++;
    md.push(`### “${goal}”\n`);
    md.push(`- **expected**: \`${expect}\` · **routed**: ${routedTypes.join(", ") || "(none)"} · **match**: ${hit ? "✅" : "⚠️"}\n`);
    if (!live.length) {
      md.push(`- ⚠️ no rule with a payload — this chain step did not plan.\n`);
      continue;
    }
    for (const p of live) {
      const refs = (p.blanks || []).filter(x => x.kind === "reference");
      const pass = p.verify === "required-keys-present";
      if (pass) gated++;
      if (refs.length) refsTotal += refs.length; else plansNoRefs++;
      rules++;
      if (typeof p.goalFit === "number") { fits.push(p.goalFit); if (p.goalFit < 0.3) weakFit++; }
      md.push(`  - **${p.ruleType}** · skill \`${p.skill}\` · example \`${p.sourceExample || "—"}\` · verify **${p.verify}** · goalFit ${p.goalFit}\n`);
      md.push(`    - payload keys: ${keys(p.payload)}\n`);
      md.push(`    - references: ${refKinds(refs)}\n`);
    }
    if (!hit) {
      md.push(`- ⚠️ routed away from \`${expect}\` — the chain step planned as ${routedTypes.join(", ")}, not the expected rule family.\n`);
    }
  }
  perIndustry.push([industry, iRouted, iMatched, steps.length]);
}

const avgFit = fits.length ? (fits.reduce((a, x) => a + x, 0) / fits.length).toFixed(2) : "—";
md.splice(2, 0,
  `\n**Summary** — goals: ${totalGoals} · routed: ${routed}/${totalGoals} · expected-family match: ${matched}/${totalGoals} · rules: ${rules} · gated \`required-keys-present\`: ${gated} · references: ${refsTotal} · avg goalFit: ${avgFit}\n`,
  `Per industry (routed / expected-match / steps): ${perIndustry.map(([i, r, m, t]) => `${i} ${r}/${m}/${t}`).join(" · ")}\n`);

md.push(`\n## Gaps observed\n`);
md.push(`- **over-routed steps**: ${extraRuleSteps}/${totalGoals} steps planned more than one rule family (recall-oriented routing; extra rules are not wrong, just noise).\n`);
md.push(`- **weak goalFit**: ${weakFit}/${rules} rules score below 0.3 — the structural gate passes, but payload values are largely borrowed example defaults rather than goal-mapped data.\n`);
md.push(`- **chain wiring**: ${refsTotal} blank with \`kind:"reference"\` across ${rules} rules; ${plansNoRefs}/${rules} rules surface none. The data page's connector/transform names live in \`pyDataSourceList\` but are neither goal-derived nor surfaced as blanks, so nothing points a step at the previous rule in the chain.\n`);
md.push(`- **contract use**: the connector still carries its example's service/class names and method set; \`contracts/\` supplies the SOR base URL and method vocabulary, not the endpoint path or operation.\n`);

writeFileSync(path.join(ROOT, "docs/eval-integration.md"), md.join(""));
const pct = (n) => Math.round(100 * n / totalGoals);
console.log(`integration: ${totalGoals} goals · routed ${routed}/${totalGoals} (${pct(routed)}%) · expected-family match ${matched}/${totalGoals} (${pct(matched)}%) · rules ${rules} · gated ${gated} · refs ${refsTotal} · avgFit ${avgFit}`);
console.log(`gaps: over-routed steps ${extraRuleSteps} · weak-fit rules ${weakFit}/${rules} · rules with no ref blanks ${plansNoRefs}/${rules}`);
console.log(`wrote docs/eval-integration.md · per industry: ${perIndustry.map(([i, r, m, t]) => `${i} routed ${r}/${t}, expected ${m}/${t}`).join(" | ")}`);
