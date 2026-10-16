import { useMemo, useState, type PointerEvent } from "react";
import { ChartGantt, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { fromDayNumber, isWeekendDayNumber } from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import {
  getEntityListOption,
  getEntityRecordDependencies,
  getEntityTimelineSetup,
  getRecordFieldIds,
  getRecordFieldNumber,
  rescheduleEntityRecord,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  buildTimelineGroups,
  getTimelineMonths,
  getTimelineRange,
  getTimelineWeeks,
  parseTimelineScale,
  TIMELINE_DAY_WIDTH,
  type TimelineItem,
  type TimelineScale,
} from "../lib/timeline-layout";

const ROW_HEIGHT = 36;
const HEADER_ROW = 24;
const LIST_WIDTH = 256;
const DEFAULT_BAR_COLOR = "#3b82f6";

const SCALE_LABELS: Record<TimelineScale, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

type BarDrag = {
  recordId: string;
  mode: "move" | "start" | "end";
  originX: number;
  deltaDays: number;
  moved: boolean;
};

type TimelineRow =
  | {
      kind: "group";
      key: string;
      label: string;
      color: string | null;
      count: number;
      collapsed: boolean;
      start: number | null;
      end: number | null;
    }
  | { kind: "item"; item: TimelineItem };

type Message = { tone: "info" | "error"; text: string };

function applyDrag(item: TimelineItem, drag: BarDrag | null) {
  if (item.start == null || item.end == null) return item;
  if (!drag || drag.recordId !== item.record.id) return item;
  const delta = drag.deltaDays;
  if (drag.mode === "move") {
    return { ...item, start: item.start + delta, end: item.end + delta };
  }
  if (drag.mode === "start") {
    return { ...item, start: Math.min(item.start + delta, item.end) };
  }
  return { ...item, end: Math.max(item.end + delta, item.start) };
}

export function EntityTimelineView({
  entity,
  records,
  onOpenRecord,
  onConfigure,
  className,
}: {
  entity: Entity;
  records: EntityRecord[];
  onOpenRecord?: (record: EntityRecord) => void;
  /** Opens timeline settings from the empty state. */
  onConfigure?: () => void;
  className?: string;
}) {
  const valueContext = useEntityValueContext();
  const setup = useMemo(() => getEntityTimelineSetup(entity), [entity]);
  const [scale, setScale] = useLocalStorageState(
    `entity-timeline-scale:${entity.id}`,
    parseTimelineScale,
    "week",
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<BarDrag | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const dayWidth = TIMELINE_DAY_WIDTH[scale];

  const groups = useMemo(
    () =>
      setup ? buildTimelineGroups(valueContext, entity, setup, records) : [],
    [entity, records, setup, valueContext],
  );
  const range = useMemo(() => getTimelineRange(groups), [groups]);

  if (!setup) {
    return (
      <div
        className={cn(
          "flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center",
          className,
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ChartGantt className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">График не настроен</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Укажите поля начала и окончания — записи появятся полосами на шкале
            времени.
          </p>
        </div>
        {onConfigure ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onConfigure}
          >
            Настроить график
          </Button>
        ) : null}
      </div>
    );
  }

  const timelineSetup = setup;
  const totalDays = range.end - range.start + 1;
  const chartWidth = totalDays * dayWidth;
  const xOf = (day: number) => (day - range.start) * dayWidth;

  const rows: TimelineRow[] = [];
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.key);
    if (timelineSetup.groupField) {
      const starts = group.items.flatMap((item) =>
        item.start == null ? [] : [item.start],
      );
      const ends = group.items.flatMap((item) =>
        item.end == null ? [] : [item.end],
      );
      rows.push({
        kind: "group",
        key: group.key,
        label: group.label,
        color: group.color,
        count: group.items.length,
        collapsed: isCollapsed,
        start: starts.length > 0 ? Math.min(...starts) : null,
        end: ends.length > 0 ? Math.max(...ends) : null,
      });
    }
    if (!isCollapsed) {
      for (const item of group.items) {
        rows.push({ kind: "item", item: applyDrag(item, drag) });
      }
    }
  }

  const rowIndexById = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.kind === "item") rowIndexById.set(row.item.record.id, index);
  });
  const itemById = new Map(
    rows.flatMap((row) =>
      row.kind === "item" ? [[row.item.record.id, row.item] as const] : [],
    ),
  );

  function barColor(record: EntityRecord) {
    const field = timelineSetup.colorField;
    if (!field) return DEFAULT_BAR_COLOR;
    const id = getRecordFieldIds(valueContext, entity, record, field)[0];
    const option = getEntityListOption(
      resolveEntityListFieldOptions(field, valueContext.entities),
      id,
    );
    return option?.color ?? DEFAULT_BAR_COLOR;
  }

  function barProgress(record: EntityRecord) {
    const field = timelineSetup.progressField;
    if (!field) return null;
    const value = getRecordFieldNumber(valueContext, entity, record, field);
    return value == null ? null : Math.min(100, Math.max(0, value));
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    recordId: string,
    mode: BarDrag["mode"],
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMessage(null);
    setDrag({
      recordId,
      mode,
      originX: event.clientX,
      deltaDays: 0,
      moved: false,
    });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.originX;
    setDrag({
      ...drag,
      deltaDays: Math.round(dx / dayWidth),
      moved: drag.moved || Math.abs(dx) > 3,
    });
  }

  function endDrag(record: EntityRecord) {
    if (!drag) return;
    const current = drag;
    setDrag(null);
    if (!current.moved) {
      onOpenRecord?.(record);
      return;
    }
    const base = itemById.get(record.id);
    const original = groups
      .flatMap((group) => group.items)
      .find((item) => item.record.id === record.id);
    if (!base || !original || base.start == null || base.end == null) return;
    if (base.start === original.start && base.end === original.end) return;
    try {
      const shifted = rescheduleEntityRecord(
        entity.id,
        record.id,
        fromDayNumber(base.start),
        fromDayNumber(base.end),
      );
      setMessage(
        shifted > 0
          ? {
              tone: "info",
              text: `Сдвинуто ${shifted} ${pluralRu(shifted, "запись", "записи", "записей")} по зависимостям`,
            }
          : null,
      );
    } catch (error: unknown) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "График не пересчитан",
      });
    }
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const months = getTimelineMonths(range);
  const secondRow =
    scale === "day"
      ? Array.from({ length: totalDays }, (_, index) => {
          const day = range.start + index;
          return {
            key: String(day),
            label: fromDayNumber(day).slice(8, 10),
            start: day,
            days: 1,
          };
        })
      : scale === "week"
        ? getTimelineWeeks(range)
        : [];
  const headerHeight = secondRow.length > 0 ? HEADER_ROW * 2 : HEADER_ROW;
  const bodyHeight = rows.length * ROW_HEIGHT;

  const arrows = timelineSetup.dependenciesField
    ? rows.flatMap((row) => {
        if (row.kind !== "item") return [];
        const successor = row.item;
        const successorStart = successor.start;
        const successorEnd = successor.end;
        if (successorStart == null || successorEnd == null) return [];
        return getEntityRecordDependencies(
          timelineSetup,
          successor.record,
        ).flatMap((dependency) => {
          const predecessor = itemById.get(dependency.recordId);
          const fromRow = rowIndexById.get(dependency.recordId);
          const toRow = rowIndexById.get(successor.record.id);
          if (
            !predecessor ||
            predecessor.start == null ||
            predecessor.end == null ||
            fromRow == null ||
            toRow == null
          ) {
            return [];
          }
          const fromX =
            dependency.type === "FS" || dependency.type === "FF"
              ? xOf(predecessor.end + 1)
              : xOf(predecessor.start);
          const toX =
            dependency.type === "FS" || dependency.type === "SS"
              ? xOf(successorStart)
              : xOf(successorEnd + 1);
          const fromY = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
          const toY = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
          const elbow = fromX + 8;
          return [
            {
              key: `${dependency.recordId}->${successor.record.id}`,
              path: `M ${fromX} ${fromY} H ${elbow} V ${toY} H ${toX}`,
            },
          ];
        });
      })
    : [];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Tabs
          value={scale}
          onValueChange={(next) => {
            const value = parseTimelineScale(next);
            if (value) setScale(value);
          }}
        >
          <TabsList className="h-8">
            {(Object.keys(SCALE_LABELS) as TimelineScale[]).map((value) => (
              <TabsTrigger key={value} value={value} className="px-2.5 text-xs">
                {SCALE_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {message ? (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs",
              message.tone === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            {message.text}
            <button
              type="button"
              aria-label="Скрыть"
              className="opacity-70 hover:opacity-100"
              onClick={() => setMessage(null)}
            >
              <X className="size-3" />
            </button>
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
        <div className="relative" style={{ width: LIST_WIDTH + chartWidth }}>
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card"
            style={{ height: headerHeight }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-card px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              style={{ width: LIST_WIDTH }}
            >
              Записи
            </div>
            <div className="relative shrink-0" style={{ width: chartWidth }}>
              {months.map((month) => (
                <div
                  key={month.key}
                  className="absolute top-0 flex items-center border-l border-border/70 px-2 text-[11px] font-medium text-foreground/80"
                  style={{
                    left: xOf(month.start),
                    width: month.days * dayWidth,
                    height: HEADER_ROW,
                  }}
                >
                  <span className="truncate">{month.label}</span>
                </div>
              ))}
              {secondRow.map((cell) => (
                <div
                  key={cell.key}
                  className={cn(
                    "absolute flex items-center border-t border-l border-border/50 text-[10px] text-muted-foreground tabular-nums",
                    scale === "day" ? "justify-center" : "px-1.5",
                    scale === "day" &&
                      isWeekendDayNumber(cell.start) &&
                      "bg-muted/60",
                  )}
                  style={{
                    top: HEADER_ROW,
                    left: xOf(cell.start),
                    width: cell.days * dayWidth,
                    height: HEADER_ROW,
                  }}
                >
                  {cell.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative" style={{ height: bodyHeight }}>
            {scale !== "month"
              ? Array.from(
                  { length: totalDays },
                  (_, index) => range.start + index,
                )
                  .filter(isWeekendDayNumber)
                  .map((day) => (
                    <div
                      key={day}
                      aria-hidden
                      className="absolute top-0 bg-muted/45"
                      style={{
                        left: LIST_WIDTH + xOf(day),
                        width: dayWidth,
                        height: bodyHeight,
                      }}
                    />
                  ))
              : null}
            <div
              aria-hidden
              className="absolute top-0 z-[1] w-px bg-primary"
              style={{
                left: LIST_WIDTH + xOf(range.today) + dayWidth / 2,
                height: bodyHeight,
              }}
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute top-0 z-[2] text-muted-foreground/70"
              style={{
                left: LIST_WIDTH,
                width: chartWidth,
                height: bodyHeight,
              }}
            >
              <defs>
                <marker
                  id={`timeline-arrow-${entity.id}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                </marker>
              </defs>
              {arrows.map((arrow) => (
                <path
                  key={arrow.key}
                  d={arrow.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  markerEnd={`url(#timeline-arrow-${entity.id})`}
                />
              ))}
            </svg>

            {rows.map((row) => {
              if (row.kind === "group") {
                return (
                  <div
                    key={`group-${row.key}`}
                    className="relative flex border-b border-border/60 bg-muted/20"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <button
                      type="button"
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-2 text-left text-xs font-semibold text-foreground"
                      style={{ width: LIST_WIDTH }}
                      aria-expanded={!row.collapsed}
                      onClick={() => toggleGroup(row.key)}
                    >
                      {row.collapsed ? (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {row.color ? (
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        />
                      ) : null}
                      <span className="truncate">{row.label}</span>
                      <span className="ml-auto shrink-0 font-normal text-muted-foreground tabular-nums">
                        {row.count}
                      </span>
                    </button>
                    {row.start != null && row.end != null ? (
                      <div
                        aria-hidden
                        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/15"
                        style={{
                          left: LIST_WIDTH + xOf(row.start),
                          width: (row.end - row.start + 1) * dayWidth,
                        }}
                      />
                    ) : null}
                  </div>
                );
              }

              const { item } = row;
              const record = item.record;
              const title =
                resolveRelationRecordLabel(entity, record.id) ?? "Без названия";
              const color = barColor(record);
              const progress = barProgress(record);
              const hasDates = item.start != null && item.end != null;
              const barWidth = hasDates
                ? (item.end! - item.start! + 1) * dayWidth
                : 0;
              return (
                <div
                  key={record.id}
                  className="relative flex border-b border-border/40"
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card text-left text-[13px] text-foreground hover:bg-muted/40",
                      timelineSetup.groupField ? "pr-2 pl-7" : "px-3",
                    )}
                    style={{ width: LIST_WIDTH }}
                    title={title}
                    onClick={() => onOpenRecord?.(record)}
                  >
                    <span className="truncate">{title}</span>
                  </button>
                  {hasDates ? (
                    <div
                      role="button"
                      tabIndex={0}
                      title={`${title}: ${fromDayNumber(item.start!)} — ${fromDayNumber(item.end!)}`}
                      className={cn(
                        "group/bar absolute top-1/2 z-[3] flex h-6 -translate-y-1/2 cursor-grab touch-none items-center overflow-visible rounded-md border select-none active:cursor-grabbing",
                        drag?.recordId === record.id && "shadow-md",
                      )}
                      style={{
                        left: LIST_WIDTH + xOf(item.start!),
                        width: Math.max(barWidth, 6),
                        backgroundColor: `${color}26`,
                        borderColor: `${color}99`,
                      }}
                      onPointerDown={(event) =>
                        startDrag(event, record.id, "move")
                      }
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(record)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onOpenRecord?.(record);
                      }}
                    >
                      {progress != null ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 rounded-l-[5px]"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: `${color}66`,
                          }}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative truncate px-2 text-[11px] font-medium text-foreground",
                          barWidth < 72 && "absolute left-full pl-1.5",
                        )}
                      >
                        {title}
                      </span>
                      {(["start", "end"] as const).map((edge) => (
                        <span
                          key={edge}
                          aria-hidden
                          className={cn(
                            "absolute inset-y-0 w-1.5 cursor-ew-resize rounded-sm opacity-0 group-hover/bar:opacity-100",
                            edge === "start" ? "left-0" : "right-0",
                          )}
                          style={{ backgroundColor: `${color}99` }}
                          onPointerDown={(event) =>
                            startDrag(event, record.id, edge)
                          }
                          onPointerMove={(event) => {
                            event.stopPropagation();
                            moveDrag(event);
                          }}
                          onPointerUp={(event) => {
                            event.stopPropagation();
                            endDrag(record);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground"
                      style={{ left: LIST_WIDTH + 12 }}
                    >
                      Без дат
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
