import { canViewRecordForDataScope, getCurrentRole } from "@/entities/access";
import { getSessionUser } from "@/entities/session";
import {
  askRelatedScopeKey,
  relatedAskValueKey,
  resolveAskRelatedTarget,
  type AutomationAskRelatedField,
  type AutomationOutcomeFieldAccess,
} from "@/entities/automation";
import {
  collectTkpStageDepartmentPairs,
  createEntityDraftRecord,
  filterDeptCalculationRecordsForAssignee,
  findDeptCalculationsGroupsField,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityPreviewValueContext,
  getEntityRecordById,
  getEntityRecordsByIds,
  getEntityRecordTitle,
  getEntityValueContext,
  isDeptCalculationsEntity,
  isEntityFieldVisibleByConditions,
  normalizeEntityFieldInputValue,
  resolveEditableDeptCalculationRecordIds,
  resolveEntityFieldLabel,
  updateEntityRecord,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  persistDeptCalculationRelatedUpdate,
  resolveDeptCalculationsHostFields,
} from "@/features/hardcode";

export type RelatedAskFieldRow = {
  askId: string;
  field: EntityField;
  required: boolean;
  valueKey: string;
  relationGroupsMode?: "full" | "items" | "nested";
};

export type RelatedAskGroup = {
  /** Scope key (`relationFieldId` or `tab:…`) used in draft value keys. */
  relationFieldId: string;
  relationLabel: string;
  relatedEntity: Entity;
  relatedRecordId: string;
  relatedRecordTitle: string;
  /** Resolved related record (loaded with the layout). */
  relatedRecord: EntityRecord | null;
  fields: RelatedAskFieldRow[];
};

export type RelatedAskEmptyRelation = {
  relationFieldId: string;
  relationLabel: string;
};

/**
 * Stable input for the related-ask layout. Record loads rewrite `entities`
 * and the form seed rewrites `values`; neither changes which child records
 * the asks point at, and restarting the lookup on each of them leaves the
 * form blank until the store goes quiet.
 */
export function relatedAskLayoutDepKey(
  fields: readonly AutomationAskRelatedField[],
  recordValues: Record<string, string> | undefined,
  draftValues?: Record<string, string>,
): string {
  return fields
    .map((item) => {
      const relationId = item.relationFieldId?.trim() ?? "";
      const linkedTabId = item.linkedTabId?.trim() ?? "";
      const raw = relationId
        ? (draftValues?.[relationId] ?? recordValues?.[relationId] ?? "")
        : "";
      return [item.id, item.fieldId, relationId, linkedTabId, raw].join("\t");
    })
    .join("\n");
}

/**
 * Resolve related asks against the live store, not the `entities` snapshot
 * from the render that scheduled the read.
 */
export async function resolveLiveRelatedAskLayout(options: {
  entityId: string;
  recordId: string;
  relatedFields: readonly AutomationAskRelatedField[];
  relatedRequiredIds: readonly string[];
  draftValues?: Record<string, string>;
}): Promise<{
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
}> {
  const empty = { groups: [], emptyRelations: [] };
  if (options.relatedFields.length === 0) return empty;
  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === options.entityId);
  if (!entity) return empty;
  const record = await getEntityRecordById(entity, options.recordId);
  const triggerValues = { ...(record?.values ?? {}) };
  for (const ask of options.relatedFields) {
    const relationId = ask.relationFieldId?.trim();
    if (!relationId) continue;
    const draft = options.draftValues?.[relationId];
    if (draft !== undefined) triggerValues[relationId] = draft;
  }
  return resolveRelatedAskLayout({
    triggerEntity: entity,
    entities,
    relatedFields: [...options.relatedFields],
    relatedRequiredIds: [...options.relatedRequiredIds],
    triggerValues,
    triggerRecordId: options.recordId,
    ctx: getEntityPreviewValueContext(
      getEntityValueContext(entities, getCurrentUserRecordId()),
    ),
  });
}

export async function resolveRelatedAskLayout(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  relatedRequiredIds: string[];
  /** Trigger form values (local fields), used to read relation ids. */
  triggerValues: Record<string, string>;
  triggerRecordId: string;
  ctx: EntityValueContext;
}): Promise<{
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
}> {
  const {
    triggerEntity,
    entities,
    relatedFields,
    relatedRequiredIds,
    triggerValues,
    triggerRecordId,
    ctx,
  } = options;
  if (relatedFields.length === 0) {
    return { groups: [], emptyRelations: [] };
  }

  const required = new Set(relatedRequiredIds);
  const byScope = new Map<string, AutomationAskRelatedField[]>();
  for (const item of relatedFields) {
    const scopeKey = askRelatedScopeKey(item);
    if (!scopeKey) continue;
    const list = byScope.get(scopeKey) ?? [];
    list.push(item);
    byScope.set(scopeKey, list);
  }

  const groups: RelatedAskGroup[] = [];
  const emptyRelations: RelatedAskEmptyRelation[] = [];
  const seenEmpty = new Set<string>();
  /** Merge relation + linked-tab scopes that resolve to the same child. */
  const groupByRecord = new Map<string, RelatedAskGroup>();

  for (const [, asks] of byScope) {
    const sample = asks[0];
    if (!sample) continue;
    const resolved = await resolveAskRelatedTarget({
      triggerEntity,
      entities,
      ask: sample,
      triggerRecordId,
      triggerValues,
    });
    if (!resolved) continue;

    if (resolved.relatedRecordIds.length === 0) {
      if (!seenEmpty.has(resolved.scopeKey)) {
        seenEmpty.add(resolved.scopeKey);
        emptyRelations.push({
          relationFieldId: resolved.scopeKey,
          relationLabel: resolved.label,
        });
      }
      continue;
    }

    const relatedRecordIds = [...new Set(resolved.relatedRecordIds)];
    for (const relatedRecordId of relatedRecordIds) {
      const relatedRecord = await getEntityRecordById(
        resolved.relatedEntity,
        relatedRecordId,
      );
      if (
        !relatedRecord ||
        !(await canViewRecordForDataScope(
          getCurrentRole(),
          resolved.relatedEntity,
          relatedRecord,
          {
            entities,
            authUserId: getSessionUser()?.id ?? null,
            currentUserRecordId: ctx.currentUserRecordId,
            valueContext: ctx,
          },
        ))
      ) {
        continue;
      }
      const fields: RelatedAskFieldRow[] = [];
      for (const ask of asks) {
        const field = resolved.relatedEntity.fields.find(
          (item) => item.id === ask.fieldId,
        );
        if (!field) continue;
        fields.push({
          askId: ask.id,
          field,
          required: required.has(ask.id),
          valueKey: relatedAskValueKey(
            resolved.scopeKey,
            relatedRecordId,
            ask.fieldId,
          ),
          ...(ask.relationGroupsMode && ask.relationGroupsMode !== "full"
            ? { relationGroupsMode: ask.relationGroupsMode }
            : {}),
        });
      }
      if (fields.length === 0) continue;
      const mergeKey = `${resolved.relatedEntity.id}:${relatedRecordId}`;
      const existing = groupByRecord.get(mergeKey);
      if (existing) {
        const seenField = new Set(existing.fields.map((row) => row.field.id));
        for (const row of fields) {
          if (seenField.has(row.field.id)) continue;
          existing.fields.push(row);
          seenField.add(row.field.id);
        }
        continue;
      }
      const group: RelatedAskGroup = {
        relationFieldId: resolved.scopeKey,
        relationLabel: resolved.label,
        relatedEntity: resolved.relatedEntity,
        relatedRecordId,
        relatedRecordTitle: relatedRecord
          ? getEntityRecordTitle(ctx, resolved.relatedEntity, relatedRecord)
          : relatedRecordId,
        relatedRecord: relatedRecord ?? null,
        fields,
      };
      groupByRecord.set(mergeKey, group);
      groups.push(group);
    }
  }

  return { groups, emptyRelations };
}

/** Seed namespaced related values from related entity records. */
export async function seedRelatedAskValues(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  triggerValues: Record<string, string>;
  triggerRecordId: string;
  /** Existing draft — keeps user edits for still-active keys. */
  currentValues?: Record<string, string>;
}): Promise<Record<string, string>> {
  const {
    triggerEntity,
    entities,
    relatedFields,
    triggerValues,
    triggerRecordId,
    currentValues = {},
  } = options;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(currentValues)) {
    if (!key.startsWith("related:")) next[key] = value;
  }

  for (const ask of relatedFields) {
    const resolved = await resolveAskRelatedTarget({
      triggerEntity,
      entities,
      ask,
      triggerRecordId,
      triggerValues,
    });
    if (!resolved) continue;
    const field = resolved.relatedEntity.fields.find(
      (item) => item.id === ask.fieldId,
    );
    if (!field) continue;

    for (const relatedRecordId of resolved.relatedRecordIds) {
      const key = relatedAskValueKey(
        resolved.scopeKey,
        relatedRecordId,
        ask.fieldId,
      );
      if (currentValues[key] !== undefined) {
        next[key] = currentValues[key]!;
        continue;
      }
      const relatedRecord = await getEntityRecordById(
        resolved.relatedEntity,
        relatedRecordId,
      );
      const raw = relatedRecord?.values[ask.fieldId] ?? "";
      next[key] = normalizeEntityFieldInputValue(field, raw);
    }
  }

  return next;
}

/**
 * After a local field change: if it is a relation used by related asks,
 * re-seed related:* keys (drop cleared links, add new ones).
 */
export async function syncRelatedAskValuesAfterLocalChange(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  changedFieldId: string;
  values: Record<string, string>;
  triggerRecordId: string;
}): Promise<Record<string, string>> {
  const usesRelation = options.relatedFields.some(
    (item) =>
      !item.linkedTabId && item.relationFieldId === options.changedFieldId,
  );
  if (!usesRelation) return options.values;
  return seedRelatedAskValues({
    triggerEntity: options.triggerEntity,
    entities: options.entities,
    relatedFields: options.relatedFields,
    triggerValues: options.values,
    triggerRecordId: options.triggerRecordId,
    currentValues: options.values,
  });
}

export type RelatedAskPersistUpdate = {
  entityId: string;
  recordId: string;
  patch: Record<string, string>;
};

/**
 * Related asks written during fill/autosave: every visible related field so
 * drafts survive reload (same expectation as local required/record fields).
 */
/**
 * Deadline, description and comment are edited in the departments table,
 * which saves the row itself. The task form only keeps a snapshot from
 * when the outcome was opened.
 */
function isDeptCalculationTableHostField(
  entity: Entity,
  fieldId: string,
): boolean {
  if (!isDeptCalculationsEntity(entity)) return false;
  const host = resolveDeptCalculationsHostFields(entity);
  return (
    fieldId === host.deadline?.id ||
    fieldId === host.description?.id ||
    fieldId === host.comment?.id
  );
}

function relatedAskIdsToPersist(
  access: AutomationOutcomeFieldAccess,
): Set<string> {
  return new Set([
    ...access.relatedRecordIds,
    ...access.relatedRequiredIds,
    ...access.relatedVisibleFields.map((item) => item.id),
  ]);
}

/**
 * Richest «Стадия/отделы» draft among collapsed fan-out siblings
 * (primary row holds the merged tree; siblings may be absent).
 */
function richestRelatedGroupsDraft(options: {
  scopeKey: string;
  fieldId: string;
  relatedRecordIds: readonly string[];
  values: Record<string, string>;
}): { recordId: string; value: string } | null {
  let best: { recordId: string; value: string; pairs: number } | null = null;
  for (const relatedRecordId of options.relatedRecordIds) {
    const key = relatedAskValueKey(
      options.scopeKey,
      relatedRecordId,
      options.fieldId,
    );
    if (options.values[key] === undefined) continue;
    const value = options.values[key]!;
    const pairs = collectTkpStageDepartmentPairs(value).length;
    if (!best || pairs > best.pairs) {
      best = { recordId: relatedRecordId, value, pairs };
    }
  }
  return best ? { recordId: best.recordId, value: best.value } : null;
}

/** Build per-related-record patches from form values. */
export async function buildRelatedAskPersistUpdates(options: {
  triggerEntity: Entity;
  entities: Entity[];
  fieldAccess: AutomationOutcomeFieldAccess | AutomationOutcomeFieldAccess[];
  /** Local + related namespaced form values. */
  values: Record<string, string>;
  triggerRecordId: string;
  /** Skip writing when equal to live related record values. */
  skipUnchanged?: boolean;
}): Promise<RelatedAskPersistUpdate[]> {
  const accesses = Array.isArray(options.fieldAccess)
    ? options.fieldAccess
    : [options.fieldAccess];
  const byTarget = new Map<string, Record<string, string>>();

  for (const access of accesses) {
    const persistAskIds = relatedAskIdsToPersist(access);
    for (const ask of access.relatedVisibleFields) {
      if (!persistAskIds.has(ask.id)) continue;
      const resolved = await resolveAskRelatedTarget({
        triggerEntity: options.triggerEntity,
        entities: options.entities,
        ask,
        triggerRecordId: options.triggerRecordId,
        triggerValues: options.values,
      });
      if (
        !resolved?.relatedEntity.fields.some(
          (field) => field.id === ask.fieldId,
        )
      ) {
        continue;
      }

      const groupsField = findDeptCalculationsGroupsField(
        resolved.relatedEntity,
      );
      const isCollapsedGroups =
        isDeptCalculationsEntity(resolved.relatedEntity) &&
        groupsField?.id === ask.fieldId;

      if (isCollapsedGroups) {
        const richest = richestRelatedGroupsDraft({
          scopeKey: resolved.scopeKey,
          fieldId: ask.fieldId,
          relatedRecordIds: resolved.relatedRecordIds,
          values: options.values,
        });
        if (!richest) continue;
        if (options.skipUnchanged) {
          const liveRecords = await getEntityRecordsByIds(
            resolved.relatedEntity,
            resolved.relatedRecordIds,
          );
          const liveById = new Map(
            liveRecords.map((record) => [record.id, record]),
          );
          const liveKeys = new Set(
            resolved.relatedRecordIds.flatMap((recordId) => {
              const record = liveById.get(recordId);
              return collectTkpStageDepartmentPairs(
                record?.values[ask.fieldId],
              ).map((pair) => `${pair.stageId}\0${pair.departmentId}`);
            }),
          );
          const nextKeys = new Set(
            collectTkpStageDepartmentPairs(richest.value).map(
              (pair) => `${pair.stageId}\0${pair.departmentId}`,
            ),
          );
          const same =
            nextKeys.size === liveKeys.size &&
            [...nextKeys].every((key) => liveKeys.has(key));
          if (same) continue;
        }
        const mapKey = `${resolved.relatedEntity.id}:${richest.recordId}`;
        const patch = byTarget.get(mapKey) ?? {};
        patch[ask.fieldId] = richest.value;
        byTarget.set(mapKey, patch);
        continue;
      }

      // Table saves these fields. A blank or stale form snapshot must not
      // overwrite the row on autosave or on «Готово».
      if (
        isDeptCalculationTableHostField(resolved.relatedEntity, ask.fieldId)
      ) {
        continue;
      }

      for (const relatedRecordId of resolved.relatedRecordIds) {
        const key = relatedAskValueKey(
          resolved.scopeKey,
          relatedRecordId,
          ask.fieldId,
        );
        if (options.values[key] === undefined) continue;
        const next = options.values[key]!;
        if (options.skipUnchanged) {
          const relatedRecord = await getEntityRecordById(
            resolved.relatedEntity,
            relatedRecordId,
          );
          if ((relatedRecord?.values[ask.fieldId] ?? "") === next) continue;
        }
        const mapKey = `${resolved.relatedEntity.id}:${relatedRecordId}`;
        const patch = byTarget.get(mapKey) ?? {};
        patch[ask.fieldId] = next;
        byTarget.set(mapKey, patch);
      }
    }
  }

  const updates: RelatedAskPersistUpdate[] = [];
  for (const [mapKey, patch] of byTarget) {
    if (Object.keys(patch).length === 0) continue;
    const sep = mapKey.indexOf(":");
    if (sep < 0) continue;
    const entityId = mapKey.slice(0, sep);
    const recordId = mapKey.slice(sep + 1);
    if (!entityId || !recordId) continue;
    updates.push({ entityId, recordId, patch });
  }
  return updates;
}

/**
 * For collapsed «Расчёты отделов» asks, several sibling rows may each carry a
 * «Стадия/отделы» patch. Keep a single richest tree and fan-out from one row;
 * apply non-groups fields on every row as usual.
 */
function coalesceDeptCalculationUpdates(
  updates: RelatedAskPersistUpdate[],
  entities: readonly Entity[],
): RelatedAskPersistUpdate[] {
  const deptEntityIds = new Set(
    entities
      .filter((item) => isDeptCalculationsEntity(item))
      .map((item) => item.id),
  );
  if (deptEntityIds.size === 0) return updates;

  const passthrough: RelatedAskPersistUpdate[] = [];
  const byEntity = new Map<string, RelatedAskPersistUpdate[]>();

  for (const update of updates) {
    if (!deptEntityIds.has(update.entityId)) {
      passthrough.push(update);
      continue;
    }
    const list = byEntity.get(update.entityId) ?? [];
    list.push(update);
    byEntity.set(update.entityId, list);
  }

  const coalesced: RelatedAskPersistUpdate[] = [...passthrough];

  for (const [entityId, list] of byEntity) {
    const entity = entities.find((item) => item.id === entityId);
    const groupsField = entity ? findDeptCalculationsGroupsField(entity) : null;
    if (!groupsField) {
      coalesced.push(...list);
      continue;
    }

    let best: { recordId: string; value: string; pairs: number } | null = null;
    for (const update of list) {
      const value = update.patch[groupsField.id];
      if (value === undefined) continue;
      const pairs = collectTkpStageDepartmentPairs(value).length;
      if (!best || pairs > best.pairs) {
        best = { recordId: update.recordId, value, pairs };
      }
    }

    for (const update of list) {
      const patch = { ...update.patch };
      if (best && patch[groupsField.id] !== undefined) {
        if (update.recordId === best.recordId) {
          patch[groupsField.id] = best.value;
        } else {
          delete patch[groupsField.id];
        }
      }
      if (Object.keys(patch).length === 0) continue;
      coalesced.push({ ...update, patch });
    }
  }

  return coalesced;
}

export async function persistRelatedAskUpdates(
  updates: RelatedAskPersistUpdate[],
  options?: {
    entities?: readonly Entity[];
    parentEntity?: Entity | null;
    parentRecord?: EntityRecord | null;
  },
) {
  const entities = options?.entities ?? [];
  const normalized = coalesceDeptCalculationUpdates(updates, entities);
  for (const update of normalized) {
    const entity = entities.find((item) => item.id === update.entityId) ?? null;
    if (entity && isDeptCalculationsEntity(entity)) {
      await persistDeptCalculationRelatedUpdate({
        entity,
        recordId: update.recordId,
        patch: update.patch,
        entities,
        parentEntity: options?.parentEntity ?? null,
        parentRecord: options?.parentRecord ?? null,
      });
      continue;
    }
    await updateEntityRecord(update.entityId, update.recordId, update.patch);
  }
}

export async function validateRelatedAskRequired(options: {
  triggerEntity: Entity;
  entities: Entity[];
  fieldAccess: AutomationOutcomeFieldAccess;
  values: Record<string, string>;
  triggerRecordId: string;
  ctx?: EntityValueContext;
  assigneeUserId?: string | null;
  assigneeUserIds?: readonly string[] | null;
  leadParent?: { entity: Entity; record: EntityRecord } | null;
  restrictToOwnDepartments?: boolean;
  isFieldFilled: (
    field: EntityField,
    value: string,
    relationGroupsMode?: "full" | "items" | "nested",
  ) => boolean;
}): Promise<string | null> {
  const {
    fieldAccess,
    values,
    triggerEntity,
    entities,
    triggerRecordId,
    ctx,
    assigneeUserId = null,
    assigneeUserIds = null,
    leadParent = null,
    restrictToOwnDepartments = false,
    isFieldFilled,
  } = options;
  if (fieldAccess.relatedRequiredIds.length === 0) return null;

  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );
  if (requiredAsks.length === 0) return null;

  const missingLabels: string[] = [];

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
    if (!resolved || resolved.relatedRecordIds.length === 0 || !field) {
      missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      continue;
    }

    // Collapsed «Расчёты отделов» · «Стадия/отделы»: one merged tree on the
    // primary draft — do not require every fan-out sibling key to be filled.
    const groupsField = findDeptCalculationsGroupsField(resolved.relatedEntity);
    if (
      isDeptCalculationsEntity(resolved.relatedEntity) &&
      groupsField?.id === ask.fieldId
    ) {
      const richest = richestRelatedGroupsDraft({
        scopeKey: resolved.scopeKey,
        fieldId: ask.fieldId,
        relatedRecordIds: resolved.relatedRecordIds,
        values,
      });
      if (
        !isFieldFilled(
          field,
          richest?.value ?? "",
          ask.relationGroupsMode ?? "full",
        )
      ) {
        missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      }
      continue;
    }

    // Table-owned host fields (срок / описание): validate assignee’s live rows.
    const hostFields = isDeptCalculationsEntity(resolved.relatedEntity)
      ? resolveDeptCalculationsHostFields(resolved.relatedEntity)
      : null;
    const isTableHostField =
      hostFields != null &&
      (field.id === hostFields.deadline?.id ||
        field.id === hostFields.description?.id ||
        field.id === hostFields.comment?.id);
    if (isTableHostField) {
      const linked = await getEntityRecordsByIds(
        resolved.relatedEntity,
        resolved.relatedRecordIds,
      );
      const parent =
        leadParent ??
        ({
          entity: triggerEntity,
          record: {
            id: triggerRecordId,
            values,
            authUserId: null,
            createdBy: null,
            schemaVersion: 0,
          },
        } as const);
      const visible = await filterDeptCalculationRecordsForAssignee({
        entity: resolved.relatedEntity,
        records: linked,
        entities,
        assigneeUserId,
        assigneeUserIds,
        leadParent: parent,
        restrictToOwnDepartments,
      });
      const editableIds = await resolveEditableDeptCalculationRecordIds({
        entity: resolved.relatedEntity,
        records: visible,
        entities,
        assigneeUserId,
        assigneeUserIds,
        leadParent: parent,
        restrictToOwnDepartments,
      });
      const scoped = visible.filter((record) => editableIds.has(record.id));
      if (scoped.length === 0) {
        missingLabels.push(`${relationLabel} · ${fieldLabel}`);
        continue;
      }
      const incomplete = scoped.some((record) => {
        // The departments table is the editor and writes the row immediately.
        // The form snapshot is taken when the outcome opens and stays blank
        // after that save — do not let it hide the stored deadline.
        const live = record.values[ask.fieldId] ?? "";
        return !isFieldFilled(field, live, ask.relationGroupsMode ?? "full");
      });
      if (incomplete) missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      continue;
    }

    for (const relatedRecordId of resolved.relatedRecordIds) {
      const key = relatedAskValueKey(
        resolved.scopeKey,
        relatedRecordId,
        ask.fieldId,
      );
      if (ctx) {
        const relatedRecord = await getEntityRecordById(
          resolved.relatedEntity,
          relatedRecordId,
        );
        const relatedMerged = {
          ...(relatedRecord?.values ?? {}),
          [ask.fieldId]: values[key] ?? "",
        };
        // Merge other draft keys for this related record when present.
        for (const other of fieldAccess.relatedVisibleFields) {
          if (other.fieldId === ask.fieldId) continue;
          const otherKey = relatedAskValueKey(
            resolved.scopeKey,
            relatedRecordId,
            other.fieldId,
          );
          if (otherKey in values) {
            relatedMerged[other.fieldId] = values[otherKey] ?? "";
          }
        }
        const draft = createEntityDraftRecord(relatedMerged, relatedRecordId);
        if (
          !isEntityFieldVisibleByConditions(
            ctx,
            resolved.relatedEntity,
            draft,
            field,
          )
        ) {
          continue;
        }
      }
      if (
        !isFieldFilled(
          field,
          values[key] ?? "",
          ask.relationGroupsMode ?? "full",
        )
      ) {
        missingLabels.push(`${relationLabel} · ${fieldLabel}`);
        break;
      }
    }
  }

  if (missingLabels.length === 0) return null;
  return `Заполните: ${[...new Set(missingLabels)].join(", ")}`;
}

export async function countMissingRelatedRequired(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  relatedRequiredIds: string[];
  values: Record<string, string>;
  triggerRecordId: string;
  ctx?: EntityValueContext;
  isFieldFilled: (
    field: EntityField,
    value: string,
    relationGroupsMode?: "full" | "items" | "nested",
  ) => boolean;
}): Promise<number> {
  if (options.relatedRequiredIds.length === 0) return 0;
  const message = await validateRelatedAskRequired({
    triggerEntity: options.triggerEntity,
    entities: options.entities,
    fieldAccess: {
      requiredFieldIds: [],
      visibleFieldIds: [],
      requireAttachment: false,
      commentFieldIds: [],
      recordFieldIds: [],
      relatedVisibleFields: options.relatedFields,
      relatedRequiredIds: options.relatedRequiredIds,
      relatedCommentIds: [],
      relatedRecordIds: [],
      reasonFieldId: null,
      relatedReasonId: null,
      fieldAskOptions: {},
    },
    values: options.values,
    triggerRecordId: options.triggerRecordId,
    ctx: options.ctx,
    isFieldFilled: options.isFieldFilled,
  });
  if (!message) return 0;
  // Approximate badge count from unique labels after "Заполните: ".
  const labels = message.replace(/^Заполните:\s*/, "").split(", ");
  return labels.filter(Boolean).length;
}
