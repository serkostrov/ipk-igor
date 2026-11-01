/**
 * Inline file kit for one price revision (expanded history row).
 */

import { useRef, useState } from "react";
import { Download, Eye, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  downloadEntityFileFromUrl,
  EntityFileThumb,
  EntityFileViewer,
  formatEntityFileSize,
  resolveEntityFileUrl,
  type EntityTabFileEntry,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";

export function RevisionFilesPanel({
  revisionId,
  revisionNumber,
  files,
  canEdit,
  highlightUpload = false,
  isLatest = false,
  onUpload,
}: {
  revisionId: string;
  revisionNumber: number | null;
  files: readonly EntityTabFileEntry[];
  canEdit: boolean;
  /** Soft focus after save in pending-new-version flow. */
  highlightUpload?: boolean;
  isLatest?: boolean;
  onUpload?: (files: File[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  const revisionLabel =
    revisionNumber != null ? `#${revisionNumber}` : "ревизии";

  async function handleFiles(list: FileList | File[] | null) {
    if (!canEdit || !onUpload || !list) return;
    const next = Array.from(list);
    if (next.length === 0) return;
    setBusy(true);
    try {
      await onUpload(next);
      toast.success(
        next.length === 1
          ? `Файл привязан к ревизии ${revisionLabel}`
          : `${next.length} ${pluralRu(next.length, "файл", "файла", "файлов")} привязаны к ревизии ${revisionLabel}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось загрузить файл",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(entry: EntityTabFileEntry) {
    try {
      const href = await resolveEntityFileUrl(entry);
      downloadEntityFileFromUrl(href, entry.name);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось скачать файл",
      );
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3",
        highlightUpload &&
          "ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
      )}
      data-testid="revision-files-panel"
      data-revision-id={revisionId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            Файлы ТКП · ревизия {revisionLabel}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {files.length > 0
              ? `${files.length} ${pluralRu(files.length, "файл", "файла", "файлов")}`
              : "К этой ревизии ещё нет файлов ТКП"}
          </p>
        </div>
        {canEdit && onUpload ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
            data-testid="revision-files-upload"
          >
            <Upload className="size-3.5" aria-hidden />
            {busy ? "Загрузка…" : "Загрузить"}
          </Button>
        ) : null}
      </div>

      {files.length === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-center",
            dragOver
              ? "border-primary/50 bg-primary/5"
              : "border-border/70 bg-background/50",
          )}
          onDragEnter={(event) => {
            if (!canEdit || !onUpload) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            if (!canEdit || !onUpload) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            if (!canEdit || !onUpload) return;
            event.preventDefault();
            setDragOver(false);
            void handleFiles(event.dataTransfer.files);
          }}
        >
          <Paperclip className="size-5 text-muted-foreground/70" aria-hidden />
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? "Перетащите файлы сюда или нажмите «Загрузить»"
              : "Файлы появятся после загрузки или формирования документа"}
          </p>
          {canEdit && isLatest ? (
            <p className="max-w-sm text-[11px] text-muted-foreground/80">
              Либо сформируйте документ кнопкой «На согласование» — HTML
              сохранится и привяжется к этой ревизии автоматически.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-md border border-border/60 bg-background">
          {files.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/25"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setViewerId(entry.id)}
                title={entry.name}
              >
                <EntityFileThumb
                  name={entry.name}
                  mimeType={entry.mimeType}
                  storagePath={entry.storagePath}
                  dataUrl={entry.dataUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {formatEntityFileSize(entry.size) || "Файл"}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground"
                  aria-label="Открыть"
                  onClick={() => setViewerId(entry.id)}
                >
                  <Eye className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground"
                  aria-label="Скачать"
                  onClick={() => void handleDownload(entry)}
                >
                  <Download className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && onUpload && files.length > 0 ? (
        <div
          className={cn(
            "rounded-md border border-dashed px-3 py-2.5 text-center text-[11px] text-muted-foreground transition-colors",
            dragOver
              ? "border-primary/50 bg-primary/5"
              : "border-border/60 bg-background/40",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void handleFiles(event.dataTransfer.files);
          }}
        >
          Перетащите ещё файлы сюда
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <EntityFileViewer
        open={viewerId != null}
        onOpenChange={(open) => {
          if (!open) setViewerId(null);
        }}
        files={files}
        activeId={viewerId}
        onActiveIdChange={setViewerId}
      />
    </div>
  );
}
