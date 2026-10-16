export type DataScope = "all" | "own";

export type FieldAccess = {
  view: boolean;
  edit: boolean;
};

export type EntityAccess = {
  entityId: string;
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  scope: DataScope;
  /** `"*"` — все поля; объект — явная матрица (нет ключа = запрет). */
  fields: Record<string, FieldAccess> | "*";
};

export type SettingsTabId =
  "menu" | "entities" | "automations" | "notifications" | "roles";

export type RolePermissions = {
  menuItemIds: string[] | "*";
  settingsTabs: SettingsTabId[] | "*";
  canInviteUsers: boolean;
  canAccessHistory: boolean;
  canAccessAutomationTasks: boolean;
  canAccessNotifications: boolean;
  entities: EntityAccess[] | "*";
};

export type Role = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: RolePermissions;
};

export type RolesConfig = {
  roles: Role[];
};

export type EntityAction = "create" | "read" | "update" | "delete";

export type FieldAccessMode = "view" | "edit";

export const ROLE_ADMIN_ID = "role-system-admin";
export const ROLE_EMPLOYEE_ID = "role-system-employee";

export const SETTINGS_TAB_IDS: SettingsTabId[] = [
  "menu",
  "entities",
  "automations",
  "notifications",
  "roles",
];

export function isSettingsTabId(value: string): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as string[]).includes(value);
}

export function createAdminRole(): Role {
  return {
    id: ROLE_ADMIN_ID,
    name: "Администратор",
    description: "Полный доступ ко всей системе",
    isSystem: true,
    permissions: {
      menuItemIds: "*",
      settingsTabs: "*",
      canInviteUsers: true,
      canAccessHistory: true,
      canAccessAutomationTasks: true,
      canAccessNotifications: true,
      entities: "*",
    },
  };
}

export function createEmployeeRole(): Role {
  return {
    id: ROLE_EMPLOYEE_ID,
    name: "Сотрудник",
    description: "Доступ к данным без настроек системы",
    isSystem: true,
    permissions: {
      menuItemIds: "*",
      settingsTabs: [],
      canInviteUsers: false,
      canAccessHistory: true,
      canAccessAutomationTasks: true,
      canAccessNotifications: true,
      entities: "*",
    },
  };
}

export function createEmptyEntityAccess(entityId: string): EntityAccess {
  return {
    entityId,
    create: false,
    read: false,
    update: false,
    delete: false,
    scope: "own",
    fields: {},
  };
}

export function createFullEntityAccess(entityId: string): EntityAccess {
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
