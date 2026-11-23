import type { EntityRecord } from "./types";

/**
 * Stable cross-context store for async record priming.
 *
 * The value context (`getEntityValueContext`) carries a record index seeded
 * from the local store. When a view references relation targets whose records
 * aren't kept locally (growing relation targets), `useEntityValueContext`
 * fetches them and primes them here. The store rebuilds its context on every
 * change, so the primed records and the one-shot fetch guard must live here —
 * outside any single context instance — or a churned context would drop the
 * primed rows and re-request them in a storm. This tiny store also lets async
 * fills wake every subscribed view through `useSyncExternalStore`.
 */

const listeners = new Set<() => void>();
let version = 0;

const EMPTY_RECORDS: readonly EntityRecord[] = [];

/** DB-primed records absent from the local store: entityId → id → record. */
const primedByEntity = new Map<string, Map<string, EntityRecord>>();

/**
 * Record ids already fetched (or attempted) this session. A referenced id that
 * isn't in the DB (dangling reference to a deleted record) would otherwise stay
 * "missing" forever and be re-fetched by every new context the store churns out
 * during loading — a request storm. Claiming ids here before fetching makes each
 * id a one-shot: fetched at most once, never re-requested.
 */
const attemptedRecordIds = new Set<string>();

/** Subscribe to prime fills (for `useSyncExternalStore`). */
export function subscribeRecordPrime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic version — snapshot for `useSyncExternalStore`. */
export function getRecordPrimeVersion(): number {
  return version;
}

/** Notify subscribers that records were primed into the store. */
export function bumpRecordPrime(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Primed records for an entity (store-independent), or empty. */
export function getPrimedRecords(entityId: string): readonly EntityRecord[] {
  const map = primedByEntity.get(entityId);
  return map ? [...map.values()] : EMPTY_RECORDS;
}

/**
 * Persist fetched records so contexts rebuilt after this fill re-seed them
 * instead of re-fetching. Returns how many were new (callers notify/re-render
 * only when something landed).
 */
export function addPrimedRecords(
  entityId: string,
  records: readonly EntityRecord[],
): number {
  let map = primedByEntity.get(entityId);
  if (!map) {
    map = new Map();
    primedByEntity.set(entityId, map);
  }
  let added = 0;
  for (const record of records) {
    if (map.has(record.id)) continue;
    map.set(record.id, record);
    added += 1;
  }
  return added;
}

/**
 * Claim referenced ids for a one-shot fetch. Returns the subset not yet
 * attempted (now marked attempted), so concurrent contexts never re-fetch.
 */
export function claimRecordIdsToFetch(ids: Iterable<string>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!id || attemptedRecordIds.has(id)) continue;
    attemptedRecordIds.add(id);
    out.push(id);
  }
  return out;
}
