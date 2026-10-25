import {
  formatRecordFieldValue,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  resolveEntityFieldLabel,
  getEntityTabRecordsValueKey,
  getEntityValueContext,
  isEntityComputedFieldType,
  isEntityRecordsTab,
  isEntityRelationGroupsFilled,
  notifyRecordMentions,
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
  fetchAutomationTasks,
  notifyAutomationTasksChanged,
  returnAutomationTaskForRevisionRpc,
} from "../api/automation-tasks-api";
import { resolveAutomationActionValue } from "../model/action-values";
import { getAutomationConfig } from "../store/automation-store";
import { resolveAskRelatedTarget } from "./ask-related";
import { resolveAutomationGateError } from "./blocking-error";
import { executeAutomationActions } from "./execute-actions";
import { pickAutomationOutcome } from "./pick-outcome";
import {
  isAutomationSilentTaskKind,
  relatedAskValueKey,
  type AutomationOutcomeFieldAccess,
  type AutomationTask,
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
  triggerRecordId: string,
) {
  if (fieldAccess.relatedCommentIds.length === 0) return;

  const commentAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedCommentIds.includes(item.id),
  );
  if (commentAsks.length === 0) return;

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
    const resolved = resolveAskRelatedTarget({
      triggerEntity,
      entities,
      ask,
      triggerRecordId,
      triggerValues: values,
    });
    if (!resolved) continue;
    if (!resolved.relatedEntity.tabs.some(isEntityRecordsTab)) continue;
    const field = resolved.relatedEntity.fields.find(
      (item) => item.id === ask.fieldId,
    );
    if (!field) continue;

    for (const relatedRecordId of resolved.relatedRecordIds) {
      const relatedRecord = resolved.relatedEntity.records.find(
        (item) => item.id === relatedRecordId,
      );
      if (!relatedRecord) continue;
      const key = relatedAskValueKey(
        resolved.scopeKey,
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
        resolved.relatedEntity,
        { ...relatedRecord, values: draftValues },
        field,
      );
      if (!formatted || formatted === "—") continue;
      const mapKey = `${resolved.relatedEntity.id}:${relatedRecordId}`;
      const bucket = buckets.get(mapKey) ?? {
        entity: resolved.relatedEntity,
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
  triggerRecordId: string,
): string[] {
  const missing: string[] = [];
  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );

  for (const ask of requiredAsks) {
    const resolved = resolveAskRelatedTarget({
      triggerEntity,
      entities,
      ask,
      triggerRecordId,
      triggerValues: values,
    });
    const relationLabel =
      resolved?.label ??
      (ask.linkedTabId
        ? "Подсущность"
        : resolveEntityFieldLabel(
            triggerEntity.fields,
            ask.relationFieldId,
            "Связь",
          ));
    const field = resolved?.relatedEntity.fields.find(
      (item) => item.id === ask.fieldId,
    );
    const fieldLabel = resolved
      ? resolveEntityFieldLabel(resolved.relatedEntity.fields, ask.fieldId)
      : "поле";
    const label = `${relationLabel} · ${fieldLabel}`;
    const relatedIds = resolved?.relatedRecordIds ?? [];
    if (relatedIds.length === 0) {
      missing.push(label);
      continue;
    }
    if (!field) {
      missing.push(label);
      continue;
    }
    if (isEntityComputedFieldType(field.type)) continue;
    for (const relatedRecordId of relatedIds) {
      const key = relatedAskValueKey(
        resolved!.scopeKey,
        relatedRecordId,
        ask.fieldId,
      );
      const raw = values[key] ?? "";
      if (field.type === "boolean") continue;
      if (field.type === "relationGroups") {
        if (
          !isEntityRelationGroupsFilled(
            raw,
            ask.relationGroupsMode ?? "full",
            field.relationGroups?.levels.length ?? 2,
          )
        ) {
          missing.push(label);
          break;
        }
        continue;
      }
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
    if (!field) return false;
    // Lookup / formula / rollup — derived, not user-writable.
    if (isEntityComputedFieldType(field.type)) return false;
    const raw = valuesForForm[fieldId] ?? "";
    if (field.type === "boolean") return false;
    return !raw.trim();
  });
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((fieldId) =>
      resolveEntityFieldLabel(entity?.fields ?? [], fieldId),
    );
    throw new Error(`Не заполнены обязательные поля: ${labels.join(", ")}`);
  }
  if (entity) {
    const missingRelated = validateRelatedRequiredFields(
      entity,
      entities,
      outcome.fieldAccess,
      valuesForForm,
      task.recordId,
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
      task.recordId,
    );
  }

  // Rich actions (createRecord, …) MUST run before RPC complete.
  // Otherwise silent autofill is marked done, the next interactive task opens,
  // and createRecord either races after related-ask resolves empty — or fails
  // with the task already completed (no retry).
  const richActions = outcome.actions.filter(
    (action) =>
      action.kind !== "setField" &&
      action.kind !== "noop" &&
      action.kind !== "requireFields" &&
      action.kind !== "viewField" &&
      action.kind !== "viewTabs" &&
      action.kind !== "cancelTasks",
  );

  const valuesForRich: Record<string, string> = { ...valuesForForm };
  if (richActions.length > 0) {
    const result = await executeAutomationActions(richActions, {
      entities,
      triggerEntityId: task.entityId,
      triggerRecordId: task.recordId,
      values: valuesForRich,
      previousValues,
      actorUserId: actorUserId ?? null,
      depth: 1,
      formValues: formValues ?? {},
      // Silent create runs before RPC; retries must not insert another child.
      reuseExistingLinkedCreates: isAutomationSilentTaskKind(task.config.kind),
    });
    if (result.errors.length > 0) {
      throw new Error(result.errors.join("; "));
    }
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
      launchPhase: task.config.launchPhase ?? "onEnter",
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
    ...valuesForRich,
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

/** One in-flight silent prep per record — Host + Dialog + Page must not race. */
const silentCompleteByRecord = new Map<string, Promise<void>>();

async function runSilentCompletesForTasks(
  tasks: readonly AutomationTask[],
  actorUserId?: string | null,
): Promise<void> {
  const { entities } = getEntityConfig();
  const silent = tasks
    .filter((task) => isAutomationSilentTaskKind(task.config.kind))
    .sort((left, right) => {
      const phaseRank = (task: AutomationTask) =>
        (task.config.launchPhase ?? "onEnter") === "beforeEnter" ? 0 : 1;
      const phaseDelta = phaseRank(left) - phaseRank(right);
      if (phaseDelta !== 0) return phaseDelta;
      if (left.stepOrder !== right.stepOrder) {
        return left.stepOrder - right.stepOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });

  const failures: string[] = [];
  for (const task of silent) {
    const entity = entities.find((item) => item.id === task.entityId);
    const record = entity?.records.find((item) => item.id === task.recordId);
    const outcome = pickAutomationOutcome(
      task.config.outcomes,
      { values: record?.values ?? {} },
      task.outcomeId,
    );
    if (!outcome) continue;
    try {
      await completeAutomationTask(task.id, outcome.id, actorUserId ?? null);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error ?? "ошибка");
      console.error("[automation] silent step complete failed", error);
      failures.push(`«${task.name || "Автозаполнение"}»: ${message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Автозаполнение не выполнено:\n${failures.join("\n")}`);
  }
}

/**
 * Run pending silent autofill / actions tasks in step order.
 * Call before opening an interactive task so createRecord and setField from
 * earlier silent steps are already applied to the entity store.
 */
export async function completePendingSilentAutomationTasks(
  tasks: readonly AutomationTask[],
  actorUserId?: string | null,
): Promise<void> {
  const silent = tasks.filter((task) =>
    isAutomationSilentTaskKind(task.config.kind),
  );
  if (silent.length === 0) return;

  const byRecord = new Map<string, AutomationTask[]>();
  for (const task of silent) {
    const list = byRecord.get(task.recordId) ?? [];
    list.push(task);
    byRecord.set(task.recordId, list);
  }

  const runs: Promise<void>[] = [];
  for (const [recordId, recordTasks] of byRecord) {
    const existing = silentCompleteByRecord.get(recordId);
    if (existing) {
      runs.push(existing);
      continue;
    }
    const run = runSilentCompletesForTasks(recordTasks, actorUserId).finally(
      () => {
        if (silentCompleteByRecord.get(recordId) === run) {
          silentCompleteByRecord.delete(recordId);
        }
      },
    );
    silentCompleteByRecord.set(recordId, run);
    runs.push(run);
  }
  const results = await Promise.allSettled(runs);
  const errors = results
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) =>
      item.reason instanceof Error
        ? item.reason.message
        : String(item.reason ?? "ошибка"),
    );
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

/**
 * Finish pending silent steps for a record before opening an interactive task.
 * Needed when the host race / inbox opens step N while autofill createRecord
 * for step N−1 is still pending.
 */
export async function completePendingSilentAutomationTasksForRecord(
  recordId: string,
  actorUserId?: string | null,
): Promise<void> {
  const id = recordId.trim();
  if (!id) return;
  const existing = silentCompleteByRecord.get(id);
  if (existing) {
    await existing;
    return;
  }
  const run = (async () => {
    const pending = await fetchAutomationTasks({
      recordId: id,
      status: ["pending", "returned"],
    });
    await runSilentCompletesForTasks(pending, actorUserId ?? null);
  })().finally(() => {
    if (silentCompleteByRecord.get(id) === run) {
      silentCompleteByRecord.delete(id);
    }
  });
  silentCompleteByRecord.set(id, run);
  await run;
}
