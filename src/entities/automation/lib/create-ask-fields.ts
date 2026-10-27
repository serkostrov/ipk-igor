import {
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  isEntityFieldVisibleOnCreate,
  isEntityNameField,
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import {
  getCreateParentFromRelatedList,
  type AutomationAction,
  type AutomationCreateParentFromRelated,
} from "../model/actions";
import { resolveHostChildParentLinkField } from "./ask-related";

function isCreateAskableField(field: EntityField) {
  return (
    !isEntityComputedFieldType(field.type) &&
    field.type !== "file" &&
    field.type !== "dependencies" &&
    field.type !== "period"
  );
}

function parentLinkFieldIdsForHosts(
  entity: Entity,
  parentHosts: readonly Entity[],
): Set<string> {
  const ids = new Set<string>();
  for (const host of parentHosts) {
    const linkId = resolveHostChildParentLinkField(host, entity)?.field.id;
    if (linkId) ids.add(linkId);
  }
  return ids;
}

/**
 * Fields the assignee fills when creating a record under optional parent hosts
 * (excludes auto-filled parent links).
 */
export function getCreateAskableFields(
  entity: Entity,
  parentHost: Entity | readonly Entity[] | null,
): EntityField[] {
  const hosts =
    parentHost == null
      ? []
      : Array.isArray(parentHost)
        ? parentHost
        : [parentHost];
  const parentLinkIds = parentLinkFieldIdsForHosts(entity, hosts);
  return entity.fields.filter(
    (field) => isCreateAskableField(field) && !parentLinkIds.has(field.id),
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
  parentHost: Entity | readonly Entity[] | null,
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

function resolveParentHostFromRelated(
  sourceEntity: Entity,
  parentFrom: AutomationCreateParentFromRelated,
  entities: readonly Entity[],
): Entity | null {
  if (parentFrom.linkedTabId?.trim()) {
    const tab = sourceEntity.tabs.find(
      (item) => item.id === parentFrom.linkedTabId,
    );
    if (tab && isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId) {
      return entities.find((item) => item.id === tab.linkedEntityId) ?? null;
    }
  }
  if (parentFrom.relationFieldId?.trim()) {
    const field = sourceEntity.fields.find(
      (item) => item.id === parentFrom.relationFieldId,
    );
    const targetId = field ? getEntityRelationTargetId(field) : null;
    if (targetId) {
      return entities.find((item) => item.id === targetId) ?? null;
    }
  }
  return null;
}

/** Parent hosts used when linking created rows (trigger and/or related). */
export function resolveCreateRecordParentHosts(
  action: Extract<AutomationAction, { kind: "createRecord" }>,
  sourceEntity: Entity | null,
  entities: readonly Entity[],
): Entity[] {
  if (!sourceEntity) return [];
  const related = getCreateParentFromRelatedList(action);
  if (related.length > 0) {
    const hosts: Entity[] = [];
    const seen = new Set<string>();
    for (const parentFrom of related) {
      const host = resolveParentHostFromRelated(
        sourceEntity,
        parentFrom,
        entities,
      );
      if (!host || seen.has(host.id)) continue;
      seen.add(host.id);
      hosts.push(host);
    }
    if (action.alsoLinkTrigger && !seen.has(sourceEntity.id)) {
      hosts.push(sourceEntity);
    }
    return hosts;
  }
  const target = entities.find((item) => item.id === action.entityId) ?? null;
  if (target && resolveHostChildParentLinkField(sourceEntity, target) != null) {
    return [sourceEntity];
  }
  return [];
}

/** Primary parent host (first related, else trigger) for ask defaults. */
export function resolveCreateRecordParentHost(
  action: Extract<AutomationAction, { kind: "createRecord" }>,
  sourceEntity: Entity | null,
  entities: readonly Entity[],
): Entity | null {
  return (
    resolveCreateRecordParentHosts(action, sourceEntity, entities)[0] ?? null
  );
}
