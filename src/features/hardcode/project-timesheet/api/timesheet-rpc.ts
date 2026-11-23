import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { TimesheetSlicesResponse } from "../model/config";

export type TimesheetViewer = {
  userId: string | null;
};

const EMPTY: TimesheetSlicesResponse = {
  sessions: [],
  seeds: [],
  meta: { hasSource: false, accessScope: "personal", columns: [] },
};

/**
 * Fetch prepared timesheet rows from the backend. The server reads the config
 * from `timesheet_settings`, resolves the viewer's role/scope from the roles
 * config, applies access + legal entity + the month, and returns the full
 * scope-visible slice. The client only passes { userId } + month; filtering and
 * aggregation stay client-side (see aggregate.ts).
 */
export async function fetchTimesheetSlices(
  month: string,
  viewer: TimesheetViewer,
): Promise<TimesheetSlicesResponse> {
  if (!isSupabaseConfigured || !supabase) return EMPTY;
  const { data, error } = await supabase.rpc("project_timesheet_slices", {
    p_month: month,
    p_viewer: { userId: viewer.userId },
  });
  if (error) throw error;
  const result = (data ?? null) as TimesheetSlicesResponse | null;
  return {
    sessions: result?.sessions ?? [],
    seeds: result?.seeds ?? [],
    meta: {
      hasSource: result?.meta?.hasSource ?? false,
      accessScope: result?.meta?.accessScope ?? "personal",
      columns: result?.meta?.columns ?? [],
    },
  };
}
