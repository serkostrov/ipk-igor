import { ChevronDown } from "lucide-react";
import { formatEntityDecimalTotal } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import {
  profitLossPercentValue,
  sumProfitLossValues,
} from "../model/calculation";
import type {
  ProfitLossMonth,
  ProfitLossReport,
  ProfitLossReportRow,
  ProfitLossRowKind,
  ProfitLossRowTone,
} from "../model/types";

function formatMoney(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "";
  return formatEntityDecimalTotal(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "";
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatCell(value: number, kind: ProfitLossRowKind = "money") {
  return kind === "percent" ? formatPercent(value) : formatMoney(value);
}

function rowToneClass(tone: ProfitLossRowTone | undefined) {
  switch (tone) {
    case "dark":
      return "bg-foreground text-background font-semibold";
    case "result":
      return "bg-primary/10 font-semibold";
    case "section":
      return "bg-muted/60 font-semibold";
    case "warning":
      return "bg-muted/40";
    case "danger":
      return "bg-destructive/10";
    default:
      return "hover:bg-muted/30";
  }
}

function cellTextClass(tone: ProfitLossRowTone | undefined, value: number) {
  if (tone === "dark") return "";
  return value < 0 ? "text-destructive" : "";
}

type OpiuReportTableProps = {
  report: ProfitLossReport;
  year: number;
  collapsedRows: Set<string>;
  onToggleCollapsed: (key: string) => void;
  loading?: boolean;
};

export function OpiuReportTable({
  report,
  year,
  collapsedRows,
  onToggleCollapsed,
  loading,
}: OpiuReportTableProps) {
  const months = report.months;
  const visibleRows = report.rows.filter(
    (row) => !row.parentKeys?.some((parentKey) => collapsedRows.has(parentKey)),
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
      <table
        className="w-full border-collapse text-xs"
        style={{ minWidth: 1340, tableLayout: "fixed" }}
      >
        <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
          <tr>
            <th
              className="sticky left-0 z-20 border-r border-border bg-muted px-2 py-2 text-left font-semibold"
              style={{ width: 360, minWidth: 360 }}
            >
              Статья
            </th>
            {months.map((month, index) => (
              <th
                key={month.key}
                className={cn(
                  "px-2 py-2 text-center font-medium",
                  index === months.length - 1
                    ? "border-r border-r-foreground/40"
                    : "border-r border-border",
                )}
              >
                {month.label}
              </th>
            ))}
            <th
              className="border-l border-l-foreground/40 bg-muted px-2 py-2 text-center font-semibold text-foreground"
              style={{ width: 112, minWidth: 112 }}
            >
              ИТОГО {year}
            </th>
            <th
              className="border-l border-border bg-muted px-2 py-2 text-center font-semibold text-foreground"
              style={{ width: 116, minWidth: 116 }}
            >
              Доля в выручке
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={months.length + 3}
                className="px-2 py-8 text-center text-muted-foreground"
              >
                Загрузка…
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
              <OpiuReportRowView
                key={row.key}
                row={row}
                months={months}
                revenueTotal={report.revenueTotal}
                collapsed={collapsedRows.has(row.key)}
                onToggle={() => onToggleCollapsed(row.key)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function OpiuReportRowView({
  row,
  months,
  revenueTotal,
  collapsed,
  onToggle,
}: {
  row: ProfitLossReportRow;
  months: ProfitLossMonth[];
  revenueTotal: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const total = row.total ?? sumProfitLossValues(row.values);
  const tone = row.tone ?? "default";
  const kind = row.kind ?? "money";

  return (
    <tr className={cn(rowToneClass(tone), "border-b border-border/70")}>
      <td
        className={cn(
          "sticky left-0 z-10 border-r border-border bg-inherit px-2 py-1.5",
          tone === "dark" ? "text-background" : "text-foreground",
        )}
      >
        {row.collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex w-full cursor-pointer select-none items-center gap-2 text-left"
            style={{ paddingLeft: `${(row.level ?? 0) * 18}px` }}
          >
            <span className="min-w-0 flex-1">{row.label}</span>
            <ChevronDown
              className={cn(
                "size-3 shrink-0 transition-transform",
                collapsed && "-rotate-90",
              )}
            />
          </button>
        ) : (
          <div
            className="min-w-0"
            style={{ paddingLeft: `${(row.level ?? 0) * 18}px` }}
          >
            {row.label}
          </div>
        )}
      </td>
      {row.values.map((value, index) => (
        <td
          key={`${row.key}-${months[index]?.key ?? index}`}
          className={cn(
            "px-2 py-1.5 text-center tabular-nums",
            index === months.length - 1
              ? "border-r border-r-foreground/40"
              : "border-r border-border",
            cellTextClass(tone, value),
          )}
        >
          {formatCell(value, kind)}
        </td>
      ))}
      <td
        className={cn(
          "border-l border-l-foreground/40 bg-inherit px-2 py-1.5 text-center font-semibold tabular-nums",
          cellTextClass(tone, total),
        )}
      >
        {formatCell(total, kind)}
      </td>
      <td
        className={cn(
          "border-l border-border bg-inherit px-2 py-1.5 text-center font-semibold tabular-nums",
          cellTextClass(tone, total),
        )}
      >
        {kind === "percent"
          ? ""
          : formatPercent(profitLossPercentValue(total, revenueTotal))}
      </td>
    </tr>
  );
}
