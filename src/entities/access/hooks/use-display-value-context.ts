import { useMemo } from "react";
import {
  getEntityRelationTargetId,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityValueContext,
} from "@/entities/entity";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  readVisibleEntityRecords,
  scopeValueContext,
} from "../model/visible-records";

/** Entities whose rows a rollup, related-hours field, or nested table can sum. */
export function aggregateSourceEntityIds(entity: Entity): string[] {
  const ids = new Set<string>();
  for (const field of entity.fields) {
    const rollupId = field.rollup?.sourceEntityId?.trim();
    if (field.type === "rollup" && rollupId) ids.add(rollupId);
    const hours = field.relatedTimeHours;
    if (field.type !== "relatedTimeHours" || !hours) continue;
    if (hours.source === "tab") {
      const linked = entity.tabs
        .find((tab) => tab.id === hours.tabId)
        ?.linkedEntityId?.trim();
      if (linked) ids.add(linked);
      continue;
    }
    const relation = entity.fields.find(
      (item) => item.id === hours.relationFieldId,
    );
    const targetId = relation ? getEntityRelationTargetId(relation) : null;
    if (targetId) ids.add(targetId);
  }
  const nestedId = entity.tableNestedEntityId?.trim();
  if (nestedId) ids.add(nestedId);
  return [...ids];
}

/**
 * Same context the page already uses, but aggregates only count records the
 * role may see. Until that set is known, those sources contribute nothing.
 */
export function useDisplayValueContext(
  entity: Entity | null | undefined,
): EntityValueContext {
  const ctx = useEntityValueContext();
  const { entities } = useEntityConfig();
  const sourceIds = useMemo(
    () => (entity ? aggregateSourceEntityIds(entity) : []),
    [entity],
  );
  const key = sourceIds.join("\0");
  const visible = useAsyncValue(async () => {
    const map = new Map<string, Set<string>>();
    if (!key) return map;
    for (const id of key.split("\0")) {
      const source = entities.find((item) => item.id === id);
      if (!source) continue;
      const records = await readVisibleEntityRecords(source);
      map.set(source.id, new Set(records.map((record) => record.id)));
    }
    return map;
  }, [entities, key]);

  const scoped = useMemo(() => {
    if (!key) return ctx;
    const map =
      visible.status === "ready"
        ? visible.value
        : new Map(
            key.split("\0").map((id) => [id, new Set<string>()] as const),
          );
    return scopeValueContext(ctx, map);
  }, [ctx, key, visible]);
  if (visible.status === "error") throw visible.error;
  return scoped;
}
