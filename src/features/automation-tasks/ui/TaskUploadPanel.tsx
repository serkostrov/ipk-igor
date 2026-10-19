import { useMemo, useRef, useState } from "react";
import { FolderUp, Paperclip, Upload } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { pluralRu } from "@/shared/lib/plural";
import { cn } from "@/shared/lib/cn";
import type { AutomationTaskUploadTarget } from "@/entities/automation";
import {
  getEntityTabFilesValueKey,
  isEntityFilesTab,
  parseEntityTabFileEntries,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  countFilesUnderFolder,
  ensureUploadTargetFolderId,
  uploadFilesToAutomationTarget,
} from "../lib/upload-to-files-tab";

type TaskUploadPanelProps = {
  entity: Entity;
  record: EntityRecord;
  target: AutomationTaskUploadTarget;
  disabled?: boolean;
  onError?: (message: string | null) => void;
};

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

  const fileCount = useMemo(() => {
    if (!tab) return 0;
    const valueKey = getEntityTabFilesValueKey(tab.id);
    const entries = parseEntityTabFileEntries(record.values[valueKey]);
    const { parentId } = ensureUploadTargetFolderId({
      entries,
      defaultFolders: tab.defaultFolders,
      folderId: target.folderId,
    });
    return countFilesUnderFolder(entries, parentId);
  }, [tab, record.values, target.folderId]);

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
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {fileCount} {pluralRu(fileCount, "файл", "файла", "файлов")}
        </span>
      </div>

      <div
        className={cn(
          "relative flex flex-col gap-3 rounded-xl border border-dashed px-4 py-5 transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-muted/10",
          (busy || disabled) && "pointer-events-none opacity-70",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepthRef.current += 1;
          if (event.dataTransfer.types.includes("Files")) setDragOver(true);
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
          void handleFiles(event.dataTransfer.files);
        }}
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
      </div>

      {target.required && fileCount === 0 ? (
        <p className="text-[11px] text-destructive">
          Прикрепите хотя бы один файл, чтобы завершить задание.
        </p>
      ) : null}
    </section>
  );
}
