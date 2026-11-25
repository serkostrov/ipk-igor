import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";
import { formatDateDisplay } from "@/shared/lib/format-date";

export const filterControlClass = "h-8 w-full min-w-0 text-sm";

/** «Подпись: значение» inside a filter trigger. */
export function FilterValueLabel({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate">{value}</span>
    </span>
  );
}

function formatDateRangeFilterLabel(from: string, to: string) {
  const fromLabel = formatDateDisplay(from.trim());
  const toLabel = formatDateDisplay(to.trim());
  if (fromLabel && toLabel) return `${fromLabel} — ${toLabel}`;
  if (fromLabel) return `от ${fromLabel}`;
  if (toLabel) return `до ${toLabel}`;
  return "все";
}

/** Compact date range: same footprint as other filters, pickers in a popover. */
export function DateRangeFilterControl({
  id,
  label,
  from,
  to,
  onChange,
}: {
  id: string;
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = formatDateRangeFilterLabel(from, to);
  const active = Boolean(from.trim() || to.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={`Фильтр: ${label}`}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              filterControlClass,
              "justify-between gap-1.5 px-2.5 font-normal shadow-xs",
            )}
          />
        }
      >
        <FilterValueLabel label={label} value={summary} />
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[16.5rem] gap-3 p-3"
        sideOffset={6}
      >
        <p className="text-xs font-medium text-foreground">{label}</p>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">От</span>
            <DatePicker
              id={`${id}-from`}
              value={from}
              placeholder="Не задано"
              aria-label={`${label}: от`}
              className="h-8"
              onChange={(next) => onChange(next, to)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">До</span>
            <DatePicker
              id={`${id}-to`}
              value={to}
              placeholder="Не задано"
              aria-label={`${label}: до`}
              className="h-8"
              onChange={(next) => onChange(from, next)}
            />
          </div>
        </div>
        {active ? (
          <button
            type="button"
            className="self-start text-xs font-medium text-primary transition-colors hover:text-primary/80"
            onClick={() => onChange("", "")}
          >
            Сбросить
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
