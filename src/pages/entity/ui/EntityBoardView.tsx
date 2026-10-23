import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  buildEntityAggregateRows,
  buildEntityCashFlowRows,
  formatEntityDecimalTotal,
  getEntityFieldDisplayName,
  getEntityPagePanel,
  hasEntityPageLayout,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityAggregateRow,
  type EntityCashFlowPeriod,
  type EntityPageAggregatePanel,
  type EntityPageFiltersPanel,
  type EntityPagePanel,
  type EntityRecord,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  isEntityFilterActive,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "./EntityBrowseFilters";
import { EntityTableView } from "./EntityTableView";

function cashFlowPeriodFromFilters(
  filters: EntityFiltersState,
  dateFieldId: string,
): EntityCashFlowPeriod {
  const filter = filters[dateFieldId];
  if (filter?.kind !== "datetime") return { from: "", to: "" };
  return { from: filter.from.trim(), to: filter.to.trim() };
}

function filtersWithoutField(
  filters: EntityFiltersState,
  fieldId: string,
): EntityFiltersState {
  if (!(fieldId in filters)) return filters;
  const next = { ...filters };
  delete next[fieldId];
  return next;
}

function formatCashFlowExpense(value: number) {
  return formatEntityDecimalTotal(-Math.abs(value));
}

type EntityBoardViewProps = {
  entity: Entity;
  records: EntityRecord[];
  title: string;
  chromeCollapsed?: boolean;
  onChromeCollapsedChange?: (collapsed: boolean) => void;
  onEditRecord?: (record: EntityRecord) => void;
  onOpenRecord?: (record: EntityRecord) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
  onCreateChildRecord?: (groupValue: string) => void;
};

function PanelChrome({
  title,
  children,
  className,
}: {
  title: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-xs",
        className,
      )}
    >
      {title ? (
        <h2 className="shrink-0 px-0.5 text-sm font-medium tracking-tight text-foreground">
          {title}
        </h2>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </section>
  );
}

function AggregatePanelView({
  entity,
  panel,
  rows,
  activeKey,
  onSelectRow,
}: {
  entity: Entity;
  panel: EntityPageAggregatePanel;
  rows: EntityAggregateRow[];
  activeKey: string | null;
  onSelectRow: (row: EntityAggregateRow) => void;
}) {
  const groupFields = panel.groupFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is NonNullable<typeof field> => field != null);
  const valueFields = panel.valueFieldIds
    .map((id) => entity.fields.find((field) => field.id === id) ?? null)
    .filter((field): field is NonNullable<typeof field> => field != null);
  const showCashFlow = Boolean(panel.cashFlow);

  if (groupFields.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        В настройках макета выберите, по каким полям строить сводку
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        Нет данных по текущим фильтрам
      </p>
    );
  }

  const footer = showCashFlow
    ? rows.reduce(
        (acc, row) => {
          const cf = row.cashFlow;
          if (!cf) return acc;
          return {
            opening:
              cf.opening == null
                ? acc.opening
                : (acc.opening ?? 0) + cf.opening,
            income: acc.income + cf.income,
            expense: acc.expense + cf.expense,
            closing: acc.closing + cf.closing,
            hasOpening: acc.hasOpening || cf.opening != null,
          };
        },
        {
          opening: null as number | null,
          income: 0,
          expense: 0,
          closing: 0,
          hasOpening: false,
        },
      )
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {groupFields.map((field) => (
              <TableHead key={field.id} className="whitespace-nowrap">
                {getEntityFieldDisplayName(field)}
              </TableHead>
            ))}
            {showCashFlow ? (
              <>
                <TableHead className="whitespace-nowrap text-right">
                  Остаток на начало периода
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Сумма прихода
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Сумма расхода
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Остаток на конец периода
                </TableHead>
              </>
            ) : null}
            {panel.showRecordCount ? (
              <TableHead className="whitespace-nowrap text-right">
                Кол-во
              </TableHead>
            ) : null}
            {valueFields.map((field) => (
              <TableHead
                key={field.id}
                className="whitespace-nowrap text-right"
              >
                {getEntityFieldDisplayName(field)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const active = activeKey === row.key;
            const cf = row.cashFlow;
            return (
              <TableRow
                key={row.key}
                className={cn(
                  "cursor-pointer",
                  active && "bg-muted/70 hover:bg-muted/70",
                )}
                onClick={() => onSelectRow(row)}
              >
                {row.groups.map((group) => (
                  <TableCell key={group.fieldId} className="whitespace-nowrap">
                    {group.label}
                  </TableCell>
                ))}
                {showCashFlow ? (
                  <>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {cf?.opening == null
                        ? "—"
                        : formatEntityDecimalTotal(cf.opening)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#16a34a]">
                      {formatEntityDecimalTotal(cf?.income ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#dc2626]">
                      {formatCashFlowExpense(cf?.expense ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatEntityDecimalTotal(cf?.closing ?? 0)}
                    </TableCell>
                  </>
                ) : null}
                {panel.showRecordCount ? (
                  <TableCell className="text-right tabular-nums">
                    {row.count}
                  </TableCell>
                ) : null}
                {valueFields.map((field) => (
                  <TableCell key={field.id} className="text-right tabular-nums">
                    {formatEntityDecimalTotal(row.totals[field.id] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        {footer ? (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={groupFields.length}
                className="font-medium text-foreground"
              >
                Итого
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-foreground">
                {footer.hasOpening
                  ? formatEntityDecimalTotal(footer.opening ?? 0)
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-[#16a34a]">
                {formatEntityDecimalTotal(footer.income)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-[#dc2626]">
                {formatCashFlowExpense(footer.expense)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-foreground">
                {formatEntityDecimalTotal(footer.closing)}
              </TableCell>
              {panel.showRecordCount ? (
                <TableCell className="text-right font-medium tabular-nums">
                  {rows.reduce((sum, row) => sum + row.count, 0)}
                </TableCell>
              ) : null}
              {valueFields.map((field) => (
                <TableCell
                  key={field.id}
                  className="text-right font-medium tabular-nums"
                >
                  {formatEntityDecimalTotal(
                    rows.reduce(
                      (sum, row) => sum + (row.totals[field.id] ?? 0),
                      0,
                    ),
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}

function FiltersPanelView({
  entity,
  panel,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: {
  entity: Entity;
  panel: EntityPageFiltersPanel;
  search: string;
  onSearchChange: (value: string) => void;
  filters: EntityFiltersState;
  onFiltersChange: (next: EntityFiltersState) => void;
}) {
  const { entities } = useEntityConfig();
  const allFilterFields = getEntityBrowseFilterFields(entity);
  const fields =
    panel.fieldIds == null
      ? allFilterFields
      : panel.fieldIds
          .map((id) => allFilterFields.find((field) => field.id === id) ?? null)
          .filter((field): field is NonNullable<typeof field> => field != null);

  return (
    <EntityBrowseFilters
      fields={fields}
      entities={entities}
      search={search}
      onSearchChange={onSearchChange}
      filters={filters}
      onFiltersChange={onFiltersChange}
      layout={panel.placement === "sidebar" ? "sidebar" : "bar"}
      compact={panel.placement === "sidebar"}
      searchId={`entity-board-filters-${panel.id}`}
    />
  );
}

function applyDrillFilters(
  filters: EntityFiltersState,
  row: EntityAggregateRow | null,
): EntityFiltersState {
  if (!row) return filters;
  const next = { ...filters };
  for (const group of row.groups) {
    next[group.fieldId] = { kind: "list", optionId: group.valueId };
  }
  return next;
}

function BoardPanel({
  entity,
  panel,
  title,
  filteredRecords,
  aggregateRows,
  drillKey,
  onDrill,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  onEditRecord,
  onOpenRecord,
  onOpenRelation,
  onCreateChildRecord,
}: {
  entity: Entity;
  panel: EntityPagePanel;
  title: string;
  filteredRecords: EntityRecord[];
  aggregateRows: EntityAggregateRow[];
  drillKey: string | null;
  onDrill: (row: EntityAggregateRow) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filters: EntityFiltersState;
  onFiltersChange: (next: EntityFiltersState) => void;
  onEditRecord?: (record: EntityRecord) => void;
  onOpenRecord?: (record: EntityRecord) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
  onCreateChildRecord?: (groupValue: string) => void;
}) {
  if (panel.type === "records") {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {panel.title ? (
          <h2 className="mb-2 shrink-0 px-0.5 text-sm font-medium tracking-tight">
            {panel.title}
          </h2>
        ) : null}
        <EntityTableView
          entity={entity}
          records={filteredRecords}
          title={title}
          hideFilters
          onEditRecord={onEditRecord}
          onOpenRecord={onOpenRecord}
          onOpenRelation={onOpenRelation}
          onCreateChildRecord={onCreateChildRecord}
        />
      </div>
    );
  }

  if (panel.type === "aggregate") {
    return (
      <PanelChrome title={null} className="max-h-[min(20rem,40vh)] gap-0 p-0">
        <AggregatePanelView
          entity={entity}
          panel={panel}
          rows={aggregateRows}
          activeKey={drillKey}
          onSelectRow={onDrill}
        />
      </PanelChrome>
    );
  }

  return (
    <PanelChrome
      title={panel.title ?? "Фильтры"}
      className="max-h-[min(20rem,40vh)]"
    >
      <FiltersPanelView
        entity={entity}
        panel={panel}
        search={search}
        onSearchChange={onSearchChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </PanelChrome>
  );
}

export function EntityBoardView({
  entity,
  records,
  title,
  chromeCollapsed = false,
  onChromeCollapsedChange,
  onEditRecord,
  onOpenRecord,
  onOpenRelation,
  onCreateChildRecord,
}: EntityBoardViewProps) {
  const layout = entity.pageLayout;
  const valueContext = useEntityValueContext();
  const { entities } = useEntityConfig();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EntityFiltersState>({});
  const [drillRow, setDrillRow] = useState<EntityAggregateRow | null>(null);

  const filterFields = useMemo(
    () => getEntityBrowseFilterFields(entity),
    [entity],
  );

  const hasFiltersPanel = Boolean(
    layout?.panels.some((panel) => panel.type === "filters"),
  );

  const activeFilterCount = useMemo(() => {
    let count = filterFields.filter((field) =>
      isEntityFilterActive(filters[field.id]),
    ).length;
    if (search.trim()) count += 1;
    if (drillRow) count += 1;
    return count;
  }, [drillRow, filterFields, filters, search]);

  /** Shared search + filters (drill-down does not shrink the aggregate). */
  const scopedRecords = useMemo(
    () =>
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
    [entity, filterFields, filters, records, search, valueContext],
  );

  const registryRecords = useMemo(() => {
    if (!drillRow) return scopedRecords;
    const drilled = applyDrillFilters(filters, drillRow);
    return scopedRecords.filter((record) =>
      recordMatchesFilters(valueContext, entity, record, filterFields, drilled),
    );
  }, [drillRow, entity, filterFields, filters, scopedRecords, valueContext]);

  const aggregatePanels = useMemo(
    () =>
      layout?.panels.filter(
        (panel): panel is EntityPageAggregatePanel =>
          panel.type === "aggregate",
      ) ?? [],
    [layout],
  );

  const aggregateByPanelId = useMemo(() => {
    const map = new Map<string, EntityAggregateRow[]>();
    for (const panel of aggregatePanels) {
      if (panel.cashFlow) {
        const dateFieldId = panel.cashFlow.dateFieldId;
        const historyFilters = filtersWithoutField(filters, dateFieldId);
        const historyRecords = records.filter(
          (record) =>
            recordMatchesSearch(valueContext, entity, record, search) &&
            recordMatchesFilters(
              valueContext,
              entity,
              record,
              filterFields,
              historyFilters,
            ),
        );
        map.set(
          panel.id,
          buildEntityCashFlowRows(
            valueContext,
            entity,
            historyRecords,
            panel,
            cashFlowPeriodFromFilters(filters, dateFieldId),
          ),
        );
        continue;
      }
      map.set(
        panel.id,
        buildEntityAggregateRows(valueContext, entity, scopedRecords, panel),
      );
    }
    return map;
  }, [
    aggregatePanels,
    entity,
    filterFields,
    filters,
    records,
    scopedRecords,
    search,
    valueContext,
  ]);

  if (!layout || !hasEntityPageLayout(entity)) {
    return (
      <EntityTableView
        entity={entity}
        records={records}
        title={title}
        onEditRecord={onEditRecord}
        onOpenRecord={onOpenRecord}
        onOpenRelation={onOpenRelation}
        onCreateChildRecord={onCreateChildRecord}
      />
    );
  }

  // Narrowed copy — nested helpers below don't retain the null guard.
  const pageLayout = layout;

  function handleDrill(row: EntityAggregateRow) {
    setDrillRow((current) => (current?.key === row.key ? null : row));
  }

  function handleFiltersChange(next: EntityFiltersState) {
    setDrillRow(null);
    setFilters(next);
  }

  function handleSearchChange(value: string) {
    setDrillRow(null);
    setSearch(value);
  }

  const isRecordsRow = (panelIds: string[]) =>
    panelIds.some(
      (id) => getEntityPagePanel(pageLayout, id)?.type === "records",
    );

  const chromeRows = pageLayout.rows.filter(
    (row) => !isRecordsRow(row.panelIds),
  );
  const fillRows = pageLayout.rows.filter((row) => isRecordsRow(row.panelIds));
  const hasChrome = chromeRows.length > 0 || !hasFiltersPanel;

  function renderRow(
    row: (typeof pageLayout.rows)[number],
    opts: { fill: boolean },
  ) {
    return (
      <div
        key={row.id}
        className={cn(
          "grid min-w-0 gap-3",
          opts.fill ? "min-h-0 flex-1" : "shrink-0",
        )}
        style={{
          gridTemplateColumns: row.columns
            .map((fraction) => `${fraction}fr`)
            .join(" "),
        }}
      >
        {row.panelIds.map((panelId) => {
          const panel = getEntityPagePanel(pageLayout, panelId);
          if (!panel) return null;
          return (
            <BoardPanel
              key={panelId}
              entity={entity}
              panel={panel}
              title={title}
              filteredRecords={registryRecords}
              aggregateRows={aggregateByPanelId.get(panelId) ?? []}
              drillKey={drillRow?.key ?? null}
              onDrill={handleDrill}
              search={search}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onEditRecord={onEditRecord}
              onOpenRecord={onOpenRecord}
              onOpenRelation={onOpenRelation}
              onCreateChildRecord={onCreateChildRecord}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {hasChrome ? (
        chromeCollapsed ? (
          <button
            type="button"
            onClick={() => onChromeCollapsedChange?.(false)}
            className="flex h-9 w-full shrink-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-left shadow-xs transition-colors hover:bg-muted/40"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">
                Сводка и фильтры
              </span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-1.5 text-[11px] font-medium tabular-nums text-primary">
                  {activeFilterCount}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
        ) : (
          <div className="flex shrink-0 flex-col gap-3">
            {hasFiltersPanel ? null : (
              <EntityBrowseFilters
                fields={filterFields}
                entities={entities}
                search={search}
                onSearchChange={handleSearchChange}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                searchId="entity-board-shared-search"
              />
            )}

            {chromeRows.map((row) => renderRow(row, { fill: false }))}
          </div>
        )
      ) : null}

      {fillRows.map((row) => renderRow(row, { fill: true }))}
    </div>
  );
}
