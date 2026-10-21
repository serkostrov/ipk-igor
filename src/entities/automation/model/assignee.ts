import {
  emptyAutomationConditions,
  normalizeAutomationConditions,
  type AutomationConditions,
} from "./conditions";

/** Leaf ways to pick people (no nesting). */
export type AutomationAssigneeLeafResolver =
  | { type: "none" }
  | { type: "fixedUsers"; userIds: string[] }
  | { type: "field"; fieldId: string }
  | { type: "relationFieldFanOut"; fieldId: string }
  | {
      type: "relatedField";
      /** First relation hop from the trigger record. */
      relationFieldId: string;
      /**
       * Extra relation hops after `relationFieldId` (deep nesting).
       * Empty / omitted = one hop: trigger → related → user field.
       */
      via?: string[];
      /** User field on the entity reached by the relation path. */
      fieldId: string;
      /**
       * When true — every related / nested record and every user in the leaf
       * field (separate tasks). Otherwise only the first.
       */
      fanOut?: boolean;
    }
  | { type: "role"; roleId: string }
  | { type: "currentUser" }
  | { type: "recordCreator" };

export type AutomationAssigneeBranch = {
  id: string;
  label: string;
  conditions: AutomationConditions;
  resolver: AutomationAssigneeLeafResolver;
};

/** How to resolve task assignee(s) from the trigger record / catalog. */
export type AutomationAssigneeResolver =
  | AutomationAssigneeLeafResolver
  | {
      type: "conditional";
      branches: AutomationAssigneeBranch[];
      elseResolver: AutomationAssigneeLeafResolver;
    };

/** Compact labels (canvas, lists). */
export const AUTOMATION_ASSIGNEE_TYPE_LABELS: Record<
  AutomationAssigneeResolver["type"],
  string
> = {
  none: "Никто",
  fixedUsers: "Выбранные пользователи",
  field: "Поле · первый",
  relationFieldFanOut: "Поле · каждый",
  relatedField: "Через связанную запись",
  role: "По роли",
  currentUser: "Кто запустил",
  recordCreator: "Автор записи",
  conditional: "По условию",
};

export const AUTOMATION_ASSIGNEE_TYPE_HINTS: Record<
  AutomationAssigneeLeafResolver["type"],
  string
> = {
  none: "Исполнитель не назначается.",
  fixedUsers: "Задача уйдёт выбранным пользователям.",
  field:
    "Человек из поля этой записи или через связь / вложенность (Менеджер, ГИП…). Если в поле несколько — только первый.",
  relationFieldFanOut:
    "Отдельная задача на каждого из поля на этой записи (например всех наблюдателей).",
  relatedField:
    "Через связь или вложенность: связанная запись → … → поле с человеком (Менеджер, ГИП…).",
  role: "Задача появится у всех пользователей с выбранной ролью.",
  currentUser: "Исполнитель — тот, кто вызвал переход или изменение стадии.",
  recordCreator: "Исполнитель — автор записи (если он известен).",
};

export const AUTOMATION_WATCHER_TYPE_HINTS: Record<
  AutomationAssigneeLeafResolver["type"],
  string
> = {
  none: "Наблюдатели не назначаются — уведомления о задаче никому дополнительно не уходят.",
  fixedUsers: "Уведомления получат выбранные пользователи.",
  field:
    "Человек из поля этой записи или через связь / вложенность. Если в поле несколько — только первый.",
  relationFieldFanOut:
    "Наблюдателем станет каждый из поля на этой записи (уведомления, без обязанности выполнять).",
  relatedField:
    "Через связь или вложенность: связанная запись → … → поле с человеком.",
  role: "Наблюдатели — все пользователи с выбранной ролью.",
  currentUser: "Наблюдатель — тот, кто вызвал переход или изменение стадии.",
  recordCreator: "Наблюдатель — автор записи (если он известен).",
};

export const AUTOMATION_RECIPIENT_TYPE_HINTS: Record<
  AutomationAssigneeLeafResolver["type"],
  string
> = {
  none: "Получатели не назначаются — уведомление никому не уходит.",
  fixedUsers: "Уведомление получат выбранные пользователи.",
  field:
    "Человек из поля этой записи или через связь / вложенность. Если в поле несколько — берётся первый.",
  relationFieldFanOut: "Отдельное уведомление каждому из поля на этой записи",
  relatedField:
    "Через связь или вложенность: связанная запись → … → поле с человеком.",
  role: "Уведомление всем пользователям с выбранной ролью.",
  currentUser:
    "Получатель — тот, кто вызвал действие (назначение / завершение).",
  recordCreator: "Получатель — автор записи (если известен).",
};

export type AutomationAssigneeEditorMode = "assignee" | "watcher" | "recipient";

/** Primary source options in the editor. */
export type AutomationAssigneeSourceKind =
  | "none"
  | "fromField"
  | "fromRelated"
  | "conditional"
  | "fixedUsers"
  | "role"
  | "currentUser"
  | "recordCreator";

export const AUTOMATION_ASSIGNEE_SOURCE_ORDER: AutomationAssigneeSourceKind[] =
  [
    "none",
    "conditional",
    "fromField",
    // fromRelated kept in the type for legacy payloads; UI maps it to fromField.
    "fixedUsers",
    "role",
    "currentUser",
    "recordCreator",
  ];

export const AUTOMATION_ASSIGNEE_SOURCE_LABELS: Record<
  AutomationAssigneeEditorMode,
  Record<AutomationAssigneeSourceKind, string>
> = {
  assignee: {
    none: "Никто",
    conditional: "По условию",
    fromField: "Из поля записи",
    fromRelated: "Из поля записи",
    fixedUsers: "Выбранные пользователи",
    role: "Все с ролью",
    currentUser: "Тот, кто запустил",
    recordCreator: "Автор записи",
  },
  watcher: {
    none: "Никто",
    conditional: "По условию",
    fromField: "Из поля записи",
    fromRelated: "Из поля записи",
    fixedUsers: "Выбранные пользователи",
    role: "Все с ролью",
    currentUser: "Тот, кто запустил",
    recordCreator: "Автор записи",
  },
  recipient: {
    none: "Никто",
    conditional: "По условию",
    fromField: "Из поля записи",
    fromRelated: "Из поля записи",
    fixedUsers: "Выбранные пользователи",
    role: "Все с ролью",
    currentUser: "Тот, кто вызвал действие",
    recordCreator: "Автор записи",
  },
};

export function createAutomationAssigneeBranchId() {
  return `aabr-${crypto.randomUUID()}`;
}

export function assigneeSourceKind(
  value: AutomationAssigneeResolver,
): AutomationAssigneeSourceKind {
  if (value.type === "conditional") return "conditional";
  if (value.type === "none") return "none";
  if (
    value.type === "relatedField" ||
    value.type === "field" ||
    value.type === "relationFieldFanOut"
  ) {
    return "fromField";
  }
  return value.type;
}

/** Relation hops for a relatedField resolver (first + via). */
export function relatedFieldRelationPath(
  value: Extract<AutomationAssigneeLeafResolver, { type: "relatedField" }>,
): string[] {
  const via = value.via?.filter((id) => id.trim()) ?? [];
  return [value.relationFieldId, ...via].filter((id) => id.trim());
}

export function defaultAssigneeResolver(): AutomationAssigneeResolver {
  return { type: "currentUser" };
}

/** Optional watchers / recipients — empty by default. */
export function defaultWatcherResolver(): AutomationAssigneeResolver {
  return { type: "none" };
}

export function defaultAssigneeLeafResolver(): AutomationAssigneeLeafResolver {
  return { type: "currentUser" };
}

export function defaultConditionalAssigneeResolver(): Extract<
  AutomationAssigneeResolver,
  { type: "conditional" }
> {
  return {
    type: "conditional",
    branches: [
      {
        id: createAutomationAssigneeBranchId(),
        label: "Если",
        conditions: emptyAutomationConditions(),
        resolver: defaultAssigneeLeafResolver(),
      },
    ],
    elseResolver: defaultAssigneeLeafResolver(),
  };
}

function normalizeLeafResolver(value: unknown): AutomationAssigneeLeafResolver {
  if (!value || typeof value !== "object") return defaultAssigneeLeafResolver();
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
      if (!fieldId) return defaultAssigneeLeafResolver();
      return { type, fieldId };
    }
    case "relatedField": {
      const pathFromArray = Array.isArray(raw.relationPath)
        ? raw.relationPath.filter(
            (id): id is string => typeof id === "string" && Boolean(id.trim()),
          )
        : Array.isArray(raw.relation_path)
          ? raw.relation_path.filter(
              (id): id is string =>
                typeof id === "string" && Boolean(id.trim()),
            )
          : [];
      const relationFieldId = (
        pathFromArray[0] ??
        (typeof raw.relationFieldId === "string"
          ? raw.relationFieldId
          : typeof raw.relation_field_id === "string"
            ? raw.relation_field_id
            : "")
      ).trim();
      const viaRaw = Array.isArray(raw.via)
        ? raw.via
        : pathFromArray.length > 1
          ? pathFromArray.slice(1)
          : [];
      const via = viaRaw.filter(
        (id): id is string => typeof id === "string" && Boolean(id.trim()),
      );
      const fieldId = (
        typeof raw.fieldId === "string"
          ? raw.fieldId
          : typeof raw.field_id === "string"
            ? raw.field_id
            : ""
      ).trim();
      if (!relationFieldId || !fieldId) return defaultAssigneeLeafResolver();
      const fanOut = raw.fanOut === true || raw.fan_out === true;
      const base = via.length > 0
        ? { type: "relatedField" as const, relationFieldId, via, fieldId }
        : { type: "relatedField" as const, relationFieldId, fieldId };
      return fanOut ? { ...base, fanOut: true } : base;
    }
    case "role": {
      const roleId =
        typeof raw.roleId === "string"
          ? raw.roleId.trim()
          : typeof raw.role_id === "string"
            ? raw.role_id.trim()
            : "";
      if (!roleId) return defaultAssigneeLeafResolver();
      return { type: "role", roleId };
    }
    case "recordCreator":
      return { type: "recordCreator" };
    case "none":
      return { type: "none" };
    case "currentUser":
    default:
      return { type: "currentUser" };
  }
}

function normalizeBranch(
  raw: unknown,
  index: number,
): AutomationAssigneeBranch {
  const item =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id =
    typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : `aabr-${index}`;
  const label =
    typeof item.label === "string" && item.label.trim()
      ? item.label.trim()
      : "Если";
  return {
    id,
    label,
    conditions: normalizeAutomationConditions(item.conditions),
    resolver: normalizeLeafResolver(item.resolver),
  };
}

export function normalizeAssigneeResolver(
  value: unknown,
): AutomationAssigneeResolver {
  if (!value || typeof value !== "object") return defaultAssigneeResolver();
  const raw = value as Record<string, unknown>;
  if (raw.type === "conditional") {
    const branchesRaw = Array.isArray(raw.branches) ? raw.branches : [];
    const branches =
      branchesRaw.length > 0
        ? branchesRaw.map((item, index) => normalizeBranch(item, index))
        : defaultConditionalAssigneeResolver().branches;
    return {
      type: "conditional",
      branches,
      elseResolver: normalizeLeafResolver(
        raw.elseResolver ?? raw.else_resolver,
      ),
    };
  }
  return normalizeLeafResolver(value);
}
