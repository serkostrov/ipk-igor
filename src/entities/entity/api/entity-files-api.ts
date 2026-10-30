import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";

export const ENTITY_FILES_BUCKET = "entity-files";

/** Storage object keys must be ASCII-safe (Supabase rejects Cyrillic etc.). */
function sanitizeStorageFileName(name: string) {
  const trimmed = name.trim() || "file";
  const lastDot = trimmed.lastIndexOf(".");
  const rawExt = lastDot > 0 ? trimmed.slice(lastDot + 1) : "";
  const ext = rawExt
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);

  const rawStem = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const stem =
    rawStem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[_./-]+|[_./-]+$/g, "")
      .slice(0, 80) || "file";

  return ext ? `${stem}.${ext}` : stem;
}

export function buildEntityFileStoragePath(params: {
  entityId: string;
  recordId: string;
  tabId: string;
  entryId: string;
  fileName: string;
}) {
  const safeName = sanitizeStorageFileName(params.fileName);
  return [
    params.entityId,
    params.recordId,
    params.tabId,
    params.entryId,
    safeName,
  ].join("/");
}

export function buildEntityFieldFileStoragePath(params: {
  entityId: string;
  recordId: string;
  fieldId: string;
  entryId: string;
  fileName: string;
}) {
  const safeName = sanitizeStorageFileName(params.fileName);
  return [
    params.entityId,
    params.recordId,
    "fields",
    params.fieldId,
    params.entryId,
    safeName,
  ].join("/");
}

/** Note attachment path: `{entity}/{record}/{tab}/notes/{noteId}/{entryId}/{name}`. */
export function buildEntityNoteAttachmentStoragePath(params: {
  entityId: string;
  recordId: string;
  tabId: string;
  noteId: string;
  entryId: string;
  fileName: string;
}) {
  const safeName = sanitizeStorageFileName(params.fileName);
  return [
    params.entityId,
    params.recordId,
    params.tabId,
    "notes",
    params.noteId,
    params.entryId,
    safeName,
  ].join("/");
}

async function uploadToEntityFilesBucket(
  storagePath: string,
  file: File,
): Promise<{ storagePath?: string; dataUrl?: string }> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.storage
      .from(ENTITY_FILES_BUCKET)
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (error) throw error;
    return { storagePath };
  }

  const dataUrl = await readFileAsDataUrl(file);
  return { dataUrl };
}

export async function uploadEntityFile(params: {
  entityId: string;
  recordId: string;
  tabId: string;
  entryId: string;
  file: File;
}): Promise<{ storagePath?: string; dataUrl?: string }> {
  const storagePath = buildEntityFileStoragePath({
    entityId: params.entityId,
    recordId: params.recordId,
    tabId: params.tabId,
    entryId: params.entryId,
    fileName: params.file.name,
  });
  return uploadToEntityFilesBucket(storagePath, params.file);
}

export async function uploadEntityFieldFile(params: {
  entityId: string;
  recordId: string;
  fieldId: string;
  entryId: string;
  file: File;
}): Promise<{ storagePath?: string; dataUrl?: string }> {
  const storagePath = buildEntityFieldFileStoragePath({
    entityId: params.entityId,
    recordId: params.recordId,
    fieldId: params.fieldId,
    entryId: params.entryId,
    fileName: params.file.name,
  });
  return uploadToEntityFilesBucket(storagePath, params.file);
}

export async function uploadEntityNoteAttachment(params: {
  entityId: string;
  recordId: string;
  tabId: string;
  noteId: string;
  entryId: string;
  file: File;
}): Promise<{ storagePath?: string; dataUrl?: string }> {
  const storagePath = buildEntityNoteAttachmentStoragePath({
    entityId: params.entityId,
    recordId: params.recordId,
    tabId: params.tabId,
    noteId: params.noteId,
    entryId: params.entryId,
    fileName: params.file.name,
  });
  return uploadToEntityFilesBucket(storagePath, params.file);
}

export async function getEntityFileDownloadUrl(
  storagePath: string,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Хранилище файлов недоступно");
  }

  const { data, error } = await supabase.storage
    .from(ENTITY_FILES_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Не удалось получить ссылку на файл");
  return data.signedUrl;
}

/** Duplicate a storage object (e.g. when copying files between records). */
export async function copyEntityFileObject(
  fromPath: string,
  toPath: string,
): Promise<void> {
  const source = fromPath.trim();
  const target = toPath.trim();
  if (!source || !target) {
    throw new Error("Некорректный путь файла");
  }
  if (source === target) return;

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Хранилище файлов недоступно");
  }

  const { error } = await supabase.storage
    .from(ENTITY_FILES_BUCKET)
    .copy(source, target);
  if (error) throw error;
}

export async function deleteEntityFileObject(
  storagePath: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase.storage
    .from(ENTITY_FILES_BUCKET)
    .remove([storagePath]);

  if (error) throw error;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Не удалось прочитать файл"));
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
