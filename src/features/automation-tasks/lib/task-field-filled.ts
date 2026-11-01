import {
  createEntityDraftRecord,
  isEntityComputedAutoValueEmpty,
  isEntityComputedFieldType,
  isEntityFieldManualInputEnabled,
  isEntityRelationGroupsFilled,
  parseEntityFieldFileValue,
  type Entity,
  type EntityField,
  type EntityRelationGroupsMode,
  type EntityValueContext,
} from "@/entities/entity";

export type TaskFieldFilledOptions = {
  ctx?: EntityValueContext;
  entity?: Entity;
  values?: Record<string, string>;
  recordId?: string;
  relationGroupsMode?: EntityRelationGroupsMode;
};

/**
 * Whether a task/ask field counts as filled for required checks.
 * Pure computed fields are never user-writable. With «Возможен ручной
 * ввод», an empty auto value still needs a stored manual value.
 */
export function isTaskAskFieldFilled(
  field: EntityField,
  value: string,
  options?: TaskFieldFilledOptions,
): boolean {
  if (isEntityComputedFieldType(field.type)) {
    if (!isEntityFieldManualInputEnabled(field)) return true;
    if (options?.ctx && options.entity && options.values) {
      const draft = createEntityDraftRecord(
        options.values,
        options.recordId ?? "draft",
      );
      if (
        !isEntityComputedAutoValueEmpty(
          options.ctx,
          options.entity,
          draft,
          field,
        )
      ) {
        return true;
      }
    }
    return value.trim().length > 0;
  }
  if (field.type === "boolean") return true;
  if (field.type === "file") return parseEntityFieldFileValue(value) != null;
  if (field.type === "relationGroups") {
    return isEntityRelationGroupsFilled(
      value,
      options?.relationGroupsMode ?? "full",
      field.relationGroups?.levels.length ?? 2,
    );
  }
  return value.trim().length > 0;
}
