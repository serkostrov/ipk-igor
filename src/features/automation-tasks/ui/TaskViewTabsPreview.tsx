import { useMemo, useState, type ReactNode } from "react";
import {
  ClipboardPen,
  ExternalLink,
  FileText,
  Folder,
  History,
  LayoutGrid,
  Link2,
  StickyNote,
  Table2,
} from "lucide-react";
import {
  entityRelationIncludesId,
  filterEntityFieldGroupsForTab,
  formatEntityFileSize,
  getEntityFieldDisplayName,
  getEntityFieldGroupArea,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  getEntityFileDownloadUrl,
  getEntityTabFilesValueKey,
  getSystemUserNameByAuthId,
  groupEntityFields,
  isEntityFieldVisibleOnRecord,
  isEntityFilesTab,
  isEntityHistoryTab,
  isEntityMirrorTab,
  isEntityNameField,
  isEntityRecordsTab,
  isEntityTabWithLinkedEntity,
  parseEntityRelationIds,
  parseEntityTabFileEntries,
  PRIMARY_ENTITY_FIELD_GROUP,
  RecordNotesEditor,
  RecordValue,
  resolveEntityMirrorTab,
  serializeEntityTabFileEntries,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTab,
  type EntityTabFileEntry,
} from "@/entities/entity";
import { useEntityRecordEvents } from "@/entities/history";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";
import { cn } from "@/shared/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const FILES_ROOT_VALUE = "__root__";

const PREVIEW_LIMIT = 12;
/** Files tab in a task is meant for review — show a deeper tree. */
const FILES_PREVIEW_LIMIT = 80;
const FILL_TAB_ID = "__fill__";

type TaskViewTabsPreviewProps = {
  entity: Entity;
  record: EntityRecord;
  tabIds: string[];
  /**
   * For files tabs: default-folder ids to show.
   * Missing / empty for a tab = entire tab.
   */
  filesTabEntryIds?: Record<string, string[]>;
  /** Allow moving files between folders on files tabs. */
  filesTabAllowMove?: boolean;
  /** When set, adds a leading «Заполнить» tab with this content. */
  fillSlot?: ReactNode;
  /** Optional badge on the fill tab (e.g. remaining required count). */
  fillBadge?: ReactNode;
  className?: string;
};

function folderPathLabel(
  byId: Map<string, EntityTabFileEntry>,
  folderId: string,
): string {
  const parts: string[] = [];
  let cursor: EntityTabFileEntry | undefined = byId.get(folderId);
  const seen = new Set<string>();
  while (cursor && cursor.kind === "folder") {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    parts.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return parts.join(" / ") || "Папка";
}

/**
 * Resolve selected default-folder ids to record file entries: matched folders
 * (by name) plus their descendants. Empty selection = no filter.
 */
function filterFilesTabEntries(
  entries: EntityTabFileEntry[],
  tab: EntityTab,
  selectedFolderIds: string[] | undefined,
): EntityTabFileEntry[] {
  if (!selectedFolderIds || selectedFolderIds.length === 0) return entries;
  const selectedNames = new Set(
    tab.defaultFolders
      .filter((folder) => selectedFolderIds.includes(folder.id))
      .map((folder) => folder.name.trim().toLocaleLowerCase("ru"))
      .filter(Boolean),
  );
  if (selectedNames.size === 0) return entries;

  const matchedFolders = entries.filter(
    (entry) =>
      entry.kind === "folder" &&
      selectedNames.has(entry.name.trim().toLocaleLowerCase("ru")),
  );
  if (matchedFolders.length === 0) return [];

  const allowed = new Set(matchedFolders.map((folder) => folder.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of entries) {
      if (
        entry.parentId &&
        allowed.has(entry.parentId) &&
        !allowed.has(entry.id)
      ) {
        allowed.add(entry.id);
        grew = true;
      }
    }
  }
  return entries.filter((entry) => allowed.has(entry.id));
}

function compareFileEntries(a: EntityTabFileEntry, b: EntityTabFileEntry) {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name, "ru");
}

/** Root rows for preview: selected folders, or real roots when unfiltered. */
function filesPreviewRoots(
  entries: EntityTabFileEntry[],
  filtered: EntityTabFileEntry[],
  selectedFolderIds: string[] | undefined,
): EntityTabFileEntry[] {
  const filteredIds = new Set(filtered.map((entry) => entry.id));
  const source =
    selectedFolderIds && selectedFolderIds.length > 0 ? filtered : entries;
  return source
    .filter((entry) => {
      if (!filteredIds.has(entry.id) && filtered !== entries) return false;
      if (!entry.parentId) return true;
      // Selected nested folder: show as a root row in the task preview.
      return (
        selectedFolderIds != null &&
        selectedFolderIds.length > 0 &&
        entry.kind === "folder" &&
        !filteredIds.has(entry.parentId)
      );
    })
    .slice()
    .sort(compareFileEntries);
}

/** Flatten folder → nested folders + files under each root. */
function collectFilesPreviewRows(
  scope: EntityTabFileEntry[],
  roots: EntityTabFileEntry[],
): { entry: EntityTabFileEntry; depth: number }[] {
  const byParent = new Map<string | null, EntityTabFileEntry[]>();
  for (const entry of scope) {
    const key = entry.parentId;
    const list = byParent.get(key);
    if (list) list.push(entry);
    else byParent.set(key, [entry]);
  }
  for (const list of byParent.values()) {
    list.sort(compareFileEntries);
  }

  const rows: { entry: EntityTabFileEntry; depth: number }[] = [];
  const visit = (entry: EntityTabFileEntry, depth: number) => {
    rows.push({ entry, depth });
    if (entry.kind !== "folder") return;
    for (const child of byParent.get(entry.id) ?? []) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots) {
    visit(root, 0);
  }
  return rows;
}

function TabKindIcon({ tab }: { tab: EntityTab }) {
  if (isEntityFilesTab(tab)) return <Folder className="size-3.5" aria-hidden />;
  if (isEntityHistoryTab(tab))
    return <History className="size-3.5" aria-hidden />;
  if (isEntityRecordsTab(tab))
    return <StickyNote className="size-3.5" aria-hidden />;
  if (isEntityMirrorTab(tab)) return <Link2 className="size-3.5" aria-hidden />;
  if (isEntityTabWithLinkedEntity(tab))
    return <Table2 className="size-3.5" aria-hidden />;
  return <LayoutGrid className="size-3.5" aria-hidden />;
}

function EmptyPreview({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function RecordsPreview({
  entity,
  record,
  tab,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
}) {
  return (
    <RecordNotesEditor
      entity={entity}
      record={record}
      tab={tab}
      limit={PREVIEW_LIMIT}
      compact
    />
  );
}

function FilesPreview({
  entity,
  record,
  tab,
  selectedFolderIds,
  allowMove = false,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  selectedFolderIds?: string[];
  allowMove?: boolean;
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const valueKey = getEntityTabFilesValueKey(tab.id);
  const entries = useMemo(
    () => parseEntityTabFileEntries(record.values[valueKey]),
    [record.values, valueKey],
  );

  const filtered = useMemo(
    () => filterFilesTabEntries(entries, tab, selectedFolderIds),
    [entries, selectedFolderIds, tab],
  );

  const rows = useMemo(() => {
    const roots = filesPreviewRoots(entries, filtered, selectedFolderIds);
    return collectFilesPreviewRows(filtered, roots);
  }, [entries, filtered, selectedFolderIds]);

  const byId = useMemo(() => {
    const map = new Map<string, EntityTabFileEntry>();
    for (const entry of entries) map.set(entry.id, entry);
    return map;
  }, [entries]);

  const moveTargets = useMemo(() => {
    const folders = filtered
      .filter((entry) => entry.kind === "folder")
      .slice()
      .sort((a, b) =>
        folderPathLabel(byId, a.id).localeCompare(
          folderPathLabel(byId, b.id),
          "ru",
        ),
      );
    return folders.map((folder) => ({
      id: folder.id,
      label: folderPathLabel(byId, folder.id),
    }));
  }, [byId, filtered]);

  const allowRootMove =
    allowMove && !(selectedFolderIds && selectedFolderIds.length > 0);

  const fileCount = useMemo(
    () =>
      rows.reduce(
        (count, row) => count + (row.entry.kind === "file" ? 1 : 0),
        0,
      ),
    [rows],
  );

  const shown = rows.slice(0, FILES_PREVIEW_LIMIT);
  const rest = rows.length - shown.length;
  const hasFilter = (selectedFolderIds?.length ?? 0) > 0;

  async function openFile(entry: EntityTabFileEntry) {
    if (entry.kind !== "file") return;
    setActionError(null);
    setOpeningId(entry.id);
    try {
      if (entry.dataUrl) {
        window.open(entry.dataUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (!entry.storagePath) {
        throw new Error("Файл недоступен");
      }
      const url = await getEntityFileDownloadUrl(entry.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Не удалось открыть файл",
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function moveFile(
    entry: EntityTabFileEntry,
    nextParentId: string | null,
  ) {
    if (entry.kind !== "file") return;
    const currentParent = entry.parentId ?? null;
    if (currentParent === nextParentId) return;

    if (nextParentId) {
      const target = byId.get(nextParentId);
      if (!target || target.kind !== "folder") {
        setActionError("Папка назначения не найдена");
        return;
      }
    } else if (!allowRootMove) {
      setActionError("В выбранных папках корень недоступен");
      return;
    }

    const conflict = entries.some(
      (item) =>
        item.id !== entry.id &&
        item.kind === "file" &&
        (item.parentId ?? null) === nextParentId &&
        item.name.trim().toLocaleLowerCase("ru") ===
          entry.name.trim().toLocaleLowerCase("ru"),
    );
    if (conflict) {
      setActionError("В этой папке уже есть файл с таким именем");
      return;
    }

    setActionError(null);
    setMovingId(entry.id);
    try {
      const nextEntries = entries.map((item) =>
        item.id === entry.id ? { ...item, parentId: nextParentId } : item,
      );
      await updateEntityRecord(entity.id, record.id, {
        ...record.values,
        [valueKey]: serializeEntityTabFileEntries(nextEntries),
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Не удалось переместить файл",
      );
    } finally {
      setMovingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyPreview>
        {hasFilter ? "Выбранные папки пусты или не найдены" : "Файлов пока нет"}
      </EmptyPreview>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-muted-foreground">
          {fileCount > 0
            ? `${fileCount} ${pluralRu(fileCount, "файл", "файла", "файлов")}`
            : "Только папки — файлов пока нет"}
          {hasFilter ? " · выбранные папки" : ""}
          {allowMove ? " · можно перемещать" : ""}
        </p>
      </div>
      {actionError ? (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {actionError}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {shown.map(({ entry, depth }) => {
          const isFile = entry.kind === "file";
          const sizeLabel = isFile ? formatEntityFileSize(entry.size) : "";
          const canOpen = isFile && Boolean(entry.dataUrl || entry.storagePath);
          const indent = Math.min(depth, 6) * 14;
          const folderValue = entry.parentId ?? FILES_ROOT_VALUE;
          const currentFolderLabel = entry.parentId
            ? folderPathLabel(byId, entry.parentId)
            : "Корень";

          if (isFile) {
            return (
              <li key={entry.id} style={{ paddingLeft: indent }}>
                <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-2">
                  <button
                    type="button"
                    disabled={!canOpen || openingId === entry.id}
                    onClick={() => void openFile(entry)}
                    className={cn(
                      "flex w-full items-center gap-2.5 text-left text-sm transition-colors",
                      canOpen ? "hover:text-primary" : "opacity-70",
                    )}
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {entry.name}
                    </span>
                    {sizeLabel ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {sizeLabel}
                      </span>
                    ) : null}
                    {canOpen ? (
                      <ExternalLink
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  {allowMove && (moveTargets.length > 0 || allowRootMove) ? (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                        Папка
                      </span>
                      <Select
                        value={folderValue}
                        disabled={movingId === entry.id}
                        onValueChange={(next) => {
                          if (next == null) return;
                          const parentId =
                            String(next) === FILES_ROOT_VALUE
                              ? null
                              : String(next);
                          void moveFile(entry, parentId);
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-7 min-w-0 flex-1 bg-muted/20 text-xs"
                        >
                          <SelectValue placeholder="Папка">
                            {currentFolderLabel}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start">
                          {allowRootMove ? (
                            <SelectItem value={FILES_ROOT_VALUE}>
                              Корень
                            </SelectItem>
                          ) : null}
                          {moveTargets.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          }

          return (
            <li
              key={entry.id}
              className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm"
              style={{ marginLeft: indent }}
            >
              <Folder
                className={cn(
                  "size-4 shrink-0",
                  !entry.color && "text-muted-foreground",
                )}
                style={entry.color ? { color: entry.color } : undefined}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {entry.name}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                папка
              </span>
            </li>
          );
        })}
        {rest > 0 ? (
          <li className="py-1 text-center text-[11px] text-muted-foreground">
            и ещё {rest}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function historyActionLabel(
  entity: Entity,
  action: "insert" | "update" | "delete",
  changes: Record<string, { old: string | null; new: string | null }>,
) {
  if (action === "insert") return "Создание записи";
  if (action === "delete") return "Удаление записи";
  const fieldIds = Object.keys(changes).filter((key) =>
    entity.fields.some((field) => field.id === key),
  );
  if (fieldIds.length === 0) {
    const count = Object.keys(changes).length;
    return count > 0 ? `Изменено: ${count}` : "Изменение записи";
  }
  const names = fieldIds.slice(0, 2).map((id) => {
    const field = entity.fields.find((item) => item.id === id);
    return field ? getEntityFieldDisplayName(field) : id;
  });
  const extra = fieldIds.length - names.length;
  return `Изменено: ${names.join(", ")}${extra > 0 ? ` · +${extra}` : ""}`;
}

function HistoryPreview({
  entity,
  record,
}: {
  entity: Entity;
  record: EntityRecord;
}) {
  const { entities } = useEntityConfig();
  const { events, status } = useEntityRecordEvents({ recordId: record.id });
  const shown = events.slice(0, PREVIEW_LIMIT);
  const rest = events.length - shown.length;

  if (status === "loading" && events.length === 0) {
    return <EmptyPreview>Загрузка истории…</EmptyPreview>;
  }
  if (events.length === 0) {
    return <EmptyPreview>Событий пока нет</EmptyPreview>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {shown.map((event) => {
        const actor =
          getSystemUserNameByAuthId(entities, event.actorId) ??
          (event.actorId ? "Пользователь" : "Система");
        return (
          <li
            key={event.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2.5"
          >
            <p className="text-[11px] text-muted-foreground">
              {actor}
              {" · "}
              {formatTimestampDisplay(event.createdAt)}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-foreground">
              {historyActionLabel(entity, event.action, event.changes)}
            </p>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-center text-[11px] text-muted-foreground">
          и ещё {rest}
        </li>
      ) : null}
    </ul>
  );
}

function FieldsPreview({
  entity,
  record,
  tab,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
}) {
  const valueContext = useEntityValueContext();
  const groups = useMemo(() => {
    const fields = entity.fields.filter((field) => {
      if (isEntityNameField(field)) return false;
      if (!isEntityFieldVisibleOnRecord(field)) return false;
      const groupName = getEntityFieldGroupName(field.group);
      if (groupName === PRIMARY_ENTITY_FIELD_GROUP) return false;
      if (
        getEntityFieldGroupArea(groupName, entity.fieldGroups) === "primary"
      ) {
        return false;
      }
      return getEntityFieldTabId(field) === tab.id;
    });
    return groupEntityFields(
      fields,
      filterEntityFieldGroupsForTab(entity.fieldGroups, tab.id, fields),
    ).filter((group) => group.fields.length > 0);
  }, [entity, tab.id]);

  if (groups.length === 0) {
    return <EmptyPreview>На этой вкладке нет полей</EmptyPreview>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.name}
          className="overflow-hidden rounded-lg border border-border/60 bg-background"
        >
          <header className="flex h-8 items-center border-b border-border/60 bg-muted/30 px-3">
            <h3 className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {group.name}
            </h3>
          </header>
          <div className="divide-y divide-border/50">
            {group.fields.map((field: EntityField) => (
              <div
                key={field.id}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-start gap-2 px-3 py-2"
              >
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  {getEntityFieldDisplayName(field)}
                </p>
                <RecordValue
                  ctx={valueContext}
                  entity={entity}
                  record={record}
                  field={field}
                  className="text-sm text-foreground"
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LinkedEntityPreview({
  tab,
  parentEntityId,
  parentRecordId,
}: {
  tab: EntityTab;
  parentEntityId: string;
  parentRecordId: string;
}) {
  const { entities } = useEntityConfig();
  const linkedEntity =
    entities.find((item) => item.id === tab.linkedEntityId) ?? null;
  const parentLinkFieldId = tab.parentLinkFieldId;

  const records = useMemo(() => {
    if (!linkedEntity || !parentLinkFieldId) return [];
    const isSelfRef = linkedEntity.id === parentEntityId;
    const parentRecord = isSelfRef
      ? (linkedEntity.records.find((item) => item.id === parentRecordId) ??
        null)
      : null;
    const outgoingIds = parseEntityRelationIds(
      parentRecord?.values[parentLinkFieldId],
    );

    return (linkedEntity.records ?? []).filter((item) => {
      if (item.id === parentRecordId) return false;
      if (
        entityRelationIncludesId(item.values[parentLinkFieldId], parentRecordId)
      ) {
        return true;
      }
      if (isSelfRef && outgoingIds.includes(item.id)) return true;
      return false;
    });
  }, [linkedEntity, parentEntityId, parentLinkFieldId, parentRecordId]);

  if (!linkedEntity) {
    return <EmptyPreview>Связанная сущность не найдена</EmptyPreview>;
  }
  if (!parentLinkFieldId) {
    return <EmptyPreview>Не настроено поле связи вкладки</EmptyPreview>;
  }
  if (records.length === 0) {
    return <EmptyPreview>Связанных записей пока нет</EmptyPreview>;
  }

  const nameField =
    linkedEntity.fields.find((field) => isEntityNameField(field)) ?? null;
  const shown = records.slice(0, PREVIEW_LIMIT);
  const rest = records.length - shown.length;

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((item) => {
        const title = nameField
          ? item.values[nameField.id]?.trim() || "Без названия"
          : item.id;
        return (
          <li
            key={item.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground"
          >
            <span className="line-clamp-2">{title}</span>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-center text-[11px] text-muted-foreground">
          и ещё {rest}
        </li>
      ) : null}
    </ul>
  );
}

function MirrorPreview({
  hostEntity,
  hostRecord,
  tab,
}: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  tab: EntityTab;
}) {
  const { entities } = useEntityConfig();
  const resolved = resolveEntityMirrorTab(
    tab,
    hostEntity,
    hostRecord,
    entities,
  );

  if (!resolved) {
    return (
      <EmptyPreview>
        Настройте поле связи и вкладку источника для этой вкладки
      </EmptyPreview>
    );
  }

  const { relationField, sourceEntity, sourceTab, sourceRecord } = resolved;
  if (!sourceRecord) {
    return (
      <EmptyPreview>
        В поле «{getEntityFieldDisplayName(relationField)}» не выбрана запись
      </EmptyPreview>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Данные записи · вкладка «{sourceTab.name.trim() || "Вкладка"}»
      </p>
      <TabPreviewBody
        entity={sourceEntity}
        record={sourceRecord}
        tab={sourceTab}
        depth={1}
      />
    </div>
  );
}

function TabPreviewBody({
  entity,
  record,
  tab,
  filesTabEntryIds,
  filesTabAllowMove = false,
  depth = 0,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  filesTabEntryIds?: Record<string, string[]>;
  filesTabAllowMove?: boolean;
  /** Prevent infinite mirror → mirror recursion. */
  depth?: number;
}) {
  if (isEntityRecordsTab(tab)) {
    return <RecordsPreview entity={entity} record={record} tab={tab} />;
  }
  if (isEntityFilesTab(tab)) {
    return (
      <FilesPreview
        entity={entity}
        record={record}
        tab={tab}
        selectedFolderIds={filesTabEntryIds?.[tab.id]}
        allowMove={filesTabAllowMove}
      />
    );
  }
  if (isEntityHistoryTab(tab)) {
    return <HistoryPreview entity={entity} record={record} />;
  }
  if (isEntityMirrorTab(tab)) {
    if (depth > 0) {
      return <EmptyPreview>Вложенное зеркало недоступно в задаче</EmptyPreview>;
    }
    return <MirrorPreview hostEntity={entity} hostRecord={record} tab={tab} />;
  }
  if (isEntityTabWithLinkedEntity(tab)) {
    return (
      <LinkedEntityPreview
        tab={tab}
        parentEntityId={entity.id}
        parentRecordId={record.id}
      />
    );
  }
  return <FieldsPreview entity={entity} record={record} tab={tab} />;
}

/**
 * Task form shell: «Заполнить» + read-only card tabs from «Просмотреть вкладки».
 * Switches via tabs when view tabs (or fill + view tabs) are configured.
 */
export function TaskViewTabsPreview({
  entity,
  record,
  tabIds,
  filesTabEntryIds,
  filesTabAllowMove = false,
  fillSlot,
  fillBadge,
  className,
}: TaskViewTabsPreviewProps) {
  const viewTabs = useMemo(
    () =>
      tabIds
        .map((id) => entity.tabs.find((tab) => tab.id === id))
        .filter((tab): tab is EntityTab => tab != null),
    [entity.tabs, tabIds],
  );

  const hasFill = fillSlot != null;
  const defaultTab = hasFill ? FILL_TAB_ID : (viewTabs[0]?.id ?? FILL_TAB_ID);
  const [tab, setTab] = useState(defaultTab);
  const [hadFill, setHadFill] = useState(hasFill);

  // When «Заполнить» appears after choosing an outcome, open it.
  if (hasFill !== hadFill) {
    setHadFill(hasFill);
    if (hasFill) setTab(FILL_TAB_ID);
  }

  // Only fill, no view tabs — render form as-is.
  if (viewTabs.length === 0) {
    return fillSlot ? (
      <div
        className={cn(
          "rounded-xl border border-border/70 bg-card px-3 py-3 shadow-xs",
          className,
        )}
      >
        {fillSlot}
      </div>
    ) : null;
  }

  const active =
    (hasFill && tab === FILL_TAB_ID) || viewTabs.some((item) => item.id === tab)
      ? tab
      : hasFill
        ? FILL_TAB_ID
        : (viewTabs[0]?.id ?? FILL_TAB_ID);

  const triggerClass =
    "!h-auto min-h-0 flex-none gap-1.5 self-stretch rounded-md px-3 text-sm font-medium transition-colors data-active:shadow-sm";

  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        if (typeof next === "string" && next) setTab(next);
      }}
      className={cn("flex min-h-0 flex-col gap-4", className)}
    >
      <div className="flex h-9 w-full shrink-0 items-stretch overflow-x-auto rounded-lg bg-muted p-1">
        <TabsList className="!h-auto min-h-0 w-auto flex-none items-stretch justify-start gap-0.5 self-stretch bg-transparent p-0">
          {hasFill ? (
            <TabsTrigger value={FILL_TAB_ID} className={triggerClass}>
              <ClipboardPen
                className="size-3.5 shrink-0 opacity-70"
                aria-hidden
              />
              <span className="truncate">Заполнить</span>
              {fillBadge}
            </TabsTrigger>
          ) : null}
          {viewTabs.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className={triggerClass}>
              <span className="shrink-0 opacity-70">
                <TabKindIcon tab={item} />
              </span>
              <span className="max-w-[10rem] truncate">
                {item.name.trim() || "Вкладка"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {hasFill ? (
        <TabsContent
          value={FILL_TAB_ID}
          className="mt-0 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-card px-3 py-3 shadow-xs"
        >
          {fillSlot}
        </TabsContent>
      ) : null}

      {viewTabs.map((item) => (
        <TabsContent
          key={item.id}
          value={item.id}
          className="mt-0 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-card px-3 py-3 shadow-xs"
        >
          <TabPreviewBody
            entity={entity}
            record={record}
            tab={item}
            filesTabEntryIds={filesTabEntryIds}
            filesTabAllowMove={filesTabAllowMove}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
