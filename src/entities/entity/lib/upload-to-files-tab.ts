/**
 * Upload files into a Files-tab folder. Core returns updated entries without
 * persisting; callers decide whether to patch local values or updateEntityRecord.
 */

import { uploadEntityFile } from "../api/entity-files-api";
import {
  DEFAULT_ENTITY_FOLDER_COLOR,
  getEntityTabFilesValueKey,
  parseEntityTabFileEntries,
  serializeEntityTabFileEntries,
  type Entity,
  type EntityFilesUploadTarget,
  type EntityTab,
  type EntityTabFileEntry,
} from "../model/types";
import { ensureUploadTargetFolderId } from "./upload-folder";
import { countFilesUnderUploadFolder } from "./upload-required";

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

/** Count files under a folder (direct + nested). Root = all files when parentId is null. */
export function countFilesUnderFolder(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): number {
  return countFilesUnderUploadFolder(entries, parentId);
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
      if (parentId === null) return true;
      let cursor: string | null = entry.parentId;
      while (cursor) {
        if (cursor === parentId) return true;
        const folder = byId.get(cursor);
        if (!folder || folder.kind !== "folder") return false;
        cursor = folder.parentId;
      }
      return false;
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
 * files-tab folder. Returns updated entries — does not persist the record.
 */
export async function uploadFilesToFilesTabEntries(input: {
  entityId: string;
  recordId: string;
  tab: EntityTab;
  target: EntityFilesUploadTarget;
  files: FileList | File[];
  /** Current tab filesystem; folders are ensured / created as needed. */
  entries: EntityTabFileEntry[];
}): Promise<{
  entries: EntityTabFileEntry[];
  uploadedCount: number;
  folderParentId: string | null;
  valueKey: string;
  serialized: string;
}> {
  const valueKey = getEntityTabFilesValueKey(input.tab.id);
  const ensured = ensureUploadTargetFolderId({
    entries: input.entries,
    defaultFolders: input.tab.defaultFolders,
    folderId: input.target.folderId,
  });
  let entries = ensured.entries;
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
      entityId: input.entityId,
      recordId: input.recordId,
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

  return {
    entries,
    uploadedCount,
    folderParentId: rootParentId,
    valueKey,
    serialized: serializeEntityTabFileEntries(entries),
  };
}

/** Convenience: upload into existing entries parsed from a values map. */
export async function uploadFilesToFilesTabValues(input: {
  entity: Pick<Entity, "id">;
  recordId: string;
  tab: EntityTab;
  target: EntityFilesUploadTarget;
  files: FileList | File[];
  values: Record<string, string>;
}): Promise<{
  values: Record<string, string>;
  uploadedCount: number;
  folderParentId: string | null;
}> {
  const valueKey = getEntityTabFilesValueKey(input.tab.id);
  const result = await uploadFilesToFilesTabEntries({
    entityId: input.entity.id,
    recordId: input.recordId,
    tab: input.tab,
    target: input.target,
    files: input.files,
    entries: parseEntityTabFileEntries(input.values[valueKey]),
  });
  return {
    values: {
      ...input.values,
      [result.valueKey]: result.serialized,
    },
    uploadedCount: result.uploadedCount,
    folderParentId: result.folderParentId,
  };
}
