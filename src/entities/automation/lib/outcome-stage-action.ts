import {
  createAutomationActionId,
  type AutomationAction,
} from "../model/actions";

/**
 * Stage moves for an outcome are stored as `setField` on the process
 * trigger list field (same as autofill «Перейти на стадию»).
 */

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
