import {
  getAutomationConfig,
  type AutomationOutcome,
} from "@/entities/automation";
import type { Entity } from "@/entities/entity";
import { getOutcomeSetFieldActions } from "./apply-outcome-autofill";
import {
  buildRelatedAskPersistUpdates,
  type RelatedAskPersistUpdate,
} from "./task-related-ask";

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
  options?: {
    excludeFieldIds?: string[];
    templateFieldAccess?: AutomationOutcome["fieldAccess"] | null;
  },
): Set<string> {
  const exclude = new Set(
    (options?.excludeFieldIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const fieldIds = new Set<string>();
  const pushAccess = (
    access: AutomationOutcome["fieldAccess"] | null | undefined,
  ) => {
    if (!access) return;
    for (const fieldId of [
      ...access.recordFieldIds,
      ...access.requiredFieldIds,
      ...access.visibleFieldIds,
    ]) {
      const id = fieldId.trim();
      if (!id || exclude.has(id)) continue;
      fieldIds.add(id);
    }
  };
  pushAccess(options?.templateFieldAccess);
  for (const item of outcomes) {
    pushAccess(item.fieldAccess);
    for (const action of getOutcomeSetFieldActions(item)) {
      const id = action.fieldId.trim();
      if (!id || exclude.has(id)) continue;
      fieldIds.add(id);
    }
  }
  return fieldIds;
}

/**
 * Partial record patch from task form values.
 * When `recordValues` is passed, unchanged fields are omitted.
 */
export function buildTaskFormPersistPatch(options: {
  entity: Entity;
  outcomes: AutomationOutcome[];
  values: Record<string, string>;
  excludeFieldIds?: string[];
  recordValues?: Record<string, string | undefined>;
  templateFieldAccess?: AutomationOutcome["fieldAccess"] | null;
}): Record<string, string> | null {
  const fieldIds = collectTaskFormPersistFieldIds(options.outcomes, {
    excludeFieldIds: options.excludeFieldIds,
    templateFieldAccess: options.templateFieldAccess,
  });
  const patch: Record<string, string> = {};
  for (const fieldId of fieldIds) {
    if (!options.entity.fields.some((field) => field.id === fieldId)) continue;
    if (options.values[fieldId] === undefined) continue;
    const next = options.values[fieldId]!;
    if (
      options.recordValues &&
      (options.recordValues[fieldId] ?? "") === next
    ) {
      continue;
    }
    patch[fieldId] = next;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Related-record patches for visible related ask fields. */
export function buildTaskRelatedPersistUpdates(options: {
  entity: Entity;
  entities: Entity[];
  outcomes: AutomationOutcome[];
  values: Record<string, string>;
  triggerRecordId: string;
  skipUnchanged?: boolean;
}): RelatedAskPersistUpdate[] {
  return buildRelatedAskPersistUpdates({
    triggerEntity: options.entity,
    entities: options.entities,
    fieldAccess: options.outcomes.map((item) => item.fieldAccess),
    values: options.values,
    triggerRecordId: options.triggerRecordId,
    skipUnchanged: options.skipUnchanged,
  });
}
