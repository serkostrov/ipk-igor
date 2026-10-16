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

function optionIdsMatch(a: string, b: string) {
  const left = listOptionId(a);
  const right = listOptionId(b);
  if (!left || !right) return false;
  return left === right;
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
      optionIdsMatch(task.triggerOptionId, optionId) &&
      (task.status === "pending" || task.status === "returned"),
  );
}

function tasksForDestination(
  tasks: AutomationTask[],
  fieldId: string,
  optionId: string,
) {
  return tasks.filter((task) => {
    if (fieldId && task.triggerFieldId && task.triggerFieldId !== fieldId) {
      return false;
    }
    if (!optionId) return true;
    return optionIdsMatch(task.triggerOptionId, optionId);
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
  if (eligible.length === 0) return null;
  return (
    eligible.find((task) => automationTaskNeedsFillDialog(task)) ??
    eligible.find((task) => (task.config.outcomes?.length ?? 0) > 0) ??
    eligible[0] ??
    null
  );
}

/** Defer so the list/select popup can close before the dialog mounts. */
function openTaskDialog(
  task: AutomationTask,
  options?: { toast?: "spawn" | "blocked" | "none" },
) {
  const toastKind = options?.toast ?? "spawn";
  clearAutomationTaskFillDialogDismissed(task.id);
  window.setTimeout(() => {
    openAutomationTaskFillDialog(task.id);
    if (toastKind === "none") return;
    if (toastKind === "blocked") {
      toast.warning("Сначала выполните задачу", {
        description:
          task.name ||
          "Есть незавершённые блокирующие задачи на текущем статусе",
        duration: 7_000,
        action: {
          label: "Открыть",
          onClick: () => openAutomationTaskFillDialog(task.id),
        },
      });
      return;
    }
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
  }, 80);
}

function pickTaskAfterStageChange(input: {
  tasks: AutomationTask[];
  fieldId: string;
  toOptionId: string;
  knownTaskIds: Set<string>;
}) {
  const { tasks, fieldId, toOptionId, knownTaskIds } = input;
  const fresh = tasks.filter((task) => !knownTaskIds.has(task.id));
  const destination = tasksForDestination(tasks, fieldId, toOptionId);
  const freshDestination = fresh.filter((task) =>
    destination.some((item) => item.id === task.id),
  );
  const fieldTasks = tasks.filter(
    (task) => !fieldId || task.triggerFieldId === fieldId,
  );

  return (
    pickTaskToOpen(freshDestination, { allowDismissed: true }) ??
    pickTaskToOpen(destination, { allowDismissed: true }) ??
    pickTaskToOpen(fresh, { allowDismissed: true }) ??
    pickTaskToOpen(fieldTasks, { allowDismissed: true }) ??
    pickTaskToOpen(tasks, { allowDismissed: true })
  );
}

/**
 * After a stage change, open the automation dialog for the destination.
 * Looks up by trigger field + option, then falls back to any new/pending
 * task on the record so the window still appears when matching is fuzzy.
 */
async function openDialogAfterStageChange(input: {
  recordId: string;
  fieldId: string;
  toOptionId: string;
  knownTaskIds: Set<string>;
}) {
  const { recordId, fieldId, toOptionId, knownTaskIds } = input;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await sleep(80 + attempt * 90);
    const tasks = await fetchPendingTasksForRecord(recordId);
    const task = pickTaskAfterStageChange({
      tasks,
      fieldId,
      toOptionId,
      knownTaskIds,
    });
    if (task) {
      openTaskDialog(task);
      return true;
    }
  }
  return false;
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
            openTaskDialog(ask, { toast: "blocked" });
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
        try {
          const opened = await openDialogAfterStageChange({
            recordId: record.id,
            fieldId: field.id,
            toOptionId,
            knownTaskIds,
          });
          if (!opened) {
            toast.message("Задачи автоматизации не появились", {
              description:
                "Проверьте сценарий процесса: у нестандартных сценариев нужны условия входа, иначе задачи из «Основной» не создаются.",
              duration: 8_000,
            });
          }
        } catch (error: unknown) {
          console.error("[automation] open spawned task dialog failed", error);
        }
      }

      return true;
    },
    [entities],
  );

  return { requestListChange, dialog: null as ReactNode };
}
