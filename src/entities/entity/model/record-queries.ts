import { parseEntityListValueIds, parseEntityRelationIds } from "./field";
import type { Entity, EntityRecord } from "./types";

export async function getEntityRecords(
  entity: Entity,
): Promise<readonly EntityRecord[]> {
  return entity.records;
}

export async function getEntityRecordById(
  entity: Entity | null | undefined,
  recordId: string | null | undefined,
): Promise<EntityRecord | undefined> {
  if (recordId == null || !entity) return undefined;
  return entity.records.find((record) => record.id === recordId);
}

export async function getFirstEntityRecord(
  entity: Entity | null | undefined,
): Promise<EntityRecord | undefined> {
  return entity?.records[0];
}

export async function getEntityRecordsByIds(
  entity: Entity,
  recordIds: readonly string[],
): Promise<EntityRecord[]> {
  const ids = new Set(recordIds);
  return entity.records.filter((record) => ids.has(record.id));
}

export async function getEntityRecordsByRelation(
  entity: Entity,
  fieldId: string,
  parentId: string,
): Promise<EntityRecord[]> {
  return entity.records.filter((record) =>
    parseEntityRelationIds(record.values[fieldId]).includes(parentId),
  );
}

export async function getEntityOwningRecord(
  entities: readonly Entity[],
  recordId: string,
): Promise<Entity | undefined> {
  return entities.find((entity) =>
    entity.records.some((record) => record.id === recordId),
  );
}

export async function getEntityRecordsByFirstListOption(
  entity: Entity,
  fieldId: string,
  optionId: string,
): Promise<EntityRecord[]> {
  return entity.records.filter(
    (record) => parseEntityListValueIds(record.values[fieldId])[0] === optionId,
  );
}
