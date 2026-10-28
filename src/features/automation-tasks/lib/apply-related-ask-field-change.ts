import { relatedAskValueKey } from "@/entities/automation";
import {
  applyEntityFieldValue,
  applyTkpGipDepartmentUsers,
  ensureTkpGipDepartmentInGroupsValue,
  findDeptCalculationsGroupsField,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import type { RelatedAskGroup } from "./task-related-ask";

/**
 * Apply a related-ask field edit: soft-fill dependents, then TKP/ГИП hardcode
 * for «Расчёты отделов». Returns next form values; may persist overridden
 * user fields that are not part of the ask list.
 */
export function applyRelatedAskFieldChange(options: {
  groups: RelatedAskGroup[];
  valueKey: string;
  value: string;
  formValues: Record<string, string>;
  triggerEntity: Entity;
  triggerRecord: EntityRecord;
  entities: readonly Entity[];
}): Record<string, string> {
  const {
    groups,
    valueKey,
    value,
    formValues,
    triggerEntity,
    triggerRecord,
    entities,
  } = options;

  const group = groups.find((item) =>
    item.fields.some((row) => row.valueKey === valueKey),
  );
  const row = group?.fields.find((item) => item.valueKey === valueKey);
  if (!group || !row) {
    return { ...formValues, [valueKey]: value };
  }

  const relatedRecord = group.relatedEntity.records.find(
    (item) => item.id === group.relatedRecordId,
  );
  const relatedMerged: Record<string, string> = {
    ...(relatedRecord?.values ?? {}),
  };
  for (const item of group.fields) {
    relatedMerged[item.field.id] = formValues[item.valueKey] ?? "";
  }
  relatedMerged[row.field.id] = value;

  let nextRelated = applyEntityFieldValue(
    group.relatedEntity,
    relatedMerged,
    row.field.id,
    value,
    entities,
  );

  const groupsField = findDeptCalculationsGroupsField(group.relatedEntity);
  if (groupsField && nextRelated[groupsField.id] !== undefined) {
    nextRelated = {
      ...nextRelated,
      [groupsField.id]: ensureTkpGipDepartmentInGroupsValue({
        value: nextRelated[groupsField.id] ?? "",
        hostEntity: group.relatedEntity,
        entities,
      }),
    };
  }

  const gip = applyTkpGipDepartmentUsers({
    childEntity: group.relatedEntity,
    childValues: nextRelated,
    entities,
    parentEntity: triggerEntity,
    parentRecord: triggerRecord,
    changedFieldId: row.field.id,
  });
  nextRelated = gip.values;

  // Prefer values after soft-fill / GIP ensure (may differ from raw `value`).
  let nextForm = {
    ...formValues,
    [valueKey]: nextRelated[row.field.id] ?? value,
  };
  for (const item of group.fields) {
    const nextValue = nextRelated[item.field.id] ?? "";
    if (item.valueKey === valueKey) continue;
    if ((formValues[item.valueKey] ?? "") === nextValue) continue;
    nextForm = { ...nextForm, [item.valueKey]: nextValue };
  }

  // Soft-fill / GIP may set руководитель·исполнитель outside the ask list —
  // keep them on the related record immediately.
  if (gip.overriddenFieldIds.length > 0) {
    const patch: Record<string, string> = {};
    for (const fieldId of gip.overriddenFieldIds) {
      patch[fieldId] = nextRelated[fieldId] ?? "";
      const askKey = relatedAskValueKey(
        group.relationFieldId,
        group.relatedRecordId,
        fieldId,
      );
      nextForm = { ...nextForm, [askKey]: patch[fieldId]! };
    }
    void updateEntityRecord(
      group.relatedEntity.id,
      group.relatedRecordId,
      patch,
    ).catch((error: unknown) => {
      console.error("[hardcode/tkp-gip] persist user fields failed", error);
    });
  }

  return nextForm;
}
