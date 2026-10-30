/**
 * Persist «Расчёты отделов» related-ask updates as one record per
 * stage×department pair (view / costs are per department row).
 */

import {
  addEntityRecord,
  applyTkpGipDepartmentUsers,
  collectDeptCalculationSiblingRecords,
  collectTkpStageDepartmentPairs,
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
 * Heal missing «ГИП» fan-out rows: every stage that already has at least one
 * department calculation must also have a «ГИП» sibling (lead GIP users).
 * Safe to call from the view — no-op when already complete.
 */
export async function ensureDeptCalculationGipRows(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
  parentEntity?: Entity | null;
  parentRecord?: EntityRecord | null;
}): Promise<void> {
  const { entity, records, entities, parentEntity, parentRecord } = options;
  if (!isDeptCalculationsEntity(entity) || records.length === 0) return;

  const groupsField = findDeptCalculationsGroupsField(entity);
  const departmentEntity = resolveDepartmentEntity(entity, entities);
  if (!groupsField || !departmentEntity) return;
  const gipId = findGipDepartmentRecordId(departmentEntity, entities);
  if (!gipId) return;

  const stages = new Set<string>();
  const gipStages = new Set<string>();
  for (const record of records) {
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

  const missingStages = [...stages].filter(
    (stageId) => !gipStages.has(stageId),
  );
  if (missingStages.length === 0) return;

  const linkFields = parentLinkFields(entity);
  const template = records[0]!;
  const { manager, performer } = findDeptCalculationUserFields(entity);
  const ensuredParentLinks =
    collectParentLinksFromValues(linkFields, template.values).length > 0
      ? collectParentLinksFromValues(linkFields, template.values)
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

  for (const stageId of missingStages) {
    const live =
      getEntityConfig().entities.find((item) => item.id === entity.id) ??
      entity;
    const already = live.records.some((record) =>
      deptCalculationValuesMatchStagePair(record.values[groupsField.id], {
        stageId,
        departmentId: gipId,
      }),
    );
    if (already) continue;

    const encoded = encodeTkpStageDepartmentPair({
      stageId,
      departmentId: gipId,
    });
    // Only parent links — never copy nested lines / costs from a sibling.
    const seed: Record<string, string> = { [groupsField.id]: encoded };
    for (const field of linkFields) {
      const value = (template.values[field.id] ?? "").trim();
      if (value) seed[field.id] = value;
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
      await writeBackChildToParents(entity.id, created.id, ensuredParentLinks);
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
  const { manager, performer } = findDeptCalculationUserFields(entity);
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
    const merged = withGipUsers({
      entity,
      values: withParentLinks({
        ...baseValues,
        [groupsField.id]: groupsValue,
      }),
      entities,
      groupsFieldId: groupsField.id,
      parentEntity,
      parentRecord,
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
  const firstMerged = withGipUsers({
    entity,
    values: withParentLinks({
      ...baseValues,
      [groupsField.id]: encodeTkpStageDepartmentPair(first),
    }),
    entities,
    groupsFieldId: groupsField.id,
    parentEntity,
    parentRecord,
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
      const siblingMerged = withGipUsers({
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

    const createBase = withParentLinks({
      ...baseValues,
      [groupsField.id]: encoded,
    });
    for (const field of [manager, performer]) {
      if (!field) continue;
      createBase[field.id] = "";
    }
    const createValues = withGipUsers({
      entity,
      values: createBase,
      entities,
      groupsFieldId: groupsField.id,
      parentEntity,
      parentRecord,
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
