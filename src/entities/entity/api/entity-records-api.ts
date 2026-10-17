import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { withTimeout } from "@/shared/lib/with-timeout";
import type { EntityRecord } from "../model/types";
import { normalizeEntityRecord } from "../lib/parse-entity-config";
import {
  ENTITY_RECORD_SELECT,
  ENTITY_RECORD_SELECT_LEGACY,
  entityRecordsSupportsCreatedBy,
  isMissingCreatedByColumn,
  markEntityRecordsCreatedByUnsupported,
} from "./entity-record-columns";

type EntityRecordRow = {
  id: string;
  entity_id: string;
  field_values: unknown;
  auth_user_id?: string | null;
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
    authUserId:
      typeof row.auth_user_id === "string" && row.auth_user_id.trim().length > 0
        ? row.auth_user_id.trim()
        : null,
    createdBy:
      typeof row.created_by === "string" && row.created_by.trim().length > 0
        ? row.created_by.trim()
        : null,
  });
}

/** Parse a raw `entity_records` row (e.g. a Realtime payload). */
export function parseEntityRecordRow(
  value: unknown,
): { entityId: string; record: EntityRecord } | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<EntityRecordRow>;
  if (typeof row.id !== "string" || typeof row.entity_id !== "string") {
    return null;
  }
  return {
    entityId: row.entity_id,
    record: rowToRecord(row as EntityRecordRow),
  };
}

/** Subscribe to inserts/updates/deletes in `entity_records`. */
export function subscribeEntityRecordChanges(handlers: {
  onUpsert: (entityId: string, record: EntityRecord) => void;
  onDelete: (recordId: string) => void;
}): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel("entity-records-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entity_records" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: unknown } | null)?.id;
          if (typeof id === "string") handlers.onDelete(id);
          return;
        }
        const parsed = parseEntityRecordRow(payload.new);
        if (parsed) handlers.onUpsert(parsed.entityId, parsed.record);
      },
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[entity] records realtime", status, err);
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * PostgREST / Supabase silently caps a single response (default 1000 rows).
 * Fetch in max-size pages — unrelated to the table UI page size (25/50/100).
 */
const ENTITY_RECORDS_FETCH_PAGE_SIZE = 1000;

type FetchPageError = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string;
};

async function fetchEntityRecordsPages(
  select: string,
  entityId?: string,
): Promise<{ rows: EntityRecordRow[]; error: FetchPageError | null }> {
  if (!supabase) return { rows: [], error: null };

  const rows: EntityRecordRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("entity_records")
      .select(select)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + ENTITY_RECORDS_FETCH_PAGE_SIZE - 1);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await withTimeout(
      query as unknown as Promise<{
        data: unknown;
        error: FetchPageError | null;
      }>,
      15_000,
      "entity_records page",
    );
    if (error) return { rows, error };

    const page = (data ?? []) as unknown as EntityRecordRow[];
    rows.push(...page);
    if (page.length < ENTITY_RECORDS_FETCH_PAGE_SIZE) break;
    offset += ENTITY_RECORDS_FETCH_PAGE_SIZE;
  }

  return { rows, error: null };
}

export async function fetchEntityRecords(
  entityId?: string,
): Promise<EntityRecordRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  if (entityRecordsSupportsCreatedBy()) {
    const result = await fetchEntityRecordsPages(
      ENTITY_RECORD_SELECT,
      entityId,
    );
    if (!result.error) return result.rows;
    if (!isMissingCreatedByColumn(result.error)) throw result.error;
    markEntityRecordsCreatedByUnsupported();
  }

  const legacy = await fetchEntityRecordsPages(
    ENTITY_RECORD_SELECT_LEGACY,
    entityId,
  );
  if (legacy.error) throw legacy.error;
  return legacy.rows;
}

export async function fetchRecordsByEntityId(): Promise<
  Record<string, EntityRecord[]>
> {
  const rows = await fetchEntityRecords();
  const byEntity: Record<string, EntityRecord[]> = {};

  for (const row of rows) {
    const list = byEntity[row.entity_id] ?? [];
    list.push(rowToRecord(row));
    byEntity[row.entity_id] = list;
  }

  return byEntity;
}

export async function insertEntityRecord(
  entityId: string,
  record: EntityRecord,
): Promise<EntityRecord> {
  if (!isSupabaseConfigured || !supabase) {
    return normalizeEntityRecord(record);
  }

  const normalized = normalizeEntityRecord(record);
  const withOwner = entityRecordsSupportsCreatedBy();
  const row: Record<string, unknown> = {
    id: normalized.id,
    entity_id: entityId,
    field_values: normalized.values,
    auth_user_id: normalized.authUserId,
    updated_at: new Date().toISOString(),
  };
  if (withOwner && normalized.createdBy) {
    row.created_by = normalized.createdBy;
  }

  const select = withOwner ? ENTITY_RECORD_SELECT : ENTITY_RECORD_SELECT_LEGACY;

  let { data, error } = await supabase
    .from("entity_records")
    .insert(row)
    .select(select)
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

function isAutomationPersistError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  return (
    message.includes("AUTOMATION_BLOCKED") ||
    message.includes("AUTOMATION_ORDER")
  );
}

function isMissingRpcError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "PGRST202" ||
    code === "42883" ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}

/**
 * Updates record field values via merge RPC when available.
 * Falls back to a direct update only when the RPC is missing (pre-migration).
 * Automation guard errors are never masked by a second write attempt.
 */
export async function updateEntityRecordValues(
  recordId: string,
  values: Record<string, string>,
): Promise<EntityRecord> {
  const normalized = normalizeEntityRecord({
    id: recordId,
    values,
    authUserId: null,
    createdBy: null,
  });

  if (!isSupabaseConfigured || !supabase) {
    return normalized;
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "update_entity_record_values",
    {
      p_record_id: recordId,
      p_patch: normalized.values,
    },
  );

  if (!rpcError && rpcData) {
    const row = (
      Array.isArray(rpcData) ? rpcData[0] : rpcData
    ) as EntityRecordRow;
    return rowToRecord(row);
  }

  if (rpcError) {
    if (isAutomationPersistError(rpcError)) throw rpcError;
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

  const select = entityRecordsSupportsCreatedBy()
    ? ENTITY_RECORD_SELECT
    : ENTITY_RECORD_SELECT_LEGACY;

  let { data, error } = await supabase
    .from("entity_records")
    .update({
      field_values: normalized.values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .select(select)
    .single();

  if (isMissingCreatedByColumn(error)) {
    markEntityRecordsCreatedByUnsupported();
    ({ data, error } = await supabase
      .from("entity_records")
      .update({
        field_values: normalized.values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId)
      .select(ENTITY_RECORD_SELECT_LEGACY)
      .single());
  }

  if (error) throw error;
  return rowToRecord(data as unknown as EntityRecordRow);
}

export async function deleteEntityRecord(recordId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase
    .from("entity_records")
    .delete()
    .eq("id", recordId);

  if (error) throw error;
}

export async function deleteEntityRecordsByEntityId(
  entityId: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const { error } = await supabase
    .from("entity_records")
    .delete()
    .eq("entity_id", entityId);

  if (error) throw error;
}
