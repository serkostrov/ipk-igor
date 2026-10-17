import {
  formatRecordFieldValue,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  getEntityTabRecordsValueKey,
  getEntityValueContext,
  isEntityRecordsTab,
  parseEntityTabRecordEntries,
  serializeEntityTabRecordEntries,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
  type EntityTabRecordEntry,
} from "@/entities/entity";
import {
  completeAutomationTaskRpc,
  fetchAutomationTask,
  notifyAutomationTasksChanged,
  returnAutomationTaskForRevisionRpc,
} from "../api/automation-tasks-api";
import { resolveAutomationActionValue } from "../model/action-values";
import { executeAutomationActions } from "./execute-actions";
import type { AutomationOutcomeFieldAccess } from "../model/types";

/** Append selected form-field values as notes on the first «Записи» tab. */
async function appendOutcomeFieldComments(
  entity: Entity,
  record: EntityRecord,
  fieldAccess: AutomationOutcomeFieldAccess,
  values: Record<string, string>,
) {
  if (fieldAccess.commentFieldIds.length === 0) return;

  const notesTab = entity.tabs.find(isEntityRecordsTab);
  if (!notesTab) return;

  const ctx = getEntityValueContext(
    getEntityConfig().entities,
    getCurrentUserRecordId(),
  );
  const lines: string[] = [];
  for (const fieldId of fieldAccess.commentFieldIds) {
    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field) continue;
    const raw = (values[fieldId] ?? "").trim();
    if (!raw) continue;
    const formatted = formatRecordFieldValue(
      ctx,
      entity,
      { ...record, values: { ...record.values, ...values } },
      field,
    );
    if (!formatted || formatted === "—") continue;
    lines.push(`${getEntityFieldDisplayName(field)}: ${formatted}`);
  }
  if (lines.length === 0) return;

  const valueKey = getEntityTabRecordsValueKey(notesTab.id);
  const existing = parseEntityTabRecordEntries(record.values[valueKey]);
  const entry: EntityTabRecordEntry = {
    id: crypto.randomUUID(),
    text: lines.join("\n"),
    createdAt: new Date().toISOString(),
    authorId: getCurrentUserRecordId(),
    editedAt: null,
  };
  await updateEntityRecord(entity.id, record.id, {
    ...record.values,
    [valueKey]: serializeEntityTabRecordEntries([entry, ...existing]),
  });
}

/**
 * Complete via SQL RPC, then run rich client-side actions from outcome.
 * `formValues` — draft values from the fill dialog (for comments that are
 * not written onto the record).
 */
export async function completeAutomationTask(
  taskId: string,
  outcomeId: string,
  actorUserId?: string | null,
  formValues?: Record<string, string>,
) {
  const task = await fetchAutomationTask(taskId);
  if (!task) throw new Error("Задача не найдена");

  const outcome =
    task.config.outcomes.find((item) => item.id === outcomeId) ??
    task.config.outcomes[0];
  if (!outcome) throw new Error("Не выбран результат");

  const { entities } = getEntityConfig();
  const entity = entities.find((item) => item.id === task.entityId);
  const record = entity?.records.find((item) => item.id === task.recordId);
  const valuesBefore = record?.values ?? {};
  const valuesForForm = { ...valuesBefore, ...formValues };

  // Required fields from outcome form + optional requireFields action.
  const requireAction = outcome.actions.find(
    (action) => action.kind === "requireFields",
  );
  const requiredIds = [
    ...outcome.fieldAccess.requiredFieldIds,
    ...(requireAction && requireAction.kind === "requireFields"
      ? requireAction.fieldIds
      : []),
  ];
  const missingRequired = [...new Set(requiredIds)].filter((fieldId) => {
    const field = entity?.fields.find((item) => item.id === fieldId);
    const raw = valuesForForm[fieldId] ?? "";
    if (field?.type === "boolean") return false;
    return !raw.trim();
  });
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((fieldId) => {
      const field = entity?.fields.find((item) => item.id === fieldId);
      return field ? getEntityFieldDisplayName(field) : fieldId;
    });
    throw new Error(`Не заполнены обязательные поля: ${labels.join(", ")}`);
  }
  const previousValues: Record<string, string> = {
    ...(record?.values ?? {}),
  };

  // Include upcoming setField values so «комм.» can duplicate autofill writes.
  const valuesForComments = { ...valuesForForm };
  if (entity) {
    for (const action of outcome.actions) {
      if (action.kind !== "setField" || !action.fieldId.trim()) continue;
      const field = entity.fields.find((item) => item.id === action.fieldId);
      valuesForComments[action.fieldId] = resolveAutomationActionValue(
        action.value,
        valuesForForm,
        {
          entities,
          triggerEntityId: entity.id,
          fieldType: field?.type,
          datetimeWithTime: field?.datetimeWithTime,
          actorUserId: actorUserId ?? getCurrentUserRecordId(),
        },
      );
    }
  }

  if (entity && record) {
    await appendOutcomeFieldComments(
      entity,
      record,
      outcome.fieldAccess,
      valuesForComments,
    );
  }

  const rpcResult = await completeAutomationTaskRpc(
    taskId,
    outcome.id,
    actorUserId,
  );
  notifyAutomationTasksChanged();

  // Refresh after SQL setField side-effects.
  const { entities: nextEntities } = getEntityConfig();
  const nextEntity = nextEntities.find((item) => item.id === task.entityId);
  const nextRecord = nextEntity?.records.find(
    (item) => item.id === task.recordId,
  );
  const values: Record<string, string> = {
    ...(nextRecord?.values ?? previousValues),
  };

  const richActions = outcome.actions.filter(
    (action) =>
      action.kind !== "setField" &&
      action.kind !== "noop" &&
      action.kind !== "requireFields" &&
      action.kind !== "viewField" &&
      action.kind !== "viewTabs" &&
      action.kind !== "cancelTasks",
  );

  if (richActions.length > 0) {
    const result = await executeAutomationActions(richActions, {
      entities: nextEntities,
      triggerEntityId: task.entityId,
      triggerRecordId: task.recordId,
      values,
      previousValues,
      actorUserId: actorUserId ?? null,
      depth: 1,
    });
    if (result.errors.length > 0) {
      throw new Error(result.errors.join("; "));
    }
  }

  return rpcResult;
}

export async function returnAutomationTaskForRevision(
  taskId: string,
  actorUserId?: string | null,
) {
  const runId = await returnAutomationTaskForRevisionRpc(taskId, actorUserId);
  notifyAutomationTasksChanged();
  return runId;
}
