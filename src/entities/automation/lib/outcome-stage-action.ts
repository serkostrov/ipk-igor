import { parseEntityListValueIds } from "@/entities/entity";
import {
  createAutomationActionId,
  type AutomationAction,
} from "../model/actions";
import type {
  AutomationAssigneeLeafResolver,
  AutomationAssigneeResolver,
} from "../model/assignee";
import type { AutomationOutcome } from "../model/types";

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

/** Affirmative decision button (default «Да») — used for fallback stage advance. */
export function isAffirmativeDecisionOutcome(
  outcome: Pick<AutomationOutcome, "label" | "color">,
): boolean {
  const label = outcome.label.trim().toLocaleLowerCase("ru");
  if (
    label === "да" ||
    label === "yes" ||
    label === "ок" ||
    label === "ok" ||
    label === "согласовано" ||
    label === "утвердить" ||
    label === "approve"
  ) {
    return true;
  }
  if (
    label === "нет" ||
    label === "no" ||
    label === "отклонить" ||
    label === "reject" ||
    label === "на доработку"
  ) {
    return false;
  }
  const color = (outcome.color ?? "").trim().toLowerCase();
  if (color === "#22c55e" || color === "#16a34a" || color === "#4ade80") {
    return true;
  }
  if (color === "#ef4444" || color === "#dc2626" || color === "#f87171") {
    return false;
  }
  return false;
}

function leafDefersProcessStage(
  resolver: AutomationAssigneeLeafResolver,
): boolean {
  if (resolver.type === "relatedField" && resolver.fanOut === true) {
    return (resolver.completeWhen ?? "all") === "all";
  }
  if (resolver.type === "relationFieldFanOut") {
    return (resolver.completeWhen ?? "all") === "all";
  }
  if (resolver.type === "fixedUsers" || resolver.type === "role") {
    return resolver.completeWhen === "all";
  }
  return false;
}

/**
 * Parallel assignees who must all finish. The next template on this stage
 * (or SQL `completeWhen`) owns the stage move — a green button without
 * «Перейти на стадию» must not jump the record on its own.
 */
export function assigneeDefersProcessStage(
  assignee: AutomationAssigneeResolver,
): boolean {
  if (assignee.type === "conditional") {
    return (
      assignee.branches.some((branch) =>
        leafDefersProcessStage(branch.resolver),
      ) || leafDefersProcessStage(assignee.elseResolver)
    );
  }
  return leafDefersProcessStage(assignee);
}

/** Next visible process-stage option after `currentOptionId`, or null. */
export function nextProcessStageOptionId(
  options: ReadonlyArray<{ id: string; hiddenByDefault?: boolean }>,
  currentOptionId: string,
): string | null {
  const visible = options.filter((option) => !option.hiddenByDefault);
  const current = normalizeProcessStageOptionId(currentOptionId);
  if (!current) return null;
  const index = visible.findIndex((option) =>
    processStageOptionIdsMatch(option.id, current),
  );
  if (index < 0 || index >= visible.length - 1) return null;
  return visible[index + 1]!.id;
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
