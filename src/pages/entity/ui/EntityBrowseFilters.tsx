import { useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  entityListValueIncludesId,
  entityRelationIncludesId,
  formatEntityFieldFilesSummary,
  formatEntityPeriodDisplay,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityListOption,
  getEntityRelationTargetId,
  getRecordFieldNumber,
  getRelationRecordOptions,
  isEntityNameField,
  isEntityNumericFieldType,
  normalizeEntityDecimalInput,
  parseEntityDecimal,
  parseEntityPeriod,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  formatDateDisplay,
  formatDatetimeDisplay,
} from "@/shared/lib/format-date";

/** Fields shown in the browse filter bar (`showInFilters`, excluding name). */
// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function getEntityBrowseFilterFields(entity: Entity): EntityField[] {
  return entity.fields.filter(
    (field) => field.showInFilters !== false && !isEntityNameField(field),
  );
}

export const ENTITY_FILTER_ALL_OPTION = "__all__";

export type EntityFieldFilter =
  | { kind: "text"; query: string }
  | { kind: "boolean"; value: string }
  | { kind: "list"; optionId: string }
  | { kind: "number"; from: string; to: string }
  | { kind: "datetime"; from: string; to: string }
  | { kind: "period"; from: string; to: string };

export type EntityFiltersState = Record<string, EntityFieldFilter>;

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
  if (field.type === "period") {
    const display = formatEntityPeriodDisplay(raw);
    return display === "—" ? "" : display;
  }
  const display = formatRecordFieldValue(ctx, entity, record, field);
  return display === "—" ? "" : display;
}

// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function recordMatchesSearch(
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

// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function isEntityFilterActive(filter: EntityFieldFilter | undefined) {
  if (!filter) return false;
  if (filter.kind === "text") return filter.query.trim().length > 0;
  if (filter.kind === "boolean") return filter.value.length > 0;
  if (filter.kind === "list") return filter.optionId.length > 0;
  return filter.from.trim().length > 0 || filter.to.trim().length > 0;
}

// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function recordMatchesFilters(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  fields: EntityField[],
  filters: EntityFiltersState,
) {
  return fields.every((field) => {
    const filter = filters[field.id];
    if (!filter || !isEntityFilterActive(filter)) return true;

    const raw = record.values[field.id] ?? "";

    if (filter.kind === "boolean") {
      return raw === filter.value;
    }

    if (filter.kind === "list") {
      if (field.type === "relation") {
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

    if (filter.kind === "period") {
      const period = parseEntityPeriod(raw);
      if (!period) return false;
      // Overlap: period intersects the filter window.
      if (filter.from && period.end < filter.from) return false;
      if (filter.to && period.start > filter.to) return false;
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

export function EntityBrowseFilters({
  fields,
  entities = [],
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  compact = false,
  layout = "bar",
  searchId = "entity-browse-search",
}: {
  fields: EntityField[];
  entities?: Entity[];
  search: string;
  onSearchChange: (value: string) => void;
  filters: EntityFiltersState;
  onFiltersChange: (next: EntityFiltersState) => void;
  /** Dense layout for narrow dialogs. */
  compact?: boolean;
  /** `sidebar` — vertical stack for a filters panel. */
  layout?: "bar" | "sidebar";
  searchId?: string;
}) {
  const isSidebar = layout === "sidebar";
  const hasActive =
    search.trim().length > 0 ||
    fields.some((field) => isEntityFilterActive(filters[field.id]));

  function setFilter(fieldId: string, value: EntityFieldFilter | null) {
    const next = { ...filters };
    if (value == null || !isEntityFilterActive(value)) {
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
    <div
      className={cn(
        "grid items-center gap-2",
        isSidebar
          ? "grid-cols-1"
          : compact
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
      )}
    >
      <div
        className={cn(
          "relative h-8",
          isSidebar || compact ? "col-span-full" : "col-span-2",
        )}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={searchId}
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
              : ENTITY_FILTER_ALL_OPTION;
          const display =
            value === ENTITY_FILTER_ALL_OPTION
              ? "все"
              : value === "true"
                ? "Да"
                : "Нет";
          return (
            <Select
              key={field.id}
              value={value}
              onValueChange={(next) => {
                if (next == null || next === ENTITY_FILTER_ALL_OPTION) {
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
                <SelectItem value={ENTITY_FILTER_ALL_OPTION}>Все</SelectItem>
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
              value={optionId || ENTITY_FILTER_ALL_OPTION}
              onValueChange={(next) => {
                if (next == null || next === ENTITY_FILTER_ALL_OPTION) {
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
                <SelectItem value={ENTITY_FILTER_ALL_OPTION}>Все</SelectItem>
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

        if (field.type === "relation") {
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
              value={optionId || ENTITY_FILTER_ALL_OPTION}
              onValueChange={(next) => {
                if (next == null || next === ENTITY_FILTER_ALL_OPTION) {
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
                <SelectItem value={ENTITY_FILTER_ALL_OPTION}>Все</SelectItem>
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

        if (field.type === "period") {
          const current = filters[field.id];
          const from = current?.kind === "period" ? current.from : "";
          const to = current?.kind === "period" ? current.to : "";
          return (
            <DateRangeFilterControl
              key={field.id}
              id={fieldId}
              label={label}
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) => {
                setFilter(field.id, {
                  kind: "period",
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
