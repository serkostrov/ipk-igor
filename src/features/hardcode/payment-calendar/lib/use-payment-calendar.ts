import { useMemo } from "react";
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
  const { ready: recordsReady } = usePageRecordScope(
    sources ? listPaymentCalendarSourceIds(sources) : [],
  );
  const allocations = usePaymentAllocations();
  if (allocations.status === "error") throw allocations.error;
  const allocationList =
    allocations.status === "ready" ? allocations.value : null;
  const ready = recordsReady && allocationList != null;

  // Relation targets not kept in the store are primed into `ctx` in place
  // (same object), so the prime version is what signals "labels resolved".
  const primeVersion = getRecordPrimeVersion();

  return useMemo(() => {
    const today = todayIsoDate();
    if (!sources || !ready) return { sources, ready, calendar: null, today };
    const { stages, receipts } = collectPaymentCalendarData(ctx, sources);
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
  }, [ctx, sources, ready, allocationList, primeVersion]);
}
