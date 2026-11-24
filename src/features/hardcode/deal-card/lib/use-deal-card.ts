import { useMemo } from "react";
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
  const { ready } = usePageRecordScope(listDealCardSourceIds(sources));

  return useMemo<DealCardState>(() => {
    if (!ready) return { ready: false, sources };
    const data = collectDealCardData(ctx, sources, record);
    return {
      ready: true,
      sources,
      data,
      view: buildDealCardView(data, todayIsoDate()),
    };
  }, [ready, ctx, sources, record]);
}
