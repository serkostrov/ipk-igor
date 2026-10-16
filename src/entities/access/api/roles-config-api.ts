import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { RolesConfig } from "../model/types";
import { parseRolesConfig, toRolesDocument } from "../lib/parse-roles-config";

export const ROLES_DOCUMENT_KEY = "roles";

export async function fetchRolesConfig(): Promise<RolesConfig | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("app_documents")
    .select("value")
    .eq("key", ROLES_DOCUMENT_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return parseRolesConfig(data.value);
}

export async function saveRolesConfig(config: RolesConfig): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const { error } = await supabase.from("app_documents").upsert(
    {
      key: ROLES_DOCUMENT_KEY,
      value: toRolesDocument(config),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) throw error;
}
