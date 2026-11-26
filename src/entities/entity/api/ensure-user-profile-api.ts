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
import { parseEntityListValueIds } from "../model/field";
import {
  entityRecordsSelect,
  entityRecordsSupportsCreatedBy,
  isMissingCreatedByColumn,
  isMissingSchemaVersionColumn,
  markEntityRecordsCreatedByUnsupported,
  markEntityRecordsSchemaVersionUnsupported,
} from "./entity-record-columns";

/** Keep in sync with `ROLE_EMPLOYEE_ID` in entities/access — never default to admin. */
const DEFAULT_ROLE_ID = "role-system-employee";

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
    schemaVersion: 1,
  });
}

function recordSelect() {
  return entityRecordsSelect();
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

  if (isMissingSchemaVersionColumn(existingError)) {
    markEntityRecordsSchemaVersionUnsupported();
    ({ data: existing, error: existingError } = await supabase
      .from("entity_records")
      .select(recordSelect())
      .eq("auth_user_id", input.authUserId)
      .maybeSingle());
  }
  if (isMissingCreatedByColumn(existingError)) {
    markEntityRecordsCreatedByUnsupported();
    ({ data: existing, error: existingError } = await supabase
      .from("entity_records")
      .select(recordSelect())
      .eq("auth_user_id", input.authUserId)
      .maybeSingle());
  }

  if (existingError) throw existingError;
  if (existing) {
    return finalizeUserProfile(
      rowToRecord(existing as unknown as EntityRecordRow),
      defaultRoleId,
    );
  }

  const email = (input.email ?? "").trim().toLowerCase();
  const name =
    (input.fullName ?? "").trim() ||
    (email.includes("@") ? email.split("@")[0]! : "Пользователь");

  // Claim an orphan Users row that already has this email but no auth link.
  if (email) {
    let { data: orphans, error: orphanError } = await supabase
      .from("entity_records")
      .select(recordSelect())
      .eq("entity_id", SYSTEM_USERS_ENTITY_ID)
      .is("auth_user_id", null)
      .filter(`field_values->>"${SYSTEM_USERS_FIELD_EMAIL_ID}"`, "ilike", email)
      .limit(5);

    if (isMissingSchemaVersionColumn(orphanError)) {
      markEntityRecordsSchemaVersionUnsupported();
      ({ data: orphans, error: orphanError } = await supabase
        .from("entity_records")
        .select(recordSelect())
        .eq("entity_id", SYSTEM_USERS_ENTITY_ID)
        .is("auth_user_id", null)
        .filter(
          `field_values->>"${SYSTEM_USERS_FIELD_EMAIL_ID}"`,
          "ilike",
          email,
        )
        .limit(5));
    }
    if (isMissingCreatedByColumn(orphanError)) {
      markEntityRecordsCreatedByUnsupported();
      ({ data: orphans, error: orphanError } = await supabase
        .from("entity_records")
        .select(recordSelect())
        .eq("entity_id", SYSTEM_USERS_ENTITY_ID)
        .is("auth_user_id", null)
        .filter(
          `field_values->>"${SYSTEM_USERS_FIELD_EMAIL_ID}"`,
          "ilike",
          email,
        )
        .limit(5));
    }
    if (orphanError) throw orphanError;

    const orphan = ((orphans ?? []) as unknown as EntityRecordRow[]).find(
      (row) =>
        (parseFieldValues(row.field_values)[SYSTEM_USERS_FIELD_EMAIL_ID] ?? "")
          .trim()
          .toLowerCase() === email,
    );
    if (orphan) {
      const claimed = rowToRecord(orphan);
      const nextValues = {
        ...claimed.values,
        [SYSTEM_USERS_FIELD_NAME_ID]:
          (claimed.values[SYSTEM_USERS_FIELD_NAME_ID] ?? "").trim() || name,
        [SYSTEM_USERS_FIELD_EMAIL_ID]: email,
        [SYSTEM_USERS_FIELD_ROLE_ID]:
          parseEntityListValueIds(
            claimed.values[SYSTEM_USERS_FIELD_ROLE_ID],
          )[0]?.trim() || defaultRoleId,
      };
      let { data: updated, error: claimError } = await supabase
        .from("entity_records")
        .update({
          auth_user_id: input.authUserId,
          field_values: nextValues,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id)
        .is("auth_user_id", null)
        .select(recordSelect())
        .maybeSingle();
      if (isMissingSchemaVersionColumn(claimError)) {
        markEntityRecordsSchemaVersionUnsupported();
        ({ data: updated, error: claimError } = await supabase
          .from("entity_records")
          .update({
            auth_user_id: input.authUserId,
            field_values: nextValues,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claimed.id)
          .is("auth_user_id", null)
          .select(recordSelect())
          .maybeSingle());
      }
      if (isMissingCreatedByColumn(claimError)) {
        markEntityRecordsCreatedByUnsupported();
        ({ data: updated, error: claimError } = await supabase
          .from("entity_records")
          .update({
            auth_user_id: input.authUserId,
            field_values: nextValues,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claimed.id)
          .is("auth_user_id", null)
          .select(recordSelect())
          .maybeSingle());
      }
      if (claimError) throw claimError;
      if (updated) {
        return finalizeUserProfile(
          rowToRecord(updated as unknown as EntityRecordRow),
          defaultRoleId,
        );
      }
    }
  }

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

  if (isMissingSchemaVersionColumn(error)) {
    markEntityRecordsSchemaVersionUnsupported();
    delete row.schema_version;
    ({ data, error } = await supabase
      .from("entity_records")
      .insert(row)
      .select(recordSelect())
      .single());
  }
  if (isMissingCreatedByColumn(error)) {
    markEntityRecordsCreatedByUnsupported();
    delete row.created_by;
    ({ data, error } = await supabase
      .from("entity_records")
      .insert(row)
      .select(recordSelect())
      .single());
  }

  // Trigger on auth.users may have created the profile first — reuse it.
  if (error && /auth_user_id|duplicate|unique/i.test(error.message)) {
    const linked = await supabase
      .from("entity_records")
      .select(recordSelect())
      .eq("auth_user_id", input.authUserId)
      .maybeSingle();
    if (linked.error) throw linked.error;
    if (linked.data) {
      return finalizeUserProfile(
        rowToRecord(linked.data as unknown as EntityRecordRow),
        defaultRoleId,
      );
    }
  }

  if (error) throw error;

  return rowToRecord(data as unknown as EntityRecordRow);
}

async function finalizeUserProfile(
  record: EntityRecord,
  defaultRoleId: string,
): Promise<EntityRecord> {
  if (!isSupabaseConfigured || !supabase) return record;
  const roleId =
    parseEntityListValueIds(
      record.values[SYSTEM_USERS_FIELD_ROLE_ID],
    )[0]?.trim() ?? "";
  if (roleId) return record;

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
  if (isMissingSchemaVersionColumn(updateError)) {
    markEntityRecordsSchemaVersionUnsupported();
    ({ data: updated, error: updateError } = await supabase
      .from("entity_records")
      .update({
        field_values: nextValues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)
      .select(recordSelect())
      .single());
  }
  if (isMissingCreatedByColumn(updateError)) {
    markEntityRecordsCreatedByUnsupported();
    ({ data: updated, error: updateError } = await supabase
      .from("entity_records")
      .update({
        field_values: nextValues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)
      .select(recordSelect())
      .single());
  }
  if (updateError) throw updateError;
  return rowToRecord(updated as unknown as EntityRecordRow);
}
