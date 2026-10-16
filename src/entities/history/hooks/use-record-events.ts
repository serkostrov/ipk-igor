import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEntityRecordEvents } from "../api/history-api";
import type {
  EntityRecordEvent,
  EntityRecordEventsQuery,
} from "../model/types";

const PAGE_SIZE = 50;

export type EntityRecordEventsStatus = "loading" | "ready" | "error";

type EventsState = {
  key: string;
  events: EntityRecordEvent[];
  hasMore: boolean;
  status: EntityRecordEventsStatus;
  error: string | null;
};

function queryKey(query: EntityRecordEventsQuery) {
  const normalized: EntityRecordEventsQuery = {};
  if (query.recordId) normalized.recordId = query.recordId;
  if (query.entityId) normalized.entityId = query.entityId;
  if (query.actorId) normalized.actorId = query.actorId;
  if (query.from) normalized.from = query.from;
  if (query.to) normalized.to = query.to;
  return JSON.stringify(normalized);
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось загрузить историю изменений";
}

/** Paged change log for a record or the whole workspace (newest first). */
export function useEntityRecordEvents(
  query: EntityRecordEventsQuery,
  reloadToken: unknown = null,
) {
  const key = queryKey(query);
  const stableQuery = useMemo(
    () => JSON.parse(key) as EntityRecordEventsQuery,
    [key],
  );
  const [state, setState] = useState<EventsState>({
    key: "",
    events: [],
    hasMore: false,
    status: "loading",
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchEntityRecordEvents(stableQuery, { offset: 0, limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setState({
          key,
          events: page.events,
          hasMore: page.hasMore,
          status: "ready",
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          key,
          events: [],
          hasMore: false,
          status: "error",
          error: errorText(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, stableQuery, reloadToken]);

  const isCurrent = state.key === key;

  const loadMore = useCallback(() => {
    if (!isCurrent || !state.hasMore || loadingMore) return;
    setLoadingMore(true);
    void fetchEntityRecordEvents(stableQuery, {
      offset: state.events.length,
      limit: PAGE_SIZE,
    })
      .then((page) => {
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                events: [...previous.events, ...page.events],
                hasMore: page.hasMore,
              }
            : previous,
        );
      })
      .catch((error: unknown) => {
        setState((previous) => ({
          ...previous,
          status: "error",
          error: errorText(error),
        }));
      })
      .finally(() => setLoadingMore(false));
  }, [
    isCurrent,
    key,
    loadingMore,
    stableQuery,
    state.events.length,
    state.hasMore,
  ]);

  return {
    events: isCurrent ? state.events : [],
    hasMore: isCurrent && state.hasMore,
    status: isCurrent ? state.status : ("loading" as const),
    error: isCurrent ? state.error : null,
    loadingMore,
    loadMore,
  };
}
