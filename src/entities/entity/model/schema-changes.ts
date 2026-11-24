import { getEntityFieldDisplayName, getEntityFieldTypeLabel } from "./field";
import {
  ENTITY_CONDITION_OPERATOR_LABELS,
  type EntityCondition,
} from "./condition";
import {
  getEntityDisplayName,
  getEntityTableFields,
  type Entity,
  type EntityField,
  type EntityTab,
} from "./types";
import { toEntityStructure } from "../lib/parse-entity-config";

/** One human-readable schema diff line (settings history UI). */
export type EntitySchemaChangeItem = {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
};

type Structure = ReturnType<typeof toEntityStructure>;

/** Registry used to turn stored ids into human captions. */
type EntityRegistry = ReadonlyArray<Pick<Entity, "id" | "name" | "namePlural">>;

/** Resolve an entity / field / tab id to a caption, or `null` when unknown. */
type ResolveLabel = (id: string) => string | null;

/** Render a scalar config value as a readable string — never raw JSON. */
function humanize(value: unknown, resolve: ResolveLabel): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return resolve(value) ?? value;
  if (Array.isArray(value)) {
    return value
      .map((item) => humanize(item, resolve))
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
}

function formatCondition(condition: EntityCondition, resolve: ResolveLabel) {
  const field = resolve(condition.fieldId) ?? condition.fieldId;
  const operator =
    ENTITY_CONDITION_OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const operands = condition.values?.length
    ? condition.values.map((value) => resolve(value) ?? value)
    : condition.value
      ? [resolve(condition.value) ?? condition.value]
      : [];
  return [field, operator, operands.join(", ")].filter(Boolean).join(" ");
}

function formatConditions(
  conditions: EntityCondition[],
  resolve: ResolveLabel,
) {
  return conditions
    .map((condition) => formatCondition(condition, resolve))
    .join("; ");
}

function buildResolveLabel(
  entities: EntityRegistry,
  structures: Structure[],
): ResolveLabel {
  const fieldNames = new Map<string, string>();
  const tabNames = new Map<string, string>();
  for (const structure of structures) {
    for (const field of structure.fields) {
      fieldNames.set(field.id, getEntityFieldDisplayName(field));
    }
    for (const tab of structure.tabs) {
      if (tab.name.trim()) tabNames.set(tab.id, tab.name.trim());
    }
  }
  return (id) => {
    if (!id) return null;
    const entity = entities.find((item) => item.id === id);
    if (entity) return getEntityDisplayName(entity);
    return fieldNames.get(id) ?? tabNames.get(id) ?? null;
  };
}

/** Diff two already-readable values into a «было → стало» line. */
function pushChange(
  resolve: ResolveLabel,
  items: EntitySchemaChangeItem[],
  key: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  const left = humanize(before, resolve);
  const right = humanize(after, resolve);
  if (left === right) return;
  items.push({
    key,
    label,
    before: left.length > 0 ? left : null,
    after: right.length > 0 ? right : null,
  });
}

/** Mark a rarely-inspected nested config as «изменено» without a deep diff. */
function pushCoarseChange(
  items: EntitySchemaChangeItem[],
  key: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  items.push({ key, label, before: null, after: "изменено" });
}

/**
 * Field equality ignoring `tableOrder` — it is diffed at the table-column
 * level, not per field. Used by the per-field safety net so a column reorder
 * is not double-reported as «прочие настройки».
 */
function sameFieldIgnoringTableOrder(a: EntityField, b: EntityField) {
  return (
    JSON.stringify({ ...a, tableOrder: 0 }) ===
    JSON.stringify({ ...b, tableOrder: 0 })
  );
}

function fieldSummary(field: EntityField) {
  const typeLabel = getEntityFieldTypeLabel(field.type);
  const parts = [getEntityFieldDisplayName(field), typeLabel];
  if (field.type === "formula" && field.formula?.expression.trim()) {
    parts.push(field.formula.expression.trim());
  }
  return parts.filter(Boolean).join(" · ");
}

function tabSummary(tab: EntityTab) {
  return `${tab.name} (${tab.kind})`;
}

function compareField(
  resolve: ResolveLabel,
  items: EntitySchemaChangeItem[],
  before: EntityField | undefined,
  after: EntityField | undefined,
) {
  if (!before && after) {
    items.push({
      key: `field:${after.id}:added`,
      label: `Поле «${getEntityFieldDisplayName(after)}»`,
      before: null,
      after: fieldSummary(after),
    });
    return;
  }
  if (before && !after) {
    items.push({
      key: `field:${before.id}:removed`,
      label: `Поле «${getEntityFieldDisplayName(before)}»`,
      before: fieldSummary(before),
      after: null,
    });
    return;
  }
  if (!before || !after) return;

  const label = `Поле «${getEntityFieldDisplayName(after)}»`;
  const explicitStart = items.length;
  pushChange(
    resolve,
    items,
    `field:${after.id}:name`,
    `${label} · название`,
    before.name,
    after.name,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:type`,
    `${label} · тип`,
    getEntityFieldTypeLabel(before.type),
    getEntityFieldTypeLabel(after.type),
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:group`,
    `${label} · группа`,
    before.group,
    after.group,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:tab`,
    `${label} · вкладка`,
    before.tabId,
    after.tabId,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:hint`,
    `${label} · подсказка`,
    before.hint,
    after.hint,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:required`,
    `${label} · обязательное`,
    before.required,
    after.required,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:showInTable`,
    `${label} · показывать в таблице`,
    before.showInTable,
    after.showInTable,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:showInFilters`,
    `${label} · показывать в фильтрах`,
    before.showInFilters,
    after.showInFilters,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:showOnRecord`,
    `${label} · показывать на записи`,
    before.showOnRecord,
    after.showOnRecord,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:formula`,
    `${label} · формула`,
    before.formula?.expression ?? "",
    after.formula?.expression ?? "",
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:rollup`,
    `${label} · rollup`,
    before.rollup ?? null,
    after.rollup ?? null,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:lookup`,
    `${label} · lookup`,
    before.lookup ?? null,
    after.lookup ?? null,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:default`,
    `${label} · значение по умолчанию`,
    before.defaultValue ?? null,
    after.defaultValue ?? null,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:listOptions`,
    `${label} · варианты списка`,
    before.listOptions.map((option) => option.name).join(", "),
    after.listOptions.map((option) => option.name).join(", "),
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:visibility`,
    `${label} · условия показа`,
    formatConditions(before.visibilityConditions, resolve),
    formatConditions(after.visibilityConditions, resolve),
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:relationEntity`,
    `${label} · связь · сущность`,
    before.relationEntityId,
    after.relationEntityId,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:relationMultiple`,
    `${label} · связь · несколько записей`,
    before.relationMultiple,
    after.relationMultiple,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:relationSpawn`,
    `${label} · связь · своя запись на пользователя`,
    before.relationSpawnPerUser,
    after.relationSpawnPerUser,
  );
  pushChange(
    resolve,
    items,
    `field:${after.id}:relationCascadeDelete`,
    `${label} · связь · удалять вместе с родительской`,
    before.relationCascadeDelete,
    after.relationCascadeDelete,
  );
  pushCoarseChange(
    items,
    `field:${after.id}:relationFilter`,
    `${label} · связь · фильтр`,
    before.relationFilter ?? null,
    after.relationFilter ?? null,
  );
  // Safety net: field changed but no explicit line above covered it.
  if (
    items.length === explicitStart &&
    !sameFieldIgnoringTableOrder(before, after)
  ) {
    items.push({
      key: `field:${after.id}:other`,
      label: `${label} · прочие настройки`,
      before: null,
      after: "изменено",
    });
  }
}

function compareTab(
  resolve: ResolveLabel,
  items: EntitySchemaChangeItem[],
  before: EntityTab | undefined,
  after: EntityTab | undefined,
) {
  if (!before && after) {
    items.push({
      key: `tab:${after.id}:added`,
      label: `Вкладка «${after.name}»`,
      before: null,
      after: tabSummary(after),
    });
    return;
  }
  if (before && !after) {
    items.push({
      key: `tab:${before.id}:removed`,
      label: `Вкладка «${before.name}»`,
      before: tabSummary(before),
      after: null,
    });
    return;
  }
  if (!before || !after) return;

  const label = `Вкладка «${after.name}»`;
  pushChange(
    resolve,
    items,
    `tab:${after.id}:name`,
    `${label} · название`,
    before.name,
    after.name,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:kind`,
    `${label} · тип`,
    before.kind,
    after.kind,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:linkedEntity`,
    `${label} · связь · сущность`,
    before.linkedEntityId,
    after.linkedEntityId,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:parentField`,
    `${label} · связь · родительское поле`,
    before.parentLinkFieldId,
    after.parentLinkFieldId,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:sourceField`,
    `${label} · связь · поле-источник`,
    before.sourceRelationFieldId,
    after.sourceRelationFieldId,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:sourceTab`,
    `${label} · связь · вкладка-источник`,
    before.sourceTabId,
    after.sourceTabId,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:single`,
    `${label} · связь · единственная запись`,
    before.singleRecord,
    after.singleRecord,
  );
  pushChange(
    resolve,
    items,
    `tab:${after.id}:flat`,
    `${label} · связь · плоская таблица`,
    before.tableFlat,
    after.tableFlat,
  );
}

/** Ordered field names grouped by owning tab + group (for reorder diffs). */
function groupFieldSequences(fields: Structure["fields"]) {
  const map = new Map<
    string,
    { groupName: string; ids: string[]; names: string[] }
  >();
  for (const field of fields) {
    const key = `${field.tabId} ${field.group}`;
    const entry = map.get(key) ?? {
      groupName: field.group,
      ids: [],
      names: [],
    };
    entry.ids.push(field.id);
    entry.names.push(getEntityFieldDisplayName(field));
    map.set(key, entry);
  }
  return map;
}

/** Report reordering of fields within a group (same members, new order). */
function compareFieldOrder(
  resolve: ResolveLabel,
  items: EntitySchemaChangeItem[],
  before: Structure,
  after: Structure,
) {
  const beforeGroups = groupFieldSequences(before.fields);
  const afterGroups = groupFieldSequences(after.fields);
  for (const [key, beforeGroup] of beforeGroups) {
    const afterGroup = afterGroups.get(key);
    if (!afterGroup) continue;
    const sameMembers =
      [...beforeGroup.ids].sort().join(" ") ===
      [...afterGroup.ids].sort().join(" ");
    if (!sameMembers) continue;
    if (beforeGroup.ids.join(" ") === afterGroup.ids.join(" ")) {
      continue;
    }
    const groupLabel = beforeGroup.groupName.trim();
    pushChange(
      resolve,
      items,
      `order:${key}`,
      groupLabel ? `Порядок полей · «${groupLabel}»` : "Порядок полей",
      beforeGroup.names.join(", "),
      afterGroup.names.join(", "),
    );
  }
}

/** Report reordering of table columns (same visible columns, new order). */
function compareTableColumnOrder(
  resolve: ResolveLabel,
  items: EntitySchemaChangeItem[],
  before: Structure,
  after: Structure,
) {
  const beforeColumns = getEntityTableFields(before.fields);
  const afterColumns = getEntityTableFields(after.fields);
  const beforeIds = beforeColumns.map((field) => field.id);
  const afterIds = afterColumns.map((field) => field.id);
  const sameMembers =
    [...beforeIds].sort().join(" ") === [...afterIds].sort().join(" ");
  // Column show/hide is reported per field — here only a pure reorder.
  if (!sameMembers || beforeIds.join(" ") === afterIds.join(" ")) return;
  pushChange(
    resolve,
    items,
    "meta:tableColumns",
    "Порядок колонок таблицы",
    beforeColumns.map(getEntityFieldDisplayName).join(", "),
    afterColumns.map(getEntityFieldDisplayName).join(", "),
  );
}

function asStructure(
  entity: Pick<Entity, keyof Structure> | Structure,
): Structure {
  if ("records" in entity) {
    return toEntityStructure(entity as Entity);
  }
  return entity as Structure;
}

/** Diff two schema snapshots (or live entities) into readable change lines. */
export function describeEntitySchemaChanges(
  beforeEntity: Pick<Entity, keyof Structure> | Structure,
  afterEntity: Pick<Entity, keyof Structure> | Structure,
  entities: EntityRegistry = [],
): EntitySchemaChangeItem[] {
  const before = asStructure(beforeEntity);
  const after = asStructure(afterEntity);
  const resolve = buildResolveLabel(entities, [before, after]);
  const items: EntitySchemaChangeItem[] = [];

  pushChange(resolve, items, "meta:name", "Название", before.name, after.name);
  pushChange(
    resolve,
    items,
    "meta:namePlural",
    "Название (мн. ч.)",
    before.namePlural,
    after.namePlural,
  );
  pushChange(
    resolve,
    items,
    "meta:description",
    "Описание",
    before.description,
    after.description,
  );
  pushChange(
    resolve,
    items,
    "meta:nameTemplate",
    "Шаблон названия",
    before.nameTemplate,
    after.nameTemplate,
  );
  pushChange(
    resolve,
    items,
    "meta:defaultView",
    "Вид по умолчанию",
    before.defaultView,
    after.defaultView,
  );
  pushChange(
    resolve,
    items,
    "meta:headerFieldId",
    "Поле в шапке",
    before.headerFieldId,
    after.headerFieldId,
  );
  pushCoarseChange(
    items,
    "meta:views",
    "Отображение",
    before.views,
    after.views,
  );
  pushCoarseChange(
    items,
    "meta:kanban",
    "Канбан",
    [before.kanbanFieldId, before.kanbanCardFieldIds, before.kanbanShowFilters],
    [after.kanbanFieldId, after.kanbanCardFieldIds, after.kanbanShowFilters],
  );
  pushCoarseChange(
    items,
    "meta:table",
    "Таблица",
    [
      before.tableMassSelection,
      before.tableParentFieldId,
      before.tableSubgroupFieldId,
      before.tableNestedEntityId,
    ],
    [
      after.tableMassSelection,
      after.tableParentFieldId,
      after.tableSubgroupFieldId,
      after.tableNestedEntityId,
    ],
  );
  pushCoarseChange(
    items,
    "meta:timeline",
    "График",
    before.timeline,
    after.timeline,
  );
  pushCoarseChange(
    items,
    "meta:timeTracking",
    "Учёт времени",
    before.timeTracking,
    after.timeTracking,
  );
  pushCoarseChange(
    items,
    "meta:pageLayout",
    "Макет страницы",
    before.pageLayout,
    after.pageLayout,
  );
  pushCoarseChange(
    items,
    "meta:fieldGroups",
    "Группы полей",
    before.fieldGroups,
    after.fieldGroups,
  );

  const beforeFields = new Map(before.fields.map((field) => [field.id, field]));
  const afterFields = new Map(after.fields.map((field) => [field.id, field]));
  const fieldIds = new Set([...beforeFields.keys(), ...afterFields.keys()]);
  for (const id of fieldIds) {
    compareField(resolve, items, beforeFields.get(id), afterFields.get(id));
  }
  compareFieldOrder(resolve, items, before, after);
  compareTableColumnOrder(resolve, items, before, after);

  const beforeTabs = new Map(before.tabs.map((tab) => [tab.id, tab]));
  const afterTabs = new Map(after.tabs.map((tab) => [tab.id, tab]));
  const tabIds = new Set([...beforeTabs.keys(), ...afterTabs.keys()]);
  for (const id of tabIds) {
    compareTab(resolve, items, beforeTabs.get(id), afterTabs.get(id));
  }

  // Safety net: a changed definition must never read as «нет изменений».
  if (items.length === 0 && JSON.stringify(before) !== JSON.stringify(after)) {
    items.push({
      key: "other",
      label: "Прочие изменения",
      before: null,
      after: "изменено",
    });
  }

  return items;
}

/** True when two schema snapshots are structurally equal. */
export function entitySchemasEqual(
  a: Pick<Entity, keyof Structure> | Structure,
  b: Pick<Entity, keyof Structure> | Structure,
) {
  return JSON.stringify(asStructure(a)) === JSON.stringify(asStructure(b));
}
