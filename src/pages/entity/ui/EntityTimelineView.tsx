import { useEffect, useMemo, useRef, useState } from "react";
import { ChartGantt, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { isWeekendDayNumber } from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import {
  formatEntityFieldScalarValue,
  formatRecordFieldValue,
  getEntityFieldValueKind,
  getEntityListOption,
  getEntityTimelineSetup,
  getRecordFieldIds,
  getRecordFieldNumber,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  buildTimelineGroups,
  getTimelineColumns,
  getTimelineMonths,
  getTimelineRange,
  parseTimelineScale,
  TIMELINE_COLUMN_WIDTH,
  timelineItemInColumn,
  type TimelineGroup,
  type TimelineGroupKind,
  type TimelineItem,
  type TimelineScale,
  type TimelineSegment,
} from "../lib/timeline-layout";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "./EntityBrowseFilters";
import { TimelineGroupRecordsDialog } from "./TimelineGroupRecordsDialog";

const ROW_HEIGHT = 28;
const HEADER_ROW = 24;
const LIST_WIDTH = 280;
const DEFAULT_CELL_COLOR = "#3b82f6";
const ROW_LABEL_CLASS =
  "text-[11px] font-normal leading-none tracking-normal normal-case";

const SCALE_LABELS: Record<TimelineScale, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

/** Compact day/week/month switch for the page header description row. */
export function TimelineScaleTabs({
  value,
  onChange,
  className,
}: {
  value: TimelineScale;
  onChange: (value: TimelineScale) => void;
  className?: string;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const parsed = parseTimelineScale(next);
        if (parsed) onChange(parsed);
      }}
      className={cn("gap-0", className)}
    >
      <TabsList variant="line" className="!h-auto gap-3 bg-transparent p-0">
        {(Object.keys(SCALE_LABELS) as TimelineScale[]).map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className="h-5 rounded-none px-0 py-0 text-[11px] leading-5 font-normal text-muted-foreground shadow-none after:bottom-0 data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
          >
            {SCALE_LABELS[option]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

type TimelineRow =
  | {
      kind: "group";
      key: string;
      label: string;
      color: string | null;
      groupKind: TimelineGroupKind;
      empty: boolean;
      count: number;
      collapsed: boolean;
      expandable: boolean;
      depth: number;
      items: TimelineItem[];
    }
  | { kind: "item"; item: TimelineItem; depth: number };

function CellValue({
  label,
  color,
  muted,
  onClick,
  title,
}: {
  label: string;
  color: string;
  muted?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const className = cn(
    "flex size-full min-w-0 items-center justify-center border-0 px-1.5 text-center text-[11px] font-normal leading-none tabular-nums outline-none",
    muted && "opacity-90",
    onClick &&
      "cursor-pointer hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  );
  const style = {
    backgroundColor: `${color}28`,
    color: "var(--foreground)",
  } as const;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        title={title}
        onClick={onClick}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    );
  }

  return (
    <span className={className} style={style} title={title}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
}

export function EntityTimelineView({
  entity,
  records,
  scale,
  onOpenRecord,
  onConfigure,
  className,
}: {
  entity: Entity;
  records: EntityRecord[];
  scale: TimelineScale;
  onOpenRecord?: (record: EntityRecord) => void;
  /** Opens timeline settings from the empty state. */
  onConfigure?: () => void;
  className?: string;
}) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const setup = useMemo(() => getEntityTimelineSetup(entity), [entity]);
  /** Cluster / split: collapsed when present (default expanded). */
  const [collapsedClusterIds, setCollapsedClusterIds] = useState(
    () => new Set<string>(),
  );
  /** Belonging / nested «Строки»: expanded when present (default collapsed). */
  const [expandedRowIds, setExpandedRowIds] = useState(
    () => new Set<string>(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollToToday = useRef(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EntityFiltersState>({});
  const [browse, setBrowse] = useState<{
    recordIds: string[];
    title: string;
    cellLabel: string;
  } | null>(null);

  const filterFields = useMemo(
    () => getEntityBrowseFilterFields(entity),
    [entity],
  );

  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          recordMatchesSearch(valueContext, entity, record, search) &&
          recordMatchesFilters(
            valueContext,
            entity,
            record,
            filterFields,
            filters,
          ),
      ),
    [entity, filterFields, filters, records, search, valueContext],
  );

  const groups = useMemo(
    () =>
      setup
        ? buildTimelineGroups(valueContext, entity, setup, filteredRecords)
        : [],
    [entity, filteredRecords, setup, valueContext],
  );
  const range = useMemo(() => getTimelineRange(groups, scale), [groups, scale]);
  const columns = useMemo(
    () => getTimelineColumns(scale, range),
    [scale, range],
  );
  const monthBands = useMemo(() => {
    if (scale === "month") return [];
    return getTimelineMonths(range);
  }, [scale, range]);

  useEffect(() => {
    didScrollToToday.current = false;
  }, [entity.id, scale]);

  useEffect(() => {
    if (didScrollToToday.current || columns.length === 0) return;
    const root = scrollRef.current;
    if (!root) return;
    const todayIndex = columns.findIndex(
      (column) =>
        range.today >= column.start &&
        range.today < column.start + column.days,
    );
    if (todayIndex < 0) return;
    const target =
      LIST_WIDTH +
      todayIndex * TIMELINE_COLUMN_WIDTH -
      Math.max(root.clientWidth * 0.35, TIMELINE_COLUMN_WIDTH * 2);
    root.scrollLeft = Math.max(0, target);
    didScrollToToday.current = true;
  }, [columns, range.today]);

  const browseRecords = useMemo(() => {
    if (!browse) return [];
    const byId = new Map(entity.records.map((record) => [record.id, record]));
    return browse.recordIds.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }, [browse, entity.records]);

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
            Укажите поля начала и окончания — записи появятся в ячейках по
            датам.
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
  const chartWidth = columns.length * TIMELINE_COLUMN_WIDTH;
  const headerHeight = monthBands.length > 0 ? HEADER_ROW * 2 : HEADER_ROW;

  const rows: TimelineRow[] = [];
  function appendGroup(group: TimelineGroup) {
    const hasChildren = group.children.length > 0;
    // Cluster / split / nested «Строки» (table parent hierarchy) expand.
    // Leaf article rows stay aggregates — operations are not listed under them.
    const expandable = hasChildren;
    const isCollapsed =
      expandable &&
      (group.kind === "row"
        ? !expandedRowIds.has(group.key)
        : collapsedClusterIds.has(group.key));
    if (timelineSetup.groupField) {
      rows.push({
        kind: "group",
        key: group.key,
        label: group.label,
        color: group.color,
        groupKind: group.kind,
        empty: group.optionId === "__none__",
        count: group.items.length,
        collapsed: isCollapsed,
        expandable,
        depth: group.depth,
        items: group.items,
      });
    }
    if (isCollapsed) return;
    if (hasChildren) {
      for (const child of group.children) appendGroup(child);
      return;
    }
    // Flat chart (no «Строки»): each record is its own row.
    if (!timelineSetup.groupField) {
      for (const item of group.items) {
        rows.push({ kind: "item", item, depth: group.depth });
      }
    }
  }
  for (const group of groups) appendGroup(group);

  function cellColor(record: EntityRecord) {
    const field = timelineSetup.colorField;
    if (!field) return DEFAULT_CELL_COLOR;
    const id = getRecordFieldIds(valueContext, entity, record, field)[0];
    const option = getEntityListOption(
      resolveEntityListFieldOptions(field, valueContext.entities),
      id,
    );
    return option?.color ?? DEFAULT_CELL_COLOR;
  }

  function recordTitle(record: EntityRecord) {
    return resolveRelationRecordLabel(entity, record.id) ?? "Без названия";
  }

  function cellLabel(record: EntityRecord) {
    const field = timelineSetup.labelField;
    if (!field) return recordTitle(record);
    const text = formatRecordFieldValue(valueContext, entity, record, field);
    return text === "—" ? recordTitle(record) : text;
  }

  function groupCellLabel(items: TimelineItem[], column: TimelineSegment) {
    const inColumn = items.filter((item) => timelineItemInColumn(item, column));
    if (inColumn.length === 0) return null;

    const field = timelineSetup.labelField;
    if (
      field &&
      getEntityFieldValueKind(entity, field, valueContext.entities) === "number"
    ) {
      let sum = 0;
      let any = false;
      for (const item of inColumn) {
        const value = getRecordFieldNumber(
          valueContext,
          entity,
          item.record,
          field,
        );
        if (value == null) continue;
        sum += value;
        any = true;
      }
      if (!any) return null;
      const formatted = formatEntityFieldScalarValue(field, String(sum));
      return formatted === "—" ? null : formatted;
    }

    if (inColumn.length === 1) {
      return cellLabel(inColumn[0]!.record);
    }
    return String(inColumn.length);
  }

  function groupCellColor(items: TimelineItem[], column: TimelineSegment) {
    const first = items.find((item) => timelineItemInColumn(item, column));
    return first
      ? cellColor(first.record)
      : timelineSetup.groupField
        ? null
        : DEFAULT_CELL_COLOR;
  }

  function toggleGroup(key: string, kind: TimelineGroupKind) {
    if (kind === "row") {
      setExpandedRowIds((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    setCollapsedClusterIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function columnLeft(column: TimelineSegment) {
    const index = columns.findIndex((item) => item.key === column.key);
    return index * TIMELINE_COLUMN_WIDTH;
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="shrink-0">
        <EntityBrowseFilters
          fields={filterFields}
          entities={entities}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs"
      >
        <div
          className="relative"
          style={{ width: LIST_WIDTH + chartWidth }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card"
            style={{ height: headerHeight }}
          >
            <div
              className="sticky left-0 z-30 flex h-full shrink-0 items-center border-r border-border bg-card px-3 text-[11px] font-semibold leading-none tracking-wide text-muted-foreground uppercase shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
              style={{ width: LIST_WIDTH }}
            >
              Записи
            </div>
            <div className="relative shrink-0" style={{ width: chartWidth }}>
              {monthBands.map((month) => {
                const startIndex = columns.findIndex(
                  (column) =>
                    column.start >= month.start &&
                    column.start < month.start + month.days,
                );
                const endIndex = columns.reduce((last, column, index) => {
                  if (
                    column.start >= month.start &&
                    column.start < month.start + month.days
                  ) {
                    return index;
                  }
                  return last;
                }, -1);
                if (startIndex < 0 || endIndex < 0) return null;
                const width =
                  (endIndex - startIndex + 1) * TIMELINE_COLUMN_WIDTH;
                return (
                  <div
                    key={month.key}
                    className="absolute top-0 flex items-center border-l border-border/70 px-2 text-[11px] font-medium text-foreground/80"
                    style={{
                      left: startIndex * TIMELINE_COLUMN_WIDTH,
                      width,
                      height: HEADER_ROW,
                    }}
                  >
                    <span className="truncate">{month.label}</span>
                  </div>
                );
              })}
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={cn(
                    "absolute flex items-center justify-center border-l border-border/60 text-[11px] text-muted-foreground tabular-nums",
                    monthBands.length > 0 && "border-t",
                    scale === "day" &&
                      isWeekendDayNumber(column.start) &&
                      "bg-muted/50",
                  )}
                  style={{
                    top: monthBands.length > 0 ? HEADER_ROW : 0,
                    left: columnLeft(column),
                    width: TIMELINE_COLUMN_WIDTH,
                    height: HEADER_ROW,
                  }}
                >
                  {column.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {rows.map((row) => {
              if (row.kind === "group") {
                const tint =
                  !row.empty &&
                  row.color &&
                  (row.groupKind === "cluster" || row.groupKind === "split")
                    ? `${row.color}22`
                    : undefined;
                const cellTone = row.empty
                  ? "#94a3b8"
                  : (row.color ?? DEFAULT_CELL_COLOR);

                const canOpenGroupRecord =
                  !row.expandable &&
                  row.items.length === 1 &&
                  Boolean(onOpenRecord);

                return (
                  <div
                    key={`group-${row.key}`}
                    className={cn(
                      "flex h-7 shrink-0 border-b border-border/50",
                      row.empty && "bg-muted/80",
                    )}
                    style={{
                      height: ROW_HEIGHT,
                      backgroundColor: tint,
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border pr-2 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
                        ROW_LABEL_CLASS,
                        row.empty
                          ? "bg-muted text-muted-foreground"
                          : "bg-card text-foreground",
                        canOpenGroupRecord &&
                          "hover:bg-muted/40 hover:text-foreground",
                      )}
                      style={{
                        width: LIST_WIDTH,
                        paddingLeft: 8 + row.depth * 14,
                        ...(tint
                          ? {
                              backgroundImage: `linear-gradient(${tint}, ${tint})`,
                            }
                          : {}),
                      }}
                      aria-expanded={
                        row.expandable ? !row.collapsed : undefined
                      }
                      onClick={() => {
                        if (row.expandable) {
                          toggleGroup(row.key, row.groupKind);
                          return;
                        }
                        const only = row.items[0];
                        if (only) onOpenRecord?.(only.record);
                      }}
                    >
                      {row.expandable ? (
                        row.collapsed ? (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        )
                      ) : (
                        <span className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate leading-none">
                        {row.label}
                      </span>
                    </button>
                    <div
                      className="flex h-full shrink-0"
                      style={{ width: chartWidth }}
                    >
                      {columns.map((column) => {
                        const inColumn = row.items.filter((item) =>
                          timelineItemInColumn(item, column),
                        );
                        const label = groupCellLabel(row.items, column);
                        const color =
                          row.groupKind === "row"
                            ? (groupCellColor(row.items, column) ??
                              row.color ??
                              DEFAULT_CELL_COLOR)
                            : cellTone;
                        const openGroupCell =
                          inColumn.length > 0 && label
                            ? () => {
                                setBrowse({
                                  recordIds: inColumn.map(
                                    (item) => item.record.id,
                                  ),
                                  title: row.label,
                                  cellLabel: label,
                                });
                              }
                            : undefined;
                        return (
                          <div
                            key={column.key}
                            className={cn(
                              "flex h-full items-stretch border-l border-border/40 p-0",
                              scale === "day" &&
                                isWeekendDayNumber(column.start) &&
                                !tint &&
                                "bg-muted/30",
                            )}
                            style={{ width: TIMELINE_COLUMN_WIDTH }}
                          >
                            {label ? (
                              <CellValue
                                label={label}
                                color={color}
                                title={label}
                                onClick={openGroupCell}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const { item } = row;
              const record = item.record;
              const title = recordTitle(record);
              const label = cellLabel(record);
              const color = cellColor(record);

              return (
                <div
                  key={record.id}
                  className="flex h-7 shrink-0 border-b border-border/40"
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    className={cn(
                      "sticky left-0 z-10 flex h-full shrink-0 items-center border-r border-border bg-card pr-2 text-left text-muted-foreground shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] hover:bg-muted/40 hover:text-foreground",
                      ROW_LABEL_CLASS,
                    )}
                    style={{
                      width: LIST_WIDTH,
                      paddingLeft: 8 + row.depth * 14,
                    }}
                    title={title}
                    onClick={() => onOpenRecord?.(record)}
                  >
                    <span className="truncate leading-none">{title}</span>
                  </button>
                  <div
                    className="flex h-full shrink-0"
                    style={{ width: chartWidth }}
                  >
                    {columns.map((column) => {
                      const active = timelineItemInColumn(item, column);
                      return (
                        <div
                          key={column.key}
                          className={cn(
                            "flex h-full items-stretch border-l border-border/40 p-0",
                            scale === "day" &&
                              isWeekendDayNumber(column.start) &&
                              "bg-muted/30",
                          )}
                          style={{ width: TIMELINE_COLUMN_WIDTH }}
                        >
                          {active ? (
                            <CellValue
                              label={label}
                              color={color}
                              title={`${title}: ${label}`}
                              onClick={() => onOpenRecord?.(record)}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <TimelineGroupRecordsDialog
        open={browse != null && browseRecords.length > 0}
        onOpenChange={(open) => {
          if (!open) setBrowse(null);
        }}
        entity={entity}
        records={browseRecords}
        groupLabel={browse?.title ?? ""}
        cellLabel={browse?.cellLabel}
      />
    </div>
  );
}
