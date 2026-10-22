import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type DragEvent,
  type ReactNode,
} from "react";
import { LayoutGroup, motion } from "motion/react";
import { EyeOff, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { TreeBranchGuides } from "@/shared/ui/tree-branch-guides";
import { cn } from "@/shared/lib/cn";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import {
  isEntityInternal,
  useEntityConfig,
  useEntityStatus,
} from "@/entities/entity";
import {
  groupHasProtectedItems,
  isEntityLinkedMenuItem,
  isMenuGroupDescendant,
  isProtectedMenuItem,
  isSystemMenuItem,
  addMenuGroup,
  getMenuGroups,
  getMenuIcon,
  moveMenuEntry,
  removeMenuGroup,
  removeMenuItem,
  updateMenuGroup,
  updateMenuItem,
  useMenuConfig,
  useMenuStatus,
  type MenuEntry,
  type MenuEntryLocation,
  type MenuGroup,
  type MenuGroupEntry,
  type MenuIconName,
  type MenuItem,
} from "@/entities/menu";

function MenuIcon({
  name,
  className,
}: {
  name: MenuIconName;
  className?: string;
}) {
  return createElement(getMenuIcon(name), {
    className,
    "aria-hidden": true,
  });
}
import { MenuGroupDialog } from "./MenuGroupDialog";
import { MenuItemDialog } from "./MenuItemDialog";
import { MenuSettingsSkeleton } from "./MenuSettingsSkeleton";

type ItemDialogState =
  { mode: "closed" } | { mode: "edit"; groupId: string | null; item: MenuItem };

type GroupDialogState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; group: MenuGroup };

type EntryDragPayload = {
  kind: "entry";
  id: string;
  entryType: "group" | "item";
  parentGroupId: string | null;
  index: number;
};

const ENTRY_MIME = "application/x-ipk-menu-entry";

function readPayload(event: DragEvent): EntryDragPayload | null {
  const raw = event.dataTransfer.getData(ENTRY_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EntryDragPayload>;
    if (
      parsed.kind !== "entry" ||
      typeof parsed.id !== "string" ||
      (parsed.entryType !== "group" && parsed.entryType !== "item") ||
      typeof parsed.index !== "number" ||
      (parsed.parentGroupId != null && typeof parsed.parentGroupId !== "string")
    ) {
      return null;
    }
    return {
      kind: "entry",
      id: parsed.id,
      entryType: parsed.entryType,
      parentGroupId: parsed.parentGroupId ?? null,
      index: parsed.index,
    };
  } catch {
    return null;
  }
}

function getDropEdge(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function hasEntryMime(event: DragEvent) {
  return [...event.dataTransfer.types].includes(ENTRY_MIME);
}

function DragHandle({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      data-drag-handle
      className={cn(
        "flex h-8 w-2.5 shrink-0 items-center justify-center select-none",
        active ? "cursor-grabbing" : "cursor-grab",
      )}
      aria-label={label}
      title={label}
      onPointerDown={() => {
        window.getSelection()?.removeAllRanges();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      onPointerUp={() => setHovered(false)}
    >
      <span
        aria-hidden
        className={cn(
          "h-5 w-1 rounded-full transition-colors",
          active ? "bg-primary" : hovered ? "bg-primary/75" : "bg-primary/45",
        )}
      />
    </span>
  );
}

/**
 * Root header: px-1(4) + handle(10) + gap-1(4) + half icon(16) = 34.
 * Nested header (inside content pad): handle(10) + gap-1(4) + half icon(16) = 30.
 * Arm w-2 (8px) + 12px gap before child handle — arm must not touch the handle.
 */
const TREE_STEM_ROOT = "left-[34px]";
const TREE_PAD_ROOT = "pl-[54px]";
const TREE_STEM_NESTED = "left-[30px]";
const TREE_PAD_NESTED = "pl-[50px]";
const TREE_DROP_INSET = TREE_STEM_ROOT;

const TreeStemContext = createContext({
  stemClassName: TREE_STEM_ROOT,
  contentPadClassName: TREE_PAD_ROOT,
});

const menuLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-[4.25rem] shrink-0 items-center justify-end gap-0.5 pr-0.5">
      {children}
    </div>
  );
}

function DropIndicator({
  edge,
  inset = false,
}: {
  edge: "before" | "after";
  inset?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-0 z-20 flex items-center",
        inset ? TREE_DROP_INSET : "left-0",
        edge === "before"
          ? "top-0 -translate-y-1/2"
          : "bottom-0 translate-y-1/2",
      )}
    >
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span className="absolute size-2.5 rounded-full bg-primary/30" />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
      <span className="h-0.5 min-w-0 flex-1 rounded-full bg-primary" />
    </span>
  );
}

function PhantomItem({ active = false }: { active?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg border border-dashed px-2.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/8 text-primary"
          : "border-border bg-muted/25 text-muted-foreground",
      )}
    >
      <Plus className="size-3.5 shrink-0 opacity-80" aria-hidden />
    </div>
  );
}

function MenuRowContent({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 transition-colors",
        active ? "bg-muted/50" : "hover:bg-muted/55",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
    </div>
  );
}

function SystemMenuBadge() {
  return (
    <span
      title="Системный пункт — нельзя удалить"
      className="mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
    >
      <Shield className="size-3 shrink-0" aria-hidden />
      Система
    </span>
  );
}

function InternalMenuBadge() {
  return (
    <span
      title="Служебное — не показывается в боковом меню"
      className="mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
    >
      <EyeOff className="size-3 shrink-0" aria-hidden />
      Служебное
    </span>
  );
}

function TreeRail({
  children,
  active = false,
  /** Children of a nested group — stem under nested parent icon. */
  nestedParent = false,
}: {
  children: ReactNode;
  active?: boolean;
  nestedParent?: boolean;
}) {
  const stem = nestedParent
    ? {
        stemClassName: TREE_STEM_NESTED,
        contentPadClassName: TREE_PAD_NESTED,
      }
    : {
        stemClassName: TREE_STEM_ROOT,
        contentPadClassName: TREE_PAD_ROOT,
      };

  return (
    <TreeStemContext.Provider value={stem}>
      <ul
        className={cn(
          "relative overflow-visible rounded-md bg-muted/15 transition-colors",
          active && "bg-primary/8 ring-1 ring-primary/30",
        )}
      >
        {children}
      </ul>
    </TreeStemContext.Provider>
  );
}

function TreeRow({
  actions,
  indicator,
  layoutId,
  className,
  isFirst = false,
  isLast = false,
  children,
  ...props
}: ComponentProps<"li"> & {
  actions?: ReactNode;
  indicator?: ReactNode;
  layoutId?: string;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { stemClassName, contentPadClassName } = useContext(TreeStemContext);

  return (
    <li className={cn("relative", className)} {...props}>
      {indicator}
      <TreeBranchGuides
        isFirst={isFirst}
        isLast={isLast}
        className={stemClassName}
        armClassName="w-2"
        elbowTopPx={20}
      />
      <motion.div
        layout="position"
        layoutId={layoutId}
        transition={menuLayoutTransition}
        className="relative flex min-h-10 w-full items-center"
      >
        <div
          className={cn(
            "relative flex min-w-0 flex-1 items-center py-0.5",
            contentPadClassName,
          )}
        >
          {children}
        </div>
        {actions}
      </motion.div>
    </li>
  );
}

function AddRow({
  label,
  onClick,
  isDropTarget = false,
}: {
  label: string;
  onClick: () => void;
  isDropTarget?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-lg border border-dashed px-3 text-left text-sm transition-colors",
        isDropTarget
          ? "border-primary bg-primary/8 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/25 hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <Plus className="size-4 shrink-0" />
      {label}
    </button>
  );
}

type DropHint =
  | {
      type: "sibling";
      parentGroupId: string | null;
      entryId: string;
      edge: "before" | "after";
    }
  | { type: "into"; groupId: string }
  | { type: "root-start" }
  | { type: "root-end" };

type MenuSettingsContext = {
  draggingId: string | null;
  dropHint: DropHint | null;
  handleEpoch: number;
  showInternal: boolean;
  isInternalItem: (itemId: string) => boolean;
  allowDrag: () => boolean;
  prepareDrag: (event: { target: EventTarget | null }) => void;
  clearDrag: (event?: DragEvent) => void;
  setDragging: (id: string, entryType: "group" | "item") => void;
  setDropHint: (hint: DropHint | null) => void;
  canNestInto: (targetGroupId: string) => boolean;
  onEditItem: (groupId: string | null, item: MenuItem) => void;
  onEditGroup: (group: MenuGroup) => void;
};

function applyDrop(event: DragEvent, to: MenuEntryLocation) {
  const dragged = readPayload(event);
  if (!dragged) return;
  moveMenuEntry(
    {
      parentGroupId: dragged.parentGroupId,
      index: dragged.index,
    },
    to,
  );
}

function EntryList({
  parentGroupId,
  entries,
  nested,
  ctx,
}: {
  parentGroupId: string | null;
  entries: MenuEntry[];
  nested: boolean;
  ctx: MenuSettingsContext;
}) {
  const visible = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (ctx.showInternal) return true;
      if (entry.type === "group") return !entry.internal;
      return !ctx.isInternalItem(entry.id);
    });

  return (
    <>
      {visible.map(({ entry, index }, visibleIndex) => {
        const isFirst = visibleIndex === 0;
        const isLast = visibleIndex === visible.length - 1;
        const isDragging = ctx.draggingId === entry.id;
        const siblingHint =
          ctx.dropHint?.type === "sibling" &&
          ctx.dropHint.parentGroupId === parentGroupId &&
          ctx.dropHint.entryId === entry.id
            ? ctx.dropHint
            : null;

        if (entry.type === "item") {
          return (
            <ItemRow
              key={entry.id}
              entry={entry}
              parentGroupId={parentGroupId}
              index={index}
              nested={nested}
              isFirst={isFirst}
              isLast={isLast}
              isDragging={isDragging}
              siblingHint={siblingHint}
              ctx={ctx}
            />
          );
        }

        return (
          <GroupBlock
            key={entry.id}
            entry={entry}
            parentGroupId={parentGroupId}
            index={index}
            nested={nested}
            isFirst={isFirst}
            isLast={isLast}
            isDragging={isDragging}
            siblingHint={siblingHint}
            ctx={ctx}
          />
        );
      })}
    </>
  );
}

function ItemRow({
  entry,
  parentGroupId,
  index,
  nested,
  isFirst = false,
  isLast = false,
  isDragging,
  siblingHint,
  ctx,
}: {
  entry: MenuItem & { type: "item" };
  parentGroupId: string | null;
  index: number;
  nested: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  isDragging: boolean;
  siblingHint: Extract<DropHint, { type: "sibling" }> | null;
  ctx: MenuSettingsContext;
}) {
  const isProtected = isProtectedMenuItem(entry.id);
  const isSystem = isSystemMenuItem(entry.id);
  const isInternal = ctx.isInternalItem(entry.id);

  const dragProps = {
    draggable: true as const,
    onMouseDown: ctx.prepareDrag,
    onDragStart: (event: DragEvent) => {
      if (!ctx.allowDrag()) {
        event.preventDefault();
        return;
      }
      const payload: EntryDragPayload = {
        kind: "entry",
        id: entry.id,
        entryType: "item",
        parentGroupId,
        index,
      };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ENTRY_MIME, JSON.stringify(payload));
      event.stopPropagation();
      lockDragSelection();
      ctx.setDragging(entry.id, "item");
    },
    onDragEnd: ctx.clearDrag,
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!hasEntryMime(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      ctx.setDropHint({
        type: "sibling",
        parentGroupId,
        entryId: entry.id,
        edge: getDropEdge(event),
      });
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const edge = getDropEdge(event);
      applyDrop(event, {
        parentGroupId,
        index: edge === "after" ? index + 1 : index,
      });
      ctx.clearDrag();
    },
  };

  const handle = (
    <DragHandle
      key={`handle-item-${entry.id}-${ctx.handleEpoch}`}
      label="Перетащить пункт"
      active={isDragging}
    />
  );
  const icon = (
    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
      <MenuIcon name={entry.icon} className="size-4" />
    </span>
  );
  const actions = (
    <>
      {isInternal ? <InternalMenuBadge /> : null}
      {isSystem ? <SystemMenuBadge /> : null}
      <RowActions>
        {isProtected ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Удалить"
            onClick={() => removeMenuItem(entry.id)}
          >
            <Trash2 />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Редактировать"
          onClick={() => ctx.onEditItem(parentGroupId, entry)}
        >
          <Pencil />
        </Button>
      </RowActions>
    </>
  );

  if (nested) {
    return (
      <TreeRow
        {...dragProps}
        layoutId={`menu-item-${entry.id}`}
        isFirst={isFirst}
        isLast={isLast}
        className={cn(isDragging && "opacity-40")}
        indicator={
          siblingHint ? <DropIndicator edge={siblingHint.edge} inset /> : null
        }
        actions={actions}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {handle}
          <MenuRowContent active={isDragging} label={entry.label} icon={icon} />
        </div>
      </TreeRow>
    );
  }

  return (
    <li className={cn("relative", isDragging && "opacity-40")} {...dragProps}>
      <motion.div
        layout="position"
        layoutId={`menu-item-${entry.id}`}
        transition={menuLayoutTransition}
        className="relative flex min-h-10 w-full items-center"
      >
        {siblingHint ? <DropIndicator edge={siblingHint.edge} /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-1 px-1 py-0.5">
          {handle}
          <MenuRowContent active={isDragging} label={entry.label} icon={icon} />
        </div>
        {actions}
      </motion.div>
    </li>
  );
}

function GroupBlock({
  entry,
  parentGroupId,
  index,
  nested,
  isFirst = false,
  isLast = false,
  isDragging,
  siblingHint,
  ctx,
}: {
  entry: MenuGroupEntry;
  parentGroupId: string | null;
  index: number;
  nested: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  isDragging: boolean;
  siblingHint: Extract<DropHint, { type: "sibling" }> | null;
  ctx: MenuSettingsContext;
}) {
  const { stemClassName, contentPadClassName } = useContext(TreeStemContext);
  const canRemove = !groupHasProtectedItems(entry);
  const intoActive =
    ctx.dropHint?.type === "into" && ctx.dropHint.groupId === entry.id;
  const canNest = ctx.canNestInto(entry.id);

  function onHeaderDragOver(event: DragEvent<HTMLElement>) {
    if (!hasEntryMime(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const edge = getDropEdge(event);
    if (edge === "before") {
      ctx.setDropHint({
        type: "sibling",
        parentGroupId,
        entryId: entry.id,
        edge: "before",
      });
      return;
    }
    if (canNest) {
      ctx.setDropHint({ type: "into", groupId: entry.id });
      return;
    }
    ctx.setDropHint({
      type: "sibling",
      parentGroupId,
      entryId: entry.id,
      edge: "after",
    });
  }

  function onHeaderDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const edge = getDropEdge(event);
    if (edge === "before") {
      applyDrop(event, { parentGroupId, index });
      ctx.clearDrag();
      return;
    }
    if (canNest) {
      applyDrop(event, {
        parentGroupId: entry.id,
        index: entry.entries.length,
      });
      ctx.clearDrag();
      return;
    }
    applyDrop(event, { parentGroupId, index: index + 1 });
    ctx.clearDrag();
  }

  const header = (
    <div
      className="relative flex min-h-10 w-full items-center"
      onDragOver={onHeaderDragOver}
      onDrop={onHeaderDrop}
    >
      {siblingHint && siblingHint.edge === "before" ? (
        <DropIndicator edge="before" inset={nested} />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 py-0.5",
          nested ? "" : "px-1",
        )}
      >
        <DragHandle
          key={`handle-group-${entry.id}-${ctx.handleEpoch}`}
          label="Перетащить группу"
          active={isDragging}
        />
        <MenuRowContent
          active={isDragging}
          label={entry.title}
          icon={
            <span className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
              <MenuIcon name={entry.icon} className="size-4" />
            </span>
          }
        />
      </div>
      {entry.internal ? <InternalMenuBadge /> : null}
      <RowActions>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Удалить группу"
          disabled={!canRemove}
          onClick={() => removeMenuGroup(entry.id)}
        >
          <Trash2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Редактировать группу"
          onClick={() => ctx.onEditGroup(entry)}
        >
          <Pencil />
        </Button>
      </RowActions>
    </div>
  );

  const children = (
    <TreeRail active={intoActive} nestedParent={nested}>
      <EntryList
        parentGroupId={entry.id}
        entries={entry.entries}
        nested
        ctx={ctx}
      />
      {entry.entries.length === 0 ? (
        <TreeRow
          isLast
          onDragOver={(event) => {
            if (!hasEntryMime(event) || !canNest) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            ctx.setDropHint({ type: "into", groupId: entry.id });
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!canNest) {
              ctx.clearDrag();
              return;
            }
            applyDrop(event, { parentGroupId: entry.id, index: 0 });
            ctx.clearDrag();
          }}
        >
          <PhantomItem active={intoActive} />
        </TreeRow>
      ) : null}
    </TreeRail>
  );

  const afterStrip = (
    <div className="relative h-0">
      <div
        className="absolute inset-x-0 -top-1.5 z-10 h-3"
        onDragOver={(event) => {
          if (!hasEntryMime(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          ctx.setDropHint({
            type: "sibling",
            parentGroupId,
            entryId: entry.id,
            edge: "after",
          });
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          applyDrop(event, { parentGroupId, index: index + 1 });
          ctx.clearDrag();
        }}
      >
        {siblingHint && siblingHint.edge === "after" ? (
          <DropIndicator edge="before" inset={nested} />
        ) : null}
      </div>
    </div>
  );

  const dragStart = (event: DragEvent) => {
    if (!ctx.allowDrag()) {
      event.preventDefault();
      return;
    }
    const payload: EntryDragPayload = {
      kind: "entry",
      id: entry.id,
      entryType: "group",
      parentGroupId,
      index,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(ENTRY_MIME, JSON.stringify(payload));
    event.stopPropagation();
    lockDragSelection();
    ctx.setDragging(entry.id, "group");
  };

  if (nested) {
    return (
      <li
        className={cn("relative overflow-visible", isDragging && "opacity-40")}
        draggable
        onMouseDown={ctx.prepareDrag}
        onDragStart={dragStart}
        onDragEnd={ctx.clearDrag}
      >
        <TreeBranchGuides
          isFirst={isFirst}
          isLast={isLast}
          className={stemClassName}
          armClassName="w-2"
          elbowTopPx={20}
        />
        <motion.div
          layout="position"
          layoutId={`menu-group-${entry.id}`}
          transition={menuLayoutTransition}
          className="relative"
        >
          <div className={contentPadClassName}>{header}</div>
          <div className={contentPadClassName}>{children}</div>
          {afterStrip}
        </motion.div>
      </li>
    );
  }

  return (
    <li
      className={cn("relative overflow-visible", isDragging && "opacity-40")}
      draggable
      onMouseDown={ctx.prepareDrag}
      onDragStart={dragStart}
      onDragEnd={ctx.clearDrag}
    >
      <motion.div
        layout="position"
        layoutId={`menu-group-${entry.id}`}
        transition={menuLayoutTransition}
        className="relative"
      >
        {header}
        {children}
        {afterStrip}
      </motion.div>
    </li>
  );
}

export function MenuSettings() {
  const config = useMenuConfig();
  const status = useMenuStatus();
  const entityStatus = useEntityStatus();
  const { entities } = useEntityConfig();
  const groups = getMenuGroups(config);
  const [itemDialog, setItemDialog] = useState<ItemDialogState>({
    mode: "closed",
  });
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>({
    mode: "closed",
  });
  const [showInternal, setShowInternal] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<"group" | "item" | null>(
    null,
  );
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [handleEpoch, setHandleEpoch] = useState(0);
  const allowDragRef = useRef(false);

  const internalEntityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entity of entities) {
      if (isEntityInternal(entity)) ids.add(entity.id);
    }
    return ids;
  }, [entities]);

  function isInternalItem(itemId: string) {
    return isEntityLinkedMenuItem(itemId) && internalEntityIds.has(itemId);
  }

  function prepareDrag(event: { target: EventTarget | null }) {
    allowDragRef.current = Boolean(
      event.target instanceof Element &&
      event.target.closest("[data-drag-handle]"),
    );
    if (allowDragRef.current) {
      window.getSelection()?.removeAllRanges();
    }
  }

  function clearDrag(event?: DragEvent) {
    allowDragRef.current = false;
    setDraggingId(null);
    setDraggingType(null);
    setDropHint(null);
    setHandleEpoch((value) => value + 1);
    unlockDragSelection();

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

  const ctx: MenuSettingsContext = {
    draggingId,
    dropHint,
    handleEpoch,
    showInternal,
    isInternalItem,
    allowDrag: () => allowDragRef.current,
    prepareDrag,
    clearDrag,
    setDragging(id, entryType) {
      setDraggingId(id);
      setDraggingType(entryType);
    },
    setDropHint,
    canNestInto(targetGroupId) {
      if (!draggingId || draggingType !== "group") return true;
      return !isMenuGroupDescendant(config.entries, draggingId, targetGroupId);
    },
    onEditItem(groupId, item) {
      setItemDialog({ mode: "edit", groupId, item });
    },
    onEditGroup(group) {
      setGroupDialog({ mode: "edit", group });
    },
  };

  // Wait for entities so internal items stay hidden until the «Служебные» toggle.
  if (
    status === "idle" ||
    status === "loading" ||
    entityStatus === "idle" ||
    entityStatus === "loading"
  ) {
    return <MenuSettingsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base font-medium">Навигационное меню</h2>
          <p className="text-muted-foreground text-sm">
            Структура бокового меню: группы и пункты навигации. Группы можно
            вкладывать друг в друга.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <Label
            htmlFor="menu-show-internal"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            Служебные
          </Label>
          <Switch
            id="menu-show-internal"
            checked={showInternal}
            onCheckedChange={setShowInternal}
            aria-label="Показать служебные группы и сущности"
            title="Показать служебные группы и сущности, чтобы расставить их в меню"
          />
        </div>
      </div>

      <div
        className={cn(
          "relative overflow-visible rounded-xl border border-border bg-card p-3 shadow-xs",
          draggingId && "select-none",
        )}
      >
        <div
          className="absolute inset-x-3 top-2 z-20 h-4"
          onDragOver={(event) => {
            if (!hasEntryMime(event)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropHint({ type: "root-start" });
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            applyDrop(event, { parentGroupId: null, index: 0 });
            clearDrag();
          }}
        >
          {dropHint?.type === "root-start" ? (
            <DropIndicator edge="before" />
          ) : null}
        </div>
        <LayoutGroup id="menu-settings">
          <ul className="flex flex-col">
            <EntryList
              parentGroupId={null}
              entries={config.entries}
              nested={false}
              ctx={ctx}
            />
          </ul>
        </LayoutGroup>

        <div
          className="mt-2 flex flex-col gap-2"
          onDragOver={(event) => {
            if (!hasEntryMime(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropHint({ type: "root-end" });
          }}
          onDrop={(event) => {
            event.preventDefault();
            applyDrop(event, {
              parentGroupId: null,
              index: config.entries.length,
            });
            clearDrag();
          }}
        >
          <AddRow
            label="Добавить группу"
            isDropTarget={dropHint?.type === "root-end"}
            onClick={() => setGroupDialog({ mode: "create" })}
          />
        </div>
      </div>

      <MenuGroupDialog
        open={groupDialog.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setGroupDialog({ mode: "closed" });
        }}
        group={groupDialog.mode === "edit" ? groupDialog.group : null}
        onSubmit={(data) => {
          if (groupDialog.mode === "create") {
            addMenuGroup(data.title, data.icon, data.internal);
            return;
          }
          if (groupDialog.mode === "edit") {
            updateMenuGroup(groupDialog.group.id, {
              title: data.title,
              icon: data.icon,
              internal: data.internal,
            });
          }
        }}
      />

      <MenuItemDialog
        open={itemDialog.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setItemDialog({ mode: "closed" });
        }}
        groups={groups}
        initialGroupId={itemDialog.mode === "edit" ? itemDialog.groupId : null}
        item={itemDialog.mode === "edit" ? itemDialog.item : undefined}
        onSubmit={(data) => {
          if (itemDialog.mode !== "edit") return;
          updateMenuItem(itemDialog.item.id, {
            label: data.label,
            icon: data.icon,
            groupId: data.groupId,
          });
        }}
      />
    </div>
  );
}
