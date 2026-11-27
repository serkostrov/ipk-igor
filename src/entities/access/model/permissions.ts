import {
  AUTOMATION_TASKS_ITEM_ID,
  CHATS_ITEM_ID,
  FEED_ITEM_ID,
  HISTORY_ITEM_ID,
  NOTIFICATIONS_ITEM_ID,
  SETTINGS_ITEM_ID,
} from "@/entities/menu";
import {
  collectDepartmentScopeLinkIds,
  collectUserDepartmentIds,
  collectViewerDepartmentIds,
  findDepartmentsEntity,
  findLegalEntitiesEntity,
  findSystemUserByAuthId,
  getEntityConfig,
  getEntityValueContext,
  getSystemUsersEntity,
  getEntityRecordById,
  primeEntityRecordsByIds,
  matchesEntityConditions,
  recordMatchesDepartmentScope,
  recordMatchesLegalEntityScope,
  recordMatchesOwnScope,
  recordMatchesParentVisibility,
  type Entity,
  type EntityCondition,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  ROLE_ADMIN_ID,
  normalizeEntityAccess,
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
  // Only the system Administrator role bypasses entity ACL.
  // Full settings access (`settingsTabs: "*"`) must not grant delete/create/etc.
  return role.id === ROLE_ADMIN_ID;
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
      tabs: "*",
    };
  }
  const access =
    permissions.entities.find((item) => item.entityId === entityId) ?? null;
  return access ? normalizeEntityAccess(access) : null;
}

export function canEntity(
  role: Role | null | undefined,
  entityId: string,
  action: EntityAction,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access || !access.read) return false;
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

/**
 * Allowed юрлица for «вижу только». Empty — без ограничения.
 * Admin always unrestricted.
 */
export function roleLegalEntityIds(
  role: Role | null | undefined,
): readonly string[] {
  if (!role || isAdminRole(role)) return [];
  return role.permissions.legalEntityIds ?? [];
}

/** Whether a record is visible under the role's юрлицо restriction. */
export async function canViewRecordForLegalEntities(
  role: Role | null | undefined,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): Promise<boolean> {
  const allowed = roleLegalEntityIds(role);
  if (allowed.length === 0) return true;
  return recordMatchesLegalEntityScope(
    entity,
    record,
    allowed,
    findLegalEntitiesEntity(entities),
    entities,
  );
}

type RecordDataScopeOptions = {
  entities: readonly Entity[];
  authUserId: string | null;
  currentUserRecordId: string | null;
  valueContext?: EntityValueContext;
  /** Shared cycle guard for parent→child view inheritance. */
  parentVisit?: Set<string>;
  /** Computed once per list so each row does not rescan departments. */
  viewerDepartmentIds?: readonly string[];
  /**
   * List filters load linked rows first. Further misses stay local so a
   * catalog of thousands of rows cannot issue one request per record.
   */
  resolveMissing?: boolean;
};

/** Direct entity scope only (no parent inheritance). */
export async function matchesRecordDataScopeDirect(
  role: Role,
  entity: Entity,
  record: EntityRecord,
  options: RecordDataScopeOptions,
): Promise<boolean> {
  const scope = entityScope(role, entity.id);
  if (scope === "all") return true;

  if (scope === "own") {
    const ownFieldIds = getEntityAccess(
      role.permissions,
      entity.id,
    )?.ownFieldIds;
    return recordMatchesOwnScope(entity, record, {
      authUserId: options.authUserId,
      currentUserRecordId: options.currentUserRecordId,
      entities: options.entities,
      valueContext: options.valueContext,
      ...(ownFieldIds !== undefined ? { ownFieldIds } : {}),
    });
  }

  if (scope === "department") {
    const viewerDepartmentIds =
      options.viewerDepartmentIds ??
      collectViewerDepartmentIds(options.entities, {
        authUserId: options.authUserId,
        currentUserRecordId: options.currentUserRecordId,
      });
    return recordMatchesDepartmentScope(
      entity,
      record,
      viewerDepartmentIds,
      findDepartmentsEntity(options.entities),
      options.entities,
      {
        authUserId: options.authUserId,
        currentUserRecordId: options.currentUserRecordId,
        valueContext: options.valueContext,
        resolveMissing: options.resolveMissing,
      },
    );
  }

  if (scope === "filter") {
    const conditions = entityScopeFilter(role, entity.id) ?? [];
    if (conditions.length === 0 || !options.valueContext) return false;
    return matchesEntityConditions(
      options.valueContext,
      entity,
      record,
      conditions,
      null,
      {
        missingFieldFails: true,
        authUserId: options.authUserId,
      },
    );
  }

  return true;
}

/**
 * Whether a record is visible under entity data scope (all / own / department /
 * filter), or via a visible owning parent (project → task → subtask).
 * No read on the entity hides the record even when scope is «all» — that
 * scope must not open children through a catalog the role cannot read.
 */
export async function canViewRecordForDataScope(
  role: Role | null | undefined,
  entity: Entity,
  record: EntityRecord,
  options: RecordDataScopeOptions,
): Promise<boolean> {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  if (!canEntity(role, entity.id, "read")) return false;
  if (await matchesRecordDataScopeDirect(role, entity, record, options)) {
    return true;
  }

  const visiting = options.parentVisit ?? new Set<string>();
  return recordMatchesParentVisibility(
    entity,
    record,
    options.entities,
    (parentEntity, parentRecord) =>
      canViewRecordForDataScope(role, parentEntity, parentRecord, {
        ...options,
        parentVisit: visiting,
      }),
    0,
    visiting,
  );
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
  // Create forms write values via "edit" checks — allow when the role may
  // create even without update (create-only access).
  if (mode === "edit" && !access.update && !access.create) return false;
  if (mode === "view" && !access.read) return false;
  if (access.fields === "*") return true;
  const peers = Object.values(access.fields);
  const field = access.fields[fieldId];
  if (field) {
    if (!field.view) return false;
    return mode === "edit" ? field.edit : true;
  }
  // Create is on but the field matrix grants edit nowhere (stale «сбросить»
  // or only view flags) — treat like «Все поля» for writable checks on
  // missing ids so create dialogs are not empty. Explicit denials above win.
  if (
    mode === "edit" &&
    access.create &&
    peers.length > 0 &&
    !peers.some((item) => item.edit)
  ) {
    return true;
  }
  // Explicit matrix: missing id = deny (same as RoleEditor defaults).
  // New fields are backfilled on save as `{ view: true, edit: true }`.
  return false;
}

/**
 * Access to an entity tab (files folders, notes, …).
 * Legacy roles without `tabs` / `tabs: "*"` keep full tab access.
 * Explicit tab matrix: missing id = deny (safe for salary / tariff tabs).
 */
export function canTab(
  role: Role | null | undefined,
  entityId: string,
  tabId: string,
  mode: FieldAccessMode,
): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access) return false;
  if (mode === "edit" && !access.update && !access.create) return false;
  if (mode === "view" && !access.read) return false;
  const tabs = access.tabs;
  if (tabs == null || tabs === "*") return true;
  const tab = tabs[tabId];
  // Explicit matrix: unknown configurable tab stays hidden until granted.
  if (!tab) return false;
  return mode === "edit" ? tab.edit : tab.view;
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

/** Visibility scope for automation tasks list / task page. */
export function automationTasksScope(role: Role | null | undefined): DataScope {
  if (!role || isAdminRole(role)) return "all";
  return role.permissions.automationTasksScope ?? "all";
}

export function automationTasksScopeFilter(
  role: Role | null | undefined,
): { entityId: string; conditions: EntityCondition[] } | null {
  if (!role || isAdminRole(role)) return null;
  if (role.permissions.automationTasksScope !== "filter") return null;
  const entityId = role.permissions.automationTasksScopeEntityId?.trim() ?? "";
  if (!entityId) return null;
  return {
    entityId,
    conditions: role.permissions.automationTasksScopeFilter ?? [],
  };
}

type AutomationTaskVisibilityTarget = {
  assigneeUserId: string | null;
  entityId: string;
  recordId: string;
};

async function taskAssigneeInViewerDepartment(
  assigneeUserId: string | null,
  options: {
    authUserId: string | null;
    userRecordId: string | null;
    entities: Entity[];
  },
): Promise<boolean> {
  if (!assigneeUserId) return false;
  if (options.authUserId != null && assigneeUserId === options.authUserId) {
    return true;
  }
  if (options.userRecordId != null && assigneeUserId === options.userRecordId) {
    return true;
  }

  const departmentsEntity = findDepartmentsEntity(options.entities);
  const usersEntity = getSystemUsersEntity(options.entities);
  if (!departmentsEntity || !usersEntity) return false;

  const viewerDepartmentIds = new Set(
    collectViewerDepartmentIds(options.entities, {
      authUserId: options.authUserId,
      currentUserRecordId: options.userRecordId,
    }),
  );
  if (viewerDepartmentIds.size === 0) return false;

  const assignee =
    (await getEntityRecordById(usersEntity, assigneeUserId)) ??
    findSystemUserByAuthId(options.entities, assigneeUserId);
  if (!assignee) return false;

  return collectUserDepartmentIds(
    assignee,
    usersEntity,
    departmentsEntity,
    options.entities,
  ).some((id) => viewerDepartmentIds.has(id));
}

export async function taskMatchesAutomationScope(
  role: Role | null | undefined,
  task: AutomationTaskVisibilityTarget,
  options: {
    authUserId: string | null;
    userRecordId: string | null;
    entities: Entity[];
    valueContext: EntityValueContext;
  },
): Promise<boolean> {
  const scope = automationTasksScope(role);
  if (scope === "all") return true;

  if (scope === "own") {
    if (!task.assigneeUserId) return false;
    if (
      options.authUserId != null &&
      task.assigneeUserId === options.authUserId
    ) {
      return true;
    }
    if (
      options.userRecordId != null &&
      task.assigneeUserId === options.userRecordId
    ) {
      return true;
    }
    return false;
  }

  if (scope === "department") {
    if (
      await taskAssigneeInViewerDepartment(task.assigneeUserId, {
        authUserId: options.authUserId,
        userRecordId: options.userRecordId,
        entities: options.entities,
      })
    ) {
      return true;
    }
    const entity = options.entities.find((item) => item.id === task.entityId);
    const record = await getEntityRecordById(entity, task.recordId);
    if (!entity || !record) return false;
    const viewerDepartmentIds = collectViewerDepartmentIds(options.entities, {
      authUserId: options.authUserId,
      currentUserRecordId: options.userRecordId,
    });
    return recordMatchesDepartmentScope(
      entity,
      record,
      viewerDepartmentIds,
      findDepartmentsEntity(options.entities),
      options.entities,
      {
        authUserId: options.authUserId,
        currentUserRecordId: options.userRecordId,
        valueContext: options.valueContext,
      },
    );
  }

  const filter = automationTasksScopeFilter(role);
  if (!filter) return false;
  if (task.entityId !== filter.entityId) return false;
  if (filter.conditions.length === 0) return false;
  const entity = options.entities.find((item) => item.id === filter.entityId);
  if (!entity) return false;
  const record = await getEntityRecordById(entity, task.recordId);
  if (!record) return false;
  return matchesEntityConditions(
    options.valueContext,
    entity,
    record,
    filter.conditions,
    null,
    {
      missingFieldFails: true,
      authUserId: options.authUserId,
    },
  );
}

/** Whether the role may open / see this automation task instance. */
export async function canViewAutomationTask(
  role: Role | null | undefined,
  task: AutomationTaskVisibilityTarget,
  options: {
    authUserId: string | null;
    userRecordId: string | null;
    entities: Entity[];
    valueContext: EntityValueContext;
  },
): Promise<boolean> {
  if (!canAccessAutomationTasks(role)) return false;
  if (!(await taskMatchesAutomationScope(role, task, options))) return false;

  const entity = options.entities.find((item) => item.id === task.entityId);
  const record = await getEntityRecordById(entity, task.recordId);
  if (!entity || !record) return false;
  if (
    !(await canViewRecordForDataScope(role, entity, record, {
      entities: options.entities,
      authUserId: options.authUserId,
      currentUserRecordId: options.userRecordId,
      valueContext: options.valueContext,
    }))
  ) {
    return false;
  }
  return canViewRecordForLegalEntities(role, entity, record, options.entities);
}

/**
 * Explicit matrix entry for a tab, including hardcoded card tabs.
 * `null` — the role has not set this tab (caller may keep a legacy default).
 */
export function explicitTabView(
  role: Role | null | undefined,
  entityId: string,
  tabId: string,
): boolean | null {
  return explicitTabFlag(role, entityId, tabId, "view");
}

export function explicitTabEdit(
  role: Role | null | undefined,
  entityId: string,
  tabId: string,
): boolean | null {
  return explicitTabFlag(role, entityId, tabId, "edit");
}

function explicitTabFlag(
  role: Role | null | undefined,
  entityId: string,
  tabId: string,
  mode: FieldAccessMode,
): boolean | null {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const access = getEntityAccess(role.permissions, entityId);
  if (!access?.read) return false;
  const tabs = access.tabs;
  if (tabs == null || tabs === "*") return null;
  if (!Object.prototype.hasOwnProperty.call(tabs, tabId)) return null;
  const tab = tabs[tabId];
  if (!tab?.view) return false;
  return mode === "edit" ? tab.edit : true;
}

/**
 * Department scope reads the responsible user (and similar links) of every
 * row. Load those rows once, then match against memory.
 */
async function withDepartmentListOptions(
  role: Role | null | undefined,
  entity: Entity,
  records: readonly EntityRecord[],
  options: RecordDataScopeOptions,
): Promise<RecordDataScopeOptions> {
  if (!role || isAdminRole(role)) return options;
  if (entityScope(role, entity.id) !== "department") return options;

  let next = options;
  if (options.entities === getEntityConfig().entities) {
    const ids = collectDepartmentScopeLinkIds(
      entity,
      records,
      options.entities,
    );
    if (ids.length > 0) await primeEntityRecordsByIds(ids);
    const entities = getEntityConfig().entities;
    next = {
      ...options,
      entities,
      valueContext:
        entities === options.entities
          ? options.valueContext
          : getEntityValueContext(entities, options.currentUserRecordId),
      resolveMissing: false,
    };
  }

  if (next.viewerDepartmentIds) return next;
  return {
    ...next,
    viewerDepartmentIds: collectViewerDepartmentIds(next.entities, {
      authUserId: next.authUserId,
      currentUserRecordId: next.currentUserRecordId,
    }),
  };
}

/** Records the role may see (data scope, ownership parent, legal entities). */
export async function filterVisibleEntityRecords(
  role: Role | null | undefined,
  entity: Entity,
  records: readonly EntityRecord[],
  options: RecordDataScopeOptions,
): Promise<EntityRecord[]> {
  const scoped = await withDepartmentListOptions(
    role,
    entity,
    records,
    options,
  );
  const visible = await Promise.all(
    records.map(async (record) => {
      if (!(await canViewRecordForDataScope(role, entity, record, scoped))) {
        return false;
      }
      return canViewRecordForLegalEntities(
        role,
        entity,
        record,
        scoped.entities,
      );
    }),
  );
  return records.filter((_, index) => visible[index]);
}

export async function filterAutomationTasksForRole<
  T extends AutomationTaskVisibilityTarget,
>(
  role: Role | null | undefined,
  tasks: T[],
  options: {
    authUserId: string | null;
    userRecordId: string | null;
    entities: Entity[];
    valueContext: EntityValueContext;
  },
): Promise<T[]> {
  if (!canAccessAutomationTasks(role)) return [];
  const visible = await Promise.all(
    tasks.map((task) => canViewAutomationTask(role, task, options)),
  );
  return tasks.filter((_, index) => visible[index]);
}

export function canAccessNotifications(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessNotifications;
}

export function canAccessMessenger(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessMessenger;
}

export function canAccessNewsFeed(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canAccessNewsFeed;
}

export function canCreateNewsPosts(role: Role | null | undefined): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return role.permissions.canCreateNewsPosts;
}

/**
 * Separate switch for a built-in page (лента, история, настройки, …).
 * `null` — the menu item has no switch of its own.
 */
export function systemMenuItemAllowed(
  role: Role | null | undefined,
  menuItemId: string,
): boolean | null {
  if (!role) return null;
  switch (menuItemId) {
    case SETTINGS_ITEM_ID:
      return canAccessSettings(role);
    case HISTORY_ITEM_ID:
      return canAccessHistory(role);
    case AUTOMATION_TASKS_ITEM_ID:
      return canAccessAutomationTasks(role);
    case NOTIFICATIONS_ITEM_ID:
      return canAccessNotifications(role);
    case CHATS_ITEM_ID:
      return canAccessMessenger(role);
    case FEED_ITEM_ID:
      return canAccessNewsFeed(role);
    default:
      return null;
  }
}

/** Whether a sidebar / app menu item id is visible for the role. */
export function canMenuItem(
  role: Role | null | undefined,
  menuItemId: string,
  entityIdForItem?: string | null,
): boolean {
  if (!role) return false;

  // The menu checklist is the visibility switch for every item, including
  // built-in pages. Their extra switches (лента, история, …) stay an
  // additional off-gate and no longer keep a removed item on screen.
  const allowed = role.permissions.menuItemIds;
  if (allowed !== "*" && !allowed.includes(menuItemId)) return false;
  if (systemMenuItemAllowed(role, menuItemId) === false) return false;

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

/** Sidebar without folders for this role («Без папок» in role settings). */
export function roleMenuFlat(role: Role | null | undefined): boolean {
  if (!role) return false;
  return role.permissions.menuFlat === true;
}
