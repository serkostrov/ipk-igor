/**
 * Resolve / create the live files-tab folder for an automation upload target.
 */

import {
  DEFAULT_ENTITY_FOLDER_COLOR,
  normalizeListColor,
  type EntityTabDefaultFolder,
  type EntityTabFileEntry,
} from "@/entities/entity";

/**
 * Resolve configured default-folder id to a live record folder entry id.
 * Creates the root folder when missing (by default-folder name/color).
 */
export function ensureUploadTargetFolderId(input: {
  entries: EntityTabFileEntry[];
  defaultFolders: readonly EntityTabDefaultFolder[];
  folderId: string;
}): { entries: EntityTabFileEntry[]; parentId: string | null } {
  const folderId = input.folderId.trim();
  if (!folderId) {
    return { entries: input.entries, parentId: null };
  }

  const def = input.defaultFolders.find((item) => item.id === folderId);
  if (!def) {
    throw new Error(
      "Папка для загрузки не найдена. Проверьте настройки задания.",
    );
  }

  const existing = input.entries.find(
    (entry) =>
      entry.kind === "folder" &&
      entry.parentId === null &&
      entry.name.trim().toLocaleLowerCase("ru") ===
        def.name.trim().toLocaleLowerCase("ru"),
  );
  if (existing) {
    return { entries: input.entries, parentId: existing.id };
  }

  const created: EntityTabFileEntry = {
    id: crypto.randomUUID(),
    name: def.name.trim() || "Папка",
    kind: "folder",
    parentId: null,
    createdAt: new Date().toISOString(),
    color: normalizeListColor(def.color || DEFAULT_ENTITY_FOLDER_COLOR),
  };
  return { entries: [...input.entries, created], parentId: created.id };
}
