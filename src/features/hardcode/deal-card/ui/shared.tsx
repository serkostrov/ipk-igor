import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function DealPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DealEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Record title that opens the record when navigation is available. */
export function DealRecordLink({
  entityId,
  recordId,
  title,
  onOpenRelation,
}: {
  entityId: string | undefined;
  recordId: string;
  title: string;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  if (!entityId || !onOpenRelation) {
    return <span className="text-foreground">{title}</span>;
  }
  return (
    <button
      type="button"
      className="max-w-72 truncate text-left font-medium text-primary underline-offset-2 hover:underline"
      title={title}
      onClick={() => onOpenRelation(entityId, recordId)}
    >
      {title}
    </button>
  );
}

const STATUS_TONES = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function DealStatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof STATUS_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        STATUS_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
