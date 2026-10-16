import {
  createAdminRole,
  createEmployeeRole,
  isSettingsTabId,
  ROLE_ADMIN_ID,
  ROLE_EMPLOYEE_ID,
  type DataScope,
  type EntityAccess,
  type FieldAccess,
  type Role,
  type RolePermissions,
  type RolesConfig,
  type SettingsTabId,
} from "../model/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDataScope(value: unknown): DataScope {
  return value === "own" ? "own" : "all";
}

function parseFieldAccess(value: unknown): FieldAccess | null {
  if (!isRecord(value)) return null;
  return {
    view: value.view === true,
    edit: value.edit === true,
  };
}

function parseFields(value: unknown): Record<string, FieldAccess> | "*" {
  if (value === "*") return "*";
  if (!isRecord(value)) return {};
  const fields: Record<string, FieldAccess> = {};
  for (const [fieldId, item] of Object.entries(value)) {
    const parsed = parseFieldAccess(item);
    if (parsed) fields[fieldId] = parsed;
  }
  return fields;
}

function parseEntityAccess(value: unknown): EntityAccess | null {
  if (!isRecord(value)) return null;
  if (typeof value.entityId !== "string" || !value.entityId.trim()) return null;
  return {
    entityId: value.entityId.trim(),
    create: value.create === true,
    read: value.read === true,
    update: value.update === true,
    delete: value.delete === true,
    scope: parseDataScope(value.scope),
    fields: parseFields(value.fields),
  };
}

function parseSettingsTabs(value: unknown): SettingsTabId[] | "*" {
  if (value === "*") return "*";
  if (!Array.isArray(value)) return [];
  const tabs: SettingsTabId[] = [];
  for (const item of value) {
    if (typeof item === "string" && isSettingsTabId(item)) tabs.push(item);
  }
  return tabs;
}

function parseMenuItemIds(value: unknown): string[] | "*" {
  if (value === "*") return "*";
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0 &&
      !item.startsWith("report-"),
  );
}

function parseEntities(value: unknown): EntityAccess[] | "*" {
  if (value === "*") return "*";
  if (!Array.isArray(value)) return [];
  const entities: EntityAccess[] = [];
  for (const item of value) {
    const parsed = parseEntityAccess(item);
    if (parsed) entities.push(parsed);
  }
  return entities;
}

function parsePermissions(value: unknown): RolePermissions {
  if (!isRecord(value)) {
    return createEmployeeRole().permissions;
  }
  return {
    menuItemIds: parseMenuItemIds(value.menuItemIds),
    settingsTabs: parseSettingsTabs(value.settingsTabs),
    canInviteUsers: value.canInviteUsers === true,
    canAccessHistory: value.canAccessHistory === true,
    canAccessAutomationTasks: value.canAccessAutomationTasks === true,
    canAccessNotifications: value.canAccessNotifications !== false,
    entities: parseEntities(value.entities),
  };
}

export function normalizeRole(role: Role): Role {
  return {
    id: role.id.trim(),
    name: role.name.trim() || "Роль",
    description: role.description.trim(),
    isSystem: role.isSystem === true,
    permissions: parsePermissions(role.permissions),
  };
}

function parseRole(value: unknown): Role | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string") return null;
  return normalizeRole({
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    isSystem: value.isSystem === true,
    permissions: parsePermissions(value.permissions),
  });
}

export function ensureSystemRoles(roles: Role[]): {
  roles: Role[];
  changed: boolean;
} {
  let changed = false;
  let next = [...roles];

  // Only Administrator is mandatory. «Сотрудник» is optional and may be removed.
  const adminIndex = next.findIndex((role) => role.id === ROLE_ADMIN_ID);
  if (adminIndex < 0) {
    next = [createAdminRole(), ...next];
    changed = true;
  } else {
    const admin = next[adminIndex]!;
    if (!admin.isSystem) {
      next[adminIndex] = { ...admin, isSystem: true };
      changed = true;
    }
  }

  const employeeIndex = next.findIndex((role) => role.id === ROLE_EMPLOYEE_ID);
  if (employeeIndex >= 0) {
    const employee = next[employeeIndex]!;
    if (employee.isSystem) {
      next[employeeIndex] = { ...employee, isSystem: false };
      changed = true;
    }
  }

  return { roles: next.map(normalizeRole), changed };
}

export function cloneDefaultRolesConfig(): RolesConfig {
  return {
    roles: [createAdminRole(), createEmployeeRole()],
  };
}

export function parseRolesConfig(value: unknown): RolesConfig {
  if (!isRecord(value) || !Array.isArray(value.roles)) {
    return cloneDefaultRolesConfig();
  }

  const roles: Role[] = [];
  for (const item of value.roles) {
    const parsed = parseRole(item);
    if (parsed) roles.push(parsed);
  }

  const ensured = ensureSystemRoles(roles);
  return { roles: ensured.roles };
}

export function toRolesDocument(config: RolesConfig): RolesConfig {
  const ensured = ensureSystemRoles(config.roles.map(normalizeRole));
  return { roles: ensured.roles };
}
