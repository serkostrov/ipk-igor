/**
 * Resolve where TKP commercial documents are stored.
 * Always targets the host’s native «Файлы» tab → folder «ТКП»
 * (mirror tabs are not a storage target).
 */

import {
  addEntityTab,
  DEFAULT_ENTITY_FOLDER_COLOR,
  getEntityConfig,
  isEntityFilesTab,
  normalizeListColor,
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

function normalizeTabName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** Native `kind: files` tab named «Файлы» — preferred storage for TKP docs. */
export function findPreferredTkpFilesTab(entity: Entity): EntityTab | null {
  return (
    entity.tabs.find(
      (tab) => isEntityFilesTab(tab) && normalizeTabName(tab.name) === "файлы",
    ) ?? null
  );
}

/** All native files tabs (for reading legacy «Документы ТКП» uploads). */
export function listNativeFilesTabs(entity: Entity): EntityTab[] {
  return entity.tabs.filter((tab) => isEntityFilesTab(tab));
}

/**
 * Ensure the host entity has a writable native «Файлы» tab for TKP docs.
 * Returns a fresh entity snapshot from the store when a tab is created.
 */
export function resolveTkpDocumentFilesTarget(input: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
}): TkpDocumentFilesTarget {
  void input.entities;

  const fresh =
    getEntityConfig().entities.find((item) => item.id === input.entity.id) ??
    input.entity;
  const record =
    fresh.records.find((item) => item.id === input.record.id) ?? input.record;

  const existing = findPreferredTkpFilesTab(fresh);
  if (existing) {
    return {
      entity: fresh,
      record,
      tab: existing,
      createdTab: false,
    };
  }

  const created = addEntityTab(input.entity.id, {
    name: "Файлы",
    kind: "files",
    defaultFolders: [
      {
        id: crypto.randomUUID(),
        name: "ТКП",
        color: normalizeListColor(DEFAULT_ENTITY_FOLDER_COLOR),
      },
    ],
  });

  const afterCreate =
    getEntityConfig().entities.find((item) => item.id === input.entity.id) ??
    fresh;
  const tab =
    afterCreate.tabs.find((item) => item.id === created.id) ??
    findPreferredTkpFilesTab(afterCreate);

  if (!tab || !isEntityFilesTab(tab)) {
    throw new Error(
      "Не удалось создать вкладку «Файлы» на сущности. Добавьте её в настройках сущности.",
    );
  }

  const nextRecord =
    afterCreate.records.find((item) => item.id === input.record.id) ?? record;

  return {
    entity: afterCreate,
    record: nextRecord,
    tab,
    createdTab: true,
  };
}
