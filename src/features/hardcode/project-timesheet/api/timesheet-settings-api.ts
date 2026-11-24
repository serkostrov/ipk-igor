import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { TimesheetSettings } from "../model/config";

/** Singleton row id for the timesheet config. */
const SETTINGS_ID = "default";

/** One broken config reference reported by `timesheet_settings_validate`. */
export type TimesheetSettingsIssue = {
  /** JSON path of the reference inside the config, e.g. `sources[0].hostEntityId`. */
  path: string;
  /** The id that no longer resolves. */
  ref: string;
  kind: "entity";
};

/** Read the stored timesheet config (null when unset / Supabase off). */
export async function fetchTimesheetSettings(): Promise<TimesheetSettings | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("timesheet_settings")
    .select("config")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error) throw error;
  const config = (data?.config ?? null) as Partial<TimesheetSettings> | null;
  // The seeded row holds `{}` until an admin saves — treat an empty/malformed
  // config as "not set" so the editor prefills from the schema instead.
  if (!config || typeof config !== "object" || !Array.isArray(config.sources)) {
    return null;
  }
  return config as TimesheetSettings;
}

/** Persist the timesheet config (admin). */
export async function saveTimesheetSettings(
  config: TimesheetSettings,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  const { error } = await supabase.from("timesheet_settings").upsert(
    {
      id: SETTINGS_ID,
      config: config as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

/** Config references (entities) that no longer exist. Empty — clean. */
export async function validateTimesheetSettings(): Promise<
  TimesheetSettingsIssue[]
> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc("timesheet_settings_validate");
  if (error) throw error;
  return (data ?? []) as TimesheetSettingsIssue[];
}
