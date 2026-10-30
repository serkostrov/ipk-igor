import { useMemo, useState } from "react";
import { ClockPlus, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useCanEntity } from "@/entities/access";
import { useNow } from "@/shared/hooks/use-now";
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
  if (row.hours != null) {
    return (
      <span className="font-medium tabular-nums text-foreground">
        {formatEntityComputedNumber(row.hours)} ч
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          ({formatElapsed(entryDurationMs(row, nowMs))})
        </span>
      </span>
    );
  }
  return (
    <span className="font-medium tabular-nums text-foreground">
      {formatElapsed(entryDurationMs(row, nowMs))}
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
  const showActions = canEdit || canDelete;

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

      <div className="p-0">
        {!entries ? (
          <p className="m-4 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Учёт времени для этой сущности не настроен. Включите его в
            настройках сущности («Работа с записями» → «Учёт времени»), затем
            сессии появятся здесь.
          </p>
        ) : count === 0 ? (
          <p className="m-4 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Сессий пока нет — запустите таймер или добавьте время вручную.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Исполнитель</TableHead>
                <TableHead>Начало</TableHead>
                <TableHead>Окончание</TableHead>
                <TableHead>Длительность</TableHead>
                <TableHead>Комментарий</TableHead>
                {showActions ? (
                  <TableHead className="w-24 pr-4 text-right"> </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row) => {
                const employeeName = row.employeeId
                  ? getSystemUserName(entities, row.employeeId)
                  : null;
                return (
                  <TableRow key={row.entry.id}>
                    <TableCell className="pl-4 font-medium text-foreground">
                      {employeeName || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatCellDatetime(row.startedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {row.running ? (
                        <span className="font-medium text-foreground">
                          идёт
                        </span>
                      ) : (
                        formatCellDatetime(row.endedAt)
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DurationCell row={row} nowMs={now} />
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                      {row.comment || "—"}
                    </TableCell>
                    {showActions ? (
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && !row.running ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-foreground"
                              title="Редактировать"
                              onClick={() => setEditRow(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Удалить"
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
        )}
      </div>

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
