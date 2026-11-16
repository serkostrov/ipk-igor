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
 * «Только свои»: viewer created the record, is the Users row itself, or is
 * referenced on the card (исполнитель / наблюдатель / ответственный / … —
 * any relation/belonging/lookup to Users).
 */
export function recordMatchesOwnScope(
  entity: Entity,
  record: EntityRecord,
  options: {
    authUserId: string | null;
    currentUserRecordId: string | null;
    entities: readonly Entity[];
    valueContext?: EntityValueContext;
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

  for (const field of entity.fields) {
    if (!fieldTargetsUsers(entity, field, options.entities)) continue;

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
