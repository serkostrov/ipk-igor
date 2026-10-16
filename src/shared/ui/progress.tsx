import { cn } from "@/shared/lib/cn";

type ProgressProps = {
  /** 0–100 (clamped). */
  value: number;
  className?: string;
  indicatorClassName?: string;
};

function Progress({ value, className, indicatorClassName }: ProgressProps) {
  const percent = Math.min(
    100,
    Math.max(0, Number.isFinite(value) ? value : 0),
  );
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-300",
          indicatorClassName,
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export { Progress };
