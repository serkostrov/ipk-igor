import { getEntityRelationTargetId, parseEntityRelationIds } from "./field";
import {
  getRecordFieldIds,
  resolveEntityLookupTarget,
  type EntityValueContext,
} from "./field-value";
import { SYSTEM_USERS_ENTITY_ID } from "./system-entities";
import type { Entity, EntityField, EntityRecord } from "./types";

function viewerIdentityIds(options: {
  authUserId: string | null;
  currentUserRecordId: string | null;
}): Set<string> {
  const ids = new Set<string>();
  if (options.authUserId) ids.add(options.authUserId);
  if (options.currentUserRecordId) ids.add(options.currentUserRecordId);
  return ids;
}

/** Relation / belonging / lookup that resolves to the system Users entity. */
export function fieldTargetsUsers(
  entity: Entity,
  field: EntityField,
  entities: readonly Entity[],
): boolean {
  if (field.type === "relation" || field.type === "belonging") {
    return getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID;
  }
  if (field.type !== "lookup") return false;
  const target = resolveEntityLookupTarget(entity, field, entities);
  if (!target) return false;
  if (target.entity.id === SYSTEM_USERS_ENTITY_ID) return true;
  return (
    (target.field.type === "relation" || target.field.type === "belonging") &&
    getEntityRelationTargetId(target.field) === SYSTEM_USERS_ENTITY_ID
  );
}

/**
 * Whether this field makes the viewer a participant for «Только свои».
 * Relation / belonging to Users participates unless `ownScope` is false.
 * Lookup participates only when `ownScope` is explicitly true — a lookup
 * chain (manager → someone else) must not open every record.
 */
export function fieldParticipatesInOwnScope(
  entity: Entity,
  field: EntityField,
  entities: readonly Entity[],
): boolean {
  if (field.ownScope === false) return false;
  if (!fieldTargetsUsers(entity, field, entities)) return false;
  if (field.type === "lookup") return field.ownScope === true;
  return field.type === "relation" || field.type === "belonging";
}

/**
 * «Только свои»: viewer created the record, is the Users row itself, or is
 * referenced by a participating user field (исполнитель, наблюдатель, …).
 */
export function recordMatchesOwnScope(
  entity: Entity,
  record: EntityRecord,
  options: {
    authUserId: string | null;
    currentUserRecordId: string | null;
    entities: readonly Entity[];
    valueContext?: EntityValueContext;
    /**
     * When set, only these participating user fields count.
     * `undefined` — every participating field. `[]` — none of them.
     */
    ownFieldIds?: readonly string[];
  },
): boolean {
  const viewerIds = viewerIdentityIds(options);
  if (viewerIds.size === 0) return false;

  if (record.createdBy && viewerIds.has(record.createdBy)) return true;
  if (record.authUserId && viewerIds.has(record.authUserId)) return true;
  if (
    options.currentUserRecordId != null &&
    record.id === options.currentUserRecordId
  ) {
    return true;
  }

  const allowedFields =
    options.ownFieldIds != null ? new Set(options.ownFieldIds) : null;
  for (const field of entity.fields) {
    if (allowedFields && !allowedFields.has(field.id)) continue;
    if (!fieldParticipatesInOwnScope(entity, field, options.entities)) continue;

    if (field.type === "relation" || field.type === "belonging") {
      const ids = parseEntityRelationIds(record.values[field.id]);
      if (ids.some((id) => viewerIds.has(id))) return true;
      continue;
    }

    if (field.type === "lookup" && options.valueContext) {
      const ids = getRecordFieldIds(
        options.valueContext,
        entity,
        record,
        field,
      );
      if (ids.some((id) => viewerIds.has(id))) return true;
    }
  }

  return false;
}
