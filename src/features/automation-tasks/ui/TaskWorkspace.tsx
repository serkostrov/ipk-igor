import { AsyncValue } from "@/shared/ui/async-value";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { Button } from "@/shared/ui/button";
import {
  assertAutomationTimeTrackingReady,
  automationOutcomeButtonStyle,
  automationRequiresTimeTracking,
  automationUploadTargetBlocksComplete,
  filterSelectableListOptions,
  getSelectableStageOptionIds,
  resolveEffectiveUploadTarget,
  resolveAutomationGateError,
  resolveViewEntityFieldsLayout,
  type AutomationTask,
} from "@/entities/automation";
import { cn } from "@/shared/lib/cn";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { TaskReturnReasonBanner } from "./TaskReturnReasonBanner";
import { TaskTimeSessionsPanel } from "./TaskTimeSessionsPanel";
import { TaskUploadPanel } from "./TaskUploadPanel";
import {
  getEntityRecordById,
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
  usePageRecordScope,
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
  getTaskSetFieldAutofillActions,
  mergeAutofillIntoFormValues,
} from "../lib/apply-outcome-autofill";
import {
  automationOutcomeNeedsInput,
  automationTaskShowsFormUpfront,
  automationTaskShowsViewBeforeOutcomes,
  filterCreateAskSlotsCoveredByViewTabs,
  filterCreateAskSlotsForDeptCalculationsView,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  getAutomationTemplateAskFields,
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
import {
  clearPendingRecordListChangeIfLanded,
  getPendingRecordListChange,
  resumePendingRecordListChange,
} from "../model/pending-list-change";
import {
  resolveTaskAssigneeName,
  resolveTaskLeadManagerName,
} from "../lib/task-people";
import { applyRelatedAskFieldChange } from "../lib/apply-related-ask-field-change";
import { useCurrentRole, useDisplayValueContext } from "@/entities/access";
import {
  findTkpCalcDeadlineField,
  isTkpDepartmentHeadRole,
  isTkpGipFillAutomationTask,
  maybeEnsureDeptCalculationGipForTask,
  readTkpGipExecutionDurationDays,
  resolveTkpCalcDeadlineMaxIso,
  TkpGipExecutionDurationAsk,
  TkpReviewHardcodeSlot,
  tkpStageDepartmentRootsMissing,
} from "@/features/hardcode";
import { maybeHealTkpStageDepartmentRoots } from "@/features/hardcode/tkp-gip/heal-tkp-stage-roots";
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

async function buildTaskFormValues(
  entity: Entity,
  record: EntityRecord,
  visibleFieldIds: string[],
  entities: Entity[],
  setFieldActions: ReturnType<typeof getTaskSetFieldAutofillActions> = [],
  actorUserId: string | null = null,
  relatedFields: ReturnType<
    typeof getAutomationTaskAskFields
  >["relatedVisibleFields"] = [],
): Promise<Record<string, string>> {
  const draft: Record<string, string> = {};
  for (const fieldId of visibleFieldIds) {
    const field = entity.fields.find((item) => item.id === fieldId);
    const raw = record.values[fieldId] ?? "";
    draft[fieldId] = field ? normalizeEntityFieldInputValue(field, raw) : raw;
  }
  let base = sanitizeEntityRelationDependencies(entity, draft, entities);
  if (setFieldActions.length > 0) {
    const merged = { ...record.values, ...base };
    const filled = await applyAutomationSetFieldAutofill({
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
  // Load the task's subject entity (and its relation targets via the closure),
  // so the record form and its pickers work even when the entity is unloaded.
  usePageRecordScope([task.entityId]);
  const entity = entities.find((item) => item.id === task.entityId);
  const current = useMemo(
    () => getEntityRecordById(entity, task.recordId),
    [entity, task.recordId],
  );

  return (
    <AsyncValue promise={current}>
      {(record) => (
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
      )}
    </AsyncValue>
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
  const role = useCurrentRole();
  const restrictDeptToOwn = isTkpDepartmentHeadRole(role);
  const valueContext = useDisplayValueContext(entity);
  const previewContext = useMemo(
    () => getEntityPreviewValueContext(valueContext),
    [valueContext],
  );
  const isGipFillTask = useMemo(
    () =>
      Boolean(entity) &&
      isTkpGipFillAutomationTask({
        entityId: task.entityId,
        triggerOptionId: task.triggerOptionId,
        taskName: task.name,
      }),
    [entity, task.entityId, task.name, task.triggerOptionId],
  );
  // Editable «Общий срок расчёта» only on GIP fill — not on verify/approve.
  const showPinnedGipDuration = isGipFillTask;

  const taskAsk = getAutomationTaskAskFields(task);
  const templateAsk = getAutomationTemplateAskFields(task);
  const formUpfront = automationTaskShowsFormUpfront(task);
  const showViewBefore = automationTaskShowsViewBeforeOutcomes(task);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    () => getDefaultSelectedOutcomeId(task),
  );
  const selectedOutcome = useMemo(
    () =>
      task.config.outcomes.find((item) => item.id === selectedOutcomeId) ??
      null,
    [task.config.outcomes, selectedOutcomeId],
  );
  const autofillOutcomeId =
    selectedOutcomeId ??
    getDefaultSelectedOutcomeId(task) ??
    task.config.outcomes[0]?.id ??
    null;
  const setFieldActions = useMemo(() => {
    const outcome =
      task.config.outcomes.find((item) => item.id === autofillOutcomeId) ??
      null;
    return getTaskSetFieldAutofillActions(task.config.actions, outcome);
  }, [autofillOutcomeId, task.config.actions, task.config.outcomes]);
  const ask = selectedOutcome
    ? getAutomationOutcomeAskFields(selectedOutcome)
    : null;
  const createAskTitle = useCallback(
    async (parentEntity: Entity, parentRecordId: string) => {
      const parentRecord = await getEntityRecordById(
        parentEntity,
        parentRecordId,
      );
      if (!parentRecord) return "Запись";
      return getEntityRecordTitle(previewContext, parentEntity, parentRecord);
    },
    [previewContext],
  );
  const templateCreateOutcome = useMemo(
    () => ({
      id: "__template__",
      label: "",
      color: null as string | null,
      actions: task.config.actions ?? [],
      fieldAccess: task.config.fieldAccess,
      conditions: { version: 1 as const, match: "all" as const, rules: [] },
      buttonMode: "auto" as const,
      isReturn: false as const,
      keepFilledData: true as const,
    }),
    [task.config.actions, task.config.fieldAccess],
  );
  const createAskSlotsRawValue = useAsyncValue(
    async () => [
      ...(await getOutcomeCreateAskSlots(templateCreateOutcome, entities, {
        sourceEntity: entity,
        triggerRecordId: record?.id ?? task.recordId,
        triggerValues: record?.values ?? {},
        getRecordTitle: createAskTitle,
      })),
      ...(selectedOutcome
        ? await getOutcomeCreateAskSlots(selectedOutcome, entities, {
            sourceEntity: entity,
            triggerRecordId: record?.id ?? task.recordId,
            triggerValues: record?.values ?? {},
            getRecordTitle: createAskTitle,
          })
        : []),
    ],
    [
      templateCreateOutcome,
      entities,
      entity,
      record,
      task.recordId,
      selectedOutcome,
      createAskTitle,
    ],
  );
  if (createAskSlotsRawValue.status === "error")
    throw createAskSlotsRawValue.error;
  const createAskSlotsRaw =
    createAskSlotsRawValue.status === "ready"
      ? createAskSlotsRawValue.value
      : [];
  const requiredIds = new Set([
    ...templateAsk.requiredFieldIds,
    ...(ask?.requiredFieldIds ?? []),
  ]);

  const [values, setValues] = useState<Record<string, string>>({});
  // Seed once on mount — the body is keyed per task/record so it remounts.
  useEffect(() => {
    if (!entity || !record) return;
    let cancelled = false;
    const outcome =
      task.config.outcomes.find((item) => item.id === autofillOutcomeId) ??
      null;
    void buildTaskFormValues(
      entity,
      record,
      taskAsk.visibleFieldIds,
      entities,
      getTaskSetFieldAutofillActions(task.config.actions, outcome),
      getCurrentUserRecordId(),
      taskAsk.relatedVisibleFields,
    ).then((seed) => {
      if (cancelled) return;
      // Keep a heal that landed while the seed was loading.
      setValues((current) => ({ ...seed, ...current }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heal empty «Стадия/отделы» roots from protocol, then ensure ГИП rows.
  useEffect(() => {
    if (!entity || !record) return;
    const triggerOptionId = (task.triggerOptionId ?? "").trim();
    if (!triggerOptionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const healed = await maybeHealTkpStageDepartmentRoots({
          hostEntity: entity,
          hostRecord: record,
          entities,
        });
        if (cancelled || !healed) return;
        setValues((current) => {
          if (healed.healed) return { ...current, ...healed.values };
          // A store refresh can cancel the pass that wrote the roots.
          // The next pass sees them on the record and must still fill the form.
          const next = { ...current };
          let changed = false;
          for (const [key, value] of Object.entries(healed.values)) {
            if (!value || (current[key] ?? "").trim()) continue;
            if (!value.includes('"children"')) continue;
            next[key] = value;
            changed = true;
          }
          return changed ? next : current;
        });
        await maybeEnsureDeptCalculationGipForTask({
          hostEntity: entity,
          hostRecord: healed?.values
            ? { ...record, values: healed.values }
            : record,
          triggerOptionId,
          entities,
        });
      } catch (error: unknown) {
        if (!cancelled) {
          console.error("[tkp-gip] ensure on task open failed", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, entities, record, task.id, task.triggerOptionId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requireTime = automationRequiresTimeTracking(task.config.materials);
  const uploadTarget = resolveEffectiveUploadTarget({
    materials: task.config.materials,
    requireAttachment:
      task.config.fieldAccess?.requireAttachment === true ||
      taskAsk.requireAttachment,
    entity,
  });
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

  // Template fields always; outcome fields only after select (or single upfront).
  const relatedFieldsForForm = [
    ...templateAsk.relatedVisibleFields,
    ...(ask?.relatedVisibleFields ?? []),
  ];
  const relatedRequiredForForm = [
    ...templateAsk.relatedRequiredIds,
    ...(ask?.relatedRequiredIds ?? []),
  ];

  const relatedLayoutValue = useAsyncValue(
    () =>
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
        : Promise.resolve({ groups: [], emptyRelations: [] }),
    // relatedFields/required derive purely from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, entities, selectedOutcome, task, record, previewContext, values],
  );
  const relatedLayout =
    relatedLayoutValue.status === "ready"
      ? relatedLayoutValue.value
      : { groups: [], emptyRelations: [] };

  const createAskSlots = filterCreateAskSlotsCoveredByViewTabs(
    filterCreateAskSlotsForDeptCalculationsView(
      createAskSlotsRaw,
      relatedLayout.groups,
    ),
    entity ?? null,
    taskAsk.viewTabIds,
  );

  // Template view always before buttons; outcome view after select (or single).
  const viewRelatedFieldsForForm = [
    ...templateAsk.viewRelatedFields,
    ...((selectedOutcome || formUpfront || showViewBefore) && ask
      ? ask.viewRelatedFields
      : []),
  ];
  const viewEntityFieldsForForm = [
    ...templateAsk.viewEntityFields,
    ...((selectedOutcome || formUpfront || showViewBefore) && ask
      ? ask.viewEntityFields
      : []),
  ];
  const viewRelatedLayoutValue = useAsyncValue(
    () =>
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
        : Promise.resolve({ groups: [], emptyRelations: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, entities, selectedOutcome, task, record, previewContext, values],
  );
  const viewRelatedLayout =
    viewRelatedLayoutValue.status === "ready"
      ? viewRelatedLayoutValue.value
      : { groups: [], emptyRelations: [] };
  const viewEntityLayoutValue = useAsyncValue(
    () =>
      entity && viewEntityFieldsForForm.length > 0
        ? resolveViewEntityFieldsLayout({
            triggerEntity: entity,
            entities,
            entityFields: viewEntityFieldsForForm,
            triggerValues: { ...(record?.values ?? {}), ...values },
            ctx: previewContext,
          })
        : Promise.resolve({ groups: [], empty: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, entities, selectedOutcome, task, record, previewContext, values],
  );
  const viewEntityLayout =
    viewEntityLayoutValue.status === "ready"
      ? viewEntityLayoutValue.value
      : { groups: [], empty: [] };

  async function applyOutcomeAutofill(outcomeId: string) {
    if (!entity || !record) return;
    const outcome =
      task.config.outcomes.find((item) => item.id === outcomeId) ?? null;
    const actions = getTaskSetFieldAutofillActions(
      task.config.actions,
      outcome,
    );
    const relatedFields =
      outcome != null
        ? getAutomationOutcomeAskFields(outcome).relatedVisibleFields
        : [];
    if (actions.length === 0 && relatedFields.length === 0) return;
    const actorUserId = sessionUser?.id ?? getCurrentUserRecordId() ?? null;
    if (actions.length > 0) autosave.markDirty();
    let next = values;
    if (actions.length > 0) {
      const merged = { ...record.values, ...next };
      const filled = await applyAutomationSetFieldAutofill({
        entity,
        entities,
        values: merged,
        actions,
        actorUserId,
        triggerRecordId: record.id,
      });
      next = mergeAutofillIntoFormValues(next, record.values, filled, actions);
    }
    if (relatedFields.length > 0) {
      next = await seedRelatedAskValues({
        triggerEntity: entity,
        entities,
        relatedFields,
        triggerValues: { ...record.values, ...next },
        triggerRecordId: record.id,
        currentValues: next,
      });
    }
    setValues(next);
  }

  const calcDeadlineMaxValue = useAsyncValue(
    () =>
      entity && findTkpCalcDeadlineField(entity)
        ? resolveTkpCalcDeadlineMaxIso({
            entity,
            values: { ...(record?.values ?? {}), ...values },
            entities,
          })
        : Promise.resolve(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity?.id, record?.id, entities, values],
  );
  const calcDeadlineMax =
    calcDeadlineMaxValue.status === "ready" ? calcDeadlineMaxValue.value : null;

  const mergedValues = useMemo(
    () => ({ ...(record?.values ?? {}), ...values }),
    [record?.values, values],
  );
  const formDraft = useMemo(
    () => createEntityDraftRecord(mergedValues, record?.id ?? task.recordId),
    [mergedValues, record?.id, task.recordId],
  );

  const formVisibleFieldIds = (() => {
    const ids = [...templateAsk.visibleFieldIds];
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
        .filter((field): field is EntityField => field != null)
        .filter((field) =>
          isEntityFieldVisibleByConditions(
            previewContext,
            entity,
            formDraft,
            field,
          ),
        );

  const formViewFieldIds = (() => {
    const ids = [...templateAsk.viewFieldIds];
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
  /** Template view tabs + union across outcomes for early preview. */
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
  /**
   * «Заполнить» only when the slot has real content (editable ask or view
   * fields). View tabs alone must not create an empty fill tab.
   * GIP duration is hardcode, not a template field — still part of the form.
   */
  const showFillTab =
    fields.length > 0 ||
    hasRelatedAsk ||
    hasCreateAsk ||
    hasViewContext ||
    showPinnedGipDuration;
  const missingLocalRequiredCount = [...requiredIds].filter((fieldId) => {
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
        ask?.fieldAskOptions[fieldId]?.relationGroupsMode ??
        templateAsk.fieldAskOptions[fieldId]?.relationGroupsMode ??
        "full",
    });
  }).length;
  const missingRelatedRequiredCountValue = useAsyncValue(
    () =>
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
        : Promise.resolve(0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, entities, selectedOutcome, task, record, previewContext, values],
  );
  const missingRelatedRequiredCount =
    missingRelatedRequiredCountValue.status === "ready"
      ? missingRelatedRequiredCountValue.value
      : 0;
  const missingRequiredCount =
    missingLocalRequiredCount + missingRelatedRequiredCount;

  async function setValue(fieldId: string, value: string) {
    if (!entity) return;
    const actorUserId = sessionUser?.id ?? getCurrentUserRecordId() ?? null;
    autosave.markDirty();
    let base = applyEntityFieldValue(entity, values, fieldId, value, entities);
    if (setFieldActions.length > 0) {
      const merged = { ...(record?.values ?? {}), ...base };
      const filled = await applyAutomationSetFieldAutofill({
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
    const next = await syncRelatedAskValuesAfterLocalChange({
      triggerEntity: entity,
      entities,
      relatedFields: relatedFieldsForForm,
      changedFieldId: fieldId,
      values: base,
      triggerRecordId: record?.id ?? task.recordId,
    });
    setValues(next);
  }

  async function setRelatedValue(valueKey: string, value: string) {
    if (!entity || !record) {
      autosave.markDirty();
      setValues((current) => ({ ...current, [valueKey]: value }));
      return;
    }
    autosave.markDirty();
    const next = await applyRelatedAskFieldChange({
      groups: relatedLayout.groups,
      valueKey,
      value,
      formValues: values,
      triggerEntity: entity,
      triggerRecord: record,
      entities,
    });
    setValues(next);
  }

  /** Sync from live fan-out siblings — must not trigger another autosave. */
  async function seedRelatedValue(valueKey: string, value: string) {
    if (!entity || !record) {
      setValues((current) =>
        (current[valueKey] ?? "") === value
          ? current
          : { ...current, [valueKey]: value },
      );
      return;
    }
    if ((values[valueKey] ?? "") === value) return;
    const next = await applyRelatedAskFieldChange({
      groups: relatedLayout.groups,
      valueKey,
      value,
      formValues: values,
      triggerEntity: entity,
      triggerRecord: record,
      entities,
    });
    setValues(next);
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
      templateFieldAccess: task.config.fieldAccess,
    });
    if (patch) {
      // Partial patch — store merges into current values (keeps files tabs etc.).
      await updateEntityRecord(task.entityId, task.recordId, patch);
    }
    const related = await buildTaskRelatedPersistUpdates({
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

  async function validateForOutcome(outcomeId: string) {
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
    const relatedError = await validateRelatedAskRequired({
      triggerEntity: entity,
      entities,
      fieldAccess: outcome.fieldAccess,
      values: mergedValues,
      triggerRecordId: record?.id ?? task.recordId,
      ctx: previewContext,
      assigneeUserId: task.assigneeUserId,
      assigneeUserIds: [
        task.assigneeUserId,
        getCurrentUserRecordId(),
        sessionUser?.id ?? null,
      ].filter((id): id is string => Boolean(id)),
      restrictToOwnDepartments: restrictDeptToOwn,
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

    if (isGipFillTask) {
      const days = readTkpGipExecutionDurationDays(mergedValues, entity);
      if (days == null) {
        return "Укажите «Общий срок расчёта» перед завершением задания";
      }
    }

    return validateCreateAskRequired({
      outcome,
      entities,
      values,
      sourceEntity: entity,
      triggerRecordId: record?.id ?? task.recordId,
      triggerValues: record?.values ?? values,
      getRecordTitle: async (parentEntity, parentRecordId) => {
        const parentRecord = await getEntityRecordById(
          parentEntity,
          parentRecordId,
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
    const validationError = await validateForOutcome(outcomeId);
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
      await assertAutomationTimeTrackingReady({
        taskId: task.id,
        userId: sessionUser?.id ?? null,
        materials: task.config.materials,
      });
      await autosave.flush();
      await persistValues(outcomeId);
      await onComplete(outcomeId, values);
      // Complete / beforeEnter may already have landed the deferred stage —
      // drop pending to avoid a second fieldEnter spawn.
      const deferred = getPendingRecordListChange();
      if (deferred?.recordId === task.recordId) {
        const live = await getEntityRecordById(
          entities.find((item) => item.id === deferred.entityId),
          task.recordId,
        );
        clearPendingRecordListChangeIfLanded(
          task.recordId,
          live?.values[deferred.fieldId],
        );
      }
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

  function outcomeNeedsInput(outcome: (typeof task.config.outcomes)[number]) {
    return automationOutcomeNeedsInput(outcome);
  }

  function handleOutcomeClick(outcomeId: string) {
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return;
    setError(null);
    if (!outcomeNeedsInput(outcome)) {
      void run(outcomeId);
      return;
    }
    setSelectedOutcomeId(outcomeId);
    applyOutcomeAutofill(outcomeId);
  }

  const assigneeName = resolveTaskAssigneeName(entities, task);
  const leadManager = useAsyncValue(
    () => resolveTaskLeadManagerName(entities, entity, record),
    [entities, entity, record],
  );
  if (leadManager.status === "error") throw leadManager.error;
  const leadManagerName =
    leadManager.status === "ready" ? leadManager.value : null;

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

      {task.highlightNote?.kind === "return_reason" ? (
        <TaskReturnReasonBanner note={task.highlightNote} />
      ) : null}

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
      ) : earlyViewTabIds.length > 0 || showFillTab ? (
        <TaskViewTabsPreview
          entity={entity}
          record={{ ...record, values: mergedValues }}
          tabIds={earlyViewTabIds}
          filesTabEntryIds={taskAsk.viewFilesTabEntryIds}
          filesTabAllowMove={taskAsk.viewFilesTabAllowMove}
          relatedTabsWritable={
            !busy && (task.status === "pending" || task.status === "returned")
          }
          fillBadge={
            showFillTab && missingRequiredCount > 0 ? (
              <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive tabular-nums">
                {missingRequiredCount}
              </span>
            ) : null
          }
          fillSlot={
            showFillTab ? (
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
                    {entity &&
                    tkpStageDepartmentRootsMissing(entity, {
                      ...record?.values,
                      ...values,
                    }) ? (
                      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        Нет стадий из протокола запуска — сначала заполните
                        стадии на шаге выбора ведущего отдела.
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
                          ? filterSelectableListOptions(
                              getVisibleListOptions(
                                field,
                                parentValue,
                                parentField,
                                entities,
                              ),
                              getSelectableStageOptionIds({
                                entityId: entity.id,
                                field,
                                currentOptionId:
                                  values[field.id] ??
                                  record.values[field.id] ??
                                  "",
                                values: mergedValues,
                              }),
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
                            maxDate={
                              findTkpCalcDeadlineField(entity)?.id === field.id
                                ? (calcDeadlineMax ?? undefined)
                                : undefined
                            }
                            relationGroupsMode={
                              ask?.fieldAskOptions[field.id]
                                ?.relationGroupsMode ??
                              templateAsk.fieldAskOptions[field.id]
                                ?.relationGroupsMode ??
                              "full"
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {isGipFillTask && entity && record && !hasRelatedAsk ? (
                  <TkpReviewHardcodeSlot
                    entity={entity}
                    record={buildTkpGipSoftFillParentRecord(record, values)}
                    readOnly={busy}
                    sections={["gip"]}
                    hideExecutionDuration
                  />
                ) : null}

                {showPinnedGipDuration && entity && record && !hasRelatedAsk ? (
                  <TkpGipExecutionDurationAsk
                    entity={entity}
                    record={buildTkpGipSoftFillParentRecord(record, values)}
                    readOnly={busy}
                    required
                  />
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
                    assigneeUserId={task.assigneeUserId}
                    pinGipExecutionDuration={showPinnedGipDuration}
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
                  (uploadBlocksComplete && !outcomeNeedsInput(outcome))
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
