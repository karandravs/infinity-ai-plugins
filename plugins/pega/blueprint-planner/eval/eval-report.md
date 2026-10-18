# Eval — blueprint → plan, across industries

**Summary** — goals: 35 · routing stable (set): 29/35 (83%) · **primary stable: 35/35 (100%)** · gated `required-keys-present`: 37 · with references: 6 · avg goalFit: 0.22
Per industry (stable/total): Banking · Disputes 6/7 · Insurance · Claims 6/7 · Healthcare · Patient Onboarding 7/7 · Telecom · Service Order 5/7 · Retail · Returns 5/7
Generated 2026-10-18. Planner: `plan_pega_build`. Stability = 2 calls route to the same rule set.

## Banking · Disputes
### “Create a dispute case type with stages for intake, investigation, and resolution.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.42
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; pyStages[0].pyProcesses[1].pyFlowName="EmailIntake" ; pyStages[0].pyProcesses[2].pyFlowName="APIIntake" ; pyStages[1].pyProcesses[0].pyFlowName="TriageIncident" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="InvestigateAndFix" ; pyStages[2].pyProcesses[1].pyFlowName="VerifyResolution" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for dispute records with transaction and customer references.”
- **routed**: (none) · **stable**: ⚠️
### “Build a REST connector that calls the payments API to look up a transaction and issue a refund.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.2
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a decision table that routes disputes by risk band and amount.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `initial-prop-set.md` · verify **required-keys-present** · goalFit 0.06
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyInitialPropSet
    - references: —
### “Create correspondence for approval and rejection letters.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.24
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled dispute to the manager after five days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `escalation-actions.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyMaxLateEvents, pyGoalDefaultDays
    - references: pyEscalations.Goal.pyEscalationActions[0].pyActionWhen="MyWhenRule" ; pyEscalations.Deadline.pyEscalationActions[0].pyActionWhen="MyWhenRule"
### “Add a UI view to capture dispute details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `step-form-view.md` · verify **required-keys-present** · goalFit 0.09
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Insurance · Claims
### “Create a claims case type with stages for reporting, assessment, and settlement.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `adhoc-processes-and-starting-flows.md` · verify **required-keys-present** · goalFit 0.21
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyCaseOptionalProcesses[0].pyFlowName="EscalateToManagement" ; pyCaseOptionalProcesses[1].pyFlowName="RequestExternalSupport" ; pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; pyStages[0].pyProcesses[1].pyFlowName="EmailIntake" ; pyStages[0].pyProcesses[2].pyFlowName="APIIntake" ; pyStages[1].pyProcesses[0].pyFlowName="TriageIncident" ; pyStages[1].pyOptionalProcesses[0].pyFlowName="GatherDiagnostics" ; pyStages[2].pyProcesses[0].pyFlowName="InvestigateAndFix" ; pyStages[2].pyProcesses[1].pyFlowName="VerifyResolution" ; pyStages[2].pyOptionalProcesses[0].pyFlowName="RootCauseAnalysis"
### “Add a data model for claim records with policy and claimant references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `stub.md` · verify **required-keys-present** · goalFit 0.39
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyUsage, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the CRM API to look up the policyholder.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.23
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a decision table that routes claims by claim amount and fraud score.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `initial-prop-set.md` · verify **required-keys-present** · goalFit 0.03
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyInitialPropSet
    - references: —
### “Create correspondence for settlement approval and rejection.”
- **routed**: corrtype,obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.36
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
  - **corrtype** · skill `rules-rule-corrtype` · example `postal-mail-type.md` · verify **required-keys-present** · goalFit 0.35
    - payload keys: pyLabel, pyCorrType, pyAddressClass, pyCorrClass, pyCorrClassModel, pyHistoryObject
    - references: —
### “Configure an SLA that escalates a stalled claim to the assessor's manager.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `timed-delay-assignment.md` · verify **required-keys-present** · goalFit 0.23
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyNextActionSetting, pyNextActionDays
    - references: —
### “Add a UI view to capture claim evidence.”
- **routed**: ui-view · **stable**: ⚠️ (varies: obj-flowaction,ui-view)
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.25
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Healthcare · Patient Onboarding
### “Create a patient onboarding case type with stages for registration, verification, and activation.”
- **routed**: obj-casetype,obj-class · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `parent-child-dependencies.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; pyStages[1].pyProcesses[0].pyFlowName="VerifyProject" ; pyStages[2].pyProcesses[0].pyFlowName="MonitorChildCases"
  - **obj-class** · skill `rules-rule-obj-class` · example `stub.md` · verify **required-keys-present** · goalFit 0.22
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyUsage, pyClassGroupIndicator
    - references: —
### “Add a data model for patient records with identity and contact references.”
- **routed**: obj-class,obj-property · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.15
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
  - **obj-property** · skill `rules-rule-obj-property` · example `page-list.md` · verify **required-keys-present** · goalFit 0.08
    - payload keys: pyPropertyName, pyLabel, pyClassName, pyPropertyMode, pyPageClass, pyDescription
    - references: —
### “Build a REST connector that calls the documents API to extract fields from an ID document.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a decision table that routes onboarding by risk and missing documents.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `initial-prop-set.md` · verify **required-keys-present** · goalFit 0.04
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyInitialPropSet
    - references: —
### “Create correspondence for onboarding confirmation and requests for more information.”
- **routed**: obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `templated-email.md` · verify **required-keys-present** · goalFit 0.29
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pyEmailViewMode, pyEmailTemplateName
    - references: —
### “Configure an SLA that escalates a stalled registration after two days.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `timed-delay-assignment.md` · verify **required-keys-present** · goalFit 0.1
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyNextActionSetting, pyNextActionDays
    - references: —
### “Add a UI view to capture patient demographics.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `data-reference-autocomplete-view.md` · verify **required-keys-present** · goalFit 0.16
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Telecom · Service Order
### “Create a service order case type with stages for capture, provisioning, and activation.”
- **routed**: obj-casetype · **stable**: ⚠️ (varies: obj-casetype,obj-class)
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `simple-linear.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; pyStages[1].pyProcesses[0].pyFlowName="Fulfillment"
### “Add a data model for service orders with account and address references.”
- **routed**: obj-class · **stable**: ✅
  - **obj-class** · skill `rules-rule-obj-class` · example `data-class.md` · verify **required-keys-present** · goalFit 0.17
    - payload keys: pyClassName, pyLabel, pyDescription, pyDerivesFrom, pyClassType, pyClassGroupIndicator
    - references: —
### “Build a REST connector that calls the risk API to score a new line request.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.25
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a decision table that routes orders by credit band.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `initial-prop-set.md` · verify **required-keys-present** · goalFit 0.08
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyInitialPropSet
    - references: —
### “Create correspondence for order confirmation and rejection.”
- **routed**: corrtype,obj-corr · **stable**: ✅
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.3
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
  - **corrtype** · skill `rules-rule-corrtype` · example `stub.md` · verify **required-keys-present** · goalFit 0.26
    - payload keys: pyLabel, pyCorrType, pyAddressClass, pyCorrClass, pyDescription
    - references: —
### “Configure an SLA that escalates a stalled provisioning order.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `timed-delay-assignment.md` · verify **required-keys-present** · goalFit 0.34
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyNextActionSetting, pyNextActionDays
    - references: —
### “Add a UI view to capture the service order.”
- **routed**: ui-view · **stable**: ⚠️ (varies: obj-flowaction,ui-view)
  - **ui-view** · skill `rules-rule-ui-view` · example `field-group-table-view.md` · verify **required-keys-present** · goalFit 0.77
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —

## Retail · Returns
### “Create a returns case type with stages for request, inspection, and refund.”
- **routed**: obj-casetype · **stable**: ✅
  - **obj-casetype** · skill `rules-rule-obj-casetype` · example `complex-with-local-actions.md` · verify **required-keys-present** · goalFit 0.13
    - payload keys: pyClassName, pyLabel, pyDescription, pyIcon, pyWorkPartiesRule, pyInitialCaseUrgency
    - references: pyStages[0].pyProcesses[0].pyFlowName="CreateForm_Default" ; pyStages[1].pyProcesses[0].pyFlowName="ManagerReview" ; pyStages[2].pyProcesses[0].pyFlowName="Implementation" ; pyStages[2].pyProcesses[1].pyFlowName="QualityCheck"
### “Add a data model for return records with order and item references.”
- **routed**: (none) · **stable**: ⚠️
### “Build a REST connector that calls the payments API to refund the order.”
- **routed**: connect-rest · **stable**: ✅
  - **connect-rest** · skill `rules-rule-connect-rest` · example `get-runtime-url.md` · verify **required-keys-present** · goalFit 0.19
    - payload keys: pyServiceName, pyLabel, pyClassName, pyDescription, pyEmbeddedURL, pyReadsOrRoutesToExternalSystem
    - references: —
### “Add a decision table that routes returns by reason and value.”
- **routed**: declare-decision-table · **stable**: ✅
  - **declare-decision-table** · skill `rules-rule-declare-decision-table` · example `initial-prop-set.md` · verify **required-keys-present** · goalFit 0.18
    - payload keys: pyLabel, pyClassName, pyPurpose, pyDescription, pyDefaultResult, pyInitialPropSet
    - references: —
### “Create correspondence for refund approval and rejection.”
- **routed**: obj-corr · **stable**: ⚠️ (varies: corrtype,obj-corr)
  - **obj-corr** · skill `rules-rule-obj-corr` · example `mail.md` · verify **required-keys-present** · goalFit 0.22
    - payload keys: pyStreamName, pyLabel, pyClassName, pyCorrType, pySourceOnlyMode, pyNextAction
    - references: —
### “Configure an SLA that escalates a stalled return.”
- **routed**: obj-servicelevel · **stable**: ✅
  - **obj-servicelevel** · skill `rules-rule-obj-servicelevel` · example `timed-delay-assignment.md` · verify **required-keys-present** · goalFit 0.38
    - payload keys: pyLabel, pyServiceLevelName, pyClassName, pyCalculateTimesFrom, pyNextActionSetting, pyNextActionDays
    - references: —
### “Add a UI view to capture return details.”
- **routed**: ui-view · **stable**: ✅
  - **ui-view** · skill `rules-rule-ui-view` · example `step-form-view.md` · verify **required-keys-present** · goalFit 0.16
    - payload keys: pxObjClass, pyRuleName, pyLabel, pyClassName, pyRuleSet, pyRuleSetVersion
    - references: —
