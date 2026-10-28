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
import { SYSTEM_USERS_ENTITY_ID } from "./system-entities";
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

/**
 * Same `relationGroups` field as parent → subgroup by nested level
 * («Вложенные») under each root group.
 */
export function isEntityTableRelationGroupsNestedSubgroup(
  parentField: EntityField | null | undefined,
  subgroupField: EntityField | null | undefined,
): boolean {
  if (!parentField || !subgroupField) return false;
  if (parentField.id !== subgroupField.id) return false;
  return (
    parentField.type === "relationGroups" &&
    isEntityRelationGroupsConfigReady(parentField.relationGroups)
  );
}

/** Resolved subgroup field inside each parent group, if valid. */
export function resolveEntityTableSubgroupField(
  entity: Entity,
): EntityField | null {
  const parentId = entity.tableParentFieldId?.trim() ?? "";
  const id = entity.tableSubgroupFieldId?.trim() ?? "";
  if (!parentId || !id) return null;
  const parentField =
    getEntityTableParentFieldCandidates(entity).find(
      (field) => field.id === parentId,
    ) ?? null;
  if (!parentField) return null;
  if (id === parentId) {
    return isEntityTableRelationGroupsNestedSubgroup(parentField, parentField)
      ? parentField
      : null;
  }
  return (
    getEntityTableParentFieldCandidates(entity).find(
      (field) => field.id === id,
    ) ?? null
  );
}

/** Separator for composite subgroup row ids (`parentId` + sep + `subgroupId`). */
const ENTITY_TABLE_SUBGROUP_ROW_SEP = "\u0001";

export function encodeEntityTableSubgroupRowId(
  parentGroupId: string,
  subgroupValueId: string,
): string {
  return `${parentGroupId}${ENTITY_TABLE_SUBGROUP_ROW_SEP}${subgroupValueId}`;
}

export function parseEntityTableSubgroupRowId(
  rowId: string,
): { parentGroupId: string; subgroupValueId: string } | null {
  const index = rowId.indexOf(ENTITY_TABLE_SUBGROUP_ROW_SEP);
  if (index < 0) return null;
  return {
    parentGroupId: rowId.slice(0, index),
    subgroupValueId: rowId.slice(index + ENTITY_TABLE_SUBGROUP_ROW_SEP.length),
  };
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

/**
 * Value to prefill when creating a record under a hierarchy group.
 * For `relationGroups`, optional `nestedGroupId` fills the nested level
 * under the root (`groupId`).
 */
export function encodeEntityTableParentValue(
  field: EntityField,
  groupId: string,
  nestedGroupId?: string | null,
): string {
  const id = groupId.trim();
  if (!id) return "";
  if (field.type === "relationGroups") {
    const nestedId = nestedGroupId?.trim() || "";
    return serializeEntityRelationGroups([
      {
        id,
        children: nestedId ? [{ id: nestedId, children: [] }] : [],
      },
    ]);
  }
  return id;
}

function resolveRelationGroupsFieldTarget(
  entities: readonly Entity[],
): (entityId: string, fieldId: string) => string | null {
  return (entityId, fieldId) => {
    const entity = entities.find((item) => item.id === entityId);
    const bridge = entity?.fields.find((item) => item.id === fieldId);
    return bridge ? getEntityRelationTargetId(bridge) : null;
  };
}

function resolveRelationGroupsEntityAtDepth(
  field: EntityField,
  entities: readonly Entity[],
  depth: number,
): Entity | null {
  const levels = field.relationGroups?.levels;
  if (!levels || depth < 0 || depth >= levels.length) return null;
  const resolveFieldTarget = resolveRelationGroupsFieldTarget(entities);
  let previous: string | null = null;
  let entityId: string | null = null;
  for (let i = 0; i <= depth; i += 1) {
    const level = levels[i];
    if (!level) return null;
    entityId = getRelationGroupsLevelEntityId(
      level,
      previous,
      resolveFieldTarget,
    );
    if (!entityId) return null;
    previous = entityId;
  }
  return entityId
    ? (entities.find((item) => item.id === entityId) ?? null)
    : null;
}

/**
 * Nested ids under a specific root in a relationGroups value.
 * Empty children → one empty subgroup (same as missing list value).
 */
export function parseEntityTableRelationGroupsNestedIds(
  value: string | undefined,
  rootGroupId: string,
): string[] {
  const rootId = rootGroupId.trim();
  if (!rootId || rootId === ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID) {
    return [ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID];
  }
  const root = parseEntityRelationGroups(value).find(
    (node) => node.id === rootId,
  );
  const nested = (root?.children ?? [])
    .map((child) => child.id.trim())
    .filter((id) => id.length > 0);
  return nested.length > 0 ? nested : [ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID];
}

function relationTargetLabels(target: Entity | null): Map<string, string> {
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
  /** 0 — root group; 1 — subgroup inside a root group. */
  depth: 0 | 1;
  /** For subgroups: id of the root group. */
  parentGroupId?: string;
  /**
   * Raw option / relation id for this row (without parent prefix).
   * Equals `id` for root groups; for subgroups — the subgroup value only.
   */
  valueId: string;
};

export type EntityTableHierarchyRecordRow = {
  kind: "record";
  record: EntityRecord;
  /** Immediate parent group/subgroup row id (for expand / tree guides). */
  groupId: string;
  /** Root group id (for pagination when subgroups are used). */
  rootGroupId: string;
  /** 1 — under a root group; 2 — under a subgroup. */
  depth: 1 | 2;
};

export type EntityTableHierarchyRow =
  EntityTableHierarchyGroupRow | EntityTableHierarchyRecordRow;

function resolveHierarchyGroupLabels(
  parentField: EntityField,
  entities: readonly Entity[],
  /** For `relationGroups`: 0 = roots («Строки»), 1 = nested («Вложенные»). */
  relationGroupsDepth: 0 | 1 = 0,
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
      resolveRelationGroupsEntityAtDepth(
        parentField,
        entities,
        relationGroupsDepth,
      ),
    );
  }
  return new Map();
}

function orderHierarchyGroupIds(
  byGroup: Map<string, EntityRecord[]>,
  labels: Map<string, string>,
): string[] {
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
  return orderedIds;
}

function groupRecordsByHierarchyField(
  records: readonly EntityRecord[],
  field: EntityField,
): Map<string, EntityRecord[]> {
  const byGroup = new Map<string, EntityRecord[]>();
  for (const record of records) {
    const groupIds = parseEntityTableParentGroupIds(
      field,
      record.values[field.id],
    );
    for (const groupId of groupIds) {
      const list = byGroup.get(groupId) ?? [];
      list.push(record);
      byGroup.set(groupId, list);
    }
  }
  return byGroup;
}

/** Group records already under a root by nested relationGroups children. */
function groupRecordsByRelationGroupsNested(
  records: readonly EntityRecord[],
  field: EntityField,
  rootGroupId: string,
): Map<string, EntityRecord[]> {
  const byGroup = new Map<string, EntityRecord[]>();
  for (const record of records) {
    const groupIds = parseEntityTableRelationGroupsNestedIds(
      record.values[field.id],
      rootGroupId,
    );
    for (const groupId of groupIds) {
      const list = byGroup.get(groupId) ?? [];
      list.push(record);
      byGroup.set(groupId, list);
    }
  }
  return byGroup;
}

/**
 * When the parent field points at records of this same table (belonging /
 * self-relation), a parent is already the group header — do not also list it
 * under «Без значения».
 */
function omitSelfParentsFromEmptyGroup(
  byGroup: Map<string, EntityRecord[]>,
  records: readonly EntityRecord[],
) {
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
  if (usedAsParent.size === 0) return;
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

function hierarchyGroupLabel(id: string, labels: Map<string, string>): string {
  return id === ENTITY_TABLE_HIERARCHY_EMPTY_GROUP_ID
    ? "Без значения"
    : labels.get(id)?.trim() || "Без названия";
}

/**
 * Flat group → [subgroup →] records rows for a hierarchy table.
 * Groups follow option / related-record order; empty value is last when present.
 *
 * When the parent field points at records of this same table (belonging /
 * self-relation), a parent is already the group header — do not also list it
 * under «Без значения».
 *
 * For `relationGroups`, a record with several roots appears under each root.
 * With `subgroupField`, each root expands into subgroup headers, then records.
 */
export function flattenEntityTableHierarchyRows(
  records: readonly EntityRecord[],
  parentField: EntityField,
  expandedIds: ReadonlySet<string>,
  entities: readonly Entity[] = [],
  subgroupField: EntityField | null = null,
): EntityTableHierarchyRow[] {
  const labels = resolveHierarchyGroupLabels(parentField, entities);
  const byGroup = groupRecordsByHierarchyField(records, parentField);
  omitSelfParentsFromEmptyGroup(byGroup, records);

  const nestedSubgroup = isEntityTableRelationGroupsNestedSubgroup(
    parentField,
    subgroupField,
  );
  const subgroupLabels = subgroupField
    ? resolveHierarchyGroupLabels(
        subgroupField,
        entities,
        nestedSubgroup ? 1 : 0,
      )
    : null;

  const rows: EntityTableHierarchyRow[] = [];
  for (const id of orderHierarchyGroupIds(byGroup, labels)) {
    const children = byGroup.get(id) ?? [];
    if (children.length === 0) continue;
    rows.push({
      kind: "group",
      id,
      label: hierarchyGroupLabel(id, labels),
      childCount: children.length,
      depth: 0,
      valueId: id,
    });
    if (!expandedIds.has(id)) continue;

    if (!subgroupField || !subgroupLabels) {
      for (const record of children) {
        rows.push({
          kind: "record",
          record,
          groupId: id,
          rootGroupId: id,
          depth: 1,
        });
      }
      continue;
    }

    const bySubgroup = nestedSubgroup
      ? groupRecordsByRelationGroupsNested(children, subgroupField, id)
      : groupRecordsByHierarchyField(children, subgroupField);
    for (const subValueId of orderHierarchyGroupIds(
      bySubgroup,
      subgroupLabels,
    )) {
      const subChildren = bySubgroup.get(subValueId) ?? [];
      if (subChildren.length === 0) continue;
      const subgroupRowId = encodeEntityTableSubgroupRowId(id, subValueId);
      rows.push({
        kind: "group",
        id: subgroupRowId,
        label: hierarchyGroupLabel(subValueId, subgroupLabels),
        childCount: subChildren.length,
        depth: 1,
        parentGroupId: id,
        valueId: subValueId,
      });
      if (!expandedIds.has(subgroupRowId)) continue;
      for (const record of subChildren) {
        rows.push({
          kind: "record",
          record,
          groupId: subgroupRowId,
          rootGroupId: id,
          depth: 2,
        });
      }
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

/**
 * Subgroup options: other grouping fields, plus nested level of the parent
 * when it is a ready `relationGroups` field («Вложенные»).
 */
export function getEntityTableSubgroupFieldOptions(
  entity: Entity,
  parentFieldId: string | null = entity.tableParentFieldId,
) {
  const exclude = parentFieldId?.trim() || null;
  const parentField = exclude
    ? (getEntityTableParentFieldCandidates(entity).find(
        (field) => field.id === exclude,
      ) ?? null)
    : null;
  const options = getEntityTableParentFieldCandidates(entity)
    .filter((field) => field.id !== exclude)
    .map((field) => ({
      value: field.id,
      label: getEntityFieldDisplayName(field),
    }));
  if (
    parentField &&
    isEntityTableRelationGroupsNestedSubgroup(parentField, parentField)
  ) {
    options.unshift({
      value: parentField.id,
      label: `Вложенные · ${getEntityFieldDisplayName(parentField)}`,
    });
  }
  return options;
}

/** Keep subgroup id after parent change when it is still a valid option. */
export function retainEntityTableSubgroupFieldId(
  entity: Entity,
  nextParentFieldId: string | null,
  currentSubgroupFieldId: string | null,
): string | null {
  if (!nextParentFieldId?.trim() || !currentSubgroupFieldId?.trim()) {
    return null;
  }
  return getEntityTableSubgroupFieldOptions(entity, nextParentFieldId).some(
    (option) => option.value === currentSubgroupFieldId,
  )
    ? currentSubgroupFieldId
    : null;
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

/** Users-relation «Руководитель» (or similar) on an entity. */
export function findEntityManagerUserField(entity: Entity): EntityField | null {
  const keys = ["руководитель", "менеджер"];
  let fallback: EntityField | null = null;
  for (const field of entity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    if (getEntityRelationTargetId(field) !== SYSTEM_USERS_ENTITY_ID) continue;
    const name = getEntityFieldDisplayName(field)
      .trim()
      .toLocaleLowerCase("ru");
    if (name.includes("руководитель")) return field;
    if (!fallback && keys.some((key) => name.includes(key))) fallback = field;
  }
  return fallback;
}

/**
 * Related record for a hierarchy group/subgroup row when the grouping field
 * is a relation / belonging / relationGroups hop.
 */
export function resolveEntityTableHierarchyGroupRecord(
  field: EntityField | null | undefined,
  valueId: string,
  entities: readonly Entity[],
  relationGroupsDepth: 0 | 1 = 0,
): { entity: Entity; record: EntityRecord } | null {
  if (!field || !valueId) return null;
  let target: Entity | null = null;
  if (field.type === "relation" || field.type === "belonging") {
    const targetId = getEntityRelationTargetId(field);
    target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
  } else if (field.type === "relationGroups") {
    target = resolveRelationGroupsEntityAtDepth(
      field,
      entities,
      relationGroupsDepth,
    );
  }
  if (!target) return null;
  const record = target.records.find((item) => item.id === valueId);
  if (!record) return null;
  return { entity: target, record };
}

/** Count nested-tab children under host records (подзадачи), if configured. */
export function countEntityTableNestedChildren(
  hostRecords: readonly EntityRecord[],
  nested: EntityTableNestedTarget | null,
): number {
  if (!nested || hostRecords.length === 0) return 0;
  let count = 0;
  for (const host of hostRecords) {
    for (const child of nested.entity.records) {
      if (
        entityRelationIncludesId(
          child.values[nested.parentLinkFieldId],
          host.id,
        )
      ) {
        count += 1;
      }
    }
  }
  return count;
}
