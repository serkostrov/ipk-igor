/**
 * List / upload TKP files bound to a price revision (`priceHistoryId`).
 * Reuses the entity files tab + «ТКП» folder (same target as submit-for-approval).
 */

import {
  DEFAULT_ENTITY_FOLDER_COLOR,
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
  type EntityTabFileEntry,
} from "@/entities/entity";
import {
  clearTkpPriceBindKeys,
  isTkpDocumentsFolder,
  resolveTkpFolderAncestorId,
} from "./tkp-file-bind";
import { resolveTkpDocumentFilesTarget } from "./resolve-tkp-files-target";

export function uniqueTkpFileName(
  base: string,
  existing: readonly string[],
): string {
  const names = new Set(existing.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  while (names.has(`${stem} ${index}${ext}`.toLowerCase())) index += 1;
  return `${stem} ${index}${ext}`;
}

export function ensureTkpDocumentsFolder(entries: EntityTabFileEntry[]): {
  entries: EntityTabFileEntry[];
  folderId: string;
} {
  const existing = entries.find(
    (entry) => entry.kind === "folder" && isTkpDocumentsFolder(entry),
  );
  if (existing) {
    return { entries, folderId: existing.id };
  }

  const folder: EntityTabFileEntry = {
    id: crypto.randomUUID(),
    name: "ТКП",
    kind: "folder",
    parentId: null,
    createdAt: new Date().toISOString(),
    color: normalizeListColor(DEFAULT_ENTITY_FOLDER_COLOR),
  };
  return { entries: [...entries, folder], folderId: folder.id };
}

/** Native files tab on the host (if any) — does not create one. */
export function findTkpFilesTab(entity: Entity): EntityTab | null {
  return entity.tabs.find((tab) => isEntityFilesTab(tab)) ?? null;
}

export function readTkpDocumentFileEntries(input: {
  entity: Entity;
  record: EntityRecord;
}): EntityTabFileEntry[] {
  const tab = findTkpFilesTab(input.entity);
  if (!tab) return [];
  const valueKey = getEntityTabFilesValueKey(tab.id);
  return parseEntityTabFileEntries(input.record.values[valueKey]);
}

function isBoundToRevisionUnderTkpFolder(
  entries: readonly EntityTabFileEntry[],
  entry: EntityTabFileEntry,
  revisionId: string,
): boolean {
  if (entry.kind !== "file") return false;
  if (entry.priceHistoryId !== revisionId) return false;
  const hasTkpFolder = entries.some(
    (item) => item.kind === "folder" && isTkpDocumentsFolder(item),
  );
  if (!hasTkpFolder) return true;
  return resolveTkpFolderAncestorId(entries, entry.parentId) != null;
}

/** Files bound to a specific price revision (under «ТКП» when that folder exists). */
export function listTkpRevisionFiles(
  entries: readonly EntityTabFileEntry[],
  revisionId: string,
): EntityTabFileEntry[] {
  return entries.filter((entry) =>
    isBoundToRevisionUnderTkpFolder(entries, entry, revisionId),
  );
}

/** Count of bound files per `tkp_price_revisions.id`. */
export function countTkpRevisionFilesById(
  entries: readonly EntityTabFileEntry[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const hasTkpFolder = entries.some(
    (item) => item.kind === "folder" && isTkpDocumentsFolder(item),
  );

  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const revisionId = entry.priceHistoryId?.trim();
    if (!revisionId) continue;
    if (
      hasTkpFolder &&
      resolveTkpFolderAncestorId(entries, entry.parentId) == null
    ) {
      continue;
    }
    counts.set(revisionId, (counts.get(revisionId) ?? 0) + 1);
  }
  return counts;
}

export type UploadTkpRevisionFilesResult = {
  uploadedCount: number;
  filesTabName: string;
  createdFilesTab: boolean;
};

export async function uploadTkpRevisionFiles(input: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
  revisionId: string;
  files: readonly File[];
}): Promise<UploadTkpRevisionFilesResult> {
  if (input.files.length === 0) {
    return { uploadedCount: 0, filesTabName: "Файлы", createdFilesTab: false };
  }

  const target = resolveTkpDocumentFilesTarget({
    entity: input.entity,
    record: input.record,
    entities: input.entities,
  });

  const valueKey = getEntityTabFilesValueKey(target.tab.id);
  let entries = parseEntityTabFileEntries(target.record.values[valueKey]);
  const ensured = ensureTkpDocumentsFolder(entries);
  entries = ensured.entries;
  const folderId = ensured.folderId;

  const siblingNames = entries
    .filter((entry) => entry.parentId === folderId && entry.kind === "file")
    .map((entry) => entry.name);

  for (const file of input.files) {
    const entryId = crypto.randomUUID();
    const fileName = uniqueTkpFileName(file.name || "Файл", siblingNames);
    siblingNames.push(fileName);

    const uploaded = await uploadEntityFile({
      entityId: target.entity.id,
      recordId: target.record.id,
      tabId: target.tab.id,
      entryId,
      file,
    });

    entries = [
      ...entries,
      {
        id: entryId,
        name: fileName,
        kind: "file",
        parentId: folderId,
        createdAt: new Date().toISOString(),
        mimeType: file.type || undefined,
        size: file.size,
        storagePath: uploaded.storagePath,
        dataUrl: uploaded.dataUrl,
        priceHistoryId: input.revisionId,
      },
    ];
  }

  await updateEntityRecord(target.entity.id, target.record.id, {
    ...clearTkpPriceBindKeys(target.record.values),
    [valueKey]: serializeEntityTabFileEntries(entries),
  });

  return {
    uploadedCount: input.files.length,
    filesTabName: target.tab.name.trim() || "Файлы",
    createdFilesTab: target.createdTab,
  };
}
