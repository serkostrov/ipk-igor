import {
  isEntityComputedFieldType,
  isEntityRelationGroupsFilled,
  parseEntityFieldFileValue,
  type Entity,
  type EntityField,
  type EntityRelationGroupsMode,
  type EntityValueContext,
} from "@/entities/entity";

export type TaskFieldFilledOptions = {
  ctx: EntityValueContext;
  entity: Entity;
  values: Record<string, string>;
  recordId: string;
  relationGroupsMode?: EntityRelationGroupsMode;
};

/**
 * Whether a task/ask field counts as filled for required checks.
 * Computed fields (lookup / formula / rollup / numberSum) are never
 * user-writable — they must not block completion.
 */
export function isTaskAskFieldFilled(
  field: EntityField,
  value: string,
  options?: TaskFieldFilledOptions,
): boolean {
  if (isEntityComputedFieldType(field.type)) return true;
  if (field.type === "boolean") return true;
  if (field.type === "file") return parseEntityFieldFileValue(value) != null;
  if (field.type === "relationGroups") {
    return isEntityRelationGroupsFilled(
      value,
      options?.relationGroupsMode ?? "full",
    );
  }
  return value.trim().length > 0;
}
