import { toast } from "sonner";
import {
  fetchAutomationTasks,
  getAutomationConfig,
  matchAutomationConditions,
  resolveStageTransition,
  type AutomationScenario,
  type AutomationTask,
} from "@/entities/automation";
import {
  applyEntityFieldValue,
  getEntityConfig,
  parseEntityListValueIds,
  serializeEntityListValueIds,
  setEntityRecordValuesLocal,
  updateEntityRecord,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import { automationTaskNeedsFillDialog } from "./task-ask-fields";
import {
  clearAutomationTaskFillDialogDismissed,
  isAutomationTaskFillDialogDismissed,
  openAutomationTaskFillDialog,
} from "../model/fill-dialog-store";
import {
  clearPendingRecordListChange,
  queuePendingRecordListChange,
  registerPendingRecordListChangeApplier,
} from "../model/pending-list-change";

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

function isBeforeEnterTask(task: AutomationTask) {
  return (task.config.launchPhase ?? "onEnter") === "beforeEnter";
}

function pickTaskAfterStageChange(input: {
  tasks: AutomationTask[];
  fieldId: string;
  toOptionId: string;
  knownTaskIds: Set<string>;
}) {
  const { tasks, fieldId, toOptionId, knownTaskIds } = input;
  // Prep (beforeEnter) belongs on the previous stage. After a successful land
  // only auto-open onEnter / post-arrival tasks — never the same prep again.
  const postArrival = tasks.filter((task) => !isBeforeEnterTask(task));
  const fresh = postArrival.filter((task) => !knownTaskIds.has(task.id));
  const destination = tasksForDestination(postArrival, fieldId, toOptionId);
  const freshDestination = fresh.filter((task) =>
    destination.some((item) => item.id === task.id),
  );
  const fieldTasks = postArrival.filter(
    (task) => !fieldId || task.triggerFieldId === fieldId,
  );

  return (
    pickTaskToOpen(freshDestination, { allowDismissed: true }) ??
    pickTaskToOpen(destination, { allowDismissed: true }) ??
    pickTaskToOpen(fresh, { allowDismissed: true }) ??
    pickTaskToOpen(fieldTasks, { allowDismissed: true }) ??
    pickTaskToOpen(postArrival, { allowDismissed: true })
  );
}

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

function pickScenarioForTransition(
  processId: string,
  values: Record<string, string | undefined>,
  previousValues: Record<string, string | undefined>,
): AutomationScenario | null {
  const { scenarios } = getAutomationConfig();
  const forProcess = scenarios.filter((item) => item.processId === processId);
  const matched = forProcess
    .filter((item) => !item.isDefault && item.entryConditions.rules.length > 0)
    .filter((item) =>
      matchAutomationConditions(item.entryConditions, {
        values,
        previousValues,
      }),
    )
    .sort((a, b) => b.priority - a.priority)[0];
  return matched ?? forProcess.find((item) => item.isDefault) ?? null;
}

/**
 * Change a list/stage field with automation gates.
 * Queues the intended value when blocked so it can resume after the task ends.
 */
export async function applyRecordListChange(
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
  value: string,
  entities: Entity[],
): Promise<boolean> {
  const from = record.values[field.id] ?? "";
  if (from === value) {
    clearPendingRecordListChange({
      recordId: record.id,
      fieldId: field.id,
    });
    return true;
  }
  if (listOptionId(from) === listOptionId(value) && listOptionId(value)) {
    clearPendingRecordListChange({
      recordId: record.id,
      fieldId: field.id,
    });
    return true;
  }

  const fromOptionId = listOptionId(from);
  let toOptionId = listOptionId(value);
  let resolvedValue = value;
  const previousValues = { ...record.values };

  try {
    const { processes } = getAutomationConfig();
    const process = processes.find(
      (item) =>
        item.enabled &&
        item.entityId === entity.id &&
        item.triggerFieldId === field.id,
    );
    if (process && fromOptionId && toOptionId) {
      const scenario = pickScenarioForTransition(
        process.id,
        record.values,
        previousValues,
      );
      if (scenario && scenario.stageTransitions.length > 0) {
        const resolution = resolveStageTransition({
          transitions: scenario.stageTransitions,
          fromOptionId,
          toOptionId,
          values: record.values,
          previousValues,
        });
        if (resolution.kind === "block") {
          toast.warning("Переход недоступен", {
            description: resolution.message,
            duration: 7_000,
          });
          return false;
        }
        if (resolution.kind === "redirect") {
          toOptionId = resolution.optionId;
          resolvedValue = serializeEntityListValueIds([toOptionId]);
          const elseName =
            field.listOptions.find((item) => item.id === toOptionId)?.name ??
            toOptionId;
          toast.message("Переход по условию", {
            description: `Запись направлена на «${elseName}»`,
            duration: 5_000,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error("[automation] stage transition check failed", error);
  }

  if (isSupabaseConfigured && fromOptionId) {
    try {
      const pending = await fetchPendingTasksForRecord(record.id);
      const blocking = findBlockingTasks(pending, field.id, fromOptionId);
      if (blocking.length > 0) {
        queuePendingRecordListChange({
          entityId: entity.id,
          recordId: record.id,
          fieldId: field.id,
          value: resolvedValue,
        });
        const ask =
          pickTaskToOpen(blocking, { allowDismissed: true }) ?? blocking[0]!;
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
    resolvedValue,
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
      queuePendingRecordListChange({
        entityId: entity.id,
        recordId: record.id,
        fieldId: field.id,
        value: resolvedValue,
      });
      try {
        const pending = await fetchPendingTasksForRecord(record.id);
        const blocking = findBlockingTasks(pending, field.id, fromOptionId);
        const ask =
          pickTaskToOpen(blocking, { allowDismissed: true }) ??
          pickTaskToOpen(pending, { allowDismissed: true });
        if (ask) openTaskDialog(ask, { toast: "blocked" });
      } catch (fetchError: unknown) {
        console.error("[automation] load blocking tasks failed", fetchError);
      }
      toast.warning("Переход заблокирован", {
        description: "Сначала выполните блокирующие задачи автоматизации",
        duration: 7_000,
      });
      return false;
    }
    return false;
  }

  clearPendingRecordListChange({
    recordId: record.id,
    fieldId: field.id,
  });

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
}

/** Always-on applier so resume works even when no list/kanban view is mounted. */
registerPendingRecordListChangeApplier(async (change) => {
  const { entities } = getEntityConfig();
  const entity = entities.find((item) => item.id === change.entityId);
  if (!entity) return false;
  const field = entity.fields.find((item) => item.id === change.fieldId);
  const record = entity.records.find((item) => item.id === change.recordId);
  if (!field || !record) return false;
  return applyRecordListChange(entity, record, field, change.value, entities);
});
