import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  countAutomationTasksForRecord,
  deleteAutomationTasksForRecord,
} from "@/entities/automation";
import { pluralRu } from "@/shared/lib/plural";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

type RecordDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string | null;
  recordId: string | null;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Deletes the entity record (called after optional automation cleanup). */
  onConfirm: () => void | Promise<void>;
};

/**
 * Waits for automation-task count before showing the confirm UI, so the
 * «Удалить с автоматизацией» action never pops in a second later.
 */
export function RecordDeleteConfirmDialog({
  open,
  onOpenChange,
  entityId,
  recordId,
  title,
  description,
  confirmLabel = "Удалить",
  onConfirm,
}: RecordDeleteConfirmDialogProps) {
  const fetchKey =
    open && entityId && recordId ? `${entityId}:${recordId}` : null;
  const [fetched, setFetched] = useState<{
    key: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!fetchKey || !entityId || !recordId) return;

    let cancelled = false;
    void countAutomationTasksForRecord(entityId, recordId)
      .then((count) => {
        if (!cancelled) setFetched({ key: fetchKey, count });
      })
      .catch(() => {
        if (!cancelled) setFetched({ key: fetchKey, count: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, entityId, recordId]);

  const ready = fetchKey != null && fetched?.key === fetchKey;
  const taskCount = ready ? fetched.count : 0;

  const fullDescription =
    taskCount > 0
      ? `${description}\n\nПо записи есть ${taskCount} ${pluralRu(taskCount, "задача", "задачи", "задач")} автоматизации.`
      : description;

  return (
    <ConfirmDialog
      open={open && ready}
      onOpenChange={onOpenChange}
      title={title}
      description={fullDescription}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      secondaryConfirmLabel={
        taskCount > 0 ? "Удалить с автоматизацией" : undefined
      }
      onSecondaryConfirm={
        taskCount > 0
          ? async () => {
              if (!entityId || !recordId) return;
              try {
                await deleteAutomationTasksForRecord(entityId, recordId);
                await onConfirm();
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Не удалось удалить задачи автоматизации",
                );
                throw error; // keep dialog open
              }
            }
          : undefined
      }
    />
  );
}
