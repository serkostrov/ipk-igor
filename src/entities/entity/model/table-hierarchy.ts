import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  parseEntityListValueIds,
  parseEntityRelationIds,
} from "./field";
import {
  getRelationRecordOptions,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "./types";

/** Empty value — records without a selected option / relation. */
export const ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID = "";

/** Fields with selectable variants that can group the table into a tree. */
export function isEntityTableParentField(field: EntityField): boolean {
  if (field.type === "list") return !field.listMultiple;
  if (field.type === "relation") return !field.relationMultiple;
  if (field.type === "belonging") return true;
  return false;
}

/** List / relation fields (single choice) for table hierarchy. */
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

/** Option / related-record id stored in the hierarchy field. */
export function parseEntityTableParentId(value: string | undefined): string {
  return (
    parseEntityListValueIds(value)[0]?.trim() ||
    parseEntityRelationIds(value)[0]?.trim() ||
    ""
  );
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
  return new Map();
}

/**
 * Flat group → records rows for a hierarchy table.
 * Groups follow option / related-record order; empty value is last when present.
 *
 * When the parent field points at records of this same table (belonging /
 * self-relation), a parent is already the group header — do not also list it
 * under «Без значения».
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
    const groupId = parseEntityTableParentId(record.values[parentField.id]);
    const list = byGroup.get(groupId) ?? [];
    list.push(record);
    byGroup.set(groupId, list);
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
