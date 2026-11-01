import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Link2,
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
  createProjectGanttDependency,
  deleteProjectGanttDependency,
  reorderProjectGanttWorkItem,
  rescheduleProjectGanttWorkItem,
} from "../api/gantt-api";
import {
  FINISH_TO_START_DEPENDENCY_TYPE,
  WORK_ITEM_DEPENDENCY_TYPE_CODES,
  WORK_ITEM_DEPENDENCY_TYPE_LABELS,
  WORK_ITEM_DEPENDENCY_TYPES,
  type ProjectGanttComparison,
  type ProjectGanttSnapshot,
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
  orderedProjectGanttWorkItems,
  PROJECT_GANTT_ROW_HEIGHT,
  projectGanttBarPosition,
  projectGanttTodayLeft,
  selectProjectGanttFocusDate,
  type ProjectGanttFilterState,
  type ProjectGanttRow,
  type ProjectGanttScale,
} from "../model/rows";
import { WorkItemFormDialog } from "./WorkItemFormDialog";

const LEFT_WIDTH = 320;

export type ProjectGanttLayerMode = "baseline" | "fact" | "combined";

const SCALE_LABELS: Record<ProjectGanttScale, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
};

function resolveSnapshot(
  comparison: ProjectGanttComparison,
  layer: ProjectGanttLayerMode,
): ProjectGanttSnapshot {
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

export function ProjectGanttView({
  projectEntityId,
  projectRecordId,
  comparison,
  canEdit,
  onRefresh,
}: {
  projectEntityId: string;
  projectRecordId: string;
  comparison: ProjectGanttComparison;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const today = todayIsoDate();
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const assignees = useMemo(() => {
    const names = new Set(
      allRows
        .map((row) => row.assignee)
        .filter((value) => value && value !== "—"),
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

  const canCreateDep = snapshot.availableActions.includes(
    "project_gantt.dependency.create",
  );
  const canDeleteDep = snapshot.availableActions.includes(
    "project_gantt.dependency.delete",
  );
  const canReorder = snapshot.availableActions.includes(
    "project_gantt.work_item.reorder",
  );

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

  async function handleReorder(row: ProjectGanttRow, direction: "up" | "down") {
    if (!row.sourceId || row.kind !== "work_item") return;
    const item = snapshot.workItems.find((value) => value.id === row.sourceId);
    if (!item) return;
    const siblings = orderedProjectGanttWorkItems(
      snapshot.workItems.filter((value) => value.stageId === item.stageId),
    ).map((value) => value.id);
    try {
      await reorderProjectGanttWorkItem({
        projectEntityId,
        projectRecordId,
        workItemId: item.id,
        stageId: item.stageId,
        direction,
        expectedOrder: siblings,
        idempotencyKey: crypto.randomUUID(),
      });
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось изменить порядок",
      );
    }
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
      await createProjectGanttDependency({
        projectEntityId,
        projectRecordId,
        predecessorWorkItemId: depPredecessorId,
        successorWorkItemId: depSuccessorId,
        dependencyType: depType,
      });
      const successor = snapshot.workItems.find(
        (item) => item.id === depSuccessorId,
      );
      if (successor?.startDate && successor.endDate) {
        await rescheduleProjectGanttWorkItem({
          projectEntityId,
          projectRecordId,
          workItemId: successor.id,
          newStartDate: successor.startDate,
          newEndDate: successor.endDate,
          idempotencyKey: crypto.randomUUID(),
        });
      }
      toast.success("Зависимость добавлена");
      setDepOpen(false);
      onRefresh();
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
      await deleteProjectGanttDependency({
        projectEntityId,
        projectRecordId,
        dependencyId,
      });
      toast.success("Зависимость удалена");
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось удалить зависимость",
      );
    }
  }

  const truncated =
    snapshot.truncated.stages ||
    snapshot.truncated.workItems ||
    snapshot.truncated.subtasks ||
    snapshot.truncated.dependencies;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
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
          className="h-8 w-44 text-xs"
          placeholder="Поиск…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={assignee}
          onValueChange={(value) => setAssignee(value ?? "all")}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Исполнитель" />
          </SelectTrigger>
          <SelectContent>
            {assignees.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "Все исполнители" : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            Работа
          </Button>
        ) : null}
      </div>

      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Показана усечённая выборка — лимит графика достигнут.
        </p>
      ) : null}

      <div className="min-h-[320px] overflow-hidden rounded-lg border border-border">
        <div className="flex border-b border-border bg-muted/40">
          <div
            className="shrink-0 border-r border-border px-3 py-2 text-[11px] font-medium text-muted-foreground"
            style={{ width: LEFT_WIDTH }}
          >
            Структура
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div
              className="relative h-full"
              style={{ width: timeline.width, height: 36 }}
            >
              {ticks.map((tick) => (
                <div
                  key={tick.date}
                  className="absolute top-0 border-l border-border/60 px-1 text-[10px] text-muted-foreground"
                  style={{ left: tick.left, height: "100%" }}
                >
                  <span className="inline-block pt-2">{tick.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="max-h-[560px] overflow-auto">
          <div
            className="flex"
            style={{ minWidth: LEFT_WIDTH + timeline.width }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 bg-background"
              style={{ width: LEFT_WIDTH }}
            >
              {visibleRows.map((row) => {
                const hasChildren = filteredRows.some(
                  (item) => item.parentId === row.id,
                );
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-1 border-b border-border/70 px-2"
                    style={{
                      height: PROJECT_GANTT_ROW_HEIGHT,
                      paddingLeft: 8 + row.depth * 14,
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
                        "min-w-0 flex-1 truncate text-left text-[11px]",
                        row.kind === "work_item" &&
                          canEdit &&
                          "hover:underline",
                      )}
                      onClick={() => openEditWorkItem(row)}
                      disabled={row.kind !== "work_item" || !canEdit}
                    >
                      {row.name}
                    </button>
                    {row.kind === "work_item" && canEdit ? (
                      <div className="flex shrink-0 items-center gap-0.5">
                        {canReorder ? (
                          <>
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                              onClick={() => void handleReorder(row, "up")}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                              onClick={() => void handleReorder(row, "down")}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </>
                        ) : null}
                        {canCreateDep ? (
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
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
                  className="pointer-events-none absolute top-0 z-[1] w-px bg-destructive/70"
                  style={{
                    left: todayLeft,
                    height: visibleRows.length * PROJECT_GANTT_ROW_HEIGHT,
                  }}
                />
              ) : null}
              {visibleRows.map((row) => {
                const bar = projectGanttBarPosition(row, timeline);
                return (
                  <div
                    key={row.id}
                    className="relative border-b border-border/50"
                    style={{ height: PROJECT_GANTT_ROW_HEIGHT }}
                  >
                    {bar ? (
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 rounded-sm",
                          bar.milestone ? "rotate-45" : "",
                        )}
                        style={{
                          left: bar.left,
                          width: bar.width,
                          height: bar.milestone ? 10 : 14,
                          backgroundColor: row.statusColor ?? "#3b82f6",
                          opacity: 0.85,
                        }}
                        title={`${row.name}: ${row.startDate ?? "—"} — ${row.endDate ?? "—"}`}
                      />
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
                        className="text-muted-foreground/70"
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
                      className="fill-muted-foreground/70"
                    />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>

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
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
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
          projectEntityId={projectEntityId}
          projectRecordId={projectRecordId}
          stages={snapshot.stages}
          workItem={editingItem}
          onSaved={onRefresh}
        />
      ) : null}
    </div>
  );
}
