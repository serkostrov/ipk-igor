import { useEffect, useMemo, useState } from "react";
import { Clock, ClockPlus, Play, Square } from "lucide-react";
import {
  addAutomationTaskTimeSession,
  fetchAutomationTaskTimeSessions,
  startAutomationTaskTimeSession,
  stopAutomationTaskTimeSession,
  type AutomationTaskTimeSession,
} from "@/entities/automation";
import { useNow } from "@/shared/hooks/use-now";
import { cn } from "@/shared/lib/cn";
import { formatElapsed } from "@/shared/lib/datetime";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

function sessionDurationMs(
  session: AutomationTaskTimeSession,
  nowMs: number,
): number {
  if (session.endedAt) {
    if (session.seconds > 0) return session.seconds * 1000;
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return Math.max(0, end - start);
    }
    return 0;
  }
  const start = new Date(session.startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, nowMs - start);
}

function formatSessionRange(session: AutomationTaskTimeSession) {
  const start = new Date(session.startedAt);
  if (!Number.isFinite(start.getTime())) return "—";
  const startLabel = start.toLocaleString("ru", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!session.endedAt) return `${startLabel} · идёт`;
  const end = new Date(session.endedAt);
  if (!Number.isFinite(end.getTime())) return startLabel;
  return `${startLabel} → ${end.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function TaskTimeSessionsPanel({
  taskId,
  userId,
  required,
  disabled,
  onTotalSecondsChange,
  onError,
}: {
  taskId: string;
  userId: string | null | undefined;
  required: boolean;
  disabled?: boolean;
  onTotalSecondsChange?: (seconds: number) => void;
  onError?: (message: string) => void;
}) {
  const now = useNow(1000);
  const [sessions, setSessions] = useState<AutomationTaskTimeSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("15");

  async function reload() {
    const next = await fetchAutomationTaskTimeSessions(taskId);
    setSessions(next);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchAutomationTaskTimeSessions(taskId);
        if (!cancelled) setSessions(next);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const totalMs = useMemo(
    () =>
      sessions.reduce(
        (sum, session) => sum + sessionDurationMs(session, now),
        0,
      ),
    [sessions, now],
  );

  useEffect(() => {
    onTotalSecondsChange?.(Math.floor(totalMs / 1000));
  }, [totalMs, onTotalSecondsChange]);

  const openSession = sessions.find((item) => !item.endedAt) ?? null;
  const needsTime = required && totalMs <= 0;

  async function toggleTimer() {
    if (!userId || busy || disabled) return;
    setBusy(true);
    try {
      if (openSession) {
        await stopAutomationTaskTimeSession(openSession.id);
      } else {
        await startAutomationTaskTimeSession({ taskId, userId });
      }
      await reload();
    } catch (err: unknown) {
      onError?.(
        err instanceof Error ? err.message : "Не удалось обновить таймер",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    if (!userId || busy) return;
    const minutes = Number(manualMinutes.replace(",", "."));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      onError?.("Укажите длительность в минутах");
      return;
    }
    setBusy(true);
    try {
      await addAutomationTaskTimeSession({
        taskId,
        userId,
        seconds: Math.round(minutes * 60),
      });
      setManualOpen(false);
      await reload();
    } catch (err: unknown) {
      onError?.(
        err instanceof Error ? err.message : "Не удалось добавить время",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Сессии фактического времени"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 shadow-xs",
        required
          ? cn(
              "border-destructive bg-destructive/[0.04] ring-2 ring-destructive/20",
              needsTime && "ring-destructive/35",
            )
          : "border-border/80 bg-muted/15",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                required
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="size-3.5" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight">
              Сессии фактического времени
            </h3>
            {required ? (
              <span className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-destructive uppercase">
                обязательно
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {needsTime ? (
              <span className="font-medium text-destructive">
                Добавьте время, чтобы завершить задачу
              </span>
            ) : (
              <>
                Итого:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatElapsed(totalMs)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={
              openSession ? "default" : required ? "destructive" : "outline"
            }
            className="h-8 gap-1.5"
            disabled={busy || disabled || !userId}
            onClick={() => void toggleTimer()}
          >
            {openSession ? (
              <>
                <Square className="size-3 fill-current" />
                <span className="tabular-nums">
                  {formatElapsed(sessionDurationMs(openSession, now))}
                </span>
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                Запустить
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={busy || disabled || !userId}
            onClick={() => setManualOpen(true)}
          >
            <ClockPlus className="size-3.5" />
            Вручную
          </Button>
        </div>
      </div>

      {needsTime ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
          Чтобы завершить задание, добавьте время вручную или запустите и
          остановите таймер.
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
          Сессий пока нет
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {formatSessionRange(session)}
                {!session.endedAt ? (
                  <span className="ml-1.5 font-medium text-foreground">
                    · идёт
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatElapsed(sessionDurationMs(session, now))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Добавить время</DialogTitle>
            <DialogDescription>
              Укажите длительность сессии в минутах.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-minutes">Минуты</Label>
            <Input
              id="manual-minutes"
              type="number"
              min={1}
              step={1}
              value={manualMinutes}
              onChange={(event) => setManualMinutes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setManualOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void addManual()}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
