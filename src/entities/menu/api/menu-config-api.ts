import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { MenuConfig } from "../model/types";
import { parseMenuConfig } from "../lib/parse-menu-config";

const MENU_DOCUMENT_KEY = "menu";

export async function fetchMenuConfig(): Promise<MenuConfig | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("app_documents")
    .select("value")
    .eq("key", MENU_DOCUMENT_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return parseMenuConfig(data.value);
}

export async function saveMenuConfig(config: MenuConfig): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const { error } = await supabase.from("app_documents").upsert(
    {
      key: MENU_DOCUMENT_KEY,
      value: config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) throw error;
}
