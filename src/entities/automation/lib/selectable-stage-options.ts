import type { EntityField, EntityListOption } from "@/entities/entity";
import { parseEntityListValueIds } from "@/entities/entity";
import type { AutomationTask } from "../model/types";
import { nextProcessStageOptionId } from "./outcome-stage-action";
import { matchAutomationConditions } from "./evaluate-conditions";
import { resolveProcessScenarioForStageGate } from "./resolve-process-scenario";

function listOptionId(value: string | undefined) {
  const ids = parseEntityListValueIds(value ?? "");
  if (ids.length > 0) return ids[0]!;
  return (value ?? "").trim();
}

/**
 * Option ids the user may pick for a process trigger list field.
 * Always includes the current stage. With pending blocking tasks on the
 * current stage — only the current stage. Otherwise: configured transitions
 * from the current stage (ТОГДА only when its conditions match; ИНАЧЕ always).
 * When the graph has no edge leaving the current stage, the next sequential
 * option stays available — a graph that covers other stages must not trap
 * the record on the current one.
 */
export function getSelectableStageOptionIds(input: {
  entityId: string;
  field: EntityField;
  currentOptionId: string;
  values: Record<string, string | undefined>;
  pendingTasks?: readonly AutomationTask[];
}): Set<string> | null {
  if (input.field.type !== "list") return null;

  const gate = resolveProcessScenarioForStageGate({
    entityId: input.entityId,
    triggerFieldId: input.field.id,
    values: input.values,
  });
  if (!gate) return null;

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

  const transitions = gate.scenario.stageTransitions;
  let coversCurrent = false;
  if (transitions.length > 0) {
    for (const edge of transitions) {
      if (listOptionId(edge.fromOptionId) !== current) continue;
      coversCurrent = true;
      const to = listOptionId(edge.toOptionId);
      const elseId = listOptionId(edge.elseOptionId);
      const conditionsOk =
        edge.conditions.rules.length === 0 ||
        matchAutomationConditions(edge.conditions, { values: input.values });
      if (to && conditionsOk) allowed.add(to);
      if (elseId) allowed.add(elseId);
      // When ТОГДА fails and there is no ИНАЧЕ — keep only current.
    }
  }

  if (!coversCurrent) {
    const next = nextProcessStageOptionId(input.field.listOptions, current);
    if (next) allowed.add(next);
  }
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
