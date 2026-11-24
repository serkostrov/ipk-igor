import type { EntityField, EntityListOption } from "@/entities/entity";
import { parseEntityListValueIds } from "@/entities/entity";
import { getAutomationConfig } from "../store/automation-store";
import type { AutomationScenario, AutomationTask } from "../model/types";
import { nextProcessStageOptionId } from "./outcome-stage-action";
import { matchAutomationConditions } from "./evaluate-conditions";

function listOptionId(value: string | undefined) {
  const ids = parseEntityListValueIds(value ?? "");
  if (ids.length > 0) return ids[0]!;
  return (value ?? "").trim();
}

function pickScenario(
  processId: string,
  values: Record<string, string | undefined>,
): AutomationScenario | null {
  const { scenarios } = getAutomationConfig();
  const forProcess = scenarios.filter((item) => item.processId === processId);
  const matched = forProcess
    .filter((item) => !item.isDefault && item.entryConditions.rules.length > 0)
    .filter((item) =>
      matchAutomationConditions(item.entryConditions, { values }),
    )
    .sort((a, b) => b.priority - a.priority)[0];
  return matched ?? forProcess.find((item) => item.isDefault) ?? null;
}

/**
 * Option ids the user may pick for a process trigger list field.
 * Always includes the current stage. With pending blocking tasks on the
 * current stage — only the current stage. Otherwise: configured transitions
 * from the current stage, or the next sequential option when no graph.
 */
export function getSelectableStageOptionIds(input: {
  entityId: string;
  field: EntityField;
  currentOptionId: string;
  values: Record<string, string | undefined>;
  pendingTasks?: readonly AutomationTask[];
}): Set<string> | null {
  if (input.field.type !== "list") return null;

  const { processes } = getAutomationConfig();
  const process = processes.find(
    (item) =>
      item.enabled &&
      item.entityId === input.entityId &&
      item.triggerFieldId === input.field.id,
  );
  if (!process) return null;

  const current = listOptionId(input.currentOptionId);
  const allowed = new Set<string>();
  if (current) allowed.add(current);

  const blocking = (input.pendingTasks ?? []).filter(
    (task) =>
      task.isBlocking &&
      task.triggerFieldId === input.field.id &&
      listOptionId(task.triggerOptionId) === current &&
      (task.status === "pending" || task.status === "returned"),
  );
  if (blocking.length > 0) return allowed;

  const scenario = pickScenario(process.id, input.values);
  const transitions = scenario?.stageTransitions ?? [];
  if (transitions.length > 0) {
    for (const edge of transitions) {
      if (listOptionId(edge.fromOptionId) !== current) continue;
      const to = listOptionId(edge.toOptionId);
      if (to) allowed.add(to);
      const elseId = listOptionId(edge.elseOptionId);
      if (elseId) allowed.add(elseId);
    }
    return allowed;
  }

  const next = nextProcessStageOptionId(input.field.listOptions, current);
  if (next) allowed.add(next);
  return allowed;
}

export function filterSelectableListOptions(
  options: readonly EntityListOption[],
  allowedIds: Set<string> | null,
): EntityListOption[] {
  if (!allowedIds) return [...options];
  return options.filter((option) => allowedIds.has(option.id));
}

/** Whether `toOptionId` is allowed under the same rules as the UI filter. */
export function isStageOptionSelectable(input: {
  entityId: string;
  field: EntityField;
  currentOptionId: string;
  toOptionId: string;
  values: Record<string, string | undefined>;
  pendingTasks?: readonly AutomationTask[];
}): boolean {
  const to = listOptionId(input.toOptionId);
  const from = listOptionId(input.currentOptionId);
  if (!to || to === from) return true;
  const allowed = getSelectableStageOptionIds(input);
  if (!allowed) return true;
  return allowed.has(to);
}
