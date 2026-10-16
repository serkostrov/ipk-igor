import {
  ROLE_ADMIN_ID,
  ROLE_EMPLOYEE_ID,
  createEmployeeRole,
  getRolesConfig,
  normalizeRole,
  removeRole,
  setRolesConfig,
  upsertRole,
  type Role,
} from "@/entities/access";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
  SYSTEM_FIELD_KEY_ROLE,
  updateEntityListOption,
  type EntityField,
  type EntityListOption,
} from "@/entities/entity";

/** Users «Роль» — variants are the access roles catalog, not a free list. */
export function isUsersRoleListField(
  field: Pick<EntityField, "id" | "systemKey" | "type">,
) {
  if (field.type !== "list") return false;
  return (
    field.systemKey === SYSTEM_FIELD_KEY_ROLE ||
    field.id === SYSTEM_USERS_FIELD_ROLE_ID
  );
}

export function isProtectedSystemRoleId(roleId: string) {
  return roleId === ROLE_ADMIN_ID || roleId === ROLE_EMPLOYEE_ID;
}

/** Create a role; list options sync from the roles catalog. */
export function createUsersRoleFromListOption(data: {
  name: string;
  color?: string;
}) {
  const base = createEmployeeRole();
  const role = normalizeRole({
    ...base,
    id: `role-${crypto.randomUUID()}`,
    name: data.name.trim() || "Новая роль",
    description: "",
    isSystem: false,
  });
  upsertRole(role);

  if (data.color?.trim()) {
    updateEntityListOption(
      SYSTEM_USERS_ENTITY_ID,
      SYSTEM_USERS_FIELD_ROLE_ID,
      role.id,
      { color: data.color },
    );
  }

  return role;
}

export function updateUsersRoleFromListOption(
  optionId: string,
  data: Pick<
    EntityListOption,
    "name" | "color" | "final" | "problem" | "hiddenByDefault"
  >,
) {
  const existing = getRolesConfig().roles.find((role) => role.id === optionId);
  if (existing) {
    const nextName = data.name.trim() || existing.name;
    if (nextName !== existing.name) {
      upsertRole(normalizeRole({ ...existing, name: nextName }));
    }
  }

  updateEntityListOption(
    SYSTEM_USERS_ENTITY_ID,
    SYSTEM_USERS_FIELD_ROLE_ID,
    optionId,
    {
      color: data.color,
      final: data.final,
      problem: data.problem,
      hiddenByDefault: data.hiddenByDefault,
    },
  );
}

export function deleteUsersRoleFromListOption(optionId: string) {
  if (isProtectedSystemRoleId(optionId)) return;
  removeRole(optionId);
}

/** Persist option order as roles catalog order. */
export function reorderUsersRolesFromListOptions(orderedRoleIds: string[]) {
  const current = getRolesConfig().roles;
  const byId = new Map(current.map((role) => [role.id, role]));
  const next: Role[] = [];
  for (const id of orderedRoleIds) {
    const role = byId.get(id);
    if (role) {
      next.push(role);
      byId.delete(id);
    }
  }
  for (const role of byId.values()) next.push(role);
  if (
    next.length === current.length &&
    next.every((role, index) => role.id === current[index]?.id)
  ) {
    return;
  }
  setRolesConfig({ roles: next });
}
