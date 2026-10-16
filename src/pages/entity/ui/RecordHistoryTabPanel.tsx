import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  describeEntityRecordChanges,
  getSystemUserNameByAuthId,
  RecordChangeList,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityValueContext,
} from "@/entities/entity";
import {
  useEntityRecordEvents,
  type EntityRecordEvent,
} from "@/entities/history";
import { addCalendarDays, todayIsoDate } from "@/shared/lib/business-days";
import {
  formatDateDisplay,
  getLocalTimestampParts,
} from "@/shared/lib/format-date";
import { getPersonInitials } from "@/shared/lib/person";

/** Server writes are async: refetch a moment after a local change. */
const HISTORY_REFRESH_DELAY_MS = 1200;

type RecordHistoryTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

function dayLabel(day: string, today: string) {
  if (day === today) return "Сегодня";
  if (day === addCalendarDays(today, -1)) return "Вчера";
  return formatDateDisplay(day);
}

function HistoryEventItem({
  ctx,
  entity,
  event,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  event: EntityRecordEvent;
}) {
  const name =
    getSystemUserNameByAuthId(ctx.entities, event.actorId) ??
    (event.actorId ? "Пользователь" : "Система");
  const time = getLocalTimestampParts(event.createdAt)?.time ?? "";

  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/30">
      <span
        aria-hidden
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tracking-wide text-primary"
      >
        {getPersonInitials(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-h-7 min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate font-medium text-foreground">{name}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {time}
          </span>
          {event.action === "insert" ? (
            <span className="shrink-0 text-muted-foreground">
              · создание записи
            </span>
          ) : event.action === "delete" ? (
            <span className="shrink-0 text-muted-foreground">
              · удаление записи
            </span>
          ) : null}
        </p>
        {event.action === "update" ? (
          <RecordChangeList ctx={ctx} entity={entity} changes={event.changes} />
        ) : null}
      </div>
    </li>
  );
}

/** Change feed of one record, grouped by day (newest first). */
export function RecordHistoryTabPanel({
  entity,
  record,
  tab,
}: RecordHistoryTabPanelProps) {
  const valueContext = useEntityValueContext();
  const [reloadToken, setReloadToken] = useState(record.values);
  useEffect(() => {
    if (reloadToken === record.values) return;
    const timer = window.setTimeout(
      () => setReloadToken(record.values),
      HISTORY_REFRESH_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [record.values, reloadToken]);

  const { events, hasMore, status, error, loadingMore, loadMore } =
    useEntityRecordEvents({ recordId: record.id }, reloadToken);

  const groups = useMemo(() => {
    const result: Array<{ day: string; events: EntityRecordEvent[] }> = [];
    for (const event of events) {
      if (
        event.action === "update" &&
        describeEntityRecordChanges(entity, event.changes).length === 0
      ) {
        continue;
      }
      const day = getLocalTimestampParts(event.createdAt)?.date ?? "";
      const last = result[result.length - 1];
      if (last?.day === day) last.events.push(event);
      else result.push({ day, events: [event] });
    }
    return result;
  }, [entity, events]);
  const today = todayIsoDate();

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {tab.name}
        </h2>
      </header>

      <div className="p-4">
        {status === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="size-7 animate-pulse rounded-full bg-muted/60" />
                <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted/50" />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            Не удалось загрузить историю: {error}
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Изменений пока нет.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.day} className="flex flex-col gap-1">
                <p className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {dayLabel(group.day, today)}
                </p>
                <ul className="flex flex-col">
                  {group.events.map((event) => (
                    <HistoryEventItem
                      key={event.id}
                      ctx={valueContext}
                      entity={entity}
                      event={event}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-center"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Загрузка…" : "Показать ещё"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
