/**
 * Table display columns: merge mutually exclusive fields that share
 * visibility controller + table position (e.g. «Часы» / «Сумма» at
 * position 5 depending on calculation type) into one column. The same
 * condition pattern at position 6 stays a separate adjacent column.
 */

import { getEntityFieldDisplayName, isEntityNumericFieldType } from "./field";
import {
  formatRecordFieldValue,
  getRecordFieldNumber,
  isEntityFieldVisibleByConditions,
  type EntityValueContext,
} from "./field-value";
import {
  getEntityTableFields,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "./types";

/** One table header/cell: a single field or several exclusive alternatives. */
export type EntityTableDisplayColumn = {
  id: string;
  label: string;
  fields: EntityField[];
};

/**
 * Controlling field ids from visibility rules — fields that share this key
 * are alternatives of the same switch (тип расчёта → часы | сумма).
 */
export function visibilityControllerKey(field: EntityField): string | null {
  if (!isEntityNumericFieldType(field.type)) return null;
  const conditions = field.visibilityConditions;
  if (!conditions.length) return null;
  const ids = [
    ...new Set(
      conditions.map((condition) => condition.fieldId.trim()).filter(Boolean),
    ),
  ].sort();
  if (ids.length === 0) return null;
  return ids.join("|");
}

/**
 * Merge bucket: same table position + same visibility controllers.
 * Different positions with the same controllers stay separate columns.
 */
function mergeGroupKey(field: EntityField): string | null {
  const controller = visibilityControllerKey(field);
  if (!controller) return null;
  return `${field.tableOrder}::${controller}`;
}

/** Whether two fields can share one table column (position + conditions). */
export function canMergeEntityTableFields(
  left: EntityField,
  right: EntityField,
): boolean {
  const leftKey = visibilityControllerKey(left);
  const rightKey = visibilityControllerKey(right);
  if (!leftKey || !rightKey || leftKey !== rightKey) return false;
  return left.tableOrder === right.tableOrder;
}

/** Prefer «Часы/Сумма» over tableOrder when both names are present. */
const MERGED_LABEL_PRIORITY = ["часы", "сумма"] as const;

function compareMergedFieldLabels(a: EntityField, b: EntityField): number {
  const nameA = getEntityFieldDisplayName(a).trim().toLocaleLowerCase("ru");
  const nameB = getEntityFieldDisplayName(b).trim().toLocaleLowerCase("ru");
  const indexA = MERGED_LABEL_PRIORITY.findIndex((key) => nameA.includes(key));
  const indexB = MERGED_LABEL_PRIORITY.findIndex((key) => nameB.includes(key));
  if (indexA >= 0 || indexB >= 0) {
    return (indexA >= 0 ? indexA : 99) - (indexB >= 0 ? indexB : 99);
  }
  return nameA.localeCompare(nameB, "ru");
}

function columnFromFields(fields: EntityField[]): EntityTableDisplayColumn {
  const ordered = fields.slice().sort(compareMergedFieldLabels);
  if (ordered.length === 1) {
    const field = ordered[0]!;
    return {
      id: field.id,
      label: getEntityFieldDisplayName(field),
      fields: ordered,
    };
  }
  return {
    id: `merged:${ordered.map((item) => item.id).join("+")}`,
    label: ordered.map((item) => getEntityFieldDisplayName(item)).join("/"),
    fields: ordered,
  };
}

/** Build display columns from already-filtered table fields. */
export function buildEntityTableDisplayColumns(
  tableFields: readonly EntityField[],
): EntityTableDisplayColumn[] {
  const mergeGroups = new Map<string, EntityField[]>();
  for (const field of tableFields) {
    const key = mergeGroupKey(field);
    if (!key) continue;
    const list = mergeGroups.get(key) ?? [];
    list.push(field);
    mergeGroups.set(key, list);
  }

  const mergeFieldIds = new Set<string>();
  for (const group of mergeGroups.values()) {
    if (group.length < 2) continue;
    for (const field of group) mergeFieldIds.add(field.id);
  }

  const columns: EntityTableDisplayColumn[] = [];
  const emitted = new Set<string>();

  for (const field of tableFields) {
    if (emitted.has(field.id)) continue;

    const key = mergeGroupKey(field);
    const group = key ? mergeGroups.get(key) : undefined;
    if (group && group.length >= 2 && mergeFieldIds.has(field.id)) {
      for (const item of group) emitted.add(item.id);
      columns.push(columnFromFields(group));
      continue;
    }

    emitted.add(field.id);
    columns.push(columnFromFields([field]));
  }

  return columns;
}

/** Table fields → display columns (optional filter, same options as getEntityTableFields). */
export function getEntityTableDisplayColumns(
  fields: EntityField[],
  options?: {
    preferArrayOrder?: boolean;
    hideFieldIds?: ReadonlySet<string>;
  },
): EntityTableDisplayColumn[] {
  const hide = options?.hideFieldIds;
  const tableFields = getEntityTableFields(fields, {
    preferArrayOrder: options?.preferArrayOrder,
  }).filter((field) => !hide?.has(field.id));
  return buildEntityTableDisplayColumns(tableFields);
}

/**
 * 1-based display-column index for a table field (merged groups count as one).
 * Returns null when the field is not shown in the table.
 */
export function getEntityTableDisplayColumnPosition(
  fields: readonly EntityField[],
  fieldId: string,
  options?: { preferArrayOrder?: boolean },
): number | null {
  const columns = getEntityTableDisplayColumns([...fields], options);
  const index = columns.findIndex((column) =>
    column.fields.some((field) => field.id === fieldId),
  );
  return index >= 0 ? index + 1 : null;
}

/**
 * Which field of a merged column to show for this record:
 * visible-by-conditions first, else first with a numeric value.
 */
export function resolveEntityTableDisplayColumnField(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  column: EntityTableDisplayColumn,
): EntityField | null {
  if (column.fields.length === 0) return null;
  if (column.fields.length === 1) return column.fields[0] ?? null;

  for (const field of column.fields) {
    if (
      isEntityFieldVisibleByConditions(ctx, entity, record, field) &&
      getRecordFieldNumber(ctx, entity, record, field) != null
    ) {
      return field;
    }
  }
  for (const field of column.fields) {
    if (isEntityFieldVisibleByConditions(ctx, entity, record, field)) {
      return field;
    }
  }
  for (const field of column.fields) {
    if (getRecordFieldNumber(ctx, entity, record, field) != null) {
      return field;
    }
  }
  return column.fields[0] ?? null;
}

/** Coalesced number for totals / group sums (mutually exclusive fields). */
export function getEntityTableDisplayColumnNumber(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  column: EntityTableDisplayColumn,
): number | null {
  const field = resolveEntityTableDisplayColumnField(
    ctx,
    entity,
    record,
    column,
  );
  if (!field) return null;
  return getRecordFieldNumber(ctx, entity, record, field);
}

/** Formatted cell text for a display column. */
export function formatEntityTableDisplayColumnValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  column: EntityTableDisplayColumn,
): string {
  const field = resolveEntityTableDisplayColumnField(
    ctx,
    entity,
    record,
    column,
  );
  if (!field) return "—";
  return formatRecordFieldValue(ctx, entity, record, field);
}

export function isEntityTableDisplayColumnNumeric(
  column: EntityTableDisplayColumn,
): boolean {
  return column.fields.every((field) => isEntityNumericFieldType(field.type));
}

/** Whether any member of the column is included in table totals. */
export function entityTableDisplayColumnIncludeInTotal(
  column: EntityTableDisplayColumn,
): boolean {
  return column.fields.some(
    (field) => isEntityNumericFieldType(field.type) && field.includeInTotal,
  );
}
