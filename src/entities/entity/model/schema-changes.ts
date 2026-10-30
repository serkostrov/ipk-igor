import { getEntityFieldDisplayName, getEntityFieldTypeLabel } from "./field";
import type { Entity, EntityField, EntityTab } from "./types";
import { toEntityStructure } from "../lib/parse-entity-config";

/** One human-readable schema diff line (settings history UI). */
export type EntitySchemaChangeItem = {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
};

type Structure = ReturnType<typeof toEntityStructure>;

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushChange(
  items: EntitySchemaChangeItem[],
  key: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  const left = text(before);
  const right = text(after);
  if (left === right) return;
  items.push({
    key,
    label,
    before: left.length > 0 ? left : null,
    after: right.length > 0 ? right : null,
  });
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
  pushChange(
    items,
    `field:${after.id}:name`,
    `${label} · название`,
    before.name,
    after.name,
  );
  pushChange(
    items,
    `field:${after.id}:type`,
    `${label} · тип`,
    getEntityFieldTypeLabel(before.type),
    getEntityFieldTypeLabel(after.type),
  );
  pushChange(
    items,
    `field:${after.id}:hint`,
    `${label} · подсказка`,
    before.hint,
    after.hint,
  );
  pushChange(
    items,
    `field:${after.id}:required`,
    `${label} · обязательное`,
    before.required ? "да" : "нет",
    after.required ? "да" : "нет",
  );
  pushChange(
    items,
    `field:${after.id}:formula`,
    `${label} · формула`,
    before.formula?.expression ?? "",
    after.formula?.expression ?? "",
  );
  pushChange(
    items,
    `field:${after.id}:rollup`,
    `${label} · rollup`,
    before.rollup ?? null,
    after.rollup ?? null,
  );
  pushChange(
    items,
    `field:${after.id}:lookup`,
    `${label} · lookup`,
    before.lookup ?? null,
    after.lookup ?? null,
  );
  pushChange(
    items,
    `field:${after.id}:default`,
    `${label} · значение по умолчанию`,
    before.defaultValue ?? null,
    after.defaultValue ?? null,
  );
  pushChange(
    items,
    `field:${after.id}:listOptions`,
    `${label} · варианты списка`,
    before.listOptions.map((option) => option.name).join(", "),
    after.listOptions.map((option) => option.name).join(", "),
  );
  pushChange(
    items,
    `field:${after.id}:visibility`,
    `${label} · условия показа`,
    before.visibilityConditions,
    after.visibilityConditions,
  );
  pushChange(
    items,
    `field:${after.id}:relation`,
    `${label} · связь`,
    {
      relationEntityId: before.relationEntityId,
      relationMultiple: before.relationMultiple,
      relationFilter: before.relationFilter ?? null,
    },
    {
      relationEntityId: after.relationEntityId,
      relationMultiple: after.relationMultiple,
      relationFilter: after.relationFilter ?? null,
    },
  );
}

function compareTab(
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
    items,
    `tab:${after.id}:name`,
    `${label} · название`,
    before.name,
    after.name,
  );
  pushChange(
    items,
    `tab:${after.id}:kind`,
    `${label} · тип`,
    before.kind,
    after.kind,
  );
  pushChange(
    items,
    `tab:${after.id}:link`,
    `${label} · связь`,
    {
      linkedEntityId: before.linkedEntityId,
      parentLinkFieldId: before.parentLinkFieldId,
      sourceRelationFieldId: before.sourceRelationFieldId,
      sourceTabId: before.sourceTabId,
      singleRecord: before.singleRecord,
    },
    {
      linkedEntityId: after.linkedEntityId,
      parentLinkFieldId: after.parentLinkFieldId,
      sourceRelationFieldId: after.sourceRelationFieldId,
      sourceTabId: after.sourceTabId,
      singleRecord: after.singleRecord,
    },
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
): EntitySchemaChangeItem[] {
  const before = asStructure(beforeEntity);
  const after = asStructure(afterEntity);
  const items: EntitySchemaChangeItem[] = [];

  pushChange(items, "meta:name", "Название", before.name, after.name);
  pushChange(
    items,
    "meta:namePlural",
    "Название (мн. ч.)",
    before.namePlural,
    after.namePlural,
  );
  pushChange(
    items,
    "meta:description",
    "Описание",
    before.description,
    after.description,
  );
  pushChange(
    items,
    "meta:nameTemplate",
    "Шаблон названия",
    before.nameTemplate,
    after.nameTemplate,
  );
  pushChange(items, "meta:views", "Отображение", before.views, after.views);
  pushChange(
    items,
    "meta:defaultView",
    "Вид по умолчанию",
    before.defaultView,
    after.defaultView,
  );
  pushChange(
    items,
    "meta:headerFieldId",
    "Поле в шапке",
    before.headerFieldId,
    after.headerFieldId,
  );
  pushChange(
    items,
    "meta:kanban",
    "Канбан",
    {
      kanbanFieldId: before.kanbanFieldId,
      kanbanCardFieldIds: before.kanbanCardFieldIds,
      kanbanShowFilters: before.kanbanShowFilters,
    },
    {
      kanbanFieldId: after.kanbanFieldId,
      kanbanCardFieldIds: after.kanbanCardFieldIds,
      kanbanShowFilters: after.kanbanShowFilters,
    },
  );
  pushChange(
    items,
    "meta:table",
    "Таблица",
    {
      tableMassSelection: before.tableMassSelection,
      tableParentFieldId: before.tableParentFieldId,
      tableSubgroupFieldId: before.tableSubgroupFieldId,
      tableNestedEntityId: before.tableNestedEntityId,
    },
    {
      tableMassSelection: after.tableMassSelection,
      tableParentFieldId: after.tableParentFieldId,
      tableSubgroupFieldId: after.tableSubgroupFieldId,
      tableNestedEntityId: after.tableNestedEntityId,
    },
  );
  pushChange(items, "meta:timeline", "График", before.timeline, after.timeline);
  pushChange(
    items,
    "meta:timeTracking",
    "Учёт времени",
    before.timeTracking,
    after.timeTracking,
  );
  pushChange(
    items,
    "meta:pageLayout",
    "Макет страницы",
    before.pageLayout,
    after.pageLayout,
  );
  pushChange(
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
    compareField(items, beforeFields.get(id), afterFields.get(id));
  }

  const beforeTabs = new Map(before.tabs.map((tab) => [tab.id, tab]));
  const afterTabs = new Map(after.tabs.map((tab) => [tab.id, tab]));
  const tabIds = new Set([...beforeTabs.keys(), ...afterTabs.keys()]);
  for (const id of tabIds) {
    compareTab(items, beforeTabs.get(id), afterTabs.get(id));
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
