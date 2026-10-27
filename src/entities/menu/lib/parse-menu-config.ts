import { defaultMenuConfig } from "../model/defaults";
import { menuIconMap } from "../model/icons";
import type {
  MenuConfig,
  MenuEntry,
  MenuGroup,
  MenuGroupEntry,
  MenuIconName,
  MenuItem,
  MenuItemEntry,
} from "../model/types";
import {
  DEFAULT_MENU_GROUP_ICON,
  DEFAULT_MENU_ITEM_ICON,
  AUTOMATION_TASKS_ITEM_ID,
  HISTORY_ITEM_ID,
  OPIU_ITEM_ID,
  FINANCE_DASHBOARDS_ITEM_ID,
  NOTIFICATIONS_ITEM_ID,
  SETTINGS_ITEM_ID,
  walkMenuGroups,
} from "../model/types";

function isMenuIconName(value: unknown): value is MenuIconName {
  return typeof value === "string" && value in menuIconMap;
}

function isMenuItemShape(value: unknown): value is MenuItem {
  if (!value || typeof value !== "object") return false;
  const item = value as MenuItem;
  if (
    typeof item.id !== "string" ||
    typeof item.label !== "string" ||
    !isMenuIconName(item.icon)
  ) {
    return false;
  }
  if (item.entries === undefined) return true;
  if (!Array.isArray(item.entries)) return false;
  return item.entries.every(
    (child) => isRawGroupEntry(child) || isRawItemEntry(child),
  );
}

function isMenuItem(value: unknown): value is MenuItem {
  return isMenuItemShape(value);
}

function isRawItemEntry(value: unknown): value is MenuItemEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as MenuEntry;
  return entry.type === "item" && isMenuItemShape(entry);
}

type RawMenuGroup = {
  id: string;
  title: string;
  icon?: unknown;
  internal?: unknown;
  items?: unknown;
  entries?: unknown;
};

function isRawGroupShape(value: unknown): value is RawMenuGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as {
    id?: unknown;
    title?: unknown;
    items?: unknown;
    entries?: unknown;
  };
  if (typeof group.id !== "string" || typeof group.title !== "string") {
    return false;
  }
  const hasEntries = Array.isArray(group.entries);
  const hasItems = Array.isArray(group.items);
  if (!hasEntries && !hasItems) return false;
  if (hasEntries) {
    return (group.entries as unknown[]).every(
      (entry) => isRawGroupEntry(entry) || isRawItemEntry(entry),
    );
  }
  return (group.items as unknown[]).every(isMenuItem);
}

function isRawGroupEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as { type?: unknown };
  return entry.type === "group" && isRawGroupShape(value);
}

function isRawMenuGroup(value: unknown): boolean {
  return isRawGroupShape(value);
}

function normalizeChildEntries(entries: MenuEntry[] | undefined): MenuEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map((entry) =>
    entry.type === "group"
      ? normalizeGroupEntry(entry)
      : normalizeItemEntry(entry),
  );
}

export function normalizeItemEntry(item: MenuItem): MenuItemEntry {
  const nested = normalizeChildEntries(item.entries);
  return {
    type: "item",
    id: item.id,
    label: item.label.trim() || "Новый пункт",
    icon: isMenuIconName(item.icon) ? item.icon : DEFAULT_MENU_ITEM_ICON,
    ...(nested.length > 0 ? { entries: nested } : {}),
  };
}

export function normalizeGroup(group: {
  id: string;
  title: string;
  icon?: unknown;
  internal?: unknown;
  items?: MenuItem[];
  entries?: MenuEntry[];
}): MenuGroup {
  const entries = Array.isArray(group.entries)
    ? normalizeChildEntries(group.entries)
    : (group.items ?? []).map((item) => normalizeItemEntry(item));

  return {
    id: group.id,
    title: group.title.trim() || "Новая группа",
    icon: isMenuIconName(group.icon) ? group.icon : DEFAULT_MENU_GROUP_ICON,
    ...(group.internal === true ? { internal: true } : {}),
    entries,
  };
}

export function normalizeGroupEntry(group: {
  id: string;
  title: string;
  icon?: unknown;
  internal?: unknown;
  items?: MenuItem[];
  entries?: MenuEntry[];
}): MenuGroupEntry {
  return { type: "group", ...normalizeGroup(group) };
}

const SYSTEM_PAGE_ITEMS: MenuItem[] = [
  { id: SETTINGS_ITEM_ID, label: "Настройки", icon: "settings" },
  { id: HISTORY_ITEM_ID, label: "История изменений", icon: "clock" },
  {
    id: AUTOMATION_TASKS_ITEM_ID,
    label: "Задачи автоматизаций",
    icon: "kanban",
  },
  { id: NOTIFICATIONS_ITEM_ID, label: "Уведомления", icon: "bell" },
  { id: OPIU_ITEM_ID, label: "ОПиУ", icon: "calculator" },
  { id: FINANCE_DASHBOARDS_ITEM_ID, label: "Дашборды", icon: "layout" },
];

function hasMenuItem(entries: MenuEntry[], itemId: string): boolean {
  for (const entry of entries) {
    if (entry.type === "item") {
      if (entry.id === itemId) return true;
      if (entry.entries?.length && hasMenuItem(entry.entries, itemId)) {
        return true;
      }
      continue;
    }
    if (hasMenuItem(entry.entries, itemId)) return true;
  }
  return false;
}

/** Ensures system pages exist; missing ones are added to the root. */
export function ensureSystemMenuItems(config: MenuConfig): MenuConfig {
  const missing = SYSTEM_PAGE_ITEMS.filter(
    (item) => !hasMenuItem(config.entries, item.id),
  );
  if (missing.length === 0) return config;
  return {
    entries: [...config.entries, ...missing.map(normalizeItemEntry)],
  };
}

/** Drop leftover report menu stubs after the reports feature was removed. */
export function stripLegacyReportMenuEntries(config: MenuConfig): {
  config: MenuConfig;
  changed: boolean;
} {
  function strip(entries: MenuEntry[]): {
    entries: MenuEntry[];
    changed: boolean;
  } {
    let changed = false;
    const next: MenuEntry[] = [];
    for (const entry of entries) {
      if (entry.type === "item") {
        if (entry.id.startsWith("report-")) {
          changed = true;
          if (entry.entries?.length) {
            const nested = strip(entry.entries);
            if (nested.changed) changed = true;
            next.push(...nested.entries);
          }
          continue;
        }
        if (!entry.entries?.length) {
          next.push(entry);
          continue;
        }
        const nested = strip(entry.entries);
        if (nested.changed) changed = true;
        next.push(
          nested.changed
            ? normalizeItemEntry({ ...entry, entries: nested.entries })
            : entry,
        );
        continue;
      }
      const children = strip(entry.entries);
      if (children.changed) changed = true;
      next.push(
        children.changed ? { ...entry, entries: children.entries } : entry,
      );
    }
    return { entries: next, changed };
  }

  const stripped = strip(config.entries);
  if (!stripped.changed) return { config, changed: false };
  return { config: { entries: stripped.entries }, changed: true };
}

function parseRawGroup(value: RawMenuGroup): MenuGroupEntry {
  if (Array.isArray(value.entries)) {
    return normalizeGroupEntry({
      id: value.id,
      title: value.title,
      icon: value.icon,
      internal: value.internal,
      entries: value.entries.map((entry) =>
        isRawGroupEntry(entry)
          ? parseRawGroup(entry as RawMenuGroup)
          : parseRawItem(entry as MenuItemEntry),
      ),
    });
  }

  const items = Array.isArray(value.items)
    ? (value.items as MenuItem[]).filter(isMenuItem)
    : [];
  return normalizeGroupEntry({
    id: value.id,
    title: value.title,
    icon: value.icon,
    internal: value.internal,
    items,
  });
}

function parseRawItem(value: MenuItem | MenuItemEntry): MenuItemEntry {
  const nested = Array.isArray(value.entries)
    ? value.entries.map((entry) =>
        entry.type === "group"
          ? parseRawGroup(entry as RawMenuGroup)
          : parseRawItem(entry as MenuItemEntry),
      )
    : undefined;
  return normalizeItemEntry({
    id: value.id,
    label: value.label,
    icon: value.icon,
    ...(nested && nested.length > 0 ? { entries: nested } : {}),
  });
}

export function parseMenuConfig(value: unknown): MenuConfig | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  if (Array.isArray(data.entries)) {
    if (
      data.entries.length > 0 &&
      !data.entries.every(
        (entry) => isRawGroupEntry(entry) || isRawItemEntry(entry),
      )
    ) {
      return null;
    }

    return ensureSystemMenuItems({
      entries: data.entries.map((entry) =>
        isRawGroupEntry(entry)
          ? parseRawGroup(entry as RawMenuGroup)
          : parseRawItem(entry as MenuItemEntry),
      ),
    });
  }

  // Legacy shape: { groups: MenuGroup[] }
  if (!Array.isArray(data.groups)) return null;
  if (data.groups.length > 0 && !data.groups.every(isRawMenuGroup)) {
    return null;
  }

  return ensureSystemMenuItems({
    entries: data.groups
      .filter(isRawMenuGroup)
      .map((group) => parseRawGroup(group as RawMenuGroup)),
  });
}

export function cloneDefaultMenuConfig(): MenuConfig {
  return structuredClone(defaultMenuConfig);
}

/** All groups depth-first (for pickers). */
export function getMenuGroups(config: MenuConfig): MenuGroup[] {
  const groups: MenuGroup[] = [];
  walkMenuGroups(config.entries, (group) => {
    groups.push(group);
  });
  return groups;
}
