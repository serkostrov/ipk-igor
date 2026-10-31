/**
 * Persist «Расчёты отделов» related-ask updates as one record per
 * stage×department pair (view / costs are per department row).
 */

import {
  addEntityRecord,
  applyTkpGipDepartmentUsers,
  collectDeptCalculationRecordsForParent,
  collectDeptCalculationSiblingRecords,
  collectTkpStageDepartmentPairs,
  collectTkpStageRootIds,
  deptCalculationValuesMatchStagePair,
  encodeTkpStageDepartmentPair,
  ensureTkpGipDepartmentInGroupsValue,
  findDeptCalculationUserFields,
  findDeptCalculationsGroupsField,
  findEntityManagerUserField,
  findGipDepartmentRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  isDeptCalculationsEntity,
  isGipDepartmentRecord,
  isTkpAnalysisEntity,
  parseEntityRelationIds,
  removeEntityRecord,
  resolveDepartmentEntity,
  serializeEntityRelationIds,
  SYSTEM_USERS_ENTITY_ID,
  updateEntityRecord,
  waitForEntityRecordDelete,
  waitForEntityRecordInsert,
  withGipDepartmentPairs,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";

function parentLinkFields(entity: Entity): EntityField[] {
  const owned = getEntityParentLinkField(entity);
  const result: EntityField[] = [];
  const seen = new Set<string>();
  for (const field of entity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const isParent =
      field.id === owned?.id ||
      field.type === "belonging" ||
      (entity.parentEntityId != null && targetId === entity.parentEntityId);
    if (!isParent || seen.has(field.id)) continue;
    seen.add(field.id);
    result.push(field);
  }
  return result;
}

function sharesParentLink(
  left: Record<string, string | undefined>,
  right: Record<string, string | undefined>,
  linkFields: readonly EntityField[],
): boolean {
  if (linkFields.length === 0) return true;
  for (const field of linkFields) {
    const leftIds = parseEntityRelationIds(left[field.id]);
    const rightIds = parseEntityRelationIds(right[field.id]);
    if (leftIds.some((id) => rightIds.includes(id))) return true;
  }
  return false;
}

function findForwardChildField(
  parent: Entity,
  childEntityId: string,
): EntityField | null {
  return (
    parent.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "dependencies") &&
        getEntityRelationTargetId(field) === childEntityId,
    ) ?? null
  );
}

async function writeBackChildToParents(
  childEntityId: string,
  childRecordId: string,
  parentLinks: ReadonlyArray<{
    parentEntityId: string;
    parentRecordId: string;
  }>,
) {
  for (const link of parentLinks) {
    const parent =
      getEntityConfig().entities.find(
        (entity) => entity.id === link.parentEntityId,
      ) ?? null;
    if (!parent) continue;
    const field = findForwardChildField(parent, childEntityId);
    if (!field) continue;
    const parentRecord = parent.records.find(
      (record) => record.id === link.parentRecordId,
    );
    const existing = parseEntityRelationIds(
      parentRecord?.values[field.id] ?? "",
    );
    if (existing.includes(childRecordId)) continue;
    await updateEntityRecord(link.parentEntityId, link.parentRecordId, {
      [field.id]: serializeEntityRelationIds([...existing, childRecordId]),
    });
  }
}

/** Drop removed fan-out child ids from the parent forward relation. */
async function stripChildrenFromParents(
  childEntityId: string,
  childRecordIds: readonly string[],
  parentLinks: ReadonlyArray<{
    parentEntityId: string;
    parentRecordId: string;
  }>,
) {
  if (childRecordIds.length === 0 || parentLinks.length === 0) return;
  const removeSet = new Set(childRecordIds);
  for (const link of parentLinks) {
    const parent =
      getEntityConfig().entities.find(
        (entity) => entity.id === link.parentEntityId,
      ) ?? null;
    if (!parent) continue;
    const field = findForwardChildField(parent, childEntityId);
    if (!field) continue;
    const parentRecord = parent.records.find(
      (record) => record.id === link.parentRecordId,
    );
    if (!parentRecord) continue;
    const existing = parseEntityRelationIds(
      parentRecord.values[field.id] ?? "",
    );
    const next = existing.filter((id) => !removeSet.has(id));
    if (next.length === existing.length) continue;
    await updateEntityRecord(link.parentEntityId, link.parentRecordId, {
      [field.id]: serializeEntityRelationIds(next),
    });
  }
}

function collectParentLinksFromValues(
  linkFields: readonly EntityField[],
  values: Record<string, string | undefined>,
): Array<{ parentEntityId: string; parentRecordId: string }> {
  const links: Array<{ parentEntityId: string; parentRecordId: string }> = [];
  const seen = new Set<string>();
  for (const field of linkFields) {
    const parentEntityId = getEntityRelationTargetId(field);
    if (!parentEntityId) continue;
    for (const parentRecordId of parseEntityRelationIds(values[field.id])) {
      const key = `${parentEntityId}:${parentRecordId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ parentEntityId, parentRecordId });
    }
  }
  return links;
}

function findSiblingForPair(
  entity: Entity,
  sourceRecordId: string,
  sourceValues: Record<string, string | undefined>,
  groupsFieldId: string,
  pair: { stageId: string; departmentId: string },
  linkFields: readonly EntityField[],
  parent?: { entity: Entity; recordId: string } | null,
): EntityRecord | null {
  const match = (record: EntityRecord) =>
    record.id !== sourceRecordId &&
    deptCalculationValuesMatchStagePair(record.values[groupsFieldId], pair);

  // Sibling collector covers rows linked only via the parent forward relation.
  for (const record of collectDeptCalculationSiblingRecords(
    entity,
    [sourceRecordId],
    parent,
  )) {
    if (match(record)) return record;
  }
  for (const record of entity.records) {
    if (!match(record)) continue;
    if (!sharesParentLink(sourceValues, record.values, linkFields)) continue;
    return record;
  }
  return null;
}

function pairKey(pair: { stageId: string; departmentId: string }) {
  return `${pair.stageId}\0${pair.departmentId}`;
}

/**
 * Drop sibling rows that are not exactly one keep stage×department pair.
 * Awaits remote deletes and strips parent forward links — otherwise a refresh
 * merges orphans back into «Стадия/отделы».
 */
async function removeOrphanDeptCalculationSiblings(options: {
  entity: Entity;
  sourceRecordId: string;
  sourceValues: Record<string, string | undefined>;
  groupsFieldId: string;
  keepPairs: ReadonlyArray<{ stageId: string; departmentId: string }>;
  linkFields: readonly EntityField[];
  parentLinks: ReadonlyArray<{
    parentEntityId: string;
    parentRecordId: string;
  }>;
  parent?: { entity: Entity; recordId: string } | null;
}) {
  const {
    entity,
    sourceRecordId,
    sourceValues,
    groupsFieldId,
    keepPairs,
    linkFields,
    parentLinks,
    parent = null,
  } = options;
  const keep = new Set(keepPairs.map(pairKey));
  const live =
    getEntityConfig().entities.find((item) => item.id === entity.id) ?? entity;

  const candidates = new Map<string, EntityRecord>();
  for (const record of collectDeptCalculationSiblingRecords(
    live,
    [sourceRecordId],
    parent,
  )) {
    candidates.set(record.id, record);
  }
  for (const record of live.records) {
    if (record.id === sourceRecordId) continue;
    if (!sharesParentLink(sourceValues, record.values, linkFields)) continue;
    candidates.set(record.id, record);
  }

  // Fan-out model: every sibling must be exactly one keep pair. Legacy/full
  // trees and deleted departments fail that check and must go.
  const toRemove: string[] = [];
  const claimed = new Set<string>();
  for (const record of candidates.values()) {
    if (record.id === sourceRecordId) continue;
    const recordPairs = collectTkpStageDepartmentPairs(
      record.values[groupsFieldId],
    );
    const sole = recordPairs.length === 1 ? pairKey(recordPairs[0]!) : null;
    if (!sole || !keep.has(sole) || claimed.has(sole)) {
      toRemove.push(record.id);
      continue;
    }
    claimed.add(sole);
  }

  for (const recordId of toRemove) {
    removeEntityRecord(entity.id, recordId);
  }
  await Promise.all(
    toRemove.map((recordId) => waitForEntityRecordDelete(recordId)),
  );
  await stripChildrenFromParents(entity.id, toRemove, parentLinks);
}

function withGipUsers(options: {
  entity: Entity;
  values: Record<string, string>;
  entities: readonly Entity[];
  groupsFieldId: string;
  parentEntity?: Entity | null;
  parentRecord?: EntityRecord | null;
}): Record<string, string> {
  const {
    entity,
    values,
    entities,
    groupsFieldId,
    parentEntity,
    parentRecord,
  } = options;
  if (!parentEntity || !parentRecord) return values;
  return applyTkpGipDepartmentUsers({
    childEntity: entity,
    childValues: values,
    entities,
    parentEntity,
    parentRecord,
    changedFieldId: groupsFieldId,
  }).values;
}

/** Department catalog «Руководитель» (users) for soft-fill into calc rows. */
function resolveDepartmentCatalogManagerField(
  departmentEntity: Entity,
): EntityField | null {
  let named =
    departmentEntity.fields.find((field) => {
      if (field.type !== "relation" && field.type !== "belonging") return false;
      if (getEntityRelationTargetId(field) !== SYSTEM_USERS_ENTITY_ID) {
        return false;
      }
      const name = getEntityFieldDisplayName(field)
        .trim()
        .toLocaleLowerCase("ru")
        .replaceAll("ё", "е");
      return name === "руководитель" || name.startsWith("руководитель ");
    }) ?? null;
  if (!named) named = findEntityManagerUserField(departmentEntity);
  if (!named) return null;
  if (getEntityRelationTargetId(named) !== SYSTEM_USERS_ENTITY_ID) return null;
  return named;
}

/**
 * Soft-fill empty calc «Руководитель» from the paired department catalog.
 * «ГИП» rows stay for `withGipUsers` (lead). Used so spawn assignees can
 * resolve after fan-out even when the ask only stores stage×department ids.
 */
function withCatalogManagerIfEmpty(options: {
  entity: Entity;
  values: Record<string, string>;
  entities: readonly Entity[];
  groupsFieldId: string;
}): Record<string, string> {
  const { entity, values, entities, groupsFieldId } = options;
  const { manager } = findDeptCalculationUserFields(entity);
  if (!manager) return values;
  if (parseEntityRelationIds(values[manager.id]).length > 0) return values;

  const departmentEntity = resolveDepartmentEntity(entity, entities);
  if (!departmentEntity) return values;
  const deptManager = resolveDepartmentCatalogManagerField(departmentEntity);
  if (!deptManager) return values;

  for (const pair of collectTkpStageDepartmentPairs(values[groupsFieldId])) {
    if (!pair.departmentId.trim()) continue;
    const deptRecord = departmentEntity.records.find(
      (item) => item.id === pair.departmentId,
    );
    if (!deptRecord) continue;
    if (isGipDepartmentRecord(departmentEntity, deptRecord, entities)) {
      continue;
    }
    const catalogIds = parseEntityRelationIds(
      deptRecord.values[deptManager.id],
    );
    if (catalogIds.length === 0) continue;
    return {
      ...values,
      [manager.id]:
        manager.relationMultiple === true
          ? serializeEntityRelationIds(catalogIds)
          : serializeEntityRelationIds(catalogIds.slice(0, 1)),
    };
  }
  return values;
}

function userFieldPatch(
  entity: Entity,
  values: Record<string, string>,
): Record<string, string> {
  const { manager, performer } = findDeptCalculationUserFields(entity);
  const patch: Record<string, string> = {};
  for (const field of [manager, performer]) {
    if (!field || values[field.id] === undefined) continue;
    patch[field.id] = values[field.id]!;
  }
  return patch;
}

/**
 * Sibling «Расчёты отделов» for this parent (or the passed record set).
 * Unions parent-scoped discovery (child→parent + forward) with UI seeds so
 * ГИП heal works when either side is incomplete.
 */
function resolveDeptCalculationHealSiblings(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  parentEntity?: Entity | null;
  parentRecord?: EntityRecord | null;
}): EntityRecord[] {
  const { entity, records, parentEntity, parentRecord } = options;
  const live =
    getEntityConfig().entities.find((item) => item.id === entity.id) ?? entity;
  const parentRef =
    parentEntity && parentRecord
      ? { entity: parentEntity, recordId: parentRecord.id }
      : null;

  const byId = new Map<string, EntityRecord>();
  if (parentRef) {
    for (const record of collectDeptCalculationRecordsForParent(
      live,
      parentRef,
    )) {
      byId.set(record.id, record);
    }
  }
  if (records.length > 0) {
    for (const record of collectDeptCalculationSiblingRecords(
      live,
      records.map((item) => item.id),
      parentRef,
    )) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()];
}

/** Do not retry the same stage×dept create after a failed persist (avoids UI hang). */
const failedEnsurePairKeys = new Set<string>();

function ensurePairFailKey(
  entityId: string,
  parentRecordId: string | null | undefined,
  stageId: string,
  departmentId: string,
) {
  return `${entityId}:${parentRecordId ?? ""}:${stageId}\0${departmentId}`;
}

/** Clear failed GIP creates for this parent so a new heal can finish all stages. */
function clearFailedGipEnsureKeys(
  entityId: string,
  parentRecordId: string | null | undefined,
  gipId: string,
) {
  const prefix = `${entityId}:${parentRecordId ?? ""}:`;
  const suffix = `\0${gipId}`;
  for (const key of [...failedEnsurePairKeys]) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) {
      failedEnsurePairKeys.delete(key);
    }
  }
}

/**
 * Stage ids that still need a «ГИП» calculation row for this parent.
 * Uses parent «Стадия/отделы» roots + all linked siblings (not a filtered UI list).
 */
export function missingDeptCalculationGipStageIds(options: {
  entity: Entity;
  entities: readonly Entity[];
  parentEntity: Entity;
  parentRecord: EntityRecord;
  /** Optional UI seeds — used when parent links are not written yet. */
  seedRecords?: readonly EntityRecord[];
}): string[] {
  const {
    entity,
    entities,
    parentEntity,
    parentRecord,
    seedRecords = [],
  } = options;
  if (!isDeptCalculationsEntity(entity) || !isTkpAnalysisEntity(parentEntity)) {
    return [];
  }
  const groupsField = findDeptCalculationsGroupsField(entity);
  const departmentEntity = resolveDepartmentEntity(entity, entities);
  if (!groupsField || !departmentEntity) return [];
  const gipId = findGipDepartmentRecordId(departmentEntity, entities);
  if (!gipId) return [];

  const siblings = resolveDeptCalculationHealSiblings({
    entity,
    records: seedRecords,
    parentEntity,
    parentRecord,
  });

  const stages = new Set<string>();
  const gipStages = new Set<string>();
  for (const record of siblings) {
    for (const pair of collectTkpStageDepartmentPairs(
      record.values[groupsField.id],
    )) {
      const stageId = pair.stageId.trim();
      const departmentId = pair.departmentId.trim();
      if (!stageId) continue;
      stages.add(stageId);
      if (departmentId === gipId) gipStages.add(stageId);
    }
  }

  const parentGroups =
    findDeptCalculationsGroupsField(parentEntity) ??
    parentEntity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length),
    ) ??
    null;
  if (parentGroups) {
    for (const stageId of collectTkpStageRootIds(
      parentRecord.values[parentGroups.id],
    )) {
      stages.add(stageId);
    }
  }

  return [...stages].filter((stageId) => !gipStages.has(stageId)).sort();
}

/**
 * Heal missing fan-out rows for this «Разбор ТКП» parent:
 * 1) stage×department pairs already selected on the parent tree (unless gipOnly)
 * 2) stage×ГИП for every selected stage
 *
 * Existence is checked among siblings of this parent only — another ТКП
 * already having ПД×ГИП must not block creating it here.
 */
export async function ensureDeptCalculationGipRows(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
  parentEntity?: Entity | null;
  parentRecord?: EntityRecord | null;
  /** View heal: only create missing «ГИП» rows, not other departments. */
  gipOnly?: boolean;
}): Promise<void> {
  const {
    entity,
    records,
    entities,
    parentEntity,
    parentRecord,
    gipOnly = false,
  } = options;
  if (!isDeptCalculationsEntity(entity)) return;
  if (records.length === 0 && !(parentEntity && parentRecord)) return;

  const groupsField = findDeptCalculationsGroupsField(entity);
  const departmentEntity = resolveDepartmentEntity(entity, entities);
  if (!groupsField || !departmentEntity) return;
  const gipId = findGipDepartmentRecordId(departmentEntity, entities);
  if (!gipId) {
    console.warn(
      "[dept-calc] GIP catalog department not found — cannot ensure ГИП rows",
    );
    return;
  }

  // Fresh view/task heal: allow another attempt at ГИП for every stage.
  if (gipOnly) {
    clearFailedGipEnsureKeys(entity.id, parentRecord?.id, gipId);
  }

  // Parent-scoped siblings (belonging + forward). Seeds only as fallback.
  const siblings = resolveDeptCalculationHealSiblings({
    entity,
    records,
    parentEntity,
    parentRecord,
  });

  const existingKeys = new Set<string>();
  const stages = new Set<string>();
  for (const record of siblings) {
    for (const pair of collectTkpStageDepartmentPairs(
      record.values[groupsField.id],
    )) {
      const stageId = pair.stageId.trim();
      const departmentId = pair.departmentId.trim();
      if (!stageId || !departmentId) continue;
      stages.add(stageId);
      existingKeys.add(`${stageId}\0${departmentId}`);
    }
  }

  // Parent «Стадия/отделы»: stage roots (+ optional restore of selected depts).
  const missingPairs: Array<{ stageId: string; departmentId: string }> = [];
  const missingPairKeys = new Set<string>();
  const parentRecordId = parentRecord?.id ?? null;
  const pushMissing = (stageId: string, departmentId: string) => {
    const key = `${stageId}\0${departmentId}`;
    if (existingKeys.has(key) || missingPairKeys.has(key)) return;
    if (
      failedEnsurePairKeys.has(
        ensurePairFailKey(entity.id, parentRecordId, stageId, departmentId),
      )
    ) {
      return;
    }
    missingPairKeys.add(key);
    missingPairs.push({ stageId, departmentId });
  };

  if (parentEntity && parentRecord && isTkpAnalysisEntity(parentEntity)) {
    const parentGroups =
      findDeptCalculationsGroupsField(parentEntity) ??
      parentEntity.fields.find(
        (field) =>
          field.type === "relationGroups" &&
          Boolean(field.relationGroups?.levels.length),
      ) ??
      null;
    if (parentGroups) {
      const parentValue = parentRecord.values[parentGroups.id];
      for (const stageId of collectTkpStageRootIds(parentValue)) {
        stages.add(stageId);
      }
      if (!gipOnly) {
        for (const pair of collectTkpStageDepartmentPairs(parentValue)) {
          const stageId = pair.stageId.trim();
          const departmentId = pair.departmentId.trim();
          if (!stageId || !departmentId || departmentId === gipId) continue;
          stages.add(stageId);
          pushMissing(stageId, departmentId);
        }
      }
    }
  }

  for (const stageId of stages) {
    pushMissing(stageId, gipId);
  }
  if (missingPairs.length === 0) return;

  const linkFields = parentLinkFields(entity);
  const template = siblings[0] ?? records[0] ?? null;
  const { manager, performer } = findDeptCalculationUserFields(entity);
  const templateLinks = template
    ? collectParentLinksFromValues(linkFields, template.values)
    : [];
  const ensuredParentLinks =
    templateLinks.length > 0
      ? templateLinks
      : parentEntity && parentRecord
        ? [{ parentEntityId: parentEntity.id, parentRecordId: parentRecord.id }]
        : [];

  const withParentLinks = (
    values: Record<string, string>,
  ): Record<string, string> => {
    if (!parentEntity || !parentRecord || linkFields.length === 0) {
      return values;
    }
    let next = values;
    for (const field of linkFields) {
      if (getEntityRelationTargetId(field) !== parentEntity.id) continue;
      const existing = parseEntityRelationIds(next[field.id]);
      if (existing.includes(parentRecord.id)) continue;
      if (next === values) next = { ...values };
      next[field.id] = serializeEntityRelationIds([
        ...existing,
        parentRecord.id,
      ]);
    }
    return next;
  };

  for (const pair of missingPairs) {
    try {
      const live =
        getEntityConfig().entities.find((item) => item.id === entity.id) ??
        entity;
      const liveSiblings = resolveDeptCalculationHealSiblings({
        entity: live,
        records: siblings.length > 0 ? siblings : records,
        parentEntity,
        parentRecord,
      });
      const already = liveSiblings.some((record) =>
        deptCalculationValuesMatchStagePair(
          record.values[groupsField.id],
          pair,
        ),
      );
      if (already) continue;

      const encoded = encodeTkpStageDepartmentPair(pair);
      if (!encoded) continue;
      // Only parent links — never copy nested lines / costs from a sibling.
      const seed: Record<string, string> = { [groupsField.id]: encoded };
      if (template) {
        for (const field of linkFields) {
          const value = (template.values[field.id] ?? "").trim();
          if (value) seed[field.id] = value;
        }
      }
      for (const field of [manager, performer]) {
        if (!field) continue;
        seed[field.id] = "";
      }
      const createBase = withParentLinks(seed);
      const createValues = withGipUsers({
        entity,
        values: createBase,
        entities,
        groupsFieldId: groupsField.id,
        parentEntity,
        parentRecord,
      });
      const created = addEntityRecord(entity.id, createValues);
      await waitForEntityRecordInsert(created.id);
      if (ensuredParentLinks.length > 0) {
        await writeBackChildToParents(
          entity.id,
          created.id,
          ensuredParentLinks,
        );
      }
    } catch (error: unknown) {
      failedEnsurePairKeys.add(
        ensurePairFailKey(
          entity.id,
          parentRecordId,
          pair.stageId,
          pair.departmentId,
        ),
      );
      console.warn(
        "[dept-calc] failed to ensure stage×department row",
        pair,
        error,
      );
    }
  }
}

/**
 * Soft-fill empty «Руководитель» on non-ГИП calc rows from the department
 * catalog (users relation only). Display still resolves from catalog even
 * when this cannot write (custom people target).
 */
export function syncDeptCalculationCatalogManagers(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
}): void {
  const { entity, records, entities } = options;
  if (!isDeptCalculationsEntity(entity)) return;
  const groupsField = findDeptCalculationsGroupsField(entity);
  const { manager } = findDeptCalculationUserFields(entity);
  const departmentEntity = resolveDepartmentEntity(entity, entities);
  if (!groupsField || !manager || !departmentEntity) return;

  // Prefer a field literally named «Руководитель» that targets users.
  let deptManager =
    departmentEntity.fields.find((field) => {
      if (field.type !== "relation" && field.type !== "belonging") return false;
      if (getEntityRelationTargetId(field) !== SYSTEM_USERS_ENTITY_ID) {
        return false;
      }
      const name = getEntityFieldDisplayName(field)
        .trim()
        .toLocaleLowerCase("ru")
        .replaceAll("ё", "е");
      return name === "руководитель" || name.startsWith("руководитель ");
    }) ?? null;
  if (!deptManager) {
    deptManager = findEntityManagerUserField(departmentEntity);
  }
  if (!deptManager) return;
  if (getEntityRelationTargetId(deptManager) !== SYSTEM_USERS_ENTITY_ID) {
    return;
  }

  for (const record of records) {
    const existing = parseEntityRelationIds(record.values[manager.id]);
    if (existing.length > 0) continue;
    let catalogIds: string[] = [];
    for (const pair of collectTkpStageDepartmentPairs(
      record.values[groupsField.id],
    )) {
      if (!pair.departmentId.trim()) continue;
      const deptRecord = departmentEntity.records.find(
        (item) => item.id === pair.departmentId,
      );
      if (!deptRecord) continue;
      if (isGipDepartmentRecord(departmentEntity, deptRecord, entities)) {
        continue;
      }
      catalogIds = parseEntityRelationIds(deptRecord.values[deptManager.id]);
      if (catalogIds.length > 0) break;
    }
    if (catalogIds.length === 0) continue;
    const value =
      manager.relationMultiple === true
        ? serializeEntityRelationIds(catalogIds)
        : serializeEntityRelationIds(catalogIds.slice(0, 1));
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      [manager.id]: value,
    });
  }
}

/**
 * Write a related-ask patch. When «Стадия/отделы» has several departments,
 * expand into one linked row per stage×department (keeps the source row as
 * the first pair, creates/reuses siblings for the rest).
 */
export async function persistDeptCalculationRelatedUpdate(options: {
  entity: Entity;
  recordId: string;
  patch: Record<string, string>;
  entities: readonly Entity[];
  parentEntity?: Entity | null;
  parentRecord?: EntityRecord | null;
}): Promise<void> {
  const { entity, recordId, patch, entities, parentEntity, parentRecord } =
    options;
  if (!isDeptCalculationsEntity(entity)) {
    await updateEntityRecord(entity.id, recordId, patch);
    return;
  }

  const groupsField = findDeptCalculationsGroupsField(entity);
  if (!groupsField || patch[groupsField.id] === undefined) {
    await updateEntityRecord(entity.id, recordId, patch);
    return;
  }

  const ensuredGroups = ensureTkpGipDepartmentInGroupsValue({
    value: patch[groupsField.id] ?? "",
    hostEntity: entity,
    entities,
  });
  let pairs = collectTkpStageDepartmentPairs(ensuredGroups);
  const leafEntityId =
    groupsField.relationGroups?.levels[1]?.source.kind === "entity"
      ? groupsField.relationGroups.levels[1].source.entityId
      : null;
  const departmentEntity = leafEntityId
    ? (entities.find((item) => item.id === leafEntityId) ?? null)
    : null;
  const gipId = departmentEntity
    ? findGipDepartmentRecordId(departmentEntity, entities)
    : null;
  if (gipId) pairs = withGipDepartmentPairs(pairs, gipId);

  const liveEntity =
    getEntityConfig().entities.find((item) => item.id === entity.id) ?? entity;
  const sourceRecord = liveEntity.records.find((item) => item.id === recordId);
  const linkFields = parentLinkFields(entity);
  const baseValues: Record<string, string> = {
    ...(sourceRecord?.values ?? {}),
    ...patch,
  };
  const parentLinks = collectParentLinksFromValues(linkFields, baseValues);

  // Guarantee child→parent links so reload can discover fan-out siblings
  // even when the parent forward relation was never updated.
  const ensuredParentLinks =
    parentLinks.length > 0
      ? parentLinks
      : parentEntity && parentRecord
        ? [{ parentEntityId: parentEntity.id, parentRecordId: parentRecord.id }]
        : [];
  const withParentLinks = (
    values: Record<string, string>,
  ): Record<string, string> => {
    if (!parentEntity || !parentRecord || linkFields.length === 0) {
      return values;
    }
    let next = values;
    for (const field of linkFields) {
      if (getEntityRelationTargetId(field) !== parentEntity.id) continue;
      const existing = parseEntityRelationIds(next[field.id]);
      if (existing.includes(parentRecord.id)) continue;
      if (next === values) next = { ...values };
      next[field.id] = serializeEntityRelationIds([
        ...existing,
        parentRecord.id,
      ]);
    }
    return next;
  };
  const parentLinkPatch = (values: Record<string, string>) => {
    if (!parentEntity) return {};
    const entries: Array<[string, string]> = [];
    for (const field of linkFields) {
      if (getEntityRelationTargetId(field) !== parentEntity.id) continue;
      const value = (values[field.id] ?? "").trim();
      if (!value) continue;
      entries.push([field.id, value]);
    }
    return Object.fromEntries(entries);
  };

  const linkedSourceValues = withParentLinks(baseValues);
  const parentRef =
    parentEntity && parentRecord
      ? { entity: parentEntity, recordId: parentRecord.id }
      : null;
  // Never copy the merged multi-dept tree onto fan-out sibling rows.
  const siblingPatch = { ...patch };
  delete siblingPatch[groupsField.id];

  if (pairs.length <= 1) {
    const groupsValue =
      pairs.length === 1
        ? encodeTkpStageDepartmentPair(pairs[0]!)
        : ensuredGroups;
    const merged = withCatalogManagerIfEmpty({
      entity,
      values: withGipUsers({
        entity,
        values: withParentLinks({
          ...baseValues,
          [groupsField.id]: groupsValue,
        }),
        entities,
        groupsFieldId: groupsField.id,
        parentEntity,
        parentRecord,
      }),
      entities,
      groupsFieldId: groupsField.id,
    });
    await updateEntityRecord(entity.id, recordId, {
      ...siblingPatch,
      [groupsField.id]: groupsValue,
      ...userFieldPatch(entity, merged),
      ...parentLinkPatch(merged),
    });
    if (ensuredParentLinks.length > 0) {
      await writeBackChildToParents(entity.id, recordId, ensuredParentLinks);
    }
    await removeOrphanDeptCalculationSiblings({
      entity,
      sourceRecordId: recordId,
      sourceValues: linkedSourceValues,
      groupsFieldId: groupsField.id,
      keepPairs: pairs,
      linkFields,
      parentLinks: ensuredParentLinks,
      parent: parentRef,
    });
    return;
  }

  const first = pairs[0]!;
  const firstMerged = withCatalogManagerIfEmpty({
    entity,
    values: withGipUsers({
      entity,
      values: withParentLinks({
        ...baseValues,
        [groupsField.id]: encodeTkpStageDepartmentPair(first),
      }),
      entities,
      groupsFieldId: groupsField.id,
      parentEntity,
      parentRecord,
    }),
    entities,
    groupsFieldId: groupsField.id,
  });

  await updateEntityRecord(entity.id, recordId, {
    ...siblingPatch,
    [groupsField.id]: encodeTkpStageDepartmentPair(first),
    ...userFieldPatch(entity, firstMerged),
    ...parentLinkPatch(firstMerged),
  });
  if (ensuredParentLinks.length > 0) {
    await writeBackChildToParents(entity.id, recordId, ensuredParentLinks);
  }

  for (const pair of pairs.slice(1)) {
    const live =
      getEntityConfig().entities.find((item) => item.id === entity.id) ??
      entity;
    const existing = sourceRecord
      ? findSiblingForPair(
          live,
          recordId,
          linkedSourceValues,
          groupsField.id,
          pair,
          linkFields,
          parentRef,
        )
      : null;
    const encoded = encodeTkpStageDepartmentPair(pair);

    if (existing) {
      const siblingMerged = withCatalogManagerIfEmpty({
        entity,
        values: withGipUsers({
          entity,
          values: withParentLinks({
            ...existing.values,
            ...siblingPatch,
            [groupsField.id]: encoded,
          }),
          entities,
          groupsFieldId: groupsField.id,
          parentEntity,
          parentRecord,
        }),
        entities,
        groupsFieldId: groupsField.id,
      });
      await updateEntityRecord(entity.id, existing.id, {
        ...siblingPatch,
        [groupsField.id]: encoded,
        ...userFieldPatch(entity, siblingMerged),
        ...parentLinkPatch(siblingMerged),
      });
      if (ensuredParentLinks.length > 0) {
        await writeBackChildToParents(
          entity.id,
          existing.id,
          ensuredParentLinks,
        );
      }
      continue;
    }

    // Do not wipe manager/performer — soft-fill from catalog / GIP below.
    const createBase = withParentLinks({
      ...baseValues,
      [groupsField.id]: encoded,
    });
    const createValues = withCatalogManagerIfEmpty({
      entity,
      values: withGipUsers({
        entity,
        values: createBase,
        entities,
        groupsFieldId: groupsField.id,
        parentEntity,
        parentRecord,
      }),
      entities,
      groupsFieldId: groupsField.id,
    });
    const created = addEntityRecord(entity.id, createValues);
    // Wait for remote insert — otherwise reload drops fan-out siblings.
    await waitForEntityRecordInsert(created.id);
    if (ensuredParentLinks.length > 0) {
      await writeBackChildToParents(entity.id, created.id, ensuredParentLinks);
    }
  }

  await removeOrphanDeptCalculationSiblings({
    entity,
    sourceRecordId: recordId,
    sourceValues: linkedSourceValues,
    groupsFieldId: groupsField.id,
    keepPairs: pairs,
    linkFields,
    parentLinks: ensuredParentLinks,
    parent: parentRef,
  });
}
