import {
  CREATE_RECORD_MULTI_NESTED_ID,
  createRecordAskDraftKey,
  createRecordNestedAskDraftKey,
  createRecordNestedCountDraftKey,
  createRecordUnderRelatedNestedId,
  getCreateParentFromRelatedList,
  resolveCreateParentFromRelated,
  resolveCreateRecordParentHosts,
  resolveCreateRecordAskFields,
  resolveCreateRecordParentHost,
  resolveHostChildParentLinkField,
  type AutomationAskRelatedField,
  type AutomationCreateNestedSpec,
  type AutomationFieldAskOptions,
  type AutomationOutcome,
  type AutomationTask,
  type AutomationViewEntityField,
} from "@/entities/automation";
import {
  createEntityDraftRecord,
  getEntityDisplayName,
  getEntityFieldDisplayName,
  isEntityFieldVisibleByConditions,
  isEntityNameField,
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityField,
  type EntityValueContext,
} from "@/entities/entity";

function isCreateAskFieldVisible(options: {
  ctx: EntityValueContext | undefined;
  entity: Entity;
  field: EntityField;
  fieldIds: string[];
  values: Record<string, string>;
  draftKeyFor: (fieldId: string) => string;
}): boolean {
  if (!options.ctx) return true;
  const localValues: Record<string, string> = {};
  for (const id of options.fieldIds) {
    localValues[id] = options.values[options.draftKeyFor(id)] ?? "";
  }
  return isEntityFieldVisibleByConditions(
    options.ctx,
    options.entity,
    createEntityDraftRecord(localValues),
    options.field,
  );
}

/** Prefer linked-tab title when naming a child under `parent`. */
function childEntityLabel(parent: Entity | null, child: Entity): string {
  if (parent) {
    const tab = parent.tabs.find(
      (item) =>
        isEntityTabWithLinkedEntity(item) && item.linkedEntityId === child.id,
    );
    const tabName = tab?.name.trim();
    if (tabName) return tabName;
  }
  return getEntityDisplayName(child);
}

function fallbackRelatedParentTitle(entity: Entity, recordId: string): string {
  const record = entity.records.find((item) => item.id === recordId);
  if (!record) return "Запись";
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const raw = nameField ? (record.values[nameField.id] ?? "").trim() : "";
  return raw || "Без названия";
}

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
  /** Related-entity fields shown on the task form. */
  relatedVisibleFields: AutomationAskRelatedField[];
  /** `relatedVisibleFields[].id` that are required. */
  relatedRequiredIds: string[];
  relatedCommentIds: string[];
  relatedRecordIds: string[];
  /**
   * Read-only related / linked-tab fields from «Просмотреть поле».
   * Not editable — separate from `relatedVisibleFields`.
   */
  viewRelatedFields: AutomationAskRelatedField[];
  /**
   * Read-only fields from arbitrary entities (match params) from
   * «Просмотреть поле».
   */
  viewEntityFields: AutomationViewEntityField[];
  /** Per-field ask presentation (e.g. relationGroups mode). */
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
};

const EMPTY_ASK_FIELDS: AutomationAskFields = {
  requiredFieldIds: [],
  visibleFieldIds: [],
  viewFieldIds: [],
  viewTabIds: [],
  viewFilesTabEntryIds: {},
  viewFilesTabAllowMove: false,
  requireAttachment: false,
  relatedVisibleFields: [],
  relatedRequiredIds: [],
  relatedCommentIds: [],
  relatedRecordIds: [],
  viewRelatedFields: [],
  viewEntityFields: [],
  fieldAskOptions: {},
};

function mergeFieldAskOptions(
  into: Record<string, AutomationFieldAskOptions>,
  from: Record<string, AutomationFieldAskOptions> | undefined,
) {
  if (!from) return;
  for (const [fieldId, opts] of Object.entries(from)) {
    const prev = into[fieldId];
    if (!prev) {
      into[fieldId] = { ...opts };
      continue;
    }
    if (
      prev.relationGroupsMode &&
      opts.relationGroupsMode &&
      prev.relationGroupsMode !== opts.relationGroupsMode
    ) {
      into[fieldId] = { ...prev, relationGroupsMode: "full" };
    } else {
      into[fieldId] = { ...prev, ...opts };
    }
  }
}

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

function uniqueRelatedFields(
  fields: AutomationAskRelatedField[],
): AutomationAskRelatedField[] {
  const seen = new Set<string>();
  const result: AutomationAskRelatedField[] = [];
  for (const item of fields) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function uniqueViewEntityFields(
  fields: AutomationViewEntityField[],
): AutomationViewEntityField[] {
  const seen = new Set<string>();
  const result: AutomationViewEntityField[] = [];
  for (const item of fields) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
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

  const relatedVisibleFields = uniqueRelatedFields(
    outcome.fieldAccess.relatedVisibleFields,
  );
  const relatedVisibleIds = new Set(
    relatedVisibleFields.map((item) => item.id),
  );
  const relatedRequiredIds = uniquePreserveOrder(
    outcome.fieldAccess.relatedRequiredIds.filter((id) =>
      relatedVisibleIds.has(id),
    ),
  );
  const relatedCommentIds = uniquePreserveOrder(
    outcome.fieldAccess.relatedCommentIds.filter((id) =>
      relatedVisibleIds.has(id),
    ),
  );
  const relatedRecordIds = uniquePreserveOrder(
    outcome.fieldAccess.relatedRecordIds.filter((id) =>
      relatedVisibleIds.has(id),
    ),
  );

  const viewOnly: string[] = [];
  const viewRelated: AutomationAskRelatedField[] = [];
  const viewEntity: AutomationViewEntityField[] = [];
  const viewTabs: string[] = [];
  const viewFilesTabEntryIds: Record<string, string[]> = {};
  let viewFilesTabAllowMove = false;

  for (const action of outcome.actions) {
    if (action.kind === "viewField") {
      for (const fieldId of action.fieldIds) {
        if (fieldId.trim()) viewOnly.push(fieldId);
      }
      if (action.relatedFields?.length) {
        viewRelated.push(...action.relatedFields);
      }
      if (action.entityFields?.length) {
        viewEntity.push(...action.entityFields);
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
  // Skip related view rows that are already editable on the form.
  const viewRelatedFields = uniqueRelatedFields(viewRelated).filter(
    (item) => !relatedVisibleIds.has(item.id),
  );

  const fieldAskOptions: Record<string, AutomationFieldAskOptions> = {};
  for (const [fieldId, opts] of Object.entries(
    outcome.fieldAccess.fieldAskOptions ?? {},
  )) {
    if (!visibleSet.has(fieldId)) continue;
    fieldAskOptions[fieldId] = { ...opts };
  }

  return {
    requiredFieldIds,
    visibleFieldIds,
    viewFieldIds,
    viewTabIds: uniquePreserveOrder(viewTabs),
    viewFilesTabEntryIds,
    viewFilesTabAllowMove,
    requireAttachment: outcome.fieldAccess.requireAttachment === true,
    relatedVisibleFields,
    relatedRequiredIds,
    relatedCommentIds,
    relatedRecordIds,
    viewRelatedFields,
    viewEntityFields: uniqueViewEntityFields(viewEntity),
    fieldAskOptions,
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
  const relatedVisible: AutomationAskRelatedField[] = [];
  const relatedRequired: string[] = [];
  const relatedComment: string[] = [];
  const relatedRecord: string[] = [];
  const viewRelated: AutomationAskRelatedField[] = [];
  const viewEntity: AutomationViewEntityField[] = [];
  const fieldAskOptions: Record<string, AutomationFieldAskOptions> = {};
  let viewFilesTabAllowMove = false;
  let requireAttachment = false;

  for (const outcome of task.config.outcomes) {
    const ask = getAutomationOutcomeAskFields(outcome);
    required.push(...ask.requiredFieldIds);
    visible.push(...ask.visibleFieldIds);
    viewOnly.push(...ask.viewFieldIds);
    viewTabs.push(...ask.viewTabIds);
    mergeFilesTabEntryIds(viewFilesTabEntryIds, ask.viewFilesTabEntryIds);
    mergeFieldAskOptions(fieldAskOptions, ask.fieldAskOptions);
    if (ask.viewFilesTabAllowMove) viewFilesTabAllowMove = true;
    if (ask.requireAttachment) requireAttachment = true;
    relatedVisible.push(...ask.relatedVisibleFields);
    relatedRequired.push(...ask.relatedRequiredIds);
    relatedComment.push(...ask.relatedCommentIds);
    relatedRecord.push(...ask.relatedRecordIds);
    viewRelated.push(...ask.viewRelatedFields);
    viewEntity.push(...ask.viewEntityFields);
  }

  const visibleFieldIds = uniquePreserveOrder(visible);
  const visibleSet = new Set(visibleFieldIds);
  const relatedVisibleFields = uniqueRelatedFields(relatedVisible);
  const relatedVisibleIds = new Set(
    relatedVisibleFields.map((item) => item.id),
  );

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
    relatedVisibleFields,
    relatedRequiredIds: uniquePreserveOrder(relatedRequired).filter((id) =>
      relatedVisibleIds.has(id),
    ),
    relatedCommentIds: uniquePreserveOrder(relatedComment).filter((id) =>
      relatedVisibleIds.has(id),
    ),
    relatedRecordIds: uniquePreserveOrder(relatedRecord).filter((id) =>
      relatedVisibleIds.has(id),
    ),
    viewRelatedFields: uniqueRelatedFields(viewRelated).filter(
      (item) => !relatedVisibleIds.has(item.id),
    ),
    viewEntityFields: uniqueViewEntityFields(viewEntity),
    fieldAskOptions,
  };
}

export type AutomationCreateAskNestedSlot = {
  nestedId: string;
  entityId: string;
  entityLabel: string;
  askFieldIds: string[];
  askRequiredFieldIds: string[];
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
};

/** Existing related parent for createRecord.parentFromRelated drafts. */
export type AutomationCreateAskUnderRelatedParent = {
  parentRecordId: string;
  parentTitle: string;
  nestedId: string;
};

/** createRecord ask block rendered on the task form. */
export type AutomationCreateAskSlot = {
  actionId: string;
  entityId: string;
  entityLabel: string;
  askFieldIds: string[];
  askRequiredFieldIds: string[];
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
  /**
   * Several records linked to the trigger (подсущность).
   * Draft keys use `CREATE_RECORD_MULTI_NESTED_ID`.
   */
  multiple?: boolean;
  /**
   * Create under existing related parents (e.g. подзадачи → расчёты отделов).
   * When set, `multiple` list is per parent via `under_*` nested ids.
   */
  underRelatedParents?: AutomationCreateAskUnderRelatedParent[];
  /** Empty-state label when no related parents exist yet. */
  underRelatedEmptyLabel?: string;
  nested: AutomationCreateAskNestedSlot[];
};

export type GetOutcomeCreateAskSlotsOptions = {
  sourceEntity?: Entity | null;
  triggerRecordId?: string;
  triggerValues?: Record<string, string>;
  getRecordTitle?: (entity: Entity, recordId: string) => string;
};

function nestedSpecToSlot(
  nested: AutomationCreateNestedSpec,
  entities: Entity[],
  parentEntity: Entity | null,
): AutomationCreateAskNestedSlot | null {
  const entity = entities.find((item) => item.id === nested.entityId);
  if (!entity) return null;
  const askFieldIds = uniquePreserveOrder(nested.askFieldIds);
  const label = childEntityLabel(parentEntity, entity);
  return {
    nestedId: nested.id,
    entityId: nested.entityId,
    entityLabel: parentEntity ? `${label} · к этой записи` : label,
    askFieldIds,
    askRequiredFieldIds: uniquePreserveOrder(
      (nested.askRequiredFieldIds ?? []).filter((id) =>
        askFieldIds.includes(id),
      ),
    ),
    fieldAskOptions: nested.fieldAskOptions ?? {},
  };
}

/** createRecord actions that need a task-form section. */
export function getOutcomeCreateAskSlots(
  outcome: AutomationOutcome,
  entities: Entity[],
  options: GetOutcomeCreateAskSlotsOptions = {},
): AutomationCreateAskSlot[] {
  const sourceEntity = options.sourceEntity ?? null;
  const slots: AutomationCreateAskSlot[] = [];
  for (const action of outcome.actions) {
    if (action.kind !== "createRecord") continue;
    const parentFromRelatedList = getCreateParentFromRelatedList(action);
    const hasRelatedParents = parentFromRelatedList.length > 0;
    const useEntityCreateForm = action.useEntityCreateForm === true;
    const multiple =
      action.multiple === true || hasRelatedParents || useEntityCreateForm;
    const entity = entities.find((item) => item.id === action.entityId);
    if (!entity) continue;
    const parentHosts = resolveCreateRecordParentHosts(
      action,
      sourceEntity,
      entities,
    );
    const parentHost =
      parentHosts[0] ??
      resolveCreateRecordParentHost(action, sourceEntity, entities);
    const resolvedAsk = resolveCreateRecordAskFields(
      action,
      entity,
      parentHosts.length > 0 ? parentHosts : parentHost,
    );
    const askFieldIds = uniquePreserveOrder(resolvedAsk.askFieldIds);
    const nested =
      multiple || hasRelatedParents || useEntityCreateForm
        ? []
        : (action.nestedCreates ?? [])
            .map((item) => nestedSpecToSlot(item, entities, entity))
            .filter(
              (item): item is AutomationCreateAskNestedSlot => item != null,
            );
    const hasMappingTargets = (action.mappings ?? []).some(
      (mapping) => mapping.targetFieldId.trim().length > 0,
    );
    // Mappings → silent create in execute-actions. Do not show «Добавить» lists.
    if (!useEntityCreateForm && hasMappingTargets) continue;
    // Related without ask / entity create form → nothing to fill on the task.
    if (hasRelatedParents && !useEntityCreateForm && askFieldIds.length === 0) {
      continue;
    }
    const explicitMultiple =
      action.multiple === true && !hasRelatedParents && !useEntityCreateForm;
    if (
      !useEntityCreateForm &&
      askFieldIds.length === 0 &&
      nested.length === 0 &&
      !explicitMultiple
    ) {
      continue;
    }

    let underRelatedParents:
      AutomationCreateAskUnderRelatedParent[] | undefined;
    let underRelatedEmptyLabel: string | undefined;
    let entityLabel = childEntityLabel(
      sourceEntity &&
        resolveHostChildParentLinkField(sourceEntity, entity) != null
        ? sourceEntity
        : null,
      entity,
    );

    const linkAllParents = hasRelatedParents && action.alsoLinkTrigger === true;

    if (hasRelatedParents) {
      const emptyLabels: string[] = [];
      const parentLabels: string[] = [];
      const seenParentRecords = new Set<string>();
      const relatedParentsList: AutomationCreateAskUnderRelatedParent[] = [];
      if (sourceEntity && options.triggerRecordId) {
        for (const parentFrom of parentFromRelatedList) {
          const resolved = resolveCreateParentFromRelated({
            triggerEntity: sourceEntity,
            entities,
            parentFrom,
            triggerRecordId: options.triggerRecordId,
            triggerValues: options.triggerValues ?? {},
          });
          if (!resolved) continue;
          emptyLabels.push(resolved.parentLabel);
          parentLabels.push(resolved.parentLabel);
          for (const parentRecordId of new Set(resolved.parentRecordIds)) {
            if (seenParentRecords.has(parentRecordId)) continue;
            seenParentRecords.add(parentRecordId);
            relatedParentsList.push({
              parentRecordId,
              parentTitle:
                options.getRecordTitle?.(
                  resolved.parentEntity,
                  parentRecordId,
                ) ??
                fallbackRelatedParentTitle(
                  resolved.parentEntity,
                  parentRecordId,
                ),
              nestedId: createRecordUnderRelatedNestedId(parentRecordId),
            });
          }
        }
      }
      underRelatedEmptyLabel =
        emptyLabels.length > 0
          ? [...new Set(emptyLabels)].join(", ")
          : "связанной подсущности";
      const primaryHost = parentHosts[0] ?? null;
      const childLabel = childEntityLabel(primaryHost, entity);
      const scopeLabel =
        parentLabels.length > 1
          ? [...new Set(parentLabels)].join(", ")
          : (parentLabels[0] ?? underRelatedEmptyLabel);
      if (linkAllParents) {
        // Unified list: one draft set linked to trigger + all related parents.
        underRelatedParents = undefined;
        entityLabel = useEntityCreateForm
          ? `Новые «${childLabel}»`
          : sourceEntity
            ? `${childLabel} · к «${getEntityDisplayName(sourceEntity)}» и «${scopeLabel}»`
            : `${childLabel} · к «${scopeLabel}»`;
      } else {
        underRelatedParents = relatedParentsList;
        entityLabel = useEntityCreateForm
          ? `Новые «${childLabel}»`
          : `${childLabel} · в «${scopeLabel}»`;
      }
    } else if (useEntityCreateForm) {
      entityLabel = `Новые «${entityLabel}»`;
    }

    const linkToTriggerMultiple =
      (multiple && !hasRelatedParents) || linkAllParents;

    slots.push({
      actionId: action.id,
      entityId: action.entityId,
      entityLabel,
      askFieldIds,
      askRequiredFieldIds: uniquePreserveOrder(
        resolvedAsk.askRequiredFieldIds.filter((id) =>
          askFieldIds.includes(id),
        ),
      ),
      fieldAskOptions: useEntityCreateForm
        ? {}
        : (action.fieldAskOptions ?? {}),
      ...(linkToTriggerMultiple ? { multiple: true } : {}),
      ...(underRelatedParents
        ? { underRelatedParents, underRelatedEmptyLabel }
        : {}),
      nested,
    });
  }
  return slots;
}

export function outcomeHasCreateAsk(outcome: AutomationOutcome) {
  return outcome.actions.some((action) => {
    if (action.kind !== "createRecord") return false;
    if (action.useEntityCreateForm === true) return true;
    if ((action.nestedCreates?.length ?? 0) > 0) return true;
    const hasMappingTargets = (action.mappings ?? []).some(
      (mapping) => mapping.targetFieldId.trim().length > 0,
    );
    // Mapped create runs silently — no task-form drafts.
    if (hasMappingTargets) return false;
    if ((action.askFieldIds?.length ?? 0) > 0) return true;
    if (getCreateParentFromRelatedList(action).length > 0) return false;
    return action.multiple === true;
  });
}

/** Pseudo-nested slot for `createRecord.multiple` draft rows. */
export function createAskMultiNestedSlot(
  slot: AutomationCreateAskSlot,
): AutomationCreateAskNestedSlot {
  return {
    nestedId: CREATE_RECORD_MULTI_NESTED_ID,
    entityId: slot.entityId,
    entityLabel: slot.entityLabel,
    askFieldIds: slot.askFieldIds,
    askRequiredFieldIds: slot.askRequiredFieldIds,
    fieldAskOptions: slot.fieldAskOptions,
  };
}

export function getNestedDraftCount(
  values: Record<string, string>,
  actionId: string,
  nestedId: string,
): number {
  const raw = values[createRecordNestedCountDraftKey(actionId, nestedId)] ?? "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 50);
}

export function setNestedDraftCount(
  values: Record<string, string>,
  actionId: string,
  nestedId: string,
  count: number,
): Record<string, string> {
  const next = { ...values };
  const safe = Math.max(0, Math.min(Math.floor(count), 50));
  next[createRecordNestedCountDraftKey(actionId, nestedId)] = String(safe);
  return next;
}

/** Drop one nested row and renumber higher indices. */
export function removeNestedDraftRow(
  values: Record<string, string>,
  actionId: string,
  nested: AutomationCreateAskNestedSlot,
  index: number,
): Record<string, string> {
  const count = getNestedDraftCount(values, actionId, nested.nestedId);
  if (index < 0 || index >= count) return values;
  const next = { ...values };
  for (const fieldId of nested.askFieldIds) {
    delete next[
      createRecordNestedAskDraftKey(actionId, nested.nestedId, index, fieldId)
    ];
  }
  for (let from = index + 1; from < count; from++) {
    const to = from - 1;
    for (const fieldId of nested.askFieldIds) {
      const fromKey = createRecordNestedAskDraftKey(
        actionId,
        nested.nestedId,
        from,
        fieldId,
      );
      const toKey = createRecordNestedAskDraftKey(
        actionId,
        nested.nestedId,
        to,
        fieldId,
      );
      if (fromKey in next) {
        next[toKey] = next[fromKey]!;
        delete next[fromKey];
      } else {
        delete next[toKey];
      }
    }
  }
  return setNestedDraftCount(next, actionId, nested.nestedId, count - 1);
}

export function addNestedDraftRow(
  values: Record<string, string>,
  actionId: string,
  nested: AutomationCreateAskNestedSlot,
): Record<string, string> {
  const count = getNestedDraftCount(values, actionId, nested.nestedId);
  const next = setNestedDraftCount(
    values,
    actionId,
    nested.nestedId,
    count + 1,
  );
  for (const fieldId of nested.askFieldIds) {
    const key = createRecordNestedAskDraftKey(
      actionId,
      nested.nestedId,
      count,
      fieldId,
    );
    if (!(key in next)) next[key] = "";
  }
  return next;
}

export function collectCreateAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldId of askFieldIds) {
    const key = createRecordAskDraftKey(actionId, fieldId);
    if (key in values) result[fieldId] = values[key] ?? "";
  }
  return result;
}

export function collectNestedAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  nestedId: string,
  index: number,
  askFieldIds: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldId of askFieldIds) {
    const key = createRecordNestedAskDraftKey(
      actionId,
      nestedId,
      index,
      fieldId,
    );
    if (key in values) result[fieldId] = values[key] ?? "";
  }
  return result;
}

/** Synthetic record id for a nested create-ask draft row. */
export function createAskDraftRecordId(
  actionId: string,
  nestedId: string,
  index: number,
) {
  return `draft:${actionId}:${nestedId}:${index}`;
}

export function parseCreateAskDraftRecordId(
  recordId: string,
): { actionId: string; nestedId: string; index: number } | null {
  if (!recordId.startsWith("draft:")) return null;
  const parts = recordId.split(":");
  // draft : actionId : nestedId : index  (nestedId may contain underscores)
  if (parts.length < 4) return null;
  const index = Number(parts[parts.length - 1]);
  if (!Number.isFinite(index) || index < 0) return null;
  const actionId = parts[1] ?? "";
  const nestedId = parts.slice(2, -1).join(":");
  if (!actionId || !nestedId) return null;
  return { actionId, nestedId, index };
}

export function buildCreateAskDraftRecord(
  values: Record<string, string>,
  actionId: string,
  nestedId: string,
  index: number,
  askFieldIds: string[],
) {
  return createEntityDraftRecord(
    collectNestedAskFieldValues(values, actionId, nestedId, index, askFieldIds),
    createAskDraftRecordId(actionId, nestedId, index),
  );
}

/** Write dialog field values into nested draft keys for one row. */
export function writeNestedAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  nestedId: string,
  index: number,
  askFieldIds: string[],
  fieldValues: Record<string, string>,
): Record<string, string> {
  const next = { ...values };
  for (const fieldId of askFieldIds) {
    next[createRecordNestedAskDraftKey(actionId, nestedId, index, fieldId)] =
      fieldValues[fieldId] ?? "";
  }
  return next;
}

/** Whether a single (non-multiple) create-ask already has a draft. */
export function singleCreateAskHasDraft(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
) {
  return askFieldIds.some(
    (fieldId) => createRecordAskDraftKey(actionId, fieldId) in values,
  );
}

export function collectSingleCreateAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const fieldId of askFieldIds) {
    const key = createRecordAskDraftKey(actionId, fieldId);
    if (key in values) result[fieldId] = values[key] ?? "";
  }
  return result;
}

export function writeSingleCreateAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
  fieldValues: Record<string, string>,
): Record<string, string> {
  const next = { ...values };
  for (const fieldId of askFieldIds) {
    next[createRecordAskDraftKey(actionId, fieldId)] =
      fieldValues[fieldId] ?? "";
  }
  return next;
}

export function clearSingleCreateAskFieldValues(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
): Record<string, string> {
  const next = { ...values };
  for (const fieldId of askFieldIds) {
    delete next[createRecordAskDraftKey(actionId, fieldId)];
  }
  return next;
}

export function buildSingleCreateAskDraftRecord(
  values: Record<string, string>,
  actionId: string,
  askFieldIds: string[],
) {
  return createEntityDraftRecord(
    collectSingleCreateAskFieldValues(values, actionId, askFieldIds),
    `draft:${actionId}:single:0`,
  );
}

export function validateCreateAskRequired(options: {
  outcome: AutomationOutcome;
  entities: Entity[];
  values: Record<string, string>;
  sourceEntity?: Entity | null;
  triggerRecordId?: string;
  triggerValues?: Record<string, string>;
  getRecordTitle?: (entity: Entity, recordId: string) => string;
  ctx?: EntityValueContext;
  isFieldFilled: (
    field: EntityField,
    value: string,
    relationGroupsMode?: string,
  ) => boolean;
}): string | null {
  const slots = getOutcomeCreateAskSlots(options.outcome, options.entities, {
    sourceEntity: options.sourceEntity,
    triggerRecordId: options.triggerRecordId,
    triggerValues: options.triggerValues,
    getRecordTitle: options.getRecordTitle,
  });
  const missingLabels: string[] = [];
  for (const slot of slots) {
    const entity = options.entities.find((item) => item.id === slot.entityId);
    if (!entity) continue;
    if (slot.underRelatedParents) {
      for (const parent of slot.underRelatedParents) {
        const count = getNestedDraftCount(
          options.values,
          slot.actionId,
          parent.nestedId,
        );
        for (let index = 0; index < count; index++) {
          for (const fieldId of slot.askRequiredFieldIds) {
            const field = entity.fields.find((item) => item.id === fieldId);
            if (!field) continue;
            if (
              !isCreateAskFieldVisible({
                ctx: options.ctx,
                entity,
                field,
                fieldIds: slot.askFieldIds,
                values: options.values,
                draftKeyFor: (id) =>
                  createRecordNestedAskDraftKey(
                    slot.actionId,
                    parent.nestedId,
                    index,
                    id,
                  ),
              })
            ) {
              continue;
            }
            const key = createRecordNestedAskDraftKey(
              slot.actionId,
              parent.nestedId,
              index,
              fieldId,
            );
            const mode =
              slot.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full";
            if (
              !options.isFieldFilled(field, options.values[key] ?? "", mode)
            ) {
              missingLabels.push(
                `${slot.entityLabel} · ${parent.parentTitle} #${index + 1}: ${getEntityFieldDisplayName(field)}`,
              );
            }
          }
        }
      }
      continue;
    }
    if (slot.multiple) {
      const multi = createAskMultiNestedSlot(slot);
      const count = getNestedDraftCount(
        options.values,
        slot.actionId,
        multi.nestedId,
      );
      for (let index = 0; index < count; index++) {
        for (const fieldId of multi.askRequiredFieldIds) {
          const field = entity.fields.find((item) => item.id === fieldId);
          if (!field) continue;
          if (
            !isCreateAskFieldVisible({
              ctx: options.ctx,
              entity,
              field,
              fieldIds: multi.askFieldIds,
              values: options.values,
              draftKeyFor: (id) =>
                createRecordNestedAskDraftKey(
                  slot.actionId,
                  multi.nestedId,
                  index,
                  id,
                ),
            })
          ) {
            continue;
          }
          const key = createRecordNestedAskDraftKey(
            slot.actionId,
            multi.nestedId,
            index,
            fieldId,
          );
          const mode =
            multi.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full";
          if (!options.isFieldFilled(field, options.values[key] ?? "", mode)) {
            missingLabels.push(
              `${slot.entityLabel} #${index + 1}: ${getEntityFieldDisplayName(field)}`,
            );
          }
        }
      }
      continue;
    }
    for (const fieldId of slot.askRequiredFieldIds) {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field) continue;
      if (
        !isCreateAskFieldVisible({
          ctx: options.ctx,
          entity,
          field,
          fieldIds: slot.askFieldIds,
          values: options.values,
          draftKeyFor: (id) => createRecordAskDraftKey(slot.actionId, id),
        })
      ) {
        continue;
      }
      const key = createRecordAskDraftKey(slot.actionId, fieldId);
      const mode = slot.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full";
      if (!options.isFieldFilled(field, options.values[key] ?? "", mode)) {
        missingLabels.push(
          `${slot.entityLabel}: ${getEntityFieldDisplayName(field)}`,
        );
      }
    }
    for (const nested of slot.nested) {
      const child = options.entities.find(
        (item) => item.id === nested.entityId,
      );
      if (!child) continue;
      const count = getNestedDraftCount(
        options.values,
        slot.actionId,
        nested.nestedId,
      );
      for (let index = 0; index < count; index++) {
        for (const fieldId of nested.askRequiredFieldIds) {
          const field = child.fields.find((item) => item.id === fieldId);
          if (!field) continue;
          if (
            !isCreateAskFieldVisible({
              ctx: options.ctx,
              entity: child,
              field,
              fieldIds: nested.askFieldIds,
              values: options.values,
              draftKeyFor: (id) =>
                createRecordNestedAskDraftKey(
                  slot.actionId,
                  nested.nestedId,
                  index,
                  id,
                ),
            })
          ) {
            continue;
          }
          const key = createRecordNestedAskDraftKey(
            slot.actionId,
            nested.nestedId,
            index,
            fieldId,
          );
          const mode =
            nested.fieldAskOptions[fieldId]?.relationGroupsMode ?? "full";
          if (!options.isFieldFilled(field, options.values[key] ?? "", mode)) {
            missingLabels.push(
              `${nested.entityLabel} #${index + 1}: ${getEntityFieldDisplayName(field)}`,
            );
          }
        }
      }
    }
  }
  if (missingLabels.length === 0) return null;
  return `Заполните: ${missingLabels.join(", ")}`;
}

export function automationOutcomeNeedsInput(outcome: AutomationOutcome) {
  const ask = getAutomationOutcomeAskFields(outcome);
  return (
    ask.visibleFieldIds.length > 0 ||
    ask.requiredFieldIds.length > 0 ||
    ask.viewFieldIds.length > 0 ||
    ask.viewTabIds.length > 0 ||
    ask.relatedVisibleFields.length > 0 ||
    ask.viewRelatedFields.length > 0 ||
    ask.viewEntityFields.length > 0 ||
    ask.requireAttachment ||
    outcomeHasCreateAsk(outcome)
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
