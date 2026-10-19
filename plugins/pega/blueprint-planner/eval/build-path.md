# Build path — the exact `create-rule` calls the agent executes

Generated 2026-10-19T05:46:32.055Z. Planner: `plan_pega_build` (Jev) → this file is the ordered list of the MCP `create-rule` calls the harness/agent WOULD make for each planned rule, with the payloads resolved. **No Pega environment is contacted and no rule is created.**

**Branch:** `build_on` (from `pega.config.json`, enforced). Arg shape mirrors `harness/build-runner.mjs` / `harness/build-all.mjs`: `create-rule({ ruleType: pxObjClass, content: JSON.stringify(payload), branchID, changeDescription })`.

**Summary** — goals: 4 · rules composed: 6 · verify PASS: 6 / FAIL: 0 · blanks — value: 6, reference: 16, entries: 11 · skipped (not built by the harness): 1.

Skipped rules (filtered out exactly as the harness does — no payload, or `verify` ≠ `required-keys-present`):

- `methodology-rule-authoring` — no-schema


## Goal: “Configure Case Type - Dispute”

`primary` = `rules-rule-obj-casetype` · `planId` = `038fd7425c2b` · rules: 1 · composed: 1


### 1. `obj-casetype` → `Rule-Obj-CaseType`

- **skill**: `rules-rule-obj-casetype` · **example**: `adhoc-processes-and-starting-flows.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r5
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Work-CaseTypeDispute"` (synthesized)
- **filled (entries)**: `pyParameters` (2 rows, refined from example), `pyCasetypeStartingFlows` (1 rows, refined from example), `pyFlowsToStart` (2 rows, refined from example), `pyCaseOptionalProcesses` (2 rows, refined from example), `pyStages` (4 rows, refined from example), `pyAlternateStages` (1 rows, refined from example)
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: `pyCaseOptionalProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyCaseOptionalProcesses[1].pyFlowName` → "<REF: pyFlowName>", `pyStages[0].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[0].pyProcesses[1].pyFlowName` → "<REF: pyFlowName>", `pyStages[0].pyProcesses[2].pyFlowName` → "<REF: pyFlowName>", `pyStages[1].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[1].pyOptionalProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[2].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[2].pyProcesses[1].pyFlowName` → "<REF: pyFlowName>", `pyStages[2].pyOptionalProcesses[0].pyFlowName` → "<REF: pyFlowName>"

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-CaseType",
    "content": "{\"pyClassName\":\"MyOrg-MyApp-Work-CaseTypeDispute\",\"pyLabel\":\"Configure Case Type - Dispute\",\"pyDescription\":\"Configure Case Type - Dispute\",\"pyIcon\":\"pi pi-case-solid\",\"pyWorkPartiesRule\":\"pyCaseManagementDefault\",\"pyInitialCaseUrgency\":\"30\",\"pyLockingMode\":\"Optimistic\",\"pyEnableSearch\":\"true\",\"pyIsConstellationCase\":\"true\",\"pyEnableGetNextWork\":\"true\",\"pyLifeCycleTabs\":\"Lifecycle\",\"pyStageIDMax\":\"4\",\"pyAltStageIDMax\":\"0\",\"pyParameters\":[{\"pyParametersParamName\":\"Severity\",\"pyParametersParamType\":\"STRING\"},{\"pyParametersParamName\":\"SourceSystem\",\"pyParametersParamType\":\"STRING\"}],\"pyCasetypeStartingFlows\":[{\"pyClass\":\"MyOrg-MyApp-Work-ConfigureTypeDispute\",\"pyStartingFlowType\":\"pyStartCase\",\"pyAutomaticStart\":\"true\",\"pyManualStart\":\"false\",\"pyEnabled\":\"true\"}],\"pyFlowsToStart\":[{\"pyFlowType\":\"BackgroundMonitor\",\"pyAutomaticStart\":\"true\",\"pyAutoStartWhenType\":\"always\",\"pyManualStart\":\"false\",\"pyEnabled\":\"true\",\"pySkipOrAllowType\":\"always\"},{\"pyFlowType\":\"NotifyStakeholders\",\"pyAutomaticStart\":\"false\",\"pyManualStart\":\"true\",\"pyProcessStartType\":\"user\",\"pyEnabled\":\"true\",\"pySkipOrAllowType\":\"always\",\"pyShowBackButton\":\"true\"}],\"pyCaseOptionalProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Case Type - Dispute\",\"pyDescription\":\"Configure Case Type - Dispute\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\",\"pyShowBackButton\":\"true\"},{\"pxFlowID\":\"FLOW1\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Case Type - Dispute\",\"pyDescription\":\"Configure Case Type - Dispute\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"when\",\"pyStartWhen\":\"HasVendorContract\",\"pyLaunchOnReentry\":\"false\"}],\"pyStages\":[{\"pyStageID\":\"PRIM0\",\"pyStageName\":\"Intake\",\"pyStageTransition\":\"automatic\",\"pyIsInitializationStage\":\"true\",\"pyIsTerminalStage\":\"false\",\"pyChannels\":[{\"pyLabel\":\"Default\",\"pyShowChannel\":\"true\",\"pzChannelName\":\"Default\"},{\"pyLabel\":\"Email\",\"pyShowChannel\":\"true\",\"pzChannelName\":\"Email\"},{\"pyLabel\":\"API\",\"pyShowChannel\":\"true\",\"pzChannelName\":\"API\"}],\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Intake Form\",\"pyChannelName\":\"Default\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\",\"pyShowBackButton\":\"false\"},{\"pxFlowID\":\"FLOW1\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Email Intake\",\"pyChannelName\":\"Email\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\"},{\"pxFlowID\":\"FLOW2\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"API Intake\",\"pyChannelName\":\"API\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\"}]},{\"pyStageID\":\"PRIM1\",\"pyStageName\":\"Investigation\",\"pyStageTransition\":\"automatic\",\"pyStageEntryStatus\":\"Open-Triage\",\"pyIsTerminalStage\":\"false\",\"pySLAType\":\"Always\",\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Triage\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"true\",\"pyShowBackButton\":\"false\",\"pySLAType\":\"Always\",\"pyStepSLA\":\"TriageResponseTime\"}],\"pyOptionalProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Gather Diagnostics\",\"pyDescription\":\"Collect system logs and diagnostic data from affected systems.\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\"}]},{\"pyStageID\":\"PRIM2\",\"pyStageName\":\"Resolution\",\"pyStageTransition\":\"manual\",\"pyStageEntryStatus\":\"Open-InProgress\",\"pyIsTerminalStage\":\"false\",\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Investigate and Fix\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"true\",\"pyShowBackButton\":\"true\"},{\"pxFlowID\":\"FLOW1\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Verify Resolution\",\"pyStartType\":\"SEQUENTIAL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\"}],\"pyOptionalProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Root Cause Analysis\",\"pyDescription\":\"Perform deep-dive root cause analysis.\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"false\"}]},{\"pyStageID\":\"PRIM3\",\"pyStageName\":\"Closed\",\"pyStageTransition\":\"resolution\",\"pyStageWorkStatus\":\"Resolved-Completed\",\"pyIsTerminalStage\":\"true\",\"pyCleanupProcess\":\"true\"}],\"pyAlternateStages\":[{\"pyStageID\":\"ALT1\",\"pyStageName\":\"Intake\",\"pyStageTransition\":\"resolution\",\"pyStageWorkStatus\":\"Resolved-Cancelled\",\"pyIsTerminalStage\":\"true\",\"pyCleanupProcess\":\"true\"}],\"pyMemo\":\"Configure Case Type - Dispute\",\"pyOfflineEnabled\":\"false\",\"pyOfflineStatus\":\"Disabled\",\"pyLicenseCategory\":\"Management\",\"pyProcessesViewMode\":\"FilmStrip\",\"pyLPGeolocationEnabled\":\"Disabled\",\"pyProcessAttachmentsOffline\":\"false\",\"pySLAType\":\"Use existing\",\"pyStepApprovalType\":\"Simple\",\"pyPurpose\":\"ConfigureCaseTypeDispute\",\"pxObjClass\":\"Rule-Obj-CaseType\",\"pyRuleAvailable\":\"Yes\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-casetype"
  }
}
```

## Goal: “Add a data model property”

`primary` = `rules-rule-obj-property` · `planId` = `4286444411fd` · rules: 2 · composed: 2


### 1. `obj-property` → `Rule-Obj-Property`

- **skill**: `rules-rule-obj-property` · **example**: `stub.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r1
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Data-DataModelProperty"` (synthesized)
- **filled (entries)**: —
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: —

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-Property",
    "content": "{\"pyPropertyName\":\"Model\",\"pyLabel\":\"A Data Model Property\",\"pyClassName\":\"MyOrg-MyApp-Data-DataModelProperty\",\"pyPropertyMode\":\"String\",\"pyStringType\":\"Text\",\"pyStreamName\":\"ADataModelProperty\",\"pyDescription\":\"Add a data model property\",\"pyTableOption\":\"ClassKeyValue\",\"pyIsGateway\":\"false\",\"pyIsAssociation\":\"false\",\"pyIsRetrieveEachPageSeparately\":\"false\",\"pyIsReference\":\"false\",\"pxObjClass\":\"Rule-Obj-Property\",\"pyRuleAvailable\":\"Yes\",\"pySortDateCircumWithinRSMajor\":\"true\",\"pyIsNonTransient\":\"true\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-property"
  }
}
```

### 2. `obj-class` → `Rule-Obj-Class`

- **skill**: `rules-rule-obj-class` · **example**: `data-class.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r0
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Data-DataModelProperty"` (synthesized)
- **filled (entries)**: —
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: —

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-Class",
    "content": "{\"pyClassName\":\"MyOrg-MyApp-Data-DataModelProperty\",\"pyLabel\":\"A Data Model\",\"pyDescription\":\"Add a data model property\",\"pyDerivesFrom\":\"MyOrg-MyApp-Data\",\"pyClassType\":\"Concrete\",\"pyClassGroupIndicator\":\"NOCLASSGROUP\",\"pyPatternInheritance\":\"false\",\"pyClassInheritance\":\"false\",\"pyUsage\":\"A data model property\",\"pyPreventSubClassing\":\"false\",\"pyExcludeFromFTIndex\":\"false\",\"pyEncryptBLOB\":\"false\",\"pyCreateDedicatedTable\":\"false\",\"pyFormType\":\"Form\",\"pyReloadForm\":\"false\",\"pyHistoryObject\":\"false\",\"pyAutogeneratedKey\":\"false\",\"pyBaseRule\":\"false\",\"pxObjClass\":\"Rule-Obj-Class\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-class"
  }
}
```

## Goal: “Add an activity”

`primary` = `rules-rule-obj-activity` · `planId` = `209fc299fd19` · rules: 1 · composed: 1


### 1. `obj-activity` → `Rule-Obj-Activity`

- **skill**: `rules-rule-obj-activity` · **example**: `stub.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r3
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Work-Activity"` (synthesized)
- **filled (entries)**: `pySteps` (1 rows, refined from example)
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: —

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-Activity",
    "content": "{\"pyActivityName\":\"AnActivity\",\"pyLabel\":\"An Activity\",\"pyClassName\":\"MyOrg-MyApp-Work-Activity\",\"pySteps\":[{\"pyStepsActivityName\":\"Log-Message\",\"pyStepsDescription\":\"Placeholder step\",\"pyStepsCallParams\":{\"Message\":\"\\\"MyRuleNameHere executed\\\"\",\"LoggingLevel\":\"InfoForced\",\"SendToTracer\":\"false\",\"GenerateStackTrace\":\"false\"}}],\"pyDescription\":\"Add an activity\",\"pyInputMayStart\":\"true\",\"pyCategory\":\"Create\",\"pxObjClass\":\"Rule-Obj-Activity\",\"pyActivityType\":\"ACTIVITY\",\"pyJavaGenerateAPIVersion\":\"03-02\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-activity"
  }
}
```

## Goal: “Add a flow that routes the case to a fraud analyst.”

`primary` = `rules-rule-obj-flow` · `planId` = `924164fe2a62` · rules: 3 · composed: 2


### 1. `obj-flow` → `Rule-Obj-Flow`

- **skill**: `rules-rule-obj-flow` · **example**: `assignment-step.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r4
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Work-FlowThatRoutesTheCase"` (synthesized)
- **filled (entries)**: `pyEndingActivities` (1 rows, refined from example), `pyFromTasks` (2 rows, refined from example)
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: `pyModelProcess.pyShapes.Assignment1.pyImplementation` → "<REF: pyImplementation>", `pyModelProcess.pyShapes.Assignment1.pyRouterProp.pyImplementation` → "<REF: pyImplementation>", `pyModelProcess.pyConnectors.Transition2.pyExpression` → "<REF: pyExpression>"

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-Flow",
    "content": "{\"pyFlowType\":\"Review_Flow\",\"pyLabel\":\"A Flow That Routes The\",\"pyClassName\":\"MyOrg-MyApp-Work-FlowThatRoutesTheCase\",\"pyWorkClass\":\"MyOrg-MyApp-Work-FlowRoutesFraudAnalyst\",\"pyCategory\":\"FlowStandard\",\"pyStructureType\":\"Linear\",\"pyStartActivity\":\"Start1\",\"pyEndingActivities\":[\"End1\"],\"pyFromTasks\":[{\"pyFromTaskName\":\"Task1\",\"pyToTasks\":{\"Assignment1\":{\"pyID\":\"Transition1\",\"pyTaskStatusOrWhen\":\"ALWAYS\",\"pyLikelihood\":\"100\",\"pxSubscript\":\"Assignment1\"}}},{\"pyFromTaskName\":\"Task2\",\"pyToTasks\":{\"End1\":{\"pyID\":\"Transition2\",\"pyTaskStatusOrWhen\":\"STATUS\",\"pyTaskStatus\":\"ReviewComplete\",\"pyLikelihood\":\"100\",\"pxSubscript\":\"End1\"}}}],\"pyModelProcess\":{\"pyShapes\":{\"Start1\":{\"pxObjClass\":\"Data-MO-Event-Start\",\"pyMOId\":\"Start1\",\"pyFromMODefName\":\"Start\",\"pyCoordX\":\"0.08\",\"pyCoordY\":\"0.096\",\"pyWidth\":\"0.48\",\"pyHeight\":\"0.48\"},\"Assignment1\":{\"pxObjClass\":\"Data-MO-Activity-Assignment\",\"pyMOId\":\"Assignment1\",\"pyFromMODefName\":\"Assignment\",\"pyMOName\":\"ReviewComplete\",\"pyCategory\":\"FlowStandard\",\"pyBaseClass\":\"MyOrg-MyApp-Work-FlowRoutesFraudAnalyst\",\"pyUseCaseWorkType\":\"MyCase\",\"pyUseCaseApplication\":\"MyApp\",\"pyUseCaseName\":\"ReviewComplete\",\"pyImplementation\":\"<REF: pyImplementation>\",\"pyRouterProp\":{\"pxObjClass\":\"Data-MO-Activity-Router\",\"pyImplementation\":\"<REF: pyImplementation>\",\"pyIsCustomRouter\":\"false\",\"pyInLane\":\"false\",\"pyMOName\":\"\",\"pyCallParams\":{\"CheckAvailability\":\"\"},\"pzRuleParameters\":[{\"pxObjClass\":\"Embed-MethodParams\",\"pyParametersParamInOut\":\"IN\",\"pyParametersParamIntelliBaseClass\":\"PageClass\",\"pyParametersParamSize\":\"0\",\"pyParametersParamType\":\"STRING\"}]},\"pyDisplayRouteTo\":\"USER\",\"pyRouteTo\":\"Current operator\",\"pyViewPolicy\":\"USE_CASE_POLICY\",\"pySLA\":\"\",\"pySLAType\":\"Never\",\"pyEffortCost\":\"\",\"pyHarnessPurpose\":\"\",\"pyActivityTypeSelector\":\"\",\"pyAutomationAppliesTo\":\"\",\"pyWorkStatus\":\"\",\"pyContextRefs\":[],\"pySkipAssignmentParams\":[],\"pyLocalActionsPL\":[{\"pxObjClass\":\"Embed-Pega-AssignAction\",\"pyActionName\":\"\"}],\"pyNotifyProp\":{\"pxObjClass\":\"Data-MO-Activity-Notify\",\"pyImplementation\":\"\",\"pyMOName\":\"\",\"pyCallParams\":{}},\"pzRuleParameters\":[{\"pxObjClass\":\"Embed-MethodParams\",\"pyParametersParamName\":\"CheckAvailability\",\"pyParametersParamDesc\":\"Check the operator's availability\",\"pyParametersParamInOut\":\"IN\",\"pyParametersParamType\":\"BOOLEAN\",\"pyParametersParamReq\":\"0\",\"pyParametersParamSize\":\"0\",\"pyParametersParamDefaultValue\":\"\",\"pyParametersParamIntelliBaseClass\":\"PageClass\",\"pyParametersParamIntelliValidateAs\":\"\"}],\"pyTicketShapes\":[{\"pxObjClass\":\"Data-MO-Event-Exception\",\"pyMOName\":\"\"}],\"pyCoordX\":\"1.6\",\"pyCoordY\":\"0.096\",\"pyWidth\":\"0.96\",\"pyHeight\":\"0.48\"},\"End1\":{\"pxObjClass\":\"Data-MO-Event-End\",\"pyMOId\":\"End1\",\"pyFromMODefName\":\"End\",\"pyCoordX\":\"3.6\",\"pyCoordY\":\"0.096\",\"pyWidth\":\"0.48\",\"pyHeight\":\"0.48\"}},\"pyConnectors\":{\"Transition1\":{\"pyMOId\":\"Transition1\",\"pyFrom\":\"Start1\",\"pyFromClass\":\"Data-MO-Event-Start\",\"pyTo\":\"Assignment1\",\"pyConditionType\":\"Always\",\"pyLikelihood\":\"100\"},\"Transition2\":{\"pyMOId\":\"Transition2\",\"pyFrom\":\"Assignment1\",\"pyFromClass\":\"Data-MO-Activity-Assignment\",\"pyTo\":\"End1\",\"pyConditionType\":\"Action\",\"pyExpression\":\"<REF: pyExpression>\",\"pyMOName\":\"Review complete\",\"pyMONameOrig\":\"ReviewComplete\",\"pyUseCaseApplication\":\"MyApp\",\"pyUseCaseName\":\"ReviewComplete\",\"pyUseCaseWorkType\":\"MyCase\",\"pyPropertiesOrModel\":\"Set Properties\",\"pyLikelihood\":\"100\"}}},\"pyDescription\":\"Add a flow that routes the case to a fraud analyst.\",\"pyMemo\":\"Add a flow that routes the case to a fraud analyst.\",\"pyConfirmChoice\":\"Harness\",\"pySkipNewHarness\":\"false\",\"pyNextAssignment\":\"true\",\"pyNextAssignmentAdhoc\":\"false\",\"pyNextAssignmentWorkBasket\":\"false\",\"pyNextAssignmentWorkBasketAdhoc\":\"false\",\"pyCanStartInteractively\":\"false\",\"pyShowLikelihoods\":\"Hide\",\"pyAcceptConversion\":\"false\",\"pyAlphaSortLocalActions\":\"false\",\"pyPlaceGlobalLocalsAtTop\":\"false\",\"pyDoHarvesting\":\"false\",\"pyDeferErrors\":\"false\",\"pyDeferCommit\":\"false\",\"pyCreatesTemporaryObject\":\"false\",\"pyPurpose\":\"AFlowThatRoutesThe\",\"pyPageOrientation\":\"Portrait\",\"pyCurrentViewMode\":\"modeler\",\"pyModelerDefaultClickMode\":\"Select\",\"pyModelerGuideModeON\":\"false\",\"pyModelerGridModeON\":\"false\",\"pyShowGrid\":\"false\",\"pyBaseRule\":\"false\",\"pyBaseRuleHolder\":\"true\",\"pyHasCustomFields\":\"false\",\"pyHideLockIcon\":\"false\",\"pyPostVisio2000Saved\":\"false\",\"pyReloadForm\":\"false\",\"pySelected\":\"true\",\"pyShowROIcon\":\"false\",\"pySortDateCircumWithinRSMajor\":\"false\",\"pySubProcessCategory\":\"ProcessFlow\",\"pySystemFlow\":\"true\",\"pyValueChanged\":\"false\",\"pyVisioCompatFlag\":\"false\",\"pxObjClass\":\"Rule-Obj-Flow\",\"pyCanCreateWorkObject\":\"false\",\"pyDraftModeON\":\"false\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-flow"
  }
}
```

### 2. `obj-casetype` → `Rule-Obj-CaseType`

- **skill**: `rules-rule-obj-casetype` · **example**: `auto-transition.md`
- **verify**: `required-keys-present` — **PASS ✅** · **build rank**: r5
- **filled (value)**: `pyClassName`=`"MyOrg-MyApp-Work-FlowThatRoutesTheCase"` (synthesized)
- **filled (entries)**: `pyStages` (4 rows, refined from example), `pyAlternateStages` (1 rows, refined from example)
- **kept as reference (NOT filled — the agent points these at an existing rule or clears them)**: `pyStages[0].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[1].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>", `pyStages[2].pyProcesses[0].pyFlowName` → "<REF: pyFlowName>"

```json
{
  "name": "create-rule",
  "arguments": {
    "ruleType": "Rule-Obj-CaseType",
    "content": "{\"pyClassName\":\"MyOrg-MyApp-Work-FlowThatRoutesTheCase\",\"pyLabel\":\"A Flow That Routes The\",\"pyDescription\":\"Add a flow that routes the case to a fraud analyst.\",\"pyIcon\":\"pi pi-case-solid\",\"pyWorkPartiesRule\":\"pyCaseManagementDefault\",\"pyCreateTemporaryObject\":\"false\",\"pyStageIDMax\":\"4\",\"pyStages\":[{\"pyStageID\":\"PRIM0\",\"pyStageName\":\"Intake\",\"pyStageTransition\":\"automatic\",\"pyIsInitializationStage\":\"true\",\"pyIsTerminalStage\":\"false\",\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Create\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"when\",\"pyStartWhen\":\"CreatedViaUI\",\"pyWhenToSkip\":\"CreatedViaUI\",\"pyLaunchOnReentry\":\"false\"}]},{\"pyStageID\":\"PRIM1\",\"pyStageName\":\"Investigation\",\"pyStageTransition\":\"automatic\",\"pyStageEntryStatus\":\"Open-InProgress\",\"pyIsTerminalStage\":\"false\",\"pySkipOrAllowType\":\"always\",\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Validate Data\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"true\",\"pySLAType\":\"Never\"}]},{\"pyStageID\":\"PRIM2\",\"pyStageName\":\"Resolution\",\"pyStageTransition\":\"automatic\",\"pyStageEntryStatus\":\"Open-InProgress\",\"pyIsTerminalStage\":\"false\",\"pySkipOrAllowType\":\"when\",\"pyProcesses\":[{\"pxFlowID\":\"FLOW0\",\"pyFlowName\":\"<REF: pyFlowName>\",\"pyLabel\":\"Process Import\",\"pyStartType\":\"PARALLEL\",\"pySkipOrAllowType\":\"always\",\"pyLaunchOnReentry\":\"true\"}]},{\"pyStageID\":\"PRIM3\",\"pyStageName\":\"Closed\",\"pyStageTransition\":\"resolution\",\"pyStageWorkStatus\":\"Resolved-Completed\",\"pyIsTerminalStage\":\"true\",\"pyCleanupProcess\":\"true\"}],\"pyAlternateStages\":[{\"pyStageID\":\"ALT1\",\"pyStageName\":\"Intake\",\"pyStageTransition\":\"resolution\",\"pyStageWorkStatus\":\"Resolved-Rejected\",\"pyIsTerminalStage\":\"true\"}],\"pyMemo\":\"Add a flow that routes the case to a fraud analyst.\",\"pyLockingMode\":\"Default\",\"pyOfflineEnabled\":\"false\",\"pyOfflineStatus\":\"Disabled\",\"pyLicenseCategory\":\"Execution\",\"pyLifeCycleTabs\":\"Lifecycle\",\"pyProcessesViewMode\":\"FilmStrip\",\"pyLPGeolocationEnabled\":\"Disabled\",\"pyProcessAttachmentsOffline\":\"false\",\"pySLAType\":\"Use existing\",\"pyStepApprovalType\":\"Simple\",\"pyAltStageIDMax\":\"0\",\"pyPurpose\":\"AFlowThatRoutesThe\",\"pxObjClass\":\"Rule-Obj-CaseType\",\"pyRuleAvailable\":\"Yes\"}",
    "branchID": "build_on",
    "changeDescription": "pega-plan: obj-casetype"
  }
}
```
- ⏭ `methodology-rule-authoring` — skipped (no-schema)


## How to reproduce

```bash
cd /Users/karan/Code/pega-automated
export TYPESAFE_API_KEY=$(grep '^TYPESAFE_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
node harness/dryrun-build.mjs
```

Planning calls Jev (TypeSafe) so the plan set can wobble slightly between runs (routing is judgment-based); the composition, fill and verify logic is deterministic given a plan. No call reaches Pega.
