"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Clock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const QUICK_MINUTES = [0, 15, 30, 45] as const;
const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD_ITEMS = Math.floor(VISIBLE_ITEMS / 2);

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatTime(hour: number, minute: number) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function TimeColumn({
  values,
  selected,
  ariaLabel,
  onSelect,
}: {
  values: number[];
  selected: number;
  ariaLabel: string;
  onSelect: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const syncingRef = useRef(false);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const scrollToValue = useCallback(
    (value: number, behavior: ScrollBehavior) => {
      const list = listRef.current;
      if (!list) return;
      const index = values.indexOf(value);
      if (index < 0) return;
      syncingRef.current = true;
      list.scrollTo({ top: index * ITEM_HEIGHT, behavior });
      window.setTimeout(
        () => {
          syncingRef.current = false;
        },
        behavior === "smooth" ? 240 : 16,
      );
    },
    [values],
  );

  useLayoutEffect(() => {
    scrollToValue(selected, "auto");
    // Only center on mount / when the column remounts with a new selected seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // External changes (Сейчас / quick chips) while popover is open.
    if (syncingRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const expectedTop = values.indexOf(selected) * ITEM_HEIGHT;
    if (Math.abs(list.scrollTop - expectedTop) > ITEM_HEIGHT / 2) {
      scrollToValue(selected, "smooth");
    }
  }, [scrollToValue, selected, values]);

  function handleScroll() {
    if (syncingRef.current) return;
    const list = listRef.current;
    if (!list) return;
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      const index = Math.round(list.scrollTop / ITEM_HEIGHT);
      const next = values[Math.max(0, Math.min(values.length - 1, index))];
      if (next != null && next !== selectedRef.current) onSelect(next);
    });
  }

  useEffect(() => {
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="relative w-[4.25rem]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-lg bg-primary/10 ring-1 ring-primary/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-popover to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-popover to-transparent"
      />
      <div
        ref={listRef}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: ITEM_HEIGHT * PAD_ITEMS }} aria-hidden />
        {values.map((value) => {
          const active = value === selected;
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                onSelect(value);
                scrollToValue(value, "smooth");
              }}
              className={cn(
                "flex w-full snap-center items-center justify-center text-[15px] tabular-nums transition-colors",
                active
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground/70 hover:text-foreground",
              )}
              style={{ height: ITEM_HEIGHT }}
            >
              {pad2(value)}
            </button>
          );
        })}
        <div style={{ height: ITEM_HEIGHT * PAD_ITEMS }} aria-hidden />
      </div>
    </div>
  );
}

type TimePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

export function TimePicker({
  id,
  value,
  onChange,
  placeholder = "Время",
  "aria-label": ariaLabel,
  className,
}: TimePickerProps) {
  const parsed = parseTime(value);
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(() => {
    const now = new Date();
    return parsed?.hour ?? now.getHours();
  });
  const [draftMinute, setDraftMinute] = useState(() => {
    const now = new Date();
    return parsed?.minute ?? now.getMinutes();
  });

  const label = parsed ? formatTime(parsed.hour, parsed.minute) : placeholder;
  const draftLabel = formatTime(draftHour, draftMinute);

  function commit(hour = draftHour, minute = draftMinute, close = true) {
    onChange(formatTime(hour, minute));
    if (close) setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const nextDraft = parsed ?? {
            hour: new Date().getHours(),
            minute: new Date().getMinutes(),
          };
          setDraftHour(nextDraft.hour);
          setDraftMinute(nextDraft.minute);
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
              "h-9 w-full justify-start gap-2 px-2.5 font-normal tabular-nums shadow-xs",
              !parsed && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[17.5rem] gap-0 overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Время
            </p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
              {draftLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => {
              const now = new Date();
              setDraftHour(now.getHours());
              setDraftMinute(now.getMinutes());
            }}
          >
            Сейчас
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1 px-3 py-2">
          <TimeColumn
            values={HOURS}
            selected={draftHour}
            ariaLabel="Часы"
            onSelect={setDraftHour}
          />
          <div
            className="pb-0.5 text-xl font-semibold text-muted-foreground/80"
            style={{ height: COLUMN_HEIGHT }}
            aria-hidden
          >
            <span className="flex h-full items-center">:</span>
          </div>
          <TimeColumn
            values={MINUTES}
            selected={draftMinute}
            ariaLabel="Минуты"
            onSelect={setDraftMinute}
          />
        </div>

        <div className="flex items-center justify-center gap-1.5 px-3 pb-3">
          {QUICK_MINUTES.map((minute) => {
            const active = draftMinute === minute;
            return (
              <button
                key={minute}
                type="button"
                onClick={() => setDraftMinute(minute)}
                className={cn(
                  "h-7 min-w-11 rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                :{pad2(minute)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5">
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
          <Button type="button" size="sm" onClick={() => commit()}>
            Готово
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
