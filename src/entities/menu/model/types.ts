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
  /**
   * Nested entries — the item acts as a navigable folder (entity-as-group).
   * Omitted when empty.
   */
  entries?: MenuEntry[];
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

/**
 * Location of any menu entry: root list or inside a container.
 * `parentGroupId` is the parent container id — a group or an item with nested
 * entries (entity-as-folder).
 */
export type MenuEntryLocation =
  | { parentGroupId: null; index: number }
  | { parentGroupId: string; index: number };

/** Child list of a group or of an item that nests entries. */
export function getMenuEntryChildren(entry: MenuEntry): MenuEntry[] {
  if (entry.type === "group") return entry.entries;
  return entry.entries ?? [];
}

/** True when the entry can hold nested entries (group or item folder). */
export function isMenuContainer(entry: MenuEntry): boolean {
  return entry.type === "group" || (entry.entries?.length ?? 0) > 0;
}

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
      if (entry.entries?.length) collectEntityLinkedIds(entry.entries, ids);
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

function withFilteredItemEntries(
  entry: MenuItemEntry,
  children: MenuEntry[],
): MenuItemEntry {
  if (children.length === 0) {
    if (!entry.entries?.length) return entry;
    return {
      type: "item",
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
    };
  }
  return entry.entries === children ? entry : { ...entry, entries: children };
}

/**
 * Menu for the sidebar: drop hidden items and groups that become empty.
 * Used to keep internal (service) entities in the stored menu for grouping
 * without showing them in navigation — their nested entries are promoted.
 */
export function filterVisibleMenuEntries(
  entries: MenuEntry[],
  isHiddenItem: (itemId: string) => boolean,
): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      const children = entry.entries?.length
        ? filterVisibleMenuEntries(entry.entries, isHiddenItem)
        : [];
      if (isHiddenItem(entry.id)) {
        result.push(...children);
        continue;
      }
      result.push(withFilteredItemEntries(entry, children));
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
 * Root entity items = project scope; nested under a group or entity = belong
 * to that container.
 */
export type MenuEntityTreeNode =
  | {
      type: "entity";
      entityId: string;
      children: MenuEntityTreeNode[];
    }
  | {
      type: "group";
      id: string;
      title: string;
      icon: MenuIconName;
      children: MenuEntityTreeNode[];
    };

/**
 * Build an entity picker tree from the menu in sidebar order.
 * Non-entity items are skipped (their nested entities are promoted); empty
 * groups are omitted.
 */
export function getMenuEntityTree(entries: MenuEntry[]): MenuEntityTreeNode[] {
  const nodes: MenuEntityTreeNode[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      const nested = entry.entries?.length
        ? getMenuEntityTree(entry.entries)
        : [];
      if (isEntityLinkedMenuItem(entry.id)) {
        nodes.push({
          type: "entity",
          entityId: entry.id,
          children: nested,
        });
      } else {
        nodes.push(...nested);
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

/** Walk all groups depth-first (root and nested, including under item folders). */
export function walkMenuGroups(
  entries: MenuEntry[],
  visit: (group: MenuGroupEntry, parentGroupId: string | null) => void,
  parentGroupId: string | null = null,
) {
  for (const entry of entries) {
    if (entry.type === "group") {
      visit(entry, parentGroupId);
      walkMenuGroups(entry.entries, visit, entry.id);
      continue;
    }
    if (entry.entries?.length) {
      walkMenuGroups(entry.entries, visit, entry.id);
    }
  }
}

/** True if `candidateId` is `ancestorId` or nested inside its subtree. */
export function isMenuEntryDescendant(
  entries: MenuEntry[],
  ancestorId: string,
  candidateId: string,
): boolean {
  if (ancestorId === candidateId) return true;
  for (const entry of entries) {
    if (entry.id === ancestorId) {
      return containsMenuEntry(getMenuEntryChildren(entry), candidateId);
    }
    const children = getMenuEntryChildren(entry);
    if (
      children.length > 0 &&
      isMenuEntryDescendant(children, ancestorId, candidateId)
    ) {
      return true;
    }
  }
  return false;
}

/** @deprecated Prefer `isMenuEntryDescendant` (also covers item folders). */
export function isMenuGroupDescendant(
  entries: MenuEntry[],
  groupId: string,
  candidateId: string,
): boolean {
  return isMenuEntryDescendant(entries, groupId, candidateId);
}

function containsMenuEntry(entries: MenuEntry[], entryId: string): boolean {
  for (const entry of entries) {
    if (entry.id === entryId) return true;
    if (containsMenuEntry(getMenuEntryChildren(entry), entryId)) return true;
  }
  return false;
}

/** Collect descendant menu items under a subtree (for collapsed sidebar). */
export function flattenMenuSubtreeItems(entries: MenuEntry[]): MenuItem[] {
  const items: MenuItem[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      items.push({ id: entry.id, label: entry.label, icon: entry.icon });
      if (entry.entries?.length) {
        items.push(...flattenMenuSubtreeItems(entry.entries));
      }
      continue;
    }
    items.push(...flattenMenuSubtreeItems(entry.entries));
  }
  return items;
}

/** Collect leaf menu items under a group tree (for collapsed sidebar). */
export function flattenMenuGroupItems(group: MenuGroupEntry): MenuItem[] {
  return flattenMenuSubtreeItems(group.entries);
}

/** Flatten a menu tree to items (DFS); nested item folders are expanded. */
export function flattenMenuEntriesToItems(
  entries: MenuEntry[],
): MenuItemEntry[] {
  const items: MenuItemEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      items.push({
        type: "item",
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
      });
      if (entry.entries?.length) {
        items.push(...flattenMenuEntriesToItems(entry.entries));
      }
      continue;
    }
    items.push(...flattenMenuEntriesToItems(entry.entries));
  }
  return items;
}

export function menuEntriesHaveProtectedItems(entries: MenuEntry[]): boolean {
  for (const entry of entries) {
    if (entry.type === "item") {
      if (isProtectedMenuItem(entry.id)) return true;
      if (
        entry.entries?.length &&
        menuEntriesHaveProtectedItems(entry.entries)
      ) {
        return true;
      }
      continue;
    }
    if (menuEntriesHaveProtectedItems(entry.entries)) return true;
  }
  return false;
}

export function groupHasProtectedItems(group: MenuGroupEntry): boolean {
  return menuEntriesHaveProtectedItems(group.entries);
}

/** True if the item folder has nested protected entries (cannot delete). */
export function itemHasProtectedChildren(item: MenuItemEntry): boolean {
  return Boolean(
    item.entries?.length && menuEntriesHaveProtectedItems(item.entries),
  );
}

/** Parent picker options: groups and items (entity-as-folder targets). */
export type MenuParentOption = {
  id: string;
  label: string;
  kind: "group" | "item";
  depth: number;
};

/**
 * Flat list of containers suitable as a parent for a menu entry.
 * Pass `excludeSubtreeOf` when editing an item so it cannot nest under itself.
 */
export function getMenuParentOptions(
  entries: MenuEntry[],
  excludeSubtreeOf: string | null = null,
): MenuParentOption[] {
  const options: MenuParentOption[] = [];

  function walk(list: MenuEntry[], depth: number) {
    for (const entry of list) {
      if (excludeSubtreeOf != null && entry.id === excludeSubtreeOf) continue;
      if (entry.type === "group") {
        options.push({
          id: entry.id,
          label: entry.title.trim() || "Без названия",
          kind: "group",
          depth,
        });
        walk(entry.entries, depth + 1);
        continue;
      }
      options.push({
        id: entry.id,
        label: entry.label.trim() || "Без названия",
        kind: "item",
        depth,
      });
      if (entry.entries?.length) walk(entry.entries, depth + 1);
    }
  }

  walk(entries, 0);
  return options;
}
