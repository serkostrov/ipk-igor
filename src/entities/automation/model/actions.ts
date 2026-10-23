/**
 * Declarative action catalog — replaces ipk-new hardcoded side effects.
 * Domain scenarios compose these; no commercial_* action kinds.
 */

import type { AutomationFieldAskOptions } from "./types";

export const AUTOMATION_ACTION_KINDS = [
  "noop",
  "setField",
  "setFieldPrevious",
  "viewField",
  "viewTabs",
  "createRecord",
  "updateRecords",
  "copyFields",
  "setRelation",
  "addRelation",
  "startProcess",
  "spawnTasks",
  "cancelTasks",
  "notify",
  "requireFields",
  "attachToFolder",
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];

export type AutomationFieldMapping = {
  targetFieldId: string;
  /** Literal value, or `{{sourceFieldId}}` / `{{triggerFieldId}}`. */
  source: string;
};

/**
 * Nested create under a `createRecord` parent — assignee may add several
 * drafts on the task form; each becomes a child record linked to the parent.
 */
export type AutomationCreateNestedSpec = {
  id: string;
  entityId: string;
  askFieldIds: string[];
  askRequiredFieldIds?: string[];
  fieldAskOptions?: Record<string, AutomationFieldAskOptions>;
  /** Prefill from trigger (and later parent) before ask values. */
  mappings?: AutomationFieldMapping[];
};

export type AutomationAction =
  | { id: string; kind: "noop" }
  | { id: string; kind: "setField"; fieldId: string; value: string }
  | { id: string; kind: "setFieldPrevious"; fieldId: string }
  | {
      id: string;
      kind: "viewField";
      /** Show these fields read-only on the task form (context for filling). */
      fieldIds: string[];
    }
  | {
      id: string;
      kind: "viewTabs";
      /** Show these entity tabs read-only on the task form (notes, files, …). */
      tabIds: string[];
      /**
       * For files tabs: default-folder ids to show on the task form.
       * Key = tab id. Missing / empty list = entire tab.
       */
      filesTabEntryIds?: Record<string, string[]>;
      /**
       * When true, the task form lets the assignee move files between folders
       * on selected files tabs (still no upload/delete here).
       */
      filesTabAllowMove?: boolean;
    }
  | {
      id: string;
      kind: "createRecord";
      entityId: string;
      mappings: AutomationFieldMapping[];
      /** Store created record id into trigger record field (relation). */
      linkBackFieldId?: string;
      /** Fields the assignee fills on the task form for this new record. */
      askFieldIds?: string[];
      askRequiredFieldIds?: string[];
      fieldAskOptions?: Record<string, AutomationFieldAskOptions>;
      /** Child records under the created parent (task form list). */
      nestedCreates?: AutomationCreateNestedSpec[];
    }
  | {
      id: string;
      kind: "updateRecords";
      entityId: string;
      /**
       * `relation` — IDs in trigger’s `linkFieldId` (points at entityId).
       * `backRelation` — rows of entityId whose `linkFieldId` includes trigger.
       */
      linkMode?: "relation" | "backRelation";
      linkFieldId: string;
      mappings: AutomationFieldMapping[];
    }
  | {
      id: string;
      kind: "copyFields";
      /** Target record: relation field on trigger, or "self". */
      targetRelationFieldId: string | "self";
      mappings: AutomationFieldMapping[];
    }
  | {
      id: string;
      kind: "setRelation";
      fieldId: string;
      /** "created" = last createRecord id in pipeline; else literal / {{field}}. */
      value: string;
    }
  | {
      id: string;
      kind: "addRelation";
      fieldId: string;
      value: string;
    }
  | {
      id: string;
      kind: "startProcess";
      processId: string;
      /** Relation to the record that should enter the process; "self" = trigger. */
      targetRelationFieldId: string | "self";
      /** Optional list option to set on target before spawn. */
      enterOptionId?: string;
      enterFieldId?: string;
    }
  | {
      id: string;
      kind: "spawnTasks";
      templateIds?: string[];
    }
  | {
      id: string;
      kind: "cancelTasks";
      /** pending tasks on same record; optional template filter. */
      templateIds?: string[];
    }
  | {
      id: string;
      kind: "notify";
      message: string;
      recipient: import("./assignee").AutomationAssigneeResolver;
    }
  | {
      id: string;
      kind: "requireFields";
      fieldIds: string[];
    }
  | {
      id: string;
      kind: "attachToFolder";
      fileFieldId: string;
    };

export const AUTOMATION_ACTION_KIND_LABELS: Record<
  AutomationActionKind,
  string
> = {
  noop: "Ничего не делать",
  setField: "Установить поле",
  setFieldPrevious: "Вернуть поле",
  viewField: "Просмотреть поле",
  viewTabs: "Просмотреть вкладки",
  createRecord: "Создать запись",
  updateRecords: "Обновить поля",
  copyFields: "Скопировать поля",
  setRelation: "Установить связь",
  addRelation: "Добавить в связь",
  startProcess: "Запустить процесс",
  spawnTasks: "Создать задачи",
  cancelTasks: "Отменить задачи",
  notify: "Уведомить",
  requireFields: "Обязательные поля",
  attachToFolder: "Сохранить вложение",
};

/** Action kind picker sections in the automation builder. */
export const AUTOMATION_ACTION_KIND_GROUPS: Array<{
  label: string;
  items: AutomationActionKind[];
}> = [
  {
    label: "Поля и форма",
    items: [
      "setField",
      "setFieldPrevious",
      "viewField",
      "viewTabs",
      "requireFields",
      "attachToFolder",
    ],
  },
  {
    label: "Записи и связи",
    items: [
      "createRecord",
      "updateRecords",
      "copyFields",
      "setRelation",
      "addRelation",
    ],
  },
  {
    label: "Процесс и задачи",
    items: ["startProcess", "spawnTasks", "cancelTasks"],
  },
  {
    label: "Прочее",
    items: ["notify", "noop"],
  },
];

export function createAutomationActionId() {
  return `act-${crypto.randomUUID()}`;
}

export function defaultAutomationAction(
  kind: AutomationActionKind = "noop",
): AutomationAction {
  const id = createAutomationActionId();
  switch (kind) {
    case "setField":
      return { id, kind, fieldId: "", value: "" };
    case "setFieldPrevious":
      return { id, kind, fieldId: "" };
    case "viewField":
      return { id, kind, fieldIds: [] };
    case "viewTabs":
      return {
        id,
        kind,
        tabIds: [],
        filesTabEntryIds: {},
        filesTabAllowMove: false,
      };
    case "createRecord":
      return { id, kind, entityId: "", mappings: [] };
    case "updateRecords":
      return {
        id,
        kind,
        entityId: "",
        linkMode: "relation",
        linkFieldId: "",
        mappings: [],
      };
    case "copyFields":
      return { id, kind, targetRelationFieldId: "self", mappings: [] };
    case "setRelation":
    case "addRelation":
      return { id, kind, fieldId: "", value: "" };
    case "startProcess":
      return { id, kind, processId: "", targetRelationFieldId: "self" };
    case "spawnTasks":
    case "cancelTasks":
      return { id, kind, templateIds: [] };
    case "notify":
      return {
        id,
        kind,
        message: "",
        recipient: { type: "currentUser" },
      };
    case "requireFields":
      return { id, kind, fieldIds: [] };
    case "attachToFolder":
      return { id, kind, fileFieldId: "" };
    case "noop":
    default:
      return { id, kind: "noop" };
  }
}

/** Keep only non-empty id lists for currently selected tab ids. */
function normalizeFilesTabEntryIds(
  value: unknown,
  tabIds: string[],
): Record<string, string[]> {
  const allowed = new Set(tabIds);
  const result: Record<string, string[]> = {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  for (const [tabId, rawIds] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!allowed.has(tabId)) continue;
    if (!Array.isArray(rawIds)) continue;
    const ids = rawIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    if (ids.length === 0) continue;
    result[tabId] = [...new Set(ids)];
  }
  return result;
}

function normalizeMappings(value: unknown): AutomationFieldMapping[] {
  if (!Array.isArray(value)) return [];
  const result: AutomationFieldMapping[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const targetFieldId =
      typeof raw.targetFieldId === "string" ? raw.targetFieldId.trim() : "";
    const source = typeof raw.source === "string" ? raw.source : "";
    if (!targetFieldId) continue;
    result.push({ targetFieldId, source });
  }
  return result;
}

function normalizeStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

function normalizeCreateFieldAskOptions(
  value: unknown,
  visibleFieldIds: readonly string[],
): Record<string, AutomationFieldAskOptions> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const visible = new Set(visibleFieldIds);
  const result: Record<string, AutomationFieldAskOptions> = {};
  for (const [fieldId, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!visible.has(fieldId) || !raw || typeof raw !== "object") continue;
    const mode = (raw as Record<string, unknown>).relationGroupsMode;
    if (mode !== "items" && mode !== "nested") continue;
    result[fieldId] = { relationGroupsMode: mode };
  }
  return result;
}

function normalizeNestedCreates(value: unknown): AutomationCreateNestedSpec[] {
  if (!Array.isArray(value)) return [];
  const result: AutomationCreateNestedSpec[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `nested-${crypto.randomUUID()}`;
    const entityId =
      typeof raw.entityId === "string" ? raw.entityId.trim() : "";
    if (!entityId) continue;
    const askFieldIds = normalizeStringIdList(raw.askFieldIds);
    const askRequiredFieldIds = normalizeStringIdList(
      raw.askRequiredFieldIds,
    ).filter((fieldId) => askFieldIds.includes(fieldId));
    const fieldAskOptions = normalizeCreateFieldAskOptions(
      raw.fieldAskOptions,
      askFieldIds,
    );
    const mappings = normalizeMappings(raw.mappings);
    result.push({
      id,
      entityId,
      askFieldIds,
      ...(askRequiredFieldIds.length > 0 ? { askRequiredFieldIds } : {}),
      ...(Object.keys(fieldAskOptions).length > 0 ? { fieldAskOptions } : {}),
      ...(mappings.length > 0 ? { mappings } : {}),
    });
  }
  return result;
}

export function createAutomationNestedCreateId() {
  return `nested-${crypto.randomUUID()}`;
}

/** Draft key for a field on a createRecord parent form. */
export function createRecordAskDraftKey(actionId: string, fieldId: string) {
  return `create:${actionId}:${fieldId}`;
}

/** Draft key for a field on a nested create draft row. */
export function createRecordNestedAskDraftKey(
  actionId: string,
  nestedId: string,
  index: number,
  fieldId: string,
) {
  return `create:${actionId}:nested:${nestedId}:${index}:${fieldId}`;
}

/** Draft key storing how many nested rows exist for a nestedCreate slot. */
export function createRecordNestedCountDraftKey(
  actionId: string,
  nestedId: string,
) {
  return `create:${actionId}:nested:${nestedId}:__count__`;
}

export function parseCreateRecordAskDraftKey(key: string): {
  actionId: string;
  fieldId: string;
} | null {
  const match = /^create:([^:]+):([^:]+)$/.exec(key);
  if (!match) return null;
  const fieldId = match[2]!;
  if (fieldId.startsWith("nested:")) return null;
  return { actionId: match[1]!, fieldId };
}

export function parseCreateRecordNestedAskDraftKey(key: string): {
  actionId: string;
  nestedId: string;
  index: number;
  fieldId: string;
} | null {
  const match = /^create:([^:]+):nested:([^:]+):(\d+):(.+)$/.exec(key);
  if (!match) return null;
  return {
    actionId: match[1]!,
    nestedId: match[2]!,
    index: Number(match[3]),
    fieldId: match[4]!,
  };
}

export function normalizeAutomationAction(
  value: unknown,
): AutomationAction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  if (!(AUTOMATION_ACTION_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : createAutomationActionId();
  const base = defaultAutomationAction(kind as AutomationActionKind);
  const withId = { ...base, id } as AutomationAction;

  switch (withId.kind) {
    case "setField":
      return {
        ...withId,
        fieldId: typeof raw.fieldId === "string" ? raw.fieldId : "",
        value: typeof raw.value === "string" ? raw.value : "",
      };
    case "setFieldPrevious":
      return {
        ...withId,
        fieldId: typeof raw.fieldId === "string" ? raw.fieldId : "",
      };
    case "createRecord": {
      const askFieldIds = normalizeStringIdList(raw.askFieldIds);
      const askRequiredFieldIds = normalizeStringIdList(
        raw.askRequiredFieldIds,
      ).filter((fieldId) => askFieldIds.includes(fieldId));
      const fieldAskOptions = normalizeCreateFieldAskOptions(
        raw.fieldAskOptions,
        askFieldIds,
      );
      const nestedCreates = normalizeNestedCreates(raw.nestedCreates);
      return {
        ...withId,
        entityId: typeof raw.entityId === "string" ? raw.entityId : "",
        mappings: normalizeMappings(raw.mappings),
        linkBackFieldId:
          typeof raw.linkBackFieldId === "string" && raw.linkBackFieldId.trim()
            ? raw.linkBackFieldId.trim()
            : undefined,
        ...(askFieldIds.length > 0 ? { askFieldIds } : {}),
        ...(askRequiredFieldIds.length > 0 ? { askRequiredFieldIds } : {}),
        ...(Object.keys(fieldAskOptions).length > 0 ? { fieldAskOptions } : {}),
        ...(nestedCreates.length > 0 ? { nestedCreates } : {}),
      };
    }
    case "updateRecords":
      return {
        ...withId,
        entityId: typeof raw.entityId === "string" ? raw.entityId : "",
        linkMode: raw.linkMode === "backRelation" ? "backRelation" : "relation",
        linkFieldId: typeof raw.linkFieldId === "string" ? raw.linkFieldId : "",
        mappings: normalizeMappings(raw.mappings),
      };
    case "copyFields":
      return {
        ...withId,
        targetRelationFieldId:
          raw.targetRelationFieldId === "self" ||
          typeof raw.targetRelationFieldId === "string"
            ? (raw.targetRelationFieldId as string | "self")
            : "self",
        mappings: normalizeMappings(raw.mappings),
      };
    case "setRelation":
    case "addRelation":
      return {
        ...withId,
        fieldId: typeof raw.fieldId === "string" ? raw.fieldId : "",
        value: typeof raw.value === "string" ? raw.value : "",
      };
    case "startProcess":
      return {
        ...withId,
        processId: typeof raw.processId === "string" ? raw.processId : "",
        targetRelationFieldId:
          raw.targetRelationFieldId === "self" ||
          typeof raw.targetRelationFieldId === "string"
            ? (raw.targetRelationFieldId as string | "self")
            : "self",
        enterOptionId:
          typeof raw.enterOptionId === "string" ? raw.enterOptionId : undefined,
        enterFieldId:
          typeof raw.enterFieldId === "string" ? raw.enterFieldId : undefined,
      };
    case "spawnTasks":
    case "cancelTasks":
      return {
        ...withId,
        templateIds: Array.isArray(raw.templateIds)
          ? raw.templateIds.filter((id): id is string => typeof id === "string")
          : [],
      };
    case "notify":
      return {
        ...withId,
        message: typeof raw.message === "string" ? raw.message : "",
        recipient:
          raw.recipient && typeof raw.recipient === "object"
            ? (raw.recipient as import("./assignee").AutomationAssigneeResolver)
            : { type: "currentUser" },
      };
    case "requireFields":
    case "viewField":
      return {
        ...withId,
        fieldIds: Array.isArray(raw.fieldIds)
          ? raw.fieldIds.filter((id): id is string => typeof id === "string")
          : [],
      };
    case "viewTabs": {
      const tabIds = Array.isArray(raw.tabIds)
        ? raw.tabIds.filter(
            (id): id is string =>
              typeof id === "string" && id.trim().length > 0,
          )
        : [];
      const filesTabEntryIds = normalizeFilesTabEntryIds(
        raw.filesTabEntryIds ?? raw.files_tab_entry_ids,
        tabIds,
      );
      const filesTabAllowMove =
        raw.filesTabAllowMove === true || raw.files_tab_allow_move === true;
      return { ...withId, tabIds, filesTabEntryIds, filesTabAllowMove };
    }
    case "attachToFolder":
      return {
        ...withId,
        fileFieldId: typeof raw.fileFieldId === "string" ? raw.fileFieldId : "",
      };
    case "noop":
      return withId;
  }
}

export function normalizeAutomationActions(value: unknown): AutomationAction[] {
  if (!Array.isArray(value)) return [];
  const result: AutomationAction[] = [];
  for (const item of value) {
    const action = normalizeAutomationAction(item);
    if (action) result.push(action);
  }
  return result;
}

export type DescribeAutomationActionContext = {
  fieldName?: (fieldId: string) => string;
  entityName?: (entityId: string) => string;
};

/** Human-readable one-liner for builders (uses names when context is provided). */
export function describeAutomationAction(
  action: AutomationAction,
  ctx?: DescribeAutomationActionContext,
): string {
  const field = (id: string) => (id ? (ctx?.fieldName?.(id) ?? "поле") : "…");
  const entity = (id: string) =>
    id ? (ctx?.entityName?.(id) ?? "сущность") : "…";

  switch (action.kind) {
    case "noop":
      return "Ничего не делать";
    case "setField":
      return `Установить «${field(action.fieldId)}»`;
    case "setFieldPrevious":
      return `Вернуть «${field(action.fieldId)}»`;
    case "viewField":
      return action.fieldIds.length > 0
        ? `Показать: ${action.fieldIds.map(field).join(", ")}`
        : "Показать поля";
    case "viewTabs": {
      if (action.tabIds.length === 0) return "Показать вкладки";
      const filtered = Object.values(action.filesTabEntryIds ?? {}).reduce(
        (count, ids) => count + ids.length,
        0,
      );
      const base =
        filtered > 0
          ? `Вкладки: ${action.tabIds.length} · файлы: ${filtered}`
          : `Вкладки: ${action.tabIds.length}`;
      return action.filesTabAllowMove ? `${base} · перемещение` : base;
    }
    case "createRecord": {
      const askCount = action.askFieldIds?.length ?? 0;
      const nestedCount = action.nestedCreates?.length ?? 0;
      const bits = [`Создать запись в «${entity(action.entityId)}»`];
      if (askCount > 0) bits.push(`запрос: ${askCount}`);
      if (nestedCount > 0) bits.push(`вложенные: ${nestedCount}`);
      return bits.join(" · ");
    }
    case "updateRecords":
      return action.mappings.length > 0
        ? `Обновить «${entity(action.entityId)}» · ${action.mappings.length}`
        : `Обновить «${entity(action.entityId)}»`;
    case "copyFields":
      return "Скопировать поля";
    case "setRelation":
      return `Связь «${field(action.fieldId)}»`;
    case "addRelation":
      return `Добавить в «${field(action.fieldId)}»`;
    case "startProcess":
      return "Запустить процесс";
    case "spawnTasks":
      return "Создать задачи";
    case "cancelTasks":
      return "Отменить задачи";
    case "notify":
      return action.message.trim() ? action.message.trim() : "Уведомить";
    case "requireFields":
      return action.fieldIds.length > 0
        ? `Проверить: ${action.fieldIds.map(field).join(", ")}`
        : "Проверить поля";
    case "attachToFolder":
      return `Вложение → «${field(action.fileFieldId)}»`;
  }
}
