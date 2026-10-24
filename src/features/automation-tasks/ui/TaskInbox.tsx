import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  filterAutomationTasksForRole,
  useCurrentRole,
} from "@/entities/access";
import {
  completeAutomationTask,
  completePendingSilentAutomationTasksForRecord,
  fetchAutomationTasks,
  isAutomationSilentTaskKind,
  registerOverdueAutomationTasksRpc,
  subscribeAutomationTasks,
  type AutomationTask,
} from "@/entities/automation";
import {
  getCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { cn } from "@/shared/lib/cn";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { TaskWorkspace } from "./TaskWorkspace";

export function TaskInbox({
  onOpenRecord,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const sessionUser = useSessionUser();
  const role = useCurrentRole();
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [silentReadyRecordId, setSilentReadyRecordId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const visibleTasks = useMemo(
    () =>
      filterAutomationTasksForRole(role, tasks, {
        authUserId: sessionUser?.id ?? null,
        userRecordId: getCurrentUserRecordId(),
        entities,
        valueContext,
      }).filter((task) => !isAutomationSilentTaskKind(task.config.kind)),
    [role, tasks, sessionUser?.id, entities, valueContext],
  );

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          void registerOverdueAutomationTasksRpc().catch(() => null);
          const next = await fetchAutomationTasks({
            status: ["pending", "returned"],
          });
          if (!cancelled) setTasks(next);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : "Не удалось загрузить задачи",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadToken]);

  useEffect(() => {
    return subscribeAutomationTasks(() => {
      setReloadToken((token) => token + 1);
    });
  }, []);

  const selected = visibleTasks.find((task) => task.id === selectedId) ?? null;
  const selectedRecordId = selected?.recordId ?? null;
  const selectedReady =
    selected != null &&
    selectedRecordId != null &&
    silentReadyRecordId === selectedRecordId;

  // Finish silent autofill for this record before the interactive form mounts.
  useEffect(() => {
    if (!selectedRecordId) return;
    let cancelled = false;
    void (async () => {
      try {
        await completePendingSilentAutomationTasksForRecord(
          selectedRecordId,
          sessionUser?.id ?? null,
        );
        if (!cancelled) setSilentReadyRecordId(selectedRecordId);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось выполнить автозаполнение",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRecordId, sessionUser?.id]);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold">Задачи автоматизаций</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={reload}
          >
            Обновить
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
          ) : error ? (
            <p className="px-2 py-4 text-sm text-destructive">{error}</p>
          ) : visibleTasks.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Нет активных задач
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      selectedId === task.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted/40",
                    )}
                    onClick={() => {
                      setSelectedId(task.id);
                      setSilentReadyRecordId(null);
                      setError(null);
                    }}
                  >
                    <span className="truncate text-sm font-medium">
                      {task.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {task.isBlocking ? (
                        <Clock3 className="size-3" />
                      ) : (
                        <CheckCircle2 className="size-3" />
                      )}
                      Шаг {task.stepOrder}
                      {task.dueAt
                        ? ` · до ${formatTimestampDisplay(task.dueAt)}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-auto rounded-xl border border-border bg-card p-4">
        {selected && selectedReady ? (
          <TaskWorkspace
            task={selected}
            onOpenRecord={onOpenRecord}
            onCompleted={() => {
              setSelectedId(null);
              reload();
            }}
            onComplete={async (outcomeId, formValues) => {
              await completeAutomationTask(
                selected.id,
                outcomeId,
                sessionUser?.id ?? null,
                formValues,
              );
            }}
          />
        ) : selected && error ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
            {error}
          </div>
        ) : selected ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <RotateCcw className="size-5 animate-spin opacity-50" />
            Выполняется автозаполнение…
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <RotateCcw className="size-5 opacity-50" />
            Выберите задачу слева
          </div>
        )}
      </div>
    </div>
  );
}
