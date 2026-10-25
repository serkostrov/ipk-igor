import {
  formatAutomationBlockingMessage,
  getAutomationErrorMessage,
  getErrorMessage,
} from "@/shared/lib/error-message";
import { fetchAutomationTasks } from "../api/automation-tasks-api";
import {
  isAutomationSilentTaskKind,
  type AutomationLaunchPhase,
  type AutomationTask,
} from "../model/types";

export type AutomationGateContext = {
  taskId: string;
  recordId: string;
  triggerOptionId: string;
  stepOrder: number;
  launchPhase?: AutomationLaunchPhase;
  /** Current task title — used to drop circular «finish this task» copy. */
  taskName?: string;
};

function taskLaunchPhase(task: AutomationTask): AutomationLaunchPhase {
  return task.config.launchPhase ?? "onEnter";
}

function phaseRank(phase: AutomationLaunchPhase) {
  return phase === "beforeEnter" ? 0 : 1;
}

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
    const selfPhase = context.launchPhase ?? "onEnter";
    let blockers = pending.filter(
      (task) =>
        task.id !== context.taskId &&
        task.isBlocking &&
        !isAutomationSilentTaskKind(task.config.kind) &&
        (task.status === "pending" || task.status === "returned"),
    );

    if (isOrder) {
      // Match SQL: earlier phase first; same phase → lower stepOrder.
      // Never blame a later-phase interactive task for a beforeEnter silent fail.
      blockers = blockers.filter((task) => {
        if (task.triggerOptionId !== context.triggerOptionId) return false;
        const otherPhase = taskLaunchPhase(task);
        const phaseDelta = phaseRank(otherPhase) - phaseRank(selfPhase);
        if (phaseDelta !== 0) return phaseDelta < 0;
        return task.stepOrder < context.stepOrder;
      });
    } else if (context.triggerOptionId) {
      const sameStage = blockers.filter(
        (task) => task.triggerOptionId === context.triggerOptionId,
      );
      if (sameStage.length > 0) blockers = sameStage;
    }

    // Do not fall back to «all blocking» — that turned «задача1» failures into
    // circular «сначала выполните задачу2» toasts.

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
