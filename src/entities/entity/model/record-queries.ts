import {
  entityRelationIncludesId,
  parseEntityListValueIds,
  parseEntityRelationIds,
} from "./field";
import {
  fetchEntityRecordsByFieldContains,
  fetchRecordOwnerEntityId,
} from "../api/entity-records-api";
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

/**
 * Records whose `fieldId` links `recordId`, from the page cache and the
 * database. Page scope often has not loaded the child entity yet.
 */
export async function getEntityRecordsLinkedByField(
  entity: Entity,
  fieldId: string,
  recordId: string,
): Promise<EntityRecord[]> {
  const needle = recordId.trim();
  const field = fieldId.trim();
  if (!needle || !field) return [];

  const local = entity.records.filter((record) =>
    entityRelationIncludesId(record.values[field], needle),
  );
  let remote: EntityRecord[] = [];
  try {
    remote = await fetchEntityRecordsByFieldContains(entity.id, field, needle);
  } catch (error) {
    console.error("[entity] linked records lookup failed", error);
  }

  const byId = new Map<string, EntityRecord>();
  for (const record of [...local, ...remote]) {
    if (!entityRelationIncludesId(record.values[field], needle)) continue;
    byId.set(record.id, record);
  }
  const merged = [...byId.values()];
  if (remote.length > 0) {
    const { ensureRecordsByIds } = await import("../store/entity-store");
    await ensureRecordsByIds(merged.map((record) => record.id));
  }
  return merged;
}

/** Load records by id into the store (no-op for ids already present). */
export async function primeEntityRecordsByIds(
  ids: readonly string[],
): Promise<void> {
  const unique = [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (unique.length === 0) return;
  const { ensureRecordsByIds } = await import("../store/entity-store");
  await ensureRecordsByIds(unique);
}

/**
 * Records whose field text equals `value` (case-insensitive), without
 * loading the rest of the entity.
 */
export async function getEntityRecordsByFieldText(
  entity: Entity,
  fieldId: string,
  value: string,
): Promise<EntityRecord[]> {
  const field = fieldId.trim();
  const needle = value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  if (!field || !needle) return [];

  const matches = (record: EntityRecord) => {
    const raw = (record.values[field] ?? "")
      .trim()
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е");
    return raw === needle;
  };

  const local = entity.records.filter(matches);
  let remote: EntityRecord[] = [];
  try {
    remote = await fetchEntityRecordsByFieldContains(
      entity.id,
      field,
      value.trim(),
    );
  } catch (error) {
    console.error("[entity] field text lookup failed", error);
  }
  const byId = new Map<string, EntityRecord>();
  for (const record of [...local, ...remote]) {
    if (!matches(record)) continue;
    byId.set(record.id, record);
  }
  const merged = [...byId.values()];
  if (remote.length > 0) {
    const { ensureRecordsByIds } = await import("../store/entity-store");
    await ensureRecordsByIds(merged.map((record) => record.id));
  }
  return merged;
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
