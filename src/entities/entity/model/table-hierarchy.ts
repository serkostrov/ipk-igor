import {
  entityRelationIncludesId,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  parseEntityListValueIds,
  parseEntityRelationIds,
} from "./field";
import {
  collectRelationGroupsIdsAtDepth,
  getRelationGroupsLevelEntityId,
  isEntityRelationGroupsConfigReady,
  parseEntityRelationGroups,
  serializeEntityRelationGroups,
} from "./relation-groups";
import {
  getRelationRecordOptions,
  isEntityTabWithLinkedEntity,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTab,
} from "./types";

/** Empty value — records without a selected option / relation. */
export const ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID = "";

/** Fields with selectable variants that can group the table into a tree. */
export function isEntityTableParentField(field: EntityField): boolean {
  if (field.type === "list") return !field.listMultiple;
  if (field.type === "relation") return !field.relationMultiple;
  if (field.type === "belonging") return true;
  if (field.type === "relationGroups") {
    return isEntityRelationGroupsConfigReady(field.relationGroups);
  }
  return false;
}

/** List / relation / groups fields for table hierarchy. */
export function getEntityTableParentFieldCandidates(
  entity: Entity,
): EntityField[] {
  return entity.fields.filter((field) => isEntityTableParentField(field));
}

/** Resolved grouping field for the table hierarchy, if valid. */
export function resolveEntityTableParentField(
  entity: Entity,
): EntityField | null {
  const id = entity.tableParentFieldId?.trim() ?? "";
  if (!id) return null;
  return (
    getEntityTableParentFieldCandidates(entity).find(
      (field) => field.id === id,
    ) ?? null
  );
}

/** Option / related-record id stored in the hierarchy field (first value). */
export function parseEntityTableParentId(value: string | undefined): string {
  return (
    parseEntityListValueIds(value)[0]?.trim() ||
    parseEntityRelationIds(value)[0]?.trim() ||
    ""
  );
}

/**
 * Group ids for a record under the hierarchy field.
 * `relationGroups` — each selected root (stage/department); empty → one
 * empty group. A record with several roots appears once per root.
 * List / relation / belonging — single id (or empty).
 */
export function parseEntityTableParentGroupIds(
  field: EntityField,
  value: string | undefined,
): string[] {
  if (field.type === "relationGroups") {
    const roots = collectRelationGroupsIdsAtDepth(
      parseEntityRelationGroups(value),
      0,
    ).filter((id) => id.trim().length > 0);
    return roots.length > 0 ? roots : [ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID];
  }
  return [parseEntityTableParentId(value)];
}

/** Value to prefill when creating a record under a hierarchy group. */
export function encodeEntityTableParentValue(
  field: EntityField,
  groupId: string,
): string {
  const id = groupId.trim();
  if (!id) return "";
  if (field.type === "relationGroups") {
    return serializeEntityRelationGroups([{ id, children: [] }]);
  }
  return id;
}

function resolveRelationGroupsRootEntity(
  field: EntityField,
  entities: readonly Entity[],
): Entity | null {
  const level = field.relationGroups?.levels[0];
  if (!level) return null;
  const resolveFieldTarget = (entityId: string, fieldId: string) => {
    const entity = entities.find((item) => item.id === entityId);
    const bridge = entity?.fields.find((item) => item.id === fieldId);
    return bridge ? getEntityRelationTargetId(bridge) : null;
  };
  const rootId = getRelationGroupsLevelEntityId(level, null, resolveFieldTarget);
  if (!rootId) return null;
  return entities.find((item) => item.id === rootId) ?? null;
}

function relationTargetLabels(
  target: Entity | null,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const option of getRelationRecordOptions(target)) {
    labels.set(option.id, option.label);
  }
  if (target) {
    for (const record of target.records) {
      if (labels.has(record.id)) continue;
      labels.set(
        record.id,
        resolveRelationRecordLabel(target, record.id) ?? "Без названия",
      );
    }
  }
  return labels;
}

export type EntityTableHierarchyGroupRow = {
  kind: "group";
  id: string;
  label: string;
  childCount: number;
  depth: 0;
};

export type EntityTableHierarchyRecordRow = {
  kind: "record";
  record: EntityRecord;
  groupId: string;
  depth: 1;
};

export type EntityTableHierarchyRow =
  EntityTableHierarchyGroupRow | EntityTableHierarchyRecordRow;

function resolveHierarchyGroupLabels(
  parentField: EntityField,
  entities: readonly Entity[],
): Map<string, string> {
  if (parentField.type === "list") {
    return new Map(
      resolveEntityListFieldOptions(parentField, entities).map((option) => [
        option.id,
        option.name,
      ]),
    );
  }
  if (parentField.type === "relation" || parentField.type === "belonging") {
    const targetId = getEntityRelationTargetId(parentField);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    return relationTargetLabels(target);
  }
  if (parentField.type === "relationGroups") {
    return relationTargetLabels(
      resolveRelationGroupsRootEntity(parentField, entities),
    );
  }
  return new Map();
}

/**
 * Flat group → records rows for a hierarchy table.
 * Groups follow option / related-record order; empty value is last when present.
 *
 * When the parent field points at records of this same table (belonging /
 * self-relation), a parent is already the group header — do not also list it
 * under «Без значения».
 *
 * For `relationGroups`, a record with several roots appears under each root.
 */
export function flattenEntityTableHierarchyRows(
  records: readonly EntityRecord[],
  parentField: EntityField,
  expandedIds: ReadonlySet<string>,
  entities: readonly Entity[] = [],
): EntityTableHierarchyRow[] {
  const labels = resolveHierarchyGroupLabels(parentField, entities);
  const byGroup = new Map<string, EntityRecord[]>();
  for (const record of records) {
    const groupIds = parseEntityTableParentGroupIds(
      parentField,
      record.values[parentField.id],
    );
    for (const groupId of groupIds) {
      const list = byGroup.get(groupId) ?? [];
      list.push(record);
      byGroup.set(groupId, list);
    }
  }

  const recordIds = new Set(records.map((record) => record.id));
  const usedAsParent = new Set(
    [...byGroup.entries()]
      .filter(
        ([id, children]) =>
          id !== ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID &&
          recordIds.has(id) &&
          children.length > 0,
      )
      .map(([id]) => id),
  );
  if (usedAsParent.size > 0) {
    const emptyChildren =
      byGroup.get(ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID) ?? [];
    const filtered = emptyChildren.filter(
      (record) => !usedAsParent.has(record.id),
    );
    if (filtered.length === 0) {
      byGroup.delete(ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID);
    } else {
      byGroup.set(ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID, filtered);
    }
  }

  const orderedIds: string[] = [];
  for (const id of labels.keys()) {
    if (byGroup.has(id)) orderedIds.push(id);
  }
  if (byGroup.has(ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID)) {
    orderedIds.push(ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID);
  }
  for (const id of byGroup.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  const rows: EntityTableHierarchyRow[] = [];
  for (const id of orderedIds) {
    const children = byGroup.get(id) ?? [];
    if (children.length === 0) continue;
    rows.push({
      kind: "group",
      id,
      label:
        id === ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID
          ? "Без значения"
          : labels.get(id)?.trim() || "Без названия",
      childCount: children.length,
      depth: 0,
    });
    if (!expandedIds.has(id)) continue;
    for (const record of children) {
      rows.push({ kind: "record", record, groupId: id, depth: 1 });
    }
  }
  return rows;
}

export function getEntityTableParentFieldOptions(entity: Entity) {
  return getEntityTableParentFieldCandidates(entity).map((field) => ({
    value: field.id,
    label: getEntityFieldDisplayName(field),
  }));
}

/** Child entity linked from a host entity tab — can nest under each host row. */
export type EntityTableNestedTarget = {
  entityId: string;
  entity: Entity;
  /** Relation field on the child that points at the host record. */
  parentLinkFieldId: string;
  label: string;
};

/** Entity tabs on `host` that link a child entity with a parent relation field. */
export function getEntityTableNestedTargets(
  host: Entity,
  entities: readonly Entity[],
): EntityTableNestedTarget[] {
  const byId = new Map(entities.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: EntityTableNestedTarget[] = [];

  function push(tab: EntityTab, nested: Entity, linkFieldId: string) {
    if (seen.has(nested.id)) return;
    const linkField = nested.fields.find((field) => field.id === linkFieldId);
    if (!linkField) return;
    if (linkField.type !== "relation" && linkField.type !== "belonging") {
      return;
    }
    const targetId = getEntityRelationTargetId(linkField);
    if (targetId !== host.id) return;
    seen.add(nested.id);
    result.push({
      entityId: nested.id,
      entity: nested,
      parentLinkFieldId: linkFieldId,
      label:
        tab.name.trim() ||
        nested.namePlural.trim() ||
        nested.name.trim() ||
        "Сущность",
    });
  }

  for (const tab of host.tabs) {
    if (!isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) continue;
    const nested = byId.get(tab.linkedEntityId);
    if (!nested) continue;
    const linkFieldId = tab.parentLinkFieldId?.trim();
    if (linkFieldId) {
      push(tab, nested, linkFieldId);
      continue;
    }
    const inferred = nested.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        getEntityRelationTargetId(field) === host.id,
    );
    if (inferred) push(tab, nested, inferred.id);
  }

  return result;
}

export function resolveEntityTableNestedTarget(
  host: Entity,
  entities: readonly Entity[],
): EntityTableNestedTarget | null {
  const id = host.tableNestedEntityId?.trim() ?? "";
  if (!id) return null;
  return (
    getEntityTableNestedTargets(host, entities).find(
      (item) => item.entityId === id,
    ) ?? null
  );
}

export type EntityTableNestedHierarchyGroupRow = {
  kind: "group";
  id: string;
  label: string;
  childCount: number;
  parentRecord: EntityRecord;
  depth: 0;
};

export type EntityTableNestedHierarchyChildRow = {
  kind: "nested";
  record: EntityRecord;
  groupId: string;
  depth: 1;
};

export type EntityTableNestedHierarchyRow =
  EntityTableNestedHierarchyGroupRow | EntityTableNestedHierarchyChildRow;

/**
 * Each host record is a group; expanded groups list child-entity records
 * linked to that host via `parentLinkFieldId`.
 */
export function flattenEntityTableNestedRows(
  parentRecords: readonly EntityRecord[],
  nested: EntityTableNestedTarget,
  expandedIds: ReadonlySet<string>,
  getParentLabel: (record: EntityRecord) => string,
): EntityTableNestedHierarchyRow[] {
  const rows: EntityTableNestedHierarchyRow[] = [];
  for (const parent of parentRecords) {
    const children = nested.entity.records.filter((record) =>
      entityRelationIncludesId(
        record.values[nested.parentLinkFieldId],
        parent.id,
      ),
    );
    rows.push({
      kind: "group",
      id: parent.id,
      label: getParentLabel(parent).trim() || "Без названия",
      childCount: children.length,
      parentRecord: parent,
      depth: 0,
    });
    if (!expandedIds.has(parent.id)) continue;
    for (const child of children) {
      rows.push({
        kind: "nested",
        record: child,
        groupId: parent.id,
        depth: 1,
      });
    }
  }
  return rows;
}

export function getEntityTableNestedEntityOptions(
  host: Entity,
  entities: readonly Entity[],
) {
  return getEntityTableNestedTargets(host, entities).map((item) => ({
    value: item.entityId,
    label: item.label,
  }));
}
