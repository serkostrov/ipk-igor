import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  LayoutGrid,
  LayoutList,
  Paperclip,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  buildEntityTabDefaultFileEntries,
  DEFAULT_ENTITY_FOLDER_COLOR,
  DEFAULT_ENTITY_LIST_COLORS,
  deleteEntityFileObject,
  downloadEntityFileFromUrl,
  EntityFileThumb,
  EntityFileViewer,
  formatEntityFileSize,
  getEntityTabFilesValueKey,
  normalizeListColor,
  parseEntityTabFileEntries,
  resolveEntityFileUrl,
  serializeEntityTabFileEntries,
  updateEntityRecord,
  uploadEntityFile,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTabFileEntry,
} from "@/entities/entity";
import {
  formatDatetimeDisplay,
  formatTimestampDisplay,
} from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";
import { isTkpAnalysisEntity } from "@/features/hardcode";
import {
  clearTkpPriceBindKeys,
  resolveTkpFilePriceHistoryId,
} from "@/features/hardcode/tkp-review/lib/tkp-file-bind";

type RecordFilesTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

type RenameState = {
  entry: EntityTabFileEntry;
  name: string;
  color: string;
} | null;

function resolveFolderColor(color: string | undefined) {
  return normalizeListColor(color ?? DEFAULT_ENTITY_FOLDER_COLOR);
}

function FolderColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const color = resolveFolderColor(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Цвет</Label>
      <div className="flex items-center gap-2">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
          }}
          aria-hidden
        >
          <Folder className="size-4 stroke-[1.5]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {DEFAULT_ENTITY_LIST_COLORS.map((swatch) => {
            const selected = color === swatch;
            return (
              <button
                key={swatch}
                type="button"
                title={swatch}
                aria-label={`Цвет ${swatch}`}
                aria-pressed={selected}
                onClick={() => onChange(swatch)}
                className={cn(
                  "relative size-5 shrink-0 rounded-full border border-black/10 shadow-xs transition-transform hover:scale-110",
                  selected && "outline-2 outline-offset-1 outline-ring",
                )}
                style={{ backgroundColor: swatch }}
              >
                {selected ? (
                  <Check
                    className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatEntryTime(value: string) {
  const iso = value.trim();
  if (!iso) return "";
  // Prefer timestamptz → Moscow; fall back for naive stored datetimes.
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) &&
    /Z|[+-]\d{2}:\d{2}$/.test(iso)
  ) {
    return formatTimestampDisplay(iso) || iso;
  }
  return formatDatetimeDisplay(iso) || iso;
}

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

function formatFolderContents(folders: number, files: number) {
  if (folders === 0 && files === 0) return "Пусто";
  return [
    folders > 0
      ? `${folders} ${pluralRu(folders, "папка", "папки", "папок")}`
      : null,
    files > 0 ? `${files} ${pluralRu(files, "файл", "файла", "файлов")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function RecordFilesTabPanel({
  entity,
  record,
  tab,
}: RecordFilesTabPanelProps) {
  const valueKey = getEntityTabFilesValueKey(tab.id);
  const entries = useMemo(
    () => parseEntityTabFileEntries(record.values[valueKey]),
    [record.values, valueKey],
  );
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  );
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState<string>(
    DEFAULT_ENTITY_FOLDER_COLOR,
  );
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [folderQuery, setFolderQuery] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const seededRef = useRef(false);

  // Existing empty records: seed configured default folders once.
  useEffect(() => {
    if (seededRef.current) return;
    if (record.values[valueKey] !== undefined) return;
    if (tab.defaultFolders.length === 0) return;
    seededRef.current = true;
    const seeded = buildEntityTabDefaultFileEntries(tab.defaultFolders);
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      [valueKey]: serializeEntityTabFileEntries(seeded),
    });
  }, [entity.id, record.id, record.values, tab.defaultFolders, valueKey]);

  const byId = useMemo(() => {
    const map = new Map<string, EntityTabFileEntry>();
    for (const entry of entries) map.set(entry.id, entry);
    return map;
  }, [entries]);

  const currentFolder = folderId != null ? (byId.get(folderId) ?? null) : null;

  // If current folder was deleted, fall back to root.
  const resolvedFolderId =
    folderId != null && currentFolder?.kind === "folder" ? folderId : null;

  function navigateToFolder(nextFolderId: string | null) {
    setSelectedIds([]);
    setFolderId(nextFolderId);
  }

  const breadcrumbs = useMemo(() => {
    const trail: EntityTabFileEntry[] = [];
    let cursor = resolvedFolderId;
    while (cursor) {
      const item = byId.get(cursor);
      if (!item || item.kind !== "folder") break;
      trail.unshift(item);
      cursor = item.parentId;
    }
    return trail;
  }, [byId, resolvedFolderId]);

  const rootFolders = useMemo(() => {
    return entries
      .filter((entry) => entry.kind === "folder" && entry.parentId == null)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [entries]);

  const rootFolderQuery = folderQuery.trim().toLocaleLowerCase("ru");
  const filteredRootFolders = useMemo(() => {
    if (!rootFolderQuery) return rootFolders;
    return rootFolders.filter((folder) =>
      folder.name.toLocaleLowerCase("ru").includes(rootFolderQuery),
    );
  }, [rootFolderQuery, rootFolders]);

  /** Root folder highlighted in the sidebar (ancestor of current path). */
  const sidebarRootId = useMemo(() => {
    if (!resolvedFolderId) return null;
    let cursor: string | null = resolvedFolderId;
    let root: string | null = resolvedFolderId;
    while (cursor) {
      const item = byId.get(cursor);
      if (!item || item.kind !== "folder") break;
      root = item.id;
      cursor = item.parentId;
    }
    return root;
  }, [byId, resolvedFolderId]);

  const visibleEntries = useMemo(() => {
    // Root ("Без папки"): only loose files — folders live in the sidebar.
    const items = entries.filter((entry) => {
      if (entry.parentId !== resolvedFolderId) return false;
      if (resolvedFolderId == null && entry.kind === "folder") return false;
      return true;
    });
    return items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [entries, resolvedFolderId]);

  const viewerFiles = useMemo(
    () => visibleEntries.filter((entry) => entry.kind === "file"),
    [visibleEntries],
  );

  const siblingNames = visibleEntries.map((entry) => entry.name);

  const childCounts = useMemo(() => {
    const map = new Map<string, { folders: number; files: number }>();
    for (const entry of entries) {
      if (!entry.parentId) continue;
      const current = map.get(entry.parentId) ?? { folders: 0, files: 0 };
      if (entry.kind === "folder") current.folders += 1;
      else current.files += 1;
      map.set(entry.parentId, current);
    }
    return map;
  }, [entries]);

  const rootLooseFiles = useMemo(
    () =>
      entries.filter((entry) => entry.kind === "file" && entry.parentId == null)
        .length,
    [entries],
  );

  function persist(next: EntityTabFileEntry[]) {
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      [valueKey]: serializeEntityTabFileEntries(next),
    });
  }

  function collectDescendantIds(rootId: string) {
    const ids = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const entry of entries) {
        if (entry.parentId && ids.has(entry.parentId) && !ids.has(entry.id)) {
          ids.add(entry.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  async function handleCreateFolder() {
    const name = uniqueName(
      folderName.trim() || "Новая папка",
      siblingNames,
      true,
    );
    const entry: EntityTabFileEntry = {
      id: crypto.randomUUID(),
      name,
      kind: "folder",
      parentId: resolvedFolderId,
      createdAt: new Date().toISOString(),
      color: resolveFolderColor(folderColor),
    };
    persist([...entries, entry]);
    setFolderName("");
    setFolderColor(DEFAULT_ENTITY_FOLDER_COLOR);
    setFolderDialogOpen(false);
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const next = [...entries];
      const names = siblingNames.slice();
      const bindPriceHistoryId = isTkpAnalysisEntity(entity)
        ? resolveTkpFilePriceHistoryId({
            entries,
            parentId: resolvedFolderId,
            recordValues: record.values,
          })
        : null;
      let boundAny = false;

      for (const file of Array.from(files)) {
        const entryId = crypto.randomUUID();
        const name = uniqueName(file.name || "Файл", names, false);
        names.push(name);

        const uploaded = await uploadEntityFile({
          entityId: entity.id,
          recordId: record.id,
          tabId: tab.id,
          entryId,
          file,
        });

        const fileEntry: EntityTabFileEntry = {
          id: entryId,
          name,
          kind: "file",
          parentId: resolvedFolderId,
          createdAt: new Date().toISOString(),
          mimeType: file.type || undefined,
          size: file.size,
          storagePath: uploaded.storagePath,
          dataUrl: uploaded.dataUrl,
        };
        if (bindPriceHistoryId) {
          fileEntry.priceHistoryId = bindPriceHistoryId;
          boundAny = true;
        }
        next.push(fileEntry);
      }

      if (boundAny) {
        updateEntityRecord(entity.id, record.id, {
          ...clearTkpPriceBindKeys(record.values),
          [valueKey]: serializeEntityTabFileEntries(next),
        });
      } else {
        persist(next);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить файл",
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleOpenFile(entry: EntityTabFileEntry) {
    if (entry.kind !== "file") return;
    setError(null);
    setViewerId(entry.id);
  }

  async function handleDownload(entry: EntityTabFileEntry) {
    setError(null);
    try {
      const href = await resolveEntityFileUrl(entry);
      downloadEntityFileFromUrl(href, entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скачать файл");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function selectAllVisible() {
    setSelectedIds(visibleEntries.map((entry) => entry.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
    const targets = pendingDeleteIds;
    setPendingDeleteIds(null);
    setBusy(true);
    setError(null);

    try {
      const removeIds = new Set<string>();
      for (const id of targets) {
        for (const descendantId of collectDescendantIds(id)) {
          removeIds.add(descendantId);
        }
      }

      const removed = entries.filter((entry) => removeIds.has(entry.id));
      for (const entry of removed) {
        if (entry.kind === "file" && entry.storagePath) {
          await deleteEntityFileObject(entry.storagePath);
        }
      }

      persist(entries.filter((entry) => !removeIds.has(entry.id)));
      setSelectedIds((current) => current.filter((id) => !removeIds.has(id)));

      if (resolvedFolderId && removeIds.has(resolvedFolderId)) {
        navigateToFolder(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  function handleRenameSubmit() {
    if (!renameState) return;
    const nextName = renameState.name.trim();
    if (!nextName) return;

    const conflict = entries.some(
      (entry) =>
        entry.id !== renameState.entry.id &&
        entry.parentId === renameState.entry.parentId &&
        entry.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (conflict) {
      setError("Имя уже используется в этой папке");
      return;
    }

    persist(
      entries.map((entry) => {
        if (entry.id !== renameState.entry.id) return entry;
        if (entry.kind === "folder") {
          return {
            ...entry,
            name: nextName,
            color: resolveFolderColor(renameState.color),
          };
        }
        return { ...entry, name: nextName };
      }),
    );
    setRenameState(null);
    setError(null);
  }

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    visibleEntries.length > 0 &&
    visibleEntries.every((entry) => selectedSet.has(entry.id));
  const selectedCount = selectedIds.length;
  const pendingDeleteEntries = useMemo(() => {
    if (!pendingDeleteIds) return [];
    return pendingDeleteIds
      .map((id) => byId.get(id))
      .filter((entry): entry is EntityTabFileEntry => entry != null);
  }, [byId, pendingDeleteIds]);

  const currentTitle =
    currentFolder?.kind === "folder" ? currentFolder.name : "Без папки";
  const itemSummary =
    visibleEntries.length === 0
      ? "0 элем."
      : `${visibleEntries.length} ${pluralRu(visibleEntries.length, "элемент", "элемента", "элементов")}`;

  function openCreateFolderDialog() {
    setFolderName("Новая папка");
    setFolderColor(DEFAULT_ENTITY_FOLDER_COLOR);
    setFolderDialogOpen(true);
  }

  function renderEntryActions(entry: EntityTabFileEntry) {
    const isFolder = entry.kind === "folder";
    return (
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
        {!isFolder ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground"
            aria-label="Скачать"
            disabled={busy}
            onClick={() => void handleDownload(entry)}
          >
            <Download className="size-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground"
          aria-label="Переименовать"
          disabled={busy}
          onClick={() =>
            setRenameState({
              entry,
              name: entry.name,
              color: resolveFolderColor(entry.color),
            })
          }
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Удалить"
          disabled={busy}
          onClick={() => setPendingDeleteIds([entry.id])}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  function activateEntry(
    entry: EntityTabFileEntry,
    event?: { metaKey?: boolean; ctrlKey?: boolean },
  ) {
    if (selectedCount > 0 || event?.metaKey || event?.ctrlKey) {
      toggleSelected(entry.id);
      return;
    }
    if (entry.kind === "folder") {
      navigateToFolder(entry.id);
      return;
    }
    handleOpenFile(entry);
  }

  return (
    <section className="flex min-h-[28rem] overflow-hidden rounded-xl border border-border bg-card">
      {/* Folder sidebar */}
      <aside className="flex w-[min(17.5rem,38%)] shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex items-center gap-1.5 border-b border-border/80 p-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={folderQuery}
              onChange={(event) => setFolderQuery(event.target.value)}
              placeholder="Поиск папок"
              className="h-8 bg-background pl-8 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            aria-label="Новая папка"
            title="Новая папка"
            disabled={busy}
            onClick={() => {
              navigateToFolder(null);
              openCreateFolderDialog();
            }}
          >
            <FolderPlus className="size-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              sidebarRootId == null
                ? "bg-primary/10 text-foreground"
                : "text-foreground/90 hover:bg-muted/80",
            )}
            onClick={() => navigateToFolder(null)}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <LayoutGrid className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              Без папки
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {rootLooseFiles}
            </span>
          </button>

          {filteredRootFolders.length > 0 ? (
            <p className="mt-2 mb-1 px-2.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Папки
            </p>
          ) : null}

          <ul className="flex flex-col gap-0.5">
            {filteredRootFolders.map((folder) => {
              const accent = resolveFolderColor(folder.color);
              const counts = childCounts.get(folder.id) ?? {
                folders: 0,
                files: 0,
              };
              const total = counts.folders + counts.files;
              const active = sidebarRootId === folder.id;
              return (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/80",
                    )}
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
                        color: accent,
                      }}
                    >
                      <Folder className="size-3.5 stroke-[1.5]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {folder.name}
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {rootFolders.length === 0 ? (
            <div className="mt-6 px-3 text-center">
              <p className="text-xs text-muted-foreground">
                Папок пока нет — создайте первую
              </p>
            </div>
          ) : filteredRootFolders.length === 0 ? (
            <p className="mt-4 px-3 text-center text-xs text-muted-foreground">
              Ничего не найдено
            </p>
          ) : null}
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight">
                  {currentTitle}
                </h2>
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {itemSummary}
                </span>
              </div>
              <nav
                className="mt-1 flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground"
                aria-label="Путь"
              >
                <button
                  type="button"
                  className={cn(
                    "truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground",
                    resolvedFolderId == null && "font-medium text-foreground",
                  )}
                  onClick={() => navigateToFolder(null)}
                >
                  Без папки
                </button>
                {breadcrumbs.map((crumb) => (
                  <span
                    key={crumb.id}
                    className="flex min-w-0 items-center gap-0.5"
                  >
                    <ChevronRight className="size-3 shrink-0 opacity-60" />
                    <button
                      type="button"
                      className={cn(
                        "truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground",
                        crumb.id === resolvedFolderId &&
                          "font-medium text-foreground",
                      )}
                      onClick={() => navigateToFolder(crumb.id)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-muted/40 p-0.5">
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="size-3.5" />
                Список
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  viewMode === "grid"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="size-3.5" />
                Плитка
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {selectedCount > 0 ? (
              <>
                <span className="mr-1 text-xs text-muted-foreground">
                  Выбрано: {selectedCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || visibleEntries.length === 0}
                  onClick={
                    allVisibleSelected ? clearSelection : selectAllVisible
                  }
                >
                  {allVisibleSelected ? "Снять все" : "Выбрать все"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={clearSelection}
                >
                  Отменить
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPendingDeleteIds(selectedIds)}
                >
                  <Trash2 className="size-3.5" />
                  Удалить
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Файл
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={openCreateFolderDialog}
                >
                  <FolderPlus className="size-3.5" />
                  Папка
                </Button>
                {visibleEntries.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={selectAllVisible}
                  >
                    Выбрать все
                  </Button>
                ) : null}
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          {error ? (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-dashed transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border/70",
              busy && "pointer-events-none opacity-70",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragDepthRef.current += 1;
              if (event.dataTransfer.types.includes("Files")) {
                setDragOver(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.dataTransfer.types.includes("Files")) {
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragDepthRef.current = 0;
              setDragOver(false);
              void handleUpload(event.dataTransfer.files);
            }}
          >
            {dragOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-primary/5 backdrop-blur-[1px]">
                <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/35 bg-background text-primary shadow-sm">
                  <Upload className="size-5" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Отпустите, чтобы загрузить
                </p>
              </div>
            ) : null}

            {visibleEntries.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 text-muted-foreground">
                  <Paperclip className="size-6 stroke-[1.5]" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">
                    Перетащите файлы сюда
                  </p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Или загрузите через кнопки — файлы появятся в текущей папке
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Загрузить файл
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={openCreateFolderDialog}
                  >
                    <FolderPlus className="size-3.5" />
                    Создать папку
                  </Button>
                </div>
              </div>
            ) : viewMode === "list" ? (
              <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {visibleEntries.map((entry) => {
                  const isFolder = entry.kind === "folder";
                  const selected = selectedSet.has(entry.id);
                  const counts = childCounts.get(entry.id) ?? {
                    folders: 0,
                    files: 0,
                  };
                  const meta = isFolder
                    ? formatFolderContents(counts.folders, counts.files)
                    : [
                        formatEntityFileSize(entry.size),
                        formatEntryTime(entry.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Файл";
                  const folderAccent = isFolder
                    ? resolveFolderColor(entry.color)
                    : null;

                  return (
                    <li key={entry.id}>
                      <div
                        className={cn(
                          "group/row flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                          selected ? "bg-primary/10" : "hover:bg-muted/60",
                        )}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/80 bg-background",
                          )}
                          aria-label={selected ? "Снять выбор" : "Выбрать"}
                          aria-pressed={selected}
                          disabled={busy}
                          onClick={() => toggleSelected(entry.id)}
                        >
                          {selected ? <Check className="size-2.5" /> : null}
                        </button>

                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
                          onClick={(event) => activateEntry(entry, event)}
                        >
                          {isFolder ? (
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-md"
                              style={
                                folderAccent
                                  ? {
                                      backgroundColor: `color-mix(in srgb, ${folderAccent} 14%, transparent)`,
                                      color: folderAccent,
                                    }
                                  : undefined
                              }
                            >
                              <Folder className="size-4 stroke-[1.5]" />
                            </span>
                          ) : (
                            <EntityFileThumb
                              key={entry.id}
                              name={entry.name}
                              mimeType={entry.mimeType}
                              storagePath={entry.storagePath}
                              dataUrl={entry.dataUrl}
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-sm font-medium text-foreground"
                              title={entry.name}
                            >
                              {entry.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {meta}
                            </span>
                          </span>
                          {isFolder ? (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                          ) : null}
                        </button>

                        {renderEntryActions(entry)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {visibleEntries.map((entry) => {
                  const isFolder = entry.kind === "folder";
                  const selected = selectedSet.has(entry.id);
                  const counts = childCounts.get(entry.id) ?? {
                    folders: 0,
                    files: 0,
                  };
                  const meta = isFolder
                    ? formatFolderContents(counts.folders, counts.files)
                    : formatEntityFileSize(entry.size) ||
                      formatEntryTime(entry.createdAt) ||
                      "Файл";
                  const folderAccent = isFolder
                    ? resolveFolderColor(entry.color)
                    : null;

                  return (
                    <li key={entry.id}>
                      <div
                        className={cn(
                          "group/row relative flex h-full min-h-[7.25rem] flex-col overflow-hidden rounded-xl border transition-colors",
                          selected
                            ? "border-primary ring-1 ring-primary/25"
                            : "border-border/70 hover:border-foreground/15",
                          !isFolder && "bg-muted/25",
                        )}
                        style={
                          folderAccent
                            ? {
                                backgroundColor: `color-mix(in srgb, ${folderAccent} ${selected ? "16%" : "10%"}, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className={cn(
                            "absolute top-2 left-2 z-10 flex size-4 items-center justify-center rounded-[4px] border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/80 bg-background/90 opacity-0 group-hover/row:opacity-100",
                          )}
                          aria-label={selected ? "Снять выбор" : "Выбрать"}
                          disabled={busy}
                          onClick={() => toggleSelected(entry.id)}
                        >
                          {selected ? <Check className="size-2.5" /> : null}
                        </button>
                        <div className="absolute top-1.5 right-1.5 z-10">
                          {renderEntryActions(entry)}
                        </div>
                        <button
                          type="button"
                          className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-4 text-center"
                          onClick={(event) => activateEntry(entry, event)}
                        >
                          {isFolder ? (
                            <span
                              className="flex size-10 items-center justify-center"
                              style={
                                folderAccent
                                  ? { color: folderAccent }
                                  : undefined
                              }
                            >
                              <Folder className="size-8 stroke-[1.4]" />
                            </span>
                          ) : (
                            <EntityFileThumb
                              key={entry.id}
                              name={entry.name}
                              mimeType={entry.mimeType}
                              storagePath={entry.storagePath}
                              dataUrl={entry.dataUrl}
                              className="size-14 rounded-lg"
                              iconClassName="size-7"
                            />
                          )}
                          <span
                            className="line-clamp-2 text-xs font-medium break-all"
                            title={entry.name}
                          >
                            {entry.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {meta}
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={folderDialogOpen}
        onOpenChange={(open) => {
          setFolderDialogOpen(open);
          if (!open) {
            setFolderName("");
            setFolderColor(DEFAULT_ENTITY_FOLDER_COLOR);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая папка</DialogTitle>
            <DialogDescription>
              Папка появится в текущем каталоге файловой системы записи.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity-files-folder-name">Название</Label>
              <Input
                id="entity-files-folder-name"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateFolder();
                  }
                }}
              />
            </div>
            <FolderColorPicker value={folderColor} onChange={setFolderColor} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFolderDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateFolder()}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameState != null}
        onOpenChange={(open) => {
          if (!open) setRenameState(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {renameState?.entry.kind === "folder" ? "Папка" : "Переименовать"}
            </DialogTitle>
            <DialogDescription>
              {renameState?.entry.kind === "folder"
                ? "Измените название или цвет папки."
                : "Файл в текущем каталоге."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity-files-rename">Название</Label>
              <Input
                id="entity-files-rename"
                value={renameState?.name ?? ""}
                onChange={(event) =>
                  setRenameState((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleRenameSubmit();
                  }
                }}
              />
            </div>
            {renameState?.entry.kind === "folder" ? (
              <FolderColorPicker
                value={renameState.color}
                onChange={(color) =>
                  setRenameState((current) =>
                    current ? { ...current, color } : current,
                  )
                }
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameState(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!renameState?.name.trim()}
              onClick={handleRenameSubmit}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteIds != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIds(null);
        }}
        title={
          pendingDeleteEntries.length > 1
            ? "Удалить выбранное?"
            : pendingDeleteEntries[0]?.kind === "folder"
              ? "Удалить папку?"
              : "Удалить файл?"
        }
        description={
          pendingDeleteEntries.length > 1
            ? `Будет удалено элементов: ${pendingDeleteEntries.length}. Папки удаляются вместе с содержимым.`
            : pendingDeleteEntries[0]?.kind === "folder"
              ? `Папка «${pendingDeleteEntries[0].name}» и всё её содержимое будут удалены.`
              : `Файл «${pendingDeleteEntries[0]?.name ?? ""}» будет удалён безвозвратно.`
        }
        onConfirm={() => void handleConfirmDelete()}
      />

      <EntityFileViewer
        open={viewerId != null}
        onOpenChange={(open) => {
          if (!open) setViewerId(null);
        }}
        files={viewerFiles}
        activeId={viewerId}
        onActiveIdChange={setViewerId}
      />
    </section>
  );
}
