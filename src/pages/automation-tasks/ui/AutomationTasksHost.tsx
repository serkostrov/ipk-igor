import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchAutomationTasks,
  subscribeAutomationTasks,
  type AutomationTask,
} from "@/entities/automation";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  automationTaskNeedsFillDialog,
  closeAutomationTaskFillDialog,
  getActiveAutomationTaskDialogId,
  isAutomationTaskFillDialogDismissed,
  subscribeAutomationTaskDialog,
} from "@/features/automation-tasks";
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
        const tasks = await fetchAutomationTasks({
          status: ["pending", "returned"],
        });
        if (cancelled) return;

        const mine = tasks.filter((task) => isAssignedToUser(task, ids));
        const known = knownTaskIdsRef.current;
        const nextKnown = new Set(mine.map((task) => task.id));

        if (known == null) {
          knownTaskIdsRef.current = nextKnown;
          return;
        }

        const fresh = mine.filter((task) => !known.has(task.id));
        knownTaskIdsRef.current = nextKnown;

        if (!options?.announceNew || fresh.length === 0) return;

        const interactive = fresh.filter(
          (task) => task.config.kind !== "autofill",
        );
        const actionable =
          interactive.find(
            (task) =>
              automationTaskNeedsFillDialog(task) &&
              !isAutomationTaskFillDialogDismissed(task.id),
          ) ??
          interactive.find(
            (task) => !isAutomationTaskFillDialogDismissed(task.id),
          ) ??
          null;
        if (!actionable) return;

        // Defer so list/kanban pickers can finish closing before navigation.
        window.setTimeout(() => {
          toast(actionable.name || "Новая задача", {
            description: automationTaskNeedsFillDialog(actionable)
              ? "Заполните поля, чтобы продолжить процесс"
              : "Выберите результат, чтобы продолжить процесс",
            duration: 8_000,
            action: {
              label: "Открыть",
              onClick: () => openTask(actionable.id),
            },
          });
        }, 80);
      } catch (error: unknown) {
        console.error("[automation] task host sync failed", error);
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
  }, [sessionUser?.id, profileRecordId, openTask]);

  return (
    <TaskFillFieldsDialog
      taskId={activeTaskId}
      open={activeTaskId != null}
      onOpenChange={(open) => {
        if (!open) closeAutomationTaskFillDialog({ dismiss: true });
      }}
      onCompleted={() => {
        closeAutomationTaskFillDialog();
        if (activeTaskId) {
          knownTaskIdsRef.current?.delete(activeTaskId);
        }
      }}
      onOpenRecord={(entityId, recordId) => {
        openRecord(entityId, recordId);
      }}
    />
  );
}
