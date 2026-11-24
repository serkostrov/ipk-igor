import { parseLocalDatetime } from "@/shared/lib/datetime";
import type {
  ProjectTimesheetAccessScope,
  ProjectTimesheetRowSeed,
  TimesheetCells,
  TimesheetColumn,
  TimesheetRef,
} from "./contracts";
import type { TimesheetSessionSliceInput } from "./aggregate";

export type {
  TimesheetColumn,
  TimesheetColumnRoot,
  TimesheetRef,
} from "./contracts";

/** Wrap a single field id as a ref (null when unset). */
export function makeTimesheetRef(fieldId: string | null): TimesheetRef | null {
  return fieldId ? { path: [fieldId] } : null;
}

/** The leaf (last) field id of a ref, or null. Phase 1: the only field id. */
export function refLeafFieldId(ref: TimesheetRef | null | undefined): string | null {
  return ref?.path[ref.path.length - 1] ?? null;
}

/**
 * Field-ref map the RPC needs to resolve joins for one tracked source. This is
 * the stored, admin-managed shape — it carries NO access/scope: the viewer's
 * data-scope is resolved server-side from the roles config per request.
 *
 * `hostEntityId` / `source` (the row backbone) and `entryEntityId` (the logged-
 * time facts) are both hand-picked in the settings UI via explicit entity
 * selects; `hostEntityId` can also be auto-filled from the `link` relation
 * target when left unset. All are stored so the RPC knows which tables to scan.
 * The `shared` name lookups are NOT hand-maintained — the settings UI derives
 * them from the relation targets of the mapped slots (employee/project/task/
 * stage) and persists the result.
 */
/**
 * One named value a source exposes for display columns. `ref` is resolved via a
 * chain from the chosen root record (host / session / employee). Columns
 * reference it by `name` in their `{{…}}` templates; sources unify by sharing a
 * `name` (each mapping its own chain). `key` is a stable id for editing.
 */
export type TimesheetOutput = {
  key: string;
  name: string;
  ref: TimesheetRef;
};

export type TimesheetSourceConfig = {
  source: string;
  hostEntityId: string;
  entryEntityId: string;
  fields: {
    start: TimesheetRef | null;
    end: TimesheetRef | null;
    hours: TimesheetRef | null;
    employee: TimesheetRef | null;
    link: TimesheetRef | null;
    method: TimesheetRef | null;
    /** Option id (within the `method` list) that marks a timer entry. */
    timerOption: string | null;
    comment: TimesheetRef | null;
  };
  host: {
    name: TimesheetRef | null;
    project: TimesheetRef | null;
    parentTask: TimesheetRef | null;
    planned: TimesheetRef | null;
    startDate: TimesheetRef | null;
    due: TimesheetRef | null;
    status: TimesheetRef | null;
    /** Status option ids that mark the host completed (for acceptedAt). */
    finalStatusOptions: string[];
    stage: TimesheetRef | null;
    assignee: TimesheetRef | null;
  };
  /** Named values this source exposes for display-column templates. */
  outputs: TimesheetOutput[];
};

/** The full stored timesheet config (one singleton row in `timesheet_settings`). */
export type TimesheetSettings = {
  shared: {
    usersEntityId: string;
    userNameField: string | null;
    userDeptField: string | null;
    userLegalField: string | null;
    deptEntityId: string | null;
    deptNameField: string | null;
    projectEntityId: string | null;
    projectNameField: string | null;
    taskEntityId: string | null;
    taskNameField: string | null;
    stageEntityId: string | null;
    stageNameField: string | null;
  };
  sources: TimesheetSourceConfig[];
  /** Admin-defined free display columns (templates over host field refs). */
  columns: TimesheetColumn[];
};

/** Tokens (`{{…}}`) referenced by a column template, de-duplicated, in order. */
export function timesheetColumnTokens(template: string): string[] {
  const tokens: string[] = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) tokens.push(match[1].trim());
  return Array.from(new Set(tokens));
}

/**
 * Render a column template for one row: replace each `{{name}}` with the row's
 * resolved value for that source-output name from `cells` (missing → empty).
 * Pure — the RPC resolved every output; this only substitutes.
 */
export function renderTimesheetColumn(
  column: Pick<TimesheetColumn, "template">,
  cells: TimesheetCells | null | undefined,
): string {
  return column.template.replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, token: string) => cells?.[token.trim()] ?? "",
  );
}

/** A stored field ref that points at a field missing from its (existing) entity. */
export type TimesheetFieldIssue = { path: string; ref: string; kind: "field" };

type EntityLite = {
  id: string;
  fields: ReadonlyArray<{ id: string }>;
};

/**
 * Config field refs whose leaf field no longer exists on an entity that DOES
 * still exist. Entity-level breakage (the entity itself gone) is reported
 * separately by the server `timesheet_settings_validate` — here we only flag
 * dangling FIELD references, which the RPC degrades silently (null joins).
 * Pure over an entity list so the settings UI can run it against its loaded
 * config without another round-trip.
 */
export function findStaleFieldRefs(
  settings: TimesheetSettings,
  entities: readonly EntityLite[],
): TimesheetFieldIssue[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const issues: TimesheetFieldIssue[] = [];

  // Flag `fieldId` only when its entity exists but lacks the field.
  const check = (path: string, entityId: string | null, fieldId: string | null) => {
    if (!entityId || !fieldId) return;
    const entity = byId.get(entityId);
    if (!entity) return; // entity-level issue — reported server-side
    if (!entity.fields.some((f) => f.id === fieldId)) {
      issues.push({ path, ref: fieldId, kind: "field" });
    }
  };

  const s = settings.shared;
  check("shared.userNameField", s.usersEntityId, s.userNameField);
  check("shared.userDeptField", s.usersEntityId, s.userDeptField);
  check("shared.userLegalField", s.usersEntityId, s.userLegalField);
  check("shared.deptNameField", s.deptEntityId, s.deptNameField);
  check("shared.projectNameField", s.projectEntityId, s.projectNameField);
  check("shared.taskNameField", s.taskEntityId, s.taskNameField);
  check("shared.stageNameField", s.stageEntityId, s.stageNameField);

  settings.sources.forEach((src, i) => {
    // `method` is resolved via a (possibly multi-hop) path, so it's validated by
    // path resolution, not the single-hop leaf check below.
    const entryKeys = [
      "start",
      "end",
      "hours",
      "employee",
      "link",
      "comment",
    ] as const;
    for (const key of entryKeys) {
      check(
        `sources[${i}].fields.${key}`,
        src.entryEntityId,
        refLeafFieldId(src.fields[key]),
      );
    }
    const hostKeys = [
      "name",
      "project",
      "parentTask",
      "planned",
      "startDate",
      "due",
      "status",
      "stage",
      "assignee",
    ] as const;
    for (const key of hostKeys) {
      check(
        `sources[${i}].host.${key}`,
        src.hostEntityId,
        refLeafFieldId(src.host[key]),
      );
    }
  });

  return issues;
}

/** Raw session row as returned by the RPC (strings for numeric/date fields). */
export type RpcSessionRow = {
  source: string;
  sessionId: string;
  entryKind: "timer" | "manual";
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectTitle: string;
  stageId: string | null;
  stageTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  taskId: string;
  taskTitle: string;
  plannedHours: string | null;
  startDate: string | null;
  acceptedAt: string | null;
  note: string | null;
  startedAt: string | null;
  endedAt: string | null;
  hours: string | null;
  createdAt: string;
  cells?: TimesheetCells | null;
};

export type RpcSeedRow = {
  source: string;
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectTitle: string;
  stageId: string | null;
  stageTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  taskId: string;
  taskTitle: string;
  plannedHours: string | null;
  startDate: string | null;
  acceptedAt: string | null;
  cells?: TimesheetCells | null;
};

export type TimesheetSlicesResponse = {
  sessions: RpcSessionRow[];
  seeds: RpcSeedRow[];
  meta: {
    /** False when `timesheet_settings` has no configured sources. */
    hasSource: boolean;
    /** Payload-level access label (scope of the primary source). */
    accessScope: ProjectTimesheetAccessScope;
    /** Admin-defined display columns echoed from the stored config. */
    columns: TimesheetColumn[];
  };
};

function toIso(value: string | null): string | null {
  return value ? (parseLocalDatetime(value)?.toISOString() ?? null) : null;
}
function toNumber(value: string | null): number {
  return value ? Number(value) : Number.NaN;
}

/** Map an RPC session row to the aggregation input (duration computed here). */
export function sessionToSlice(
  row: RpcSessionRow,
  monthFirstDay: string,
): TimesheetSessionSliceInput {
  const startedAt = toIso(row.startedAt);
  const endedAt = toIso(row.endedAt);
  const hours = toNumber(row.hours);
  const durationSeconds =
    startedAt && endedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
              1000,
          ),
        )
      : Number.isFinite(hours)
        ? Math.round(hours * 3600)
        : 0;
  const occurredAt = startedAt ?? monthFirstDay;
  const planned = toNumber(row.plannedHours);
  return {
    source: row.source as TimesheetSessionSliceInput["source"],
    rowKey: `${row.source}:${row.taskId}:${row.employeeId}`,
    sessionId: row.sessionId,
    entryKind: row.entryKind,
    employeeId: row.employeeId,
    employeeName: row.employeeName || "—",
    employeeArchived: row.employeeName === "",
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    projectArchived: false,
    stageId: row.stageId,
    stageTitle: row.stageTitle,
    workItemId: row.workItemId,
    workItemTitle: row.workItemTitle,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    taskNumber: null,
    plannedHours: Number.isFinite(planned) ? planned : null,
    startDate: toIso(row.startDate),
    acceptedAt: toIso(row.acceptedAt),
    note: row.note,
    createdAt: row.createdAt,
    adjustedAt: null,
    adjustedById: null,
    adjustedByName: null,
    cells: row.cells ?? {},
    startedAt,
    endedAt,
    occurredAt,
    durationSeconds,
  };
}

/** Map an RPC seed row to a planned row seed. */
export function seedToRowSeed(row: RpcSeedRow): ProjectTimesheetRowSeed {
  const planned = toNumber(row.plannedHours);
  return {
    key: `${row.source}:${row.taskId}:${row.employeeId}`,
    source: row.source as ProjectTimesheetRowSeed["source"],
    employeeId: row.employeeId,
    employeeName: row.employeeName || "—",
    employeeArchived: row.employeeName === "",
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    projectArchived: false,
    stageId: row.stageId,
    stageTitle: row.stageTitle,
    workItemId: row.workItemId,
    workItemTitle: row.workItemTitle,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    taskNumber: null,
    plannedHours: Number.isFinite(planned) ? planned : null,
    startDate: toIso(row.startDate),
    acceptedAt: toIso(row.acceptedAt),
    cells: row.cells ?? {},
  };
}
