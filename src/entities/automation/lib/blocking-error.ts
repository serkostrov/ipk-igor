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
};

function hasConcreteTaskNames(message: string): boolean {
  return /«.+»/.test(message) || message.includes("•");
}

/**
 * When SQL returns a generic AUTOMATION_BLOCKED / ORDER, load pending
 * blocking tasks and name them so the user knows what to finish.
 */
export async function resolveAutomationGateError(
  error: unknown,
  context: AutomationGateContext,
  fallback = "Ошибка",
): Promise<string> {
  const raw = getErrorMessage(error, fallback);
  const isOrder = raw.includes("AUTOMATION_ORDER");
  const isBlocked = raw.includes("AUTOMATION_BLOCKED");
  const parsed = getAutomationErrorMessage(error, fallback);

  if (!isOrder && !isBlocked) return parsed;
  if (hasConcreteTaskNames(parsed)) return parsed;

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

  return parsed;
}

/** Format a toast / banner from already-known blocking tasks. */
export function describeBlockingTasks(tasks: AutomationTask[]): string {
  return formatAutomationBlockingMessage(
    tasks.map((task) => task.name || "Задача"),
  );
}
