/**
 * Resolve where TKP commercial documents are stored.
 * Prefers a native «Файлы» tab on the host; creates one when missing
 * (mirror tabs of related records are not enough — docs belong on «Разбор ТКП»).
 */

import {
  addEntityTab,
  DEFAULT_ENTITY_FOLDER_COLOR,
  getEntityConfig,
  isEntityFilesTab,
  isEntityMirrorTab,
  normalizeListColor,
  resolveEntityMirrorTab,
  type Entity,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";

export type TkpDocumentFilesTarget = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  /** True when a native files tab was just created on the host. */
  createdTab: boolean;
};

function findNativeFilesTab(entity: Entity): EntityTab | null {
  return entity.tabs.find((tab) => isEntityFilesTab(tab)) ?? null;
}

function hasFilesMirrorNamedFiles(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): boolean {
  return entity.tabs.some((tab) => {
    if (!isEntityMirrorTab(tab)) return false;
    const name = tab.name.trim().toLocaleLowerCase("ru");
    if (name !== "файлы" && !name.includes("файл")) return false;
    const resolved = resolveEntityMirrorTab(
      tab,
      entity,
      record,
      entities as Entity[],
    );
    return resolved != null && isEntityFilesTab(resolved.sourceTab);
  });
}

/**
 * Ensure the host entity has a writable `kind: "files"` tab for TKP docs.
 * Returns a fresh entity snapshot from the store when a tab is created.
 */
export function resolveTkpDocumentFilesTarget(input: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
}): TkpDocumentFilesTarget {
  const existing = findNativeFilesTab(input.entity);
  if (existing) {
    return {
      entity: input.entity,
      record: input.record,
      tab: existing,
      createdTab: false,
    };
  }

  // Mirror «Файлы» from a related record is not a storage target for TKP docs.
  const mirrorNamedFiles = hasFilesMirrorNamedFiles(
    input.entity,
    input.record,
    input.entities,
  );
  const tabName = mirrorNamedFiles ? "Документы ТКП" : "Файлы";

  const created = addEntityTab(input.entity.id, {
    name: tabName,
    kind: "files",
    defaultFolders: [
      {
        id: crypto.randomUUID(),
        name: "ТКП",
        color: normalizeListColor(DEFAULT_ENTITY_FOLDER_COLOR),
      },
    ],
  });

  const fresh =
    getEntityConfig().entities.find((item) => item.id === input.entity.id) ??
    input.entity;
  const tab =
    fresh.tabs.find((item) => item.id === created.id) ??
    findNativeFilesTab(fresh);

  if (!tab || !isEntityFilesTab(tab)) {
    throw new Error(
      "Не удалось создать вкладку «Файлы» на сущности. Добавьте её в настройках сущности.",
    );
  }

  const record =
    fresh.records.find((item) => item.id === input.record.id) ?? input.record;

  return {
    entity: fresh,
    record,
    tab,
    createdTab: true,
  };
}
