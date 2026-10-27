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
import { useAppLocation, useAppNavigate } from "@/shared/lib/navigation";
import { TaskFillFieldsDialog } from "./TaskFillFieldsDialog";

function isAssignedToUser(task: AutomationTask, userIds: Set<string>) {
  if (!task.assigneeUserId) return true;
  return userIds.has(task.assigneeUserId);
}

const SILENT_ERROR_TOAST_ID = "automation-silent-complete-error";

/** Opens fill-fields dialog when a matching automation task arrives. */
export function AutomationTasksHost() {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const appLocation = useAppLocation();
  const { openRecord, openTask } = useAppNavigate();
  const [activeTaskId, setActiveTaskId] = useState(
    getActiveAutomationTaskDialogId,
  );
  const knownTaskIdsRef = useRef<Set<string> | null>(null);
  const syncingRef = useRef(false);
  const queuedSyncRef = useRef(false);
  const lastSilentErrorKeyRef = useRef<string | null>(null);
  // Inbox / task page — user opens rows themselves; never auto-popup there.
  const onTasksSurface =
    appLocation.type === "tasks" || appLocation.type === "task";
  const onTasksSurfaceRef = useRef(onTasksSurface);

  useEffect(() => {
    onTasksSurfaceRef.current = onTasksSurface;
  }, [onTasksSurface]);

  useEffect(() => {
    const unsubscribe = subscribeAutomationTaskDialog(() => {
      setActiveTaskId(getActiveAutomationTaskDialogId());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // On the inbox the list is the UI — close any auto-opened fill overlay.
  useEffect(() => {
    if (!onTasksSurface) return;
    if (getActiveAutomationTaskDialogId() == null) return;
    closeAutomationTaskFillDialog({ dismiss: true });
  }, [onTasksSurface]);

  const profileRecordId = sessionUser?.id
    ? (findSystemUserByAuthId(entities, sessionUser.id)?.id ?? null)
    : null;

  useEffect(() => {
    if (!sessionUser?.id) {
      knownTaskIdsRef.current = null;
      lastSilentErrorKeyRef.current = null;
      return;
    }

    const ids = new Set<string>([sessionUser.id]);
    if (profileRecordId) ids.add(profileRecordId);

    let cancelled = false;

    async function syncTasks(options?: { announceNew?: boolean }) {
      if (syncingRef.current) {
        queuedSyncRef.current = true;
        return;
      }
      syncingRef.current = true;
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
        lastSilentErrorKeyRef.current = null;

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

        // Only brand-new tasks — never fall back to every pending «mine»
        // (that opened the fill dialog just by visiting / syncing the inbox).
        const candidates = hadSilent
          ? spawnedAfterSilent
          : options?.announceNew
            ? fresh
            : [];

        if (onTasksSurfaceRef.current) return;

        const actionable = pickEarliestAutomationTask(
          candidates.filter(
            (task) => !isAutomationTaskFillDialogDismissed(task.id),
          ),
        );
        if (!actionable) return;
        if (getActiveAutomationTaskDialogId() === actionable.id) return;

        window.setTimeout(() => {
          if (cancelled || onTasksSurfaceRef.current) return;
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
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Не удалось выполнить автозаполнение";
        // One toast per distinct error — realtime / entity churn must not flood.
        if (lastSilentErrorKeyRef.current === message) return;
        lastSilentErrorKeyRef.current = message;
        toast.error("Автозаполнение не выполнено", {
          id: SILENT_ERROR_TOAST_ID,
          description: message,
          duration: 10_000,
        });
      } finally {
        syncingRef.current = false;
        if (queuedSyncRef.current && !cancelled) {
          queuedSyncRef.current = false;
          void syncTasks({ announceNew: true });
        }
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
    // Intentionally omit `entities`: record creates during silent complete would
    // re-subscribe the effect and toast in an infinite loop.
  }, [sessionUser?.id, profileRecordId, openTask]);

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
