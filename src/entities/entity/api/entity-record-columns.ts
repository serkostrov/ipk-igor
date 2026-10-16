/**
 * `entity_records` select list.
 * Prefer columns that exist before the RBAC migration (`created_by`).
 * Ownership is filled when the column is present (see mark / probe helpers).
 */
export const ENTITY_RECORD_SELECT =
  "id, entity_id, field_values, auth_user_id, created_by";

/** Pre-RBAC schema (no `created_by` column yet). */
export const ENTITY_RECORD_SELECT_LEGACY =
  "id, entity_id, field_values, auth_user_id";

let useLegacySelect = false;

export function entityRecordsSelect() {
  return useLegacySelect ? ENTITY_RECORD_SELECT_LEGACY : ENTITY_RECORD_SELECT;
}

export function markEntityRecordsCreatedByUnsupported() {
  useLegacySelect = true;
}

export function entityRecordsSupportsCreatedBy() {
  return !useLegacySelect;
}

type PgError = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string;
} | null;

/**
 * True when the DB rejects `created_by` (migration not applied yet).
 * PostgREST often only puts the suggested column in `hint`
 * («Perhaps you meant … created_at»).
 */
export function isMissingCreatedByColumn(error: PgError) {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const text = [error.message, error.hint, error.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  if (text.includes("created_by")) return true;
  // Hint naming created_at after a select that asked for created_by.
  return text.includes("created_at") && text.includes("perhaps you meant");
}
