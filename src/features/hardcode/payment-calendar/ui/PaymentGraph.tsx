import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatEntityDecimalTotal } from "@/entities/entity";
import { isWeekendDayNumber, todayIsoDate } from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import { moneyOrDash } from "../../deal-card/model/format";
import {
  buildPaymentGraph,
  findGraphColumn,
  type GraphCell,
  type GraphColumn,
  type GraphNode,
  type GraphScale,
} from "../model/graph";
import { STATUS_COLORS, STATUS_VIEW } from "../model/labels";
import type {
  CalendarReceipt,
  PaymentRow,
  UnallocatedReceipt,
} from "../model/types";
import type { OpenRecord } from "./types";

const ROW_HEIGHT = 28;
const HEADER_ROW = 24;
const LIST_WIDTH = 280;
const COLUMN_WIDTH = 100;
const SECTION_COLOR = "#3b82f6";
const SECTION_TINT = `${SECTION_COLOR}22`;
const ROW_LABEL_CLASS =
  "text-[11px] font-normal leading-none tracking-normal normal-case";
const LABEL_STICKY_CLASS =
  "sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border pr-2 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

type DisplayRow = {
  key: string;
  label: string;
  depth: number;
  expandable: boolean;
  collapsed: boolean;
  strong?: boolean;
  tint?: string;
  onLabelClick?: () => void;
  cellFor: (column: GraphColumn) => {
    label: string;
    color: string;
    title: string;
  } | null;
};

function CellValue({
  label,
  color,
  title,
}: {
  label: string;
  color: string;
  title: string;
}) {
  return (
    <span
      className="flex size-full min-w-0 items-center justify-center px-1.5 text-center text-[11px] leading-none font-normal tabular-nums"
      style={{ backgroundColor: `${color}28`, color: "var(--foreground)" }}
      title={title}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
}

function paymentCell(cell: GraphCell | undefined) {
  if (!cell) return null;
  const status = STATUS_VIEW[cell.status].label;
  return {
    label: formatEntityDecimalTotal(cell.amount),
    color: STATUS_COLORS[cell.status],
    title: [
      `План: ${moneyOrDash(cell.amount)}`,
      `Факт: ${moneyOrDash(cell.paid)}`,
      `Остаток: ${moneyOrDash(cell.remaining)}`,
      cell.count > 1 ? `Платежей: ${cell.count}` : status,
    ].join(" · "),
  };
}

function amountCell(title: string, value: number | undefined) {
  if (!value) return null;
  return {
    label: formatEntityDecimalTotal(value),
    color: SECTION_COLOR,
    title: `${title}: ${moneyOrDash(value)}`,
  };
}

/** Grid view in the style of the DDS «График»: rows on the left, dates on top. */
export function PaymentGraph({
  rows,
  receiptsById,
  unallocated,
  scale,
  stageEntityId,
  onOpenRecord,
}: {
  rows: readonly PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  unallocated: readonly UnallocatedReceipt[];
  scale: GraphScale;
  stageEntityId: string | undefined;
  onOpenRecord?: OpenRecord;
}) {
  const graph = useMemo(
    () => buildPaymentGraph({ rows, receiptsById, unallocated, scale }),
    [rows, receiptsById, unallocated, scale],
  );
  const { columns } = graph;
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledScale = useRef<GraphScale | null>(null);

  const showBand = scale === "day" || scale === "week";
  const headerHeight = showBand ? HEADER_ROW * 2 : HEADER_ROW;
  const chartWidth = columns.length * COLUMN_WIDTH;

  useEffect(() => {
    if (scrolledScale.current === scale || columns.length === 0) return;
    const root = scrollRef.current;
    const today = findGraphColumn(columns, todayIsoDate());
    if (!root || !today) return;
    const index = columns.indexOf(today);
    root.scrollLeft = Math.max(
      0,
      LIST_WIDTH +
        index * COLUMN_WIDTH -
        Math.max(root.clientWidth * 0.35, COLUMN_WIDTH * 2),
    );
    scrolledScale.current = scale;
  }, [columns, scale]);

  const toggle = (key: string) =>
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const displayRows: DisplayRow[] = [];

  const totalsKey = "section:totals";
  const totalsCollapsed = collapsedKeys.has(totalsKey);
  displayRows.push({
    key: totalsKey,
    label: "Итого по датам",
    depth: 0,
    expandable: true,
    collapsed: totalsCollapsed,
    strong: true,
    tint: SECTION_TINT,
    cellFor: (column) => amountCell("План", graph.plan[column.key]),
  });
  if (!totalsCollapsed) {
    const sectionRows: Array<[string, string, Record<string, number>]> = [
      ["plan", "План", graph.plan],
      ["fact", "Факт", graph.fact],
      ["unallocated", "Нераспределено", graph.unallocated],
    ];
    for (const [key, label, values] of sectionRows) {
      displayRows.push({
        key: `section:${key}`,
        label,
        depth: 1,
        expandable: false,
        collapsed: false,
        tint: SECTION_TINT,
        cellFor: (column) => amountCell(label, values[column.key]),
      });
    }
  }

  function appendNode(node: GraphNode, depth: number) {
    const expandable = node.children.length > 0;
    const collapsed = expandable && collapsedKeys.has(node.key);
    const open =
      node.ref && !expandable
        ? () =>
            onOpenRecord?.(
              node.ref!.entityId ?? stageEntityId ?? "",
              node.ref!.id,
            )
        : undefined;
    displayRows.push({
      key: node.key,
      label: node.label,
      depth,
      expandable,
      collapsed,
      strong: node.kind === "counterparty",
      onLabelClick: expandable ? () => toggle(node.key) : open,
      cellFor: (column) => paymentCell(node.cells[column.key]),
    });
    if (collapsed) return;
    for (const child of node.children) appendNode(child, depth + 1);
  }
  for (const node of graph.tree) appendNode(node, 0);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <div className="relative" style={{ width: LIST_WIDTH + chartWidth }}>
        <div
          className="sticky top-0 z-20 flex border-b border-border bg-card"
          style={{ height: headerHeight }}
        >
          <div
            className="sticky left-0 z-30 flex h-full shrink-0 items-center border-r border-border bg-card px-3 text-[11px] leading-none font-semibold tracking-wide text-muted-foreground uppercase shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
            style={{ width: LIST_WIDTH }}
          >
            Платежи
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

        {displayRows.map((row) => (
          <div
            key={row.key}
            className="flex shrink-0 border-b border-border/50"
            style={{ height: ROW_HEIGHT, backgroundColor: row.tint }}
          >
            <button
              type="button"
              className={cn(
                LABEL_STICKY_CLASS,
                ROW_LABEL_CLASS,
                "bg-card text-foreground",
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
            <div className="flex h-full shrink-0" style={{ width: chartWidth }}>
              {columns.map((column) => {
                const cell = row.cellFor(column);
                return (
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
                    {cell ? <CellValue {...cell} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
