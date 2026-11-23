/**
 * Extension points for product hardcode that lives in `features/` (FSD).
 * Features register handlers; automation core invokes them without importing
 * the feature layer.
 */

export type BeforeAutomationTaskCompleteHook = (args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskName?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}) => void;

export type AfterAutomationTaskCompleteHook = (args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  /** Completed task template option — may be «На заполнении ГИПа» before stage moves. */
  triggerOptionId?: string | null;
  taskId?: string | null;
  taskName?: string | null;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}) => void | Promise<void>;

/**
 * Runs before SQL complete changes the process stage (and therefore before
 * fieldEnter spawn). Use it to persist child rows the next stage assigns from.
 * Throw to keep the task open.
 */
export type BeforeAutomationStageSpawnHook = (args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  destinationStageId: string;
}) => void | Promise<void>;

const beforeTaskCompleteHooks: BeforeAutomationTaskCompleteHook[] = [];
const afterTaskCompleteHooks: AfterAutomationTaskCompleteHook[] = [];
const beforeStageSpawnHooks: BeforeAutomationStageSpawnHook[] = [];

export function registerBeforeAutomationTaskCompleteHook(
  hook: BeforeAutomationTaskCompleteHook | null,
) {
  if (hook == null) {
    beforeTaskCompleteHooks.length = 0;
    return;
  }
  if (!beforeTaskCompleteHooks.includes(hook)) {
    beforeTaskCompleteHooks.push(hook);
  }
}

/**
 * Register an after-complete hardcode handler.
 * Multiple features may register; all run in registration order.
 * Passing `null` clears every after-hook (tests).
 */
export function registerAfterAutomationTaskCompleteHook(
  hook: AfterAutomationTaskCompleteHook | null,
) {
  if (hook == null) {
    afterTaskCompleteHooks.length = 0;
    return;
  }
  if (!afterTaskCompleteHooks.includes(hook)) {
    afterTaskCompleteHooks.push(hook);
  }
}

export function registerBeforeAutomationStageSpawnHook(
  hook: BeforeAutomationStageSpawnHook | null,
) {
  if (hook == null) {
    beforeStageSpawnHooks.length = 0;
    return;
  }
  if (!beforeStageSpawnHooks.includes(hook)) {
    beforeStageSpawnHooks.push(hook);
  }
}

/** Await child rows before the stage write that spawns the next tasks. */
export async function runBeforeAutomationStageSpawnHook(args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  destinationStageId: string;
}): Promise<void> {
  for (const hook of beforeStageSpawnHooks) {
    await hook(args);
  }
}

/** Throws when hardcode blocks complete (e.g. missing GIP duration). */
export function runBeforeAutomationTaskCompleteHook(args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskName?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}): void {
  for (const hook of beforeTaskCompleteHooks) {
    hook(args);
  }
}

export async function runAfterAutomationTaskCompleteHook(args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskId?: string | null;
  taskName?: string | null;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}): Promise<void> {
  for (const hook of afterTaskCompleteHooks) {
    try {
      await hook(args);
    } catch (error: unknown) {
      console.error("[automation] after-complete hardcode hook failed", error);
    }
  }
}
