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
      task.triggerOptionId === optionId &&
      (task.status === "pending" || task.status === "returned"),
  );
}

function pickAskTask(tasks: AutomationTask[]) {
  return (
    tasks.find(
      (task) =>
        automationTaskNeedsFillDialog(task) &&
        !isAutomationTaskFillDialogDismissed(task.id),
    ) ?? null
  );
}

/** After spawn, wait briefly for the new ask-fields task and open its dialog. */
async function openSpawnedAskFieldDialog(
  recordId: string,
  knownTaskIds: Set<string>,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await sleep(180 + attempt * 120);
    const tasks = await fetchPendingTasksForRecord(recordId);
    const fresh = tasks.filter((task) => !knownTaskIds.has(task.id));
    const ask =
      pickAskTask(fresh) ??
      pickAskTask(tasks.filter((task) => !knownTaskIds.has(task.id)));
    if (ask) {
      openAutomationTaskFillDialog(ask.id);
      toast(ask.name || "Новая задача", {
        description: "Заполните поля, чтобы продолжить процесс",
        duration: 8_000,
        action: {
          label: "Открыть",
          onClick: () => openAutomationTaskFillDialog(ask.id),
        },
      });
      return;
    }
  }
}

/**
 * Single entry point for changing a list value from views (table, record, kanban).
 * - Blocks leaving a stage with unfinished blocking automation tasks (opens fill dialog).
 * - After a successful transition, opens the ask-fields dialog for newly spawned tasks.
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

      const fromOptionId = listOptionId(from);
      const previousValues = { ...record.values };

      if (isSupabaseConfigured && fromOptionId) {
        try {
          const pending = await fetchPendingTasksForRecord(record.id);
          const blocking = findBlockingTasks(pending, field.id, fromOptionId);
          if (blocking.length > 0) {
            const ask = pickAskTask(blocking) ?? blocking[0]!;
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
              pickAskTask(blocking) ?? blocking[0] ?? pickAskTask(pending);
            if (ask) {
              openAutomationTaskFillDialog(ask.id);
            }
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

      if (isSupabaseConfigured) {
        void openSpawnedAskFieldDialog(record.id, knownTaskIds).catch(
          (error: unknown) => {
            console.error(
              "[automation] open spawned task dialog failed",
              error,
            );
          },
        );
      }

      return true;
    },
    [entities],
  );

  return { requestListChange, dialog: null as ReactNode };
}
