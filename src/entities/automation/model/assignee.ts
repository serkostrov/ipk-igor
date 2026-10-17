/** How to resolve task assignee(s) from the trigger record / catalog. */
export type AutomationAssigneeResolver =
  | { type: "fixedUsers"; userIds: string[] }
  | { type: "field"; fieldId: string }
  | { type: "relationFieldFanOut"; fieldId: string }
  | { type: "role"; roleId: string }
  | { type: "currentUser" }
  | { type: "recordCreator" };

export const AUTOMATION_ASSIGNEE_TYPE_LABELS: Record<
  AutomationAssigneeResolver["type"],
  string
> = {
  fixedUsers: "Конкретные пользователи",
  field: "Поле связи (один)",
  relationFieldFanOut: "Поле связи (на каждого)",
  role: "Роль",
  currentUser: "Текущий пользователь",
  recordCreator: "Автор записи",
};

export const AUTOMATION_ASSIGNEE_TYPE_HINTS: Record<
  AutomationAssigneeResolver["type"],
  string
> = {
  fixedUsers: "Задача уйдёт выбранным пользователям.",
  field:
    "Исполнитель — человек из поля связи на записи. Если там несколько — берётся первый.",
  relationFieldFanOut:
    "Отдельная задача на каждого, кто указан в поле связи на записи.",
  role: "Задача у всех пользователей с выбранной ролью.",
  currentUser: "Исполнитель — тот, кто вызвал переход / изменение.",
  recordCreator: "Исполнитель — автор записи (если известен).",
};

export function defaultAssigneeResolver(): AutomationAssigneeResolver {
  return { type: "currentUser" };
}

export function normalizeAssigneeResolver(
  value: unknown,
): AutomationAssigneeResolver {
  if (!value || typeof value !== "object") return defaultAssigneeResolver();
  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type : "";
  switch (type) {
    case "fixedUsers": {
      const userIds = Array.isArray(raw.userIds)
        ? raw.userIds.filter((id): id is string => typeof id === "string")
        : [];
      return { type: "fixedUsers", userIds };
    }
    case "field":
    case "relationFieldFanOut": {
      const fieldIdRaw = raw.fieldId ?? raw.field_id;
      const fieldId = typeof fieldIdRaw === "string" ? fieldIdRaw.trim() : "";
      if (!fieldId) return defaultAssigneeResolver();
      return { type, fieldId };
    }
    case "role": {
      const roleId =
        typeof raw.roleId === "string"
          ? raw.roleId.trim()
          : typeof raw.role_id === "string"
            ? raw.role_id.trim()
            : "";
      if (!roleId) return defaultAssigneeResolver();
      return { type: "role", roleId };
    }
    case "recordCreator":
      return { type: "recordCreator" };
    case "currentUser":
    default:
      return { type: "currentUser" };
  }
}
