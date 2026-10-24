import {
  entityRelationIncludesId,
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  isEntityTabWithLinkedEntity,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityTab,
} from "@/entities/entity";
import type { AutomationCreateParentFromRelated } from "../model/actions";
import type { AutomationAskRelatedField } from "../model/types";

/**
 * How a host record links to a child entity (owned sub-entity or linked tab).
 * Used by createRecord · multiple and parent auto-link on create.
 */
export type HostChildParentLink = {
  field: EntityField;
  /** Linked-entity tab on the host, when the child is reached that way. */
  tab: EntityTab | null;
};

/**
 * Resolve the child→parent relation field for creating rows under `host`
 * (tab `parentLinkFieldId`, owned `parentEntityId`, or inferred belonging).
 */
export function resolveHostChildParentLinkField(
  host: Entity,
  child: Entity,
): HostChildParentLink | null {
  for (const tab of host.tabs) {
    if (!isEntityTabWithLinkedEntity(tab) || tab.linkedEntityId !== child.id) {
      continue;
    }
    const linkFieldId = resolveLinkedTabParentLinkFieldId(tab, child, host.id);
    if (!linkFieldId) continue;
    const field = child.fields.find((item) => item.id === linkFieldId);
    if (!field) continue;
    if (field.type !== "relation" && field.type !== "belonging") continue;
    if (getEntityRelationTargetId(field) !== host.id) continue;
    return { field, tab };
  }

  if (child.parentEntityId?.trim() === host.id) {
    const owned = getEntityParentLinkField(child);
    if (owned) return { field: owned, tab: null };
  }

  const inferred = child.fields.find(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      getEntityRelationTargetId(field) === host.id,
  );
  if (inferred) return { field: inferred, tab: null };
  return null;
}

/** Namespace for related-ask draft keys (`related:{scope}:…`). */
export function askRelatedScopeKey(
  ask: Pick<AutomationAskRelatedField, "relationFieldId" | "linkedTabId">,
): string {
  const tabId = ask.linkedTabId?.trim();
  if (tabId) return `tab:${tabId}`;
  return ask.relationFieldId;
}

export type AskRelatedTargetResolution = {
  scopeKey: string;
  label: string;
  relatedEntity: Entity;
  relatedRecordIds: string[];
};

export function resolveLinkedTabParentLinkFieldId(
  tab: EntityTab,
  linkedEntity: Entity,
  parentEntityId: string,
): string | null {
  const configured = tab.parentLinkFieldId?.trim() || null;
  if (configured) return configured;
  const inferred = linkedEntity.fields.find(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      getEntityRelationTargetId(field) === parentEntityId,
  );
  return inferred?.id ?? null;
}

/** Child record ids for a linked-entity tab on the parent record. */
export function collectLinkedTabRecordIds(options: {
  tab: EntityTab;
  linkedEntity: Entity;
  parentEntityId: string;
  parentRecordId: string;
}): string[] {
  const { tab, linkedEntity, parentEntityId, parentRecordId } = options;
  const parentLinkFieldId = resolveLinkedTabParentLinkFieldId(
    tab,
    linkedEntity,
    parentEntityId,
  );
  if (!parentLinkFieldId) return [];

  const isSelfRef = linkedEntity.id === parentEntityId;
  const parentRecord = isSelfRef
    ? (linkedEntity.records.find((item) => item.id === parentRecordId) ?? null)
    : null;
  const outgoingIds = parseEntityRelationIds(
    parentRecord?.values[parentLinkFieldId],
  );

  return linkedEntity.records
    .filter((record) => {
      if (record.id === parentRecordId) return false;
      if (
        entityRelationIncludesId(
          record.values[parentLinkFieldId],
          parentRecordId,
        )
      ) {
        return true;
      }
      if (isSelfRef && outgoingIds.includes(record.id)) return true;
      return false;
    })
    .map((record) => record.id);
}

/**
 * Child records linked to `parentRecordId` via belonging / relation on the
 * child (createRecord sets this — the parent forward relation may stay empty).
 */
export function collectRecordsLinkedToParent(options: {
  childEntity: Entity;
  parentEntityId: string;
  parentRecordId: string;
  host?: Entity | null;
}): string[] {
  const { childEntity, parentEntityId, parentRecordId, host } = options;
  if (!parentRecordId.trim()) return [];

  if (host) {
    for (const tab of host.tabs) {
      if (
        !isEntityTabWithLinkedEntity(tab) ||
        tab.linkedEntityId !== childEntity.id
      ) {
        continue;
      }
      const fromTab = collectLinkedTabRecordIds({
        tab,
        linkedEntity: childEntity,
        parentEntityId: host.id,
        parentRecordId,
      });
      if (fromTab.length > 0) return fromTab;
    }
  }

  const linkField =
    (host ? resolveHostChildParentLinkField(host, childEntity)?.field : null) ??
    (childEntity.parentEntityId?.trim() === parentEntityId
      ? getEntityParentLinkField(childEntity)
      : null) ??
    childEntity.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        getEntityRelationTargetId(field) === parentEntityId,
    ) ??
    null;
  if (!linkField) return [];

  return childEntity.records
    .filter(
      (record) =>
        record.id !== parentRecordId &&
        entityRelationIncludesId(record.values[linkField.id], parentRecordId),
    )
    .map((record) => record.id);
}

/**
 * Resolve related entity + record ids for one ask row
 * (forward relation or linked-entity tab).
 */
export function resolveAskRelatedTarget(options: {
  triggerEntity: Entity;
  entities: readonly Entity[];
  ask: AutomationAskRelatedField;
  triggerRecordId: string;
  triggerValues: Record<string, string>;
}): AskRelatedTargetResolution | null {
  const { triggerEntity, entities, ask, triggerRecordId, triggerValues } =
    options;
  const entityById = new Map(entities.map((item) => [item.id, item]));
  const linkedTabId = ask.linkedTabId?.trim() || null;

  if (linkedTabId) {
    const tab = triggerEntity.tabs.find((item) => item.id === linkedTabId);
    if (!tab || !isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) {
      return null;
    }
    const relatedEntity = entityById.get(tab.linkedEntityId);
    if (!relatedEntity) return null;
    let relatedRecordIds = collectLinkedTabRecordIds({
      tab,
      linkedEntity: relatedEntity,
      parentEntityId: triggerEntity.id,
      parentRecordId: triggerRecordId,
    });
    if (relatedRecordIds.length === 0) {
      relatedRecordIds = collectRecordsLinkedToParent({
        childEntity: relatedEntity,
        parentEntityId: triggerEntity.id,
        parentRecordId: triggerRecordId,
        host: triggerEntity,
      });
    }
    return {
      scopeKey: askRelatedScopeKey(ask),
      label:
        tab.name.trim() || getEntityDisplayName(relatedEntity) || "Подсущность",
      relatedEntity,
      relatedRecordIds,
    };
  }

  const relationField = triggerEntity.fields.find(
    (field) => field.id === ask.relationFieldId,
  );
  if (!relationField) return null;
  const targetId = getEntityRelationTargetId(relationField);
  const relatedEntity = targetId ? entityById.get(targetId) : undefined;
  if (!relatedEntity) return null;

  const forwardIds = parseEntityRelationIds(triggerValues[ask.relationFieldId]);
  const relatedRecordIds =
    forwardIds.length > 0
      ? forwardIds
      : collectRecordsLinkedToParent({
          childEntity: relatedEntity,
          parentEntityId: triggerEntity.id,
          parentRecordId: triggerRecordId,
          host: triggerEntity,
        });

  return {
    scopeKey: askRelatedScopeKey(ask),
    label: getEntityFieldDisplayName(relationField),
    relatedEntity,
    relatedRecordIds,
  };
}

/** Linked-entity tabs on the host that can supply related ask fields. */
export function getAskRelatedLinkedTabs(
  entity: Entity,
  entities: readonly Entity[],
): Array<{ tab: EntityTab; target: Entity }> {
  const entityById = new Map(entities.map((item) => [item.id, item]));
  const result: Array<{ tab: EntityTab; target: Entity }> = [];
  for (const tab of entity.tabs) {
    if (!isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) continue;
    const target = entityById.get(tab.linkedEntityId);
    if (!target) continue;
    const linkFieldId = resolveLinkedTabParentLinkFieldId(
      tab,
      target,
      entity.id,
    );
    if (!linkFieldId) continue;
    result.push({ tab, target });
  }
  return result;
}

export type CreateParentFromRelatedResolution = {
  parentEntity: Entity;
  parentLabel: string;
  parentRecordIds: string[];
};

/**
 * Intermediate related parents on the trigger that can own `createTarget`
 * (e.g. «Расчёты отделов» for «Подзадачи» when the task is on «Разбор ТКП»).
 */
export type CreateParentFromRelatedOption = {
  parentFrom: AutomationCreateParentFromRelated;
  parentEntity: Entity;
  label: string;
};

function collectChildEntitiesOf(
  parent: Entity,
  entities: readonly Entity[],
): Entity[] {
  const ids = new Set<string>();
  for (const entity of entities) {
    if (entity.parentEntityId === parent.id) ids.add(entity.id);
  }
  for (const tab of parent.tabs) {
    if (isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId) {
      ids.add(tab.linkedEntityId);
    }
  }
  return entities.filter((entity) => ids.has(entity.id));
}

export function getCreateParentFromRelatedOptions(
  sourceEntity: Entity,
  createTarget: Entity,
  entities: readonly Entity[],
): CreateParentFromRelatedOption[] {
  const options: CreateParentFromRelatedOption[] = [];
  const seen = new Set<string>();

  for (const { tab, target } of getAskRelatedLinkedTabs(
    sourceEntity,
    entities,
  )) {
    if (!resolveHostChildParentLinkField(target, createTarget)) continue;
    const key = `tab:${tab.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      parentFrom: { linkedTabId: tab.id },
      parentEntity: target,
      label: tab.name.trim() || getEntityDisplayName(target) || "Подсущность",
    });
  }

  for (const field of sourceEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target) continue;
    if (!resolveHostChildParentLinkField(target, createTarget)) continue;
    const key = `rel:${field.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      parentFrom: { relationFieldId: field.id },
      parentEntity: target,
      label: getEntityFieldDisplayName(field),
    });
  }

  return options;
}

/**
 * Ready-made createRecord configs: create rows under already-existing related
 * parents on the trigger (later task — not nested into a create in the same action).
 * e.g. «Подзадачи» inside existing «Расчёты отделов» while the task is on «Разбор ТКП».
 */
export type CreateUnderExistingRelatedOption = {
  createEntity: Entity;
  parentFrom: AutomationCreateParentFromRelated;
  parentEntity: Entity;
  parentLabel: string;
  createLabel: string;
};

export function getCreateUnderExistingRelatedOptions(
  sourceEntity: Entity,
  entities: readonly Entity[],
): CreateUnderExistingRelatedOption[] {
  const options: CreateUnderExistingRelatedOption[] = [];
  const seen = new Set<string>();

  const push = (
    createEntity: Entity,
    parentFrom: AutomationCreateParentFromRelated,
    parentEntity: Entity,
    parentLabel: string,
  ) => {
    if (!resolveHostChildParentLinkField(parentEntity, createEntity)) return;
    const key = `${createEntity.id}:${parentFrom.linkedTabId ?? ""}:${parentFrom.relationFieldId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tabName = parentEntity.tabs
      .find(
        (tab) =>
          isEntityTabWithLinkedEntity(tab) &&
          tab.linkedEntityId === createEntity.id,
      )
      ?.name.trim();
    options.push({
      createEntity,
      parentFrom,
      parentEntity,
      parentLabel,
      createLabel: tabName || getEntityDisplayName(createEntity),
    });
  };

  for (const { tab, target } of getAskRelatedLinkedTabs(
    sourceEntity,
    entities,
  )) {
    const parentLabel =
      tab.name.trim() || getEntityDisplayName(target) || "Подсущность";
    for (const child of collectChildEntitiesOf(target, entities)) {
      push(child, { linkedTabId: tab.id }, target, parentLabel);
    }
  }

  for (const field of sourceEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target) continue;
    const parentLabel = getEntityFieldDisplayName(field);
    for (const child of collectChildEntitiesOf(target, entities)) {
      push(child, { relationFieldId: field.id }, target, parentLabel);
    }
  }

  return options.sort((left, right) =>
    `${left.parentLabel}/${left.createLabel}`.localeCompare(
      `${right.parentLabel}/${right.createLabel}`,
      "ru",
    ),
  );
}

/**
 * Resolve existing related parent records for `createRecord.parentFromRelated`.
 */
export function resolveCreateParentFromRelated(options: {
  triggerEntity: Entity;
  entities: readonly Entity[];
  parentFrom: AutomationCreateParentFromRelated;
  triggerRecordId: string;
  triggerValues: Record<string, string>;
}): CreateParentFromRelatedResolution | null {
  const {
    triggerEntity,
    entities,
    parentFrom,
    triggerRecordId,
    triggerValues,
  } = options;
  const linkedTabId = parentFrom.linkedTabId?.trim() || null;
  const relationFieldId = parentFrom.relationFieldId?.trim() || null;

  if (linkedTabId) {
    const tab = triggerEntity.tabs.find((item) => item.id === linkedTabId);
    if (!tab || !isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) {
      return null;
    }
    const parentEntity = entities.find(
      (item) => item.id === tab.linkedEntityId,
    );
    if (!parentEntity) return null;
    let parentRecordIds = collectLinkedTabRecordIds({
      tab,
      linkedEntity: parentEntity,
      parentEntityId: triggerEntity.id,
      parentRecordId: triggerRecordId,
    });
    if (parentRecordIds.length === 0) {
      parentRecordIds = collectRecordsLinkedToParent({
        childEntity: parentEntity,
        parentEntityId: triggerEntity.id,
        parentRecordId: triggerRecordId,
        host: triggerEntity,
      });
    }
    return {
      parentEntity,
      parentLabel:
        tab.name.trim() || getEntityDisplayName(parentEntity) || "Подсущность",
      parentRecordIds,
    };
  }

  if (relationFieldId) {
    const relationField = triggerEntity.fields.find(
      (field) => field.id === relationFieldId,
    );
    if (!relationField) return null;
    const targetId = getEntityRelationTargetId(relationField);
    const parentEntity = targetId
      ? entities.find((item) => item.id === targetId)
      : undefined;
    if (!parentEntity) return null;
    const forwardIds = parseEntityRelationIds(triggerValues[relationFieldId]);
    const parentRecordIds =
      forwardIds.length > 0
        ? forwardIds
        : collectRecordsLinkedToParent({
            childEntity: parentEntity,
            parentEntityId: triggerEntity.id,
            parentRecordId: triggerRecordId,
            host: triggerEntity,
          });
    return {
      parentEntity,
      parentLabel: getEntityFieldDisplayName(relationField),
      parentRecordIds,
    };
  }

  return null;
}
