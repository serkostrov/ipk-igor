/**
 * Persist «Расчёты отделов» related-ask updates as one record per
 * stage×department pair (view / costs are per department row).
 */

import {
  addEntityRecord,
  applyTkpGipDepartmentUsers,
  collectTkpStageDepartmentPairs,
  deptCalculationValuesMatchStagePair,
  encodeTkpStageDepartmentPair,
  ensureTkpGipDepartmentInGroupsValue,
  findDeptCalculationUserFields,
  findDeptCalculationsGroupsField,
  findGipDepartmentRecordId,
  getEntityConfig,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  isDeptCalculationsEntity,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  updateEntityRecord,
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
): EntityRecord | null {
  for (const record of entity.records) {
    if (record.id === sourceRecordId) continue;
    if (!sharesParentLink(sourceValues, record.values, linkFields)) continue;
    if (
      deptCalculationValuesMatchStagePair(record.values[groupsFieldId], pair)
    ) {
      return record;
    }
  }
  return null;
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

  if (pairs.length <= 1) {
    const nextPatch =
      pairs.length === 1
        ? {
            ...patch,
            [groupsField.id]: encodeTkpStageDepartmentPair(pairs[0]!),
          }
        : { ...patch, [groupsField.id]: ensuredGroups };
    await updateEntityRecord(entity.id, recordId, nextPatch);
    return;
  }

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

  const first = pairs[0]!;
  const firstMerged = withGipUsers({
    entity,
    values: {
      ...baseValues,
      [groupsField.id]: encodeTkpStageDepartmentPair(first),
    },
    entities,
    groupsFieldId: groupsField.id,
    parentEntity,
    parentRecord,
  });
  await updateEntityRecord(entity.id, recordId, {
    ...patch,
    [groupsField.id]: encodeTkpStageDepartmentPair(first),
    ...userFieldPatch(entity, firstMerged),
  });

  for (const pair of pairs.slice(1)) {
    const live =
      getEntityConfig().entities.find((item) => item.id === entity.id) ??
      entity;
    const existing = sourceRecord
      ? findSiblingForPair(
          live,
          recordId,
          baseValues,
          groupsField.id,
          pair,
          linkFields,
        )
      : null;
    const encoded = encodeTkpStageDepartmentPair(pair);

    if (existing) {
      const siblingMerged = withGipUsers({
        entity,
        values: { ...existing.values, ...patch, [groupsField.id]: encoded },
        entities,
        groupsFieldId: groupsField.id,
        parentEntity,
        parentRecord,
      });
      await updateEntityRecord(entity.id, existing.id, {
        ...patch,
        [groupsField.id]: encoded,
        ...userFieldPatch(entity, siblingMerged),
      });
      continue;
    }

    const createBase: Record<string, string> = {
      ...baseValues,
      [groupsField.id]: encoded,
    };
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
    if (parentLinks.length > 0) {
      await writeBackChildToParents(entity.id, created.id, parentLinks);
    }
  }
}
