import { normalizeEntityConditions } from "../model/condition";
import { defaultEntityConfig } from "../model/defaults";
import {
  isEntityComputedFieldType,
  isEntityUnitFieldType,
} from "../model/field";
import type {
  Entity,
  EntityConfig,
  EntityDeadlineConfig,
  EntityDependenciesConfig,
  EntityField,
  EntityFieldDefaultValue,
  EntityFieldGroup,
  EntityFieldType,
  EntityFormulaConfig,
  EntityListOption,
  EntityLookupConfig,
  EntityNumberDecimals,
  EntityNumberSignColor,
  EntityRecord,
  EntityRelationFilter,
  EntityRelationGroupsConfig,
  EntityRollupConfig,
  EntityTab,
  EntityTimelineConfig,
  EntityTimeTracking,
  EntityView,
} from "../model/types";
import { ENTITY_ROLLUP_AGGREGATIONS, isEntityBrowseView } from "../model/types";
import {
  ENTITY_OVERVIEW_TAB_ID,
  ensureEntityFieldGroups,
  ensureEntityNameField,
  ensureEntityTabs,
  getEntityFieldTabId,
  getEntityFieldsHostTabIds,
  getEntityHomeFieldsTabId,
  isEntityFieldType,
  isEntityNameField,
  normalizeEntityDefaultView,
  normalizeEntityFieldGroup,
  normalizeEntityKanbanCardFieldIds,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  normalizeEntityTab,
  normalizeEntityTabKind,
  normalizeEntitySumFieldIds,
  normalizeEntityUnitSuffix,
  normalizeListColor,
  resolveEntityListDependencies,
  resolveEntitySumFieldIds,
} from "../model/types";

const LEGACY_FIELD_TYPE_MAP: Record<string, EntityFieldType> = {
  date: "datetime",
  select: "text",
  status: "list",
  price: "number",
  numberUnit: "number",
  /** Removed field type — keep stored values as a plain relation. */
  template: "relation",
};

const VIEW_TYPES = new Set<EntityView>([
  "table",
  "kanban",
  "timeline",
  "internal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntityFieldType(value: unknown): EntityFieldType {
  if (typeof value === "string" && value in LEGACY_FIELD_TYPE_MAP) {
    return LEGACY_FIELD_TYPE_MAP[value];
  }
  if (isEntityFieldType(value)) return value;
  return "text";
}

function isEntityView(value: unknown): value is EntityView {
  return typeof value === "string" && VIEW_TYPES.has(value as EntityView);
}

export function normalizeEntityViews(views: EntityView[]): EntityView[] {
  if (views.includes("internal")) return ["internal"];

  const unique: EntityView[] = [];
  for (const view of views) {
    if (view === "internal") continue;
    if (!VIEW_TYPES.has(view) || unique.includes(view)) continue;
    unique.push(view);
  }
  return unique.length > 0 ? unique : ["table"];
}

function normalizeSystemKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Unique non-empty string ids (order preserved). */
function normalizeStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
}

function normalizeFieldListOptions(value: unknown): EntityListOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is EntityListOption =>
        isRecord(item) &&
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.name === "string",
    )
    .map((item) =>
      normalizeEntityListOption({
        ...item,
        color: typeof item.color === "string" ? item.color : "#3b82f6",
        parentOptionId:
          typeof item.parentOptionId === "string" &&
          item.parentOptionId.trim().length > 0
            ? item.parentOptionId.trim()
            : null,
      }),
    );
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeDecimals(value: unknown): EntityNumberDecimals {
  return value === 0 || value === 1 ? value : 2;
}

function normalizeFormulaConfig(
  value: unknown,
): EntityFormulaConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    expression: typeof value.expression === "string" ? value.expression : "",
    decimals: normalizeDecimals(value.decimals),
  };
}

function normalizeRollupConfig(value: unknown): EntityRollupConfig | undefined {
  if (!isRecord(value)) return undefined;
  const sourceEntityId = normalizeId(value.sourceEntityId);
  const linkFieldId = normalizeId(value.linkFieldId);
  if (!sourceEntityId || !linkFieldId) return undefined;
  const aggregation = ENTITY_ROLLUP_AGGREGATIONS.includes(
    value.aggregation as EntityRollupConfig["aggregation"],
  )
    ? (value.aggregation as EntityRollupConfig["aggregation"])
    : "count";
  return {
    sourceEntityId,
    linkFieldId,
    aggregation,
    valueFieldId:
      aggregation === "count" ? null : normalizeId(value.valueFieldId),
    conditions: normalizeEntityConditions(value.conditions),
    decimals: normalizeDecimals(value.decimals),
  };
}

function normalizeLookupConfig(value: unknown): EntityLookupConfig | undefined {
  if (!isRecord(value)) return undefined;
  const relationFieldId = normalizeId(value.relationFieldId);
  const targetFieldId = normalizeId(value.targetFieldId);
  if (!relationFieldId || !targetFieldId) return undefined;
  return { relationFieldId, targetFieldId };
}

function normalizeDependenciesConfig(value: unknown): EntityDependenciesConfig {
  return {
    sameFieldId: isRecord(value) ? normalizeId(value.sameFieldId) : null,
  };
}

function normalizeRelationGroupsLayout(
  value: unknown,
): EntityRelationGroupsConfig["layout"] {
  return value === "row" ? "row" : "column";
}

function normalizeRelationGroupsDisplayFieldIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizeId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeRelationGroupsConfig(
  value: unknown,
): EntityRelationGroupsConfig {
  if (!isRecord(value)) {
    return {
      itemEntityId: null,
      nestedEntityId: null,
      nestedSourceFieldId: null,
      layout: "column",
      itemDisplayFieldIds: [],
      nestedDisplayFieldIds: [],
      defaultNestedIds: [],
    };
  }
  return {
    itemEntityId: normalizeId(value.itemEntityId),
    nestedEntityId: normalizeId(value.nestedEntityId),
    nestedSourceFieldId: normalizeId(value.nestedSourceFieldId),
    layout: normalizeRelationGroupsLayout(value.layout),
    itemDisplayFieldIds: normalizeRelationGroupsDisplayFieldIds(
      value.itemDisplayFieldIds,
    ),
    nestedDisplayFieldIds: normalizeRelationGroupsDisplayFieldIds(
      value.nestedDisplayFieldIds,
    ),
    defaultNestedIds: normalizeRelationGroupsDisplayFieldIds(
      value.defaultNestedIds,
    ),
  };
}

function normalizeDefaultValue(
  value: unknown,
  type: EntityFieldType,
): EntityFieldDefaultValue | undefined {
  if (!isRecord(value) || isEntityComputedFieldType(type)) return undefined;
  if (value.kind === "today") {
    return type === "datetime" ? { kind: "today" } : undefined;
  }
  if (value.kind === "now") {
    return type === "datetime" || type === "time" ? { kind: "now" } : undefined;
  }
  if (value.kind === "currentUser") {
    return type === "relation" ? { kind: "currentUser" } : undefined;
  }
  if (
    value.kind === "value" &&
    typeof value.value === "string" &&
    value.value.length > 0
  ) {
    if (type === "relationGroups") {
      // Keep only if it parses to at least one group.
      try {
        const parsed = JSON.parse(value.value) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
      } catch {
        return undefined;
      }
    }
    if (type === "period") {
      try {
        const parsed = JSON.parse(value.value) as unknown;
        if (!parsed || typeof parsed !== "object") return undefined;
        const record = parsed as Record<string, unknown>;
        if (
          typeof record.start !== "string" ||
          typeof record.end !== "string"
        ) {
          return undefined;
        }
      } catch {
        return undefined;
      }
    }
    return { kind: "value", value: value.value };
  }
  return undefined;
}

function normalizeRelationFilter(
  value: unknown,
): EntityRelationFilter | undefined {
  if (!isRecord(value)) return undefined;
  const matches = Array.isArray(value.matches)
    ? value.matches.flatMap((item) => {
        if (!isRecord(item)) return [];
        const targetFieldId = normalizeId(item.targetFieldId);
        const sourceFieldId = normalizeId(item.sourceFieldId);
        return targetFieldId && sourceFieldId
          ? [{ targetFieldId, sourceFieldId }]
          : [];
      })
    : [];
  const conditions = normalizeEntityConditions(value.conditions);
  if (matches.length === 0 && conditions.length === 0) return undefined;
  return { matches, conditions };
}

function normalizeDeadline(value: unknown): EntityDeadlineConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    doneListFieldId: normalizeId(value.doneListFieldId),
    doneBooleanFieldId: normalizeId(value.doneBooleanFieldId),
    preliminaryFieldId: normalizeId(value.preliminaryFieldId),
  };
}

export function normalizeEntityTimeline(
  value: unknown,
): EntityTimelineConfig | null {
  if (!isRecord(value)) return null;
  const startFieldId = normalizeId(value.startFieldId);
  const endFieldId = normalizeId(value.endFieldId);
  if (!startFieldId || !endFieldId) return null;
  return {
    startFieldId,
    endFieldId,
    groupFieldId: normalizeId(value.groupFieldId),
    clusterFieldId: normalizeId(value.clusterFieldId),
    splitFieldId: normalizeId(value.splitFieldId),
    showAllGroupOptions: value.showAllGroupOptions === true,
    colorFieldId: normalizeId(value.colorFieldId),
    labelFieldId: normalizeId(value.labelFieldId),
    progressFieldId: normalizeId(value.progressFieldId),
    dependenciesFieldId: normalizeId(value.dependenciesFieldId),
  };
}

export function normalizeEntityTimeTracking(
  value: unknown,
): EntityTimeTracking | null {
  if (!isRecord(value)) return null;
  const entryEntityId = normalizeId(value.entryEntityId);
  const linkFieldId = normalizeId(value.linkFieldId);
  const employeeFieldId = normalizeId(value.employeeFieldId);
  const startFieldId = normalizeId(value.startFieldId);
  const endFieldId = normalizeId(value.endFieldId);
  const hoursFieldId = normalizeId(value.hoursFieldId);
  if (
    !entryEntityId ||
    !linkFieldId ||
    !employeeFieldId ||
    !startFieldId ||
    !endFieldId ||
    !hoursFieldId
  ) {
    return null;
  }
  const limit =
    typeof value.dailyLimitHours === "number" ? value.dailyLimitHours : 8;
  return {
    entryEntityId,
    linkFieldId,
    employeeFieldId,
    startFieldId,
    endFieldId,
    hoursFieldId,
    methodFieldId: normalizeId(value.methodFieldId),
    timerOptionId: normalizeId(value.timerOptionId),
    manualOptionId: normalizeId(value.manualOptionId),
    commentFieldId: normalizeId(value.commentFieldId),
    statusFieldId: normalizeId(value.statusFieldId),
    statusOptionIds: normalizeStringIds(value.statusOptionIds),
    dailyLimitHours: Number.isFinite(limit)
      ? Math.min(24, Math.max(0, limit))
      : 8,
    context: Array.isArray(value.context)
      ? value.context.flatMap((item) => {
          if (!isRecord(item)) return [];
          const sourceFieldId = normalizeId(item.sourceFieldId);
          const targetFieldId = normalizeId(item.targetFieldId);
          return sourceFieldId && targetFieldId
            ? [{ sourceFieldId, targetFieldId }]
            : [];
        })
      : [],
  };
}

function normalizeNumberSignColor(
  value: unknown,
): EntityNumberSignColor | undefined {
  return value === "positiveRed" || value === "positiveGreen"
    ? value
    : undefined;
}

function isNumberLikeType(type: EntityFieldType) {
  return (
    type === "number" ||
    type === "numberSum" ||
    type === "formula" ||
    type === "rollup" ||
    type === "lookup"
  );
}

export function normalizeEntityField(field: EntityField): EntityField {
  const locked = Boolean(field.locked);
  const systemKey = normalizeSystemKey(field.systemKey);
  const type = field.type;
  const relationEntityId =
    (type === "relation" || type === "belonging") &&
    typeof field.relationEntityId === "string" &&
    field.relationEntityId.trim().length > 0
      ? field.relationEntityId.trim()
      : null;
  const relationMultiple =
    type === "relation" ? Boolean(field.relationMultiple) : false;
  const unitSuffix = isEntityUnitFieldType(type)
    ? normalizeEntityUnitSuffix(field.unitSuffix)
    : null;
  const sumFieldIds =
    type === "numberSum" ? normalizeEntitySumFieldIds(field.sumFieldIds) : [];
  const listSourceFieldId =
    type === "list" &&
    typeof field.listSourceFieldId === "string" &&
    field.listSourceFieldId.trim().length > 0
      ? field.listSourceFieldId.trim()
      : null;
  const listOptions =
    type === "list" && !listSourceFieldId
      ? normalizeFieldListOptions(field.listOptions)
      : [];
  const listFixed = type === "list" ? Boolean(field.listFixed) : false;
  const listMultiple =
    type === "list" && listFixed ? Boolean(field.listMultiple) : false;
  const listAllowOther =
    type === "list" && !listMultiple ? Boolean(field.listAllowOther) : false;
  const listDependsOnFieldId =
    type === "list" &&
    !listSourceFieldId &&
    typeof field.listDependsOnFieldId === "string" &&
    field.listDependsOnFieldId.trim().length > 0
      ? field.listDependsOnFieldId.trim()
      : null;
  const listUseColors = type === "list" ? field.listUseColors !== false : true;
  const listShowEmptyValue =
    type === "list" ? field.listShowEmptyValue !== false : true;
  const datetimeWithTime =
    type === "datetime"
      ? typeof field.datetimeWithTime === "boolean"
        ? field.datetimeWithTime
        : true
      : false;
  const booleanInline =
    type === "boolean" ? Boolean(field.booleanInline) : false;

  const base: EntityField = {
    id: field.id,
    name: field.name,
    type,
    hint: field.hint,
    group: typeof field.group === "string" ? field.group.trim() : "",
    tabId: getEntityFieldTabId(field),
    required: isEntityComputedFieldType(type) ? false : Boolean(field.required),
    locked,
    systemKey,
    showInTable: field.showInTable !== false,
    showInFilters: field.showInFilters !== false,
    showOnRecord: field.showOnRecord !== false,
    showOnCreate: field.showOnCreate !== false,
    includeInTotal:
      (type === "number" ||
        type === "numberSum" ||
        type === "formula" ||
        type === "rollup") &&
      Boolean(field.includeInTotal),
    tableOrder: clampSpan(field.tableOrder, 0, 9999, 0),
    relationEntityId,
    relationMultiple,
    unitSuffix,
    sumFieldIds,
    listOptions,
    listSourceFieldId,
    listFixed,
    listMultiple,
    listAllowOther,
    listDependsOnFieldId,
    listUseColors,
    listShowEmptyValue,
    formula:
      type === "formula" ? normalizeFormulaConfig(field.formula) : undefined,
    rollup: type === "rollup" ? normalizeRollupConfig(field.rollup) : undefined,
    lookup: type === "lookup" ? normalizeLookupConfig(field.lookup) : undefined,
    dependencies:
      type === "dependencies"
        ? normalizeDependenciesConfig(field.dependencies)
        : undefined,
    relationGroups:
      type === "relationGroups"
        ? normalizeRelationGroupsConfig(field.relationGroups)
        : undefined,
    defaultValue: normalizeDefaultValue(field.defaultValue, type),
    relationFilter:
      type === "relation"
        ? normalizeRelationFilter(field.relationFilter)
        : undefined,
    deadline:
      type === "datetime" ? normalizeDeadline(field.deadline) : undefined,
    numberDisplay:
      isNumberLikeType(type) && field.numberDisplay === "progress"
        ? "progress"
        : undefined,
    numberSignColor: isNumberLikeType(type)
      ? normalizeNumberSignColor(field.numberSignColor)
      : undefined,
    datetimeWithTime,
    booleanInline,
    colSpan: clampSpan(field.colSpan, 1, 4, 1),
    rowSpan: clampSpan(field.rowSpan, 1, 3, 1),
  };

  if (!locked) return base;

  const name = typeof field.name === "string" ? field.name.trim() : "";
  return {
    ...base,
    name: name.length > 0 ? name : "Название",
    type: "text" as const,
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: true,
    locked: true,
    systemKey,
    showInTable: true,
    showOnRecord: true,
    showOnCreate: true,
    includeInTotal: false,
    tableOrder: 0,
    relationEntityId: null,
    relationMultiple: false,
    unitSuffix: null,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    listShowEmptyValue: true,
    formula: undefined,
    rollup: undefined,
    lookup: undefined,
    dependencies: undefined,
    relationGroups: undefined,
    defaultValue: undefined,
    relationFilter: undefined,
    deadline: undefined,
    numberDisplay: undefined,
    numberSignColor: undefined,
    datetimeWithTime: false,
    booleanInline: false,
  };
}

export function normalizeEntityListOption(
  option: EntityListOption,
): EntityListOption {
  const parentOptionId =
    typeof option.parentOptionId === "string" &&
    option.parentOptionId.trim().length > 0
      ? option.parentOptionId.trim()
      : null;
  const normalized: EntityListOption = {
    id: option.id,
    name: option.name.trim() || "Без названия",
    color: normalizeListColor(option.color),
    parentOptionId,
  };
  if (option.final === true) normalized.final = true;
  if (option.problem === true) normalized.problem = true;
  if (option.hiddenByDefault === true) normalized.hiddenByDefault = true;
  return normalized;
}

function clampSpan(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeEntityRecord(record: EntityRecord): EntityRecord {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(record.values ?? {})) {
    values[key] = typeof value === "string" ? value : String(value ?? "");
  }
  const authUserId =
    typeof record.authUserId === "string" && record.authUserId.trim().length > 0
      ? record.authUserId.trim()
      : null;
  const createdBy =
    typeof record.createdBy === "string" && record.createdBy.trim().length > 0
      ? record.createdBy.trim()
      : null;
  return { id: record.id, values, authUserId, createdBy };
}

function parseField(value: unknown): EntityField | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (typeof value.name !== "string") return null;

  const rawType = typeof value.type === "string" ? value.type : "";
  const unitSuffix =
    normalizeEntityUnitSuffix(value.unitSuffix) ??
    (rawType === "price" ? "₽" : null);

  return normalizeEntityField({
    id: value.id,
    name: value.name,
    type: parseEntityFieldType(value.type),
    hint: typeof value.hint === "string" ? value.hint : "",
    group: typeof value.group === "string" ? value.group : "",
    tabId:
      typeof value.tabId === "string" ? value.tabId : ENTITY_OVERVIEW_TAB_ID,
    required: Boolean(value.required),
    locked: Boolean(value.locked),
    systemKey: normalizeSystemKey(value.systemKey),
    showInTable: value.showInTable !== false,
    showInFilters: value.showInFilters !== false,
    showOnRecord: value.showOnRecord !== false,
    showOnCreate: value.showOnCreate !== false,
    includeInTotal: Boolean(value.includeInTotal),
    tableOrder: clampSpan(value.tableOrder, 0, 9999, 0),
    relationEntityId:
      typeof value.relationEntityId === "string"
        ? value.relationEntityId
        : null,
    relationMultiple: Boolean(value.relationMultiple),
    unitSuffix,
    sumFieldIds: normalizeEntitySumFieldIds(value.sumFieldIds),
    listOptions: normalizeFieldListOptions(value.listOptions ?? value.statuses),
    listSourceFieldId:
      typeof value.listSourceFieldId === "string"
        ? value.listSourceFieldId
        : null,
    listFixed: Boolean(value.listFixed ?? value.statusesFixed),
    listMultiple: Boolean(value.listMultiple),
    listAllowOther: Boolean(value.listAllowOther),
    listDependsOnFieldId:
      typeof value.listDependsOnFieldId === "string"
        ? value.listDependsOnFieldId
        : null,
    listUseColors: value.listUseColors !== false,
    listShowEmptyValue: value.listShowEmptyValue !== false,
    formula: normalizeFormulaConfig(value.formula),
    rollup: normalizeRollupConfig(value.rollup),
    lookup: normalizeLookupConfig(value.lookup),
    dependencies: normalizeDependenciesConfig(value.dependencies),
    relationGroups: normalizeRelationGroupsConfig(value.relationGroups),
    defaultValue: normalizeDefaultValue(
      value.defaultValue,
      parseEntityFieldType(value.type),
    ),
    relationFilter: normalizeRelationFilter(value.relationFilter),
    deadline: normalizeDeadline(value.deadline),
    numberDisplay: value.numberDisplay === "progress" ? "progress" : undefined,
    numberSignColor: normalizeNumberSignColor(value.numberSignColor),
    datetimeWithTime:
      typeof value.datetimeWithTime === "boolean"
        ? value.datetimeWithTime
        : true,
    booleanInline: Boolean(value.booleanInline),
    colSpan: clampSpan(value.colSpan, 1, 4, 1),
    rowSpan: clampSpan(value.rowSpan, 1, 3, 1),
  });
}

function parseListOption(value: unknown): EntityListOption | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (typeof value.name !== "string") return null;
  return normalizeFieldListOptions([value])[0] ?? null;
}

function parseTab(value: unknown): EntityTab | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (typeof value.name !== "string") return null;
  return normalizeEntityTab({
    id: value.id,
    name: value.name,
    locked: Boolean(value.locked),
    kind: normalizeEntityTabKind(value.kind),
    linkedEntityId:
      typeof value.linkedEntityId === "string" ? value.linkedEntityId : null,
    parentLinkFieldId:
      typeof value.parentLinkFieldId === "string"
        ? value.parentLinkFieldId
        : null,
    sourceRelationFieldId:
      typeof value.sourceRelationFieldId === "string"
        ? value.sourceRelationFieldId
        : null,
    sourceTabId:
      typeof value.sourceTabId === "string" ? value.sourceTabId : null,
    defaultFolders: Array.isArray(value.defaultFolders)
      ? value.defaultFolders
      : [],
  });
}

function parseFieldGroup(value: unknown): EntityFieldGroup | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string") return null;
  return normalizeEntityFieldGroup({
    name: value.name,
    colSpan: typeof value.colSpan === "number" ? value.colSpan : undefined,
    area: value.area === "primary" ? "primary" : "tab",
    tabId: typeof value.tabId === "string" ? value.tabId : undefined,
    display: value.display === "metrics" ? "metrics" : undefined,
    hideTitle: value.hideTitle === true,
  });
}

function parseViews(value: unknown): EntityView[] {
  if (!Array.isArray(value)) return ["table"];
  return normalizeEntityViews(value.filter(isEntityView));
}

function resolveHeaderFieldId(
  fields: Entity["fields"],
  headerFieldId: string | null | undefined,
): string | null {
  if (!headerFieldId) return null;
  const field = fields.find((item) => item.id === headerFieldId);
  if (!field || field.locked) return null;
  return field.id;
}

function resolveKanbanFieldId(
  fields: Entity["fields"],
  kanbanFieldId: string | null | undefined,
): string | null {
  const requested =
    typeof kanbanFieldId === "string" ? kanbanFieldId.trim() : "";
  if (!requested) return null;
  const field = fields.find((item) => item.id === requested);
  if (!field) return null;
  if (field.type === "relation" || field.type === "belonging") return field.id;
  if (field.type === "list" && !field.listMultiple) return field.id;
  return null;
}

/** Single-choice list/relation field used to group the table into a tree. */
function resolveTableParentFieldId(
  fields: Entity["fields"],
  _entityId: string,
  tableParentFieldId: unknown,
): string | null {
  const requested =
    typeof tableParentFieldId === "string" ? tableParentFieldId.trim() : "";
  if (!requested) return null;
  const field = fields.find((item) => item.id === requested);
  if (!field) return null;
  if (field.type === "list" && !field.listMultiple) return field.id;
  if (field.type === "relation" && !field.relationMultiple) return field.id;
  if (field.type === "belonging") return field.id;
  return null;
}

/** Legacy entity-level list config → first list field (one-time migrate on load). */
function migrateLegacyListOptionsToFields(
  fields: EntityField[],
  legacy: {
    listOptions?: EntityListOption[];
    statuses?: EntityListOption[];
    listFixed?: boolean;
    statusesFixed?: boolean;
    listUseColors?: boolean;
  },
): EntityField[] {
  const legacyOptions = (legacy.listOptions ?? legacy.statuses ?? []).map(
    (option) => normalizeEntityListOption(option),
  );
  if (legacyOptions.length === 0) return fields;

  const primaryListId = fields.find((field) => field.type === "list")?.id;
  if (!primaryListId) return fields;

  const legacyFixed =
    typeof legacy.listFixed === "boolean"
      ? legacy.listFixed
      : Boolean(legacy.statusesFixed);
  const legacyColors = legacy.listUseColors !== false;

  return fields.map((field) => {
    if (field.id !== primaryListId) return field;
    if (field.listOptions.length > 0) return field;
    return normalizeEntityField({
      ...field,
      listOptions: legacyOptions,
      listFixed: legacyFixed,
      listUseColors: legacyColors,
    });
  });
}

export function normalizeEntity(
  entity: Omit<Entity, "nameTemplate"> & {
    nameTemplate?: string;
    listOptions?: EntityListOption[];
    statuses?: EntityListOption[];
    listFixed?: boolean;
    statusesFixed?: boolean;
    listUseColors?: boolean;
  },
): Entity {
  const tabs = ensureEntityTabs(
    (entity.tabs ?? []).map((tab) => normalizeEntityTab(tab)),
  );
  const hostTabIds = getEntityFieldsHostTabIds(tabs);
  const homeTabId = getEntityHomeFieldsTabId(tabs);
  const fields = ensureEntityNameField(
    entity.fields.map((field) => normalizeEntityField(field)),
  ).map((field) => {
    const normalized = normalizeEntityField(field);
    if (isEntityNameField(normalized)) return normalized;
    const tabId = getEntityFieldTabId(normalized);
    // Files/history/records/linked (or missing) tabs — re-attach to home,
    // keeping the field's group so layout is not flattened into «Общее».
    if (hostTabIds.size === 0 || hostTabIds.has(tabId)) return normalized;
    return normalizeEntityField({
      ...normalized,
      tabId: homeTabId,
    });
  });

  const withLegacyLists = migrateLegacyListOptionsToFields(fields, entity);

  const withSums = withLegacyLists.map((field) => {
    if (field.type !== "numberSum") return field;
    return normalizeEntityField({
      ...field,
      sumFieldIds: resolveEntitySumFieldIds(
        field.sumFieldIds,
        withLegacyLists,
        field.id,
      ),
    });
  });
  const resolvedFields = resolveEntityListDependencies(withSums);

  const views = normalizeEntityViews(entity.views);
  return {
    id: entity.id,
    name: entity.name.trim(),
    namePlural: entity.namePlural.trim(),
    description: entity.description.trim(),
    nameTemplate:
      typeof entity.nameTemplate === "string" ? entity.nameTemplate.trim() : "",
    views,
    defaultView: normalizeEntityDefaultView(
      views,
      (entity as { defaultView?: unknown }).defaultView,
    ),
    fields: resolvedFields,
    headerFieldId: resolveHeaderFieldId(resolvedFields, entity.headerFieldId),
    kanbanFieldId: resolveKanbanFieldId(resolvedFields, entity.kanbanFieldId),
    kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
      resolvedFields,
      resolveKanbanFieldId(resolvedFields, entity.kanbanFieldId),
      (entity as { kanbanCardFieldIds?: unknown }).kanbanCardFieldIds,
    ),
    tableMassSelection: entity.tableMassSelection === true,
    tableParentFieldId: resolveTableParentFieldId(
      resolvedFields,
      entity.id,
      (entity as { tableParentFieldId?: unknown }).tableParentFieldId,
    ),
    tabs,
    fieldGroups: ensureEntityFieldGroups(entity.fieldGroups, resolvedFields),
    systemKey: normalizeSystemKey(entity.systemKey),
    locked: entity.locked === true,
    parentEntityId:
      typeof entity.parentEntityId === "string"
        ? entity.parentEntityId.trim() || null
        : null,
    recordColumns: normalizeEntityRecordColumns(
      (entity as { recordColumns?: unknown }).recordColumns,
    ),
    recordsDisplay: normalizeEntityRecordsDisplay(
      (entity as { recordsDisplay?: unknown }).recordsDisplay,
    ),
    timeTracking: normalizeEntityTimeTracking(entity.timeTracking),
    timeline: normalizeEntityTimeline(entity.timeline),
    records: (entity.records ?? []).map((record) =>
      normalizeEntityRecord(record),
    ),
  };
}

/** Structure only — records live in relational `entity_records`. */
export function toEntityStructure(entity: Entity) {
  const views = normalizeEntityViews(entity.views);
  return {
    id: entity.id,
    name: entity.name.trim(),
    namePlural: entity.namePlural.trim(),
    description: entity.description.trim(),
    nameTemplate: entity.nameTemplate?.trim() ?? "",
    views,
    defaultView: normalizeEntityDefaultView(views, entity.defaultView),
    fields: entity.fields.map((field) => normalizeEntityField(field)),
    headerFieldId: resolveHeaderFieldId(entity.fields, entity.headerFieldId),
    kanbanFieldId: resolveKanbanFieldId(entity.fields, entity.kanbanFieldId),
    kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
      entity.fields,
      resolveKanbanFieldId(entity.fields, entity.kanbanFieldId),
      entity.kanbanCardFieldIds,
    ),
    tableMassSelection: entity.tableMassSelection === true,
    tableParentFieldId: resolveTableParentFieldId(
      entity.fields,
      entity.id,
      entity.tableParentFieldId,
    ),
    tabs: ensureEntityTabs(entity.tabs.map((tab) => normalizeEntityTab(tab))),
    fieldGroups: ensureEntityFieldGroups(entity.fieldGroups, entity.fields),
    systemKey: normalizeSystemKey(entity.systemKey),
    locked: entity.locked === true,
    parentEntityId: entity.parentEntityId,
    recordColumns: normalizeEntityRecordColumns(entity.recordColumns),
    recordsDisplay: normalizeEntityRecordsDisplay(entity.recordsDisplay),
    timeTracking: normalizeEntityTimeTracking(entity.timeTracking),
    timeline: normalizeEntityTimeline(entity.timeline),
  };
}

export function cloneDefaultEntityConfig(): EntityConfig {
  return {
    entities: defaultEntityConfig.entities.map((entity) =>
      normalizeEntity(entity),
    ),
  };
}

export function parseEntityConfig(value: unknown): EntityConfig {
  if (!isRecord(value) || !Array.isArray(value.entities)) {
    return cloneDefaultEntityConfig();
  }

  const entities: Entity[] = [];

  for (const item of value.entities) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || item.id.trim().length === 0) continue;
    if (typeof item.name !== "string") continue;
    if (typeof item.namePlural !== "string") continue;

    const description =
      typeof item.description === "string" ? item.description : "";
    const fields = Array.isArray(item.fields)
      ? item.fields
          .map(parseField)
          .filter((field): field is EntityField => field !== null)
      : [];
    const rawListOptions = Array.isArray(item.listOptions)
      ? item.listOptions
      : Array.isArray(item.statuses)
        ? item.statuses
        : [];
    const listOptions = rawListOptions
      .map(parseListOption)
      .filter((option): option is EntityListOption => option !== null);
    const tabs = Array.isArray(item.tabs)
      ? item.tabs.map(parseTab).filter((tab): tab is EntityTab => tab !== null)
      : [];
    const fieldGroups = Array.isArray(item.fieldGroups)
      ? item.fieldGroups
          .map(parseFieldGroup)
          .filter((group): group is EntityFieldGroup => group !== null)
      : [];

    entities.push(
      normalizeEntity({
        id: item.id,
        name: item.name,
        namePlural: item.namePlural,
        description,
        nameTemplate:
          typeof item.nameTemplate === "string"
            ? item.nameTemplate
            : typeof item.name_template === "string"
              ? item.name_template
              : "",
        views: parseViews(item.views),
        defaultView: isEntityBrowseView(item.defaultView)
          ? item.defaultView
          : null,
        fields,
        headerFieldId:
          typeof item.headerFieldId === "string" ? item.headerFieldId : null,
        kanbanFieldId:
          typeof item.kanbanFieldId === "string" ? item.kanbanFieldId : null,
        kanbanCardFieldIds: Array.isArray(item.kanbanCardFieldIds)
          ? item.kanbanCardFieldIds
          : null,
        tableMassSelection: item.tableMassSelection === true,
        tableParentFieldId:
          typeof item.tableParentFieldId === "string"
            ? item.tableParentFieldId
            : null,
        tabs,
        fieldGroups,
        listOptions,
        listFixed:
          item.listFixed === true ||
          (item.listFixed === undefined && item.statusesFixed === true),
        listUseColors: item.listUseColors !== false,
        systemKey: normalizeSystemKey(item.systemKey),
        locked: item.locked === true,
        parentEntityId:
          typeof item.parentEntityId === "string"
            ? item.parentEntityId.trim() || null
            : null,
        recordColumns: normalizeEntityRecordColumns(item.recordColumns),
        recordsDisplay: normalizeEntityRecordsDisplay(item.recordsDisplay),
        timeTracking: normalizeEntityTimeTracking(item.timeTracking),
        timeline: normalizeEntityTimeline(item.timeline),
        records: [],
      }),
    );
  }

  return { entities };
}
