import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { TreeBranchGuides } from "@/shared/ui/tree-branch-guides";
import { cn } from "@/shared/lib/cn";
import {
  buildEntityTableDisplayColumns,
  flattenEntityTableHierarchyRows,
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityParentLinkField,
  getEntityRecordTitle,
  getEntityTableFields,
  isEntityInternal,
  isEntityNameField,
  isEntityFieldVisibleOnRecord,
  isEntityTableDisplayColumnNumeric,
  isRecordValueDecorated,
  ListValueDisplay,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  RecordValue,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  resolveEntityTableDisplayColumnField,
  resolveEntityTableParentField,
  resolveEntityTableSubgroupField,
  type Entity,
  type EntityRecord,
  type EntityTableDisplayColumn,
  type EntityValueContext,
} from "@/entities/entity";
import { EntityRecordDialog } from "@/pages/entity/ui/EntityRecordDialog";
import {
  ENTITY_TABLE_ACTIONS_WIDTH,
  getEntityTableHeaderMinWidth,
} from "@/pages/entity/lib/table-column-width";
import {
  addNestedDraftRow,
  buildCreateAskDraftRecord,
  buildSingleCreateAskDraftRecord,
  clearSingleCreateAskFieldValues,
  createAskMultiNestedSlot,
  getNestedDraftCount,
  removeNestedDraftRow,
  singleCreateAskHasDraft,
  writeNestedAskFieldValues,
  writeSingleCreateAskFieldValues,
  type AutomationCreateAskNestedSlot,
  type AutomationCreateAskSlot,
} from "../lib/task-ask-fields";

const dataTableHeadClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-foreground/65 uppercase";

const dataTableActionsHeadClass =
  "h-9 w-24 min-w-24 max-w-24 border-b border-border bg-foreground/[0.045] px-2 text-right text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

type DialogState =
  { mode: "create" } | { mode: "edit"; index: number; record: EntityRecord };

function getCreateAskTableColumns(
  entity: Entity,
  hideFieldIds: ReadonlySet<string>,
): EntityTableDisplayColumn[] {
  const tableFields = getEntityTableFields(entity.fields, {
    preferArrayOrder: isEntityInternal(entity),
  }).filter((field) => !hideFieldIds.has(field.id));
  if (tableFields.length > 0) {
    return buildEntityTableDisplayColumns(tableFields);
  }
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const fallback = entity.fields
    .filter(
      (field) =>
        !isEntityNameField(field) &&
        !hideFieldIds.has(field.id) &&
        isEntityFieldVisibleOnRecord(field),
    )
    .slice(0, 4);
  const fields = nameField ? [nameField, ...fallback] : fallback;
  return buildEntityTableDisplayColumns(fields);
}

function getCreateAskCardFields(
  entity: Entity,
  hideFieldIds: ReadonlySet<string>,
) {
  return entity.fields.filter(
    (field) =>
      !isEntityNameField(field) &&
      !hideFieldIds.has(field.id) &&
      isEntityFieldVisibleOnRecord(field),
  );
}

function CreateAskFieldCell({
  entity,
  record,
  column,
  entities,
  ctx,
  indent = false,
  indentLevel = 1,
  isGroupStart = false,
  isGroupEnd = false,
}: {
  entity: Entity;
  record: EntityRecord;
  column: EntityTableDisplayColumn;
  entities: Entity[];
  ctx: EntityValueContext;
  indent?: boolean;
  indentLevel?: 1 | 2;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
}) {
  const field =
    resolveEntityTableDisplayColumnField(ctx, entity, record, column) ??
    column.fields[0];
  if (!field) {
    return (
      <TableCell className="relative min-w-0 overflow-hidden px-3 py-2 text-muted-foreground/70">
        —
      </TableCell>
    );
  }
  const display = formatRecordFieldValue(ctx, entity, record, field);
  const listPresentation =
    field.type === "list"
      ? resolveEntityListFieldPresentation(field, entities)
      : null;
  const value = (
    <>
      {field.type === "list" && listPresentation ? (
        <ListValueDisplay
          options={resolveEntityListFieldOptions(field, entities)}
          value={record.values[field.id]}
          multiple={listPresentation.listMultiple}
          showColors={listPresentation.listUseColors}
        />
      ) : isRecordValueDecorated(field) ? (
        <RecordValue ctx={ctx} entity={entity} record={record} field={field} />
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
    </>
  );

  return (
    <TableCell
      className={cn(
        "relative min-w-0 overflow-hidden px-3 py-2 text-foreground/90",
        indent && "pl-3.5",
      )}
      title={display === "—" ? undefined : display}
    >
      {indent ? (
        <TreeBranchGuides
          isFirst={isGroupStart}
          isLast={isGroupEnd}
          className={indentLevel === 2 ? "left-[35px]" : "left-[11px]"}
          armClassName="w-3"
          elbowTopPx={18}
        />
      ) : null}
      <div
        className={cn(
          indent && "relative",
          indent && (indentLevel === 2 ? "pl-11" : "pl-5"),
        )}
      >
        {value}
      </div>
    </TableCell>
  );
}

function CreateAskDraftsTable({
  entity,
  records,
  hideFieldIds,
  entities,
  ctx,
  disabled,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  records: EntityRecord[];
  hideFieldIds: ReadonlySet<string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
}) {
  const parentField = resolveEntityTableParentField(entity);
  const subgroupField = resolveEntityTableSubgroupField(entity);
  const hierarchyHide = useMemo(() => {
    const ids = new Set(hideFieldIds);
    if (parentField) ids.add(parentField.id);
    if (subgroupField) ids.add(subgroupField.id);
    return ids;
  }, [hideFieldIds, parentField, subgroupField]);

  const columns = useMemo(
    () => getCreateAskTableColumns(entity, hierarchyHide),
    [entity, hierarchyHide],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const hierarchyGroupIds = useMemo(() => {
    if (!parentField) return [] as string[];
    const rootIds = flattenEntityTableHierarchyRows(
      records,
      parentField,
      new Set(),
      entities,
      subgroupField,
    ).flatMap((row) =>
      row.kind === "group" && row.depth === 0 ? [row.id] : [],
    );
    return flattenEntityTableHierarchyRows(
      records,
      parentField,
      new Set(rootIds),
      entities,
      subgroupField,
    ).flatMap((row) => (row.kind === "group" ? [row.id] : []));
  }, [entities, parentField, records, subgroupField]);

  const effectiveExpandedIds = useMemo(
    () => expandedIds ?? new Set(hierarchyGroupIds),
    [expandedIds, hierarchyGroupIds],
  );

  const hierarchyRows = useMemo(() => {
    if (!parentField) return null;
    return flattenEntityTableHierarchyRows(
      records,
      parentField,
      effectiveExpandedIds,
      entities,
      subgroupField,
    );
  }, [effectiveExpandedIds, entities, parentField, records, subgroupField]);

  const bodyRows =
    hierarchyRows ??
    records.map((record) => ({
      kind: "record" as const,
      record,
      groupId: "",
      rootGroupId: "",
      depth: 1 as const,
    }));

  const recordMeta = useMemo(() => {
    if (!hierarchyRows) return null;
    const meta = new Map<
      string,
      { isGroupStart: boolean; isGroupEnd: boolean; depth: number }
    >();
    for (let i = 0; i < hierarchyRows.length; i += 1) {
      const row = hierarchyRows[i];
      if (!row || row.kind !== "record") continue;
      const prev = hierarchyRows[i - 1];
      const next = hierarchyRows[i + 1];
      const prevSame =
        prev?.kind === "record" ? prev.groupId === row.groupId : false;
      const nextSame =
        next?.kind === "record" ? next.groupId === row.groupId : false;
      meta.set(`${row.groupId}:${row.record.id}`, {
        isGroupStart: !prevSame,
        isGroupEnd: !nextSame,
        depth: row.depth,
      });
    }
    return meta;
  }, [hierarchyRows]);

  const columnMinWidths = columns.map((column, index) => {
    const primary = column.fields[0];
    const listLabels =
      column.fields.length === 1 && primary?.type === "list"
        ? resolveEntityListFieldOptions(primary, entities).map(
            (option) => option.name,
          )
        : undefined;
    return getEntityTableHeaderMinWidth(column.label, {
      first: index === 0,
      numberLike: isEntityTableDisplayColumnNumeric(column),
      listLabels,
      sortable: false,
    });
  });
  const tableMinWidth =
    columnMinWidths.reduce((sum, width) => sum + width, 0) +
    ENTITY_TABLE_ACTIONS_WIDTH;

  if (columns.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        Нет колонок для таблицы — добавьте поля «Показывать в таблице»
      </div>
    );
  }

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
          {columns.map((column, index) => (
            <col
              key={column.id}
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
            {columns.map((column, index) => (
              <TableHead
                key={column.id}
                className={cn(dataTableHeadClass, index === 0 && "pl-3.5")}
                style={{
                  width: columnMinWidths[index],
                  minWidth: columnMinWidths[index],
                }}
              >
                {column.label}
              </TableHead>
            ))}
            <TableHead className={dataTableActionsHeadClass}>
              Действия
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:last-child]:border-0">
          {bodyRows.map((row) => {
            if (row.kind === "group") {
              const groupId = row.id;
              const expanded = effectiveExpandedIds.has(groupId);
              const isSubgroup = row.depth === 1;
              return (
                <TableRow
                  key={`group:${groupId}`}
                  className={cn(
                    "border-border/70",
                    isSubgroup ? "bg-background" : "bg-muted/70",
                    expanded ? "border-b-transparent" : "border-b-border/70",
                  )}
                >
                  <TableCell
                    colSpan={Math.max(columns.length, 1)}
                    className={cn(
                      "relative min-w-0 px-3 py-2",
                      isSubgroup
                        ? "py-1.5 font-medium text-muted-foreground"
                        : "font-semibold text-foreground",
                    )}
                  >
                    {isSubgroup ? (
                      <TreeBranchGuides
                        isFirst={false}
                        isLast={!expanded}
                        className="left-[11px]"
                        armClassName="w-3"
                        elbowTopPx={18}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-1.5",
                        isSubgroup && "relative pl-5",
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          "relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          expanded && "bg-muted text-foreground",
                          isSubgroup && "size-5",
                        )}
                        aria-label={expanded ? "Свернуть" : "Развернуть"}
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedIds((prev) => {
                            const next = new Set(prev ?? effectiveExpandedIds);
                            if (expanded) next.delete(groupId);
                            else next.add(groupId);
                            return next;
                          });
                        }}
                      >
                        {expanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          isSubgroup ? "text-[12.5px]" : "text-sm",
                        )}
                      >
                        {row.label}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="w-24 min-w-24 max-w-24 px-2 py-1.5 text-right">
                    <span
                      className={cn(
                        "px-0.5 text-[11px] font-medium tabular-nums",
                        isSubgroup
                          ? "text-muted-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.childCount}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }

            const record = row.record;
            const rowKey = `${row.groupId}:${record.id}`;
            const meta = recordMeta?.get(rowKey);
            const indented = Boolean(parentField);
            const indentLevel: 1 | 2 =
              meta?.depth === 2 || row.depth === 2 ? 2 : 1;

            return (
              <TableRow
                key={rowKey}
                className={cn(
                  "border-border/70 hover:bg-muted/35",
                  !disabled && "cursor-pointer",
                )}
                onClick={disabled ? undefined : () => onEdit(record)}
              >
                {columns.map((column, index) => (
                  <CreateAskFieldCell
                    key={column.id}
                    entity={entity}
                    record={record}
                    column={column}
                    entities={entities}
                    ctx={ctx}
                    indent={indented && index === 0}
                    indentLevel={indentLevel}
                    isGroupStart={meta?.isGroupStart}
                    isGroupEnd={meta?.isGroupEnd}
                  />
                ))}
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
                      disabled={disabled}
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
                      disabled={disabled}
                      aria-label="Удалить запись"
                      onClick={() => onDelete(record)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CreateAskDraftCard({
  entity,
  record,
  hideFieldIds,
  entities,
  ctx,
  disabled,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  record: EntityRecord;
  hideFieldIds: ReadonlySet<string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const title = getEntityRecordTitle(ctx, entity, record);
  const fields = getCreateAskCardFields(entity, hideFieldIds).slice(0, 6);

  return (
    <article
      className={cn(
        "group/card overflow-hidden rounded-xl border border-border bg-card",
        !disabled && "cursor-pointer transition-colors hover:bg-muted/20",
      )}
      onClick={disabled ? undefined : onEdit}
    >
      <header className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title.trim() || "Без названия"}
        </h3>
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 focus-within:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8"
            disabled={disabled}
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
            disabled={disabled}
            aria-label="Удалить"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>
      {fields.length > 0 ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          {fields.map((field) => {
            const display = formatRecordFieldValue(ctx, entity, record, field);
            const listPresentation =
              field.type === "list"
                ? resolveEntityListFieldPresentation(field, entities)
                : null;
            return (
              <div key={field.id} className="min-w-0">
                <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {getEntityFieldDisplayName(field)}
                </p>
                {field.type === "list" && listPresentation ? (
                  <div className="mt-1">
                    <ListValueDisplay
                      options={resolveEntityListFieldOptions(field, entities)}
                      value={record.values[field.id]}
                      multiple={listPresentation.listMultiple}
                      showColors={listPresentation.listUseColors}
                    />
                  </div>
                ) : isRecordValueDecorated(field) ? (
                  <RecordValue
                    ctx={ctx}
                    entity={entity}
                    record={record}
                    field={field}
                    className="mt-1 font-medium"
                  />
                ) : (
                  <p
                    className={cn(
                      "mt-1 text-sm font-medium",
                      display === "—"
                        ? "text-muted-foreground/70"
                        : "truncate text-foreground",
                    )}
                    title={display === "—" ? undefined : display}
                  >
                    {display}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function CreateAskPanel({
  title,
  entity,
  records,
  hideFieldIds,
  dialogHiddenFieldIds,
  entities,
  ctx,
  disabled,
  singleRecord = false,
  onAdd,
  onEdit,
  onDelete,
  dialog,
  onDialogOpenChange,
  onDialogSubmit,
  softFillParent = null,
}: {
  title: string;
  entity: Entity;
  records: EntityRecord[];
  hideFieldIds: ReadonlySet<string>;
  dialogHiddenFieldIds: Set<string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  singleRecord?: boolean;
  onAdd: () => void;
  onEdit: (record: EntityRecord) => void;
  onDelete: (record: EntityRecord) => void;
  dialog: DialogState | null;
  onDialogOpenChange: (open: boolean) => void;
  onDialogSubmit: (fieldValues: Record<string, string>) => void;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
}) {
  const recordsDisplay = normalizeEntityRecordsDisplay(entity.recordsDisplay);
  const recordColumns = normalizeEntityRecordColumns(entity.recordColumns);
  const atLimit = singleRecord && records.length >= 1;
  const columnsClass =
    singleRecord || recordColumns === 1
      ? "grid-cols-1"
      : recordColumns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  const dialogRecord = dialog?.mode === "edit" ? dialog.record : null;

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <div className="flex items-center gap-3">
            {singleRecord ? null : (
              <span className="text-sm text-muted-foreground">
                {records.length} записей
              </span>
            )}
            {!disabled && !atLimit ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={onAdd}
              >
                <Plus className="size-3.5" />
                Добавить
              </Button>
            ) : null}
          </div>
        </header>

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Нет записей</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {singleRecord
                ? "Добавьте запись, чтобы она появилась здесь."
                : "Добавьте первую запись, чтобы она появилась здесь."}
            </p>
          </div>
        ) : recordsDisplay === "table" && !singleRecord ? (
          <CreateAskDraftsTable
            entity={entity}
            records={records}
            hideFieldIds={hideFieldIds}
            entities={entities}
            ctx={ctx}
            disabled={disabled}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <div className={cn("grid gap-3 p-4", columnsClass)}>
            {records.map((record) => (
              <CreateAskDraftCard
                key={record.id}
                entity={entity}
                record={record}
                hideFieldIds={hideFieldIds}
                entities={entities}
                ctx={ctx}
                disabled={disabled}
                onEdit={() => onEdit(record)}
                onDelete={() => onDelete(record)}
              />
            ))}
          </div>
        )}
      </section>

      <EntityRecordDialog
        open={dialog != null}
        onOpenChange={onDialogOpenChange}
        entity={entity}
        record={dialogRecord}
        entities={entities}
        softFillParent={softFillParent}
        hiddenFieldIds={dialogHiddenFieldIds}
        titleOverride={
          dialog?.mode === "create" ? `Новая запись · ${title}` : undefined
        }
        submitLabel={dialog?.mode === "create" ? "Добавить" : "Сохранить"}
        onSubmit={(fieldValues) => {
          onDialogSubmit(fieldValues);
        }}
      />
    </>
  );
}

function CreateAskNestedPanel({
  title,
  nested,
  entity,
  actionId,
  values,
  entities,
  ctx,
  disabled,
  onValuesChange,
  softFillParent = null,
}: {
  title: string;
  nested: AutomationCreateAskNestedSlot;
  entity: Entity;
  actionId: string;
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onValuesChange: (next: Record<string, string>) => void;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const count = getNestedDraftCount(values, actionId, nested.nestedId);
  const records = useMemo(
    () =>
      Array.from({ length: count }, (_, index) =>
        buildCreateAskDraftRecord(
          values,
          actionId,
          nested.nestedId,
          index,
          nested.askFieldIds,
        ),
      ),
    [actionId, count, nested.askFieldIds, nested.nestedId, values],
  );

  const hideFieldIds = useMemo(() => {
    const ids = new Set<string>();
    const parentLinkId = getEntityParentLinkField(entity)?.id ?? null;
    for (const field of entity.fields) {
      if (!nested.askFieldIds.includes(field.id)) ids.add(field.id);
      if (parentLinkId && field.id === parentLinkId) ids.add(field.id);
    }
    return ids;
  }, [entity, nested.askFieldIds]);

  function openCreate() {
    setDialog({ mode: "create" });
  }

  function openEdit(record: EntityRecord) {
    const index = records.findIndex((item) => item.id === record.id);
    if (index < 0) return;
    setDialog({ mode: "edit", index, record: records[index]! });
  }

  function handleDelete(record: EntityRecord) {
    const index = records.findIndex((item) => item.id === record.id);
    if (index < 0) return;
    onValuesChange(removeNestedDraftRow(values, actionId, nested, index));
  }

  function handleDialogSubmit(fieldValues: Record<string, string>) {
    if (!dialog) return;
    if (dialog.mode === "create") {
      const withRow = addNestedDraftRow(values, actionId, nested);
      const index = getNestedDraftCount(withRow, actionId, nested.nestedId) - 1;
      onValuesChange(
        writeNestedAskFieldValues(
          withRow,
          actionId,
          nested.nestedId,
          index,
          nested.askFieldIds,
          fieldValues,
        ),
      );
    } else {
      onValuesChange(
        writeNestedAskFieldValues(
          values,
          actionId,
          nested.nestedId,
          dialog.index,
          nested.askFieldIds,
          fieldValues,
        ),
      );
    }
    setDialog(null);
  }

  return (
    <CreateAskPanel
      title={title}
      entity={entity}
      records={records}
      hideFieldIds={hideFieldIds}
      dialogHiddenFieldIds={hideFieldIds}
      entities={entities}
      ctx={ctx}
      disabled={disabled}
      softFillParent={softFillParent}
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={handleDelete}
      dialog={dialog}
      onDialogOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
      onDialogSubmit={handleDialogSubmit}
    />
  );
}

function CreateAskSinglePanel({
  title,
  slot,
  entity,
  values,
  entities,
  ctx,
  disabled,
  onValuesChange,
  nestedPanels,
  softFillParent = null,
}: {
  title: string;
  slot: AutomationCreateAskSlot;
  entity: Entity;
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onValuesChange: (next: Record<string, string>) => void;
  nestedPanels: ReactNode;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const hasDraft = singleCreateAskHasDraft(
    values,
    slot.actionId,
    slot.askFieldIds,
  );
  const records = useMemo(
    () =>
      hasDraft
        ? [
            buildSingleCreateAskDraftRecord(
              values,
              slot.actionId,
              slot.askFieldIds,
            ),
          ]
        : [],
    [hasDraft, slot.actionId, slot.askFieldIds, values],
  );

  const hideFieldIds = useMemo(() => {
    const ids = new Set<string>();
    const parentLinkId = getEntityParentLinkField(entity)?.id ?? null;
    for (const field of entity.fields) {
      if (!slot.askFieldIds.includes(field.id)) ids.add(field.id);
      if (parentLinkId && field.id === parentLinkId) ids.add(field.id);
    }
    return ids;
  }, [entity, slot.askFieldIds]);

  return (
    <div className="flex flex-col gap-4">
      <CreateAskPanel
        title={title}
        entity={entity}
        records={records}
        hideFieldIds={hideFieldIds}
        dialogHiddenFieldIds={hideFieldIds}
        entities={entities}
        ctx={ctx}
        disabled={disabled}
        singleRecord
        softFillParent={softFillParent}
        onAdd={() => setDialog({ mode: "create" })}
        onEdit={(record) => setDialog({ mode: "edit", index: 0, record })}
        onDelete={() =>
          onValuesChange(
            clearSingleCreateAskFieldValues(
              values,
              slot.actionId,
              slot.askFieldIds,
            ),
          )
        }
        dialog={dialog}
        onDialogOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onDialogSubmit={(fieldValues) => {
          onValuesChange(
            writeSingleCreateAskFieldValues(
              values,
              slot.actionId,
              slot.askFieldIds,
              fieldValues,
            ),
          );
          setDialog(null);
        }}
      />
      {nestedPanels}
    </div>
  );
}

export function TaskCreateRecordAsk({
  slots,
  values,
  entities,
  ctx,
  disabled,
  softFillParent = null,
  onChange: _onChange,
  onValuesChange,
}: {
  slots: AutomationCreateAskSlot[];
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
  /** Kept for API compatibility; drafts are written via onValuesChange. */
  onChange: (draftKey: string, value: string) => void;
  onValuesChange: (next: Record<string, string>) => void;
}) {
  void _onChange;
  if (slots.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {slots.map((slot) => {
        const entity = entities.find((item) => item.id === slot.entityId);
        if (!entity) return null;

        if (slot.underRelatedParents) {
          const triggerMulti =
            slot.multiple === true ? createAskMultiNestedSlot(slot) : null;
          const relatedParents = slot.underRelatedParents;
          return (
            <div key={slot.actionId} className="flex flex-col gap-4">
              {relatedParents.length === 0 ? (
                <section className="overflow-hidden rounded-xl border border-dashed border-border bg-card">
                  <header className="border-b border-border px-4 py-3">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {slot.entityLabel}
                    </h2>
                  </header>
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Сначала нужны записи «
                    {slot.underRelatedEmptyLabel ?? "связанной подсущности"}»
                  </div>
                </section>
              ) : (
                relatedParents.map((parent) => (
                  <CreateAskNestedPanel
                    key={parent.parentRecordId}
                    title={
                      relatedParents.length === 1 && !triggerMulti
                        ? slot.entityLabel
                        : `${slot.entityLabel} · ${parent.parentTitle}`
                    }
                    nested={{
                      nestedId: parent.nestedId,
                      entityId: slot.entityId,
                      entityLabel: slot.entityLabel,
                      askFieldIds: slot.askFieldIds,
                      askRequiredFieldIds: slot.askRequiredFieldIds,
                      fieldAskOptions: slot.fieldAskOptions,
                    }}
                    entity={entity}
                    actionId={slot.actionId}
                    values={values}
                    entities={entities}
                    ctx={ctx}
                    disabled={disabled}
                    softFillParent={softFillParent}
                    onValuesChange={onValuesChange}
                  />
                ))
              )}
              {triggerMulti ? (
                <CreateAskNestedPanel
                  title={`${slot.entityLabel} · текущая запись`}
                  nested={triggerMulti}
                  entity={entity}
                  actionId={slot.actionId}
                  values={values}
                  entities={entities}
                  ctx={ctx}
                  disabled={disabled}
                  softFillParent={softFillParent}
                  onValuesChange={onValuesChange}
                />
              ) : null}
            </div>
          );
        }

        if (slot.multiple) {
          const multi = createAskMultiNestedSlot(slot);
          return (
            <CreateAskNestedPanel
              key={slot.actionId}
              title={slot.entityLabel}
              nested={multi}
              entity={entity}
              actionId={slot.actionId}
              values={values}
              entities={entities}
              ctx={ctx}
              disabled={disabled}
              softFillParent={softFillParent}
              onValuesChange={onValuesChange}
            />
          );
        }

        return (
          <CreateAskSinglePanel
            key={slot.actionId}
            title={slot.entityLabel}
            slot={slot}
            entity={entity}
            values={values}
            entities={entities}
            ctx={ctx}
            disabled={disabled}
            softFillParent={softFillParent}
            onValuesChange={onValuesChange}
            nestedPanels={slot.nested.map((nested) => {
              const child = entities.find(
                (item) => item.id === nested.entityId,
              );
              if (!child) return null;
              return (
                <CreateAskNestedPanel
                  key={nested.nestedId}
                  title={nested.entityLabel}
                  nested={nested}
                  entity={child}
                  actionId={slot.actionId}
                  values={values}
                  entities={entities}
                  ctx={ctx}
                  disabled={disabled}
                  softFillParent={softFillParent}
                  onValuesChange={onValuesChange}
                />
              );
            })}
          />
        );
      })}
    </div>
  );
}
