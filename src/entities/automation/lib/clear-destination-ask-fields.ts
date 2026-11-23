/**
 * When a return/rework button has `keepFilledData: false`, wipe ask fields of
 * the destination stage templates so the respawned task opens empty.
 */

import {
  updateEntityRecord,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import {
  isAutomationSilentTaskKind,
  type AutomationOutcomeFieldAccess,
} from "../model/types";
import { getAutomationConfig } from "../store/automation-store";
import { resolveAskRelatedTarget } from "./ask-related";
import { processStageOptionIdsMatch } from "./outcome-stage-action";

function collectHostFieldIds(access: AutomationOutcomeFieldAccess): string[] {
  return [
    ...access.visibleFieldIds,
    ...access.requiredFieldIds,
    ...access.commentFieldIds,
    ...access.recordFieldIds,
  ];
}

function shouldClearHostField(
  field: EntityField | undefined,
  preserve: ReadonlySet<string>,
): field is EntityField {
  if (!field) return false;
  if (preserve.has(field.id)) return false;
  // Keep structural links — clearing them would orphan the record.
  if (field.type === "belonging") return false;
  return true;
}

/**
 * Clear host + related ask fields for interactive templates on `destinationStageId`.
 * Preserves `preserveFieldIds` (e.g. return-reason comment).
 */
export async function clearDestinationStageAskFields(options: {
  entity: Entity;
  recordId: string;
  scenarioId: string;
  destinationStageId: string;
  entities: Entity[];
  preserveFieldIds?: readonly string[];
  /** Current host values — used to resolve related asks. */
  hostValues: Record<string, string>;
}): Promise<void> {
  const destination = options.destinationStageId.trim();
  if (!destination || !options.scenarioId.trim()) return;

  const preserve = new Set(
    (options.preserveFieldIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

  const templates = getAutomationConfig().templates.filter(
    (template) =>
      template.scenarioId === options.scenarioId &&
      template.enabled !== false &&
      !isAutomationSilentTaskKind(template.kind) &&
      processStageOptionIdsMatch(template.triggerOptionId, destination),
  );
  if (templates.length === 0) return;

  const hostPatch: Record<string, string> = {};
  const relatedByKey = new Map<
    string,
    { entityId: string; recordId: string; patch: Record<string, string> }
  >();

  for (const template of templates) {
    const access = template.fieldAccess;
    for (const fieldId of collectHostFieldIds(access)) {
      const field = options.entity.fields.find((item) => item.id === fieldId);
      if (!shouldClearHostField(field, preserve)) continue;
      hostPatch[fieldId] = "";
    }

    for (const ask of access.relatedVisibleFields) {
      const fieldId = ask.fieldId.trim();
      if (!fieldId || preserve.has(fieldId)) continue;
      const resolved = await resolveAskRelatedTarget({
        triggerEntity: options.entity,
        entities: options.entities,
        ask,
        triggerRecordId: options.recordId,
        triggerValues: options.hostValues,
      });
      if (!resolved) continue;
      for (const relatedRecordId of resolved.relatedRecordIds) {
        const key = `${resolved.relatedEntity.id}:${relatedRecordId}`;
        const existing = relatedByKey.get(key) ?? {
          entityId: resolved.relatedEntity.id,
          recordId: relatedRecordId,
          patch: {},
        };
        const relatedField = resolved.relatedEntity.fields.find(
          (item) => item.id === fieldId,
        );
        if (!shouldClearHostField(relatedField, preserve)) continue;
        existing.patch[fieldId] = "";
        relatedByKey.set(key, existing);
      }
    }
  }

  if (Object.keys(hostPatch).length > 0) {
    await updateEntityRecord(options.entity.id, options.recordId, hostPatch);
  }
  for (const item of relatedByKey.values()) {
    if (Object.keys(item.patch).length === 0) continue;
    await updateEntityRecord(item.entityId, item.recordId, item.patch);
  }
}
