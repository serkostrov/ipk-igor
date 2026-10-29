import { useMemo, useState } from "react";
import { ClockPlus, Play, Square } from "lucide-react";
import { useNow } from "@/shared/hooks/use-now";
import { formatElapsed, toLocalDatetime } from "@/shared/lib/datetime";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";
import {
  formatEntityComputedNumber,
  getSystemUserName,
  listRecordTimeEntries,
  useEntityConfig,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTimeEntryRow,
} from "@/entities/entity";
import { TimeEntryDialog } from "./TimeEntryDialog";
import { TimerElapsed } from "./RecordTimer";
import { useRecordTimers } from "./use-record-timers";

type RecordTimeSessionsTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

function formatEntryRange(row: EntityTimeEntryRow) {
  if (!row.startedAt) return "—";
  const startLabel = formatDatetimeDisplay(toLocalDatetime(row.startedAt));
  if (row.running || !row.endedAt) return `${startLabel} · идёт`;
  const endLabel = formatDatetimeDisplay(toLocalDatetime(row.endedAt));
  const endTime = endLabel.includes(" ")
    ? endLabel.slice(endLabel.lastIndexOf(" ") + 1)
    : endLabel;
  return `${startLabel} → ${endTime}`;
}

function entryDurationMs(row: EntityTimeEntryRow, nowMs: number) {
  if (row.running && row.startedAt) {
    return Math.max(0, nowMs - row.startedAt.getTime());
  }
  if (row.hours != null && Number.isFinite(row.hours)) {
    return Math.round(row.hours * 3_600_000);
  }
  if (row.startedAt && row.endedAt) {
    return Math.max(0, row.endedAt.getTime() - row.startedAt.getTime());
  }
  return 0;
}

export function RecordTimeSessionsTabPanel({
  entity,
  record,
  tab,
}: RecordTimeSessionsTabPanelProps) {
  const { entities } = useEntityConfig();
  const timers = useRecordTimers(entity);
  const now = useNow(1000);
  const [manualOpen, setManualOpen] = useState(false);

  const entries = useMemo(
    () => listRecordTimeEntries(entity, record.id, entities),
    [entity, record.id, entities],
  );

  const totalMs = useMemo(() => {
    if (!entries) return 0;
    return entries.reduce((sum, row) => sum + entryDurationMs(row, now), 0);
  }, [entries, now]);

  const count = entries?.length ?? 0;
  const running = timers.runningRecordId === record.id ? timers.running : null;
  const canStart = timers.canStart(record);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex flex-col gap-0.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {tab.name}
          </h2>
          {entries ? (
            <p className="text-sm text-muted-foreground">
              {count > 0 ? (
                <>
                  {count} {pluralRu(count, "сессия", "сессии", "сессий")} ·
                  итого{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatElapsed(totalMs)}
                  </span>
                  {totalMs > 0 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({formatEntityComputedNumber(totalMs / 3_600_000)} ч)
                    </span>
                  ) : null}
                </>
              ) : (
                "Сессий пока нет"
              )}
            </p>
          ) : null}
        </div>

        {timers.enabled ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={running ? "default" : "outline"}
              className="h-8 gap-1.5"
              disabled={!running && !canStart}
              title={
                running
                  ? "Остановить таймер"
                  : canStart
                    ? "Запустить таймер"
                    : "Таймер недоступен в этом статусе"
              }
              onClick={() => timers.toggle(record)}
            >
              {running ? (
                <>
                  <Square className="size-3 fill-current" />
                  <TimerElapsed startedAt={running.startedAt} />
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current" />
                  Запустить
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => setManualOpen(true)}
            >
              <ClockPlus className="size-3.5" />
              Вручную
            </Button>
          </div>
        ) : null}
      </header>

      <div className="p-4">
        {!entries ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Учёт времени для этой сущности не настроен. Включите его в
            настройках сущности, затем сессии появятся здесь.
          </p>
        ) : count === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Сессий пока нет — запустите таймер или добавьте время вручную.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map((row) => {
              const employeeName = row.employeeId
                ? getSystemUserName(entities, row.employeeId)
                : null;
              return (
                <li
                  key={row.entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="truncate text-muted-foreground">
                      {formatEntryRange(row)}
                      {row.running ? (
                        <span className="ml-1.5 font-medium text-foreground">
                          · идёт
                        </span>
                      ) : null}
                    </span>
                    {employeeName || row.comment ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {[employeeName, row.comment]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                    {row.running && row.startedAt ? (
                      <TimerElapsed startedAt={row.startedAt} />
                    ) : row.hours != null ? (
                      `${formatEntityComputedNumber(row.hours)} ч`
                    ) : (
                      formatElapsed(entryDurationMs(row, now))
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {timers.dialog}
      <TimeEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entity={entity}
        record={record}
      />
    </section>
  );
}
