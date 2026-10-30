import {
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ListTree, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { FilterPill } from "@/shared/ui/filter-pill";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
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
  canEntityFieldToggleShowOnCreate,
  isEntityFieldVisibleOnCreate,
  isEntityFieldsHostTab,
  isEntityNameField,
  isEntityOverviewTab,
  isSystemEntityField,
  PRIMARY_ENTITY_FIELD_GROUP,
  reorderEntityFields,
  resolveEntityFieldGroups,
  resolveEntityListFieldSource,
  resolvePrimaryEntityFieldGroups,
  updateEntityField,
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

type CreateFilter = "all" | "onCreate" | "hiddenOnCreate";

const OVERVIEW_FIELD_MIME = "application/x-ipk-overview-field";

type OverviewFieldDragPayload = {
  fieldId: string;
};

const overviewLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

const overviewDropTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
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

function fieldMatchesCreateFilter(field: EntityField, filter: CreateFilter) {
  if (filter === "all") return true;
  const onCreate = isEntityFieldVisibleOnCreate(field);
  return filter === "onCreate" ? onCreate : !onCreate;
}

/** Fields that can use the «При создании» toggle (not title / rollup / numberSum). */
function canToggleShowOnCreate(field: EntityField) {
  if (isEntityNameField(field)) return false;
  // Formula: own flag on `formula.showOnCreate` (opt-in live preview).
  if (field.type === "formula") return Boolean(field.formula);
  return canEntityFieldToggleShowOnCreate(field.type);
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

function dropEdge(event: ReactDragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function readOverviewDrag(
  event: ReactDragEvent,
): OverviewFieldDragPayload | null {
  const raw = event.dataTransfer.getData(OVERVIEW_FIELD_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OverviewFieldDragPayload;
  } catch {
    return null;
  }
}

/**
 * Apply a new create-form order to the full entity field list: create-visible
 * slots (including «Название») keep their places among hidden fields, but
 * follow `createOrderedIds`.
 */
function weaveCreateFormOrder(
  allFields: readonly EntityField[],
  createOrderedIds: readonly string[],
): string[] {
  const createSet = new Set(createOrderedIds);
  const next: string[] = [];
  let createIndex = 0;
  for (const field of allFields) {
    if (createSet.has(field.id)) {
      const id = createOrderedIds[createIndex];
      if (id) {
        next.push(id);
        createIndex += 1;
      }
      continue;
    }
    next.push(field.id);
  }
  while (createIndex < createOrderedIds.length) {
    const id = createOrderedIds[createIndex];
    if (id) next.push(id);
    createIndex += 1;
  }
  return next;
}

function OverviewDragRail({
  label,
  active = false,
  onPrepareDrag,
}: {
  label: string;
  active?: boolean;
  onPrepareDrag?: (event: { target: EventTarget | null }) => void;
}) {
  return (
    <span
      data-drag-handle
      className={cn(
        "relative z-10 flex w-2.5 shrink-0 touch-none items-center justify-center self-stretch select-none",
        active ? "cursor-grabbing" : "cursor-grab",
      )}
      aria-label={label}
      title={label}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        window.getSelection()?.removeAllRanges();
        onPrepareDrag?.(event);
      }}
    >
      <span
        aria-hidden
        className={cn(
          "my-1.5 h-[calc(100%-0.75rem)] min-h-7 w-1 shrink-0 rounded-full bg-primary transition-[opacity,transform,box-shadow] duration-150",
          active
            ? "scale-y-105 opacity-100 shadow-[0_0_0_3px] shadow-primary/20"
            : "opacity-50 group-hover/row:opacity-95 group-focus-within/row:opacity-95",
        )}
      />
    </span>
  );
}

function OverviewDropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0.82 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={overviewDropTransition}
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-20 flex origin-left items-center",
        edge === "before"
          ? "top-0 -translate-y-1/2"
          : "bottom-0 translate-y-1/2",
      )}
    >
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute size-2.5 rounded-full bg-primary/30"
          animate={{ scale: [1, 1.35, 1] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
      <span className="h-0.5 min-w-0 flex-1 rounded-full bg-primary" />
    </motion.span>
  );
}

/**
 * Parent lists use overflow clipping — clone onto `document.body` for the
 * drag bitmap (same pattern as constructor simple-field rows).
 */
function setOverviewDragPreview(
  event: ReactDragEvent,
  source: HTMLElement,
): HTMLElement {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("button").forEach((button) => button.remove());
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: `${Math.ceil(rect.width)}px`,
    height: `${Math.ceil(rect.height)}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "0",
    opacity: "1",
    boxShadow:
      "0 18px 40px -16px rgb(0 0 0 / 0.4), 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent)",
    borderColor: "color-mix(in oklab, var(--primary) 45%, transparent)",
    background: "var(--card)",
  });
  document.body.appendChild(ghost);
  const offsetX = Math.min(
    Math.max(event.clientX - rect.left, 12),
    Math.max(rect.width - 12, 12),
  );
  const offsetY = Math.min(
    Math.max(event.clientY - rect.top, 12),
    Math.max(rect.height - 12, 12),
  );
  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  ghost.style.left = "-10000px";
  ghost.style.top = "0";
  ghost.style.opacity = "0";
  return ghost;
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
  showCreateToggle,
  canReorder,
  isDragging,
  dropEdgeHint,
  handleEpoch = 0,
  onSelect,
  onDelete,
  onToggleShowOnCreate,
  onPrepareDrag,
  onDragStart,
  onDragEnd,
  onDragGhost,
  onDragOver,
  onDrop,
}: {
  field: EntityField;
  entity: Entity;
  showTab: boolean;
  canEdit: boolean;
  canDelete: boolean;
  showCreateToggle: boolean;
  canReorder: boolean;
  isDragging: boolean;
  dropEdgeHint: "before" | "after" | null;
  handleEpoch?: number;
  onSelect?: () => void;
  onDelete?: () => void;
  onToggleShowOnCreate?: (next: boolean) => void;
  onPrepareDrag?: (event: { target: EventTarget | null }) => void;
  onDragStart?: (event: ReactDragEvent) => void;
  onDragEnd?: (event?: ReactDragEvent) => void;
  onDragGhost?: (ghost: HTMLElement) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  const name = getEntityFieldDisplayName(field);
  const headerField = getEntityHeaderField(entity);
  const isHeader = headerField?.id === field.id;
  const tabId = getEntityFieldTabId(field);
  const tabName = tabLabel(entity, tabId);
  const isOverview = tabId === ENTITY_OVERVIEW_TAB_ID;
  const onCreate = isEntityFieldVisibleOnCreate(field);
  const toggleLocked = field.required || isEntityNameField(field);
  const toggleEnabled = canToggleShowOnCreate(field);

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

  const createSwitch = showCreateToggle ? (
    <div
      className="flex w-9 shrink-0 items-center justify-end"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {toggleEnabled ? (
        <Switch
          checked={onCreate}
          disabled={!canEdit || toggleLocked || !onToggleShowOnCreate}
          aria-label={
            toggleLocked
              ? `${name}: всегда в форме создания`
              : `${name}: ${onCreate ? "в форме создания" : "скрыть при создании"}`
          }
          title={
            toggleLocked
              ? "Обязательные и название всегда в форме создания"
              : "Показывать при создании записи"
          }
          onCheckedChange={(checked) => {
            if (toggleLocked) return;
            onToggleShowOnCreate?.(checked);
          }}
        />
      ) : (
        <span className="w-9" aria-hidden />
      )}
    </div>
  ) : null;

  /** Collapses until row hover — pushes the switch left along the right edge. */
  const deleteSlot = canDelete ? (
    <div
      className={cn(
        "grid shrink-0 transition-[grid-template-columns] duration-150 ease-out",
        "grid-cols-[0fr] group-hover/row:grid-cols-[1fr] group-focus-within/row:grid-cols-[1fr]",
      )}
    >
      <div className="min-w-0 overflow-hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-1 shrink-0 text-muted-foreground hover:text-destructive"
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
      </div>
    </div>
  ) : null;

  const trailing = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end",
        showCreateToggle || canDelete ? "pr-1.5 pl-1" : "pr-1.5",
      )}
    >
      {createSwitch}
      {deleteSlot}
    </div>
  );

  const card = (
    <div
      data-overview-field-card
      className={cn(
        "group/row relative flex min-w-0 flex-1 items-center rounded-lg border border-transparent bg-card",
        !canReorder && "hover:bg-muted/60",
      )}
    >
      {canEdit && onSelect ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none"
          onClick={onSelect}
        >
          {meta}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center px-3 py-2.5">
          {meta}
        </div>
      )}
      {trailing}
    </div>
  );

  if (!canReorder) {
    return (
      <div className="group/row relative flex items-center transition-colors hover:bg-muted/60">
        {canEdit && onSelect ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none"
            onClick={onSelect}
          >
            {meta}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center px-3 py-2.5">
            {meta}
          </div>
        )}
        {trailing}
      </div>
    );
  }

  return (
    <div
      className="group/row relative px-1.5 py-0.5"
      draggable
      onMouseDown={onPrepareDrag}
      onDragStart={(event) => {
        const preview = event.currentTarget.querySelector<HTMLElement>(
          "[data-overview-field-card]",
        );
        if (preview) {
          onDragGhost?.(setOverviewDragPreview(event, preview));
        }
        onDragStart?.(event);
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <motion.div
        layout="position"
        layoutId={`overview-field-${field.id}`}
        transition={overviewLayoutTransition}
        className="relative flex min-w-0 items-stretch gap-0.5"
      >
        <OverviewDragRail
          key={`handle-${field.id}-${handleEpoch}`}
          label={`Переместить «${name}»`}
          active={isDragging}
          onPrepareDrag={onPrepareDrag}
        />
        <div className="relative min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {dropEdgeHint ? (
              <OverviewDropIndicator key="drop" edge={dropEdgeHint} />
            ) : null}
          </AnimatePresence>
          {isDragging ? (
            <div
              aria-hidden
              className="h-[3.25rem] rounded-lg border-2 border-dashed border-primary/35 bg-primary/[0.04]"
            />
          ) : (
            card
          )}
        </div>
      </motion.div>
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
  const [createFilter, setCreateFilter] = useState<CreateFilter>("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null | undefined>(
    undefined,
  );
  const [handleEpoch, setHandleEpoch] = useState(0);
  const allowDragRef = useRef(false);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const needle = query.trim().toLocaleLowerCase("ru");
  const showTabHints = entity.tabs.filter(isEntityFieldsHostTab).length > 1;

  const onCreateCount = useMemo(
    () =>
      entity.fields.filter((field) => isEntityFieldVisibleOnCreate(field))
        .length,
    [entity.fields],
  );
  const hiddenOnCreateCount = entity.fields.length - onCreateCount;

  /** Flat create-form order from entity.fields — matches create dialog. */
  const createFormFields = useMemo(
    () => entity.fields.filter((field) => isEntityFieldVisibleOnCreate(field)),
    [entity.fields],
  );

  const groups = useMemo(() => {
    if (createFilter === "onCreate") {
      const fields = createFormFields.filter((field) =>
        fieldMatchesQuery(field, needle),
      );
      return fields.length > 0
        ? [{ name: "Порядок в форме создания", fields }]
        : [];
    }
    const all = buildOverviewGroups(entity);
    return all
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (field) =>
            fieldMatchesQuery(field, needle) &&
            fieldMatchesCreateFilter(field, createFilter),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  }, [entity, needle, createFilter, createFormFields]);

  const totalVisible = groups.reduce(
    (sum, group) => sum + group.fields.length,
    0,
  );
  const totalFields = entity.fields.length;
  const canEdit = !readOnly && onEditField != null;
  const canDeleteAny = !readOnly && onDeleteField != null;
  /** Create-visibility switches only on the «При создании» filter. */
  const showCreateToggle = !readOnly && createFilter === "onCreate";
  /** Reorder create-form fields when viewing that filter without search. */
  const canReorderFields =
    !readOnly && createFilter === "onCreate" && needle.length === 0;

  function prepareDrag(event: { target: EventTarget | null }) {
    allowDragRef.current = Boolean(
      event.target instanceof Element &&
      event.target.closest("[data-drag-handle]"),
    );
    if (allowDragRef.current) {
      window.getSelection()?.removeAllRanges();
    }
  }

  function clearDrag(event?: ReactDragEvent) {
    allowDragRef.current = false;
    setDraggingId(null);
    setDropBeforeId(undefined);
    setHandleEpoch((value) => value + 1);
    unlockDragSelection();
    dragGhostRef.current?.remove();
    dragGhostRef.current = null;

    const target = event?.target;
    const handle =
      target instanceof Element ? target.closest("[data-drag-handle]") : null;
    if (handle instanceof HTMLElement) {
      handle.style.pointerEvents = "none";
      requestAnimationFrame(() => {
        handle.style.pointerEvents = "";
      });
    }
  }

  function commitCreateReorder(
    visibleFields: EntityField[],
    fieldId: string,
    beforeFieldId: string | null,
  ) {
    const visibleIds = visibleFields.map((field) => field.id);
    if (!visibleIds.includes(fieldId)) return;

    const without = visibleIds.filter((id) => id !== fieldId);
    let insertAt = without.length;
    if (beforeFieldId) {
      const before = without.indexOf(beforeFieldId);
      if (before >= 0) insertAt = before;
    }
    const nextVisible = [...without];
    nextVisible.splice(insertAt, 0, fieldId);
    if (nextVisible.every((id, index) => id === visibleIds[index])) return;

    const nextFull = weaveCreateFormOrder(entity.fields, nextVisible);
    reorderEntityFields(entity.id, nextFull);
  }

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
        <div className="flex shrink-0 flex-col gap-2.5">
          <div className="relative">
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

          <div className="flex flex-wrap items-center gap-1">
            <FilterPill
              label="Все"
              count={totalFields}
              active={createFilter === "all"}
              onClick={() => setCreateFilter("all")}
            />
            <FilterPill
              label="При создании"
              count={onCreateCount}
              active={createFilter === "onCreate"}
              onClick={() => setCreateFilter("onCreate")}
            />
            <FilterPill
              label="Скрыты"
              count={hiddenOnCreateCount}
              active={createFilter === "hiddenOnCreate"}
              onClick={() => setCreateFilter("hiddenOnCreate")}
            />
            {showCreateToggle ? (
              <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
                {canReorderFields
                  ? "Тумблер · перетащите для порядка"
                  : "Тумблер — в форме создания"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        key={createFilter}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center">
            <p className="text-sm font-medium tracking-tight">
              Ничего не найдено
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {createFilter !== "all"
                ? "Смените фильтр или поисковый запрос"
                : "Попробуйте другой запрос"}
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const groupCanReorder = canReorderFields && group.fields.length > 1;
            const listClass = groupCanReorder
              ? "flex flex-col gap-0.5 overflow-visible rounded-b-xl bg-muted/20 p-1.5"
              : "divide-y divide-border/60 overflow-hidden rounded-b-xl";

            const list = (
              <ul className={listClass}>
                {group.fields.map((field, index) => {
                  const locked =
                    lockedFieldIds.has(field.id) ||
                    isEntityNameField(field) ||
                    isSystemEntityField(field);
                  const rowCanReorder = groupCanReorder;
                  const nextId = group.fields[index + 1]?.id ?? null;
                  const hintMatches =
                    rowCanReorder &&
                    draggingId != null &&
                    draggingId !== field.id &&
                    dropBeforeId !== undefined;
                  const edge: "before" | "after" | null = !hintMatches
                    ? null
                    : dropBeforeId === field.id
                      ? "before"
                      : dropBeforeId == null &&
                          index === group.fields.length - 1
                        ? "after"
                        : null;

                  return (
                    <li key={field.id}>
                      <OverviewFieldRow
                        field={field}
                        entity={entity}
                        showTab={showTabHints && createFilter !== "onCreate"}
                        canEdit={canEdit}
                        canDelete={canDeleteAny && !locked}
                        showCreateToggle={showCreateToggle}
                        canReorder={rowCanReorder}
                        isDragging={draggingId === field.id}
                        dropEdgeHint={edge}
                        handleEpoch={handleEpoch}
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
                        onToggleShowOnCreate={
                          showCreateToggle
                            ? (next) => {
                                if (field.type === "formula" && field.formula) {
                                  updateEntityField(entity.id, field.id, {
                                    formula: {
                                      ...field.formula,
                                      showOnCreate: next ? true : undefined,
                                    },
                                  });
                                  return;
                                }
                                updateEntityField(entity.id, field.id, {
                                  showOnCreate: next,
                                });
                              }
                            : undefined
                        }
                        onPrepareDrag={prepareDrag}
                        onDragStart={(event) => {
                          if (!allowDragRef.current) {
                            event.preventDefault();
                            return;
                          }
                          lockDragSelection();
                          const payload: OverviewFieldDragPayload = {
                            fieldId: field.id,
                          };
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            OVERVIEW_FIELD_MIME,
                            JSON.stringify(payload),
                          );
                          event.dataTransfer.setData("text/plain", field.id);
                          setDraggingId(field.id);
                          setDropBeforeId(undefined);
                        }}
                        onDragEnd={(event) => clearDrag(event)}
                        onDragGhost={(ghost) => {
                          dragGhostRef.current?.remove();
                          dragGhostRef.current = ghost;
                        }}
                        onDragOver={(event) => {
                          if (
                            draggingId == null ||
                            draggingId === field.id ||
                            !rowCanReorder
                          ) {
                            return;
                          }
                          if (
                            ![...event.dataTransfer.types].includes(
                              OVERVIEW_FIELD_MIME,
                            ) &&
                            ![...event.dataTransfer.types].includes(
                              "text/plain",
                            )
                          ) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          const nextEdge = dropEdge(event);
                          setDropBeforeId(
                            nextEdge === "before" ? field.id : nextId,
                          );
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const payload =
                            readOverviewDrag(event) ??
                            (draggingId ? { fieldId: draggingId } : null);
                          const activeId = payload?.fieldId ?? draggingId;
                          if (!activeId || activeId === field.id) {
                            clearDrag(event);
                            return;
                          }
                          const nextEdge = dropEdge(event);
                          const beforeId =
                            nextEdge === "before" ? field.id : nextId;
                          commitCreateReorder(group.fields, activeId, beforeId);
                          clearDrag(event);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            );

            return (
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
                {groupCanReorder ? (
                  <LayoutGroup id={`overview-create-${entity.id}`}>
                    {list}
                  </LayoutGroup>
                ) : (
                  list
                )}
              </section>
            );
          })
        )}
      </div>

      {totalFields > 0 ? (
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Показано {totalVisible} из {totalFields}
          {createFilter === "onCreate"
            ? canReorderFields
              ? " · в форме создания · перетащите для порядка"
              : " · в форме создания"
            : createFilter === "hiddenOnCreate"
              ? " · скрыты при создании"
              : ""}
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
