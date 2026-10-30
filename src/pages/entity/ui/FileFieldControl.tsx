import { useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  Folder,
  FolderUp,
  Trash2,
  Upload,
} from "lucide-react";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";
import {
  countEntityFieldFiles,
  deleteEntityFileObject,
  downloadEntityFileFromUrl,
  EntityFileThumb,
  EntityFileViewer,
  formatEntityFileSize,
  parseEntityFieldFileEntries,
  resolveEntityFileUrl,
  serializeEntityFieldFileEntries,
  uploadEntityFieldFile,
  type EntityTabFileEntry,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

type FileFieldControlProps = {
  id?: string;
  value: string;
  entityId: string;
  recordId: string;
  fieldId: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
};

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

function collectDescendantIds(
  entries: EntityTabFileEntry[],
  rootId: string,
): Set<string> {
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

function folderKey(parentId: string | null, name: string) {
  return `${parentId ?? ""}/${name.toLowerCase()}`;
}

export function FileFieldControl({
  id,
  value,
  entityId,
  recordId,
  fieldId,
  disabled = false,
  className,
  onChange,
}: FileFieldControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  const entries = useMemo(() => parseEntityFieldFileEntries(value), [value]);
  const fileCount = countEntityFieldFiles(entries);

  const resolvedFolderId = useMemo(() => {
    if (!folderId) return null;
    return entries.some(
      (entry) => entry.id === folderId && entry.kind === "folder",
    )
      ? folderId
      : null;
  }, [entries, folderId]);

  const breadcrumbs = useMemo(() => {
    const trail: EntityTabFileEntry[] = [];
    let current = resolvedFolderId;
    while (current) {
      const folder = entries.find(
        (entry) => entry.id === current && entry.kind === "folder",
      );
      if (!folder) break;
      trail.unshift(folder);
      current = folder.parentId;
    }
    return trail;
  }, [entries, resolvedFolderId]);

  const visibleEntries = useMemo(() => {
    return entries
      .filter((entry) => entry.parentId === resolvedFolderId)
      .slice()
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      });
  }, [entries, resolvedFolderId]);

  const viewerFiles = useMemo(
    () => visibleEntries.filter((entry) => entry.kind === "file"),
    [visibleEntries],
  );

  function persist(next: EntityTabFileEntry[]) {
    onChange(serializeEntityFieldFileEntries(next));
  }

  async function uploadFiles(fileList: FileList | File[] | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress(null);

    try {
      const next = [...entries];
      const folderCache = new Map<string, string>();
      for (const entry of next) {
        if (entry.kind === "folder") {
          folderCache.set(folderKey(entry.parentId, entry.name), entry.id);
        }
      }

      function ensureFolder(parentId: string | null, name: string) {
        const key = folderKey(parentId, name);
        const existing = folderCache.get(key);
        if (existing) return existing;
        const siblingNames = next
          .filter((entry) => entry.parentId === parentId)
          .map((entry) => entry.name);
        const unique = uniqueName(name, siblingNames, true);
        const id = crypto.randomUUID();
        next.push({
          id,
          name: unique,
          kind: "folder",
          parentId,
          createdAt: new Date().toISOString(),
        });
        folderCache.set(folderKey(parentId, unique), id);
        return id;
      }

      const uploads: Array<{ entryId: string; file: File }> = [];

      for (const file of files) {
        const relative =
          (
            file as File & {
              webkitRelativePath?: string;
            }
          ).webkitRelativePath?.trim() || file.name;
        const parts = relative.split("/").filter(Boolean);
        const fileName = parts.pop() || file.name || "Файл";
        let parentId = resolvedFolderId;
        for (const part of parts) {
          parentId = ensureFolder(parentId, part);
        }

        const siblingNames = next
          .filter((entry) => entry.parentId === parentId)
          .map((entry) => entry.name);
        const name = uniqueName(fileName, siblingNames, false);
        const entryId = crypto.randomUUID();
        next.push({
          id: entryId,
          name,
          kind: "file",
          parentId,
          createdAt: new Date().toISOString(),
          mimeType: file.type || undefined,
          size: file.size,
        });
        uploads.push({ entryId, file });
      }

      for (let index = 0; index < uploads.length; index += 1) {
        const item = uploads[index]!;
        setProgress(`Загрузка ${index + 1} из ${uploads.length}…`);
        const uploaded = await uploadEntityFieldFile({
          entityId,
          recordId,
          fieldId,
          entryId: item.entryId,
          file: item.file,
        });
        const entry = next.find((candidate) => candidate.id === item.entryId);
        if (entry && entry.kind === "file") {
          entry.storagePath = uploaded.storagePath;
          entry.dataUrl = uploaded.dataUrl;
        }
      }

      persist(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить файлы",
      );
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  function handleOpen(entry: EntityTabFileEntry) {
    if (entry.kind === "folder") {
      setFolderId(entry.id);
      return;
    }
    setError(null);
    setViewerId(entry.id);
  }

  async function handleDownload(entry: EntityTabFileEntry) {
    if (entry.kind !== "file") return;
    setError(null);
    try {
      const href = await resolveEntityFileUrl(entry);
      downloadEntityFileFromUrl(href, entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скачать файл");
    }
  }

  async function handleDelete(entry: EntityTabFileEntry) {
    setBusy(true);
    setError(null);
    try {
      const removeIds = collectDescendantIds(entries, entry.id);
      const toRemove = entries.filter((item) => removeIds.has(item.id));
      for (const item of toRemove) {
        if (item.kind === "file" && item.storagePath) {
          await deleteEntityFileObject(item.storagePath);
        }
      }
      const next = entries.filter((item) => !removeIds.has(item.id));
      persist(next);
      if (resolvedFolderId && removeIds.has(resolvedFolderId)) {
        setFolderId(entry.parentId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    setBusy(true);
    setError(null);
    try {
      for (const entry of entries) {
        if (entry.kind === "file" && entry.storagePath) {
          await deleteEntityFileObject(entry.storagePath);
        }
      }
      persist([]);
      setFolderId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось очистить");
    } finally {
      setBusy(false);
    }
  }

  const empty = visibleEntries.length === 0;
  const summary =
    fileCount === 0
      ? null
      : `${fileCount} ${pluralRu(fileCount, "файл", "файла", "файлов")}`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-card",
          dragging && "border-primary ring-2 ring-primary/15",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) {
            return;
          }
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled || busy) return;
          void uploadFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/20 px-2.5 py-2">
          <div className="min-w-0 flex-1">
            {breadcrumbs.length === 0 ? (
              <p className="truncate text-xs font-medium text-foreground">
                {summary ?? "Нет файлов"}
              </p>
            ) : (
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs">
                <button
                  type="button"
                  className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
                  disabled={busy || disabled}
                  onClick={() => setFolderId(null)}
                >
                  Корень
                </button>
                {breadcrumbs.map((folder) => (
                  <span key={folder.id} className="flex min-w-0 items-center">
                    <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/60" />
                    <button
                      type="button"
                      className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground"
                      disabled={busy || disabled}
                      onClick={() => setFolderId(folder.id)}
                      title={folder.name}
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
              </div>
            )}
            {progress ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {progress}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Файлы
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy || disabled}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderUp className="size-3.5" />
              Папка
            </Button>
            {fileCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label="Удалить все"
                disabled={busy || disabled}
                onClick={() => void handleClearAll()}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {empty ? (
          <button
            type="button"
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 px-4 py-7 text-center transition-colors",
              !disabled &&
                !busy &&
                "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            disabled={busy || disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Upload className="size-4" />
            </span>
            <span className="text-sm font-medium text-foreground">
              {dragging
                ? "Отпустите, чтобы загрузить"
                : "Перетащите файлы или папку"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Можно выбрать несколько файлов или целую папку
            </span>
          </button>
        ) : (
          <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto">
            {visibleEntries.map((entry) => {
              const isFolder = entry.kind === "folder";
              const childFolders = isFolder
                ? entries.filter(
                    (item) =>
                      item.parentId === entry.id && item.kind === "folder",
                  ).length
                : 0;
              const childFiles = isFolder
                ? entries.filter(
                    (item) =>
                      item.parentId === entry.id && item.kind === "file",
                  ).length
                : 0;
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/25"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    disabled={busy || disabled}
                    onClick={() => handleOpen(entry)}
                    title={entry.name}
                  >
                    {isFolder ? (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                        <Folder className="size-4" />
                      </span>
                    ) : (
                      <EntityFileThumb
                        name={entry.name}
                        mimeType={entry.mimeType}
                        storagePath={entry.storagePath}
                        dataUrl={entry.dataUrl}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {entry.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {isFolder
                          ? [
                              childFolders > 0
                                ? `${childFolders} ${pluralRu(childFolders, "папка", "папки", "папок")}`
                                : null,
                              childFiles > 0
                                ? `${childFiles} ${pluralRu(childFiles, "файл", "файла", "файлов")}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(", ") || "Пусто"
                          : formatEntityFileSize(entry.size) || "Файл"}
                      </span>
                    </span>
                    {isFolder ? (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {!isFolder ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground"
                        aria-label="Скачать"
                        disabled={busy || disabled}
                        onClick={() => void handleDownload(entry)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={isFolder ? "Удалить папку" : "Удалить файл"}
                      disabled={busy || disabled}
                      onClick={() => void handleDelete(entry)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <input
        id={id}
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        disabled={busy || disabled}
        onChange={(event) => void uploadFiles(event.target.files)}
      />
      <input
        ref={(node) => {
          folderInputRef.current = node;
          if (node) {
            node.setAttribute("webkitdirectory", "");
            node.setAttribute("directory", "");
          }
        }}
        type="file"
        multiple
        className="hidden"
        disabled={busy || disabled}
        onChange={(event) => void uploadFiles(event.target.files)}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <EntityFileViewer
        open={viewerId != null}
        onOpenChange={(open) => {
          if (!open) setViewerId(null);
        }}
        files={viewerFiles}
        activeId={viewerId}
        onActiveIdChange={setViewerId}
      />
    </div>
  );
}
