import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Lock, RotateCcw, Search, Table2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { FilterPill } from "@/shared/ui/filter-pill";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  fetchAutomationTasks,
  registerOverdueAutomationTasksRpc,
  subscribeAutomationTasks,
  type AutomationTask,
  type AutomationTaskStatus,
} from "@/entities/automation";
import {
  getSystemUserName,
  isEntityNameField,
  resolveRelationRecordLabel,
  useEntityConfig,
} from "@/entities/entity";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

const headClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

type StatusFilter = "active" | AutomationTaskStatus | "all";

const STATUS_LABELS: Record<AutomationTaskStatus, string> = {
  pending: "Ожидает",
  returned: "На доработке",
  completed: "Завершена",
  cancelled: "Отменена",
};

function taskRecordTitle(
  entities: ReturnType<typeof useEntityConfig>["entities"],
  task: AutomationTask,
) {
  const entity = entities.find((item) => item.id === task.entityId);
  if (!entity) return null;
  const fromRelation = resolveRelationRecordLabel(entity, task.recordId);
  if (fromRelation) return fromRelation;
  const record = entity.records.find((item) => item.id === task.recordId);
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const title = nameField ? (record?.values[nameField.id] ?? "").trim() : "";
  return title || null;
}

function StatusBadge({ status }: { status: AutomationTaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        status === "pending" && "bg-primary/10 text-primary",
        status === "returned" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "cancelled" && "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function TaskTableView({
  onOpenTask,
  onOpenRecord,
}: {
  onOpenTask: (taskId: string) => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const { entities } = useEntityConfig();
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          void registerOverdueAutomationTasksRpc().catch(() => null);
          const next = await fetchAutomationTasks(
            statusFilter === "active"
              ? { status: ["pending", "returned"] }
              : statusFilter === "all"
                ? undefined
                : { status: statusFilter },
          );
          if (!cancelled) setTasks(next);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : "Не удалось загрузить задачи",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadToken, statusFilter]);

  useEffect(() => {
    return subscribeAutomationTasks(() => {
      setReloadToken((token) => token + 1);
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    if (!needle) return tasks;
    return tasks.filter((task) => {
      const entity = entities.find((item) => item.id === task.entityId);
      const recordTitle = taskRecordTitle(entities, task) ?? "";
      const assignee = task.assigneeUserId
        ? (getSystemUserName(entities, task.assigneeUserId) ?? "")
        : "";
      const haystack = [
        task.name,
        task.description,
        entity?.name ?? "",
        recordTitle,
        assignee,
        STATUS_LABELS[task.status],
        String(task.stepOrder),
      ]
        .join(" ")
        .toLocaleLowerCase("ru");
      return haystack.includes(needle);
    });
  }, [tasks, search, entities]);

  const activeCount = tasks.filter(
    (task) => task.status === "pending" || task.status === "returned",
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск задач"
            aria-label="Поиск задач"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <FilterPill
            label="Активные"
            count={statusFilter === "active" ? filtered.length : undefined}
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
          />
          <FilterPill
            label="Все"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <FilterPill
            label="Завершённые"
            active={statusFilter === "completed"}
            onClick={() => setStatusFilter("completed")}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-9 gap-1.5"
          onClick={reload}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Обновить
        </Button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {loading ? (
          <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Table2 className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">
                {search.trim() || statusFilter !== "active"
                  ? "Нет задач по фильтру"
                  : "Нет активных задач"}
              </p>
              <p className="text-xs text-muted-foreground">
                {statusFilter === "active" && !search.trim()
                  ? "Новые задачи появятся здесь при запуске процессов"
                  : "Измените поиск или фильтр статуса"}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <Table className="table-fixed text-[13px]">
              <colgroup>
                <col />
                <col className="w-44" />
                <col className="w-36" />
                <col className="w-40" />
                <col className="w-20" />
                <col className="w-32" />
                <col className="w-40" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className={headClass}>Название</TableHead>
                  <TableHead className={headClass}>Запись</TableHead>
                  <TableHead className={headClass}>Сущность</TableHead>
                  <TableHead className={headClass}>Исполнитель</TableHead>
                  <TableHead className={headClass}>Шаг</TableHead>
                  <TableHead className={headClass}>Статус</TableHead>
                  <TableHead className={headClass}>Срок</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child]:border-b">
                {filtered.map((task) => {
                  const entity = entities.find(
                    (item) => item.id === task.entityId,
                  );
                  const recordTitle = taskRecordTitle(entities, task);
                  const assignee = task.assigneeUserId
                    ? getSystemUserName(entities, task.assigneeUserId)
                    : null;
                  return (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer border-border/70 hover:bg-muted/35"
                      onClick={() => onOpenTask(task.id)}
                    >
                      <TableCell className="px-3 py-2.5">
                        <div className="flex min-w-0 items-start gap-1.5">
                          {task.isBlocking ? (
                            <Lock
                              className="mt-0.5 size-3.5 shrink-0 text-primary"
                              aria-label="Блокирует переход"
                            />
                          ) : (
                            <Clock3
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70"
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium tracking-tight">
                              {task.name}
                            </p>
                            {task.description.trim() ? (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                {task.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        {recordTitle && onOpenRecord ? (
                          <button
                            type="button"
                            className="max-w-full truncate text-left font-medium text-primary underline-offset-2 hover:underline"
                            title={recordTitle}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRecord(task.entityId, task.recordId);
                            }}
                          >
                            {recordTitle}
                          </button>
                        ) : (
                          <span className="truncate text-muted-foreground">
                            {recordTitle ?? "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="truncate px-3 py-2.5 text-muted-foreground">
                        {entity?.namePlural?.trim() || entity?.name || "—"}
                      </TableCell>
                      <TableCell className="truncate px-3 py-2.5">
                        {assignee ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {task.stepOrder}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {task.dueAt ? formatTimestampDisplay(task.dueAt) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!loading && !error ? (
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Показано {filtered.length}
          {statusFilter === "active" && !search.trim()
            ? ` · активных в системе: ${activeCount}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
