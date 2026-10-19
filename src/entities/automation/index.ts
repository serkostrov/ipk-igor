export {
  AUTOMATION_ACTION_KIND_LABELS,
  AUTOMATION_ACTION_KINDS,
  createAutomationActionId,
  defaultAutomationAction,
  describeAutomationAction,
  normalizeAutomationAction,
  normalizeAutomationActions,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationFieldMapping,
  type DescribeAutomationActionContext,
} from "./model/actions";
export {
  AUTOMATION_VALUE_CURRENT_USER,
  AUTOMATION_VALUE_NOW,
  AUTOMATION_VALUE_TIME_NOW,
  AUTOMATION_VALUE_TODAY,
  AUTOMATION_VALUE_TOMORROW,
  describeAutomationActionValue,
  isAutomationEntityPathRef,
  isAutomationFieldRef,
  parseAutomationEntityPathRef,
  parseAutomationFieldRef,
  resolveAutomationActionValue,
  toAutomationEntityPathRef,
  toAutomationFieldRef,
} from "./model/action-values";
export {
  AUTOMATION_ASSIGNEE_SOURCE_LABELS,
  AUTOMATION_ASSIGNEE_SOURCE_ORDER,
  AUTOMATION_ASSIGNEE_TYPE_HINTS,
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  AUTOMATION_RECIPIENT_TYPE_HINTS,
  AUTOMATION_WATCHER_TYPE_HINTS,
  assigneeSourceKind,
  createAutomationAssigneeBranchId,
  defaultAssigneeLeafResolver,
  defaultAssigneeResolver,
  defaultWatcherResolver,
  defaultConditionalAssigneeResolver,
  normalizeAssigneeResolver,
  type AutomationAssigneeBranch,
  type AutomationAssigneeEditorMode,
  type AutomationAssigneeLeafResolver,
  type AutomationAssigneeResolver,
  type AutomationAssigneeSourceKind,
} from "./model/assignee";
export {
  AUTOMATION_CONDITION_OPERATOR_LABELS,
  AUTOMATION_CONDITION_OPERATORS,
  AUTOMATION_CONDITIONS_VERSION,
  AUTOMATION_FOLDER_FILE_OPERATORS,
  createAutomationConditionId,
  emptyAutomationConditions,
  isAutomationFolderFileOperator,
  normalizeAutomationConditions,
  type AutomationConditionGroup,
  type AutomationConditionMatch,
  type AutomationConditionNode,
  type AutomationConditionOperator,
  type AutomationConditionRule,
  type AutomationConditions,
} from "./model/conditions";
export {
  countDirectFilesInNamedFolder,
  folderHasFiles,
  folderIsEmpty,
} from "./lib/folder-files-condition";
export {
  cloneAutomationScenario,
  type ClonedAutomationScenario,
} from "./lib/clone-scenario";
export { IPK_NEW_AUTOMATION_MAPPING_VERSION } from "./model/ipk-new-mapping";
export {
  AUTOMATION_TRIGGER_KIND_LABELS,
  createAutomationNotificationRuleId,
  createAutomationOutcomeId,
  createAutomationProcessId,
  createAutomationScenarioId,
  createAutomationTemplateId,
  automationOutcomeHasConditions,
  AUTOMATION_STAGE_TASK_RELEASE_LABELS,
  createAutomationStageTransitionId,
  createDefaultProcess,
  defaultAutofillOutcomes,
  defaultDecisionOutcomes,
  emptyAutomationCanvasLayout,
  emptyAutomationConfig,
  emptyAutomationOutcomeFieldAccess,
  getStageTaskRelease,
  normalizeAutomationCanvasLayout,
  normalizeAutomationConfig,
  normalizeAutomationNotificationRule,
  normalizeAutomationOutcomeFieldAccess,
  normalizeAutomationProcess,
  normalizeAutomationScenario,
  normalizeAutomationStageTaskReleaseMap,
  normalizeAutomationStageTransition,
  normalizeAutomationStageTransitions,
  normalizeAutomationTaskTemplate,
  type AutomationCanvasLayout,
  type AutomationCanvasNodePositions,
  type AutomationConfig,
  type AutomationNotificationEvent,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationOutcomeFieldAccess,
  type AutomationProcess,
  type AutomationRun,
  type AutomationScenario,
  type AutomationSla,
  type AutomationStageTaskRelease,
  type AutomationStageTaskReleaseMap,
  type AutomationStageTransition,
  type AutomationTask,
  type AutomationLaunchPhase,
  type AutomationTaskKind,
  type AutomationTaskStatus,
  type AutomationTaskTemplate,
  type AutomationTriggerKind,
} from "./model/types";
export {
  matchAutomationConditions,
  type AutomationConditionEvalContext,
} from "./lib/evaluate-conditions";
export {
  AUTOMATION_REQUIRE_TIME_TRACKING,
  automationRequiresTimeTracking,
  setAutomationRequireTimeTracking,
} from "./lib/require-time-tracking";
export {
  AUTOMATION_UPLOAD_TARGET_PREFIX,
  getAutomationUploadTarget,
  setAutomationUploadTarget,
  type AutomationTaskUploadTarget,
} from "./lib/upload-target";
export { pickAutomationOutcome } from "./lib/pick-outcome";
export { resolveAssigneeUserIds } from "./lib/resolve-assignee";
export {
  getOutcomeStageOptionId,
  withOutcomeStageAction,
  withoutOutcomeStageAction,
} from "./lib/outcome-stage-action";
export {
  findStageTransition,
  resolveStageTransition,
  stageTransitionIsConfigured,
  type StageTransitionResolution,
} from "./lib/resolve-stage-transition";
export {
  AUTOMATION_CONDITION_PARITY_CASES,
  runAutomationConditionParityTs,
  type ConditionParityCase,
} from "./lib/condition-parity-fixtures";
export { renderAutomationNameTemplate } from "./lib/render-name-template";
export { executeAutomationActions } from "./lib/execute-actions";
export {
  completeAutomationTask,
  returnAutomationTaskForRevision,
} from "./lib/complete-task";
export {
  describeBlockingTasks,
  resolveAutomationGateError,
  type AutomationGateContext,
} from "./lib/blocking-error";
export {
  fetchAutomationConfig,
  saveAutomationConfig,
  upsertAutomationProcess,
  upsertAutomationScenario,
  upsertAutomationTemplate,
  upsertAutomationNotificationRule,
} from "./api/automation-config-api";
export {
  addAutomationTaskAttachment,
  addAutomationTaskTimeSession,
  countAutomationTasksForRecord,
  deleteAutomationTask,
  deleteAutomationTasksForRecord,
  fetchAutomationTask,
  fetchAutomationTaskAttachments,
  fetchAutomationTaskTimeSessions,
  ensureAutomationBeforeEnterPrep,
  fetchAutomationTasks,
  fetchAutomationNotifications,
  fetchOpenAutomationTaskTimeSession,
  markAutomationNotificationRead,
  registerOverdueAutomationTasksRpc,
  startAutomationTaskTimeSession,
  stopAutomationTaskTimeSession,
  subscribeAutomationTasks,
  notifyAutomationTasksChanged,
  completeAutomationTaskRpc,
  type AutomationTaskTimeSession,
} from "./api/automation-tasks-api";
export {
  initAutomationConfig,
  reloadAutomationConfig,
  saveProcess,
  saveScenario,
  saveTemplate,
  saveNotificationRule,
  removeProcess,
  removeScenario,
  removeTemplate,
  removeNotificationRule,
  getAutomationConfig,
  getAutomationStatus,
  getAutomationError,
  subscribeAutomationConfig,
  type AutomationStatus,
} from "./store/automation-store";
export {
  useAutomationConfig,
  useAutomationError,
  useAutomationStatus,
} from "./hooks/use-automations";
export { AssigneeEditor } from "./ui/AssigneeEditor";
