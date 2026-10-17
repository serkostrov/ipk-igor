import {
  formatAutomationBlockingMessage,
  getAutomationErrorMessage,
  getErrorMessage,
} from "@/shared/lib/error-message";
import { fetchAutomationTasks } from "../api/automation-tasks-api";
import type { AutomationTask } from "../model/types";

export type AutomationGateContext = {
  taskId: string;
  recordId: string;
  triggerOptionId: string;
  stepOrder: number;
  /** Current task title — used to drop circular «finish this task» copy. */
  taskName?: string;
};

function isAutomationGateMessage(raw: string): boolean {
  return (
    raw.includes("AUTOMATION_ORDER") ||
    raw.includes("AUTOMATION_BLOCKED") ||
    /^Сначала выполните/i.test(raw.trim())
  );
}

function messageRefersOnlyToSelf(message: string, taskName: string): boolean {
  const name = taskName.trim();
  if (!name) return false;
  if (!message.includes(name) && !message.includes(`«${name}»`)) return false;
  const withoutSelf = message
    .replaceAll(`«${name}»`, "")
    .replaceAll(name, "")
    .replace(/^Сначала выполните( задачу| задачи|:)?/i, "")
    .replace(/[•\n,]/g, "")
    .trim();
  return withoutSelf.length === 0;
}

/**
 * When SQL returns AUTOMATION_BLOCKED / ORDER, name the other tasks that
 * must finish first — never the task the user is already completing.
 */
export async function resolveAutomationGateError(
  error: unknown,
  context: AutomationGateContext,
  fallback = "Ошибка",
): Promise<string> {
  const raw = getErrorMessage(error, fallback);
  if (!isAutomationGateMessage(raw)) {
    return getAutomationErrorMessage(error, fallback);
  }

  const isOrder =
    raw.includes("AUTOMATION_ORDER") || /предыдущие блокирующие/i.test(raw);
  const parsed = getAutomationErrorMessage(error, fallback);
  const selfName = context.taskName?.trim() ?? "";

  try {
    const pending = await fetchAutomationTasks({
      recordId: context.recordId,
      status: ["pending", "returned"],
    });
    let blockers = pending.filter(
      (task) =>
        task.id !== context.taskId &&
        task.isBlocking &&
        (task.status === "pending" || task.status === "returned"),
    );

    if (isOrder) {
      blockers = blockers.filter(
        (task) =>
          task.triggerOptionId === context.triggerOptionId &&
          task.stepOrder < context.stepOrder,
      );
    } else if (context.triggerOptionId) {
      const sameStage = blockers.filter(
        (task) => task.triggerOptionId === context.triggerOptionId,
      );
      if (sameStage.length > 0) blockers = sameStage;
    }

    if (blockers.length === 0) {
      blockers = pending.filter(
        (task) => task.id !== context.taskId && task.isBlocking,
      );
    }

    if (blockers.length > 0) {
      return formatAutomationBlockingMessage(
        blockers.map((task) => task.name || "Задача"),
        { previous: isOrder },
      );
    }
  } catch {
    // Keep parsed message when enrichment fails.
  }

  if (selfName && messageRefersOnlyToSelf(parsed, selfName)) {
    // Client used to persist the stage while this task was still pending.
    return "Смена стадии выполняется после завершения этой задачи. Нажмите кнопку результата ещё раз.";
  }

  return parsed;
}

/** Format a toast / banner from already-known blocking tasks. */
export function describeBlockingTasks(tasks: AutomationTask[]): string {
  return formatAutomationBlockingMessage(
    tasks.map((task) => task.name || "Задача"),
  );
}
