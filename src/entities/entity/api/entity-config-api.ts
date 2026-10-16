import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { EntityConfig } from "../model/types";
import {
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
