import { fetchMenuConfig, saveMenuConfig } from "../api/menu-config-api";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import { withTimeout } from "@/shared/lib/with-timeout";
import type {
  MenuConfig,
  MenuEntry,
  MenuEntryLocation,
  MenuGroup,
  MenuGroupEntry,
  MenuIconName,
  MenuItem,
  MenuItemLocation,
} from "../model/types";
import {
  DEFAULT_MENU_GROUP_ICON,
  DEFAULT_MENU_ITEM_ICON,
  groupHasProtectedItems,
  isEntityLinkedMenuItem,
  isMenuGroupDescendant,
  isProtectedMenuItem,
  toMenuEntryLocation,
} from "../model/types";
import {
  cloneDefaultMenuConfig,
  ensureSystemMenuItems,
  normalizeGroupEntry,
  normalizeItemEntry,
  stripLegacyReportMenuEntries,
} from "../lib/parse-menu-config";

export type MenuStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let config: MenuConfig = { entries: [] };
let status: MenuStatus = "loading";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: MenuStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist(next: MenuConfig) {
  const stripped = stripLegacyReportMenuEntries(next);
  config = ensureSystemMenuItems(stripped.config);
  notify();

  if (!isSupabaseConfigured) return;

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void saveMenuConfig(config).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить меню";
      console.error("[menu] save failed", error);
      setStatus("error", message);
    });
  }, 400);
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function cloneEntries(entries: MenuEntry[]): MenuEntry[] {
  return entries.map((entry) =>
    entry.type === "group"
      ? { ...entry, entries: cloneEntries(entry.entries) }
      : { ...entry },
  );
}

function locationsEqual(a: MenuEntryLocation, b: MenuEntryLocation) {
  return a.parentGroupId === b.parentGroupId && a.index === b.index;
}

function findGroupEntry(
  entries: MenuEntry[],
  groupId: string,
): MenuGroupEntry | null {
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    if (entry.id === groupId) return entry;
    const nested = findGroupEntry(entry.entries, groupId);
    if (nested) return nested;
  }
  return null;
}

function getListAt(
  entries: MenuEntry[],
  parentGroupId: string | null,
): MenuEntry[] | null {
  if (parentGroupId == null) return entries;
  return findGroupEntry(entries, parentGroupId)?.entries ?? null;
}

function findItem(
  itemId: string,
  entries: MenuEntry[] = config.entries,
  parentGroupId: string | null = null,
): { item: MenuItem; location: MenuEntryLocation } | null {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.type === "item" && entry.id === itemId) {
      return {
        item: { id: entry.id, label: entry.label, icon: entry.icon },
        location: { parentGroupId, index },
      };
    }
    if (entry.type === "group") {
      const nested = findItem(itemId, entry.entries, entry.id);
      if (nested) return nested;
    }
  }
  return null;
}

function findEntryLocation(
  entryId: string,
  entries: MenuEntry[] = config.entries,
  parentGroupId: string | null = null,
): MenuEntryLocation | null {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.id === entryId) {
      return { parentGroupId, index };
    }
    if (entry.type === "group") {
      const nested = findEntryLocation(entryId, entry.entries, entry.id);
      if (nested) return nested;
    }
  }
  return null;
}

function syncEntries(
  entries: MenuEntry[],
  pending: Map<string, string>,
  isManaged: (itemId: string) => boolean,
): { entries: MenuEntry[]; changed: boolean } {
  let changed = false;
  const nextEntries: MenuEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "item") {
      if (isManaged(entry.id) && !pending.has(entry.id)) {
        changed = true;
        continue;
      }

      const nextLabel = pending.get(entry.id);
      if (nextLabel !== undefined) {
        pending.delete(entry.id);
        nextEntries.push(entry);
        continue;
      }

      nextEntries.push(entry);
      continue;
    }

    const nested = syncEntries(entry.entries, pending, isManaged);
    if (nested.changed) {
      changed = true;
      nextEntries.push(
        normalizeGroupEntry({ ...entry, entries: nested.entries }),
      );
    } else {
      nextEntries.push(entry);
    }
  }

  return { entries: nextEntries, changed };
}

export function getMenuConfig() {
  return config;
}

export function getMenuStatus() {
  return status;
}

export function getMenuError() {
  return errorMessage;
}

export function subscribeMenuConfig(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initMenuConfig() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setStatus("loading");

    try {
      const remote = await withTimeout(
        fetchMenuConfig(),
        12_000,
        "menu config",
      );
      const loaded = ensureSystemMenuItems(remote ?? cloneDefaultMenuConfig());
      const stripped = stripLegacyReportMenuEntries(loaded);
      if (stripped.changed) {
        persist(stripped.config);
      } else {
        config = stripped.config;
      }
      setStatus("ready");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось загрузить меню";
      console.error("[menu] load failed", error);
      config = ensureSystemMenuItems(cloneDefaultMenuConfig());
      setStatus("error", message);
    }
  })();

  return initPromise;
}

export function resetMenuConfig() {
  persist(cloneDefaultMenuConfig());
}

export function setMenuConfig(next: MenuConfig) {
  persist({
    entries: next.entries.map((entry) =>
      entry.type === "group"
        ? normalizeGroupEntry(entry)
        : normalizeItemEntry(entry),
    ),
  });
}

/**
 * Keeps managed menu items in sync with their sources:
 * - creates missing root items
 * - removes orphaned managed items
 * Existing labels and group placement stay as configured in the menu.
 *
 * An empty `sources` list must not run: it would delete every managed item
 * from groups, and the next full sync would re-append them at the root.
 */
function syncManagedMenuItems(
  sources: Array<{ id: string; label: string }>,
  isManaged: (itemId: string) => boolean,
) {
  if (sources.length === 0) return;

  const pending = new Map(
    sources.map((source) => [source.id, source.label.trim() || "Без названия"]),
  );

  const synced = syncEntries(config.entries, pending, isManaged);
  let changed = synced.changed;
  const nextEntries = [...synced.entries];

  for (const [id, label] of pending) {
    changed = true;
    nextEntries.push(
      normalizeItemEntry({
        id,
        label,
        icon: DEFAULT_MENU_ITEM_ICON,
      }),
    );
  }

  if (changed) {
    persist({ entries: nextEntries });
  }
}

export function syncEntityMenuItems(
  entities: Array<{ id: string; label: string }>,
) {
  syncManagedMenuItems(entities, isEntityLinkedMenuItem);
}

export function addMenuGroup(
  title = "Новая группа",
  icon: MenuIconName = DEFAULT_MENU_GROUP_ICON,
  internal = false,
) {
  const group: MenuGroupEntry = {
    type: "group",
    id: createId("group"),
    title,
    icon,
    ...(internal ? { internal: true } : {}),
    entries: [],
  };
  persist({ entries: [...config.entries, group] });
  return group.id;
}

export function updateMenuGroup(
  groupId: string,
  patch: Partial<Pick<MenuGroup, "title" | "icon" | "internal">>,
) {
  function mapEntries(entries: MenuEntry[]): MenuEntry[] {
    return entries.map((entry) => {
      if (entry.type !== "group") return entry;
      if (entry.id === groupId) {
        return normalizeGroupEntry({ ...entry, ...patch });
      }
      return {
        ...entry,
        entries: mapEntries(entry.entries),
      };
    });
  }

  persist({ entries: mapEntries(config.entries) });
}

export function removeMenuGroup(groupId: string) {
  const group = findGroupEntry(config.entries, groupId);
  if (!group) return;
  if (groupHasProtectedItems(group)) return;

  function filterEntries(entries: MenuEntry[]): MenuEntry[] {
    return entries
      .filter((entry) => !(entry.type === "group" && entry.id === groupId))
      .map((entry) =>
        entry.type === "group"
          ? { ...entry, entries: filterEntries(entry.entries) }
          : entry,
      );
  }

  persist({ entries: filterEntries(config.entries) });
}

export function moveMenuEntry(from: MenuEntryLocation, to: MenuEntryLocation) {
  if (locationsEqual(from, to)) return;

  const entries = cloneEntries(config.entries);
  const fromList = getListAt(entries, from.parentGroupId);
  if (!fromList) return;
  if (from.index < 0 || from.index >= fromList.length) return;

  const [moving] = fromList.splice(from.index, 1);
  if (!moving) return;

  if (moving.type === "group") {
    const targetParentId = to.parentGroupId;
    if (
      targetParentId != null &&
      isMenuGroupDescendant(config.entries, moving.id, targetParentId)
    ) {
      return;
    }
  }

  const toList = getListAt(entries, to.parentGroupId);
  if (!toList) return;

  let insertAt = to.index;
  if (from.parentGroupId === to.parentGroupId && from.index < to.index) {
    insertAt -= 1;
  }
  insertAt = Math.max(0, Math.min(insertAt, toList.length));
  toList.splice(insertAt, 0, moving);

  persist({ entries });
}

export function reorderMenuEntry(fromIndex: number, toIndex: number) {
  moveMenuEntry(
    { parentGroupId: null, index: fromIndex },
    { parentGroupId: null, index: toIndex },
  );
}

export function updateMenuItem(
  itemId: string,
  patch: Partial<Pick<MenuItem, "label" | "icon">> & {
    groupId?: string | null;
  },
) {
  const found = findItem(itemId);
  if (!found) return;

  const { groupId: nextGroupId, ...itemPatch } = patch;
  const updatedItem: MenuItem = { ...found.item, ...itemPatch };
  const currentParent = found.location.parentGroupId;

  if (nextGroupId === undefined || nextGroupId === currentParent) {
    function mapEntries(entries: MenuEntry[]): MenuEntry[] {
      return entries.map((entry) => {
        if (entry.type === "item" && entry.id === itemId) {
          return normalizeItemEntry(updatedItem);
        }
        if (entry.type === "group") {
          return { ...entry, entries: mapEntries(entry.entries) };
        }
        return entry;
      });
    }
    persist({ entries: mapEntries(config.entries) });
    return;
  }

  const targetGroup =
    nextGroupId == null ? null : findGroupEntry(config.entries, nextGroupId);
  if (nextGroupId != null && !targetGroup) return;

  const entries = cloneEntries(config.entries);
  const fromList = getListAt(entries, found.location.parentGroupId);
  if (!fromList) return;
  fromList.splice(found.location.index, 1);

  const toList = getListAt(entries, nextGroupId);
  if (!toList) return;
  toList.push({ type: "item", ...updatedItem });

  persist({ entries });
}

export function removeMenuItem(itemId: string) {
  if (isProtectedMenuItem(itemId)) return;

  function filterEntries(entries: MenuEntry[]): MenuEntry[] {
    return entries
      .filter((entry) => !(entry.type === "item" && entry.id === itemId))
      .map((entry) =>
        entry.type === "group"
          ? { ...entry, entries: filterEntries(entry.entries) }
          : entry,
      );
  }

  persist({ entries: filterEntries(config.entries) });
}

export function moveMenuItem(from: MenuItemLocation, to: MenuItemLocation) {
  moveMenuEntry(toMenuEntryLocation(from), toMenuEntryLocation(to));
}

export function reorderMenuItem(
  fromGroupId: string | null,
  fromIndex: number,
  toGroupId: string | null,
  toIndex: number,
) {
  moveMenuEntry(
    { parentGroupId: fromGroupId, index: fromIndex },
    { parentGroupId: toGroupId, index: toIndex },
  );
}

/** Resolve current location of a menu entry by id (for DnD payloads). */
export function getMenuEntryLocation(
  entryId: string,
): MenuEntryLocation | null {
  return findEntryLocation(entryId);
}
