import { useMemo } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { getCurrentUserRecordId } from "@/entities/entity";
import { fetchTimesheetSlices } from "../api/timesheet-rpc";
import { seedToRowSeed, sessionToSlice } from "../model/config";
import {
  aggregateProjectTimesheet,
  isProjectTimesheetLifecycleVisible,
  projectTimesheetMonthBounds,
  splitTimesheetSessionByMoscowDay,
} from "../model/aggregate";
import type {
  ProjectTimesheetAccessScope,
  ProjectTimesheetEntry,
  ProjectTimesheetInput,
  ProjectTimesheetPayload,
  ProjectTimesheetRowSeed,
  TimesheetColumn,
} from "../model/contracts";

export type UseProjectTimesheet = {
  data: ProjectTimesheetPayload | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasSource: boolean;
};

type TimesheetSlices = {
  entries: ProjectTimesheetEntry[];
  rowSeeds: ProjectTimesheetRowSeed[];
  accessScope: ProjectTimesheetAccessScope;
  columns: TimesheetColumn[];
  hasSource: boolean;
};

/**
 * Load the project timesheet for a month from the backend RPC and aggregate it.
 *
 * Read-only and backend-only: the client sends just { userId } + month. The
 * server reads the config from `timesheet_settings`, resolves the viewer's
 * role/scope from the roles config, and returns the full scope-visible slice.
 * This hook never reads the entity store and never mutates — configuration
 * lives behind the admin settings dialog.
 *
 * Employee/department/project filters narrow CLIENT-SIDE in `aggregate`, so the
 * filter option lists always reflect the full scope-visible set and changing a
 * filter re-aggregates without a refetch.
 */
export function useProjectTimesheet(
  input: ProjectTimesheetInput,
): UseProjectTimesheet {
  const {
    month,
    employeeId = null,
    departmentId = null,
    projectId = null,
    page,
    pageSize,
  } = input;

  // Fetch depends only on month + viewer (not on filters/pagination).
  const slices = useAsyncValue(async (): Promise<TimesheetSlices> => {
    const userId = getCurrentUserRecordId();
    const res = await fetchTimesheetSlices(month, { userId });
    if (!res.meta.hasSource) {
      return {
        entries: [],
        rowSeeds: [],
        accessScope: res.meta.accessScope,
        columns: res.meta.columns ?? [],
        hasSource: false,
      };
    }
    const bounds = projectTimesheetMonthBounds(month);
    const entries = res.sessions.flatMap((row) =>
      splitTimesheetSessionByMoscowDay(
        sessionToSlice(row, bounds.dateFrom),
        bounds,
      ),
    );
    const rowSeeds = res.seeds
      .map(seedToRowSeed)
      .filter((seed) =>
        isProjectTimesheetLifecycleVisible(
          { startDate: seed.startDate, acceptedAt: seed.acceptedAt },
          month,
        ),
      );
    return {
      entries,
      rowSeeds,
      accessScope: res.meta.accessScope,
      columns: res.meta.columns ?? [],
      hasSource: true,
    };
  }, [month]);

  const ready = slices.status === "ready" ? slices.value : null;

  const data = useMemo(() => {
    if (!ready || !ready.hasSource) return null;
    return aggregateProjectTimesheet(ready.rowSeeds, ready.entries, {
      month,
      employeeId,
      departmentId,
      projectId,
      page,
      pageSize,
      accessScope: ready.accessScope,
      columns: ready.columns,
    });
  }, [ready, month, employeeId, departmentId, projectId, page, pageSize]);

  return {
    data,
    isLoading: slices.status === "loading",
    isError: slices.status === "error",
    error: slices.status === "error" ? slices.error : null,
    hasSource: ready ? ready.hasSource : true,
  };
}
