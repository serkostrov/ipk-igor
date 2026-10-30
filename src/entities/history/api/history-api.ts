import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { projectDayStartUtcIso } from "@/shared/lib/datetime";
import type {
  EntityRecordEvent,
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

export async function fetchEntityRecordEvents(
  query: EntityRecordEventsQuery,
  page: { offset: number; limit: number },
): Promise<EntityRecordEventsPage> {
  if (!isSupabaseConfigured || !supabase) {
    return { events: [], hasMore: false };
  }

  let request = supabase
    .from("entity_record_events")
    .select("id, entity_id, record_id, action, changes, actor_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page.offset, page.offset + page.limit);

  if (query.recordId) request = request.eq("record_id", query.recordId);
  if (query.entityId) request = request.eq("entity_id", query.entityId);
  if (query.actorId) request = request.eq("actor_id", query.actorId);
  if (query.from)
    request = request.gte("created_at", localDayStartIso(query.from));
  if (query.to)
    request = request.lt("created_at", localDayStartIso(query.to, 1));

  const { data, error } = await request;
  if (error) throw error;

  const rows = (data ?? []) as EventRow[];
  return {
    events: rows.slice(0, page.limit).map(rowToEvent),
    hasMore: rows.length > page.limit,
  };
}
