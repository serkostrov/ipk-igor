/**
 * Soft-fill empty relation fields on a child create form from the parent
 * record that opened the dialog (tab / related ask / gantt host).
 *
 * - Child relation → parent entity: write the parent record id.
 * - Child relation → same target as a parent relation: copy the parent's ids.
 */

import {
  getEntityRelationTargetId,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  type Entity,
  type EntityRecord,
} from "../model/types";
import {
  getEntityValueContext,
  sanitizeEntityRelationDependencies,
} from "../model/field-value";

export function softFillRelationsFromParentRecord(options: {
  childEntity: Entity;
  childValues: Record<string, string>;
  parentEntity: Entity;
  parentRecord: EntityRecord;
  entities: readonly Entity[];
}): Record<string, string> {
  const { childEntity, childValues, parentEntity, parentRecord, entities } =
    options;

  const liveParent =
    getEntityValueContext(entities).getRecord(
      parentEntity.id,
      parentRecord.id,
    ) ?? parentRecord;
  const parentValues: Record<string, string> = {
    ...parentRecord.values,
    ...liveParent.values,
  };

  const next = { ...childValues };
  let changed = false;

  for (const field of childEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    if (parseEntityRelationIds(next[field.id]).length > 0) continue;

    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;

    if (parentEntity.id === targetId) {
      next[field.id] = serializeEntityRelationIds([parentRecord.id]);
      changed = true;
      continue;
    }

    const parentField =
      parentEntity.fields.find(
        (candidate) =>
          (candidate.type === "relation" || candidate.type === "belonging") &&
          getEntityRelationTargetId(candidate) === targetId,
      ) ?? null;
    if (!parentField) continue;

    const ids = parseEntityRelationIds(parentValues[parentField.id]);
    if (ids.length === 0) continue;

    next[field.id] = serializeEntityRelationIds(
      field.relationMultiple ? ids : ids.slice(0, 1),
    );
    changed = true;
  }

  if (!changed) return childValues;
  return sanitizeEntityRelationDependencies(childEntity, next, entities);
}
