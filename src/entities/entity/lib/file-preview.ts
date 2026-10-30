import { getEntityFileDownloadUrl } from "../api/entity-files-api";

/** Minimal file shape the in-app viewer can open. */
export type EntityFileViewerItem = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
  dataUrl?: string;
};

export type EntityFilePreviewKind =
  "image" | "pdf" | "video" | "audio" | "text" | "unknown";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;
const PDF_EXT = /\.pdf$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const TEXT_EXT =
  /\.(txt|md|csv|json|xml|log|tsv|yml|yaml|ini|env|ts|tsx|js|jsx|css|html|svg)$/i;

/** Soft cap for in-viewer text fetch (bytes). */
export const ENTITY_FILE_TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

export function getEntityFilePreviewKind(file: {
  name: string;
  mimeType?: string;
}): EntityFilePreviewKind {
  const mime = file.mimeType?.trim().toLowerCase() ?? "";
  const name = file.name.trim();

  if (mime.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  if (
    mime === "application/pdf" ||
    mime.includes("pdf") ||
    PDF_EXT.test(name)
  ) {
    return "pdf";
  }
  if (mime.startsWith("video/") || VIDEO_EXT.test(name)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXT.test(name)) return "audio";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    TEXT_EXT.test(name)
  ) {
    return "text";
  }
  return "unknown";
}

export function isEntityFilePreviewable(file: {
  name: string;
  mimeType?: string;
}): boolean {
  return getEntityFilePreviewKind(file) !== "unknown";
}

/** Resolve a temporary URL for display / download (signed or data URL). */
export async function resolveEntityFileUrl(file: {
  storagePath?: string;
  dataUrl?: string;
}): Promise<string> {
  if (file.dataUrl?.trim()) return file.dataUrl.trim();
  const path = file.storagePath?.trim();
  if (!path) throw new Error("Файл недоступен");
  return getEntityFileDownloadUrl(path);
}

export function downloadEntityFileFromUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
