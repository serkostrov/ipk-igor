const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_POST = 10;

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "rtf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "js",
  "vbs",
  "ps1",
  "sh",
  "dmg",
  "apk",
]);

export function getFeedFileExtension(fileName: string): string {
  const parts = fileName.trim().split(".");
  if (parts.length < 2) return "";
  return (parts.at(-1) ?? "").toLowerCase();
}

export function formatFeedFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function assertFeedFileAllowed(file: File): void {
  const extension = getFeedFileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error("Данный тип файла запрещен для загрузки");
  }
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Данный тип файла запрещен для загрузки");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Файл превышает допустимый размер (25 МБ)");
  }
}

export function assertFeedFilesCount(
  currentCount: number,
  adding: number,
): void {
  if (currentCount + adding > MAX_FILES_PER_POST) {
    throw new Error(`Не более ${MAX_FILES_PER_POST} вложений на публикацию`);
  }
}

export function isFeedImageAttachment(
  mimeType: string,
  extension: string,
): boolean {
  if (mimeType.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(
    extension.toLowerCase(),
  );
}

export const FEED_MAX_FILE_BYTES = MAX_FILE_BYTES;
export const FEED_MAX_FILES_PER_POST = MAX_FILES_PER_POST;
