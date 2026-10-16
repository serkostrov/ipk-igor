import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  File,
  Folder,
  FolderPlus,
  Pencil,
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
  DEFAULT_ENTITY_FOLDER_COLOR,
  DEFAULT_ENTITY_LIST_COLORS,
  deleteEntityFileObject,
  formatEntityFileSize,
  getEntityFileDownloadUrl,
  getEntityTabFilesValueKey,
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
import { formatDatetimeDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

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
  const asLocal = iso.includes("T") ? iso.slice(0, 16) : iso;
  return formatDatetimeDisplay(asLocal) || iso;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

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

  const visibleEntries = useMemo(() => {
    const items = entries.filter(
      (entry) => entry.parentId === resolvedFolderId,
    );
    return items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [entries, resolvedFolderId]);

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

        next.push({
          id: entryId,
          name,
          kind: "file",
          parentId: resolvedFolderId,
          createdAt: new Date().toISOString(),
          mimeType: file.type || undefined,
          size: file.size,
          storagePath: uploaded.storagePath,
          dataUrl: uploaded.dataUrl,
        });
      }

      persist(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить файл",
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleOpenFile(entry: EntityTabFileEntry) {
    setError(null);
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
      setError(err instanceof Error ? err.message : "Не удалось открыть файл");
    }
  }

  async function handleDownload(entry: EntityTabFileEntry) {
    setError(null);
    try {
      let href = entry.dataUrl ?? "";
      if (!href) {
        if (!entry.storagePath) throw new Error("Файл недоступен");
        href = await getEntityFileDownloadUrl(entry.storagePath);
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = entry.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
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

  const folderCount = visibleEntries.filter((e) => e.kind === "folder").length;
  const fileCount = visibleEntries.filter((e) => e.kind === "file").length;
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

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {tab.name}
          </h2>
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
              Главная
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

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            {visibleEntries.length === 0
              ? "0 элементов"
              : formatFolderContents(folderCount, fileCount)}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                  variant="outline"
                  size="sm"
                  disabled={busy || visibleEntries.length === 0}
                  onClick={selectAllVisible}
                >
                  Выбрать все
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setFolderName("Новая папка");
                    setFolderColor(DEFAULT_ENTITY_FOLDER_COLOR);
                    setFolderDialogOpen(true);
                  }}
                >
                  <FolderPlus className="size-3.5" />
                  Папка
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Загрузить
                </Button>
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
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div
          className={cn(
            // Grow with content; cap at ~3 tile rows, then scroll.
            // tile ≈ 6.5rem, gap-2 = 0.5rem, padding p-2 = 1rem
            "relative max-h-[calc(3*6.5rem+2*0.5rem+1rem)] overflow-y-auto rounded-xl border border-dashed transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border/80",
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
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-primary/5">
              <span className="flex size-10 items-center justify-center rounded-xl border border-primary/40 text-primary">
                <Upload className="size-5" />
              </span>
              <p className="text-sm font-medium text-foreground">
                Отпустите, чтобы загрузить
              </p>
            </div>
          ) : null}

          {visibleEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Папка пуста</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Перетащите файлы сюда или создайте папку.
              </p>
            </div>
          ) : (
            <ul className="flex flex-wrap content-start gap-2 p-2">
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
                  <li key={entry.id} className="h-[6.5rem] w-[6.25rem]">
                    <div
                      className={cn(
                        "group/file relative size-full overflow-hidden rounded-xl border transition-colors",
                        selected
                          ? "border-primary ring-1 ring-primary/25"
                          : "border-border/70 hover:border-foreground/20",
                        !isFolder && "bg-muted/35",
                        !isFolder && selected && "bg-primary/[0.05]",
                      )}
                      style={
                        folderAccent
                          ? {
                              backgroundColor: `color-mix(in srgb, ${folderAccent} ${selected ? "18%" : "12%"}, transparent)`,
                            }
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className={cn(
                          "absolute top-1.5 left-1.5 z-10 flex size-4 items-center justify-center rounded-[4px] border transition-opacity",
                          selected
                            ? "border-primary bg-primary text-primary-foreground opacity-100"
                            : "border-border/80 bg-background/90 opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100",
                        )}
                        aria-label={selected ? "Снять выбор" : "Выбрать"}
                        aria-pressed={selected}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelected(entry.id);
                        }}
                      >
                        {selected ? <Check className="size-2.5" /> : null}
                      </button>

                      <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-background/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover/file:opacity-100 focus-within:opacity-100">
                        {!isFolder ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-5 text-muted-foreground"
                            aria-label="Скачать"
                            disabled={busy}
                            onClick={() => void handleDownload(entry)}
                          >
                            <Download className="size-3" />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-5 text-muted-foreground"
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
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-5 text-muted-foreground hover:text-destructive"
                          aria-label="Удалить"
                          disabled={busy}
                          onClick={() => setPendingDeleteIds([entry.id])}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>

                      <button
                        type="button"
                        className="flex size-full flex-col items-center justify-center gap-1 px-2 py-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={(event) => {
                          if (
                            selectedCount > 0 ||
                            event.metaKey ||
                            event.ctrlKey
                          ) {
                            toggleSelected(entry.id);
                            return;
                          }
                          if (isFolder) {
                            navigateToFolder(entry.id);
                            return;
                          }
                          void handleOpenFile(entry);
                        }}
                        onDoubleClick={() => {
                          if (isFolder) navigateToFolder(entry.id);
                        }}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center",
                            !isFolder && "text-muted-foreground",
                          )}
                          style={
                            folderAccent ? { color: folderAccent } : undefined
                          }
                        >
                          {isFolder ? (
                            <Folder className="size-7 stroke-[1.5]" />
                          ) : (
                            <File className="size-7 stroke-[1.5]" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className="line-clamp-2 text-[11px] leading-snug font-medium break-all text-foreground"
                            title={entry.name}
                          >
                            {entry.name}
                          </span>
                          <span
                            className="truncate text-[10px] leading-none text-muted-foreground"
                            title={meta}
                          >
                            {meta}
                          </span>
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
    </section>
  );
}
