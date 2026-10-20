import {
  DEFAULT_ENTITY_FOLDER_COLOR,
  getEntityConfig,
  getEntityTabFilesValueKey,
  isEntityFilesTab,
  normalizeListColor,
  parseEntityTabFileEntries,
  serializeEntityTabFileEntries,
  updateEntityRecord,
  uploadEntityFile,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTabDefaultFolder,
  type EntityTabFileEntry,
} from "@/entities/entity";
import type { AutomationTaskUploadTarget } from "@/entities/automation";

function uniqueName(
  base: string,
  existing: string[],
  isFolder: boolean,
): string {
  const names = new Set(existing.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;

  if (isFolder) {
    let index = 2;
    while (names.has(`${base} ${index}`.toLowerCase())) index += 1;
    return `${base} ${index}`;
  }

  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  while (names.has(`${stem} ${index}${ext}`.toLowerCase())) index += 1;
  return `${stem} ${index}${ext}`;
}

function siblingNamesAt(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): string[] {
  return entries
    .filter((entry) => entry.parentId === parentId)
    .map((entry) => entry.name);
}

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
    return { entries: input.entries, parentId: null };
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

/** Folder ids under `parentId` (inclusive). Root (`null`) → all folders. */
function folderScopeIds(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): Set<string> | null {
  if (parentId === null) return null;

  const allowed = new Set<string>([parentId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of entries) {
      if (
        entry.kind === "folder" &&
        entry.parentId &&
        allowed.has(entry.parentId) &&
        !allowed.has(entry.id)
      ) {
        allowed.add(entry.id);
        grew = true;
      }
    }
  }
  return allowed;
}

/** Count files under a folder (direct + nested). Root = all files when parentId is null. */
export function countFilesUnderFolder(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): number {
  const scope = folderScopeIds(entries, parentId);
  return entries.reduce((count, entry) => {
    if (entry.kind !== "file") return count;
    if (scope === null) return count + 1;
    if (entry.parentId && scope.has(entry.parentId)) return count + 1;
    return count;
  }, 0);
}

export type UploadTargetFileItem = {
  entry: EntityTabFileEntry;
  /** Path relative to the upload folder, e.g. `docs/spec.pdf`. */
  relativePath: string;
};

/** Files under the upload target, newest first, with a display path. */
export function listFilesUnderFolder(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): UploadTargetFileItem[] {
  const scope = folderScopeIds(entries, parentId);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  function relativePath(file: EntityTabFileEntry): string {
    const parts: string[] = [file.name];
    let cursor = file.parentId;
    while (cursor) {
      if (parentId != null && cursor === parentId) break;
      const folder = byId.get(cursor);
      if (!folder || folder.kind !== "folder") break;
      parts.unshift(folder.name);
      cursor = folder.parentId;
    }
    return parts.join("/");
  }

  return entries
    .filter((entry) => {
      if (entry.kind !== "file") return false;
      if (scope === null) return true;
      return Boolean(entry.parentId && scope.has(entry.parentId));
    })
    .map((entry) => ({ entry, relativePath: relativePath(entry) }))
    .sort((a, b) => {
      const at = a.entry.createdAt.localeCompare(b.entry.createdAt);
      if (at !== 0) return -at;
      return a.relativePath.localeCompare(b.relativePath, "ru");
    });
}

function fileRelativePath(file: File): string {
  const relative =
    "webkitRelativePath" in file &&
    typeof file.webkitRelativePath === "string" &&
    file.webkitRelativePath.trim()
      ? file.webkitRelativePath
      : file.name;
  return String(relative);
}

/**
 * Upload files (and folder trees via `webkitRelativePath`) into the configured
 * files-tab folder on the record.
 */
export async function uploadFilesToAutomationTarget(input: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  target: AutomationTaskUploadTarget;
  files: FileList | File[];
}): Promise<{ uploadedCount: number; folderParentId: string | null }> {
  const valueKey = getEntityTabFilesValueKey(input.tab.id);
  const latestValues =
    getEntityConfig()
      .entities.find((item) => item.id === input.entity.id)
      ?.records.find((item) => item.id === input.record.id)?.values ??
    input.record.values;
  let entries = parseEntityTabFileEntries(latestValues[valueKey]);

  const ensured = ensureUploadTargetFolderId({
    entries,
    defaultFolders: input.tab.defaultFolders,
    folderId: input.target.folderId,
  });
  entries = ensured.entries;
  const rootParentId = ensured.parentId;

  const folderByPath = new Map<string, string | null>([["", rootParentId]]);
  let uploadedCount = 0;

  for (const file of Array.from(input.files)) {
    const relative = fileRelativePath(file);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    const directories = parts.slice(0, -1);
    const fileName = parts[parts.length - 1] || file.name || "Файл";

    let current = rootParentId;
    let path = "";
    for (const part of directories) {
      path = path ? `${path}/${part}` : part;
      if (!folderByPath.has(path)) {
        const names = siblingNamesAt(entries, current);
        const name = uniqueName(part, names, true);
        const folder: EntityTabFileEntry = {
          id: crypto.randomUUID(),
          name,
          kind: "folder",
          parentId: current,
          createdAt: new Date().toISOString(),
          color: DEFAULT_ENTITY_FOLDER_COLOR,
        };
        entries = [...entries, folder];
        folderByPath.set(path, folder.id);
      }
      current = folderByPath.get(path) ?? current;
    }

    const names = siblingNamesAt(entries, current);
    const name = uniqueName(fileName, names, false);
    const entryId = crypto.randomUUID();
    const uploaded = await uploadEntityFile({
      entityId: input.entity.id,
      recordId: input.record.id,
      tabId: input.tab.id,
      entryId,
      file,
    });

    entries = [
      ...entries,
      {
        id: entryId,
        name,
        kind: "file",
        parentId: current,
        createdAt: new Date().toISOString(),
        mimeType: file.type || undefined,
        size: file.size,
        storagePath: uploaded.storagePath,
        dataUrl: uploaded.dataUrl,
      },
    ];
    uploadedCount += 1;
  }

  await updateEntityRecord(input.entity.id, input.record.id, {
    [valueKey]: serializeEntityTabFileEntries(entries),
  });

  return { uploadedCount, folderParentId: rootParentId };
}

/** True when upload is required and the target folder still has no files. */
export function automationUploadTargetBlocksComplete(
  entity: Entity | undefined,
  record: EntityRecord | undefined,
  target: AutomationTaskUploadTarget | null,
): boolean {
  if (!target?.required || !entity || !record) return false;
  const tab = entity.tabs.find(
    (item) => item.id === target.filesTabId && isEntityFilesTab(item),
  );
  if (!tab) return true;
  const valueKey = getEntityTabFilesValueKey(tab.id);
  const entries = parseEntityTabFileEntries(record.values[valueKey]);
  const { parentId } = ensureUploadTargetFolderId({
    entries,
    defaultFolders: tab.defaultFolders,
    folderId: target.folderId,
  });
  return countFilesUnderFolder(entries, parentId) === 0;
}
