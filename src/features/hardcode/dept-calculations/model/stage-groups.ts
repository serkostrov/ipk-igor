/**
 * Stage → department-calculation records for the hardcoded view.
 */

import {
  collectTkpStageDepartmentPairs,
  findDeptCalculationsGroupsField,
  findEntityManagerUserField,
  findTkpGipUserField,
  findTkpLeadRelationField,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityRecordTitle,
  getEntityRelationTargetId,
  getRecordFieldIds,
  getSystemUserName,
  isEntityTableRelationGroupsNestedSubgroup,
  isGipDepartmentRecord,
  isTkpAnalysisEntity,
  parseEntityRelationIds,
  parseEntityTableParentGroupIds,
  parseEntityTableRelationGroupsNestedIds,
  resolveDepartmentEntity,
  resolveEntityListFieldOptions,
  resolveEntityTableHierarchyGroupRecord,
  resolveEntityTableParentField,
  resolveEntityTableSubgroupField,
  resolveRelationRecordLabel,
  resolveTkpGipUserIdsFromHost,
  SYSTEM_USERS_ENTITY_ID,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { findDeptCalculationUserFields } from "../../tkp-gip/match";

function normalizeFieldName(field: EntityField): string {
  return getEntityFieldDisplayName(field)
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");
}

function looksLikeManagerField(field: EntityField): boolean {
  const name = normalizeFieldName(field);
  return (
    name.includes("руководитель") ||
    name.includes("менеджер") ||
    name.includes("начальник") ||
    name.includes("ответственный")
  );
}

function isPeopleRelationField(field: EntityField): boolean {
  if (
    field.type !== "relation" &&
    field.type !== "belonging" &&
    field.type !== "lookup"
  ) {
    return false;
  }
  return true;
}

function departmentLeafDisplayFieldIds(entity: Entity): string[] {
  const groupsField = findDeptCalculationsGroupsField(entity);
  const levels = groupsField?.relationGroups?.levels ?? [];
  if (levels.length < 2) return [];
  return [...(levels[1]?.displayFieldIds ?? [])];
}

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
  // Fan-out rows: one stage×department in «Стадия/отделы» — catalog name first
  // (calc-row title is often the manager FIO and must not land in «Отдел»).
  const paired = resolveDeptCalcDepartmentRecord(entity, record, entities);
  if (paired) {
    const label = resolveRelationRecordLabel(
      paired.entity,
      paired.record.id,
      entities,
    )?.trim();
    if (label && label !== "Без названия") return label;
  }

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

function hostCanResolveGip(host: Entity, entities: readonly Entity[]): boolean {
  return (
    isTkpAnalysisEntity(host) ||
    Boolean(findTkpGipUserField(host, entities)) ||
    findTkpLeadRelationField(host, entities) != null
  );
}

function resolveLeadParentForDeptCalc(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): { entity: Entity; record: EntityRecord } | null {
  for (const field of entity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target || !hostCanResolveGip(target, entities)) continue;
    const parentId = parseEntityRelationIds(record.values[field.id])[0];
    if (!parentId) continue;
    const parentRecord = target.records.find((item) => item.id === parentId);
    if (!parentRecord) continue;
    return { entity: target, record: parentRecord };
  }
  return null;
}

function namesFromUserIds(
  entities: readonly Entity[],
  userIds: readonly string[],
): string | null {
  const names = userIds
    .map((id) => getSystemUserName(entities, id)?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * «Руководитель» on a department catalog entity.
 * Prefer configured chip extras (displayFieldIds), then a field literally
 * named «Руководитель» (any people target), then users-manager, then soft name
 * matches. Never prefer an empty «Менеджер» users field over a filled
 * «Руководитель» on a custom people catalog.
 */
function findDepartmentManagerField(
  departmentEntity: Entity,
  preferredFieldIds: readonly string[] = [],
): EntityField | null {
  const byId = (id: string) =>
    departmentEntity.fields.find((field) => field.id === id) ?? null;

  let preferredPeople: EntityField | null = null;
  for (const fieldId of preferredFieldIds) {
    const field = byId(fieldId);
    if (!field || !isPeopleRelationField(field)) continue;
    if (looksLikeManagerField(field)) return field;
    preferredPeople ??= field;
  }
  if (preferredPeople) return preferredPeople;

  let namedRukovoditel: EntityField | null = null;
  let softMatch: EntityField | null = null;
  for (const field of departmentEntity.fields) {
    if (!looksLikeManagerField(field)) continue;
    const isPeople = isPeopleRelationField(field) || field.type === "text";
    if (!isPeople) continue;
    const name = normalizeFieldName(field);
    if (name === "руководитель" || name.startsWith("руководитель ")) {
      // Prefer users-target when several «Руководитель» exist.
      if (getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID) {
        return field;
      }
      namedRukovoditel ??= field;
      continue;
    }
    softMatch ??= field;
  }
  if (namedRukovoditel) return namedRukovoditel;

  const users = findEntityManagerUserField(departmentEntity);
  if (users) return users;
  return softMatch;
}

function formatDepartmentManagerName(
  ctx: EntityValueContext,
  departmentEntity: Entity,
  deptRecord: EntityRecord,
  deptManager: EntityField,
  entities: readonly Entity[],
): string | null {
  // Primary: same formatter as relationGroups chip extras.
  const formatted = formatRecordFieldValue(
    ctx,
    departmentEntity,
    deptRecord,
    deptManager,
  ).trim();
  if (formatted && formatted !== "—") return formatted;

  if (deptManager.type === "text") {
    const raw = (deptRecord.values[deptManager.id] ?? "").trim();
    return raw || null;
  }

  const ids = getRecordFieldIds(ctx, departmentEntity, deptRecord, deptManager);
  const fromUsers = namesFromUserIds(entities, ids);
  if (fromUsers) return fromUsers;

  if (ids.length === 0) {
    const parsed = parseEntityRelationIds(deptRecord.values[deptManager.id]);
    const fromParsed = namesFromUserIds(entities, parsed);
    if (fromParsed) return fromParsed;
  }

  const targetId = getEntityRelationTargetId(deptManager);
  const target = targetId
    ? (entities.find((item) => item.id === targetId) ?? null)
    : null;
  const label = resolveRelationRecordLabel(
    target,
    ids[0] ?? deptRecord.values[deptManager.id],
    entities,
  )?.trim();
  return label && label !== "Без названия" ? label : null;
}

function resolveLeadHostForDeptCalc(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  leadParent?: { entity: Entity; record: EntityRecord } | null,
): { entity: Entity; record: EntityRecord } | null {
  const preferred =
    leadParent && hostCanResolveGip(leadParent.entity, entities)
      ? leadParent
      : resolveLeadParentForDeptCalc(entity, record, entities);
  if (!preferred) return null;
  // Prefer filled live lead values (draft empties must not wipe «ГИП»).
  const live =
    preferred.entity.records.find((item) => item.id === preferred.record.id) ??
    null;
  if (!live) return preferred;
  const values: Record<string, string> = { ...live.values };
  for (const [key, value] of Object.entries(preferred.record.values)) {
    if (value == null || !String(value).trim()) continue;
    values[key] = value;
  }
  return { entity: preferred.entity, record: { ...live, values } };
}

function resolveDeptCalcDepartmentRecord(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): { entity: Entity; record: EntityRecord } | null {
  const departmentEntity = resolveDepartmentEntity(entity, entities);
  const groupsField = findDeptCalculationsGroupsField(entity);
  if (departmentEntity && groupsField) {
    // Fan-out rows are one stage×department; «ГИП» may also sit as a sibling
    // under the stage — prefer the non-ГИП department for that row.
    let gipFallback: { entity: Entity; record: EntityRecord } | null = null;
    for (const pair of collectTkpStageDepartmentPairs(
      record.values[groupsField.id],
    )) {
      if (!pair.departmentId.trim()) continue;
      const deptRecord = departmentEntity.records.find(
        (item) => item.id === pair.departmentId,
      );
      if (!deptRecord) continue;
      const hit = { entity: departmentEntity, record: deptRecord };
      if (isGipDepartmentRecord(departmentEntity, deptRecord, entities)) {
        gipFallback ??= hit;
        continue;
      }
      return hit;
    }
    if (gipFallback) return gipFallback;
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
  return resolveEntityTableHierarchyGroupRecord(
    subgroupField,
    valueId,
    entities,
    depth,
  );
}

function isDeptCalcGipRow(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): boolean {
  // Primary department of the row (not «any leaf includes ГИП»).
  const resolved = resolveDeptCalcDepartmentRecord(entity, record, entities);
  return resolved
    ? isGipDepartmentRecord(resolved.entity, resolved.record, entities)
    : false;
}

function resolveGipManagerNameFromLead(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  leadParent?: { entity: Entity; record: EntityRecord } | null,
): string | null {
  if (!isDeptCalcGipRow(entity, record, entities)) return null;
  const lead = resolveLeadHostForDeptCalc(entity, record, entities, leadParent);
  if (!lead) return null;
  return namesFromUserIds(
    entities,
    resolveTkpGipUserIdsFromHost({
      hostEntity: lead.entity,
      hostValues: lead.record.values,
      entities,
    }),
  );
}

/**
 * Catalog «Руководитель» for a non-ГИП department row.
 * «ГИП» never falls back to the catalog head — lead only.
 */
function resolveManagerNameFromDepartment(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): string | null {
  const resolved = resolveDeptCalcDepartmentRecord(entity, record, entities);
  if (!resolved) return null;
  if (isGipDepartmentRecord(resolved.entity, resolved.record, entities)) {
    return null;
  }
  const deptManager = findDepartmentManagerField(
    resolved.entity,
    departmentLeafDisplayFieldIds(entity),
  );
  if (!deptManager) return null;
  return formatDepartmentManagerName(
    ctx,
    resolved.entity,
    resolved.record,
    deptManager,
    entities,
  );
}

/**
 * Display «Руководитель» for a department-calculation row:
 * - ГИП → strictly lead / ТКП «ГИП» (never catalog head / stale row field);
 * - other departments → catalog «Руководитель» (via «Стадия/отделы» / hierarchy);
 * - only then the row’s own manager field / lookup.
 */
export function resolveDeptCalculationManagerName(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  leadParent?: { entity: Entity; record: EntityRecord } | null,
): string | null {
  const fromLead = resolveGipManagerNameFromLead(
    entity,
    record,
    entities,
    leadParent,
  );
  if (fromLead) return fromLead;

  const fromDepartment = resolveManagerNameFromDepartment(
    ctx,
    entity,
    record,
    entities,
  );
  if (fromDepartment) return fromDepartment;

  // Stale / default row field — only when catalog/lead could not resolve.
  if (!isDeptCalcGipRow(entity, record, entities)) {
    const { manager } = findDeptCalculationUserFields(entity);
    if (manager) {
      const label = formatRecordFieldValue(ctx, entity, record, manager).trim();
      if (label && label !== "—") return label;
      const fromUsers = namesFromUserIds(
        entities,
        getRecordFieldIds(ctx, entity, record, manager),
      );
      if (fromUsers) return fromUsers;
    }

    const managerLookup = entity.fields.find(
      (field) => field.type === "lookup" && looksLikeManagerField(field),
    );
    if (managerLookup) {
      const label = formatRecordFieldValue(
        ctx,
        entity,
        record,
        managerLookup,
      ).trim();
      if (label && label !== "—") return label;
    }
  }

  return null;
}
