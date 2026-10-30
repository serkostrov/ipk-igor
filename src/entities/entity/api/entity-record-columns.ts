/**
 * `entity_records` select list.
 * Prefer columns that exist before the RBAC migration (`created_by`)
 * and schema versioning (`schema_version`). Flags are independent — a DB
 * may have schema_version without created_by (or the reverse).
 */

export const ENTITY_RECORD_SELECT =
  "id, entity_id, field_values, auth_user_id, created_by, schema_version";

/** schema_version without created_by (RBAC migration not applied). */
export const ENTITY_RECORD_SELECT_NO_CREATED_BY =
  "id, entity_id, field_values, auth_user_id, schema_version";

/** With created_by, before schema_version migration. */
export const ENTITY_RECORD_SELECT_NO_SCHEMA_VERSION =
  "id, entity_id, field_values, auth_user_id, created_by";

/** Pre-RBAC / pre-versioning schema. */
export const ENTITY_RECORD_SELECT_LEGACY =
  "id, entity_id, field_values, auth_user_id";

const CAPABILITY_STORAGE_KEY = "ipk.entity_records.column_caps";

type ColumnCaps = {
  createdBy: boolean;
  schemaVersion: boolean;
};

function readStoredCaps(): ColumnCaps | null {
  try {
    const raw = sessionStorage.getItem(CAPABILITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ColumnCaps>;
    if (
      typeof parsed.createdBy !== "boolean" ||
      typeof parsed.schemaVersion !== "boolean"
    ) {
      return null;
    }
    return {
      createdBy: parsed.createdBy,
      schemaVersion: parsed.schemaVersion,
    };
  } catch {
    return null;
  }
}

function writeStoredCaps(caps: ColumnCaps) {
  try {
    sessionStorage.setItem(CAPABILITY_STORAGE_KEY, JSON.stringify(caps));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

const stored = readStoredCaps();
let useCreatedBy = stored?.createdBy ?? true;
let useSchemaVersion = stored?.schemaVersion ?? true;

function persistCaps() {
  writeStoredCaps({
    createdBy: useCreatedBy,
    schemaVersion: useSchemaVersion,
  });
}

export function entityRecordsSelect() {
  if (useCreatedBy && useSchemaVersion) return ENTITY_RECORD_SELECT;
  if (!useCreatedBy && useSchemaVersion) {
    return ENTITY_RECORD_SELECT_NO_CREATED_BY;
  }
  if (useCreatedBy && !useSchemaVersion) {
    return ENTITY_RECORD_SELECT_NO_SCHEMA_VERSION;
  }
  return ENTITY_RECORD_SELECT_LEGACY;
}

export function markEntityRecordsCreatedByUnsupported() {
  if (!useCreatedBy) return;
  useCreatedBy = false;
  persistCaps();
}

export function markEntityRecordsSchemaVersionUnsupported() {
  if (!useSchemaVersion) return;
  useSchemaVersion = false;
  persistCaps();
}

export function entityRecordsSupportsCreatedBy() {
  return useCreatedBy;
}

export function entityRecordsSupportsSchemaVersion() {
  return useSchemaVersion;
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

export function isMissingSchemaVersionColumn(error: PgError) {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const text = [error.message, error.hint, error.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
  return text.includes("schema_version");
}
