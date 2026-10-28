import { toEntityStructure } from "../lib/parse-entity-config";
import { entitySchemasEqual } from "./schema-changes";
import type { Entity, EntityRecord } from "./types";

/**
 * Entity structure used for a record: fields/formulas/tabs from the
 * published schema version the record was created on.
 * Live `records` and `publishedVersion` always come from the current entity.
 */
export function resolveEntityForRecord(
  liveEntity: Entity,
  _record: Pick<EntityRecord, "schemaVersion">,
  versionDefinition: Entity | null | undefined,
): Entity {
  if (!versionDefinition) return liveEntity;
  return {
    ...versionDefinition,
    id: liveEntity.id,
    records: liveEntity.records,
    publishedVersion: liveEntity.publishedVersion,
  };
}

/** True when draft structure differs from the given published snapshot. */
export function entityHasUnpublishedSchemaChanges(
  liveEntity: Entity,
  publishedDefinition: Entity | null | undefined,
) {
  if (!publishedDefinition) return false;
  return !entitySchemasEqual(
    toEntityStructure(liveEntity),
    toEntityStructure(publishedDefinition),
  );
}
