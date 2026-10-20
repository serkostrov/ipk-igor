import { useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  parseEntityRelationIds,
  serializeEntityRelationIds,
  type RelationRecordOption,
} from "../model/types";
import { cn } from "@/shared/lib/cn";

const CHIP_GAP_PX = 4;

type RelationSelectProps = {
  options: RelationRecordOption[];
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

function RelationChip({
  option,
  removable = false,
  onRemove,
  expand = false,
}: {
  option: RelationRecordOption;
  removable?: boolean;
  onRemove?: (optionId: string) => void;
  /** Single select: use full trigger width instead of a fixed chip max. */
  expand?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-xs font-medium leading-none text-primary",
        expand ? "min-w-0 max-w-full" : "max-w-[9.5rem] shrink-0",
      )}
    >
      <span className="truncate">{option.label}</span>
      {removable ? (
        <span
          role="button"
          tabIndex={-1}
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
          aria-label={`Убрать «${option.label}»`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove?.(option.id);
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <X className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

function MoreChip({
  count,
  title,
  measureRef,
}: {
  count: number;
  title?: string;
  measureRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={measureRef}
      className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-xs font-semibold leading-none text-muted-foreground tabular-nums"
      title={title}
    >
      +{count}
    </span>
  );
}

function visibleChipCount(
  containerWidth: number,
  chipWidths: number[],
  moreWidth: number,
  gap: number,
) {
  if (chipWidths.length === 0) return 0;
  // Keep at least one value visible; truncate the chip if needed.
  if (containerWidth <= 0) return 1;

  let count = 0;
  let used = 0;

  for (let index = 0; index < chipWidths.length; index += 1) {
    const width = chipWidths[index] ?? 0;
    const nextUsed = used + (count > 0 ? gap : 0) + width;
    const hiddenAfter = chipWidths.length - index - 1;
    const totalIfTaken = nextUsed + (hiddenAfter > 0 ? gap + moreWidth : 0);

    if (totalIfTaken <= containerWidth) {
      used = nextUsed;
      count += 1;
      continue;
    }
    break;
  }

  return count === 0 ? 1 : count;
}

function RelationOverflowChips({
  options,
  onRemove,
}: {
  options: RelationRecordOption[];
  onRemove: (optionId: string) => void;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const moreMeasureRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.max(options.length, 0),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    function update() {
      if (!container || !measure) return;
      const chipNodes = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-chip]"),
      );
      const chipWidths = chipNodes.map((node) => node.offsetWidth);
      const moreWidth = moreMeasureRef.current?.offsetWidth ?? 28;
      setVisibleCount(
        visibleChipCount(
          container.clientWidth,
          chipWidths,
          moreWidth,
          CHIP_GAP_PX,
        ),
      );
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const parent = container.parentElement;
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, [options]);

  const visible = options.slice(
    0,
    Math.min(options.length, Math.max(1, visibleCount)),
  );
  const hidden = options.slice(visible.length);
  const hiddenLabel = hidden.map((option) => option.label).join(", ");

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 flex h-0 w-max items-center gap-1 opacity-0"
      >
        {options.map((option) => (
          <span key={option.id} data-chip className="inline-flex">
            <RelationChip option={option} removable />
          </span>
        ))}
        <MoreChip count={99} measureRef={moreMeasureRef} />
      </span>

      <span
        ref={containerRef}
        className="flex w-0 min-w-0 flex-1 items-center gap-1 overflow-hidden"
      >
        {visible.map((option) => (
          <RelationChip
            key={option.id}
            option={option}
            removable
            onRemove={onRemove}
          />
        ))}
        {hidden.length > 0 ? (
          <MoreChip count={hidden.length} title={hiddenLabel} />
        ) : null}
      </span>
    </>
  );
}

export function RelationSelect({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Не выбран",
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
}: RelationSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => {
    const ids = parseEntityRelationIds(value);
    return multiple ? ids : ids.slice(0, 1);
  }, [multiple, value]);

  const selectedOptions = useMemo(
    () =>
      selectedIds
        .map((itemId) => options.find((option) => option.id === itemId))
        .filter((option): option is RelationRecordOption => option != null),
    [options, selectedIds],
  );

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function select(optionId: string) {
    if (!multiple) {
      const next = selectedIds.includes(optionId) ? "" : optionId;
      onChange(next ? serializeEntityRelationIds([next]) : "");
      setOpen(false);
      setQuery("");
      return;
    }
    const next = selectedIds.includes(optionId)
      ? selectedIds.filter((item) => item !== optionId)
      : [...selectedIds, optionId];
    onChange(serializeEntityRelationIds(next));
  }

  function remove(optionId: string) {
    onChange(
      serializeEntityRelationIds(
        selectedIds.filter((item) => item !== optionId),
      ),
    );
  }

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "relative h-9 w-full min-w-0 items-center justify-between gap-2 overflow-hidden border-input bg-transparent px-2.5 py-0 font-normal shadow-xs hover:bg-transparent aria-expanded:bg-transparent",
              selectedOptions.length === 0 && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        {selectedOptions.length === 0 ? (
          <span className="min-w-0 flex-1 truncate text-left">
            {placeholder}
          </span>
        ) : multiple ? (
          <RelationOverflowChips options={selectedOptions} onRemove={remove} />
        ) : (
          <span className="flex min-w-0 flex-1 items-center overflow-hidden">
            <RelationChip
              option={selectedOptions[0]!}
              expand
              removable
              onRemove={remove}
            />
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="border-b border-border/70 p-2">
          <Input
            value={query}
            placeholder="Поиск…"
            className="h-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filteredOptions.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          ) : (
            filteredOptions.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    checked
                      ? "bg-primary/8 text-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => select(option.id)}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                    aria-hidden
                  >
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
        {selectedIds.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2">
            <span className="text-xs text-muted-foreground">
              {multiple ? `Выбрано: ${selectedIds.length}` : "Выбрано"}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
              onClick={() => onChange("")}
            >
              Очистить
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
