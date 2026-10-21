# Eval — API SOR integration chain (connector → transforms → data page)
Generated 2026-10-21. Planner: `plan_pega_build` with `contracts_dir=contracts/`.
**Summary** — goals: 16 · routed: 16/16 · expected-family match: 16/16 · rules: 16 · gated `required-keys-present`: 16 · references: 24 · avg goalFit: 0.25
Per industry (routed / expected-match / steps): Banking · Payments 4/4/4 · Insurance · CRM 4/4/4 · Healthcare · Documents 4/4/4 · Retail · Payments 4/4/4
Each industry is planned as a four-rule chain; every step is checked against the family that should carry it.

## Banking · Payments
System of record: `payments` (`contracts/payments.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the payments API to look up a transaction and issue a refund.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.31
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a request data transform that maps dispute case properties to the payments refund request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.24
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a response data transform that maps the payments transaction JSON response onto the dispute case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a data page that retrieves transaction data from the payments REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `multi-source-when-routed.md` · verify **required-keys-present** · goalFit 0.05
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: pyDataSourceList[0].pyDTName="RetrievesTransactionPaymentsT ; pyDataSourceList[1].pyConnectorName="RetrievesTransactionPayments" ; pyDataSourceList[1].pyReqDataTransform="RetrievesTransactionPaymentsR ; pyDataSourceList[1].pyResDataTransform="RetrievesTransactionPaymentsR ; pyDataSourceList[2].pyDTName="RetrievesTransactionPaymentsT

## Insurance · CRM
System of record: `crm` (`contracts/crm.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the CRM API to look up the policyholder and write back case status.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a request data transform that maps claim case properties to the CRM customer request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.32
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a response data transform that maps the CRM customer JSON response onto the claim case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.28
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a data page that retrieves customer data from the CRM REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `multi-source-when-routed.md` · verify **required-keys-present** · goalFit 0.03
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: pyDataSourceList[0].pyDTName="RetrievesCustomerCrmTransform ; pyDataSourceList[1].pyConnectorName="RetrievesCustomerCrm" ; pyDataSourceList[1].pyReqDataTransform="RetrievesCustomerCrmRequest" ; pyDataSourceList[1].pyResDataTransform="RetrievesCustomerCrmResponse" ; pyDataSourceList[2].pyDTName="RetrievesCustomerCrmTransform

## Healthcare · Documents
System of record: `documents` (`contracts/documents.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the documents API to extract fields from an ID document.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.33
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a request data transform that maps patient onboarding case properties to the documents extraction request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.31
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a response data transform that maps the documents JSON response onto the patient case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.47
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a data page that retrieves document extraction data from the documents REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `multi-source-when-routed.md` · verify **required-keys-present** · goalFit 0.06
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: pyDataSourceList[0].pyDTName="RetrievesDocumentExtractionDo ; pyDataSourceList[1].pyConnectorName="RetrievesDocumentExtractionDo ; pyDataSourceList[1].pyReqDataTransform="RetrievesDocumentExtractionDo ; pyDataSourceList[1].pyResDataTransform="RetrievesDocumentExtractionDo ; pyDataSourceList[2].pyDTName="RetrievesDocumentExtractionDo

## Retail · Payments
System of record: `payments` (`contracts/payments.yaml`). Chain: connector → request transform → response transform → data page.
### “Build a REST connector that calls the payments API to refund the order.”
- **expected**: `connect-rest` · **routed**: connect-rest · **match**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.32
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a request data transform that maps return case properties to the payments refund request payload.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.22
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a response data transform that maps the payments refund JSON response onto the return case.”
- **expected**: `obj-model` · **routed**: obj-model · **match**: ✅
  - **obj-model** · skill `rules-rule-obj-model` · example `append-and-map.md` · verify **required-keys-present** · goalFit 0.4
    - payload keys: pyModelName, pyLabel, pyClassName, pyParameters, pyPagesAndClasses, pyProperties
    - references: —
### “Add a data page that retrieves order transaction data from the payments REST connector.”
- **expected**: `declare-pages` · **routed**: declare-pages · **match**: ✅
  - **declare-pages** · skill `rules-rule-declare-pages` · example `multi-source-when-routed.md` · verify **required-keys-present** · goalFit 0.04
    - payload keys: pyPageName, pyLabel, pyDescription, pyClassName, pyStructure, pyScope
    - references: pyDataSourceList[0].pyDTName="RetrievesOrderTransactionPaym ; pyDataSourceList[1].pyConnectorName="RetrievesOrderTransactionPaym ; pyDataSourceList[1].pyReqDataTransform="RetrievesOrderTransactionPaym ; pyDataSourceList[1].pyResDataTransform="RetrievesOrderTransactionPaym ; pyDataSourceList[2].pyDTName="RetrievesOrderTransactionPaym

## Gaps observed
- **over-routed steps**: 0/16 steps planned more than one rule family (recall-oriented routing; extra rules are not wrong, just noise).
- **weak goalFit**: 8/16 rules score below 0.3 — the structural gate passes, but payload values are largely borrowed example defaults rather than goal-mapped data.
- **chain wiring**: 24 reference blank(s) across 16 rules; 8/16 rules surface none. 4/16 rules carry a named reference that points one chain step at another (`pyConnectorName` / `pyReqDataTransform` / `pyResDataTransform` / `pyDTName`), and 4/4 data pages name in `pyDataSourceList` the connector/transform they source from. Those names are goal-derived; the open hand-off is that each `<REF: …>` must still resolve to a rule that exists in the build.
- **contract use**: 4/4 connectors are grounded in `contracts/` — `pyEmbeddedURL.pyBaseURL` is the matched contract's server URL, `pyResourcePathParameters` names the goal's path, and `pyDescription` enumerates the SOR's `METHOD /path` endpoints. None still carry the example's placeholder URL.
