import type { AutomationTask } from "@/entities/automation";

/** Fields / tabs the assignee should see / fill for this task (union across outcomes). */
export function getAutomationTaskAskFields(task: AutomationTask) {
  const required = new Set<string>();
  const visible = new Set<string>();
  const viewOnly = new Set<string>();
  const viewTabs = new Set<string>();
  let requireAttachment = false;

  for (const outcome of task.config.outcomes) {
    for (const fieldId of outcome.fieldAccess.requiredFieldIds) {
      required.add(fieldId);
      visible.add(fieldId);
    }
    for (const fieldId of outcome.fieldAccess.visibleFieldIds) {
      visible.add(fieldId);
    }
    if (outcome.fieldAccess.requireAttachment) requireAttachment = true;

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
  }

  // Prefer editable form over read-only when the same field appears in both.
  for (const fieldId of visible) {
    viewOnly.delete(fieldId);
  }

  return {
    requiredFieldIds: [...required],
    visibleFieldIds: [...visible],
    /** Read-only context from «Просмотреть поле» actions. */
    viewFieldIds: [...viewOnly],
    /** Read-only tabs from «Просмотреть вкладки» (записи, файлы, …). */
    viewTabIds: [...viewTabs],
    requireAttachment,
  };
}

export function automationTaskNeedsFillDialog(task: AutomationTask) {
  const ask = getAutomationTaskAskFields(task);
  return (
    ask.visibleFieldIds.length > 0 ||
    ask.requiredFieldIds.length > 0 ||
    ask.viewFieldIds.length > 0 ||
    ask.viewTabIds.length > 0 ||
    ask.requireAttachment
  );
}
