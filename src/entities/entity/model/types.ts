import type { EntityCondition } from "./condition";
import type { EntityFieldType } from "./field";
import {
  formatEntityFieldScalarValue,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  isEntityListOtherValue,
  parseEntityFieldFileValue,
  parseEntityListOtherText,
  parseEntityListValueIds,
  parseEntityRelationIds,
  serializeEntityRelationIds,
} from "./field";

export type { EntityFieldType } from "./field";
export type { EntityFieldFileValue } from "./field";
export {
  ENTITY_FIELD_TYPE_OPTIONS,
  entityFieldInputType,
  ENTITY_LIST_OTHER_OPTION_ID,
  entityListValueIncludesId,
  entityRelationIncludesId,
  formatEntityDecimalTotal,
  formatEntityFieldFilesSummary,
  formatEntityNumberDisplay,
  formatEntityNumberSumDisplay,
  formatEntityFieldScalarValue,
  formatEntityScalarFieldValue,
  getEntityContactHref,
  getEntityFieldDisplayName,
  resolveEntityFieldLabel,
  getEntityFieldNumericValue,
  getEntityFieldTypeLabel,
  getEntityRelationTargetId,
  getEntitySummableFields,
  getEntityUrlHref,
  isEntityDatetimeWithTime,
  isEntityFieldType,
  isEntityListOtherValue,
  isEntitySummableFieldType,
  isValidEntityEmail,
  normalizeEntityDecimalInput,
  normalizeEntityFieldInputValue,
  normalizeEntityPhoneValue,
  normalizeEntitySumFieldIds,
  normalizeEntityUnitSuffix,
  normalizeEntityUrlHref,
  parseEntityDecimal,
  parseEntityFieldFileValue,
  parseEntityListOtherText,
  parseEntityListValueIds,
  parseEntityRelationIds,
  resolveEntitySumFieldIds,
  serializeEntityFieldFileValue,
  serializeEntityListOtherValue,
  serializeEntityListValueIds,
  serializeEntityRelationIds,
  sumEntityDecimalValues,
} from "./field";

export type EntityView = "table" | "kanban" | "timeline" | "internal";

/** Browseable list views (excludes `internal`). */
export type EntityBrowseView = Exclude<EntityView, "internal">;

export function isEntityBrowseView(value: unknown): value is EntityBrowseView {
  return value === "table" || value === "kanban" || value === "timeline";
}

/** Browse table tab: composable panels (aggregate / filters / records). */
export type EntityPagePanelType = "records" | "aggregate" | "filters";

export type EntityPageRecordsPanel = {
  id: string;
  type: "records";
  title: string | null;
};

export type EntityPageAggregatePanel = {
  id: string;
  type: "aggregate";
  title: string | null;
  /** List / relation fields — group keys (order = column order). */
  groupFieldIds: string[];
  /** Number fields to sum. */
  valueFieldIds: string[];
  showRecordCount: boolean;
};

export type EntityPageFiltersPanel = {
  id: string;
  type: "filters";
  title: string | null;
  /** `null` — all fields with showInFilters. */
  fieldIds: string[] | null;
  placement: "inline" | "sidebar";
};

export type EntityPagePanel =
  EntityPageRecordsPanel | EntityPageAggregatePanel | EntityPageFiltersPanel;

export type EntityPageRow = {
  id: string;
  /** CSS grid fractions, e.g. `[2, 1]`. */
  columns: number[];
  panelIds: string[];
};

export type EntityPageLayout = {
  rows: EntityPageRow[];
  panels: EntityPagePanel[];
};

/** «График»: bars from start to end, grouped and linked by dependencies. */
export type EntityTimelineConfig = {
  startFieldId: string;
  endFieldId: string;
  /** Leaf rows: list/relation field on this entity (e.g. «Статья»). */
  groupFieldId: string | null;
  /**
   * Group rows by a list/relation field of the related «Строки» record
   * (e.g. вид деятельности on the article).
   */
  clusterFieldId: string | null;
  /**
   * Split the table into sections by a list/relation field of the related
   * «Строки» record (e.g. приход / расход).
   */
  splitFieldId: string | null;
  /**
   * When grouping by a list/relation: show every option/record as a row,
   * including empty ones (not only groups that have items).
   */
  showAllGroupOptions: boolean;
  colorFieldId: string | null;
  /** Field shown as the bar label (`null` → record name). */
  labelFieldId: string | null;
  progressFieldId: string | null;
  dependenciesFieldId: string | null;
};

export type EntityListOption = {
  id: string;
  name: string;
  color: string;
  /**
   * When the owning list field depends on another field,
   * this option belongs to the given parent list option id
   * or related record id (for `relation` parents).
   */
  parentOptionId: string | null;
  /** Record is done: never overdue, counted in «Доля завершённых». */
  final?: boolean;
  /** Counted and highlighted as a problem. */
  problem?: boolean;
  /** Records with this option stay hidden until «Показать скрытые». */
  hiddenByDefault?: boolean;
};

export type EntityNumberDecimals = 0 | 1 | 2;

export type EntityNumberSignColor = "positiveRed" | "positiveGreen";

/** `formula` field: arithmetic over this record's fields. */
export type EntityFormulaConfig = {
  /** Expression with `{{fieldId}}` references. */
  expression: string;
  decimals: EntityNumberDecimals;
};

export const ENTITY_ROLLUP_AGGREGATIONS = [
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "countFinal",
  "percentFinal",
] as const;
export type EntityRollupAggregation =
  (typeof ENTITY_ROLLUP_AGGREGATIONS)[number];

/** `rollup` field: aggregate over records of another entity linked to this one. */
export type EntityRollupConfig = {
  sourceEntityId: string;
  /** Relation field on the source entity pointing to this entity. */
  linkFieldId: string;
  aggregation: EntityRollupAggregation;
  /** Numeric field (sum/avg/min/max) or list field (countFinal/percentFinal). */
  valueFieldId: string | null;
  conditions: EntityCondition[];
  decimals: EntityNumberDecimals;
};

/** `lookup` field: value of a field on the related record. */
export type EntityLookupConfig = {
  /**
   * Bridge on this entity: `relation`, nested-lookup of relations, or
   * `relationGroups` (reads nested record ids from each group).
   */
  relationFieldId: string;
  /** Field of the related / nested entity. */
  targetFieldId: string;
};

/** `dependencies` field: predecessors among records of the same entity. */
export type EntityDependenciesConfig = {
  /** Offer only records with the same value of this field (e.g. «Проект»). */
  sameFieldId: string | null;
};

/** How `relationGroups` cards are arranged in the form / read-only value. */
export type EntityRelationGroupsLayout = "row" | "column";

/**
 * `relationGroups` field: several primary records, each with its own nested
 * multi-relation (e.g. project stages → departments on a lead).
 */
export type EntityRelationGroupsConfig = {
  /** Entity of the primary row (e.g. stage catalog). */
  itemEntityId: string | null;
  /** Entity of the nested multi-select (e.g. departments). */
  nestedEntityId: string | null;
  /**
   * Optional `relation` field on the item entity that lists allowed nested
   * records. When set, the nested picker is limited to those ids.
   */
  nestedSourceFieldId: string | null;
  /** Form / value layout. Default `column`. */
  layout: EntityRelationGroupsLayout;
  /**
   * Extra fields of the item entity shown beside the title
   * (name is always shown).
   */
  itemDisplayFieldIds: string[];
  /**
   * Extra fields of the nested entity appended to labels
   * (name is always shown).
   */
  nestedDisplayFieldIds: string[];
  /**
   * Nested record ids prefilled on every row (new record defaults and
   * when the user adds a row in the form).
   */
  defaultNestedIds: string[];
};

export type EntityFieldDefaultValue =
  | { kind: "today" }
  | { kind: "now" }
  | { kind: "currentUser" }
  | { kind: "value"; value: string };

/** Narrows relation options to matching target records. */
export type EntityRelationFilter = {
  /** target.[targetFieldId] must share a value with this.[sourceFieldId]. */
  matches: Array<{ targetFieldId: string; sourceFieldId: string }>;
  /** Extra conditions on target records. */
  conditions: EntityCondition[];
};

/** «Контроль срока» of a date field. */
export type EntityDeadlineConfig = {
  /** List field whose final options mark the record done. */
  doneListFieldId: string | null;
  /** Boolean field that marks the record done. */
  doneBooleanFieldId: string | null;
  /** Boolean field that marks the date as preliminary. */
  preliminaryFieldId: string | null;
};

export type EntityField = {
  id: string;
  name: string;
  type: EntityFieldType;
  hint: string;
  group: string;
  /** Tab that owns this field in the record layout. */
  tabId: string;
  required: boolean;
  /** System title field — cannot be edited or deleted. */
  locked: boolean;
  /**
   * Stable system field key (`name`, `email`, …).
   * When set, the field cannot be deleted and its type/key cannot change.
   */
  systemKey: string | null;
  showInTable: boolean;
  showInFilters: boolean;
  /** When false, the field is hidden on the record page/dialog. */
  showOnRecord: boolean;
  /**
   * When false, the field is hidden in the «new record» form
   * (still editable later on the record page). Required and title
   * fields are always shown on create.
   */
  showOnCreate: boolean;
  /** Number / numberSum fields: include column in the table totals row. */
  includeInTotal: boolean;
  /** Lower values appear earlier among non-title table columns. */
  tableOrder: number;
  /** Target entity id for `relation` fields; otherwise null. */
  relationEntityId: string | null;
  /** When true, a relation field stores several linked record ids. */
  relationMultiple: boolean;
  /**
   * Optional unit suffix for `number` fields (e.g. «м/с», «м/с»).
   * Shown after the formatted number in display and input.
   */
  unitSuffix: string | null;
  /** Source field ids for `numberSum` fields. */
  sumFieldIds: string[];
  /** Options for this field when `type === "list"` and not linked. */
  listOptions: EntityListOption[];
  /**
   * When set, this list field reuses options from another list field
   * (usually on a different entity). Local `listOptions` are ignored.
   */
  listSourceFieldId: string | null;
  /** When true, this list field is display-only (no inline dropdown). */
  listFixed: boolean;
  /**
   * When true (and `listFixed`), the field stores several option ids.
   * Nested under «Фиксировать» in list settings.
   */
  listMultiple: boolean;
  /**
   * When true (and not multiple), the list offers «Другое» with a free-text
   * input. Stored as `__other__:…` in the record value.
   */
  listAllowOther: boolean;
  /**
   * Parent field id on the same entity (`list` or `relation`). Child options
   * are filtered by the parent's selected value(s). Depth 1 only (list parent
   * must be independent). Ignored when `listSourceFieldId` is set.
   */
  listDependsOnFieldId: string | null;
  /** When true, this list field shows color swatches. */
  listUseColors: boolean;
  /**
   * When true, the kanban board shows a «Без значения» column for records
   * without a selected option. Nested under list settings.
   */
  listShowEmptyValue: boolean;
  formula?: EntityFormulaConfig;
  rollup?: EntityRollupConfig;
  lookup?: EntityLookupConfig;
  dependencies?: EntityDependenciesConfig;
  relationGroups?: EntityRelationGroupsConfig;
  /** Value prefilled for new records. */
  defaultValue?: EntityFieldDefaultValue;
  /** `relation` fields: which target records can be chosen. */
  relationFilter?: EntityRelationFilter;
  /** `datetime` fields: overdue / due-soon highlighting. */
  deadline?: EntityDeadlineConfig;
  /** Number-like fields: show 0–100 values as a progress bar. */
  numberDisplay?: "progress";
  /** Number-like fields: color by sign (e.g. deviation above 0 — red). */
  numberSignColor?: EntityNumberSignColor;
  /**
   * When `type === "datetime"` and true, the field stores date + time.
   * When false — date only. Missing value on legacy fields means with time.
   */
  datetimeWithTime: boolean;
  /**
   * When `type === "boolean"` and true, the value is an interactive switch
   * in the table (toggle without opening the record).
   */
  booleanInline: boolean;
  colSpan: number;
  rowSpan: number;
};

export const ENTITY_NAME_FIELD_NAME = "Название";
export const ENTITY_OVERVIEW_TAB_ID = "overview";
export const ENTITY_OVERVIEW_TAB_NAME = "Обзор";

export function getEntityFieldTabId(
  field: Pick<EntityField, "tabId"> | { tabId?: string },
) {
  const tabId = typeof field.tabId === "string" ? field.tabId.trim() : "";
  return tabId.length > 0 ? tabId : ENTITY_OVERVIEW_TAB_ID;
}

export function createEntityNameField(id: string): EntityField {
  return {
    id,
    name: ENTITY_NAME_FIELD_NAME,
    type: "text",
    hint: "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: true,
    locked: true,
    systemKey: null,
    showInTable: true,
    showInFilters: true,
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
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 4,
    rowSpan: 1,
  };
}

export function isEntityNameField(field: Pick<EntityField, "locked">) {
  return Boolean(field.locked);
}

/** Field protected as part of a system entity schema (or title). */
export function isSystemEntityField(
  field: Pick<EntityField, "locked" | "systemKey">,
) {
  return Boolean(field.locked) || Boolean(field.systemKey?.trim());
}

/** Ensures every entity has exactly one locked «Название» field, pinned first. */
export function ensureEntityNameField(fields: EntityField[]): EntityField[] {
  const withFlags = fields.map((field) => ({
    ...field,
    locked: Boolean(field.locked),
  }));

  let nameIndex = withFlags.findIndex((field) => field.locked);
  if (nameIndex < 0) {
    nameIndex = withFlags.findIndex(
      (field) =>
        field.name.trim().toLowerCase() ===
        ENTITY_NAME_FIELD_NAME.toLowerCase(),
    );
  }

  if (nameIndex < 0) {
    return [
      createEntityNameField(`field-${crypto.randomUUID()}`),
      ...withFlags.map((field) => ({ ...field, locked: false })),
    ];
  }

  const existing = withFlags[nameIndex]!;
  const customName =
    typeof existing.name === "string" ? existing.name.trim() : "";
  const nameField = {
    ...existing,
    name: customName.length > 0 ? customName : ENTITY_NAME_FIELD_NAME,
    type: "text" as const,
    required: true,
    locked: true,
    systemKey:
      typeof existing.systemKey === "string" && existing.systemKey.trim()
        ? existing.systemKey.trim()
        : (existing.systemKey ?? null),
    showInTable: true,
    showOnRecord: true,
    showOnCreate: true,
  };
  const rest = withFlags
    .filter((_, index) => index !== nameIndex)
    .map((field) => ({ ...field, locked: false }));

  return [nameField, ...rest];
}

export function isEntityFieldVisibleOnRecord(
  field: Pick<EntityField, "showOnRecord" | "locked">,
) {
  if (isEntityNameField(field)) return true;
  return field.showOnRecord !== false;
}

/** Fields shown in the create-record dialog (title + required always). */
export function isEntityFieldVisibleOnCreate(
  field: Pick<EntityField, "showOnCreate" | "required" | "locked">,
) {
  if (isEntityNameField(field)) return true;
  if (field.required) return true;
  return field.showOnCreate !== false;
}

export type EntityRecord = {
  id: string;
  values: Record<string, string>;
  /** Linked Supabase Auth user id when this record is an account profile. */
  authUserId: string | null;
  /** Auth user who created the record (`entity_records.created_by`). */
  createdBy: string | null;
};

export const ENTITY_FIELD_GROUP_AREA_OPTIONS = ["primary", "tab"] as const;
export type EntityFieldGroupArea =
  (typeof ENTITY_FIELD_GROUP_AREA_OPTIONS)[number];

/** Layout metadata for a field group (order + width in a 2-col grid). */
export type EntityFieldGroup = {
  name: string;
  colSpan: number;
  /** `primary` — always visible in «Основное»; `tab` — under the field tabs. */
  area: EntityFieldGroupArea;
  /**
   * Tab that owns this group when `area === "tab"`.
   * Empty custom groups without fields still stay on their tab.
   */
  tabId?: string;
  /** «Показатели»: tiles with large values instead of a field grid. */
  display?: "metrics";
  /** Hide the group title on the record page (editor still shows a label). */
  hideTitle?: boolean;
};

export const ENTITY_RECORDS_DISPLAY_OPTIONS = ["cards", "table"] as const;
export type EntityRecordsDisplay =
  (typeof ENTITY_RECORDS_DISPLAY_OPTIONS)[number];

export function normalizeEntityRecordsDisplay(
  value: unknown,
): EntityRecordsDisplay {
  return value === "table" ? "table" : "cards";
}

/** Timer and manual time entries written as records of another entity. */
export type EntityTimeTracking = {
  /** Entity whose records are time entries (e.g. «Учёт времени»). */
  entryEntityId: string;
  /** Entry relation to the tracked record. */
  linkFieldId: string;
  /** Entry relation to «Пользователи». */
  employeeFieldId: string;
  startFieldId: string;
  endFieldId: string;
  hoursFieldId: string;
  /** Entry list «Способ» and its options for timer / manual entries. */
  methodFieldId: string | null;
  timerOptionId: string | null;
  manualOptionId: string | null;
  commentFieldId: string | null;
  /** Timer only in these options of a list of the tracked entity (empty — any). */
  statusFieldId: string | null;
  statusOptionIds: string[];
  /** Max hours per employee and day for manual entries (0 — no limit). */
  dailyLimitHours: number;
  /** Tracked record fields copied into each entry. */
  context: Array<{ sourceFieldId: string; targetFieldId: string }>;
};

export type Entity = {
  id: string;
  name: string;
  namePlural: string;
  description: string;
  /**
   * Title template for records: plain text + `{{fieldId}}` tokens from this
   * entity's fields. Empty — title is entered manually in the name field.
   */
  nameTemplate: string;
  views: EntityView[];
  /**
   * Browse view opened by default on the entity page.
   * `null` — first enabled browse view (table/kanban).
   */
  defaultView: EntityBrowseView | null;
  fields: EntityField[];
  /** Field shown in the compact header slot (next to title actions on the record page). */
  headerFieldId: string | null;
  /**
   * Field that drives kanban columns (`list` without multi, or `relation`).
   * `null` — pick the first eligible field in the UI.
   */
  kanbanFieldId: string | null;
  /**
   * Field ids shown on kanban cards (order preserved).
   * `null` — automatic defaults from header + table fields.
   */
  kanbanCardFieldIds: string[] | null;
  /**
   * Table view: show row checkboxes for bulk actions.
   * Selection is kept across pagination while the setting is on.
   */
  tableMassSelection: boolean;
  /**
   * Table view: single-choice list or relation field used to group rows.
   * When set, records are shown under their option / related record.
   * `null` — flat table.
   */
  tableParentFieldId: string | null;
  tabs: EntityTab[];
  /** Order, colSpan and area for named groups (excludes ungrouped «Основное» fields). */
  fieldGroups: EntityFieldGroup[];
  /**
   * Built-in entity key (`users`). When set, the entity cannot be deleted
   * and the key cannot be changed.
   */
  systemKey: string | null;
  /**
   * When true, schema editing is blocked in settings (fields, tabs, groups, meta).
   * Records can still be created and edited.
   */
  locked: boolean;
  /** Sub-entity owned by a parent entity tab — hidden from menu and settings list. */
  parentEntityId: string | null;
  /** Columns for record cards on a parent entity tab (sub-entities). */
  recordColumns: number;
  /** How linked records are shown on a parent entity tab. */
  recordsDisplay: EntityRecordsDisplay;
  timeTracking: EntityTimeTracking | null;
  timeline: EntityTimelineConfig | null;
  /**
   * Table-tab board: aggregate / filters / records panels.
   * `null` or empty — classic single table view.
   */
  pageLayout: EntityPageLayout | null;
  records: EntityRecord[];
};

export function isSystemEntity(entity: Pick<Entity, "systemKey">) {
  return Boolean(entity.systemKey?.trim());
}

/** Schema editing locked in entity settings. */
export function isEntityLocked(entity: Pick<Entity, "locked">) {
  return Boolean(entity.locked);
}

export const ENTITY_TAB_KINDS = [
  "fields",
  "entity",
  "records",
  "files",
  "history",
  "mirror",
] as const;
export type EntityTabKind = (typeof ENTITY_TAB_KINDS)[number];

/** Human-readable labels for tab kinds (settings, automation pickers). */
export const ENTITY_TAB_KIND_LABELS: Record<EntityTabKind, string> = {
  fields: "Поля",
  records: "Записи",
  files: "Файлы",
  history: "История",
  entity: "Сущность",
  mirror: "Из записи",
};

export function normalizeEntityTabKind(value: unknown): EntityTabKind {
  return ENTITY_TAB_KINDS.includes(value as EntityTabKind)
    ? (value as EntityTabKind)
    : "fields";
}

export function getEntityTabKindLabel(kind: EntityTabKind) {
  return ENTITY_TAB_KIND_LABELS[kind];
}

/** Root folder template for `kind: "files"` tabs (seeded on new records). */
export type EntityTabDefaultFolder = {
  id: string;
  name: string;
  color: string;
};

export type EntityTab = {
  id: string;
  name: string;
  /** System overview tab — cannot be deleted. */
  locked: boolean;
  kind: EntityTabKind;
  /** For `kind: "entity"` — child entity shown on the record tab. */
  linkedEntityId: string | null;
  /** Relation field on the child entity that stores the parent record id. */
  parentLinkFieldId: string | null;
  /**
   * For `kind: "mirror"` — relation field on this entity whose value is the
   * source record to display.
   */
  sourceRelationFieldId: string | null;
  /**
   * For `kind: "mirror"` — tab id on the related entity to render for that
   * source record.
   */
  sourceTabId: string | null;
  /**
   * For `kind: "files"` — folders created at the root of each new record.
   * Empty for other tab kinds.
   */
  defaultFolders: EntityTabDefaultFolder[];
};

/** Free-form entries on a `kind: "records"` tab (stored on the parent record). */
export type EntityTabRecordEntry = {
  id: string;
  text: string;
  createdAt: string;
  /** Users record of the author (`null` for entries written before authors). */
  authorId: string | null;
  editedAt: string | null;
};

/** Folder/file entries on a `kind: "files"` tab (metadata on the parent record). */
export type EntityTabFileEntry = {
  id: string;
  name: string;
  kind: "folder" | "file";
  /** `null` = root of the tab filesystem. */
  parentId: string | null;
  createdAt: string;
  /** Folder accent color (`#rrggbb`). */
  color?: string;
  /** Storage object path for uploaded files (Supabase Storage). */
  storagePath?: string;
  mimeType?: string;
  size?: number;
  /** Local fallback when Storage is unavailable (small files only). */
  dataUrl?: string;
};

export function getEntityTabRecordsValueKey(tabId: string) {
  return `__tab_records__:${tabId}`;
}

export function getEntityTabFilesValueKey(tabId: string) {
  return `__tab_files__:${tabId}`;
}

export function isEntityRecordsTab(tab: Pick<EntityTab, "kind">) {
  return tab.kind === "records";
}

export function isEntityFilesTab(tab: Pick<EntityTab, "kind">) {
  return tab.kind === "files";
}

export function isEntityHistoryTab(tab: Pick<EntityTab, "kind">) {
  return tab.kind === "history";
}

export function isEntityMirrorTab(tab: Pick<EntityTab, "kind">) {
  return tab.kind === "mirror";
}

/** Tab with built-in content (notes, files, history) instead of fields. */
export function isEntityContentTab(tab: Pick<EntityTab, "kind">) {
  return (
    isEntityRecordsTab(tab) || isEntityFilesTab(tab) || isEntityHistoryTab(tab)
  );
}

export function parseEntityTabRecordEntries(
  value: string | undefined,
): EntityTabRecordEntry[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const text = typeof record.text === "string" ? record.text.trim() : "";
        const createdAt =
          typeof record.createdAt === "string" ? record.createdAt.trim() : "";
        if (!id || !text || !createdAt) return null;
        const authorId =
          typeof record.authorId === "string" && record.authorId.trim()
            ? record.authorId.trim()
            : null;
        const editedAt =
          typeof record.editedAt === "string" && record.editedAt.trim()
            ? record.editedAt.trim()
            : null;
        return { id, text, createdAt, authorId, editedAt };
      })
      .filter((item): item is EntityTabRecordEntry => item != null);
  } catch {
    return [];
  }
}

export function serializeEntityTabRecordEntries(
  entries: readonly EntityTabRecordEntry[],
) {
  return JSON.stringify(entries);
}

export function parseEntityTabFileEntries(
  value: string | undefined,
): EntityTabFileEntry[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const name = typeof record.name === "string" ? record.name.trim() : "";
        const kind =
          record.kind === "folder" || record.kind === "file"
            ? record.kind
            : null;
        const createdAt =
          typeof record.createdAt === "string" ? record.createdAt.trim() : "";
        if (!id || !name || !kind || !createdAt) return null;

        const parentRaw = record.parentId;
        const parentId =
          typeof parentRaw === "string" && parentRaw.trim().length > 0
            ? parentRaw.trim()
            : null;

        const entry: EntityTabFileEntry = {
          id,
          name,
          kind,
          parentId,
          createdAt,
        };

        if (kind === "folder") {
          if (typeof record.color === "string" && record.color.trim()) {
            entry.color = normalizeListColor(record.color);
          }
        }

        if (kind === "file") {
          if (typeof record.storagePath === "string" && record.storagePath) {
            entry.storagePath = record.storagePath;
          }
          if (typeof record.mimeType === "string" && record.mimeType) {
            entry.mimeType = record.mimeType;
          }
          if (typeof record.size === "number" && Number.isFinite(record.size)) {
            entry.size = Math.max(0, Math.round(record.size));
          }
          if (typeof record.dataUrl === "string" && record.dataUrl) {
            entry.dataUrl = record.dataUrl;
          }
        }

        return entry;
      })
      .filter((item): item is EntityTabFileEntry => item != null);
  } catch {
    return [];
  }
}

export function serializeEntityTabFileEntries(
  entries: readonly EntityTabFileEntry[],
) {
  return JSON.stringify(entries);
}

/**
 * Multi-file field value: same entry shape as files tabs.
 * Legacy singular `{ name, storagePath, … }` is wrapped into one entry.
 */
export function parseEntityFieldFileEntries(
  value: string | undefined,
): EntityTabFileEntry[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parseEntityTabFileEntries(raw);
    }
    if (!parsed || typeof parsed !== "object") return [];

    const legacy = parseEntityFieldFileValue(raw);
    if (!legacy) return [];

    const stableId =
      legacy.storagePath?.trim() ||
      (legacy.dataUrl ? `data:${legacy.name}` : `legacy:${legacy.name}`);

    const entry: EntityTabFileEntry = {
      id: stableId,
      name: legacy.name,
      kind: "file",
      parentId: null,
      createdAt: new Date(0).toISOString(),
    };
    if (legacy.storagePath) entry.storagePath = legacy.storagePath;
    if (legacy.dataUrl) entry.dataUrl = legacy.dataUrl;
    if (legacy.mimeType) entry.mimeType = legacy.mimeType;
    if (legacy.size != null) entry.size = legacy.size;
    return [entry];
  } catch {
    return [];
  }
}

export function serializeEntityFieldFileEntries(
  entries: readonly EntityTabFileEntry[],
) {
  if (entries.length === 0) return "";
  return JSON.stringify(entries);
}

export function countEntityFieldFiles(entries: readonly EntityTabFileEntry[]) {
  return entries.reduce(
    (count, entry) => count + (entry.kind === "file" ? 1 : 0),
    0,
  );
}

export function formatEntityFileSize(bytes: number | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function createEntityOverviewTab(): EntityTab {
  return {
    id: ENTITY_OVERVIEW_TAB_ID,
    name: ENTITY_OVERVIEW_TAB_NAME,
    locked: true,
    kind: "fields",
    linkedEntityId: null,
    parentLinkFieldId: null,
    sourceRelationFieldId: null,
    sourceTabId: null,
    defaultFolders: [],
  };
}

export function isEntitySubEntity(entity: Pick<Entity, "parentEntityId">) {
  return (
    typeof entity.parentEntityId === "string" &&
    entity.parentEntityId.trim().length > 0
  );
}

/** Root entity used only for relations/settings — no menu section. */
export function isEntityInternal(entity: Pick<Entity, "views">) {
  return entity.views.includes("internal");
}

/** Browse views for EntityPage tabs (ignores `internal`). */
export function getEntityBrowseViews(
  views: readonly EntityView[],
): EntityBrowseView[] {
  const unique: EntityBrowseView[] = [];
  for (const view of views) {
    if (!isEntityBrowseView(view) || unique.includes(view)) continue;
    unique.push(view);
  }
  return unique;
}

export function normalizeEntityDefaultView(
  views: readonly EntityView[],
  value: unknown,
): EntityBrowseView | null {
  if (views.includes("internal")) return null;
  const browse = getEntityBrowseViews(views);
  if (browse.length === 0) return null;
  if (isEntityBrowseView(value) && browse.includes(value)) return value;
  return null;
}

/** Resolved browse view to open first on the entity page. */
export function resolveEntityDefaultView(
  entity: Pick<Entity, "views" | "defaultView">,
): EntityBrowseView {
  const browse = getEntityBrowseViews(entity.views);
  if (browse.length === 0) return "table";
  if (entity.defaultView && browse.includes(entity.defaultView)) {
    return entity.defaultView;
  }
  return browse[0]!;
}

export function isEntityTabWithLinkedEntity(
  tab: Pick<EntityTab, "kind" | "linkedEntityId">,
) {
  return tab.kind === "entity" && Boolean(tab.linkedEntityId?.trim());
}

export function isEntityTabWithMirrorSource(
  tab: Pick<EntityTab, "kind" | "sourceRelationFieldId" | "sourceTabId">,
) {
  return (
    isEntityMirrorTab(tab) &&
    Boolean(tab.sourceRelationFieldId?.trim()) &&
    Boolean(tab.sourceTabId?.trim())
  );
}

/** Tabs that can host field layout in entity settings. */
export function isEntityFieldsHostTab(
  tab: Pick<EntityTab, "kind" | "linkedEntityId">,
) {
  return (
    !isEntityContentTab(tab) &&
    !isEntityMirrorTab(tab) &&
    !isEntityTabWithLinkedEntity(tab)
  );
}

/** Resolved mirror target for a host record (related record + its tab). */
export type EntityMirrorTabResolution = {
  relationField: EntityField;
  sourceEntity: Entity;
  sourceTab: EntityTab;
  sourceRecordId: string | null;
  sourceRecord: EntityRecord | null;
};

/**
 * Resolve which related record/tab a mirror tab should show for `hostRecord`.
 * Returns `null` when the mirror config itself is invalid.
 */
export function resolveEntityMirrorTab(
  tab: Pick<EntityTab, "kind" | "sourceRelationFieldId" | "sourceTabId">,
  hostEntity: Pick<Entity, "fields">,
  hostRecord: Pick<EntityRecord, "values">,
  entities: Entity[],
): EntityMirrorTabResolution | null {
  if (!isEntityTabWithMirrorSource(tab)) return null;
  const relationField =
    hostEntity.fields.find(
      (field) =>
        field.id === tab.sourceRelationFieldId && field.type === "relation",
    ) ?? null;
  if (!relationField) return null;
  const targetId = getEntityRelationTargetId(relationField);
  if (!targetId) return null;
  const sourceEntity =
    entities.find((entity) => entity.id === targetId) ?? null;
  if (!sourceEntity) return null;
  const sourceTab =
    sourceEntity.tabs.find((item) => item.id === tab.sourceTabId) ?? null;
  if (!sourceTab || isEntityMirrorTab(sourceTab)) return null;
  const sourceRecordId =
    parseEntityRelationIds(hostRecord.values[relationField.id] ?? "")[0] ??
    null;
  const sourceRecord = sourceRecordId
    ? (sourceEntity.records.find((item) => item.id === sourceRecordId) ?? null)
    : null;
  return {
    relationField,
    sourceEntity,
    sourceTab,
    sourceRecordId,
    sourceRecord,
  };
}

/** Real fields-host tab ids from the entity — never invents a missing «Обзор». */
export function getEntityFieldsHostTabIds(
  tabs: Array<Pick<EntityTab, "id" | "kind" | "linkedEntityId">>,
) {
  return new Set(tabs.filter(isEntityFieldsHostTab).map((tab) => tab.id));
}

/**
 * Home tab for «Общее» and orphan fields: «Обзор» if present, else the first
 * fields tab. Falls back to overview id only when no fields tab exists yet.
 */
export function getEntityHomeFieldsTabId(
  tabs: Array<Pick<EntityTab, "id" | "kind" | "linkedEntityId" | "locked">>,
) {
  const overview = tabs.find((tab) => isEntityOverviewTab(tab));
  if (overview) return overview.id;
  const host = tabs.find((tab) => isEntityFieldsHostTab(tab));
  return host?.id ?? ENTITY_OVERVIEW_TAB_ID;
}

export function getVisibleEntities(entities: Entity[]) {
  return entities.filter((entity) => !isEntitySubEntity(entity));
}

export function isEntityParentLinkField(
  field: EntityField,
  parentLinkFieldId: string | null | undefined,
) {
  return (
    typeof parentLinkFieldId === "string" &&
    parentLinkFieldId.length > 0 &&
    field.id === parentLinkFieldId
  );
}

/** System relation fields used by entity tabs (`parentLinkFieldId` on the linked entity). */
export function getEntityTabLinkFieldIds(
  entityId: string,
  entities: Array<Pick<Entity, "tabs">>,
) {
  const ids = new Set<string>();
  for (const entity of entities) {
    for (const tab of entity.tabs) {
      if (
        !isEntityTabWithLinkedEntity(tab) ||
        tab.linkedEntityId !== entityId ||
        !tab.parentLinkFieldId
      ) {
        continue;
      }
      ids.add(tab.parentLinkFieldId);
    }
  }
  return ids;
}

export const ENTITY_RECORD_COLUMN_OPTIONS = [1, 2, 3] as const;
export type EntityRecordColumns = (typeof ENTITY_RECORD_COLUMN_OPTIONS)[number];

export function normalizeEntityRecordColumns(
  value: unknown,
): EntityRecordColumns {
  const numeric = typeof value === "number" ? value : Number(value);
  if (numeric === 1 || numeric === 2 || numeric === 3) return numeric;
  return 2;
}

export function isEntityOverviewTab(tab: Pick<EntityTab, "locked" | "id">) {
  return Boolean(tab.locked) || tab.id === ENTITY_OVERVIEW_TAB_ID;
}

export function normalizeEntityTabDefaultFolders(
  value: unknown,
): EntityTabDefaultFolder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: EntityTabDefaultFolder[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name,
      color: normalizeListColor(
        typeof record.color === "string"
          ? record.color
          : DEFAULT_ENTITY_FOLDER_COLOR,
      ),
    });
  }
  return result;
}

/** File entries for a files tab root from configured default folders. */
export function buildEntityTabDefaultFileEntries(
  folders: readonly EntityTabDefaultFolder[],
  createdAt = new Date().toISOString(),
): EntityTabFileEntry[] {
  return folders.map((folder) => ({
    id: crypto.randomUUID(),
    name: folder.name,
    kind: "folder" as const,
    parentId: null,
    createdAt,
    color: normalizeListColor(folder.color),
  }));
}

export function normalizeEntityTab(
  tab: Omit<
    EntityTab,
    "defaultFolders" | "sourceRelationFieldId" | "sourceTabId"
  > & {
    defaultFolders?: EntityTabDefaultFolder[] | unknown;
    sourceRelationFieldId?: string | null;
    sourceTabId?: string | null;
  },
): EntityTab {
  const locked = isEntityOverviewTab(tab);
  const name = typeof tab.name === "string" ? tab.name.trim() : "";
  const kind: EntityTabKind = locked
    ? "fields"
    : normalizeEntityTabKind(tab.kind);
  const linkedEntityId =
    kind === "entity" && typeof tab.linkedEntityId === "string"
      ? tab.linkedEntityId.trim() || null
      : null;
  const parentLinkFieldId =
    kind === "entity" && typeof tab.parentLinkFieldId === "string"
      ? tab.parentLinkFieldId.trim() || null
      : null;
  const sourceRelationFieldId =
    kind === "mirror" && typeof tab.sourceRelationFieldId === "string"
      ? tab.sourceRelationFieldId.trim() || null
      : null;
  const sourceTabId =
    kind === "mirror" && typeof tab.sourceTabId === "string"
      ? tab.sourceTabId.trim() || null
      : null;
  const defaultFolders =
    kind === "files"
      ? normalizeEntityTabDefaultFolders(tab.defaultFolders)
      : [];
  return {
    id: locked ? ENTITY_OVERVIEW_TAB_ID : tab.id,
    name:
      name.length > 0
        ? name
        : locked
          ? ENTITY_OVERVIEW_TAB_NAME
          : "Без названия",
    locked,
    kind,
    linkedEntityId: locked ? null : linkedEntityId,
    parentLinkFieldId: locked ? null : parentLinkFieldId,
    sourceRelationFieldId: locked ? null : sourceRelationFieldId,
    sourceTabId: locked ? null : sourceTabId,
    defaultFolders,
  };
}

/**
 * Keeps «Обзор» first when present.
 * If overview was removed but other tabs remain, do not recreate it.
 * Empty list falls back to a fresh overview tab.
 */
export function ensureEntityTabs(tabs: EntityTab[]): EntityTab[] {
  const normalized = tabs.map((tab) => normalizeEntityTab(tab));
  const overview = normalized.find((tab) => isEntityOverviewTab(tab));
  const custom = normalized.filter((tab) => !isEntityOverviewTab(tab));
  if (overview) {
    return [normalizeEntityTab(overview), ...custom];
  }
  if (custom.length > 0) return custom;
  return [createEntityOverviewTab()];
}

export function getEntityHeaderField(entity: Entity): EntityField | null {
  if (!entity.headerFieldId) return null;
  const field = entity.fields.find((item) => item.id === entity.headerFieldId);
  if (!field || isEntityNameField(field)) return null;
  return field;
}

/** Fields that can drive kanban columns: single list or relation. */
export function isEntityKanbanGroupField(
  field: Pick<EntityField, "type" | "listMultiple">,
) {
  if (field.type === "relation") return true;
  return field.type === "list" && !field.listMultiple;
}

export function getEntityKanbanGroupFields(entity: Pick<Entity, "fields">) {
  return entity.fields.filter((field) => isEntityKanbanGroupField(field));
}

export function resolveEntityKanbanFieldId(
  fields: EntityField[],
  kanbanFieldId: string | null | undefined,
): string | null {
  const candidates = fields.filter((field) => isEntityKanbanGroupField(field));
  if (candidates.length === 0) return null;
  const requested =
    typeof kanbanFieldId === "string" ? kanbanFieldId.trim() : "";
  if (requested && candidates.some((field) => field.id === requested)) {
    return requested;
  }
  return candidates[0]!.id;
}

export function getEntityKanbanField(entity: Entity): EntityField | null {
  const fieldId = resolveEntityKanbanFieldId(
    entity.fields,
    entity.kanbanFieldId,
  );
  if (!fieldId) return null;
  return entity.fields.find((field) => field.id === fieldId) ?? null;
}

/** Max fields rendered under the title on a kanban card. */
export const ENTITY_KANBAN_CARD_FIELD_LIMIT = 6;

export function getEntityKanbanCardFieldCandidates(
  entity: Pick<Entity, "fields"> & Partial<Pick<Entity, "fieldGroups">>,
): EntityField[] {
  const isCandidate = (field: EntityField) =>
    !isEntityNameField(field) &&
    field.type !== "textarea" &&
    field.type !== "file";

  // Same group/layout order as on the entity record form.
  return groupEntityFields(entity.fields, entity.fieldGroups)
    .flatMap((group) => group.fields)
    .filter(isCandidate);
}

export function normalizeEntityKanbanCardFieldIds(
  fields: EntityField[],
  _groupFieldId: string | null,
  value: unknown,
): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const allowed = new Set(
    getEntityKanbanCardFieldCandidates({ fields }).map((field) => field.id),
  );
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    ids.push(item);
    if (ids.length >= ENTITY_KANBAN_CARD_FIELD_LIMIT) break;
  }
  return ids;
}

export function resolveEntityKanbanCardFields(
  entity: Entity,
  groupFieldId: string | null,
): EntityField[] {
  const candidates = getEntityKanbanCardFieldCandidates(entity);
  const byId = new Map(candidates.map((field) => [field.id, field]));

  if (entity.kanbanCardFieldIds != null) {
    const selected = new Set(entity.kanbanCardFieldIds);
    return candidates
      .filter((field) => selected.has(field.id))
      .slice(0, ENTITY_KANBAN_CARD_FIELD_LIMIT);
  }

  const header = getEntityHeaderField(entity);
  const result: EntityField[] = [];
  if (header && header.id !== groupFieldId && byId.has(header.id)) {
    result.push(header);
  }
  for (const field of getEntityTableFields(entity.fields)) {
    if (result.length >= ENTITY_KANBAN_CARD_FIELD_LIMIT) break;
    if (
      field.id === groupFieldId ||
      !byId.has(field.id) ||
      result.some((item) => item.id === field.id)
    ) {
      continue;
    }
    result.push(field);
  }
  return result;
}

export type EntityKanbanColumn = {
  id: string;
  label: string;
  color?: string;
};

/** Sentinel column id for records without a group value (not stored as-is). */
export const ENTITY_KANBAN_EMPTY_COLUMN_ID = "__kanban_empty__";

export function getEntityKanbanColumns(
  field: EntityField | null,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields" | "records">>,
): EntityKanbanColumn[] {
  if (!field) return [];

  if (field.type === "list") {
    const options = resolveEntityListFieldOptions(field, entities);
    const { listUseColors, listShowEmptyValue } =
      resolveEntityListFieldPresentation(field, entities);
    const columns: EntityKanbanColumn[] = options.map((option) => ({
      id: option.id,
      label: option.name,
      color: listUseColors ? option.color : undefined,
    }));
    if (listShowEmptyValue) {
      columns.unshift({
        id: ENTITY_KANBAN_EMPTY_COLUMN_ID,
        label: "Без значения",
      });
    }
    return columns;
  }

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    return [
      { id: ENTITY_KANBAN_EMPTY_COLUMN_ID, label: "Без значения" },
      ...getRelationRecordOptions(target).map((option) => ({
        id: option.id,
        label: option.label,
      })),
    ];
  }

  return [];
}

/** Column id for a record under the kanban group field. */
export function getEntityRecordKanbanColumnId(
  field: Pick<EntityField, "type" | "listMultiple">,
  value: string | undefined,
) {
  if (field.type === "list") {
    return parseEntityListValueIds(value)[0] ?? ENTITY_KANBAN_EMPTY_COLUMN_ID;
  }
  if (field.type === "relation") {
    return parseEntityRelationIds(value)[0] ?? ENTITY_KANBAN_EMPTY_COLUMN_ID;
  }
  return ENTITY_KANBAN_EMPTY_COLUMN_ID;
}

export function serializeEntityKanbanColumnValue(
  field: Pick<EntityField, "type">,
  columnId: string,
) {
  const id = columnId === ENTITY_KANBAN_EMPTY_COLUMN_ID ? "" : columnId.trim();
  if (field.type === "list") return id;
  if (field.type === "relation") {
    return id ? serializeEntityRelationIds([id]) : "";
  }
  return "";
}

export type EntityConfig = {
  entities: Entity[];
};

export const DEFAULT_ENTITY_LIST_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
] as const;

export const DEFAULT_ENTITY_FOLDER_COLOR = DEFAULT_ENTITY_LIST_COLORS[2];

export function createDefaultEntityListOptions(
  createId: () => string,
): EntityListOption[] {
  return [
    { id: createId(), name: "Новый", color: "#3b82f6", parentOptionId: null },
    {
      id: createId(),
      name: "В работе",
      color: "#f59e0b",
      parentOptionId: null,
    },
    { id: createId(), name: "Готово", color: "#22c55e", parentOptionId: null },
    {
      id: createId(),
      name: "Отменён",
      color: "#ef4444",
      parentOptionId: null,
    },
  ];
}

export function normalizeListColor(color: string) {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_ENTITY_LIST_COLORS[0];
}

export function getEntityListOption(
  options: EntityListOption[],
  optionId: string | undefined,
) {
  if (!optionId) return null;
  return options.find((option) => option.id === optionId) ?? null;
}

/** Resolve selected list options from a single- or multi-value field string. */
export function getEntityListOptions(
  options: EntityListOption[],
  value: string | undefined,
) {
  return parseEntityRelationIds(value)
    .map((id) => getEntityListOption(options, id))
    .filter((option): option is EntityListOption => option != null);
}

export type EntityListSourceRef = {
  entity: Pick<Entity, "id" | "fields"> &
    Partial<Pick<Entity, "name" | "namePlural">>;
  field: EntityField;
};

/** Find the list field that owns options for a (possibly linked) list field. */
export function resolveEntityListFieldSource(
  field: Pick<EntityField, "id" | "type" | "listSourceFieldId">,
  entities: ReadonlyArray<
    Pick<Entity, "id" | "fields"> & Partial<Pick<Entity, "name" | "namePlural">>
  >,
  visited: Set<string> = new Set(),
): EntityListSourceRef | null {
  if (field.type !== "list") return null;
  const sourceId = field.listSourceFieldId?.trim() ?? "";
  if (!sourceId) return null;
  const selfId = typeof field.id === "string" ? field.id.trim() : "";
  if (selfId) {
    if (visited.has(selfId)) return null;
    visited.add(selfId);
  }
  for (const entity of entities) {
    const source =
      entity.fields.find(
        (item) => item.id === sourceId && item.type === "list",
      ) ?? null;
    if (!source) continue;
    if (source.listSourceFieldId?.trim()) {
      return resolveEntityListFieldSource(source, entities, visited);
    }
    return { entity, field: source };
  }
  return null;
}

/** Effective list options for a field (own or linked from another field). */
export function resolveEntityListFieldOptions(
  field: Pick<EntityField, "id" | "type" | "listOptions" | "listSourceFieldId">,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">> = [],
): EntityListOption[] {
  if (field.type !== "list") return [];
  const source = resolveEntityListFieldSource(field, entities);
  if (source) return source.field.listOptions ?? [];
  if (field.listSourceFieldId?.trim()) return [];
  return field.listOptions ?? [];
}

/**
 * Presentation flags for a list field. Linked fields inherit colors / fixed
 * from the options source (those toggles live only on the source settings).
 * `listMultiple` always stays on the field that stores the value.
 */
export function resolveEntityListFieldPresentation(
  field: Pick<
    EntityField,
    | "id"
    | "type"
    | "listSourceFieldId"
    | "listUseColors"
    | "listShowEmptyValue"
    | "listFixed"
    | "listMultiple"
  >,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">> = [],
): {
  listUseColors: boolean;
  listShowEmptyValue: boolean;
  listFixed: boolean;
  listMultiple: boolean;
} {
  if (field.type !== "list") {
    return {
      listUseColors: false,
      listShowEmptyValue: true,
      listFixed: false,
      listMultiple: false,
    };
  }
  const source = resolveEntityListFieldSource(field, entities)?.field;
  const listFixed = source ? source.listFixed : field.listFixed;
  return {
    listUseColors: source ? source.listUseColors : field.listUseColors,
    listShowEmptyValue: source
      ? source.listShowEmptyValue
      : field.listShowEmptyValue,
    listFixed,
    listMultiple: listFixed ? field.listMultiple : false,
  };
}

export function formatEntityListFieldValue(
  field: Pick<
    EntityField,
    | "id"
    | "type"
    | "listOptions"
    | "listMultiple"
    | "listAllowOther"
    | "listSourceFieldId"
  >,
  value: string | undefined,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">> = [],
) {
  if (
    !field.listMultiple &&
    field.listAllowOther &&
    isEntityListOtherValue(value)
  ) {
    const text = parseEntityListOtherText(value).trim();
    return text.length > 0 ? text : "Другое";
  }
  const options = resolveEntityListFieldOptions(field, entities);
  if (field.listMultiple) {
    const selected = getEntityListOptions(options, value);
    if (selected.length === 0) return "—";
    return selected.map((option) => option.name).join(", ");
  }
  return getEntityListOption(options, value)?.name ?? "—";
}

/** Expand `{{fieldId}}` in a record name using sibling field values (no formula ctx). */
function resolveRecordNameLabel(
  entity: Pick<Entity, "fields"> & { nameTemplate?: string },
  values: Record<string, string>,
  entities?: readonly Entity[],
): string {
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "Без названия";
  const entityTemplate = entity.nameTemplate?.trim() ?? "";
  const raw = entityTemplate || (values[nameField.id] ?? "").trim();
  if (!raw) return "Без названия";
  if (!/\{\{[^}]+\}\}/.test(raw)) return raw;

  const text = raw
    .replace(/\{\{([^}]+)\}\}/g, (_match, rawId: string) => {
      const fieldId = rawId.trim();
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field || isEntityNameField(field)) return "";
      if (field.type === "list") {
        const label = formatEntityListFieldValue(
          field,
          values[field.id],
          entities,
        );
        return !label || label === "—" ? "" : label;
      }
      if (field.type === "relation") {
        const targetId = getEntityRelationTargetId(field);
        const target = targetId
          ? entities?.find((item) => item.id === targetId)
          : null;
        return resolveRelationRecordLabel(target, values[field.id]) ?? "";
      }
      const label = formatEntityFieldScalarValue(field, values[field.id]);
      return !label || label === "—" ? "" : label;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text || "Без названия";
}

export function resolveRelationRecordLabel(
  target: Pick<Entity, "fields" | "records"> | null | undefined,
  value: string | undefined,
  entities?: readonly Entity[],
) {
  if (!target) return null;
  const ids = parseEntityRelationIds(value);
  if (ids.length === 0) return null;
  const labels = ids.map((recordId) => {
    const record = target.records.find((item) => item.id === recordId);
    if (!record) return "Без названия";
    return resolveRecordNameLabel(target, record.values, entities);
  });
  return labels.length > 0 ? labels.join(", ") : null;
}

export type RelationRecordOption = {
  id: string;
  label: string;
};

export function getRelationRecordOptions(
  target: Pick<Entity, "fields" | "records"> | null | undefined,
  entities?: readonly Entity[],
): RelationRecordOption[] {
  if (!target) return [];

  return target.records.map((record) => ({
    id: record.id,
    label: resolveRecordNameLabel(target, record.values, entities),
  }));
}

export function getEntityFieldListOptions(
  field: Pick<EntityField, "id" | "type" | "listOptions" | "listSourceFieldId">,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">> = [],
): EntityListOption[] {
  return resolveEntityListFieldOptions(field, entities);
}

export function getEntityDisplayName(
  entity: Pick<Entity, "name" | "namePlural">,
) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

/**
 * Resolve an entity id to a UI caption. Never returns a raw id
 * (deleted / unknown → `missingLabel`).
 */
export function resolveEntityDisplayLabel(
  entities: ReadonlyArray<Pick<Entity, "id" | "name" | "namePlural">>,
  entityId: string,
  missingLabel = "Удалённая сущность",
): string {
  const id = entityId.trim();
  if (!id) return "сущность";
  const entity = entities.find((item) => item.id === id);
  return entity ? getEntityDisplayName(entity) : missingLabel;
}

/**
 * Ownership chain for an entity including parents, e.g. «Юрлица → Кошельки».
 * Walks `parentEntityId` from leaf to root.
 */
export function getEntityPathLabel(
  entityId: string,
  entities: ReadonlyArray<
    Pick<Entity, "id" | "name" | "namePlural" | "parentEntityId">
  >,
) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(entityId) ?? null;

  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    parts.unshift(getEntityDisplayName(current));
    const parentId = current.parentEntityId?.trim() || "";
    current = parentId ? (byId.get(parentId) ?? null) : null;
  }

  return parts.length > 0 ? parts.join(" → ") : "Без названия";
}

/** Own (non-linked) list fields that can be reused as a shared source. */
export function getEntityListSourceCandidates(
  entities: ReadonlyArray<
    Pick<Entity, "id" | "name" | "namePlural" | "parentEntityId" | "fields">
  >,
  options?: {
    /** Exclude lists from this entity (typically the one being edited). */
    excludeEntityId?: string | null;
    /** Exclude this field id (the field being edited). */
    excludeFieldId?: string | null;
  },
): Array<{
  fieldId: string;
  fieldName: string;
  entityId: string;
  entityName: string;
  optionCount: number;
  label: string;
}> {
  const excludeEntityId = options?.excludeEntityId?.trim() || null;
  const excludeFieldId = options?.excludeFieldId?.trim() || null;
  const result: Array<{
    fieldId: string;
    fieldName: string;
    entityId: string;
    entityName: string;
    optionCount: number;
    label: string;
  }> = [];

  for (const entity of entities) {
    if (excludeEntityId && entity.id === excludeEntityId) continue;
    const entityPath = getEntityPathLabel(entity.id, entities);
    for (const field of entity.fields) {
      if (field.type !== "list") continue;
      if (field.listSourceFieldId?.trim()) continue;
      if (excludeFieldId && field.id === excludeFieldId) continue;
      const fieldName = getEntityFieldDisplayName(field);
      result.push({
        fieldId: field.id,
        fieldName,
        entityId: entity.id,
        entityName: entityPath,
        optionCount: field.listOptions.length,
        label: `${entityPath} → ${fieldName}`,
      });
    }
  }

  return result.sort((a, b) =>
    a.label.localeCompare(b.label, "ru", { sensitivity: "base" }),
  );
}

function isEntityListDependencyParentType(
  field: Pick<
    EntityField,
    "type" | "listDependsOnFieldId" | "listSourceFieldId"
  >,
): boolean {
  if (field.type === "relation") return true;
  return (
    field.type === "list" &&
    !field.listDependsOnFieldId &&
    !field.listSourceFieldId
  );
}

export function getEntityListParentField(
  entity: Pick<Entity, "fields">,
  field: Pick<EntityField, "type" | "listDependsOnFieldId">,
): EntityField | null {
  if (field.type !== "list") return null;
  const parentId = field.listDependsOnFieldId?.trim() ?? "";
  if (!parentId) return null;
  const parent = entity.fields.find((item) => item.id === parentId) ?? null;
  if (!parent || !isEntityListDependencyParentType(parent)) return null;
  return parent;
}

/** List or relation fields that can be used as a dependency parent (v1: depth 1). */
export function getEntityListDependencyCandidates(
  entity: Pick<Entity, "fields">,
  fieldId: string,
): EntityField[] {
  return entity.fields.filter(
    (item) => item.id !== fieldId && isEntityListDependencyParentType(item),
  );
}

export type EntityListDependencyParentValue = {
  id: string;
  name: string;
  color?: string;
};

/** Parent values to nest child list options under in settings. */
export function getEntityListDependencyParentValues(
  parentField: EntityField | null,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields" | "records">>,
): EntityListDependencyParentValue[] {
  if (!parentField) return [];
  if (parentField.type === "list") {
    const options = resolveEntityListFieldOptions(parentField, entities);
    return options.map((option) => ({
      id: option.id,
      name: option.name,
      color: parentField.listUseColors ? option.color : undefined,
    }));
  }
  if (parentField.type === "relation") {
    const targetId = getEntityRelationTargetId(parentField);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    return getRelationRecordOptions(target).map((option) => ({
      id: option.id,
      name: option.label,
    }));
  }
  return [];
}

/**
 * Options visible for a (possibly dependent) list field given the parent value.
 * Independent fields return all options. Empty parent → no options.
 * Multi parent → union of options for all selected parent value ids.
 */
export function getVisibleListOptions(
  field: Pick<
    EntityField,
    "id" | "type" | "listOptions" | "listDependsOnFieldId" | "listSourceFieldId"
  >,
  parentValue: string | undefined,
  parentField: Pick<
    EntityField,
    "id" | "type" | "listOptions" | "listSourceFieldId"
  > | null,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">> = [],
): EntityListOption[] {
  if (field.type !== "list") return [];
  const all = resolveEntityListFieldOptions(field, entities);
  if (field.listSourceFieldId?.trim() || !field.listDependsOnFieldId) {
    return all;
  }
  if (
    !parentField ||
    (parentField.type !== "list" && parentField.type !== "relation")
  ) {
    return [];
  }

  const parentIds = parseEntityRelationIds(parentValue);
  if (parentIds.length === 0) return [];

  const parentIdSet = new Set(parentIds);
  return all.filter(
    (option) =>
      option.parentOptionId != null && parentIdSet.has(option.parentOptionId),
  );
}

export function sanitizeListValueAgainstOptions(
  value: string | undefined,
  visibleOptions: EntityListOption[],
  listMultiple: boolean,
  listAllowOther = false,
): string {
  if (!listMultiple && listAllowOther && isEntityListOtherValue(value)) {
    return value ?? "";
  }
  const allowed = new Set(visibleOptions.map((option) => option.id));
  if (listMultiple) {
    return serializeEntityRelationIds(
      parseEntityRelationIds(value).filter((id) => allowed.has(id)),
    );
  }
  const single = (value ?? "").trim();
  return allowed.has(single) ? single : "";
}

/** Resolve and sanitize listDependsOnFieldId / parentOptionId across entity fields. */
export function resolveEntityListDependencies(
  fields: EntityField[],
): EntityField[] {
  const byId = new Map(fields.map((field) => [field.id, field]));

  return fields.map((field) => {
    if (field.type !== "list") {
      if (
        field.listDependsOnFieldId == null &&
        field.listOptions.every((option) => option.parentOptionId == null)
      ) {
        return field;
      }
      return {
        ...field,
        listDependsOnFieldId: null,
        listOptions: field.listOptions.map((option) =>
          option.parentOptionId == null
            ? option
            : { ...option, parentOptionId: null },
        ),
      };
    }

    const rawParentId = field.listDependsOnFieldId?.trim() || null;
    if (!rawParentId) {
      if (field.listOptions.every((option) => option.parentOptionId == null)) {
        return field.listDependsOnFieldId == null
          ? field
          : { ...field, listDependsOnFieldId: null };
      }
      return {
        ...field,
        listDependsOnFieldId: null,
        listOptions: field.listOptions.map((option) =>
          option.parentOptionId == null
            ? option
            : { ...option, parentOptionId: null },
        ),
      };
    }

    const parent = byId.get(rawParentId);
    const parentValid =
      parent != null &&
      parent.id !== field.id &&
      isEntityListDependencyParentType(parent);

    if (!parentValid) {
      return {
        ...field,
        listDependsOnFieldId: null,
        listOptions: field.listOptions.map((option) =>
          option.parentOptionId == null
            ? option
            : { ...option, parentOptionId: null },
        ),
      };
    }

    if (parent.type === "relation") {
      return {
        ...field,
        listDependsOnFieldId: rawParentId,
      };
    }

    const parentOptionIds = new Set(parent.listOptions.map((item) => item.id));
    const nextOptions = field.listOptions.map((option) => {
      const parentOptionId =
        option.parentOptionId && parentOptionIds.has(option.parentOptionId)
          ? option.parentOptionId
          : null;
      return parentOptionId === option.parentOptionId
        ? option
        : { ...option, parentOptionId };
    });

    return {
      ...field,
      listDependsOnFieldId: rawParentId,
      listOptions: nextOptions,
    };
  });
}

/**
 * Table columns: title field first, then other visible fields.
 * Default: by `tableOrder`, then array index.
 * `preferArrayOrder` — settings list order (service / internal entities).
 */
export function getEntityTableFields(
  fields: EntityField[],
  options?: { preferArrayOrder?: boolean },
): EntityField[] {
  const visible = fields.filter((field) => field.showInTable !== false);
  const title = visible.filter((field) => isEntityNameField(field));
  const indexById = new Map(fields.map((field, index) => [field.id, index]));
  const rest = visible
    .filter((field) => !isEntityNameField(field))
    .slice()
    .sort((a, b) => {
      if (!options?.preferArrayOrder && a.tableOrder !== b.tableOrder) {
        return a.tableOrder - b.tableOrder;
      }
      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
    });
  return [...title, ...rest];
}

export const ENTITY_VIEW_OPTIONS: Array<{
  value: EntityView;
  label: string;
  description: string;
}> = [
  {
    value: "internal",
    label: "Служебная",
    description: "Без раздела в меню",
  },
  {
    value: "table",
    label: "Таблица",
    description: "Список записей",
  },
  {
    value: "kanban",
    label: "Канбан",
    description: "Карточки по колонкам",
  },
  {
    value: "timeline",
    label: "График",
    description: "Сроки и зависимости",
  },
];

export const PRIMARY_ENTITY_FIELD_GROUP = "Основное";
export const DEFAULT_ENTITY_FIELD_GROUP = "Общее";
/** Pseudo-group in the field form: field shown next to record actions. */
export const ENTITY_HEADER_FIELD_GROUP = "Блок управления";
export const ENTITY_FIELD_GROUP_COLUMNS = 2;

export function getEntityFieldGroupName(group: string | undefined) {
  const trimmed = group?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_ENTITY_FIELD_GROUP;
}

export function normalizeEntityFieldGroupArea(
  value: unknown,
): EntityFieldGroupArea {
  return value === "primary" ? "primary" : "tab";
}

export function getEntityFieldGroupArea(
  groupName: string,
  fieldGroups?: EntityFieldGroup[],
): EntityFieldGroupArea {
  const name = groupName.trim();
  if (name === PRIMARY_ENTITY_FIELD_GROUP) return "primary";
  return fieldGroups?.find((item) => item.name === name)?.area === "primary"
    ? "primary"
    : "tab";
}

export function normalizeEntityFieldGroup(
  group: Pick<EntityFieldGroup, "name"> & Partial<EntityFieldGroup>,
): EntityFieldGroup | null {
  const name = typeof group.name === "string" ? group.name.trim() : "";
  if (
    !name ||
    name === PRIMARY_ENTITY_FIELD_GROUP ||
    name === ENTITY_HEADER_FIELD_GROUP
  )
    return null;
  const raw = group.colSpan;
  const colSpan =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(ENTITY_FIELD_GROUP_COLUMNS, Math.max(1, Math.round(raw)))
      : ENTITY_FIELD_GROUP_COLUMNS;
  const area = normalizeEntityFieldGroupArea(group.area);
  const tabId =
    area === "tab" && typeof group.tabId === "string" ? group.tabId.trim() : "";
  return {
    name,
    colSpan,
    area,
    ...(tabId ? { tabId } : {}),
    ...(group.display === "metrics" ? { display: "metrics" as const } : {}),
    ...(group.hideTitle ? { hideTitle: true as const } : {}),
  };
}

export function isEntityFieldGroupTitleHidden(
  groupName: string,
  fieldGroups?: EntityFieldGroup[],
) {
  const name = groupName.trim();
  if (!name || name === PRIMARY_ENTITY_FIELD_GROUP) return false;
  return fieldGroups?.find((group) => group.name === name)?.hideTitle === true;
}

/**
 * Tab-area groups for one tab: occupied on that tab, or empty shells owned by it.
 * Primary groups are excluded.
 */
export function filterEntityFieldGroupsForTab(
  fieldGroups: EntityFieldGroup[] | undefined,
  tabId: string,
  tabFields: EntityField[],
): EntityFieldGroup[] {
  const resolvedTabId = tabId.trim() || ENTITY_OVERVIEW_TAB_ID;
  const namesOnTab = new Set<string>();
  for (const field of tabFields) {
    if (isEntityNameField(field)) continue;
    const name = getEntityFieldGroupName(field.group);
    if (name === PRIMARY_ENTITY_FIELD_GROUP) continue;
    namesOnTab.add(name);
  }

  return (fieldGroups ?? []).filter((group) => {
    const normalized = normalizeEntityFieldGroup(group);
    if (!normalized || normalized.area === "primary") return false;
    // «Общее» only on a tab that actually has fields in it — never an empty shell.
    if (normalized.name === DEFAULT_ENTITY_FIELD_GROUP) {
      return namesOnTab.has(normalized.name);
    }
    if (namesOnTab.has(normalized.name)) return true;
    const owned = normalized.tabId?.trim() ?? "";
    return owned.length > 0 && owned === resolvedTabId;
  });
}

export function isEntityMetricsFieldGroup(
  groupName: string,
  fieldGroups?: EntityFieldGroup[],
) {
  const name = groupName.trim();
  return (
    fieldGroups?.find((group) => group.name === name)?.display === "metrics"
  );
}

/**
 * Keeps declared group order/colSpan, appends groups found on fields.
 * Empty custom groups are kept (for editor create flow); empty «Общее» is not.
 * «Основное» is never stored.
 */
export function ensureEntityFieldGroups(
  fieldGroups: EntityFieldGroup[] | undefined,
  fields: EntityField[],
): EntityFieldGroup[] {
  const fromFields = new Map<string, string>();
  for (const field of fields) {
    if (isEntityNameField(field)) continue;
    const name = getEntityFieldGroupName(field.group);
    if (name === PRIMARY_ENTITY_FIELD_GROUP) continue;
    if (!fromFields.has(name)) {
      fromFields.set(name, getEntityFieldTabId(field));
    }
  }

  const seen = new Set<string>();
  const next: EntityFieldGroup[] = [];

  for (const item of fieldGroups ?? []) {
    const normalized = normalizeEntityFieldGroup(item);
    if (!normalized || seen.has(normalized.name)) continue;
    // Never keep an empty «Общее» shell in layout meta.
    if (
      !fromFields.has(normalized.name) &&
      normalized.name === DEFAULT_ENTITY_FIELD_GROUP
    ) {
      continue;
    }
    seen.add(normalized.name);
    const inferredTabId = fromFields.get(normalized.name);
    if (normalized.name === DEFAULT_ENTITY_FIELD_GROUP) {
      next.push({
        ...normalized,
        area: "tab",
        tabId: inferredTabId ?? ENTITY_OVERVIEW_TAB_ID,
      });
      continue;
    }
    next.push(
      normalized.area === "tab" && !normalized.tabId && inferredTabId
        ? { ...normalized, tabId: inferredTabId }
        : normalized,
    );
  }

  for (const [name, tabId] of fromFields) {
    if (seen.has(name)) continue;
    seen.add(name);
    next.push({
      name,
      colSpan: ENTITY_FIELD_GROUP_COLUMNS,
      area: "tab",
      tabId,
    });
  }

  return next;
}

/** Groups under tabs with order/colSpan, including empty custom groups from layout. */
export function resolveEntityFieldGroups(
  fields: EntityField[],
  fieldGroups?: EntityFieldGroup[],
) {
  const layout = packEntityFieldGroupColSpans(
    ensureEntityFieldGroups(fieldGroups, fields),
  );
  const buckets = new Map<string, EntityField[]>();

  for (const field of fields) {
    const name = getEntityFieldGroupName(field.group);
    if (name === PRIMARY_ENTITY_FIELD_GROUP) continue;
    const bucket = buckets.get(name);
    if (bucket) {
      bucket.push(field);
      continue;
    }
    buckets.set(name, [field]);
  }

  return layout
    .map((group) => ({
      name: group.name,
      fields: buckets.get(group.name) ?? [],
      colSpan: group.colSpan,
    }))
    .filter(
      (group) =>
        group.fields.length > 0 || group.name !== DEFAULT_ENTITY_FIELD_GROUP,
    );
}

/**
 * Primary strip layout: «Основное» (if it has fields) then named primary groups.
 * Packs together so «Основное» can stay half-width beside the next half group.
 */
export function resolvePrimaryEntityFieldGroups(
  fields: EntityField[],
  fieldGroups?: EntityFieldGroup[],
) {
  const primaryFields = fields.filter(
    (field) =>
      !isEntityNameField(field) &&
      getEntityFieldGroupName(field.group) === PRIMARY_ENTITY_FIELD_GROUP,
  );
  const namedFields = fields.filter((field) => {
    if (isEntityNameField(field)) return false;
    const name = getEntityFieldGroupName(field.group);
    return (
      name !== PRIMARY_ENTITY_FIELD_GROUP &&
      getEntityFieldGroupArea(name, fieldGroups) === "primary"
    );
  });

  const buckets = new Map<string, EntityField[]>();
  for (const field of namedFields) {
    const name = getEntityFieldGroupName(field.group);
    const bucket = buckets.get(name);
    if (bucket) {
      bucket.push(field);
      continue;
    }
    buckets.set(name, [field]);
  }

  const namedLayout = ensureEntityFieldGroups(
    (fieldGroups ?? []).filter((group) => group.area === "primary"),
    namedFields,
  ).map((group) => ({
    name: group.name,
    colSpan: group.colSpan,
    area: "primary" as const,
  }));

  if (primaryFields.length === 0) {
    return packEntityFieldGroupColSpans(namedLayout).map((group) => ({
      name: group.name,
      fields: buckets.get(group.name) ?? [],
      colSpan: group.colSpan,
    }));
  }

  const packed = packEntityFieldGroupColSpans([
    {
      name: PRIMARY_ENTITY_FIELD_GROUP,
      colSpan: 1,
      area: "primary",
    },
    ...namedLayout,
  ]);

  return packed.map((group) => ({
    name: group.name,
    fields:
      group.name === PRIMARY_ENTITY_FIELD_GROUP
        ? primaryFields
        : (buckets.get(group.name) ?? []),
    colSpan: group.colSpan,
  }));
}

/**
 * Walks groups left→right and fixes row packing in a 2-col grid:
 * two halves share a row; a lone half expands to full width.
 */
export function packEntityFieldGroupColSpans(
  groups: EntityFieldGroup[],
): EntityFieldGroup[] {
  const next = groups.map((group) => ({
    ...group,
    colSpan: Math.min(
      ENTITY_FIELD_GROUP_COLUMNS,
      Math.max(1, Math.round(group.colSpan) || ENTITY_FIELD_GROUP_COLUMNS),
    ),
    area: normalizeEntityFieldGroupArea(group.area),
  }));

  let i = 0;
  while (i < next.length) {
    const current = next[i]!;
    if (current.colSpan >= ENTITY_FIELD_GROUP_COLUMNS) {
      current.colSpan = ENTITY_FIELD_GROUP_COLUMNS;
      i += 1;
      continue;
    }

    const following = next[i + 1];
    if (following && following.colSpan === 1) {
      i += 2;
      continue;
    }

    current.colSpan = ENTITY_FIELD_GROUP_COLUMNS;
    i += 1;
  }

  return next;
}

/**
 * Packs named primary groups with a virtual half «Основное» so a leading
 * half-width sibling is kept (it sits beside «Основное» on the strip).
 */
function packPrimaryNamedFieldGroupColSpans(
  groups: EntityFieldGroup[],
): EntityFieldGroup[] {
  if (groups.length === 0) return [];
  return packEntityFieldGroupColSpans([
    {
      name: PRIMARY_ENTITY_FIELD_GROUP,
      colSpan: 1,
      area: "primary",
    },
    ...groups,
  ]).filter((group) => group.name !== PRIMARY_ENTITY_FIELD_GROUP);
}

/** Packs «Основное» and tab groups independently so mixed order cannot break rows. */
export function packEntityFieldGroupsByArea(
  groups: EntityFieldGroup[],
): EntityFieldGroup[] {
  const primary = packPrimaryNamedFieldGroupColSpans(
    groups.filter((group) => group.area === "primary"),
  );
  const tab = packEntityFieldGroupColSpans(
    groups.filter((group) => group.area !== "primary"),
  );
  return [...primary, ...tab];
}

export function groupEntityFields(
  fields: EntityField[],
  fieldGroups?: EntityFieldGroup[],
) {
  const order: string[] = [];
  const buckets = new Map<string, EntityField[]>();

  for (const field of fields) {
    const name = getEntityFieldGroupName(field.group);
    const bucket = buckets.get(name);
    if (bucket) {
      bucket.push(field);
      continue;
    }
    order.push(name);
    buckets.set(name, [field]);
  }

  const layout = packEntityFieldGroupColSpans(
    ensureEntityFieldGroups(fieldGroups, fields),
  );
  const layoutOrder = layout.map((group) => group.name);
  const layoutColSpan = new Map(
    layout.map((group) => [group.name, group.colSpan] as const),
  );
  const primaryLayout = resolvePrimaryEntityFieldGroups(fields, fieldGroups);
  const primaryColSpan = new Map(
    primaryLayout.map((group) => [group.name, group.colSpan] as const),
  );

  const sorted = [...order].sort((a, b) => {
    if (a === PRIMARY_ENTITY_FIELD_GROUP) return -1;
    if (b === PRIMARY_ENTITY_FIELD_GROUP) return 1;
    const ai = layoutOrder.indexOf(a);
    const bi = layoutOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    if (a === DEFAULT_ENTITY_FIELD_GROUP) return -1;
    if (b === DEFAULT_ENTITY_FIELD_GROUP) return 1;
    return 0;
  });

  return sorted.map((name) => ({
    name,
    fields: buckets.get(name) ?? [],
    colSpan:
      primaryColSpan.get(name) ??
      layoutColSpan.get(name) ??
      ENTITY_FIELD_GROUP_COLUMNS,
  }));
}

export function createEntityFieldGroupName(existingNames: string[]) {
  const base = "Новая группа";
  const names = new Set(
    existingNames.map((name) => name.trim()).filter((name) => name.length > 0),
  );
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function fitEntityFieldColSpan(
  groupFields: Array<Pick<EntityField, "id" | "colSpan">>,
  fieldId: string,
  colSpan: number,
  insertIndex: number,
  columns = 4,
) {
  const others = groupFields.filter((field) => field.id !== fieldId);
  const index = Math.max(0, Math.min(insertIndex, others.length));
  let used = 0;

  for (let i = 0; i < index; i += 1) {
    const span = Math.min(columns, Math.max(1, others[i]?.colSpan ?? 1));
    if (used + span > columns) used = 0;
    used += span;
    if (used >= columns) used = 0;
  }

  const remaining = used === 0 ? columns : columns - used;
  return Math.max(1, Math.min(colSpan, remaining, columns));
}

/** Sort entities by menu order; items missing from menu keep relative order at the end. */
export function sortEntitiesByMenuOrder<T extends { id: string }>(
  entities: T[],
  menuEntityIds: string[],
): T[] {
  if (entities.length <= 1 || menuEntityIds.length === 0) return entities;

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const id of menuEntityIds) {
    const entity = byId.get(id);
    if (!entity || seen.has(id)) continue;
    seen.add(id);
    ordered.push(entity);
  }

  for (const entity of entities) {
    if (seen.has(entity.id)) continue;
    ordered.push(entity);
  }

  return ordered;
}
