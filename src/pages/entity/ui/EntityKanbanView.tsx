import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Columns3, Play, Square } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_KANBAN_EMPTY_COLUMN_ID,
  formatRecordFieldValue,
  getEntityRecordTitle,
  getEntityKanbanColumns,
  getEntityKanbanGroupFields,
  getEntityListOption,
  getEntityRecordKanbanColumnId,
  isRecordValueDecorated,
  RecordValue,
  resolveEntityKanbanCardFields,
  resolveEntityKanbanFieldId,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityKanbanColumnValue,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityKanbanColumn,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  EntityBrowseFilters,
  getEntityBrowseFilterFields,
  recordMatchesFilters,
  recordMatchesSearch,
  type EntityFiltersState,
} from "./EntityBrowseFilters";
import { useRecordListChange } from "./use-record-list-change";
import { useRecordTimers, type RecordTimers } from "./use-record-timers";
import { TimerElapsed } from "./RecordTimer";

function buildKanbanColumns(
  groupField: EntityField,
  records: EntityRecord[],
  entities: Entity[],
): EntityKanbanColumn[] {
  const base = getEntityKanbanColumns(groupField, entities);
  const known = new Set(base.map((column) => column.id));
  const orphans: EntityKanbanColumn[] = [];

  for (const record of records) {
    const columnId = getEntityRecordKanbanColumnId(
      groupField,
      record.values[groupField.id],
    );
    if (known.has(columnId)) continue;
    known.add(columnId);
    orphans.push({
      id: columnId,
      label: "Недоступно",
    });
  }

  const empty = base.find(
    (column) => column.id === ENTITY_KANBAN_EMPTY_COLUMN_ID,
  );
  const rest = base.filter(
    (column) => column.id !== ENTITY_KANBAN_EMPTY_COLUMN_ID,
  );
  return empty ? [empty, ...rest, ...orphans] : [...rest, ...orphans];
}

function groupRecordsByColumn(
  columns: EntityKanbanColumn[],
  groupField: EntityField,
  records: EntityRecord[],
) {
  const map = new Map<string, EntityRecord[]>();
  for (const column of columns) {
    map.set(column.id, []);
  }

  for (const record of records) {
    const columnId = getEntityRecordKanbanColumnId(
      groupField,
      record.values[groupField.id],
    );
    const bucket = map.get(columnId);
    if (bucket) {
      bucket.push(record);
    } else {
      map.get(ENTITY_KANBAN_EMPTY_COLUMN_ID)?.push(record);
    }
  }

  return map;
}

const KANBAN_MIME = "application/x-ipk-kanban-record";

type KanbanDragPayload = {
  recordId: string;
  fromColumnId: string;
};

type EntityKanbanViewProps = {
  entity: Entity;
  /** Records in scope (quick filter, hidden options). */
  records: EntityRecord[];
  /** Hidden option ids per list field — their columns are not shown. */
  hiddenOptionIds: Map<string, Set<string>> | null;
  title: string;
  onOpenRecord?: (record: EntityRecord) => void;
};

function getRecordTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
) {
  return getEntityRecordTitle(ctx, entity, record);
}

function KanbanCardFieldValue({
  ctx,
  entity,
  record,
  field,
  value,
  entities,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  value: string;
  entities: Entity[];
}) {
  if (isRecordValueDecorated(field)) {
    return (
      <RecordValue
        ctx={ctx}
        entity={entity}
        record={record}
        field={field}
        className="text-xs leading-snug"
      />
    );
  }

  if (field.type === "list") {
    const { listUseColors } = resolveEntityListFieldPresentation(
      field,
      entities,
    );
    const option = getEntityListOption(
      resolveEntityListFieldOptions(field, entities),
      value,
    );
    if (listUseColors && option) {
      return (
        <span
          className="inline-flex max-w-full truncate rounded-md border border-black/5 px-1.5 py-0.5 text-[11px] font-medium leading-none text-foreground"
          style={{ backgroundColor: `${option.color}28` }}
          title={option.name}
        >
          {option.name}
        </span>
      );
    }
  }

  return (
    <span
      className="block truncate text-xs leading-snug text-foreground"
      title={value}
    >
      {value}
    </span>
  );
}

function parseDragPayload(event: DragEvent): KanbanDragPayload | null {
  const raw =
    event.dataTransfer.getData(KANBAN_MIME) ||
    event.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KanbanDragPayload>;
    if (
      typeof parsed.recordId !== "string" ||
      typeof parsed.fromColumnId !== "string"
    ) {
      return null;
    }
    return {
      recordId: parsed.recordId,
      fromColumnId: parsed.fromColumnId,
    };
  } catch {
    return null;
  }
}

function hasKanbanMime(event: DragEvent) {
  return [...event.dataTransfer.types].includes(KANBAN_MIME);
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function KanbanTimerButton({
  record,
  timers,
}: {
  record: EntityRecord;
  timers: RecordTimers;
}) {
  const running = timers.runningRecordId === record.id ? timers.running : null;
  if (!running && !timers.canStart(record)) return null;
  return (
    <button
      type="button"
      draggable={false}
      aria-label={running ? "Остановить таймер" : "Запустить таймер"}
      title={running ? "Остановить таймер" : "Запустить таймер"}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium transition-[opacity,color,background-color]",
        running
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground opacity-0 group-hover/card:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        timers.toggle(record);
      }}
    >
      {running ? (
        <>
          <TimerElapsed startedAt={running.startedAt} />
          <Square className="size-2.5 fill-current" />
        </>
      ) : (
        <Play className="size-3 fill-current" />
      )}
    </button>
  );
}

function KanbanCard({
  ctx,
  entity,
  record,
  columnId,
  previewFields,
  entities,
  timers,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  record: EntityRecord;
  columnId: string;
  previewFields: EntityField[];
  entities: Entity[];
  timers: RecordTimers;
  dragging: boolean;
  onOpen?: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const didDragRef = useRef(false);
  const title = getRecordTitle(ctx, entity, record);
  const metaRows = previewFields.flatMap((field) => {
    const value = formatRecordFieldValue(ctx, entity, record, field);
    if (!value.trim() || value === "—") return [];
    return [{ field, value }];
  });

  return (
    <article
      draggable
      onDragStart={(event) => {
        didDragRef.current = true;
        onDragStart(event);
        event.dataTransfer.effectAllowed = "move";
        const payload = JSON.stringify({
          recordId: record.id,
          fromColumnId: columnId,
        } satisfies KanbanDragPayload);
        event.dataTransfer.setData(KANBAN_MIME, payload);
        // Fallback for browsers that only expose text/* on drop.
        event.dataTransfer.setData("text/plain", payload);
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        if (dragging) return;
        onOpen?.();
      }}
      className={cn(
        "group/card cursor-grab rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs transition-[opacity,box-shadow,border-color,transform] active:cursor-grabbing",
        dragging
          ? "opacity-45 shadow-none"
          : "hover:border-foreground/20 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold tracking-tight break-all text-foreground">
          {title}
        </p>
        {timers.enabled ? (
          <KanbanTimerButton record={record} timers={timers} />
        ) : null}
      </div>
      {metaRows.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {metaRows.map(({ field, value }) => (
            <div key={field.id} className="min-w-0">
              <KanbanCardFieldValue
                ctx={ctx}
                entity={entity}
                record={record}
                field={field}
                value={value}
                entities={entities}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function KanbanColumn({
  ctx,
  column,
  records,
  entity,
  previewFields,
  entities,
  timers,
  draggingId,
  dropActive,
  dropDisabled,
  onOpenRecord,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  ctx: EntityValueContext;
  column: EntityKanbanColumn;
  records: EntityRecord[];
  entity: Entity;
  previewFields: EntityField[];
  entities: Entity[];
  timers: RecordTimers;
  draggingId: string | null;
  dropActive: boolean;
  /** The dragged card cannot move here (status process). */
  dropDisabled: boolean;
  onOpenRecord?: (record: EntityRecord) => void;
  onDragStart: (recordId: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const color = column.color;
  const columnStyle = color
    ? {
        backgroundColor: dropActive ? `${color}28` : `${color}14`,
        borderColor: dropActive ? `${color}66` : `${color}33`,
      }
    : undefined;

  return (
    <section
      className={cn(
        "flex h-full min-h-72 w-72 shrink-0 flex-col rounded-xl border transition-[border-color,background-color,opacity]",
        color
          ? null
          : dropActive
            ? "border-foreground/25 bg-muted/45"
            : "border-border/70 bg-muted/25",
        dropDisabled && "opacity-45",
      )}
      title={dropDisabled ? "Переход в этот статус недоступен" : undefined}
      style={columnStyle}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-3 py-2.5",
          color ? "border-black/5" : "border-border/60",
        )}
        style={color ? { backgroundColor: `${color}22` } : undefined}
      >
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {column.label}
        </h3>
        <span
          className={cn(
            "tabular-nums text-[11px]",
            color ? "text-foreground/70" : "text-muted-foreground",
          )}
        >
          {records.length}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {records.map((record) => (
          <KanbanCard
            key={record.id}
            ctx={ctx}
            entity={entity}
            record={record}
            columnId={column.id}
            previewFields={previewFields}
            entities={entities}
            timers={timers}
            dragging={draggingId === record.id}
            onOpen={onOpenRecord ? () => onOpenRecord(record) : undefined}
            onDragStart={() => onDragStart(record.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {records.length === 0 ? (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground/80",
              dropActive
                ? "border-foreground/20 bg-background/50"
                : "border-transparent",
            )}
          >
            Перетащите сюда
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function EntityKanbanView({
  entity,
  records,
  hiddenOptionIds,
  title,
  onOpenRecord,
}: EntityKanbanViewProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const { requestListChange, dialog: listChangeDialog } = useRecordListChange();
  const timers = useRecordTimers(entity);
  const groupFields = getEntityKanbanGroupFields(entity);
  const activeFieldId = resolveEntityKanbanFieldId(
    entity.fields,
    entity.kanbanFieldId,
  );
  const groupField =
    groupFields.find((field) => field.id === activeFieldId) ?? null;
  const showFilters = entity.kanbanShowFilters !== false;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EntityFiltersState>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);

  const filterFields = useMemo(
    () => getEntityBrowseFilterFields(entity),
    [entity],
  );

  const filteredRecords = useMemo(() => {
    if (!showFilters) return records;
    return records.filter(
      (record) =>
        recordMatchesSearch(valueContext, entity, record, search) &&
        recordMatchesFilters(
          valueContext,
          entity,
          record,
          filterFields,
          filters,
        ),
    );
  }, [
    entity,
    filterFields,
    filters,
    records,
    search,
    showFilters,
    valueContext,
  ]);

  const hiddenColumnIds = groupField
    ? hiddenOptionIds?.get(groupField.id)
    : undefined;
  const columns = groupField
    ? buildKanbanColumns(groupField, filteredRecords, entities).filter(
        (column) => !hiddenColumnIds?.has(column.id),
      )
    : [];
  const recordsByColumn = groupField
    ? groupRecordsByColumn(columns, groupField, filteredRecords)
    : new Map<string, EntityRecord[]>();
  const previewFields = groupField
    ? resolveEntityKanbanCardFields(entity, groupField.id)
    : [];
  function moveRecord(recordId: string, toColumnId: string) {
    if (!groupField) return;
    const record = entity.records.find((item) => item.id === recordId);
    if (!record) return;

    const fromColumnId = getEntityRecordKanbanColumnId(
      groupField,
      record.values[groupField.id],
    );
    if (fromColumnId === toColumnId) return;

    const nextValue = serializeEntityKanbanColumnValue(groupField, toColumnId);
    if (groupField.type === "list") {
      void requestListChange(entity, record, groupField, nextValue);
      return;
    }
    void updateEntityRecord(entity.id, recordId, {
      ...record.values,
      [groupField.id]: nextValue,
    });
  }

  if (groupFields.length === 0) {
    return (
      <EmptyState
        icon={<Columns3 className="size-5" aria-hidden />}
        title="Канбан недоступен"
        description={`Добавьте поле «Список» (один выбор) или «Связь», чтобы группировать «${title}» по колонкам.`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showFilters ? (
        <div className="shrink-0">
          <EntityBrowseFilters
            fields={filterFields}
            entities={entities}
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1">
        {columns.map((column) => (
          <KanbanColumn
            ctx={valueContext}
            key={column.id}
            timers={timers}
            column={column}
            records={recordsByColumn.get(column.id) ?? []}
            entity={entity}
            previewFields={previewFields}
            entities={entities}
            draggingId={draggingId}
            dropActive={dropColumnId === column.id}
            dropDisabled={false}
            onOpenRecord={onOpenRecord}
            onDragStart={setDraggingId}
            onDragEnd={() => {
              setDraggingId(null);
              setDropColumnId(null);
            }}
            onDragOver={(event) => {
              if (!hasKanbanMime(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropColumnId(column.id);
            }}
            onDragLeave={() => {
              setDropColumnId((current) =>
                current === column.id ? null : current,
              );
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDropColumnId(null);
              setDraggingId(null);
              const payload = parseDragPayload(event);
              if (!payload) return;
              moveRecord(payload.recordId, column.id);
            }}
          />
        ))}
      </div>
      {listChangeDialog}
      {timers.dialog}
    </div>
  );
}
