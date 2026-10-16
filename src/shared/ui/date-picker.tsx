"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import { formatDateDisplay } from "@/shared/lib/format-date";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const YEAR_SPAN = 80;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseISODate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function buildYearOptions(centerYear: number) {
  const start = centerYear - YEAR_SPAN;
  const end = centerYear + 10;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Выберите дату",
  "aria-label": ariaLabel,
  className,
}: DatePickerProps) {
  const selected = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selected ?? new Date()),
  );

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const years = useMemo(() => buildYearOptions(today.getFullYear()), [today]);

  const label = formatDateDisplay(value) || placeholder;
  const monthValue = String(visibleMonth.getMonth());
  const yearValue = String(visibleMonth.getFullYear());

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setVisibleMonth(startOfMonth(selected ?? new Date()));
        }
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={ariaLabel}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-9 w-full justify-start gap-2 px-2.5 font-normal shadow-xs",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[20rem] gap-3 overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <Button
            type="button"
            variant="default"
            size="icon-sm"
            aria-label="Предыдущий месяц"
            className="shrink-0"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
          >
            <ChevronLeft />
          </Button>

          <div className="grid min-w-0 flex-1 grid-cols-[1.4fr_0.9fr] gap-1.5">
            <Select
              value={monthValue}
              onValueChange={(next) => {
                if (next == null) return;
                const month = Number(next);
                setVisibleMonth(new Date(visibleMonth.getFullYear(), month, 1));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Месяц"
                className="h-8 w-full min-w-0 rounded-[min(var(--radius-md),10px)] border-border bg-background px-2.5 text-xs font-medium shadow-xs"
              >
                <SelectValue>{MONTHS[visibleMonth.getMonth()]}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="max-h-64 min-w-40">
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={yearValue}
              onValueChange={(next) => {
                if (next == null) return;
                const year = Number(next);
                setVisibleMonth(new Date(year, visibleMonth.getMonth(), 1));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Год"
                className="h-8 w-full min-w-0 rounded-[min(var(--radius-md),10px)] border-border bg-background px-2.5 text-xs font-medium tabular-nums shadow-xs"
              >
                <SelectValue>{visibleMonth.getFullYear()}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-64 min-w-24">
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="default"
            size="icon-sm"
            aria-label="Следующий месяц"
            className="shrink-0"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-3 pt-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="flex h-8 items-center justify-center text-[11px] font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = day.getMonth() === visibleMonth.getMonth();
            const isSelected = selected ? isSameDay(day, selected) : false;
            const isToday = isSameDay(day, today);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  onChange(toISODate(day));
                  setOpen(false);
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-[min(var(--radius-md),10px)] text-sm transition-colors",
                  !inMonth && "text-muted-foreground/40",
                  inMonth && !isSelected && "text-foreground hover:bg-muted",
                  isToday && !isSelected && "ring-1 ring-primary/35 ring-inset",
                  isSelected &&
                    "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Очистить
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => {
              const next = toISODate(today);
              onChange(next);
              setVisibleMonth(startOfMonth(today));
              setOpen(false);
            }}
          >
            Сегодня
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
