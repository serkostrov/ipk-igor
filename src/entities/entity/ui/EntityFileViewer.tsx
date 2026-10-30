import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileText,
  Loader2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/cn";
import { formatEntityFileSize } from "../model/types";
import {
  downloadEntityFileFromUrl,
  ENTITY_FILE_TEXT_PREVIEW_MAX_BYTES,
  getEntityFilePreviewKind,
  resolveEntityFileUrl,
  type EntityFilePreviewKind,
  type EntityFileViewerItem,
} from "../lib/file-preview";

type EntityFileViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: readonly EntityFileViewerItem[];
  activeId: string | null;
  onActiveIdChange?: (id: string) => void;
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function kindLabel(kind: EntityFilePreviewKind) {
  switch (kind) {
    case "image":
      return "Изображение";
    case "pdf":
      return "PDF";
    case "video":
      return "Видео";
    case "audio":
      return "Аудио";
    case "text":
      return "Текст";
    default:
      return "Файл";
  }
}

function PreviewFallback({
  kind,
  name,
  onDownload,
  message,
}: {
  kind: EntityFilePreviewKind;
  name: string;
  onDownload: () => void;
  message?: string;
}) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white/80 ring-1 ring-white/15">
        {kind === "image" ? (
          <FileImage className="size-7 stroke-[1.5]" />
        ) : kind === "text" ? (
          <FileText className="size-7 stroke-[1.5]" />
        ) : (
          <File className="size-7 stroke-[1.5]" />
        )}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-white/55">
          {message ?? "Предпросмотр недоступен для этого типа файла"}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={onDownload}
      >
        <Download className="size-3.5" />
        Скачать
      </Button>
    </div>
  );
}

function ImageStage({
  url,
  name,
  zoom,
  onZoomChange,
}: {
  url: string;
  name: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  return (
    <div
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden",
        zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
      )}
      onDoubleClick={() => onZoomChange(zoom === 1 ? 2 : 1)}
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta)));
      }}
      onPointerDown={(event) => {
        if (zoom <= 1) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: offset.x,
          originY: offset.y,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setOffset({
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        });
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          dragRef.current = null;
          setDragging(false);
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
    >
      <img
        src={url}
        alt={name}
        draggable={false}
        className="max-h-full max-w-full object-contain select-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: dragging ? undefined : "transform 120ms ease-out",
        }}
      />
    </div>
  );
}

type LoadState =
  | { status: "idle" }
  | { status: "ready"; fileId: string; url: string; text?: string }
  | { status: "error"; fileId: string; url?: string; message: string };

export function EntityFileViewer({
  open,
  onOpenChange,
  files,
  activeId,
  onActiveIdChange,
}: EntityFileViewerProps) {
  const index = files.findIndex((item) => item.id === activeId);
  const file = index >= 0 ? files[index]! : null;
  const kind = file ? getEntityFilePreviewKind(file) : "unknown";
  const fileId = file?.id ?? null;

  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [zoomState, setZoomState] = useState({
    id: null as string | null,
    value: 1,
  });
  const [copyDone, setCopyDone] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = zoomState.id === fileId ? zoomState.value : 1;

  function setZoom(value: number | ((current: number) => number)) {
    if (!fileId) return;
    setZoomState((prev) => {
      const current = prev.id === fileId ? prev.value : 1;
      const next = typeof value === "function" ? value(current) : value;
      return { id: fileId, value: next };
    });
  }

  useEffect(() => {
    if (!open || !fileId || !file) return;

    let cancelled = false;

    void (async () => {
      try {
        const resolved = await resolveEntityFileUrl(file);
        if (cancelled) return;

        if (kind === "text") {
          if (
            file.size != null &&
            file.size > ENTITY_FILE_TEXT_PREVIEW_MAX_BYTES
          ) {
            setLoad({
              status: "error",
              fileId,
              url: resolved,
              message: "Файл слишком большой для предпросмотра",
            });
            return;
          }
          const response = await fetch(resolved);
          if (!response.ok) throw new Error("Не удалось загрузить файл");
          const blob = await response.blob();
          if (blob.size > ENTITY_FILE_TEXT_PREVIEW_MAX_BYTES) {
            setLoad({
              status: "error",
              fileId,
              url: resolved,
              message: "Файл слишком большой для предпросмотра",
            });
            return;
          }
          const text = await blob.text();
          if (cancelled) return;
          setLoad({ status: "ready", fileId, url: resolved, text });
          return;
        }

        setLoad({ status: "ready", fileId, url: resolved });
      } catch (err) {
        if (cancelled) return;
        setLoad({
          status: "error",
          fileId,
          message:
            err instanceof Error ? err.message : "Не удалось открыть файл",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, file, fileId, kind]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (index > 0) onActiveIdChange?.(files[index - 1]!.id);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index >= 0 && index < files.length - 1) {
          onActiveIdChange?.(files[index + 1]!.id);
        }
      } else if (event.key === "+" || event.key === "=") {
        if (kind !== "image" || !fileId) return;
        event.preventDefault();
        setZoomState((prev) => {
          const current = prev.id === fileId ? prev.value : 1;
          return {
            id: fileId,
            value: Math.min(ZOOM_MAX, current + ZOOM_STEP),
          };
        });
      } else if (event.key === "-") {
        if (kind !== "image" || !fileId) return;
        event.preventDefault();
        setZoomState((prev) => {
          const current = prev.id === fileId ? prev.value : 1;
          return {
            id: fileId,
            value: Math.max(ZOOM_MIN, current - ZOOM_STEP),
          };
        });
      } else if (event.key === "0") {
        if (kind !== "image" || !fileId) return;
        event.preventDefault();
        setZoomState({ id: fileId, value: 1 });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, files, kind, fileId, onActiveIdChange]);

  const matchedLoad =
    load.status !== "idle" && load.fileId === fileId ? load : null;
  const url = matchedLoad?.url ?? null;
  const textContent =
    matchedLoad?.status === "ready" ? (matchedLoad.text ?? null) : null;
  const error = matchedLoad?.status === "error" ? matchedLoad.message : null;
  const loading = Boolean(open && fileId && !matchedLoad);

  function handleDownload() {
    if (!file || !url) return;
    downloadEntityFileFromUrl(url, file.name);
  }

  function handleOpenExternal() {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function markCopied() {
    setCopyDone(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyDone(false), 1600);
  }

  async function blobToPng(blob: Blob): Promise<Blob> {
    if (blob.type === "image/png") return blob;
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise<Blob>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Не удалось подготовить изображение"));
            return;
          }
          ctx.drawImage(image, 0, 0);
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error("Не удалось подготовить изображение"));
          }, "image/png");
        };
        image.onerror = () =>
          reject(new Error("Не удалось подготовить изображение"));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    if (!ok) throw new Error("Не удалось скопировать");
  }

  async function handleCopy() {
    if (!file || !url) return;
    try {
      if (kind === "image") {
        // Start clipboard.write in the click turn; put async work in the
        // ClipboardItem Promise so user activation is not lost after fetch.
        const pngPromise = fetch(url).then(async (response) => {
          if (!response.ok) throw new Error("Не удалось загрузить изображение");
          return blobToPng(await response.blob());
        });
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngPromise }),
          ]);
          toast.success("Изображение скопировано");
        } catch {
          // Image clipboard is unsupported or blocked — fall back to the link.
          await copyText(url);
          toast.success("Ссылка скопирована");
        }
      } else if (kind === "text" && textContent != null) {
        await copyText(textContent);
        toast.success("Текст скопирован");
      } else {
        await copyText(url);
        toast.success("Ссылка скопирована");
      }
      markCopied();
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  function goTo(nextIndex: number) {
    const next = files[nextIndex];
    if (!next) return;
    onActiveIdChange?.(next.id);
  }

  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < files.length - 1;
  const metaParts = [
    file ? kindLabel(kind) : null,
    file ? formatEntityFileSize(file.size) : null,
    files.length > 1 && index >= 0 ? `${index + 1} из ${files.length}` : null,
  ].filter(Boolean);

  let stage: ReactNode = null;
  if (loading) {
    stage = (
      <div className="flex flex-col items-center gap-3 text-white/70">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Загрузка…</p>
      </div>
    );
  } else if (error && kind !== "text" && kind !== "unknown") {
    stage = (
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <p className="text-sm text-white/80">{error}</p>
        {url ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="size-3.5" />
            Скачать
          </Button>
        ) : null}
      </div>
    );
  } else if (file && url) {
    if (kind === "image") {
      stage = (
        <ImageStage
          key={url}
          url={url}
          name={file.name}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      );
    } else if (kind === "pdf") {
      stage = (
        <iframe
          title={file.name}
          src={url}
          className="size-full rounded-lg bg-white shadow-2xl"
        />
      );
    } else if (kind === "video") {
      stage = (
        <video
          key={url}
          src={url}
          controls
          className="max-h-full max-w-full rounded-lg shadow-2xl"
        />
      );
    } else if (kind === "audio") {
      stage = (
        <div className="flex w-full max-w-lg flex-col items-center gap-5 px-6">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white/80 ring-1 ring-white/15">
            <File className="size-7 stroke-[1.5]" />
          </span>
          <p className="truncate text-sm font-medium text-white">{file.name}</p>
          <audio key={url} src={url} controls className="w-full" />
        </div>
      );
    } else if (kind === "text") {
      if (error || textContent == null) {
        stage = (
          <PreviewFallback
            kind={kind}
            name={file.name}
            onDownload={handleDownload}
            message={error ?? undefined}
          />
        );
      } else {
        stage = (
          <pre className="max-h-full w-full max-w-4xl overflow-auto rounded-xl bg-[#0f1115] p-5 text-left text-[13px] leading-relaxed whitespace-pre-wrap text-white/85 shadow-2xl ring-1 ring-white/10">
            {textContent}
          </pre>
        );
      }
    } else {
      stage = (
        <PreviewFallback
          kind={kind}
          name={file.name}
          onDownload={handleDownload}
        />
      );
    }
  } else if (file) {
    stage = (
      <PreviewFallback
        kind={kind}
        name={file.name}
        onDownload={handleDownload}
        message={error ?? undefined}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        forceOverlay
        overlayClassName="bg-black/80 supports-backdrop-filter:backdrop-blur-md"
        className={cn(
          "fixed inset-0 top-0 left-0 z-50 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-transparent p-0 text-white shadow-none ring-0 outline-none sm:max-w-none",
          "data-open:zoom-in-100 data-closed:zoom-out-100",
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {file?.name ?? "Просмотр файла"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Просмотр вложенного файла
        </DialogDescription>

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pt-3 pb-10 sm:px-4">
          <div className="pointer-events-auto min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-tight">
              {file?.name ?? "Файл"}
            </p>
            {metaParts.length > 0 ? (
              <p className="mt-0.5 truncate text-[11px] text-white/55">
                {metaParts.join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {kind === "image" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="Уменьшить"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() =>
                    setZoom((value) => Math.max(ZOOM_MIN, value - ZOOM_STEP))
                  }
                >
                  <ZoomOut className="size-4" />
                </Button>
                <button
                  type="button"
                  className="min-w-10 rounded-md px-1.5 py-1 text-center text-[11px] tabular-nums text-white/70 hover:bg-white/10 hover:text-white"
                  title="Сбросить масштаб"
                  onClick={() => setZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="Увеличить"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() =>
                    setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP))
                  }
                >
                  <ZoomIn className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="Сбросить масштаб"
                  onClick={() => setZoom(1)}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
                <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label={
                kind === "image"
                  ? "Копировать изображение"
                  : kind === "text"
                    ? "Копировать текст"
                    : "Копировать ссылку"
              }
              title={
                kind === "image"
                  ? "Копировать"
                  : kind === "text"
                    ? "Копировать текст"
                    : "Копировать ссылку"
              }
              disabled={!url}
              onClick={() => void handleCopy()}
            >
              {copyDone ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Скачать"
              disabled={!url}
              onClick={handleDownload}
            >
              <Download className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Открыть в новой вкладке"
              disabled={!url}
              onClick={handleOpenExternal}
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Закрыть"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {hasPrev ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 left-2 z-20 size-10 -translate-y-1/2 rounded-full bg-black/35 text-white/85 hover:bg-black/55 hover:text-white sm:left-3"
            aria-label="Предыдущий файл"
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : null}
        {hasNext ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-2 z-20 size-10 -translate-y-1/2 rounded-full bg-black/35 text-white/85 hover:bg-black/55 hover:text-white sm:right-3"
            aria-label="Следующий файл"
            onClick={() => goTo(index + 1)}
          >
            <ChevronRight className="size-5" />
          </Button>
        ) : null}

        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center px-3 pt-16 pb-6 sm:px-14",
            kind === "pdf" && "px-3 pt-14 pb-3 sm:px-4 sm:pt-14 sm:pb-4",
          )}
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          {stage}
        </div>
      </DialogContent>
    </Dialog>
  );
}
