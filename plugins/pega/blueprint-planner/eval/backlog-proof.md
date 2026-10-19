# Blueprint backlog — offline proof (Blueprint → Plan → Build)

Generated 2026-10-19T05:53:45.620Z. Planner: `plan_pega_build` (Jev-backed), story title as the goal. For every story this proves the **whole offline chain**: it is **planned** (>=1 authorable rule), **composed** (the exact ordered `create-rule` calls are built, with blanks filled the way `harness/dryrun-build.mjs` does), and **verified** (each rule PASSes its `verify` gate, `required-keys-present`). **No Pega environment is contacted and no rule is created.**

**Branch:** `build_on` (from `pega.config.json`). Reproduce with `node harness/eval-backlog.mjs` (see bottom).

**Source:** `plans/backlog/blueprint-backlog.json` — 40 stories.

**Summary** — stories: 40 · **planned: 40/40** · **composed: 40/40** · **verify PASS: 40/40** · **capability not in corpus: 12**.


## Stories

| id | title | kind | rules | verify | covered | families |
|----|-------|------|-------|--------|---------|----------|
| US-1 | Configure Email Account | config | 1 | PASS (1/1) | **NO** (account) | obj-corr |
| US-2 | Configure SSO - Disputes & Fraud Claims | config | 1 | PASS (1/1) | **NO** (sso) | obj-flowaction |
| US-3 | Configure UX - Dispute Resolution | ux | 2 | PASS (2/2) | yes | obj-flowaction, obj-casetype |
| US-5 | Configure SLA - Dispute Resolution | sla | 1 | PASS (1/1) | yes | obj-servicelevel |
| US-6 | Create REST services - Dispute Resolution | rest-service | 1 | PASS (1/1) | yes | connect-rest |
| US-7 | Configure step - Capture Inquiry | step | 2 | PASS (2/2) | yes | service-mcp, obj-activity |
| US-8 | Configure step - Classify Dispute | step | 1 | PASS (1/1) | yes | service-mcp |
| US-9 | Configure step - Validate Identity | step | 2 | PASS (2/2) | yes | edit-validate, obj-validate |
| US-10 | Configure step - Acknowledge Request | step | 2 | PASS (2/2) | yes | obj-activity, obj-flowaction |
| US-11 | Configure step - Retrieve Records | step | 2 | PASS (2/2) | yes | service-mcp, obj-activity |
| US-12 | Configure step - Contact Counterparty | step | 2 | PASS (2/2) | yes | obj-flowaction, service-mcp |
| US-13 | Configure step - Suspect Fraud | step | 2 | PASS (2/2) | yes | service-mcp, obj-activity |
| US-14 | Configure step - Request Evidence | step | 2 | PASS (2/2) | yes | obj-flowaction, service-mcp |
| US-15 | Configure step - Determine Outcome | step | 2 | PASS (2/2) | yes | service-mcp, obj-activity |
| US-16 | Configure step - Refund Initiate | step | 2 | PASS (2/2) | yes | obj-flowaction, service-mcp |
| US-17 | Configure step - Customer Notification | step | 2 | PASS (2/2) | yes | notification, obj-corr |
| US-18 | Configure step - Process Refund | step | 3 | PASS (3/3) | yes | obj-flowaction, obj-casetype, obj-activity |
| US-19 | Configure step - Confirm Satisfaction | step | 1 | PASS (1/1) | yes | service-mcp |
| US-20 | Configure step - Quality Review | step | 1 | PASS (1/1) | yes | service-mcp |
| US-21 | Configure step - Close Case | step | 2 | PASS (2/2) | yes | obj-flowaction, obj-casetype |
| US-22 | Configure UX - Customer Account | ux | 2 | PASS (2/2) | yes | obj-flowaction, ui-view |
| US-23 | Configure Data Model - Customer Account | data-model | 2 | PASS (2/2) | yes | obj-class, obj-property |
| US-24 | Configure UX - Dispute Record | ux | 1 | PASS (1/1) | yes | ui-view |
| US-25 | Configure Data Model - Dispute Record | data-model | 2 | PASS (2/2) | yes | obj-class, obj-property |
| US-26 | Configure UX - Risk Assessment | ux | 1 | PASS (1/1) | yes | service-mcp |
| US-27 | Configure Data Model - Risk Assessment | data-model | 2 | PASS (2/2) | yes | obj-class, obj-property |
| US-28 | Configure UX - Contact Profile | ux | 1 | PASS (1/1) | yes | ui-view |
| US-29 | Configure Data Model - Contact Profile | data-model | 2 | PASS (2/2) | yes | obj-property, obj-class |
| US-30 | Configure UX - Payment Transaction | ux | 2 | PASS (2/2) | yes | obj-flowaction, ui-view |
| US-31 | Configure Data Model - Payment Transaction | data-model | 2 | PASS (2/2) | yes | obj-class, obj-property |
| US-32 | Configure Case Access for Customer | access | 1 | PASS (1/1) | **NO** (access) | obj-flowaction |
| US-33 | Configure Data Access for Customer | access | 2 | PASS (2/2) | **NO** (access) | service-mcp, declare-pages |
| US-34 | Configure Case Access for Dispute Analyst | access | 1 | PASS (1/1) | **NO** (access) | service-mcp |
| US-35 | Configure Data Access for Dispute Analyst | access | 1 | PASS (1/1) | **NO** (access) | service-mcp |
| US-36 | Configure Case Access for Finance Approver | access | 1 | PASS (1/1) | **NO** (access) | obj-casetype |
| US-37 | Configure Data Access for Finance Approver | access | 1 | PASS (1/1) | **NO** (access) | obj-property |
| US-38 | Configure Case Access for Operations Administrator | access | 1 | PASS (1/1) | **NO** (access) | service-mcp |
| US-39 | Configure Data Access for Operations Administrator | access | 1 | PASS (1/1) | **NO** (access) | service-mcp |
| US-40 | Configure Case Access for System Integration User | access | 1 | PASS (1/1) | **NO** (access) | service-mcp |
| US-41 | Configure Data Access for System Integration User | access | 1 | PASS (1/1) | **NO** (access) | declare-pages |

## Unplanned / uncomposed (honest gaps)

None — every story planned and composed.


## Honest gaps

- **No story was unplanned.** Every one of the 40 titles routed to at least one authorable `rules-rule-*` family with a payload, so nothing fell into a methodology-only / no-example hole. (A family with no schema or no example is still a real gap and would appear here.)

### Kind-coverage gap — a rule family exists, but not one that matches the story *kind*

The corpus has **no matching family** for these story kinds, so the planner substituted an unrelated rule family: the composed rule verifies structurally but does **not** do what the story asks (e.g. an SSO config story authored as a flow action). This is the most common real gap in this run.

- kind `config` (2): US-1, US-2 → substituted `obj-corr, obj-flowaction`
- kind `access` (10): US-32, US-33, US-34, US-35, US-36, US-37, US-38, US-39, US-40, US-41 → substituted `obj-flowaction, service-mcp, declare-pages, obj-casetype, obj-property`

### Capability not in the corpus — the planner's own `coverage` flag

Instead of silently substituting, `plan_pega_build` now returns `coverage: { covered: false, capability, reason }` when **no authoring family declares the goal's capability**. These are the stories it flags (the agent should route them to a human, not build them):

- **US-1** Configure Email Account — capability `account`
- **US-2** Configure SSO - Disputes & Fraud Claims — capability `sso`
- **US-32** Configure Case Access for Customer — capability `access`
- **US-33** Configure Data Access for Customer — capability `access`
- **US-34** Configure Case Access for Dispute Analyst — capability `access`
- **US-35** Configure Data Access for Dispute Analyst — capability `access`
- **US-36** Configure Case Access for Finance Approver — capability `access`
- **US-37** Configure Data Access for Finance Approver — capability `access`
- **US-38** Configure Case Access for Operations Administrator — capability `access`
- **US-39** Configure Data Access for Operations Administrator — capability `access`
- **US-40** Configure Case Access for System Integration User — capability `access`
- **US-41** Configure Data Access for System Integration User — capability `access`

All 28 other stories are `covered: true`.

### Caveats

- **`verify PASS` is a reproduction of the planner's own gate, not semantic validation.** The harness only composes a rule when the planner already set `verify=required-keys-present`, and this proof re-checks the same keys — so PASS is *expected*. The meaningful signals above are **planned/composed** and the kind-coverage gap; payload correctness would need the live build.
- Composition uses the harness's own fill steps and a clearly-sample namespace (`MyOrg-MyApp-*`), and leaves cross-rule **reference** blanks visibly marked (`<REF: …>`); a live build must point those at rules that exist. Reference blanks are not a failure of this proof — they are the hand-off the live agent-fill loop performs.
- The backlog numbering **skips US-4** (no such story in the source) — a source-data gap, not an eval gap.
- Planning calls Jev, whose routing is judgment-based and can wobble slightly between runs; composition/fill/verify are deterministic given a plan. No call reaches Pega.

## How to reproduce

```bash
cd /Users/karan/Code/pega-automated
export TYPESAFE_API_KEY=$(grep '^TYPESAFE_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
node harness/eval-backlog.mjs            # full 40
node harness/eval-backlog.mjs --limit 5  # smoke
node harness/eval-backlog.mjs --ids US-1,US-3
```
