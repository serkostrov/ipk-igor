import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { EntityRecord } from "../model/types";
import { normalizeEntityRecord } from "../lib/parse-entity-config";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_EMAIL_ID,
  SYSTEM_USERS_FIELD_NAME_ID,
  SYSTEM_USERS_FIELD_PHONE_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
} from "../model/system-entities";
import {
  ENTITY_RECORD_SELECT,
  ENTITY_RECORD_SELECT_LEGACY,
  entityRecordsSupportsCreatedBy,
  isMissingCreatedByColumn,
  markEntityRecordsCreatedByUnsupported,
} from "./entity-record-columns";

/** Keep in sync with `ROLE_ADMIN_ID` in entities/access. */
const DEFAULT_ROLE_ID = "role-system-admin";

type EntityRecordRow = {
  id: string;
  entity_id: string;
  field_values: unknown;
  auth_user_id: string | null;
  created_by?: string | null;
};

function parseFieldValues(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") values[key] = item;
    else if (item != null) values[key] = String(item);
  }
  return values;
}

function rowToRecord(row: EntityRecordRow): EntityRecord {
  return normalizeEntityRecord({
    id: row.id,
    values: parseFieldValues(row.field_values),
    authUserId: row.auth_user_id,
    createdBy:
      typeof row.created_by === "string" && row.created_by.trim().length > 0
        ? row.created_by.trim()
        : null,
  });
}

function recordSelect() {
  return entityRecordsSupportsCreatedBy()
    ? ENTITY_RECORD_SELECT
    : ENTITY_RECORD_SELECT_LEGACY;
}

/**
 * Ensures the signed-in auth user has a Users entity record.
 * Creates one on first login (e.g. bootstrap admin from Auth dashboard).
 */
export async function ensureCurrentUserProfile(input: {
  authUserId: string;
  email: string | null | undefined;
  fullName: string | null | undefined;
  defaultRoleId?: string;
}): Promise<EntityRecord | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const defaultRoleId = input.defaultRoleId?.trim() || DEFAULT_ROLE_ID;

  let { data: existing, error: existingError } = await supabase
    .from("entity_records")
    .select(recordSelect())
    .eq("auth_user_id", input.authUserId)
    .maybeSingle();

  if (isMissingCreatedByColumn(existingError)) {
    markEntityRecordsCreatedByUnsupported();
    ({ data: existing, error: existingError } = await supabase
      .from("entity_records")
      .select(ENTITY_RECORD_SELECT_LEGACY)
      .eq("auth_user_id", input.authUserId)
      .maybeSingle());
  }

  if (existingError) throw existingError;
  if (existing) {
    const record = rowToRecord(existing as unknown as EntityRecordRow);
    const roleId = record.values[SYSTEM_USERS_FIELD_ROLE_ID]?.trim() ?? "";
    if (!roleId) {
      const nextValues = {
        ...record.values,
        [SYSTEM_USERS_FIELD_ROLE_ID]: defaultRoleId,
      };
      let { data: updated, error: updateError } = await supabase
        .from("entity_records")
        .update({
          field_values: nextValues,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id)
        .select(recordSelect())
        .single();
      if (isMissingCreatedByColumn(updateError)) {
        markEntityRecordsCreatedByUnsupported();
        ({ data: updated, error: updateError } = await supabase
          .from("entity_records")
          .update({
            field_values: nextValues,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id)
          .select(ENTITY_RECORD_SELECT_LEGACY)
          .single());
      }
      if (updateError) throw updateError;
      return rowToRecord(updated as unknown as EntityRecordRow);
    }
    return record;
  }

  const email = (input.email ?? "").trim().toLowerCase();
  const name =
    (input.fullName ?? "").trim() ||
    (email.includes("@") ? email.split("@")[0]! : "Пользователь");

  const recordId = `record-${crypto.randomUUID()}`;
  const values: Record<string, string> = {
    [SYSTEM_USERS_FIELD_NAME_ID]: name,
    [SYSTEM_USERS_FIELD_EMAIL_ID]: email,
    [SYSTEM_USERS_FIELD_PHONE_ID]: "",
    [SYSTEM_USERS_FIELD_ROLE_ID]: defaultRoleId,
  };

  const row: Record<string, unknown> = {
    id: recordId,
    entity_id: SYSTEM_USERS_ENTITY_ID,
    field_values: values,
    auth_user_id: input.authUserId,
    updated_at: new Date().toISOString(),
  };
  if (entityRecordsSupportsCreatedBy()) {
    row.created_by = input.authUserId;
  }

  let { data, error } = await supabase
    .from("entity_records")
    .insert(row)
    .select(recordSelect())
    .single();

  if (isMissingCreatedByColumn(error)) {
    markEntityRecordsCreatedByUnsupported();
    delete row.created_by;
    ({ data, error } = await supabase
      .from("entity_records")
      .insert(row)
      .select(ENTITY_RECORD_SELECT_LEGACY)
      .single());
  }

  if (error) throw error;

  return rowToRecord(data as unknown as EntityRecordRow);
}
