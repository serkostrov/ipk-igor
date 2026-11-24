import { parseEntityListValueIds, parseEntityRelationIds } from "./field";
import { fetchRecordOwnerEntityId } from "../api/entity-records-api";
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
  const local = entity.records.find((record) => record.id === recordId);
  if (local) return local;
  // Page-scoped loading may not have the parent/related row yet — fetch by id
  // and re-read from the live store (dynamic import avoids a store cycle).
  const { ensureRecordsByIds, getEntityConfig } =
    await import("../store/entity-store");
  await ensureRecordsByIds([recordId]);
  return getEntityConfig()
    .entities.find((item) => item.id === entity.id)
    ?.records.find((record) => record.id === recordId);
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
  const local = entities.find((entity) =>
    entity.records.some((record) => record.id === recordId),
  );
  if (local) return local;
  // The record may belong to an entity whose records aren't loaded yet
  // (page-scoped loading). Config is always present — resolve the owner by id.
  const ownerId = await fetchRecordOwnerEntityId(recordId);
  return ownerId ? entities.find((entity) => entity.id === ownerId) : undefined;
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
