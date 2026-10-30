import type { EntityTabFileEntry } from "@/entities/entity";

export const PENDING_NEW_PRICE_KEY = "__tkp_pending_new_price_version__";
export const BIND_PRICE_REVISION_KEY = "__tkp_bind_price_revision_id__";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** Folder named «ТКП» (or containing that token) on a files tab. */
export function isTkpDocumentsFolder(entry: EntityTabFileEntry): boolean {
  if (entry.kind !== "folder") return false;
  const name = normalizeName(entry.name);
  return name === "ткп" || name.includes("ткп");
}

export function resolveTkpFolderAncestorId(
  entries: readonly EntityTabFileEntry[],
  parentId: string | null,
): string | null {
  let current = parentId;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  while (current) {
    const folder = byId.get(current);
    if (!folder || folder.kind !== "folder") return null;
    if (isTkpDocumentsFolder(folder)) return folder.id;
    current = folder.parentId;
  }
  return null;
}

export function resolveTkpFilePriceHistoryId(options: {
  entries: readonly EntityTabFileEntry[];
  parentId: string | null;
  recordValues: Record<string, string>;
}): string | null {
  if (!resolveTkpFolderAncestorId(options.entries, options.parentId)) {
    return null;
  }
  const bindId = options.recordValues[BIND_PRICE_REVISION_KEY]?.trim();
  if (bindId) return bindId;
  if (options.recordValues[PENDING_NEW_PRICE_KEY] === "1") {
    // Pending before first save — no revision id yet
    return null;
  }
  return null;
}

export function clearTkpPriceBindKeys(
  values: Record<string, string>,
): Record<string, string> {
  return {
    ...values,
    [PENDING_NEW_PRICE_KEY]: "",
    [BIND_PRICE_REVISION_KEY]: "",
  };
}
