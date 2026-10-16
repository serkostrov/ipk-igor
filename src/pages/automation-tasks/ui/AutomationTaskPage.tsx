import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  completeAutomationTask,
  fetchAutomationTask,
  returnAutomationTaskForRevision,
  type AutomationTask,
} from "@/entities/automation";
import { useSessionUser } from "@/entities/session";
import { TaskWorkspace } from "@/features/automation-tasks";
import { getAutomationErrorMessage } from "@/shared/lib/error-message";

export function AutomationTaskPage({
  taskId,
  onBack,
  onOpenRecord,
}: {
  taskId: string;
  onBack: () => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const sessionUser = useSessionUser();
  const [task, setTask] = useState<AutomationTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchAutomationTask(taskId);
        if (cancelled) return;
        setTask(next);
        if (!next) setError("Задача не найдена");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            getAutomationErrorMessage(err, "Не удалось загрузить задачу"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6 md:p-8">
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden />К задачам
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card p-5 shadow-xs md:p-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted/50" />
            <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted/40" />
            <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted/30" />
          </div>
        ) : error || !task ? (
          <div className="flex flex-col items-start gap-3 py-10">
            <p className="text-sm text-destructive">
              {error ?? "Задача не найдена"}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              Вернуться к списку
            </Button>
          </div>
        ) : (
          <TaskWorkspace
            task={task}
            onOpenRecord={onOpenRecord}
            onCompleted={onBack}
            onReturn={async () => {
              await returnAutomationTaskForRevision(
                task.id,
                sessionUser?.id ?? null,
              );
            }}
            onComplete={async (outcomeId, formValues) => {
              await completeAutomationTask(
                task.id,
                outcomeId,
                sessionUser?.id ?? null,
                formValues,
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
