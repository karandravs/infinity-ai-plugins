# Eval — blueprint → plan, across industries

**Summary** — goals: 35 · routing stable (set): 35/35 (100%) · **primary stable: 35/35 (100%)** · gated `required-keys-present`: 35 · with references: 15 · avg goalFit: 0.39
Per industry (stable/total): Banking · Disputes 7/7 · Insurance · Claims 7/7 · Healthcare · Patient Onboarding 7/7 · Telecom · Service Order 7/7 · Retail · Returns 7/7
Generated 2026-10-21. Planner: `plan_pega_build`. Stability = 2 calls route to the same rule set.

## Banking · Disputes
### “Create a dispute case type with stages for intake, investigation, and resolution.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.81
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="Intake" ; pyStages[0].pyProcesses[1].pyFlowName="Intake" ; pyStages[0].pyProcesses[2].pyFlowName="Intake" ; pyStages[1].pyProcesses[0].pyFlowName="Investigation" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="Resolution" ; pyStages[2].pyProcesses[1].pyFlowName="Resolution" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for dispute records with transaction and customer references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `abstract-class.md` · verify **required-keys-present** · goalFit 0.49
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the payments API to look up a transaction and issue a refund.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.26
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes disputes by risk band and amount.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `allowed-values-set.md` · verify **required-keys-present** · goalFit 0.34
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for approval and rejection letters.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `attach-document.md` · verify **required-keys-present** · goalFit 0.3
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled dispute to the manager after five days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.14
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture dispute details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Insurance · Claims
### “Create a claims case type with stages for reporting, assessment, and settlement.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.77
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="Reporting" ; pyStages[0].pyProcesses[1].pyFlowName="Reporting" ; pyStages[0].pyProcesses[2].pyFlowName="Reporting" ; pyStages[1].pyProcesses[0].pyFlowName="Assessment" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="Settlement" ; pyStages[2].pyProcesses[1].pyFlowName="Settlement" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for claim records with policy and claimant references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `abstract-class.md` · verify **required-keys-present** · goalFit 0.52
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the CRM API to look up the policyholder.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.33
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes claims by claim amount and fraud score.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `allowed-values-set.md` · verify **required-keys-present** · goalFit 0.26
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for settlement approval and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `attach-document.md` · verify **required-keys-present** · goalFit 0.44
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled claim to the assessor's manager.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.11
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture claim evidence.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.27
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Healthcare · Patient Onboarding
### “Create a patient onboarding case type with stages for registration, verification, and activation.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.69
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="Registration" ; pyStages[0].pyProcesses[1].pyFlowName="Registration" ; pyStages[0].pyProcesses[2].pyFlowName="Registration" ; pyStages[1].pyProcesses[0].pyFlowName="Verification" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="Activation" ; pyStages[2].pyProcesses[1].pyFlowName="Activation" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for patient records with identity and contact references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `abstract-class.md` · verify **required-keys-present** · goalFit 0.57
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the documents API to extract fields from an ID document.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.31
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes onboarding by risk and missing documents.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `allowed-values-set.md` · verify **required-keys-present** · goalFit 0.3
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for onboarding confirmation and requests for more information.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `attach-document.md` · verify **required-keys-present** · goalFit 0.29
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled registration after two days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.36
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture patient demographics.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.14
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Telecom · Service Order
### “Create a service order case type with stages for capture, provisioning, and activation.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.81
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="Capture" ; pyStages[0].pyProcesses[1].pyFlowName="Capture" ; pyStages[0].pyProcesses[2].pyFlowName="Capture" ; pyStages[1].pyProcesses[0].pyFlowName="Provisioning" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="Activation" ; pyStages[2].pyProcesses[1].pyFlowName="Activation" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for service orders with account and address references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `abstract-class.md` · verify **required-keys-present** · goalFit 0.45
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the risk API to score a new line request.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.45
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes orders by credit band.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `allowed-values-set.md` · verify **required-keys-present** · goalFit 0.33
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for order confirmation and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `attach-document.md` · verify **required-keys-present** · goalFit 0.24
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled provisioning order.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.39
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture the service order.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.3
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Retail · Returns
### “Create a returns case type with stages for request, inspection, and refund.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.79
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="Request" ; pyStages[0].pyProcesses[1].pyFlowName="Request" ; pyStages[0].pyProcesses[2].pyFlowName="Request" ; pyStages[1].pyProcesses[0].pyFlowName="Inspection" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="Refund" ; pyStages[2].pyProcesses[1].pyFlowName="Refund" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for return records with order and item references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `abstract-class.md` · verify **required-keys-present** · goalFit 0.55
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the payments API to refund the order.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: pyHandlerFlow="ConnectionProblem"
### “Add a decision table that routes returns by reason and value.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `allowed-values-set.md` · verify **required-keys-present** · goalFit 0.31
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyColumns
    - references: —
### “Create correspondence for refund approval and rejection.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `attach-document.md` · verify **required-keys-present** · goalFit 0.27
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled return.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.42
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture return details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.23
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —
