import {
  getCurrentUserRecordId,
  getEntityRelationTargetId,
  isEntityNameField,
  parseEntityRelationIds,
  resolveRelationRecordLabel,
  serializeEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityFieldType,
} from "@/entities/entity";
import {
  addCalendarDays,
  nowTimeHHmm,
  todayIsoDate,
} from "@/shared/lib/business-days";

function wantsRelationIds(fieldType: EntityFieldType | undefined) {
  return fieldType === "relation" || fieldType === "dependencies";
}

/** Human label for a trigger record (name field), never a raw id. */
function resolveTriggerRecordLabel(
  options: ResolveAutomationActionValueOptions,
  recordId: string,
): string {
  const entity = options.entities?.find(
    (item) => item.id === options.triggerEntityId,
  );
  if (!entity) return "";
  const label = resolveRelationRecordLabel(entity, recordId)?.trim() ?? "";
  if (!label || label === "Без названия" || label === recordId) return "";
  return label;
}

/**
 * When copying a relation field into text, resolve ids to labels.
 * Relation/dependencies targets keep raw ids.
 */
function resolveCopiedFieldValue(
  sourceFieldId: string,
  rawValue: string,
  options: ResolveAutomationActionValueOptions,
): string {
  if (!rawValue || wantsRelationIds(options.fieldType)) return rawValue;
  const trigger = options.entities?.find(
    (item) => item.id === options.triggerEntityId,
  );
  const sourceField = trigger?.fields.find((item) => item.id === sourceFieldId);
  if (sourceField?.type !== "relation") return rawValue;
  const targetId = getEntityRelationTargetId(sourceField);
  const target = targetId
    ? (options.entities?.find((item) => item.id === targetId) ?? null)
    : null;
  const label = resolveRelationRecordLabel(target, rawValue)?.trim() ?? "";
  if (!label || label === "Без названия") return "";
  return label;
}

/** Nested relation → text: resolve the nested field if it stores relation ids. */
function resolveNestedFieldDisplayValue(
  relatedEntity: Entity,
  nestedFieldId: string,
  rawValue: string,
  options: ResolveAutomationActionValueOptions,
): string {
  if (!rawValue || wantsRelationIds(options.fieldType)) return rawValue;
  const nestedField = relatedEntity.fields.find(
    (item) => item.id === nestedFieldId,
  );
  if (nestedField?.type === "relation") {
    const targetId = getEntityRelationTargetId(nestedField);
    const target = targetId
      ? (options.entities?.find((item) => item.id === targetId) ?? null)
      : null;
    const label = resolveRelationRecordLabel(target, rawValue)?.trim() ?? "";
    if (!label || label === "Без названия") return "";
    return label;
  }
  if (isEntityNameField(nestedField ?? { locked: false })) {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith("record-")) return "";
  }
  return rawValue;
}

/** Dynamic tokens stored in `setField.value` / mappings — resolved at runtime. */
export const AUTOMATION_VALUE_TODAY = "__today__";
export const AUTOMATION_VALUE_TOMORROW = "__tomorrow__";
export const AUTOMATION_VALUE_NOW = "__now__";
export const AUTOMATION_VALUE_TIME_NOW = "__timeNow__";
export const AUTOMATION_VALUE_CURRENT_USER = "__currentUser__";
/** Trigger record of the running automation (link from createRecord mappings). */
export const AUTOMATION_VALUE_CURRENT_RECORD = "__currentRecord__";

/** `{{fieldId}}` — value from a field on the same record. */
export function isAutomationFieldRef(value: string) {
  return /^\{\{[^.}]+\}\}$/.test(value.trim());
}

/** `{{relationFieldId.nestedFieldId}}` — value from a related record. */
export function isAutomationEntityPathRef(value: string) {
  return /^\{\{[^.}]+\.[^}]+\}\}$/.test(value.trim());
}

export function parseAutomationFieldRef(value: string): string | null {
  const match = value.trim().match(/^\{\{([^.}]+)\}\}$/);
  return match?.[1]?.trim() || null;
}

export function parseAutomationEntityPathRef(
  value: string,
): { relationFieldId: string; fieldId: string } | null {
  const match = value.trim().match(/^\{\{([^.}]+)\.([^}]+)\}\}$/);
  if (!match) return null;
  const relationFieldId = match[1]?.trim() ?? "";
  const fieldId = match[2]?.trim() ?? "";
  if (!relationFieldId || !fieldId) return null;
  return { relationFieldId, fieldId };
}

export function toAutomationFieldRef(fieldId: string) {
  return fieldId ? `{{${fieldId}}}` : "";
}

export function toAutomationEntityPathRef(
  relationFieldId: string,
  fieldId: string,
) {
  return relationFieldId && fieldId ? `{{${relationFieldId}.${fieldId}}}` : "";
}

export type ResolveAutomationActionValueOptions = {
  createdRecordIds?: string[];
  actorUserId?: string | null;
  fieldType?: EntityFieldType;
  datetimeWithTime?: boolean;
  /**
   * Resolve `{{relationFieldId.nestedFieldId}}` using the current record’s
   * relation value and the related entity’s records.
   */
  getRelatedFieldValue?: (
    relationFieldId: string,
    nestedFieldId: string,
  ) => string;
  entities?: Entity[];
  triggerEntityId?: string;
  triggerRecordId?: string;
  values?: Record<string, string>;
};

function resolveRelatedFieldValue(
  relationFieldId: string,
  nestedFieldId: string,
  options: ResolveAutomationActionValueOptions,
): string {
  const values = options.values;
  const entities = options.entities;
  const triggerEntityId = options.triggerEntityId;

  if (options.getRelatedFieldValue) {
    const rawValue = options.getRelatedFieldValue(
      relationFieldId,
      nestedFieldId,
    );
    if (!entities || !triggerEntityId) return rawValue;
    const trigger = entities.find((entity) => entity.id === triggerEntityId);
    const relationField = trigger?.fields.find(
      (field) => field.id === relationFieldId && field.type === "relation",
    );
    const targetId = relationField
      ? getEntityRelationTargetId(relationField)
      : null;
    const relatedEntity = targetId
      ? (entities.find((entity) => entity.id === targetId) ?? null)
      : null;
    if (!relatedEntity) return rawValue;
    return resolveNestedFieldDisplayValue(
      relatedEntity,
      nestedFieldId,
      rawValue,
      options,
    );
  }

  if (!values || !entities || !triggerEntityId) return "";

  const trigger = entities.find((entity) => entity.id === triggerEntityId);
  const relationField = trigger?.fields.find(
    (field) => field.id === relationFieldId && field.type === "relation",
  );
  if (!relationField) return "";

  const relatedIds = parseEntityRelationIds(values[relationFieldId]);
  if (relatedIds.length === 0) return "";

  const targetId = getEntityRelationTargetId(relationField);
  const relatedEntity =
    (targetId ? entities.find((entity) => entity.id === targetId) : null) ??
    entities.find((entity) =>
      entity.records.some((record) => record.id === relatedIds[0]),
    );
  if (!relatedEntity) return "";

  // Union nested values across every selected related record (multi-relations).
  const nestedParts: string[] = [];
  for (const relatedId of relatedIds) {
    const relatedRecord = relatedEntity.records.find(
      (record) => record.id === relatedId,
    );
    const rawValue = relatedRecord?.values[nestedFieldId] ?? "";
    const part = resolveNestedFieldDisplayValue(
      relatedEntity,
      nestedFieldId,
      rawValue,
      options,
    );
    if (!part) continue;
    if (wantsRelationIds(options.fieldType)) {
      nestedParts.push(...parseEntityRelationIds(part));
    } else {
      nestedParts.push(part);
    }
  }
  if (nestedParts.length === 0) return "";
  if (wantsRelationIds(options.fieldType)) {
    return serializeEntityRelationIds([...new Set(nestedParts)]);
  }
  return [...new Set(nestedParts)].join(", ");
}

/** Resolve literal / `{{fieldId}}` / `{{rel.field}}` / dynamic tokens. */
export function resolveAutomationActionValue(
  source: string,
  values: Record<string, string>,
  options: ResolveAutomationActionValueOptions = {},
): string {
  const raw = source.trim();
  if (!raw) return "";

  if (raw === AUTOMATION_VALUE_TODAY) {
    return todayIsoDate();
  }
  if (raw === AUTOMATION_VALUE_TOMORROW) {
    return addCalendarDays(todayIsoDate(), 1);
  }
  if (raw === AUTOMATION_VALUE_TIME_NOW) {
    return nowTimeHHmm();
  }
  if (raw === AUTOMATION_VALUE_NOW) {
    if (options.fieldType === "time") return nowTimeHHmm();
    if (
      options.fieldType === "datetime" &&
      options.datetimeWithTime === false
    ) {
      return todayIsoDate();
    }
    return `${todayIsoDate()}T${nowTimeHHmm()}`;
  }
  if (raw === AUTOMATION_VALUE_CURRENT_USER) {
    return options.actorUserId?.trim() || getCurrentUserRecordId() || "";
  }
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) {
    const recordId = options.triggerRecordId?.trim() || "";
    if (!recordId) return "";
    if (wantsRelationIds(options.fieldType)) {
      return serializeEntityRelationIds([recordId]);
    }
    return resolveTriggerRecordLabel(options, recordId);
  }
  if (raw === "{{created}}" || raw === "created") {
    const ids = options.createdRecordIds ?? [];
    return ids[ids.length - 1] ?? "";
  }

  const path = parseAutomationEntityPathRef(raw);
  if (path) {
    return resolveRelatedFieldValue(path.relationFieldId, path.fieldId, {
      ...options,
      values: options.values ?? values,
    });
  }

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    const fieldId = match[1]!.trim();
    return resolveCopiedFieldValue(fieldId, values[fieldId] ?? "", options);
  }

  // Partial templates: replace every {{fieldId}} occurrence (not dotted paths).
  if (raw.includes("{{")) {
    return raw.replace(/\{\{([^.}]+)\}\}/g, (_, fieldId: string) => {
      const key = fieldId.trim();
      if (key === "created") {
        const ids = options.createdRecordIds ?? [];
        return ids[ids.length - 1] ?? "";
      }
      return resolveCopiedFieldValue(key, values[key] ?? "", options);
    });
  }

  return source;
}

/** Short Russian label for a stored action value (builder UI). */
export function describeAutomationActionValue(
  value: string,
  field: EntityField | null | undefined,
  fieldNameById?: (fieldId: string) => string,
): string {
  const raw = value.trim();
  if (!raw) return "Пустое значение";
  if (raw === AUTOMATION_VALUE_TODAY) return "Сегодня";
  if (raw === AUTOMATION_VALUE_TOMORROW) return "Завтра";
  if (raw === AUTOMATION_VALUE_NOW) {
    return field?.type === "time" ? "Сейчас" : "Сейчас";
  }
  if (raw === AUTOMATION_VALUE_TIME_NOW) return "Сейчас";
  if (raw === AUTOMATION_VALUE_CURRENT_USER) return "Текущий пользователь";
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) return "Текущая запись";
  if (raw === "true") return "Да";
  if (raw === "false") return "Нет";

  const path = parseAutomationEntityPathRef(raw);
  if (path) {
    const relationName = fieldNameById?.(path.relationFieldId) ?? "связь";
    const nestedName = fieldNameById?.(path.fieldId) ?? "поле";
    return `Из «${relationName}» · «${nestedName}»`;
  }

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    const fieldId = match[1]!.trim();
    if (fieldId === "created") return "Созданная запись";
    const name = fieldNameById?.(fieldId) ?? "поле";
    return `Из поля «${name}»`;
  }

  if (field?.type === "list") {
    const option = field.listOptions.find((item) => item.id === raw);
    if (option) return option.name;
  }

  return raw;
}
