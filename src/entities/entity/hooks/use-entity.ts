import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getEntityValueContext } from "../model/field-value";
import { findRunningTimer } from "../model/time-tracking";
import type { EntityRecord } from "../model/types";
import {
  ensureEntitySchemaVersion,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityError,
  getEntityForRecord,
  getEntityStatus,
  subscribeEntityConfig,
} from "../store/entity-store";

export function useEntityConfig() {
  return useSyncExternalStore(
    subscribeEntityConfig,
    getEntityConfig,
    getEntityConfig,
  );
}

export function useEntityStatus() {
  return useSyncExternalStore(
    subscribeEntityConfig,
    getEntityStatus,
    getEntityStatus,
  );
}

export function useEntityError() {
  return useSyncExternalStore(
    subscribeEntityConfig,
    getEntityError,
    getEntityError,
  );
}

/** Users entity record id of the signed-in account. */
export function useCurrentUserRecordId() {
  return useSyncExternalStore(
    subscribeEntityConfig,
    getCurrentUserRecordId,
    getCurrentUserRecordId,
  );
}

/** Computed-values context for the current config (cached per config). */
export function useEntityValueContext() {
  const { entities } = useEntityConfig();
  const currentUserRecordId = useCurrentUserRecordId();
  return getEntityValueContext(entities, currentUserRecordId);
}

/** Timer the signed-in user is running (any tracked entity). */
export function useRunningTimer() {
  const { entities } = useEntityConfig();
  const currentUserRecordId = useCurrentUserRecordId();
  return useMemo(
    () => findRunningTimer(entities, currentUserRecordId),
    [currentUserRecordId, entities],
  );
}

/**
 * Live entity with schema pinned to the record's published version
 * (formulas/fields as of creation). Loads the snapshot on demand.
 */
export function useEntityForRecord(
  entityId: string,
  record: Pick<EntityRecord, "schemaVersion"> | null | undefined,
) {
  const config = useEntityConfig();
  const schemaVersion = record?.schemaVersion ?? 1;

  useEffect(() => {
    if (!record) return;
    void ensureEntitySchemaVersion(entityId, schemaVersion);
  }, [entityId, record, schemaVersion]);

  return useMemo(() => {
    if (!record) {
      return config.entities.find((item) => item.id === entityId) ?? null;
    }
    return getEntityForRecord(entityId, record);
  }, [config.entities, entityId, record]);
}

/** Prefetch schema versions used by the given records (e.g. table page). */
export function usePrefetchEntitySchemaVersions(
  entityId: string,
  records: Array<Pick<EntityRecord, "schemaVersion">>,
) {
  const key = records
    .map((record) => record.schemaVersion)
    .sort((a, b) => a - b)
    .filter((version, index, all) => all.indexOf(version) === index)
    .join(",");

  useEffect(() => {
    if (!key) return;
    for (const part of key.split(",")) {
      const version = Number(part);
      if (Number.isFinite(version) && version >= 1) {
        void ensureEntitySchemaVersion(entityId, version);
      }
    }
  }, [entityId, key]);
}
