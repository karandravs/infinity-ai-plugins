# Eval — API SOR integration chain (connector → transforms → data page)
Generated 2026-10-18. Planner: `plan_pega_build` with `contracts_dir=contracts/`.
**Summary** — goals: 16 · routed: 16/16 · expected-family match: 16/16 · rules: 16 · gated `required-keys-present`: 16 · references: 0 · avg goalFit: 0.15
Per industry (routed / expected-match / steps): Banking · Payments 4/4/4 · Insurance · CRM 4/4/4 · Healthcare · Documents 4/4/4 · Retail · Payments 4/4/4
Each industry is planned as a four-rule chain; every step is checked against the family that should carry it.

## Banking · Payments
System of record: `payments` (`contracts/payments.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the payments API to look up a transaction and issue a refund.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a request data transform that maps dispute case properties to the payments refund request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-automap.md` · verify **required-keys-present** · goalFit 0.2
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyPagesAndClasses
    - references: —
### “Add a response data transform that maps the payments transaction JSON response onto the dispute case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-nested-descent.md` · verify **required-keys-present** · goalFit 0.05
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyMappingModel
    - references: —
### “Add a data page that retrieves transaction data from the payments REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `simulated-connector-replacement.md` · verify **required-keys-present** · goalFit 0.02
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: —

## Insurance · CRM
System of record: `crm` (`contracts/crm.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the CRM API to look up the policyholder and write back case status.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.19
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a request data transform that maps claim case properties to the CRM customer request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-automap.md` · verify **required-keys-present** · goalFit 0.24
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyPagesAndClasses
    - references: —
### “Add a response data transform that maps the CRM customer JSON response onto the claim case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-automap.md` · verify **required-keys-present** · goalFit 0.25
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyPagesAndClasses
    - references: —
### “Add a data page that retrieves customer data from the CRM REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `stub.md` · verify **required-keys-present** · goalFit 0.02
    - payload keys: pyPageName, pyLabel, pyClassName, pyStructure, pyPageType, pyScope
    - references: —

## Healthcare · Documents
System of record: `documents` (`contracts/documents.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the documents API to extract fields from an ID document.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a request data transform that maps patient onboarding case properties to the documents extraction request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-automap.md` · verify **required-keys-present** · goalFit 0.23
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyPagesAndClasses
    - references: —
### “Add a response data transform that maps the documents JSON response onto the patient case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-nested-descent.md` · verify **required-keys-present** · goalFit 0.23
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyMappingModel
    - references: —
### “Add a data page that retrieves document extraction data from the documents REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `post-load-activity.md` · verify **required-keys-present** · goalFit 0.03
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: —

## Retail · Payments
System of record: `payments` (`contracts/payments.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the payments API to refund the order.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.19
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a request data transform that maps return case properties to the payments refund request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-automap.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyPagesAndClasses
    - references: —
### “Add a response data transform that maps the payments refund JSON response onto the return case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `json-format-nested-descent.md` · verify **required-keys-present** · goalFit 0.05
    - payload keys: pyModelName, pyLabel, pyClassName, pyDataModelFormat, pyParameters, pyMappingModel
    - references: —
### “Add a data page that retrieves order transaction data from the payments REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `simulated-connector-replacement.md` · verify **required-keys-present** · goalFit 0.02
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: —

## Gaps observed
- **over-routed steps**: 0/16 steps planned more than one rule family (recall-oriented routing; extra rules are not wrong, just noise).
- **weak goalFit**: 16/16 rules score below 0.3 — the structural gate passes, but payload values are largely borrowed example defaults rather than goal-mapped data.
- **chain wiring**: 0 blank with `kind:"reference"` across 16 rules; 16/16 rules surface none. The data page's connector/transform names live in `pyDataSourceList` but are neither goal-derived nor surfaced as blanks, so nothing points a step at the previous rule in the chain.
- **contract use**: the connector still carries its example's service/class names and method set; `contracts/` supplies the SOR base URL and method vocabulary, not the endpoint path or operation.
