import type {
  ProjectTimesheetDayTotal,
  ProjectTimesheetEmployee,
  ProjectTimesheetEntry,
  ProjectTimesheetFilterOption,
  ProjectTimesheetPayload,
  ProjectTimesheetRow,
  ProjectTimesheetRowSeed,
  ProjectTimesheetTotal,
  TimesheetColumn,
} from "./contracts";

const MOSCOW_OFFSET = "+03:00";
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

export type TimesheetSessionSliceInput = Omit<
  ProjectTimesheetEntry,
  "key" | "date" | "durationSeconds"
> & {
  startedAt: string | null;
  endedAt: string | null;
  occurredAt: string;
  durationSeconds: number;
};

export type TimesheetAggregationOptions = {
  month: string;
  employeeId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  page: number;
  pageSize: number;
  accessScope: ProjectTimesheetPayload["access"]["scope"];
  columns: TimesheetColumn[];
};

export function latestProjectTaskAcceptances(
  transitions: Array<{ taskId: string; action: string; createdAt: string }>,
): Map<string, string> {
  const acceptedAt = new Map<string, string>();
  for (const transition of transitions) {
    if (transition.action !== "accept" && transition.action !== "complete")
      continue;
    const current = acceptedAt.get(transition.taskId);
    if (!current || transition.createdAt > current) {
      acceptedAt.set(transition.taskId, transition.createdAt);
    }
  }
  return acceptedAt;
}

function parseDateKey(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date key: ${value}`);
  const parts: [number, number, number] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() !== parts[1] - 1 ||
    date.getUTCDate() !== parts[2]
  ) {
    throw new Error(`Invalid date key: ${value}`);
  }
  return parts;
}

function parseMonthKey(value: string): [number, number] {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid month key: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month key: ${value}`);
  return [year, month];
}

export function addCalendarDays(date: string, amount: number): string {
  const [year, month, day] = parseDateKey(date);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function shiftProjectTimesheetMonth(
  monthKey: string,
  amount: number,
): string {
  const [year, month] = parseMonthKey(monthKey);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function projectTimesheetMonthBounds(monthKey: string): {
  month: string;
  dateFrom: string;
  dateTo: string;
} {
  const [year, month] = parseMonthKey(monthKey);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    month: monthKey,
    dateFrom: `${monthKey}-01`,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function projectTimesheetMonthDays(
  monthKey: string,
): ProjectTimesheetPayload["period"]["days"] {
  const bounds = projectTimesheetMonthBounds(monthKey);
  const [, , lastDay] = parseDateKey(bounds.dateTo);
  return Array.from({ length: lastDay }, (_, index) => {
    const dayOfMonth = index + 1;
    const date = `${monthKey}-${String(dayOfMonth).padStart(2, "0")}`;
    const [year, month, day] = parseDateKey(date);
    const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
      date,
      dayOfMonth,
      weekday: WEEKDAYS[weekdayIndex] ?? "",
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

export function moscowPeriodBounds(
  dateFrom: string,
  dateTo: string,
): {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
} {
  parseDateKey(dateFrom);
  parseDateKey(dateTo);
  const startIso = new Date(
    `${dateFrom}T00:00:00${MOSCOW_OFFSET}`,
  ).toISOString();
  const endIso = new Date(
    `${addCalendarDays(dateTo, 1)}T00:00:00${MOSCOW_OFFSET}`,
  ).toISOString();
  return {
    startMs: new Date(startIso).getTime(),
    endMs: new Date(endIso).getTime(),
    startIso,
    endIso,
  };
}

export function moscowDateKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function lifecycleDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parseDateKey(value);
    return value;
  }
  return moscowDateKey(value);
}

export function isProjectTimesheetLifecycleVisible(
  lifecycle: { startDate: string | null; acceptedAt: string | null },
  monthKey: string,
): boolean {
  const { dateFrom, dateTo } = projectTimesheetMonthBounds(monthKey);
  const startDate = lifecycle.startDate
    ? lifecycleDateKey(lifecycle.startDate)
    : null;
  const acceptedDate = lifecycle.acceptedAt
    ? lifecycleDateKey(lifecycle.acceptedAt)
    : null;
  return (
    (!startDate || startDate <= dateTo) &&
    (!acceptedDate || acceptedDate >= dateFrom)
  );
}

function allocateSeconds(weights: number[], totalSeconds: number): number[] {
  if (weights.length === 0 || totalSeconds <= 0) return weights.map(() => 0);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  let remaining = totalSeconds;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return remaining;
    const value = Math.max(
      0,
      Math.floor((totalSeconds * weight) / totalWeight),
    );
    remaining -= value;
    return value;
  });
}

export function splitTimesheetSessionByMoscowDay(
  session: TimesheetSessionSliceInput,
  period: { dateFrom: string; dateTo: string },
): ProjectTimesheetEntry[] {
  const bounds = moscowPeriodBounds(period.dateFrom, period.dateTo);
  const startedMs = session.startedAt
    ? new Date(session.startedAt).getTime()
    : Number.NaN;
  const persistedEndMs = session.endedAt
    ? new Date(session.endedAt).getTime()
    : Number.NaN;
  const durationSeconds = Math.max(0, Math.round(session.durationSeconds));

  // Manual time belongs to the Moscow workday selected by the user. This is
  // also the day used by the database's eight-hour invariant, even if a long
  // manual interval happens to cross midnight.
  if (session.entryKind === "manual") {
    const occurredMs = Number.isFinite(startedMs)
      ? startedMs
      : new Date(session.occurredAt).getTime();
    if (
      !Number.isFinite(occurredMs) ||
      occurredMs < bounds.startMs ||
      occurredMs >= bounds.endMs ||
      durationSeconds <= 0
    ) {
      return [];
    }
    const date = moscowDateKey(occurredMs);
    return [
      {
        ...session,
        key: `${session.source}:${session.sessionId}:${date}`,
        date,
        durationSeconds,
      },
    ];
  }

  // A running timer has not produced persisted fact yet. Excluding its live
  // projection keeps report totals equal to the source session sum.
  if (!Number.isFinite(persistedEndMs) || durationSeconds <= 0) return [];
  const endedMs = persistedEndMs;

  if (Number.isFinite(startedMs) && endedMs > startedMs) {
    const overlapStart = Math.max(startedMs, bounds.startMs);
    const overlapEnd = Math.min(endedMs, bounds.endMs);
    if (overlapEnd <= overlapStart) return [];

    const fullElapsedMs = endedMs - startedMs;
    const overlapDurationSeconds = Math.max(
      0,
      Math.round(
        (durationSeconds * (overlapEnd - overlapStart)) / fullElapsedMs,
      ),
    );

    const segments: Array<{ date: string; weight: number }> = [];
    let cursor = overlapStart;
    while (cursor < overlapEnd) {
      const date = moscowDateKey(cursor);
      const nextBoundary = new Date(
        `${addCalendarDays(date, 1)}T00:00:00${MOSCOW_OFFSET}`,
      ).getTime();
      const segmentEnd = Math.min(overlapEnd, nextBoundary);
      segments.push({ date, weight: segmentEnd - cursor });
      cursor = segmentEnd;
    }

    const allocated = allocateSeconds(
      segments.map((segment) => segment.weight),
      overlapDurationSeconds,
    );
    return segments.flatMap((segment, index) => {
      const durationSeconds = allocated[index] ?? 0;
      if (durationSeconds <= 0) return [];
      return [
        {
          ...session,
          key: `${session.source}:${session.sessionId}:${segment.date}`,
          date: segment.date,
          durationSeconds,
        },
      ];
    });
  }

  const occurredMs = new Date(session.occurredAt).getTime();
  if (
    !Number.isFinite(occurredMs) ||
    occurredMs < bounds.startMs ||
    occurredMs >= bounds.endMs
  ) {
    return [];
  }
  const date = moscowDateKey(occurredMs);
  return [
    {
      ...session,
      key: `${session.source}:${session.sessionId}:${date}`,
      date,
      durationSeconds,
    },
  ];
}

function seedFromEntry(entry: ProjectTimesheetEntry): ProjectTimesheetRowSeed {
  return {
    key: entry.rowKey,
    source: entry.source,
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    employeeArchived: entry.employeeArchived,
    departmentId: entry.departmentId,
    departmentName: entry.departmentName,
    projectId: entry.projectId,
    projectTitle: entry.projectTitle,
    projectArchived: entry.projectArchived,
    stageId: entry.stageId,
    stageTitle: entry.stageTitle,
    workItemId: entry.workItemId,
    workItemTitle: entry.workItemTitle,
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    taskNumber: entry.taskNumber,
    plannedHours: entry.plannedHours,
    startDate: entry.startDate,
    acceptedAt: entry.acceptedAt,
    cells: entry.cells,
  };
}

function dayTotals(
  entries: ProjectTimesheetEntry[],
): ProjectTimesheetDayTotal[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(
      entry.date,
      (totals.get(entry.date) ?? 0) + entry.durationSeconds,
    );
  }
  return Array.from(totals, ([date, durationSeconds]) => ({
    date,
    durationSeconds,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function combineDayTotals(rows: Array<{ days: ProjectTimesheetDayTotal[] }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const day of row.days) {
      totals.set(day.date, (totals.get(day.date) ?? 0) + day.durationSeconds);
    }
  }
  return Array.from(totals, ([date, durationSeconds]) => ({
    date,
    durationSeconds,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function materializeRows(
  rowSeeds: ProjectTimesheetRowSeed[],
  sourceEntries: ProjectTimesheetEntry[],
  monthKey: string,
): ProjectTimesheetRow[] {
  const { dateTo } = projectTimesheetMonthBounds(monthKey);
  const entries = Array.from(
    new Map(sourceEntries.map((entry) => [entry.key, entry] as const)).values(),
  );
  const seeds = new Map(rowSeeds.map((seed) => [seed.key, seed] as const));
  for (const entry of entries) {
    if (!seeds.has(entry.rowKey)) seeds.set(entry.rowKey, seedFromEntry(entry));
  }
  const entriesByRow = new Map<string, ProjectTimesheetEntry[]>();
  for (const entry of entries) {
    const current = entriesByRow.get(entry.rowKey) ?? [];
    current.push(entry);
    entriesByRow.set(entry.rowKey, current);
  }

  return Array.from(seeds.values())
    .map((seed): ProjectTimesheetRow => {
      const rowEntries = entriesByRow.get(seed.key) ?? [];
      const days = dayTotals(rowEntries);
      const sessions = new Set(
        rowEntries.map((entry) => `${entry.source}:${entry.sessionId}`),
      );
      const acceptedDate = seed.acceptedAt
        ? lifecycleDateKey(seed.acceptedAt)
        : null;
      const completed = !!acceptedDate && acceptedDate <= dateTo;
      return {
        ...seed,
        finishDate: completed && acceptedDate ? acceptedDate : dateTo,
        completed,
        durationSeconds: days.reduce(
          (sum, day) => sum + day.durationSeconds,
          0,
        ),
        sessionCount: sessions.size,
        days,
      };
    })
    .sort(
      (left, right) =>
        left.employeeName.localeCompare(right.employeeName, "ru") ||
        left.projectTitle.localeCompare(right.projectTitle, "ru") ||
        (left.workItemTitle ?? "").localeCompare(
          right.workItemTitle ?? "",
          "ru",
        ) ||
        left.taskTitle.localeCompare(right.taskTitle, "ru"),
    );
}

function totalRows(
  rows: ProjectTimesheetRow[],
  key: "departmentId" | "projectId",
  label: "departmentName" | "projectTitle",
): ProjectTimesheetTotal[] {
  const totals = new Map<string, ProjectTimesheetTotal>();
  const groupedRows = new Map<string, ProjectTimesheetRow[]>();
  for (const row of rows) {
    const id = row[key];
    const mapKey = id ?? "__none__";
    const current = totals.get(mapKey) ?? {
      id,
      name:
        row[label] ?? (key === "departmentId" ? "Без отдела" : "Без проекта"),
      ...(key === "projectId" ? { archived: row.projectArchived } : {}),
      plannedHours: 0,
      durationSeconds: 0,
      sessionCount: 0,
      days: [],
    };
    const bucket = groupedRows.get(mapKey) ?? [];
    bucket.push(row);
    groupedRows.set(mapKey, bucket);
    current.plannedHours += row.plannedHours ?? 0;
    current.durationSeconds += row.durationSeconds;
    current.sessionCount += row.sessionCount;
    current.days = combineDayTotals(bucket);
    totals.set(mapKey, current);
  }
  return Array.from(totals.values()).sort(
    (left, right) =>
      right.durationSeconds - left.durationSeconds ||
      left.name.localeCompare(right.name, "ru"),
  );
}

function filterOptions(
  rows: ProjectTimesheetRow[],
): ProjectTimesheetPayload["filters"] {
  const employees = new Map<string, ProjectTimesheetFilterOption>();
  const departments = new Map<string, ProjectTimesheetFilterOption>();
  const projects = new Map<string, ProjectTimesheetFilterOption>();
  for (const row of rows) {
    employees.set(row.employeeId, {
      id: row.employeeId,
      name: row.employeeName,
      archived: row.employeeArchived,
    });
    if (row.departmentId && row.departmentName) {
      departments.set(row.departmentId, {
        id: row.departmentId,
        name: row.departmentName,
        archived: false,
      });
    }
    if (row.projectId) {
      projects.set(row.projectId, {
        id: row.projectId,
        name: row.projectTitle,
        archived: row.projectArchived,
      });
    }
  }
  const sorted = (values: Iterable<ProjectTimesheetFilterOption>) =>
    Array.from(values).sort((left, right) =>
      left.name.localeCompare(right.name, "ru"),
    );
  return {
    employees: sorted(employees.values()),
    departments: sorted(departments.values()),
    projects: sorted(projects.values()),
  };
}

function groupEmployees(
  rows: ProjectTimesheetRow[],
): ProjectTimesheetEmployee[] {
  const employees = new Map<string, ProjectTimesheetEmployee>();
  for (const row of rows) {
    const current = employees.get(row.employeeId) ?? {
      id: row.employeeId,
      name: row.employeeName,
      archived: row.employeeArchived,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      plannedHours: 0,
      durationSeconds: 0,
      sessionCount: 0,
      days: [],
      rows: [],
    };
    current.plannedHours += row.plannedHours ?? 0;
    current.durationSeconds += row.durationSeconds;
    current.sessionCount += row.sessionCount;
    current.rows.push(row);
    current.days = combineDayTotals(current.rows);
    employees.set(row.employeeId, current);
  }
  return Array.from(employees.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "ru"),
  );
}

export function aggregateProjectTimesheet(
  rowSeeds: ProjectTimesheetRowSeed[],
  sourceEntries: ProjectTimesheetEntry[],
  options: TimesheetAggregationOptions,
): ProjectTimesheetPayload {
  const allRows = materializeRows(rowSeeds, sourceEntries, options.month);
  const filters = filterOptions(allRows);
  const rows = allRows.filter(
    (row) =>
      (!options.employeeId || row.employeeId === options.employeeId) &&
      (!options.departmentId || row.departmentId === options.departmentId) &&
      (!options.projectId || row.projectId === options.projectId),
  );
  const employees = groupEmployees(rows);
  const totalEmployees = employees.length;
  const totalPages = Math.max(1, Math.ceil(totalEmployees / options.pageSize));
  const page = Math.min(Math.max(1, options.page), totalPages);
  const pageStart = (page - 1) * options.pageSize;
  const bounds = projectTimesheetMonthBounds(options.month);

  return {
    period: {
      ...bounds,
      days: projectTimesheetMonthDays(options.month),
      dayTotals: combineDayTotals(rows),
      plannedHours: rows.reduce((sum, row) => sum + (row.plannedHours ?? 0), 0),
      durationSeconds: rows.reduce((sum, row) => sum + row.durationSeconds, 0),
      sessionCount: rows.reduce((sum, row) => sum + row.sessionCount, 0),
      rowCount: rows.length,
    },
    access: {
      scope: options.accessScope,
      readOnly: true,
      financialsVisible: false,
    },
    employees: employees.slice(pageStart, pageStart + options.pageSize),
    departmentTotals: totalRows(rows, "departmentId", "departmentName"),
    projectTotals: totalRows(rows, "projectId", "projectTitle"),
    filters,
    columns: options.columns,
    pagination: {
      page,
      pageSize: options.pageSize,
      totalEmployees,
      totalRows: rows.length,
      totalPages,
    },
  };
}
