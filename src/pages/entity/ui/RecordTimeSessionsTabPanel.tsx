import { useEffect, useMemo, useState } from "react";
import { Clock, ClockPlus, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useCanEntity } from "@/entities/access";
import { useNow } from "@/shared/hooks/use-now";
import { cn } from "@/shared/lib/cn";
import { formatElapsed, toLocalDatetime } from "@/shared/lib/datetime";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  ensureEntityTimeTracking,
  formatEntityComputedNumber,
  getEntityTimeTracking,
  getSystemUserName,
  listRecordTimeEntries,
  removeEntityRecord,
  useEntityConfig,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTimeEntryRow,
} from "@/entities/entity";
import { EditTimeEntryDialog } from "./EditTimeEntryDialog";
import { TimeEntryDialog } from "./TimeEntryDialog";
import { TimerElapsed } from "./RecordTimer";
import { useRecordTimers } from "./use-record-timers";

type RecordTimeSessionsTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

function formatCellDatetime(date: Date | null) {
  if (!date) return "—";
  return formatDatetimeDisplay(toLocalDatetime(date)) || "—";
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

function DurationCell({
  row,
  nowMs,
}: {
  row: EntityTimeEntryRow;
  nowMs: number;
}) {
  if (row.running && row.startedAt) {
    return (
      <span className="font-medium tabular-nums text-foreground">
        <TimerElapsed startedAt={row.startedAt} />
      </span>
    );
  }
  const ms = entryDurationMs(row, nowMs);
  if (ms <= 0 && row.hours == null)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-medium tabular-nums text-foreground">
      {formatElapsed(ms)}
      {row.hours != null ? (
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          · {formatEntityComputedNumber(row.hours)} ч
        </span>
      ) : null}
    </span>
  );
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
  const [editRow, setEditRow] = useState<EntityTimeEntryRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<EntityTimeEntryRow | null>(null);

  useEffect(() => {
    if (getEntityTimeTracking(entity, entities)) return;
    ensureEntityTimeTracking(entity.id);
  }, [entity, entities]);

  const setup = getEntityTimeTracking(entity, entities);
  const entryEntityId = setup?.entryEntity.id ?? "";
  const canEdit = useCanEntity(entryEntityId, "update");
  const canDelete = useCanEntity(entryEntityId, "delete");

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
  const showActions = Boolean(setup) && (canEdit || canDelete);

  return (
    <section
      aria-label={tab.name}
      className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clock className="size-3.5" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {tab.name}
            </h2>
          </div>
          {entries ? (
            <p className="text-xs text-muted-foreground">
              {count > 0 ? (
                <>
                  {count} {pluralRu(count, "сессия", "сессии", "сессий")} ·
                  итого{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatElapsed(totalMs)}
                  </span>
                  {totalMs > 0 ? (
                    <span>
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
          <div className="flex flex-wrap items-center gap-1.5">
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
                  <span className="tabular-nums">
                    <TimerElapsed startedAt={running.startedAt} />
                  </span>
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
      </div>

      {!entries ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
          Подготавливаем учёт времени…
        </p>
      ) : count === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
          Сессий пока нет — запустите таймер или добавьте время вручную.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-3 text-xs">Исполнитель</TableHead>
                <TableHead className="h-9 text-xs">
                  Дата и время начала
                </TableHead>
                <TableHead className="h-9 text-xs">
                  Дата и время конца
                </TableHead>
                <TableHead className="h-9 text-xs">Длительность</TableHead>
                <TableHead className="h-9 text-xs">Комментарий</TableHead>
                {showActions ? (
                  <TableHead className="h-9 w-[4.5rem] pr-2 text-right text-xs">
                    <span className="sr-only">Действия</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row) => {
                const employeeName = row.employeeId
                  ? getSystemUserName(entities, row.employeeId)
                  : null;
                return (
                  <TableRow
                    key={row.entry.id}
                    className={cn(row.running && "bg-primary/[0.03]")}
                  >
                    <TableCell className="pl-3 text-sm font-medium text-foreground">
                      {employeeName || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {formatCellDatetime(row.startedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      {row.running ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-primary"
                          />
                          идёт
                        </span>
                      ) : (
                        formatCellDatetime(row.endedAt)
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <DurationCell row={row} nowMs={now} />
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                      {row.comment || "—"}
                    </TableCell>
                    {showActions ? (
                      <TableCell className="pr-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && !row.running ? (
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="text-muted-foreground hover:text-foreground"
                              title="Редактировать"
                              aria-label="Редактировать сессию"
                              onClick={() => setEditRow(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              title="Удалить"
                              aria-label="Удалить сессию"
                              onClick={() => setDeleteRow(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {timers.dialog}
      <TimeEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entity={entity}
        record={record}
      />
      <EditTimeEntryDialog
        open={editRow != null}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        entity={entity}
        row={editRow}
      />
      <ConfirmDialog
        open={deleteRow != null}
        onOpenChange={(open) => {
          if (!open) setDeleteRow(null);
        }}
        title="Удалить сессию?"
        description="Запись времени будет удалена без возможности восстановления."
        confirmLabel="Удалить"
        onConfirm={() => {
          if (!deleteRow || !setup) return;
          removeEntityRecord(setup.entryEntity.id, deleteRow.entry.id);
        }}
      />
    </section>
  );
}
