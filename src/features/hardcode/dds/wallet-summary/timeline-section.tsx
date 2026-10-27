import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  formatEntityDecimalTotal,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityAggregateRow,
  type EntityRecord,
} from "@/entities/entity";
import { fromDayNumber } from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import {
  buildDdsWalletSummaryRows,
  resolveDdsWalletSummarySetup,
} from "./model";

type TimelineColumn = {
  key: string;
  start: number;
  days: number;
};

type DdsWalletTimelineSectionProps = {
  entity: Entity;
  historyRecords: EntityRecord[];
  columns: TimelineColumn[];
  listWidth: number;
  chartWidth: number;
  columnWidth: number;
  rowHeight: number;
  /** Weekend tint for day scale. */
  isWeekendColumn?: (column: TimelineColumn) => boolean;
};

type WalletColumnCashFlow = {
  opening: number | null;
  income: number;
  expense: number;
  closing: number;
};

type WalletTimelineRow = {
  key: string;
  label: string;
  /** Cash-flow for each timeline column (photo-2 math per period). */
  byColumn: Record<string, WalletColumnCashFlow | null>;
};

const SECTION_TINT = "#3b82f622";
const SECTION_COLOR = "#3b82f6";
const ROW_LABEL_CLASS =
  "text-[11px] font-normal leading-none tracking-normal normal-case";

function columnPeriod(column: TimelineColumn) {
  const from = fromDayNumber(column.start);
  const to = fromDayNumber(column.start + Math.max(column.days, 1) - 1);
  return { from, to };
}

function CellAmount({
  value,
  title,
}: {
  value: number | null | undefined;
  title?: string;
}) {
  if (value == null) return null;
  const label = formatEntityDecimalTotal(value);
  return (
    <div
      className="flex size-full min-w-0 items-center justify-center border-0 px-1.5 text-center text-[11px] font-normal leading-none tabular-nums"
      style={{
        backgroundColor: `${SECTION_COLOR}28`,
        color: "var(--foreground)",
      }}
      title={title ?? label}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

/**
 * Wallet cash-flow rows embedded in the DDS timeline grid
 * (opening balance per column — photo-3 placement, photo-2 calculation).
 */
export function DdsWalletTimelineSection({
  entity,
  historyRecords,
  columns,
  listWidth,
  chartWidth,
  columnWidth,
  rowHeight,
  isWeekendColumn,
}: DdsWalletTimelineSectionProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const [collapsed, setCollapsed] = useState(false);

  const setup = useMemo(
    () => resolveDdsWalletSummarySetup(entity, entities),
    [entity, entities],
  );

  const walletRows = useMemo((): WalletTimelineRow[] => {
    if (!setup || columns.length === 0) return [];

    const orderRows = buildDdsWalletSummaryRows(
      valueContext,
      entity,
      historyRecords,
      setup,
      { from: "", to: "" },
    );
    if (orderRows.length === 0) return [];

    const perColumn = new Map<string, EntityAggregateRow[]>();
    for (const column of columns) {
      perColumn.set(
        column.key,
        buildDdsWalletSummaryRows(
          valueContext,
          entity,
          historyRecords,
          setup,
          columnPeriod(column),
        ),
      );
    }

    return orderRows.map((row) => {
      const byColumn: WalletTimelineRow["byColumn"] = {};
      for (const column of columns) {
        const match = perColumn
          .get(column.key)
          ?.find((item) => item.key === row.key);
        byColumn[column.key] = match?.cashFlow
          ? {
              opening: match.cashFlow.opening,
              income: match.cashFlow.income,
              expense: match.cashFlow.expense,
              closing: match.cashFlow.closing,
            }
          : null;
      }
      return {
        key: row.key,
        label: row.groups[0]?.label ?? "—",
        byColumn,
      };
    });
  }, [columns, entity, historyRecords, setup, valueContext]);

  const totalsByColumn = useMemo(() => {
    const totals: Record<string, WalletColumnCashFlow> = {};
    for (const column of columns) {
      totals[column.key] = {
        opening: null,
        income: 0,
        expense: 0,
        closing: 0,
      };
    }
    for (const row of walletRows) {
      for (const column of columns) {
        const cf = row.byColumn[column.key];
        const acc = totals[column.key]!;
        if (!cf) continue;
        if (cf.opening != null) {
          acc.opening = (acc.opening ?? 0) + cf.opening;
        }
        acc.income += cf.income;
        acc.expense += cf.expense;
        acc.closing += cf.closing;
      }
    }
    return totals;
  }, [columns, walletRows]);

  if (!setup || walletRows.length === 0) return null;

  function renderLabelCell(args: {
    label: string;
    depth: number;
    expandable?: boolean;
    collapsed?: boolean;
    onToggle?: () => void;
    strong?: boolean;
  }) {
    const {
      label,
      depth,
      expandable = false,
      collapsed: isCollapsed = false,
      onToggle,
      strong,
    } = args;
    return (
      <button
        type="button"
        className={cn(
          "sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border pr-2 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
          ROW_LABEL_CLASS,
          "bg-card text-foreground",
          expandable && "hover:bg-muted/40",
          strong && "font-medium",
        )}
        style={{
          width: listWidth,
          paddingLeft: 8 + depth * 14,
          backgroundImage: `linear-gradient(${SECTION_TINT}, ${SECTION_TINT})`,
        }}
        aria-expanded={expandable ? !isCollapsed : undefined}
        onClick={() => {
          if (expandable) onToggle?.();
        }}
      >
        {expandable ? (
          isCollapsed ? (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
      </button>
    );
  }

  function renderAmountRow(
    key: string,
    label: string,
    depth: number,
    byColumn: Record<string, WalletColumnCashFlow | null | undefined>,
    metric: keyof WalletColumnCashFlow,
    options?: {
      expandable?: boolean;
      collapsed?: boolean;
      onToggle?: () => void;
      strong?: boolean;
    },
  ) {
    return (
      <div
        key={key}
        className="flex h-7 shrink-0 border-b border-border/50"
        style={{ height: rowHeight, backgroundColor: SECTION_TINT }}
      >
        {renderLabelCell({
          label,
          depth,
          expandable: options?.expandable,
          collapsed: options?.collapsed,
          onToggle: options?.onToggle,
          strong: options?.strong,
        })}
        <div className="flex h-full shrink-0" style={{ width: chartWidth }}>
          {columns.map((column, columnIndex) => {
            const cf = byColumn[column.key];
            const prevKey = columns[columnIndex - 1]?.key;
            const prevCf = prevKey ? byColumn[prevKey] : null;
            const hasMovement =
              cf != null && (cf.income !== 0 || cf.expense !== 0);
            const openingChanged =
              cf?.opening != null &&
              (prevCf?.opening == null || prevCf.opening !== cf.opening);
            // Skip carry-forward duplicates: empty months kept repeating the
            // same opening after the last movement.
            const showValue = hasMovement || openingChanged;
            const value = showValue ? (cf?.[metric] ?? null) : null;
            const title =
              cf == null
                ? undefined
                : [
                    `Начало: ${cf.opening == null ? "—" : formatEntityDecimalTotal(cf.opening)}`,
                    `Приход: ${formatEntityDecimalTotal(cf.income)}`,
                    `Расход: ${formatEntityDecimalTotal(-Math.abs(cf.expense))}`,
                    `Конец: ${formatEntityDecimalTotal(cf.closing)}`,
                  ].join(" · ");
            return (
              <div
                key={column.key}
                className={cn(
                  "flex h-full items-stretch border-l border-border/40 p-0",
                  isWeekendColumn?.(column) && "bg-muted/30",
                )}
                style={{ width: columnWidth }}
              >
                <CellAmount value={value} title={title} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderAmountRow(
        "hardcode-dds-wallets-header",
        "Баланс по кошелькам",
        0,
        totalsByColumn,
        "opening",
        {
          expandable: true,
          collapsed,
          onToggle: () => setCollapsed((value) => !value),
          strong: true,
        },
      )}
      {collapsed
        ? null
        : walletRows.map((row) =>
            renderAmountRow(
              `hardcode-dds-wallet-${row.key}`,
              row.label,
              1,
              row.byColumn,
              "opening",
            ),
          )}
    </>
  );
}
