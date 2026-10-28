/**
 * Stage → department-calculation records for the hardcoded view.
 */

import {
  findEntityManagerUserField,
  getEntityRecordTitle,
  getEntityRelationTargetId,
  getSystemUserName,
  isEntityTableRelationGroupsNestedSubgroup,
  parseEntityRelationIds,
  parseEntityTableParentGroupIds,
  parseEntityTableRelationGroupsNestedIds,
  resolveEntityListFieldOptions,
  resolveEntityTableHierarchyGroupRecord,
  resolveEntityTableParentField,
  resolveEntityTableSubgroupField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { findDeptCalculationUserFields } from "../../tkp-gip/match";

export type DeptCalculationsStageGroup = {
  id: string;
  label: string;
  records: EntityRecord[];
};

function listOrRelationLabels(
  field: EntityField,
  entities: readonly Entity[],
): Map<string, string> {
  if (field.type === "list") {
    return new Map(
      resolveEntityListFieldOptions(field, entities).map((option) => [
        option.id,
        option.name,
      ]),
    );
  }
  if (field.type === "relation" || field.type === "belonging") {
    const targetId = getEntityRelationTargetId(field);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    const labels = new Map<string, string>();
    if (!target) return labels;
    for (const record of target.records) {
      labels.set(
        record.id,
        resolveRelationRecordLabel(target, record.id, entities) ??
          "Без названия",
      );
    }
    return labels;
  }
  return new Map();
}

function relationGroupsLabels(
  field: EntityField,
  entities: readonly Entity[],
  depth: 0 | 1,
  valueIds: Iterable<string>,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const valueId of valueIds) {
    if (!valueId || labels.has(valueId)) continue;
    const resolved = resolveEntityTableHierarchyGroupRecord(
      field,
      valueId,
      entities,
      depth,
    );
    if (!resolved) continue;
    labels.set(
      valueId,
      resolveRelationRecordLabel(
        resolved.entity,
        resolved.record.id,
        entities,
      ) ?? "Без названия",
    );
  }
  return labels;
}

export function buildDeptCalculationStageGroups(
  entity: Entity,
  records: readonly EntityRecord[],
  entities: readonly Entity[],
): DeptCalculationsStageGroup[] {
  const parentField = resolveEntityTableParentField(entity);
  if (!parentField) {
    return [{ id: "", label: "Без группы", records: [...records] }];
  }

  const byStage = new Map<string, EntityRecord[]>();
  for (const record of records) {
    const ids = parseEntityTableParentGroupIds(
      parentField,
      record.values[parentField.id],
    );
    const groupIds = ids.length > 0 ? ids : [""];
    for (const id of groupIds) {
      const list = byStage.get(id) ?? [];
      list.push(record);
      byStage.set(id, list);
    }
  }

  const labels =
    parentField.type === "relationGroups"
      ? relationGroupsLabels(parentField, entities, 0, byStage.keys())
      : listOrRelationLabels(parentField, entities);

  const ordered: DeptCalculationsStageGroup[] = [];
  for (const id of labels.keys()) {
    const list = byStage.get(id);
    if (!list?.length) continue;
    ordered.push({
      id,
      label: labels.get(id)?.trim() || "Без названия",
      records: list,
    });
    byStage.delete(id);
  }
  for (const [id, list] of byStage) {
    if (list.length === 0) continue;
    ordered.push({
      id,
      label:
        id === "" ? "Без значения" : labels.get(id)?.trim() || "Без названия",
      records: list,
    });
  }
  return ordered;
}

export function resolveDeptCalculationDepartmentLabel(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): string {
  const parentField = resolveEntityTableParentField(entity);
  const subgroupField = resolveEntityTableSubgroupField(entity);
  if (parentField && subgroupField) {
    const nested = isEntityTableRelationGroupsNestedSubgroup(
      parentField,
      subgroupField,
    );
    if (nested) {
      const parentIds = parseEntityTableParentGroupIds(
        parentField,
        record.values[parentField.id],
      );
      for (const parentId of parentIds) {
        const nestedIds = parseEntityTableRelationGroupsNestedIds(
          record.values[subgroupField.id],
          parentId,
        );
        const valueId = nestedIds[0];
        if (!valueId) continue;
        const resolved = resolveEntityTableHierarchyGroupRecord(
          subgroupField,
          valueId,
          entities,
          1,
        );
        if (resolved) {
          return (
            resolveRelationRecordLabel(
              resolved.entity,
              resolved.record.id,
              entities,
            )?.trim() || "Без названия"
          );
        }
      }
    } else {
      const ids = parseEntityTableParentGroupIds(
        subgroupField,
        record.values[subgroupField.id],
      );
      const valueId = ids[0];
      if (valueId) {
        if (
          subgroupField.type === "relation" ||
          subgroupField.type === "belonging" ||
          subgroupField.type === "relationGroups"
        ) {
          const resolved = resolveEntityTableHierarchyGroupRecord(
            subgroupField,
            valueId,
            entities,
            0,
          );
          if (resolved) {
            return (
              resolveRelationRecordLabel(
                resolved.entity,
                resolved.record.id,
                entities,
              )?.trim() || "Без названия"
            );
          }
        }
        if (subgroupField.type === "list") {
          const option = resolveEntityListFieldOptions(
            subgroupField,
            entities,
          ).find((item) => item.id === valueId);
          if (option?.name.trim()) return option.name.trim();
        }
      }
    }
  }

  return getEntityRecordTitle(ctx, entity, record);
}

/**
 * Manager: field on the calculation record, else «Руководитель» on the
 * department entity linked as subgroup.
 */
export function resolveDeptCalculationManagerName(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): string | null {
  const { manager } = findDeptCalculationUserFields(entity);
  if (manager) {
    const userId = parseEntityRelationIds(record.values[manager.id])[0];
    if (userId) {
      const name = getSystemUserName(entities, userId)?.trim();
      if (name) return name;
    }
  }

  const parentField = resolveEntityTableParentField(entity);
  const subgroupField = resolveEntityTableSubgroupField(entity);
  if (!parentField || !subgroupField) return null;

  const nested = isEntityTableRelationGroupsNestedSubgroup(
    parentField,
    subgroupField,
  );
  let valueId: string | null = null;
  let depth: 0 | 1 = 0;
  if (nested) {
    depth = 1;
    const parentIds = parseEntityTableParentGroupIds(
      parentField,
      record.values[parentField.id],
    );
    for (const parentId of parentIds) {
      const nestedIds = parseEntityTableRelationGroupsNestedIds(
        record.values[subgroupField.id],
        parentId,
      );
      if (nestedIds[0]) {
        valueId = nestedIds[0];
        break;
      }
    }
  } else {
    valueId =
      parseEntityTableParentGroupIds(
        subgroupField,
        record.values[subgroupField.id],
      )[0] ?? null;
  }
  if (!valueId) return null;

  const resolved = resolveEntityTableHierarchyGroupRecord(
    subgroupField,
    valueId,
    entities,
    depth,
  );
  if (!resolved) return null;
  const deptManager = findEntityManagerUserField(resolved.entity);
  if (!deptManager) return null;
  const userId = parseEntityRelationIds(
    resolved.record.values[deptManager.id],
  )[0];
  if (!userId) return null;
  return getSystemUserName(entities, userId)?.trim() || null;
}
