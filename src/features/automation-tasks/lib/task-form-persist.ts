import {
  getAutomationConfig,
  type AutomationOutcome,
} from "@/entities/automation";
import { getOutcomeSetFieldActions } from "./apply-outcome-autofill";

/** Process list/stage field — must be written only by complete RPC. */
export function processTriggerFieldId(processId: string): string {
  return (
    getAutomationConfig()
      .processes.find((item) => item.id === processId)
      ?.triggerFieldId?.trim() ?? ""
  );
}

/**
 * Form fields to persist before complete. Excludes the process trigger
 * (stage) so we never trip AUTOMATION_BLOCKED on the task being completed.
 */
export function collectTaskFormPersistFieldIds(
  outcomes: AutomationOutcome[],
  options?: { excludeFieldIds?: string[] },
): Set<string> {
  const exclude = new Set(
    (options?.excludeFieldIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const fieldIds = new Set<string>();
  for (const item of outcomes) {
    const ids = [
      ...item.fieldAccess.recordFieldIds,
      ...item.fieldAccess.requiredFieldIds,
      ...getOutcomeSetFieldActions(item).map((action) => action.fieldId),
    ];
    for (const fieldId of ids) {
      const id = fieldId.trim();
      if (!id || exclude.has(id)) continue;
      fieldIds.add(id);
    }
  }
  return fieldIds;
}
