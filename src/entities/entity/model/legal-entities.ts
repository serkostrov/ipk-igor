import { getEntityRelationTargetId, parseEntityRelationIds } from "./field";
import type { Entity, EntityRecord } from "./types";

const LEGAL_ENTITY_NAMES = ["Юрлица", "Юрлицо", "Юридические лица"] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function entityNameMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return keys.some((key) =>
    candidates.some((value) => normalizeName(value) === normalizeName(key)),
  );
}

/** Catalog entity «Юрлица» (by Russian name — not a system entity). */
export function findLegalEntitiesEntity(
  entities: readonly Entity[],
): Entity | null {
  return (
    entities.find((entity) => entityNameMatches(entity, LEGAL_ENTITY_NAMES)) ??
    null
  );
}

function entityById(
  entities: readonly Entity[],
  id: string,
): Entity | undefined {
  return entities.find((item) => item.id === id);
}

/** Direct relation / belonging fields that target the Юрлица entity. */
export function getLegalEntityLinkFields(
  entity: Pick<Entity, "fields">,
  legalEntitiesEntityId: string,
) {
  return entity.fields.filter(
    (field) => getEntityRelationTargetId(field) === legalEntitiesEntityId,
  );
}

/**
 * Whether this entity can be tied to a юрлицо — directly or via belonging /
 * a short relation hop to an entity that has a direct link.
 */
export function entityCanLinkToLegalEntities(
  entity: Entity,
  legalEntitiesEntityId: string,
  entities: readonly Entity[],
  depth = 0,
  seen = new Set<string>(),
): boolean {
  if (entity.id === legalEntitiesEntityId) return true;
  if (depth > 3 || seen.has(entity.id)) return false;
  seen.add(entity.id);

  if (getLegalEntityLinkFields(entity, legalEntitiesEntityId).length > 0) {
    return true;
  }

  for (const field of entity.fields) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === legalEntitiesEntityId) continue;
    // Prefer belonging and single relations — skip multi-user noise.
    if (field.type !== "belonging" && field.type !== "relation") continue;
    if (field.type === "relation" && field.relationMultiple) continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    if (
      entityCanLinkToLegalEntities(
        target,
        legalEntitiesEntityId,
        entities,
        depth + 1,
        seen,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Collect юрлицо record ids linked to this record (direct + short hops).
 */
export function collectRecordLegalEntityIds(
  entity: Entity,
  record: EntityRecord,
  legalEntitiesEntityId: string,
  entities: readonly Entity[],
  depth = 0,
  visited = new Set<string>(),
): string[] {
  const key = `${entity.id}:${record.id}`;
  if (depth > 3 || visited.has(key)) return [];
  visited.add(key);

  if (entity.id === legalEntitiesEntityId) return [record.id];

  const found = new Set<string>();

  for (const field of getLegalEntityLinkFields(entity, legalEntitiesEntityId)) {
    for (const id of parseEntityRelationIds(record.values[field.id])) {
      if (id) found.add(id);
    }
  }

  for (const field of entity.fields) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === legalEntitiesEntityId) continue;
    if (field.type !== "belonging" && field.type !== "relation") continue;
    if (field.type === "relation" && field.relationMultiple) continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    if (
      !entityCanLinkToLegalEntities(
        target,
        legalEntitiesEntityId,
        entities,
        0,
        new Set([entity.id]),
      )
    ) {
      continue;
    }
    for (const relatedId of parseEntityRelationIds(record.values[field.id])) {
      const related = target.records.find((item) => item.id === relatedId);
      if (!related) continue;
      for (const id of collectRecordLegalEntityIds(
        target,
        related,
        legalEntitiesEntityId,
        entities,
        depth + 1,
        visited,
      )) {
        found.add(id);
      }
    }
  }

  return [...found];
}

/**
 * Role «вижу только» юрлица: empty allowedIds → no restriction.
 * Entities without a path to Юрлица stay visible.
 * Linked records must intersect allowedIds.
 */
export function recordMatchesLegalEntityScope(
  entity: Entity,
  record: EntityRecord,
  allowedLegalEntityIds: readonly string[],
  legalEntitiesEntity: Entity | null,
  entities: readonly Entity[],
): boolean {
  if (allowedLegalEntityIds.length === 0) return true;
  if (!legalEntitiesEntity) return true;

  if (!entityCanLinkToLegalEntities(entity, legalEntitiesEntity.id, entities)) {
    return true;
  }

  const linked = collectRecordLegalEntityIds(
    entity,
    record,
    legalEntitiesEntity.id,
    entities,
  );
  if (linked.length === 0) return false;
  const allowed = new Set(allowedLegalEntityIds);
  return linked.some((id) => allowed.has(id));
}
