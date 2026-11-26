import {
  getEntityRelationTargetId,
  parseEntityRelationIds,
  serializeEntityRelationIds,
} from "../model/field";
import { SYSTEM_USERS_ENTITY_ID } from "../model/system-entities";
import type { Entity, EntityField, EntityRecord } from "../model/types";
import { addEntityRecord } from "../store/entity-store";

/**
 * Multi-user relation that fans out into one record per selected person.
 * Schema keeps `relationMultiple` on (create picker); each stored record
 * still has a single assignee.
 */
export function isUserSpawnRelationField(
  field: Pick<
    EntityField,
    "type" | "relationEntityId" | "relationMultiple" | "relationSpawnPerUser"
  >,
): boolean {
  return (
    field.type === "relation" &&
    field.relationMultiple === true &&
    field.relationSpawnPerUser === true &&
    getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID
  );
}

/**
 * Whether the relation control should allow picking several ids.
 * Spawn-per-user: multi only while creating; afterwards one assignee per record.
 */
export function isRelationFieldMultiValueInput(
  field: Pick<
    EntityField,
    "type" | "relationEntityId" | "relationMultiple" | "relationSpawnPerUser"
  >,
  options?: { creating?: boolean },
): boolean {
  if (field.type === "belonging") return false;
  if (field.type !== "relation") return false;
  if (isUserSpawnRelationField(field)) return Boolean(options?.creating);
  return Boolean(field.relationMultiple);
}

export function findUserSpawnRelationField(
  entity: Pick<Entity, "fields">,
): EntityField | null {
  return entity.fields.find((field) => isUserSpawnRelationField(field)) ?? null;
}

/**
 * Split create-form values into one payload per selected user when the entity
 * has a spawn-per-user relation. Otherwise returns the original values once.
 */
export function expandUserSpawnRecordValues(
  entity: Pick<Entity, "fields">,
  values: Record<string, string>,
): Record<string, string>[] {
  const field = findUserSpawnRelationField(entity);
  if (!field) return [values];

  const userIds = parseEntityRelationIds(values[field.id] ?? "");
  if (userIds.length === 0) return [values];
  if (userIds.length === 1) {
    return [
      {
        ...values,
        [field.id]: serializeEntityRelationIds([userIds[0]!]),
      },
    ];
  }

  return userIds.map((userId) => ({
    ...values,
    [field.id]: serializeEntityRelationIds([userId]),
  }));
}

/** Create one entity record per selected user when spawn-per-user is enabled. */
export async function createEntityRecordsWithUserSpawn(
  entity: Entity,
  values: Record<string, string>,
  options?: { recordId?: string },
): Promise<EntityRecord[]> {
  const payloads = expandUserSpawnRecordValues(entity, values);
  const created: EntityRecord[] = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index]!;
    const record = await addEntityRecord(entity.id, payload, {
      id: index === 0 ? options?.recordId : undefined,
    });
    created.push(record);
  }
  return created;
}
