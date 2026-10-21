import type { ReactNode } from "react";

export function EntitySettingsSkeleton({ leading }: { leading?: ReactNode }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-5"
      aria-busy="true"
      aria-label="Загрузка сущностей"
    >
      <div className="flex min-h-9 min-w-0 items-center">
        <div className="min-w-0 flex-1 overflow-hidden">{leading}</div>
        <div className="relative z-10 flex shrink-0 items-center gap-2 bg-background pl-3">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted/60" />
          <div className="size-9 animate-pulse rounded-md bg-muted/60" />
          <div className="size-9 animate-pulse rounded-md bg-muted/60" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-2">
            <div className="h-6 w-48 animate-pulse rounded-md bg-muted/60" />
            <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-muted/40" />
          </div>
          <div className="flex gap-1">
            <div className="size-8 animate-pulse rounded-md bg-muted/40" />
            <div className="size-8 animate-pulse rounded-md bg-muted/40" />
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="h-24 w-full animate-pulse rounded-lg border border-dashed border-border bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
