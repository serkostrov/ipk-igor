import type { AutomationOutcome, AutomationTask } from "@/entities/automation";

export type AutomationAskFields = {
  requiredFieldIds: string[];
  visibleFieldIds: string[];
  /** Read-only context from «Просмотреть поле» actions. */
  viewFieldIds: string[];
  /** Read-only tabs from «Просмотреть вкладки» (записи, файлы, …). */
  viewTabIds: string[];
  requireAttachment: boolean;
};

const EMPTY_ASK_FIELDS: AutomationAskFields = {
  requiredFieldIds: [],
  visibleFieldIds: [],
  viewFieldIds: [],
  viewTabIds: [],
  requireAttachment: false,
};

/** Fields / tabs for a single outcome (form appears only after that button). */
export function getAutomationOutcomeAskFields(
  outcome: AutomationOutcome,
): AutomationAskFields {
  const required = new Set<string>();
  const visible = new Set<string>();
  const viewOnly = new Set<string>();
  const viewTabs = new Set<string>();

  for (const fieldId of outcome.fieldAccess.requiredFieldIds) {
    required.add(fieldId);
    visible.add(fieldId);
  }
  for (const fieldId of outcome.fieldAccess.visibleFieldIds) {
    visible.add(fieldId);
  }

  for (const action of outcome.actions) {
    if (action.kind === "viewField") {
      for (const fieldId of action.fieldIds) {
        if (fieldId.trim()) viewOnly.add(fieldId);
      }
    }
    if (action.kind === "viewTabs") {
      for (const tabId of action.tabIds) {
        if (tabId.trim()) viewTabs.add(tabId);
      }
    }
  }

  // Prefer editable form over read-only when the same field appears in both.
  for (const fieldId of visible) {
    viewOnly.delete(fieldId);
  }

  return {
    requiredFieldIds: [...required],
    visibleFieldIds: [...visible],
    viewFieldIds: [...viewOnly],
    viewTabIds: [...viewTabs],
    requireAttachment: outcome.fieldAccess.requireAttachment === true,
  };
}

/** Union across outcomes — for draft init / “needs dialog” checks. */
export function getAutomationTaskAskFields(
  task: AutomationTask,
): AutomationAskFields {
  const required = new Set<string>();
  const visible = new Set<string>();
  const viewOnly = new Set<string>();
  const viewTabs = new Set<string>();
  let requireAttachment = false;

  for (const outcome of task.config.outcomes) {
    const ask = getAutomationOutcomeAskFields(outcome);
    for (const fieldId of ask.requiredFieldIds) required.add(fieldId);
    for (const fieldId of ask.visibleFieldIds) visible.add(fieldId);
    for (const fieldId of ask.viewFieldIds) viewOnly.add(fieldId);
    for (const tabId of ask.viewTabIds) viewTabs.add(tabId);
    if (ask.requireAttachment) requireAttachment = true;
  }

  for (const fieldId of visible) {
    viewOnly.delete(fieldId);
  }

  return {
    requiredFieldIds: [...required],
    visibleFieldIds: [...visible],
    viewFieldIds: [...viewOnly],
    viewTabIds: [...viewTabs],
    requireAttachment,
  };
}

export function automationOutcomeNeedsInput(outcome: AutomationOutcome) {
  const ask = getAutomationOutcomeAskFields(outcome);
  return (
    ask.visibleFieldIds.length > 0 ||
    ask.requiredFieldIds.length > 0 ||
    ask.viewFieldIds.length > 0 ||
    ask.viewTabIds.length > 0 ||
    ask.requireAttachment
  );
}

export function automationTaskNeedsFillDialog(task: AutomationTask) {
  return task.config.outcomes.some(automationOutcomeNeedsInput);
}

export { EMPTY_ASK_FIELDS };
