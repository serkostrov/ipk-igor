import { useMemo, useState, type ReactNode } from "react";
import {
  buildEntityAggregateRows,
  formatEntityDecimalTotal,
  getEntityFieldDisplayName,
  getEntityPagePanel,
  hasEntityPageLayout,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityAggregateRow,
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "./EntityBrowseFilters";
import { EntityTableView } from "./EntityTableView";

type EntityBoardViewProps = {
  entity: Entity;
  records: EntityRecord[];
  title: string;
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
        "flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-3",
        className,
      )}
    >
      {title ? (
        <h2 className="shrink-0 px-0.5 text-sm font-medium tracking-tight">
          {title}
        </h2>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
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

  return (
    <div className="min-h-0 overflow-auto rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {groupFields.map((field) => (
              <TableHead key={field.id} className="whitespace-nowrap">
                {getEntityFieldDisplayName(field)}
              </TableHead>
            ))}
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
      <PanelChrome title={panel.title} className="min-h-[16rem] flex-1">
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
      </PanelChrome>
    );
  }

  if (panel.type === "aggregate") {
    return (
      <PanelChrome
        title={panel.title ?? "Сводная таблица"}
        className="min-h-[12rem]"
      >
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
    <PanelChrome title={panel.title ?? "Фильтры"}>
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
      map.set(
        panel.id,
        buildEntityAggregateRows(valueContext, entity, scopedRecords, panel),
      );
    }
    return map;
  }, [aggregatePanels, entity, scopedRecords, valueContext]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {hasFiltersPanel ? null : (
        <div className="shrink-0">
          <EntityBrowseFilters
            fields={filterFields}
            entities={entities}
            search={search}
            onSearchChange={handleSearchChange}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            searchId="entity-board-shared-search"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {layout.rows.map((row) => (
          <div
            key={row.id}
            className="grid min-h-0 gap-3"
            style={{
              gridTemplateColumns: row.columns
                .map((fraction) => `${fraction}fr`)
                .join(" "),
            }}
          >
            {row.panelIds.map((panelId) => {
              const panel = getEntityPagePanel(layout, panelId);
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
        ))}
      </div>
    </div>
  );
}
