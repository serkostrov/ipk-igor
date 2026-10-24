import {
  isAutomationSilentTaskKind,
  type AutomationTask,
} from "@/entities/automation";
import { getEntityConfig, parseEntityListValueIds } from "@/entities/entity";

function listOptionId(value: string) {
  const ids = parseEntityListValueIds(value);
  if (ids.length > 0) return ids[0]!;
  return value.trim();
}

/** Stage position in the process list field (earlier stages first). */
export function automationTaskStageRank(task: AutomationTask): number {
  const { entities } = getEntityConfig();
  const entity = entities.find((item) => item.id === task.entityId);
  if (!entity || !task.triggerFieldId) return 9999;
  const field = entity.fields.find((item) => item.id === task.triggerFieldId);
  if (!field || field.type !== "list") return 9999;
  const optionId = listOptionId(task.triggerOptionId);
  if (!optionId) return 9999;
  const index = field.listOptions.findIndex(
    (option) => option.id === optionId || option.name === optionId,
  );
  return index >= 0 ? index : 9999;
}

/**
 * Prefer earlier process stage, then lower stepOrder — so a later form-heavy
 * task never opens while an earlier one is still pending.
 */
export function compareAutomationTasksForOpen(
  left: AutomationTask,
  right: AutomationTask,
) {
  const stageDelta =
    automationTaskStageRank(left) - automationTaskStageRank(right);
  if (stageDelta !== 0) return stageDelta;
  if (left.stepOrder !== right.stepOrder) {
    return left.stepOrder - right.stepOrder;
  }
  return left.createdAt.localeCompare(right.createdAt);
}

/** Interactive tasks only — silent autofill / actions never open as a form. */
export function pickEarliestAutomationTask(
  tasks: readonly AutomationTask[],
): AutomationTask | null {
  const interactive = tasks.filter(
    (task) => !isAutomationSilentTaskKind(task.config.kind),
  );
  if (interactive.length === 0) return null;
  return [...interactive].sort(compareAutomationTasksForOpen)[0] ?? null;
}
