import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChartGantt, ChevronDown, ChevronRight } from "lucide-react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  isWeekendDayNumber,
  todayIsoDate,
  toDayNumber,
} from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import {
  formatEntityDecimalTotal,
  formatEntityFieldScalarValue,
  formatRecordFieldValue,
  getEntityFieldValueKind,
  getEntityListOption,
  getEntityTimelineDates,
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
  timelineItemInColumn,
  type TimelineGroup,
  type TimelineItem,
  type TimelineSegment,
} from "@/pages/entity/lib/timeline-layout";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "@/pages/entity/ui/EntityBrowseFilters";
import { TimelineGroupRecordsDialog } from "@/pages/entity/ui/TimelineGroupRecordsDialog";
import { moneyOrDash } from "../../deal-card/model/format";
import { DdsWalletTimelineSection } from "../../dds/wallet-summary/timeline-section";
import { resolveDdsWalletSummarySetup } from "../../dds/wallet-summary/model";
import type { PaymentCalendarSources } from "../match";
import {
  buildGraphColumns,
  findGraphColumn,
  type GraphScale,
} from "../model/graph";
import { STATUS_COLORS, STATUS_VIEW } from "../model/labels";
import { buildPlanGraph, type PlanNode } from "../model/plan-graph";
import { createPlanRecordFactory } from "../model/plan-records";
import type {
  CalendarReceipt,
  PaymentRow,
  UnallocatedReceipt,
} from "../model/types";
import type { OpenRecord } from "./types";

const ROW_HEIGHT = 28;
const HEADER_ROW = 24;
const LIST_WIDTH = 280;
/** Wide enough for a «план | факт» pair of sums like «1 225 000». */
const COLUMN_WIDTH = 140;
const DEFAULT_CELL_COLOR = "#3b82f6";
const FACT_COLOR = "#10b981";
const SECTION_COLOR = "#3b82f6";
const SECTION_TINT = `${SECTION_COLOR}22`;
const ROW_LABEL_CLASS =
  "text-[11px] font-normal leading-none tracking-normal normal-case";
const LABEL_STICKY_CLASS =
  "sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border pr-2 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";
const EMPTY_GROUPS: TimelineGroup[] = [];

function filtersWithoutField(
  filters: EntityFiltersState,
  fieldId: string,
): EntityFiltersState {
  if (!(fieldId in filters)) return filters;
  const next = { ...filters };
  delete next[fieldId];
  return next;
}

type DisplayRow = {
  key: string;
  label: string;
  depth: number;
  expandable: boolean;
  collapsed: boolean;
  strong?: boolean;
  /** Background of the whole row (cluster / split colors, plan section). */
  tint?: string;
  /** Muted row («Без значения»). */
  empty?: boolean;
  onLabelClick?: () => void;
  renderCell: (column: TimelineSegment) => ReactNode;
};

function CellValue({
  label,
  color,
  title,
  onClick,
}: {
  label: string;
  color: string;
  title?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "flex size-full min-w-0 items-center justify-center border-0 px-1.5 text-center text-[11px] leading-none font-normal tabular-nums outline-none",
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

/**
 * Graph of the payment calendar — the DDS graph (same grouping, filters,
 * wallet balances, drill-down) plus a plan-vs-fact block of planned receipts.
 */
export function PaymentGraph({
  entity,
  sources,
  records,
  rows,
  receiptsById,
  unallocated,
  scale,
  onOpenRecord,
}: {
  /** The ДДС operations entity. */
  entity: Entity;
  sources: PaymentCalendarSources;
  /** ДДС operations visible to the user. */
  records: readonly EntityRecord[];
  rows: readonly PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  unallocated: readonly UnallocatedReceipt[];
  scale: GraphScale;
  onOpenRecord?: OpenRecord;
}) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const setup = useMemo(() => getEntityTimelineSetup(entity), [entity]);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());
  /** Cluster / split collapse by default open; «Строки» hierarchy default closed. */
  const [expandedRowKeys, setExpandedRowKeys] = useState(
    () => new Set<string>(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledScale = useRef<GraphScale | null>(null);
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

  // Plan rows pass through the same DDS filters as virtual ДДС records.
  const planRecordOf = useMemo(
    () => createPlanRecordFactory(entity, sources, setup),
    [entity, sources, setup],
  );
  const visiblePlanRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!row.dueDate) return false;
        const record = planRecordOf(row);
        return (
          recordMatchesSearch(valueContext, entity, record, search) &&
          recordMatchesFilters(
            valueContext,
            entity,
            record,
            filterFields,
            filters,
          )
        );
      }),
    [rows, planRecordOf, valueContext, entity, search, filterFields, filters],
  );
  const visibleUnallocated = useMemo(
    () =>
      unallocated.filter(
        (item) =>
          Object.keys(filters).length === 0 &&
          (search.trim() === "" ||
            item.receipt.title
              .toLocaleLowerCase("ru")
              .includes(search.trim().toLocaleLowerCase("ru"))),
      ),
    [unallocated, filters, search],
  );

  const walletSetup = useMemo(
    () => resolveDdsWalletSummarySetup(entity, entities),
    [entity, entities],
  );
  const walletHistoryRecords = useMemo(() => {
    if (!walletSetup) return [];
    const historyFilters = filtersWithoutField(
      filters,
      walletSetup.cashFlow.dateFieldId,
    );
    return records.filter(
      (record) =>
        recordMatchesSearch(valueContext, entity, record, search) &&
        recordMatchesFilters(
          valueContext,
          entity,
          record,
          filterFields,
          historyFilters,
        ),
    );
  }, [
    walletSetup,
    entity,
    filterFields,
    filters,
    records,
    search,
    valueContext,
  ]);

  const groupsValue = useAsyncValue(
    () =>
      setup
        ? buildTimelineGroups(valueContext, entity, setup, filteredRecords)
        : Promise.resolve<TimelineGroup[]>([]),
    [entity, filteredRecords, setup, valueContext],
  );
  const groups =
    groupsValue.status === "ready" ? groupsValue.value : EMPTY_GROUPS;

  const columns = useMemo(() => {
    const dates: string[] = [];
    if (setup) {
      for (const record of filteredRecords) {
        const range = getEntityTimelineDates(setup, record);
        if (range) dates.push(range.start);
      }
    }
    for (const row of visiblePlanRows) {
      if (row.dueDate) dates.push(row.dueDate);
      for (const share of row.receipts) {
        const date = receiptsById.get(share.receiptId)?.date;
        if (date) dates.push(date);
      }
    }
    for (const item of visibleUnallocated) dates.push(item.receipt.date);
    return buildGraphColumns(scale, dates);
  }, [
    scale,
    setup,
    filteredRecords,
    visiblePlanRows,
    visibleUnallocated,
    receiptsById,
  ]);

  const planRoot = useMemo(
    () =>
      buildPlanGraph({
        rows: visiblePlanRows,
        receiptsById,
        unallocated: visibleUnallocated,
        columns,
      }),
    [visiblePlanRows, receiptsById, visibleUnallocated, columns],
  );

  const showBand = scale === "day" || scale === "week";
  const headerHeight = showBand ? HEADER_ROW * 2 : HEADER_ROW;
  const chartWidth = columns.length * COLUMN_WIDTH;

  useEffect(() => {
    if (scrolledScale.current === scale || columns.length === 0) return;
    const root = scrollRef.current;
    const todayColumn = findGraphColumn(columns, todayIsoDate());
    if (!root || !todayColumn) return;
    root.scrollLeft = Math.max(
      0,
      LIST_WIDTH +
        columns.indexOf(todayColumn) * COLUMN_WIDTH -
        Math.max(root.clientWidth * 0.35, COLUMN_WIDTH * 2),
    );
    scrolledScale.current = scale;
  }, [columns, scale]);

  function toggle(setter: typeof setCollapsedKeys, key: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function cellColor(record: EntityRecord) {
    const field = setup?.colorField;
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
    const field = setup?.labelField;
    if (!field) return recordTitle(record);
    const text = formatRecordFieldValue(valueContext, entity, record, field);
    return text === "—" ? recordTitle(record) : text;
  }

  function groupCellLabel(items: TimelineItem[], column: TimelineSegment) {
    const inColumn = items.filter((item) => timelineItemInColumn(item, column));
    if (inColumn.length === 0) return null;
    const field = setup?.labelField;
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
    if (inColumn.length === 1) return cellLabel(inColumn[0]!.record);
    return String(inColumn.length);
  }

  function groupCellColor(items: TimelineItem[], column: TimelineSegment) {
    const first = items.find((item) => timelineItemInColumn(item, column));
    return first ? cellColor(first.record) : null;
  }

  const displayRows: DisplayRow[] = [];

  // --- Plan vs fact block (юрлицо → контрагент → договор → этап) -----------
  function appendPlanNode(node: PlanNode, depth: number) {
    const expandable = node.children.length > 0;
    const collapsed = expandable && collapsedKeys.has(node.key);
    const open =
      node.ref && node.kind === "stage"
        ? () => onOpenRecord?.(sources.stage?.id ?? "", node.ref!.id)
        : node.ref && node.kind === "contract"
          ? () =>
              onOpenRecord?.(
                node.ref!.entityId ?? sources.contract?.id ?? "",
                node.ref!.id,
              )
          : undefined;
    displayRows.push({
      key: node.key,
      label: node.label,
      depth,
      expandable,
      collapsed,
      strong: node.kind === "root" || node.kind === "legal",
      tint: node.kind === "root" ? SECTION_TINT : undefined,
      onLabelClick: expandable
        ? () => toggle(setCollapsedKeys, node.key)
        : open,
      renderCell: (column) => {
        const plan = node.plan[column.key];
        const fact = node.fact[column.key];
        if (!plan && !fact) return null;
        return (
          <div className="flex size-full">
            <div className="flex w-1/2 min-w-0 items-stretch border-r border-border/30">
              {plan ? (
                <CellValue
                  label={formatEntityDecimalTotal(plan.amount)}
                  color={STATUS_COLORS[plan.status]}
                  title={`План: ${moneyOrDash(plan.amount)} · ${STATUS_VIEW[plan.status].label}${plan.count > 1 ? ` · платежей: ${plan.count}` : ""}`}
                />
              ) : null}
            </div>
            <div className="flex w-1/2 min-w-0 items-stretch">
              {fact ? (
                <CellValue
                  label={formatEntityDecimalTotal(fact)}
                  color={FACT_COLOR}
                  title={`Факт: ${moneyOrDash(fact)}`}
                />
              ) : null}
            </div>
          </div>
        );
      },
    });
    if (collapsed) return;
    for (const childNode of node.children) appendPlanNode(childNode, depth + 1);
  }
  if (planRoot.children.length > 0) appendPlanNode(planRoot, 0);

  // --- DDS facts: the same stepped tree as the DDS graph --------------------
  function appendGroup(group: TimelineGroup) {
    const hasChildren = group.children.length > 0;
    const isCollapsed =
      hasChildren &&
      (group.kind === "row"
        ? !expandedRowKeys.has(group.key)
        : collapsedKeys.has(group.key));
    const empty = group.optionId === "__none__";
    const tint =
      !empty &&
      group.color &&
      (group.kind === "cluster" || group.kind === "split")
        ? `${group.color}22`
        : undefined;
    const cellTone = empty ? "#94a3b8" : (group.color ?? DEFAULT_CELL_COLOR);
    const onlyRecord =
      !hasChildren && group.items.length === 1 ? group.items[0]!.record : null;
    if (setup?.groupField) {
      displayRows.push({
        key: `group-${group.key}`,
        label: group.label,
        depth: group.depth,
        expandable: hasChildren,
        collapsed: isCollapsed,
        tint,
        empty,
        onLabelClick: hasChildren
          ? () =>
              toggle(
                group.kind === "row" ? setExpandedRowKeys : setCollapsedKeys,
                group.key,
              )
          : onlyRecord
            ? () => onOpenRecord?.(entity.id, onlyRecord.id)
            : undefined,
        renderCell: (column) => {
          const inColumn = group.items.filter((item) =>
            timelineItemInColumn(item, column),
          );
          const label = groupCellLabel(group.items, column);
          if (!label) return null;
          const color =
            group.kind === "row"
              ? (groupCellColor(group.items, column) ??
                group.color ??
                DEFAULT_CELL_COLOR)
              : cellTone;
          return (
            <CellValue
              label={label}
              color={color}
              title={label}
              onClick={() =>
                setBrowse({
                  recordIds: inColumn.map((item) => item.record.id),
                  title: group.label,
                  cellLabel: label,
                })
              }
            />
          );
        },
      });
    }
    if (isCollapsed) return;
    if (hasChildren) {
      for (const childGroup of group.children) appendGroup(childGroup);
      return;
    }
    // Flat chart (no «Строки»): each record is its own row.
    if (!setup?.groupField) {
      for (const item of group.items) {
        const record = item.record;
        displayRows.push({
          key: record.id,
          label: recordTitle(record),
          depth: group.depth,
          expandable: false,
          collapsed: false,
          onLabelClick: () => onOpenRecord?.(entity.id, record.id),
          renderCell: (column) =>
            timelineItemInColumn(item, column) ? (
              <CellValue
                label={cellLabel(record)}
                color={cellColor(record)}
                title={`${recordTitle(record)}: ${cellLabel(record)}`}
                onClick={() => onOpenRecord?.(entity.id, record.id)}
              />
            ) : null,
        });
      }
    }
  }
  for (const group of groups) appendGroup(group);

  const todayDay = toDayNumber(todayIsoDate());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <EntityBrowseFilters
          entity={entity}
          fields={filterFields}
          entities={entities}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: `${DEFAULT_CELL_COLOR}66` }}
          />
          План (цвет — статус платежа)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: `${FACT_COLOR}66` }}
          />
          Факт — привязанные поступления
        </span>
        {!setup ? (
          <span className="inline-flex items-center gap-1.5">
            <ChartGantt className="size-3" aria-hidden />
            График ДДС не настроен — фактические операции ДДС не показаны.
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs"
      >
        <div className="relative" style={{ width: LIST_WIDTH + chartWidth }}>
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card"
            style={{ height: headerHeight }}
          >
            <div
              className="sticky left-0 z-30 flex h-full shrink-0 items-center border-r border-border bg-card px-3 text-[11px] leading-none font-semibold tracking-wide text-muted-foreground uppercase shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
              style={{ width: LIST_WIDTH }}
            >
              Записи
            </div>
            <div className="relative shrink-0" style={{ width: chartWidth }}>
              {showBand
                ? columns.map((column, index) =>
                    index > 0 &&
                    columns[index - 1]!.band === column.band ? null : (
                      <div
                        key={`band-${column.key}`}
                        className="absolute top-0 flex items-center border-l border-border/70 px-2 text-[11px] font-medium text-foreground/80"
                        style={{
                          left: index * COLUMN_WIDTH,
                          height: HEADER_ROW,
                        }}
                      >
                        <span className="truncate">{column.band}</span>
                      </div>
                    ),
                  )
                : null}
              {columns.map((column, index) => (
                <div
                  key={column.key}
                  className={cn(
                    "absolute flex items-center justify-center border-l border-border/60 text-[11px] text-muted-foreground tabular-nums",
                    showBand && "border-t",
                    scale === "day" &&
                      isWeekendDayNumber(column.start) &&
                      "bg-muted/50",
                    todayDay != null &&
                      todayDay >= column.start &&
                      todayDay < column.start + column.days &&
                      "font-semibold text-foreground",
                  )}
                  style={{
                    top: showBand ? HEADER_ROW : 0,
                    left: index * COLUMN_WIDTH,
                    width: COLUMN_WIDTH,
                    height: HEADER_ROW,
                  }}
                >
                  {column.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {walletSetup ? (
              <DdsWalletTimelineSection
                entity={entity}
                historyRecords={walletHistoryRecords}
                columns={columns}
                listWidth={LIST_WIDTH}
                chartWidth={chartWidth}
                columnWidth={COLUMN_WIDTH}
                rowHeight={ROW_HEIGHT}
                isWeekendColumn={
                  scale === "day"
                    ? (column) => isWeekendDayNumber(column.start)
                    : undefined
                }
              />
            ) : null}
            {displayRows.map((row) => (
              <div
                key={row.key}
                className={cn(
                  "flex shrink-0 border-b border-border/50",
                  row.empty && "bg-muted/80",
                )}
                style={{ height: ROW_HEIGHT, backgroundColor: row.tint }}
              >
                <button
                  type="button"
                  className={cn(
                    LABEL_STICKY_CLASS,
                    ROW_LABEL_CLASS,
                    row.empty
                      ? "bg-muted text-muted-foreground"
                      : "bg-card text-foreground",
                    row.onLabelClick && "hover:bg-muted/40",
                    row.strong && "font-medium",
                  )}
                  style={{
                    width: LIST_WIDTH,
                    paddingLeft: 8 + row.depth * 14,
                    ...(row.tint
                      ? {
                          backgroundImage: `linear-gradient(${row.tint}, ${row.tint})`,
                        }
                      : {}),
                  }}
                  aria-expanded={row.expandable ? !row.collapsed : undefined}
                  title={row.label}
                  onClick={row.onLabelClick}
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
                  {columns.map((column) => (
                    <div
                      key={column.key}
                      className={cn(
                        "flex h-full items-stretch border-l border-border/40 p-0",
                        scale === "day" &&
                          isWeekendDayNumber(column.start) &&
                          !row.tint &&
                          "bg-muted/30",
                      )}
                      style={{ width: COLUMN_WIDTH }}
                    >
                      {row.renderCell(column)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {displayRows.length === 0 && !walletSetup ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Нет данных для графика.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <TimelineGroupRecordsDialog
        open={browse != null && browse.recordIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setBrowse(null);
        }}
        entity={entity}
        recordIds={browse?.recordIds ?? []}
        groupLabel={browse?.title ?? ""}
        cellLabel={browse?.cellLabel}
      />
    </div>
  );
}
