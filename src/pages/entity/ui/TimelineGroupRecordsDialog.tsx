import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import { formatDateDisplay } from "@/shared/lib/format-date";
import { pluralRu } from "@/shared/lib/plural";
import {
  formatRecordFieldValue,
  getEntityTimelineDates,
  getEntityTimelineSetup,
  resolveRelationRecordLabel,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
  type EntityTimelineSetup,
  type EntityValueContext,
} from "@/entities/entity";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "./EntityBrowseFilters";
import { EntityRecordDialog } from "./EntityRecordDialog";

const PAGE_SIZES = [10, 25, 50] as const;
type DialogPageSize = (typeof PAGE_SIZES)[number];

function isDialogPageSize(value: number): value is DialogPageSize {
  return (PAGE_SIZES as readonly number[]).includes(value);
}

type TimelineGroupRecordsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  /** Ids of operations in the cell — resolved per page only. */
  recordIds: readonly string[];
  groupLabel: string;
  cellLabel?: string | null;
};

type RowModel = {
  record: EntityRecord;
  title: string;
  amount: string | null;
  period: string | null;
};

function buildRowModel(
  entity: Entity,
  record: EntityRecord,
  setup: EntityTimelineSetup | null,
  valueContext: EntityValueContext,
): RowModel {
  const title = resolveRelationRecordLabel(entity, record.id) ?? "Без названия";
  const amount =
    setup?.labelField != null
      ? formatRecordFieldValue(valueContext, entity, record, setup.labelField)
      : null;
  const dates = setup ? getEntityTimelineDates(setup, record) : null;
  const period =
    dates == null
      ? null
      : dates.start === dates.end
        ? formatDateDisplay(dates.start)
        : `${formatDateDisplay(dates.start)} — ${formatDateDisplay(dates.end)}`;
  return { record, title, amount, period };
}

/**
 * Compact list of operations for a timeline group cell.
 * Formats only the current pagination page; filters run on ids in memory.
 */
export function TimelineGroupRecordsDialog({
  open,
  onOpenChange,
  entity,
  recordIds,
  groupLabel,
  cellLabel,
}: TimelineGroupRecordsDialogProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const setup = useMemo(() => getEntityTimelineSetup(entity), [entity]);
  const filterFields = useMemo(
    () => getEntityBrowseFilterFields(entity),
    [entity],
  );

  const [editing, setEditing] = useState<EntityRecord | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EntityFiltersState>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DialogPageSize>(10);
  const sessionKey = `${open ? "1" : "0"}|${recordIds.length}|${groupLabel}|${cellLabel ?? ""}`;
  const [activeSessionKey, setActiveSessionKey] = useState(sessionKey);
  if (activeSessionKey !== sessionKey) {
    setActiveSessionKey(sessionKey);
    setSearch("");
    setFilters({});
    setPage(1);
    setEditing(null);
  }

  const recordsById = useMemo(() => {
    const map = new Map<string, EntityRecord>();
    for (const record of entity.records) {
      map.set(record.id, record);
    }
    return map;
  }, [entity.records]);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const paginationResetKey = `${search}|${filtersKey}|${pageSize}`;
  const [activePaginationKey, setActivePaginationKey] =
    useState(paginationResetKey);
  let effectivePage = page;
  if (activePaginationKey !== paginationResetKey) {
    setActivePaginationKey(paginationResetKey);
    setPage(1);
    effectivePage = 1;
  }

  const filteredIds = useMemo(() => {
    const hasSearch = search.trim().length > 0;
    const hasFilters = Object.keys(filters).length > 0;
    if (!hasSearch && !hasFilters) return recordIds as string[];

    const next: string[] = [];
    for (const id of recordIds) {
      const record = recordsById.get(id);
      if (!record) continue;
      if (!recordMatchesSearch(valueContext, entity, record, search)) continue;
      if (
        !recordMatchesFilters(
          valueContext,
          entity,
          record,
          filterFields,
          filters,
        )
      ) {
        continue;
      }
      next.push(id);
    }
    return next;
  }, [
    entity,
    filterFields,
    filters,
    recordIds,
    recordsById,
    search,
    valueContext,
  ]);

  const sourceCount = recordIds.length;
  const total = filteredIds.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, effectivePage), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const pageStart = (currentPage - 1) * pageSize;

  const rows = useMemo(() => {
    const pageIds = filteredIds.slice(pageStart, pageStart + pageSize);
    const next: RowModel[] = [];
    for (const id of pageIds) {
      const record = recordsById.get(id);
      if (!record) continue;
      next.push(buildRowModel(entity, record, setup, valueContext));
    }
    return next;
  }, [
    entity,
    filteredIds,
    pageSize,
    pageStart,
    recordsById,
    setup,
    valueContext,
  ]);

  const filteredLabel =
    total === sourceCount
      ? `${sourceCount} ${pluralRu(sourceCount, "запись", "записи", "записей")}`
      : `${total} ${pluralRu(total, "запись", "записи", "записей")} из ${sourceCount}`;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex h-[min(92vh,56rem)] w-full min-w-[min(100%,22rem)] max-w-[min(92vw,32rem)] flex-col gap-2.5 overflow-hidden sm:max-w-[min(92vw,32rem)]">
          <DialogHeader className="shrink-0 gap-1 pr-6">
            <DialogTitle className="truncate">{groupLabel}</DialogTitle>
            <DialogDescription className="truncate">
              {cellLabel ? `${cellLabel} · ${filteredLabel}` : filteredLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0">
            <EntityBrowseFilters
              fields={filterFields}
              entities={entities}
              search={search}
              onSearchChange={setSearch}
              filters={filters}
              onFiltersChange={setFilters}
              compact
              searchId="timeline-group-records-search"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {sourceCount === 0
                    ? "Нет записей за этот период"
                    : "Ничего не найдено"}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map(({ record, title, amount, period }) => (
                    <li key={record.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                        )}
                        onClick={() => setEditing(record)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium leading-none text-foreground">
                            {title}
                          </span>
                          {period ? (
                            <span className="mt-1 block truncate text-[11px] leading-none text-muted-foreground tabular-nums">
                              {period}
                            </span>
                          ) : null}
                        </span>
                        {amount && amount !== "—" ? (
                          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                            {amount}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/50 px-2.5">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="shrink-0">На стр.</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(next) => {
                    const size = Number(next);
                    if (isDialogPageSize(size)) setPageSize(size);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-[3.25rem] px-1.5 text-[11px]"
                    aria-label="Записей на странице"
                  >
                    <SelectValue>{pageSize}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="truncate tabular-nums">
                  {total === 0 ? "0" : `${from}–${to}`} из {total}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  disabled={currentPage <= 1}
                  aria-label="Предыдущая страница"
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="min-w-[2.5rem] text-center text-[11px] tabular-nums text-muted-foreground">
                  {currentPage}/{totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  disabled={currentPage >= totalPages}
                  aria-label="Следующая страница"
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EntityRecordDialog
        open={editing != null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        entity={entity}
        record={editing}
      />
    </>
  );
}
