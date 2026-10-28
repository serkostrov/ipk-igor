/**
 * Copy «Записи» / «Файлы» tab content from the trigger record onto a newly
 * created related record (createRecord action flags).
 */

import {
  buildEntityFileStoragePath,
  copyEntityFileObject,
  getEntityTabFilesValueKey,
  getEntityTabRecordsValueKey,
  isEntityFilesTab,
  isEntityRecordsTab,
  parseEntityTabFileEntries,
  parseEntityTabRecordEntries,
  serializeEntityTabFileEntries,
  serializeEntityTabRecordEntries,
  updateEntityRecord,
  type Entity,
  type EntityTab,
  type EntityTabFileEntry,
  type EntityTabRecordEntry,
} from "@/entities/entity";

function normalizeTabName(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

/** Pair source→target tabs of the same kind (by name, then first free). */
export function pairEntityContentTabs(
  source: Entity,
  target: Entity,
  kind: "records" | "files",
): Array<{ sourceTab: EntityTab; targetTab: EntityTab }> {
  const sourceTabs = source.tabs.filter((tab) =>
    kind === "records" ? isEntityRecordsTab(tab) : isEntityFilesTab(tab),
  );
  const targetTabs = target.tabs.filter((tab) =>
    kind === "records" ? isEntityRecordsTab(tab) : isEntityFilesTab(tab),
  );
  if (sourceTabs.length === 0 || targetTabs.length === 0) return [];

  const used = new Set<string>();
  const pairs: Array<{ sourceTab: EntityTab; targetTab: EntityTab }> = [];

  for (const sourceTab of sourceTabs) {
    const byName = targetTabs.find(
      (tab) =>
        !used.has(tab.id) &&
        normalizeTabName(tab.name) === normalizeTabName(sourceTab.name),
    );
    const fallback = targetTabs.find((tab) => !used.has(tab.id));
    const targetTab = byName ?? fallback;
    if (!targetTab) break;
    used.add(targetTab.id);
    pairs.push({ sourceTab, targetTab });
  }

  return pairs;
}

function cloneRecordEntries(
  entries: readonly EntityTabRecordEntry[],
): EntityTabRecordEntry[] {
  return entries.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
  }));
}

async function cloneFileEntries(options: {
  entries: readonly EntityTabFileEntry[];
  targetEntityId: string;
  targetRecordId: string;
  targetTabId: string;
}): Promise<EntityTabFileEntry[]> {
  const { entries, targetEntityId, targetRecordId, targetTabId } = options;
  if (entries.length === 0) return [];

  const idMap = new Map<string, string>();
  for (const entry of entries) {
    idMap.set(entry.id, crypto.randomUUID());
  }

  const next: EntityTabFileEntry[] = [];
  for (const entry of entries) {
    const id = idMap.get(entry.id)!;
    const parentId = entry.parentId
      ? (idMap.get(entry.parentId) ?? null)
      : null;

    if (entry.kind === "folder") {
      next.push({
        ...entry,
        id,
        parentId,
        storagePath: undefined,
        dataUrl: undefined,
        mimeType: undefined,
        size: undefined,
      });
      continue;
    }

    const cloned: EntityTabFileEntry = {
      ...entry,
      id,
      parentId,
      storagePath: undefined,
      dataUrl: entry.dataUrl,
    };

    if (entry.storagePath?.trim()) {
      const storagePath = buildEntityFileStoragePath({
        entityId: targetEntityId,
        recordId: targetRecordId,
        tabId: targetTabId,
        entryId: id,
        fileName: entry.name,
      });
      await copyEntityFileObject(entry.storagePath, storagePath);
      cloned.storagePath = storagePath;
      cloned.dataUrl = undefined;
    }

    next.push(cloned);
  }

  return next;
}

export async function copyTriggerTabsOntoRecord(options: {
  sourceEntity: Entity;
  sourceValues: Record<string, string | undefined>;
  targetEntity: Entity;
  targetRecordId: string;
  copyRecords: boolean;
  copyFiles: boolean;
}): Promise<{ recordsTabs: number; filesTabs: number; fileCount: number }> {
  const {
    sourceEntity,
    sourceValues,
    targetEntity,
    targetRecordId,
    copyRecords,
    copyFiles,
  } = options;

  const patch: Record<string, string> = {};
  let recordsTabs = 0;
  let filesTabs = 0;
  let fileCount = 0;

  if (copyRecords) {
    for (const { sourceTab, targetTab } of pairEntityContentTabs(
      sourceEntity,
      targetEntity,
      "records",
    )) {
      const sourceKey = getEntityTabRecordsValueKey(sourceTab.id);
      const entries = parseEntityTabRecordEntries(sourceValues[sourceKey]);
      if (entries.length === 0) continue;
      const targetKey = getEntityTabRecordsValueKey(targetTab.id);
      patch[targetKey] = serializeEntityTabRecordEntries(
        cloneRecordEntries(entries),
      );
      recordsTabs += 1;
    }
  }

  if (copyFiles) {
    for (const { sourceTab, targetTab } of pairEntityContentTabs(
      sourceEntity,
      targetEntity,
      "files",
    )) {
      const sourceKey = getEntityTabFilesValueKey(sourceTab.id);
      const entries = parseEntityTabFileEntries(sourceValues[sourceKey]);
      if (entries.length === 0) continue;
      const cloned = await cloneFileEntries({
        entries,
        targetEntityId: targetEntity.id,
        targetRecordId,
        targetTabId: targetTab.id,
      });
      const targetKey = getEntityTabFilesValueKey(targetTab.id);
      patch[targetKey] = serializeEntityTabFileEntries(cloned);
      filesTabs += 1;
      fileCount += cloned.filter((entry) => entry.kind === "file").length;
    }
  }

  if (Object.keys(patch).length > 0) {
    await updateEntityRecord(targetEntity.id, targetRecordId, patch);
  }

  return { recordsTabs, filesTabs, fileCount };
}
