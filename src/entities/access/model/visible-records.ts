import {
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityRecords,
  getEntityValueContext,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { getSessionUser } from "@/entities/session";
import { getCurrentRole } from "../store/access-store";
import { filterVisibleEntityRecords } from "./permissions";

function currentScopeOptions(entities: readonly Entity[]) {
  const currentUserRecordId = getCurrentUserRecordId();
  return {
    entities,
    authUserId: getSessionUser()?.id ?? null,
    currentUserRecordId,
    valueContext: getEntityValueContext(entities, currentUserRecordId),
  };
}

/** Subset of `records` the current role may see. */
export async function retainVisibleEntityRecords(
  entity: Entity,
  records: readonly EntityRecord[],
): Promise<EntityRecord[]> {
  const entities = getEntityConfig().entities;
  return filterVisibleEntityRecords(
    getCurrentRole(),
    entity,
    records,
    currentScopeOptions(entities),
  );
}

/**
 * Records of `entity` the current role may see.
 * Display adapters use this so a dashboard cannot sum rows the list would hide.
 */
export async function readVisibleEntityRecords(
  entity: Entity,
): Promise<EntityRecord[]> {
  return retainVisibleEntityRecords(entity, await getEntityRecords(entity));
}

/**
 * Value context whose lists and linked aggregates only include `visibleRecordIds`.
 * `getRecord` stays intact so a visible row can still show a stored relation label.
 */
export function scopeValueContext(
  ctx: EntityValueContext,
  visibleRecordIds: ReadonlyMap<string, ReadonlySet<string>>,
): EntityValueContext {
  return {
    ...ctx,
    visibleRecordIds,
    // Own caches: a scoped total must not be reused by an unscoped read, and
    // a scoped index must not shrink the shared one.
    linkIndexes: new Map(),
    formulaCache: new Map(),
    rollupCache: new Map(),
    pending: new Set(),
    getRecords: (entityId) => {
      const records = ctx.getRecords(entityId);
      const allowed = visibleRecordIds.get(entityId);
      if (!allowed) return records;
      return records.filter((record) => allowed.has(record.id));
    },
  };
}
