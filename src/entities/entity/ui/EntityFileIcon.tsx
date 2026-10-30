import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { getEntityFilePreviewKind } from "../lib/file-preview";

type EntityFileIconProps = {
  name: string;
  mimeType?: string;
  className?: string;
  iconClassName?: string;
};

type IconKey =
  "image" | "pdf" | "video" | "audio" | "text" | "sheet" | "archive" | "file";

function resolveIconKey(name: string, mimeType?: string): IconKey {
  const kind = getEntityFilePreviewKind({ name, mimeType });
  const mime = mimeType?.toLowerCase() ?? "";
  const lower = name.toLowerCase();

  if (kind === "image") return "image";
  if (kind === "pdf") return "pdf";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "text") return "text";
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    /\.(xlsx?|csv)$/.test(lower)
  ) {
    return "sheet";
  }
  if (
    mime.includes("zip") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    /\.(zip|rar|7z|tar|gz)$/.test(lower)
  ) {
    return "archive";
  }
  return "file";
}

export function EntityFileIcon({
  name,
  mimeType,
  className,
  iconClassName,
}: EntityFileIconProps) {
  const key = resolveIconKey(name, mimeType);
  const iconClass = cn("size-4 stroke-[1.5]", iconClassName);

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground",
        className,
      )}
    >
      {key === "image" ? <FileImage className={iconClass} /> : null}
      {key === "pdf" || key === "text" ? (
        <FileText className={iconClass} />
      ) : null}
      {key === "video" ? <FileVideo className={iconClass} /> : null}
      {key === "audio" ? <FileAudio className={iconClass} /> : null}
      {key === "sheet" ? <FileSpreadsheet className={iconClass} /> : null}
      {key === "archive" ? <FileArchive className={iconClass} /> : null}
      {key === "file" ? <File className={iconClass} /> : null}
    </span>
  );
}
