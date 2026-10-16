import { useMemo, useSyncExternalStore } from "react";
import { getEntityValueContext } from "../model/field-value";
import { findRunningTimer } from "../model/time-tracking";
import {
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityError,
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
