/**
 * Resolve «Ведущий отдел» from the project EntityRecord field
 * (relation / belonging / list / lookup) for gantt lifecycle auto-fill.
 */

import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRecordFieldIds,
  parseEntityListValueIds,
  parseEntityRelationIds,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";

const LEADING_DEPARTMENT_KEYS = ["ведущий отдел"] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function fieldNameMatches(
  field: EntityField,
  keys: readonly string[],
): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return keys.some((key) => name === normalizeName(key));
}

function isDepartmentLikeField(field: EntityField): boolean {
  return (
    field.type === "relation" ||
    field.type === "belonging" ||
    field.type === "list" ||
    field.type === "lookup"
  );
}

/** Field «Ведущий отдел» on the project entity, if configured. */
export function findProjectLeadingDepartmentField(
  entity: Entity,
): EntityField | null {
  const candidates = entity.fields.filter(
    (field) =>
      isDepartmentLikeField(field) &&
      fieldNameMatches(field, LEADING_DEPARTMENT_KEYS),
  );
  if (candidates.length === 0) return null;

  const relation =
    candidates.find(
      (field) => field.type === "relation" || field.type === "belonging",
    ) ?? null;
  if (relation) return relation;

  const lookup = candidates.find((field) => field.type === "lookup") ?? null;
  if (lookup) return lookup;

  return candidates[0] ?? null;
}

function resolveRecordLabelAcrossEntities(
  entities: readonly Entity[],
  recordId: string,
  preferredTargetId: string | null,
): string {
  if (preferredTargetId) {
    const target =
      entities.find((item) => item.id === preferredTargetId) ?? null;
    const label = resolveRelationRecordLabel(
      target,
      recordId,
      entities,
    )?.trim();
    if (label) return label;
  }
  for (const entity of entities) {
    if (!entity.records.some((record) => record.id === recordId)) continue;
    const label = resolveRelationRecordLabel(
      entity,
      recordId,
      entities,
    )?.trim();
    if (label) return label;
  }
  return recordId;
}

/**
 * Leading department from the project record’s «Ведущий отдел» field.
 * Returns null when the field is missing or empty.
 */
export function resolveProjectLeadingDepartmentFromRecord(input: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
  valueContext: EntityValueContext;
}): { id: string; name: string } | null {
  const field = findProjectLeadingDepartmentField(input.entity);
  if (!field) return null;

  if (field.type === "list") {
    const optionId =
      parseEntityListValueIds(input.record.values[field.id])[0]?.trim() ?? "";
    if (!optionId) return null;
    const option = resolveEntityListFieldOptions(field, input.entities).find(
      (item) => item.id === optionId,
    );
    return {
      id: optionId,
      name: option?.name.trim() || optionId,
    };
  }

  const ids = getRecordFieldIds(
    input.valueContext,
    input.entity,
    input.record,
    field,
  );
  let id = ids[0]?.trim() ?? "";
  if (!id) {
    id = parseEntityRelationIds(input.record.values[field.id])[0]?.trim() ?? "";
  }
  if (!id) return null;

  const name = resolveRecordLabelAcrossEntities(
    input.entities,
    id,
    getEntityRelationTargetId(field),
  );
  return { id, name };
}
