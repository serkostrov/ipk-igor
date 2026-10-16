import { useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import {
  fetchAutomationTasks,
  type AutomationTask,
} from "@/entities/automation";
import {
  applyEntityFieldValue,
  parseEntityListValueIds,
  setEntityRecordValuesLocal,
  updateEntityRecord,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import {
  automationTaskNeedsFillDialog,
  clearAutomationTaskFillDialogDismissed,
  isAutomationTaskFillDialogDismissed,
  openAutomationTaskFillDialog,
} from "@/features/automation-tasks";
import { isSupabaseConfigured } from "@/shared/api/supabase";

function listOptionId(value: string) {
  const ids = parseEntityListValueIds(value);
  if (ids.length > 0) return ids[0]!;
  return value.trim();
}

function isAutomationBlockedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("AUTOMATION_BLOCKED");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchPendingTasksForRecord(recordId: string) {
  return fetchAutomationTasks({
    recordId,
    status: ["pending", "returned"],
  });
}

function findBlockingTasks(
  tasks: AutomationTask[],
  fieldId: string,
  optionId: string,
) {
  if (!optionId) return [];
  return tasks.filter(
    (task) =>
      task.isBlocking &&
      task.triggerFieldId === fieldId &&
      listOptionId(task.triggerOptionId) === optionId &&
      (task.status === "pending" || task.status === "returned"),
  );
}

function tasksForDestination(
  tasks: AutomationTask[],
  fieldId: string,
  optionId: string,
) {
  return tasks.filter((task) => {
    if (task.triggerFieldId !== fieldId) return false;
    if (!optionId) return true;
    return listOptionId(task.triggerOptionId) === optionId;
  });
}

/**
 * Prefer tasks that need the fill form; otherwise any pending task for the
 * stage (so outcome buttons still appear after a kanban drop).
 */
function pickTaskToOpen(
  tasks: AutomationTask[],
  options?: { allowDismissed?: boolean },
) {
  const eligible = options?.allowDismissed
    ? tasks
    : tasks.filter((task) => !isAutomationTaskFillDialogDismissed(task.id));
  return (
    eligible.find((task) => automationTaskNeedsFillDialog(task)) ??
    eligible[0] ??
    null
  );
}

function openTaskDialog(task: AutomationTask) {
  clearAutomationTaskFillDialogDismissed(task.id);
  openAutomationTaskFillDialog(task.id);
  toast(task.name || "Новая задача", {
    description: automationTaskNeedsFillDialog(task)
      ? "Заполните поля, чтобы продолжить процесс"
      : "Выберите результат, чтобы продолжить процесс",
    duration: 8_000,
    action: {
      label: "Открыть",
      onClick: () => openAutomationTaskFillDialog(task.id),
    },
  });
}

/**
 * After a stage change, open the automation dialog for the destination.
 * Looks up by trigger field + option (not only “fresh” ids) so unique
 * pending tasks and re-entry still open the window.
 */
async function openDialogAfterStageChange(input: {
  recordId: string;
  fieldId: string;
  toOptionId: string;
  knownTaskIds: Set<string>;
}) {
  const { recordId, fieldId, toOptionId, knownTaskIds } = input;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await sleep(120 + attempt * 100);
    const tasks = await fetchPendingTasksForRecord(recordId);
    const destination = tasksForDestination(tasks, fieldId, toOptionId);
    const fresh = tasks.filter((task) => !knownTaskIds.has(task.id));

    const task =
      pickTaskToOpen(destination, { allowDismissed: true }) ??
      pickTaskToOpen(fresh) ??
      pickTaskToOpen(destination);

    if (task) {
      openTaskDialog(task);
      return;
    }
  }
}

/**
 * Single entry point for changing a list value from views (table, record, kanban).
 * - Blocks leaving a stage with unfinished blocking automation tasks (opens fill dialog).
 * - After a successful transition, opens the task dialog for the destination stage.
 */
export function useRecordListChange() {
  const { entities } = useEntityConfig();

  const requestListChange = useCallback(
    async (
      entity: Entity,
      record: EntityRecord,
      field: EntityField,
      value: string,
    ): Promise<boolean> => {
      const from = record.values[field.id] ?? "";
      if (from === value) return true;
      if (listOptionId(from) === listOptionId(value) && listOptionId(value)) {
        return true;
      }

      const fromOptionId = listOptionId(from);
      const toOptionId = listOptionId(value);
      const previousValues = { ...record.values };

      if (isSupabaseConfigured && fromOptionId) {
        try {
          const pending = await fetchPendingTasksForRecord(record.id);
          const blocking = findBlockingTasks(pending, field.id, fromOptionId);
          if (blocking.length > 0) {
            const ask =
              pickTaskToOpen(blocking, { allowDismissed: true }) ??
              blocking[0]!;
            clearAutomationTaskFillDialogDismissed(ask.id);
            openAutomationTaskFillDialog(ask.id);
            toast.warning("Сначала выполните задачу", {
              description:
                ask.name ||
                "Есть незавершённые блокирующие задачи на текущем статусе",
              duration: 7_000,
              action: {
                label: "Открыть",
                onClick: () => openAutomationTaskFillDialog(ask.id),
              },
            });
            return false;
          }
        } catch (error: unknown) {
          console.error("[automation] blocking check failed", error);
        }
      }

      const nextValues = applyEntityFieldValue(
        entity,
        record.values,
        field.id,
        value,
        entities,
      );

      let knownTaskIds = new Set<string>();
      if (isSupabaseConfigured) {
        try {
          const before = await fetchPendingTasksForRecord(record.id);
          knownTaskIds = new Set(before.map((task) => task.id));
        } catch {
          knownTaskIds = new Set();
        }
      }

      try {
        await updateEntityRecord(entity.id, record.id, nextValues);
      } catch (error: unknown) {
        setEntityRecordValuesLocal(entity.id, record.id, previousValues);
        if (isAutomationBlockedError(error)) {
          try {
            const pending = await fetchPendingTasksForRecord(record.id);
            const blocking = findBlockingTasks(pending, field.id, fromOptionId);
            const ask =
              pickTaskToOpen(blocking, { allowDismissed: true }) ??
              pickTaskToOpen(pending, { allowDismissed: true });
            if (ask) openTaskDialog(ask);
          } catch (fetchError: unknown) {
            console.error(
              "[automation] load blocking tasks failed",
              fetchError,
            );
          }
          toast.warning("Переход заблокирован", {
            description: "Сначала выполните блокирующие задачи автоматизации",
            duration: 7_000,
          });
          return false;
        }
        return false;
      }

      if (isSupabaseConfigured && toOptionId) {
        void openDialogAfterStageChange({
          recordId: record.id,
          fieldId: field.id,
          toOptionId,
          knownTaskIds,
        }).catch((error: unknown) => {
          console.error("[automation] open spawned task dialog failed", error);
        });
      }

      return true;
    },
    [entities],
  );

  return { requestListChange, dialog: null as ReactNode };
}
