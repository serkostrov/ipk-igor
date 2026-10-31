import { parseEntityListValueIds } from "@/entities/entity";
import {
  createAutomationActionId,
  type AutomationAction,
} from "../model/actions";

/**
 * Stage moves for an outcome are stored as `setField` on the process
 * trigger list field (same as autofill «Перейти на стадию»).
 */

/** Normalize list option payloads (`id` or `["id"]`) to a single id. */
export function normalizeProcessStageOptionId(value: string) {
  const ids = parseEntityListValueIds(value);
  if (ids.length > 0) return ids[0]!;
  return value.trim();
}

export function processStageOptionIdsMatch(a: string, b: string) {
  const left = normalizeProcessStageOptionId(a);
  const right = normalizeProcessStageOptionId(b);
  if (!left || !right) return false;
  return left === right;
}

export function getOutcomeStageOptionId(
  actions: AutomationAction[],
  triggerFieldId: string,
): string {
  if (!triggerFieldId) return "";
  const hit = actions.find(
    (action) => action.kind === "setField" && action.fieldId === triggerFieldId,
  );
  return hit && hit.kind === "setField" ? hit.value : "";
}

/** True when the outcome writes the process stage to a different option. */
export function outcomeChangesProcessStage(
  actions: AutomationAction[],
  triggerFieldId: string,
  currentOptionId: string,
): boolean {
  const next = normalizeProcessStageOptionId(
    getOutcomeStageOptionId(actions, triggerFieldId),
  );
  if (!next) return false;
  return next !== normalizeProcessStageOptionId(currentOptionId ?? "");
}

export function withoutOutcomeStageAction(
  actions: AutomationAction[],
  triggerFieldId: string,
): AutomationAction[] {
  if (!triggerFieldId) return actions;
  return actions.filter(
    (action) =>
      !(action.kind === "setField" && action.fieldId === triggerFieldId),
  );
}

/** Empty `stageOptionId` = do not change stage on complete. */
export function withOutcomeStageAction(
  actions: AutomationAction[],
  triggerFieldId: string,
  stageOptionId: string,
): AutomationAction[] {
  const others = withoutOutcomeStageAction(actions, triggerFieldId);
  if (!triggerFieldId || !stageOptionId) return others;
  return [
    {
      id: createAutomationActionId(),
      kind: "setField" as const,
      fieldId: triggerFieldId,
      value: stageOptionId,
    },
    ...others,
  ];
}
