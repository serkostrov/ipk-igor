import {
  getCurrentUserRecordId,
  getEntityRelationTargetId,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityFieldType,
} from "@/entities/entity";
import {
  addCalendarDays,
  nowTimeHHmm,
  todayIsoDate,
} from "@/shared/lib/business-days";

/** Dynamic tokens stored in `setField.value` / mappings — resolved at runtime. */
export const AUTOMATION_VALUE_TODAY = "__today__";
export const AUTOMATION_VALUE_TOMORROW = "__tomorrow__";
export const AUTOMATION_VALUE_NOW = "__now__";
export const AUTOMATION_VALUE_TIME_NOW = "__timeNow__";
export const AUTOMATION_VALUE_CURRENT_USER = "__currentUser__";

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
  values?: Record<string, string>;
};

function resolveRelatedFieldValue(
  relationFieldId: string,
  nestedFieldId: string,
  options: ResolveAutomationActionValueOptions,
): string {
  if (options.getRelatedFieldValue) {
    return options.getRelatedFieldValue(relationFieldId, nestedFieldId);
  }
  const values = options.values;
  const entities = options.entities;
  const triggerEntityId = options.triggerEntityId;
  if (!values || !entities || !triggerEntityId) return "";

  const trigger = entities.find((entity) => entity.id === triggerEntityId);
  const relationField = trigger?.fields.find(
    (field) => field.id === relationFieldId && field.type === "relation",
  );
  if (!relationField) return "";

  const relatedId = parseEntityRelationIds(values[relationFieldId])[0];
  if (!relatedId) return "";

  const targetId = getEntityRelationTargetId(relationField);
  const relatedEntity =
    (targetId ? entities.find((entity) => entity.id === targetId) : null) ??
    entities.find((entity) =>
      entity.records.some((record) => record.id === relatedId),
    );
  if (!relatedEntity) return "";
  const relatedRecord = relatedEntity.records.find(
    (record) => record.id === relatedId,
  );
  return relatedRecord?.values[nestedFieldId] ?? "";
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
    return values[match[1]!.trim()] ?? "";
  }

  // Partial templates: replace every {{fieldId}} occurrence (not dotted paths).
  if (raw.includes("{{")) {
    return raw.replace(/\{\{([^.}]+)\}\}/g, (_, fieldId: string) => {
      const key = fieldId.trim();
      if (key === "created") {
        const ids = options.createdRecordIds ?? [];
        return ids[ids.length - 1] ?? "";
      }
      return values[key] ?? "";
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
  if (raw === "true") return "Да";
  if (raw === "false") return "Нет";

  const path = parseAutomationEntityPathRef(raw);
  if (path) {
    const relationName =
      fieldNameById?.(path.relationFieldId) ?? path.relationFieldId;
    const nestedName = fieldNameById?.(path.fieldId) ?? path.fieldId;
    return `Из «${relationName}» · «${nestedName}»`;
  }

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    const fieldId = match[1]!.trim();
    if (fieldId === "created") return "Созданная запись";
    const name = fieldNameById?.(fieldId) ?? fieldId;
    return `Из поля «${name}»`;
  }

  if (field?.type === "list") {
    const option = field.listOptions.find((item) => item.id === raw);
    if (option) return option.name;
  }

  return raw;
}
