import { Square } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useNow } from "@/shared/hooks/use-now";
import { formatElapsed } from "@/shared/lib/datetime";
import {
  resolveRelationRecordLabel,
  stopRunningTimer,
  useRunningTimer,
} from "@/entities/entity";

/** Running timer of the signed-in user: record, elapsed time and «Стоп». */
export function RunningTimerCard({
  collapsed,
  onOpenRecord,
}: {
  collapsed: boolean;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const running = useRunningTimer();
  const now = useNow(1000, running != null);
  if (!running) return null;

  const elapsed = formatElapsed(now - running.startedAt.getTime());
  const title = running.record
    ? (resolveRelationRecordLabel(running.entity, running.record.id) ??
      "Без названия")
    : "Запись удалена";
  const entityLabel =
    running.entity.name.trim() || running.entity.namePlural.trim();
  const record = running.record;
  const open =
    record && onOpenRecord
      ? () => onOpenRecord(running.entity.id, record.id)
      : undefined;

  if (collapsed) {
    return (
      <Button
        type="button"
        size="icon-sm"
        className="mx-auto mb-2 flex size-9 rounded-full"
        aria-label={`Остановить таймер «${title}» (${elapsed})`}
        title={`${title} · ${elapsed}`}
        onClick={stopRunningTimer}
      >
        <Square className="size-3 fill-current" />
      </Button>
    );
  }

  return (
    <div className="mx-2 mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-2.5">
      <button
        type="button"
        className="flex w-full min-w-0 flex-col gap-0.5 text-left disabled:cursor-default"
        disabled={!open}
        onClick={open}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-sidebar-foreground/60 uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          <span className="truncate">Таймер · {entityLabel}</span>
        </span>
        <span className="truncate text-xs font-medium text-sidebar-foreground">
          {title}
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-sidebar-foreground tabular-nums">
          {elapsed}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2.5 text-xs"
          onClick={stopRunningTimer}
        >
          <Square className="size-3 fill-current" />
          Стоп
        </Button>
      </div>
    </div>
  );
}
