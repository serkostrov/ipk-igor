import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lock,
  RotateCcw,
  Search,
  Table2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
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
  DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  ENTITY_TABLE_PAGE_SIZES,
  ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
  getSystemUserName,
  isEntityNameField,
  isEntityTablePageSize,
  parseEntityTablePageSize,
  resolveRelationRecordLabel,
  useEntityConfig,
  type EntityTablePageSize,
} from "@/entities/entity";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

const ALL_OPTION = "__all__";
const NONE_ASSIGNEE = "__none__";

const headClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

const filterControlClass = "h-8 w-full min-w-0 text-sm";
const filterSearchClass = cn(
  filterControlClass,
  "box-border py-0 leading-none md:text-sm",
);

type StatusFilter = "active" | AutomationTaskStatus | "all";

const STATUS_LABELS: Record<AutomationTaskStatus, string> = {
  pending: "Ожидает",
  returned: "На доработке",
  completed: "Завершена",
  cancelled: "Отменена",
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "pending", label: STATUS_LABELS.pending },
  { value: "returned", label: STATUS_LABELS.returned },
  { value: "completed", label: STATUS_LABELS.completed },
  { value: "cancelled", label: STATUS_LABELS.cancelled },
  { value: "all", label: "Все" },
];

function FilterValueLabel({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate">{value}</span>
    </span>
  );
}

function getVisiblePages(current: number, total: number) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const next = current + offset;
    if (next > 1 && next < total) pages.add(next);
  }
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (const page of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === "number" && page - prev > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }
  return result;
}

function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: EntityTablePageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: EntityTablePageSize) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="flex h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 border-t border-border bg-muted px-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="shrink-0">На странице</span>
        <Select
          value={String(pageSize)}
          onValueChange={(next) => {
            const size = Number(next);
            if (isEntityTablePageSize(size)) onPageSizeChange(size);
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-7 w-[3.75rem] px-2 text-[11px]"
            aria-label="Записей на странице"
          >
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TABLE_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {total === 0 ? "0 записей" : `${from}–${to} из ${total}`}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className="size-7"
          disabled={currentPage <= 1}
          aria-label="Предыдущая страница"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {visiblePages.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex size-7 items-center justify-center text-[11px] text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(
                "size-7 text-[11px] tabular-nums text-foreground hover:bg-transparent hover:text-foreground",
                item === currentPage && "font-semibold",
              )}
              aria-label={`Страница ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className="size-7"
          disabled={currentPage >= totalPages}
          aria-label="Следующая страница"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

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
  const [entityFilter, setEntityFilter] = useState(ALL_OPTION);
  const [recordFilter, setRecordFilter] = useState(ALL_OPTION);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL_OPTION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorageState(
    ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
    parseEntityTablePageSize,
    DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  );

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

  const entityOptions = useMemo(() => {
    const ids = new Set(tasks.map((task) => task.entityId));
    return entities
      .filter((entity) => ids.has(entity.id))
      .map((entity) => ({
        id: entity.id,
        label: entity.namePlural?.trim() || entity.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [tasks, entities]);

  const recordOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) {
      if (entityFilter !== ALL_OPTION && task.entityId !== entityFilter) {
        continue;
      }
      if (seen.has(task.recordId)) continue;
      seen.set(
        task.recordId,
        taskRecordTitle(entities, task) ?? "Без названия",
      );
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [tasks, entities, entityFilter]);

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    let hasNone = false;
    for (const task of tasks) {
      if (!task.assigneeUserId) {
        hasNone = true;
        continue;
      }
      if (seen.has(task.assigneeUserId)) continue;
      seen.set(
        task.assigneeUserId,
        getSystemUserName(entities, task.assigneeUserId) ?? "Без имени",
      );
    }
    const named = [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return { named, hasNone };
  }, [tasks, entities]);

  const effectiveEntityFilter =
    entityFilter === ALL_OPTION ||
    entityOptions.some((item) => item.id === entityFilter)
      ? entityFilter
      : ALL_OPTION;

  const effectiveRecordFilter =
    recordFilter === ALL_OPTION ||
    recordOptions.some((item) => item.id === recordFilter)
      ? recordFilter
      : ALL_OPTION;

  const effectiveAssigneeFilter =
    assigneeFilter === ALL_OPTION
      ? ALL_OPTION
      : assigneeFilter === NONE_ASSIGNEE
        ? assigneeOptions.hasNone
          ? NONE_ASSIGNEE
          : ALL_OPTION
        : assigneeOptions.named.some((item) => item.id === assigneeFilter)
          ? assigneeFilter
          : ALL_OPTION;

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    return tasks.filter((task) => {
      if (
        effectiveEntityFilter !== ALL_OPTION &&
        task.entityId !== effectiveEntityFilter
      ) {
        return false;
      }
      if (
        effectiveRecordFilter !== ALL_OPTION &&
        task.recordId !== effectiveRecordFilter
      ) {
        return false;
      }
      if (effectiveAssigneeFilter === NONE_ASSIGNEE) {
        if (task.assigneeUserId) return false;
      } else if (
        effectiveAssigneeFilter !== ALL_OPTION &&
        task.assigneeUserId !== effectiveAssigneeFilter
      ) {
        return false;
      }
      if (!needle) return true;
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
  }, [
    tasks,
    search,
    entities,
    effectiveEntityFilter,
    effectiveRecordFilter,
    effectiveAssigneeFilter,
  ]);

  const paginationResetKey = `${search}|${statusFilter}|${effectiveEntityFilter}|${effectiveRecordFilter}|${effectiveAssigneeFilter}|${pageSize}`;
  const [activePaginationKey, setActivePaginationKey] =
    useState(paginationResetKey);

  let effectivePage = page;
  if (activePaginationKey !== paginationResetKey) {
    setActivePaginationKey(paginationResetKey);
    setPage(1);
    effectivePage = 1;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, effectivePage), totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const statusDisplay =
    STATUS_FILTER_OPTIONS.find((item) => item.value === statusFilter)?.label ??
    "Все";
  const entityDisplay =
    effectiveEntityFilter === ALL_OPTION
      ? "все"
      : (entityOptions.find((item) => item.id === effectiveEntityFilter)
          ?.label ?? "все");
  const recordDisplay =
    effectiveRecordFilter === ALL_OPTION
      ? "все"
      : (recordOptions.find((item) => item.id === effectiveRecordFilter)
          ?.label ?? "все");
  const assigneeDisplay =
    effectiveAssigneeFilter === ALL_OPTION
      ? "все"
      : effectiveAssigneeFilter === NONE_ASSIGNEE
        ? "Без исполнителя"
        : (assigneeOptions.named.find(
            (item) => item.id === effectiveAssigneeFilter,
          )?.label ?? "все");

  const hasExtraFilters =
    search.trim().length > 0 ||
    effectiveEntityFilter !== ALL_OPTION ||
    effectiveRecordFilter !== ALL_OPTION ||
    effectiveAssigneeFilter !== ALL_OPTION ||
    statusFilter !== "active";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-2 items-center gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        <div className="relative col-span-2 h-8">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск задач"
            aria-label="Поиск задач"
            className={cn(filterSearchClass, "absolute inset-0 pl-8")}
          />
        </div>

        <Select
          value={effectiveEntityFilter}
          onValueChange={(next) => {
            setEntityFilter(next ?? ALL_OPTION);
            setRecordFilter(ALL_OPTION);
          }}
        >
          <SelectTrigger
            size="sm"
            className={filterControlClass}
            aria-label="Фильтр: Сущность"
          >
            <SelectValue>
              <FilterValueLabel label="Сущность" value={entityDisplay} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>Все</SelectItem>
            {entityOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={effectiveRecordFilter}
          onValueChange={(next) => setRecordFilter(next ?? ALL_OPTION)}
        >
          <SelectTrigger
            size="sm"
            className={filterControlClass}
            aria-label="Фильтр: Запись"
          >
            <SelectValue>
              <FilterValueLabel label="Запись" value={recordDisplay} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>Все</SelectItem>
            {recordOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={effectiveAssigneeFilter}
          onValueChange={(next) => setAssigneeFilter(next ?? ALL_OPTION)}
        >
          <SelectTrigger
            size="sm"
            className={filterControlClass}
            aria-label="Фильтр: Исполнитель"
          >
            <SelectValue>
              <FilterValueLabel label="Исполнитель" value={assigneeDisplay} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>Все</SelectItem>
            {assigneeOptions.hasNone ? (
              <SelectItem value={NONE_ASSIGNEE}>Без исполнителя</SelectItem>
            ) : null}
            {assigneeOptions.named.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(next) => {
            const value = (next ?? "active") as StatusFilter;
            setStatusFilter(value);
          }}
        >
          <SelectTrigger
            size="sm"
            className={filterControlClass}
            aria-label="Фильтр: Статус"
          >
            <SelectValue>
              <FilterValueLabel label="Статус" value={statusDisplay} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
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
                {hasExtraFilters
                  ? "Нет задач по фильтру"
                  : "Нет активных задач"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasExtraFilters
                  ? "Измените поиск или фильтры"
                  : "Новые задачи появятся здесь при запуске процессов"}
              </p>
            </div>
          </div>
        ) : (
          <>
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
                  {pageItems.map((task) => {
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
                          {task.dueAt
                            ? formatTimestampDisplay(task.dueAt)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
