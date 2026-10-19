import {
  AUTOMATION_TASKS_ITEM_ID,
  HISTORY_ITEM_ID,
  NOTIFICATIONS_ITEM_ID,
  SETTINGS_ITEM_ID,
} from "@/entities/menu";
import type { EntityCondition } from "@/entities/entity";
import {
  ROLE_ADMIN_ID,
  type DataScope,
  type EntityAccess,
  type EntityAction,
  type FieldAccessMode,
  type Role,
  type RolePermissions,
  type SettingsTabId,
} from "./types";

export function isAdminRole(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (role.id === ROLE_ADMIN_ID) return true;
  return role.permissions.settingsTabs === "*";
}

export function getEntityAccess(
  permissions: RolePermissions,
  entityId: string,
): EntityAccess | null {
  if (permissions.entities === "*") {
    return {
      entityId,
      create: true,
      read: true,
      update: true,
      delete: true,
      scope: "all",
      fields: "*",
    };
  }
  return (
    permissions.entities.find((item) => item.entityId === entityId) ?? null
  );
}

export function canEntity(
  role: Role | null | undefined,
  entityId: string,
  action: EntityAction,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access) return false;
  return access[action] === true;
}

export function entityScope(
  role: Role | null | undefined,
  entityId: string,
): DataScope {
  if (!role || isAdminRole(role)) return "all";
  return getEntityAccess(role.permissions, entityId)?.scope ?? "own";
}

/** Field conditions for `scope === "filter"`. Empty array when filter is set but empty. */
export function entityScopeFilter(
  role: Role | null | undefined,
  entityId: string,
): EntityCondition[] | null {
  if (!role || isAdminRole(role)) return null;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access || access.scope !== "filter") return null;
  return access.scopeFilter ?? [];
}

export function canField(
  role: Role | null | undefined,
  entityId: string,
  fieldId: string,
  mode: FieldAccessMode,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access) return false;
  if (mode === "edit" && !access.update) return false;
  if (mode === "view" && !access.read) return false;
  if (access.fields === "*") return true;
  const field = access.fields[fieldId];
  if (!field) return false;
  return mode === "edit" ? field.edit : field.view;
}

export function canSettingsTab(
  role: Role | null | undefined,
  tab: SettingsTabId,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const tabs = role.permissions.settingsTabs;
  if (tabs === "*") return true;
  return tabs.includes(tab);
}

export function canAccessSettings(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const tabs = role.permissions.settingsTabs;
  if (tabs === "*") return true;
  return tabs.length > 0;
}

export function canInviteUsers(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canInviteUsers;
}

export function canAccessHistory(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessHistory;
}

export function canAccessAutomationTasks(
  role: Role | null | undefined,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessAutomationTasks;
}

export function canDeleteAutomationTasks(
  role: Role | null | undefined,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  if (!role.permissions.canAccessAutomationTasks) return false;
  return role.permissions.canDeleteAutomationTasks === true;
}

export function canAccessNotifications(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessNotifications;
}

/** Whether a sidebar / app menu item id is visible for the role. */
export function canMenuItem(
  role: Role | null | undefined,
  menuItemId: string,
  entityIdForItem?: string | null,
): boolean {
  if (!role) return false;

  if (menuItemId === SETTINGS_ITEM_ID) {
    return canAccessSettings(role);
  }
  if (menuItemId === HISTORY_ITEM_ID) {
    return canAccessHistory(role);
  }
  if (menuItemId === AUTOMATION_TASKS_ITEM_ID) {
    return canAccessAutomationTasks(role);
  }
  if (menuItemId === NOTIFICATIONS_ITEM_ID) {
    return canAccessNotifications(role);
  }

  const allowed = role.permissions.menuItemIds;
  if (allowed !== "*" && !allowed.includes(menuItemId)) {
    return false;
  }

  if (entityIdForItem) {
    return canEntity(role, entityIdForItem, "read");
  }

  return true;
}

export function allowedSettingsTabs(
  role: Role | null | undefined,
): SettingsTabId[] | "*" {
  if (!role) return [];
  if (isAdminRole(role)) return "*";
  return role.permissions.settingsTabs;
}
