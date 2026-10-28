import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { normalizeEntity } from "../lib/parse-entity-config";
import type { Entity } from "../model/types";

export type EntitySchemaVersion = {
  id: number;
  entityId: string;
  version: number;
  /** Structure-only entity (records = []). */
  definition: Entity;
  message: string;
  actorId: string | null;
  createdAt: string;
};

type VersionRow = {
  id: number;
  entity_id: string;
  version: number;
  definition: unknown;
  message: string;
  actor_id: string | null;
  created_at: string;
};

function rowToVersion(row: VersionRow): EntitySchemaVersion | null {
  if (typeof row.entity_id !== "string" || !row.entity_id.trim()) return null;
  if (typeof row.version !== "number" || row.version < 1) return null;
  const definitionRaw =
    typeof row.definition === "object" &&
    row.definition !== null &&
    !Array.isArray(row.definition)
      ? { ...(row.definition as Record<string, unknown>), id: row.entity_id }
      : { id: row.entity_id };
  try {
    const definition = normalizeEntity({
      ...(definitionRaw as Parameters<typeof normalizeEntity>[0]),
      records: [],
      publishedVersion: row.version,
    });
    return {
      id: row.id,
      entityId: row.entity_id,
      version: row.version,
      definition,
      message: typeof row.message === "string" ? row.message.trim() : "",
      actorId:
        typeof row.actor_id === "string" && row.actor_id.trim()
          ? row.actor_id.trim()
          : null,
      createdAt: row.created_at,
    };
  } catch (error) {
    console.error("[entity] failed to parse schema version", row.id, error);
    return null;
  }
}

export async function fetchEntitySchemaVersions(
  entityId: string,
): Promise<EntitySchemaVersion[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("entity_schema_versions")
    .select("id, entity_id, version, definition, message, actor_id, created_at")
    .eq("entity_id", entityId)
    .order("version", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as VersionRow[])
    .map(rowToVersion)
    .filter((item): item is EntitySchemaVersion => item != null);
}

export async function fetchEntitySchemaVersion(
  entityId: string,
  version: number,
): Promise<EntitySchemaVersion | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("entity_schema_versions")
    .select("id, entity_id, version, definition, message, actor_id, created_at")
    .eq("entity_id", entityId)
    .eq("version", version)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToVersion(data as VersionRow);
}

export async function insertEntitySchemaVersion(input: {
  entityId: string;
  version: number;
  definition: unknown;
  message: string;
  actorId?: string | null;
}): Promise<EntitySchemaVersion> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const message = input.message.trim();
  if (!message) throw new Error("Укажите сообщение версии");

  const row: Record<string, unknown> = {
    entity_id: input.entityId,
    version: input.version,
    definition: input.definition,
    message,
  };
  if (input.actorId) row.actor_id = input.actorId;

  const { data, error } = await supabase
    .from("entity_schema_versions")
    .insert(row)
    .select("id, entity_id, version, definition, message, actor_id, created_at")
    .single();

  if (error) throw error;
  const parsed = rowToVersion(data as VersionRow);
  if (!parsed) throw new Error("Не удалось сохранить версию схемы");
  return parsed;
}
