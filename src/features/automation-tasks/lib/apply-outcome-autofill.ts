import {
  isAutomationEntityPathRef,
  isAutomationFieldRef,
  parseAutomationEntityPathRef,
  parseAutomationFieldRef,
  resolveAutomationActionValue,
  type AutomationAction,
  type AutomationOutcome,
} from "@/entities/automation";
import { applyEntityFieldValue, type Entity } from "@/entities/entity";

/** setField actions that write a concrete field. */
export function getOutcomeSetFieldActions(
  outcome: AutomationOutcome | null | undefined,
): Extract<AutomationAction, { kind: "setField" }>[] {
  if (!outcome) return [];
  return outcome.actions.filter(
    (action): action is Extract<AutomationAction, { kind: "setField" }> =>
      action.kind === "setField" && action.fieldId.trim().length > 0,
  );
}

/** Whether a stored action value reads `fieldId` from the current record. */
export function automationActionValueDependsOnField(
  value: string,
  fieldId: string,
): boolean {
  if (!fieldId) return false;
  const path = parseAutomationEntityPathRef(value);
  if (path?.relationFieldId === fieldId) return true;
  const ref = parseAutomationFieldRef(value);
  if (ref === fieldId) return true;
  if (value.includes(`{{${fieldId}}}`)) return true;
  return false;
}

/**
 * Apply outcome «Управление полями» setField mappings onto record values.
 * When `changedFieldId` is set, only mappings that depend on that field run
 * (e.g. pick «Воронка» → fill «Главный инженер» from the related record).
 * Without it, all mappings resolve (open form / switch outcome).
 */
export function applyAutomationSetFieldAutofill(input: {
  entity: Entity;
  entities: Entity[];
  values: Record<string, string>;
  actions: readonly AutomationAction[];
  actorUserId?: string | null;
  changedFieldId?: string;
}): Record<string, string> {
  const {
    entity,
    entities,
    values,
    actions,
    actorUserId = null,
    changedFieldId,
  } = input;

  let next = values;
  for (const action of actions) {
    if (action.kind !== "setField") continue;
    const targetId = action.fieldId.trim();
    if (!targetId) continue;
    if (
      changedFieldId &&
      !automationActionValueDependsOnField(action.value, changedFieldId)
    ) {
      continue;
    }
    // Skip empty unresolved templates (no source chosen yet in the builder).
    const raw = action.value.trim();
    if (
      !raw ||
      (isAutomationEntityPathRef(raw) &&
        !parseAutomationEntityPathRef(raw)?.fieldId) ||
      (isAutomationFieldRef(raw) && !parseAutomationFieldRef(raw))
    ) {
      continue;
    }

    const field = entity.fields.find((item) => item.id === targetId);
    const resolved = resolveAutomationActionValue(raw, next, {
      entities,
      triggerEntityId: entity.id,
      values: next,
      fieldType: field?.type,
      datetimeWithTime: field?.datetimeWithTime,
      actorUserId,
    });
    if ((next[targetId] ?? "") === resolved) continue;
    next = applyEntityFieldValue(entity, next, targetId, resolved, entities);
  }
  return next;
}

/** Merge autofill results into the task form draft (visible + written fields). */
export function mergeAutofillIntoFormValues(
  formValues: Record<string, string>,
  baseValues: Record<string, string>,
  filled: Record<string, string>,
  setFieldActions: readonly Extract<AutomationAction, { kind: "setField" }>[],
): Record<string, string> {
  let next = formValues;
  for (const action of setFieldActions) {
    const id = action.fieldId.trim();
    if (!id) continue;
    const value = filled[id];
    if (value === undefined) continue;
    if ((next[id] ?? baseValues[id] ?? "") === value) continue;
    if (next === formValues) next = { ...formValues };
    next[id] = value;
  }
  return next;
}
