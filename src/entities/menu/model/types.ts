export type MenuIconName =
  | "circle-help"
  | "settings"
  | "home"
  | "users"
  | "folder"
  | "file-text"
  | "calendar"
  | "chart"
  | "mail"
  | "bell"
  | "search"
  | "wrench"
  | "drafting-compass"
  | "life-buoy"
  | "banknote"
  | "hand-coins"
  | "building"
  | "briefcase"
  | "clipboard"
  | "database"
  | "globe"
  | "layout"
  | "map"
  | "phone"
  | "star"
  | "bookmark"
  | "layers"
  | "package"
  | "shield"
  | "activity"
  | "archive"
  | "award"
  | "book-open"
  | "box"
  | "boxes"
  | "calculator"
  | "camera"
  | "car"
  | "check-circle"
  | "clock"
  | "cloud"
  | "code"
  | "contact"
  | "credit-card"
  | "download"
  | "eye"
  | "factory"
  | "filter"
  | "flag"
  | "gift"
  | "graduation-cap"
  | "handshake"
  | "hash"
  | "headphones"
  | "heart"
  | "image"
  | "inbox"
  | "kanban"
  | "key"
  | "landmark"
  | "lightbulb"
  | "link"
  | "list"
  | "lock"
  | "megaphone"
  | "message-circle"
  | "newspaper"
  | "notebook"
  | "palette"
  | "pen-line"
  | "percent"
  | "pie-chart"
  | "pin"
  | "printer"
  | "puzzle"
  | "receipt"
  | "rocket"
  | "send"
  | "shopping-cart"
  | "store"
  | "table"
  | "tag"
  | "target"
  | "tickets"
  | "timer"
  | "trophy"
  | "truck"
  | "upload"
  | "user-circle"
  | "wallet"
  | "wifi"
  | "zap";

export type MenuItem = {
  id: string;
  label: string;
  icon: MenuIconName;
};

export type MenuGroup = {
  id: string;
  title: string;
  icon: MenuIconName;
  /**
   * Service group — kept in menu settings for organization, hidden from the
   * sidebar (same idea as internal entities).
   */
  internal?: boolean;
  /** Nested menu entries (items and subgroups). */
  entries: MenuEntry[];
};

export type MenuGroupEntry = { type: "group" } & MenuGroup;

export type MenuItemEntry = { type: "item" } & MenuItem;

export type MenuEntry = MenuGroupEntry | MenuItemEntry;

export type MenuConfig = {
  entries: MenuEntry[];
};

/** Location of any menu entry: root list or inside a group. */
export type MenuEntryLocation =
  | { parentGroupId: null; index: number }
  | { parentGroupId: string; index: number };

/**
 * Location of a menu item (legacy shape kept for call sites).
 * Prefer `MenuEntryLocation` for new code.
 */
export type MenuItemLocation =
  | { scope: "root"; entryIndex: number }
  | { scope: "group"; groupId: string; itemIndex: number };

export function toMenuEntryLocation(
  location: MenuItemLocation,
): MenuEntryLocation {
  if (location.scope === "root") {
    return { parentGroupId: null, index: location.entryIndex };
  }
  return { parentGroupId: location.groupId, index: location.itemIndex };
}

export function toMenuItemLocation(
  location: MenuEntryLocation,
): MenuItemLocation {
  if (location.parentGroupId == null) {
    return { scope: "root", entryIndex: location.index };
  }
  return {
    scope: "group",
    groupId: location.parentGroupId,
    itemIndex: location.index,
  };
}

export const SETTINGS_ITEM_ID = "settings";

/** System page «История изменений». */
export const HISTORY_ITEM_ID = "history";

/** System page «Задачи автоматизаций». */
export const AUTOMATION_TASKS_ITEM_ID = "automation-tasks";

/** System page «Уведомления». */
export const NOTIFICATIONS_ITEM_ID = "notifications";

/** Default icon for a menu item (пункт). */
export const DEFAULT_MENU_ITEM_ICON: MenuIconName = "circle-help";

/** Default icon for a menu group (папка). */
export const DEFAULT_MENU_GROUP_ICON: MenuIconName = "folder";

/** Menu items created from entities use this id prefix (`entity-<uuid>`). */
export const ENTITY_MENU_ITEM_PREFIX = "entity-";

export function isEntityLinkedMenuItem(id: string) {
  return id.startsWith(ENTITY_MENU_ITEM_PREFIX);
}

function collectEntityLinkedIds(entries: MenuEntry[], ids: string[]) {
  for (const entry of entries) {
    if (entry.type === "item") {
      if (isEntityLinkedMenuItem(entry.id)) ids.push(entry.id);
      continue;
    }
    collectEntityLinkedIds(entry.entries, ids);
  }
}

/** Entity-linked item ids in sidebar order (groups expanded in place). */
export function getEntityLinkedMenuItemIds(config: MenuConfig): string[] {
  const ids: string[] = [];
  collectEntityLinkedIds(config.entries, ids);
  return ids;
}

/**
 * Menu for the sidebar: drop hidden items and groups that become empty.
 * Used to keep internal (service) entities in the stored menu for grouping
 * without showing them in navigation.
 */
export function filterVisibleMenuEntries(
  entries: MenuEntry[],
  isHiddenItem: (itemId: string) => boolean,
): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      if (isHiddenItem(entry.id)) continue;
      result.push(entry);
      continue;
    }
    if (entry.internal) continue;
    const children = filterVisibleMenuEntries(entry.entries, isHiddenItem);
    if (children.length === 0) continue;
    result.push(
      entry.entries === children ? entry : { ...entry, entries: children },
    );
  }
  return result;
}

/**
 * Entity picker tree mirroring menu order (DFS).
 * Root entity items = project scope; nested under a group = belong to that group.
 */
export type MenuEntityTreeNode =
  | { type: "entity"; entityId: string }
  | {
      type: "group";
      id: string;
      title: string;
      icon: MenuIconName;
      children: MenuEntityTreeNode[];
    };

/**
 * Build an entity picker tree from the menu in sidebar order.
 * Non-entity items are skipped; empty groups are omitted.
 */
export function getMenuEntityTree(entries: MenuEntry[]): MenuEntityTreeNode[] {
  const nodes: MenuEntityTreeNode[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      if (isEntityLinkedMenuItem(entry.id)) {
        nodes.push({ type: "entity", entityId: entry.id });
      }
      continue;
    }
    const children = getMenuEntityTree(entry.entries);
    if (children.length === 0) continue;
    nodes.push({
      type: "group",
      id: entry.id,
      title: entry.title,
      icon: entry.icon,
      children,
    });
  }
  return nodes;
}

/**
 * Menu id of the system Users entity (`entity-system-users`).
 * Keep in sync with `SYSTEM_USERS_ENTITY_ID` in entities/entity.
 */
export const SYSTEM_USERS_MENU_ITEM_ID = "entity-system-users";

/** Built-in system pages that cannot be removed from the menu. */
export function isSystemMenuItem(id: string) {
  return (
    id === SETTINGS_ITEM_ID ||
    id === HISTORY_ITEM_ID ||
    id === AUTOMATION_TASKS_ITEM_ID ||
    id === NOTIFICATIONS_ITEM_ID ||
    id === SYSTEM_USERS_MENU_ITEM_ID
  );
}

/** System and entity-linked items — protected from removal. */
export function isProtectedMenuItem(id: string) {
  return isSystemMenuItem(id) || isEntityLinkedMenuItem(id);
}

/** Walk all groups depth-first (root and nested). */
export function walkMenuGroups(
  entries: MenuEntry[],
  visit: (group: MenuGroupEntry, parentGroupId: string | null) => void,
  parentGroupId: string | null = null,
) {
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    visit(entry, parentGroupId);
    walkMenuGroups(entry.entries, visit, entry.id);
  }
}

/** True if `candidateId` is `groupId` or nested inside it. */
export function isMenuGroupDescendant(
  entries: MenuEntry[],
  groupId: string,
  candidateId: string,
): boolean {
  if (groupId === candidateId) return true;
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    if (entry.id === groupId) {
      return containsMenuGroup(entry.entries, candidateId);
    }
    if (isMenuGroupDescendant(entry.entries, groupId, candidateId)) {
      return true;
    }
  }
  return false;
}

function containsMenuGroup(entries: MenuEntry[], groupId: string): boolean {
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    if (entry.id === groupId) return true;
    if (containsMenuGroup(entry.entries, groupId)) return true;
  }
  return false;
}

/** Collect leaf menu items under a group tree (for collapsed sidebar). */
export function flattenMenuGroupItems(group: MenuGroupEntry): MenuItem[] {
  const items: MenuItem[] = [];
  for (const entry of group.entries) {
    if (entry.type === "item") {
      items.push({ id: entry.id, label: entry.label, icon: entry.icon });
      continue;
    }
    items.push(...flattenMenuGroupItems(entry));
  }
  return items;
}

/** Flatten a menu tree to leaf items (DFS), keeping item entries as-is. */
export function flattenMenuEntriesToItems(entries: MenuEntry[]): MenuItemEntry[] {
  const items: MenuItemEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      items.push(entry);
      continue;
    }
    items.push(...flattenMenuEntriesToItems(entry.entries));
  }
  return items;
}

export function groupHasProtectedItems(group: MenuGroupEntry): boolean {
  for (const entry of group.entries) {
    if (entry.type === "item" && isProtectedMenuItem(entry.id)) return true;
    if (entry.type === "group" && groupHasProtectedItems(entry)) return true;
  }
  return false;
}
