import { useMemo } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { readVisibleEntityRecords, scopeValueContext } from "@/entities/access";
import { todayIsoDate } from "@/shared/lib/business-days";
import {
  useEntityConfig,
  useEntityValueContext,
  usePageRecordScope,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  listDealCardSourceIds,
  resolveDealCardSources,
  type DealCardSources,
} from "../match";
import { buildDealCardView, type DealCardView } from "../model/deal-card-view";
import { collectDealCardData, type DealCardData } from "../model/deal-data";

export type DealCardState =
  | { ready: false; sources: DealCardSources }
  | {
      ready: true;
      sources: DealCardSources;
      data: DealCardData;
      view: DealCardView;
    };

/** Loads the deal's related entities and derives the card view model. */
export function useDealCard(entity: Entity, record: EntityRecord) {
  const { entities } = useEntityConfig();
  const ctx = useEntityValueContext();
  const sources = useMemo(
    () => resolveDealCardSources(entity, entities),
    [entity, entities],
  );
  const sourceIds = useMemo(() => listDealCardSourceIds(sources), [sources]);
  const { ready } = usePageRecordScope(sourceIds);
  const visibleIds = useAsyncValue(async () => {
    const map = new Map<string, Set<string>>();
    for (const id of sourceIds) {
      const source = entities.find((item) => item.id === id);
      if (!source) continue;
      const records = await readVisibleEntityRecords(source);
      map.set(source.id, new Set(records.map((item) => item.id)));
    }
    return map;
  }, [entities, sourceIds]);
  const scoped =
    visibleIds.status === "ready"
      ? scopeValueContext(ctx, visibleIds.value)
      : null;

  const view = useMemo<DealCardState>(() => {
    if (!ready || !scoped) return { ready: false, sources };
    const data = collectDealCardData(scoped, sources, record);
    return {
      ready: true,
      sources,
      data,
      view: buildDealCardView(data, todayIsoDate()),
    };
  }, [ready, scoped, sources, record]);
  if (visibleIds.status === "error") throw visibleIds.error;
  return view;
}
