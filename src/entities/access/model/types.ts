import type { EntityCondition } from "@/entities/entity";

/** Record visibility for a role on an entity. */
export type DataScope = "all" | "own" | "department" | "filter";

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
  /**
   * Access to entity tabs (files folders, notes, …).
   * `"*"` — все вкладки; объект — явная матрица (нет ключа = запрет).
   * `undefined` — как `"*"` (совместимость со старыми ролями).
   */
  tabs?: Record<string, FieldAccess> | "*";
};

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  all: "Все записи",
  own: "Только свои",
  department: "Своего отдела",
  filter: "По полям",
};

export const DATA_SCOPE_DESCRIPTIONS: Record<DataScope, string> = {
  all: "Все записи сущности",
  own: "Записи, где вы создатель или указаны в карточке (исполнитель, наблюдатель и т.п.)",
  department: "Записи своего отдела: по полю «Отдел», коллегам отдела и своим",
  filter: "Только записи, у которых поля совпадают с условиями",
};

export function isDataScope(value: string): value is DataScope {
  return (
    value === "all" ||
    value === "own" ||
    value === "department" ||
    value === "filter"
  );
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
   * `own` — assigned to the current user;
   * `department` — assignee or linked record in the viewer’s department;
   * `filter` — linked record matches `automationTasksScopeFilter`
   * on `automationTasksScopeEntityId`.
   */
  automationTasksScope: DataScope;
  /** Entity for `automationTasksScope === "filter"`. */
  automationTasksScopeEntityId?: string;
  /** Record conditions when `automationTasksScope === "filter"`. */
  automationTasksScopeFilter?: EntityCondition[];
  canAccessNotifications: boolean;
  /** Internal messenger («Чаты»). Default true for all roles. */
  canAccessMessenger: boolean;
  /** System page «Лента». Default true for all roles. */
  canAccessNewsFeed: boolean;
  /** Create / publish posts in «Лента». Default false (admin true). */
  canCreateNewsPosts: boolean;
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
      canAccessMessenger: true,
      canAccessNewsFeed: true,
      canCreateNewsPosts: true,
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
      canAccessMessenger: true,
      canAccessNewsFeed: true,
      canCreateNewsPosts: false,
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
    tabs: {},
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
    tabs: "*",
  };
}

/**
 * Entity CRUD without a field map used to leave `fields: {}`, which made
 * `canField` deny every field — empty create/edit forms (often on «ГИП»).
 * Empty map + any CRUD means «all fields», same as `"*"`.
 * Field ids missing from a non-empty map (new fields after the role was
 * saved) inherit from peers in `canField` — explicit denials must list
 * each field as `{ view: false, edit: false }`.
 * No read ⇒ no create/update/delete (visibility is the master switch).
 */
export function normalizeEntityAccess(access: EntityAccess): EntityAccess {
  const next =
    !access.read && (access.create || access.update || access.delete)
      ? {
          ...access,
          create: false,
          update: false,
          delete: false,
        }
      : access;
  if (next.fields === "*") return next;
  const hasFieldEntries = Object.keys(next.fields).length > 0;
  if (hasFieldEntries) return next;
  if (!(next.create || next.read || next.update || next.delete)) {
    return next;
  }
  return { ...next, fields: "*" };
}
