import { toEntityStructure } from "../lib/parse-entity-config";
import { entitySchemasEqual } from "./schema-changes";
import type { Entity, EntityField, EntityRecord } from "./types";

/**
 * List option catalogs evolve in the live draft (automation stages, renames)
 * while records stay pinned to a published schema for formulas/structure.
 * Overlay live catalog/presentation onto the same field id so labels resolve
 * the same way as the table (which reads columns from the live entity).
 */
function overlayLiveListCatalog(
  versioned: EntityField,
  live: EntityField | undefined,
): EntityField {
  if (versioned.type !== "list" || !live || live.type !== "list") {
    return versioned;
  }
  return {
    ...versioned,
    listOptions: live.listOptions,
    listUseColors: live.listUseColors,
    listShowEmptyValue: live.listShowEmptyValue,
    listFixed: live.listFixed,
  };
}

/**
 * Entity structure used for a record: fields/formulas from the published
 * schema version the record was created on.
 *
 * Presentation that should follow current settings for every record comes
 * from the live entity: tabs (files / notes / history / time / …), time
 * tracking, header field, records, and list option catalogs.
 */
export function resolveEntityForRecord(
  liveEntity: Entity,
  _record: Pick<EntityRecord, "schemaVersion">,
  versionDefinition: Entity | null | undefined,
): Entity {
  if (!versionDefinition) return liveEntity;
  const liveFieldById = new Map(
    liveEntity.fields.map((field) => [field.id, field]),
  );
  return {
    ...versionDefinition,
    id: liveEntity.id,
    records: liveEntity.records,
    publishedVersion: liveEntity.publishedVersion,
    headerFieldId: liveEntity.headerFieldId,
    tabs: liveEntity.tabs,
    timeTracking: liveEntity.timeTracking,
    fields: versionDefinition.fields.map((field) =>
      overlayLiveListCatalog(field, liveFieldById.get(field.id)),
    ),
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
