import type { EntityCondition } from "@/entities/entity";

/** Record visibility for a role on an entity. */
export type DataScope = "all" | "own" | "filter";

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
  /**
   * When `scope === "filter"`: record must match all conditions
   * (same model as entity field filters / relation filters).
   */
  scopeFilter?: EntityCondition[];
  /** `"*"` — все поля; объект — явная матрица (нет ключа = запрет). */
  fields: Record<string, FieldAccess> | "*";
};

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  all: "Все записи",
  own: "Только свои",
  filter: "По полям",
};

export const DATA_SCOPE_DESCRIPTIONS: Record<DataScope, string> = {
  all: "Все записи сущности",
  own: "Только записи, где вы создатель",
  filter: "Только записи, у которых поля совпадают с условиями",
};

export function isDataScope(value: string): value is DataScope {
  return value === "all" || value === "own" || value === "filter";
}

export type SettingsTabId =
  "menu" | "entities" | "automations" | "notifications" | "roles";

export type RolePermissions = {
  menuItemIds: string[] | "*";
  /**
   * When true, sidebar shows a flat list of menu items (no folders).
   * Matches the «Без папок» option in role settings.
   */
  menuFlat: boolean;
  settingsTabs: SettingsTabId[] | "*";
  canInviteUsers: boolean;
  canAccessHistory: boolean;
  canAccessAutomationTasks: boolean;
  /** Delete automation task instances from the tasks list / page. */
  canDeleteAutomationTasks: boolean;
  /**
   * Which automation tasks the role sees in the list / task page.
   * `own` — assigned to the current user; `filter` — linked record matches
   * `automationTasksScopeFilter` on `automationTasksScopeEntityId`.
   */
  automationTasksScope: DataScope;
  /** Entity for `automationTasksScope === "filter"`. */
  automationTasksScopeEntityId?: string;
  /** Record conditions when `automationTasksScope === "filter"`. */
  automationTasksScopeFilter?: EntityCondition[];
  canAccessNotifications: boolean;
  /**
   * «Вижу только» выбранные юрлица (multi-select).
   * Empty — без ограничения по юрлицу.
   * Non-empty — записи сущностей, связанных с Юрлицами, видны только
   * если пересекаются с этим списком. Новые юрлица появляются в пикере роли.
   */
  legalEntityIds: string[];
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
      menuFlat: false,
      settingsTabs: "*",
      canInviteUsers: true,
      canAccessHistory: true,
      canAccessAutomationTasks: true,
      canDeleteAutomationTasks: true,
      automationTasksScope: "all",
      canAccessNotifications: true,
      legalEntityIds: [],
      entities: "*",
    },
  };
}

export function createEmployeeRole(): Role {
  return {
    id: ROLE_EMPLOYEE_ID,
    name: "Сотрудник",
    description: "Доступ к данным без настроек системы",
    isSystem: false,
    permissions: {
      menuItemIds: "*",
      menuFlat: false,
      settingsTabs: [],
      canInviteUsers: false,
      canAccessHistory: true,
      canAccessAutomationTasks: true,
      canDeleteAutomationTasks: false,
      automationTasksScope: "own",
      canAccessNotifications: true,
      legalEntityIds: [],
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
