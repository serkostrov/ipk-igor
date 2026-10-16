type Listener = () => void;

let activeTaskId: string | null = null;
const listeners = new Set<Listener>();
/** Task ids the user dismissed without completing (do not auto-reopen). */
const dismissedTaskIds = new Set<string>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getActiveAutomationTaskDialogId() {
  return activeTaskId;
}

export function subscribeAutomationTaskDialog(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openAutomationTaskFillDialog(taskId: string) {
  const id = taskId.trim();
  if (!id) return;
  dismissedTaskIds.delete(id);
  if (activeTaskId === id) return;
  activeTaskId = id;
  notify();
}

export function closeAutomationTaskFillDialog(options?: { dismiss?: boolean }) {
  if (!activeTaskId) return;
  if (options?.dismiss) dismissedTaskIds.add(activeTaskId);
  activeTaskId = null;
  notify();
}

export function isAutomationTaskFillDialogDismissed(taskId: string) {
  return dismissedTaskIds.has(taskId);
}

export function clearAutomationTaskFillDialogDismissed(taskId: string) {
  dismissedTaskIds.delete(taskId);
}
