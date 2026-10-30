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
  completePendingSilentAutomationTasks,
  completePendingSilentAutomationTasksForRecord,
  fetchAutomationTask,
  getAutomationUploadTarget,
  isAutomationSilentTaskKind,
  resolveAutomationGateError,
  resolveViewEntityFieldsLayout,
  type AutomationOutcome,
  type AutomationTask,
} from "@/entities/automation";
import { cn } from "@/shared/lib/cn";
import {
  applyEntityFieldValue,
  buildTkpGipSoftFillParentRecord,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityFieldDisplayName,
  resolveEntityFieldLabel,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getEntityRecordTitle,
  getVisibleListOptions,
  normalizeEntityFieldInputValue,
  parseEntityListValueIds,
  RecordValue,
  resolveEntityListFieldPresentation,
  sanitizeEntityRelationDependencies,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type EntityField,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  automationOutcomeNeedsInput,
  automationTaskShowsFormUpfront,
  automationTaskShowsViewBeforeOutcomes,
  automationTemplateHasFillFields,
  automationTemplateHasViewContext,
  filterCreateAskSlotsForDeptCalculationsView,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  getAutomationTemplateAskFields,
  getDefaultSelectedOutcomeId,
  getOutcomeCreateAskSlots,
  resumePendingRecordListChange,
  TaskCreateRecordAsk,
  validateCreateAskRequired,
  type AutomationAskFields,
} from "@/features/automation-tasks";
import {
  applyAutomationSetFieldAutofill,
  getOutcomeSetFieldActions,
  mergeAutofillIntoFormValues,
} from "@/features/automation-tasks/lib/apply-outcome-autofill";
import { isTaskAskFieldFilled } from "@/features/automation-tasks/lib/task-field-filled";
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
import { applyRelatedAskFieldChange } from "@/features/automation-tasks/lib/apply-related-ask-field-change";
import { TaskRelatedAskFields } from "@/features/automation-tasks/ui/TaskRelatedAskFields";
import { TaskViewContextFields } from "@/features/automation-tasks/ui/TaskViewContextFields";
import { TaskViewTabsPreview } from "@/features/automation-tasks/ui/TaskViewTabsPreview";
import { automationUploadTargetBlocksComplete } from "@/features/automation-tasks/lib/upload-to-files-tab";
import { TaskUploadPanel } from "@/features/automation-tasks/ui/TaskUploadPanel";
import { getAutomationErrorMessage } from "@/shared/lib/error-message";
import { maybeEnsureDeptCalculationGipForTask } from "@/features/hardcode/tkp-gip/gip-filling-phase";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";

type TaskFillFieldsDialogProps = {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (task: AutomationTask) => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
};

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
        if (!next) {
          setTask(null);
          setSelectedOutcomeId(null);
          setError("Задача не найдена");
          return;
        }
        if (isAutomationSilentTaskKind(next.config.kind)) {
          await completePendingSilentAutomationTasks(
            [next],
            sessionUser?.id ?? null,
          );
          if (cancelled) return;
          onOpenChange(false);
          onCompleted?.(next);
          return;
        }
        // Autofill createRecord on earlier silent steps must finish first —
        // otherwise related-ask resolves empty («Нет связанных записей»).
        // Soft-fail: still open the interactive form (Host shows one toast).
        try {
          await completePendingSilentAutomationTasksForRecord(
            next.recordId,
            sessionUser?.id ?? null,
          );
        } catch (silentError: unknown) {
          console.error(
            "[automation] silent prep before fill dialog failed",
            silentError,
          );
        }
        if (cancelled) return;
        setTask(next);
        const defaultOutcomeId = getDefaultSelectedOutcomeId(next);
        setSelectedOutcomeId(defaultOutcomeId);
        const entitiesNow = getEntityConfig().entities;
        const entity = entitiesNow.find((item) => item.id === next.entityId);
        const record = entity?.records.find(
          (item) => item.id === next.recordId,
        );
        // Deferred ГИП rows for «На заполнении ГИПа» assignment.
        if (entity && record && next.triggerOptionId.trim()) {
          try {
            await maybeEnsureDeptCalculationGipForTask({
              hostEntity: entity,
              hostRecord: record,
              triggerOptionId: next.triggerOptionId,
              entities: entitiesNow,
            });
          } catch (ensureError: unknown) {
            console.error(
              "[tkp-gip] ensure on fill dialog open failed",
              ensureError,
            );
          }
          if (cancelled) return;
        }
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
              triggerRecordId: record.id,
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
    // Init once per task open — not when session/callbacks identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taskId only
  }, [taskId]);

  const entity = entities.find((item) => item.id === task?.entityId) ?? null;
  const record =
    entity?.records.find((item) => item.id === task?.recordId) ?? null;
  const formUpfront = task != null && automationTaskShowsFormUpfront(task);
  const showViewBefore =
    task != null && automationTaskShowsViewBeforeOutcomes(task);
  const taskAsk = task ? getAutomationTaskAskFields(task) : null;
  const templateAsk = task ? getAutomationTemplateAskFields(task) : null;
  const hasTemplateFill = task != null && automationTemplateHasFillFields(task);
  const hasTemplateView =
    task != null && automationTemplateHasViewContext(task);
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
  const createAskSlotsRaw = selectedOutcome
    ? getOutcomeCreateAskSlots(selectedOutcome, entities, {
        sourceEntity: entity,
        triggerRecordId: record?.id ?? task?.recordId,
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
  const requiredIds = new Set([
    ...(templateAsk?.requiredFieldIds ?? []),
    ...(ask?.requiredFieldIds ?? []),
  ]);
  const formVisibleFieldIds = (() => {
    const ids = [...(templateAsk?.visibleFieldIds ?? [])];
    if ((selectedOutcome || formUpfront) && ask) {
      for (const id of ask.visibleFieldIds) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  })();
  const fields = !entity
    ? []
    : formVisibleFieldIds
        .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
        .filter((field): field is EntityField => field != null);
  const formViewFieldIds = (() => {
    const ids = [...(templateAsk?.viewFieldIds ?? [])];
    if ((selectedOutcome || formUpfront || showViewBefore) && ask) {
      for (const id of ask.viewFieldIds) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  })();
  const viewFields = !entity
    ? []
    : formViewFieldIds
        .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
        .filter((field): field is EntityField => field != null);

  const relatedFieldsForForm = [
    ...(templateAsk?.relatedVisibleFields ?? []),
    ...(ask?.relatedVisibleFields ?? []),
  ];
  const relatedRequiredForForm = [
    ...(templateAsk?.relatedRequiredIds ?? []),
    ...(ask?.relatedRequiredIds ?? []),
  ];
  const viewRelatedFieldsForFormMerged = [
    ...(templateAsk?.viewRelatedFields ?? []),
    ...((selectedOutcome || formUpfront || showViewBefore) && ask
      ? ask.viewRelatedFields
      : []),
  ];
  const viewEntityFieldsForFormMerged = [
    ...(templateAsk?.viewEntityFields ?? []),
    ...((selectedOutcome || formUpfront || showViewBefore) && ask
      ? ask.viewEntityFields
      : []),
  ];
  const relatedLayout =
    entity && relatedFieldsForForm.length > 0
      ? resolveRelatedAskLayout({
          triggerEntity: entity,
          entities,
          relatedFields: relatedFieldsForForm,
          relatedRequiredIds: relatedRequiredForForm,
          triggerValues: { ...(record?.values ?? {}), ...values },
          triggerRecordId: record?.id ?? task?.recordId ?? "",
          ctx: previewContext,
        })
      : { groups: [], emptyRelations: [] };
  const createAskSlots = filterCreateAskSlotsForDeptCalculationsView(
    createAskSlotsRaw,
    relatedLayout.groups,
  );
  const hasRelatedAsk =
    relatedLayout.groups.length > 0 || relatedLayout.emptyRelations.length > 0;

  const viewRelatedLayout =
    entity && viewRelatedFieldsForFormMerged.length > 0
      ? resolveRelatedAskLayout({
          triggerEntity: entity,
          entities,
          relatedFields: viewRelatedFieldsForFormMerged,
          relatedRequiredIds: [],
          triggerValues: { ...(record?.values ?? {}), ...values },
          triggerRecordId: record?.id ?? task?.recordId ?? "",
          ctx: previewContext,
        })
      : { groups: [], emptyRelations: [] };
  const viewEntityLayout =
    entity && viewEntityFieldsForFormMerged.length > 0
      ? resolveViewEntityFieldsLayout({
          triggerEntity: entity,
          entities,
          entityFields: viewEntityFieldsForFormMerged,
          triggerValues: { ...(record?.values ?? {}), ...values },
          ctx: previewContext,
        })
      : { groups: [], empty: [] };
  const hasViewContext =
    viewFields.length > 0 ||
    viewRelatedLayout.groups.length > 0 ||
    viewRelatedLayout.emptyRelations.length > 0 ||
    viewEntityLayout.groups.length > 0 ||
    viewEntityLayout.empty.length > 0;

  const mergedValues = { ...(record?.values ?? {}), ...values };

  const missingLocalRequiredCount = [...requiredIds].filter((fieldId) => {
    const field = entity?.fields.find((item) => item.id === fieldId);
    if (!field) return false;
    if (!entity || !record) return true;
    return !isTaskAskFieldFilled(field, values[fieldId] ?? "", {
      ctx: previewContext,
      entity,
      values: mergedValues,
      recordId: record.id,
      relationGroupsMode:
        ask?.fieldAskOptions[fieldId]?.relationGroupsMode ??
        templateAsk?.fieldAskOptions[fieldId]?.relationGroupsMode ??
        "full",
    });
  }).length;
  const missingRelatedRequiredCount =
    entity && relatedFieldsForForm.length > 0
      ? countMissingRelatedRequired({
          triggerEntity: entity,
          entities,
          relatedFields: relatedFieldsForForm,
          relatedRequiredIds: relatedRequiredForForm,
          values: mergedValues,
          triggerRecordId: record?.id ?? task?.recordId ?? "",
          isFieldFilled: (field, value, relationGroupsMode) =>
            isTaskAskFieldFilled(field, value, {
              relationGroupsMode: relationGroupsMode ?? "full",
            }),
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

  const hasCreateAsk = createAskSlots.length > 0;
  const hasEditableFill =
    fields.length > 0 || hasRelatedAsk || hasCreateAsk || hasTemplateFill;
  const hasEarlyView =
    (showViewBefore && hasViewContext) || (hasTemplateView && !formUpfront);
  const hasEarlyFill = hasTemplateFill && !formUpfront;
  const earlyViewTabIds = taskAsk?.viewTabIds ?? [];
  const hasOutcomeForm =
    hasEditableFill ||
    hasEarlyFill ||
    (!showViewBefore &&
      ask != null &&
      (hasViewContext || (ask.viewTabIds.length ?? 0) > 0)) ||
    hasEarlyView ||
    earlyViewTabIds.length > 0;

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
        triggerRecordId: record?.id ?? task?.recordId ?? "",
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

  /** Sync from live fan-out siblings — must not trigger another autosave. */
  function seedRelatedValue(valueKey: string, value: string) {
    if (!entity || !record) {
      setValues((current) =>
        (current[valueKey] ?? "") === value
          ? current
          : { ...current, [valueKey]: value },
      );
      return;
    }
    setValues((current) => {
      if ((current[valueKey] ?? "") === value) return current;
      return applyRelatedAskFieldChange({
        groups: relatedLayout.groups,
        valueKey,
        value,
        formValues: current,
        triggerEntity: entity,
        triggerRecord: record,
        entities,
      });
    });
  }

  function setCreateDraftValue(draftKey: string, value: string) {
    autosave.markDirty();
    setValues((current) => ({ ...current, [draftKey]: value }));
  }

  function replaceCreateDraftValues(next: Record<string, string>) {
    autosave.markDirty();
    setValues(next);
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
      templateFieldAccess: task.config.fieldAccess,
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
      parentRecord: buildTkpGipSoftFillParentRecord(record, values),
    });
  }

  function validateForOutcome(outcomeId: string) {
    if (!task || !entity) return "Задача не загружена";
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return "Не выбран результат";

    const outcomeAsk = getAutomationOutcomeAskFields(outcome);
    const missing = outcome.fieldAccess.requiredFieldIds.filter((fieldId) => {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field) return false;
      if (!record) return true;
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
      return `Заполните обязательные поля: ${labels.join(", ")}`;
    }
    const relatedError = validateRelatedAskRequired({
      triggerEntity: entity,
      entities,
      fieldAccess: outcome.fieldAccess,
      values: mergedValues,
      triggerRecordId: record?.id ?? task.recordId,
      assigneeUserId: task.assigneeUserId,
      leadParent:
        entity && record
          ? {
              entity,
              record: buildTkpGipSoftFillParentRecord(record, values),
            }
          : null,
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
      isFieldFilled: (field, value, relationGroupsMode) =>
        isTaskAskFieldFilled(field, value, {
          relationGroupsMode:
            relationGroupsMode === "items" || relationGroupsMode === "nested"
              ? relationGroupsMode
              : "full",
        }),
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

  function outcomeNeedsInput(outcome: AutomationOutcome) {
    return automationOutcomeNeedsInput(outcome);
  }

  function handleOutcomeClick(outcome: AutomationOutcome) {
    setError(null);
    if (!outcomeNeedsInput(outcome)) {
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
        triggerRecordId: record.id,
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
            ? hasEditableFill
              ? "Заполните поля и подтвердите результат."
              : `Нажмите «${selectedOutcome.label}», чтобы завершить.`
            : selectedOutcome
              ? hasEditableFill
                ? `Заполните поля для результата «${selectedOutcome.label}».`
                : `Подтвердите результат «${selectedOutcome.label}».`
              : hasEarlyView
                ? "Просмотрите данные и выберите результат."
                : entity
                  ? `Выберите результат для процесса «${entity.name}».`
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
          {!selectedOutcome && !hasEarlyView && earlyViewTabIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              Просмотрите данные и выберите результат. Поля для заполнения
              откроются, если они заданы для кнопки.
            </p>
          ) : hasOutcomeForm ? (
            <TaskViewTabsPreview
              entity={entity}
              record={{ ...record, values: { ...record.values, ...values } }}
              tabIds={
                showViewBefore ? earlyViewTabIds : (ask?.viewTabIds ?? [])
              }
              filesTabEntryIds={
                showViewBefore
                  ? taskAsk?.viewFilesTabEntryIds
                  : ask?.viewFilesTabEntryIds
              }
              filesTabAllowMove={
                showViewBefore
                  ? taskAsk?.viewFilesTabAllowMove === true
                  : ask?.viewFilesTabAllowMove === true
              }
              fillBadge={
                hasEditableFill && missingRequiredCount > 0 ? (
                  <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive tabular-nums">
                    {missingRequiredCount}
                  </span>
                ) : null
              }
              fillSlot={
                fields.length > 0 ||
                hasViewContext ||
                hasRelatedAsk ||
                hasCreateAsk ? (
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
                    {hasViewContext && entity && record ? (
                      <TaskViewContextFields
                        triggerViewFields={viewFields.map((field) => ({
                          id: field.id,
                          label: getEntityFieldDisplayName(field),
                          node: (
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
                        onSeedChange={seedRelatedValue}
                        assigneeUserId={task?.assigneeUserId}
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
                  (uploadBlocksComplete && !outcomeNeedsInput(outcome))
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
