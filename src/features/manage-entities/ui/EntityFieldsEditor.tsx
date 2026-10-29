import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useDragControls,
  useMotionValue,
} from "motion/react";
import { toast } from "sonner";
import {
  addEntityField,
  addEntityTab,
  addEntityMirrorTab,
  addEntityTabWithExistingEntity,
  addEntityTabWithLinkedEntity,
  createEntityFieldGroupName,
  DEFAULT_ENTITY_FIELD_GROUP,
  dissolveEntityFieldGroup,
  rescueOrphanEntityFields,
  ENTITY_FIELD_GROUP_COLUMNS,
  ENTITY_HEADER_FIELD_GROUP,
  ENTITY_OVERVIEW_TAB_ID,
  ensureEntityFieldGroupMeta,
  filterEntityFieldGroupsForTab,
  getEntityFieldDisplayName,
  getEntityFieldGroupArea,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  getEntityHomeFieldsTabId,
  getEntityDisplayName,
  getEntityFieldTypeLabel,
  getEntityHeaderField,
  getEntityPathLabel,
  getEntityRelationTargetId,
  getEntitySummableFields,
  getEntityTableFields,
  getEntityTabLinkFieldIds,
  groupEntityFields,
  isEntityFieldsHostTab,
  isEntityFilesTab,
  isEntityHistoryTab,
  isEntityTimeSessionsTab,
  isEntityMirrorTab,
  isEntityInternal,
  isEntityFieldGroupTitleHidden,
  isEntityMetricsFieldGroup,
  updateEntityFieldGroup,
  isEntityNameField,
  isEntityOverviewTab,
  isEntityRecordsTab,
  isEntityTabWithLinkedEntity,
  isSystemEntityField,
  moveEntityFieldToGroup,
  moveEntityFieldToTab,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  placeEntityFieldGroup,
  placeEntityFieldInTable,
  PRIMARY_ENTITY_FIELD_GROUP,
  removeEntityField,
  removeEntityTab,
  renameEntityFieldGroup,
  reorderEntityFields,
  reorderEntityTabs,
  resolveEntityFieldGroups,
  resolvePrimaryEntityFieldGroups,
  resolveEntityListFieldOptions,
  resolveEntityListFieldSource,
  setEntityHeaderField,
  sortEntitiesByMenuOrder,
  updateEntity,
  updateEntityField,
  convertTabLinkRelationFieldToLookup,
  updateEntityTab,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityFieldGroupArea,
  type EntityTab,
} from "@/entities/entity";
import { getEntityLinkedMenuItemIds, useMenuConfig } from "@/entities/menu";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/cn";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import {
  EntityFieldDialog,
  type EntityFieldFormData,
} from "./EntityFieldDialog";
import { EntityFieldGroupDialog } from "./EntityFieldGroupDialog";
import { EntityListSettingsDialog } from "./EntityListSettingsDialog";
import {
  EntityFieldsOverviewButton,
  EntityFieldsOverviewDialog,
} from "./EntityFieldsOverviewDialog";
import { EntitySubEntitySettingsDialog } from "./EntitySubEntitySettingsDialog";
import { EntityFilesTabFoldersEditor } from "./EntityFilesTabFoldersEditor";
import { EntityTabDialog } from "./EntityTabDialog";

type EntityFieldsEditorProps = {
  entity: Entity;
  /** Linked sub-entity editor: only field groups, no tabs or primary block. */
  nested?: boolean;
  /** Existing shared entity tab: preview structure, no edit affordances. */
  readOnly?: boolean;
  /** Controlled active tab (visit history / URL). */
  activeTabId?: string | null;
  onActiveTabIdChange?: (tabId: string) => void;
  /** Hide the local «Все поля» button (opened from the entity header). */
  hideFieldsOverviewButton?: boolean;
  /** Hide the whole «Поля:» toolbar (title + overview + add). */
  hideFieldsToolbar?: boolean;
  /** Controlled «Все поля» dialog. */
  fieldsOverviewOpen?: boolean;
  onFieldsOverviewOpenChange?: (open: boolean) => void;
  /** Increment to open the create-field dialog from the parent header. */
  createFieldRequestId?: number;
};

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; group?: string }
  | { mode: "edit"; field: EntityField };

type GroupNameDialogState =
  | { mode: "closed" }
  | { mode: "create"; fieldId?: string }
  | { mode: "edit"; groupName: string };

type TabDialogState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; tab: EntityTab };

type DropHighlight =
  | { type: "group"; groupName: string; index: number }
  | { type: "new-group" }
  | { type: "general" }
  | { type: "primary" }
  | { type: "header" }
  | { type: "tab"; tabId: string }
  | null;

/** Where a dragged group will land. */
type GroupDropTarget = {
  area: EntityFieldGroupArea;
  /** Insert before this index in the destination area (or length = append). */
  index: number;
  /** stack = full-width row; pair = half-width beside a neighbor. */
  mode: "stack" | "pair";
  /** Neighbor group when mode is pair. */
  pairWith: string | null;
  side: "before" | "after";
};

/** True when the group is already on that side of the neighbor (left/right only). */
function isPairDropNoOp(
  groups: Array<{ name: string; colSpan: number }>,
  draggingName: string,
  target: GroupDropTarget,
) {
  if (target.mode !== "pair" || !target.pairWith) return false;

  const from = groups.findIndex((group) => group.name === draggingName);
  const pairIdx = groups.findIndex((group) => group.name === target.pairWith);
  if (from < 0 || pairIdx < 0) return false;

  const dragged = groups[from]!;
  const paired = groups[pairIdx]!;
  // Already sharing a half-width row on the requested side.
  if (dragged.colSpan !== 1 || paired.colSpan !== 1) return false;

  if (target.side === "before") return from === pairIdx - 1;
  return from === pairIdx + 1;
}

function groupInsertMarks(
  groups: Array<{ name: string; colSpan: number }>,
  draggingName: string | null,
  target: GroupDropTarget | null,
  area: EntityFieldGroupArea,
) {
  const marks = new Map<
    string,
    { edge: "before" | "after"; mode: "stack" | "pair" }
  >();
  if (!target || !draggingName || target.area !== area) return marks;
  const drop = target;

  const dragFrom = groups.findIndex((item) => item.name === draggingName);

  function stackEdgeFor(groupName: string): "before" | "after" | null {
    if (drop.mode !== "stack") return null;
    const insertAt = drop.index;

    if (insertAt < groups.length) {
      const anchor = groups[insertAt];
      if (anchor && anchor.name !== draggingName) {
        return anchor.name === groupName ? "before" : null;
      }
      for (let i = insertAt - 1; i >= 0; i -= 1) {
        if (groups[i]!.name === draggingName) continue;
        return groups[i]!.name === groupName ? "after" : null;
      }
      return null;
    }

    for (let i = groups.length - 1; i >= 0; i -= 1) {
      if (groups[i]!.name === draggingName) continue;
      return groups[i]!.name === groupName ? "after" : null;
    }
    return null;
  }

  for (const group of groups) {
    if (group.name === draggingName) continue;
    if (
      drop.mode === "pair" &&
      target.pairWith === group.name &&
      (dragFrom < 0 || !isPairDropNoOp(groups, draggingName, drop))
    ) {
      marks.set(group.name, { edge: drop.side, mode: "pair" });
      continue;
    }
    if (drop.mode === "stack") {
      const edge = stackEdgeFor(group.name);
      if (edge) marks.set(group.name, { edge, mode: "stack" });
    }
  }

  return marks;
}

function sameGroupDropTarget(
  a: GroupDropTarget | null,
  b: GroupDropTarget | null,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.area === b.area &&
    a.index === b.index &&
    a.mode === b.mode &&
    a.pairWith === b.pairWith &&
    a.side === b.side
  );
}

/** «Основное» anchors the primary strip — no drop above or to its left. */
function constrainPrimaryAnchorDrop(
  target: GroupDropTarget | null,
  groups: Array<{ name: string }>,
): GroupDropTarget | null {
  if (!target || target.area !== "primary") return target;

  const mainIdx = groups.findIndex(
    (group) => group.name === PRIMARY_ENTITY_FIELD_GROUP,
  );
  if (mainIdx < 0) return target;

  if (
    target.mode === "pair" &&
    target.pairWith === PRIMARY_ENTITY_FIELD_GROUP &&
    target.side === "before"
  ) {
    return null;
  }

  if (target.mode === "stack" && target.index <= mainIdx) {
    return null;
  }

  return target;
}

/** Drop target: group sits to the right of «Основное» on the same row. */
function primaryPairAfterMain(
  groups: Array<{ name: string }>,
): GroupDropTarget | null {
  const mainIdx = groups.findIndex(
    (group) => group.name === PRIMARY_ENTITY_FIELD_GROUP,
  );
  if (mainIdx < 0) return null;
  return {
    area: "primary",
    index: mainIdx + 1,
    mode: "pair",
    pairWith: PRIMARY_ENTITY_FIELD_GROUP,
    side: "after",
  };
}

/**
 * When the pointer is in the right half of the primary grid row that holds
 * «Основное» (card right half, or empty cell beside a half-width main).
 */
function resolvePairBesidePrimaryMain(
  grid: HTMLElement,
  groups: Array<{ name: string; colSpan: number }>,
  clientX: number,
  clientY: number,
): GroupDropTarget | null {
  const mainEl =
    [...grid.querySelectorAll<HTMLElement>("[data-field-group]")].find(
      (el) => el.dataset.fieldGroup === PRIMARY_ENTITY_FIELD_GROUP,
    ) ?? null;
  if (!mainEl) return null;

  const mainRect = mainEl.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const rowPad = 20;
  const inMainRow =
    clientY >= mainRect.top - rowPad && clientY <= mainRect.bottom + rowPad;
  if (!inMainRow) return null;
  if (clientX < gridRect.left - 8 || clientX > gridRect.right + 8) return null;

  const mainMidX = mainRect.left + mainRect.width * 0.4;
  const gridMidX = gridRect.left + gridRect.width / 2;
  // Full-width «Основное»: right ~60% of the card.
  // Half-width: right column of the grid (empty slot or sibling).
  const onRightOfMain =
    mainRect.width >= gridRect.width * 0.65
      ? clientX >= mainMidX
      : clientX >= gridMidX - 8;

  if (!onRightOfMain) return null;

  return primaryPairAfterMain(groups);
}

function resolveDropInGroupsGrid(
  grid: HTMLElement | null,
  groups: Array<{ name: string; colSpan: number }>,
  draggingName: string,
  clientX: number,
  clientY: number,
  area: EntityFieldGroupArea,
): GroupDropTarget | null {
  if (!grid) return null;

  if (area === "primary") {
    const besideMain = resolvePairBesidePrimaryMain(
      grid,
      groups,
      clientX,
      clientY,
    );
    if (besideMain) return besideMain;
  }

  const items = [
    ...grid.querySelectorAll<HTMLElement>("[data-field-group]"),
  ].filter((el) => {
    const name = el.dataset.fieldGroup;
    return Boolean(name) && name !== draggingName;
  });

  if (items.length === 0) {
    if (!pointInRect(clientX, clientY, grid.getBoundingClientRect(), 12)) {
      return null;
    }
    return constrainPrimaryAnchorDrop(
      {
        area,
        index: 0,
        mode: "stack",
        pairWith: null,
        side: "before",
      },
      groups,
    );
  }

  for (const el of items) {
    const rect = el.getBoundingClientRect();
    const hitRect = new DOMRect(
      rect.left,
      rect.top - 14,
      rect.width,
      rect.height + 28,
    );
    if (!pointInRect(clientX, clientY, hitRect, 4)) continue;

    const name = el.dataset.fieldGroup ?? "";
    const visualIndex = groups.findIndex((group) => group.name === name);
    if (visualIndex < 0 || !name) continue;

    const isPrimaryAnchor =
      area === "primary" && name === PRIMARY_ENTITY_FIELD_GROUP;
    const relX = (clientX - rect.left) / Math.max(rect.width, 1);
    const yInCard = clientY - rect.top;
    const relY = yInCard / Math.max(rect.height, 1);

    // «Основное»: only below (stack) — right side handled above.
    if (isPrimaryAnchor) {
      if (relY > 0.55 || clientY > rect.bottom - 8) {
        return {
          area,
          index: visualIndex + 1,
          mode: "stack",
          pairWith: null,
          side: "after",
        };
      }
      return null;
    }

    if (yInCard < rect.height * 0.28 || clientY < rect.top + 6) {
      return constrainPrimaryAnchorDrop(
        {
          area,
          index: visualIndex,
          mode: "stack",
          pairWith: null,
          side: "before",
        },
        groups,
      );
    }
    if (relY > 0.72 || clientY > rect.bottom - 6) {
      return {
        area,
        index: visualIndex + 1,
        mode: "stack",
        pairWith: null,
        side: "after",
      };
    }

    if (relX < 0.36) {
      return constrainPrimaryAnchorDrop(
        {
          area,
          index: visualIndex,
          mode: "pair",
          pairWith: name,
          side: "before",
        },
        groups,
      );
    }
    if (relX > 0.64) {
      return {
        area,
        index: visualIndex + 1,
        mode: "pair",
        pairWith: name,
        side: "after",
      };
    }

    if (relY < 0.5) {
      return constrainPrimaryAnchorDrop(
        {
          area,
          index: visualIndex,
          mode: "stack",
          pairWith: null,
          side: "before",
        },
        groups,
      );
    }
    return {
      area,
      index: visualIndex + 1,
      mode: "stack",
      pairWith: null,
      side: "after",
    };
  }

  const first = items[0]!;
  const firstRect = first.getBoundingClientRect();
  if (
    clientY < firstRect.top &&
    pointInRect(clientX, clientY, grid.getBoundingClientRect(), 16)
  ) {
    const name = first.dataset.fieldGroup ?? "";
    const visualIndex = groups.findIndex((group) => group.name === name);
    return constrainPrimaryAnchorDrop(
      {
        area,
        index: visualIndex >= 0 ? visualIndex : 0,
        mode: "stack",
        pairWith: null,
        side: "before",
      },
      groups,
    );
  }

  const last = items[items.length - 1]!;
  const lastRect = last.getBoundingClientRect();
  if (
    clientY >= lastRect.bottom - 8 &&
    pointInRect(clientX, clientY, grid.getBoundingClientRect(), 20)
  ) {
    return {
      area,
      index: groups.length,
      mode: "stack",
      pairWith: null,
      side: "after",
    };
  }

  if (pointInRect(clientX, clientY, grid.getBoundingClientRect(), 8)) {
    return {
      area,
      index: groups.length,
      mode: "stack",
      pairWith: null,
      side: "after",
    };
  }

  return null;
}

const HEADER_FIELD_SLOT_WIDTH = "15rem";
const HEADER_ZONE_HEIGHT = "3.5rem";

const nameHeaderShellClass =
  "flex shrink-0 items-center overflow-hidden rounded-xl border border-border/70 bg-muted/20 px-3.5";

/** In-flow collapse — absolute + motion layout transforms leave actions stuck. */
const fieldActionsClass =
  "grid min-w-0 shrink-0 grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-150 ease-out group-hover/field:grid-cols-[1fr] group-hover/field:opacity-100 group-has-[:focus-visible]/field:grid-cols-[1fr] group-has-[:focus-visible]/field:opacity-100 group-hover/header:grid-cols-[1fr] group-hover/header:opacity-100 group-has-[:focus-visible]/header:grid-cols-[1fr] group-has-[:focus-visible]/header:opacity-100 group-hover/card:grid-cols-[1fr] group-hover/card:opacity-100 group-has-[:focus-visible]/card:grid-cols-[1fr] group-has-[:focus-visible]/card:opacity-100";

const fieldActionsInnerClass =
  "flex min-w-0 items-center gap-0.5 overflow-hidden";

const fieldActionButtonClass =
  "shrink-0 text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5";

const hoverActionsClass =
  "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150";

/** Chrome that appears when entering schema edit mode. */
const editChromeTransition = {
  type: "spring" as const,
  stiffness: 480,
  damping: 30,
  mass: 0.65,
};

const editCardTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.7,
};

function EditAppear({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          className={className}
          initial={{ opacity: 0, scale: 0.88, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: -4 }}
          transition={editChromeTransition}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type DragHome = {
  groupName: string;
  index: number;
  colSpan: number;
  rect: DOMRect;
};

type RowRange = {
  start: number;
  end: number;
};

function fieldColSpanOf(value: number | string | undefined) {
  const span = typeof value === "string" ? Number(value) : (value ?? 1);
  return Math.min(GRID_COLUMNS, Math.max(1, Number.isFinite(span) ? span : 1));
}

/** Pack fields into visual grid rows; start/end are insert indices. */
function packRowRanges(spans: number[], columns = GRID_COLUMNS): RowRange[] {
  if (spans.length === 0) return [{ start: 0, end: 0 }];

  const rows: RowRange[] = [];
  let rowStart = 0;
  let used = 0;

  for (let i = 0; i < spans.length; i += 1) {
    const span = fieldColSpanOf(spans[i]);
    if (used > 0 && used + span > columns) {
      rows.push({ start: rowStart, end: i });
      rowStart = i;
      used = 0;
    }
    used += span;
    if (used >= columns) {
      rows.push({ start: rowStart, end: i + 1 });
      rowStart = i + 1;
      used = 0;
    }
  }

  if (rowStart < spans.length) {
    rows.push({ start: rowStart, end: spans.length });
  }

  return rows.length > 0 ? rows : [{ start: 0, end: spans.length }];
}

/**
 * Full-width fields must occupy their own row:
 * moving down → only end of a row; moving up → only start of a row.
 */
function snapFullWidthInsertIndex(
  spans: number[],
  rawIndex: number,
  movingDown: boolean,
  homeIndex: number | null,
) {
  const index = Math.max(0, Math.min(rawIndex, spans.length));
  if (homeIndex != null && index === homeIndex) return homeIndex;

  const rows = packRowRanges(spans);
  let target = rows[0] ?? { start: 0, end: spans.length };
  for (const row of rows) {
    if (index <= row.end) {
      target = row;
      break;
    }
    target = row;
  }

  return movingDown ? target.end : target.start;
}

const GRID_COLUMNS = 4;
const MAX_ROW_SPAN = 3;
const BASE_CARD_HEIGHT = 56;
const GRID_GAP = 12;
const ROW_STEP = BASE_CARD_HEIGHT + GRID_GAP;

const fieldsGridClassName =
  "grid min-w-0 list-none grid-cols-2 gap-3 p-3 [grid-auto-flow:dense] sm:grid-cols-4";
const fieldsGridStyle = {
  gridAutoRows: BASE_CARD_HEIGHT,
} as const;

function fieldGridItemStyle(colSpan: number, rowSpan: number) {
  return {
    gridColumn: `span ${Math.min(GRID_COLUMNS, Math.max(1, colSpan))}`,
    gridRow: `span ${Math.min(MAX_ROW_SPAN, Math.max(1, rowSpan))}`,
  };
}

const fieldLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

const simpleFieldDropTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

const groupExitTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

function willRelocateField(
  fieldId: string,
  highlight: DropHighlight,
  fields: EntityField[],
) {
  if (!highlight) return false;
  // Header slot relocates the field out of the grid.
  if (highlight.type === "header") return true;
  if (
    highlight.type === "new-group" ||
    highlight.type === "general" ||
    highlight.type === "primary"
  ) {
    return true;
  }
  if (highlight.type === "tab") {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return true;
    return getEntityFieldTabId(field) !== highlight.tabId;
  }

  const groups = groupEntityFields(fields);
  const target = groups.find((group) => group.name === highlight.groupName);
  if (!target) return true;

  const dragIndex = target.fields.findIndex((field) => field.id === fieldId);
  if (dragIndex < 0) return true;
  return highlight.index !== dragIndex;
}

function FieldDragHandle({
  active = false,
  shifted = false,
  label = "Перетащить поле",
  onPointerDown,
}: {
  active?: boolean;
  shifted?: boolean;
  label?: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <span
      data-drag-handle
      className={cn(
        "relative z-10 flex shrink-0 items-center justify-center self-stretch overflow-hidden touch-none select-none transition-[width,margin] duration-150",
        active
          ? "mr-0.5 w-3 cursor-grabbing"
          : "w-0 cursor-grab group-hover/field:mr-0.5 group-hover/field:w-3",
        shifted && "ml-2.5",
      )}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
    >
      <span
        aria-hidden
        className={cn(
          "my-1.5 h-[calc(100%-0.75rem)] min-h-7 w-1 shrink-0 rounded-full bg-primary",
          active ? "opacity-100" : "opacity-55",
        )}
      />
    </span>
  );
}

function GroupDragHandle({
  active = false,
  onPointerDown,
}: {
  active?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <span
      data-group-drag-handle
      className={cn(
        "relative z-20 flex shrink-0 touch-none items-center justify-center self-stretch overflow-hidden select-none transition-[width,margin] duration-150",
        active
          ? "mr-0.5 w-3 cursor-grabbing"
          : "w-0 cursor-grab group-hover/group:mr-0.5 group-hover/group:w-3",
      )}
      aria-label="Перетащить группу"
      title="Перетащить группу"
      onPointerDown={onPointerDown}
    >
      <span
        aria-hidden
        className={cn(
          "my-2 h-[calc(100%-1rem)] min-h-9 w-1 shrink-0 rounded-full bg-primary",
          active ? "opacity-100" : "opacity-55",
        )}
      />
    </span>
  );
}

function ResizeArc({
  active = false,
  onPointerDown,
}: {
  active?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Изменить размер"
      className="absolute right-0 bottom-0 z-10 flex size-5 cursor-default items-end justify-end p-0.5 select-none"
      onPointerDown={onPointerDown}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "size-4 text-primary transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0 group-hover/field:opacity-55",
        )}
      >
        <path
          d="M18.5 8A10.5 10.5 0 0 1 8 18.5"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function resolveInsertIndex(
  groupEl: HTMLElement,
  clientX: number,
  clientY: number,
  excludeId: string,
  stickyIndex: number | null = null,
  home: DragHome | null = null,
  groupName: string | null = null,
) {
  // Keep the original slot while the pointer stays over the home cell —
  // otherwise a barely-moved card swaps with the neighbor that fills the gap.
  if (
    home &&
    groupName === home.groupName &&
    pointInRect(clientX, clientY, home.rect, GRID_GAP)
  ) {
    return home.index;
  }

  const cards = [
    ...groupEl.querySelectorAll<HTMLElement>("[data-field-id]"),
  ].filter((card) => card.dataset.fieldId !== excludeId);

  if (cards.length === 0) return 0;

  const spans = cards.map((card) => fieldColSpanOf(card.dataset.colSpan));
  const pad = GRID_GAP / 2;
  const enterBefore = 0.38;
  const enterAfter = 0.62;
  const homeIndex = home && groupName === home.groupName ? home.index : null;
  // Full-width cards stack vertically — use Y for before/after, not X.
  const verticalStack =
    (home != null && home.colSpan >= GRID_COLUMNS) ||
    spans.every((span) => fieldColSpanOf(span) >= GRID_COLUMNS);
  const appendIndex = cards.length;
  // Dragging the last field: "before last remaining card" is the adjacent
  // swap (4↔3). Biasing that card toward append made the swap unreachable.
  const draggingFromEnd = homeIndex != null && homeIndex >= appendIndex;
  const draggingFromStart = homeIndex === 0;

  function applySticky(index: number, raw: number, ratioX: number) {
    if (stickyIndex == null || Math.abs(raw - stickyIndex) !== 1) {
      return raw;
    }
    // Vertical stacks: no hysteresis — it blocked adjacent swaps
    // (last↔previous) and append/start commits.
    if (verticalStack) {
      return raw;
    }
    if (stickyIndex === index) {
      return ratioX < enterAfter ? index : index + 1;
    }
    if (stickyIndex === index + 1) {
      return ratioX > enterBefore ? index + 1 : index;
    }
    return raw;
  }

  function preferHome(raw: number) {
    if (
      home == null ||
      groupName !== home.groupName ||
      Math.abs(raw - home.index) !== 1
    ) {
      return raw;
    }
    // Start/append are intentional even when adjacent to home in index space
    // (e.g. middle card → end in a horizontal row).
    if (raw === 0 || raw === appendIndex) return raw;
    // Vertical: once the pointer leaves the home cell vertically, accept
    // the adjacent slot (needed for last→previous and first→next).
    if (verticalStack) {
      if (clientY < home.rect.top - pad || clientY > home.rect.bottom + pad) {
        return raw;
      }
    }
    const homeCx = home.rect.left + home.rect.width / 2;
    const homeCy = home.rect.top + home.rect.height / 2;
    const homeDist = (clientX - homeCx) ** 2 + (clientY - homeCy) ** 2;
    const radius = verticalStack
      ? home.rect.height * 0.22
      : Math.min(home.rect.width, home.rect.height) * 0.55;
    if (homeDist <= radius ** 2) {
      return home.index;
    }
    return raw;
  }

  function finalize(raw: number) {
    const index = preferHome(raw);
    // Pure vertical stacks already resolve before/after per card — row
    // snapping only matters when a full-width card lands among mixed spans.
    if (verticalStack || home == null || home.colSpan < GRID_COLUMNS) {
      return index;
    }
    const movingDown = clientY > home.rect.top + home.rect.height / 2;
    return snapFullWidthInsertIndex(spans, index, movingDown, homeIndex);
  }

  // Below every remaining card → always append (end of group).
  let stackBottom = -Infinity;
  for (const card of cards) {
    stackBottom = Math.max(stackBottom, card.getBoundingClientRect().bottom);
  }
  if (clientY > stackBottom) {
    return finalize(appendIndex);
  }

  // Prefer the card whose cell actually contains the pointer (X and Y),
  // so multi-column rows are not stuck on the first card in DOM order.
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    const inCell =
      clientX >= rect.left - pad &&
      clientX <= rect.right + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.bottom + pad;

    if (!inCell) continue;

    const ratioX = (clientX - rect.left) / Math.max(rect.width, 1);
    const ratioY = (clientY - rect.top) / Math.max(rect.height, 1);
    const isLast = index === cards.length - 1;
    const isFirst = index === 0;
    // Append bias only when not dragging the current last field upward.
    // Start bias only when not dragging the first field downward.
    let afterThreshold = 0.5;
    if (verticalStack && isLast && !draggingFromEnd) {
      afterThreshold = 0.35;
    } else if (verticalStack && isFirst && !draggingFromStart) {
      afterThreshold = 0.65;
    }
    const raw = verticalStack
      ? ratioY > afterThreshold
        ? index + 1
        : index
      : ratioY > 0.72 || ratioX >= 0.5
        ? index + 1
        : index;
    return finalize(applySticky(index, raw, ratioX));
  }

  // Pointer is in empty grid space — place relative to nearest card.
  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = index;
    }
  }

  const nearest = cards[nearestIndex].getBoundingClientRect();
  if (clientY < nearest.top) return finalize(nearestIndex);
  if (clientY > nearest.bottom) return finalize(nearestIndex + 1);
  if (clientX < nearest.left + nearest.width / 2) {
    return finalize(nearestIndex);
  }
  return finalize(nearestIndex + 1);
}

function sameDropHighlight(a: DropHighlight, b: DropHighlight) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === "group" && b.type === "group") {
    return a.groupName === b.groupName && a.index === b.index;
  }
  if (a.type === "tab" && b.type === "tab") {
    return a.tabId === b.tabId;
  }
  return true;
}

function pointInRect(clientX: number, clientY: number, rect: DOMRect, pad = 0) {
  return (
    clientX >= rect.left - pad &&
    clientX <= rect.right + pad &&
    clientY >= rect.top - pad &&
    clientY <= rect.bottom + pad
  );
}

/** Hit just under a group — where the append insert mark sits. */
function pointBelowGroup(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  slop: number,
) {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY > rect.bottom &&
    clientY <= rect.bottom + slop
  );
}

function isPointerNearPrimaryStrip(
  clientY: number,
  stripAlreadyVisible = false,
) {
  const name = document.querySelector<HTMLElement>("[data-entity-name-field]");
  if (!name) return false;
  const nameRect = name.getBoundingClientRect();
  const tabs = document.querySelector<HTMLElement>("[data-entity-tabs]");
  const ceiling = tabs?.getBoundingClientRect().top ?? nameRect.bottom + 56;
  if (stripAlreadyVisible) {
    return (
      clientY >= nameRect.top - 10 &&
      clientY < Math.min(nameRect.bottom + 44, ceiling)
    );
  }
  return (
    clientY >= nameRect.top && clientY < Math.min(nameRect.bottom + 22, ceiling)
  );
}

function isPointerNearGeneralStrip(
  clientY: number,
  stripAlreadyVisible = false,
) {
  const tabs = document.querySelector<HTMLElement>("[data-entity-tabs]");
  if (tabs) {
    const bottom = tabs.getBoundingClientRect().bottom;
    return stripAlreadyVisible
      ? clientY > bottom - 20 && clientY < bottom + 36
      : clientY > bottom - 4 && clientY < bottom + 20;
  }

  const root = document.querySelector<HTMLElement>("[data-entity-fields]");
  if (!root) return false;

  const primary = root.querySelector<HTMLElement>(
    `[data-field-group="${CSS.escape(PRIMARY_ENTITY_FIELD_GROUP)}"]`,
  );
  if (primary) {
    const bottom = primary.getBoundingClientRect().bottom;
    // Only below «Основное» — never steal drops from inside the primary group.
    return stripAlreadyVisible
      ? clientY > bottom && clientY < bottom + 40
      : clientY > bottom + 2 && clientY < bottom + 22;
  }

  const firstGroup = root.querySelector<HTMLElement>("[data-field-group]");
  if (firstGroup) {
    const top = firstGroup.getBoundingClientRect().top;
    return stripAlreadyVisible ? clientY < top + 28 : clientY < top - 2;
  }

  const rect = root.getBoundingClientRect();
  return clientY < rect.top + (stripAlreadyVisible ? 56 : 24);
}

function resolveGroupTarget(
  groupEl: HTMLElement,
  clientX: number,
  clientY: number,
  draggingId: string,
  previous: DropHighlight,
  home: DragHome | null = null,
): { type: "group"; groupName: string; index: number } | null {
  const groupName = groupEl.dataset.fieldGroup;
  if (!groupName) return null;
  const stickyIndex =
    previous?.type === "group" && previous.groupName === groupName
      ? previous.index
      : null;
  return {
    type: "group",
    groupName,
    index: resolveInsertIndex(
      groupEl,
      clientX,
      clientY,
      draggingId,
      stickyIndex,
      home,
      groupName,
    ),
  };
}

function resolveDropTarget(
  clientX: number,
  clientY: number,
  draggingId: string,
  previous: DropHighlight = null,
  home: DragHome | null = null,
):
  | { type: "group"; groupName: string; index: number }
  | { type: "new-group" }
  | { type: "general" }
  | { type: "primary" }
  | { type: "header" }
  | { type: "tab"; tabId: string }
  | null {
  const headerZone = document.querySelector<HTMLElement>(
    "[data-header-field-slot]",
  );
  if (
    headerZone &&
    pointInRect(
      clientX,
      clientY,
      headerZone.getBoundingClientRect(),
      previous?.type === "header" ? 10 : 0,
    )
  ) {
    return { type: "header" };
  }

  const tabZones = [
    ...document.querySelectorAll<HTMLElement>("[data-entity-tab-drop]"),
  ];
  const hitTab =
    tabZones.find((zone) =>
      pointInRect(
        clientX,
        clientY,
        zone.getBoundingClientRect(),
        previous?.type === "tab" &&
          previous.tabId === zone.dataset.entityTabDrop
          ? 8
          : 0,
      ),
    ) ?? null;
  if (hitTab?.dataset.entityTabDrop) {
    return { type: "tab", tabId: hitTab.dataset.entityTabDrop };
  }

  const newZone = document.querySelector<HTMLElement>("[data-new-group-zone]");
  const newRect = newZone?.getBoundingClientRect() ?? null;
  // Negative pad = must be deeper inside the zone to activate.
  const inNewCore =
    newRect != null && pointInRect(clientX, clientY, newRect, -6);
  const inNewPad =
    newRect != null && pointInRect(clientX, clientY, newRect, 12);

  const groupEls = [
    ...document.querySelectorAll<HTMLElement>("[data-field-group]"),
  ];
  const GROUP_BOTTOM_SLOP = 16;
  const hitGroupExact =
    groupEls.find((groupEl) =>
      pointInRect(clientX, clientY, groupEl.getBoundingClientRect()),
    ) ?? null;
  // Append zone sits just under the group box (InsertAfterMark) — extend hit
  // downward so drops below the last field still resolve to that group.
  const hitGroupBelow =
    hitGroupExact ??
    groupEls.find((groupEl) =>
      pointBelowGroup(
        clientX,
        clientY,
        groupEl.getBoundingClientRect(),
        GROUP_BOTTOM_SLOP,
      ),
    ) ??
    null;
  const hitGroup = hitGroupExact ?? hitGroupBelow;

  if (previous?.type === "new-group") {
    if (inNewCore || !hitGroup) {
      if (inNewPad || inNewCore) return { type: "new-group" };
    }
  }

  // Prefer an actual group under the pointer over the «Общее» strip —
  // the strip sits near the bottom of «Основное» and was stealing drops.
  // Yield to «Создать группу» when the pointer reaches that pad.
  if (previous?.type === "group" && !inNewPad) {
    const prevGroup =
      groupEls.find((el) => el.dataset.fieldGroup === previous.groupName) ??
      null;
    const prevRect = prevGroup?.getBoundingClientRect() ?? null;
    if (
      prevGroup &&
      prevRect &&
      (pointInRect(clientX, clientY, prevRect, 16) ||
        pointBelowGroup(clientX, clientY, prevRect, GROUP_BOTTOM_SLOP))
    ) {
      return resolveGroupTarget(
        prevGroup,
        clientX,
        clientY,
        draggingId,
        previous,
        home,
      );
    }
  }

  if (inNewCore || (inNewPad && !hitGroupExact)) {
    return { type: "new-group" };
  }

  if (hitGroup) {
    return resolveGroupTarget(
      hitGroup,
      clientX,
      clientY,
      draggingId,
      previous,
      home,
    );
  }

  const primaryZone = document.querySelector<HTMLElement>(
    "[data-primary-group-zone]",
  );
  if (
    primaryZone &&
    pointInRect(
      clientX,
      clientY,
      primaryZone.getBoundingClientRect(),
      previous?.type === "primary" ? 12 : 0,
    )
  ) {
    return { type: "primary" };
  }

  const generalZone = document.querySelector<HTMLElement>(
    "[data-general-group-zone]",
  );
  if (
    generalZone &&
    pointInRect(
      clientX,
      clientY,
      generalZone.getBoundingClientRect(),
      previous?.type === "general" ? 12 : 0,
    )
  ) {
    return { type: "general" };
  }

  if (previous?.type === "general" && generalZone) {
    const rect = generalZone.getBoundingClientRect();
    if (pointInRect(clientX, clientY, rect, 16)) {
      return { type: "general" };
    }
  }

  if (
    previous?.type === "general" &&
    isPointerNearGeneralStrip(clientY, true)
  ) {
    return { type: "general" };
  }

  return null;
}

function InsertBeforeMark() {
  return (
    <span
      aria-hidden
      data-drop-slot=""
      className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-3 items-center justify-center"
    >
      <span
        className={cn(
          "my-1.5 h-[calc(100%-0.75rem)] min-h-7 w-1 rounded-full bg-primary",
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_20%,transparent)]",
        )}
      />
    </span>
  );
}

function InsertEdge() {
  const gutter = "0.375rem";

  return (
    <span
      aria-hidden
      data-drop-slot=""
      className={cn(
        "pointer-events-none absolute z-20 rounded-full bg-primary",
        "shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_20%,transparent)]",
        "top-1.5 bottom-1.5 w-1 right-0 translate-x-[calc(100%+var(--insert-gutter))]",
      )}
      style={{ ["--insert-gutter" as string]: gutter }}
    />
  );
}

/** Horizontal append mark under a full-width field (end of vertical stack). */
function InsertAfterMark() {
  return (
    <span
      aria-hidden
      data-drop-slot=""
      className={cn(
        "pointer-events-none absolute right-1 left-1 z-20 flex h-3 items-center",
        "top-full -translate-y-0.5",
      )}
    >
      <span
        className={cn(
          "h-1 w-full rounded-full bg-primary",
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_20%,transparent)]",
        )}
      />
    </span>
  );
}

function FieldInsertAfterMark({ colSpan }: { colSpan: number }) {
  return fieldColSpanOf(colSpan) >= GRID_COLUMNS ? (
    <InsertAfterMark />
  ) : (
    <InsertEdge />
  );
}

/** In-flow insert gutter — shifts the group card like field insert slots. */
function GroupInsertSlot() {
  return (
    <span
      aria-hidden
      data-group-drop-slot=""
      className="pointer-events-none relative z-20 flex w-3 shrink-0 items-center justify-center self-stretch"
    >
      <span
        className={cn(
          "my-2 h-[calc(100%-1rem)] min-h-8 w-1 rounded-full bg-primary",
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_20%,transparent)]",
        )}
      />
    </span>
  );
}

/** Horizontal insert strip — new full-width row above/below a group. */
function GroupRowInsertMark({ edge }: { edge: "before" | "after" }) {
  return (
    <span
      aria-hidden
      data-group-drop-slot=""
      className={cn(
        "pointer-events-none absolute inset-x-0 z-40 flex h-3 items-center px-1",
        edge === "before"
          ? "bottom-full translate-y-1.5"
          : "top-full -translate-y-1.5",
      )}
    >
      <span
        className={cn(
          "h-1 w-full rounded-full bg-primary",
          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)]",
        )}
      />
    </span>
  );
}

function GeneralDropStrip({ active }: { active: boolean }) {
  return (
    <div
      data-general-group-zone=""
      className={cn(
        "h-1 w-full rounded-full transition-opacity",
        active ? "bg-primary/70" : "bg-primary/40",
      )}
    />
  );
}

function buildSlotPreview(
  fields: EntityField[],
  draggingId: string,
  dropIndex: number,
) {
  const others = fields.filter((field) => field.id !== draggingId);
  const index = Math.max(0, Math.min(dropIndex, others.length));
  const dragIndex = fields.findIndex((field) => field.id === draggingId);
  const isNoOp = dragIndex >= 0 && index === dragIndex;

  return { others, index, isNoOp };
}

function insertEdgeForField(
  fieldId: string,
  others: EntityField[],
  insertIndex: number,
): "before" | "after" | null {
  if (others.length === 0) return null;

  if (insertIndex < others.length && others[insertIndex]?.id === fieldId) {
    return "before";
  }

  if (
    insertIndex === others.length &&
    others[others.length - 1]?.id === fieldId
  ) {
    return "after";
  }

  return null;
}

function FieldLinkBadge({
  label,
  title,
  kind = "relation",
}: {
  label: string;
  title?: string;
  kind?: "relation" | "tab" | "list";
}) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full min-w-0 items-center gap-0.5 text-xs text-muted-foreground"
    >
      <Link2 className="size-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{label}</span>
      {kind === "tab" ? (
        <span className="shrink-0 text-[10px] tracking-wide uppercase opacity-70">
          вкладка
        </span>
      ) : null}
    </span>
  );
}

function FieldCardMeta({
  field,
  entityId,
}: {
  field: EntityField;
  entityId?: string;
}) {
  const { entities } = useEntityConfig();
  const displayName = getEntityFieldDisplayName(field);
  const groupName = getEntityFieldGroupName(field.group);
  const nameDuplicatesGroup =
    displayName.trim().toLocaleLowerCase("ru") ===
    groupName.trim().toLocaleLowerCase("ru");
  const typeLabel = getEntityFieldTypeLabel(field.type);
  const relationTargetId = getEntityRelationTargetId(field);
  const relationTargetLabel = relationTargetId
    ? getEntityPathLabel(relationTargetId, entities)
    : null;
  const isTabLink =
    entityId != null &&
    getEntityTabLinkFieldIds(entityId, entities).has(field.id);
  const listSource = resolveEntityListFieldSource(field, entities);
  const listFixedHint =
    field.type === "list" && field.listFixed
      ? field.listMultiple
        ? "фиксированный · несколько"
        : "фиксированный"
      : null;
  const listFromEntity =
    field.type === "list" && listSource
      ? `${getEntityPathLabel(listSource.entity.id, entities)} · ${getEntityFieldDisplayName(listSource.field)}`
      : null;
  const relationGroupsMeta =
    field.type === "relationGroups"
      ? (() => {
          const levels = field.relationGroups?.levels ?? [];
          const entityIds = levels
            .map((level) =>
              level.source.kind === "entity" ? level.source.entityId : null,
            )
            .filter((id): id is string => Boolean(id));
          if (entityIds.length < 2) return `${typeLabel} · не настроено`;
          return entityIds
            .map((id) => getEntityPathLabel(id, entities))
            .join(" → ");
        })()
      : null;
  const plainMeta =
    field.type === "list"
      ? listFromEntity
        ? null
        : `${typeLabel} · Новый${listFixedHint ? ` · ${listFixedHint}` : ""}`
      : field.type === "relation" || field.type === "relationGroups"
        ? null
        : typeLabel;

  const statusBadges = (
    <>
      {field.required ? (
        <span
          className="shrink-0 text-[10px] font-medium tracking-wide text-destructive/80 uppercase"
          title="Обязательное поле"
        >
          обяз.
        </span>
      ) : null}
      {isSystemEntityField(field) && !isTabLink ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          title="Системное поле — нельзя удалить"
        >
          сист.
        </span>
      ) : null}
    </>
  );

  return (
    <div className="min-w-0 flex-1">
      {nameDuplicatesGroup ? null : (
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold tracking-tight">
            {displayName}
          </p>
          {statusBadges}
        </div>
      )}
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          !nameDuplicatesGroup && "mt-0.5",
        )}
      >
        {nameDuplicatesGroup ? statusBadges : null}
        {field.type === "relation" ? (
          <FieldLinkBadge
            kind={isTabLink ? "tab" : "relation"}
            label={relationTargetLabel ?? "Сущность не выбрана"}
            title={
              isTabLink
                ? `Создано для связи вкладки с «${relationTargetLabel ?? "сущностью"}» — нельзя удалить или сменить цель`
                : relationTargetLabel
                  ? `Поле связи с «${relationTargetLabel}»`
                  : "Выберите сущность для связи"
            }
          />
        ) : field.type === "relationGroups" ? (
          <FieldLinkBadge
            kind="relation"
            label={relationGroupsMeta ?? typeLabel}
            title={
              relationGroupsMeta
                ? `Наборы связей: ${relationGroupsMeta}`
                : "Настройте сущности строк и вложенных"
            }
          />
        ) : listFromEntity ? (
          <FieldLinkBadge
            kind="list"
            label={listFromEntity}
            title={`Список из поля «${getEntityFieldDisplayName(listSource!.field)}» сущности «${getEntityPathLabel(listSource!.entity.id, entities)}»${listFixedHint ? ` (${listFixedHint})` : ""}`}
          />
        ) : (
          <p className="truncate text-xs text-muted-foreground">{plainMeta}</p>
        )}
      </div>
    </div>
  );
}

function FieldRecordVisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        fieldActionButtonClass,
        !visible && "text-muted-foreground/70",
      )}
      aria-label={
        visible
          ? "Скрыть поле на странице записи"
          : "Показать поле на странице записи"
      }
      title={
        visible ? "Скрыть на странице записи" : "Показать на странице записи"
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {visible ? <Eye /> : <EyeOff />}
    </Button>
  );
}

function NameFieldBanner({
  field,
  entityId,
  onEdit,
}: {
  field: EntityField;
  entityId?: string;
  onEdit?: () => void;
}) {
  const name = getEntityFieldDisplayName(field);

  return (
    <div
      data-entity-name-field=""
      style={{ height: HEADER_ZONE_HEIGHT }}
      className={cn(nameHeaderShellClass, "group/header min-w-0")}
      title="Системное поле заголовка — нельзя удалить, переместить или изменить размер"
    >
      <div className="relative flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          <FieldCardMeta field={field} entityId={entityId} />
        </div>
        {onEdit ? (
          <div className={fieldActionsClass}>
            <div className={fieldActionsInnerClass}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={fieldActionButtonClass}
                aria-label={`Редактировать поле «${name}»`}
                onClick={onEdit}
              >
                <Pencil />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeaderFieldSlot({
  field,
  entityId,
  dropActive,
  isDragging = false,
  snapToOrigin = true,
  onClear,
  onEdit,
  onConfigureList,
  onDragStart,
  onDragEnd,
  onDragSettle,
}: {
  field: EntityField | null;
  entityId?: string;
  dropActive: boolean;
  isDragging?: boolean;
  snapToOrigin?: boolean;
  onClear: () => void;
  onEdit?: () => void;
  onConfigureList?: () => void;
  onDragStart?: () => void;
  onDragEnd?: (clientX: number, clientY: number) => void;
  onDragSettle?: () => void;
}) {
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const name = field ? getEntityFieldDisplayName(field) : null;

  useEffect(() => {
    if (isDragging) return;
    x.set(0);
    y.set(0);
  }, [isDragging, x, y]);

  const shellClass = cn(
    nameHeaderShellClass,
    "min-w-0 flex-1 transition-colors",
    dropActive && "border-primary/55 bg-primary/[0.06] ring-2 ring-primary/15",
  );

  return (
    <div
      data-header-field-slot=""
      style={{ height: HEADER_ZONE_HEIGHT }}
      className={cn(
        "flex min-w-0 items-stretch",
        isDragging && "overflow-visible",
      )}
      title={
        field
          ? `Поле у кнопок записи: «${name}»`
          : "Перетащите поле сюда — оно появится слева от действий на странице записи"
      }
    >
      {field && onDragStart && onDragEnd && onDragSettle ? (
        <motion.div
          layout={!isDragging}
          transition={fieldLayoutTransition}
          data-field-id={field.id}
          drag
          dragListener={false}
          dragControls={controls}
          dragElastic={0.08}
          dragMomentum={false}
          dragSnapToOrigin={snapToOrigin}
          dragTransition={{
            bounceStiffness: 280,
            bounceDamping: 34,
            power: 0.22,
          }}
          onDragStart={() => {
            lockDragSelection();
            onDragStart();
          }}
          onDragEnd={(event) => {
            const point =
              "clientX" in event
                ? { x: event.clientX, y: event.clientY }
                : { x: 0, y: 0 };
            onDragEnd(point.x, point.y);
            unlockDragSelection();
          }}
          onDragTransitionEnd={onDragSettle}
          whileDrag={{
            scale: 1.03,
            zIndex: 50,
            cursor: "grabbing",
            pointerEvents: "none",
            boxShadow: "0 14px 32px -18px rgb(0 0 0 / 0.4)",
          }}
          style={{ x, y, zIndex: isDragging ? 50 : undefined }}
          className={cn(
            "group/field relative flex min-h-0 min-w-0 flex-1 items-stretch outline-none select-none",
            isDragging && "pointer-events-auto z-50",
          )}
        >
          <FieldDragHandle
            active={isDragging}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.getSelection()?.removeAllRanges();
              controls.start(event);
            }}
          />
          <div className={shellClass}>
            <div className="relative flex min-w-0 flex-1 items-center gap-1">
              <div className="min-w-0 flex-1">
                <FieldCardMeta field={field} entityId={entityId} />
              </div>
              <div
                className={cn(
                  fieldActionsClass,
                  isDragging && "!grid-cols-[0fr] !opacity-0",
                )}
              >
                <div className={fieldActionsInnerClass}>
                  {field.type === "list" && onConfigureList ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={fieldActionButtonClass}
                      aria-label="Настройка списка"
                      title="Настройка списка"
                      onClick={onConfigureList}
                    >
                      <Settings />
                    </Button>
                  ) : null}
                  {onEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={fieldActionButtonClass}
                      aria-label={`Редактировать поле «${name}»`}
                      onClick={onEdit}
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      fieldActionButtonClass,
                      "hover:text-destructive",
                    )}
                    aria-label={`Убрать «${name}» из шапки записи`}
                    onClick={onClear}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : field ? (
        <div className={cn(shellClass, "group/header")}>
          <div className="relative flex min-w-0 flex-1 items-center">
            <div className="min-w-0 flex-1">
              <FieldCardMeta field={field} entityId={entityId} />
            </div>
          </div>
        </div>
      ) : (
        <div className={shellClass}>
          <p
            className={cn(
              "w-full truncate text-center text-xs leading-none",
              dropActive ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {dropActive ? "Отпустите сюда" : "Перетащите поле сюда"}
          </p>
        </div>
      )}
    </div>
  );
}

function FieldCard({
  entityId,
  field,
  groupName,
  isDragging,
  snapToOrigin,
  insertEdge = null,
  allowEdit = true,
  allowDelete = true,
  onDragStart,
  onDragEnd,
  onDragSettle,
  onEdit,
  onDelete,
  onConfigureList,
  enterFromEdit = false,
  enterDelay = 0,
}: {
  entityId: string;
  field: EntityField;
  groupName: string;
  isDragging: boolean;
  snapToOrigin: boolean;
  insertEdge?: "before" | "after" | null;
  allowEdit?: boolean;
  allowDelete?: boolean;
  onDragStart: () => void;
  onDragEnd: (clientX: number, clientY: number) => void;
  onDragSettle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfigureList?: () => void;
  /** Play enter animation when switching into schema edit. */
  enterFromEdit?: boolean;
  enterDelay?: number;
}) {
  const controls = useDragControls();
  const cardRef = useRef<HTMLLIElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [resizing, setResizing] = useState(false);
  const name = getEntityFieldDisplayName(field);
  const colSpan = field.colSpan;
  const rowSpan = field.rowSpan;

  useEffect(() => {
    if (isDragging) return;
    x.set(0);
    y.set(0);
  }, [isDragging, x, y]);

  function startResize(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();

    const item = cardRef.current;
    if (!item) return;

    const grid = item.closest("[data-fields-grid]");
    const gridWidth = grid instanceof HTMLElement ? grid.clientWidth : 0;
    const gap = GRID_GAP;
    const cellWidth = Math.max(
      (gridWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
      item.offsetWidth / Math.max(colSpan, 1),
      64,
    );

    const startX = event.clientX;
    const startY = event.clientY;
    const startCol = colSpan;
    const startRow = rowSpan;
    const cellHeight = ROW_STEP;
    let lastCol = startCol;
    let lastRow = startRow;

    setResizing(true);
    lockDragSelection();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "default";

    function onMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      document.body.style.cursor = "default";
      const nextCol = Math.min(
        GRID_COLUMNS,
        Math.max(
          1,
          startCol + Math.round((moveEvent.clientX - startX) / cellWidth),
        ),
      );
      const nextRow = Math.min(
        MAX_ROW_SPAN,
        Math.max(
          1,
          startRow + Math.round((moveEvent.clientY - startY) / cellHeight),
        ),
      );

      if (nextCol === lastCol && nextRow === lastRow) return;
      lastCol = nextCol;
      lastRow = nextRow;
      updateEntityField(entityId, field.id, {
        colSpan: nextCol,
        rowSpan: nextRow,
      });
    }

    function onUp() {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setResizing(false);
      unlockDragSelection();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <motion.li
      ref={cardRef}
      initial={enterFromEdit ? { opacity: 0, y: 8, scale: 0.985 } : false}
      animate={enterFromEdit ? { opacity: 1, y: 0, scale: 1 } : false}
      layout={!isDragging}
      transition={
        enterFromEdit
          ? { ...editCardTransition, delay: enterDelay }
          : fieldLayoutTransition
      }
      data-field-id={field.id}
      data-col-span={colSpan}
      data-field-group-name={groupName}
      drag={!resizing}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.08}
      dragMomentum={false}
      dragSnapToOrigin={snapToOrigin}
      dragTransition={{
        bounceStiffness: 280,
        bounceDamping: 34,
        power: 0.22,
      }}
      onDragStart={() => {
        lockDragSelection();
        onDragStart();
      }}
      onDragEnd={(event) => {
        const point =
          "clientX" in event
            ? { x: event.clientX, y: event.clientY }
            : { x: 0, y: 0 };
        onDragEnd(point.x, point.y);
        unlockDragSelection();
      }}
      onDragTransitionEnd={onDragSettle}
      whileDrag={{
        scale: 1.03,
        zIndex: 50,
        cursor: "grabbing",
        pointerEvents: "none",
        boxShadow: "0 14px 32px -18px rgb(0 0 0 / 0.4)",
      }}
      style={{
        ...fieldGridItemStyle(colSpan, rowSpan),
        x,
        y,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        "group/field relative flex h-full min-h-0 min-w-0 list-none items-stretch outline-none select-none",
        isDragging && "pointer-events-auto z-50",
      )}
    >
      {insertEdge === "before" ? <InsertBeforeMark /> : null}
      <FieldDragHandle
        active={isDragging}
        shifted={insertEdge === "before"}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          window.getSelection()?.removeAllRanges();
          controls.start(event);
        }}
      />

      <div className="relative min-h-0 min-w-0 flex-1">
        {insertEdge && insertEdge !== "before" ? (
          <FieldInsertAfterMark colSpan={colSpan} />
        ) : null}
        <div
          className={cn(
            "group/card relative flex h-full min-h-0 min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-dashed py-2.5 pr-4 pl-3",
            field.showOnRecord === false && "opacity-60",
            isDragging
              ? "border-primary/50 bg-card shadow-sm"
              : resizing
                ? "border-primary/35 bg-transparent"
                : insertEdge
                  ? "border-primary/30 bg-transparent"
                  : "border-border bg-transparent hover:border-foreground/35 hover:bg-muted/10",
          )}
        >
          <div className="min-w-0 flex-1">
            <FieldCardMeta field={field} entityId={entityId} />
          </div>
          {allowEdit || allowDelete || !isEntityNameField(field) ? (
            <div
              className={cn(
                fieldActionsClass,
                isDragging && "!grid-cols-[0fr] !opacity-0",
              )}
            >
              <div className={fieldActionsInnerClass}>
                {allowEdit && field.type === "list" && onConfigureList ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={fieldActionButtonClass}
                    aria-label="Настройка списка"
                    title="Настройка списка"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={onConfigureList}
                  >
                    <Settings />
                  </Button>
                ) : null}
                {allowEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={fieldActionButtonClass}
                    aria-label={`Редактировать поле «${name}»`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={onEdit}
                  >
                    <Pencil />
                  </Button>
                ) : null}
                {!isEntityNameField(field) ? (
                  <FieldRecordVisibilityToggle
                    visible={field.showOnRecord !== false}
                    onToggle={() =>
                      updateEntityField(entityId, field.id, {
                        showOnRecord: field.showOnRecord === false,
                      })
                    }
                  />
                ) : null}
                {allowDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      fieldActionButtonClass,
                      "hover:text-destructive",
                    )}
                    aria-label={`Удалить поле «${name}»`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={onDelete}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <ResizeArc active={resizing} onPointerDown={startResize} />
        </div>
      </div>
    </motion.li>
  );
}

function GroupBlock({
  entityId,
  groupName,
  fields,
  colSpan = ENTITY_FIELD_GROUP_COLUMNS,
  dropIndex = null,
  draggingField = null,
  draggingId,
  draggingGroupName = null,
  groupInsertEdge = null,
  groupInsertMode = null,
  snapFieldId = null,
  cardEpoch,
  showHeader = true,
  titleHidden = false,
  enableGroupLayout = false,
  readOnly = false,
  enteringEdit = false,
  lockedFieldIds,
  onDraggingChange,
  onFieldDrop,
  onGroupDragStart,
  onGroupDragEnd,
  onEditField,
  onDeleteField,
  onConfigureList,
  onAddField,
  onEditGroup,
  onDeleteGroup,
}: {
  entityId: string;
  groupName: string;
  fields: EntityField[];
  colSpan?: number;
  dropIndex?: number | null;
  draggingField?: EntityField | null;
  draggingId: string | null;
  draggingGroupName?: string | null;
  groupInsertEdge?: "before" | "after" | null;
  groupInsertMode?: "stack" | "pair" | null;
  snapFieldId?: string | null;
  cardEpoch: number;
  showHeader?: boolean;
  /** Record page hides the title; editor shows a muted placeholder. */
  titleHidden?: boolean;
  enableGroupLayout?: boolean;
  readOnly?: boolean;
  /** One-shot enter animation when schema edit just turned on. */
  enteringEdit?: boolean;
  /** Fields that can be edited/moved/resized but not deleted (tab-link relations). */
  lockedFieldIds?: Set<string>;
  onDraggingChange: (id: string | null) => void;
  onFieldDrop: (fieldId: string, clientX: number, clientY: number) => void;
  onGroupDragStart?: (groupName: string) => void;
  onGroupDragEnd?: (
    groupName: string,
    clientX: number,
    clientY: number,
  ) => void;
  onEditField: (field: EntityField) => void;
  onDeleteField: (field: EntityField) => void;
  onConfigureList?: (field: EntityField) => void;
  onAddField?: () => void;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
}) {
  const controls = useDragControls();
  const groupRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDropTarget = !readOnly && draggingId != null && dropIndex != null;
  const isGroupDragging = !readOnly && draggingGroupName === groupName;
  const canManageGroup =
    !readOnly &&
    groupName !== DEFAULT_ENTITY_FIELD_GROUP &&
    groupName !== PRIMARY_ENTITY_FIELD_GROUP;
  const canLayoutGroups = !readOnly && enableGroupLayout;
  const holdsDraggedCard =
    draggingId != null && fields.some((field) => field.id === draggingId);
  const crossGroupPreview =
    isDropTarget &&
    draggingField != null &&
    !fields.some((field) => field.id === draggingField.id);
  const sameGroupPreview =
    isDropTarget &&
    draggingField != null &&
    holdsDraggedCard &&
    draggingId != null;
  const slotPreview =
    isDropTarget && draggingId != null && dropIndex != null
      ? buildSlotPreview(fields, draggingId, dropIndex)
      : null;
  const insertActive =
    slotPreview != null &&
    !slotPreview.isNoOp &&
    (sameGroupPreview || crossGroupPreview);
  const insertOthers = crossGroupPreview ? fields : (slotPreview?.others ?? []);
  const insertIndex = crossGroupPreview
    ? (dropIndex ?? fields.length)
    : (slotPreview?.index ?? 0);
  const resolvedColSpan = Math.min(
    ENTITY_FIELD_GROUP_COLUMNS,
    Math.max(1, colSpan),
  );

  useEffect(() => {
    if (isGroupDragging) return;
    x.set(0);
    y.set(0);
  }, [isGroupDragging, x, y]);

  return (
    <motion.div
      ref={groupRef}
      layout={draggingId == null && draggingGroupName == null}
      initial={false}
      exit={{
        opacity: 0,
        height: 0,
        marginBottom: 0,
        overflow: "hidden",
        transition: groupExitTransition,
      }}
      transition={fieldLayoutTransition}
      data-field-group={groupName}
      data-group-col-span={resolvedColSpan}
      drag={canLayoutGroups}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.08}
      dragMomentum={false}
      dragSnapToOrigin
      dragTransition={{
        bounceStiffness: 280,
        bounceDamping: 34,
        power: 0.22,
      }}
      onDragStart={() => {
        lockDragSelection();
        onGroupDragStart?.(groupName);
      }}
      onDragEnd={(event) => {
        const point =
          "clientX" in event
            ? { x: event.clientX, y: event.clientY }
            : { x: 0, y: 0 };
        onGroupDragEnd?.(groupName, point.x, point.y);
        unlockDragSelection();
      }}
      whileDrag={{
        scale: 1.01,
        zIndex: 40,
        cursor: "grabbing",
        boxShadow: "0 14px 32px -18px rgb(0 0 0 / 0.35)",
      }}
      style={{
        gridColumn: `span ${resolvedColSpan}`,
        x,
        y,
        zIndex: isGroupDragging ? 40 : undefined,
      }}
      className={cn(
        "group/group relative flex h-full min-w-0 flex-col",
        holdsDraggedCard && "z-50",
        isGroupDragging && "z-40",
        isDropTarget && !holdsDraggedCard && "z-20",
        groupInsertEdge != null && !isGroupDragging && "z-30 overflow-visible",
      )}
    >
      {groupInsertEdge && groupInsertMode === "stack" ? (
        <GroupRowInsertMark edge={groupInsertEdge} />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
        {groupInsertMode === "pair" && groupInsertEdge === "before" ? (
          <GroupInsertSlot />
        ) : null}

        {canLayoutGroups ? (
          <GroupDragHandle
            active={isGroupDragging}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.getSelection()?.removeAllRanges();
              controls.start(event);
            }}
          />
        ) : null}

        <section
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-muted/25",
            holdsDraggedCard || isGroupDragging || isDropTarget
              ? "overflow-visible"
              : "overflow-hidden",
            isDropTarget &&
              "border-primary/45 bg-primary/5 ring-2 ring-primary/15",
          )}
        >
          {showHeader ? (
            <header className="group/gheader flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-foreground/[0.045] px-3.5">
              <div className="flex min-w-0 items-center gap-1">
                <h5
                  className={cn(
                    "truncate text-[11px] font-semibold tracking-wide uppercase",
                    titleHidden
                      ? "text-muted-foreground/70 normal-case"
                      : "text-foreground/65",
                  )}
                >
                  {titleHidden ? "Без названия" : groupName}
                </h5>
                {canManageGroup ? (
                  <div
                    className={cn(
                      hoverActionsClass,
                      "group-hover/gheader:opacity-100 group-focus-within/gheader:opacity-100",
                    )}
                  >
                    {onEditGroup ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={
                          titleHidden
                            ? "Редактировать группу без названия"
                            : `Редактировать группу «${groupName}»`
                        }
                        title="Редактировать группу"
                        onClick={onEditGroup}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                    {onDeleteGroup ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={
                          titleHidden
                            ? "Удалить группу без названия"
                            : `Удалить группу «${groupName}»`
                        }
                        title="Удалить группу — поля перейдут в «Общее»"
                        onClick={onDeleteGroup}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="text-[11px] font-semibold tracking-wide text-foreground/45 tabular-nums">
                  {fields.length}
                </span>
                <EditAppear
                  show={Boolean(!readOnly && onAddField)}
                  className="inline-flex"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Добавить поле в группу «${groupName}»`}
                    title="Добавить поле"
                    onClick={onAddField}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </EditAppear>
              </div>
            </header>
          ) : null}

          {fields.length === 0 ? (
            <div
              data-fields-grid
              className={cn(fieldsGridClassName, "min-h-0 flex-1")}
              style={fieldsGridStyle}
            >
              <div
                className="relative col-span-4 flex items-center justify-center self-stretch text-center text-xs leading-none text-muted-foreground"
                style={{ minHeight: BASE_CARD_HEIGHT }}
              >
                {isDropTarget ? <InsertBeforeMark /> : null}
                {readOnly
                  ? "Нет полей"
                  : isDropTarget
                    ? "Отпустите, чтобы переместить сюда"
                    : "Перетащите поле сюда"}
              </div>
            </div>
          ) : readOnly || crossGroupPreview ? (
            <div
              data-fields-grid
              className={cn(
                fieldsGridClassName,
                "min-h-0 flex-1 content-start",
              )}
              style={fieldsGridStyle}
            >
              {fields.map((field) => (
                <FieldCardStatic
                  key={field.id}
                  field={field}
                  entityId={entityId}
                  showHandle={!readOnly}
                  insertEdge={
                    !readOnly && insertActive
                      ? insertEdgeForField(field.id, fields, insertIndex)
                      : null
                  }
                />
              ))}
            </div>
          ) : (
            <ul
              data-fields-grid
              className={cn(
                fieldsGridClassName,
                "min-h-0 flex-1 content-start",
              )}
              style={fieldsGridStyle}
            >
              {fields.map((field, fieldIndex) => {
                const isActiveDrag = draggingId === field.id;
                const edge =
                  insertActive && !isActiveDrag
                    ? insertEdgeForField(field.id, insertOthers, insertIndex)
                    : null;

                return (
                  <FieldCard
                    key={`${field.id}-${cardEpoch}`}
                    entityId={entityId}
                    field={field}
                    groupName={groupName}
                    isDragging={isActiveDrag}
                    snapToOrigin={snapFieldId !== field.id}
                    insertEdge={edge}
                    allowEdit
                    allowDelete={!lockedFieldIds?.has(field.id)}
                    enterFromEdit={enteringEdit}
                    enterDelay={enteringEdit ? fieldIndex * 0.028 : 0}
                    onDragStart={() => onDraggingChange(field.id)}
                    onDragEnd={(clientX, clientY) => {
                      onFieldDrop(field.id, clientX, clientY);
                    }}
                    onDragSettle={() => onDraggingChange(null)}
                    onEdit={() => onEditField(field)}
                    onDelete={() => onDeleteField(field)}
                    onConfigureList={
                      field.type === "list" &&
                      !field.listSourceFieldId &&
                      onConfigureList
                        ? () => onConfigureList(field)
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
        </section>

        {groupInsertMode === "pair" && groupInsertEdge === "after" ? (
          <GroupInsertSlot />
        ) : null}
      </div>
    </motion.div>
  );
}

function FieldCardStatic({
  field,
  entityId,
  insertEdge = null,
  showHandle = true,
}: {
  field: EntityField;
  entityId?: string;
  insertEdge?: "before" | "after" | null;
  showHandle?: boolean;
}) {
  return (
    <div
      data-field-id={field.id}
      data-col-span={field.colSpan}
      style={fieldGridItemStyle(field.colSpan, field.rowSpan)}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 list-none items-stretch",
        insertEdge === "before" && "pl-2.5",
      )}
    >
      {insertEdge === "before" ? <InsertBeforeMark /> : null}
      <div className="relative min-h-0 min-w-0 flex-1">
        {insertEdge && insertEdge !== "before" ? (
          <FieldInsertAfterMark colSpan={field.colSpan} />
        ) : null}
        <div
          className={cn(
            "relative flex h-full min-h-0 min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border py-2.5 pr-4 pl-3",
            showHandle ? "border-dashed" : "border-solid",
            field.showOnRecord === false && "opacity-60",
            insertEdge
              ? "border-primary/30 bg-transparent"
              : "border-border bg-transparent",
          )}
        >
          <FieldCardMeta field={field} entityId={entityId} />
          {field.showOnRecord === false ? (
            <span
              className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-md bg-muted/70 text-muted-foreground"
              aria-hidden
            >
              <EyeOff className="size-3.5" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const SIMPLE_FIELD_MIME = "application/x-ipk-simple-field";

type SimpleFieldDragPayload = { fieldId: string };

function readSimpleFieldDrag(
  event: ReactDragEvent,
): SimpleFieldDragPayload | null {
  const raw = event.dataTransfer.getData(SIMPLE_FIELD_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SimpleFieldDragPayload;
  } catch {
    return null;
  }
}

function simpleFieldDropEdge(
  event: ReactDragEvent<HTMLElement>,
): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Parent lists use overflow clipping — the default drag image would be cut off.
 * Clone onto `document.body` for setDragImage, then hide (keep until dragend).
 * Never leave it at top-left: it sits under the page «Настройки» heading.
 */
function setSimpleFieldDragPreview(
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
  // Hide after the browser snapshots the drag bitmap — keep node for the gesture.
  ghost.style.left = "-10000px";
  ghost.style.top = "0";
  ghost.style.opacity = "0";
  return ghost;
}

/** Red grab rail to the left of a flat field row (internal entities). */
function SimpleFieldDragHandle({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
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
      onPointerDown={() => {
        window.getSelection()?.removeAllRanges();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "my-1.5 h-[calc(100%-0.75rem)] min-h-7 w-1 shrink-0 rounded-full bg-primary transition-[opacity,transform,box-shadow] duration-150",
          active
            ? "scale-y-105 opacity-100 shadow-[0_0_0_3px] shadow-primary/20"
            : "opacity-50 group-hover/field:opacity-95 group-focus-within/field:opacity-95",
        )}
      />
    </span>
  );
}

function SimpleFieldDropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0.82 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={simpleFieldDropTransition}
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

/** Flat field row for internal entities — reorder via red left rail. */
function SimpleFieldRow({
  field,
  entityId,
  allowEdit,
  allowDelete,
  draggable = false,
  isDragging = false,
  dropEdge = null,
  handleEpoch = 0,
  onEdit,
  onDelete,
  onConfigureList,
  onPrepareDrag,
  onDragStart,
  onDragEnd,
  onDragGhost,
  onDragOver,
  onDrop,
}: {
  field: EntityField;
  entityId?: string;
  allowEdit: boolean;
  allowDelete: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  dropEdge?: "before" | "after" | null;
  handleEpoch?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onConfigureList?: () => void;
  onPrepareDrag?: (event: { target: EventTarget | null }) => void;
  onDragStart?: (event: ReactDragEvent) => void;
  onDragEnd?: (event?: ReactDragEvent) => void;
  onDragGhost?: (ghost: HTMLElement) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  const name = getEntityFieldDisplayName(field);
  const isName = isEntityNameField(field);
  const canToggleRecordVisibility = !isName && allowEdit && entityId != null;

  const card = (
    <div
      data-simple-field-card
      className={cn(
        "group/field relative flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent bg-card px-3 py-2.5",
        field.showOnRecord === false && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <FieldCardMeta field={field} entityId={entityId} />
      </div>
      {allowEdit || allowDelete || canToggleRecordVisibility ? (
        <div className={fieldActionsClass}>
          <div className={fieldActionsInnerClass}>
            {allowEdit && field.type === "list" && onConfigureList ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={fieldActionButtonClass}
                aria-label="Настройка списка"
                title="Настройка списка"
                onClick={onConfigureList}
              >
                <Settings />
              </Button>
            ) : null}
            {allowEdit && onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={fieldActionButtonClass}
                aria-label={`Редактировать поле «${name}»`}
                onClick={onEdit}
              >
                <Pencil />
              </Button>
            ) : null}
            {canToggleRecordVisibility ? (
              <FieldRecordVisibilityToggle
                visible={field.showOnRecord !== false}
                onToggle={() =>
                  updateEntityField(entityId, field.id, {
                    showOnRecord: field.showOnRecord === false,
                  })
                }
              />
            ) : null}
            {allowDelete && !isName && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(fieldActionButtonClass, "hover:text-destructive")}
                aria-label={`Удалить поле «${name}»`}
                onClick={onDelete}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!draggable) {
    return (
      <li className="relative px-1.5 py-0.5">
        <motion.div
          layout="position"
          layoutId={`simple-field-${field.id}`}
          transition={fieldLayoutTransition}
          className="relative flex min-w-0 items-stretch gap-0.5"
        >
          <span className="w-2.5 shrink-0" aria-hidden />
          <div className="relative min-w-0 flex-1">{card}</div>
        </motion.div>
      </li>
    );
  }

  return (
    <li
      className="group/field relative px-1.5 py-0.5"
      draggable
      onMouseDown={onPrepareDrag}
      onDragStart={(event) => {
        const preview = event.currentTarget.querySelector<HTMLElement>(
          "[data-simple-field-card]",
        );
        if (preview) {
          onDragGhost?.(setSimpleFieldDragPreview(event, preview));
        }
        onDragStart?.(event);
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <motion.div
        layout="position"
        layoutId={`simple-field-${field.id}`}
        transition={fieldLayoutTransition}
        className="relative flex min-w-0 items-stretch gap-0.5"
      >
        <SimpleFieldDragHandle
          key={`handle-${field.id}-${handleEpoch}`}
          label={`Перетащить поле «${name}»`}
          active={isDragging}
        />
        <div className="relative min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {dropEdge ? (
              <SimpleFieldDropIndicator key="drop" edge={dropEdge} />
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
    </li>
  );
}

function SimpleFieldsList({
  entityId,
  fields,
  readOnly,
  protectedFieldIds,
  onEdit,
  onDelete,
  onConfigureList,
}: {
  entityId: string;
  fields: EntityField[];
  readOnly: boolean;
  protectedFieldIds: ReadonlySet<string>;
  onEdit: (field: EntityField) => void;
  onDelete: (field: EntityField) => void;
  onConfigureList: (field: EntityField) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null | undefined>(
    undefined,
  );
  const [handleEpoch, setHandleEpoch] = useState(0);
  const allowDragRef = useRef(false);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const nameFields = fields.filter((field) => isEntityNameField(field));
  const movableFields = fields.filter((field) => !isEntityNameField(field));
  const canReorder = !readOnly && movableFields.length > 1;

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

  function commitReorder(fieldId: string, beforeFieldId: string | null) {
    const order = movableFields.map((field) => field.id);
    if (!order.includes(fieldId)) return;
    const without = order.filter((id) => id !== fieldId);
    let insertAt = without.length;
    if (beforeFieldId) {
      const before = without.indexOf(beforeFieldId);
      if (before >= 0) insertAt = before;
    }
    const next = [...without];
    next.splice(insertAt, 0, fieldId);
    if (next.every((id, index) => id === order[index])) return;
    reorderEntityFields(entityId, next);
  }

  return (
    <LayoutGroup id={`simple-fields-${entityId}`}>
      <ul className="flex flex-col gap-0.5 overflow-visible rounded-xl border border-border bg-muted/20 p-1.5">
        {nameFields.map((field) => (
          <SimpleFieldRow
            key={field.id}
            field={field}
            entityId={entityId}
            allowEdit={!readOnly}
            allowDelete={false}
            onEdit={readOnly ? undefined : () => onEdit(field)}
          />
        ))}
        {movableFields.map((field, index) => {
          const locked = protectedFieldIds.has(field.id);
          const nextId = movableFields[index + 1]?.id ?? null;
          const hintMatches =
            canReorder &&
            draggingId != null &&
            draggingId !== field.id &&
            dropBeforeId !== undefined;
          const dropEdge: "before" | "after" | null = !hintMatches
            ? null
            : dropBeforeId === field.id
              ? "before"
              : dropBeforeId == null && index === movableFields.length - 1
                ? "after"
                : null;

          return (
            <SimpleFieldRow
              key={field.id}
              field={field}
              entityId={entityId}
              allowEdit={!readOnly}
              allowDelete={!readOnly && !locked}
              draggable={canReorder}
              isDragging={draggingId === field.id}
              dropEdge={dropEdge}
              handleEpoch={handleEpoch}
              onEdit={readOnly ? undefined : () => onEdit(field)}
              onDelete={readOnly || locked ? undefined : () => onDelete(field)}
              onConfigureList={
                readOnly || field.type !== "list" || field.listSourceFieldId
                  ? undefined
                  : () => onConfigureList(field)
              }
              onPrepareDrag={prepareDrag}
              onDragStart={(event) => {
                if (!allowDragRef.current) {
                  event.preventDefault();
                  return;
                }
                lockDragSelection();
                const payload: SimpleFieldDragPayload = { fieldId: field.id };
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                  SIMPLE_FIELD_MIME,
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
                if (draggingId == null || draggingId === field.id) return;
                if (
                  ![...event.dataTransfer.types].includes(SIMPLE_FIELD_MIME) &&
                  ![...event.dataTransfer.types].includes("text/plain")
                ) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const edge = simpleFieldDropEdge(event);
                setDropBeforeId(edge === "before" ? field.id : nextId);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const payload =
                  readSimpleFieldDrag(event) ??
                  (draggingId ? { fieldId: draggingId } : null);
                const activeId = payload?.fieldId ?? draggingId;
                if (!activeId || activeId === field.id) {
                  clearDrag(event);
                  return;
                }
                const edge = simpleFieldDropEdge(event);
                const beforeId = edge === "before" ? field.id : nextId;
                commitReorder(activeId, beforeId);
                clearDrag(event);
              }}
            />
          );
        })}
      </ul>
    </LayoutGroup>
  );
}

function LinkedExistingEntityTabNote({
  linkedEntity,
  isSelf,
}: {
  linkedEntity: Entity;
  isSelf: boolean;
}) {
  const entityLabel = getEntityDisplayName(linkedEntity);

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        {isSelf ? "Та же сущность" : "Существующая сущность"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {isSelf
          ? `Вкладка ссылается на «${entityLabel}». Настройка — в полях этой сущности.`
          : `Записи «${entityLabel}». Настройка полей — в самой сущности.`}
      </p>
    </div>
  );
}

function MirrorTabNote({
  hostEntity,
  tab,
  entities,
}: {
  hostEntity: Entity;
  tab: EntityTab;
  entities: Entity[];
}) {
  const relation =
    hostEntity.fields.find((field) => field.id === tab.sourceRelationFieldId) ??
    null;
  const targetId = relation ? getEntityRelationTargetId(relation) : null;
  const sourceEntity = targetId
    ? (entities.find((item) => item.id === targetId) ?? null)
    : null;
  const sourceTab = sourceEntity?.tabs.find(
    (item) => item.id === tab.sourceTabId,
  );
  const relationLabel = relation
    ? getEntityFieldDisplayName(relation)
    : "не выбрано";
  const sourceLabel = sourceEntity
    ? getEntityDisplayName(sourceEntity)
    : "сущность";
  const tabLabel = sourceTab?.name ?? "вкладка";

  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">Из записи</p>
      <p className="max-w-md text-sm text-muted-foreground">
        На карточке здесь покажется вкладка «{tabLabel}» сущности «{sourceLabel}
        » для записи из поля «{relationLabel}».
      </p>
    </div>
  );
}

export function EntityFieldsEditor({
  entity,
  nested = false,
  readOnly: readOnlyProp = false,
  activeTabId: controlledActiveTabId = null,
  onActiveTabIdChange,
  hideFieldsOverviewButton = false,
  hideFieldsToolbar = false,
  fieldsOverviewOpen: controlledFieldsOverviewOpen,
  onFieldsOverviewOpenChange,
  createFieldRequestId = 0,
}: EntityFieldsEditorProps) {
  const readOnly = readOnlyProp;
  const [prevReadOnly, setPrevReadOnly] = useState(readOnly);
  const [holdEditEnter, setHoldEditEnter] = useState(false);
  let justEnteredEdit = false;
  if (prevReadOnly !== readOnly) {
    setPrevReadOnly(readOnly);
    justEnteredEdit = prevReadOnly && !readOnly;
    if (readOnly) setHoldEditEnter(false);
    else if (justEnteredEdit) setHoldEditEnter(true);
  }
  const enteringEdit = justEnteredEdit || holdEditEnter;
  useLayoutEffect(() => {
    if (!holdEditEnter) return;
    const timer = window.setTimeout(() => setHoldEditEnter(false), 520);
    return () => window.clearTimeout(timer);
  }, [holdEditEnter]);
  const { entities } = useEntityConfig();
  const { entries } = useMenuConfig();
  const entityOptions = useMemo(() => {
    const menuIds = getEntityLinkedMenuItemIds({ entries });
    const roots = sortEntitiesByMenuOrder(
      entities.filter((item) => !item.parentEntityId?.trim()),
      menuIds,
    );
    const options: Array<{
      id: string;
      name: string;
      parentName?: string | null;
    }> = [];
    const seen = new Set<string>();

    function appendDescendants(parentId: string, parentPath: string) {
      const children = entities
        .filter((item) => item.parentEntityId?.trim() === parentId)
        .sort((a, b) =>
          getEntityPathLabel(a.id, entities).localeCompare(
            getEntityPathLabel(b.id, entities),
            "ru",
          ),
        );
      for (const child of children) {
        if (seen.has(child.id)) continue;
        const childName =
          child.name.trim() || child.namePlural.trim() || "Без названия";
        options.push({
          id: child.id,
          name: childName,
          parentName: parentPath,
        });
        seen.add(child.id);
        appendDescendants(child.id, `${parentPath} → ${childName}`);
      }
    }

    for (const root of roots) {
      const rootName =
        root.name.trim() || root.namePlural.trim() || "Без названия";
      options.push({ id: root.id, name: rootName, parentName: null });
      seen.add(root.id);
      appendDescendants(root.id, rootName);
    }

    for (const item of entities) {
      if (seen.has(item.id)) continue;
      const leafName =
        item.name.trim() || item.namePlural.trim() || "Без названия";
      const parentId = item.parentEntityId?.trim() || "";
      const parent = parentId
        ? (entities.find((entity) => entity.id === parentId) ?? null)
        : null;
      const parentName = parent
        ? parent.name.trim() || parent.namePlural.trim() || "Без названия"
        : null;
      options.push({
        id: item.id,
        name: leafName,
        parentName,
      });
      seen.add(item.id);
    }

    return options;
  }, [entities, entries]);
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [pendingDeleteField, setPendingDeleteField] =
    useState<EntityField | null>(null);
  const [uncontrolledFieldsOverviewOpen, setUncontrolledFieldsOverviewOpen] =
    useState(false);
  const fieldsOverviewOpen =
    controlledFieldsOverviewOpen ?? uncontrolledFieldsOverviewOpen;
  function setFieldsOverviewOpen(open: boolean) {
    onFieldsOverviewOpenChange?.(open);
    if (controlledFieldsOverviewOpen === undefined) {
      setUncontrolledFieldsOverviewOpen(open);
    }
  }
  const showFieldsOverviewButton = !hideFieldsOverviewButton;
  const showFieldsToolbar = !hideFieldsToolbar || nested;
  const prevCreateFieldRequestId = useRef(createFieldRequestId);
  useEffect(() => {
    if (createFieldRequestId === prevCreateFieldRequestId.current) return;
    prevCreateFieldRequestId.current = createFieldRequestId;
    if (createFieldRequestId <= 0 || readOnly) return;
    queueMicrotask(() => setDialog({ mode: "create" }));
  }, [createFieldRequestId, readOnly]);
  const [listSettingsFieldId, setListSettingsFieldId] = useState<string | null>(
    null,
  );
  const [subEntitySettings, setSubEntitySettings] = useState<{
    tabId: string;
    linkedEntityId: string;
  } | null>(null);
  const [groupNameDialog, setGroupNameDialog] = useState<GroupNameDialogState>({
    mode: "closed",
  });
  const [tabDialog, setTabDialog] = useState<TabDialogState>({
    mode: "closed",
  });
  const [uncontrolledActiveTabId, setUncontrolledActiveTabId] = useState(
    ENTITY_OVERVIEW_TAB_ID,
  );
  const activeTabId = controlledActiveTabId ?? uncontrolledActiveTabId;
  function setActiveTabId(tabId: string) {
    if (onActiveTabIdChange) onActiveTabIdChange(tabId);
    else setUncontrolledActiveTabId(tabId);
  }
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [tabDropHint, setTabDropHint] = useState<{
    tabId: string;
    edge: "before" | "after";
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingGroupName, setDraggingGroupName] = useState<string | null>(
    null,
  );
  const [groupDropTarget, setGroupDropTarget] =
    useState<GroupDropTarget | null>(null);
  const [cardEpoch, setCardEpoch] = useState(0);
  const [dropHighlight, setDropHighlight] = useState<DropHighlight>(null);
  const [generalStripVisible, setGeneralStripVisible] = useState(false);
  const [primaryStripVisible, setPrimaryStripVisible] = useState(false);
  const dropHighlightRef = useRef<DropHighlight>(null);
  const dragHomeRef = useRef<DragHome | null>(null);
  const generalStripVisibleRef = useRef(false);
  const primaryStripVisibleRef = useRef(false);
  const skipGroupDialogResetRef = useRef(false);
  const groupDropTargetRef = useRef<GroupDropTarget | null>(null);
  const resolveGroupDropTargetRef = useRef<
    (clientX: number, clientY: number) => GroupDropTarget | null
  >(() => null);
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const headerField = getEntityHeaderField(entity);
  const parentLinkFieldId = nested
    ? (entity.fields.find(
        (field) =>
          field.type === "relation" &&
          field.relationEntityId === entity.parentEntityId,
      )?.id ?? null)
    : null;
  const tabLinkFieldIds = getEntityTabLinkFieldIds(entity.id, entities);
  const protectedFieldIds = new Set<string>([
    ...tabLinkFieldIds,
    ...entity.fields
      .filter((field) => isSystemEntityField(field))
      .map((field) => field.id),
  ]);
  // Nested editor has no header slot — keep header fields in the group list.
  const pinnedFieldIds = new Set(
    [nested ? null : headerField?.id, parentLinkFieldId].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const entityTabs = entity.tabs;
  const activeTab =
    entityTabs.find((tab) => tab.id === activeTabId) ?? entityTabs[0] ?? null;
  const resolvedActiveTabId =
    activeTab?.id ?? entityTabs[0]?.id ?? ENTITY_OVERVIEW_TAB_ID;
  const canDeleteTab = entityTabs.length > 1;
  const linkedEntityForActiveTab =
    activeTab &&
    isEntityTabWithLinkedEntity(activeTab) &&
    activeTab.linkedEntityId
      ? (entities.find((item) => item.id === activeTab.linkedEntityId) ?? null)
      : null;
  const subEntitySettingsTab = subEntitySettings
    ? (entity.tabs.find((tab) => tab.id === subEntitySettings.tabId) ?? null)
    : null;
  const subEntitySettingsEntity = subEntitySettings
    ? (entities.find((item) => item.id === subEntitySettings.linkedEntityId) ??
      null)
    : null;
  const allLayoutFields = entity.fields.filter(
    (field) => !isEntityNameField(field) && !pinnedFieldIds.has(field.id),
  );
  const layoutFields = allLayoutFields.filter((field) => {
    const name = getEntityFieldGroupName(field.group);
    return (
      getEntityFieldTabId(field) === resolvedActiveTabId &&
      name !== PRIMARY_ENTITY_FIELD_GROUP &&
      getEntityFieldGroupArea(name, entity.fieldGroups) !== "primary"
    );
  });
  const primaryLayoutGroups = nested
    ? []
    : resolvePrimaryEntityFieldGroups(allLayoutFields, entity.fieldGroups);
  const primaryFields =
    primaryLayoutGroups.find(
      (group) => group.name === PRIMARY_ENTITY_FIELD_GROUP,
    )?.fields ?? [];
  const primaryAreaGroups = primaryLayoutGroups.filter(
    (group) => group.name !== PRIMARY_ENTITY_FIELD_GROUP,
  );
  const primaryMainColSpan =
    primaryLayoutGroups.find(
      (group) => group.name === PRIMARY_ENTITY_FIELD_GROUP,
    )?.colSpan ?? ENTITY_FIELD_GROUP_COLUMNS;
  const otherGroups = resolveEntityFieldGroups(
    layoutFields,
    filterEntityFieldGroupsForTab(
      entity.fieldGroups,
      resolvedActiveTabId,
      layoutFields,
    ),
  ).filter(
    (group) =>
      group.name !== DEFAULT_ENTITY_FIELD_GROUP || group.fields.length > 0,
  );
  const fieldsHostActive =
    activeTab != null && isEntityFieldsHostTab(activeTab);
  const homeFieldsTabId = getEntityHomeFieldsTabId(entity.tabs);
  // On linked/files/history tabs the main «Добавить поле» still targets the
  // home fields layout — keep those group names in the create dialog.
  const overviewGroupsForOptions =
    !nested && !fieldsHostActive
      ? resolveEntityFieldGroups(
          allLayoutFields.filter((field) => {
            const name = getEntityFieldGroupName(field.group);
            return (
              getEntityFieldTabId(field) === homeFieldsTabId &&
              name !== PRIMARY_ENTITY_FIELD_GROUP &&
              getEntityFieldGroupArea(name, entity.fieldGroups) !== "primary"
            );
          }),
          filterEntityFieldGroupsForTab(
            entity.fieldGroups,
            homeFieldsTabId,
            allLayoutFields.filter(
              (field) => getEntityFieldTabId(field) === homeFieldsTabId,
            ),
          ),
        )
      : null;
  const existingGroupNames = new Set(otherGroups.map((group) => group.name));
  const primaryGroup = {
    name: PRIMARY_ENTITY_FIELD_GROUP,
    fields: primaryFields,
    colSpan: primaryMainColSpan,
  };
  const tabGroupsForOptions = overviewGroupsForOptions ?? otherGroups;
  const groupOptions = nested
    ? otherGroups.map((group) => group.name)
    : [
        ENTITY_HEADER_FIELD_GROUP,
        PRIMARY_ENTITY_FIELD_GROUP,
        ...primaryAreaGroups.map((group) => group.name),
        ...tabGroupsForOptions.map((group) => group.name),
      ];
  const editingFieldId = dialog.mode === "edit" ? dialog.field.id : undefined;
  const sumFieldOptions = getEntitySummableFields(
    entity.fields,
    editingFieldId,
  ).map((item) => ({
    id: item.id,
    name: getEntityFieldDisplayName(item),
    typeLabel: getEntityFieldTypeLabel(item.type),
  }));
  const hasGeneralGroup = otherGroups.some(
    (group) => group.name === DEFAULT_ENTITY_FIELD_GROUP,
  );

  // Fields on files/history/records/linked tabs (or deleted tabs) are invisible
  // in settings — park them in «Общее». Sub-entities also drop «Основное».
  useEffect(() => {
    if (readOnly) return;
    rescueOrphanEntityFields(entity.id);
  }, [readOnly, entity.id, entity.fields, entity.tabs]);

  useEffect(() => {
    if (!draggingId) return;

    const activeId = draggingId;
    const draggingField =
      entity.fields.find((field) => field.id === activeId) ?? null;
    const draggingFromHeader = headerField?.id === activeId;
    const canDropToGeneral =
      !hasGeneralGroup ||
      (draggingField != null &&
        getEntityFieldGroupName(draggingField.group) !==
          DEFAULT_ENTITY_FIELD_GROUP);
    const canDropToPrimary =
      !nested &&
      (draggingFromHeader ||
        draggingField == null ||
        getEntityFieldGroupName(draggingField.group) !==
          PRIMARY_ENTITY_FIELD_GROUP);
    let cancelled = false;
    let frame = 0;

    function onMove(event: PointerEvent) {
      if (cancelled || frame) return;
      const { clientX, clientY } = event;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (cancelled) return;
        const nearPrimary = isPointerNearPrimaryStrip(
          clientY,
          primaryStripVisibleRef.current,
        );
        const showPrimaryStrip = canDropToPrimary && nearPrimary;
        primaryStripVisibleRef.current = showPrimaryStrip;
        setPrimaryStripVisible(showPrimaryStrip);

        const nearStrip = isPointerNearGeneralStrip(
          clientY,
          generalStripVisibleRef.current,
        );
        const showStrip = canDropToGeneral && nearStrip;
        generalStripVisibleRef.current = showStrip;
        setGeneralStripVisible(showStrip);

        const headerZone = document.querySelector<HTMLElement>(
          "[data-header-field-slot]",
        );
        const overHeader =
          headerZone != null &&
          pointInRect(
            clientX,
            clientY,
            headerZone.getBoundingClientRect(),
            dropHighlightRef.current?.type === "header" ? 10 : 0,
          );

        const tabZones = [
          ...document.querySelectorAll<HTMLElement>("[data-entity-tab-drop]"),
        ];
        const overTab =
          tabZones.find((zone) =>
            pointInRect(
              clientX,
              clientY,
              zone.getBoundingClientRect(),
              dropHighlightRef.current?.type === "tab" &&
                dropHighlightRef.current.tabId === zone.dataset.entityTabDrop
                ? 8
                : 0,
            ),
          ) ?? null;

        const resolved = resolveDropTarget(
          clientX,
          clientY,
          activeId,
          dropHighlightRef.current,
          dragHomeRef.current,
        );
        if (cancelled) return;
        const overGroup =
          resolved?.type === "group" || resolved?.type === "new-group";
        const target = overHeader
          ? ({ type: "header" } as const)
          : overTab?.dataset.entityTabDrop
            ? ({ type: "tab", tabId: overTab.dataset.entityTabDrop } as const)
            : overGroup
              ? resolved
              : showPrimaryStrip
                ? ({ type: "primary" } as const)
                : showStrip
                  ? ({ type: "general" } as const)
                  : resolved;
        const next: DropHighlight =
          target == null
            ? null
            : target.type === "group"
              ? {
                  type: "group",
                  groupName: target.groupName,
                  index: target.index,
                }
              : target.type === "tab"
                ? { type: "tab", tabId: target.tabId }
                : { type: target.type };

        if (cancelled) return;
        if (sameDropHighlight(dropHighlightRef.current, next)) return;
        dropHighlightRef.current = next;
        setDropHighlight(next);
      });
    }

    window.addEventListener("pointermove", onMove);
    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
      dropHighlightRef.current = null;
      setDropHighlight(null);
      generalStripVisibleRef.current = false;
      setGeneralStripVisible(false);
      primaryStripVisibleRef.current = false;
      setPrimaryStripVisible(false);
    };
  }, [draggingId, entity.fields, hasGeneralGroup, headerField?.id, nested]);

  function handleDraggingChange(id: string | null) {
    setDraggingId(id);
    if (!id) {
      dragHomeRef.current = null;
      dropHighlightRef.current = null;
      setDropHighlight(null);
      generalStripVisibleRef.current = false;
      setGeneralStripVisible(false);
      primaryStripVisibleRef.current = false;
      setPrimaryStripVisible(false);
      return;
    }

    const fromHeader = headerField?.id === id;
    const field =
      allLayoutFields.find((item) => item.id === id) ??
      (fromHeader ? headerField : null);
    const card = document.querySelector<HTMLElement>(
      `[data-field-id="${CSS.escape(id)}"]`,
    );

    if (fromHeader && field && card) {
      dragHomeRef.current = {
        groupName: ENTITY_HEADER_FIELD_GROUP,
        index: 0,
        colSpan: fieldColSpanOf(field.colSpan),
        rect: card.getBoundingClientRect(),
      };
      return;
    }

    const groupName = field ? getEntityFieldGroupName(field.group) : null;
    const groupFields =
      groupName == null
        ? []
        : allLayoutFields.filter(
            (item) => getEntityFieldGroupName(item.group) === groupName,
          );
    const index = groupFields.findIndex((item) => item.id === id);
    dragHomeRef.current =
      groupName && index >= 0 && card && field
        ? {
            groupName,
            index,
            colSpan: fieldColSpanOf(field.colSpan),
            rect: card.getBoundingClientRect(),
          }
        : null;
  }

  function handleGroupDragStart(groupName: string) {
    setDraggingGroupName(groupName);
    groupDropTargetRef.current = null;
    setGroupDropTarget(null);
  }

  function resolveGroupDropTarget(
    clientX: number,
    clientY: number,
  ): GroupDropTarget | null {
    if (!draggingGroupName) return null;

    const primarySection = document.querySelector<HTMLElement>(
      "[data-primary-section]",
    );
    const primaryGrid = document.querySelector<HTMLElement>(
      '[data-groups-grid="primary"]',
    );
    const tabGrid = document.querySelector<HTMLElement>(
      '[data-groups-grid="tab"]',
    );

    const nameEl = document.querySelector<HTMLElement>(
      "[data-entity-name-field]",
    );
    const primaryZone = document.querySelector<HTMLElement>(
      "[data-primary-group-zone]",
    );
    const overName =
      !nested &&
      nameEl != null &&
      pointInRect(clientX, clientY, nameEl.getBoundingClientRect(), 8);
    const overPrimaryZone =
      !nested &&
      primaryZone != null &&
      pointInRect(clientX, clientY, primaryZone.getBoundingClientRect(), 10);
    const nearNameBand =
      !nested &&
      isPointerNearPrimaryStrip(clientY, overName || overPrimaryZone);

    const overPrimary =
      !nested &&
      ((primarySection != null &&
        pointInRect(
          clientX,
          clientY,
          primarySection.getBoundingClientRect(),
          10,
        )) ||
        overName ||
        overPrimaryZone ||
        nearNameBand);

    if (overPrimary) {
      // Name / strip above «Основное»: only stack below it — never above.
      if (overName || overPrimaryZone) {
        return {
          area: "primary",
          index: primaryFields.length > 0 ? 1 : 0,
          mode: "stack",
          pairWith: null,
          side: "after",
        };
      }
      return resolveDropInGroupsGrid(
        primaryGrid,
        primaryLayoutGroups,
        draggingGroupName,
        clientX,
        clientY,
        "primary",
      );
    }

    const inTab = resolveDropInGroupsGrid(
      tabGrid,
      otherGroups,
      draggingGroupName,
      clientX,
      clientY,
      "tab",
    );
    if (inTab) return inTab;

    if (
      tabGrid &&
      pointInRect(clientX, clientY, tabGrid.getBoundingClientRect(), 16)
    ) {
      return {
        area: "tab",
        index: otherGroups.length,
        mode: "stack",
        pairWith: null,
        side: "after",
      };
    }

    return null;
  }

  useEffect(() => {
    resolveGroupDropTargetRef.current = resolveGroupDropTarget;
  });

  useEffect(() => {
    if (!draggingGroupName) return;

    let cancelled = false;
    let frame = 0;
    function onMove(event: PointerEvent) {
      if (cancelled || frame) return;
      const { clientX, clientY } = event;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (cancelled) return;
        const next = resolveGroupDropTargetRef.current(clientX, clientY);
        if (cancelled) return;
        const prev = groupDropTargetRef.current;
        if (sameGroupDropTarget(prev, next)) return;
        groupDropTargetRef.current = next;
        setGroupDropTarget(next);
      });
    }

    window.addEventListener("pointermove", onMove);
    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
      groupDropTargetRef.current = null;
      setGroupDropTarget(null);
    };
  }, [draggingGroupName]);

  function handleGroupDragEnd(
    groupName: string,
    clientX: number,
    clientY: number,
  ) {
    if (groupName === PRIMARY_ENTITY_FIELD_GROUP) {
      setGroupDropTarget(null);
      setDraggingGroupName(null);
      return;
    }
    const sourceArea: EntityFieldGroupArea = primaryAreaGroups.some(
      (group) => group.name === groupName,
    )
      ? "primary"
      : "tab";
    const sourceGroups =
      sourceArea === "primary" ? primaryAreaGroups : otherGroups;
    const sourceLayout =
      sourceArea === "primary" ? primaryLayoutGroups : otherGroups;
    const from = sourceGroups.findIndex((group) => group.name === groupName);
    const target =
      groupDropTargetRef.current ?? resolveGroupDropTarget(clientX, clientY);
    groupDropTargetRef.current = null;
    setGroupDropTarget(null);
    setDraggingGroupName(null);

    if (from < 0 || !target) return;

    const destLayout =
      target.area === "primary" ? primaryLayoutGroups : otherGroups;
    const destNamed =
      target.area === "primary" ? primaryAreaGroups : otherGroups;
    const hasMainInLayout =
      target.area === "primary" &&
      destLayout.some((group) => group.name === PRIMARY_ENTITY_FIELD_GROUP);

    let layoutTo = target.index;
    if (target.area === sourceArea) {
      const layoutFrom = sourceLayout.findIndex(
        (group) => group.name === groupName,
      );
      if (layoutFrom >= 0 && layoutTo > layoutFrom) layoutTo -= 1;
    }

    const namedTo = hasMainInLayout ? Math.max(0, layoutTo - 1) : layoutTo;

    const names = destNamed
      .map((group) => group.name)
      .filter((name) => name !== groupName);
    names.splice(Math.max(0, Math.min(namedTo, names.length)), 0, groupName);

    const colSpans: Record<string, number> = {};
    for (const group of [...primaryAreaGroups, ...otherGroups]) {
      colSpans[group.name] = group.colSpan;
    }

    if (target.mode === "pair" && target.pairWith) {
      const pairLayout = destLayout.map((group) => ({
        name: group.name,
        colSpan:
          group.name === PRIMARY_ENTITY_FIELD_GROUP
            ? primaryMainColSpan
            : group.colSpan,
      }));
      if (isPairDropNoOp(pairLayout, groupName, target)) return;
      colSpans[groupName] = 1;
      // «Основное» is virtual — only persist the sibling half.
      if (target.pairWith !== PRIMARY_ENTITY_FIELD_GROUP) {
        colSpans[target.pairWith] = 1;
      }
    } else {
      colSpans[groupName] = ENTITY_FIELD_GROUP_COLUMNS;
    }

    const sameArea = target.area === sourceArea;
    const sameOrder =
      sameArea &&
      destNamed.every((group, index) => group.name === names[index]);
    const prevSpan =
      sourceGroups.find((group) => group.name === groupName)?.colSpan ??
      ENTITY_FIELD_GROUP_COLUMNS;
    const nextSpan = colSpans[groupName] ?? ENTITY_FIELD_GROUP_COLUMNS;
    if (sameOrder && prevSpan === nextSpan && target.mode === "stack") {
      return;
    }

    placeEntityFieldGroup(entity.id, groupName, {
      area: target.area,
      orderedNames: names,
      colSpans,
      tabId: target.area === "tab" ? resolvedActiveTabId : undefined,
    });
  }

  function handleSubmit(data: EntityFieldFormData): string {
    const pinToHeader = data.group.trim() === ENTITY_HEADER_FIELD_GROUP;
    const group = pinToHeader ? PRIMARY_ENTITY_FIELD_GROUP : data.group;

    if (dialog.mode === "edit") {
      const isTabLink = tabLinkFieldIds.has(dialog.field.id);
      if (isEntityNameField(dialog.field)) {
        updateEntityField(entity.id, dialog.field.id, {
          name: data.name,
          hint: data.hint,
          showInFilters: data.showInFilters,
        });
        updateEntity(entity.id, { nameTemplate: data.nameTemplate });
        return dialog.field.id;
      }
      if (
        isTabLink &&
        dialog.field.type === "relation" &&
        data.type === "lookup" &&
        data.settings.lookup
      ) {
        convertTabLinkRelationFieldToLookup(entity.id, dialog.field.id, {
          name: data.name,
          hint: data.hint,
          group,
          required: data.required,
          showInTable: data.showInTable,
          showInFilters: data.showInFilters,
          showOnCreate: data.showOnCreate,
          lookup: data.settings.lookup,
        });
        if (pinToHeader) {
          setEntityHeaderField(entity.id, dialog.field.id);
        } else if (headerField?.id === dialog.field.id) {
          setEntityHeaderField(entity.id, null);
        }
        if (data.showInTable) {
          placeEntityFieldInTable(
            entity.id,
            dialog.field.id,
            data.tablePosition,
          );
        }
        return dialog.field.id;
      }
      updateEntityField(entity.id, dialog.field.id, {
        name: data.name,
        type: isTabLink ? dialog.field.type : data.type,
        hint: data.hint,
        group,
        required: data.required,
        showInTable: data.showInTable,
        showInFilters: data.showInFilters,
        showOnCreate: data.showOnCreate,
        visibilityConditions: isTabLink ? [] : data.visibilityConditions,
        includeInTotal: isTabLink ? false : data.includeInTotal,
        relationEntityId: isTabLink
          ? dialog.field.relationEntityId
          : data.relationEntityId,
        relationMultiple: isTabLink
          ? dialog.field.relationMultiple
          : data.relationMultiple,
        listSourceFieldId: isTabLink ? null : data.listSourceFieldId,
        listFixed: isTabLink
          ? dialog.field.listFixed
          : data.type === "list"
            ? data.listMultiple || dialog.field.listFixed
            : false,
        listMultiple: isTabLink
          ? dialog.field.listMultiple
          : data.type === "list"
            ? data.listMultiple
            : false,
        unitSuffix: isTabLink ? null : data.unitSuffix,
        decimals: isTabLink ? 2 : data.decimals,
        sumFieldIds: isTabLink ? [] : data.sumFieldIds,
        datetimeWithTime: isTabLink ? false : data.datetimeWithTime,
        booleanInline: isTabLink ? false : data.booleanInline,
        ...(isTabLink ? {} : data.settings),
      });
      if (pinToHeader) {
        setEntityHeaderField(entity.id, dialog.field.id);
      } else if (headerField?.id === dialog.field.id) {
        setEntityHeaderField(entity.id, null);
      }
      if (data.showInTable) {
        placeEntityFieldInTable(entity.id, dialog.field.id, data.tablePosition);
      }
      return dialog.field.id;
    }
    const created = addEntityField(entity.id, {
      name: data.name,
      type: data.type,
      hint: data.hint,
      group,
      required: data.required,
      showInTable: data.showInTable,
      showInFilters: data.showInFilters,
      showOnCreate: data.showOnCreate,
      visibilityConditions: data.visibilityConditions,
      includeInTotal: data.includeInTotal,
      relationEntityId: data.relationEntityId,
      relationMultiple: data.relationMultiple,
      listSourceFieldId: data.listSourceFieldId,
      listFixed: data.type === "list" ? data.listMultiple : false,
      listMultiple: data.type === "list" ? data.listMultiple : false,
      unitSuffix: data.unitSuffix,
      decimals: data.decimals,
      sumFieldIds: data.sumFieldIds,
      datetimeWithTime: data.datetimeWithTime,
      booleanInline: data.booleanInline,
      ...data.settings,
      tabId:
        pinToHeader ||
        getEntityFieldGroupArea(group, entity.fieldGroups) === "primary" ||
        getEntityFieldGroupName(group) === DEFAULT_ENTITY_FIELD_GROUP ||
        activeTab == null ||
        !isEntityFieldsHostTab(activeTab)
          ? homeFieldsTabId
          : resolvedActiveTabId,
    });
    if (pinToHeader) {
      setEntityHeaderField(entity.id, created.id);
    }
    if (data.showInTable) {
      placeEntityFieldInTable(entity.id, created.id, data.tablePosition);
    }
    return created.id;
  }

  function handleFieldDrop(fieldId: string, clientX: number, clientY: number) {
    const source = entity.fields.find((field) => field.id === fieldId);
    if (!source || isEntityNameField(source)) {
      setDraggingId(null);
      dragHomeRef.current = null;
      dropHighlightRef.current = null;
      setDropHighlight(null);
      return;
    }

    const home = dragHomeRef.current;
    const target = resolveDropTarget(
      clientX,
      clientY,
      fieldId,
      dropHighlightRef.current,
      home,
    );
    dropHighlightRef.current = null;
    setDropHighlight(null);
    dragHomeRef.current = null;
    if (!target) return;

    const unpinHeader = () => {
      if (headerField?.id === fieldId) {
        setEntityHeaderField(entity.id, null);
      }
    };

    if (target.type === "tab") {
      setDraggingId(null);
      unpinHeader();
      moveEntityFieldToTab(entity.id, fieldId, target.tabId);
      setActiveTabId(target.tabId);
      return;
    }

    if (target.type === "header") {
      setDraggingId(null);
      if (
        getEntityFieldGroupName(source.group) !== PRIMARY_ENTITY_FIELD_GROUP
      ) {
        moveEntityFieldToGroup(
          entity.id,
          fieldId,
          PRIMARY_ENTITY_FIELD_GROUP,
          primaryFields.length,
        );
      }
      setEntityHeaderField(entity.id, fieldId);
      return;
    }

    if (target.type === "new-group") {
      const pendingFieldId = fieldId;
      setDraggingId(null);
      unpinHeader();
      window.setTimeout(() => {
        setGroupNameDialog({ mode: "create", fieldId: pendingFieldId });
      }, 0);
      return;
    }

    if (target.type === "general") {
      setDraggingId(null);
      unpinHeader();
      if (getEntityFieldTabId(source) !== resolvedActiveTabId) {
        moveEntityFieldToTab(entity.id, fieldId, resolvedActiveTabId);
      }
      moveEntityFieldToGroup(entity.id, fieldId, DEFAULT_ENTITY_FIELD_GROUP, 0);
      return;
    }

    if (target.type === "primary") {
      setDraggingId(null);
      unpinHeader();
      moveEntityFieldToGroup(entity.id, fieldId, PRIMARY_ENTITY_FIELD_GROUP, 0);
      return;
    }

    if (target.type !== "group") {
      setDraggingId(null);
      return;
    }

    const field = entity.fields.find((item) => item.id === fieldId);
    const sameGroup =
      field != null &&
      getEntityFieldGroupName(field.group) === target.groupName;

    // Same slot — do not rebuild order (avoids accidental neighbor swaps).
    if (
      sameGroup &&
      home != null &&
      home.groupName === target.groupName &&
      target.index === home.index
    ) {
      setDraggingId(null);
      setCardEpoch((value) => value + 1);
      return;
    }

    setDraggingId(null);
    unpinHeader();
    if (
      target.groupName !== PRIMARY_ENTITY_FIELD_GROUP &&
      getEntityFieldTabId(source) !== resolvedActiveTabId
    ) {
      moveEntityFieldToTab(entity.id, fieldId, resolvedActiveTabId);
    }
    moveEntityFieldToGroup(entity.id, fieldId, target.groupName, target.index);
    // Remount to clear leftover motion transforms / hover ghosts.
    setCardEpoch((value) => value + 1);
  }

  const editingField = dialog.mode === "edit" ? dialog.field : null;
  const listSettingsField =
    listSettingsFieldId != null
      ? (entity.fields.find(
          (field) =>
            field.id === listSettingsFieldId &&
            field.type === "list" &&
            !field.listSourceFieldId,
        ) ?? null)
      : null;
  const dialogListField =
    dialog.mode === "edit" && dialog.field.type === "list"
      ? (entity.fields.find((field) => field.id === dialog.field.id) ??
        dialog.field)
      : null;
  const dialogListOptionCount =
    dialogListField != null
      ? resolveEntityListFieldOptions(dialogListField, entities).length
      : 0;
  const tableColumns = getEntityTableFields(entity.fields);
  const hasTitleColumn = tableColumns.some((field) => isEntityNameField(field));
  const editingInTable =
    editingField != null &&
    !isEntityNameField(editingField) &&
    editingField.showInTable !== false;
  const tableColumnCount = editingInTable
    ? tableColumns.length
    : tableColumns.length + 1;
  const tablePositionMin = hasTitleColumn ? 2 : 1;
  const tablePosition = editingInTable
    ? Math.max(
        tablePositionMin,
        tableColumns.findIndex((field) => field.id === editingField.id) + 1,
      )
    : tableColumnCount;
  const draggingField =
    allLayoutFields.find((field) => field.id === draggingId) ??
    (headerField?.id === draggingId ? headerField : null);
  const snapFieldId =
    draggingId && dropHighlight
      ? dropHighlight.type === "header"
        ? draggingId !== headerField?.id
          ? draggingId
          : null
        : headerField?.id === draggingId ||
            willRelocateField(draggingId, dropHighlight, [
              ...primaryFields,
              ...layoutFields,
            ])
          ? draggingId
          : null
      : null;

  // Internal entities: flat field list — reorder by red left rail (no tabs/groups).
  if (isEntityInternal(entity)) {
    const simpleFields = entity.fields.filter(
      (field) => !tabLinkFieldIds.has(field.id),
    );
    const orderedFields = [
      ...simpleFields.filter((field) => isEntityNameField(field)),
      ...simpleFields.filter((field) => !isEntityNameField(field)),
    ];

    return (
      <section className="flex flex-col gap-4">
        {showFieldsToolbar ? (
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-md font-medium">Поля:</h4>
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {showFieldsOverviewButton ? (
                <EntityFieldsOverviewButton
                  onClick={() => setFieldsOverviewOpen(true)}
                />
              ) : null}
              <EditAppear show={!readOnly} className="inline-flex">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ mode: "create" })}
                >
                  <Plus />
                  Добавить
                </Button>
              </EditAppear>
            </div>
          </div>
        ) : null}

        {orderedFields.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
            <p className="text-sm font-medium tracking-tight">Пока нет полей</p>
            <p className="text-xs text-muted-foreground">
              Добавьте поля для служебной сущности
            </p>
          </div>
        ) : (
          <SimpleFieldsList
            entityId={entity.id}
            fields={orderedFields}
            readOnly={readOnly}
            protectedFieldIds={protectedFieldIds}
            onEdit={(field) => setDialog({ mode: "edit", field })}
            onDelete={setPendingDeleteField}
            onConfigureList={(field) => setListSettingsFieldId(field.id)}
          />
        )}

        <EntityFieldsOverviewDialog
          open={fieldsOverviewOpen}
          onOpenChange={setFieldsOverviewOpen}
          entity={entity}
          readOnly={readOnly}
          lockedFieldIds={protectedFieldIds}
          onEditField={
            readOnly ? undefined : (field) => setDialog({ mode: "edit", field })
          }
          onDeleteField={readOnly ? undefined : setPendingDeleteField}
        />

        <EntityFieldDialog
          open={dialog.mode !== "closed"}
          onOpenChange={(open) => {
            if (!open) setDialog({ mode: "closed" });
          }}
          field={dialog.mode === "edit" ? dialog.field : null}
          initialGroup={dialog.mode === "create" ? (dialog.group ?? "") : ""}
          groupOptions={[]}
          entityOptions={entityOptions}
          entities={entities}
          entityId={entity.id}
          sumFieldOptions={sumFieldOptions}
          tablePosition={tablePosition}
          tableColumnCount={tableColumnCount}
          tablePositionMin={tablePositionMin}
          lockRelationBinding={
            dialog.mode === "edit" && tabLinkFieldIds.has(dialog.field.id)
          }
          lockSystemBinding={
            dialog.mode === "edit" && isSystemEntityField(dialog.field)
          }
          listOptionCount={dialogListOptionCount}
          onConfigureList={(data) => {
            if (data.listSourceFieldId) return;
            const fieldId = handleSubmit({ ...data, type: "list" });
            setListSettingsFieldId(fieldId);
          }}
          onSubmit={handleSubmit}
        />

        {listSettingsField ? (
          <EntityListSettingsDialog
            open
            onOpenChange={(open) => {
              if (!open) setListSettingsFieldId(null);
            }}
            entity={entity}
            field={listSettingsField}
          />
        ) : null}

        <ConfirmDialog
          open={pendingDeleteField != null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteField(null);
          }}
          title="Удалить поле?"
          description={
            pendingDeleteField
              ? `Вы уверены, что хотите удалить поле «${getEntityFieldDisplayName(pendingDeleteField)}»? Это действие нельзя отменить.`
              : "Вы уверены, что хотите удалить это поле? Это действие нельзя отменить."
          }
          confirmLabel="Удалить"
          onConfirm={() => {
            if (!pendingDeleteField) return;
            removeEntityField(entity.id, pendingDeleteField.id);
          }}
        />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {showFieldsToolbar ? (
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-md font-medium">
            {nested ? "Поля связанной сущности:" : "Поля:"}
          </h4>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {nested ? (
              <span
                className="inline-flex h-8 max-w-[14rem] items-center truncate px-1.5 text-xs font-medium text-muted-foreground"
                title={entity.name.trim() || "Без названия"}
              >
                {entity.name.trim() || "Без названия"}
              </span>
            ) : null}
            {showFieldsOverviewButton ? (
              <EntityFieldsOverviewButton
                onClick={() => setFieldsOverviewOpen(true)}
              />
            ) : null}
            <EditAppear show={!readOnly} className="inline-flex">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDialog({ mode: "create" })}
              >
                <Plus />
                Добавить
              </Button>
            </EditAppear>
          </div>
        </div>
      ) : null}

      <EntityFieldsOverviewDialog
        open={fieldsOverviewOpen}
        onOpenChange={setFieldsOverviewOpen}
        entity={entity}
        readOnly={readOnly}
        lockedFieldIds={protectedFieldIds}
        onEditField={
          readOnly ? undefined : (field) => setDialog({ mode: "edit", field })
        }
        onDeleteField={readOnly ? undefined : setPendingDeleteField}
      />

      <LayoutGroup id={`entity-fields-${entity.id}`}>
        <Tabs
          value={resolvedActiveTabId}
          onValueChange={(next) => {
            setActiveTabId(next);
          }}
          className="min-w-0 gap-4"
        >
          <div className="flex min-w-0 flex-col gap-4">
            {nameField ? (
              nested ? (
                <NameFieldBanner
                  field={nameField}
                  entityId={entity.id}
                  onEdit={
                    readOnly
                      ? undefined
                      : () => setDialog({ mode: "edit", field: nameField })
                  }
                />
              ) : (
                <div
                  className="grid min-w-0 items-stretch gap-2"
                  style={{
                    gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${HEADER_FIELD_SLOT_WIDTH})`,
                  }}
                >
                  <NameFieldBanner
                    field={nameField}
                    entityId={entity.id}
                    onEdit={
                      readOnly
                        ? undefined
                        : () => setDialog({ mode: "edit", field: nameField })
                    }
                  />
                  <HeaderFieldSlot
                    field={headerField}
                    entityId={entity.id}
                    dropActive={
                      !readOnly &&
                      draggingId != null &&
                      dropHighlight?.type === "header"
                    }
                    isDragging={
                      !readOnly &&
                      headerField != null &&
                      draggingId === headerField.id
                    }
                    snapToOrigin={
                      headerField == null || snapFieldId !== headerField.id
                    }
                    onClear={
                      readOnly
                        ? () => undefined
                        : () => setEntityHeaderField(entity.id, null)
                    }
                    onEdit={
                      readOnly || !headerField
                        ? undefined
                        : () => setDialog({ mode: "edit", field: headerField })
                    }
                    onConfigureList={
                      readOnly ||
                      headerField?.type !== "list" ||
                      headerField.listSourceFieldId
                        ? undefined
                        : () => setListSettingsFieldId(headerField.id)
                    }
                    onDragStart={
                      readOnly || !headerField
                        ? undefined
                        : () => handleDraggingChange(headerField.id)
                    }
                    onDragEnd={
                      readOnly || !headerField
                        ? undefined
                        : (clientX, clientY) => {
                            handleFieldDrop(headerField.id, clientX, clientY);
                          }
                    }
                    onDragSettle={
                      readOnly ? undefined : () => handleDraggingChange(null)
                    }
                  />
                </div>
              )
            ) : null}

            {!nested &&
            (primaryStripVisible ||
              (draggingGroupName != null &&
                groupDropTarget?.area === "primary" &&
                groupDropTarget.index === 0 &&
                groupDropTarget.mode === "stack" &&
                primaryAreaGroups.length === 0 &&
                primaryFields.length === 0)) ? (
              <div data-primary-group-zone="">
                <GeneralDropStrip
                  active={
                    dropHighlight?.type === "primary" ||
                    (groupDropTarget?.area === "primary" &&
                      groupDropTarget.index === 0)
                  }
                />
              </div>
            ) : null}

            {!nested &&
            (primaryFields.length > 0 ||
              primaryAreaGroups.length > 0 ||
              (draggingGroupName != null &&
                groupDropTarget?.area === "primary")) ? (
              <div
                data-primary-section=""
                className={cn(
                  "flex flex-col gap-5 rounded-xl transition-[box-shadow,background-color] duration-150",
                  draggingGroupName &&
                    groupDropTarget?.area === "primary" &&
                    primaryAreaGroups.length === 0 &&
                    "ring-2 ring-primary/15",
                )}
              >
                <div
                  data-groups-grid="primary"
                  className={cn(
                    "grid min-w-0 grid-cols-1 items-stretch gap-x-5 gap-y-5 sm:grid-cols-2",
                    primaryFields.length === 0 &&
                      primaryAreaGroups.length === 0 &&
                      draggingGroupName &&
                      groupDropTarget?.area === "primary" &&
                      "min-h-10 rounded-xl border border-dashed border-primary/40 bg-primary/5",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {(() => {
                      const marks = readOnly
                        ? new Map<
                            string,
                            { edge: "before" | "after"; mode: "stack" | "pair" }
                          >()
                        : groupInsertMarks(
                            primaryLayoutGroups,
                            draggingGroupName,
                            groupDropTarget,
                            "primary",
                          );
                      const mainMark = marks.get(PRIMARY_ENTITY_FIELD_GROUP);
                      return (
                        <>
                          {primaryFields.length > 0 ? (
                            <GroupBlock
                              key={primaryGroup.name}
                              entityId={entity.id}
                              groupName={primaryGroup.name}
                              fields={primaryGroup.fields}
                              colSpan={primaryGroup.colSpan}
                              dropIndex={
                                !readOnly &&
                                draggingId != null &&
                                draggingGroupName == null &&
                                dropHighlight?.type === "group" &&
                                dropHighlight.groupName === primaryGroup.name
                                  ? dropHighlight.index
                                  : null
                              }
                              draggingField={
                                !readOnly && draggingGroupName == null
                                  ? draggingField
                                  : null
                              }
                              draggingId={
                                !readOnly && draggingGroupName == null
                                  ? draggingId
                                  : null
                              }
                              draggingGroupName={
                                readOnly ? null : draggingGroupName
                              }
                              groupInsertEdge={
                                readOnly ? null : (mainMark?.edge ?? null)
                              }
                              groupInsertMode={
                                readOnly ? null : (mainMark?.mode ?? null)
                              }
                              snapFieldId={readOnly ? null : snapFieldId}
                              cardEpoch={cardEpoch}
                              showHeader
                              enableGroupLayout={!readOnly}
                              readOnly={readOnly}
                              enteringEdit={enteringEdit}
                              lockedFieldIds={protectedFieldIds}
                              onDraggingChange={handleDraggingChange}
                              onFieldDrop={handleFieldDrop}
                              onEditField={(field) => {
                                if (readOnly || isEntityNameField(field)) {
                                  return;
                                }
                                setDialog({ mode: "edit", field });
                              }}
                              onDeleteField={setPendingDeleteField}
                              onConfigureList={
                                readOnly
                                  ? undefined
                                  : (field) => {
                                      if (field.listSourceFieldId) return;
                                      setListSettingsFieldId(field.id);
                                    }
                              }
                              onAddField={
                                readOnly
                                  ? undefined
                                  : () =>
                                      setDialog({
                                        mode: "create",
                                        group: PRIMARY_ENTITY_FIELD_GROUP,
                                      })
                              }
                            />
                          ) : null}
                          {primaryAreaGroups.map((group) => {
                            const mark = marks.get(group.name);
                            return (
                              <GroupBlock
                                key={`primary-${group.name}`}
                                entityId={entity.id}
                                groupName={group.name}
                                fields={group.fields}
                                colSpan={group.colSpan}
                                dropIndex={
                                  !readOnly &&
                                  draggingId != null &&
                                  draggingGroupName == null &&
                                  dropHighlight?.type === "group" &&
                                  dropHighlight.groupName === group.name
                                    ? dropHighlight.index
                                    : null
                                }
                                draggingField={
                                  !readOnly && draggingGroupName == null
                                    ? draggingField
                                    : null
                                }
                                draggingId={
                                  !readOnly && draggingGroupName == null
                                    ? draggingId
                                    : null
                                }
                                draggingGroupName={
                                  readOnly ? null : draggingGroupName
                                }
                                groupInsertEdge={
                                  readOnly ? null : (mark?.edge ?? null)
                                }
                                groupInsertMode={
                                  readOnly ? null : (mark?.mode ?? null)
                                }
                                snapFieldId={readOnly ? null : snapFieldId}
                                cardEpoch={cardEpoch}
                                showHeader
                                titleHidden={isEntityFieldGroupTitleHidden(
                                  group.name,
                                  entity.fieldGroups,
                                )}
                                enableGroupLayout={!readOnly}
                                readOnly={readOnly}
                                enteringEdit={enteringEdit}
                                lockedFieldIds={protectedFieldIds}
                                onDraggingChange={handleDraggingChange}
                                onFieldDrop={handleFieldDrop}
                                onGroupDragStart={
                                  readOnly ? undefined : handleGroupDragStart
                                }
                                onGroupDragEnd={
                                  readOnly ? undefined : handleGroupDragEnd
                                }
                                onEditField={(field) => {
                                  if (readOnly || isEntityNameField(field)) {
                                    return;
                                  }
                                  setDialog({ mode: "edit", field });
                                }}
                                onDeleteField={setPendingDeleteField}
                                onConfigureList={
                                  readOnly
                                    ? undefined
                                    : (field) => {
                                        if (field.listSourceFieldId) return;
                                        setListSettingsFieldId(field.id);
                                      }
                                }
                                onAddField={
                                  readOnly
                                    ? undefined
                                    : () =>
                                        setDialog({
                                          mode: "create",
                                          group: group.name,
                                        })
                                }
                                onEditGroup={
                                  readOnly ||
                                  group.name === DEFAULT_ENTITY_FIELD_GROUP
                                    ? undefined
                                    : () => {
                                        setGroupNameDialog({
                                          mode: "edit",
                                          groupName: group.name,
                                        });
                                      }
                                }
                                onDeleteGroup={
                                  readOnly ||
                                  group.name === DEFAULT_ENTITY_FIELD_GROUP
                                    ? undefined
                                    : () => {
                                        dissolveEntityFieldGroup(
                                          entity.id,
                                          group.name,
                                        );
                                      }
                                }
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </AnimatePresence>
                </div>
              </div>
            ) : null}

            {!nested ? (
              <div
                data-entity-tabs=""
                className="flex h-9 w-full min-w-0 items-stretch overflow-hidden rounded-lg bg-muted p-1"
              >
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsList className="!h-full w-max min-w-max max-w-none flex-none items-stretch justify-start gap-0.5 bg-transparent p-0">
                    {entityTabs.map((tab, tabIndex) => {
                      const isOverview = isEntityOverviewTab(tab);
                      const dropActive =
                        dropHighlight?.type === "tab" &&
                        dropHighlight.tabId === tab.id &&
                        draggingId != null &&
                        getEntityFieldTabId(
                          allLayoutFields.find(
                            (field) => field.id === draggingId,
                          ) ?? { tabId: "" },
                        ) !== tab.id;
                      const isTabDragging = draggingTabId === tab.id;
                      const tabHint =
                        tabDropHint?.tabId === tab.id ? tabDropHint.edge : null;

                      const acceptsFields = isEntityFieldsHostTab(tab);

                      return (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          data-entity-tab-drop={
                            acceptsFields ? tab.id : undefined
                          }
                          draggable={
                            !readOnly && !isOverview && draggingId == null
                          }
                          onDragStart={(event) => {
                            if (readOnly || isOverview || draggingId != null) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "application/x-entity-tab",
                              JSON.stringify({
                                tabId: tab.id,
                                fromIndex: tabIndex,
                              }),
                            );
                            lockDragSelection();
                            setDraggingTabId(tab.id);
                          }}
                          onDragEnd={() => {
                            unlockDragSelection();
                            setDraggingTabId(null);
                            setTabDropHint(null);
                          }}
                          onDragOver={(event) => {
                            if (draggingId != null) return;
                            if (
                              !event.dataTransfer.types.includes(
                                "application/x-entity-tab",
                              )
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const edge =
                              event.clientX < rect.left + rect.width / 2
                                ? "before"
                                : "after";
                            setTabDropHint({ tabId: tab.id, edge });
                          }}
                          onDragLeave={(event) => {
                            if (
                              event.currentTarget.contains(
                                event.relatedTarget as Node | null,
                              )
                            ) {
                              return;
                            }
                            setTabDropHint((current) =>
                              current?.tabId === tab.id ? null : current,
                            );
                          }}
                          onDrop={(event) => {
                            if (draggingId != null) return;
                            const raw = event.dataTransfer.getData(
                              "application/x-entity-tab",
                            );
                            if (!raw) return;
                            event.preventDefault();
                            event.stopPropagation();
                            try {
                              const payload = JSON.parse(raw) as {
                                tabId: string;
                                fromIndex: number;
                              };
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const edge =
                                event.clientX < rect.left + rect.width / 2
                                  ? "before"
                                  : "after";
                              let insertAt =
                                edge === "after" ? tabIndex + 1 : tabIndex;
                              if (isOverview) insertAt = Math.max(insertAt, 1);
                              reorderEntityTabs(
                                entity.id,
                                payload.fromIndex,
                                insertAt,
                              );
                            } catch {
                              // ignore invalid payload
                            }
                            setDraggingTabId(null);
                            setTabDropHint(null);
                            unlockDragSelection();
                          }}
                          className={cn(
                            "group/tab relative !h-auto min-h-0 h-full flex-none shrink-0 grow-0 self-stretch gap-1 rounded-md py-0 pr-3 pl-3 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,padding] duration-150 data-active:shadow-sm",
                            !readOnly && "hover:pr-1.5 focus-within:pr-1.5",
                            dropActive &&
                              "bg-primary/10 text-primary ring-2 ring-primary/20",
                            isTabDragging && "opacity-40",
                            !readOnly &&
                              !isOverview &&
                              draggingId == null &&
                              "cursor-grab",
                            !readOnly &&
                              tabHint === "before" &&
                              "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                            !readOnly &&
                              tabHint === "after" &&
                              "after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-primary",
                          )}
                        >
                          {!readOnly && !isOverview ? (
                            <span
                              aria-hidden
                              className={cn(
                                "pointer-events-none absolute inset-y-1.5 left-1 w-0.5 rounded-full bg-primary transition-opacity duration-150",
                                isTabDragging
                                  ? "opacity-100"
                                  : "opacity-0 group-hover/tab:opacity-55",
                              )}
                            />
                          ) : null}
                          <span className="shrink-0">{tab.name}</span>
                          {readOnly ? null : (
                            <span
                              className={cn(
                                "grid transition-[grid-template-columns,opacity] duration-150 ease-out",
                                "grid-cols-[0fr] opacity-0",
                                "group-hover/tab:grid-cols-[1fr] group-hover/tab:opacity-100",
                                "group-focus-within/tab:grid-cols-[1fr] group-focus-within/tab:opacity-100",
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  aria-label={
                                    isEntityTabWithLinkedEntity(tab)
                                      ? `Настройки вкладки «${tab.name}»`
                                      : `Редактировать вкладку «${tab.name}»`
                                  }
                                  title={
                                    isEntityTabWithLinkedEntity(tab)
                                      ? "Настройки вкладки"
                                      : "Редактировать"
                                  }
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (
                                      isEntityTabWithLinkedEntity(tab) &&
                                      tab.linkedEntityId
                                    ) {
                                      setSubEntitySettings({
                                        tabId: tab.id,
                                        linkedEntityId: tab.linkedEntityId,
                                      });
                                      return;
                                    }
                                    setTabDialog({ mode: "edit", tab });
                                  }}
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  onMouseDown={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <Pencil className="size-3" />
                                </span>
                                {!canDeleteTab ? null : (
                                  <span
                                    role="button"
                                    tabIndex={-1}
                                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`Удалить вкладку «${tab.name}»`}
                                    title="Удалить"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      const fallbackId =
                                        entityTabs.find(
                                          (item) => item.id !== tab.id,
                                        )?.id ?? ENTITY_OVERVIEW_TAB_ID;
                                      if (activeTabId === tab.id) {
                                        setActiveTabId(fallbackId);
                                      }
                                      removeEntityTab(entity.id, tab.id);
                                    }}
                                    onPointerDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onMouseDown={(event) =>
                                      event.stopPropagation()
                                    }
                                  >
                                    <X className="size-3.5" />
                                  </span>
                                )}
                              </span>
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>
                <EditAppear
                  show={!readOnly}
                  className="inline-flex h-full shrink-0"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="relative z-10 ml-0.5 !h-auto w-7 shrink-0 self-stretch rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    aria-label="Добавить вкладку"
                    title="Добавить вкладку"
                    onClick={() => setTabDialog({ mode: "create" })}
                  >
                    <Plus />
                  </Button>
                </EditAppear>
              </div>
            ) : null}

            {activeTab && isEntityMirrorTab(activeTab) ? (
              <MirrorTabNote
                hostEntity={entity}
                tab={activeTab}
                entities={entities}
              />
            ) : activeTab && isEntityRecordsTab(activeTab) ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Лента записей
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  На странице карточки здесь будет лента текстовых заметок — без
                  отдельных полей.
                </p>
              </div>
            ) : activeTab && isEntityFilesTab(activeTab) ? (
              <EntityFilesTabFoldersEditor
                entity={entity}
                tab={activeTab}
                readOnly={readOnly}
              />
            ) : activeTab && isEntityHistoryTab(activeTab) ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  История изменений
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  На странице карточки здесь будет лента изменений записи: кто,
                  когда и что поменял — без отдельных полей.
                </p>
              </div>
            ) : activeTab && isEntityTimeSessionsTab(activeTab) ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Учёт времени
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  На странице карточки здесь будет список сессий таймера и
                  ручных записей времени — без отдельных полей. Нужна настройка
                  учёта времени у сущности.
                </p>
              </div>
            ) : linkedEntityForActiveTab ? (
              linkedEntityForActiveTab.id === entity.id ||
              linkedEntityForActiveTab.parentEntityId !== entity.id ? (
                <LinkedExistingEntityTabNote
                  linkedEntity={linkedEntityForActiveTab}
                  isSelf={linkedEntityForActiveTab.id === entity.id}
                />
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <EntityFieldsEditor
                    entity={linkedEntityForActiveTab}
                    nested
                    readOnly={readOnly}
                  />
                </div>
              )
            ) : (
              <div data-entity-fields="" className="flex flex-col gap-3">
                {generalStripVisible ? (
                  <GeneralDropStrip
                    active={dropHighlight?.type === "general"}
                  />
                ) : null}

                <div
                  data-groups-grid="tab"
                  className="grid min-w-0 grid-cols-1 items-stretch gap-x-5 gap-y-5 sm:grid-cols-2"
                >
                  <AnimatePresence initial={false}>
                    {(() => {
                      const marks = groupInsertMarks(
                        otherGroups,
                        draggingGroupName,
                        groupDropTarget,
                        "tab",
                      );
                      return otherGroups.map((group) => {
                        const mark = marks.get(group.name);
                        return (
                          <GroupBlock
                            key={group.name}
                            entityId={entity.id}
                            groupName={group.name}
                            fields={group.fields}
                            colSpan={group.colSpan}
                            dropIndex={
                              !readOnly &&
                              draggingId != null &&
                              draggingGroupName == null &&
                              dropHighlight?.type === "group" &&
                              dropHighlight.groupName === group.name
                                ? dropHighlight.index
                                : null
                            }
                            draggingField={
                              !readOnly && draggingGroupName == null
                                ? draggingField
                                : null
                            }
                            draggingId={
                              !readOnly && draggingGroupName == null
                                ? draggingId
                                : null
                            }
                            draggingGroupName={
                              readOnly ? null : draggingGroupName
                            }
                            groupInsertEdge={
                              readOnly ? null : (mark?.edge ?? null)
                            }
                            groupInsertMode={
                              readOnly ? null : (mark?.mode ?? null)
                            }
                            snapFieldId={readOnly ? null : snapFieldId}
                            cardEpoch={cardEpoch}
                            showHeader
                            titleHidden={isEntityFieldGroupTitleHidden(
                              group.name,
                              entity.fieldGroups,
                            )}
                            enableGroupLayout={!readOnly}
                            readOnly={readOnly}
                            enteringEdit={enteringEdit}
                            lockedFieldIds={protectedFieldIds}
                            onDraggingChange={handleDraggingChange}
                            onFieldDrop={handleFieldDrop}
                            onGroupDragStart={
                              readOnly ? undefined : handleGroupDragStart
                            }
                            onGroupDragEnd={
                              readOnly ? undefined : handleGroupDragEnd
                            }
                            onEditField={(field) => {
                              if (readOnly || isEntityNameField(field)) {
                                return;
                              }
                              setDialog({ mode: "edit", field });
                            }}
                            onDeleteField={setPendingDeleteField}
                            onConfigureList={
                              readOnly
                                ? undefined
                                : (field) => {
                                    if (field.listSourceFieldId) return;
                                    setListSettingsFieldId(field.id);
                                  }
                            }
                            onAddField={
                              readOnly
                                ? undefined
                                : () =>
                                    setDialog({
                                      mode: "create",
                                      group: group.name,
                                    })
                            }
                            onEditGroup={
                              readOnly ||
                              group.name === DEFAULT_ENTITY_FIELD_GROUP
                                ? undefined
                                : () => {
                                    setGroupNameDialog({
                                      mode: "edit",
                                      groupName: group.name,
                                    });
                                  }
                            }
                            onDeleteGroup={
                              readOnly ||
                              group.name === DEFAULT_ENTITY_FIELD_GROUP
                                ? undefined
                                : () => {
                                    dissolveEntityFieldGroup(
                                      entity.id,
                                      group.name,
                                    );
                                  }
                            }
                          />
                        );
                      });
                    })()}
                  </AnimatePresence>
                </div>

                {readOnly ? null : (
                  <button
                    type="button"
                    data-new-group-zone=""
                    onClick={() => {
                      if (draggingId || draggingGroupName) return;
                      setGroupNameDialog({ mode: "create" });
                    }}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
                      draggingId != null && dropHighlight?.type === "new-group"
                        ? "border-primary/50 bg-primary/5 text-foreground ring-2 ring-primary/15"
                        : draggingId
                          ? "cursor-copy border-border/80 bg-muted/20 text-muted-foreground"
                          : "cursor-pointer border-border/50 bg-transparent text-muted-foreground/80 hover:border-border hover:bg-muted/20 hover:text-foreground",
                    )}
                  >
                    <Plus className="size-4 shrink-0 opacity-70" />
                    <span>
                      {draggingId != null && dropHighlight?.type === "new-group"
                        ? "Отпустите, чтобы создать группу"
                        : "Создать группу"}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </Tabs>
      </LayoutGroup>

      <EntityFieldDialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" });
        }}
        field={
          dialog.mode === "edit"
            ? headerField?.id === dialog.field.id
              ? { ...dialog.field, group: ENTITY_HEADER_FIELD_GROUP }
              : dialog.field
            : null
        }
        initialGroup={dialog.mode === "create" ? (dialog.group ?? "") : ""}
        groupOptions={groupOptions}
        entityOptions={entityOptions}
        entities={entities}
        entityId={entity.id}
        sumFieldOptions={sumFieldOptions}
        tablePosition={tablePosition}
        tableColumnCount={tableColumnCount}
        tablePositionMin={tablePositionMin}
        lockRelationBinding={
          dialog.mode === "edit" && tabLinkFieldIds.has(dialog.field.id)
        }
        lockSystemBinding={
          dialog.mode === "edit" && isSystemEntityField(dialog.field)
        }
        listOptionCount={dialogListOptionCount}
        onConfigureList={(data) => {
          if (data.listSourceFieldId) return;
          const fieldId = handleSubmit({ ...data, type: "list" });
          setListSettingsFieldId(fieldId);
        }}
        onSubmit={handleSubmit}
      />

      {listSettingsField ? (
        <EntityListSettingsDialog
          open
          onOpenChange={(open) => {
            if (!open) setListSettingsFieldId(null);
          }}
          entity={entity}
          field={listSettingsField}
        />
      ) : null}

      {subEntitySettings && subEntitySettingsTab && subEntitySettingsEntity ? (
        <EntitySubEntitySettingsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSubEntitySettings(null);
          }}
          parentEntityId={entity.id}
          tabId={subEntitySettings.tabId}
          tabName={subEntitySettingsTab.name}
          singleRecord={subEntitySettingsTab.singleRecord}
          entity={subEntitySettingsEntity}
        />
      ) : null}

      <EntityTabDialog
        open={tabDialog.mode !== "closed"}
        mode={tabDialog.mode === "edit" ? "edit" : "create"}
        initialName={tabDialog.mode === "edit" ? tabDialog.tab.name : ""}
        initialKind={tabDialog.mode === "edit" ? tabDialog.tab.kind : "fields"}
        initialSourceRelationFieldId={
          tabDialog.mode === "edit"
            ? (tabDialog.tab.sourceRelationFieldId ?? "")
            : ""
        }
        initialSourceTabId={
          tabDialog.mode === "edit" ? (tabDialog.tab.sourceTabId ?? "") : ""
        }
        hostEntity={entity}
        entities={entities}
        entityOptions={entities
          .filter((item) => {
            const alreadyUsed = entity.tabs.some(
              (tab) =>
                isEntityTabWithLinkedEntity(tab) &&
                tab.linkedEntityId === item.id,
            );
            return !alreadyUsed;
          })
          .map((item) => {
            const leaf =
              item.namePlural.trim() || item.name.trim() || "Без названия";
            const path = getEntityPathLabel(item.id, entities);
            return {
              id: item.id,
              name: path === leaf ? leaf : path,
              recordsDisplay: normalizeEntityRecordsDisplay(
                item.recordsDisplay,
              ),
              recordColumns: normalizeEntityRecordColumns(item.recordColumns),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "ru"))}
        onOpenChange={(open) => {
          if (!open) setTabDialog({ mode: "closed" });
        }}
        onSubmit={(data) => {
          if (tabDialog.mode === "edit") {
            if (
              tabDialog.tab.kind === "mirror" &&
              data.sourceRelationFieldId &&
              data.sourceTabId
            ) {
              updateEntityTab(entity.id, tabDialog.tab.id, {
                name: data.name,
                sourceRelationFieldId: data.sourceRelationFieldId,
                sourceTabId: data.sourceTabId,
              });
              return;
            }
            updateEntityTab(entity.id, tabDialog.tab.id, {
              name: data.name,
            });
            return;
          }
          if (
            data.kind === "mirror" &&
            data.sourceRelationFieldId &&
            data.sourceTabId
          ) {
            const tab = addEntityMirrorTab(entity.id, {
              sourceRelationFieldId: data.sourceRelationFieldId,
              sourceTabId: data.sourceTabId,
              name: data.name,
            });
            if (tab) {
              setActiveTabId(tab.id);
              return;
            }
            toast.error(
              "Не удалось создать вкладку «Из записи». Проверьте поле связи и вкладку источника.",
            );
            return;
          }
          if (data.kind === "entity") {
            if (data.entitySource === "existing" && data.linkedEntityId) {
              const tab = addEntityTabWithExistingEntity(entity.id, {
                linkedEntityId: data.linkedEntityId,
                name: data.name,
                recordsDisplay: data.recordsDisplay,
                recordColumns: data.recordColumns,
              });
              if (tab) setActiveTabId(tab.id);
              return;
            }
            const tab = addEntityTabWithLinkedEntity(entity.id, {
              name: data.name,
              namePlural: data.name,
              recordsDisplay: data.recordsDisplay,
              recordColumns: data.recordColumns,
            });
            if (tab) setActiveTabId(tab.id);
            return;
          }
          if (data.kind === "mirror") return;
          const tab = addEntityTab(entity.id, {
            name: data.name,
            kind: data.kind,
          });
          setActiveTabId(tab.id);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteField != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteField(null);
        }}
        title="Удалить поле?"
        description={
          pendingDeleteField
            ? `Вы уверены, что хотите удалить поле «${getEntityFieldDisplayName(pendingDeleteField)}»? Это действие нельзя отменить.`
            : "Вы уверены, что хотите удалить это поле? Это действие нельзя отменить."
        }
        confirmLabel="Удалить"
        onConfirm={() => {
          if (!pendingDeleteField) return;
          removeEntityField(entity.id, pendingDeleteField.id);
        }}
      />

      <EntityFieldGroupDialog
        open={
          groupNameDialog.mode === "create" || groupNameDialog.mode === "edit"
        }
        mode={groupNameDialog.mode === "edit" ? "edit" : "create"}
        initialName={
          groupNameDialog.mode === "edit" ? groupNameDialog.groupName : ""
        }
        initialMetrics={
          groupNameDialog.mode === "edit" &&
          isEntityMetricsFieldGroup(
            groupNameDialog.groupName,
            entity.fieldGroups,
          )
        }
        initialHideTitle={
          groupNameDialog.mode === "edit" &&
          isEntityFieldGroupTitleHidden(
            groupNameDialog.groupName,
            entity.fieldGroups,
          )
        }
        onOpenChange={(open) => {
          if (!open) {
            setGroupNameDialog({ mode: "closed" });
            if (skipGroupDialogResetRef.current) {
              skipGroupDialogResetRef.current = false;
              return;
            }
            setCardEpoch((value) => value + 1);
          }
        }}
        onSubmit={({ name, metrics, hideTitle }) => {
          const display = metrics ? "metrics" : undefined;
          if (groupNameDialog.mode === "edit") {
            skipGroupDialogResetRef.current = true;
            const nextName = hideTitle
              ? groupNameDialog.groupName
              : name.trim() || groupNameDialog.groupName;
            if (nextName !== groupNameDialog.groupName) {
              renameEntityFieldGroup(
                entity.id,
                groupNameDialog.groupName,
                nextName,
              );
            }
            updateEntityFieldGroup(entity.id, nextName, {
              display,
              hideTitle,
            });
            setGroupNameDialog({ mode: "closed" });
            return;
          }

          if (groupNameDialog.mode !== "create") return;
          skipGroupDialogResetRef.current = true;
          const groupName =
            name.trim() || createEntityFieldGroupName(groupOptions);

          if (groupNameDialog.fieldId) {
            moveEntityFieldToGroup(
              entity.id,
              groupNameDialog.fieldId,
              groupName,
              0,
            );
          } else if (!existingGroupNames.has(groupName)) {
            ensureEntityFieldGroupMeta(
              entity.id,
              groupName,
              ENTITY_FIELD_GROUP_COLUMNS,
              resolvedActiveTabId,
            );
          }
          updateEntityFieldGroup(entity.id, groupName, {
            display,
            hideTitle,
          });

          setGroupNameDialog({ mode: "closed" });
        }}
      />
    </section>
  );
}
