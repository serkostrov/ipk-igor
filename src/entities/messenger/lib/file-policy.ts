const MAX_FILE_BYTES = 50 * 1024 * 1024;

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
  "svg",
  "zip",
  "rar",
  "7z",
  "mp4",
  "mov",
  "mp3",
  "wav",
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

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().split(".");
  if (parts.length < 2) return "";
  return (parts.at(-1) ?? "").toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function assertMessengerFileAllowed(file: File): void {
  const extension = getFileExtension(file.name);
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error("Данный тип файла запрещен для загрузки");
  }
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Данный тип файла запрещен для загрузки");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Файл превышает допустимый размер");
  }
}

export const MESSENGER_MAX_FILE_BYTES = MAX_FILE_BYTES;
