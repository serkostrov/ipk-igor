import {
  getRecordFieldSortValue,
  type EntityValueContext,
} from "./field-value";
import { isEntityListOptionHidden } from "./list-process";
import {
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  type Entity,
  type EntityRecord,
} from "./types";

export type EntityRecordSortDirection = "asc" | "desc";

export type EntityRecordSort = {
  fieldId: string;
  direction: EntityRecordSortDirection;
};

/** Option ids marked «Скрывать по умолчанию», per single-choice list field. */
export function getEntityHiddenListOptionIds(
  entity: Pick<Entity, "fields">,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const field of entity.fields) {
    if (field.type !== "list") continue;
    if (resolveEntityListFieldPresentation(field, entities).listMultiple) {
      continue;
    }
    const ids = new Set(
      resolveEntityListFieldOptions(field, entities)
        .filter((option) => isEntityListOptionHidden(option))
        .map((option) => option.id),
    );
    if (ids.size > 0) result.set(field.id, ids);
  }
  return result;
}

/** Record has a list value hidden by default (e.g. «Архив»). */
export function isEntityRecordHidden(
  record: EntityRecord,
  hiddenOptionIds: Map<string, Set<string>>,
) {
  for (const [fieldId, ids] of hiddenOptionIds) {
    const value = parseEntityListValueIds(record.values[fieldId])[0];
    if (value && ids.has(value)) return true;
  }
  return false;
}

export function parseEntityRecordSort(value: unknown): EntityRecordSort | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const fieldId = typeof raw.fieldId === "string" ? raw.fieldId : "";
  if (!fieldId) return null;
  if (raw.direction !== "asc" && raw.direction !== "desc") return null;
  return { fieldId, direction: raw.direction };
}

/** Header click cycle: ascending → descending → off. */
export function getNextEntityRecordSort(
  current: EntityRecordSort | null,
  fieldId: string,
): EntityRecordSort | null {
  if (current?.fieldId !== fieldId) return { fieldId, direction: "asc" };
  return current.direction === "asc" ? { fieldId, direction: "desc" } : null;
}

function compareSortValues(a: number | string, b: number | string) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru", { numeric: true });
}

/** Stable sort by a field value; empty values stay last in both directions. */
export function sortEntityRecords(
  ctx: EntityValueContext,
  entity: Entity,
  records: readonly EntityRecord[],
  sort: EntityRecordSort | null,
): EntityRecord[] {
  const field = sort
    ? entity.fields.find((item) => item.id === sort.fieldId)
    : undefined;
  if (!sort || !field) return [...records];
  const factor = sort.direction === "asc" ? 1 : -1;
  return records
    .map((record, index) => ({
      record,
      index,
      value: getRecordFieldSortValue(ctx, entity, record, field),
    }))
    .sort((a, b) => {
      if (a.value == null || b.value == null) {
        if (a.value == null && b.value == null) return a.index - b.index;
        return a.value == null ? 1 : -1;
      }
      return compareSortValues(a.value, b.value) * factor || a.index - b.index;
    })
    .map((item) => item.record);
}
