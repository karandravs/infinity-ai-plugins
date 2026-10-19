# Eval — blueprint → plan, across industries

**Summary** — goals: 35 · routing stable (set): 35/35 (100%) · **primary stable: 35/35 (100%)** · gated `required-keys-present`: 40 · with references: 10 · avg goalFit: 0.39
Per industry (stable/total): Banking · Disputes 7/7 · Insurance · Claims 7/7 · Healthcare · Patient Onboarding 7/7 · Telecom · Service Order 7/7 · Retail · Returns 7/7
Generated 2026-10-19. Planner: `plan_pega_build`. Stability = 2 calls route to the same rule set.

## Banking · Disputes
### “Create a dispute case type with stages for intake, investigation, and resolution.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.76
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="Intake" ; pyStages[1].pyProcesses[0].pyFlowName="Investigation"
### “Add a data model for dispute records with transaction and customer references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.5
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `refer-to-data-page.md` · verify **required-keys-present** · goalFit 0.14
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDataRetrievalType
    - references: —
### “Build a REST connector that calls the payments API to look up a transaction and issue a refund.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.26
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes disputes by risk band and amount.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `multi-result-lookup.md` · verify **required-keys-present** · goalFit 0.53
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for approval and rejection letters.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.24
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled dispute to the manager after five days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `goal-deadline.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: —
### “Add a UI view to capture dispute details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `step-form-view.md` · verify **required-keys-present** · goalFit 0.19
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Insurance · Claims
### “Create a claims case type with stages for reporting, assessment, and settlement.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.78
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="Reporting" ; pyStages[1].pyProcesses[0].pyFlowName="Assessment"
### “Add a data model for claim records with policy and claimant references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.54
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `copy-from-data-page.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDataRetrievalType
    - references: —
### “Build a REST connector that calls the CRM API to look up the policyholder.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.28
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes claims by claim amount and fraud score.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `multi-result-lookup.md` · verify **required-keys-present** · goalFit 0.49
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for settlement approval and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.22
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled claim to the assessor's manager.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `goal-deadline.md` · verify **required-keys-present** · goalFit 0.2
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: —
### “Add a UI view to capture claim evidence.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `step-form-view.md` · verify **required-keys-present** · goalFit 0.34
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Healthcare · Patient Onboarding
### “Create a patient onboarding case type with stages for registration, verification, and activation.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.75
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="Registration" ; pyStages[1].pyProcesses[0].pyFlowName="Verification"
### “Add a data model for patient records with identity and contact references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.59
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `page-list.md` · verify **required-keys-present** · goalFit 0.27
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDescription
    - references: —
### “Build a REST connector that calls the documents API to extract fields from an ID document.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes onboarding by risk and missing documents.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `text-only-approval.md` · verify **required-keys-present** · goalFit 0.43
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for onboarding confirmation and requests for more information.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `templated-email.md` · verify **required-keys-present** · goalFit 0.27
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pyEmailViewMode, pyEmailTemplateName
    - references: —
### “Configure an SLA that escalates a stalled registration after two days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `goal-deadline.md` · verify **required-keys-present** · goalFit 0.36
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: —
### “Add a UI view to capture patient demographics.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.14
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Telecom · Service Order
### “Create a service order case type with stages for capture, provisioning, and activation.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.81
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="Capture" ; pyStages[1].pyProcesses[0].pyFlowName="Provisioning"
### “Add a data model for service orders with account and address references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.49
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `page-list.md` · verify **required-keys-present** · goalFit 0.2
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDescription
    - references: —
### “Build a REST connector that calls the risk API to score a new line request.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.47
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes orders by credit band.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `multi-result-lookup.md` · verify **required-keys-present** · goalFit 0.37
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for order confirmation and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `stub.md` · verify **required-keys-present** · goalFit 0.41
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pyEmailViewMode, pySourceStream
    - references: —
### “Configure an SLA that escalates a stalled provisioning order.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `goal-deadline.md` · verify **required-keys-present** · goalFit 0.28
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: —
### “Add a UI view to capture the service order.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Retail · Returns
### “Create a returns case type with stages for request, inspection, and refund.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.69
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="Request" ; pyStages[1].pyProcesses[0].pyFlowName="Inspection"
### “Add a data model for return records with order and item references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.52
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `copy-from-data-page.md` · verify **required-keys-present** · goalFit 0.16
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDataRetrievalType
    - references: —
### “Build a REST connector that calls the payments API to refund the order.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.36
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes returns by reason and value.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `multi-result-lookup.md` · verify **required-keys-present** · goalFit 0.63
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for refund approval and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled return.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `goal-deadline.md` · verify **required-keys-present** · goalFit 0.27
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: —
### “Add a UI view to capture return details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `step-form-view.md` · verify **required-keys-present** · goalFit 0.34
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —
