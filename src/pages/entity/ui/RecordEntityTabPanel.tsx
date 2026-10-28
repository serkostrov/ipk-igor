import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import { TreeBranchGuides } from "@/shared/ui/tree-branch-guides";
import {
  addEntityRecord,
  updateEntityRecord,
  waitForEntityRecordInsert,
  buildEntityTableDisplayColumns,
  encodeEntityTableParentValue,
  entityRelationIncludesId,
  entityTableDisplayColumnIncludeInTotal,
  flattenEntityTableHierarchyRows,
  flattenEntityTableNestedRows,
  formatEntityDecimalTotal,
  formatRecordFieldValue,
  ENTITY_FIELD_GROUP_COLUMNS,
  getEntityFieldDisplayName,
  getEntityRecordTitle,
  getEntityTableDisplayColumnNumber,
  getEntityTableFields,
  isEntityFieldGroupTitleHidden,
  isEntityFieldVisibleByConditions,
  isEntityFieldVisibleOnRecord,
  isEntityInternal,
  isEntityTableDisplayColumnNumeric,
  isEntityTableRelationGroupsNestedSubgroup,
  getRelationRecordOptions,
  groupEntityFields,
  isEntityNameField,
  isEntityParentLinkField,
  isEntitySubEntity,
  isRecordValueDecorated,
  ListValueDisplay,
  PRIMARY_ENTITY_FIELD_GROUP,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  parseEntityRelationIds,
  removeEntityRecord,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  resolveEntityTableDisplayColumnField,
  resolveEntityTableNestedTarget,
  resolveEntityTableParentField,
  resolveEntityTableSubgroupField,
  RecordValue,
  serializeEntityRelationIds,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTab,
  type EntityTableDisplayColumn,
  type EntityValueContext,
} from "@/entities/entity";
import {
  collectLinkedTabRecordIds,
  collectRecordsLinkedToParent,
  resolveLinkedTabParentLinkFieldId,
} from "@/entities/automation";
import { isDeptCalculationsEntity } from "@/features/hardcode";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_TABLE_ACTIONS_WIDTH,
  getEntityTableHeaderMinWidth,
} from "../lib/table-column-width";
import { DeptCalculationsView } from "./DeptCalculationsView";
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
  /** Task / preview: same layout, no add / edit / delete. */
  readOnly?: boolean;
};

type AddFlow = "closed" | "choice" | "existing";

function getRecordCardFields(entity: Entity, parentLinkFieldId: string | null) {
  return entity.fields.filter(
    (field) =>
      !isEntityNameField(field) &&
      !isEntityParentLinkField(field, parentLinkFieldId) &&
      isEntityFieldVisibleOnRecord(field),
  );
}

function getLinkedTableColumns(
  entity: Entity,
  parentLinkFieldId: string | null,
  /** When grouping by a field, hide those columns (value is already the group). */
  hierarchyFieldIds: ReadonlySet<string> | string | null = null,
): EntityTableDisplayColumn[] {
  const hideIds =
    hierarchyFieldIds == null
      ? null
      : typeof hierarchyFieldIds === "string"
        ? new Set([hierarchyFieldIds])
        : hierarchyFieldIds;
  const tableFields = getEntityTableFields(entity.fields, {
    preferArrayOrder: isEntityInternal(entity),
  }).filter(
    (field) =>
      !isEntityParentLinkField(field, parentLinkFieldId) &&
      !hideIds?.has(field.id),
  );
  if (tableFields.length > 0) {
    return buildEntityTableDisplayColumns(tableFields);
  }
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const fallback = getRecordCardFields(entity, parentLinkFieldId)
    .filter((field) => !hideIds?.has(field.id))
    .slice(0, 4);
  const fields = nameField ? [nameField, ...fallback] : fallback;
  return buildEntityTableDisplayColumns(fields);
}

/**
 * Nested-row fields: child entity table columns (`showInTable`), excluding
 * the title (already in the first cell), the parent-link relation, and
 * fields hidden by `visibilityConditions`.
 */
function getNestedRowDisplayFields(
  nestedEntity: Entity,
  parentLinkFieldId: string | null,
  valueContext: EntityValueContext,
  record: EntityRecord,
) {
  return getEntityTableFields(nestedEntity.fields, {
    preferArrayOrder: isEntityInternal(nestedEntity),
  }).filter(
    (field) =>
      !isEntityNameField(field) &&
      !isEntityParentLinkField(field, parentLinkFieldId) &&
      isEntityFieldVisibleByConditions(
        valueContext,
        nestedEntity,
        record,
        field,
      ),
  );
}

function NestedRecordFieldValue({
  entity,
  record,
  field,
  entities,
  valueContext,
}: {
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  entities: Entity[];
  valueContext: EntityValueContext;
}) {
  const display = formatRecordFieldValue(valueContext, entity, record, field);
  if (field.type === "list") {
    const presentation = resolveEntityListFieldPresentation(field, entities);
    return (
      <ListValueDisplay
        options={resolveEntityListFieldOptions(field, entities)}
        value={record.values[field.id]}
        multiple={presentation.listMultiple}
        showColors={presentation.listUseColors}
      />
    );
  }
  if (isRecordValueDecorated(field)) {
    return (
      <RecordValue
        ctx={valueContext}
        entity={entity}
        record={record}
        field={field}
      />
    );
  }
  return (
    <span
      className={cn(
        "block truncate",
        display === "—" && "text-muted-foreground/60",
      )}
    >
      {display}
    </span>
  );
}

function NestedRecordFieldsStrip({
  entity,
  record,
  fields,
  entities,
  valueContext,
}: {
  entity: Entity;
  record: EntityRecord;
  fields: EntityField[];
  entities: Entity[];
  valueContext: EntityValueContext;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
      {fields.map((field) => {
        const display = formatRecordFieldValue(
          valueContext,
          entity,
          record,
          field,
        );
        return (
          <div
            key={field.id}
            className="min-w-0 max-w-[14rem] text-sm text-foreground/90"
            title={
              display === "—"
                ? getEntityFieldDisplayName(field)
                : `${getEntityFieldDisplayName(field)}: ${display}`
            }
          >
            <NestedRecordFieldValue
              entity={entity}
              record={record}
              field={field}
              entities={entities}
              valueContext={valueContext}
            />
          </div>
        );
      })}
    </div>
  );
}

function RecordsTableFieldCell({
  entity,
  record,
  column,
  entities,
  valueContext,
  indent = false,
  indentLevel = 1,
  isGroupStart = false,
  isGroupEnd = false,
  leading = null,
  emphasize = false,
}: {
  entity: Entity;
  record: EntityRecord;
  column: EntityTableDisplayColumn;
  entities: Entity[];
  valueContext: EntityValueContext;
  indent?: boolean;
  /** 1 — under root group; 2 — under subgroup. */
  indentLevel?: 1 | 2;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  /** Content before the value (e.g. hierarchy expand control). */
  leading?: ReactNode;
  emphasize?: boolean;
}) {
  const field =
    resolveEntityTableDisplayColumnField(
      valueContext,
      entity,
      record,
      column,
    ) ?? column.fields[0];
  if (!field) {
    return (
      <TableCell className="relative min-w-0 overflow-hidden px-3 py-2 text-muted-foreground/70">
        —
      </TableCell>
    );
  }
  const display = formatRecordFieldValue(valueContext, entity, record, field);
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
    </>
  );

  return (
    <TableCell
      className={cn(
        "relative min-w-0 overflow-hidden px-3 py-2 text-foreground/90",
        (indent || leading) && "pl-3.5",
        emphasize && "font-medium text-foreground",
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
      {leading ? (
        <div className="flex min-w-0 items-center gap-1.5">
          {leading}
          <div className="min-w-0 flex-1">{value}</div>
        </div>
      ) : (
        <div
          className={cn(
            indent && "relative",
            indent && (indentLevel === 2 ? "pl-11" : "pl-5"),
          )}
        >
          {value}
        </div>
      )}
    </TableCell>
  );
}

function RecordsTable({
  entity,
  records,
  parentLinkFieldId,
  onEdit,
  onDelete,
  onOpenNested,
  onCreateNestedChild,
  onCreateInHierarchy,
}: {
  entity: Entity;
  records: EntityRecord[];
  parentLinkFieldId: string | null;
  onEdit?: (record: EntityRecord) => void;
  onDelete?: (record: EntityRecord) => void;
  onOpenNested?: (entityId: string, recordId: string) => void;
  /** Create a nested-entity record under this host row (nested hierarchy). */
  onCreateNestedChild?: (parentRecordId: string) => void;
  /** Create a record under a hierarchy group / subgroup (field grouping). */
  onCreateInHierarchy?: (groupValue: string, subgroupValue?: string) => void;
}) {
  const canMutate = onEdit != null || onDelete != null;
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const nestedTarget = resolveEntityTableNestedTarget(entity, entities);
  const parentField = nestedTarget
    ? null
    : resolveEntityTableParentField(entity);
  const subgroupField = nestedTarget
    ? null
    : resolveEntityTableSubgroupField(entity);
  /** `null` — all groups expanded by default until the user toggles. */
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const hierarchyGroupIds = useMemo(() => {
    if (nestedTarget) {
      return flattenEntityTableNestedRows(
        records,
        nestedTarget,
        new Set(),
        (record) => getEntityRecordTitle(valueContext, entity, record),
      )
        .filter((row) => row.kind === "group")
        .map((row) => row.id);
    }
    if (!parentField) return [] as string[];
    // Fully expand roots so subgroup row ids are included.
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
  }, [
    entities,
    entity,
    nestedTarget,
    parentField,
    records,
    subgroupField,
    valueContext,
  ]);

  const effectiveExpandedIds = useMemo(
    () => expandedIds ?? new Set(hierarchyGroupIds),
    [expandedIds, hierarchyGroupIds],
  );

  const hierarchyRows = useMemo(() => {
    if (nestedTarget) {
      return flattenEntityTableNestedRows(
        records,
        nestedTarget,
        effectiveExpandedIds,
        (record) => getEntityRecordTitle(valueContext, entity, record),
      );
    }
    if (!parentField) return null;
    return flattenEntityTableHierarchyRows(
      records,
      parentField,
      effectiveExpandedIds,
      entities,
      subgroupField,
    );
  }, [
    effectiveExpandedIds,
    entities,
    entity,
    nestedTarget,
    parentField,
    records,
    subgroupField,
    valueContext,
  ]);

  /** Child counts for nested groups (even when collapsed). */
  const nestedChildCountByParentId = useMemo(() => {
    if (!nestedTarget) return null;
    const map = new Map<string, number>();
    for (const parent of records) {
      const count = nestedTarget.entity.records.filter((record) =>
        entityRelationIncludesId(
          record.values[nestedTarget.parentLinkFieldId],
          parent.id,
        ),
      ).length;
      map.set(parent.id, count);
    }
    return map;
  }, [nestedTarget, records]);

  const columns = getLinkedTableColumns(
    entity,
    parentLinkFieldId,
    parentField
      ? new Set(
          [parentField.id, subgroupField?.id].filter((id): id is string =>
            Boolean(id),
          ),
        )
      : null,
  );
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
  const totalColumns = columns.filter((column) =>
    entityTableDisplayColumnIncludeInTotal(column),
  );
  const showTotalsRow =
    !nestedTarget && totalColumns.length > 0 && records.length > 0;
  const columnTotals = showTotalsRow
    ? Object.fromEntries(
        totalColumns.map((column) => [
          column.id,
          records.reduce(
            (sum, record) =>
              sum +
              (getEntityTableDisplayColumnNumber(
                valueContext,
                entity,
                record,
                column,
              ) ?? 0),
            0,
          ),
        ]),
      )
    : {};

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
      if (!row || (row.kind !== "record" && row.kind !== "nested")) continue;
      const prev = hierarchyRows[i - 1];
      const next = hierarchyRows[i + 1];
      // Same immediate parent: start/end of the contiguous record block.
      const prevSame =
        prev?.kind === "record" || prev?.kind === "nested"
          ? prev.groupId === row.groupId
          : false;
      const nextSame =
        next?.kind === "record" || next?.kind === "nested"
          ? next.groupId === row.groupId
          : false;
      meta.set(`${row.groupId}:${row.record.id}`, {
        isGroupStart: !prevSame,
        isGroupEnd: !nextSame,
        depth: "depth" in row ? row.depth : 1,
      });
    }
    return meta;
  }, [hierarchyRows]);

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
          {canMutate ? (
            <col
              style={{
                width: ENTITY_TABLE_ACTIONS_WIDTH,
                minWidth: ENTITY_TABLE_ACTIONS_WIDTH,
              }}
            />
          ) : null}
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
            {canMutate ? (
              <TableHead className={dataTableActionsHeadClass}>
                Действия
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:last-child]:border-0">
          {bodyRows.map((row) => {
            if (row.kind === "group") {
              const groupId = row.id;
              const expanded = effectiveExpandedIds.has(groupId);
              const parentRecord =
                "parentRecord" in row ? row.parentRecord : null;
              const nestedCount =
                nestedChildCountByParentId?.get(groupId) ?? row.childCount;

              function toggleExpanded(event: { stopPropagation: () => void }) {
                event.stopPropagation();
                setExpandedIds((prev) => {
                  const next = new Set(prev ?? effectiveExpandedIds);
                  if (expanded) next.delete(groupId);
                  else next.add(groupId);
                  return next;
                });
              }

              const expandButton = (
                <button
                  type="button"
                  className={cn(
                    "relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    expanded && "bg-muted text-foreground",
                  )}
                  aria-label={expanded ? "Свернуть" : "Развернуть"}
                  aria-expanded={expanded}
                  onClick={toggleExpanded}
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              );

              // Nested hierarchy: parent is a normal record row; children follow as list rows.
              if (parentRecord && nestedTarget) {
                const nestedLabel = nestedTarget.label.trim() || "Связанные";
                const showEmptyAdd = expanded && nestedCount === 0;
                return (
                  <Fragment key={`group:${groupId}`}>
                    <TableRow
                      className={cn(
                        "border-border/70 hover:bg-muted/35",
                        onEdit && "cursor-pointer",
                        expanded && "border-b-transparent",
                      )}
                      onClick={onEdit ? () => onEdit(parentRecord) : undefined}
                    >
                      {columns.map((column, index) => (
                        <RecordsTableFieldCell
                          key={column.id}
                          entity={entity}
                          record={parentRecord}
                          column={column}
                          entities={entities}
                          valueContext={valueContext}
                          emphasize={index === 0}
                          leading={
                            index === 0 ? (
                              <span className="inline-flex items-center gap-1.5">
                                {expandButton}
                                {!expanded && nestedCount > 0 ? (
                                  <span
                                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                                    title={`${nestedLabel}: ${nestedCount}`}
                                  >
                                    {nestedCount}
                                  </span>
                                ) : null}
                              </span>
                            ) : null
                          }
                        />
                      ))}
                      {canMutate ? (
                        <TableCell className="w-24 min-w-24 max-w-24 px-2 py-1.5 text-right">
                          <div
                            className="inline-flex items-center justify-end gap-0.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {onEdit ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 text-foreground"
                                aria-label="Редактировать запись"
                                onClick={() => onEdit(parentRecord)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                            {onDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 text-foreground hover:text-destructive"
                                aria-label="Удалить запись"
                                onClick={() => onDelete(parentRecord)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                    {showEmptyAdd && onCreateNestedChild ? (
                      <TableRow className="border-border/70 hover:bg-transparent">
                        <TableCell
                          colSpan={columns.length + (canMutate ? 1 : 0)}
                          className="relative px-3 py-1.5 pl-3.5"
                        >
                          <TreeBranchGuides
                            isFirst
                            isLast
                            className="left-[23px]"
                            armClassName="w-3"
                            elbowTopPx={18}
                          />
                          <button
                            type="button"
                            className="relative ml-8 flex h-8 w-full max-w-md items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                            onClick={() => onCreateNestedChild(groupId)}
                          >
                            <Plus className="size-3.5 shrink-0" />
                            Добавить в «{nestedLabel}»
                          </button>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              }

              // List-field hierarchy: option label only (root or subgroup).
              const isSubgroup = row.depth === 1;
              const rootGroupId = isSubgroup
                ? (row.parentGroupId ?? "")
                : row.id;
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
                      {expandButton}
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
                    <div
                      className="inline-flex items-center justify-end gap-0.5"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                      {onCreateInHierarchy && parentField ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={cn(
                            "text-foreground",
                            isSubgroup ? "size-6" : "size-7",
                          )}
                          aria-label="Добавить запись в группу"
                          title="Добавить запись в группу"
                          onClick={() => {
                            setExpandedIds((prev) => {
                              const next = new Set(
                                prev ?? effectiveExpandedIds,
                              );
                              next.add(groupId);
                              if (rootGroupId) next.add(rootGroupId);
                              return next;
                            });
                            onCreateInHierarchy(
                              rootGroupId,
                              isSubgroup ? row.valueId : undefined,
                            );
                          }}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }

            if (row.kind === "nested") {
              const nestedEntity = nestedTarget!.entity;
              const meta = recordMeta?.get(`${row.groupId}:${row.record.id}`);
              const title = getEntityRecordTitle(
                valueContext,
                nestedEntity,
                row.record,
              );
              const nestedFields = getNestedRowDisplayFields(
                nestedEntity,
                nestedTarget!.parentLinkFieldId,
                valueContext,
                row.record,
              );
              const isLastChild = meta?.isGroupEnd === true;
              const showAddAfter =
                isLastChild && Boolean(onCreateNestedChild) && nestedTarget;
              const restColSpan = Math.max(columns.length - 1, 0);

              return (
                <Fragment key={`nested:${row.record.id}`}>
                  <TableRow
                    className={cn(
                      "group/nested cursor-pointer border-border/70 hover:bg-muted/40",
                      isLastChild && !showAddAfter
                        ? "border-b-border/70"
                        : "border-b-transparent",
                    )}
                    onClick={() =>
                      onOpenNested?.(nestedTarget!.entityId, row.record.id)
                    }
                  >
                    <TableCell className="relative min-w-0 overflow-hidden px-3 py-2 pl-3.5">
                      <TreeBranchGuides
                        isFirst={meta?.isGroupStart}
                        isLast={isLastChild && !showAddAfter}
                        className="left-[23px]"
                        armClassName="w-3"
                        elbowTopPx={18}
                      />
                      <div className="relative ml-8 min-w-0 py-0.5">
                        <span
                          className="block truncate text-sm font-medium text-foreground"
                          title={title}
                        >
                          {title}
                        </span>
                        {nestedFields.length > 0 && restColSpan === 0 ? (
                          <div className="mt-1.5">
                            <NestedRecordFieldsStrip
                              entity={nestedEntity}
                              record={row.record}
                              fields={nestedFields}
                              entities={entities}
                              valueContext={valueContext}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    {restColSpan > 0 ? (
                      <TableCell
                        colSpan={restColSpan}
                        className="min-w-0 overflow-hidden px-3 py-2 align-middle"
                      >
                        <NestedRecordFieldsStrip
                          entity={nestedEntity}
                          record={row.record}
                          fields={nestedFields}
                          entities={entities}
                          valueContext={valueContext}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="w-24 min-w-24 max-w-24 px-2 py-2 text-right align-middle">
                      <div
                        className="inline-flex items-center justify-end opacity-0 transition-opacity group-hover/nested:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          aria-label="Открыть"
                          title="Открыть"
                          onClick={() =>
                            onOpenNested?.(
                              nestedTarget!.entityId,
                              row.record.id,
                            )
                          }
                        >
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {showAddAfter ? (
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length + (canMutate ? 1 : 0)}
                        className="relative px-3 py-1 pl-3.5"
                      >
                        <TreeBranchGuides
                          isFirst={false}
                          isLast
                          className="left-[23px]"
                          armClassName="w-3"
                          elbowTopPx={16}
                        />
                        <button
                          type="button"
                          className="relative ml-8 flex h-8 w-full max-w-md items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          onClick={() => onCreateNestedChild?.(row.groupId)}
                        >
                          <Plus className="size-3.5 shrink-0" />
                          Добавить
                        </button>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
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
                  onEdit && "cursor-pointer",
                )}
                onClick={onEdit ? () => onEdit(record) : undefined}
              >
                {columns.map((column, index) => (
                  <RecordsTableFieldCell
                    key={column.id}
                    entity={entity}
                    record={record}
                    column={column}
                    entities={entities}
                    valueContext={valueContext}
                    indent={indented && index === 0}
                    indentLevel={indentLevel}
                    isGroupStart={meta?.isGroupStart}
                    isGroupEnd={meta?.isGroupEnd}
                  />
                ))}
                {canMutate ? (
                  <TableCell className="w-24 min-w-24 max-w-24 px-2 py-1.5 text-right">
                    <div
                      className="inline-flex items-center justify-end gap-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {onEdit ? (
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
                      ) : null}
                      {onDelete ? (
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
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
        {showTotalsRow ? (
          <TableFooter className="sticky bottom-0 z-[5] border-t border-border bg-muted [&>tr]:h-9 [&>tr]:border-0">
            <TableRow className="h-9 hover:bg-transparent">
              {columns.map((column, index) => {
                const isTotalColumn =
                  entityTableDisplayColumnIncludeInTotal(column);
                const totalValue = isTotalColumn
                  ? formatEntityDecimalTotal(columnTotals[column.id] ?? 0)
                  : null;

                return (
                  <TableCell
                    key={column.id}
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
              {canMutate ? (
                <TableCell className={dataTableActionsFootClass} />
              ) : null}
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
const RECORD_CARD_FIELD_COLUMNS = 4;

function fieldColSpanOf(value: number | string | undefined) {
  const span = typeof value === "string" ? Number(value) : (value ?? 1);
  return Math.min(
    RECORD_CARD_FIELD_COLUMNS,
    Math.max(1, Number.isFinite(span) ? span : 1),
  );
}

function RecordCardFieldValue({
  entity,
  record,
  field,
  entities,
  valueContext,
}: {
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  entities: Entity[];
  valueContext: EntityValueContext;
}) {
  const label = getEntityFieldDisplayName(field);
  const display = formatRecordFieldValue(valueContext, entity, record, field);
  const empty = display === "—";
  const listPresentation =
    field.type === "list"
      ? resolveEntityListFieldPresentation(field, entities)
      : null;

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
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
          ctx={valueContext}
          entity={entity}
          record={record}
          field={field}
          className="mt-1 font-medium"
        />
      ) : (
        <p
          className={cn(
            "mt-1 text-sm font-medium",
            empty ? "text-muted-foreground/70" : "text-foreground",
            !empty && "truncate",
          )}
          title={empty ? undefined : display}
        >
          {display}
        </p>
      )}
    </div>
  );
}

function RecordCard({
  entity,
  record,
  parentLinkFieldId,
  single = false,
  onEdit,
  onDelete,
}: {
  entity: Entity;
  record: EntityRecord;
  parentLinkFieldId: string | null;
  /** Full layout from field settings; never collapses. */
  single?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const fields = getRecordCardFields(entity, parentLinkFieldId);
  const groups = groupEntityFields(fields, entity.fieldGroups).filter(
    (group) => group.fields.length > 0,
  );
  const flatFields = groups.flatMap((group) => group.fields);
  const title = getRecordTitle(valueContext, entity, record);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (single) return;
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
  }, [flatFields.length, record.id, single]);

  const showToggle = !single && (overflows || expanded);
  const showGroupHeaders =
    single &&
    groups.length > 1 &&
    groups.some(
      (group) =>
        group.name !== PRIMARY_ENTITY_FIELD_GROUP &&
        !isEntityFieldGroupTitleHidden(group.name, entity.fieldGroups),
    );

  return (
    <article className="group/card overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
        {onEdit || onDelete ? (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 focus-within:opacity-100">
            {onEdit ? (
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
            ) : null}
            {onDelete ? (
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
            ) : null}
          </div>
        ) : null}
      </header>

      {single ? (
        <div className="grid grid-cols-2 items-start gap-4 p-4">
          {groups.map((group) => {
            const span = Math.min(
              ENTITY_FIELD_GROUP_COLUMNS,
              Math.max(1, group.colSpan),
            );
            const showHeader =
              showGroupHeaders &&
              group.name !== PRIMARY_ENTITY_FIELD_GROUP &&
              !isEntityFieldGroupTitleHidden(group.name, entity.fieldGroups);
            return (
              <div
                key={group.name}
                className={cn(
                  "min-w-0",
                  showHeader &&
                    "overflow-hidden rounded-lg border border-border/70",
                )}
                style={{ gridColumn: `span ${span}` }}
              >
                {showHeader ? (
                  <header className="flex h-8 items-center border-b border-border/70 bg-muted/30 px-3">
                    <h4 className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {group.name}
                    </h4>
                  </header>
                ) : null}
                <div
                  className={cn(
                    "grid gap-x-6 gap-y-4",
                    showHeader ? "p-3" : null,
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${RECORD_CARD_FIELD_COLUMNS}, minmax(0, 1fr))`,
                  }}
                >
                  {group.fields.map((field) => (
                    <div
                      key={field.id}
                      className="min-w-0"
                      style={{
                        gridColumn: `span ${fieldColSpanOf(field.colSpan)}`,
                      }}
                    >
                      <RecordCardFieldValue
                        entity={entity}
                        record={record}
                        field={field}
                        entities={entities}
                        valueContext={valueContext}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
            {flatFields.map((field) => (
              <RecordCardFieldValue
                key={field.id}
                entity={entity}
                record={record}
                field={field}
                entities={entities}
                valueContext={valueContext}
              />
            ))}
          </div>

          {showToggle && !expanded ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
            />
          ) : null}
        </div>
      )}

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
  onOpenRelation,
  readOnly = false,
}: RecordEntityTabPanelProps) {
  const valueContext = useEntityValueContext();
  const parentLinkFieldId =
    resolveLinkedTabParentLinkFieldId(tab, linkedEntity, parentEntityId) ??
    tab.parentLinkFieldId;
  const isSelfRef = linkedEntity.id === parentEntityId;
  const [addFlow, setAddFlow] = useState<AddFlow>("closed");
  const [dialogRecord, setDialogRecord] = useState<EntityRecord | null | "new">(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<EntityRecord | null>(null);
  /** Host record id for creating a nested-entity child under it. */
  const [nestedCreateParentId, setNestedCreateParentId] = useState<
    string | null
  >(null);
  /** Prefill hierarchy group / subgroup when creating from a table group row. */
  const [createHierarchy, setCreateHierarchy] = useState<{
    groupId: string;
    subgroupId?: string;
  } | null>(null);

  const nestedTarget = useMemo(
    () => resolveEntityTableNestedTarget(linkedEntity, entities),
    [entities, linkedEntity],
  );
  const nestedEntity = nestedTarget
    ? (entities.find((item) => item.id === nestedTarget.entityId) ??
      nestedTarget.entity)
    : null;

  const hostEntity = useMemo(
    () => entities.find((item) => item.id === parentEntityId) ?? null,
    [entities, parentEntityId],
  );

  const parentRecord = useMemo(() => {
    if (isSelfRef) {
      return (
        linkedEntity.records.find((item) => item.id === parentRecordId) ?? null
      );
    }
    return (
      hostEntity?.records.find((item) => item.id === parentRecordId) ?? null
    );
  }, [hostEntity, isSelfRef, linkedEntity.records, parentRecordId]);

  const records = useMemo(() => {
    let ids = collectLinkedTabRecordIds({
      tab,
      linkedEntity,
      parentEntityId,
      parentRecordId,
    });
    if (ids.length === 0) {
      ids = collectRecordsLinkedToParent({
        childEntity: linkedEntity,
        parentEntityId,
        parentRecordId,
        host: hostEntity,
      });
    }
    if (ids.length === 0) return [];
    const byId = new Map(
      (linkedEntity.records ?? []).map((record) => [record.id, record]),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((record): record is EntityRecord => record != null);
  }, [hostEntity, linkedEntity, parentEntityId, parentRecordId, tab]);

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
  const singleRecord = Boolean(tab.singleRecord);
  const atSingleRecordLimit = singleRecord && records.length >= 1;
  const columnsClass =
    singleRecord || recordColumns === 1
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

  const tableParentField = resolveEntityTableParentField(linkedEntity);
  const tableSubgroupField = resolveEntityTableSubgroupField(linkedEntity);
  const nestedRelationGroupsSubgroup =
    isEntityTableRelationGroupsNestedSubgroup(
      tableParentField,
      tableSubgroupField,
    );

  const presetValues =
    dialogRecord === "new"
      ? {
          ...(parentLinkFieldId ? { [parentLinkFieldId]: parentRecordId } : {}),
          ...(createHierarchy && tableParentField
            ? {
                [tableParentField.id]: encodeEntityTableParentValue(
                  tableParentField,
                  createHierarchy.groupId,
                  nestedRelationGroupsSubgroup
                    ? (createHierarchy.subgroupId ?? null)
                    : null,
                ),
              }
            : {}),
          ...(createHierarchy?.subgroupId &&
          tableSubgroupField &&
          !nestedRelationGroupsSubgroup
            ? {
                [tableSubgroupField.id]: encodeEntityTableParentValue(
                  tableSubgroupField,
                  createHierarchy.subgroupId,
                ),
              }
            : {}),
        }
      : undefined;

  const ownsLinkedRecords =
    isEntitySubEntity(linkedEntity) &&
    linkedEntity.parentEntityId === parentEntityId;

  function openAdd() {
    if (atSingleRecordLimit) return;
    setCreateHierarchy(null);
    if (ownsLinkedRecords) {
      setDialogRecord("new");
      return;
    }
    setAddFlow("choice");
  }

  function openAddInHierarchy(groupId: string, subgroupId?: string) {
    if (atSingleRecordLimit) return;
    setCreateHierarchy({
      groupId,
      ...(subgroupId != null && subgroupId !== "" ? { subgroupId } : {}),
    });
    setDialogRecord("new");
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl bg-card",
        readOnly ? "border-0" : "border border-border",
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b border-border",
          readOnly ? "px-1 pb-3" : "px-4 py-3",
        )}
      >
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {tab.name}
        </h2>
        <div className="flex items-center gap-3">
          {singleRecord ? null : (
            <span className="text-sm text-muted-foreground">
              {records.length} записей
            </span>
          )}
          {!readOnly && !atSingleRecordLimit ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={openAdd}
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
            {readOnly
              ? "Связанных записей пока нет."
              : singleRecord
                ? "Добавьте запись, чтобы она появилась здесь."
                : "Добавьте первую запись, чтобы она появилась здесь."}
          </p>
        </div>
      ) : recordsDisplay === "table" && !singleRecord ? (
        isDeptCalculationsEntity(linkedEntity) ? (
          <div className="min-h-0 flex-1 p-3 pt-0">
            <DeptCalculationsView
              entity={linkedEntity}
              records={records}
              onEditRecord={
                readOnly ? undefined : (record) => setDialogRecord(record)
              }
            />
          </div>
        ) : (
          <RecordsTable
            entity={linkedEntity}
            records={records}
            parentLinkFieldId={parentLinkFieldId}
            onEdit={readOnly ? undefined : (record) => setDialogRecord(record)}
            onDelete={
              readOnly ? undefined : (record) => setPendingDelete(record)
            }
            onOpenNested={onOpenRelation}
            onCreateNestedChild={
              !readOnly && nestedTarget
                ? (hostRecordId) => setNestedCreateParentId(hostRecordId)
                : undefined
            }
            onCreateInHierarchy={
              !readOnly && tableParentField ? openAddInHierarchy : undefined
            }
          />
        )
      ) : (
        <div className={cn("grid gap-3 p-4", columnsClass)}>
          {records.map((record) => (
            <RecordCard
              key={record.id}
              entity={linkedEntity}
              record={record}
              parentLinkFieldId={parentLinkFieldId}
              single={singleRecord}
              onEdit={readOnly ? undefined : () => setDialogRecord(record)}
              onDelete={readOnly ? undefined : () => setPendingDelete(record)}
            />
          ))}
        </div>
      )}

      {!readOnly ? (
        <>
          <AddChoiceDialog
            open={addFlow === "choice"}
            entityLabel={entityLabel}
            onOpenChange={(open) => {
              if (!open) setAddFlow("closed");
            }}
            onCreateNew={() => {
              if (atSingleRecordLimit) {
                setAddFlow("closed");
                return;
              }
              setAddFlow("closed");
              setCreateHierarchy(null);
              setDialogRecord("new");
            }}
            onPickExisting={() => {
              if (atSingleRecordLimit) {
                setAddFlow("closed");
                return;
              }
              setAddFlow("existing");
            }}
          />

          <LinkExistingDialog
            open={addFlow === "existing"}
            options={availableExistingOptions}
            entityLabel={entityLabel}
            onOpenChange={(open) => {
              if (!open) setAddFlow("closed");
            }}
            onSubmit={(recordId) => {
              if (!parentLinkFieldId || atSingleRecordLimit) return;
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
              if (!open) {
                setDialogRecord(null);
                setCreateHierarchy(null);
              }
            }}
            entity={linkedEntity}
            record={dialogRecord === "new" ? null : dialogRecord}
            entities={entities}
            softFillParent={
              hostEntity && parentRecord
                ? { entity: hostEntity, record: parentRecord }
                : null
            }
            presetValues={presetValues}
            hiddenFieldIds={
              parentLinkFieldId ? new Set([parentLinkFieldId]) : undefined
            }
            titleOverride={dialogRecord !== null ? dialogTitle : undefined}
            submitLabel="Сохранить"
            onSubmit={async (values) => {
              if (!parentLinkFieldId) return;
              if (dialogRecord === "new" && atSingleRecordLimit) return;
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
                const created = addEntityRecord(linkedEntity.id, nextValues);
                await waitForEntityRecordInsert(created.id);
                // Nested hierarchy: open child create right after the parent.
                if (nestedTarget) {
                  setNestedCreateParentId(created.id);
                }
                return;
              }
              if (dialogRecord) {
                await updateEntityRecord(
                  linkedEntity.id,
                  dialogRecord.id,
                  nextValues,
                );
              }
            }}
          />

          {nestedEntity && nestedTarget ? (
            <EntityRecordDialog
              open={nestedCreateParentId != null}
              onOpenChange={(open) => {
                if (!open) setNestedCreateParentId(null);
              }}
              entity={nestedEntity}
              record={null}
              entities={entities}
              presetValues={
                nestedCreateParentId
                  ? { [nestedTarget.parentLinkFieldId]: nestedCreateParentId }
                  : undefined
              }
              hiddenFieldIds={new Set([nestedTarget.parentLinkFieldId])}
              titleOverride={`Новый ${
                nestedEntity.name.trim().toLowerCase() ||
                nestedTarget.label.trim().toLowerCase() ||
                "элемент"
              }`}
              submitLabel="Сохранить"
              onSubmit={async (values) => {
                if (!nestedCreateParentId) return;
                const nextValues = {
                  ...values,
                  [nestedTarget.parentLinkFieldId]: nestedCreateParentId,
                };
                const created = addEntityRecord(nestedEntity.id, nextValues);
                await waitForEntityRecordInsert(created.id);
              }}
            />
          ) : null}

          {ownsLinkedRecords ? (
            <RecordDeleteConfirmDialog
              open={pendingDelete != null}
              onOpenChange={(open) => {
                if (!open) setPendingDelete(null);
              }}
              entityId={linkedEntity.id}
              recordIds={pendingDelete ? [pendingDelete.id] : []}
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
        </>
      ) : null}
    </section>
  );
}
