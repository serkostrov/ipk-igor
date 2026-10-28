import {
  getEntityFieldDisplayName,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  getSystemUserName,
  parseEntityRelationIds,
  SYSTEM_USERS_ENTITY_ID,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import type { AutomationTask } from "@/entities/automation";

function isUsersRelationField(field: EntityField) {
  return (
    (field.type === "relation" || field.type === "belonging") &&
    getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID
  );
}

function managerFieldScore(field: EntityField) {
  const name = getEntityFieldDisplayName(field).toLocaleLowerCase("ru");
  if (name.includes("менеджер лида") || name.includes("менеджер лид")) {
    return 3;
  }
  if (name.includes("менеджер")) return 2;
  if (name.includes("ответственн")) return 1;
  return 0;
}

/** Prefer «Менеджер лида», then any «Менеджер» Users-relation on the entity. */
export function findLeadManagerField(entity: Entity): EntityField | null {
  let best: EntityField | null = null;
  let bestScore = 0;
  for (const field of entity.fields) {
    if (!isUsersRelationField(field)) continue;
    const score = managerFieldScore(field);
    if (score > bestScore) {
      best = field;
      bestScore = score;
    }
  }
  return best;
}

function userNameFromRelationValue(
  entities: Entity[],
  raw: string | undefined,
) {
  const userId = parseEntityRelationIds(raw)[0];
  if (!userId) return null;
  return getSystemUserName(entities, userId);
}

function managerNameOnRecord(
  entities: Entity[],
  entity: Entity,
  record: EntityRecord,
) {
  const field = findLeadManagerField(entity);
  if (!field) return null;
  return userNameFromRelationValue(entities, record.values[field.id]);
}

/**
 * Lead / parent record for a task trigger row (owned sub-entity or explicit
 * relation to an entity whose name looks like «Лид»).
 */
function resolveLeadRecord(
  entities: Entity[],
  entity: Entity,
  record: EntityRecord,
): { entity: Entity; record: EntityRecord } | null {
  if (entity.parentEntityId) {
    const parent = entities.find((item) => item.id === entity.parentEntityId);
    const link = getEntityParentLinkField(entity);
    if (parent && link) {
      const parentId = parseEntityRelationIds(record.values[link.id])[0];
      const parentRecord = parent.records.find((item) => item.id === parentId);
      if (parentRecord) return { entity: parent, record: parentRecord };
    }
  }

  for (const field of entity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === SYSTEM_USERS_ENTITY_ID) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target) continue;
    const label = `${target.name} ${target.namePlural}`.toLocaleLowerCase("ru");
    if (!label.includes("лид")) continue;
    const relatedId = parseEntityRelationIds(record.values[field.id])[0];
    const related = target.records.find((item) => item.id === relatedId);
    if (related) return { entity: target, record: related };
  }

  return null;
}

/** Display name of the task assignee (Users record). */
export function resolveTaskAssigneeName(
  entities: Entity[],
  task: Pick<AutomationTask, "assigneeUserId">,
) {
  if (!task.assigneeUserId) return null;
  return getSystemUserName(entities, task.assigneeUserId);
}

/**
 * «Менеджер лида»: Users field on the trigger record, or on the parent / linked
 * lead record when the task runs on a child entity (e.g. «Разбор ТКП»).
 */
export function resolveTaskLeadManagerName(
  entities: Entity[],
  entity: Entity | undefined,
  record: EntityRecord | undefined,
) {
  if (!entity || !record) return null;

  const onTrigger = managerNameOnRecord(entities, entity, record);
  if (onTrigger) return onTrigger;

  const lead = resolveLeadRecord(entities, entity, record);
  if (!lead) return null;
  return managerNameOnRecord(entities, lead.entity, lead.record);
}
