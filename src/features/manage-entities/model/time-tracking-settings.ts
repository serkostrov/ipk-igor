import {
  getEntityRelationTargetId,
  getSystemUsersEntity,
  type Entity,
  type EntityFieldType,
  type EntityTimeTracking,
} from "@/entities/entity";

function fieldsOfType(entity: Entity, type: EntityFieldType) {
  return entity.fields.filter((field) => field.type === type);
}

/** Relation fields of `entity` that point to `targetId`. */
export function getRelationFieldsTo(entity: Entity, targetId: string | null) {
  return fieldsOfType(entity, "relation").filter(
    (field) =>
      targetId != null && getEntityRelationTargetId(field) === targetId,
  );
}

/** Mapping prefilled by field types of the entry entity (editable later). */
export function suggestEntityTimeTracking(
  entity: Entity,
  entryEntity: Entity,
  entities: readonly Entity[],
): EntityTimeTracking {
  const users = getSystemUsersEntity(entities);
  const datetimes = fieldsOfType(entryEntity, "datetime");
  return {
    entryEntityId: entryEntity.id,
    linkFieldId: getRelationFieldsTo(entryEntity, entity.id)[0]?.id ?? "",
    employeeFieldId:
      getRelationFieldsTo(entryEntity, users?.id ?? null)[0]?.id ?? "",
    startFieldId: datetimes[0]?.id ?? "",
    endFieldId: datetimes[1]?.id ?? "",
    hoursFieldId: fieldsOfType(entryEntity, "number")[0]?.id ?? "",
    methodFieldId: null,
    timerOptionId: null,
    manualOptionId: null,
    commentFieldId: fieldsOfType(entryEntity, "textarea")[0]?.id ?? null,
    statusFieldId: null,
    statusOptionIds: [],
    dailyLimitHours: 8,
    context: [],
  };
}

/** Why the settings cannot be saved (`null` — valid). */
export function getTimeTrackingSettingsError(
  draft: EntityTimeTracking,
): string | null {
  const required: Array<[string, string]> = [
    [draft.linkFieldId, "связь с записью"],
    [draft.employeeFieldId, "сотрудника"],
    [draft.startFieldId, "начало"],
    [draft.endFieldId, "окончание"],
    [draft.hoursFieldId, "часы"],
  ];
  const missing = required.filter(([id]) => !id).map(([, label]) => label);
  if (missing.length > 0) return `Укажите поля: ${missing.join(", ")}`;
  if (draft.startFieldId === draft.endFieldId) {
    return "Начало и окончание должны быть разными полями";
  }
  return null;
}
