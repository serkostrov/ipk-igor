import { useMemo, useState } from "react";
import { entityScope, useCurrentRole } from "@/entities/access";
import {
  getEntityHiddenListOptionIds,
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

  const scope = useMemo(() => {
    if (!entity) {
      return {
        records: [],
        hiddenCount: 0,
        hiddenOptionIds: new Map<string, Set<string>>(),
      };
    }
    const dataScope = entityScope(role, entity.id);
    const authUserId = sessionUser?.id ?? null;
    const ownRecords =
      dataScope === "own"
        ? entity.records.filter(
            (record) =>
              (authUserId != null &&
                (record.createdBy === authUserId ||
                  record.authUserId === authUserId)) ||
              record.id === getCurrentUserRecordId(),
          )
        : entity.records;
    const hiddenOptionIds = getEntityHiddenListOptionIds(entity, ctx.entities);
    const unhidden = ownRecords.filter(
      (record) => !isEntityRecordHidden(record, hiddenOptionIds),
    );
    return {
      records: showHidden ? ownRecords : unhidden,
      hiddenCount: ownRecords.length - unhidden.length,
      hiddenOptionIds,
    };
  }, [ctx.entities, entity, showHidden, role, sessionUser?.id]);

  return {
    ...scope,
    showHidden,
    setShowHidden: (next) =>
      setState((value) => ({ ...value, showHidden: next })),
  };
}
