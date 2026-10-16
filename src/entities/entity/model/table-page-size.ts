/** Page sizes offered in the entity table footer. */
export const ENTITY_TABLE_PAGE_SIZES = [25, 50, 100] as const;

export type EntityTablePageSize = (typeof ENTITY_TABLE_PAGE_SIZES)[number];

export const DEFAULT_ENTITY_TABLE_PAGE_SIZE: EntityTablePageSize = 25;

/** Shared with table UI and records fetch batching. */
export const ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY = "entity-table-page-size";

export function isEntityTablePageSize(
  value: unknown,
): value is EntityTablePageSize {
  return (
    typeof value === "number" &&
    (ENTITY_TABLE_PAGE_SIZES as readonly number[]).includes(value)
  );
}

export function parseEntityTablePageSize(
  value: unknown,
): EntityTablePageSize | null {
  return isEntityTablePageSize(value) ? value : null;
}

/** Last chosen table page size (fallback: default). Display pagination only. */
export function readEntityTablePageSize(): EntityTablePageSize {
  if (typeof window === "undefined") return DEFAULT_ENTITY_TABLE_PAGE_SIZE;
  try {
    const raw = window.localStorage.getItem(ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY);
    if (raw == null) return DEFAULT_ENTITY_TABLE_PAGE_SIZE;
    return (
      parseEntityTablePageSize(JSON.parse(raw)) ??
      DEFAULT_ENTITY_TABLE_PAGE_SIZE
    );
  } catch {
    return DEFAULT_ENTITY_TABLE_PAGE_SIZE;
  }
}
