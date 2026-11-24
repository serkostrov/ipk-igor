/**
 * Ensure «Стадия/отделы» on «Разбор ТКП» has stage roots copied from the
 * launch protocol (needed for nested ask mode on step 6).
 */

import { collectRecordsLinkedToParent } from "@/entities/automation";
import {
  coerceToEntityRelationGroupsValue,
  findTkpLeadRelationField,
  getEntityRecordById,
  getEntityRecords,
  getEntityRelationTargetId,
  isTkpAnalysisEntity,
  parseEntityListValueIds,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";

const PROTO_STAGE_FIELD_KEYS = [
  "стадии проекта",
  "стадии",
  "stages",
  "project stages",
] as const;

const PROTO_ENTITY_KEYS = [
  "протокол запуска",
  "протоколы запуска",
  "протокол",
  "launch protocol",
] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function nameMatches(
  candidates: readonly string[],
  keys: readonly string[],
): boolean {
  const normalized = candidates
    .map((item) => normalizeName(item))
    .filter(Boolean);
  return keys.some((key) => {
    const needle = normalizeName(key);
    return normalized.some(
      (value) => value === needle || value.includes(needle),
    );
  });
}

function findTkpGroupsField(entity: Entity) {
  return (
    entity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length) &&
        normalizeName(field.name).includes("отдел"),
    ) ??
    entity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length),
    ) ??
    null
  );
}

function findProtocolEntity(entities: readonly Entity[]): Entity | null {
  return (
    entities.find((entity) =>
      nameMatches(
        [entity.id, entity.name, entity.namePlural],
        PROTO_ENTITY_KEYS,
      ),
    ) ?? null
  );
}

function findProtocolStagesField(protocol: Entity) {
  return (
    protocol.fields.find(
      (field) =>
        (field.type === "list" ||
          field.type === "relation" ||
          field.type === "belonging") &&
        nameMatches([field.name], PROTO_STAGE_FIELD_KEYS),
    ) ??
    protocol.fields.find(
      (field) =>
        field.type === "list" &&
        field.listMultiple &&
        nameMatches([field.name], ["стади"]),
    ) ??
    null
  );
}

function stageIdsFromProtocolValue(
  field: { type: string },
  raw: string | undefined,
): string[] {
  if (field.type === "list") return parseEntityListValueIds(raw);
  return parseEntityRelationIds(raw);
}

async function loadProtocolRecords(options: {
  protocolEntity: Entity;
  hostEntity: Entity;
  hostRecord: EntityRecord;
  leadEntity: Entity;
  leadRecord: EntityRecord;
}): Promise<EntityRecord[]> {
  const { protocolEntity, hostEntity, hostRecord, leadEntity, leadRecord } =
    options;
  const byId = new Map(
    (await getEntityRecords(protocolEntity)).map((record) => [
      record.id,
      record,
    ]),
  );
  const resolve = (ids: readonly string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((record): record is EntityRecord => record != null);

  let ids = await collectRecordsLinkedToParent({
    childEntity: protocolEntity,
    parentEntityId: hostEntity.id,
    parentRecordId: hostRecord.id,
    host: hostEntity,
  });
  if (ids.length > 0) return resolve(ids);

  ids = await collectRecordsLinkedToParent({
    childEntity: protocolEntity,
    parentEntityId: leadEntity.id,
    parentRecordId: leadRecord.id,
    host: leadEntity,
  });
  if (ids.length > 0) return resolve(ids);

  return [...byId.values()].filter((record) => {
    for (const field of protocolEntity.fields) {
      if (field.type !== "relation" && field.type !== "belonging") continue;
      const targetId = getEntityRelationTargetId(field);
      if (targetId !== leadEntity.id && targetId !== hostEntity.id) continue;
      const linked = parseEntityRelationIds(record.values[field.id]);
      if (linked.includes(leadRecord.id) || linked.includes(hostRecord.id)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Copy protocol project stages into empty «Стадия/отделы» roots on the TKP
 * record. Returns the healed host values (or null when nothing changed).
 */
export async function maybeHealTkpStageDepartmentRoots(options: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  entities: readonly Entity[];
}): Promise<{ values: Record<string, string>; healed: boolean } | null> {
  const { hostEntity, hostRecord, entities } = options;
  if (!isTkpAnalysisEntity(hostEntity)) return null;

  const groupsField = findTkpGroupsField(hostEntity);
  if (!groupsField) return null;

  const existing = parseEntityRelationGroups(hostRecord.values[groupsField.id]);
  if (existing.length > 0) {
    return { values: hostRecord.values, healed: false };
  }

  const leadField = findTkpLeadRelationField(hostEntity, entities);
  if (!leadField) return null;
  const leadEntityId = getEntityRelationTargetId(leadField);
  const leadEntity = leadEntityId
    ? (entities.find((item) => item.id === leadEntityId) ?? null)
    : null;
  const leadRecordId = parseEntityRelationIds(
    hostRecord.values[leadField.id],
  )[0];
  if (!leadEntity || !leadRecordId) return null;
  const leadRecord = await getEntityRecordById(leadEntity, leadRecordId);
  if (!leadRecord) return null;

  const protocolEntity = findProtocolEntity(entities);
  if (!protocolEntity) return null;
  const stagesField = findProtocolStagesField(protocolEntity);
  if (!stagesField) return null;

  const protocolRecords = await loadProtocolRecords({
    protocolEntity,
    hostEntity,
    hostRecord,
    leadEntity,
    leadRecord,
  });

  const stageIds: string[] = [];
  const seen = new Set<string>();
  for (const protocol of protocolRecords) {
    for (const id of stageIdsFromProtocolValue(
      stagesField,
      protocol.values[stagesField.id],
    )) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      stageIds.push(id);
    }
  }
  if (stageIds.length === 0) return null;

  const nextGroups = coerceToEntityRelationGroupsValue(
    JSON.stringify(stageIds),
  );
  if (!nextGroups || parseEntityRelationGroups(nextGroups).length === 0) {
    return null;
  }

  await updateEntityRecord(hostEntity.id, hostRecord.id, {
    [groupsField.id]: nextGroups,
  });

  return {
    values: { ...hostRecord.values, [groupsField.id]: nextGroups },
    healed: true,
  };
}

/** True when nested ask has no stage roots to hang departments on. */
export function tkpStageDepartmentRootsMissing(
  hostEntity: Entity,
  values: Record<string, string | undefined>,
): boolean {
  const groupsField = findTkpGroupsField(hostEntity);
  if (!groupsField) return false;
  return parseEntityRelationGroups(values[groupsField.id]).length === 0;
}
