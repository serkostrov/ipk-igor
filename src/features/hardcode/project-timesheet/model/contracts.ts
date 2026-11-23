/**
 * A source identifier — just the host entity id it reads from. Any entity can
 * be a source; this only has to be unique per source (used in row/session keys).
 */
export type ProjectTimesheetSource = string;

export const PROJECT_TIMESHEET_ENTRY_KINDS = ["timer", "manual"] as const;
export type ProjectTimesheetEntryKind =
  (typeof PROJECT_TIMESHEET_ENTRY_KINDS)[number];

/** Which per-row record a column ref resolves against before walking `path`. */
export type TimesheetColumnRoot = "host" | "session" | "employee";

/**
 * A typed field reference by path. Single-hop paths read a field directly;
 * longer paths traverse relation hops (`[relationFieldId, …, leafFieldId]`).
 * `root` (display columns only) picks the record the path starts from — the
 * row's source record (`host`, default), its logged time entry (`session`) or
 * the employee — before drilling via relations.
 */
export type TimesheetRef = { root?: TimesheetColumnRoot; path: string[] };

/**
 * One admin-defined display column. `template` is free text with `{{name}}`
 * placeholders; each name references a source OUTPUT (defined per source, see
 * `TimesheetOutput`) and is resolved server-side to a display string. Columns
 * carry no field refs themselves — they only compose names, so one column works
 * across heterogeneous sources as long as each supplies the referenced name.
 * `sticky` pins it to the left.
 */
export type TimesheetColumn = {
  key: string;
  label: string;
  width: number;
  sticky: boolean;
  template: string;
};

/** Resolved display values for a row, keyed `"<columnKey>:<token>"`. */
export type TimesheetCells = Record<string, string | null>;

export type ProjectTimesheetAccessScope =
  "global" | "department" | "gip_users" | "project_access" | "personal";

export type ProjectTimesheetInput = {
  month: string;
  employeeId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  page: number;
  pageSize: number;
};

export type ProjectTimesheetDayColumn = {
  date: string;
  dayOfMonth: number;
  weekday: string;
  isWeekend: boolean;
};

export type ProjectTimesheetDayTotal = {
  date: string;
  durationSeconds: number;
};

export type ProjectTimesheetEntry = {
  key: string;
  rowKey: string;
  sessionId: string;
  source: ProjectTimesheetSource;
  entryKind: ProjectTimesheetEntryKind;
  date: string;
  durationSeconds: number;
  employeeId: string;
  employeeName: string;
  employeeArchived: boolean;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectTitle: string;
  projectArchived: boolean;
  stageId: string | null;
  stageTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  taskId: string;
  taskTitle: string;
  taskNumber: string | null;
  plannedHours: number | null;
  startDate: string | null;
  acceptedAt: string | null;
  note: string | null;
  createdAt: string;
  adjustedAt: string | null;
  adjustedById: string | null;
  adjustedByName: string | null;
  cells: TimesheetCells;
};

export type ProjectTimesheetRowSeed = {
  key: string;
  source: ProjectTimesheetSource;
  employeeId: string;
  employeeName: string;
  employeeArchived: boolean;
  departmentId: string | null;
  departmentName: string | null;
  projectId: string | null;
  projectTitle: string;
  projectArchived: boolean;
  stageId: string | null;
  stageTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  taskId: string;
  taskTitle: string;
  taskNumber: string | null;
  plannedHours: number | null;
  startDate: string | null;
  acceptedAt: string | null;
  cells: TimesheetCells;
};

export type ProjectTimesheetRow = ProjectTimesheetRowSeed & {
  finishDate: string;
  completed: boolean;
  durationSeconds: number;
  sessionCount: number;
  days: ProjectTimesheetDayTotal[];
};

export type ProjectTimesheetEmployee = {
  id: string;
  name: string;
  archived: boolean;
  departmentId: string | null;
  departmentName: string | null;
  plannedHours: number;
  durationSeconds: number;
  sessionCount: number;
  days: ProjectTimesheetDayTotal[];
  rows: ProjectTimesheetRow[];
};

export type ProjectTimesheetTotal = {
  id: string | null;
  name: string;
  archived?: boolean;
  plannedHours: number;
  durationSeconds: number;
  sessionCount: number;
  days: ProjectTimesheetDayTotal[];
};

export type ProjectTimesheetFilterOption = {
  id: string;
  name: string;
  archived: boolean;
};

export type ProjectTimesheetPayload = {
  period: {
    month: string;
    dateFrom: string;
    dateTo: string;
    days: ProjectTimesheetDayColumn[];
    dayTotals: ProjectTimesheetDayTotal[];
    plannedHours: number;
    durationSeconds: number;
    sessionCount: number;
    rowCount: number;
  };
  access: {
    scope: ProjectTimesheetAccessScope;
    readOnly: true;
    financialsVisible: false;
  };
  employees: ProjectTimesheetEmployee[];
  departmentTotals: ProjectTimesheetTotal[];
  projectTotals: ProjectTimesheetTotal[];
  filters: {
    employees: ProjectTimesheetFilterOption[];
    departments: ProjectTimesheetFilterOption[];
    projects: ProjectTimesheetFilterOption[];
  };
  /** Admin-defined display columns (empty → the built-in default layout). */
  columns: TimesheetColumn[];
  pagination: {
    page: number;
    pageSize: number;
    totalEmployees: number;
    totalRows: number;
    totalPages: number;
  };
};
