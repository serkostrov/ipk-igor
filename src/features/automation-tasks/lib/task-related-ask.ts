import {
  askRelatedScopeKey,
  relatedAskValueKey,
  resolveAskRelatedTarget,
  type AutomationAskRelatedField,
  type AutomationOutcomeFieldAccess,
} from "@/entities/automation";
import {
  getEntityRecordTitle,
  normalizeEntityFieldInputValue,
  resolveEntityFieldLabel,
  updateEntityRecord,
  type Entity,
  type EntityField,
  type EntityValueContext,
} from "@/entities/entity";

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
  fields: RelatedAskFieldRow[];
};

export type RelatedAskEmptyRelation = {
  relationFieldId: string;
  relationLabel: string;
};

export function resolveRelatedAskLayout(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  relatedRequiredIds: string[];
  /** Trigger form values (local fields), used to read relation ids. */
  triggerValues: Record<string, string>;
  triggerRecordId: string;
  ctx: EntityValueContext;
}): {
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
} {
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

  for (const [, asks] of byScope) {
    const sample = asks[0];
    if (!sample) continue;
    const resolved = resolveAskRelatedTarget({
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

    for (const relatedRecordId of resolved.relatedRecordIds) {
      const relatedRecord = resolved.relatedEntity.records.find(
        (item) => item.id === relatedRecordId,
      );
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
      groups.push({
        relationFieldId: resolved.scopeKey,
        relationLabel: resolved.label,
        relatedEntity: resolved.relatedEntity,
        relatedRecordId,
        relatedRecordTitle: relatedRecord
          ? getEntityRecordTitle(ctx, resolved.relatedEntity, relatedRecord)
          : relatedRecordId,
        fields,
      });
    }
  }

  return { groups, emptyRelations };
}

/** Seed namespaced related values from related entity records. */
export function seedRelatedAskValues(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  triggerValues: Record<string, string>;
  triggerRecordId: string;
  /** Existing draft — keeps user edits for still-active keys. */
  currentValues?: Record<string, string>;
}): Record<string, string> {
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
    const resolved = resolveAskRelatedTarget({
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
      const relatedRecord = resolved.relatedEntity.records.find(
        (item) => item.id === relatedRecordId,
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
export function syncRelatedAskValuesAfterLocalChange(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  changedFieldId: string;
  values: Record<string, string>;
  triggerRecordId: string;
}): Record<string, string> {
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

/** Build per-related-record patches from form values. */
export function buildRelatedAskPersistUpdates(options: {
  triggerEntity: Entity;
  entities: Entity[];
  fieldAccess: AutomationOutcomeFieldAccess | AutomationOutcomeFieldAccess[];
  /** Local + related namespaced form values. */
  values: Record<string, string>;
  triggerRecordId: string;
  /** Skip writing when equal to live related record values. */
  skipUnchanged?: boolean;
}): RelatedAskPersistUpdate[] {
  const accesses = Array.isArray(options.fieldAccess)
    ? options.fieldAccess
    : [options.fieldAccess];
  const byTarget = new Map<string, Record<string, string>>();

  for (const access of accesses) {
    const recordAskIds = new Set(access.relatedRecordIds);
    for (const ask of access.relatedVisibleFields) {
      if (!recordAskIds.has(ask.id)) continue;
      const resolved = resolveAskRelatedTarget({
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
      for (const relatedRecordId of resolved.relatedRecordIds) {
        const key = relatedAskValueKey(
          resolved.scopeKey,
          relatedRecordId,
          ask.fieldId,
        );
        if (options.values[key] === undefined) continue;
        const next = options.values[key]!;
        if (options.skipUnchanged) {
          const relatedRecord = resolved.relatedEntity.records.find(
            (item) => item.id === relatedRecordId,
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

export async function persistRelatedAskUpdates(
  updates: RelatedAskPersistUpdate[],
) {
  for (const update of updates) {
    await updateEntityRecord(update.entityId, update.recordId, update.patch);
  }
}

export function validateRelatedAskRequired(options: {
  triggerEntity: Entity;
  entities: Entity[];
  fieldAccess: AutomationOutcomeFieldAccess;
  values: Record<string, string>;
  triggerRecordId: string;
  isFieldFilled: (
    field: EntityField,
    value: string,
    relationGroupsMode?: "full" | "items" | "nested",
  ) => boolean;
}): string | null {
  const {
    fieldAccess,
    values,
    triggerEntity,
    entities,
    triggerRecordId,
    isFieldFilled,
  } = options;
  if (fieldAccess.relatedRequiredIds.length === 0) return null;

  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );
  if (requiredAsks.length === 0) return null;

  const missingLabels: string[] = [];

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
    if (!resolved || resolved.relatedRecordIds.length === 0 || !field) {
      missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      continue;
    }
    for (const relatedRecordId of resolved.relatedRecordIds) {
      const key = relatedAskValueKey(
        resolved.scopeKey,
        relatedRecordId,
        ask.fieldId,
      );
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

export function countMissingRelatedRequired(options: {
  triggerEntity: Entity;
  entities: Entity[];
  relatedFields: AutomationAskRelatedField[];
  relatedRequiredIds: string[];
  values: Record<string, string>;
  triggerRecordId: string;
  isFieldFilled: (
    field: EntityField,
    value: string,
    relationGroupsMode?: "full" | "items" | "nested",
  ) => boolean;
}): number {
  if (options.relatedRequiredIds.length === 0) return 0;
  const message = validateRelatedAskRequired({
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
      fieldAskOptions: {},
    },
    values: options.values,
    triggerRecordId: options.triggerRecordId,
    isFieldFilled: options.isFieldFilled,
  });
  if (!message) return 0;
  // Approximate badge count from unique labels after "Заполните: ".
  const labels = message.replace(/^Заполните:\s*/, "").split(", ");
  return labels.filter(Boolean).length;
}
