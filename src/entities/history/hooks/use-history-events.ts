import { useEffect, useMemo, useState } from "react";
import { fetchEntityRecordEvents, fetchEntityEvents } from "../api/history-api";
import type {
  EntityEventsQuery,
  EntityRecordEventsQuery,
  HistoryLabels,
} from "../model/types";

const PAGE_SIZE = 50;

/** Stable empty-map reference so consumers' deps don't churn while loading. */
const EMPTY_LABELS: HistoryLabels = {};

export type EntityRecordEventsStatus = "loading" | "ready" | "error";

type EventsState<T> = {
  query: EntityRecordEventsQuery;
  reloadToken: unknown;
  events: T[];
  hasMore: boolean;
  /** Server-resolved `id → label` map (empty for sources without labels). */
  labels: HistoryLabels;
  status: EntityRecordEventsStatus;
  error: string | null;
};

function errorText(error: unknown) {
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "Не удалось загрузить историю изменений";
}

function usePagedEvents<T>(
  { recordId, entityId, actorId, from, to }: EntityRecordEventsQuery,
  fetchPage: (
    query: EntityRecordEventsQuery,
    page: { offset: number; limit: number },
  ) => Promise<{ events: T[]; hasMore: boolean; labels?: HistoryLabels }>,
  reloadToken: unknown = null,
) {
  const query = useMemo(
    () => ({ recordId, entityId, actorId, from, to }),
    [recordId, entityId, actorId, from, to],
  );
  const [state, setState] = useState<EventsState<T> | null>(null);
  const [loadingPage, setLoadingPage] = useState<EventsState<T> | null>(null);
  const current =
    state?.query === query && Object.is(state.reloadToken, reloadToken)
      ? state
      : null;

  useEffect(() => {
    let cancelled = false;
    void fetchPage(query, { offset: 0, limit: PAGE_SIZE })
      .then((page) => {
        if (!cancelled)
          setState({
            query,
            reloadToken,
            ...page,
            labels: page.labels ?? {},
            status: "ready",
            error: null,
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            query,
            reloadToken,
            events: [],
            hasMore: false,
            labels: {},
            status: "error",
            error: errorText(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadToken, fetchPage]);

  async function loadMore() {
    if (!current?.hasMore || loadingPage === current) return;
    setLoadingPage(current);
    try {
      const page = await fetchPage(query, {
        offset: current.events.length,
        limit: PAGE_SIZE,
      });
      setState((previous) =>
        previous === current
          ? {
              ...current,
              events: [...current.events, ...page.events],
              hasMore: page.hasMore,
              labels: { ...current.labels, ...(page.labels ?? {}) },
              status: "ready",
              error: null,
            }
          : previous,
      );
    } catch (error) {
      setState((previous) =>
        previous === current
          ? { ...current, status: "error", error: errorText(error) }
          : previous,
      );
    } finally {
      setLoadingPage((previous) => (previous === current ? null : previous));
    }
  }

  return {
    events: current?.events ?? [],
    hasMore: current?.hasMore ?? false,
    labels: current?.labels ?? EMPTY_LABELS,
    status: current?.status ?? "loading",
    error: current?.error ?? null,
    loadingMore: current !== null && loadingPage === current,
    loadMore,
  };
}

export function useEntityRecordEvents(
  query: EntityRecordEventsQuery,
  reloadToken: unknown = null,
) {
  return usePagedEvents(query, fetchEntityRecordEvents, reloadToken);
}

export function useEntityEvents(query: EntityEventsQuery) {
  return usePagedEvents(query, fetchEntityEvents);
}
