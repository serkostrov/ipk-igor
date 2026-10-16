import type { AutomationTask } from "@/entities/automation";

/** Fields the assignee should see / fill for this task (union across outcomes). */
export function getAutomationTaskAskFields(task: AutomationTask) {
  const required = new Set<string>();
  const visible = new Set<string>();
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
  }

  return {
    requiredFieldIds: [...required],
    visibleFieldIds: [...visible],
    requireAttachment,
  };
}

export function automationTaskNeedsFillDialog(task: AutomationTask) {
  const ask = getAutomationTaskAskFields(task);
  return (
    ask.visibleFieldIds.length > 0 ||
    ask.requiredFieldIds.length > 0 ||
    ask.requireAttachment
  );
}
