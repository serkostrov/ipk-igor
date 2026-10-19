import type { AutomationOutcome, AutomationTask } from "@/entities/automation";

export type AutomationAskFields = {
  requiredFieldIds: string[];
  visibleFieldIds: string[];
  /** Read-only context from «Просмотреть поле» actions. */
  viewFieldIds: string[];
  /** Read-only tabs from «Просмотреть вкладки» (записи, файлы, …). */
  viewTabIds: string[];
  /**
   * For files tabs: default-folder ids to show (union across actions).
   * Missing / empty for a tab = show the whole tab.
   */
  viewFilesTabEntryIds: Record<string, string[]>;
  /** Assignee may move files between folders on files tabs in the task. */
  viewFilesTabAllowMove: boolean;
  requireAttachment: boolean;
};

const EMPTY_ASK_FIELDS: AutomationAskFields = {
  requiredFieldIds: [],
  visibleFieldIds: [],
  viewFieldIds: [],
  viewTabIds: [],
  viewFilesTabEntryIds: {},
  viewFilesTabAllowMove: false,
  requireAttachment: false,
};

function mergeFilesTabEntryIds(
  into: Record<string, string[]>,
  from: Record<string, string[]> | undefined,
) {
  if (!from) return;
  for (const [tabId, ids] of Object.entries(from)) {
    if (!ids.length) continue;
    const prev = into[tabId] ?? [];
    into[tabId] = uniquePreserveOrder([...prev, ...ids]);
  }
}

/** Stable unique list: first occurrence wins (keeps settings / action order). */
function uniquePreserveOrder(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Fields / tabs for a single outcome (form appears only after that button). */
export function getAutomationOutcomeAskFields(
  outcome: AutomationOutcome,
): AutomationAskFields {
  // Order matches «Поля формы» in the builder (`visibleFieldIds` is the source of truth).
  const visibleFieldIds = uniquePreserveOrder([
    ...outcome.fieldAccess.visibleFieldIds,
    // Legacy / edge: required without visible still must appear on the form.
    ...outcome.fieldAccess.requiredFieldIds,
  ]);
  const visibleSet = new Set(visibleFieldIds);
  const requiredFieldIds = uniquePreserveOrder(
    outcome.fieldAccess.requiredFieldIds.filter((id) => visibleSet.has(id)),
  );

  const viewOnly: string[] = [];
  const viewTabs: string[] = [];
  const viewFilesTabEntryIds: Record<string, string[]> = {};
  let viewFilesTabAllowMove = false;

  for (const action of outcome.actions) {
    if (action.kind === "viewField") {
      for (const fieldId of action.fieldIds) {
        if (fieldId.trim()) viewOnly.push(fieldId);
      }
    }
    if (action.kind === "viewTabs") {
      for (const tabId of action.tabIds) {
        if (tabId.trim()) viewTabs.push(tabId);
      }
      mergeFilesTabEntryIds(viewFilesTabEntryIds, action.filesTabEntryIds);
      if (action.filesTabAllowMove) viewFilesTabAllowMove = true;
    }
  }

  // Prefer editable form over read-only when the same field appears in both.
  const viewFieldIds = uniquePreserveOrder(viewOnly).filter(
    (fieldId) => !visibleSet.has(fieldId),
  );

  return {
    requiredFieldIds,
    visibleFieldIds,
    viewFieldIds,
    viewTabIds: uniquePreserveOrder(viewTabs),
    viewFilesTabEntryIds,
    viewFilesTabAllowMove,
    requireAttachment: outcome.fieldAccess.requireAttachment === true,
  };
}

/** Union across outcomes — for draft init / “needs dialog” checks. */
export function getAutomationTaskAskFields(
  task: AutomationTask,
): AutomationAskFields {
  const required: string[] = [];
  const visible: string[] = [];
  const viewOnly: string[] = [];
  const viewTabs: string[] = [];
  const viewFilesTabEntryIds: Record<string, string[]> = {};
  let viewFilesTabAllowMove = false;
  let requireAttachment = false;

  for (const outcome of task.config.outcomes) {
    const ask = getAutomationOutcomeAskFields(outcome);
    required.push(...ask.requiredFieldIds);
    visible.push(...ask.visibleFieldIds);
    viewOnly.push(...ask.viewFieldIds);
    viewTabs.push(...ask.viewTabIds);
    mergeFilesTabEntryIds(viewFilesTabEntryIds, ask.viewFilesTabEntryIds);
    if (ask.viewFilesTabAllowMove) viewFilesTabAllowMove = true;
    if (ask.requireAttachment) requireAttachment = true;
  }

  const visibleFieldIds = uniquePreserveOrder(visible);
  const visibleSet = new Set(visibleFieldIds);

  return {
    requiredFieldIds: uniquePreserveOrder(required),
    visibleFieldIds,
    viewFieldIds: uniquePreserveOrder(viewOnly).filter(
      (fieldId) => !visibleSet.has(fieldId),
    ),
    viewTabIds: uniquePreserveOrder(viewTabs),
    viewFilesTabEntryIds,
    viewFilesTabAllowMove,
    requireAttachment,
  };
}

export function automationOutcomeNeedsInput(outcome: AutomationOutcome) {
  const ask = getAutomationOutcomeAskFields(outcome);
  return (
    ask.visibleFieldIds.length > 0 ||
    ask.requiredFieldIds.length > 0 ||
    ask.viewFieldIds.length > 0 ||
    ask.viewTabIds.length > 0 ||
    ask.requireAttachment
  );
}

export function automationTaskNeedsFillDialog(task: AutomationTask) {
  return task.config.outcomes.some(automationOutcomeNeedsInput);
}

/** «Одна кнопка» — форма сразу; «Решение» — поля после выбора результата. */
export function automationTaskShowsFormUpfront(task: AutomationTask) {
  return task.config.kind === "single";
}

/** Preselect the sole outcome for single-button tasks. */
export function getDefaultSelectedOutcomeId(
  task: AutomationTask,
): string | null {
  if (task.config.kind !== "single") return null;
  return task.config.outcomes[0]?.id ?? null;
}

export { EMPTY_ASK_FIELDS };
