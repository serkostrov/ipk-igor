import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { Search, X } from "lucide-react";
import {
  canField,
  canTab,
  readVisibleEntityRecords,
  useCurrentRole,
  type Role,
} from "@/entities/access";
import { Button } from "@/shared/ui/button";
import {
  DateRangeFilterControl,
  FilterValueLabel,
  filterControlClass,
} from "@/shared/ui/filter-controls";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  formatEntityFieldFilesSummary,
  formatEntityPeriodDisplay,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityFieldTabId,
  getEntityListOption,
  getEntityRelationTargetId,
  getRecordFieldIds,
  getRecordFieldNumber,
  getRelationRecordOptions,
  isEntityFieldManualInputEnabled,
  isEntityNameField,
  isRoleConfigurableTab,
  isEntityNumericFieldType,
  normalizeEntityDecimalInput,
  parseEntityDecimal,
  parseEntityPeriod,
  resolveEntityComputedManualEditField,
  resolveEntityFieldSource,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  resolveEntityLookupTarget,
  resolveRecordFieldCells,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";

/** Fields the role must not see in tables, search, or filters. */
// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function roleHiddenFieldIds(
  role: Role | null | undefined,
  entity: Entity,
): Set<string> {
  const hidden = new Set<string>();
  for (const field of entity.fields) {
    const tabId = getEntityFieldTabId(field);
    const tab = entity.tabs.find((item) => item.id === tabId);
    if (
      !canField(role, entity.id, field.id, "view") ||
      (tab &&
        isRoleConfigurableTab(tab) &&
        !canTab(role, entity.id, tab.id, "view"))
    ) {
      hidden.add(field.id);
    }
  }
  return hidden;
}

/** Fields shown in the browse filter bar (`showInFilters`, excluding name). */
// eslint-disable-next-line react-refresh/only-export-components -- shared browse helpers
export function getEntityBrowseFilterFields(
  entity: Entity,
  role?: Role | null,
): EntityField[] {
  const hidden = role ? roleHiddenFieldIds(role, entity) : null;
  return entity.fields.filter(
    (field) =>
      field.showInFilters !== false &&
      !isEntityNameField(field) &&
      !hidden?.has(field.id),
  );
}

/**
 * Field that drives the filter control (lookups inherit the target field type).
 * Manual-input lookups reuse the same stand-in as the form editor.
 */
function resolveBrowseFilterSource(
  entity: Entity,
  field: EntityField,
  entities: Entity[],
): { entity: Entity; field: EntityField } | null {
  if (field.type !== "lookup") return { entity, field };

  if (isEntityFieldManualInputEnabled(field)) {
    const editField = resolveEntityComputedManualEditField(
      entity,
      field,
      entities,
    );
    if (editField) {
      const target = resolveEntityLookupTarget(entity, field, entities);
      return { entity: target?.entity ?? entity, field: editField };
    }
  }

  return resolveEntityFieldSource(entity, field, entities);
}

/**
 * Stored / looked-up raw strings used by range and boolean filters.
 * When auto lookup cells are empty, falls back to a manual override on the host.
 */
function getBrowseFilterRawValues(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): string[] {
  if (field.type !== "lookup") return [record.values[field.id] ?? ""];

  const fromCells = resolveRecordFieldCells(ctx, entity, record, field)
    .map((cell) => cell.record.values[cell.field.id] ?? "")
    .filter((raw) => raw.trim().length > 0);
  if (fromCells.length > 0) return fromCells;

  if (!isEntityFieldManualInputEnabled(field)) return [];
  const editField = resolveEntityComputedManualEditField(
    entity,
    field,
    ctx.entities ?? [],
  );
  if (!editField) return [];
  const stored = (record.values[field.id] ?? "").trim();
  return stored ? [stored] : [];
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
  hiddenFieldIds?: ReadonlySet<string>,
) {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return entity.fields.some((field) => {
    if (hiddenFieldIds?.has(field.id)) return false;
    return fieldSearchText(ctx, entity, record, field)
      .toLowerCase()
      .includes(query);
  });
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

    if (filter.kind === "boolean") {
      return getBrowseFilterRawValues(ctx, entity, record, field).some(
        (raw) => raw === filter.value,
      );
    }

    if (filter.kind === "list") {
      // Covers list / relation / belonging and lookups of those kinds.
      return getRecordFieldIds(ctx, entity, record, field).includes(
        filter.optionId,
      );
    }

    if (filter.kind === "datetime") {
      return getBrowseFilterRawValues(ctx, entity, record, field).some(
        (raw) => {
          const date = extractDatePart(raw);
          if (!date) return false;
          if (filter.from && date < filter.from) return false;
          if (filter.to && date > filter.to) return false;
          return true;
        },
      );
    }

    if (filter.kind === "period") {
      return getBrowseFilterRawValues(ctx, entity, record, field).some(
        (raw) => {
          const period = parseEntityPeriod(raw);
          if (!period) return false;
          // Overlap: period intersects the filter window.
          if (filter.from && period.end < filter.from) return false;
          if (filter.to && period.start > filter.to) return false;
          return true;
        },
      );
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

/** Match SelectTrigger `size="sm"` box model (native input UA styles otherwise add height). */
const filterSearchClass = cn(
  filterControlClass,
  "box-border py-0 leading-none md:text-sm",
);

export function EntityBrowseFilters({
  entity,
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
  /** Host entity — needed to resolve lookup filter controls. */
  entity: Entity;
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
  const role = useCurrentRole();
  const visibleRelationIds = useAsyncValue(async () => {
    const ids = new Set<string>();
    if (!role) return ids;
    const seen = new Set<string>();
    for (const field of fields) {
      const source = resolveBrowseFilterSource(entity, field, entities);
      if (!source) continue;
      if (
        source.field.type !== "relation" &&
        source.field.type !== "belonging"
      ) {
        continue;
      }
      const targetId =
        source.field.type === "belonging"
          ? source.entity.id
          : getEntityRelationTargetId(source.field);
      const target = targetId
        ? (entities.find((item) => item.id === targetId) ?? null)
        : null;
      if (!target || seen.has(target.id)) continue;
      seen.add(target.id);
      const visible = await readVisibleEntityRecords(target);
      for (const record of visible) ids.add(record.id);
    }
    return ids;
  }, [entities, entity, fields, role]);
  const allowedRelationIds =
    visibleRelationIds.status === "ready" ? visibleRelationIds.value : null;

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
        // Lookups reuse the target field's control (list / relation / …).
        const browseSource = resolveBrowseFilterSource(entity, field, entities);
        const browseField = browseSource?.field ?? null;

        if (browseField?.type === "boolean") {
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

        if (browseField?.type === "list") {
          const current = filters[field.id];
          const optionId = current?.kind === "list" ? current.optionId : "";
          const listOptions = resolveEntityListFieldOptions(
            browseField,
            entities,
          );
          const listPresentation = resolveEntityListFieldPresentation(
            browseField,
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

        if (
          browseSource &&
          (browseSource.field.type === "relation" ||
            browseSource.field.type === "belonging")
        ) {
          const relationField = browseSource.field;
          const targetId =
            relationField.type === "belonging"
              ? browseSource.entity.id
              : getEntityRelationTargetId(relationField);
          const target = targetId
            ? (entities.find((item) => item.id === targetId) ?? null)
            : null;
          const recordOptions = getRelationRecordOptions(
            target && allowedRelationIds
              ? {
                  ...target,
                  records: target.records.filter((record) =>
                    allowedRelationIds.has(record.id),
                  ),
                }
              : null,
          );
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

        if (browseField?.type === "datetime") {
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

        if (browseField?.type === "period") {
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

        if (browseField && isEntityNumericFieldType(browseField.type)) {
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
