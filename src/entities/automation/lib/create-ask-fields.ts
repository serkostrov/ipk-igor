import {
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  isEntityFieldVisibleOnCreate,
  isEntityNameField,
  isEntityParentLinkField,
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import type { AutomationAction } from "../model/actions";
import { resolveHostChildParentLinkField } from "./ask-related";

function isCreateAskableField(field: EntityField) {
  return (
    !isEntityComputedFieldType(field.type) &&
    field.type !== "file" &&
    field.type !== "dependencies" &&
    field.type !== "period"
  );
}

/**
 * Fields the assignee fills when creating a record under an optional parent host
 * (excludes the auto-filled parent link).
 */
export function getCreateAskableFields(
  entity: Entity,
  parentHost: Entity | null,
): EntityField[] {
  const parentLinkFieldId = parentHost
    ? (resolveHostChildParentLinkField(parentHost, entity)?.field.id ?? null)
    : null;
  return entity.fields.filter(
    (field) =>
      isCreateAskableField(field) &&
      !isEntityParentLinkField(field, parentLinkFieldId),
  );
}

/** Default pick when authoring a custom ask list (name, else first fields). */
export function defaultCreateAskFieldIds(
  entity: Entity,
  parentHost: Entity | null,
): string[] {
  const askable = getCreateAskableFields(entity, parentHost);
  const nameField = askable.find((field) => isEntityNameField(field));
  if (nameField) return [nameField.id];
  return askable.slice(0, 2).map((field) => field.id);
}

/**
 * Resolve which fields to ask on the task form for a createRecord action.
 * `useEntityCreateForm` → entity «При создании» (+ required / name).
 */
export function resolveCreateRecordAskFields(
  action: Extract<AutomationAction, { kind: "createRecord" }>,
  target: Entity,
  parentHost: Entity | null,
): { askFieldIds: string[]; askRequiredFieldIds: string[] } {
  if (action.useEntityCreateForm) {
    const fields = getCreateAskableFields(target, parentHost).filter((field) =>
      isEntityFieldVisibleOnCreate(field),
    );
    return {
      askFieldIds: fields.map((field) => field.id),
      askRequiredFieldIds: fields
        .filter((field) => field.required || isEntityNameField(field))
        .map((field) => field.id),
    };
  }
  const askFieldIds = action.askFieldIds ?? [];
  return {
    askFieldIds,
    askRequiredFieldIds: (action.askRequiredFieldIds ?? []).filter((id) =>
      askFieldIds.includes(id),
    ),
  };
}

/** Parent host used when linking created rows (trigger or related parent entity). */
export function resolveCreateRecordParentHost(
  action: Extract<AutomationAction, { kind: "createRecord" }>,
  sourceEntity: Entity | null,
  entities: readonly Entity[],
): Entity | null {
  if (!sourceEntity) return null;
  const parentFrom = action.parentFromRelated;
  if (parentFrom?.linkedTabId?.trim()) {
    const tab = sourceEntity.tabs.find(
      (item) => item.id === parentFrom.linkedTabId,
    );
    if (tab && isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId) {
      return entities.find((item) => item.id === tab.linkedEntityId) ?? null;
    }
  }
  if (parentFrom?.relationFieldId?.trim()) {
    const field = sourceEntity.fields.find(
      (item) => item.id === parentFrom.relationFieldId,
    );
    const targetId = field ? getEntityRelationTargetId(field) : null;
    if (targetId) {
      return entities.find((item) => item.id === targetId) ?? null;
    }
  }
  const target = entities.find((item) => item.id === action.entityId) ?? null;
  if (target && resolveHostChildParentLinkField(sourceEntity, target) != null) {
    return sourceEntity;
  }
  return null;
}
