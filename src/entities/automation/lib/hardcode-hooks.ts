/**
 * Extension points for product hardcode that lives in `features/` (FSD).
 * Features register handlers; automation core invokes them without importing
 * the feature layer.
 */

export type AfterAutomationTaskCompleteHook = (args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
}) => void | Promise<void>;

let afterTaskCompleteHook: AfterAutomationTaskCompleteHook | null = null;

export function registerAfterAutomationTaskCompleteHook(
  hook: AfterAutomationTaskCompleteHook | null,
) {
  afterTaskCompleteHook = hook;
}

export async function runAfterAutomationTaskCompleteHook(args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
}): Promise<void> {
  if (!afterTaskCompleteHook) return;
  try {
    await afterTaskCompleteHook(args);
  } catch (error: unknown) {
    console.error("[automation] after-complete hardcode hook failed", error);
  }
}
