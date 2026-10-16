import { Progress } from "@/shared/ui/progress";
import { cn } from "@/shared/lib/cn";

/**
 * `completion` — green at 100%; `load` — amber below 100% (idle),
 * red above it (overtime).
 */
type ProgressTone = "completion" | "load";

function indicatorClass(percent: number, tone: ProgressTone) {
  if (tone === "load") {
    if (percent > 100) return "bg-[#ef4444]";
    if (percent < 100) return "bg-[#f59e0b]";
  }
  return percent >= 100 ? "bg-[#22c55e]" : undefined;
}

/** Percent value as a thin bar with the number on the right. */
export function ProgressValue({
  value,
  tone = "completion",
  className,
}: {
  value: number | null;
  tone?: ProgressTone;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-sm text-muted-foreground/70">—</span>;
  }
  const percent = Math.round(value);
  return (
    <span
      className={cn("flex w-full min-w-0 items-center gap-2", className)}
      title={`${percent}%`}
    >
      <Progress
        value={percent}
        className="min-w-10 flex-1"
        indicatorClassName={indicatorClass(percent, tone)}
      />
      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
        {percent}%
      </span>
    </span>
  );
}
