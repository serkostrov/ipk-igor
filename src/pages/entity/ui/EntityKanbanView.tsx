import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Check, Columns3, Play, Search, Settings, Square } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_KANBAN_CARD_FIELD_LIMIT,
  ENTITY_KANBAN_EMPTY_COLUMN_ID,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityKanbanCardFieldCandidates,
  getEntityKanbanColumns,
  getEntityKanbanGroupFields,
  getEntityListOption,
  getEntityRecordKanbanColumnId,
  isEntityNameField,
  isRecordValueDecorated,
  RecordValue,
  normalizeEntityKanbanCardFieldIds,
  resolveEntityKanbanCardFields,
  resolveEntityKanbanFieldId,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityKanbanColumnValue,
  setEntityKanbanCardFields,
  setEntityKanbanField,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityKanbanColumn,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
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
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "Без названия";
  const label = formatRecordFieldValue(ctx, entity, record, nameField);
  return !label.trim() || label === "—" ? "Без названия" : label;
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

function KanbanSettingsForm({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const groupFields = getEntityKanbanGroupFields(entity);
  const initialGroupFieldId = resolveEntityKanbanFieldId(
    entity.fields,
    entity.kanbanFieldId,
  );

  const [groupFieldId, setGroupFieldId] = useState(
    initialGroupFieldId ?? groupFields[0]?.id ?? "",
  );
  const [cardFieldIds, setCardFieldIds] = useState<string[] | null>(
    entity.kanbanCardFieldIds,
  );
  const [cardFieldQuery, setCardFieldQuery] = useState("");

  const cardCandidates = getEntityKanbanCardFieldCandidates(entity);
  const cardFieldNeedle = cardFieldQuery.trim().toLocaleLowerCase("ru");
  const visibleCardCandidates = useMemo(() => {
    if (!cardFieldNeedle) return cardCandidates;
    return cardCandidates.filter((field) => {
      const name = getEntityFieldDisplayName(field).toLocaleLowerCase("ru");
      const type = getEntityFieldTypeLabel(field.type).toLocaleLowerCase("ru");
      return name.includes(cardFieldNeedle) || type.includes(cardFieldNeedle);
    });
  }, [cardCandidates, cardFieldNeedle]);
  const previewEntity: Entity = {
    ...entity,
    kanbanFieldId: groupFieldId || null,
    kanbanCardFieldIds: cardFieldIds,
  };
  const selectedCardFields = resolveEntityKanbanCardFields(
    previewEntity,
    groupFieldId || null,
  );
  const selectedCardIds = new Set(selectedCardFields.map((field) => field.id));
  const atCardLimit =
    selectedCardFields.length >= ENTITY_KANBAN_CARD_FIELD_LIMIT;
  const isCustomCardFields = cardFieldIds != null;

  function selectGroupField(fieldId: string) {
    setGroupFieldId(fieldId);
    setCardFieldIds((current) =>
      normalizeEntityKanbanCardFieldIds(entity.fields, fieldId, current),
    );
  }

  function toggleCardField(fieldId: string) {
    const selected = new Set(selectedCardFields.map((field) => field.id));
    if (selected.has(fieldId)) {
      selected.delete(fieldId);
    } else {
      if (atCardLimit) return;
      selected.add(fieldId);
    }
    // Keep selection in entity field order.
    setCardFieldIds(
      cardCandidates
        .filter((field) => selected.has(field.id))
        .map((field) => field.id),
    );
  }

  function handleSave() {
    if (!groupFieldId) return;
    setEntityKanbanField(entity.id, groupFieldId);
    setEntityKanbanCardFields(entity.id, cardFieldIds);
    onClose();
  }

  const selectedGroupField =
    groupFields.find((field) => field.id === groupFieldId) ?? null;

  return (
    <>
      <DialogHeader className="gap-1">
        <DialogTitle>Настройки канбана</DialogTitle>
        <DialogDescription>
          Колонки доски и поля на карточке записи.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kanban-column-field">Поле колонок</Label>
          <Select
            value={groupFieldId || null}
            onValueChange={(value) => {
              if (value == null) return;
              selectGroupField(value);
            }}
          >
            <SelectTrigger id="kanban-column-field" className="w-full">
              <SelectValue placeholder="Выберите поле">
                {selectedGroupField
                  ? `${getEntityFieldDisplayName(selectedGroupField)} · ${
                      selectedGroupField.type === "list" ? "список" : "связь"
                    }`
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groupFields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {field.type === "list" ? "список" : "связь"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label>Поля на карточке</Label>
            <span className="tabular-nums text-xs text-muted-foreground">
              {selectedCardFields.length}/{ENTITY_KANBAN_CARD_FIELD_LIMIT}
            </span>
          </div>

          {cardCandidates.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Нет подходящих полей
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="relative border-b border-border">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={cardFieldQuery}
                  onChange={(event) => setCardFieldQuery(event.target.value)}
                  placeholder="Поиск полей"
                  aria-label="Поиск полей на карточке"
                  className="h-9 rounded-none border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {visibleCardCandidates.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-foreground">Ничего не найдено</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Попробуйте другой запрос
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col p-0.5">
                    {visibleCardCandidates.map((field) => {
                      const checked = selectedCardIds.has(field.id);
                      const disabled = !checked && atCardLimit;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          disabled={disabled}
                          aria-pressed={checked}
                          onClick={() => toggleCardField(field.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            disabled
                              ? "cursor-not-allowed opacity-45"
                              : checked
                                ? "bg-primary/8 text-foreground"
                                : "text-foreground hover:bg-muted/50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background",
                            )}
                            aria-hidden
                          >
                            {checked ? (
                              <Check className="size-2.5" strokeWidth={3} />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {getEntityFieldDisplayName(field)}
                            <span className="text-muted-foreground">
                              {" · "}
                              {getEntityFieldTypeLabel(field.type)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {isCustomCardFields ? (
            <button
              type="button"
              className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setCardFieldIds(null)}
            >
              Сбросить к умолчанию
            </button>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={!groupFieldId} onClick={handleSave}>
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function KanbanFieldSettingsButton({
  entity,
  className,
}: {
  entity: Entity;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const groupFields = getEntityKanbanGroupFields(entity);
  const dialogOpen = open && groupFields.length > 0;

  if (groupFields.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "size-6 shrink-0 text-muted-foreground hover:text-foreground",
          className,
        )}
        aria-label="Настройки канбана"
        title="Настройки канбана"
        onClick={() => setOpen(true)}
      >
        <Settings className="size-3.5" />
      </Button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (groupFields.length === 0) {
            setOpen(false);
            return;
          }
          setOpen(next);
        }}
      >
        <DialogContent className="w-fit min-w-[min(100%,22rem)] max-w-[min(92vw,28rem)] gap-4 overflow-x-hidden sm:max-w-[min(92vw,28rem)]">
          {dialogOpen ? (
            <KanbanSettingsForm
              key={entity.id}
              entity={entity}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
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

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);

  const hiddenColumnIds = groupField
    ? hiddenOptionIds?.get(groupField.id)
    : undefined;
  const columns = groupField
    ? buildKanbanColumns(groupField, records, entities).filter(
        (column) => !hiddenColumnIds?.has(column.id),
      )
    : [];
  const recordsByColumn = groupField
    ? groupRecordsByColumn(columns, groupField, records)
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
