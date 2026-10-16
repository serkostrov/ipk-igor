/** How to resolve task assignee(s) from the trigger record. */
export type AutomationAssigneeResolver =
  | { type: "fixedUsers"; userIds: string[] }
  | { type: "field"; fieldId: string }
  | { type: "relationFieldFanOut"; fieldId: string }
  | { type: "currentUser" }
  | { type: "recordCreator" };

export const AUTOMATION_ASSIGNEE_TYPE_LABELS: Record<
  AutomationAssigneeResolver["type"],
  string
> = {
  fixedUsers: "Конкретные пользователи",
  field: "Поле связи (один)",
  relationFieldFanOut: "Поле связи (на каждого)",
  currentUser: "Текущий пользователь",
  recordCreator: "Автор записи",
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
      const fieldId = typeof raw.fieldId === "string" ? raw.fieldId.trim() : "";
      if (!fieldId) return defaultAssigneeResolver();
      return { type, fieldId };
    }
    case "recordCreator":
      return { type: "recordCreator" };
    case "currentUser":
    default:
      return { type: "currentUser" };
  }
}
