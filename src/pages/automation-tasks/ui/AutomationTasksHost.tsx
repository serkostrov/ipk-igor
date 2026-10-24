import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  completePendingSilentAutomationTasks,
  fetchAutomationTasks,
  isAutomationSilentTaskKind,
  subscribeAutomationTasks,
  type AutomationTask,
} from "@/entities/automation";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  closeAutomationTaskFillDialog,
  getActiveAutomationTaskDialogId,
  isAutomationTaskFillDialogDismissed,
  openAutomationTaskFillDialog,
  subscribeAutomationTaskDialog,
} from "@/features/automation-tasks";
import { pickEarliestAutomationTask } from "@/features/automation-tasks/lib/task-open-order";
import { useAppNavigate } from "@/shared/lib/navigation";
import { TaskFillFieldsDialog } from "./TaskFillFieldsDialog";

function isAssignedToUser(task: AutomationTask, userIds: Set<string>) {
  if (!task.assigneeUserId) return true;
  return userIds.has(task.assigneeUserId);
}

/** Opens fill-fields dialog when a matching automation task arrives. */
export function AutomationTasksHost() {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const { openRecord, openTask } = useAppNavigate();
  const [activeTaskId, setActiveTaskId] = useState(
    getActiveAutomationTaskDialogId,
  );
  const knownTaskIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAutomationTaskDialog(() => {
      setActiveTaskId(getActiveAutomationTaskDialogId());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const profileRecordId = sessionUser?.id
    ? (findSystemUserByAuthId(entities, sessionUser.id)?.id ?? null)
    : null;

  useEffect(() => {
    if (!sessionUser?.id) {
      knownTaskIdsRef.current = null;
      return;
    }

    const ids = new Set<string>([sessionUser.id]);
    if (profileRecordId) ids.add(profileRecordId);

    let cancelled = false;

    async function syncTasks(options?: { announceNew?: boolean }) {
      try {
        let tasks = await fetchAutomationTasks({
          status: ["pending", "returned"],
        });
        if (cancelled) return;

        const hadSilent = tasks.some((task) =>
          isAutomationSilentTaskKind(task.config.kind),
        );
        const idsBeforeSilent = new Set(tasks.map((task) => task.id));

        await completePendingSilentAutomationTasks(
          tasks,
          sessionUser?.id ?? null,
        );
        if (cancelled) return;

        // Silent complete may spawn the next sequential interactive task
        // and/or move the stage — re-read before picking what to open.
        tasks = await fetchAutomationTasks({
          status: ["pending", "returned"],
        });
        if (cancelled) return;

        const interactiveTasks = tasks.filter(
          (task) => !isAutomationSilentTaskKind(task.config.kind),
        );
        const mine = interactiveTasks.filter((task) =>
          isAssignedToUser(task, ids),
        );
        const known = knownTaskIdsRef.current;
        const nextKnown = new Set(mine.map((task) => task.id));
        const fresh =
          known == null ? [] : mine.filter((task) => !known.has(task.id));
        const spawnedAfterSilent = mine.filter(
          (task) => !idsBeforeSilent.has(task.id),
        );

        knownTaskIdsRef.current = nextKnown;

        // Offer interactive when: silent prep just ran, or a new task arrived.
        const candidates = hadSilent
          ? spawnedAfterSilent.length > 0
            ? spawnedAfterSilent
            : mine
          : options?.announceNew
            ? fresh
            : [];

        const actionable = pickEarliestAutomationTask(
          candidates.filter(
            (task) => !isAutomationTaskFillDialogDismissed(task.id),
          ),
        );
        if (!actionable) return;
        if (getActiveAutomationTaskDialogId() === actionable.id) return;

        window.setTimeout(() => {
          openAutomationTaskFillDialog(actionable.id);
          toast(actionable.name || "Новая задача", {
            description: "Выполните задание по порядку процесса",
            duration: 8_000,
            action: {
              label: "Открыть",
              onClick: () => openTask(actionable.id),
            },
          });
        }, 80);
      } catch (error: unknown) {
        console.error("[automation] task host sync failed", error);
        const message =
          error instanceof Error
            ? error.message
            : "Не удалось выполнить автозаполнение";
        toast.error("Автозаполнение не выполнено", {
          description: message,
          duration: 10_000,
        });
      }
    }

    void syncTasks({ announceNew: false });

    const unsubscribe = subscribeAutomationTasks(() => {
      void syncTasks({ announceNew: true });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionUser?.id, profileRecordId, openTask, entities]);

  return (
    <TaskFillFieldsDialog
      taskId={activeTaskId}
      open={activeTaskId != null}
      onOpenChange={(open) => {
        if (!open) closeAutomationTaskFillDialog({ dismiss: true });
      }}
      onCompleted={(task) => {
        closeAutomationTaskFillDialog();
        knownTaskIdsRef.current?.delete(task.id);
        // Resume already awaited inside TaskFillFieldsDialog after complete.
      }}
      onOpenRecord={(entityId, recordId) => {
        openRecord(entityId, recordId);
      }}
    />
  );
}
