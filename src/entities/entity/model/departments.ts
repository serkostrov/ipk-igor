import { getEntityRecordById } from "./record-queries";
import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  parseEntityRelationIds,
} from "./field";
import { findEntityManagerUserField } from "./table-hierarchy";
import { getEntityValueContext } from "./field-value";
import {
  findSystemUserByAuthId,
  getSystemUsersEntity,
  SYSTEM_USERS_ENTITY_ID,
} from "./system-entities";
import { recordMatchesOwnScope } from "./own-scope";
import type { Entity, EntityField, EntityRecord } from "./types";

const DEPARTMENT_ENTITY_NAMES = [
  "Отделы",
  "Отдел",
  "Departments",
  "Department",
] as const;

const DEPARTMENT_FIELD_KEYS = [
  "отдел",
  "отделы",
  "department",
  "departments",
] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function entityNameMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return keys.some((key) =>
    candidates.some((value) => normalizeName(value) === normalizeName(key)),
  );
}

function fieldLooksLikeDepartment(field: EntityField): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return DEPARTMENT_FIELD_KEYS.some(
    (key) => name === key || name.includes(key),
  );
}

function entityById(
  entities: readonly Entity[],
  id: string,
): Entity | undefined {
  return entities.find((item) => item.id === id);
}

/** Catalog entity «Отделы» (by name, or via Users.«Отдел» relation target). */
export function findDepartmentsEntity(
  entities: readonly Entity[],
): Entity | null {
  const byName =
    entities.find((entity) =>
      entityNameMatches(entity, DEPARTMENT_ENTITY_NAMES),
    ) ?? null;
  if (byName) return byName;

  const users = getSystemUsersEntity(entities);
  if (!users) return null;
  for (const field of users.fields) {
    if (!fieldLooksLikeDepartment(field)) continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entityById(entities, targetId);
    if (target) return target;
  }
  return null;
}

/** Relation / belonging fields that target the departments catalog. */
export function getDepartmentLinkFields(
  entity: Pick<Entity, "fields">,
  departmentsEntityId: string,
) {
  return entity.fields.filter((field) => {
    if (getEntityRelationTargetId(field) !== departmentsEntityId) return false;
    // Prefer fields named like «Отдел»; still accept any direct catalog link.
    return true;
  });
}

function getNamedDepartmentLinkFields(
  entity: Pick<Entity, "fields">,
  departmentsEntityId: string,
) {
  const links = getDepartmentLinkFields(entity, departmentsEntityId);
  const named = links.filter((field) => fieldLooksLikeDepartment(field));
  return named.length > 0 ? named : links;
}

/** User-relation fields (to the system Users entity). */
function getUserLinkFields(entity: Pick<Entity, "fields">) {
  return entity.fields.filter((field) => {
    if (field.type !== "relation" && field.type !== "belonging") return false;
    return getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID;
  });
}

/**
 * Department ids for a Users record: «Отдел» field + catalogs where the user
 * is listed as «Руководитель».
 */
export function collectUserDepartmentIds(
  userRecord: EntityRecord,
  usersEntity: Entity,
  departmentsEntity: Entity,
  entities: readonly Entity[],
): string[] {
  const found = new Set<string>();

  for (const field of getNamedDepartmentLinkFields(
    usersEntity,
    departmentsEntity.id,
  )) {
    for (const id of parseEntityRelationIds(userRecord.values[field.id])) {
      if (id) found.add(id);
    }
  }

  const managerField = findEntityManagerUserField(departmentsEntity);
  if (managerField) {
    for (const department of getEntityValueContext(entities).getRecords(
      departmentsEntity.id,
    )) {
      const managers = parseEntityRelationIds(
        department.values[managerField.id],
      );
      if (managers.includes(userRecord.id)) found.add(department.id);
    }
  }

  return [...found];
}

/**
 * Department ids of the current viewer (Users profile + managed departments).
 */
export function collectViewerDepartmentIds(
  entities: readonly Entity[],
  options: {
    authUserId: string | null;
    currentUserRecordId: string | null;
  },
): string[] {
  const departmentsEntity = findDepartmentsEntity(entities);
  const usersEntity = getSystemUsersEntity(entities);
  if (!departmentsEntity || !usersEntity) return [];

  const userRecord =
    (options.currentUserRecordId
      ? getEntityValueContext(entities).getRecord(
          usersEntity.id,
          options.currentUserRecordId,
        )
      : null) ?? findSystemUserByAuthId(entities, options.authUserId);

  if (!userRecord) return [];
  return collectUserDepartmentIds(
    userRecord,
    usersEntity,
    departmentsEntity,
    entities,
  );
}

function entityCanLinkToDepartments(
  entity: Entity,
  departmentsEntityId: string,
  entities: readonly Entity[],
  depth = 0,
  seen = new Set<string>(),
): boolean {
  if (entity.id === departmentsEntityId) return true;
  if (entity.id === SYSTEM_USERS_ENTITY_ID) return true;
  if (depth > 3 || seen.has(entity.id)) return false;
  seen.add(entity.id);

  if (getDepartmentLinkFields(entity, departmentsEntityId).length > 0) {
    return true;
  }
  if (getUserLinkFields(entity).length > 0) return true;

  for (const field of entity.fields) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === departmentsEntityId) continue;
    if (field.type !== "belonging" && field.type !== "relation") continue;
    if (field.type === "relation" && field.relationMultiple) continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    if (
      entityCanLinkToDepartments(
        target,
        departmentsEntityId,
        entities,
        depth + 1,
        seen,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Collect department ids linked to a record: direct «Отдел», short hops, and
 * departments of related Users.
 */
export async function collectRecordDepartmentIds(
  entity: Entity,
  record: EntityRecord,
  departmentsEntity: Entity,
  entities: readonly Entity[],
  depth = 0,
  visited = new Set<string>(),
): Promise<string[]> {
  const key = `${entity.id}:${record.id}`;
  if (depth > 3 || visited.has(key)) return [];
  visited.add(key);

  if (entity.id === departmentsEntity.id) return [record.id];

  const found = new Set<string>();
  const usersEntity = getSystemUsersEntity(entities);

  if (entity.id === SYSTEM_USERS_ENTITY_ID && usersEntity) {
    for (const id of collectUserDepartmentIds(
      record,
      usersEntity,
      departmentsEntity,
      entities,
    )) {
      found.add(id);
    }
    return [...found];
  }

  for (const field of getDepartmentLinkFields(entity, departmentsEntity.id)) {
    for (const id of parseEntityRelationIds(record.values[field.id])) {
      if (id) found.add(id);
    }
  }

  if (usersEntity) {
    for (const field of getUserLinkFields(entity)) {
      for (const userId of parseEntityRelationIds(record.values[field.id])) {
        const user = await getEntityRecordById(usersEntity, userId);
        if (!user) continue;
        for (const id of collectUserDepartmentIds(
          user,
          usersEntity,
          departmentsEntity,
          entities,
        )) {
          found.add(id);
        }
      }
    }
  }

  for (const field of entity.fields) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === departmentsEntity.id) continue;
    if (targetId === SYSTEM_USERS_ENTITY_ID) continue;
    if (field.type !== "belonging" && field.type !== "relation") continue;
    if (field.type === "relation" && field.relationMultiple) continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    if (
      !entityCanLinkToDepartments(
        target,
        departmentsEntity.id,
        entities,
        0,
        new Set([entity.id]),
      )
    ) {
      continue;
    }
    for (const relatedId of parseEntityRelationIds(record.values[field.id])) {
      const related = await getEntityRecordById(target, relatedId);
      if (!related) continue;
      for (const id of await collectRecordDepartmentIds(
        target,
        related,
        departmentsEntity,
        entities,
        depth + 1,
        visited,
      )) {
        found.add(id);
      }
    }
  }

  return [...found];
}

async function recordCreatedBySameDepartment(
  record: EntityRecord,
  viewerDepartmentIds: ReadonlySet<string>,
  departmentsEntity: Entity,
  entities: readonly Entity[],
): Promise<boolean> {
  const usersEntity = getSystemUsersEntity(entities);
  if (!usersEntity || !record.createdBy) return false;
  const creator =
    (await getEntityRecordById(usersEntity, record.createdBy)) ??
    findSystemUserByAuthId(entities, record.createdBy);
  if (!creator) return false;
  return collectUserDepartmentIds(
    creator,
    usersEntity,
    departmentsEntity,
    entities,
  ).some((id) => viewerDepartmentIds.has(id));
}

/**
 * «Своего отдела»: record is visible when it shares a department with the
 * viewer, was created by a colleague from that department, or the viewer is
 * involved on the card (same rules as «только свои»). Empty viewer
 * departments → only involved / own records.
 */
export async function recordMatchesDepartmentScope(
  entity: Entity,
  record: EntityRecord,
  viewerDepartmentIds: readonly string[],
  departmentsEntity: Entity | null,
  entities: readonly Entity[],
  options: {
    authUserId: string | null;
    currentUserRecordId: string | null;
  },
): Promise<boolean> {
  if (
    recordMatchesOwnScope(entity, record, {
      authUserId: options.authUserId,
      currentUserRecordId: options.currentUserRecordId,
      entities,
    })
  ) {
    return true;
  }

  if (!departmentsEntity || viewerDepartmentIds.length === 0) return false;

  const allowed = new Set(viewerDepartmentIds);
  const linked = await collectRecordDepartmentIds(
    entity,
    record,
    departmentsEntity,
    entities,
  );
  if (linked.some((id) => allowed.has(id))) return true;

  return recordCreatedBySameDepartment(
    record,
    allowed,
    departmentsEntity,
    entities,
  );
}
