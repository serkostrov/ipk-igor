import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { RecordDeleteConfirmDialog } from "./RecordDeleteConfirmDialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Switch } from "@/shared/ui/switch";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { cn } from "@/shared/lib/cn";
import {
  entityListValueIncludesId,
  entityRelationIncludesId,
  formatEntityDecimalTotal,
  getEntityContactHref,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityListOption,
  getEntityListParentField,
  getEntityRelationTargetId,
  getEntityTableFields,
  isEntityInternal,
  isEntityRelationLikeFieldType,
  getEntityUrlHref,
  getRelationRecordOptions,
  getVisibleListOptions,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  formatRecordFieldValue,
  getRecordFieldNumber,
  isEntityNameField,
  isEntityNumericFieldType,
  isRecordValueDecorated,
  ListSelect,
  ListValueDisplay,
  RecordValue,
  useEntityValueContext,
  type EntityValueContext,
  normalizeEntityDecimalInput,
  parseEntityDecimal,
  formatEntityFieldFilesSummary,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  parseEntityRelationIds,
  applyEntityFieldValue,
  removeEntityRecord,
  resolveRelationRecordLabel,
  getEntityFileDownloadUrl,
  updateEntityRecord,
  useEntityConfig,
  DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  ENTITY_TABLE_PAGE_SIZES,
  ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
  getNextEntityRecordSort,
  isEntityTablePageSize,
  parseEntityRecordSort,
  parseEntityTablePageSize,
  sortEntityRecords,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityRecordSortDirection,
  type EntityTablePageSize,
} from "@/entities/entity";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import {
  formatDateDisplay,
  formatDatetimeDisplay,
} from "@/shared/lib/format-date";
import {
  ENTITY_TABLE_ACTIONS_WIDTH,
  getEntityTableHeaderMinWidth,
} from "../lib/table-column-width";
import { useRecordListChange } from "./use-record-list-change";

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

const dataTableHeadClass =
  "sticky top-0 z-10 h-9 border-b border-border bg-muted px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-foreground/65 uppercase";

const dataTableActionsHeadClass =
  "sticky top-0 z-10 h-9 w-24 min-w-24 max-w-24 border-b border-border bg-muted px-2 text-right text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

const dataTableFootClass =
  "h-9 min-w-0 overflow-hidden px-3 py-0 text-foreground/90";

const dataTableActionsFootClass =
  "h-9 w-24 min-w-24 max-w-24 overflow-hidden px-2 py-0";

/** Stays at the bottom of the table viewport, directly above pagination. */
const dataTableFooterClass =
  "sticky bottom-0 z-[5] border-t border-border bg-muted [&>tr]:h-9 [&>tr]:border-0";

type EntityTableViewProps = {
  entity: Entity;
  /** Records in scope (quick filter, hidden options) before search and filters. */
  records: EntityRecord[];
  title: string;
  /** Pencil — quick edit dialog. */
  onEditRecord?: (record: EntityRecord) => void;
  /** Row click — open full record (optional). */
  onOpenRecord?: (record: EntityRecord) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

function SortIcon({
  direction,
}: {
  direction: EntityRecordSortDirection | null;
}) {
  if (direction === "asc") return <ArrowUp className="size-3 shrink-0" />;
  if (direction === "desc") return <ArrowDown className="size-3 shrink-0" />;
  return (
    <ArrowUpDown className="size-3 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-60" />
  );
}

const ALL_OPTION = "__all__";

type FieldFilter =
  | { kind: "text"; query: string }
  | { kind: "boolean"; value: string }
  | { kind: "list"; optionId: string }
  | { kind: "number"; from: string; to: string }
  | { kind: "datetime"; from: string; to: string };

type FiltersState = Record<string, FieldFilter>;

function getRecordTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
) {
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "эту запись";
  const label = formatRecordFieldValue(ctx, entity, record, nameField);
  if (!label.trim() || label === "—") return "эту запись";
  return `«${label}»`;
}

function fieldSearchText(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
) {
  const raw = record.values[field.id] ?? "";
  if (field.type === "boolean") {
    if (raw === "true") return "да true";
    if (raw === "false") return "нет false";
    return "";
  }
  if (field.type === "file") {
    const summary = formatEntityFieldFilesSummary(raw);
    return summary === "—" ? "" : summary;
  }
  if (field.type === "datetime") {
    const display = formatDatetimeDisplay(raw);
    return `${raw} ${display}`.trim();
  }
  const display = formatRecordFieldValue(ctx, entity, record, field);
  return display === "—" ? "" : display;
}

function recordMatchesSearch(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  search: string,
) {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return entity.fields.some((field) =>
    fieldSearchText(ctx, entity, record, field).toLowerCase().includes(query),
  );
}

function extractDatePart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed.replace(" ", "T"));
  return match?.[1] ?? "";
}

function isFilterActive(filter: FieldFilter | undefined) {
  if (!filter) return false;
  if (filter.kind === "text") return filter.query.trim().length > 0;
  if (filter.kind === "boolean") return filter.value.length > 0;
  if (filter.kind === "list") return filter.optionId.length > 0;
  return filter.from.trim().length > 0 || filter.to.trim().length > 0;
}

function recordMatchesFilters(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  fields: EntityField[],
  filters: FiltersState,
) {
  return fields.every((field) => {
    const filter = filters[field.id];
    if (!filter || !isFilterActive(filter)) return true;

    const raw = record.values[field.id] ?? "";

    if (filter.kind === "boolean") {
      return raw === filter.value;
    }

    if (filter.kind === "list") {
      if (isEntityRelationLikeFieldType(field.type)) {
        return entityRelationIncludesId(raw, filter.optionId);
      }
      if (field.type === "list" && field.listMultiple) {
        return entityListValueIncludesId(raw, filter.optionId);
      }
      return raw === filter.optionId;
    }

    if (filter.kind === "datetime") {
      const date = extractDatePart(raw);
      if (!date) return false;
      if (filter.from && date < filter.from) return false;
      if (filter.to && date > filter.to) return false;
      return true;
    }

    if (filter.kind === "number") {
      const numeric = getRecordFieldNumber(ctx, entity, record, field);
      if (numeric == null) return false;
      if (filter.from.trim()) {
        const from = parseEntityDecimal(filter.from);
        if (Number.isFinite(from) && numeric < from) return false;
      }
      if (filter.to.trim()) {
        const to = parseEntityDecimal(filter.to);
        if (Number.isFinite(to) && numeric > to) return false;
      }
      return true;
    }

    return fieldSearchText(ctx, entity, record, field)
      .toLowerCase()
      .includes(filter.query.trim().toLowerCase());
  });
}

function FieldEmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Table2 className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Сначала добавьте поля</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          В настройках сущности «{title}» создайте поля — они станут колонками
          этой таблицы.
        </p>
      </div>
    </div>
  );
}

const filterControlClass = "h-8 w-full min-w-0 text-sm";
/** Match SelectTrigger `size="sm"` box model (native input UA styles otherwise add height). */
const filterSearchClass = cn(
  filterControlClass,
  "box-border py-0 leading-none md:text-sm",
);

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

function formatDateRangeFilterLabel(from: string, to: string) {
  const fromLabel = formatDateDisplay(from.trim());
  const toLabel = formatDateDisplay(to.trim());
  if (fromLabel && toLabel) return `${fromLabel} — ${toLabel}`;
  if (fromLabel) return `от ${fromLabel}`;
  if (toLabel) return `до ${toLabel}`;
  return "все";
}

/** Compact date range: same footprint as other filters, pickers in a popover. */
function DateRangeFilterControl({
  id,
  label,
  from,
  to,
  onChange,
}: {
  id: string;
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = formatDateRangeFilterLabel(from, to);
  const active = Boolean(from.trim() || to.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={`Фильтр: ${label}`}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              filterControlClass,
              "justify-between gap-1.5 px-2.5 font-normal shadow-xs",
            )}
          />
        }
      >
        <FilterValueLabel label={label} value={summary} />
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[16.5rem] gap-3 p-3"
        sideOffset={6}
      >
        <p className="text-xs font-medium text-foreground">{label}</p>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">От</span>
            <DatePicker
              id={`${id}-from`}
              value={from}
              placeholder="Не задано"
              aria-label={`${label}: от`}
              className="h-8"
              onChange={(next) => onChange(next, to)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">До</span>
            <DatePicker
              id={`${id}-to`}
              value={to}
              placeholder="Не задано"
              aria-label={`${label}: до`}
              className="h-8"
              onChange={(next) => onChange(from, next)}
            />
          </div>
        </div>
        {active ? (
          <button
            type="button"
            className="self-start text-xs font-medium text-primary transition-colors hover:text-primary/80"
            onClick={() => onChange("", "")}
          >
            Сбросить
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function EntityFilters({
  fields,
  entities = [],
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: {
  fields: EntityField[];
  entities?: Entity[];
  search: string;
  onSearchChange: (value: string) => void;
  filters: FiltersState;
  onFiltersChange: (next: FiltersState) => void;
}) {
  const hasActive =
    search.trim().length > 0 ||
    fields.some((field) => isFilterActive(filters[field.id]));

  function setFilter(fieldId: string, value: FieldFilter | null) {
    const next = { ...filters };
    if (value == null || !isFilterActive(value)) {
      delete next[fieldId];
    } else {
      next[fieldId] = value;
    }
    onFiltersChange(next);
  }

  function clearAll() {
    onSearchChange("");
    onFiltersChange({});
  }

  return (
    <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      <div className="relative col-span-2 h-8">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="entity-table-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск"
          aria-label="Поиск по всем полям"
          className={cn(filterSearchClass, "absolute inset-0 pl-8")}
        />
      </div>

      {fields.map((field) => {
        const label = getEntityFieldDisplayName(field);
        const fieldId = `entity-filter-${field.id}`;

        if (field.type === "boolean") {
          const current = filters[field.id];
          const value =
            current?.kind === "boolean" && current.value
              ? current.value
              : ALL_OPTION;
          const display =
            value === ALL_OPTION ? "все" : value === "true" ? "Да" : "Нет";
          return (
            <Select
              key={field.id}
              value={value}
              onValueChange={(next) => {
                if (next == null || next === ALL_OPTION) {
                  setFilter(field.id, null);
                  return;
                }
                setFilter(field.id, {
                  kind: "boolean",
                  value: String(next),
                });
              }}
            >
              <SelectTrigger
                id={fieldId}
                size="sm"
                className={filterControlClass}
                aria-label={`Фильтр: ${label}`}
              >
                <SelectValue>
                  <FilterValueLabel label={label} value={display} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Все</SelectItem>
                <SelectItem value="true">Да</SelectItem>
                <SelectItem value="false">Нет</SelectItem>
              </SelectContent>
            </Select>
          );
        }

        if (field.type === "list") {
          const current = filters[field.id];
          const optionId = current?.kind === "list" ? current.optionId : "";
          const listOptions = resolveEntityListFieldOptions(field, entities);
          const listPresentation = resolveEntityListFieldPresentation(
            field,
            entities,
          );
          const selected = getEntityListOption(listOptions, optionId);
          return (
            <Select
              key={field.id}
              value={optionId || ALL_OPTION}
              onValueChange={(next) => {
                if (next == null || next === ALL_OPTION) {
                  setFilter(field.id, null);
                  return;
                }
                setFilter(field.id, {
                  kind: "list",
                  optionId: String(next),
                });
              }}
            >
              <SelectTrigger
                id={fieldId}
                size="sm"
                className={filterControlClass}
                aria-label={`Фильтр: ${label}`}
              >
                <SelectValue>
                  <FilterValueLabel
                    label={label}
                    value={
                      selected ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          {listPresentation.listUseColors ? (
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: selected.color }}
                              aria-hidden
                            />
                          ) : null}
                          <span className="truncate">{selected.name}</span>
                        </span>
                      ) : (
                        "все"
                      )
                    }
                  />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Все</SelectItem>
                {listOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="inline-flex items-center gap-1.5">
                      {listPresentation.listUseColors ? (
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: option.color }}
                          aria-hidden
                        />
                      ) : null}
                      {option.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        if (isEntityRelationLikeFieldType(field.type)) {
          const targetId = getEntityRelationTargetId(field);
          const target = targetId
            ? (entities.find((item) => item.id === targetId) ?? null)
            : null;
          const recordOptions = getRelationRecordOptions(target);
          const current = filters[field.id];
          const optionId = current?.kind === "list" ? current.optionId : "";
          const selected = recordOptions.find((item) => item.id === optionId);
          return (
            <Select
              key={field.id}
              value={optionId || ALL_OPTION}
              onValueChange={(next) => {
                if (next == null || next === ALL_OPTION) {
                  setFilter(field.id, null);
                  return;
                }
                setFilter(field.id, {
                  kind: "list",
                  optionId: String(next),
                });
              }}
            >
              <SelectTrigger
                id={fieldId}
                size="sm"
                className={filterControlClass}
                aria-label={`Фильтр: ${label}`}
              >
                <SelectValue>
                  <FilterValueLabel
                    label={label}
                    value={selected?.label ?? "все"}
                  />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>Все</SelectItem>
                {recordOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        if (field.type === "datetime") {
          const current = filters[field.id];
          const from = current?.kind === "datetime" ? current.from : "";
          const to = current?.kind === "datetime" ? current.to : "";
          return (
            <DateRangeFilterControl
              key={field.id}
              id={fieldId}
              label={label}
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) => {
                setFilter(field.id, {
                  kind: "datetime",
                  from: nextFrom,
                  to: nextTo,
                });
              }}
            />
          );
        }

        if (isEntityNumericFieldType(field.type)) {
          const current = filters[field.id];
          const from = current?.kind === "number" ? current.from : "";
          const to = current?.kind === "number" ? current.to : "";
          return (
            <div
              key={field.id}
              className="col-span-2 flex min-w-0 items-center gap-1.5"
            >
              <span className="shrink-0 text-xs text-muted-foreground">
                {label}:
              </span>
              <Input
                id={`${fieldId}-from`}
                type="text"
                inputMode="decimal"
                value={from}
                placeholder="От"
                aria-label={`${label}: от`}
                className={cn(filterControlClass, "flex-1")}
                onChange={(event) => {
                  setFilter(field.id, {
                    kind: "number",
                    from: normalizeEntityDecimalInput(event.target.value),
                    to,
                  });
                }}
              />
              <span
                className="shrink-0 text-xs text-muted-foreground"
                aria-hidden
              >
                —
              </span>
              <Input
                id={`${fieldId}-to`}
                type="text"
                inputMode="decimal"
                value={to}
                placeholder="До"
                aria-label={`${label}: до`}
                className={cn(filterControlClass, "flex-1")}
                onChange={(event) => {
                  setFilter(field.id, {
                    kind: "number",
                    from,
                    to: normalizeEntityDecimalInput(event.target.value),
                  });
                }}
              />
            </div>
          );
        }

        const textFilter = filters[field.id];
        const query = textFilter?.kind === "text" ? textFilter.query : "";
        return (
          <Input
            key={field.id}
            id={fieldId}
            value={query}
            placeholder={label}
            aria-label={`Фильтр: ${label}`}
            className={filterControlClass}
            onChange={(event) => {
              setFilter(field.id, {
                kind: "text",
                query: event.target.value,
              });
            }}
          />
        );
      })}

      {hasActive ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-self-start px-2 text-muted-foreground"
          onClick={clearAll}
        >
          <X />
          Сбросить
        </Button>
      ) : null}
    </div>
  );
}

export function EntityTableView({
  entity,
  records,
  title,
  onEditRecord,
  onOpenRecord,
  onOpenRelation,
}: EntityTableViewProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const { requestListChange, dialog: listChangeDialog } = useRecordListChange();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FiltersState>({});
  const [sort, setSort] = useLocalStorageState(
    `entity-table-sort:${entity.id}`,
    parseEntityRecordSort,
    null,
  );
  const [pageSize, setPageSize] = useLocalStorageState(
    ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
    parseEntityTablePageSize,
    DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  );
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<EntityRecord | null>(null);
  const tableFields = getEntityTableFields(entity.fields, {
    preferArrayOrder: isEntityInternal(entity),
  });
  const filterFields = entity.fields.filter(
    (field) => field.showInFilters !== false && !isEntityNameField(field),
  );
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const sortKey = sort ? `${sort.fieldId}:${sort.direction}` : "";
  const paginationResetKey = `${entity.id}|${search}|${filtersKey}|${sortKey}|${pageSize}`;
  const [activePaginationKey, setActivePaginationKey] =
    useState(paginationResetKey);

  let effectivePage = page;
  if (activePaginationKey !== paginationResetKey) {
    setActivePaginationKey(paginationResetKey);
    setPage(1);
    effectivePage = 1;
  }

  const filteredRecords = useMemo(
    () =>
      sortEntityRecords(
        valueContext,
        entity,
        records.filter(
          (record) =>
            recordMatchesSearch(valueContext, entity, record, search) &&
            recordMatchesFilters(
              valueContext,
              entity,
              record,
              filterFields,
              filters,
            ),
        ),
        sort,
      ),
    [entity, filterFields, filters, records, search, sort, valueContext],
  );

  if (tableFields.length === 0) {
    return <FieldEmptyState title={title} />;
  }

  const total = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(effectivePage, totalPages);
  const pagedRecords = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const isFiltered =
    records.length !== entity.records.length ||
    search.trim().length > 0 ||
    filterFields.some((field) => isFilterActive(filters[field.id]));
  const emptyMessage = isFiltered
    ? "Нет записей по выбранным фильтрам"
    : "Пока нет записей";
  const emptyHint = isFiltered
    ? "Измените поиск или сбросьте фильтры"
    : "Создайте первую запись — она появится в таблице";

  const totalFields = tableFields.filter(
    (field) => isEntityNumericFieldType(field.type) && field.includeInTotal,
  );
  const showTotalsRow = totalFields.length > 0 && filteredRecords.length > 0;
  const columnTotals = showTotalsRow
    ? Object.fromEntries(
        totalFields.map((field) => [
          field.id,
          filteredRecords.reduce(
            (sum, record) =>
              sum +
              (getRecordFieldNumber(valueContext, entity, record, field) ?? 0),
            0,
          ),
        ]),
      )
    : {};

  const columnMinWidths = tableFields.map((field, index) => {
    const listLabels =
      field.type === "list"
        ? resolveEntityListFieldOptions(field, entities).map(
            (option) => option.name,
          )
        : undefined;
    return getEntityTableHeaderMinWidth(getEntityFieldDisplayName(field), {
      first: index === 0,
      numberLike: isEntityNumericFieldType(field.type),
      listLabels,
      sortable: true,
    });
  });
  const tableMinWidth =
    columnMinWidths.reduce((sum, width) => sum + width, 0) +
    ENTITY_TABLE_ACTIONS_WIDTH;
  const tableWidthStyle = {
    // max(100%, mins) — fill the card when space allows, else grow + scroll.
    width: `max(100%, ${tableMinWidth}px)`,
    minWidth: tableMinWidth,
  } as const;
  // Equal share of remaining width for data columns; actions stay fixed.
  // Absolute px widths used to stretch proportionally to header length
  // (short «Название» stayed narrow while «Описание» ate empty space).
  const contentColCount = Math.max(tableFields.length, 1);
  const contentColWidth = `calc((100% - ${ENTITY_TABLE_ACTIONS_WIDTH}px) / ${contentColCount})`;
  const isEmpty = pagedRecords.length === 0;

  const tableHeader = (
    <>
      <colgroup>
        {tableFields.map((field, index) => (
          <col
            key={field.id}
            style={{
              width: contentColWidth,
              minWidth: columnMinWidths[index],
            }}
          />
        ))}
        <col
          style={{
            width: ENTITY_TABLE_ACTIONS_WIDTH,
            minWidth: ENTITY_TABLE_ACTIONS_WIDTH,
          }}
        />
      </colgroup>
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          {tableFields.map((field, index) => {
            const direction =
              sort?.fieldId === field.id ? sort.direction : null;
            return (
              <TableHead
                key={field.id}
                title={getEntityFieldTypeLabel(field.type)}
                aria-sort={
                  direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : undefined
                }
                className={cn(
                  dataTableHeadClass,
                  index === 0 && "pl-3.5",
                  isEmpty && "border-b-0",
                )}
                style={{
                  width: contentColWidth,
                  minWidth: columnMinWidths[index],
                }}
              >
                <button
                  type="button"
                  className={cn(
                    "group/sort inline-flex items-center gap-1 whitespace-nowrap uppercase transition-colors hover:text-foreground",
                    direction && "text-foreground",
                  )}
                  onClick={() =>
                    setSort(getNextEntityRecordSort(sort, field.id))
                  }
                >
                  <span className="whitespace-nowrap">
                    {getEntityFieldDisplayName(field)}
                  </span>
                  <SortIcon direction={direction} />
                </button>
              </TableHead>
            );
          })}
          <TableHead
            className={cn(dataTableActionsHeadClass, isEmpty && "border-b-0")}
          >
            Действия
          </TableHead>
        </TableRow>
      </TableHeader>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <EntityFilters
          fields={filterFields}
          entities={entities}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {isEmpty ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
            <Table
              className="table-fixed text-[13px]"
              containerClassName="overflow-visible"
              style={tableWidthStyle}
            >
              {tableHeader}
            </Table>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-6 py-8 text-center">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Table2 className="size-4" aria-hidden />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{emptyMessage}</p>
                <p className="text-xs text-muted-foreground">{emptyHint}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <Table
                className={cn(
                  "table-fixed text-[13px]",
                  showTotalsRow && "h-full min-h-full",
                )}
                containerClassName="h-full min-h-full overflow-visible"
                style={tableWidthStyle}
              >
                {tableHeader}
                <TableBody className="[&_tr:last-child]:border-b">
                  {pagedRecords.map((record) => (
                    <TableRow
                      key={record.id}
                      className={cn(
                        "border-border/70",
                        onOpenRecord && "cursor-pointer hover:bg-muted/35",
                      )}
                      onClick={
                        onOpenRecord ? () => onOpenRecord(record) : undefined
                      }
                    >
                      {tableFields.map((field, index) => {
                        const raw = record.values[field.id];
                        const cellTitle = formatRecordFieldValue(
                          valueContext,
                          entity,
                          record,
                          field,
                        );
                        const contactHref =
                          field.type === "phone" || field.type === "email"
                            ? getEntityContactHref(field.type, raw)
                            : field.type === "url"
                              ? getEntityUrlHref(raw)
                              : null;
                        const fileValue =
                          field.type === "file"
                            ? parseEntityFieldFileValue(raw)
                            : null;
                        const fileSummary =
                          field.type === "file"
                            ? formatEntityFieldFilesSummary(raw)
                            : null;
                        const relationTargetId = isEntityRelationLikeFieldType(
                          field.type,
                        )
                          ? getEntityRelationTargetId(field)
                          : null;
                        const relationIds = isEntityRelationLikeFieldType(
                          field.type,
                        )
                          ? parseEntityRelationIds(raw)
                          : [];
                        const canOpenRelation =
                          isEntityRelationLikeFieldType(field.type) &&
                          Boolean(relationTargetId) &&
                          relationIds.length > 0 &&
                          cellTitle !== "—" &&
                          onOpenRelation != null;
                        const relationTarget =
                          relationTargetId != null
                            ? (entities.find(
                                (item) => item.id === relationTargetId,
                              ) ?? null)
                            : null;
                        const listPresentation =
                          field.type === "list"
                            ? resolveEntityListFieldPresentation(
                                field,
                                entities,
                              )
                            : null;

                        return (
                          <TableCell
                            key={field.id}
                            className={cn(
                              "min-w-0 overflow-hidden px-3 py-2 text-foreground/90",
                              index === 0 &&
                                "pl-3.5 font-medium text-foreground",
                            )}
                            title={
                              field.type === "list" ||
                              isEntityRelationLikeFieldType(field.type) ||
                              field.type === "file" ||
                              (field.type === "boolean" &&
                                field.booleanInline) ||
                              contactHref
                                ? undefined
                                : cellTitle
                            }
                          >
                            {field.type === "boolean" && field.booleanInline ? (
                              <div
                                className="flex items-center"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              >
                                <Switch
                                  checked={raw === "true"}
                                  aria-label={getEntityFieldDisplayName(field)}
                                  onCheckedChange={(checked) => {
                                    const values = applyEntityFieldValue(
                                      entity,
                                      record.values,
                                      field.id,
                                      checked ? "true" : "false",
                                      entities,
                                    );
                                    updateEntityRecord(
                                      entity.id,
                                      record.id,
                                      values,
                                    );
                                  }}
                                />
                              </div>
                            ) : field.type === "list" &&
                              listPresentation &&
                              !listPresentation.listFixed ? (
                              <div
                                className="w-full min-w-0"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              >
                                {(() => {
                                  const parentField = getEntityListParentField(
                                    entity,
                                    field,
                                  );
                                  const parentValue = parentField
                                    ? record.values[parentField.id]
                                    : undefined;
                                  const visibleOptions = getVisibleListOptions(
                                    field,
                                    parentValue,
                                    parentField,
                                    entities,
                                  );
                                  const listDisabled =
                                    parentField != null &&
                                    parseEntityListValueIds(parentValue)
                                      .length === 0;
                                  return (
                                    <ListSelect
                                      size="sm"
                                      variant="plain"
                                      options={visibleOptions}
                                      value={raw ?? ""}
                                      allowEmpty={!field.required}
                                      allowOther={
                                        field.listAllowOther &&
                                        !listPresentation.listMultiple
                                      }
                                      multiple={listPresentation.listMultiple}
                                      showColors={
                                        listPresentation.listUseColors
                                      }
                                      disabled={listDisabled}
                                      aria-label={field.name.trim() || "Список"}
                                      onChange={(next) => {
                                        void requestListChange(
                                          entity,
                                          record,
                                          field,
                                          next,
                                        );
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                            ) : field.type === "list" && listPresentation ? (
                              <ListValueDisplay
                                options={(() => {
                                  const parentField = getEntityListParentField(
                                    entity,
                                    field,
                                  );
                                  return getVisibleListOptions(
                                    field,
                                    parentField
                                      ? record.values[parentField.id]
                                      : undefined,
                                    parentField,
                                    entities,
                                  );
                                })()}
                                value={raw}
                                multiple={listPresentation.listMultiple}
                                showColors={listPresentation.listUseColors}
                              />
                            ) : isEntityRelationLikeFieldType(field.type) &&
                              relationIds.length > 0 ? (
                              (() => {
                                const primaryId = relationIds[0]!;
                                const primaryLabel =
                                  resolveRelationRecordLabel(
                                    relationTarget,
                                    primaryId,
                                  ) ?? "Без названия";
                                const extraCount = relationIds.length - 1;
                                const fullTitle =
                                  cellTitle === "—" ? undefined : cellTitle;
                                return (
                                  <div
                                    className="flex min-w-0 items-center gap-1.5"
                                    title={fullTitle}
                                    onClick={(event) => event.stopPropagation()}
                                    onPointerDown={(event) =>
                                      event.stopPropagation()
                                    }
                                  >
                                    {canOpenRelation ? (
                                      <button
                                        type="button"
                                        className="min-w-0 truncate text-left font-medium text-primary underline-offset-2 hover:underline"
                                        onClick={() =>
                                          onOpenRelation(
                                            relationTargetId!,
                                            primaryId,
                                          )
                                        }
                                      >
                                        {primaryLabel}
                                      </button>
                                    ) : (
                                      <span className="min-w-0 truncate">
                                        {primaryLabel}
                                      </span>
                                    )}
                                    {extraCount > 0 ? (
                                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] leading-none font-semibold text-muted-foreground tabular-nums">
                                        +{extraCount}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })()
                            ) : contactHref ? (
                              <a
                                href={contactHref}
                                className="block cursor-default truncate font-medium text-primary underline-offset-2 hover:underline"
                                title={cellTitle}
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                                {...(field.type === "url"
                                  ? {
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                    }
                                  : {})}
                              >
                                {cellTitle}
                              </a>
                            ) : isRecordValueDecorated(field) ? (
                              <RecordValue
                                ctx={valueContext}
                                entity={entity}
                                record={record}
                                field={field}
                                className="text-[13px]"
                              />
                            ) : fileValue &&
                              fileSummary &&
                              fileSummary !== "—" ? (
                              <button
                                type="button"
                                className="block w-full truncate text-left font-medium text-primary underline-offset-2 hover:underline"
                                title={fileSummary}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void (async () => {
                                    if (fileValue.dataUrl) {
                                      window.open(
                                        fileValue.dataUrl,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                      return;
                                    }
                                    if (!fileValue.storagePath) return;
                                    const url = await getEntityFileDownloadUrl(
                                      fileValue.storagePath,
                                    );
                                    window.open(
                                      url,
                                      "_blank",
                                      "noopener,noreferrer",
                                    );
                                  })();
                                }}
                              >
                                {fileSummary}
                              </button>
                            ) : (
                              <span className="block truncate">
                                {cellTitle}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="w-24 min-w-24 max-w-24 px-2 py-1.5 text-right">
                        <div
                          className="inline-flex items-center justify-end gap-0"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {onEditRecord ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 text-foreground"
                              aria-label="Редактировать запись"
                              onClick={() => onEditRecord(record)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-7 text-foreground hover:text-destructive"
                            aria-label="Удалить запись"
                            onClick={() => setPendingDelete(record)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {showTotalsRow ? (
                    <TableRow
                      aria-hidden
                      className="border-0 hover:bg-transparent"
                      style={{ height: "100%" }}
                    >
                      <TableCell
                        colSpan={tableFields.length + 1}
                        className="border-0 p-0"
                      />
                    </TableRow>
                  ) : null}
                </TableBody>
                {showTotalsRow ? (
                  <TableFooter className={dataTableFooterClass}>
                    <TableRow className="h-9 hover:bg-transparent">
                      {tableFields.map((field, index) => {
                        const isTotalColumn =
                          isEntityNumericFieldType(field.type) &&
                          field.includeInTotal;
                        const totalValue = isTotalColumn
                          ? formatEntityDecimalTotal(
                              columnTotals[field.id] ?? 0,
                            )
                          : null;

                        return (
                          <TableCell
                            key={field.id}
                            className={cn(
                              dataTableFootClass,
                              index === 0 &&
                                "pl-3.5 font-medium text-foreground",
                            )}
                          >
                            {index === 0 ? (
                              isTotalColumn ? (
                                <span className="flex h-full min-w-0 items-center gap-1.5">
                                  <span className="shrink-0 text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
                                    Итог
                                  </span>
                                  <span className="block min-w-0 truncate font-normal">
                                    {totalValue}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
                                  Итог
                                </span>
                              )
                            ) : isTotalColumn ? (
                              <span className="block truncate">
                                {totalValue}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className={dataTableActionsFootClass} />
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>

            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      <RecordDeleteConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        entityId={entity.id}
        recordId={pendingDelete?.id ?? null}
        title="Удалить запись?"
        description={
          pendingDelete
            ? `Вы уверены, что хотите удалить ${getRecordTitle(valueContext, entity, pendingDelete)}? Это действие нельзя отменить.`
            : "Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить."
        }
        confirmLabel="Удалить"
        onConfirm={() => {
          if (!pendingDelete) return;
          removeEntityRecord(entity.id, pendingDelete.id);
        }}
      />

      {listChangeDialog}
    </div>
  );
}

export function AddRecordButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" className="shrink-0" onClick={onClick}>
      <Plus />
      Добавить
    </Button>
  );
}
