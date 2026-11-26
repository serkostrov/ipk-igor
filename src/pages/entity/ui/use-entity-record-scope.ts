import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { useState } from "react";
import { filterVisibleEntityRecords, useCurrentRole } from "@/entities/access";
import {
  getEntityHiddenListOptionIds,
  getEntityRecords,
  getEntityRecordsLoadStatus,
  getCurrentUserRecordId,
  isEntityRecordHidden,
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

  const recordsLoadStatus = entity
    ? getEntityRecordsLoadStatus(entity.id)
    : "unloaded";
  const recordsCount = entity?.records.length ?? 0;

  const scope = useAsyncValue(async () => {
    void recordsLoadStatus;
    void recordsCount;
    if (!entity) {
      return {
        records: [],
        hiddenCount: 0,
        hiddenOptionIds: new Map<string, Set<string>>(),
      };
    }
    const authUserId = sessionUser?.id ?? null;
    const currentUserRecordId = getCurrentUserRecordId();
    const records = await getEntityRecords(entity);
    const scopedRecords = await filterVisibleEntityRecords(
      role,
      entity,
      records,
      {
        entities: ctx.entities,
        authUserId,
        currentUserRecordId,
        valueContext: ctx,
      },
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
  }, [
    ctx,
    entity,
    showHidden,
    role,
    sessionUser?.id,
    // Re-filter after page-scoped load fills entity.records.
    recordsLoadStatus,
    recordsCount,
  ]);
  if (scope.status === "error") throw scope.error;

  return {
    ...(scope.status === "ready"
      ? scope.value
      : {
          records: [],
          hiddenCount: 0,
          hiddenOptionIds: new Map<string, Set<string>>(),
        }),
    showHidden,
    setShowHidden: (next) =>
      setState((value) => ({ ...value, showHidden: next })),
  };
}
