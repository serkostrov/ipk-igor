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
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  defaultAssigneeResolver,
  normalizeAssigneeResolver,
  type AutomationAssigneeResolver,
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
export { IPK_NEW_AUTOMATION_MAPPING_VERSION } from "./model/ipk-new-mapping";
export {
  AUTOMATION_TRIGGER_KIND_LABELS,
  createAutomationNotificationRuleId,
  createAutomationOutcomeId,
  createAutomationProcessId,
  createAutomationScenarioId,
  createAutomationTemplateId,
  automationOutcomeHasConditions,
  createDefaultProcess,
  defaultAutofillOutcomes,
  defaultDecisionOutcomes,
  emptyAutomationConfig,
  emptyAutomationOutcomeFieldAccess,
  normalizeAutomationCanvasLayout,
  normalizeAutomationConfig,
  normalizeAutomationNotificationRule,
  normalizeAutomationOutcomeFieldAccess,
  normalizeAutomationProcess,
  normalizeAutomationScenario,
  normalizeAutomationTaskTemplate,
  type AutomationCanvasLayout,
  type AutomationConfig,
  type AutomationNotificationEvent,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationOutcomeFieldAccess,
  type AutomationProcess,
  type AutomationRun,
  type AutomationScenario,
  type AutomationSla,
  type AutomationTask,
  type AutomationTaskKind,
  type AutomationTaskStatus,
  type AutomationTaskTemplate,
  type AutomationTriggerKind,
} from "./model/types";
export {
  matchAutomationConditions,
  type AutomationConditionEvalContext,
} from "./lib/evaluate-conditions";
export { pickAutomationOutcome } from "./lib/pick-outcome";
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
  fetchAutomationConfig,
  saveAutomationConfig,
  upsertAutomationProcess,
  upsertAutomationScenario,
  upsertAutomationTemplate,
  upsertAutomationNotificationRule,
} from "./api/automation-config-api";
export {
  addAutomationTaskAttachment,
  fetchAutomationTask,
  fetchAutomationTaskAttachments,
  fetchAutomationTasks,
  fetchAutomationNotifications,
  fetchOpenAutomationTaskTimeSession,
  markAutomationNotificationRead,
  registerOverdueAutomationTasksRpc,
  startAutomationTaskTimeSession,
  stopAutomationTaskTimeSession,
  subscribeAutomationTasks,
  completeAutomationTaskRpc,
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
