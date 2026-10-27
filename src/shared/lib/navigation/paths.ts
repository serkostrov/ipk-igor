/**
 * App location model and URL helpers.
 * System menu ids / prefixes must stay in sync with `@/entities/menu`.
 */
const SETTINGS_ID = "settings";
const HISTORY_ID = "history";
const TASKS_ID = "automation-tasks";
const NOTIFICATIONS_ID = "notifications";
const OPIU_ID = "opiu";
const FINANCE_DASHBOARDS_ID = "finance-dashboards";
const ENTITY_PREFIX = "entity-";

/** Settings page tabs (kept here so shared routing does not import access). */
export const SETTINGS_PATH_TABS = [
  "menu",
  "entities",
  "automations",
  "notifications",
  "roles",
] as const;

export type SettingsPathTab = (typeof SETTINGS_PATH_TABS)[number];

export function isSettingsPathTab(value: string): value is SettingsPathTab {
  return (SETTINGS_PATH_TABS as readonly string[]).includes(value);
}

export type EntityBrowsePathView = "table" | "kanban" | "timeline";

export function isEntityBrowsePathView(
  value: string,
): value is EntityBrowsePathView {
  return value === "table" || value === "kanban" || value === "timeline";
}

export type AppLocation =
  | {
      type: "settings";
      tab?: SettingsPathTab;
      /** Selected entity while on the «Сущности» settings tab. */
      entityId?: string;
      /** Entity schema / record tab id. */
      entityTabId?: string;
    }
  | { type: "history" }
  | { type: "tasks" }
  | { type: "task"; taskId: string }
  | { type: "notifications" }
  | { type: "opiu" }
  | { type: "finance-dashboards" }
  | { type: "entity"; entityId: string; view?: EntityBrowsePathView }
  | { type: "record"; entityId: string; recordId: string; tabId?: string };

/** One-shot signals carried via `location.state` (not part of the URL). */
export type AppLocationState = {
  /** Open internal-entity edit dialog for this record id. */
  editRecordId?: string;
};

export function toPath(location: AppLocation): string {
  switch (location.type) {
    case "settings": {
      if (!location.tab) return "/settings";
      if (location.tab !== "entities" || !location.entityId) {
        return `/settings/${location.tab}`;
      }
      const base = `/settings/entities/${encodeURIComponent(location.entityId)}`;
      return location.entityTabId
        ? `${base}/t/${encodeURIComponent(location.entityTabId)}`
        : base;
    }
    case "history":
      return "/history";
    case "tasks":
      return "/tasks";
    case "task":
      return `/tasks/${encodeURIComponent(location.taskId)}`;
    case "notifications":
      return "/notifications";
    case "opiu":
      return "/opiu";
    case "finance-dashboards":
      return "/finance-dashboards";
    case "entity": {
      const base = `/e/${encodeURIComponent(location.entityId)}`;
      return location.view
        ? `${base}/v/${encodeURIComponent(location.view)}`
        : base;
    }
    case "record": {
      const base = `/e/${encodeURIComponent(location.entityId)}/r/${encodeURIComponent(location.recordId)}`;
      return location.tabId
        ? `${base}/t/${encodeURIComponent(location.tabId)}`
        : base;
    }
  }
}

/**
 * Parse a pathname into an AppLocation.
 * Returns null for unknown paths (caller should redirect).
 */
export function parsePath(pathname: string): AppLocation | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/settings") return { type: "settings" };
  if (path === "/history") return { type: "history" };
  if (path === "/tasks") return { type: "tasks" };
  if (path === "/notifications") return { type: "notifications" };
  if (path === "/opiu") return { type: "opiu" };
  if (path === "/finance-dashboards") return { type: "finance-dashboards" };

  const taskPath = /^\/tasks\/([^/]+)$/.exec(path);
  if (taskPath) {
    return { type: "task", taskId: decodeURIComponent(taskPath[1]!) };
  }

  const settingsEntityTab = /^\/settings\/entities\/([^/]+)\/t\/([^/]+)$/.exec(
    path,
  );
  if (settingsEntityTab) {
    return {
      type: "settings",
      tab: "entities",
      entityId: decodeURIComponent(settingsEntityTab[1]!),
      entityTabId: decodeURIComponent(settingsEntityTab[2]!),
    };
  }

  const settingsEntity = /^\/settings\/entities\/([^/]+)$/.exec(path);
  if (settingsEntity) {
    return {
      type: "settings",
      tab: "entities",
      entityId: decodeURIComponent(settingsEntity[1]!),
    };
  }

  const settingsTab = /^\/settings\/([^/]+)$/.exec(path);
  if (settingsTab && isSettingsPathTab(settingsTab[1]!)) {
    return { type: "settings", tab: settingsTab[1] };
  }

  const entityRecordTab = /^\/e\/([^/]+)\/r\/([^/]+)\/t\/([^/]+)$/.exec(path);
  if (entityRecordTab) {
    return {
      type: "record",
      entityId: decodeURIComponent(entityRecordTab[1]!),
      recordId: decodeURIComponent(entityRecordTab[2]!),
      tabId: decodeURIComponent(entityRecordTab[3]!),
    };
  }

  const entityRecord = /^\/e\/([^/]+)\/r\/([^/]+)$/.exec(path);
  if (entityRecord) {
    return {
      type: "record",
      entityId: decodeURIComponent(entityRecord[1]!),
      recordId: decodeURIComponent(entityRecord[2]!),
    };
  }

  const entityView = /^\/e\/([^/]+)\/v\/([^/]+)$/.exec(path);
  if (entityView && isEntityBrowsePathView(entityView[2]!)) {
    return {
      type: "entity",
      entityId: decodeURIComponent(entityView[1]!),
      view: entityView[2],
    };
  }

  const entityList = /^\/e\/([^/]+)$/.exec(path);
  if (entityList) {
    return {
      type: "entity",
      entityId: decodeURIComponent(entityList[1]!),
    };
  }

  return null;
}

/** Menu item id used by the sidebar for highlighting. */
export function locationToMenuId(location: AppLocation): string {
  switch (location.type) {
    case "settings":
      return SETTINGS_ID;
    case "history":
      return HISTORY_ID;
    case "tasks":
    case "task":
      return TASKS_ID;
    case "notifications":
      return NOTIFICATIONS_ID;
    case "opiu":
      return OPIU_ID;
    case "finance-dashboards":
      return FINANCE_DASHBOARDS_ID;
    case "entity":
    case "record":
      return location.entityId;
  }
}

/** Map a sidebar / menu item id to an AppLocation (list-level, never a record). */
export function menuIdToLocation(menuId: string): AppLocation {
  if (menuId === SETTINGS_ID) return { type: "settings" };
  if (menuId === HISTORY_ID) return { type: "history" };
  if (menuId === TASKS_ID) return { type: "tasks" };
  if (menuId === NOTIFICATIONS_ID) return { type: "notifications" };
  if (menuId === OPIU_ID) return { type: "opiu" };
  if (menuId === FINANCE_DASHBOARDS_ID) return { type: "finance-dashboards" };
  if (menuId.startsWith(ENTITY_PREFIX)) {
    return { type: "entity", entityId: menuId };
  }
  // Unknown custom menu items — fall back to settings.
  return { type: "settings" };
}

export function settingsLocation(options?: {
  tab?: SettingsPathTab;
  entityId?: string;
  entityTabId?: string;
}): AppLocation {
  const tab = options?.tab;
  if (tab === "entities" && options?.entityId) {
    return {
      type: "settings",
      tab: "entities",
      entityId: options.entityId,
      ...(options.entityTabId ? { entityTabId: options.entityTabId } : {}),
    };
  }
  return {
    type: "settings",
    ...(tab ? { tab } : {}),
  };
}

export function entityListLocation(
  entityId: string,
  view?: EntityBrowsePathView,
): AppLocation {
  return view
    ? { type: "entity", entityId, view }
    : { type: "entity", entityId };
}

export function recordLocation(
  entityId: string,
  recordId: string,
  tabId?: string,
): AppLocation {
  return tabId
    ? { type: "record", entityId, recordId, tabId }
    : { type: "record", entityId, recordId };
}

export function taskLocation(taskId: string): AppLocation {
  return { type: "task", taskId };
}

export function locationsEqual(a: AppLocation, b: AppLocation): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "settings": {
      const other = b as typeof a;
      return (
        (a.tab ?? null) === (other.tab ?? null) &&
        (a.entityId ?? null) === (other.entityId ?? null) &&
        (a.entityTabId ?? null) === (other.entityTabId ?? null)
      );
    }
    case "history":
    case "tasks":
    case "notifications":
    case "opiu":
    case "finance-dashboards":
      return true;
    case "task": {
      const other = b as typeof a;
      return a.taskId === other.taskId;
    }
    case "entity": {
      const other = b as typeof a;
      return (
        a.entityId === other.entityId &&
        (a.view ?? null) === (other.view ?? null)
      );
    }
    case "record": {
      const other = b as typeof a;
      return (
        a.entityId === other.entityId &&
        a.recordId === other.recordId &&
        (a.tabId ?? null) === (other.tabId ?? null)
      );
    }
  }
}
