import {
  fetchAutomationTaskTimeSessions,
  fetchOpenAutomationTaskTimeSession,
} from "../api/automation-tasks-api";
import { automationRequiresTimeTracking } from "./require-time-tracking";

export const AUTOMATION_TIMER_RUNNING_MESSAGE =
  "Остановите таймер перед завершением задания.";

export const AUTOMATION_TIMER_REQUIRED_MESSAGE =
  "Чтобы завершить задание, добавьте время вручную или запустите и остановите таймер.";

function sessionSeconds(session: {
  seconds: number;
  startedAt: string;
  endedAt: string | null;
}): number {
  if (session.seconds > 0) return session.seconds;
  if (!session.endedAt) return 0;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/**
 * Blocks complete while a timer is running, and (when required) while no
 * tracked time was recorded.
 */
export async function assertAutomationTimeTrackingReady(options: {
  taskId: string;
  userId: string | null | undefined;
  materials: string[] | undefined | null;
}): Promise<void> {
  const userId = options.userId?.trim() || null;
  if (userId) {
    const openSessionId = await fetchOpenAutomationTaskTimeSession(
      options.taskId,
      userId,
    );
    if (openSessionId) {
      throw new Error(AUTOMATION_TIMER_RUNNING_MESSAGE);
    }
  }

  if (!automationRequiresTimeTracking(options.materials)) return;

  const sessions = await fetchAutomationTaskTimeSessions(options.taskId);
  const totalSeconds = sessions.reduce(
    (sum, session) => sum + sessionSeconds(session),
    0,
  );
  if (totalSeconds <= 0) {
    throw new Error(AUTOMATION_TIMER_REQUIRED_MESSAGE);
  }
}
