import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { Entity, EntityConfig } from "../model/types";
import {
  normalizeEntity,
  parseEntityConfig,
  toEntityStructure,
} from "../lib/parse-entity-config";

type EntityRow = {
  id: string;
  definition: unknown;
};

function rowToDefinition(row: EntityRow): Record<string, unknown> {
  const definition =
    typeof row.definition === "object" &&
    row.definition !== null &&
    !Array.isArray(row.definition)
      ? { ...(row.definition as Record<string, unknown>) }
      : {};

  return {
    ...definition,
    id: row.id,
  };
}

/** Parse one `entities` row into a structure-only Entity (records = []). */
export function parseEntityStructureRow(row: EntityRow): Entity | null {
  if (typeof row.id !== "string" || row.id.trim().length === 0) return null;
  const parsed = parseEntityConfig({ entities: [rowToDefinition(row)] });
  const entity = parsed.entities[0];
  return entity ? normalizeEntity(entity) : null;
}

export async function fetchEntityConfig(): Promise<EntityConfig | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("entities")
    .select("id, definition")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as EntityRow[];
  if (rows.length === 0) return { entities: [] };

  return parseEntityConfig({
    entities: rows.map(rowToDefinition),
  });
}

export async function saveEntityConfig(config: EntityConfig): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const client = supabase;
  const nextIds = new Set(config.entities.map((entity) => entity.id));
  const now = new Date().toISOString();

  const rows = config.entities.map((entity) => {
    const definition = toEntityStructure(entity);
    return {
      id: entity.id,
      definition,
      updated_at: now,
    };
  });

  if (rows.length > 0) {
    const { error: upsertError } = await client
      .from("entities")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;
  }

  const { data: existing, error: existingError } = await client
    .from("entities")
    .select("id");
  if (existingError) throw existingError;

  const existingIds = ((existing ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );
  const staleIds = existingIds.filter((id) => !nextIds.has(id));

  // Never mass-delete on a suspiciously small payload (e.g. empty fetch
  // before auth + ensureSystemEntities → only «Пользователи»). Upsert still
  // updates rows that are present; orphans stay until an intentional delete.
  const wouldWipeMost =
    existingIds.length > 1 &&
    staleIds.length >= Math.max(1, existingIds.length - 1);
  if (staleIds.length > 0 && !wouldWipeMost) {
    const { error: deleteError } = await client
      .from("entities")
      .delete()
      .in("id", staleIds);
    if (deleteError) throw deleteError;
  } else if (wouldWipeMost) {
    console.warn(
      "[entity] skip mass delete of stale entities",
      staleIds.length,
      "of",
      existingIds.length,
    );
  }
}

/** Subscribe to structure changes in `entities` (fields, list options, …). */
export function subscribeEntityStructureChanges(handlers: {
  onUpsert: (entity: Entity) => void;
  onDelete: (entityId: string) => void;
}): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel("entity-structure-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entities" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: unknown } | null)?.id;
          if (typeof id === "string") handlers.onDelete(id);
          return;
        }
        const row = payload.new as EntityRow | null;
        if (!row) return;
        const entity = parseEntityStructureRow(row);
        if (entity) handlers.onUpsert(entity);
      },
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[entity] structure realtime", status, err);
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
