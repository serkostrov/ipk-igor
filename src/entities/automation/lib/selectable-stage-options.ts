import type { EntityField, EntityListOption } from "@/entities/entity";
import { parseEntityListValueIds } from "@/entities/entity";
import type { AutomationTask } from "../model/types";
import { resolveProcessScenarioForStageGate } from "./resolve-process-scenario";

function listOptionId(value: string | undefined) {
  const ids = parseEntityListValueIds(value ?? "");
  if (ids.length > 0) return ids[0]!;
  return (value ?? "").trim();
}

/**
 * Option ids the user may pick for a process trigger list field.
 *
 * Manual stage changes on a record are free: any visible option is allowed.
 * The only UI lock is open blocking tasks on the current stage — then only
 * the current stage stays selectable. Conditioned edges (folderHasFiles etc.)
 * are still enforced on write by the client/SQL gate for that exact edge.
 *
 * Returns `null` when there is no process gate or nothing to restrict.
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
  const blocking = (input.pendingTasks ?? []).filter(
    (task) =>
      task.isBlocking &&
      task.triggerFieldId === input.field.id &&
      listOptionId(task.triggerOptionId) === current &&
      (task.status === "pending" || task.status === "returned"),
  );
  if (blocking.length === 0) return null;

  const allowed = new Set<string>();
  if (current) allowed.add(current);
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
