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
  "отдел менеджера",
  "department",
  "departments",
  "manager department",
] as const;

/** Intermediate catalogs that often hop to departments (e.g. leads). */
const DEPARTMENT_HOP_ENTITY_KEYS = [
  "коммерческая группа",
  "коммерческие группы",
  "commercial group",
  "commercial groups",
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
 * is listed as «Руководитель» + «Отдел» of commercial groups they head.
 */
export function collectUserDepartmentIds(
  userRecord: EntityRecord,
  usersEntity: Entity,
  departmentsEntity: Entity,
  entities: readonly Entity[],
): string[] {
  const found = new Set<string>();
  const ctx = getEntityValueContext(entities);

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
    for (const department of ctx.getRecords(departmentsEntity.id)) {
      const managers = parseEntityRelationIds(
        department.values[managerField.id],
      );
      if (managers.includes(userRecord.id)) found.add(department.id);
    }
  }

  // Commercial groups (and similar): head → group.«Отдел».
  for (const entity of entities) {
    if (!entityNameMatches(entity, DEPARTMENT_HOP_ENTITY_KEYS)) continue;
    const headField = findEntityManagerUserField(entity);
    if (!headField) continue;
    const deptFields = getDepartmentLinkFields(entity, departmentsEntity.id);
    if (deptFields.length === 0) continue;
    for (const group of ctx.getRecords(entity.id)) {
      const heads = parseEntityRelationIds(group.values[headField.id]);
      if (!heads.includes(userRecord.id)) continue;
      for (const field of deptFields) {
        for (const id of parseEntityRelationIds(group.values[field.id])) {
          if (id) found.add(id);
        }
      }
    }
  }

  return [...found];
}

/** Direct «Отдел» or a hop through «Коммерческая группа» (etc.). */
function entityHasExplicitDepartmentBinding(
  entity: Entity,
  departmentsEntityId: string,
  entities: readonly Entity[],
): boolean {
  if (getDepartmentLinkFields(entity, departmentsEntityId).length > 0) {
    return true;
  }
  for (const field of entity.fields) {
    if (field.type !== "belonging" && field.type !== "relation") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    if (entityNameMatches(target, DEPARTMENT_HOP_ENTITY_KEYS)) return true;
  }
  return false;
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
    const target = entityById(entities, targetId);
    if (!target) continue;
    const hopNamed = entityNameMatches(target, DEPARTMENT_HOP_ENTITY_KEYS);
    if (field.type === "relation" && field.relationMultiple && !hopNamed) {
      continue;
    }
    if (hopNamed) {
      // Commercial group binding is enough for department scope (empty
      // group.«Отдел» → record hidden). Do not require the link yet — and
      // never treat the group head Users as the department path.
      return true;
    }
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
 * Collect department ids linked to a record.
 * Prefer explicit «Отдел» / «Коммерческая группа»→«Отдел». Users-field hops
 * (менеджер, наблюдатели) are only a fallback when the entity has no such
 * binding — otherwise «своего отдела» leaks via people on the card.
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

  // Commercial group / similar hops: only direct «Отдел», never head Users.
  if (entityNameMatches(entity, DEPARTMENT_HOP_ENTITY_KEYS)) {
    for (const field of getDepartmentLinkFields(entity, departmentsEntity.id)) {
      for (const id of parseEntityRelationIds(record.values[field.id])) {
        if (id) found.add(id);
      }
    }
    return [...found];
  }

  const explicitOnly = entityHasExplicitDepartmentBinding(
    entity,
    departmentsEntity.id,
    entities,
  );

  for (const field of getDepartmentLinkFields(entity, departmentsEntity.id)) {
    for (const id of parseEntityRelationIds(record.values[field.id])) {
      if (id) found.add(id);
    }
  }

  for (const field of entity.fields) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === departmentsEntity.id) continue;
    if (targetId === SYSTEM_USERS_ENTITY_ID) continue;
    if (field.type !== "belonging" && field.type !== "relation") continue;
    const target = entityById(entities, targetId);
    if (!target) continue;
    const hopNamed = entityNameMatches(target, DEPARTMENT_HOP_ENTITY_KEYS);
    // Skip wide multi-relations unless they are a known dept hop (comm. group).
    if (field.type === "relation" && field.relationMultiple && !hopNamed) {
      continue;
    }
    if (explicitOnly && !hopNamed) continue;
    if (
      !hopNamed &&
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

  // Fallback: departments of related Users — only when there is no explicit
  // dept / commercial-group binding on the entity.
  if (!explicitOnly && usersEntity) {
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

  return [...found];
}

/**
 * «Своего отдела»:
 * - Entity linked to departments: visible only when record department ids
 *   intersect the viewer’s. Empty dept on a department-capable entity → hide
 *   (no «own» escape for orphan admin leads that merely list the viewer).
 * - Entity not linked to departments: fall back to «только свои».
 * - No departments catalog / empty viewer depts on a capable entity → hide
 *   unless the entity is not department-capable (then own).
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
  const ownMatch = recordMatchesOwnScope(entity, record, {
    authUserId: options.authUserId,
    currentUserRecordId: options.currentUserRecordId,
    entities,
  });

  if (!departmentsEntity) return ownMatch;

  const capable = entityCanLinkToDepartments(
    entity,
    departmentsEntity.id,
    entities,
  );
  if (!capable) return ownMatch;

  if (viewerDepartmentIds.length === 0) return false;

  const allowed = new Set(viewerDepartmentIds);
  const linked = await collectRecordDepartmentIds(
    entity,
    record,
    departmentsEntity,
    entities,
  );

  // Orphan / unbound record on a department-capable entity — not visible
  // under department scope even if the viewer is listed on the card.
  if (linked.length === 0) return false;

  if (linked.some((id) => allowed.has(id))) {
    // In the viewer’s department: allow, including own involvement there.
    return true;
  }

  // Tagged with other departments only — do not leak via own / creator hop.
  return false;
}
