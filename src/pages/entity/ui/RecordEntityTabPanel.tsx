import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { RecordDeleteConfirmDialog } from "./RecordDeleteConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
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
import {
  addEntityRecord,
  updateEntityRecord,
  entityRelationIncludesId,
  formatEntityDecimalTotal,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityTableFields,
  getRecordFieldNumber,
  getRelationRecordOptions,
  groupEntityFields,
  isEntityNameField,
  isEntityNumericFieldType,
  isEntityParentLinkField,
  isEntitySubEntity,
  isRecordValueDecorated,
  ListValueDisplay,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  parseEntityRelationIds,
  removeEntityRecord,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  RecordValue,
  serializeEntityRelationIds,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityValueContext,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_TABLE_ACTIONS_WIDTH,
  getEntityTableHeaderMinWidth,
} from "../lib/table-column-width";
import { EntityRecordDialog } from "./EntityRecordDialog";

const dataTableHeadClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-foreground/65 uppercase";

const dataTableActionsHeadClass =
  "h-9 w-24 min-w-24 max-w-24 border-b border-border bg-foreground/[0.045] px-2 text-right text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

const dataTableFootClass =
  "h-9 min-w-0 overflow-hidden px-3 py-0 text-foreground/90";

const dataTableActionsFootClass =
  "h-9 w-24 min-w-24 max-w-24 overflow-hidden px-2 py-0";

type RecordEntityTabPanelProps = {
  tab: EntityTab;
  linkedEntity: Entity;
  parentEntityId: string;
  parentRecordId: string;
  entities: Entity[];
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

type AddFlow = "closed" | "choice" | "existing";

function getRecordCardFields(entity: Entity, parentLinkFieldId: string | null) {
  return entity.fields.filter(
    (field) =>
      !isEntityNameField(field) &&
      !isEntityParentLinkField(field, parentLinkFieldId),
  );
}

function getLinkedTableColumns(
  entity: Entity,
  parentLinkFieldId: string | null,
) {
  const tableFields = getEntityTableFields(entity.fields).filter(
    (field) => !isEntityParentLinkField(field, parentLinkFieldId),
  );
  if (tableFields.length > 0) return tableFields;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const fallback = getRecordCardFields(entity, parentLinkFieldId).slice(0, 4);
  return nameField ? [nameField, ...fallback] : fallback;
}

function RecordsTable({
  entity,
  records,
  parentLinkFieldId,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  records: EntityRecord[];
  parentLinkFieldId: string | null;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
}) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const columns = getLinkedTableColumns(entity, parentLinkFieldId);
  const columnMinWidths = columns.map((field, index) => {
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
      sortable: false,
    });
  });
  const tableMinWidth =
    columnMinWidths.reduce((sum, width) => sum + width, 0) +
    ENTITY_TABLE_ACTIONS_WIDTH;
  const totalFields = columns.filter(
    (field) => isEntityNumericFieldType(field.type) && field.includeInTotal,
  );
  const showTotalsRow = totalFields.length > 0 && records.length > 0;
  const columnTotals = showTotalsRow
    ? Object.fromEntries(
        totalFields.map((field) => [
          field.id,
          records.reduce(
            (sum, record) =>
              sum +
              (getRecordFieldNumber(valueContext, entity, record, field) ?? 0),
            0,
          ),
        ]),
      )
    : {};

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table
        className="table-fixed text-[13px]"
        containerClassName="overflow-visible"
        style={{
          width: `max(100%, ${tableMinWidth}px)`,
          minWidth: tableMinWidth,
        }}
      >
        <colgroup>
          {columns.map((field, index) => (
            <col
              key={field.id}
              style={{
                width: columnMinWidths[index],
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
            {columns.map((field, index) => (
              <TableHead
                key={field.id}
                className={cn(dataTableHeadClass, index === 0 && "pl-3.5")}
                style={{
                  width: columnMinWidths[index],
                  minWidth: columnMinWidths[index],
                }}
              >
                {getEntityFieldDisplayName(field)}
              </TableHead>
            ))}
            <TableHead className={dataTableActionsHeadClass}>
              Действия
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:last-child]:border-0">
          {records.map((record) => (
            <TableRow
              key={record.id}
              className="cursor-pointer border-border/70 hover:bg-muted/35"
              onClick={() => onEdit(record)}
            >
              {columns.map((field, index) => {
                const display = formatRecordFieldValue(
                  valueContext,
                  entity,
                  record,
                  field,
                );
                const listPresentation =
                  field.type === "list"
                    ? resolveEntityListFieldPresentation(field, entities)
                    : null;

                return (
                  <TableCell
                    key={field.id}
                    className={cn(
                      "min-w-0 overflow-hidden px-3 py-2 text-foreground/90",
                      index === 0 && "pl-3.5 font-medium text-foreground",
                    )}
                    title={display === "—" ? undefined : display}
                  >
                    {field.type === "list" && listPresentation ? (
                      <ListValueDisplay
                        options={resolveEntityListFieldOptions(field, entities)}
                        value={record.values[field.id]}
                        multiple={listPresentation.listMultiple}
                        showColors={listPresentation.listUseColors}
                      />
                    ) : isRecordValueDecorated(field) ? (
                      <RecordValue
                        ctx={valueContext}
                        entity={entity}
                        record={record}
                        field={field}
                      />
                    ) : (
                      <span
                        className={cn(
                          "block truncate",
                          display === "—" && "text-muted-foreground/70",
                        )}
                      >
                        {display}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-foreground"
                    aria-label="Редактировать запись"
                    onClick={() => onEdit(record)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-foreground hover:text-destructive"
                    aria-label="Удалить запись"
                    onClick={() => onDelete(record)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {showTotalsRow ? (
          <TableFooter className="sticky bottom-0 z-[5] border-t border-border bg-muted [&>tr]:h-9 [&>tr]:border-0">
            <TableRow className="h-9 hover:bg-transparent">
              {columns.map((field, index) => {
                const isTotalColumn =
                  isEntityNumericFieldType(field.type) && field.includeInTotal;
                const totalValue = isTotalColumn
                  ? formatEntityDecimalTotal(columnTotals[field.id] ?? 0)
                  : null;

                return (
                  <TableCell
                    key={field.id}
                    className={cn(
                      dataTableFootClass,
                      index === 0 && "pl-3.5 font-medium text-foreground",
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
                      <span className="block truncate">{totalValue}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
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
  );
}

function getRecordTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
) {
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "Без названия";
  const label = formatRecordFieldValue(ctx, entity, record, nameField);
  return label === "—" ? "Без названия" : label;
}

const RECORD_CARD_COLLAPSED_MAX_HEIGHT = 220;

function RecordCard({
  entity,
  record,
  parentLinkFieldId,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  record: EntityRecord;
  parentLinkFieldId: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const valueContext = useEntityValueContext();
  const fields = getRecordCardFields(entity, parentLinkFieldId);
  const groups = groupEntityFields(fields, entity.fieldGroups);
  const flatFields = groups.flatMap((group) => group.fields);
  const title = getRecordTitle(valueContext, entity, record);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;

    function measure() {
      if (!node) return;
      setOverflows(node.scrollHeight > RECORD_CARD_COLLAPSED_MAX_HEIGHT + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [flatFields.length, record.id]);

  const showToggle = overflows || expanded;

  return (
    <article className="group/card overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8"
            aria-label="Редактировать"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label="Удалить"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="relative">
        <div
          ref={bodyRef}
          className={cn(
            "grid grid-cols-2 gap-x-6 gap-y-4 px-4 pt-4 transition-[max-height] duration-300 ease-out",
            expanded ? "max-h-none pb-4" : "overflow-hidden pb-2",
          )}
          style={
            expanded
              ? undefined
              : { maxHeight: RECORD_CARD_COLLAPSED_MAX_HEIGHT }
          }
        >
          {flatFields.map((field) => {
            const label = getEntityFieldDisplayName(field);
            const display = formatRecordFieldValue(
              valueContext,
              entity,
              record,
              field,
            );
            const empty = display === "—";
            return (
              <div key={field.id} className="min-w-0">
                <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {label}
                </p>
                {isRecordValueDecorated(field) ? (
                  <RecordValue
                    ctx={valueContext}
                    entity={entity}
                    record={record}
                    field={field}
                    className="mt-1 font-medium"
                  />
                ) : (
                  <p
                    className={cn(
                      "mt-1 truncate text-sm font-medium",
                      empty ? "text-muted-foreground/70" : "text-foreground",
                    )}
                    title={empty ? undefined : display}
                  >
                    {display}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {showToggle && !expanded ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
      </div>

      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="group/expand flex w-full items-center justify-center py-2.5"
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть" : "Показать всё"}
          title={expanded ? "Свернуть" : "Показать всё"}
        >
          <span
            className={cn(
              "h-1 w-10 rounded-full bg-primary/55 transition-[width,background-color] duration-200",
              "group-hover/expand:w-14 group-hover/expand:bg-primary",
              expanded && "bg-primary/40",
            )}
          />
        </button>
      ) : null}
    </article>
  );
}

function AddChoiceDialog({
  open,
  entityLabel,
  onOpenChange,
  onCreateNew,
  onPickExisting,
}: {
  open: boolean;
  entityLabel: string;
  onOpenChange: (open: boolean) => void;
  onCreateNew: () => void;
  onPickExisting: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить запись</DialogTitle>
          <DialogDescription>
            Создайте новый {entityLabel} или привяжите уже существующий.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                Создать новую
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Заполнить поля и сохранить на этой вкладке
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onPickExisting}
            className="flex w-full items-start gap-3 rounded-xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Link2 className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                Выбрать существующую
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Привязать запись, которая уже есть в системе
              </span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinkExistingDialog({
  open,
  options,
  entityLabel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  options: Array<{ id: string; label: string }>;
  entityLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (recordId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = options.find((item) => item.id === selectedId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelectedId("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Выбрать существующую</DialogTitle>
          <DialogDescription>
            Выберите {entityLabel}, чтобы показать на этой вкладке.
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Нет доступных записей для привязки.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label>Запись</Label>
            <Select
              value={selectedId || undefined}
              onValueChange={(value) => {
                if (value == null) return;
                setSelectedId(String(value));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selected?.label ?? "Выберите запись"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              onSubmit(selectedId);
              setSelectedId("");
            }}
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordEntityTabPanel({
  tab,
  linkedEntity,
  parentEntityId,
  parentRecordId,
  entities,
}: RecordEntityTabPanelProps) {
  const valueContext = useEntityValueContext();
  const parentLinkFieldId = tab.parentLinkFieldId;
  const isSelfRef = linkedEntity.id === parentEntityId;
  const [addFlow, setAddFlow] = useState<AddFlow>("closed");
  const [dialogRecord, setDialogRecord] = useState<EntityRecord | null | "new">(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<EntityRecord | null>(null);

  const parentRecord = useMemo(
    () =>
      isSelfRef
        ? (linkedEntity.records.find((item) => item.id === parentRecordId) ??
          null)
        : null,
    [isSelfRef, linkedEntity.records, parentRecordId],
  );

  const records = useMemo(() => {
    if (!parentLinkFieldId) return [];
    const outgoingIds = parseEntityRelationIds(
      parentRecord?.values[parentLinkFieldId],
    );

    return (linkedEntity.records ?? []).filter((record) => {
      if (record.id === parentRecordId) return false;
      // Direct: related record points to the current one.
      if (
        entityRelationIncludesId(
          record.values[parentLinkFieldId],
          parentRecordId,
        )
      ) {
        return true;
      }
      // Reverse (self-link): current record points to the related one.
      if (isSelfRef && outgoingIds.includes(record.id)) return true;
      return false;
    });
  }, [
    isSelfRef,
    linkedEntity.records,
    parentLinkFieldId,
    parentRecord,
    parentRecordId,
  ]);

  const linkedRecordIds = useMemo(
    () => new Set(records.map((record) => record.id)),
    [records],
  );

  const availableExistingOptions = useMemo(() => {
    if (!parentLinkFieldId) return [];
    return getRelationRecordOptions(linkedEntity).filter(
      (option) =>
        option.id !== parentRecordId && !linkedRecordIds.has(option.id),
    );
  }, [linkedEntity, linkedRecordIds, parentLinkFieldId, parentRecordId]);

  const recordsDisplay = normalizeEntityRecordsDisplay(
    linkedEntity.recordsDisplay,
  );
  const recordColumns = normalizeEntityRecordColumns(
    linkedEntity.recordColumns,
  );
  const columnsClass =
    recordColumns === 1
      ? "grid-cols-1"
      : recordColumns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  const entityLabel =
    linkedEntity.name.trim().toLowerCase() ||
    linkedEntity.namePlural.trim().toLowerCase() ||
    "элемент";

  const dialogTitle =
    dialogRecord === "new"
      ? `Новый ${entityLabel}`
      : dialogRecord
        ? "Редактировать запись"
        : "";

  const presetValues =
    dialogRecord === "new" && parentLinkFieldId
      ? { [parentLinkFieldId]: parentRecordId }
      : undefined;

  const ownsLinkedRecords =
    isEntitySubEntity(linkedEntity) &&
    linkedEntity.parentEntityId === parentEntityId;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {tab.name}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {records.length} записей
          </span>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (ownsLinkedRecords) {
                setDialogRecord("new");
                return;
              }
              setAddFlow("choice");
            }}
          >
            <Plus className="size-3.5" />
            Добавить
          </Button>
        </div>
      </header>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">Нет записей</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Добавьте первую запись, чтобы она появилась здесь.
          </p>
        </div>
      ) : recordsDisplay === "table" ? (
        <RecordsTable
          entity={linkedEntity}
          records={records}
          parentLinkFieldId={parentLinkFieldId}
          onEdit={(record) => setDialogRecord(record)}
          onDelete={(record) => setPendingDelete(record)}
        />
      ) : (
        <div className={cn("grid gap-3 p-4", columnsClass)}>
          {records.map((record) => (
            <RecordCard
              key={record.id}
              entity={linkedEntity}
              record={record}
              parentLinkFieldId={parentLinkFieldId}
              onEdit={() => setDialogRecord(record)}
              onDelete={() => setPendingDelete(record)}
            />
          ))}
        </div>
      )}

      <AddChoiceDialog
        open={addFlow === "choice"}
        entityLabel={entityLabel}
        onOpenChange={(open) => {
          if (!open) setAddFlow("closed");
        }}
        onCreateNew={() => {
          setAddFlow("closed");
          setDialogRecord("new");
        }}
        onPickExisting={() => setAddFlow("existing")}
      />

      <LinkExistingDialog
        open={addFlow === "existing"}
        options={availableExistingOptions}
        entityLabel={entityLabel}
        onOpenChange={(open) => {
          if (!open) setAddFlow("closed");
        }}
        onSubmit={(recordId) => {
          if (!parentLinkFieldId) return;
          const record = linkedEntity.records.find(
            (item) => item.id === recordId,
          );
          if (!record) return;
          updateEntityRecord(linkedEntity.id, recordId, {
            ...record.values,
            [parentLinkFieldId]: serializeEntityRelationIds([
              ...parseEntityRelationIds(record.values[parentLinkFieldId]),
              parentRecordId,
            ]),
          });
          setAddFlow("closed");
        }}
      />

      <EntityRecordDialog
        open={dialogRecord !== null}
        onOpenChange={(open) => {
          if (!open) setDialogRecord(null);
        }}
        entity={linkedEntity}
        record={dialogRecord === "new" ? null : dialogRecord}
        entities={entities}
        presetValues={presetValues}
        hiddenFieldIds={
          parentLinkFieldId ? new Set([parentLinkFieldId]) : undefined
        }
        titleOverride={dialogRecord !== null ? dialogTitle : undefined}
        submitLabel="Сохранить"
        onSubmit={(values) => {
          if (!parentLinkFieldId) return;
          const previousLink =
            dialogRecord && dialogRecord !== "new"
              ? dialogRecord.values[parentLinkFieldId]
              : "";
          const nextValues = {
            ...values,
            [parentLinkFieldId]: serializeEntityRelationIds([
              ...parseEntityRelationIds(previousLink),
              parentRecordId,
            ]),
          };
          if (dialogRecord === "new") {
            addEntityRecord(linkedEntity.id, nextValues);
            return;
          }
          if (dialogRecord) {
            updateEntityRecord(linkedEntity.id, dialogRecord.id, nextValues);
          }
        }}
      />

      {ownsLinkedRecords ? (
        <RecordDeleteConfirmDialog
          open={pendingDelete != null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          entityId={linkedEntity.id}
          recordId={pendingDelete?.id ?? null}
          title="Удалить запись?"
          description={
            pendingDelete
              ? `Вы уверены, что хотите удалить «${getRecordTitle(valueContext, linkedEntity, pendingDelete)}»?`
              : "Вы уверены, что хотите удалить эту запись?"
          }
          confirmLabel="Удалить"
          onConfirm={() => {
            if (!pendingDelete) return;
            removeEntityRecord(linkedEntity.id, pendingDelete.id);
          }}
        />
      ) : (
        <ConfirmDialog
          open={pendingDelete != null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title="Убрать с вкладки?"
          description={
            pendingDelete
              ? `Убрать «${getRecordTitle(valueContext, linkedEntity, pendingDelete)}» с этой вкладки? Запись останется в системе.`
              : "Убрать запись с этой вкладки? Она останется в системе."
          }
          confirmLabel="Убрать"
          onConfirm={() => {
            if (!pendingDelete || !parentLinkFieldId) return;

            // Direct link: related → current. Reverse self-link: current → related.
            if (
              entityRelationIncludesId(
                pendingDelete.values[parentLinkFieldId],
                parentRecordId,
              )
            ) {
              updateEntityRecord(linkedEntity.id, pendingDelete.id, {
                ...pendingDelete.values,
                [parentLinkFieldId]: serializeEntityRelationIds(
                  parseEntityRelationIds(
                    pendingDelete.values[parentLinkFieldId],
                  ).filter((id) => id !== parentRecordId),
                ),
              });
            } else if (
              isSelfRef &&
              parentRecord &&
              entityRelationIncludesId(
                parentRecord.values[parentLinkFieldId],
                pendingDelete.id,
              )
            ) {
              updateEntityRecord(linkedEntity.id, parentRecord.id, {
                ...parentRecord.values,
                [parentLinkFieldId]: serializeEntityRelationIds(
                  parseEntityRelationIds(
                    parentRecord.values[parentLinkFieldId],
                  ).filter((id) => id !== pendingDelete.id),
                ),
              });
            }

            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}
