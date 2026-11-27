import { useMemo } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { readVisibleEntityRecords, scopeValueContext } from "@/entities/access";
import { todayIsoDate } from "@/shared/lib/business-days";
import {
  getRecordPrimeVersion,
  useEntityConfig,
  useEntityValueContext,
  usePageRecordScope,
} from "@/entities/entity";
import {
  listPaymentCalendarSourceIds,
  resolvePaymentCalendarSources,
  type PaymentCalendarSources,
} from "../match";
import { collectPaymentCalendarData } from "../model/collect";
import { buildPaymentCalendar } from "../model/schedule";
import type { PaymentCalendar } from "../model/types";
import { usePaymentAllocations } from "./use-payment-allocations";

export type PaymentCalendarState = {
  sources: PaymentCalendarSources | null;
  ready: boolean;
  calendar: PaymentCalendar | null;
  today: string;
};

/** Loads the entities the calendar reads and derives plan vs. fact rows. */
export function usePaymentCalendar(): PaymentCalendarState {
  const { entities } = useEntityConfig();
  const ctx = useEntityValueContext();
  const sources = useMemo(
    () => resolvePaymentCalendarSources(entities),
    [entities],
  );
  const sourceIds = useMemo(
    () => (sources ? listPaymentCalendarSourceIds(sources) : []),
    [sources],
  );
  const { ready: recordsReady } = usePageRecordScope(sourceIds);
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
  const allocations = usePaymentAllocations();
  const allocationList =
    allocations.status === "ready" ? allocations.value : null;
  const ready = recordsReady && allocationList != null && scoped != null;

  // Relation targets not kept in the store are primed into `ctx` in place
  // (same object), so the prime version is what signals "labels resolved".
  const primeVersion = getRecordPrimeVersion();

  const calendar = useMemo(() => {
    const today = todayIsoDate();
    if (!sources || !ready || !scoped) {
      return { sources, ready, calendar: null, today };
    }
    const { stages, receipts } = collectPaymentCalendarData(scoped, sources);
    return {
      sources,
      ready,
      calendar: buildPaymentCalendar({
        stages,
        receipts,
        allocations: allocationList,
        today,
      }),
      today,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primeVersion re-runs the read after async priming
  }, [scoped, sources, ready, allocationList, primeVersion]);
  if (visibleIds.status === "error") throw visibleIds.error;
  if (allocations.status === "error") throw allocations.error;
  return calendar;
}
