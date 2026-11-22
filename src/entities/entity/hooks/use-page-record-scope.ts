import { useEffect, useMemo } from "react";
import { resolveEntityRecordClosure } from "../model/record-closure";
import {
  ensureEntityRecords,
  getEntityRecordsLoadStatus,
} from "../store/entity-store";
import { useEntityConfig } from "./use-entity";

/**
 * Page-scoped record loading (path B). Given the page's root entities, load the
 * transitive set of entities whose records it needs, then report readiness.
 *
 * `useEntityConfig` already re-renders on store `notify()`, which fires when a
 * load lands — so `ready` recomputes from live load status without a separate
 * subscription. Until init is switched to lazy, every entity is `loaded` and
 * `ready` is immediately true.
 */
export function usePageRecordScope(rootIds: readonly string[]): {
  ready: boolean;
} {
  const { entities } = useEntityConfig();
  const rootKey = [...rootIds].filter(Boolean).sort().join(",");

  const closure = useMemo(
    () =>
      resolveEntityRecordClosure(rootKey ? rootKey.split(",") : [], entities),
    [rootKey, entities],
  );

  const closureKey = [...closure].sort().join(",");

  useEffect(() => {
    for (const id of closureKey ? closureKey.split(",") : []) {
      void ensureEntityRecords(id);
    }
  }, [closureKey]);

  const ready = [...closure].every(
    (id) => getEntityRecordsLoadStatus(id) === "loaded",
  );

  return { ready };
}
