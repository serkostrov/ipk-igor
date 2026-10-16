import { useMemo, useState } from "react";
import { ListTree, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import {
  DEFAULT_ENTITY_FIELD_GROUP,
  ENTITY_HEADER_FIELD_GROUP,
  ENTITY_OVERVIEW_TAB_ID,
  ENTITY_OVERVIEW_TAB_NAME,
  filterEntityFieldGroupsForTab,
  getEntityFieldDisplayName,
  getEntityFieldGroupArea,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  getEntityFieldTypeLabel,
  getEntityHeaderField,
  getEntityPathLabel,
  getEntityRelationTargetId,
  getEntityTabLinkFieldIds,
  isEntityFieldsHostTab,
  isEntityNameField,
  isEntityOverviewTab,
  isSystemEntityField,
  PRIMARY_ENTITY_FIELD_GROUP,
  resolveEntityFieldGroups,
  resolveEntityListFieldSource,
  resolvePrimaryEntityFieldGroups,
  useEntityConfig,
  type Entity,
  type EntityField,
} from "@/entities/entity";

type EntityFieldsOverviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  readOnly?: boolean;
  /** Field ids that cannot be deleted (system, tab links, …). */
  lockedFieldIds?: ReadonlySet<string>;
  onEditField?: (field: EntityField) => void;
  onDeleteField?: (field: EntityField) => void;
};

type OverviewGroup = {
  name: string;
  fields: EntityField[];
};

function fieldMatchesQuery(field: EntityField, needle: string) {
  if (!needle) return true;
  const name = getEntityFieldDisplayName(field).toLocaleLowerCase("ru");
  const type = getEntityFieldTypeLabel(field.type).toLocaleLowerCase("ru");
  const group = getEntityFieldGroupName(field.group).toLocaleLowerCase("ru");
  return (
    name.includes(needle) || type.includes(needle) || group.includes(needle)
  );
}

function tabLabel(entity: Entity, tabId: string) {
  const tab = entity.tabs.find((item) => item.id === tabId);
  if (!tab || isEntityOverviewTab(tab) || tabId === ENTITY_OVERVIEW_TAB_ID) {
    return ENTITY_OVERVIEW_TAB_NAME;
  }
  return tab.name.trim() || "Без названия";
}

/** Same layout as the editor: primary strip, then groups per fields tab. */
function buildOverviewGroups(entity: Entity): OverviewGroup[] {
  const groups: OverviewGroup[] = [];
  const seenFieldIds = new Set<string>();

  function pushGroup(name: string, fields: EntityField[]) {
    const unique = fields.filter((field) => {
      if (seenFieldIds.has(field.id)) return false;
      seenFieldIds.add(field.id);
      return true;
    });
    if (unique.length === 0) return;
    groups.push({ name, fields: unique });
  }

  const headerField = getEntityHeaderField(entity);
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  // «Основное» first, then header slot — matches the record page order.
  if (nameField) {
    pushGroup(PRIMARY_ENTITY_FIELD_GROUP, [nameField]);
  }
  if (headerField) {
    pushGroup(ENTITY_HEADER_FIELD_GROUP, [headerField]);
  }

  const layoutFields = entity.fields.filter(
    (field) => !isEntityNameField(field) && field.id !== headerField?.id,
  );

  for (const group of resolvePrimaryEntityFieldGroups(
    layoutFields,
    entity.fieldGroups,
  )) {
    pushGroup(group.name, group.fields);
  }

  const hostTabs = [...entity.tabs.filter(isEntityFieldsHostTab)].sort(
    (a, b) => {
      if (isEntityOverviewTab(a) || a.id === ENTITY_OVERVIEW_TAB_ID) return -1;
      if (isEntityOverviewTab(b) || b.id === ENTITY_OVERVIEW_TAB_ID) return 1;
      return 0;
    },
  );

  for (const tab of hostTabs) {
    const tabId = tab.id;
    const tabFields = layoutFields.filter((field) => {
      const name = getEntityFieldGroupName(field.group);
      return (
        getEntityFieldTabId(field) === tabId &&
        name !== PRIMARY_ENTITY_FIELD_GROUP &&
        getEntityFieldGroupArea(name, entity.fieldGroups) !== "primary"
      );
    });
    const tabGroups = resolveEntityFieldGroups(
      tabFields,
      filterEntityFieldGroupsForTab(entity.fieldGroups, tabId, tabFields),
    );
    for (const group of tabGroups) {
      if (
        group.name === DEFAULT_ENTITY_FIELD_GROUP &&
        group.fields.length === 0
      ) {
        continue;
      }
      pushGroup(group.name, group.fields);
    }
  }

  // Leftovers (should be rare after rescue) — still list them.
  const leftovers = entity.fields.filter(
    (field) => !seenFieldIds.has(field.id),
  );
  if (leftovers.length > 0) {
    pushGroup(DEFAULT_ENTITY_FIELD_GROUP, leftovers);
  }

  return groups;
}

function pluralFields(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "поле";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "поля";
  return "полей";
}

function FieldTypeMeta({
  field,
  entityId,
}: {
  field: EntityField;
  entityId: string;
}) {
  const { entities } = useEntityConfig();
  const typeLabel = getEntityFieldTypeLabel(field.type);
  const relationTargetId = getEntityRelationTargetId(field);
  const relationLabel = relationTargetId
    ? getEntityPathLabel(relationTargetId, entities)
    : null;
  const isTabLink = getEntityTabLinkFieldIds(entityId, entities).has(field.id);
  const listSource = resolveEntityListFieldSource(field, entities);

  if (field.type === "relation") {
    return (
      <span className="truncate text-xs text-muted-foreground">
        {isTabLink ? "Связь вкладки" : "Связь"}
        {relationLabel ? ` · ${relationLabel}` : ""}
      </span>
    );
  }

  if (field.type === "list" && listSource) {
    return (
      <span className="truncate text-xs text-muted-foreground">
        Список · {getEntityPathLabel(listSource.entity.id, entities)} ·{" "}
        {getEntityFieldDisplayName(listSource.field)}
      </span>
    );
  }

  if (field.type === "list") {
    return (
      <span className="truncate text-xs text-muted-foreground">
        {typeLabel} · Новый
      </span>
    );
  }

  return (
    <span className="truncate text-xs text-muted-foreground">{typeLabel}</span>
  );
}

function OverviewFieldRow({
  field,
  entity,
  showTab,
  canEdit,
  canDelete,
  onSelect,
  onDelete,
}: {
  field: EntityField;
  entity: Entity;
  showTab: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const name = getEntityFieldDisplayName(field);
  const headerField = getEntityHeaderField(entity);
  const isHeader = headerField?.id === field.id;
  const tabId = getEntityFieldTabId(field);
  const tabName = tabLabel(entity, tabId);
  const isOverview = tabId === ENTITY_OVERVIEW_TAB_ID;

  const meta = (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-medium tracking-tight">{name}</p>
        {field.required ? (
          <span className="shrink-0 text-[10px] font-medium tracking-wide text-destructive/80 uppercase">
            обяз.
          </span>
        ) : null}
        {isSystemEntityField(field) || isEntityNameField(field) ? (
          <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            сист.
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <FieldTypeMeta field={field} entityId={entity.id} />
        {showTab && !isOverview && !isHeader ? (
          <>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <span className="truncate text-[11px] text-muted-foreground/80">
              {tabName}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );

  const deleteButton = canDelete ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-destructive"
      aria-label={`Удалить поле «${name}»`}
      title="Удалить"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete?.();
      }}
    >
      <Trash2 className="size-3.5" />
    </Button>
  ) : null;

  if (canEdit && onSelect) {
    return (
      <div className="group/row flex items-center gap-1 pr-1.5 transition-colors hover:bg-muted/60">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none"
          onClick={onSelect}
        >
          {meta}
        </button>
        {deleteButton}
      </div>
    );
  }

  return (
    <div className="group/row flex items-center gap-1 px-3 py-2.5 pr-1.5">
      {meta}
      {deleteButton}
    </div>
  );
}

function EntityFieldsOverviewBody({
  entity,
  readOnly,
  lockedFieldIds,
  onEditField,
  onDeleteField,
  onClose,
}: {
  entity: Entity;
  readOnly: boolean;
  lockedFieldIds: ReadonlySet<string>;
  onEditField?: (field: EntityField) => void;
  onDeleteField?: (field: EntityField) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("ru");
  const showTabHints = entity.tabs.filter(isEntityFieldsHostTab).length > 1;

  const groups = useMemo(() => {
    const all = buildOverviewGroups(entity);
    if (!needle) return all;
    return all
      .map((group) => ({
        ...group,
        fields: group.fields.filter((field) =>
          fieldMatchesQuery(field, needle),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  }, [entity, needle]);

  const totalVisible = groups.reduce(
    (sum, group) => sum + group.fields.length,
    0,
  );
  const totalFields = entity.fields.length;
  const canEdit = !readOnly && onEditField != null;
  const canDeleteAny = !readOnly && onDeleteField != null;

  return (
    <>
      <DialogHeader className="shrink-0 gap-1.5 pr-8">
        <DialogTitle className="flex items-center gap-2">
          <ListTree className="size-4 text-muted-foreground" aria-hidden />
          Все поля
        </DialogTitle>
        <DialogDescription>
          {totalFields === 0
            ? "В этой сущности пока нет полей"
            : `${totalFields} ${pluralFields(totalFields)} по группам${
                canEdit ? " — нажмите, чтобы открыть" : ""
              }`}
        </DialogDescription>
      </DialogHeader>

      {totalFields > 0 ? (
        <div className="relative shrink-0">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, типу или группе"
            aria-label="Поиск полей"
            className="h-9 pl-8"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center">
            <p className="text-sm font-medium tracking-tight">
              Ничего не найдено
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Попробуйте другой запрос
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.name}
              className="rounded-xl border border-border/80 bg-card"
            >
              <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-border/70 bg-muted/90 px-3.5 py-2 backdrop-blur-sm">
                <h5 className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-foreground/70 uppercase">
                  {group.name.trim() || DEFAULT_ENTITY_FIELD_GROUP}
                </h5>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
                  {group.fields.length}
                </span>
              </header>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-b-xl">
                {group.fields.map((field) => {
                  const locked =
                    lockedFieldIds.has(field.id) ||
                    isEntityNameField(field) ||
                    isSystemEntityField(field);
                  return (
                    <li key={field.id}>
                      <OverviewFieldRow
                        field={field}
                        entity={entity}
                        showTab={showTabHints}
                        canEdit={canEdit}
                        canDelete={canDeleteAny && !locked}
                        onSelect={
                          canEdit
                            ? () => {
                                onEditField?.(field);
                                onClose();
                              }
                            : undefined
                        }
                        onDelete={
                          canDeleteAny && !locked
                            ? () => onDeleteField?.(field)
                            : undefined
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {totalFields > 0 ? (
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Показано {totalVisible} из {totalFields}
        </p>
      ) : null}
    </>
  );
}

export function EntityFieldsOverviewDialog({
  open,
  onOpenChange,
  entity,
  readOnly = false,
  lockedFieldIds,
  onEditField,
  onDeleteField,
}: EntityFieldsOverviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[min(90vh,44rem)] flex-col gap-4 overflow-hidden sm:max-w-lg">
        {open ? (
          <EntityFieldsOverviewBody
            key={entity.id}
            entity={entity}
            readOnly={readOnly}
            lockedFieldIds={lockedFieldIds ?? new Set()}
            onEditField={onEditField}
            onDeleteField={onDeleteField}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EntityFieldsOverviewButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("gap-1.5", className)}
      aria-label="Все поля сущности"
      title="Все поля"
      onClick={onClick}
    >
      <ListTree className="size-3.5" aria-hidden />
      Все поля
    </Button>
  );
}
