import { useCallback, useMemo, useRef, useState } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  formatTkpGipDepartmentExtras,
  resolveTkpGipLeadContext,
} from "./hardcode-tkp-gip";
import type {
  EntityValueContext,
  RelationGroupsExtrasResolver,
} from "../model/field-value";
import type { Entity, EntityRecord } from "../model/types";

export type TkpGipLeadContext = { entity: Entity; record: EntityRecord };

/**
 * Resolve the «Разбор ТКП» lead context whose «ГИП» overrides department heads.
 * Async (store/DB lookup) → `null` until it resolves.
 */
export function useTkpGipLeadContext(options: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  entities: readonly Entity[];
  softFillParent?: TkpGipLeadContext | null;
}): TkpGipLeadContext | null {
  const { hostEntity, hostRecord, entities, softFillParent = null } = options;
  // Callers rebuild `hostRecord` (draft overlay) every render, so keying the
  // async read on object identity would re-fire it in an infinite loop. Key on
  // stable content instead — only real input changes re-resolve the lead context.
  const key = JSON.stringify([
    hostEntity.id,
    hostRecord.id,
    hostRecord.values,
    softFillParent
      ? [softFillParent.entity.id, softFillParent.record.id]
      : null,
  ]);
  // `key` captures the relevant content of the object deps and `entities` is a
  // stable store snapshot, so this read only re-fires on real input changes.
  const read = useCallback(
    () =>
      resolveTkpGipLeadContext({
        hostEntity,
        hostRecord,
        entities,
        softFillParent,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, entities],
  );
  const result = useAsyncValue(read);
  if (result.status === "error") throw result.error;
  return result.status === "ready" ? result.value : null;
}

/**
 * Sync `resolveRecordExtras` for relationGroups chips, backed by a lazy async
 * cache: the first time a department chip asks for its extras we kick off the
 * async `formatTkpGipDepartmentExtras` and re-render when it resolves. Until
 * then the default extras are shown. Mirrors the lazy label cache pattern.
 *
 * Returns `undefined` while there is no lead context (no override needed).
 */
export function useTkpGipExtrasResolver(options: {
  ctx: EntityValueContext;
  hostEntity: Entity;
  leadParent: TkpGipLeadContext | null;
}): RelationGroupsExtrasResolver | undefined {
  const { ctx, hostEntity, leadParent } = options;
  const cacheRef = useRef(new Map<string, string>());
  const pendingRef = useRef(new Set<string>());
  const [, setVersion] = useState(0);

  // Scope cache entries by lead context so a record switch never reuses the
  // previous lead's «ГИП» extras (no mid-render ref reset needed).
  const leadKey = leadParent
    ? `${leadParent.entity.id}:${leadParent.record.id}`
    : "";

  return useMemo(() => {
    if (!leadParent) return undefined;
    return ({ entity: departmentEntity, recordId, fieldIds, defaultExtras }) => {
      const key = `${leadKey}:${departmentEntity.id}:${recordId}:${fieldIds.join(
        ",",
      )}:${defaultExtras}`;
      const cached = cacheRef.current.get(key);
      if (cached !== undefined) return cached;
      if (!pendingRef.current.has(key)) {
        pendingRef.current.add(key);
        void formatTkpGipDepartmentExtras({
          ctx,
          hostEntity,
          parentEntity: leadParent.entity,
          parentRecord: leadParent.record,
          departmentEntity,
          departmentRecordId: recordId,
          displayFieldIds: fieldIds,
          defaultExtras,
        })
          .then((text) => {
            cacheRef.current.set(key, text ?? defaultExtras);
            pendingRef.current.delete(key);
            setVersion((version) => version + 1);
          })
          .catch(() => {
            pendingRef.current.delete(key);
          });
      }
      // Show the default until the lead «ГИП» extras arrive.
      return defaultExtras;
    };
  }, [ctx, hostEntity, leadParent, leadKey]);
}
