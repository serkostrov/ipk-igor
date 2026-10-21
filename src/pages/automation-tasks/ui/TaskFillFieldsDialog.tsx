import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  automationOutcomeButtonStyle,
  completeAutomationTask,
  fetchAutomationTask,
  getAutomationUploadTarget,
  resolveAutomationGateError,
  type AutomationOutcome,
  type AutomationTask,
} from "@/entities/automation";
import { cn } from "@/shared/lib/cn";
import {
  applyEntityFieldValue,
  createEntityDraftRecord,
  formatRecordFieldValue,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getVisibleListOptions,
  isEntityComputedFieldType,
  isEntityRelationGroupsFilled,
  normalizeEntityFieldInputValue,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  RecordValue,
  resolveEntityListFieldPresentation,
  sanitizeEntityRelationDependencies,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRelationGroupsMode,
  type EntityValueContext,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  automationOutcomeNeedsInput,
  automationTaskShowsFormUpfront,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  getDefaultSelectedOutcomeId,
  resumePendingRecordListChange,
  type AutomationAskFields,
} from "@/features/automation-tasks";
import {
  applyAutomationSetFieldAutofill,
  getOutcomeSetFieldActions,
  mergeAutofillIntoFormValues,
} from "@/features/automation-tasks/lib/apply-outcome-autofill";
import {
  buildTaskFormPersistPatch,
  buildTaskRelatedPersistUpdates,
  processTriggerFieldId,
} from "@/features/automation-tasks/lib/task-form-persist";
import {
  countMissingRelatedRequired,
  persistRelatedAskUpdates,
  resolveRelatedAskLayout,
  seedRelatedAskValues,
  syncRelatedAskValuesAfterLocalChange,
  validateRelatedAskRequired,
} from "@/features/automation-tasks/lib/task-related-ask";
import {
  taskFormAutosaveLabel,
  useTaskFormAutosave,
} from "@/features/automation-tasks/lib/use-task-form-autosave";
import { TaskRelatedAskFields } from "@/features/automation-tasks/ui/TaskRelatedAskFields";
import { TaskViewTabsPreview } from "@/features/automation-tasks/ui/TaskViewTabsPreview";
import { automationUploadTargetBlocksComplete } from "@/features/automation-tasks/lib/upload-to-files-tab";
import { TaskUploadPanel } from "@/features/automation-tasks/ui/TaskUploadPanel";
import { getAutomationErrorMessage } from "@/shared/lib/error-message";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";

type TaskFillFieldsDialogProps = {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (task: AutomationTask) => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
};

function isFieldFilled(
  field: EntityField,
  value: string,
  options?: {
    ctx: EntityValueContext;
    entity: Entity;
    values: Record<string, string>;
    recordId: string;
    relationGroupsMode?: EntityRelationGroupsMode;
  },
) {
  if (field.type === "boolean") return true;
  if (field.type === "file") return parseEntityFieldFileValue(value) != null;
  if (field.type === "relationGroups") {
    return isEntityRelationGroupsFilled(
      value,
      options?.relationGroupsMode ?? "full",
    );
  }
  if (isEntityComputedFieldType(field.type) && options) {
    const text = formatRecordFieldValue(
      options.ctx,
      options.entity,
      createEntityDraftRecord(options.values, options.recordId),
      field,
    );
    return text !== "—" && text.trim().length > 0;
  }
  return value.trim().length > 0;
}

function TaskFillFieldsDialogBody({
  taskId,
  onOpenChange,
  onCompleted,
  onOpenRecord,
}: {
  taskId: string;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (task: AutomationTask) => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const previewContext = getEntityPreviewValueContext(valueContext);

  const [task, setTask] = useState<AutomationTask | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Init form only when the task opens — not when `entities` updates.
  // Upload writes files to the record and refreshes the store; that must not
  // wipe in-progress field values the user has not submitted yet.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchAutomationTask(taskId);
        if (cancelled) return;
        setTask(next);
        if (!next) {
          setSelectedOutcomeId(null);
          setError("Задача не найдена");
          return;
        }
        const defaultOutcomeId = getDefaultSelectedOutcomeId(next);
        setSelectedOutcomeId(defaultOutcomeId);
        const entitiesNow = getEntityConfig().entities;
        const entity = entitiesNow.find((item) => item.id === next.entityId);
        const record = entity?.records.find(
          (item) => item.id === next.recordId,
        );
        const ask = getAutomationTaskAskFields(next);
        const draft: Record<string, string> = {};
        for (const fieldId of ask.visibleFieldIds) {
          const field = entity?.fields.find((item) => item.id === fieldId);
          const raw = record?.values[fieldId] ?? "";
          draft[fieldId] = field
            ? normalizeEntityFieldInputValue(field, raw)
            : raw;
        }
        let nextValues = entity
          ? sanitizeEntityRelationDependencies(entity, draft, entitiesNow)
          : draft;
        if (entity && record) {
          const outcome =
            next.config.outcomes.find((item) => item.id === defaultOutcomeId) ??
            next.config.outcomes[0] ??
            null;
          const actions = getOutcomeSetFieldActions(outcome);
          if (actions.length > 0) {
            const filled = applyAutomationSetFieldAutofill({
              entity,
              entities: entitiesNow,
              values: { ...record.values, ...nextValues },
              actions,
              actorUserId: getCurrentUserRecordId(),
              triggerRecordId: record.id,
            });
            nextValues = mergeAutofillIntoFormValues(
              nextValues,
              record.values,
              filled,
              actions,
            );
          }
          if (ask.relatedVisibleFields.length > 0) {
            nextValues = seedRelatedAskValues({
              triggerEntity: entity,
              entities: entitiesNow,
              relatedFields: ask.relatedVisibleFields,
              triggerValues: { ...record.values, ...nextValues },
              currentValues: nextValues,
            });
          }
        }
        setValues(nextValues);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Не удалось загрузить задачу",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const entity = entities.find((item) => item.id === task?.entityId) ?? null;
  const record =
    entity?.records.find((item) => item.id === task?.recordId) ?? null;
  const formUpfront = task != null && automationTaskShowsFormUpfront(task);
  const selectedOutcome: AutomationOutcome | null =
    task?.config.outcomes.find((item) => item.id === selectedOutcomeId) ?? null;
  const autofillOutcomeId =
    selectedOutcomeId ??
    (task ? getDefaultSelectedOutcomeId(task) : null) ??
    task?.config.outcomes[0]?.id ??
    null;
  const setFieldActions = useMemo(() => {
    const outcome =
      task?.config.outcomes.find((item) => item.id === autofillOutcomeId) ??
      null;
    return getOutcomeSetFieldActions(outcome);
  }, [autofillOutcomeId, task?.config.outcomes]);
  const ask: AutomationAskFields | null = selectedOutcome
    ? getAutomationOutcomeAskFields(selectedOutcome)
    : null;
  const requiredIds = new Set(ask?.requiredFieldIds ?? []);
  const fields =
    !entity || !ask
      ? []
      : ask.visibleFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null);
  const viewFields =
    !entity || !ask
      ? []
      : ask.viewFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null);

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
          ctx: previewContext,
        })
      : { groups: [], emptyRelations: [] };
  const hasRelatedAsk =
    relatedLayout.groups.length > 0 || relatedLayout.emptyRelations.length > 0;

  const mergedValues = { ...(record?.values ?? {}), ...values };

  const missingLocalRequiredCount = ask
    ? ask.requiredFieldIds.filter((fieldId) => {
        const field = entity?.fields.find((item) => item.id === fieldId);
        if (!field || !entity || !record) return true;
        return !isFieldFilled(field, values[fieldId] ?? "", {
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
          isFieldFilled: (field, value) => isFieldFilled(field, value),
        })
      : 0;
  const missingRequiredCount =
    missingLocalRequiredCount + missingRelatedRequiredCount;

  const uploadTarget = task
    ? getAutomationUploadTarget(task.config.materials)
    : null;
  const uploadBlocksComplete = automationUploadTargetBlocksComplete(
    entity ?? undefined,
    record ?? undefined,
    uploadTarget,
  );

  const hasOutcomeForm =
    ask != null &&
    (fields.length > 0 ||
      viewFields.length > 0 ||
      ask.viewTabIds.length > 0 ||
      hasRelatedAsk);

  const autosave = useTaskFormAutosave({
    enabled: Boolean(task && entity && record),
    entityId: task?.entityId ?? "",
    recordId: task?.recordId ?? "",
    processId: task?.processId ?? "",
    entity,
    entities,
    outcomes: task?.config.outcomes ?? [],
    values,
    recordValues: record?.values ?? {},
  });
  const autosaveLabel = taskFormAutosaveLabel(autosave.status);

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
      });
    });
  }

  function setRelatedValue(valueKey: string, value: string) {
    autosave.markDirty();
    setValues((current) => ({ ...current, [valueKey]: value }));
  }

  /**
   * Persist form values that should land on the record before complete/return.
   * Includes «запись» and required fields so setField / spawn see them.
   * Sends a partial patch so files-tab moves and other keys stay intact.
   */
  async function persistValues(outcomeId?: string) {
    if (!task || !entity || !record) return;
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
    });
    await persistRelatedAskUpdates(related);
  }

  function validateForOutcome(outcomeId: string) {
    if (!task || !entity) return "Задача не загружена";
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return "Не выбран результат";

    const outcomeAsk = getAutomationOutcomeAskFields(outcome);
    const missing = outcome.fieldAccess.requiredFieldIds.filter((fieldId) => {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field || !record) return true;
      return !isFieldFilled(field, values[fieldId] ?? "", {
        ctx: previewContext,
        entity,
        values: mergedValues,
        recordId: record.id,
        relationGroupsMode:
          outcomeAsk.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full",
      });
    });
    if (missing.length > 0) {
      const labels = missing.map((fieldId) => {
        const field = entity.fields.find((item) => item.id === fieldId);
        return field ? getEntityFieldDisplayName(field) : fieldId;
      });
      return `Заполните обязательные поля: ${labels.join(", ")}`;
    }
    return validateRelatedAskRequired({
      triggerEntity: entity,
      entities,
      fieldAccess: outcome.fieldAccess,
      values: mergedValues,
      isFieldFilled: (field, value) => isFieldFilled(field, value),
    });
  }

  async function handleComplete(outcomeId: string) {
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
      await autosave.flush();
      await persistValues(outcomeId);
      const completed = task!;
      await completeAutomationTask(
        completed.id,
        outcomeId,
        sessionUser?.id ?? null,
        values,
      );
      await resumePendingRecordListChange(completed.recordId);
      onOpenChange(false);
      onCompleted?.(completed);
    } catch (err: unknown) {
      const completed = task;
      setError(
        completed
          ? await resolveAutomationGateError(
              err,
              {
                taskId: completed.id,
                recordId: completed.recordId,
                triggerOptionId: completed.triggerOptionId,
                stepOrder: completed.stepOrder,
                taskName: completed.name,
              },
              "Ошибка завершения",
            )
          : getAutomationErrorMessage(err, "Ошибка завершения"),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleOutcomeClick(outcome: AutomationOutcome) {
    setError(null);
    if (!automationOutcomeNeedsInput(outcome)) {
      void handleComplete(outcome.id);
      return;
    }
    setSelectedOutcomeId(outcome.id);
    if (!entity || !record) return;
    const actions = getOutcomeSetFieldActions(outcome);
    const relatedFields =
      getAutomationOutcomeAskFields(outcome).relatedVisibleFields;
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
        currentValues: next,
      });
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">
          {task?.name ?? "Задача автоматизации"}
        </DialogTitle>
        <DialogDescription>
          {formUpfront && selectedOutcome
            ? hasOutcomeForm
              ? "Заполните поля и подтвердите выполнение."
              : `Нажмите «${selectedOutcome.label}», чтобы завершить.`
            : selectedOutcome
              ? `Заполните поля для результата «${selectedOutcome.label}».`
              : entity
                ? `Выберите результат, чтобы продолжить процесс «${entity.name}».`
                : "Выберите результат и при необходимости заполните поля."}
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
        </div>
      ) : !task || !entity || !record ? (
        <p className="text-sm text-muted-foreground">
          {error ??
            "Запись ещё не загружена. Обновите страницу или откройте карточку."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {!selectedOutcome ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              Нажмите кнопку результата — поля формы появятся, если они заданы
              для этого варианта.
            </p>
          ) : hasOutcomeForm ? (
            <TaskViewTabsPreview
              entity={entity}
              record={{ ...record, values: { ...record.values, ...values } }}
              tabIds={ask?.viewTabIds ?? []}
              filesTabEntryIds={ask?.viewFilesTabEntryIds}
              filesTabAllowMove={ask?.viewFilesTabAllowMove === true}
              fillBadge={
                missingRequiredCount > 0 ? (
                  <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive tabular-nums">
                    {missingRequiredCount}
                  </span>
                ) : null
              }
              fillSlot={
                fields.length > 0 || viewFields.length > 0 || hasRelatedAsk ? (
                  <div className="flex flex-col gap-4">
                    {autosaveLabel || autosave.error ? (
                      <p
                        className={
                          autosave.status === "error"
                            ? "text-[11px] text-destructive"
                            : "text-[11px] text-muted-foreground"
                        }
                      >
                        {autosave.error ?? autosaveLabel}
                      </p>
                    ) : null}
                    {viewFields.length > 0 ? (
                      <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          Для просмотра
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {viewFields.map((field) => (
                            <div
                              key={field.id}
                              className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
                            >
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {getEntityFieldDisplayName(field)}
                              </span>
                              <RecordValue
                                ctx={previewContext}
                                entity={entity}
                                record={{
                                  ...record,
                                  values: { ...record.values, ...values },
                                }}
                                field={field}
                                className="text-sm text-foreground"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {fields.length > 0 ? (
                      <div className="flex flex-col gap-3">
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
                                values={{ ...record.values, ...values }}
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
                      />
                    ) : null}
                  </div>
                ) : undefined
              }
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

          {error ? (
            <p className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <DialogFooter className="flex-col gap-2 sm:flex-col">
        {selectedOutcome ? (
          <div className="flex w-full flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                busy || loading || !task || !record || uploadBlocksComplete
              }
              className={cn(selectedOutcome.color && "hover:opacity-90")}
              style={automationOutcomeButtonStyle(selectedOutcome.color)}
              onClick={() => void handleComplete(selectedOutcome.id)}
            >
              {selectedOutcome.label}
            </Button>
            {!formUpfront ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy || loading}
                onClick={() => {
                  setSelectedOutcomeId(null);
                  setError(null);
                }}
              >
                Назад
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full flex-wrap gap-2">
            {(task?.config.outcomes ?? []).map((outcome) => (
              <Button
                key={outcome.id}
                type="button"
                disabled={
                  busy ||
                  loading ||
                  !task ||
                  !record ||
                  (uploadBlocksComplete &&
                    !automationOutcomeNeedsInput(outcome))
                }
                className={cn(outcome.color && "hover:opacity-90")}
                style={automationOutcomeButtonStyle(outcome.color)}
                onClick={() => handleOutcomeClick(outcome)}
              >
                {outcome.label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex w-full flex-wrap gap-2">
          {task && onOpenRecord ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => onOpenRecord(task.entityId, task.recordId)}
            >
              Открыть карточку
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Позже
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function TaskFillFieldsDialog({
  taskId,
  open,
  onOpenChange,
  onCompleted,
  onOpenRecord,
}: TaskFillFieldsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full min-w-[min(100%,28rem)] max-w-[min(92vw,32rem)] gap-5 overflow-y-auto sm:max-w-[min(92vw,32rem)]">
        {open && taskId ? (
          <TaskFillFieldsDialogBody
            key={taskId}
            taskId={taskId}
            onOpenChange={onOpenChange}
            onCompleted={onCompleted}
            onOpenRecord={onOpenRecord}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
