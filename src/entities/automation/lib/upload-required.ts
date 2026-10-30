import {
  getEntityTabFilesValueKey,
  isEntityFilesTab,
  parseEntityTabFileEntries,
  type Entity,
  type EntityRecord,
  type EntityTabFileEntry,
} from "@/entities/entity";
import {
  getAutomationUploadTarget,
  type AutomationTaskUploadTarget,
} from "./upload-target";

/** Folder ids under `parentId` (inclusive). Root (`null`) → whole tree. */
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

/** Count files under a folder (direct + nested). Root = all files on the tab. */
export function countFilesUnderUploadFolder(
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

/**
 * Resolve configured default-folder id to a live folder entry id.
 * Does not create folders — missing folder means «no files yet».
 */
export function resolveUploadTargetFolderId(input: {
  entries: EntityTabFileEntry[];
  defaultFolders: ReadonlyArray<{ id: string; name: string }>;
  folderId: string;
}): string | null | undefined {
  const folderId = input.folderId.trim();
  if (!folderId) return null;

  const def = input.defaultFolders.find((item) => item.id === folderId);
  if (!def) return undefined;

  const existing = input.entries.find(
    (entry) =>
      entry.kind === "folder" &&
      entry.parentId === null &&
      entry.name.trim().toLocaleLowerCase("ru") ===
        def.name.trim().toLocaleLowerCase("ru"),
  );
  return existing?.id;
}

/**
 * True when upload is required and the target folder still has no files.
 * Missing entity/record/tab/folder config → blocks (cannot verify).
 */
export function automationUploadTargetBlocksComplete(
  entity: Entity | undefined,
  record: EntityRecord | undefined,
  target: AutomationTaskUploadTarget | null,
): boolean {
  if (!target?.required) return false;
  if (!entity || !record) return true;

  const tab = entity.tabs.find(
    (item) => item.id === target.filesTabId && isEntityFilesTab(item),
  );
  if (!tab) return true;

  const valueKey = getEntityTabFilesValueKey(tab.id);
  const entries = parseEntityTabFileEntries(record.values[valueKey]);
  const parentId = resolveUploadTargetFolderId({
    entries,
    defaultFolders: tab.defaultFolders,
    folderId: target.folderId,
  });
  // undefined = configured folder id is stale / missing from schema.
  if (parentId === undefined) return true;

  return countFilesUnderUploadFolder(entries, parentId) === 0;
}

/** Throw when the task materials require a file that is still missing. */
export function assertAutomationUploadRequired(
  materials: string[] | undefined | null,
  entity: Entity | undefined,
  record: EntityRecord | undefined,
): void {
  const target = getAutomationUploadTarget(materials);
  if (automationUploadTargetBlocksComplete(entity, record, target)) {
    throw new Error(
      "Прикрепите файлы в папку задания, чтобы завершить его.",
    );
  }
}
