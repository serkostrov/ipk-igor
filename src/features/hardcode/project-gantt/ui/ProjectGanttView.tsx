import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarOff,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { todayIsoDate } from "@/shared/lib/business-days";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  createProjectGanttTaskDependency,
  deleteProjectGanttTaskDependency,
  rescheduleProjectGanttTaskRecord,
} from "../api/tasks-gantt-api";
import {
  FINISH_TO_START_DEPENDENCY_TYPE,
  WORK_ITEM_DEPENDENCY_TYPE_CODES,
  WORK_ITEM_DEPENDENCY_TYPE_LABELS,
  WORK_ITEM_DEPENDENCY_TYPES,
  type ProjectGanttComparison,
  type ProjectGanttWorkItem,
  type WorkItemDependencyType,
} from "../model/contracts";
import { wouldCreateDependencyCycle } from "../model/dependency-graph";
import {
  applyProjectGanttCollapse,
  buildProjectGanttRows,
  buildProjectGanttTicks,
  buildProjectGanttTimeline,
  filterProjectGanttRows,
  mergeProjectGanttSnapshots,
  PROJECT_GANTT_ROW_HEIGHT,
  projectGanttBarPosition,
  projectGanttTodayLeft,
  selectProjectGanttFocusDate,
  type ProjectGanttFilterState,
  type ProjectGanttRow,
  type ProjectGanttScale,
} from "../model/rows";
import type { ProjectGanttTasksBinding } from "../model/tasks-snapshot";
import { WorkItemFormDialog } from "./WorkItemFormDialog";

const LEFT_WIDTH = 300;

export type ProjectGanttLayerMode = "baseline" | "fact" | "combined";

const SCALE_LABELS: Record<ProjectGanttScale, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

function resolveSnapshot(
  comparison: ProjectGanttComparison,
  layer: ProjectGanttLayerMode,
) {
  if (layer === "baseline" && comparison.baseline) {
    return comparison.baseline.snapshot;
  }
  if (layer === "combined" && comparison.baseline) {
    return mergeProjectGanttSnapshots(
      comparison.fact,
      comparison.baseline.snapshot,
    );
  }
  return comparison.fact;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}.${m}`;
}

export function ProjectGanttView({
  binding,
  comparison,
  canEdit,
  onOpenRecord,
}: {
  binding: ProjectGanttTasksBinding;
  comparison: ProjectGanttComparison;
  canEdit: boolean;
  onOpenRecord?: (taskId: string) => void;
}) {
  const today = todayIsoDate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<ProjectGanttScale>("week");
  const [layer, setLayer] = useState<ProjectGanttLayerMode>("fact");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [state, setState] = useState<ProjectGanttFilterState>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [depOpen, setDepOpen] = useState(false);
  const [depSuccessorId, setDepSuccessorId] = useState<string | null>(null);
  const [depPredecessorId, setDepPredecessorId] = useState("");
  const [depType, setDepType] = useState<WorkItemDependencyType>(
    FINISH_TO_START_DEPENDENCY_TYPE,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectGanttWorkItem | null>(
    null,
  );
  const focusedRef = useRef(false);

  const snapshot = useMemo(
    () => resolveSnapshot(comparison, layer),
    [comparison, layer],
  );

  const allRows = useMemo(
    () => buildProjectGanttRows(snapshot, today),
    [snapshot, today],
  );

  const workRows = useMemo(
    () => allRows.filter((row) => row.kind === "work_item" && row.sourceId),
    [allRows],
  );

  const undatedCount = useMemo(
    () => workRows.filter((row) => !row.startDate && !row.endDate).length,
    [workRows],
  );

  const assignees = useMemo(() => {
    const names = new Set(
      allRows
        .map((row) => row.assignee)
        .filter((value) => value && value !== "—" && value !== "Не назначен"),
    );
    return ["all", ...[...names].sort((a, b) => a.localeCompare(b, "ru"))];
  }, [allRows]);

  const filteredRows = useMemo(
    () =>
      filterProjectGanttRows(allRows, {
        search,
        assignee,
        state,
      }),
    [allRows, search, assignee, state],
  );

  const visibleRows = useMemo(
    () => applyProjectGanttCollapse(filteredRows, collapsed),
    [filteredRows, collapsed],
  );

  const timeline = useMemo(
    () => buildProjectGanttTimeline(visibleRows, scale, today),
    [visibleRows, scale, today],
  );
  const ticks = useMemo(
    () => buildProjectGanttTicks(timeline, scale),
    [timeline, scale],
  );
  const todayLeft = projectGanttTodayLeft(timeline, today);

  useEffect(() => {
    if (focusedRef.current || !scrollRef.current) return;
    const focusDate = selectProjectGanttFocusDate(visibleRows, today);
    const offset = projectGanttBarPosition(
      { startDate: focusDate, endDate: focusDate },
      timeline,
    );
    if (offset) {
      scrollRef.current.scrollLeft = Math.max(0, offset.left - 120);
      focusedRef.current = true;
    }
  }, [visibleRows, timeline, today]);

  const canCreateDep =
    snapshot.availableActions.includes("project_gantt.dependency.create") &&
    binding.fields.dependenciesField != null;
  const canDeleteDep =
    snapshot.availableActions.includes("project_gantt.dependency.delete") &&
    binding.fields.dependenciesField != null;

  function toggleCollapse(rowId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function openCreateWorkItem() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditWorkItem(row: ProjectGanttRow) {
    if (row.kind !== "work_item" || !row.sourceId) return;
    const item = snapshot.workItems.find((value) => value.id === row.sourceId);
    if (!item) return;
    setEditingItem(item);
    setFormOpen(true);
  }

  function openTask(row: ProjectGanttRow) {
    if (row.kind !== "work_item" || !row.sourceId) return;
    onOpenRecord?.(row.sourceId);
  }

  async function handleCreateDependency() {
    if (!depSuccessorId || !depPredecessorId) return;
    if (
      wouldCreateDependencyCycle(snapshot.dependencies, {
        predecessorWorkItemId: depPredecessorId,
        successorWorkItemId: depSuccessorId,
      })
    ) {
      toast.error("Зависимости образуют цикл");
      return;
    }
    try {
      createProjectGanttTaskDependency({
        binding,
        predecessorWorkItemId: depPredecessorId,
        successorWorkItemId: depSuccessorId,
        dependencyType: depType,
      });
      const successor = snapshot.workItems.find(
        (item) => item.id === depSuccessorId,
      );
      if (successor?.startDate && successor.endDate) {
        rescheduleProjectGanttTaskRecord({
          binding,
          workItemId: successor.id,
          newStartDate: successor.startDate,
          newEndDate: successor.endDate,
        });
      }
      toast.success("Зависимость добавлена");
      setDepOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось создать зависимость",
      );
    }
  }

  async function handleDeleteDependency(dependencyId: string) {
    try {
      deleteProjectGanttTaskDependency({ binding, dependencyId });
      toast.success("Зависимость удалена");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось удалить зависимость",
      );
    }
  }

  function syncHeaderScroll() {
    const body = scrollRef.current;
    const header = headerScrollRef.current;
    if (!body || !header) return;
    header.scrollLeft = body.scrollLeft;
  }

  const taskCount = workRows.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex min-w-0 flex-col">
          <p className="text-sm font-semibold text-foreground">График задач</p>
          <p className="text-xs text-muted-foreground">
            {taskCount === 0
              ? "Пока нет задач на проекте"
              : `${taskCount} ${taskCount === 1 ? "задача" : taskCount < 5 ? "задачи" : "задач"} с вкладки «Задачи»`}
            {undatedCount > 0 ? ` · ${undatedCount} без дат` : null}
          </p>
        </div>

        <Tabs
          value={scale}
          onValueChange={(value) => setScale(value as ProjectGanttScale)}
        >
          <TabsList className="h-8">
            {(Object.keys(SCALE_LABELS) as ProjectGanttScale[]).map((value) => (
              <TabsTrigger key={value} value={value} className="text-xs">
                {SCALE_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {comparison.baseline ? (
          <Select
            value={layer}
            onValueChange={(value) => setLayer(value as ProjectGanttLayerMode)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fact">Факт</SelectItem>
              <SelectItem value="baseline">Baseline</SelectItem>
              <SelectItem value="combined">Сравнение</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <Input
          className="h-8 w-40 text-xs"
          placeholder="Поиск…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {assignees.length > 1 ? (
          <Select
            value={assignee}
            onValueChange={(value) => setAssignee(value ?? "all")}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Исполнитель" />
            </SelectTrigger>
            <SelectContent>
              {assignees.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? "Все" : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={state}
          onValueChange={(value) => setState(value as ProjectGanttFilterState)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="done">Готовые</SelectItem>
            <SelectItem value="overdue">Просроченные</SelectItem>
            <SelectItem value="undated">Без дат</SelectItem>
          </SelectContent>
        </Select>

        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={openCreateWorkItem}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Задача
          </Button>
        ) : null}
      </div>

      {!binding.hasScheduleDates ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <CalendarOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            У «Задач» нет полей дат начала/окончания — полоски на шкале не
            появятся. Настройте график сущности или добавьте поля дат.
          </p>
        </div>
      ) : null}

      {taskCount === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ChartEmptyIcon />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              На графике пока пусто
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Создайте задачу здесь или на вкладке «Задачи» — она сразу появится
              в графике.
            </p>
          </div>
          {canEdit ? (
            <Button type="button" size="sm" onClick={openCreateWorkItem}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Добавить задачу
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="min-h-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex border-b border-border bg-muted/35">
            <div
              className="shrink-0 border-r border-border px-3 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
              style={{ width: LEFT_WIDTH }}
            >
              Структура
            </div>
            <div
              ref={headerScrollRef}
              className="relative min-w-0 flex-1 overflow-hidden"
            >
              <div
                className="relative h-full"
                style={{ width: timeline.width, height: 36 }}
              >
                {ticks.map((tick) => (
                  <div
                    key={tick.date}
                    className="absolute top-0 border-l border-border/50 px-1.5 text-[10px] text-muted-foreground"
                    style={{ left: tick.left, height: "100%" }}
                  >
                    <span className="inline-block pt-2.5">{tick.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="max-h-[560px] overflow-auto"
            onScroll={syncHeaderScroll}
          >
            <div
              className="flex"
              style={{ minWidth: LEFT_WIDTH + timeline.width }}
            >
              <div
                className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
                style={{ width: LEFT_WIDTH }}
              >
                {visibleRows.map((row) => {
                  const hasChildren = filteredRows.some(
                    (item) => item.parentId === row.id,
                  );
                  const undated =
                    row.kind === "work_item" && !row.startDate && !row.endDate;
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "group/row flex items-center gap-1 border-b border-border/60 px-2",
                        row.kind === "project" && "bg-muted/25",
                        row.kind === "stage" && "bg-muted/10",
                      )}
                      style={{
                        height: PROJECT_GANTT_ROW_HEIGHT,
                        paddingLeft: 8 + row.depth * 12,
                      }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                          onClick={() => toggleCollapse(row.id)}
                        >
                          {collapsed.has(row.id) ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}

                      <button
                        type="button"
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-[12px]",
                          row.kind === "project" && "font-semibold",
                          row.kind === "stage" &&
                            "font-medium text-muted-foreground",
                          row.kind === "work_item" &&
                            onOpenRecord &&
                            "text-foreground hover:underline",
                        )}
                        onClick={() => {
                          if (row.kind === "work_item" && onOpenRecord) {
                            openTask(row);
                            return;
                          }
                          if (row.kind === "work_item" && canEdit) {
                            openEditWorkItem(row);
                          }
                        }}
                        disabled={
                          row.kind !== "work_item" ||
                          (!onOpenRecord && !canEdit)
                        }
                        title={row.name}
                      >
                        {row.name}
                      </button>

                      {undated ? (
                        <span
                          className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200"
                          title="Нет дат — полоски на шкале нет"
                        >
                          без дат
                        </span>
                      ) : row.kind === "work_item" ? (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {formatShortDate(row.startDate)}–
                          {formatShortDate(row.endDate)}
                        </span>
                      ) : null}

                      {row.kind === "work_item" && row.sourceId ? (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                          {onOpenRecord ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Открыть задачу"
                              onClick={() => openTask(row)}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : null}
                          {canEdit ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Редактировать"
                              onClick={() => openEditWorkItem(row)}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          ) : null}
                          {canCreateDep ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Зависимость"
                              onClick={() => {
                                setDepSuccessorId(row.sourceId);
                                setDepPredecessorId("");
                                setDepType(FINISH_TO_START_DEPENDENCY_TYPE);
                                setDepOpen(true);
                              }}
                            >
                              <Link2 className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="relative" style={{ width: timeline.width }}>
                {todayLeft != null ? (
                  <div
                    className="pointer-events-none absolute top-0 z-[1] w-px bg-destructive/80"
                    style={{
                      left: todayLeft,
                      height: visibleRows.length * PROJECT_GANTT_ROW_HEIGHT,
                    }}
                  />
                ) : null}

                {visibleRows.map((row) => {
                  const bar = projectGanttBarPosition(row, timeline);
                  const clickable =
                    row.kind === "work_item" && Boolean(row.sourceId);
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "relative border-b border-border/40",
                        row.kind === "project" && "bg-muted/15",
                        row.kind === "stage" && "bg-muted/5",
                      )}
                      style={{ height: PROJECT_GANTT_ROW_HEIGHT }}
                    >
                      {bar ? (
                        <button
                          type="button"
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 rounded-md shadow-sm transition-opacity",
                            bar.milestone && "rotate-45 rounded-[2px]",
                            clickable
                              ? "cursor-pointer hover:opacity-100"
                              : "cursor-default",
                            "opacity-90",
                          )}
                          style={{
                            left: bar.left,
                            width: Math.max(bar.width, bar.milestone ? 10 : 8),
                            height: bar.milestone ? 10 : 16,
                            backgroundColor: row.statusColor ?? "#3b82f6",
                          }}
                          title={`${row.name}: ${row.startDate ?? "—"} — ${row.endDate ?? "—"}`}
                          onClick={() => {
                            if (clickable && onOpenRecord) openTask(row);
                            else if (clickable && canEdit)
                              openEditWorkItem(row);
                          }}
                          disabled={!clickable}
                        />
                      ) : row.kind === "work_item" ? (
                        <div className="absolute inset-y-0 left-3 flex items-center">
                          <span className="text-[10px] text-muted-foreground/70">
                            укажите даты
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <svg
                  className="pointer-events-none absolute inset-0"
                  width={timeline.width}
                  height={visibleRows.length * PROJECT_GANTT_ROW_HEIGHT}
                >
                  {snapshot.dependencies.map((dependency) => {
                    const predRow = visibleRows.find(
                      (row) =>
                        row.kind === "work_item" &&
                        row.sourceId === dependency.predecessorWorkItemId,
                    );
                    const succRow = visibleRows.find(
                      (row) =>
                        row.kind === "work_item" &&
                        row.sourceId === dependency.successorWorkItemId,
                    );
                    if (!predRow || !succRow) return null;
                    const predBar = projectGanttBarPosition(predRow, timeline);
                    const succBar = projectGanttBarPosition(succRow, timeline);
                    if (!predBar || !succBar) return null;
                    const predIndex = visibleRows.indexOf(predRow);
                    const succIndex = visibleRows.indexOf(succRow);
                    const x1 = predBar.left + predBar.width;
                    const y1 =
                      predIndex * PROJECT_GANTT_ROW_HEIGHT +
                      PROJECT_GANTT_ROW_HEIGHT / 2;
                    const x2 = succBar.left;
                    const y2 =
                      succIndex * PROJECT_GANTT_ROW_HEIGHT +
                      PROJECT_GANTT_ROW_HEIGHT / 2;
                    const mid = (x1 + x2) / 2;
                    return (
                      <g key={dependency.id}>
                        <path
                          d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.25}
                          className="text-muted-foreground/60"
                          markerEnd="url(#gantt-arrow)"
                        />
                        <text
                          x={mid}
                          y={(y1 + y2) / 2 - 4}
                          className="fill-muted-foreground text-[9px]"
                          textAnchor="middle"
                        >
                          {
                            WORK_ITEM_DEPENDENCY_TYPE_CODES[
                              dependency.dependencyType
                            ]
                          }
                          {dependency.lagBusinessDays
                            ? ` ${dependency.lagBusinessDays > 0 ? "+" : ""}${dependency.lagBusinessDays}`
                            : ""}
                        </text>
                      </g>
                    );
                  })}
                  <defs>
                    <marker
                      id="gantt-arrow"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path
                        d="M0,0 L6,3 L0,6 Z"
                        className="fill-muted-foreground/60"
                      />
                    </marker>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {canDeleteDep && snapshot.dependencies.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {snapshot.dependencies.slice(0, 12).map((dependency) => {
            const pred = snapshot.workItems.find(
              (item) => item.id === dependency.predecessorWorkItemId,
            );
            const succ = snapshot.workItems.find(
              (item) => item.id === dependency.successorWorkItemId,
            );
            return (
              <button
                key={dependency.id}
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                onClick={() => void handleDeleteDependency(dependency.id)}
                title="Удалить зависимость"
              >
                {pred?.name ?? "?"} → {succ?.name ?? "?"}
                <Trash2 className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      ) : null}

      <Dialog open={depOpen} onOpenChange={setDepOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить зависимость</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Select
              value={depPredecessorId}
              onValueChange={(value) => setDepPredecessorId(value ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Предшественник" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.workItems
                  .filter((item) => item.id !== depSuccessorId)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={depType}
              onValueChange={(value) =>
                setDepType(value as WorkItemDependencyType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_ITEM_DEPENDENCY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {WORK_ITEM_DEPENDENCY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDepOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!depPredecessorId}
              onClick={() => void handleCreateDependency()}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {formOpen ? (
        <WorkItemFormDialog
          key={editingItem?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          binding={binding}
          workItem={editingItem}
          onSaved={() => {
            /* entity store updates drive re-render */
          }}
        />
      ) : null}
    </div>
  );
}

function ChartEmptyIcon() {
  return (
    <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <CalendarOff className="size-5" aria-hidden />
    </span>
  );
}
