/**
 * Legacy «файл результата» ask fields store uploads on the record field,
 * not on the Files tab. Mirror those entries into the configured upload
 * folder (or the first files tab) so acceptance / рукО see them on the element.
 */

import {
  getEntityRecordById,
  getEntityConfig,
  getEntityTabFilesValueKey,
  isEntityFilesTab,
  parseEntityFieldFileEntries,
  parseEntityTabFileEntries,
  serializeEntityTabFileEntries,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
  type EntityTabFileEntry,
} from "@/entities/entity";
import { ensureUploadTargetFolderId } from "./upload-folder";
import {
  getAutomationUploadTarget,
  type AutomationTaskUploadTarget,
} from "./upload-target";

function siblingFileNames(
  entries: EntityTabFileEntry[],
  parentId: string | null,
): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.kind === "file" && entry.parentId === parentId)
      .map((entry) => entry.name.trim().toLocaleLowerCase("ru")),
  );
}

function alreadyMirrored(
  entries: EntityTabFileEntry[],
  source: EntityTabFileEntry,
  parentId: string | null,
): boolean {
  if (source.kind !== "file") return true;
  const path = source.storagePath?.trim() ?? "";
  const data = source.dataUrl?.trim() ?? "";
  return entries.some((entry) => {
    if (entry.kind !== "file" || entry.parentId !== parentId) return false;
    if (path && entry.storagePath?.trim() === path) return true;
    if (data && entry.dataUrl?.trim() === data) return true;
    return false;
  });
}

function resolveMirrorTarget(
  entity: Entity,
  materials: string[] | undefined | null,
  explicit?: AutomationTaskUploadTarget | null,
): AutomationTaskUploadTarget | null {
  if (explicit) return explicit;
  const fromMaterials = getAutomationUploadTarget(materials);
  if (fromMaterials) return fromMaterials;
  const tab = entity.tabs.find((item) => isEntityFilesTab(item));
  if (!tab) return null;
  return {
    filesTabId: tab.id,
    folderId: tab.defaultFolders[0]?.id ?? "",
    required: false,
  };
}

/**
 * Copy file-field entries onto the entity Files tab. Returns how many files
 * were appended. No-op when there is nothing to mirror or no files tab.
 */
export async function mirrorFileFieldsToFilesTab(options: {
  entity: Entity;
  record: EntityRecord;
  /** Latest values (form + record). */
  values: Record<string, string>;
  materials?: string[] | null;
  target?: AutomationTaskUploadTarget | null;
}): Promise<number> {
  const target = resolveMirrorTarget(
    options.entity,
    options.materials,
    options.target,
  );
  if (!target) return 0;

  const tab = options.entity.tabs.find(
    (item) => item.id === target.filesTabId && isEntityFilesTab(item),
  );
  if (!tab) return 0;

  const fileFields = options.entity.fields.filter(
    (field) => field.type === "file",
  );
  if (fileFields.length === 0) return 0;

  const valueKey = getEntityTabFilesValueKey(tab.id);
  const latestValues =
    (
      await getEntityRecordById(
        getEntityConfig().entities.find(
          (item) => item.id === options.entity.id,
        ),
        options.record.id,
      )
    )?.values ?? options.values;

  let entries = parseEntityTabFileEntries(
    latestValues[valueKey] ?? options.record.values[valueKey],
  );
  const ensured = ensureUploadTargetFolderId({
    entries,
    defaultFolders: tab.defaultFolders,
    folderId: target.folderId,
  });
  entries = ensured.entries;
  const parentId = ensured.parentId;

  let appended = 0;
  const usedNames = siblingFileNames(entries, parentId);

  for (const field of fileFields) {
    const raw =
      options.values[field.id] ?? options.record.values[field.id] ?? "";
    const sourceEntries = parseEntityFieldFileEntries(raw);
    for (const source of sourceEntries) {
      if (source.kind !== "file") continue;
      if (!source.storagePath && !source.dataUrl) continue;
      if (alreadyMirrored(entries, source, parentId)) continue;

      let name = source.name.trim() || "Файл";
      const key = name.toLocaleLowerCase("ru");
      if (usedNames.has(key)) {
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let index = 2;
        while (
          usedNames.has(`${stem} ${index}${ext}`.toLocaleLowerCase("ru"))
        ) {
          index += 1;
        }
        name = `${stem} ${index}${ext}`;
      }
      usedNames.add(name.toLocaleLowerCase("ru"));

      const mirrored: EntityTabFileEntry = {
        id: crypto.randomUUID(),
        name,
        kind: "file",
        parentId,
        createdAt: source.createdAt || new Date().toISOString(),
      };
      if (source.mimeType) mirrored.mimeType = source.mimeType;
      if (source.size != null) mirrored.size = source.size;
      if (source.storagePath) mirrored.storagePath = source.storagePath;
      if (source.dataUrl) mirrored.dataUrl = source.dataUrl;

      entries = [...entries, mirrored];
      appended += 1;
    }
  }

  if (appended === 0) return 0;

  await updateEntityRecord(options.entity.id, options.record.id, {
    [valueKey]: serializeEntityTabFileEntries(entries),
  });
  return appended;
}
