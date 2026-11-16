import {
  SYSTEM_USERS_FIELD_NAME_ID,
  getSystemUsersEntity,
  resolveRelationRecordLabel,
  type Entity,
} from "@/entities/entity";

export function resolveFeedAuthorName(
  entities: readonly Entity[],
  authUserId: string,
): string {
  const users = getSystemUsersEntity(entities);
  if (!users) return authUserId.slice(0, 8);
  const record = users.records.find(
    (item) => item.authUserId?.trim() === authUserId,
  );
  const name = record?.values[SYSTEM_USERS_FIELD_NAME_ID]?.trim();
  return name || authUserId.slice(0, 8);
}

export function resolveLegalEntityLabel(
  entities: readonly Entity[],
  legalEntityId: string,
  legalEntitiesEntityId: string | null,
): string {
  if (!legalEntitiesEntityId) return legalEntityId.slice(0, 8);
  const entity = entities.find((item) => item.id === legalEntitiesEntityId);
  return (
    resolveRelationRecordLabel(entity, legalEntityId, entities)?.trim() ||
    legalEntityId.slice(0, 8)
  );
}
