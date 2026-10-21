import {
  relatedAskValueKey,
  type AutomationAskRelatedField,
  type AutomationOutcomeFieldAccess,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  getEntityRecordTitle,
  getEntityRelationTargetId,
  normalizeEntityFieldInputValue,
  parseEntityRelationIds,
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
};

export type RelatedAskGroup = {
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
    ctx,
  } = options;
  if (relatedFields.length === 0) {
    return { groups: [], emptyRelations: [] };
  }

  const entityById = new Map(entities.map((item) => [item.id, item]));
  const required = new Set(relatedRequiredIds);
  const byRelation = new Map<string, AutomationAskRelatedField[]>();
  for (const item of relatedFields) {
    const list = byRelation.get(item.relationFieldId) ?? [];
    list.push(item);
    byRelation.set(item.relationFieldId, list);
  }

  const groups: RelatedAskGroup[] = [];
  const emptyRelations: RelatedAskEmptyRelation[] = [];

  for (const [relationFieldId, asks] of byRelation) {
    const relationField = triggerEntity.fields.find(
      (field) => field.id === relationFieldId,
    );
    const relationLabel = relationField
      ? getEntityFieldDisplayName(relationField)
      : relationFieldId;
    const targetId = relationField
      ? getEntityRelationTargetId(relationField)
      : null;
    const relatedEntity = targetId ? entityById.get(targetId) : undefined;
    if (!relatedEntity) continue;

    const relatedIds = parseEntityRelationIds(triggerValues[relationFieldId]);
    if (relatedIds.length === 0) {
      emptyRelations.push({ relationFieldId, relationLabel });
      continue;
    }

    for (const relatedRecordId of relatedIds) {
      const relatedRecord = relatedEntity.records.find(
        (item) => item.id === relatedRecordId,
      );
      const fields: RelatedAskFieldRow[] = [];
      for (const ask of asks) {
        const field = relatedEntity.fields.find(
          (item) => item.id === ask.fieldId,
        );
        if (!field) continue;
        fields.push({
          askId: ask.id,
          field,
          required: required.has(ask.id),
          valueKey: relatedAskValueKey(
            relationFieldId,
            relatedRecordId,
            ask.fieldId,
          ),
        });
      }
      if (fields.length === 0) continue;
      groups.push({
        relationFieldId,
        relationLabel,
        relatedEntity,
        relatedRecordId,
        relatedRecordTitle: relatedRecord
          ? getEntityRecordTitle(ctx, relatedEntity, relatedRecord)
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
  /** Existing draft — keeps user edits for still-active keys. */
  currentValues?: Record<string, string>;
}): Record<string, string> {
  const {
    triggerEntity,
    entities,
    relatedFields,
    triggerValues,
    currentValues = {},
  } = options;
  const entityById = new Map(entities.map((item) => [item.id, item]));
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(currentValues)) {
    if (!key.startsWith("related:")) next[key] = value;
  }

  for (const ask of relatedFields) {
    const relationField = triggerEntity.fields.find(
      (field) => field.id === ask.relationFieldId,
    );
    const targetId = relationField
      ? getEntityRelationTargetId(relationField)
      : null;
    const relatedEntity = targetId ? entityById.get(targetId) : undefined;
    if (!relatedEntity) continue;
    const field = relatedEntity.fields.find((item) => item.id === ask.fieldId);
    if (!field) continue;

    const relatedIds = parseEntityRelationIds(
      triggerValues[ask.relationFieldId],
    );
    for (const relatedRecordId of relatedIds) {
      const key = relatedAskValueKey(
        ask.relationFieldId,
        relatedRecordId,
        ask.fieldId,
      );
      if (currentValues[key] !== undefined) {
        next[key] = currentValues[key]!;
        continue;
      }
      const relatedRecord = relatedEntity.records.find(
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
}): Record<string, string> {
  const usesRelation = options.relatedFields.some(
    (item) => item.relationFieldId === options.changedFieldId,
  );
  if (!usesRelation) return options.values;
  return seedRelatedAskValues({
    triggerEntity: options.triggerEntity,
    entities: options.entities,
    relatedFields: options.relatedFields,
    triggerValues: options.values,
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
  /** Skip writing when equal to live related record values. */
  skipUnchanged?: boolean;
}): RelatedAskPersistUpdate[] {
  const accesses = Array.isArray(options.fieldAccess)
    ? options.fieldAccess
    : [options.fieldAccess];
  const entityById = new Map(options.entities.map((item) => [item.id, item]));
  const byTarget = new Map<string, Record<string, string>>();

  for (const access of accesses) {
    const recordAskIds = new Set(access.relatedRecordIds);
    for (const ask of access.relatedVisibleFields) {
      if (!recordAskIds.has(ask.id)) continue;
      const relationField = options.triggerEntity.fields.find(
        (field) => field.id === ask.relationFieldId,
      );
      const targetId = relationField
        ? getEntityRelationTargetId(relationField)
        : null;
      const relatedEntity = targetId ? entityById.get(targetId) : undefined;
      if (!relatedEntity?.fields.some((field) => field.id === ask.fieldId)) {
        continue;
      }
      const relatedIds = parseEntityRelationIds(
        options.values[ask.relationFieldId],
      );
      for (const relatedRecordId of relatedIds) {
        const key = relatedAskValueKey(
          ask.relationFieldId,
          relatedRecordId,
          ask.fieldId,
        );
        if (options.values[key] === undefined) continue;
        const next = options.values[key]!;
        if (options.skipUnchanged) {
          const relatedRecord = relatedEntity.records.find(
            (item) => item.id === relatedRecordId,
          );
          if ((relatedRecord?.values[ask.fieldId] ?? "") === next) continue;
        }
        const mapKey = `${relatedEntity.id}:${relatedRecordId}`;
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
  isFieldFilled: (field: EntityField, value: string) => boolean;
}): string | null {
  const { fieldAccess, values, triggerEntity, entities, isFieldFilled } =
    options;
  if (fieldAccess.relatedRequiredIds.length === 0) return null;

  const requiredAsks = fieldAccess.relatedVisibleFields.filter((item) =>
    fieldAccess.relatedRequiredIds.includes(item.id),
  );
  if (requiredAsks.length === 0) return null;

  const entityById = new Map(entities.map((item) => [item.id, item]));
  const missingLabels: string[] = [];

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
    const relatedIds = parseEntityRelationIds(values[ask.relationFieldId]);
    if (relatedIds.length === 0) {
      missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      continue;
    }
    if (!field) {
      missingLabels.push(`${relationLabel} · ${fieldLabel}`);
      continue;
    }
    for (const relatedRecordId of relatedIds) {
      const key = relatedAskValueKey(
        ask.relationFieldId,
        relatedRecordId,
        ask.fieldId,
      );
      if (!isFieldFilled(field, values[key] ?? "")) {
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
  isFieldFilled: (field: EntityField, value: string) => boolean;
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
    isFieldFilled: options.isFieldFilled,
  });
  if (!message) return 0;
  // Approximate badge count from unique labels after "Заполните: ".
  const labels = message.replace(/^Заполните:\s*/, "").split(", ");
  return labels.filter(Boolean).length;
}
