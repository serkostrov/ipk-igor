import {
  isEntityListOtherValue,
  parseEntityFieldFileValue,
  parseEntityListOtherText,
  parseEntityRelationGroups,
} from "./field";
import type { EntityField, EntityListOption } from "./types";

export function isEntityListOptionFinal(
  option: Pick<EntityListOption, "final"> | null | undefined,
) {
  return option?.final === true;
}

export function isEntityListOptionProblem(
  option: Pick<EntityListOption, "problem"> | null | undefined,
) {
  return option?.problem === true;
}

export function isEntityListOptionHidden(
  option: Pick<EntityListOption, "hiddenByDefault"> | null | undefined,
) {
  return option?.hiddenByDefault === true;
}

/** Whether a stored value counts as filled for a required field. */
export function isEntityFieldValueFilled(
  field: Pick<EntityField, "type" | "listAllowOther" | "listMultiple">,
  value: string | undefined,
) {
  const raw = value ?? "";
  if (field.type === "file") return parseEntityFieldFileValue(raw) != null;
  if (field.type === "relationGroups") {
    return parseEntityRelationGroups(raw).length > 0;
  }
  if (field.type === "boolean") return raw === "true";
  if (
    field.type === "list" &&
    !field.listMultiple &&
    field.listAllowOther &&
    isEntityListOtherValue(raw)
  ) {
    return parseEntityListOtherText(raw).trim().length > 0;
  }
  return raw.trim().length > 0;
}
