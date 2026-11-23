import { useEffect } from "react";
import { ensureRecordsByIds } from "../store/entity-store";

/**
 * Ensure specific records are present by id (page-scoped loading, by-id variant).
 *
 * For cross-cutting views (notifications, tasks, messenger, feed) that reference
 * arbitrary records a root-entity closure doesn't fit — they collect the record
 * ids of the current batch and call this. The store merges fetched rows into
 * their owning entity and notifies, so the value context resolves their labels.
 * No-op for ids already in the store (unchanged under eager init).
 */
export function useEnsureRecordsByIds(ids: readonly string[]): void {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (key) void ensureRecordsByIds(key.split(","));
  }, [key]);
}
