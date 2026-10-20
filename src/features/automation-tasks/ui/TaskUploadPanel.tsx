import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  CheckCircle2,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { pluralRu } from "@/shared/lib/plural";
import { cn } from "@/shared/lib/cn";
import type { AutomationTaskUploadTarget } from "@/entities/automation";
import {
  formatEntityFileSize,
  getEntityTabFilesValueKey,
  isEntityFilesTab,
  parseEntityTabFileEntries,
  type Entity,
  type EntityRecord,
  type EntityTabFileEntry,
} from "@/entities/entity";
import {
  ensureUploadTargetFolderId,
  listFilesUnderFolder,
  uploadFilesToAutomationTarget,
} from "../lib/upload-to-files-tab";

type TaskUploadPanelProps = {
  entity: Entity;
  record: EntityRecord;
  target: AutomationTaskUploadTarget;
  disabled?: boolean;
  onError?: (message: string | null) => void;
};

function fileIcon(entry: EntityTabFileEntry) {
  const mime = entry.mimeType?.toLowerCase() ?? "";
  const name = entry.name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
    return FileImage;
  }
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    /\.(xlsx?|csv)$/.test(name)
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("pdf") ||
    mime.startsWith("text/") ||
    /\.(pdf|docx?|txt|md)$/.test(name)
  ) {
    return FileText;
  }
  return File;
}

export function TaskUploadPanel({
  entity,
  record,
  target,
  disabled = false,
  onError,
}: TaskUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const tab = entity.tabs.find(
    (item) => item.id === target.filesTabId && isEntityFilesTab(item),
  );

  const folderLabel = useMemo(() => {
    if (!tab) return "Папка";
    if (!target.folderId.trim()) return "Без папки (корень)";
    return (
      tab.defaultFolders.find((item) => item.id === target.folderId)?.name ??
      "Папка"
    );
  }, [tab, target.folderId]);

  const uploadedFiles = useMemo(() => {
    if (!tab) return [];
    const valueKey = getEntityTabFilesValueKey(tab.id);
    const entries = parseEntityTabFileEntries(record.values[valueKey]);
    const { parentId } = ensureUploadTargetFolderId({
      entries,
      defaultFolders: tab.defaultFolders,
      folderId: target.folderId,
    });
    return listFilesUnderFolder(entries, parentId);
  }, [tab, record.values, target.folderId]);

  const fileCount = uploadedFiles.length;
  const hasFiles = fileCount > 0;

  if (!tab) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
        Вкладка файлов для загрузки не найдена. Проверьте настройки задания.
      </div>
    );
  }

  async function handleFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0 || !tab || disabled || busy) return;
    setBusy(true);
    onError?.(null);
    try {
      await uploadFilesToAutomationTarget({
        entity,
        record,
        tab,
        target,
        files: list,
      });
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Не удалось загрузить файлы",
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
      if (event.dataTransfer.types.includes("Files")) setDragOver(true);
    },
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.types.includes("Files")) {
        event.dataTransfer.dropEffect = "copy";
      }
    },
    onDragLeave: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragOver(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragOver(false);
      void handleFiles(event.dataTransfer.files);
    },
  };

  const fileInputs = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
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
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </>
  );

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Загрузка файлов
            {target.required ? (
              <span className="ml-1 text-destructive">*</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Файлы и папки попадут в «{folderLabel}» на вкладке «{tab.name}».
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            hasFiles
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {fileCount} {pluralRu(fileCount, "файл", "файла", "файлов")}
        </span>
      </div>

      {hasFiles ? (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-border bg-card transition-colors",
            dragOver && "border-primary ring-2 ring-primary/15",
            (busy || disabled) && "opacity-70",
          )}
          {...dropHandlers}
        >
          <div className="flex items-center gap-2 border-b border-border/70 bg-muted/25 px-3 py-2">
            <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              Загружено
              {busy ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · загрузка…
                </span>
              ) : null}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={busy || disabled}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Ещё
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                disabled={busy || disabled}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderUp className="size-3.5" />
                Папка
              </Button>
            </div>
          </div>

          <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
            {uploadedFiles.map(({ entry, relativePath }) => {
              const Icon = fileIcon(entry);
              const sizeLabel = formatEntityFileSize(entry.size);
              const nested = relativePath.includes("/");
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[
                        nested ? relativePath : null,
                        sizeLabel || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Файл"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div
            className={cn(
              "flex items-center justify-center gap-2 border-t border-dashed px-3 py-2.5 text-[11px] transition-colors",
              dragOver
                ? "border-primary bg-primary/5 text-primary"
                : "border-border/70 bg-muted/15 text-muted-foreground",
            )}
          >
            <Paperclip className="size-3 shrink-0" />
            <span>
              {dragOver
                ? "Отпустите, чтобы добавить"
                : "Перетащите сюда ещё файлы или папку"}
            </span>
          </div>
          {fileInputs}
        </div>
      ) : (
        <div
          className={cn(
            "relative flex flex-col gap-3 rounded-xl border border-dashed px-4 py-5 transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border/80 bg-muted/10",
            (busy || disabled) && "pointer-events-none opacity-70",
          )}
          {...dropHandlers}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground shadow-xs">
              <Paperclip className="size-4 stroke-[1.5]" />
            </span>
            <p className="text-sm font-medium">
              {dragOver
                ? "Отпустите, чтобы загрузить"
                : "Перетащите файлы или папки"}
            </p>
            <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
              Можно выбрать несколько файлов или целую папку со структурой
              подкаталогов.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Файлы
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || disabled}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderUp className="size-3.5" />
              Папка
            </Button>
          </div>
          {fileInputs}
        </div>
      )}

      {target.required && fileCount === 0 ? (
        <p className="text-[11px] text-destructive">
          Прикрепите хотя бы один файл, чтобы завершить задание.
        </p>
      ) : null}
    </section>
  );
}
