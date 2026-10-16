import { useState } from "react";
import { ClockPlus, Play, Square } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useNow } from "@/shared/hooks/use-now";
import { formatElapsed } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/cn";
import type { Entity, EntityRecord } from "@/entities/entity";
import { TimeEntryDialog } from "./TimeEntryDialog";
import type { RecordTimers } from "./use-record-timers";

/** Elapsed time of the running timer, ticking every second. */
export function TimerElapsed({
  startedAt,
  className,
}: {
  startedAt: Date;
  className?: string;
}) {
  const now = useNow(1000);
  return (
    <span className={cn("tabular-nums", className)}>
      {formatElapsed(now - startedAt.getTime())}
    </span>
  );
}

/** Header pill: «▶ Таймер» → «00:42:13 ■», plus manual time entry. */
export function RecordTimer({
  entity,
  record,
  timers,
}: {
  entity: Entity;
  record: EntityRecord;
  timers: RecordTimers;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  if (!timers.enabled) return null;
  const running = timers.runningRecordId === record.id ? timers.running : null;
  const canStart = timers.canStart(record);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant={running ? "default" : "outline"}
        className="h-8 gap-1.5 rounded-full px-3"
        disabled={!running && !canStart}
        title={
          running
            ? "Остановить таймер"
            : canStart
              ? "Запустить таймер"
              : "Таймер недоступен в этом статусе"
        }
        onClick={() => timers.toggle(record)}
      >
        {running ? (
          <>
            <TimerElapsed startedAt={running.startedAt} />
            <Square className="size-3 fill-current" />
          </>
        ) : (
          <>
            <Play className="size-3.5 fill-current" />
            Таймер
          </>
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-foreground"
        aria-label="Добавить время"
        title="Добавить время"
        onClick={() => setManualOpen(true)}
      >
        <ClockPlus />
      </Button>
      <TimeEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entity={entity}
        record={record}
      />
    </div>
  );
}
