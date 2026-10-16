import { parseEntityTabFileEntries } from "@/entities/entity";

/**
 * Count direct files inside a named folder of a files-tree JSON value
 * (`EntityTabFileEntry[]` on a files tab or file field).
 * Folder match is case-insensitive by name; first match wins.
 */
export function countDirectFilesInNamedFolder(
  raw: string | undefined,
  folderName: string,
): number {
  const name = folderName.trim().toLocaleLowerCase("ru");
  if (!name) return 0;
  const entries = parseEntityTabFileEntries(raw);
  const folder = entries.find(
    (entry) =>
      entry.kind === "folder" &&
      entry.name.trim().toLocaleLowerCase("ru") === name,
  );
  if (!folder) return 0;
  return entries.reduce(
    (count, entry) =>
      entry.kind === "file" && entry.parentId === folder.id ? count + 1 : count,
    0,
  );
}

export function folderHasFiles(
  raw: string | undefined,
  folderName: string,
): boolean {
  return countDirectFilesInNamedFolder(raw, folderName) > 0;
}

export function folderIsEmpty(
  raw: string | undefined,
  folderName: string,
): boolean {
  return countDirectFilesInNamedFolder(raw, folderName) === 0;
}
