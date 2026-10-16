import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_LIST_OTHER_OPTION_ID,
  getEntityListOption,
  getEntityListOptions,
  isEntityListOtherValue,
  parseEntityListOtherText,
  parseEntityListValueIds,
  serializeEntityListOtherValue,
  serializeEntityListValueIds,
  type EntityListOption,
} from "../model/types";

const EMPTY_OPTION = "__none__";
const CHIP_GAP_PX = 4;

const OTHER_OPTION: EntityListOption = {
  id: ENTITY_LIST_OTHER_OPTION_ID,
  name: "Другое",
  color: "#94a3b8",
  parentOptionId: null,
};

type ListSelectProps = {
  options: EntityListOption[];
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  /** Shows «Другое» and a free-text input when selected (single select only). */
  allowOther?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  showColors?: boolean;
  /** `plain` — inline value look for record cards (non-fixed lists). */
  variant?: "default" | "plain";
  size?: "sm" | "default";
  emptyLabel?: string;
  /** Replaces the default option label inside the trigger (single select). */
  triggerContent?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

function ListOptionLabel({
  option,
  showColors = false,
  emptyLabel = "Не выбран",
  truncate = true,
}: {
  option: EntityListOption | null;
  showColors?: boolean;
  emptyLabel?: string;
  /** When false, label keeps intrinsic width (dropdown rows). */
  truncate?: boolean;
}) {
  if (!option) {
    return <span className="text-muted-foreground/70">{emptyLabel}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {showColors ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: option.color }}
          aria-hidden
        />
      ) : null}
      <span className={truncate ? "truncate" : "whitespace-nowrap"}>
        {option.name}
      </span>
    </span>
  );
}

/** Dropdown row: option label (no truncate — popup uses max-content width). */
function ListOptionItemContent({
  option,
  showColors = false,
}: {
  option: EntityListOption;
  showColors?: boolean;
}) {
  return (
    <ListOptionLabel option={option} showColors={showColors} truncate={false} />
  );
}

function ListChip({
  option,
  showColors = false,
  removable = false,
  onRemove,
  className,
}: {
  option: EntityListOption;
  showColors?: boolean;
  removable?: boolean;
  onRemove?: (optionId: string) => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md px-1.5 text-xs leading-none font-medium",
        showColors
          ? "border border-black/5 text-foreground"
          : "bg-muted text-foreground",
        className,
      )}
      style={showColors ? { backgroundColor: `${option.color}28` } : undefined}
      title={option.name}
    >
      <span className="whitespace-nowrap">{option.name}</span>
      {removable ? (
        <span
          role="button"
          tabIndex={-1}
          className={cn(
            "inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm transition-colors",
            showColors
              ? "opacity-70 hover:bg-black/5 hover:opacity-100"
              : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
          aria-label={`Убрать «${option.name}»`}
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
  showColors?: boolean;
}) {
  return (
    <span
      ref={measureRef}
      className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums leading-none text-muted-foreground"
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
  // Keep at least one value visible; truncate the chip/label if needed.
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

function OverflowChipRow({
  options,
  showColors = false,
  removable = false,
  onRemove,
  emptyLabel = "—",
  className,
}: {
  options: EntityListOption[];
  showColors?: boolean;
  removable?: boolean;
  onRemove?: (optionId: string) => void;
  emptyLabel?: string;
  className?: string;
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

  if (options.length === 0) {
    return (
      <span className={cn("truncate text-muted-foreground/70", className)}>
        {emptyLabel}
      </span>
    );
  }

  const visible = options.slice(
    0,
    Math.min(options.length, Math.max(1, visibleCount)),
  );
  const hidden = options.slice(visible.length);
  const hiddenLabel = hidden.map((option) => option.name).join(", ");

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 flex h-0 w-max items-center gap-1 opacity-0"
      >
        {options.map((option) => (
          <span key={option.id} data-chip className="inline-flex">
            <ListChip
              option={option}
              showColors={showColors}
              removable={removable}
            />
          </span>
        ))}
        <MoreChip
          count={99}
          measureRef={moreMeasureRef}
          showColors={showColors}
        />
      </span>

      <span
        ref={containerRef}
        className={cn(
          "flex w-0 min-w-0 flex-1 items-center gap-1 overflow-hidden",
          className,
        )}
      >
        {visible.map((option) => (
          <ListChip
            key={option.id}
            option={option}
            showColors={showColors}
            removable={removable}
            onRemove={onRemove}
          />
        ))}
        {hidden.length > 0 ? (
          <MoreChip
            count={hidden.length}
            title={hiddenLabel}
            showColors={showColors}
          />
        ) : null}
      </span>
    </>
  );
}

/** Comma-separated labels that fill available width, then +n. */
export function OverflowCommaLabels({
  labels,
  emptyLabel = "—",
  className,
  textClassName,
  leading,
  stretchMore = false,
}: {
  labels: string[];
  emptyLabel?: string;
  className?: string;
  textClassName?: string;
  /** Optional row above the values (e.g. field label in header chips). */
  leading?: ReactNode;
  /** Stretch +n to the full height of leading + values (like relation chips). */
  stretchMore?: boolean;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const moreMeasureRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.max(labels.length, 0),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    function update() {
      if (!container || !measure) return;
      const nodes = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-label]"),
      );
      const widths = nodes.map((node) => node.offsetWidth);
      const moreWidth = (moreMeasureRef.current?.offsetWidth ?? 28) + 6;
      setVisibleCount(
        visibleChipCount(container.clientWidth, widths, moreWidth, 0),
      );
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const parent = container.parentElement;
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, [labels, leading, stretchMore]);

  if (labels.length === 0) {
    return (
      <span
        className={cn(
          "truncate text-muted-foreground/70",
          textClassName,
          className,
        )}
      >
        {emptyLabel}
      </span>
    );
  }

  const visible = labels.slice(
    0,
    Math.min(labels.length, Math.max(1, visibleCount)),
  );
  const hidden = labels.slice(visible.length);
  const hiddenLabel = hidden.join(", ");
  const moreBadge =
    hidden.length > 0 ? (
      stretchMore ? (
        <span
          className="flex shrink-0 self-stretch items-center rounded-md bg-muted px-1.5 text-[10px] leading-none font-semibold text-muted-foreground tabular-nums"
          title={hiddenLabel}
        >
          +{hidden.length}
        </span>
      ) : (
        <MoreChip count={hidden.length} title={hiddenLabel} />
      )
    ) : null;

  return (
    <span className={cn("relative flex min-w-0 flex-1", className)}>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 flex h-0 w-max items-center opacity-0"
      >
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            data-label
            className={cn("shrink-0 whitespace-nowrap", textClassName)}
          >
            {index > 0 ? `, ${label}` : label}
          </span>
        ))}
        <MoreChip count={99} measureRef={moreMeasureRef} />
      </span>

      <span
        ref={containerRef}
        className="flex w-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
      >
        {stretchMore || leading ? (
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden text-left">
            {leading}
            <span
              className={cn(
                "min-w-0 truncate whitespace-nowrap",
                textClassName,
              )}
            >
              {visible.join(", ")}
            </span>
          </span>
        ) : (
          <span
            className={cn("min-w-0 truncate whitespace-nowrap", textClassName)}
          >
            {visible.join(", ")}
          </span>
        )}
        {moreBadge}
      </span>
    </span>
  );
}

function ListMultiSelect({
  options,
  value,
  onChange,
  allowEmpty = true,
  readOnly = false,
  disabled = false,
  showColors = false,
  variant = "default",
  emptyLabel,
  className,
  "aria-label": ariaLabel = "Список",
}: Omit<ListSelectProps, "multiple" | "size">) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedIds = parseEntityListValueIds(value);
  const selectedOptions = useMemo(
    () => getEntityListOptions(options, value),
    [options, value],
  );
  const resolvedEmptyLabel =
    emptyLabel ?? (readOnly || variant === "plain" ? "—" : "Не выбран");
  const plain = variant === "plain";

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.name.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function toggle(optionId: string) {
    const next = selectedIds.includes(optionId)
      ? selectedIds.filter((item) => item !== optionId)
      : [...selectedIds, optionId];
    if (!allowEmpty && next.length === 0) return;
    onChange(serializeEntityListValueIds(next));
  }

  function remove(optionId: string) {
    const next = selectedIds.filter((item) => item !== optionId);
    if (!allowEmpty && next.length === 0) return;
    onChange(serializeEntityListValueIds(next));
  }

  const chips: ReactNode = (
    <OverflowChipRow
      options={selectedOptions}
      showColors={showColors}
      removable={!readOnly}
      onRemove={readOnly ? undefined : remove}
      emptyLabel={resolvedEmptyLabel}
    />
  );

  if (readOnly) {
    return (
      <div
        aria-label={ariaLabel}
        className={cn(
          "relative inline-flex h-5 w-full min-w-0 items-center text-sm font-medium",
          className,
        )}
      >
        {chips}
      </div>
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
        aria-label={ariaLabel}
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "relative w-full items-center justify-between gap-2 overflow-hidden font-normal",
              plain
                ? "h-auto min-h-7 rounded-md border-0 bg-transparent px-1 py-0.5 shadow-none hover:bg-muted/45 aria-expanded:bg-muted/45"
                : "h-9 border-input bg-transparent px-2.5 py-0 shadow-xs hover:bg-transparent aria-expanded:bg-transparent",
              selectedOptions.length === 0 && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        {chips}
        <ChevronDown
          className={cn(
            "shrink-0 text-muted-foreground",
            plain ? "size-3.5 opacity-60" : "size-4",
          )}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-max min-w-[max(var(--anchor-width),16rem)] max-w-[min(32rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
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
              {options.length === 0 ? "Нет вариантов" : "Ничего не найдено"}
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
                  onClick={() => toggle(option.id)}
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
                  <ListOptionItemContent
                    option={option}
                    showColors={showColors}
                  />
                </button>
              );
            })
          )}
        </div>
        {selectedIds.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2">
            <span className="text-xs text-muted-foreground">
              Выбрано: {selectedIds.length}
            </span>
            {allowEmpty ? (
              <button
                type="button"
                className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                onClick={() => onChange("")}
              >
                Очистить
              </button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function ListSelect({
  options,
  value,
  onChange,
  allowEmpty = true,
  allowOther = false,
  readOnly = false,
  disabled = false,
  multiple = false,
  showColors = false,
  variant = "default",
  size = "default",
  emptyLabel,
  triggerContent,
  className,
  "aria-label": ariaLabel = "Список",
}: ListSelectProps) {
  if (multiple) {
    return (
      <ListMultiSelect
        options={options}
        value={value}
        onChange={onChange}
        allowEmpty={allowEmpty}
        readOnly={readOnly}
        disabled={disabled}
        showColors={showColors}
        variant={variant}
        emptyLabel={emptyLabel}
        className={className}
        aria-label={ariaLabel}
      />
    );
  }

  const otherEnabled = allowOther;
  const isOther = otherEnabled && isEntityListOtherValue(value);
  const otherText = isOther ? parseEntityListOtherText(value) : "";
  const selected = isOther ? OTHER_OPTION : getEntityListOption(options, value);
  const selectValue = selected ? selected.id : EMPTY_OPTION;
  const plain = variant === "plain";
  const resolvedEmptyLabel =
    emptyLabel ?? (readOnly || plain ? "—" : "Не выбран");
  const displayOption =
    isOther && otherText.trim().length > 0
      ? { ...OTHER_OPTION, name: otherText.trim() }
      : selected;

  if (readOnly) {
    return (
      <div
        aria-label={ariaLabel}
        className={cn(
          "pointer-events-none inline-flex w-full min-w-0 items-center gap-1.5 text-sm font-medium",
          className,
        )}
      >
        {triggerContent ?? (
          <ListOptionLabel
            option={displayOption}
            showColors={showColors && !isOther}
            emptyLabel={resolvedEmptyLabel}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        plain && "gap-1",
        // Fill flex parents (header chips); otherwise trigger `w-fit` collapses
        // value to 0 via OverflowCommaLabels `w-0 flex-1`.
        triggerContent ? "w-full min-w-0 flex-1" : "w-full min-w-0",
      )}
    >
      <Select
        value={selectValue}
        disabled={disabled}
        onValueChange={(next) => {
          if (next == null || next === EMPTY_OPTION) {
            onChange("");
            return;
          }
          if (next === ENTITY_LIST_OTHER_OPTION_ID) {
            onChange(serializeEntityListOtherValue(""));
            return;
          }
          onChange(String(next));
        }}
      >
        <SelectTrigger
          size={size}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "min-w-0 font-medium shadow-none",
            plain
              ? cn(
                  "h-5 min-h-5 justify-start gap-1 rounded-md border-0 bg-transparent px-0 py-0 text-sm data-[size=default]:h-5 data-[size=sm]:h-5 hover:bg-muted/45 data-popup-open:bg-muted/45 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:opacity-55",
                  triggerContent ? "w-full" : "w-fit",
                )
              : "h-auto w-full justify-between gap-1.5 rounded-full border-border/60 bg-background px-2.5",
            !plain && (size === "sm" ? "h-7 text-xs" : "h-8 text-sm"),
            className,
          )}
        >
          <SelectValue
            className={cn(
              "min-w-0",
              triggerContent || !plain ? "flex-1" : "w-auto flex-none",
            )}
          >
            {triggerContent ??
              (plain && displayOption && showColors && !isOther ? (
                <ListChip option={displayOption} showColors />
              ) : (
                <ListOptionLabel
                  option={displayOption}
                  showColors={showColors && !isOther}
                  emptyLabel={resolvedEmptyLabel}
                />
              ))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          className="w-max min-w-[max(var(--anchor-width),12rem)] max-w-[min(24rem,calc(100vw-2rem))]"
        >
          {allowEmpty ? (
            <SelectItem value={EMPTY_OPTION}>
              <ListOptionLabel
                option={null}
                showColors={showColors}
                emptyLabel={resolvedEmptyLabel}
              />
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <ListOptionItemContent option={option} showColors={showColors} />
            </SelectItem>
          ))}
          {otherEnabled ? (
            <SelectItem value={ENTITY_LIST_OTHER_OPTION_ID}>
              <ListOptionItemContent option={OTHER_OPTION} showColors={false} />
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      {isOther ? (
        <Input
          value={otherText}
          disabled={disabled}
          placeholder="Укажите свой вариант"
          aria-label="Свой вариант"
          className={cn(
            plain
              ? "h-7 rounded-md border-border/70 bg-background px-2 text-sm shadow-none"
              : "h-9 rounded-md",
          )}
          onChange={(event) => {
            onChange(serializeEntityListOtherValue(event.target.value));
          }}
        />
      ) : null}
    </div>
  );
}

export function ListValueDisplay({
  options,
  value,
  multiple = false,
  showColors = false,
  allowOther = false,
  className,
}: {
  options: EntityListOption[];
  value: string | undefined;
  multiple?: boolean;
  showColors?: boolean;
  allowOther?: boolean;
  className?: string;
}) {
  if (multiple) {
    const selected = getEntityListOptions(options, value);
    if (showColors) {
      return (
        <div
          className={cn(
            "relative inline-flex h-6 w-full min-w-0 items-center",
            className,
          )}
        >
          <OverflowChipRow options={selected} showColors emptyLabel="—" />
        </div>
      );
    }

    return (
      <div className={cn("flex w-full min-w-0", className)}>
        <OverflowCommaLabels
          labels={selected.map((item) => item.name)}
          textClassName="text-sm text-foreground"
        />
      </div>
    );
  }

  if (allowOther && isEntityListOtherValue(value)) {
    const text = parseEntityListOtherText(value).trim();
    const label = text.length > 0 ? text : "Другое";
    return (
      <span
        className={cn("block truncate text-sm text-foreground", className)}
        title={label}
      >
        {label}
      </span>
    );
  }

  const selected = getEntityListOption(options, value);
  if (!selected) {
    return (
      <span
        className={cn(
          "inline-flex h-5 items-center text-sm text-muted-foreground/70",
          className,
        )}
      >
        —
      </span>
    );
  }

  if (showColors) {
    return (
      <ListChip
        option={selected}
        showColors
        className={cn("max-w-full", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "block whitespace-nowrap text-sm text-foreground",
        className,
      )}
      title={selected.name}
    >
      {selected.name}
    </span>
  );
}
