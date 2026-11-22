/**
 * Re-render notifications for async record priming.
 *
 * The value context (`getEntityValueContext`) carries a record index seeded
 * from the local store. When a view references relation targets whose records
 * aren't kept locally (growing relation targets), `useEntityValueContext`
 * fetches them and primes the index. This tiny store lets those async fills
 * wake every subscribed view through `useSyncExternalStore`.
 */

const listeners = new Set<() => void>();
let version = 0;

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

/** Notify subscribers that records were primed into some context. */
export function bumpRecordPrime(): void {
  version += 1;
  for (const listener of listeners) listener();
}
