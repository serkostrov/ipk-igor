import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type MetricTone = "neutral" | "good" | "bad";

export function DashboardState({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: MetricTone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 truncate text-lg font-semibold tracking-tight",
              tone === "good" && "text-emerald-700 dark:text-emerald-400",
              tone === "bad" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

export function ChartSection({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
    </section>
  );
}
