import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  automationOutcomeButtonStyle,
  automationRequiresTimeTracking,
  fetchAutomationTaskTimeSessions,
  fetchOpenAutomationTaskTimeSession,
  getAutomationUploadTarget,
  resolveAutomationGateError,
  resolveViewEntityFieldsLayout,
  stopAutomationTaskTimeSession,
  type AutomationTask,
} from "@/entities/automation";
import { cn } from "@/shared/lib/cn";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { TaskTimeSessionsPanel } from "./TaskTimeSessionsPanel";
import { automationUploadTargetBlocksComplete } from "../lib/upload-to-files-tab";
import { TaskUploadPanel } from "./TaskUploadPanel";
import {
  applyEntityFieldValue,
  buildTkpGipSoftFillParentRecord,
  createEntityDraftRecord,
  getCurrentUserRecordId,
  getEntityFieldDisplayName,
  resolveEntityFieldLabel,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getEntityRecordTitle,
  getVisibleListOptions,
  isEntityFieldVisibleByConditions,
  isEntityNameField,
  normalizeEntityFieldInputValue,
  parseEntityListValueIds,
  parseEntityRelationIds,
  RecordValue,
  resolveEntityListFieldPresentation,
  resolveRelationRecordLabel,
  sanitizeEntityRelationDependencies,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { isTaskAskFieldFilled } from "../lib/task-field-filled";
import { useSessionUser } from "@/entities/session";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import {
  applyAutomationSetFieldAutofill,
  getOutcomeSetFieldActions,
  mergeAutofillIntoFormValues,
} from "../lib/apply-outcome-autofill";
import {
  automationOutcomeNeedsInput,
  automationTaskShowsFormUpfront,
  filterCreateAskSlotsForDeptCalculationsView,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  getDefaultSelectedOutcomeId,
  getOutcomeCreateAskSlots,
  validateCreateAskRequired,
} from "../lib/task-ask-fields";
import {
  buildTaskFormPersistPatch,
  buildTaskRelatedPersistUpdates,
  processTriggerFieldId,
} from "../lib/task-form-persist";
import {
  countMissingRelatedRequired,
  resolveRelatedAskLayout,
  seedRelatedAskValues,
  syncRelatedAskValuesAfterLocalChange,
  validateRelatedAskRequired,
  persistRelatedAskUpdates,
} from "../lib/task-related-ask";
import {
  taskFormAutosaveLabel,
  useTaskFormAutosave,
} from "../lib/use-task-form-autosave";
import { resumePendingRecordListChange } from "../model/pending-list-change";
import {
  resolveTaskAssigneeName,
  resolveTaskLeadManagerName,
} from "../lib/task-people";
import { applyRelatedAskFieldChange } from "../lib/apply-related-ask-field-change";
import { TaskCreateRecordAsk } from "./TaskCreateRecordAsk";
import { TaskRelatedAskFields } from "./TaskRelatedAskFields";
import { TaskViewContextFields } from "./TaskViewContextFields";
import { TaskViewTabsPreview } from "./TaskViewTabsPreview";

function recordTitle(
  ctx: EntityValueContext,
  entity: Entity | undefined,
  record: EntityRecord | undefined,
) {
  if (!entity || !record) return null;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return null;
  const raw = (record.values[nameField.id] ?? "").trim();
  // Corrupted name: automation wrote a raw record id into the text title.
  if (raw === record.id) return "Без названия";
  const asRelationIds = parseEntityRelationIds(raw);
  if (
    asRelationIds.length > 0 &&
    asRelationIds.every((id) => id.startsWith("record-")) &&
    (raw === asRelationIds[0] ||
      raw === asRelationIds.join(",") ||
      raw === JSON.stringify(asRelationIds))
  ) {
    const resolved = resolveRelationRecordLabel(entity, raw)?.trim() ?? "";
    if (
      resolved &&
      resolved !== "Без названия" &&
      !resolved.startsWith("record-")
    ) {
      return resolved;
    }
    return "Без названия";
  }
  return getEntityRecordTitle(ctx, entity, record);
}

function buildTaskFormValues(
  entity: Entity,
  record: EntityRecord,
  visibleFieldIds: string[],
  entities: Entity[],
  setFieldActions: ReturnType<typeof getOutcomeSetFieldActions> = [],
  actorUserId: string | null = null,
  relatedFields: ReturnType<
    typeof getAutomationTaskAskFields
  >["relatedVisibleFields"] = [],
) {
  const draft: Record<string, string> = {};
  for (const fieldId of visibleFieldIds) {
    const field = entity.fields.find((item) => item.id === fieldId);
    const raw = record.values[fieldId] ?? "";
    draft[fieldId] = field ? normalizeEntityFieldInputValue(field, raw) : raw;
  }
  let base = sanitizeEntityRelationDependencies(entity, draft, entities);
  if (setFieldActions.length > 0) {
    const merged = { ...record.values, ...base };
    const filled = applyAutomationSetFieldAutofill({
      entity,
      entities,
      values: merged,
      actions: setFieldActions,
      actorUserId,
      triggerRecordId: record.id,
    });
    base = mergeAutofillIntoFormValues(
      base,
      record.values,
      filled,
      setFieldActions,
    );
  }
  if (relatedFields.length === 0) return base;
  return seedRelatedAskValues({
    triggerEntity: entity,
    entities,
    relatedFields,
    triggerValues: { ...record.values, ...base },
    triggerRecordId: record.id,
    currentValues: base,
  });
}

export function TaskWorkspace({
  task,
  onOpenRecord,
  onComplete,
  onCompleted,
}: {
  task: AutomationTask;
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onComplete: (
    outcomeId: string,
    formValues?: Record<string, string>,
  ) => Promise<void>;
  onCompleted: () => void;
}) {
  const { entities } = useEntityConfig();
  const entity = entities.find((item) => item.id === task.entityId);
  const record = entity?.records.find((item) => item.id === task.recordId);

  return (
    <TaskWorkspaceBody
      key={`${task.id}:${record?.id ?? "pending"}`}
      task={task}
      entity={entity}
      record={record}
      entities={entities}
      onOpenRecord={onOpenRecord}
      onComplete={onComplete}
      onCompleted={onCompleted}
    />
  );
}

function TaskWorkspaceBody({
  task,
  entity,
  record,
  entities,
  onOpenRecord,
  onComplete,
  onCompleted,
}: {
  task: AutomationTask;
  entity: Entity | undefined;
  record: EntityRecord | undefined;
  entities: Entity[];
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onComplete: (
    outcomeId: string,
    formValues?: Record<string, string>,
  ) => Promise<void>;
  onCompleted: () => void;
}) {
  const sessionUser = useSessionUser();
  const valueContext = useEntityValueContext();
  const previewContext = getEntityPreviewValueContext(valueContext);

  const taskAsk = getAutomationTaskAskFields(task);
  const formUpfront = automationTaskShowsFormUpfront(task);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    () => getDefaultSelectedOutcomeId(task),
  );
  const selectedOutcome =
    task.config.outcomes.find((item) => item.id === selectedOutcomeId) ?? null;
  const autofillOutcomeId =
    selectedOutcomeId ??
    getDefaultSelectedOutcomeId(task) ??
    task.config.outcomes[0]?.id ??
    null;
  const setFieldActions = useMemo(() => {
    const outcome =
      task.config.outcomes.find((item) => item.id === autofillOutcomeId) ??
      null;
    return getOutcomeSetFieldActions(outcome);
  }, [autofillOutcomeId, task.config.outcomes]);
  const ask = selectedOutcome
    ? getAutomationOutcomeAskFields(selectedOutcome)
    : null;
  const createAskSlotsRaw = selectedOutcome
    ? getOutcomeCreateAskSlots(selectedOutcome, entities, {
        sourceEntity: entity,
        triggerRecordId: record?.id ?? task.recordId,
        triggerValues: record?.values ?? {},
        getRecordTitle: (parentEntity, parentRecordId) => {
          const parentRecord = parentEntity.records.find(
            (item) => item.id === parentRecordId,
          );
          if (!parentRecord) return "Запись";
          return getEntityRecordTitle(
            previewContext,
            parentEntity,
            parentRecord,
          );
        },
      })
    : [];
  const requiredIds = new Set(ask?.requiredFieldIds ?? []);

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!entity || !record) return {};
    const outcome =
      task.config.outcomes.find((item) => item.id === autofillOutcomeId) ??
      null;
    return buildTaskFormValues(
      entity,
      record,
      taskAsk.visibleFieldIds,
      entities,
      getOutcomeSetFieldActions(outcome),
      getCurrentUserRecordId(),
      taskAsk.relatedVisibleFields,
    );
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requireTime = automationRequiresTimeTracking(task.config.materials);
  const uploadTarget = getAutomationUploadTarget(task.config.materials);
  const uploadBlocksComplete = automationUploadTargetBlocksComplete(
    entity,
    record,
    uploadTarget,
  );

  const autosave = useTaskFormAutosave({
    enabled: Boolean(entity && record),
    entityId: task.entityId,
    recordId: task.recordId,
    processId: task.processId,
    entity,
    entities,
    outcomes: task.config.outcomes,
    values,
    recordValues: record?.values ?? {},
  });
  const autosaveLabel = taskFormAutosaveLabel(autosave.status);

  // Only the selected outcome — never the union of all outcomes (that leaked
  // later-step related / create asks onto early sequential tasks).
  const relatedFieldsForForm = ask?.relatedVisibleFields ?? [];
  const relatedRequiredForForm = ask?.relatedRequiredIds ?? [];

  const relatedLayout =
    entity && relatedFieldsForForm.length > 0
      ? resolveRelatedAskLayout({
          triggerEntity: entity,
          entities,
          relatedFields: relatedFieldsForForm,
          relatedRequiredIds: relatedRequiredForForm,
          triggerValues: { ...(record?.values ?? {}), ...values },
          triggerRecordId: record?.id ?? task.recordId,
          ctx: previewContext,
        })
      : { groups: [], emptyRelations: [] };

  const createAskSlots = filterCreateAskSlotsForDeptCalculationsView(
    createAskSlotsRaw,
    relatedLayout.groups,
  );

  const viewRelatedFieldsForForm = ask?.viewRelatedFields ?? [];
  const viewEntityFieldsForForm = ask?.viewEntityFields ?? [];
  const viewRelatedLayout =
    entity && viewRelatedFieldsForForm.length > 0
      ? resolveRelatedAskLayout({
          triggerEntity: entity,
          entities,
          relatedFields: viewRelatedFieldsForForm,
          relatedRequiredIds: [],
          triggerValues: { ...(record?.values ?? {}), ...values },
          triggerRecordId: record?.id ?? task.recordId,
          ctx: previewContext,
        })
      : { groups: [], emptyRelations: [] };
  const viewEntityLayout =
    entity && viewEntityFieldsForForm.length > 0
      ? resolveViewEntityFieldsLayout({
          triggerEntity: entity,
          entities,
          entityFields: viewEntityFieldsForForm,
          triggerValues: { ...(record?.values ?? {}), ...values },
          ctx: previewContext,
        })
      : { groups: [], empty: [] };

  function applyOutcomeAutofill(outcomeId: string) {
    if (!entity || !record) return;
    const outcome =
      task.config.outcomes.find((item) => item.id === outcomeId) ?? null;
    const actions = getOutcomeSetFieldActions(outcome);
    const relatedFields =
      outcome != null
        ? getAutomationOutcomeAskFields(outcome).relatedVisibleFields
        : [];
    if (actions.length === 0 && relatedFields.length === 0) return;
    const actorUserId = sessionUser?.id ?? getCurrentUserRecordId() ?? null;
    if (actions.length > 0) autosave.markDirty();
    setValues((current) => {
      let next = current;
      if (actions.length > 0) {
        const merged = { ...record.values, ...current };
        const filled = applyAutomationSetFieldAutofill({
          entity,
          entities,
          values: merged,
          actions,
          actorUserId,
          triggerRecordId: record.id,
        });
        next = mergeAutofillIntoFormValues(
          current,
          record.values,
          filled,
          actions,
        );
      }
      if (relatedFields.length === 0) return next;
      return seedRelatedAskValues({
        triggerEntity: entity,
        entities,
        relatedFields,
        triggerValues: { ...record.values, ...next },
        triggerRecordId: record.id,
        currentValues: next,
      });
    });
  }

  const mergedValues = useMemo(
    () => ({ ...(record?.values ?? {}), ...values }),
    [record?.values, values],
  );
  const formDraft = useMemo(
    () => createEntityDraftRecord(mergedValues, record?.id ?? task.recordId),
    [mergedValues, record?.id, task.recordId],
  );

  const fields =
    !entity || !ask
      ? []
      : ask.visibleFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null)
          .filter((field) =>
            isEntityFieldVisibleByConditions(
              previewContext,
              entity,
              formDraft,
              field,
            ),
          );

  const viewFields =
    !entity || !ask
      ? []
      : ask.viewFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null)
          .filter((field) =>
            isEntityFieldVisibleByConditions(
              previewContext,
              entity,
              formDraft,
              field,
            ),
          );

  const title = recordTitle(valueContext, entity, record);
  /** View tabs from any outcome — shown before a result is chosen. */
  const earlyViewTabIds = taskAsk.viewTabIds;
  const hasRelatedAsk =
    relatedLayout.groups.length > 0 || relatedLayout.emptyRelations.length > 0;
  const hasViewContext =
    viewFields.length > 0 ||
    viewRelatedLayout.groups.length > 0 ||
    viewRelatedLayout.emptyRelations.length > 0 ||
    viewEntityLayout.groups.length > 0 ||
    viewEntityLayout.empty.length > 0;
  const hasCreateAsk = createAskSlots.length > 0;
  const hasFillForm =
    ask != null &&
    (fields.length > 0 || hasViewContext || hasRelatedAsk || hasCreateAsk);
  const missingLocalRequiredCount = ask
    ? ask.requiredFieldIds.filter((fieldId) => {
        const field = entity?.fields.find((item) => item.id === fieldId);
        if (!field) return false;
        if (!entity || !record) return true;
        if (
          !isEntityFieldVisibleByConditions(
            previewContext,
            entity,
            formDraft,
            field,
          )
        ) {
          return false;
        }
        return !isTaskAskFieldFilled(field, values[fieldId] ?? "", {
          ctx: previewContext,
          entity,
          values: mergedValues,
          recordId: record.id,
          relationGroupsMode:
            ask.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full",
        });
      }).length
    : 0;
  const missingRelatedRequiredCount =
    entity && relatedFieldsForForm.length > 0
      ? countMissingRelatedRequired({
          triggerEntity: entity,
          entities,
          relatedFields: relatedFieldsForForm,
          relatedRequiredIds: relatedRequiredForForm,
          values: mergedValues,
          triggerRecordId: record?.id ?? task.recordId,
          ctx: previewContext,
          isFieldFilled: (field, value, relationGroupsMode) =>
            isTaskAskFieldFilled(field, value, {
              relationGroupsMode: relationGroupsMode ?? "full",
            }),
        })
      : 0;
  const missingRequiredCount =
    missingLocalRequiredCount + missingRelatedRequiredCount;

  function setValue(fieldId: string, value: string) {
    if (!entity) return;
    const actorUserId = sessionUser?.id ?? getCurrentUserRecordId() ?? null;
    autosave.markDirty();
    setValues((current) => {
      let base = applyEntityFieldValue(
        entity,
        current,
        fieldId,
        value,
        entities,
      );
      if (setFieldActions.length > 0) {
        const merged = { ...(record?.values ?? {}), ...base };
        const filled = applyAutomationSetFieldAutofill({
          entity,
          entities,
          values: merged,
          actions: setFieldActions,
          actorUserId,
          triggerRecordId: record?.id,
          changedFieldId: fieldId,
        });
        base = mergeAutofillIntoFormValues(
          base,
          record?.values ?? {},
          filled,
          setFieldActions,
        );
      }
      return syncRelatedAskValuesAfterLocalChange({
        triggerEntity: entity,
        entities,
        relatedFields: relatedFieldsForForm,
        changedFieldId: fieldId,
        values: base,
        triggerRecordId: record?.id ?? task.recordId,
      });
    });
  }

  function setRelatedValue(valueKey: string, value: string) {
    if (!entity || !record) {
      autosave.markDirty();
      setValues((current) => ({ ...current, [valueKey]: value }));
      return;
    }
    autosave.markDirty();
    setValues((current) =>
      applyRelatedAskFieldChange({
        groups: relatedLayout.groups,
        valueKey,
        value,
        formValues: current,
        triggerEntity: entity,
        triggerRecord: record,
        entities,
      }),
    );
  }

  function setCreateDraftValue(draftKey: string, value: string) {
    autosave.markDirty();
    setValues((current) => ({ ...current, [draftKey]: value }));
  }

  function replaceCreateDraftValues(next: Record<string, string>) {
    autosave.markDirty();
    setValues(next);
  }

  async function persistValues(outcomeId?: string) {
    if (!entity || !record) return;
    const outcomes = outcomeId
      ? task.config.outcomes.filter((item) => item.id === outcomeId)
      : task.config.outcomes;
    // Stage/list field is applied by complete RPC — writing it here while
    // this blocking task is still pending raises AUTOMATION_BLOCKED on itself.
    const patch = buildTaskFormPersistPatch({
      entity,
      outcomes,
      values,
      excludeFieldIds: [processTriggerFieldId(task.processId)],
    });
    if (patch) {
      // Partial patch — store merges into current values (keeps files tabs etc.).
      await updateEntityRecord(task.entityId, task.recordId, patch);
    }
    const related = buildTaskRelatedPersistUpdates({
      entity,
      entities,
      outcomes,
      values,
      triggerRecordId: record.id,
    });
    await persistRelatedAskUpdates(related, {
      entities,
      parentEntity: entity,
      parentRecord: {
        ...record,
        values: {
          ...record.values,
          ...Object.fromEntries(
            Object.entries(values).filter(([key]) => !key.includes(":")),
          ),
        },
      },
    });
  }

  function validateForOutcome(outcomeId: string) {
    if (!entity) return "Задача не загружена";
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return "Не выбран результат";

    const outcomeAsk = getAutomationOutcomeAskFields(outcome);
    const missing = outcome.fieldAccess.requiredFieldIds.filter((fieldId) => {
      const field = entity.fields.find((item) => item.id === fieldId);
      // Deleted fields are ignored (purged from config on entity field remove).
      if (!field) return false;
      if (!record) return true;
      if (
        !isEntityFieldVisibleByConditions(
          previewContext,
          entity,
          formDraft,
          field,
        )
      ) {
        return false;
      }
      return !isTaskAskFieldFilled(field, values[fieldId] ?? "", {
        ctx: previewContext,
        entity,
        values: mergedValues,
        recordId: record.id,
        relationGroupsMode:
          outcomeAsk.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full",
      });
    });
    if (missing.length > 0) {
      const labels = missing.map((fieldId) =>
        resolveEntityFieldLabel(entity.fields, fieldId),
      );
      return `Заполните: ${labels.join(", ")}`;
    }
    const relatedError = validateRelatedAskRequired({
      triggerEntity: entity,
      entities,
      fieldAccess: outcome.fieldAccess,
      values: mergedValues,
      triggerRecordId: record?.id ?? task.recordId,
      ctx: previewContext,
      isFieldFilled: (field, value, relationGroupsMode) =>
        isTaskAskFieldFilled(field, value, {
          relationGroupsMode: relationGroupsMode ?? "full",
        }),
    });
    if (relatedError) return relatedError;
    return validateCreateAskRequired({
      outcome,
      entities,
      values,
      sourceEntity: entity,
      triggerRecordId: record?.id ?? task.recordId,
      triggerValues: record?.values ?? values,
      getRecordTitle: (parentEntity, parentRecordId) => {
        const parentRecord = parentEntity.records.find(
          (item) => item.id === parentRecordId,
        );
        if (!parentRecord) return "Запись";
        return getEntityRecordTitle(previewContext, parentEntity, parentRecord);
      },
      ctx: previewContext,
      isFieldFilled: (field, value, relationGroupsMode) =>
        isTaskAskFieldFilled(field, value, {
          relationGroupsMode:
            relationGroupsMode === "items" || relationGroupsMode === "nested"
              ? relationGroupsMode
              : "full",
        }),
    });
  }

  async function run(outcomeId: string) {
    const validationError = validateForOutcome(outcomeId);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (uploadBlocksComplete) {
      setError("Прикрепите файлы в папку задания, чтобы завершить его.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Close a running timer so its duration is saved before complete.
      const timerUserId = sessionUser?.id ?? null;
      if (timerUserId) {
        const openSessionId = await fetchOpenAutomationTaskTimeSession(
          task.id,
          timerUserId,
        );
        if (openSessionId) {
          await stopAutomationTaskTimeSession(openSessionId);
        }
      }
      if (requireTime) {
        const sessions = await fetchAutomationTaskTimeSessions(task.id);
        const totalSeconds = sessions.reduce((sum, session) => {
          if (session.seconds > 0) return sum + session.seconds;
          if (!session.endedAt) return sum;
          const start = new Date(session.startedAt).getTime();
          const end = new Date(session.endedAt).getTime();
          if (!Number.isFinite(start) || !Number.isFinite(end)) return sum;
          return sum + Math.max(0, Math.floor((end - start) / 1000));
        }, 0);
        if (totalSeconds <= 0) {
          setError(
            "Чтобы завершить задание, добавьте время вручную или запустите и остановите таймер.",
          );
          return;
        }
      }
      await autosave.flush();
      await persistValues(outcomeId);
      await onComplete(outcomeId, values);
      await resumePendingRecordListChange(task.recordId);
      onCompleted();
    } catch (err: unknown) {
      setError(
        await resolveAutomationGateError(
          err,
          {
            taskId: task.id,
            recordId: task.recordId,
            triggerOptionId: task.triggerOptionId,
            stepOrder: task.stepOrder,
            taskName: task.name,
          },
          "Ошибка завершения",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleOutcomeClick(outcomeId: string) {
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return;
    setError(null);
    if (!automationOutcomeNeedsInput(outcome)) {
      void run(outcomeId);
      return;
    }
    setSelectedOutcomeId(outcomeId);
    applyOutcomeAutofill(outcomeId);
  }

  const assigneeName = resolveTaskAssigneeName(entities, task);
  const leadManagerName = resolveTaskLeadManagerName(entities, entity, record);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-lg font-semibold tracking-tight text-balance">
            {task.name}
          </h2>
          {task.isBlocking ? (
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Блокирует переход
            </span>
          ) : null}
        </div>
        {task.description.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{entity?.name ?? "Сущность"}</span>
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <span>Шаг {task.stepOrder}</span>
          {task.dueAt ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span>до {formatTimestampDisplay(task.dueAt)}</span>
            </>
          ) : null}
          {title && onOpenRecord ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="truncate font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => onOpenRecord(task.entityId, task.recordId)}
              >
                {title}
              </button>
            </>
          ) : title ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span className="truncate font-medium text-foreground">
                {title}
              </span>
            </>
          ) : null}
          {assigneeName ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span className="truncate" title={`Исполнитель: ${assigneeName}`}>
                Исполнитель:{" "}
                <span className="font-medium text-foreground">
                  {assigneeName}
                </span>
              </span>
            </>
          ) : null}
          {leadManagerName ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span className="truncate" title={`Менеджер: ${leadManagerName}`}>
                Менеджер:{" "}
                <span className="font-medium text-foreground">
                  {leadManagerName}
                </span>
              </span>
            </>
          ) : null}
        </div>
      </header>

      {requireTime ? (
        <TaskTimeSessionsPanel
          taskId={task.id}
          userId={sessionUser?.id}
          required
          disabled={busy}
          onError={(message) => setError(message)}
        />
      ) : null}

      {uploadTarget && entity && record ? (
        <TaskUploadPanel
          entity={entity}
          record={record}
          target={uploadTarget}
          disabled={busy}
          onError={(message) => setError(message)}
        />
      ) : null}

      {!entity || !record ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Запись ещё не загружена. Обновите страницу.
        </p>
      ) : earlyViewTabIds.length > 0 || hasFillForm ? (
        <TaskViewTabsPreview
          entity={entity}
          record={{ ...record, values: mergedValues }}
          tabIds={earlyViewTabIds}
          filesTabEntryIds={taskAsk.viewFilesTabEntryIds}
          filesTabAllowMove={taskAsk.viewFilesTabAllowMove}
          fillBadge={
            hasFillForm && missingRequiredCount > 0 ? (
              <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive tabular-nums">
                {missingRequiredCount}
              </span>
            ) : null
          }
          fillSlot={
            hasFillForm ? (
              <div className="flex flex-col gap-4">
                {autosaveLabel || autosave.error ? (
                  <p
                    className={cn(
                      "text-[11px]",
                      autosave.status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {autosave.error ?? autosaveLabel}
                  </p>
                ) : null}
                {hasViewContext ? (
                  <TaskViewContextFields
                    triggerViewFields={viewFields.map((field) => ({
                      id: field.id,
                      label: getEntityFieldDisplayName(field),
                      node: (
                        <RecordValue
                          ctx={previewContext}
                          entity={entity}
                          record={{ ...record, values: mergedValues }}
                          field={field}
                          className="text-sm text-foreground"
                        />
                      ),
                    }))}
                    relatedGroups={viewRelatedLayout.groups}
                    relatedEmpty={viewRelatedLayout.emptyRelations}
                    entityGroups={viewEntityLayout.groups}
                    entityEmpty={viewEntityLayout.empty}
                    ctx={previewContext}
                  />
                ) : null}

                {fields.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {hasViewContext ? (
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Заполнить
                      </p>
                    ) : null}
                    {fields.map((field) => {
                      const parentField = getEntityListParentField(
                        entity,
                        field,
                      );
                      const parentValue = parentField
                        ? (values[parentField.id] ??
                          record.values[parentField.id])
                        : undefined;
                      const listOptions =
                        field.type === "list"
                          ? getVisibleListOptions(
                              field,
                              parentValue,
                              parentField,
                              entities,
                            )
                          : field.listOptions;
                      const listPresentation =
                        resolveEntityListFieldPresentation(field, entities);
                      const listDisabled =
                        field.type === "list" &&
                        parentField != null &&
                        parseEntityListValueIds(parentValue).length === 0;
                      const required = requiredIds.has(field.id);

                      return (
                        <div key={field.id}>
                          <RecordFieldControl
                            ctx={previewContext}
                            entity={entity}
                            field={field}
                            value={values[field.id] ?? ""}
                            values={mergedValues}
                            onChange={(value) => setValue(field.id, value)}
                            listOptions={listOptions}
                            listDisabled={listDisabled}
                            listDisabledHint={
                              parentField
                                ? `Сначала выберите «${getEntityFieldDisplayName(parentField)}»`
                                : undefined
                            }
                            listMultiple={listPresentation.listMultiple}
                            showColors={listPresentation.listUseColors}
                            listAllowEmpty={!required}
                            entities={entities}
                            recordId={record.id}
                            required={required}
                            relationGroupsMode={
                              ask?.fieldAskOptions[field.id]
                                ?.relationGroupsMode ?? "full"
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {hasRelatedAsk ? (
                  <TaskRelatedAskFields
                    groups={relatedLayout.groups}
                    emptyRelations={relatedLayout.emptyRelations}
                    values={values}
                    entities={entities}
                    ctx={previewContext}
                    disabled={busy}
                    onChange={setRelatedValue}
                    softFillParent={
                      entity && record
                        ? {
                            entity,
                            record: buildTkpGipSoftFillParentRecord(
                              record,
                              values,
                            ),
                          }
                        : null
                    }
                  />
                ) : null}

                {hasCreateAsk ? (
                  <TaskCreateRecordAsk
                    slots={createAskSlots}
                    values={values}
                    entities={entities}
                    ctx={previewContext}
                    disabled={busy}
                    softFillParent={
                      entity && record
                        ? {
                            entity,
                            record: buildTkpGipSoftFillParentRecord(
                              record,
                              values,
                            ),
                          }
                        : null
                    }
                    onChange={setCreateDraftValue}
                    onValuesChange={replaceCreateDraftValues}
                  />
                ) : null}
              </div>
            ) : undefined
          }
        />
      ) : null}

      {error ? (
        <p className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <footer className="flex flex-col gap-3 border-t border-border/70 pt-4">
        <div className="flex flex-wrap gap-2">
          {selectedOutcome ? (
            <>
              <Button
                type="button"
                disabled={busy || !record || uploadBlocksComplete}
                className={cn(selectedOutcome.color && "hover:opacity-90")}
                style={automationOutcomeButtonStyle(selectedOutcome.color)}
                onClick={() => void run(selectedOutcome.id)}
              >
                {selectedOutcome.label}
              </Button>
              {!formUpfront ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSelectedOutcomeId(null);
                    setError(null);
                  }}
                >
                  Назад
                </Button>
              ) : null}
            </>
          ) : (
            task.config.outcomes.map((outcome) => (
              <Button
                key={outcome.id}
                type="button"
                disabled={
                  busy ||
                  !record ||
                  (uploadBlocksComplete &&
                    !automationOutcomeNeedsInput(outcome))
                }
                className={cn(outcome.color && "hover:opacity-90")}
                style={automationOutcomeButtonStyle(outcome.color)}
                onClick={() => handleOutcomeClick(outcome.id)}
              >
                {outcome.label}
              </Button>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
