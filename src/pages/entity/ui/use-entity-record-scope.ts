import { useMemo, useState } from "react";
import {
  entityScope,
  entityScopeFilter,
  useCurrentRole,
} from "@/entities/access";
import {
  getEntityHiddenListOptionIds,
  getCurrentUserRecordId,
  isEntityRecordHidden,
  matchesEntityConditions,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";

export type EntityRecordScope = {
  /** Records after the hidden-options rule. */
  records: EntityRecord[];
  hiddenCount: number;
  showHidden: boolean;
  setShowHidden: (showHidden: boolean) => void;
  /** Hidden option ids per list field (kanban hides their columns). */
  hiddenOptionIds: Map<string, Set<string>>;
};

function getInitialState(entity: Entity | null) {
  return {
    entityId: entity?.id ?? null,
    showHidden: false,
  };
}

function filterRecordsByDataScope(
  entity: Entity,
  records: EntityRecord[],
  dataScope: ReturnType<typeof entityScope>,
  scopeFilter: ReturnType<typeof entityScopeFilter>,
  authUserId: string | null,
  ctx: ReturnType<typeof useEntityValueContext>,
): EntityRecord[] {
  if (dataScope === "own") {
    return records.filter(
      (record) =>
        (authUserId != null &&
          (record.createdBy === authUserId ||
            record.authUserId === authUserId)) ||
        record.id === getCurrentUserRecordId(),
    );
  }
  if (dataScope === "filter") {
    const conditions = scopeFilter ?? [];
    if (conditions.length === 0) return [];
    return records.filter((record) =>
      matchesEntityConditions(ctx, entity, record, conditions),
    );
  }
  return records;
}

/** «Показать скрытые» shared by the table and the kanban. */
export function useEntityRecordScope(entity: Entity | null): EntityRecordScope {
  const ctx = useEntityValueContext();
  const role = useCurrentRole();
  const sessionUser = useSessionUser();
  const [state, setState] = useState(() => getInitialState(entity));

  let current = state;
  if (state.entityId !== (entity?.id ?? null)) {
    current = getInitialState(entity);
    setState(current);
  }
  const { showHidden } = current;

  const scope = useMemo(() => {
    if (!entity) {
      return {
        records: [],
        hiddenCount: 0,
        hiddenOptionIds: new Map<string, Set<string>>(),
      };
    }
    const dataScope = entityScope(role, entity.id);
    const scopeFilter = entityScopeFilter(role, entity.id);
    const authUserId = sessionUser?.id ?? null;
    const scopedRecords = filterRecordsByDataScope(
      entity,
      entity.records,
      dataScope,
      scopeFilter,
      authUserId,
      ctx,
    );
    const hiddenOptionIds = getEntityHiddenListOptionIds(entity, ctx.entities);
    const unhidden = scopedRecords.filter(
      (record) => !isEntityRecordHidden(record, hiddenOptionIds),
    );
    return {
      records: showHidden ? scopedRecords : unhidden,
      hiddenCount: scopedRecords.length - unhidden.length,
      hiddenOptionIds,
    };
  }, [ctx, ctx.entities, entity, showHidden, role, sessionUser?.id]);

  return {
    ...scope,
    showHidden,
    setShowHidden: (next) =>
      setState((value) => ({ ...value, showHidden: next })),
  };
}
