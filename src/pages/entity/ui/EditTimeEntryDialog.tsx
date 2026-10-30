import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { TimePicker } from "@/shared/ui/time-picker";
import { parseLocalDatetime, toLocalDatetime } from "@/shared/lib/datetime";
import { joinDatetime, splitDatetime } from "@/shared/lib/format-date";
import {
  formatEntityComputedNumber,
  getTimeEntryHours,
  updateTimeEntry,
  type Entity,
  type EntityTimeEntryRow,
} from "@/entities/entity";

type EditTimeEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  row: EntityTimeEntryRow | null;
};

function EditTimeEntryForm({
  entity,
  row,
  onClose,
}: {
  entity: Entity;
  row: EntityTimeEntryRow;
  onClose: () => void;
}) {
  const initialStart = row.startedAt
    ? splitDatetime(toLocalDatetime(row.startedAt))
    : { date: "", time: "" };
  const initialEnd = row.endedAt
    ? splitDatetime(toLocalDatetime(row.endedAt))
    : { date: "", time: "" };

  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time || "09:00");
  const [endDate, setEndDate] = useState(initialEnd.date || initialStart.date);
  const [endTime, setEndTime] = useState(initialEnd.time || "18:00");
  const [comment, setComment] = useState(row.comment ?? "");
  const [error, setError] = useState<string | null>(null);

  const start = parseLocalDatetime(joinDatetime(startDate, startTime));
  const end = parseLocalDatetime(joinDatetime(endDate, endTime));
  const hours =
    start && end && end.getTime() > start.getTime()
      ? getTimeEntryHours(start, end)
      : null;

  function submit() {
    try {
      updateTimeEntry(entity.id, row.entry.id, {
        start: joinDatetime(startDate, startTime),
        end: joinDatetime(endDate, endTime),
        comment,
      });
      onClose();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось сохранить сессию",
      );
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Редактировать сессию</DialogTitle>
        <DialogDescription>
          Измените начало, окончание и комментарий. Длительность пересчитается
          автоматически.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Начало</Label>
          <div className="grid grid-cols-[1.25fr_1fr] gap-2">
            <DatePicker
              id="edit-time-start-date"
              value={startDate}
              aria-label="Дата начала"
              onChange={(next) => {
                setStartDate(next);
                if (!endDate || next > endDate) setEndDate(next);
              }}
            />
            <TimePicker
              id="edit-time-start-time"
              value={startTime}
              aria-label="Время начала"
              onChange={setStartTime}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Окончание</Label>
          <div className="grid grid-cols-[1.25fr_1fr] gap-2">
            <DatePicker
              id="edit-time-end-date"
              value={endDate}
              aria-label="Дата окончания"
              onChange={setEndDate}
            />
            <TimePicker
              id="edit-time-end-time"
              value={endTime}
              aria-label="Время окончания"
              onChange={setEndTime}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-time-comment">Комментарий</Label>
          <Textarea
            id="edit-time-comment"
            value={comment}
            placeholder="Что было сделано"
            className="min-h-16 resize-none"
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        {hours != null ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm tabular-nums text-foreground">
            Длительность: {formatEntityComputedNumber(hours)} ч
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Укажите корректный интервал, чтобы увидеть длительность.
          </p>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={hours == null} onClick={submit}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditTimeEntryDialog({
  open,
  onOpenChange,
  entity,
  row,
}: EditTimeEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && row ? (
          <EditTimeEntryForm
            key={row.entry.id}
            entity={entity}
            row={row}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
