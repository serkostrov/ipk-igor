import type {
  ProjectGanttSnapshot,
  ProjectGanttWorkItem,
  ProjectWorkItemDependency,
} from "./contracts";
import {
  WORK_ITEM_DEPENDENCY_TYPE_LABELS,
  WORK_ITEM_DEPENDENCY_TYPES,
} from "./contracts";

export type ProjectGanttScale = "day" | "week" | "month";
export type ProjectGanttRowKind = "project" | "stage" | "work_item" | "subtask";
export type ProjectGanttFilterState =
  "all" | "active" | "done" | "overdue" | "undated";

export type ProjectGanttRow = {
  id: string;
  sourceId: string | null;
  kind: ProjectGanttRowKind;
  parentId: string | null;
  depth: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  plannedHours: number | null;
  status: string;
  statusColor: string | null;
  isDone: boolean;
  isOverdue: boolean;
  assignee: string;
  role: string;
  dependencyLabels: string[];
  dependencyIds: string[];
};

export type ProjectGanttTimeline = {
  startDate: string;
  endDate: string;
  totalDays: number;
  pixelsPerDay: number;
  width: number;
};

export type ProjectGanttTick = { date: string; label: string; left: number };

const MS_PER_DAY = 86_400_000;
const MAX_TIMELINE_WIDTH = 50_000;
const SCALE_PIXELS: Record<ProjectGanttScale, number> = {
  day: 28,
  week: 12,
  month: 4,
};
const SCALE_PADDING: Record<ProjectGanttScale, number> = {
  day: 3,
  week: 14,
  month: 31,
};

export const PROJECT_GANTT_OVERDUE_COLOR = "#dc2626";
export const PROJECT_GANTT_DONE_COLOR = "#16a34a";
export const PROJECT_GANTT_ACTIVE_COLOR = "#2563eb";
export const PROJECT_GANTT_NEUTRAL_COLOR = "#64748b";

export function formatWorkItemDependencyLabel(
  name: string | null | undefined,
  departmentName: string | null | undefined,
): string {
  const taskLabel = name?.trim() || "Задача без названия";
  const departmentLabel = departmentName?.trim() || "Без отдела";
  return `${taskLabel} · ${departmentLabel}`;
}

function isoDayToNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const number =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
    MS_PER_DAY;
  return Number.isFinite(number) ? number : null;
}

function dayNumberToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function addIsoDays(value: string, days: number): string {
  return dayNumberToIso((isoDayToNumber(value) ?? 0) + days);
}

function isBeforeIso(left: string | null, right: string): boolean {
  if (!left) return false;
  const leftDay = isoDayToNumber(left);
  const rightDay = isoDayToNumber(right);
  return leftDay != null && rightDay != null && leftDay < rightDay;
}

export function projectGanttStatusColor(input: {
  status: string;
  statusColor: string | null;
  isDone: boolean;
  isOverdue: boolean;
}): string {
  if (input.isOverdue) return PROJECT_GANTT_OVERDUE_COLOR;
  if (input.statusColor) return input.statusColor;
  if (input.isDone || /заверш|готов|подтвержден|выполн/i.test(input.status)) {
    return PROJECT_GANTT_DONE_COLOR;
  }
  if (/пуст|без статуса|не запланирован|групп/i.test(input.status)) {
    return PROJECT_GANTT_NEUTRAL_COLOR;
  }
  return PROJECT_GANTT_ACTIVE_COLOR;
}

function personNames(people: readonly { name: string }[]): string {
  return (
    people
      .map((person) => person.name)
      .filter(Boolean)
      .join(", ") || "Не назначен"
  );
}

function personRoles(
  people: readonly { role: string | null }[],
  fallback: string | null,
): string {
  const roles = Array.from(
    new Set(people.map((person) => person.role).filter(Boolean)),
  );
  return roles.join(", ") || fallback || "—";
}

export function orderedProjectGanttWorkItems(
  items: readonly ProjectGanttWorkItem[],
): ProjectGanttWorkItem[] {
  return [...items].sort(
    (left, right) =>
      left.rowOrder - right.rowOrder || left.id.localeCompare(right.id),
  );
}

function appendMissingById<T extends { id: string }>(
  current: readonly T[],
  baseline: readonly T[],
): T[] {
  const currentIds = new Set(current.map((item) => item.id));
  return [...current, ...baseline.filter((item) => !currentIds.has(item.id))];
}

export function mergeProjectGanttSnapshots(
  fact: ProjectGanttSnapshot,
  baseline: ProjectGanttSnapshot,
): ProjectGanttSnapshot {
  if (fact.project.id !== baseline.project.id) {
    throw new Error("Нельзя сравнивать графики разных проектов");
  }
  return {
    ...fact,
    stages: appendMissingById(fact.stages, baseline.stages),
    workItems: appendMissingById(fact.workItems, baseline.workItems),
    subtasks: appendMissingById(fact.subtasks, baseline.subtasks),
    dependencies: appendMissingById(fact.dependencies, baseline.dependencies),
    truncated: {
      stages: fact.truncated.stages || baseline.truncated.stages,
      workItems: fact.truncated.workItems || baseline.truncated.workItems,
      subtasks: fact.truncated.subtasks || baseline.truncated.subtasks,
      dependencies:
        fact.truncated.dependencies || baseline.truncated.dependencies,
    },
  };
}

function dependencyMaps(snapshot: ProjectGanttSnapshot): {
  incoming: Map<string, ProjectWorkItemDependency[]>;
  names: Map<string, string>;
  labels: Map<string, string>;
} {
  const incoming = new Map<string, ProjectWorkItemDependency[]>();
  const names = new Map(
    snapshot.workItems.map((item) => [item.id, item.name] as const),
  );
  const labels = new Map(
    snapshot.workItems.map(
      (item) =>
        [
          item.id,
          formatWorkItemDependencyLabel(item.name, item.departmentName),
        ] as const,
    ),
  );
  for (const dependency of snapshot.dependencies) {
    const values = incoming.get(dependency.successorWorkItemId) ?? [];
    values.push(dependency);
    incoming.set(dependency.successorWorkItemId, values);
  }
  for (const dependencies of incoming.values()) {
    dependencies.sort(
      (left, right) =>
        (names.get(left.predecessorWorkItemId) ?? "").localeCompare(
          names.get(right.predecessorWorkItemId) ?? "",
          "ru",
        ) ||
        left.predecessorWorkItemId.localeCompare(right.predecessorWorkItemId) ||
        WORK_ITEM_DEPENDENCY_TYPES.indexOf(left.dependencyType) -
          WORK_ITEM_DEPENDENCY_TYPES.indexOf(right.dependencyType) ||
        left.id.localeCompare(right.id),
    );
  }
  return { incoming, names, labels };
}

function makeStageRow(
  stage: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  },
  projectRowId: string,
  childDone: boolean,
  childCount: number,
  today: string,
): ProjectGanttRow {
  const isDone = childCount > 0 && childDone;
  const status =
    childCount === 0 ? "Пустой этап" : isDone ? "Завершён" : "В работе";
  const isOverdue = isBeforeIso(stage.endDate, today) && !isDone;
  return {
    id: `stage:${stage.id}`,
    sourceId: stage.id,
    kind: "stage",
    parentId: projectRowId,
    depth: 1,
    name: stage.name,
    startDate: stage.startDate,
    endDate: stage.endDate,
    plannedHours: null,
    status,
    statusColor: projectGanttStatusColor({
      status,
      statusColor: null,
      isDone,
      isOverdue,
    }),
    isDone,
    isOverdue,
    assignee: "—",
    role: "Этап проекта",
    dependencyLabels: [],
    dependencyIds: [],
  };
}

export function buildProjectGanttRows(
  snapshot: ProjectGanttSnapshot,
  today: string,
): ProjectGanttRow[] {
  const rows: ProjectGanttRow[] = [];
  const projectRowId = `project:${snapshot.project.id}`;
  const projectDone = /заверш|архив/i.test(snapshot.project.status);
  const projectOverdue = false;
  rows.push({
    id: projectRowId,
    sourceId: snapshot.project.id,
    kind: "project",
    parentId: null,
    depth: 0,
    name: snapshot.project.title,
    startDate: snapshot.project.startDate,
    endDate: null,
    plannedHours: null,
    status: snapshot.project.status,
    statusColor: projectGanttStatusColor({
      status: snapshot.project.status,
      statusColor: null,
      isDone: projectDone,
      isOverdue: projectOverdue,
    }),
    isDone: projectDone,
    isOverdue: projectOverdue,
    assignee:
      [snapshot.project.gip?.name, snapshot.project.manager?.name]
        .filter(Boolean)
        .join(", ") || "Не назначен",
    role: "ГИП / менеджер",
    dependencyLabels: [],
    dependencyIds: [],
  });

  const subtasksByWorkItem = new Map<string | null, typeof snapshot.subtasks>();
  for (const task of snapshot.subtasks) {
    const values = subtasksByWorkItem.get(task.workItemId) ?? [];
    values.push(task);
    subtasksByWorkItem.set(task.workItemId, values);
  }
  const workItemsByStage = new Map<string | null, typeof snapshot.workItems>();
  for (const item of orderedProjectGanttWorkItems(snapshot.workItems)) {
    const values = workItemsByStage.get(item.stageId) ?? [];
    values.push(item);
    workItemsByStage.set(item.stageId, values);
  }
  const { incoming, labels } = dependencyMaps(snapshot);

  const appendWorkItem = (
    item: (typeof snapshot.workItems)[number],
    stageRowId: string,
  ) => {
    const dependencies = incoming.get(item.id) ?? [];
    const itemRowId = `work_item:${item.id}`;
    const itemOverdue = isBeforeIso(item.endDate, today) && !item.isDone;
    rows.push({
      id: itemRowId,
      sourceId: item.id,
      kind: "work_item",
      parentId: stageRowId,
      depth: 2,
      name: item.name,
      startDate: item.startDate,
      endDate: item.endDate,
      plannedHours: item.plannedHours ?? null,
      status: item.status,
      statusColor: projectGanttStatusColor({
        status: item.status,
        statusColor: item.statusColor,
        isDone: item.isDone,
        isOverdue: itemOverdue,
      }),
      isDone: item.isDone,
      isOverdue: itemOverdue,
      assignee: personNames(item.assignees),
      role: personRoles(item.assignees, item.departmentName),
      dependencyLabels: dependencies.map(
        (dependency) =>
          `${WORK_ITEM_DEPENDENCY_TYPE_LABELS[dependency.dependencyType]}: ${labels.get(dependency.predecessorWorkItemId) ?? "Задача без названия · Без отдела"}`,
      ),
      dependencyIds: dependencies.map((dependency) => dependency.id),
    });
    for (const task of subtasksByWorkItem.get(item.id) ?? []) {
      const taskOverdue = isBeforeIso(task.dueDate, today) && !task.isDone;
      rows.push({
        id: `subtask:${task.id}`,
        sourceId: task.id,
        kind: "subtask",
        parentId: itemRowId,
        depth: 3,
        name: task.title,
        startDate: null,
        endDate: task.dueDate,
        plannedHours: null,
        status: task.status,
        statusColor: projectGanttStatusColor({
          status: task.status,
          statusColor: task.statusColor,
          isDone: task.isDone,
          isOverdue: taskOverdue,
        }),
        isDone: task.isDone,
        isOverdue: taskOverdue,
        assignee: task.assignee?.name ?? "Не назначен",
        role: task.assignee?.role ?? "Исполнитель",
        dependencyLabels: [],
        dependencyIds: [],
      });
    }
  };

  for (const stage of snapshot.stages) {
    const items = workItemsByStage.get(stage.id) ?? [];
    const stageRowId = `stage:${stage.id}`;
    rows.push(
      makeStageRow(
        stage,
        projectRowId,
        items.every((item) => item.isDone),
        items.length,
        today,
      ),
    );
    for (const item of items) appendWorkItem(item, stageRowId);
  }

  const unassignedItems = workItemsByStage.get(null) ?? [];
  const orphanSubtasks = subtasksByWorkItem.get(null) ?? [];
  if (unassignedItems.length > 0 || orphanSubtasks.length > 0) {
    const stageRowId = "stage:unassigned";
    rows.push(
      makeStageRow(
        { id: "unassigned", name: "Без этапа", startDate: null, endDate: null },
        projectRowId,
        unassignedItems.every((item) => item.isDone),
        unassignedItems.length + orphanSubtasks.length,
        today,
      ),
    );
    for (const item of unassignedItems) appendWorkItem(item, stageRowId);
    if (orphanSubtasks.length > 0) {
      const itemRowId = "work_item:unassigned";
      const groupDone = orphanSubtasks.every((task) => task.isDone);
      rows.push({
        id: itemRowId,
        sourceId: null,
        kind: "work_item",
        parentId: stageRowId,
        depth: 2,
        name: "Без привязки к задаче",
        startDate: null,
        endDate: null,
        plannedHours: null,
        status: "Группа",
        statusColor: projectGanttStatusColor({
          status: "Группа",
          statusColor: null,
          isDone: groupDone,
          isOverdue: false,
        }),
        isDone: groupDone,
        isOverdue: false,
        assignee: "—",
        role: "Системная группа",
        dependencyLabels: [],
        dependencyIds: [],
      });
      for (const task of orphanSubtasks) {
        const taskOverdue = isBeforeIso(task.dueDate, today) && !task.isDone;
        rows.push({
          id: `subtask:${task.id}`,
          sourceId: task.id,
          kind: "subtask",
          parentId: itemRowId,
          depth: 3,
          name: task.title,
          startDate: null,
          endDate: task.dueDate,
          plannedHours: null,
          status: task.status,
          statusColor: projectGanttStatusColor({
            status: task.status,
            statusColor: task.statusColor,
            isDone: task.isDone,
            isOverdue: taskOverdue,
          }),
          isDone: task.isDone,
          isOverdue: taskOverdue,
          assignee: task.assignee?.name ?? "Не назначен",
          role: task.assignee?.role ?? "Исполнитель",
          dependencyLabels: [],
          dependencyIds: [],
        });
      }
    }
  }
  return rows;
}

export function filterProjectGanttRows(
  rows: readonly ProjectGanttRow[],
  filters: { search: string; assignee: string; state: ProjectGanttFilterState },
): ProjectGanttRow[] {
  const search = filters.search.trim().toLocaleLowerCase("ru");
  const matched = new Set<string>();
  for (const row of rows) {
    const stateMatches =
      filters.state === "all" ||
      (filters.state === "active" && !row.isDone) ||
      (filters.state === "done" && row.isDone) ||
      (filters.state === "overdue" && row.isOverdue) ||
      (filters.state === "undated" && !row.startDate && !row.endDate);
    const assigneeMatches =
      filters.assignee === "all" || row.assignee === filters.assignee;
    const searchMatches =
      !search ||
      [row.name, row.status, row.assignee, row.role, ...row.dependencyLabels]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(search);
    if (stateMatches && assigneeMatches && searchMatches) matched.add(row.id);
  }
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  for (const id of [...matched]) {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId) {
      matched.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return rows.filter((row) => matched.has(row.id));
}

function projectGanttFocusRowDate(row: ProjectGanttRow): string | null {
  return row.startDate ?? row.endDate;
}

/**
 * Picks the date which should be visible when a Gantt chart is first opened.
 *
 * Current unfinished work takes precedence. If there is none, the nearest
 * upcoming work is more useful than the project start; historic work is only
 * used as a final dated fallback.
 */
export function selectProjectGanttFocusDate(
  rows: readonly ProjectGanttRow[],
  today: string,
): string {
  const todayDay = isoDayToNumber(today);
  if (todayDay == null) return today;

  const datedWork = rows
    .filter((row) => row.kind === "work_item" || row.kind === "subtask")
    .flatMap((row) => {
      const start = isoDayToNumber(row.startDate ?? row.endDate ?? "");
      const end = isoDayToNumber(row.endDate ?? row.startDate ?? "");
      const date = projectGanttFocusRowDate(row);
      return start == null || end == null || !date
        ? []
        : [{ row, start, end, date }];
    });

  if (
    datedWork.some(
      ({ row, start, end }) =>
        !row.isDone && start <= todayDay && todayDay <= end,
    )
  ) {
    return today;
  }

  const future = datedWork
    .filter(({ start }) => start > todayDay)
    .sort((left, right) => left.start - right.start)[0];
  if (future) return future.date;

  return (
    datedWork.sort((left, right) => left.start - right.start)[0]?.date ?? today
  );
}

export function applyProjectGanttCollapse(
  rows: readonly ProjectGanttRow[],
  collapsed: ReadonlySet<string>,
): ProjectGanttRow[] {
  const hidden = new Set<string>();
  return rows.filter((row) => {
    if (row.parentId && hidden.has(row.parentId)) hidden.add(row.id);
    if (collapsed.has(row.id)) hidden.add(row.id);
    return !row.parentId || !hidden.has(row.parentId);
  });
}

export function buildProjectGanttTimeline(
  rows: readonly ProjectGanttRow[],
  scale: ProjectGanttScale,
  today: string,
): ProjectGanttTimeline {
  const dates = rows
    .flatMap((row) => [row.startDate, row.endDate])
    .filter((value): value is string => value != null)
    .map(isoDayToNumber)
    .filter((value): value is number => value != null);
  const todayDay = isoDayToNumber(today) ?? Math.floor(Date.now() / MS_PER_DAY);
  const min = dates.length > 0 ? Math.min(...dates) : todayDay;
  const max = dates.length > 0 ? Math.max(...dates) : todayDay;
  const padding = SCALE_PADDING[scale];
  const startDay = min - padding;
  const endDay = max + padding;
  const totalDays = Math.max(1, endDay - startDay + 1);
  const pixelsPerDay = Math.max(
    0.25,
    Math.min(SCALE_PIXELS[scale], MAX_TIMELINE_WIDTH / totalDays),
  );
  return {
    startDate: dayNumberToIso(startDay),
    endDate: dayNumberToIso(endDay),
    totalDays,
    pixelsPerDay,
    width: totalDays * pixelsPerDay,
  };
}

export function buildProjectGanttTicks(
  timeline: ProjectGanttTimeline,
  scale: ProjectGanttScale,
): ProjectGanttTick[] {
  const start = isoDayToNumber(timeline.startDate)!;
  const end = isoDayToNumber(timeline.endDate)!;
  const step =
    scale === "day"
      ? Math.max(1, Math.ceil(48 / timeline.pixelsPerDay))
      : scale === "week"
        ? Math.max(7, Math.ceil(72 / timeline.pixelsPerDay / 7) * 7)
        : 1;
  const ticks: ProjectGanttTick[] = [];
  let cursor = start;
  while (cursor <= end) {
    const date = new Date(cursor * MS_PER_DAY);
    if (scale !== "month" || date.getUTCDate() === 1 || cursor === start) {
      const label =
        scale === "day"
          ? `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`
          : scale === "week"
            ? `Нед. ${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`
            : new Intl.DateTimeFormat("ru-RU", {
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }).format(date);
      ticks.push({
        date: dayNumberToIso(cursor),
        label,
        left: (cursor - start) * timeline.pixelsPerDay,
      });
    }
    cursor += step;
  }
  return ticks;
}

export function projectGanttBarPosition(
  row: Pick<ProjectGanttRow, "startDate" | "endDate">,
  timeline: ProjectGanttTimeline,
): { left: number; width: number; milestone: boolean } | null {
  const start = isoDayToNumber(row.startDate ?? row.endDate ?? "");
  const end = isoDayToNumber(row.endDate ?? row.startDate ?? "");
  const timelineStart = isoDayToNumber(timeline.startDate);
  if (start == null || end == null || timelineStart == null) return null;
  const milestone = !row.startDate || !row.endDate;
  return {
    left: (start - timelineStart) * timeline.pixelsPerDay,
    width: milestone
      ? 10
      : Math.max(10, (end - start + 1) * timeline.pixelsPerDay),
    milestone,
  };
}

export function projectGanttTodayLeft(
  timeline: ProjectGanttTimeline,
  today: string,
): number | null {
  const start = isoDayToNumber(timeline.startDate);
  const day = isoDayToNumber(today);
  if (
    start == null ||
    day == null ||
    day < start ||
    day > start + timeline.totalDays
  )
    return null;
  return (day - start) * timeline.pixelsPerDay;
}

export function projectGanttDateLabel(
  row: Pick<ProjectGanttRow, "startDate" | "endDate">,
): string {
  if (row.startDate && row.endDate) return `${row.startDate} — ${row.endDate}`;
  if (row.startDate) return `Только начало: ${row.startDate}`;
  if (row.endDate) return `Только окончание: ${row.endDate}`;
  return "Без дат";
}

export function projectGanttScaleLabel(scale: ProjectGanttScale): string {
  return scale === "day" ? "День" : scale === "week" ? "Неделя" : "Месяц";
}

export const PROJECT_GANTT_ROW_HEIGHT = 44;

export function projectGanttOffsetDays(from: string, to: string): number {
  const fromDay = isoDayToNumber(from);
  const toDay = isoDayToNumber(to);
  return fromDay == null || toDay == null ? 0 : toDay - fromDay;
}

export { addIsoDays };
