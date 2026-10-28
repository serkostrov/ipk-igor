import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  countAutomationTasksForRecords,
  deleteAutomationTasksForRecords,
} from "@/entities/automation";
import {
  countNotificationsForRecords,
  deleteNotificationsForRecords,
} from "@/entities/notification";
import { pluralRu } from "@/shared/lib/plural";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

type RecordDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string | null;
  recordIds: string[];
  title: string;
  description: string;
  confirmLabel?: string;
  /** Deletes the entity record(s) (called after optional automation cleanup). */
  onConfirm: () => void | Promise<void>;
};

/**
 * Waits for automation-task / notification counts before showing the confirm UI,
 * so the «Удалить с автоматизацией» action never pops in a second later.
 *
 * Notifications for the records are always purged on confirm (and again in
 * removeEntityRecord). Automation tasks are removed only via the secondary action.
 */
export function RecordDeleteConfirmDialog({
  open,
  onOpenChange,
  entityId,
  recordIds,
  title,
  description,
  confirmLabel = "Удалить",
  onConfirm,
}: RecordDeleteConfirmDialogProps) {
  const idsKey = recordIds.length > 0 ? recordIds.join(",") : null;
  const fetchKey = open && entityId && idsKey ? `${entityId}:${idsKey}` : null;
  const [fetched, setFetched] = useState<{
    key: string;
    taskCount: number;
    notificationCount: number;
  } | null>(null);

  useEffect(() => {
    if (!fetchKey || !entityId || !idsKey) return;

    const ids = idsKey.split(",");
    let cancelled = false;
    void Promise.all([
      countAutomationTasksForRecords(entityId, ids),
      countNotificationsForRecords(entityId, ids),
    ])
      .then(([taskCount, notificationCount]) => {
        if (!cancelled) {
          setFetched({ key: fetchKey, taskCount, notificationCount });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetched({ key: fetchKey, taskCount: 0, notificationCount: 0 });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, entityId, idsKey]);

  const ready = fetchKey != null && fetched?.key === fetchKey;
  const taskCount = ready ? fetched.taskCount : 0;
  const notificationCount = ready ? fetched.notificationCount : 0;
  const isBulk = recordIds.length > 1;
  const scopeLabel = isBulk ? "По выбранным записям" : "По записи";

  const relatedParts: string[] = [];
  if (taskCount > 0) {
    relatedParts.push(
      `${taskCount} ${pluralRu(taskCount, "задача", "задачи", "задач")} автоматизации`,
    );
  }
  if (notificationCount > 0) {
    relatedParts.push(
      `${notificationCount} ${pluralRu(notificationCount, "уведомление", "уведомления", "уведомлений")}`,
    );
  }

  const fullDescription =
    relatedParts.length > 0
      ? `${description}\n\n${scopeLabel} есть ${relatedParts.join(" и ")}.`
      : description;

  const secondaryLabel =
    taskCount > 0
      ? notificationCount > 0
        ? "Удалить с автоматизацией и уведомлениями"
        : "Удалить с автоматизацией"
      : undefined;

  async function purgeNotifications() {
    if (!entityId || recordIds.length === 0 || notificationCount === 0) return;
    await deleteNotificationsForRecords(entityId, recordIds);
  }

  return (
    <ConfirmDialog
      open={open && ready}
      onOpenChange={onOpenChange}
      title={title}
      description={fullDescription}
      confirmLabel={confirmLabel}
      onConfirm={async () => {
        try {
          await purgeNotifications();
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Не удалось удалить уведомления",
          );
          throw error;
        }
        await onConfirm();
      }}
      secondaryConfirmLabel={secondaryLabel}
      onSecondaryConfirm={
        taskCount > 0
          ? async () => {
              if (!entityId || recordIds.length === 0) return;
              try {
                await deleteAutomationTasksForRecords(entityId, recordIds);
                await purgeNotifications();
                await onConfirm();
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Не удалось удалить связанные данные",
                );
                throw error; // keep dialog open
              }
            }
          : undefined
      }
    />
  );
}
