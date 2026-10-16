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
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  addManualTimeEntries,
  formatEntityComputedNumber,
  getEntityTimeTracking,
  getLoggedHoursByDay,
  normalizeEntityDecimalInput,
  parseEntityDecimal,
  planManualTimeEntries,
  useCurrentUserRecordId,
  useEntityConfig,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { todayIsoDate } from "@/shared/lib/business-days";
import { formatDateDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";

type TimeEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  record: EntityRecord;
};

function TimeEntryForm({
  entity,
  record,
  onClose,
}: {
  entity: Entity;
  record: EntityRecord;
  onClose: () => void;
}) {
  const { entities } = useEntityConfig();
  const userRecordId = useCurrentUserRecordId();
  const setup = getEntityTimeTracking(entity, entities);
  const today = todayIsoDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [hours, setHours] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hoursPerDay = parseEntityDecimal(hours);
  const plan =
    setup && userRecordId && Number.isFinite(hoursPerDay) && hoursPerDay > 0
      ? planManualTimeEntries({
          dateFrom,
          dateTo: dateTo || dateFrom,
          hoursPerDay,
          dailyLimitHours: setup.config.dailyLimitHours,
          loggedByDay: getLoggedHoursByDay(
            setup.entryEntity,
            setup.config,
            userRecordId,
          ),
        })
      : null;
  const limit = setup?.config.dailyLimitHours ?? 0;
  const canSubmit =
    plan != null && plan.days.length > 0 && plan.overLimitDays.length === 0;

  function submit() {
    if (!canSubmit) return;
    try {
      addManualTimeEntries(entity.id, record.id, {
        dateFrom,
        dateTo: dateTo || dateFrom,
        hoursPerDay,
        comment,
      });
      onClose();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось добавить время",
      );
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Добавить время</DialogTitle>
        <DialogDescription>
          {limit > 0
            ? `Записи по рабочим дням, не больше ${limit} ч в день.`
            : "Записи по рабочим дням периода."}
        </DialogDescription>
      </DialogHeader>

      {!userRecordId ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
          Профиль пользователя не найден — время некому записать.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="time-entry-from">С</Label>
              <DatePicker
                id="time-entry-from"
                value={dateFrom}
                aria-label="Дата начала"
                onChange={(next) => {
                  setDateFrom(next);
                  if (!dateTo || next > dateTo) setDateTo(next);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="time-entry-to">По</Label>
              <DatePicker
                id="time-entry-to"
                value={dateTo}
                aria-label="Дата окончания"
                onChange={setDateTo}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="time-entry-hours">Часов в день</Label>
            <Input
              id="time-entry-hours"
              type="text"
              inputMode="decimal"
              value={hours}
              placeholder="4"
              onChange={(event) =>
                setHours(normalizeEntityDecimalInput(event.target.value))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="time-entry-comment">Комментарий</Label>
            <Textarea
              id="time-entry-comment"
              value={comment}
              placeholder="Что было сделано"
              className="min-h-16 resize-none"
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          {plan ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground tabular-nums">
              {plan.days.length === 0
                ? "В периоде нет рабочих дней"
                : `${plan.days.length} ${pluralRu(plan.days.length, "раб. день", "раб. дня", "раб. дней")} × ${formatEntityComputedNumber(hoursPerDay)} ч = ${formatEntityComputedNumber(plan.totalHours)} ч`}
            </p>
          ) : null}
          {plan && plan.overLimitDays.length > 0 ? (
            <p className="text-sm text-destructive" role="alert">
              Больше {limit} ч в день:{" "}
              {plan.overLimitDays.map(formatDateDisplay).join(", ")}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={submit}>
          Добавить
        </Button>
      </DialogFooter>
    </>
  );
}

export function TimeEntryDialog({
  open,
  onOpenChange,
  entity,
  record,
}: TimeEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open ? (
          <TimeEntryForm
            entity={entity}
            record={record}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
