import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  canViewAutomationTask,
  useCanDeleteAutomationTasks,
  useCurrentRole,
} from "@/entities/access";
import {
  completeAutomationTask,
  deleteAutomationTask,
  fetchAutomationTask,
  type AutomationTask,
} from "@/entities/automation";
import {
  getCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
} from "@/entities/entity";
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
  const role = useCurrentRole();
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const canDelete = useCanDeleteAutomationTasks();
  const [task, setTask] = useState<AutomationTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchAutomationTask(taskId);
        if (cancelled) return;
        if (
          next &&
          !canViewAutomationTask(role, next, {
            authUserId: sessionUser?.id ?? null,
            userRecordId: getCurrentUserRecordId(),
            entities,
            valueContext,
          })
        ) {
          setTask(null);
          setError("Нет доступа к этому заданию");
          return;
        }
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
  }, [taskId, role, sessionUser?.id, entities, valueContext]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6 md:p-8">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden />К задачам
        </Button>
        {canDelete && task ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            disabled={deleting}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Удалить
          </Button>
        ) : null}
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        title="Удалить задачу?"
        description={
          task
            ? `Задача «${task.name}» будет удалена без возможности восстановления.`
            : "Задача будет удалена без возможности восстановления."
        }
        confirmLabel={deleting ? "Удаление…" : "Удалить"}
        confirmDisabled={deleting}
        onConfirm={async () => {
          if (!task || deleting) return;
          setDeleting(true);
          try {
            await deleteAutomationTask(task.id);
            toast.success("Задача удалена");
            onBack();
          } catch (err: unknown) {
            toast.error(
              getAutomationErrorMessage(err, "Не удалось удалить задачу"),
            );
            throw err;
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
