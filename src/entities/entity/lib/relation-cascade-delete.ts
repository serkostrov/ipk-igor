import { entityRelationIncludesId } from "../model/field";
import type { Entity, EntityField } from "../model/types";

export type EntityRecordCascadeHit = {
  recordId: string;
  entityId: string;
};

function isCascadeLinkField(field: EntityField): boolean {
  return (
    (field.type === "relation" || field.type === "belonging") &&
    field.relationCascadeDelete === true
  );
}

function fieldTargetsEntity(
  host: Entity,
  field: EntityField,
  targetEntityId: string,
): boolean {
  if (field.type === "belonging") {
    return host.id === targetEntityId;
  }
  return (field.relationEntityId ?? "").trim() === targetEntityId;
}

/**
 * Records that reference `parentRecordId` via a cascade-enabled link field
 * (incoming dependents). Order is depth-first: children before ancestors.
 */
export function collectEntityRecordCascadeDeletes(
  entities: readonly Entity[],
  parentRecordId: string,
  visited = new Set<string>(),
): EntityRecordCascadeHit[] {
  const parentId = parentRecordId.trim();
  if (!parentId || visited.has(parentId)) return [];
  visited.add(parentId);

  const parentEntity = entities.find((entity) =>
    entity.records.some((record) => record.id === parentId),
  );
  if (!parentEntity) return [];

  const hits: EntityRecordCascadeHit[] = [];

  for (const host of entities) {
    for (const field of host.fields) {
      if (!isCascadeLinkField(field)) continue;
      if (!fieldTargetsEntity(host, field, parentEntity.id)) continue;

      for (const record of host.records) {
        if (record.id === parentId || visited.has(record.id)) continue;
        if (!entityRelationIncludesId(record.values[field.id], parentId)) {
          continue;
        }
        hits.push(
          ...collectEntityRecordCascadeDeletes(entities, record.id, visited),
        );
      }
    }
  }

  hits.push({ recordId: parentId, entityId: parentEntity.id });
  return hits;
}

/** Drop cascaded records from an entities snapshot (local store update). */
export function omitCascadedEntityRecords(
  entities: readonly Entity[],
  deletedRecordIds: ReadonlySet<string>,
): Entity[] {
  if (deletedRecordIds.size === 0) return [...entities];
  return entities.map((entity) => {
    const nextRecords = entity.records.filter(
      (record) => !deletedRecordIds.has(record.id),
    );
    if (nextRecords.length === entity.records.length) return entity;
    return { ...entity, records: nextRecords };
  });
}

export function groupCascadeHitsByEntity(
  hits: readonly EntityRecordCascadeHit[],
): Map<string, string[]> {
  const byEntity = new Map<string, string[]>();
  for (const hit of hits) {
    const entityId = hit.entityId.trim();
    if (!entityId) continue;
    const list = byEntity.get(entityId) ?? [];
    list.push(hit.recordId);
    byEntity.set(entityId, list);
  }
  return byEntity;
}

/** Dependents excluding the root (for confirm / preview). */
export function countCascadeDependents(
  entities: readonly Entity[],
  recordId: string,
): number {
  const hits = collectEntityRecordCascadeDeletes(entities, recordId);
  return Math.max(0, hits.length - 1);
}
