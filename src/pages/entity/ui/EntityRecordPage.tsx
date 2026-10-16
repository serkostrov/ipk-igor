import { useMemo, useState, type ReactNode } from "react";
import {
  recordLocation,
  useAppLocation,
  useAppNavigate,
} from "@/shared/lib/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/cn";
import { canField, useCanEntity, useCurrentRole } from "@/entities/access";
import {
  addEntityRecord,
  ENTITY_FIELD_GROUP_COLUMNS,
  ENTITY_OVERVIEW_TAB_ID,
  getEntityRecordCopyValues,
  formatEntityScalarFieldValue,
  formatRecordFieldValue,
  getEntityContactHref,
  getEntityFieldDisplayName,
  getEntityFieldGroupArea,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  resolvePrimaryEntityFieldGroups,
  getEntityHeaderField,
  getEntityListOption,
  getEntityListOptions,
  getEntityListParentField,
  getEntityRelationTargetId,
  getEntityUrlHref,
  getVisibleListOptions,
  groupEntityFields,
  isEntityFieldVisibleOnRecord,
  isEntityFilesTab,
  isEntityHistoryTab,
  isEntityNameField,
  isEntityRecordsTab,
  isEntityFieldGroupTitleHidden,
  isEntityMetricsFieldGroup,
  isEntityTabWithLinkedEntity,
  isRecordValueDecorated,
  ListSelect,
  ListValueDisplay,
  OverflowCommaLabels,
  PRIMARY_ENTITY_FIELD_GROUP,
  RecordValue,
  removeEntityRecord,
  formatEntityFieldFilesSummary,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  parseEntityRelationIds,
  getEntityFileDownloadUrl,
  filterEntityFieldGroupsForTab,
  resolveRelationRecordLabel,
  resolveEntityListFieldPresentation,
  SYSTEM_ENTITY_KEY_USERS,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { EntityRecordDialog } from "./EntityRecordDialog";
import { RecordEntityTabPanel } from "./RecordEntityTabPanel";
import { useRecordListChange } from "./use-record-list-change";
import { useRecordTimers } from "./use-record-timers";
import { RecordTimer } from "./RecordTimer";
import { RecordFilesTabPanel } from "./RecordFilesTabPanel";
import { RecordHistoryTabPanel } from "./RecordHistoryTabPanel";
import { RecordNotesTabPanel } from "./RecordNotesTabPanel";
import { UserPrimaryProfileCard } from "./UserPrimaryProfileCard";

const RECORD_FIELD_ROW_HEIGHT = 44;
const RECORD_FIELD_GAP = 12;
const CONTACT_LINK_CLASS =
  "cursor-default truncate text-sm font-medium text-primary underline-offset-2 hover:underline";

function RecordContactValue({
  type,
  value,
  className,
}: {
  type: "phone" | "email" | "url";
  value: string;
  className?: string;
}) {
  const display = formatEntityScalarFieldValue(type, value);
  const empty = display === "—";
  const href = empty
    ? null
    : type === "url"
      ? getEntityUrlHref(value)
      : getEntityContactHref(type, value);

  if (!href) {
    return (
      <span
        className={cn(
          empty ? "text-muted-foreground/70" : "text-foreground",
          className,
        )}
      >
        {display}
      </span>
    );
  }

  return (
    <a
      href={href}
      className={cn(CONTACT_LINK_CLASS, className)}
      title={display}
      {...(type === "url"
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {display}
    </a>
  );
}

function RecordFileValue({
  value,
  className,
}: {
  value: string | undefined;
  className?: string;
}) {
  const summary = formatEntityFieldFilesSummary(value);
  const file = parseEntityFieldFileValue(value);
  if (!file || summary === "—") {
    return <span className={cn("text-muted-foreground/70", className)}>—</span>;
  }
  const attached = file;

  async function openFile() {
    if (attached.dataUrl) {
      window.open(attached.dataUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!attached.storagePath) return;
    const url = await getEntityFileDownloadUrl(attached.storagePath);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      className={cn(CONTACT_LINK_CLASS, "text-left", className)}
      title={summary}
      onClick={() => void openFile()}
    >
      {summary}
    </button>
  );
}

function RecordFieldCell({
  label,
  value,
  multiline = false,
}: {
  label?: string;
  value: string;
  multiline?: boolean;
}) {
  const empty = !value.trim() || value === "—";
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col gap-1",
        multiline ? "justify-start pt-0.5" : "justify-center",
      )}
    >
      {label ? (
        <p className="shrink-0 truncate text-[11px] font-medium text-muted-foreground">
          {label}
        </p>
      ) : null}
      <p
        className={
          empty
            ? "w-full text-sm text-muted-foreground/70"
            : multiline
              ? "min-h-0 w-full flex-1 overflow-auto text-sm leading-snug whitespace-pre-wrap text-foreground"
              : "w-full truncate text-sm font-medium text-foreground"
        }
        title={empty || multiline ? undefined : value}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

function RecordFieldGroup({
  title,
  columns = 4,
  dense = false,
  metrics = false,
  span,
  children,
}: {
  title?: string;
  columns?: number;
  dense?: boolean;
  /** «Показатели»: auto-fit tiles instead of the field grid. */
  metrics?: boolean;
  span?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      {title ? (
        <header className="flex h-9 shrink-0 items-center border-b border-border bg-muted/40 px-4">
          <h2 className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </h2>
        </header>
      ) : null}
      <div
        className={cn(
          "grid min-h-0 w-full flex-1 content-start",
          metrics ? "p-3" : "px-4 py-3",
          (metrics || dense) && "[grid-auto-flow:dense]",
        )}
        style={{
          gap: metrics ? 8 : RECORD_FIELD_GAP,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: metrics ? "auto" : RECORD_FIELD_ROW_HEIGHT,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function RecordMetricTile({
  ctx,
  entity,
  record,
  field,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
}) {
  return (
    <div
      data-col-span={fieldColSpanOf(field.colSpan)}
      style={fieldGridItemStyle(field.colSpan, 1)}
      className="flex h-full min-h-0 min-w-0 flex-col justify-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2.5"
    >
      <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {getEntityFieldDisplayName(field)}
      </p>
      <RecordValue
        ctx={ctx}
        entity={entity}
        record={record}
        field={field}
        className="text-xl font-semibold tracking-tight tabular-nums"
      />
    </div>
  );
}

function RecordToolbar({
  onBack,
  title,
  actions,
  extra,
  onEdit,
  onDelete,
  onDuplicate,
  editLabel = "Редактировать",
  deleteLabel = "Удалить",
}: {
  onBack: () => void;
  title?: string;
  /** Extra controls shown before the header field (e.g. timer). */
  actions?: ReactNode;
  extra?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label="Назад"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        {title ? (
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {extra}
        {onEdit || onDelete ? (
          <div className="flex items-center gap-0.5">
            {onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-foreground"
                aria-label={editLabel}
                onClick={onEdit}
              >
                <Pencil />
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-foreground hover:text-destructive"
                aria-label={deleteLabel}
                onClick={onDelete}
              >
                <Trash2 />
              </Button>
            ) : null}
            {onDuplicate ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-foreground"
                      aria-label="Ещё"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy />
                    Дублировать запись
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type EntityRecordPageProps = {
  entity: Entity;
  record: EntityRecord;
  onBack: () => void;
  /** After delete — replace URL to list (do not use history.back). */
  onDeleted?: () => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

const GRID_COLUMNS = 4;
const MAX_ROW_SPAN = 3;
const HEADER_FIELD_SLOT_WIDTH = "16rem";
const LIST_HEADER_SLOT_WIDTH = "15rem";
const RELATION_HEADER_SLOT_WIDTH = HEADER_FIELD_SLOT_WIDTH;

function fieldColSpanOf(value: number | string | undefined) {
  const span = typeof value === "string" ? Number(value) : (value ?? 1);
  return Math.min(GRID_COLUMNS, Math.max(1, Number.isFinite(span) ? span : 1));
}

function fieldRowSpanOf(value: number | string | undefined) {
  const span = typeof value === "string" ? Number(value) : (value ?? 1);
  return Math.min(MAX_ROW_SPAN, Math.max(1, Number.isFinite(span) ? span : 1));
}

function fieldGridItemStyle(colSpan: number, rowSpan: number) {
  return {
    gridColumn: `span ${fieldColSpanOf(colSpan)}`,
    gridRow: `span ${fieldRowSpanOf(rowSpan)}`,
  };
}

function HeaderFieldShell({
  label,
  title,
  children,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ width: HEADER_FIELD_SLOT_WIDTH }}
      className="flex h-9 shrink-0 items-center gap-2.5 overflow-hidden rounded-full border border-border/50 bg-muted/35 px-3"
      title={title}
    >
      {label ? (
        <>
          <span className="max-w-[42%] shrink-0 truncate text-[11px] font-medium tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="h-3.5 w-px shrink-0 bg-border/80" aria-hidden />
        </>
      ) : null}
      {children}
    </div>
  );
}

function RecordHeaderField({
  ctx,
  record,
  field,
  value,
  values = {},
  entity,
  entities = [],
  onListChange,
  onOpenRelation,
}: {
  ctx: EntityValueContext;
  record: EntityRecord;
  field: EntityField;
  value: string | undefined;
  values?: Record<string, string | undefined>;
  entity: Entity;
  entities?: Entity[];
  onListChange?: (fieldId: string, optionId: string) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const label = field.name.trim();
  const accessibleName = getEntityFieldDisplayName(field);
  const parentField = getEntityListParentField(entity, field);
  const parentValue = parentField ? values[parentField.id] : undefined;
  const listOptions = getVisibleListOptions(
    field,
    parentValue,
    parentField,
    entities,
  );
  const listPresentation = resolveEntityListFieldPresentation(field, entities);
  const listDisabled =
    parentField != null && parseEntityListValueIds(parentValue).length === 0;

  if (field.type === "list") {
    const selected = listPresentation.listMultiple
      ? getEntityListOptions(listOptions, value)
      : (() => {
          const one = getEntityListOption(listOptions, value);
          return one ? [one] : [];
        })();
    const empty = selected.length === 0;
    const primary = selected[0] ?? null;
    const display = empty ? "—" : selected.map((item) => item.name).join(", ");
    const fullTitle = empty
      ? undefined
      : label
        ? `${label}: ${display}`
        : display;
    const showColors = listPresentation.listUseColors;
    const accent = showColors ? primary?.color : null;
    const interactive = !listPresentation.listFixed;
    const valueLabels = selected.map((item) => item.name);
    const fieldLabelNode = label ? (
      <span className="truncate text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
    ) : null;

    const valueBlock = empty ? (
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-left">
        {fieldLabelNode}
        <span className="truncate text-sm leading-none font-semibold tracking-tight text-muted-foreground/65">
          —
        </span>
      </span>
    ) : (
      <OverflowCommaLabels
        labels={valueLabels}
        className="w-full min-w-0"
        textClassName="text-sm leading-none font-semibold tracking-tight text-foreground"
        leading={fieldLabelNode}
        stretchMore
      />
    );

    return (
      <div
        style={{ width: LIST_HEADER_SLOT_WIDTH }}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border px-3 transition-colors",
          empty
            ? "border-border/50 bg-muted/30"
            : "border-border/60 bg-card shadow-[0_1px_0_rgb(0_0_0/0.03)]",
          interactive &&
            !listDisabled &&
            "hover:border-primary/35 hover:bg-primary/[0.04]",
        )}
        title={interactive ? undefined : fullTitle}
        aria-label={fullTitle ?? accessibleName}
      >
        {showColors ? (
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full",
              accent ? "ring-1 ring-black/5" : "bg-muted",
            )}
            style={accent ? { backgroundColor: `${accent}22` } : undefined}
            aria-hidden
          >
            <span
              className={cn(
                "size-2 rounded-full",
                !accent && "bg-muted-foreground/50",
              )}
              style={accent ? { backgroundColor: accent } : undefined}
            />
          </span>
        ) : null}
        {interactive ? (
          <ListSelect
            options={listOptions}
            value={value ?? ""}
            allowEmpty={!field.required}
            allowOther={field.listAllowOther && !listPresentation.listMultiple}
            multiple={listPresentation.listMultiple}
            showColors={false}
            disabled={listDisabled}
            variant="plain"
            emptyLabel="—"
            aria-label={accessibleName}
            className={cn(
              "h-auto min-h-0 w-full min-w-0 gap-2 rounded-none border-0 bg-transparent p-0 shadow-none",
              "data-[size=default]:h-auto data-[size=sm]:h-auto",
              "hover:bg-transparent dark:hover:bg-transparent data-popup-open:bg-transparent dark:data-popup-open:bg-transparent",
              "[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:text-muted-foreground [&_svg]:opacity-60",
              "*:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1",
            )}
            onChange={(next) => onListChange?.(field.id, next)}
            triggerContent={valueBlock}
          />
        ) : (
          valueBlock
        )}
      </div>
    );
  }

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    const relationIds = parseEntityRelationIds(value);
    const labels = relationIds.map(
      (recordId) =>
        resolveRelationRecordLabel(target, recordId) ?? "Без названия",
    );
    const empty = relationIds.length === 0 || !targetId;
    const primaryLabel = empty ? "—" : (labels[0] ?? "Без названия");
    const extraCount = Math.max(0, labels.length - 1);
    const fullTitle = empty
      ? undefined
      : label
        ? `${label}: ${labels.join(", ")}`
        : labels.join(", ");
    const canOpen =
      !empty &&
      targetId != null &&
      relationIds.length > 0 &&
      onOpenRelation != null;
    const primaryRecordId = relationIds[0];

    const content = (
      <>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Link2 className="size-3.5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-left">
            {label ? (
              <span className="truncate text-left text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase">
                {label}
              </span>
            ) : null}
            <span
              className={cn(
                "min-w-0 truncate text-left text-sm leading-none font-semibold tracking-tight",
                empty ? "text-muted-foreground/65" : "text-foreground",
              )}
            >
              {primaryLabel}
            </span>
          </span>
          {extraCount > 0 ? (
            <span className="flex shrink-0 self-stretch items-center rounded-md bg-muted px-1.5 text-[10px] leading-none font-semibold text-muted-foreground tabular-nums">
              +{extraCount}
            </span>
          ) : null}
        </span>
        {canOpen ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/relation:text-foreground"
            aria-hidden
          />
        ) : null}
      </>
    );

    const shellClass = cn(
      "group/relation flex h-10 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border px-3 text-left transition-colors",
      empty
        ? "border-border/50 bg-muted/30"
        : "border-border/60 bg-card shadow-[0_1px_0_rgb(0_0_0/0.03)]",
      canOpen &&
        "cursor-pointer hover:border-primary/35 hover:bg-primary/[0.04]",
    );

    if (canOpen && targetId && primaryRecordId) {
      return (
        <button
          type="button"
          style={{ width: RELATION_HEADER_SLOT_WIDTH }}
          className={shellClass}
          title={fullTitle}
          aria-label={
            label
              ? `Открыть «${primaryLabel}» (${label})`
              : `Открыть «${primaryLabel}»`
          }
          onClick={() => onOpenRelation?.(targetId, primaryRecordId)}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        style={{ width: RELATION_HEADER_SLOT_WIDTH }}
        className={shellClass}
        title={fullTitle}
      >
        {content}
      </div>
    );
  }

  const display = formatRecordFieldValue(ctx, entity, record, field);
  const empty = display === "—";
  const isContact =
    field.type === "phone" || field.type === "email" || field.type === "url";

  return (
    <HeaderFieldShell
      label={label || undefined}
      title={empty ? undefined : label ? `${label}: ${display}` : display}
    >
      {isRecordValueDecorated(field) ? (
        <RecordValue
          ctx={ctx}
          entity={entity}
          record={record}
          field={field}
          className="min-w-0 flex-1 text-sm font-semibold tracking-tight"
        />
      ) : isContact && !empty ? (
        <RecordContactValue
          type={
            field.type === "phone"
              ? "phone"
              : field.type === "email"
                ? "email"
                : "url"
          }
          value={value ?? ""}
          className="min-w-0 flex-1 text-sm font-semibold tracking-tight"
        />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold tracking-tight",
            empty ? "text-muted-foreground/65" : "text-foreground",
          )}
        >
          {display}
        </span>
      )}
    </HeaderFieldShell>
  );
}

function RecordFieldDisplay({
  ctx,
  record,
  field,
  value,
  values = {},
  entity,
  entities = [],
  hideLabel = false,
  onListChange,
  onOpenRelation,
}: {
  ctx: EntityValueContext;
  record: EntityRecord;
  field: EntityField;
  value: string | undefined;
  values?: Record<string, string | undefined>;
  entity: Entity;
  entities?: Entity[];
  hideLabel?: boolean;
  onListChange?: (fieldId: string, optionId: string) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const accessibleName = getEntityFieldDisplayName(field);
  const label = hideLabel ? undefined : accessibleName;
  if (isRecordValueDecorated(field)) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
        {label ? (
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </p>
        ) : null}
        <RecordValue
          ctx={ctx}
          entity={entity}
          record={record}
          field={field}
          className="font-medium"
        />
      </div>
    );
  }
  const isMultiline = field.type === "textarea";
  const parentField = getEntityListParentField(entity, field);
  const parentValue = parentField ? values[parentField.id] : undefined;
  const listOptions = getVisibleListOptions(
    field,
    parentValue,
    parentField,
    entities,
  );
  const listPresentation = resolveEntityListFieldPresentation(field, entities);
  const listDisabled =
    field.type === "list" &&
    parentField != null &&
    parseEntityListValueIds(parentValue).length === 0;
  const fieldLabel = label ? (
    <p className="truncate text-[11px] font-medium text-muted-foreground">
      {label}
    </p>
  ) : null;

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    const relationIds = parseEntityRelationIds(value);
    const relationLabel = resolveRelationRecordLabel(target, value);
    const empty = !relationLabel || relationIds.length === 0;

    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
        {fieldLabel}
        {empty || !targetId ? (
          <p className="w-full text-sm text-muted-foreground/70">—</p>
        ) : relationIds.length === 1 ? (
          <button
            type="button"
            className="w-full truncate text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => onOpenRelation?.(targetId, relationIds[0]!)}
          >
            {relationLabel}
          </button>
        ) : (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {relationIds.map((recordId) => {
              const itemLabel =
                resolveRelationRecordLabel(target, recordId) ?? "Без названия";
              return (
                <button
                  key={recordId}
                  type="button"
                  className="truncate text-sm font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onOpenRelation?.(targetId, recordId)}
                >
                  {itemLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
        {fieldLabel}
        <RecordFileValue value={value} className="w-full" />
      </div>
    );
  }

  if (field.type === "list") {
    if (listPresentation.listFixed) {
      return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
          {fieldLabel}
          <ListValueDisplay
            options={listOptions}
            value={value}
            multiple={listPresentation.listMultiple}
            showColors={listPresentation.listUseColors}
            allowOther={field.listAllowOther && !listPresentation.listMultiple}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
        {fieldLabel}
        <ListSelect
          options={listOptions}
          value={value ?? ""}
          allowEmpty={!field.required}
          allowOther={field.listAllowOther && !listPresentation.listMultiple}
          multiple={listPresentation.listMultiple}
          showColors={listPresentation.listUseColors}
          disabled={listDisabled}
          variant="plain"
          size="sm"
          aria-label={accessibleName}
          className="min-w-0"
          onChange={(next) => onListChange?.(field.id, next)}
        />
      </div>
    );
  }

  if (
    field.type === "phone" ||
    field.type === "email" ||
    field.type === "url"
  ) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center gap-1">
        {fieldLabel}
        <RecordContactValue
          type={field.type}
          value={value ?? ""}
          className="w-full"
        />
      </div>
    );
  }

  const display = formatRecordFieldValue(ctx, entity, record, field);

  return (
    <RecordFieldCell label={label} value={display} multiline={isMultiline} />
  );
}

function EntityFieldGroupCard({
  ctx,
  record,
  name,
  fields,
  colSpan = ENTITY_FIELD_GROUP_COLUMNS,
  entity,
  entities = [],
  onListChange,
  onOpenRelation,
}: {
  ctx: EntityValueContext;
  record: EntityRecord;
  name: string;
  fields: EntityField[];
  colSpan?: number;
  entity: Entity;
  entities?: Entity[];
  onListChange?: (fieldId: string, optionId: string) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const showHeader =
    name !== PRIMARY_ENTITY_FIELD_GROUP &&
    !isEntityFieldGroupTitleHidden(name, entity.fieldGroups);
  const resolvedColSpan = Math.min(
    ENTITY_FIELD_GROUP_COLUMNS,
    Math.max(1, colSpan),
  );
  const soleField = fields.length === 1 ? fields[0] : null;
  const hideSoleFieldLabel =
    showHeader &&
    soleField != null &&
    getEntityFieldDisplayName(soleField).trim().toLocaleLowerCase("ru") ===
      name.trim().toLocaleLowerCase("ru");

  if (isEntityMetricsFieldGroup(name, entity.fieldGroups)) {
    return (
      <RecordFieldGroup
        title={showHeader ? name : undefined}
        metrics
        span={resolvedColSpan}
      >
        {fields.map((field) => (
          <RecordMetricTile
            key={field.id}
            ctx={ctx}
            entity={entity}
            record={record}
            field={field}
          />
        ))}
      </RecordFieldGroup>
    );
  }

  return (
    <RecordFieldGroup
      title={showHeader ? name : undefined}
      dense
      span={resolvedColSpan}
    >
      {fields.map((field) => (
        <div
          key={field.id}
          data-col-span={fieldColSpanOf(field.colSpan)}
          style={fieldGridItemStyle(field.colSpan, field.rowSpan)}
          className="min-h-0 min-w-0"
        >
          <RecordFieldDisplay
            ctx={ctx}
            record={record}
            field={field}
            value={record.values[field.id]}
            values={record.values}
            entity={entity}
            entities={entities}
            hideLabel={hideSoleFieldLabel && field.id === soleField?.id}
            onListChange={onListChange}
            onOpenRelation={onOpenRelation}
          />
        </div>
      ))}
    </RecordFieldGroup>
  );
}

function RecordTabFields({
  ctx,
  record,
  groups,
  entity,
  entities = [],
  onListChange,
  onOpenRelation,
  emptyLabel,
}: {
  ctx: EntityValueContext;
  record: EntityRecord;
  groups: Array<{ name: string; fields: EntityField[]; colSpan: number }>;
  entity: Entity;
  entities?: Entity[];
  onListChange?: (fieldId: string, optionId: string) => void;
  onOpenRelation?: (entityId: string, recordId: string) => void;
  emptyLabel: string;
}) {
  const visibleGroups = groups.filter((group) => group.fields.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 items-stretch gap-4">
      {visibleGroups.map((group) => (
        <EntityFieldGroupCard
          key={group.name}
          ctx={ctx}
          record={record}
          name={group.name}
          fields={group.fields}
          colSpan={group.colSpan}
          entity={entity}
          entities={entities}
          onListChange={onListChange}
          onOpenRelation={onOpenRelation}
        />
      ))}
    </div>
  );
}

export function EntityRecordPage({
  entity,
  record,
  onBack,
  onDeleted,
  onOpenRelation,
}: EntityRecordPageProps) {
  const location = useAppLocation();
  const { go } = useAppNavigate();
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const { requestListChange, dialog: listChangeDialog } = useRecordListChange();
  const timers = useRecordTimers(entity);
  const canUpdate = useCanEntity(entity.id, "update");
  const canDelete = useCanEntity(entity.id, "delete");
  const canCreate = useCanEntity(entity.id, "create");
  const role = useCurrentRole();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const locationTabId =
    location.type === "record" &&
    location.entityId === entity.id &&
    location.recordId === record.id
      ? location.tabId
      : undefined;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const headerField = useMemo(() => {
    const field = getEntityHeaderField(entity);
    if (!field || !isEntityFieldVisibleOnRecord(field)) return null;
    if (!canField(role, entity.id, field.id, "view")) return null;
    return field;
  }, [entity, role]);
  const pinnedFieldIds = useMemo(() => {
    const ids = new Set<string>();
    if (headerField) ids.add(headerField.id);
    return ids;
  }, [headerField]);
  const allLayoutFields = useMemo(
    () =>
      entity.fields.filter(
        (field) =>
          !isEntityNameField(field) &&
          !pinnedFieldIds.has(field.id) &&
          isEntityFieldVisibleOnRecord(field) &&
          canField(role, entity.id, field.id, "view"),
      ),
    [entity.fields, entity.id, pinnedFieldIds, role],
  );
  const isUsersEntity = entity.systemKey === SYSTEM_ENTITY_KEY_USERS;
  const primaryGroups = useMemo(
    () => resolvePrimaryEntityFieldGroups(allLayoutFields, entity.fieldGroups),
    [allLayoutFields, entity.fieldGroups],
  );
  const userPrimaryFields = useMemo(() => {
    if (!isUsersEntity) return [];
    return (
      primaryGroups.find((group) => group.name === PRIMARY_ENTITY_FIELD_GROUP)
        ?.fields ?? []
    );
  }, [isUsersEntity, primaryGroups]);
  const otherPrimaryGroups = useMemo(() => {
    if (!isUsersEntity) return primaryGroups;
    return primaryGroups.filter(
      (group) => group.name !== PRIMARY_ENTITY_FIELD_GROUP,
    );
  }, [isUsersEntity, primaryGroups]);
  const entityTabs = entity.tabs;
  const resolvedActiveTabId =
    entityTabs.find((tab) => tab.id === locationTabId)?.id ??
    entityTabs[0]?.id ??
    ENTITY_OVERVIEW_TAB_ID;

  function setActiveTabId(tabId: string) {
    go(recordLocation(entity.id, record.id, tabId));
  }

  const pageTitle = nameField
    ? formatRecordFieldValue(valueContext, entity, record, nameField)
    : "Без названия";
  const title = pageTitle === "—" ? "Без названия" : pageTitle;

  function handleDelete() {
    removeEntityRecord(entity.id, record.id);
    (onDeleted ?? onBack)();
  }

  function handleDuplicate() {
    const copy = addEntityRecord(
      entity.id,
      getEntityRecordCopyValues(entity, record),
    );
    onOpenRelation?.(entity.id, copy.id);
  }

  function handleListChange(fieldId: string, optionId: string) {
    if (!canUpdate) return;
    if (!canField(role, entity.id, fieldId, "edit")) return;
    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field) return;
    requestListChange(entity, record, field, optionId);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
      <RecordToolbar
        onBack={onBack}
        title={isUsersEntity ? undefined : title}
        actions={
          <RecordTimer entity={entity} record={record} timers={timers} />
        }
        extra={
          headerField ? (
            <RecordHeaderField
              ctx={valueContext}
              record={record}
              field={headerField}
              value={record.values[headerField.id]}
              values={record.values}
              entity={entity}
              entities={entities}
              onListChange={
                canUpdate && canField(role, entity.id, headerField.id, "edit")
                  ? handleListChange
                  : undefined
              }
              onOpenRelation={onOpenRelation}
            />
          ) : null
        }
        onEdit={canUpdate ? () => setEditOpen(true) : undefined}
        onDelete={canDelete ? () => setDeleteOpen(true) : undefined}
        onDuplicate={isUsersEntity || !canCreate ? undefined : handleDuplicate}
        editLabel="Редактировать запись"
        deleteLabel="Удалить запись"
      />

      {isUsersEntity ? (
        <div className="mt-5 shrink-0">
          <UserPrimaryProfileCard
            name={title}
            fields={userPrimaryFields}
            values={record.values}
            entity={entity}
            entities={entities}
            onEdit={canUpdate ? () => setEditOpen(true) : undefined}
            onOpenRelation={onOpenRelation}
          />
        </div>
      ) : null}

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="flex flex-col gap-4">
          {(
            isUsersEntity
              ? otherPrimaryGroups.some((group) => group.fields.length > 0)
              : primaryGroups.some((group) => group.fields.length > 0)
          ) ? (
            <RecordTabFields
              ctx={valueContext}
              record={record}
              groups={isUsersEntity ? otherPrimaryGroups : primaryGroups}
              entity={entity}
              entities={entities}
              onListChange={handleListChange}
              onOpenRelation={onOpenRelation}
              emptyLabel=""
            />
          ) : null}

          <Tabs
            value={resolvedActiveTabId}
            onValueChange={(tabId) => {
              setActiveTabId(tabId);
            }}
            className="gap-4"
          >
            {entityTabs.length > 0 ? (
              <div className="flex h-9 w-full items-stretch overflow-x-auto rounded-lg bg-muted p-1">
                <TabsList className="!h-auto min-h-0 w-auto flex-none items-stretch justify-start gap-0.5 self-stretch bg-transparent p-0">
                  {entityTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="!h-auto min-h-0 flex-none self-stretch rounded-md px-3 text-sm font-medium transition-colors data-active:shadow-sm"
                    >
                      <span className="truncate">{tab.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ) : null}

            {entityTabs.map((tab) => {
              if (isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId) {
                const linkedEntity =
                  entities.find((item) => item.id === tab.linkedEntityId) ??
                  null;
                return (
                  <TabsContent key={tab.id} value={tab.id} className="mt-0">
                    {linkedEntity ? (
                      <RecordEntityTabPanel
                        tab={tab}
                        linkedEntity={linkedEntity}
                        parentEntityId={entity.id}
                        parentRecordId={record.id}
                        entities={entities}
                        onOpenRelation={onOpenRelation}
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                        Связанная сущность не найдена.
                      </div>
                    )}
                  </TabsContent>
                );
              }

              if (isEntityRecordsTab(tab)) {
                return (
                  <TabsContent key={tab.id} value={tab.id} className="mt-0">
                    <RecordNotesTabPanel
                      entity={entity}
                      record={record}
                      tab={tab}
                    />
                  </TabsContent>
                );
              }

              if (isEntityFilesTab(tab)) {
                return (
                  <TabsContent key={tab.id} value={tab.id} className="mt-0">
                    <RecordFilesTabPanel
                      entity={entity}
                      record={record}
                      tab={tab}
                    />
                  </TabsContent>
                );
              }

              if (isEntityHistoryTab(tab)) {
                return (
                  <TabsContent key={tab.id} value={tab.id} className="mt-0">
                    <RecordHistoryTabPanel
                      entity={entity}
                      record={record}
                      tab={tab}
                    />
                  </TabsContent>
                );
              }

              const tabFields = allLayoutFields.filter((field) => {
                const name = getEntityFieldGroupName(field.group);
                return (
                  getEntityFieldTabId(field) === tab.id &&
                  name !== PRIMARY_ENTITY_FIELD_GROUP &&
                  getEntityFieldGroupArea(name, entity.fieldGroups) !==
                    "primary"
                );
              });
              const groups = groupEntityFields(
                tabFields,
                filterEntityFieldGroupsForTab(
                  entity.fieldGroups,
                  tab.id,
                  tabFields,
                ),
              );
              return (
                <TabsContent key={tab.id} value={tab.id} className="mt-0">
                  <RecordTabFields
                    ctx={valueContext}
                    record={record}
                    groups={groups}
                    entity={entity}
                    entities={entities}
                    onListChange={handleListChange}
                    onOpenRelation={onOpenRelation}
                    emptyLabel="Дополнительных полей пока нет."
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </div>

      <EntityRecordDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entity={entity}
        record={record}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить запись?"
        description={`Вы уверены, что хотите удалить «${title}»? Это действие нельзя отменить.`}
        confirmLabel="Удалить"
        onConfirm={handleDelete}
      />

      {listChangeDialog}
      {timers.dialog}
    </div>
  );
}
