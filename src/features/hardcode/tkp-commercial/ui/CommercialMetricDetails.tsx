import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import type { FormulaRow } from "../model/metric-rows";

export function CommercialMetricDetails({
  metricKey,
  label,
  value,
  strong = false,
  wide = false,
  children,
}: {
  metricKey: string;
  label: string;
  value: string;
  strong?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className={cn(
        "group/metric rounded-xl border border-border/70 bg-muted/15 open:col-span-full open:border-border open:bg-card open:shadow-xs",
        wide && "sm:col-span-2",
        strong && "border-border bg-background",
      )}
      data-testid={`review-commercial-price-metric-${metricKey}`}
    >
      <summary
        className="flex cursor-pointer list-none items-start gap-3 rounded-xl px-3.5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-open/metric:rounded-b-none [&::-webkit-details-marker]:hidden"
        data-pricing-label={label}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] leading-snug font-medium text-muted-foreground">
              {label}
            </span>
            <ChevronDown
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-open/metric:rotate-180"
              aria-hidden
            />
          </div>
          <p
            className={cn(
              "tabular-nums tracking-tight text-foreground",
              strong ? "text-lg font-semibold" : "text-base font-semibold",
            )}
          >
            {value}
          </p>
        </div>
      </summary>
      <div className="space-y-3 border-t border-border/60 px-3.5 py-4">
        {children}
      </div>
    </details>
  );
}

export function PricingValue({
  label,
  value,
  strong = false,
  wide = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-muted/15 px-3.5 py-3",
        wide && "sm:col-span-2",
        strong && "border-border bg-background",
      )}
      data-pricing-value-label={label}
    >
      <div className="space-y-1.5">
        <div className="text-[11px] leading-snug font-medium text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "tabular-nums tracking-tight text-foreground",
            strong ? "text-lg font-semibold" : "text-base font-semibold",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function FormulaBreakdown({ rows }: { rows: FormulaRow[] }) {
  return (
    <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/25 p-3 text-sm sm:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1"
        >
          <dt className="text-[11px] leading-snug text-muted-foreground">
            {row.label}
          </dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {row.value}
          </dd>
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
