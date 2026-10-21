import {
  formatRecordFieldValue,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getEntityTabRecordsValueKey,
  getEntityValueContext,
  isEntityRecordsTab,
  notifyRecordMentions,
  parseEntityRelationIds,
  parseEntityTabRecordEntries,
  serializeEntityTabRecordEntries,
  setEntityRecordValuesLocal,
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
import { getAutomationConfig } from "../store/automation-store";
import { resolveAutomationGateError } from "./blocking-error";
import { executeAutomationActions } from "./execute-actions";
import {
  relatedAskValueKey,
  type AutomationOutcomeFieldAccess,
} from "../model/types";

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
  await notifyRecordMentions({
    entities: getEntityConfig().entities,
    entityId: entity.id,
    recordId: record.id,
    text: entry.text,
    authorId: entry.authorId,
    entityName: entity.name,
  });
}

/** Append related-ask «комм.» notes onto linked records. */
async function appendRelatedOutcomeFieldComments(
  triggerEntity: Entity,
  entities: Entity[],
  fieldAccess: AutomationOutcomeFieldAccess,
  values: Record<string, string>,
) {
  if (fieldAccess.relatedCommentIds.length === 0) return;

  const commentAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedCommentIds.includes(item.id),
  );
  if (commentAsks.length === 0) return;

  const entityById = new Map(entities.map((item) => [item.id, item]));
  const ctx = getEntityValueContext(
    getEntityConfig().entities,
    getCurrentUserRecordId(),
  );

  type NoteBucket = {
    entity: Entity;
    record: EntityRecord;
    lines: string[];
  };
  const buckets = new Map<string, NoteBucket>();

  for (const ask of commentAsks) {
    const relationField = triggerEntity.fields.find(
      (field) => field.id === ask.relationFieldId,
    );
    const targetId = relationField
      ? getEntityRelationTargetId(relationField)
      : null;
    const relatedEntity = targetId ? entityById.get(targetId) : undefined;
    if (!relatedEntity) continue;
    if (!relatedEntity.tabs.some(isEntityRecordsTab)) continue;
    const field = relatedEntity.fields.find((item) => item.id === ask.fieldId);
    if (!field) continue;

    for (const relatedRecordId of parseEntityRelationIds(
      values[ask.relationFieldId],
    )) {
      const relatedRecord = relatedEntity.records.find(
        (item) => item.id === relatedRecordId,
      );
      if (!relatedRecord) continue;
      const key = relatedAskValueKey(
        ask.relationFieldId,
        relatedRecordId,
        ask.fieldId,
      );
      const raw = (values[key] ?? "").trim();
      if (!raw) continue;
      const draftValues = {
        ...relatedRecord.values,
        [ask.fieldId]: values[key] ?? "",
      };
      const formatted = formatRecordFieldValue(
        ctx,
        relatedEntity,
        { ...relatedRecord, values: draftValues },
        field,
      );
      if (!formatted || formatted === "—") continue;
      const mapKey = `${relatedEntity.id}:${relatedRecordId}`;
      const bucket = buckets.get(mapKey) ?? {
        entity: relatedEntity,
        record: relatedRecord,
        lines: [],
      };
      bucket.lines.push(`${getEntityFieldDisplayName(field)}: ${formatted}`);
      buckets.set(mapKey, bucket);
    }
  }

  for (const bucket of buckets.values()) {
    if (bucket.lines.length === 0) continue;
    const notesTab = bucket.entity.tabs.find(isEntityRecordsTab);
    if (!notesTab) continue;
    const valueKey = getEntityTabRecordsValueKey(notesTab.id);
    const existing = parseEntityTabRecordEntries(
      bucket.record.values[valueKey],
    );
    const entry: EntityTabRecordEntry = {
      id: crypto.randomUUID(),
      text: bucket.lines.join("\n"),
      createdAt: new Date().toISOString(),
      authorId: getCurrentUserRecordId(),
      editedAt: null,
    };
    await updateEntityRecord(bucket.entity.id, bucket.record.id, {
      ...bucket.record.values,
      [valueKey]: serializeEntityTabRecordEntries([entry, ...existing]),
    });
    await notifyRecordMentions({
      entities: getEntityConfig().entities,
      entityId: bucket.entity.id,
      recordId: bucket.record.id,
      text: entry.text,
      authorId: entry.authorId,
      entityName: bucket.entity.name,
    });
  }
}

function validateRelatedRequiredFields(
  triggerEntity: Entity,
  entities: Entity[],
  fieldAccess: AutomationOutcomeFieldAccess,
  values: Record<string, string>,
): string[] {
  const missing: string[] = [];
  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );
  const entityById = new Map(entities.map((item) => [item.id, item]));

  for (const ask of requiredAsks) {
    const relationField = triggerEntity.fields.find(
      (field) => field.id === ask.relationFieldId,
    );
    const relationLabel = relationField
      ? getEntityFieldDisplayName(relationField)
      : ask.relationFieldId;
    const targetId = relationField
      ? getEntityRelationTargetId(relationField)
      : null;
    const relatedEntity = targetId ? entityById.get(targetId) : undefined;
    const field = relatedEntity?.fields.find((item) => item.id === ask.fieldId);
    const fieldLabel = field ? getEntityFieldDisplayName(field) : ask.fieldId;
    const label = `${relationLabel} · ${fieldLabel}`;
    const relatedIds = parseEntityRelationIds(values[ask.relationFieldId]);
    if (relatedIds.length === 0) {
      missing.push(label);
      continue;
    }
    if (!field) {
      missing.push(label);
      continue;
    }
    for (const relatedRecordId of relatedIds) {
      const key = relatedAskValueKey(
        ask.relationFieldId,
        relatedRecordId,
        ask.fieldId,
      );
      const raw = values[key] ?? "";
      if (field.type === "boolean") continue;
      if (!raw.trim()) {
        missing.push(label);
        break;
      }
    }
  }
  return [...new Set(missing)];
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
  if (entity) {
    const missingRelated = validateRelatedRequiredFields(
      entity,
      entities,
      outcome.fieldAccess,
      valuesForForm,
    );
    if (missingRelated.length > 0) {
      throw new Error(
        `Не заполнены обязательные поля: ${missingRelated.join(", ")}`,
      );
    }
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
          triggerRecordId: task.recordId,
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
    await appendRelatedOutcomeFieldComments(
      entity,
      entities,
      outcome.fieldAccess,
      valuesForComments,
    );
  }

  let rpcResult;
  try {
    rpcResult = await completeAutomationTaskRpc(
      taskId,
      outcome.id,
      actorUserId,
    );
  } catch (error: unknown) {
    const message = await resolveAutomationGateError(error, {
      taskId: task.id,
      recordId: task.recordId,
      triggerOptionId: task.triggerOptionId,
      stepOrder: task.stepOrder,
      taskName: task.name,
    });
    throw new Error(message, { cause: error });
  }
  notifyAutomationTasksChanged();

  // SQL setField writes the DB; realtime is often down — mirror into local store
  // so Kanban / record views move to the configured stage immediately.
  const patchedValues: Record<string, string> = {
    ...previousValues,
    ...valuesForForm,
  };
  if (rpcResult.fieldValues) {
    Object.assign(patchedValues, rpcResult.fieldValues);
  } else if (entity) {
    for (const action of outcome.actions) {
      if (action.kind !== "setField" || !action.fieldId.trim()) continue;
      const field = entity.fields.find((item) => item.id === action.fieldId);
      patchedValues[action.fieldId] = resolveAutomationActionValue(
        action.value,
        valuesForForm,
        {
          entities,
          triggerEntityId: entity.id,
          triggerRecordId: task.recordId,
          fieldType: field?.type,
          datetimeWithTime: field?.datetimeWithTime,
          actorUserId: actorUserId ?? getCurrentUserRecordId(),
        },
      );
    }
  }

  // beforeEnter prep without «Перейти на стадию» must still land on the
  // destination stage (template.triggerOptionId). Default «Готово» buttons
  // ship with empty actions — otherwise the record stays on the previous
  // column and the «ТОГДА» gateway keeps blocking manual moves.
  const launchPhase = task.config.launchPhase ?? "onEnter";
  if (launchPhase === "beforeEnter") {
    const process = getAutomationConfig().processes.find(
      (item) => item.id === task.processId,
    );
    const triggerFieldId = process?.triggerFieldId?.trim() ?? "";
    const destination = task.config.triggerOptionId?.trim() ?? "";
    const hasExplicitStage = outcome.actions.some(
      (action) =>
        action.kind === "setField" && action.fieldId === triggerFieldId,
    );
    if (
      entity &&
      triggerFieldId &&
      destination &&
      !hasExplicitStage &&
      (patchedValues[triggerFieldId] ?? "") !== destination
    ) {
      patchedValues[triggerFieldId] = destination;
      try {
        await updateEntityRecord(entity.id, task.recordId, patchedValues);
      } catch (error: unknown) {
        console.error("[automation] beforeEnter stage advance failed", error);
      }
    }
  }

  if (entity) {
    setEntityRecordValuesLocal(entity.id, task.recordId, patchedValues);
  }

  const { entities: nextEntities } = getEntityConfig();
  const values: Record<string, string> = { ...patchedValues };

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
