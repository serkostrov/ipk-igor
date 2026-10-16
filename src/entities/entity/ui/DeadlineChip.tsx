import { cn } from "@/shared/lib/cn";
import {
  getEntityDeadlineLabel,
  type EntityDeadlineState,
} from "../model/deadline";

const TONE_CLASS: Record<EntityDeadlineState["status"], string> = {
  overdue: "border-transparent bg-[#ef4444] text-white",
  today: "border-[#f97316]/25 bg-[#f97316]/15 text-[#c2410c]",
  soon: "border-[#f59e0b]/25 bg-[#f59e0b]/15 text-[#b45309]",
  preliminary:
    "border-dashed border-border bg-transparent text-muted-foreground",
  done: "border-border/70 bg-muted/60 text-muted-foreground",
  normal: "border-border/70 bg-muted/60 text-muted-foreground",
  none: "border-border/70 bg-muted/60 text-muted-foreground",
};

/** Compact due-status chip for date fields with «Контроль срока». */
export function DeadlineChip({
  state,
  className,
}: {
  state: EntityDeadlineState;
  className?: string;
}) {
  if (state.status === "none" || state.status === "normal") return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap",
        TONE_CLASS[state.status],
        className,
      )}
    >
      {getEntityDeadlineLabel(state)}
    </span>
  );
}
