import {
  getEntityRecordById,
  getEntityRecordsByIds,
  collectTkpStageDepartmentPairs,
  filterDeptCalculationRecordsForAssignee,
  findDeptCalculationsGroupsField,
  resolveEditableDeptCalculationRecordIds,
  formatRecordFieldValue,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  resolveEntityFieldLabel,
  getEntityTabRecordsValueKey,
  getEntityValueContext,
  isDeptCalculationsEntity,
  isEntityComputedFieldType,
  isEntityRecordsTab,
  isEntityRelationGroupsFilled,
  notifyRecordMentions,
  parseEntityListValueIds,
  parseEntityTabRecordEntries,
  resolveEntityListFieldOptions,
  serializeEntityTabRecordEntries,
  setEntityRecordValuesLocal,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
  type EntityTabRecordEntry,
} from "@/entities/entity";
import { toast } from "sonner";
import {
  completeAutomationTaskRpc,
  fetchAutomationTask,
  fetchAutomationTasks,
  notifyAutomationTasksChanged,
  returnAutomationTaskForRevisionRpc,
  setAutomationTasksHighlightNote,
} from "../api/automation-tasks-api";
import { resolveAutomationActionValue } from "../model/action-values";
import { getAutomationConfig } from "../store/automation-store";
import { resolveAskRelatedTarget } from "./ask-related";
import { resolveAutomationGateError } from "./blocking-error";
import { clearDestinationStageAskFields } from "./clear-destination-ask-fields";
import { executeAutomationActions } from "./execute-actions";
import {
  assigneeDefersProcessStage,
  getOutcomeStageOptionId,
  isAffirmativeDecisionOutcome,
  nextProcessStageOptionId,
  normalizeProcessStageOptionId,
  outcomeChangesProcessStage,
  processStageOptionIdsMatch,
} from "./outcome-stage-action";
import { pickAutomationOutcome } from "./pick-outcome";
import {
  runAfterAutomationTaskCompleteHook,
  runBeforeAutomationStageSpawnHook,
  runBeforeAutomationTaskCompleteHook,
} from "./hardcode-hooks";
import { mirrorFileFieldsToFilesTab } from "./mirror-file-fields-to-tab";
import { assertAutomationUploadRequired } from "./upload-required";
import {
  resolveEffectiveUploadTarget,
  setAutomationUploadTarget,
} from "./upload-target";
import {
  emptyAutomationOutcomeFieldAccess,
  isAutomationSilentTaskKind,
  normalizeAutomationOutcomeFieldAccess,
  relatedAskValueKey,
  type AutomationOutcomeFieldAccess,
  type AutomationTask,
  type AutomationTaskHighlightNote,
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
    attachments: [],
    links: [],
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
    const resolved = await resolveAskRelatedTarget({
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

    const linked = await getEntityRecordsByIds(
      resolved.relatedEntity,
      resolved.relatedRecordIds,
    );
    const byId = new Map(linked.map((record) => [record.id, record]));
    for (const relatedRecordId of resolved.relatedRecordIds) {
      const relatedRecord = byId.get(relatedRecordId);
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
      attachments: [],
      links: [],
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

/**
 * Reason may be configured on the outcome button or on template-level
 * «Действия задания». Outcome wins when both are set.
 *
 * Legacy return buttons often require a comment field without setting
 * `reasonFieldId` — treat a single required host text field as the reason so
 * the respawned task for the returnee gets the highlight banner.
 */
function resolveReturnReasonFieldAccess(
  task: AutomationTask,
  outcomeAccess: AutomationOutcomeFieldAccess,
  triggerEntity?: Entity,
): AutomationOutcomeFieldAccess {
  const outcome = normalizeAutomationOutcomeFieldAccess(outcomeAccess);
  const template = normalizeAutomationOutcomeFieldAccess(
    task.config.fieldAccess ?? emptyAutomationOutcomeFieldAccess(),
  );
  if (outcome.reasonFieldId || outcome.relatedReasonId) return outcome;
  if (template.reasonFieldId || template.relatedReasonId) {
    return {
      ...outcome,
      reasonFieldId: template.reasonFieldId,
      relatedReasonId: template.relatedReasonId,
      // Need related ask row metadata when reason is a related field.
      relatedVisibleFields:
        outcome.relatedVisibleFields.length > 0
          ? outcome.relatedVisibleFields
          : template.relatedVisibleFields,
    };
  }
  if (!triggerEntity || outcome.requiredFieldIds.length === 0) return outcome;
  const textReasonIds = outcome.requiredFieldIds.filter((fieldId) => {
    const field = triggerEntity.fields.find((item) => item.id === fieldId);
    if (!field) return false;
    return field.type === "text" || field.type === "textarea";
  });
  if (textReasonIds.length !== 1) return outcome;
  return {
    ...outcome,
    reasonFieldId: textReasonIds[0]!,
    relatedReasonId: null,
  };
}

/** Resolve the single configured return-reason text from ask form values. */
async function resolveReturnReasonSnapshot(options: {
  triggerEntity: Entity | undefined;
  entities: Entity[];
  fieldAccess: AutomationOutcomeFieldAccess;
  values: Record<string, string>;
  recordValues?: Record<string, string>;
  triggerRecordId: string;
  sourceTaskId: string;
}): Promise<AutomationTaskHighlightNote | null> {
  const {
    triggerEntity,
    entities,
    fieldAccess,
    values,
    recordValues,
    triggerRecordId,
    sourceTaskId,
  } = options;
  if (!triggerEntity) return null;

  if (fieldAccess.reasonFieldId) {
    const field = triggerEntity.fields.find(
      (item) => item.id === fieldAccess.reasonFieldId,
    );
    if (!field || (field.type !== "text" && field.type !== "textarea")) {
      return null;
    }
    const text =
      (values[field.id] ?? "").trim() ||
      (recordValues?.[field.id] ?? "").trim();
    if (!text) return null;
    return {
      kind: "return_reason",
      title: "Причина возврата",
      text,
      fieldLabel: getEntityFieldDisplayName(field),
      sourceTaskId,
    };
  }

  if (!fieldAccess.relatedReasonId) return null;
  const ask = fieldAccess.relatedVisibleFields.find(
    (item) => item.id === fieldAccess.relatedReasonId,
  );
  if (!ask) return null;
  const resolved = await resolveAskRelatedTarget({
    triggerEntity,
    entities,
    ask,
    triggerRecordId,
    triggerValues: values,
  });
  if (!resolved) return null;
  const field = resolved.relatedEntity.fields.find(
    (item) => item.id === ask.fieldId,
  );
  if (!field || (field.type !== "text" && field.type !== "textarea")) {
    return null;
  }
  for (const relatedRecordId of resolved.relatedRecordIds) {
    const key = relatedAskValueKey(
      resolved.scopeKey,
      relatedRecordId,
      ask.fieldId,
    );
    const fromForm = (values[key] ?? "").trim();
    if (fromForm) {
      return {
        kind: "return_reason",
        title: "Причина возврата",
        text: fromForm,
        fieldLabel: getEntityFieldDisplayName(field),
        sourceTaskId,
      };
    }
    const relatedRecord = await getEntityRecordById(
      resolved.relatedEntity,
      relatedRecordId,
    );
    const fromRecord = (relatedRecord?.values[ask.fieldId] ?? "").trim();
    if (fromRecord) {
      return {
        kind: "return_reason",
        title: "Причина возврата",
        text: fromRecord,
        fieldLabel: getEntityFieldDisplayName(field),
        sourceTaskId,
      };
    }
  }
  return null;
}

/** Pending tasks spawned for this process after a stage return (or sequential next). */
async function collectHighlightTargetTaskIds(options: {
  recordId: string;
  processId: string;
  excludeTaskId: string;
  createdAtFromMs: number;
  destinationStageId?: string;
}): Promise<string[]> {
  const pending = await fetchAutomationTasks({
    recordId: options.recordId,
    status: ["pending", "returned"],
  });
  const destination = options.destinationStageId
    ? normalizeProcessStageOptionId(options.destinationStageId)
    : "";
  return pending
    .filter((item) => {
      if (item.id === options.excludeTaskId) return false;
      if (item.processId !== options.processId) return false;
      if (item.highlightNote) return false;
      if (new Date(item.createdAt).getTime() < options.createdAtFromMs) {
        return false;
      }
      if (!destination) return true;
      return (
        processStageOptionIdsMatch(item.triggerOptionId, destination) ||
        processStageOptionIdsMatch(item.config.triggerOptionId, destination)
      );
    })
    .map((item) => item.id);
}

async function validateRelatedRequiredFields(
  triggerEntity: Entity,
  entities: Entity[],
  fieldAccess: AutomationOutcomeFieldAccess,
  values: Record<string, string>,
  triggerRecordId: string,
  assigneeUserId?: string | null,
): Promise<string[]> {
  const missing: string[] = [];
  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );
  const leadParent = {
    entity: triggerEntity,
    record: {
      id: triggerRecordId,
      values,
      authUserId: null,
      createdBy: null,
      schemaVersion: 0,
    } satisfies EntityRecord,
  };

  for (const ask of requiredAsks) {
    const resolved = await resolveAskRelatedTarget({
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
    let relatedIds = resolved?.relatedRecordIds ?? [];
    if (relatedIds.length === 0) {
      missing.push(label);
      continue;
    }
    if (!field) {
      missing.push(label);
      continue;
    }
    if (isEntityComputedFieldType(field.type)) continue;

    const groupsField = findDeptCalculationsGroupsField(
      resolved!.relatedEntity,
    );
    if (
      isDeptCalculationsEntity(resolved!.relatedEntity) &&
      groupsField?.id === ask.fieldId &&
      field.type === "relationGroups"
    ) {
      let best = "";
      let bestPairs = -1;
      for (const relatedRecordId of relatedIds) {
        const key = relatedAskValueKey(
          resolved!.scopeKey,
          relatedRecordId,
          ask.fieldId,
        );
        if (values[key] === undefined) continue;
        const raw = values[key]!;
        const pairs = collectTkpStageDepartmentPairs(raw).length;
        if (pairs > bestPairs) {
          bestPairs = pairs;
          best = raw;
        }
      }
      if (
        !isEntityRelationGroupsFilled(
          best,
          ask.relationGroupsMode ?? "full",
          field.relationGroups?.levels.length ?? 2,
        )
      ) {
        missing.push(label);
      }
      continue;
    }

    const linked = await getEntityRecordsByIds(
      resolved!.relatedEntity,
      relatedIds,
    );
    const byId = new Map(linked.map((record) => [record.id, record]));

    // Department head / GIP: only validate rows this assignee must fill.
    if (isDeptCalculationsEntity(resolved!.relatedEntity)) {
      const visible = await filterDeptCalculationRecordsForAssignee({
        entity: resolved!.relatedEntity,
        records: linked,
        entities,
        assigneeUserId,
        leadParent,
      });
      const editableIds = await resolveEditableDeptCalculationRecordIds({
        entity: resolved!.relatedEntity,
        records: visible,
        entities,
        assigneeUserId,
        leadParent,
      });
      relatedIds = visible
        .filter((record) => editableIds.has(record.id))
        .map((record) => record.id);
      if (relatedIds.length === 0) {
        missing.push(label);
        continue;
      }
    }

    for (const relatedRecordId of relatedIds) {
      const key = relatedAskValueKey(
        resolved!.scopeKey,
        relatedRecordId,
        ask.fieldId,
      );
      const relatedRecord = byId.get(relatedRecordId);
      const draft = values[key];
      const live = relatedRecord?.values[ask.fieldId] ?? "";
      // «Расчёты отделов»: срок и описание пишутся таблицей, а черновик
      // формы фиксируется в момент выбора исхода и остаётся пустым.
      const raw =
        isDeptCalculationsEntity(resolved!.relatedEntity) &&
        (draft === undefined || draft.trim() === "")
          ? live
          : (draft ?? live);
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
  const record = await getEntityRecordById(entity, task.recordId);
  const valuesBefore = record?.values ?? {};
  const valuesForForm = { ...valuesBefore, ...formValues };

  // Legacy «файл результата» fields → Files tab before the required check.
  if (entity && record) {
    try {
      await mirrorFileFieldsToFilesTab({
        entity,
        record,
        values: valuesForForm,
        materials: task.config.materials,
        target: resolveEffectiveUploadTarget({
          materials: task.config.materials,
          requireAttachment:
            task.config.fieldAccess?.requireAttachment === true ||
            outcome.fieldAccess.requireAttachment === true,
          entity,
        }),
      });
    } catch (error: unknown) {
      console.error(
        "[automation] mirror file fields to files tab failed",
        error,
      );
    }
  }

  // Required file upload from template materials («Обязательно для завершения»).
  const uploadTarget = resolveEffectiveUploadTarget({
    materials: task.config.materials,
    requireAttachment:
      task.config.fieldAccess?.requireAttachment === true ||
      outcome.fieldAccess.requireAttachment === true,
    entity,
  });
  if (uploadTarget?.required) {
    assertAutomationUploadRequired(
      setAutomationUploadTarget(task.config.materials ?? [], uploadTarget),
      entity,
      // Re-read after mirror so freshly copied files count.
      (await getEntityRecordById(entity, task.recordId)) ?? record,
    );
  } else {
    assertAutomationUploadRequired(task.config.materials, entity, record);
  }

  // Product hardcode gates (e.g. GIP «Общий срок расчёта»).
  await runBeforeAutomationTaskCompleteHook({
    entityId: task.entityId,
    recordId: task.recordId,
    values: valuesForForm,
    triggerOptionId: task.triggerOptionId,
    taskName: task.name,
    outcomeLabel: outcome.label,
    assigneeUserId: task.assigneeUserId,
  });

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
    const missingRelated = await validateRelatedRequiredFields(
      entity,
      entities,
      outcome.fieldAccess,
      valuesForForm,
      task.recordId,
      task.assigneeUserId,
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
      valuesForComments[action.fieldId] = await resolveAutomationActionValue(
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

  const process = getAutomationConfig().processes.find(
    (item) => item.id === task.processId,
  );
  const triggerFieldId = process?.triggerFieldId?.trim() ?? "";
  const stageChanges = outcomeChangesProcessStage(
    outcome.actions,
    triggerFieldId,
    task.triggerOptionId,
  );
  const reasonAccess = outcome.isReturn
    ? resolveReturnReasonFieldAccess(task, outcome.fieldAccess, entity)
    : normalizeAutomationOutcomeFieldAccess(outcome.fieldAccess);
  const returnReason =
    outcome.isReturn &&
    stageChanges &&
    (reasonAccess.reasonFieldId || reasonAccess.relatedReasonId)
      ? await resolveReturnReasonSnapshot({
          triggerEntity: entity,
          entities,
          fieldAccess: reasonAccess,
          values: valuesForForm,
          recordValues: record?.values,
          triggerRecordId: task.recordId,
          sourceTaskId: task.id,
        })
      : null;
  const destinationStageId = stageChanges
    ? normalizeProcessStageOptionId(
        getOutcomeStageOptionId(outcome.actions, triggerFieldId),
      )
    : "";
  // Lower bound with skew cushion so server `created_at` is not missed.
  const spawnAfterMs = Date.now() - 15_000;

  // Child rows (расчёт отделов) must exist before SQL setField fires fieldEnter.
  if (stageChanges && destinationStageId) {
    await runBeforeAutomationStageSpawnHook({
      entityId: task.entityId,
      recordId: task.recordId,
      values: valuesForForm,
      destinationStageId,
    });
  }

  // Return without filled data: wipe destination ask fields before stage spawn.
  if (
    outcome.isReturn &&
    stageChanges &&
    destinationStageId &&
    outcome.keepFilledData === false &&
    entity
  ) {
    const preserveFieldIds = [
      reasonAccess.reasonFieldId,
      ...(reasonAccess.reasonFieldId ? [] : reasonAccess.requiredFieldIds),
    ].filter((id): id is string => Boolean(id?.trim()));
    await clearDestinationStageAskFields({
      entity,
      recordId: task.recordId,
      scenarioId: task.scenarioId,
      destinationStageId,
      entities,
      preserveFieldIds,
      hostValues: valuesForForm,
    });
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

  // Attach / forward return-reason banner onto newly spawned tasks.
  const highlightNote =
    returnReason ??
    (task.highlightNote?.kind === "return_reason" ? task.highlightNote : null);
  if (highlightNote) {
    try {
      const stageFilter = returnReason
        ? destinationStageId
        : normalizeProcessStageOptionId(
            task.config.triggerOptionId || task.triggerOptionId,
          );
      const targetIds = await collectHighlightTargetTaskIds({
        recordId: task.recordId,
        processId: task.processId,
        excludeTaskId: task.id,
        createdAtFromMs: spawnAfterMs,
        // Stage return → destination; sequential continue → same stage.
        destinationStageId: stageFilter || undefined,
      });
      if (targetIds.length > 0) {
        await setAutomationTasksHighlightNote({
          taskIds: targetIds,
          note: highlightNote,
        });
      }
    } catch (error: unknown) {
      console.error(
        "[automation] failed to attach return-reason highlight",
        error,
      );
    }
  }

  notifyAutomationTasksChanged();

  // Multi-assignee: next step / stage wait for everyone — tell the actor.
  if (
    !isAutomationSilentTaskKind(task.config.kind) &&
    rpcResult.waitingForAssignees
  ) {
    toast.message("Задание завершено", {
      description: "Следующий шаг откроется, когда закончат все исполнители",
    });
  }

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
      patchedValues[action.fieldId] = await resolveAutomationActionValue(
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

  // Product hardcode after complete (e.g. ensure stage×ГИП rows) — must run
  // even when the task was closed from the list / dialog without Workspace.
  await runAfterAutomationTaskCompleteHook({
    entityId: task.entityId,
    recordId: task.recordId,
    values: patchedValues,
    triggerOptionId: task.triggerOptionId,
    taskId: task.id,
    taskName: task.name,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label ?? null,
    assigneeUserId: task.assigneeUserId,
  });

  // beforeEnter prep without «Перейти на стадию» must still land on the
  // destination stage (template.triggerOptionId). Default «Готово» buttons
  // ship with empty actions — otherwise the record stays on the previous
  // column and the «ТОГДА» gateway keeps blocking manual moves.
  // Skip if SQL already landed (avoids a second fieldEnter / duplicate spawn).
  const launchPhase = task.config.launchPhase ?? "onEnter";
  const hasExplicitStage = outcome.actions.some(
    (action) => action.kind === "setField" && action.fieldId === triggerFieldId,
  );
  if (launchPhase === "beforeEnter") {
    const destination = normalizeProcessStageOptionId(
      task.config.triggerOptionId?.trim() ?? "",
    );
    const currentStageId =
      parseEntityListValueIds(patchedValues[triggerFieldId] ?? "")[0] ??
      (patchedValues[triggerFieldId] ?? "").trim();
    const alreadyLanded =
      Boolean(destination) &&
      processStageOptionIdsMatch(currentStageId, destination);
    if (
      entity &&
      triggerFieldId &&
      destination &&
      !hasExplicitStage &&
      !alreadyLanded
    ) {
      try {
        // Patch only the process stage — never rewrite the full form snapshot.
        await updateEntityRecord(entity.id, task.recordId, {
          [triggerFieldId]: destination,
        });
        // Reflect the advance only after the DB accepted it, so the final local
        // apply never shows a stage the backend rejected.
        patchedValues[triggerFieldId] = destination;
      } catch (error: unknown) {
        console.error("[automation] beforeEnter stage advance failed", error);
      }
    }
  }

  // Decision «Да» without «Перейти на стадию» — advance to the next process
  // stage so the BP does not stay stuck on the approval column.
  if (
    entity &&
    triggerFieldId &&
    launchPhase === "onEnter" &&
    task.config.kind === "decision" &&
    !hasExplicitStage &&
    !rpcResult.waitingForAssignees &&
    !assigneeDefersProcessStage(task.config.assignee) &&
    isAffirmativeDecisionOutcome(outcome)
  ) {
    const stageField = entity.fields.find((item) => item.id === triggerFieldId);
    if (stageField?.type === "list") {
      const currentStageId =
        parseEntityListValueIds(patchedValues[triggerFieldId] ?? "")[0] ??
        normalizeProcessStageOptionId(task.triggerOptionId ?? "");
      const nextStageId = nextProcessStageOptionId(
        resolveEntityListFieldOptions(stageField, entities),
        currentStageId,
      );
      if (nextStageId) {
        try {
          await updateEntityRecord(entity.id, task.recordId, {
            [triggerFieldId]: nextStageId,
          });
          // Reflect the advance only after the DB accepted it.
          patchedValues[triggerFieldId] = nextStageId;
        } catch (error: unknown) {
          console.error("[automation] decision stage advance failed", error);
        }
      }
    }
  }

  if (entity) {
    setEntityRecordValuesLocal(entity.id, task.recordId, patchedValues);
  }

  // Silent «actions» steps (stage advance after all dept tasks) must run even
  // when the task was closed from the inbox, not only from the fill dialog.
  // While siblings are still open, the next step is not released yet.
  if (!flushingSilentTasks && !rpcResult.waitingForAssignees) {
    flushingSilentTasks = true;
    try {
      await completePendingSilentAutomationTasksForRecord(
        task.recordId,
        actorUserId ?? null,
      );
    } finally {
      flushingSilentTasks = false;
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

/** One in-flight silent prep per record — Host + Dialog + Page must not race. */
const silentCompleteByRecord = new Map<string, Promise<void>>();
/** Prevents complete → silent flush → complete from recursing. */
let flushingSilentTasks = false;

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
    const record = await getEntityRecordById(entity, task.recordId);
    const outcome = pickAutomationOutcome(
      task.config.outcomes,
      { values: record?.values ?? {} },
      task.outcomeId,
    );
    if (!outcome) continue;
    try {
      await completeAutomationTask(task.id, outcome.id, actorUserId ?? null);
    } catch (error: unknown) {
      // Parallel Host/Dialog flushes race: the silent step may already be done.
      if (isAutomationTaskAlreadyFinishedError(error)) continue;
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

/** RPC «task is not pending» / already completed — safe to ignore on silent flush. */
function isAutomationTaskAlreadyFinishedError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : String(error ?? "");
  return (
    /task is not pending/i.test(raw) ||
    /already (completed|cancelled|canceled|finished)/i.test(raw) ||
    /задача уже завершена или отменена/i.test(raw)
  );
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
    for (let pass = 0; pass < 5; pass += 1) {
      const pending = await fetchAutomationTasks({
        recordId: id,
        status: ["pending", "returned"],
      });
      const silent = pending.filter((task) =>
        isAutomationSilentTaskKind(task.config.kind),
      );
      if (silent.length === 0) return;
      await runSilentCompletesForTasks(pending, actorUserId ?? null);
    }
  })().finally(() => {
    if (silentCompleteByRecord.get(id) === run) {
      silentCompleteByRecord.delete(id);
    }
  });
  silentCompleteByRecord.set(id, run);
  await run;
}
