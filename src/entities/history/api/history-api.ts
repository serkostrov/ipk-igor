import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { projectDayStartUtcIso } from "@/shared/lib/datetime";
import type {
  EntityRecordEvent,
  EntityEventsQuery,
  EntityStructureEvent,
  EntityRecordEventAction,
  EntityRecordEventChange,
  EntityRecordEventsPage,
  EntityRecordEventsQuery,
} from "../model/types";

type EventRow = {
  id: number;
  entity_id: string;
  record_id: string;
  action: string;
  changes: unknown;
  actor_id: string | null;
  created_at: string;
};

function toStoredValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseChanges(value: unknown): Record<string, EntityRecordEventChange> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const changes: Record<string, EntityRecordEventChange> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "object" || item === null) continue;
    const change = item as { old?: unknown; new?: unknown };
    changes[key] = {
      old: toStoredValue(change.old),
      new: toStoredValue(change.new),
    };
  }
  return changes;
}

function parseAction(value: string): EntityRecordEventAction {
  if (value === "insert" || value === "delete") return value;
  return "update";
}

function rowToEvent(row: EventRow): EntityRecordEvent {
  return {
    id: row.id,
    entityId: row.entity_id,
    recordId: row.record_id,
    action: parseAction(row.action),
    changes: parseChanges(row.changes),
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}

function localDayStartIso(date: string, offsetDays = 0) {
  return (
    projectDayStartUtcIso(date, offsetDays) ??
    // Fallback keeps the query valid if the date string is malformed.
    new Date(`${date}T00:00:00+03:00`).toISOString()
  );
}

type RecordEventsRpcResponse = {
  events: EventRow[];
  hasMore: boolean;
  labels: Record<string, string>;
};

export async function fetchEntityRecordEvents(
  query: EntityRecordEventsQuery,
  page: { offset: number; limit: number },
): Promise<EntityRecordEventsPage> {
  if (!isSupabaseConfigured || !supabase) {
    return { events: [], hasMore: false, labels: {} };
  }

  const { data, error } = await supabase.rpc("entity_record_events_page", {
    p_filter: {
      recordId: query.recordId ?? null,
      entityId: query.entityId ?? null,
      actorId: query.actorId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
    },
    p_offset: page.offset,
    p_limit: page.limit,
  });
  if (error) throw error;

  const result = (data ?? null) as RecordEventsRpcResponse | null;
  return {
    events: (result?.events ?? []).map(rowToEvent),
    hasMore: result?.hasMore ?? false,
    labels: result?.labels ?? {},
  };
}

export async function fetchEntityEvents(
  query: EntityEventsQuery,
  page: { offset: number; limit: number },
): Promise<{ events: EntityStructureEvent[]; hasMore: boolean }> {
  if (!isSupabaseConfigured || !supabase) return { events: [], hasMore: false };
  let request = supabase
    .from("entity_events")
    .select(
      "id, entity_id, entity_name, action, version, message, has_details, actor_id, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page.offset, page.offset + page.limit);

  if (query.entityId) request = request.eq("entity_id", query.entityId);
  if (query.actorId) request = request.eq("actor_id", query.actorId);
  if (query.from)
    request = request.gte("created_at", localDayStartIso(query.from));
  if (query.to)
    request = request.lt("created_at", localDayStartIso(query.to, 1));

  const { data, error } = await request;
  if (error) throw error;

  const rows = data ?? [];
  return {
    events: rows.slice(0, page.limit).map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      entityName: row.entity_name,
      action: row.action,
      version: row.version,
      message: row.message,
      hasDetails: row.has_details,
      actorId: row.actor_id,
      createdAt: row.created_at,
    })),
    hasMore: rows.length > page.limit,
  };
}

export async function fetchEntityEventDefinitions(
  eventId: number,
): Promise<{ before: unknown; after: unknown }> {
  if (!supabase) throw new Error("Supabase не настроен");
  const { data, error } = await supabase
    .from("entity_events")
    .select("before_definition, after_definition")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return { before: data.before_definition, after: data.after_definition };
}
