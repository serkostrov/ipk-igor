import {
  getCurrentUserRecordId,
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

export type ResolveAutomationActionValueOptions = {
  createdRecordIds?: string[];
  actorUserId?: string | null;
  fieldType?: EntityFieldType;
  datetimeWithTime?: boolean;
};

/** Resolve literal / `{{fieldId}}` / dynamic tokens for action values. */
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

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    return values[match[1]!.trim()] ?? "";
  }

  // Partial templates: replace every {{fieldId}} occurrence.
  if (raw.includes("{{")) {
    return raw.replace(/\{\{([^}]+)\}\}/g, (_, fieldId: string) => {
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
