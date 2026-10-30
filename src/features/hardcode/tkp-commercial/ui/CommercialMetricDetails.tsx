import type { ReactNode } from "react";

import type { FormulaRow } from "../model/metric-rows";

export function CommercialMetricDetails({
  metricKey,
  label,
  value,
  strong = false,
  children,
}: {
  metricKey: string;
  label: string;
  value: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-md border bg-background open:col-span-full"
      data-testid={`review-commercial-price-metric-${metricKey}`}
    >
      <summary
        className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        data-pricing-label={label}
      >
        <span className="text-[10px] uppercase text-muted-foreground">
          {label}
        </span>
        <span
          className={`shrink-0 tabular-nums ${strong ? "text-base font-bold" : "text-sm font-medium"}`}
        >
          {value}
        </span>
      </summary>
      <div className="space-y-3 border-t px-3 py-4">{children}</div>
    </details>
  );
}

export function PricingValue({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className="rounded-md border bg-background p-3"
      data-pricing-value-label={label}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase text-muted-foreground">
          {label}
        </div>
        <div
          className={`shrink-0 tabular-nums ${strong ? "text-base font-bold" : "text-sm font-medium"}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function FormulaBreakdown({ rows }: { rows: FormulaRow[] }) {
  return (
    <dl className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 sm:block"
        >
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HistoricalGipBreakdownNotice() {
  return (
    <p className="text-xs text-muted-foreground">
      Построчный состав расчёта ГИПа в snapshot цены не сохраняется, поэтому
      текущие строки расчёта здесь не подставляются.
    </p>
  );
}
