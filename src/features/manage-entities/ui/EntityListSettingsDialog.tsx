import {
  Children,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import {
  DEFAULT_ENTITY_LIST_COLORS,
  addEntityListOption,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityListDependencyCandidates,
  getEntityListDependencyParentValues,
  getEntityListParentField,
  getEntityRelationTargetId,
  moveEntityListOption,
  normalizeListColor,
  removeEntityListOption,
  updateEntityField,
  updateEntityListOption,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityListDependencyParentValue,
  type EntityListOption,
} from "@/entities/entity";
import {
  createUsersRoleFromListOption,
  deleteUsersRoleFromListOption,
  isProtectedSystemRoleId,
  isUsersRoleListField,
  reorderUsersRolesFromListOptions,
  updateUsersRoleFromListOption,
} from "../lib/users-role-list";

const NO_DEPENDENCY = "__none__";

type ListOptionEditorData = Pick<
  EntityListOption,
  "name" | "color" | "final" | "problem" | "hiddenByDefault"
>;

const LIST_OPTION_MIME = "application/x-ipk-list-option";

const listLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

const dropIndicatorTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

type ListOptionDragPayload = {
  optionId: string;
};

type DropHint = {
  parentOptionId: string | null;
  /** Option id to insert before; null = append to group end. */
  beforeOptionId: string | null;
};

type EntityListSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  field: EntityField;
};

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; parentOptionId: string | null }
  | { mode: "edit"; option: EntityListOption };

/** Nested branch under a parent toggle — same visual language as field type nesting. */
function SettingsNestedGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="relative mr-1 mb-0.5 ml-3">
      <div className="flex flex-col gap-1.5">
        {items.map((child, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <div key={index} className="relative">
              {isLast ? (
                <div
                  className={cn(
                    "pointer-events-none absolute left-0 w-3 rounded-bl-[5px] border-b border-l border-border",
                    isFirst ? "-top-2 h-[calc(50%+8px)]" : "top-0 h-1/2",
                  )}
                  aria-hidden
                />
              ) : (
                <>
                  <div
                    className={cn(
                      "pointer-events-none absolute left-0 w-px bg-border",
                      isFirst ? "-top-2 bottom-[-6px]" : "top-0 bottom-[-6px]",
                    )}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 left-0 h-px w-3 bg-border"
                    aria-hidden
                  />
                </>
              )}
              <div className="ml-3">{child}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LIST_COLOR_PRESETS = new Set<string>(DEFAULT_ENTITY_LIST_COLORS);

function ListColorSwatch({
  color,
  selected = false,
  onClick,
  title,
}: {
  color: string;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "relative size-5 shrink-0 rounded-full border border-black/10 shadow-xs transition-[transform,box-shadow]",
        onClick && "hover:scale-110",
        selected && "outline-2 outline-offset-1 outline-ring",
      )}
      style={{ backgroundColor: color }}
    >
      {selected ? (
        <Check
          className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function ListCustomColorSwatch({
  color,
  selected,
  onChange,
}: {
  color: string;
  selected: boolean;
  onChange: (color: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      title="Свой цвет"
      aria-label="Свой цвет"
      aria-pressed={selected}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative size-5 shrink-0 rounded-full border border-border shadow-xs transition-[transform,box-shadow] hover:scale-110",
        selected && "outline-2 outline-offset-1 outline-ring",
      )}
      style={
        selected
          ? { backgroundColor: color }
          : {
              background:
                "conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)",
            }
      }
    >
      <input
        ref={inputRef}
        type="color"
        value={color}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onChange(normalizeListColor(event.target.value))}
        onClick={(event) => event.stopPropagation()}
      />
      {selected ? (
        <Check
          className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
          aria-hidden
        />
      ) : (
        <Plus
          className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
          aria-hidden
        />
      )}
    </button>
  );
}

function OptionBehaviorSwitch({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <p className="text-[11px] leading-tight text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function hasOptionBehavior(option: EntityListOption | null | undefined) {
  return Boolean(option?.final || option?.problem || option?.hiddenByDefault);
}

function ListOptionEditor({
  initial,
  showColors = true,
  onCancel,
  onSubmit,
}: {
  initial?: EntityListOption | null;
  showColors?: boolean;
  onCancel: () => void;
  onSubmit: (data: ListOptionEditorData) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(
    normalizeListColor(initial?.color ?? DEFAULT_ENTITY_LIST_COLORS[7]),
  );
  const [behaviorOpen, setBehaviorOpen] = useState(() =>
    hasOptionBehavior(initial),
  );
  const [final, setFinal] = useState(initial?.final === true);
  const [problem, setProblem] = useState(initial?.problem === true);
  const [hiddenByDefault, setHiddenByDefault] = useState(
    initial?.hiddenByDefault === true,
  );
  const canSubmit = name.trim().length > 0;
  const customSelected = !LIST_COLOR_PRESETS.has(color);

  function submit() {
    onSubmit({
      name: name.trim(),
      color,
      final,
      problem,
      hiddenByDefault,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entity-list-option-name">Название</Label>
          <Input
            id="entity-list-option-name"
            value={name}
            placeholder="Например, В работе"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>

        {showColors ? (
          <div className="flex flex-col gap-1.5">
            <Label>Цвет</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <ListCustomColorSwatch
                color={color}
                selected={customSelected}
                onChange={setColor}
              />
              {DEFAULT_ENTITY_LIST_COLORS.map((item) => (
                <ListColorSwatch
                  key={item}
                  color={item}
                  selected={color === item}
                  title={item}
                  onClick={() => setColor(item)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={behaviorOpen}
            className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setBehaviorOpen((value) => !value)}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                !behaviorOpen && "-rotate-90",
              )}
              aria-hidden
            />
            Поведение
          </button>

          {behaviorOpen ? (
            <div className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-card p-2.5">
              <OptionBehaviorSwitch
                id="entity-list-option-final"
                label="Завершающий"
                hint="Запись выполнена: без просрочки, в доле завершённых"
                checked={final}
                onCheckedChange={setFinal}
              />
              <OptionBehaviorSwitch
                id="entity-list-option-problem"
                label="Проблемный"
                hint="Считается в проблемных записях"
                checked={problem}
                onCheckedChange={setProblem}
              />
              <OptionBehaviorSwitch
                id="entity-list-option-hidden"
                label="Скрывать по умолчанию"
                hint="Записи видны по переключателю «Показать скрытые»"
                checked={hiddenByDefault}
                onCheckedChange={setHiddenByDefault}
              />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

function OptionBehaviorBadges({ option }: { option: EntityListOption }) {
  if (!option.final && !option.problem && !option.hiddenByDefault) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {option.final ? (
        <span title="Завершающий" aria-label="Завершающий">
          <CircleCheck className="size-3.5" aria-hidden />
        </span>
      ) : null}
      {option.problem ? (
        <span title="Проблемный" aria-label="Проблемный">
          <TriangleAlert className="size-3.5" aria-hidden />
        </span>
      ) : null}
      {option.hiddenByDefault ? (
        <span title="Скрывать по умолчанию" aria-label="Скрывать по умолчанию">
          <EyeOff className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

function readListOptionPayload(event: DragEvent): ListOptionDragPayload | null {
  const raw = event.dataTransfer.getData(LIST_OPTION_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ListOptionDragPayload;
  } catch {
    return null;
  }
}

function hasListOptionMime(event: DragEvent) {
  return [...event.dataTransfer.types].includes(LIST_OPTION_MIME);
}

function getDropEdge(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Dialogs use CSS transform, so the browser drag image is blank.
 * Clone the card onto `document.body` and use that as the preview.
 */
function setListOptionDragPreview(event: DragEvent, source: HTMLElement) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("button").forEach((button) => button.remove());
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${rect.width}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "99999",
    opacity: "1",
    transform: "rotate(1.25deg)",
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
  requestAnimationFrame(() => {
    ghost.remove();
  });
}

function DropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0.82 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={dropIndicatorTransition}
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

/** Red grab rail to the left of the option card (outside the border). */
function DragHandle({
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
            : "opacity-45 group-hover/option:opacity-90 group-focus-within/option:opacity-90",
        )}
      />
    </span>
  );
}

type OptionDragControllers = {
  draggingId: string | null;
  dropHint: DropHint | null;
  handleEpoch: number;
  prepareDrag: (event: { target: EventTarget | null }) => void;
  onDragStart: (event: DragEvent, optionId: string) => void;
  onDragEnd: (event?: DragEvent) => void;
  onDragOverOption: (
    event: DragEvent<HTMLElement>,
    parentOptionId: string | null,
    optionId: string,
    nextOptionId: string | null,
  ) => void;
  onDropOnOption: (
    event: DragEvent<HTMLElement>,
    parentOptionId: string | null,
    optionId: string,
    nextOptionId: string | null,
  ) => void;
  onDragOverGroup: (
    event: DragEvent<HTMLElement>,
    parentOptionId: string | null,
  ) => void;
  onDropOnGroup: (event: DragEvent, parentOptionId: string | null) => void;
};

function ListOptionRow({
  option,
  showColors,
  isEditing,
  draggable = false,
  isDragging,
  dropEdge,
  handleEpoch,
  onPrepareDrag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
  onDelete,
  onCancelEdit,
  onSaveEdit,
  canDelete = true,
}: {
  option: EntityListOption;
  showColors: boolean;
  isEditing: boolean;
  draggable?: boolean;
  isDragging: boolean;
  dropEdge: "before" | "after" | null;
  handleEpoch: number;
  onPrepareDrag: (event: { target: EventTarget | null }) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: (event?: DragEvent) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: ListOptionEditorData) => void;
  canDelete?: boolean;
}) {
  if (isEditing) {
    return (
      <ListOptionEditor
        initial={option}
        showColors={showColors}
        onCancel={onCancelEdit}
        onSubmit={onSaveEdit}
      />
    );
  }

  const card = (
    <div
      data-list-option-card
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border/70 bg-card px-3 transition-[box-shadow,border-color,background-color] duration-200",
        showColors ? "py-2" : "py-1.5",
        !isDragging && "hover:border-border",
      )}
    >
      {showColors ? (
        <span
          className="size-3.5 shrink-0 rounded-full border border-black/10 shadow-xs"
          style={{ backgroundColor: option.color }}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="max-w-full text-sm font-medium tracking-tight wrap-break-word">
          {option.name}
        </p>
        {showColors ? (
          <p className="font-mono text-[10px] text-muted-foreground uppercase">
            {option.color}
          </p>
        ) : null}
      </div>
      <OptionBehaviorBadges option={option} />
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-foreground"
          aria-label={`Редактировать вариант «${option.name}»`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-foreground hover:text-destructive"
            aria-label={`Удалить вариант «${option.name}»`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (!draggable) {
    return <div className="relative">{card}</div>;
  }

  return (
    <div
      className="group/option relative"
      draggable
      onMouseDown={onPrepareDrag}
      onDragStart={(event) => {
        const preview = event.currentTarget.querySelector<HTMLElement>(
          "[data-list-option-card]",
        );
        if (preview) setListOptionDragPreview(event, preview);
        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <motion.div
        layout="position"
        layoutId={`list-option-${option.id}`}
        transition={listLayoutTransition}
        className="relative flex items-stretch gap-0.5"
      >
        <DragHandle
          key={`handle-${option.id}-${handleEpoch}`}
          label={`Перетащить «${option.name}»`}
          active={isDragging}
        />
        <div className="relative min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {dropEdge ? <DropIndicator key="drop" edge={dropEdge} /> : null}
          </AnimatePresence>
          {isDragging ? (
            <div
              aria-hidden
              className={cn(
                "rounded-xl border-2 border-dashed border-primary/35 bg-primary/[0.04]",
                showColors ? "h-[3.25rem]" : "h-10",
              )}
            />
          ) : (
            card
          )}
        </div>
      </motion.div>
    </div>
  );
}

function OptionGroupList({
  parentOptionId,
  options,
  showColors,
  editor,
  drag,
  draggable = true,
  nested = false,
  footer,
  onEdit,
  onDelete,
  onCancelEditor,
  onSaveEdit,
  canDeleteOption,
}: {
  parentOptionId: string | null;
  options: EntityListOption[];
  showColors: boolean;
  editor: EditorState;
  drag: OptionDragControllers;
  draggable?: boolean;
  nested?: boolean;
  footer?: ReactNode;
  onEdit: (option: EntityListOption) => void;
  onDelete: (optionId: string) => void;
  onCancelEditor: () => void;
  onSaveEdit: (optionId: string, data: ListOptionEditorData) => void;
  canDeleteOption?: (optionId: string) => boolean;
}) {
  function renderOptionRow(option: EntityListOption, index: number) {
    const nextOptionId = options[index + 1]?.id ?? null;
    const hintMatches =
      draggable &&
      drag.dropHint?.parentOptionId === parentOptionId &&
      drag.draggingId !== option.id;
    const dropEdge: "before" | "after" | null = !hintMatches
      ? null
      : drag.dropHint?.beforeOptionId === option.id
        ? "before"
        : drag.dropHint?.beforeOptionId == null && index === options.length - 1
          ? "after"
          : null;

    return (
      <ListOptionRow
        key={option.id}
        option={option}
        showColors={showColors}
        isEditing={editor.mode === "edit" && editor.option.id === option.id}
        draggable={draggable}
        isDragging={draggable && drag.draggingId === option.id}
        dropEdge={dropEdge}
        handleEpoch={drag.handleEpoch}
        onPrepareDrag={drag.prepareDrag}
        onDragStart={(event) => drag.onDragStart(event, option.id)}
        onDragEnd={drag.onDragEnd}
        onDragOver={(event) =>
          drag.onDragOverOption(event, parentOptionId, option.id, nextOptionId)
        }
        onDrop={(event) =>
          drag.onDropOnOption(event, parentOptionId, option.id, nextOptionId)
        }
        onEdit={() => onEdit(option)}
        onDelete={() => onDelete(option.id)}
        onCancelEdit={onCancelEditor}
        onSaveEdit={(data) => onSaveEdit(option.id, data)}
        canDelete={canDeleteOption?.(option.id) ?? true}
      />
    );
  }

  const appendHint =
    draggable &&
    drag.draggingId != null &&
    drag.dropHint?.parentOptionId === parentOptionId &&
    drag.dropHint.beforeOptionId == null &&
    options.length === 0;

  if (nested) {
    return (
      <div
        className="flex flex-col gap-1.5"
        onDragOver={(event) => {
          if (!draggable || options.length > 0) return;
          drag.onDragOverGroup(event, parentOptionId);
        }}
        onDrop={(event) => {
          if (!draggable || options.length > 0) return;
          drag.onDropOnGroup(event, parentOptionId);
        }}
      >
        <SettingsNestedGroup>
          {options.map((option, index) => renderOptionRow(option, index))}
          {footer}
          {appendHint ? (
            <motion.div
              key="__append__"
              className="relative h-8"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 32 }}
              exit={{ opacity: 0, height: 0 }}
              transition={dropIndicatorTransition}
            >
              <DropIndicator edge="before" />
            </motion.div>
          ) : null}
        </SettingsNestedGroup>
      </div>
    );
  }

  return (
    <ul
      className="flex flex-col gap-1.5"
      onDragOver={(event) => {
        if (!draggable || options.length > 0) return;
        drag.onDragOverGroup(event, parentOptionId);
      }}
      onDrop={(event) => {
        if (!draggable || options.length > 0) return;
        drag.onDropOnGroup(event, parentOptionId);
      }}
    >
      {options.map((option, index) => (
        <li key={option.id}>{renderOptionRow(option, index)}</li>
      ))}
      {footer ? <li key="__footer__">{footer}</li> : null}
      {appendHint ? (
        <motion.li
          key="__append__"
          className="relative h-8"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 32 }}
          exit={{ opacity: 0, height: 0 }}
          transition={dropIndicatorTransition}
        >
          <DropIndicator edge="before" />
        </motion.li>
      ) : null}
    </ul>
  );
}

function ParentOptionBranch({
  parentValue,
  showColors,
  options,
  editor,
  drag,
  onCreate,
  onEdit,
  onDelete,
  onCancelEditor,
  onSaveCreate,
  onSaveEdit,
}: {
  parentValue: EntityListDependencyParentValue;
  showColors: boolean;
  options: EntityListOption[];
  editor: EditorState;
  drag: OptionDragControllers;
  onCreate: () => void;
  onEdit: (option: EntityListOption) => void;
  onDelete: (optionId: string) => void;
  onCancelEditor: () => void;
  onSaveCreate: (data: ListOptionEditorData) => void;
  onSaveEdit: (optionId: string, data: ListOptionEditorData) => void;
}) {
  const creatingHere =
    editor.mode === "create" && editor.parentOptionId === parentValue.id;
  const showParentColor = Boolean(parentValue.color);
  const isGroupDropTarget =
    drag.draggingId != null &&
    drag.dropHint?.parentOptionId === parentValue.id &&
    drag.dropHint.beforeOptionId == null &&
    options.length === 0;

  const footer = creatingHere ? (
    <ListOptionEditor
      key="__create__"
      showColors={showColors}
      onCancel={onCancelEditor}
      onSubmit={onSaveCreate}
    />
  ) : (
    <Button
      key="__add__"
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "w-full justify-start gap-1.5 border-dashed text-xs text-muted-foreground",
        showColors ? "h-auto min-h-11 py-2" : "h-11",
        isGroupDropTarget && "border-primary bg-primary/8 text-primary",
      )}
      onClick={onCreate}
      onDragOver={(event) => drag.onDragOverGroup(event, parentValue.id)}
      onDrop={(event) => drag.onDropOnGroup(event, parentValue.id)}
    >
      <Plus className="size-3.5" />
      Добавить вариант
    </Button>
  );

  return (
    <div
      className="flex flex-col gap-1.5"
      onDragOver={(event) => {
        if (!hasListOptionMime(event)) return;
        // Dropping on the parent header appends to this group.
        if (
          event.target instanceof Element &&
          event.target.closest("[data-parent-header]")
        ) {
          drag.onDragOverGroup(event, parentValue.id);
        }
      }}
      onDrop={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-parent-header]")
        ) {
          drag.onDropOnGroup(event, parentValue.id);
        }
      }}
    >
      <motion.div
        layout="position"
        transition={listLayoutTransition}
        data-parent-header
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 transition-[border-color,box-shadow,background-color] duration-200",
          showParentColor ? "py-2" : "py-1.5",
          drag.draggingId != null &&
            drag.dropHint?.parentOptionId === parentValue.id &&
            "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10 ring-1 ring-primary/15",
        )}
      >
        {showParentColor ? (
          <span
            className="size-3.5 shrink-0 rounded-full border border-black/10 shadow-xs"
            style={{ backgroundColor: parentValue.color }}
            aria-hidden
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">
            {parentValue.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Варианты для «{parentValue.name}»
          </p>
        </div>
        <motion.span
          key={options.length}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={dropIndicatorTransition}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
        >
          {options.length}
        </motion.span>
      </motion.div>

      <OptionGroupList
        parentOptionId={parentValue.id}
        options={options}
        showColors={showColors}
        editor={editor}
        drag={drag}
        nested
        footer={footer}
        onEdit={onEdit}
        onDelete={onDelete}
        onCancelEditor={onCancelEditor}
        onSaveEdit={onSaveEdit}
      />
    </div>
  );
}

function UnassignedOptionsSection({
  showColors,
  options,
  editor,
  drag,
  onEdit,
  onDelete,
  onCancelEditor,
  onSaveEdit,
}: {
  showColors: boolean;
  options: EntityListOption[];
  editor: EditorState;
  drag: OptionDragControllers;
  onEdit: (option: EntityListOption) => void;
  onDelete: (optionId: string) => void;
  onCancelEditor: () => void;
  onSaveEdit: (optionId: string, data: ListOptionEditorData) => void;
}) {
  if (options.length === 0 && drag.draggingId == null) return null;

  const isDropTarget =
    drag.draggingId != null &&
    drag.dropHint?.parentOptionId == null &&
    options.every((option) => option.id !== drag.draggingId);

  return (
    <motion.section
      layout="position"
      transition={listLayoutTransition}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-dashed border-border/70 bg-muted/10 p-2.5 transition-[border-color,background-color,box-shadow] duration-200",
        isDropTarget &&
          "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10",
      )}
      onDragOver={(event) => drag.onDragOverGroup(event, null)}
      onDrop={(event) => drag.onDropOnGroup(event, null)}
    >
      <div className="flex items-center gap-2 px-0.5">
        <h3 className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Без привязки
        </h3>
        <motion.span
          key={options.length}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={dropIndicatorTransition}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
        >
          {options.length}
        </motion.span>
      </div>
      <p className="px-0.5 text-[11px] text-muted-foreground">
        Перетащите в группу родителя
      </p>
      {options.length > 0 ? (
        <OptionGroupList
          parentOptionId={null}
          options={options}
          showColors={showColors}
          editor={editor}
          drag={drag}
          onEdit={onEdit}
          onDelete={onDelete}
          onCancelEditor={onCancelEditor}
          onSaveEdit={onSaveEdit}
        />
      ) : (
        <div className="relative px-1 py-3 text-center text-[11px] text-muted-foreground">
          <AnimatePresence initial={false}>
            {drag.dropHint?.parentOptionId == null && drag.draggingId ? (
              <DropIndicator key="empty-drop" edge="before" />
            ) : (
              <motion.span
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Пока пусто
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}

export function EntityListSettingsDialog({
  open,
  onOpenChange,
  entity,
  field,
}: EntityListSettingsDialogProps) {
  const { entities } = useEntityConfig();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [handleEpoch, setHandleEpoch] = useState(0);
  const allowDragRef = useRef(false);
  const isRoleCatalog = isUsersRoleListField(field);
  const listOptions = field.type === "list" ? field.listOptions : [];
  const listFixed = field.type === "list" ? field.listFixed : false;
  const listMultiple =
    field.type === "list" && listFixed ? field.listMultiple : false;
  const listAllowOther =
    field.type === "list" && !listMultiple && !isRoleCatalog
      ? field.listAllowOther
      : false;
  const listUseColors = field.type === "list" ? field.listUseColors : true;
  const listShowEmptyValue =
    field.type === "list" ? field.listShowEmptyValue !== false : true;
  const fieldLabel = field.name.trim() || "Список";
  const parentField = isRoleCatalog
    ? null
    : getEntityListParentField(entity, field);
  const dependsOnFieldId = parentField?.id ?? null;
  const dependencyCandidates = isRoleCatalog
    ? []
    : getEntityListDependencyCandidates(entity, field.id);
  const parentValues = getEntityListDependencyParentValues(
    parentField,
    entities,
  );
  const parentValueIds = new Set(parentValues.map((item) => item.id));
  const unassignedOptions = dependsOnFieldId
    ? listOptions.filter(
        (option) =>
          option.parentOptionId == null ||
          !parentValueIds.has(option.parentOptionId),
      )
    : listOptions;
  const parentRelationTargetId = parentField
    ? getEntityRelationTargetId(parentField)
    : null;
  const parentRelationTarget = parentRelationTargetId
    ? (entities.find((item) => item.id === parentRelationTargetId) ?? null)
    : null;

  function closeEditor() {
    setEditor({ mode: "closed" });
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

  function commitMove(
    optionId: string,
    parentOptionId: string | null,
    beforeOptionId: string | null,
  ) {
    if (isRoleCatalog) {
      const order = listOptions.map((option) => option.id);
      const from = order.indexOf(optionId);
      if (from < 0) return;
      order.splice(from, 1);
      let insertAt = order.length;
      if (beforeOptionId) {
        const before = order.indexOf(beforeOptionId);
        if (before >= 0) insertAt = before;
      }
      order.splice(insertAt, 0, optionId);
      reorderUsersRolesFromListOptions(order);
      return;
    }
    moveEntityListOption(
      entity.id,
      field.id,
      optionId,
      parentOptionId,
      beforeOptionId,
    );
  }

  function saveCreateOption(
    data: ListOptionEditorData,
    parentOptionId: string | null,
  ) {
    if (isRoleCatalog) {
      createUsersRoleFromListOption(data);
      closeEditor();
      return;
    }
    addEntityListOption(entity.id, field.id, {
      ...data,
      parentOptionId,
    });
    closeEditor();
  }

  function saveEditOption(optionId: string, data: ListOptionEditorData) {
    if (isRoleCatalog) {
      updateUsersRoleFromListOption(optionId, data);
      closeEditor();
      return;
    }
    updateEntityListOption(entity.id, field.id, optionId, data);
    closeEditor();
  }

  function deleteOption(optionId: string) {
    if (isRoleCatalog) {
      deleteUsersRoleFromListOption(optionId);
      return;
    }
    removeEntityListOption(entity.id, field.id, optionId);
  }

  const drag: OptionDragControllers = {
    draggingId,
    dropHint,
    handleEpoch,
    prepareDrag,
    onDragStart(event, optionId) {
      if (!allowDragRef.current) {
        event.preventDefault();
        return;
      }
      closeEditor();
      const payload: ListOptionDragPayload = { optionId };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(LIST_OPTION_MIME, JSON.stringify(payload));
      lockDragSelection();
      setDraggingId(optionId);
    },
    onDragEnd: clearDrag,
    onDragOverOption(event, parentOptionId, optionId, nextOptionId) {
      if (!hasListOptionMime(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const edge = getDropEdge(event);
      setDropHint({
        parentOptionId,
        beforeOptionId: edge === "before" ? optionId : nextOptionId,
      });
    },
    onDropOnOption(event, parentOptionId, optionId, nextOptionId) {
      event.preventDefault();
      event.stopPropagation();
      const payload = readListOptionPayload(event);
      if (!payload) {
        clearDrag();
        return;
      }
      const edge = getDropEdge(event);
      commitMove(
        payload.optionId,
        parentOptionId,
        edge === "before" ? optionId : nextOptionId,
      );
      clearDrag();
    },
    onDragOverGroup(event, parentOptionId) {
      if (!hasListOptionMime(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropHint({ parentOptionId, beforeOptionId: null });
    },
    onDropOnGroup(event, parentOptionId) {
      event.preventDefault();
      event.stopPropagation();
      const payload = readListOptionPayload(event);
      if (!payload) {
        clearDrag();
        return;
      }
      commitMove(payload.optionId, parentOptionId, null);
      clearDrag();
    },
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeEditor();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] w-fit min-w-[min(100%,24rem)] max-w-[min(92vw,48rem)] gap-3 overflow-x-hidden overflow-y-auto px-3 py-3 sm:max-w-[min(92vw,48rem)] sm:px-3 sm:py-3 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
        <DialogHeader className="gap-0.5 pr-7">
          <DialogTitle>Настройка списка</DialogTitle>
          <DialogDescription>
            {dependsOnFieldId && parentField
              ? `Варианты «${fieldLabel}» внутри значений «${getEntityFieldDisplayName(parentField)}».`
              : `Варианты поля «${fieldLabel}».`}
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/25 p-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h3 className="text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
              Параметры
            </h3>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
              <div className="min-w-0">
                <Label
                  htmlFor="list-use-colors"
                  className="text-sm font-medium"
                >
                  Использовать цвета
                </Label>
                <p className="text-xs text-muted-foreground">
                  Цветные метки у вариантов списка
                </p>
              </div>
              <Switch
                id="list-use-colors"
                checked={listUseColors}
                onCheckedChange={(checked) => {
                  updateEntityField(entity.id, field.id, {
                    listUseColors: checked,
                  });
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
                <div className="min-w-0">
                  <Label htmlFor="list-fixed" className="text-sm font-medium">
                    Фиксировать
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Без быстрого изменения через список
                  </p>
                </div>
                <Switch
                  id="list-fixed"
                  checked={listFixed}
                  onCheckedChange={(checked) => {
                    updateEntityField(entity.id, field.id, {
                      listFixed: checked,
                      listMultiple: checked ? listMultiple : false,
                    });
                  }}
                />
              </div>

              {listFixed ? (
                <SettingsNestedGroup>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
                    <div className="min-w-0">
                      <Label
                        htmlFor="list-multiple"
                        className="text-sm font-medium"
                      >
                        Множественный выбор
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Можно выбрать несколько вариантов
                      </p>
                    </div>
                    <Switch
                      id="list-multiple"
                      checked={listMultiple}
                      onCheckedChange={(checked) => {
                        updateEntityField(entity.id, field.id, {
                          listMultiple: checked,
                          ...(checked ? { listAllowOther: false } : {}),
                        });
                      }}
                    />
                  </div>
                </SettingsNestedGroup>
              ) : null}
            </div>

            {!isRoleCatalog ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2">
                  <div className="min-w-0">
                    <Label
                      htmlFor="list-depends-on"
                      className="text-sm font-medium"
                    >
                      Зависит от
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Варианты фильтруются по выбранному значению
                    </p>
                  </div>
                  <Switch
                    id="list-depends-on"
                    checked={dependsOnFieldId != null}
                    disabled={
                      dependsOnFieldId == null &&
                      dependencyCandidates.length === 0
                    }
                    onCheckedChange={(checked) => {
                      closeEditor();
                      if (!checked) {
                        updateEntityField(entity.id, field.id, {
                          listDependsOnFieldId: null,
                        });
                        return;
                      }
                      const nextId =
                        dependsOnFieldId ?? dependencyCandidates[0]?.id ?? null;
                      if (!nextId) return;
                      updateEntityField(entity.id, field.id, {
                        listDependsOnFieldId: nextId,
                      });
                    }}
                  />
                </div>

                {dependsOnFieldId != null ? (
                  <SettingsNestedGroup>
                    <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-2">
                      <Label
                        htmlFor="list-depends-on-field"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Родительское поле
                      </Label>
                      {dependencyCandidates.length === 0 && !parentField ? (
                        <p className="text-xs text-muted-foreground">
                          Нет доступных списков или связей
                        </p>
                      ) : (
                        <Select
                          value={dependsOnFieldId}
                          onValueChange={(next) => {
                            closeEditor();
                            if (next == null || next === NO_DEPENDENCY) return;
                            updateEntityField(entity.id, field.id, {
                              listDependsOnFieldId: String(next),
                            });
                          }}
                        >
                          <SelectTrigger
                            id="list-depends-on-field"
                            className="h-8 w-full"
                          >
                            <SelectValue>
                              {parentField
                                ? getEntityFieldDisplayName(parentField)
                                : "Выберите поле"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {parentField &&
                            !dependencyCandidates.some(
                              (item) => item.id === parentField.id,
                            ) ? (
                              <SelectItem value={parentField.id}>
                                {getEntityFieldDisplayName(parentField)}
                                {" · "}
                                {getEntityFieldTypeLabel(parentField.type)}
                              </SelectItem>
                            ) : null}
                            {dependencyCandidates.map((candidate) => (
                              <SelectItem
                                key={candidate.id}
                                value={candidate.id}
                              >
                                {getEntityFieldDisplayName(candidate)}
                                {" · "}
                                {getEntityFieldTypeLabel(candidate.type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </SettingsNestedGroup>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <LayoutGroup id="entity-list-options">
          <section
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-2.5",
              draggingId && "select-none",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h3 className="text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
                {isRoleCatalog ? "Роли" : "Варианты"}
              </h3>
              <span className="text-[11px] font-semibold tracking-wide text-foreground/45 tabular-nums">
                {listOptions.length}
              </span>
            </div>
            {isRoleCatalog ? (
              <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
                Сохраняются в каталог ролей (Настройки → Роли). Права
                настраиваются там же.
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              {dependsOnFieldId && parentField ? (
                <>
                  {parentValues.map((parentValue) => {
                    const sectionOptions = listOptions.filter(
                      (option) => option.parentOptionId === parentValue.id,
                    );
                    return (
                      <ParentOptionBranch
                        key={parentValue.id}
                        parentValue={parentValue}
                        showColors={listUseColors}
                        options={sectionOptions}
                        editor={editor}
                        drag={drag}
                        onCreate={() =>
                          setEditor({
                            mode: "create",
                            parentOptionId: parentValue.id,
                          })
                        }
                        onEdit={(option) => setEditor({ mode: "edit", option })}
                        onDelete={deleteOption}
                        onCancelEditor={closeEditor}
                        onSaveCreate={(data) =>
                          saveCreateOption(data, parentValue.id)
                        }
                        onSaveEdit={saveEditOption}
                      />
                    );
                  })}

                  {parentValues.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {parentField.type === "relation"
                        ? parentRelationTarget
                          ? `Сначала создайте записи в «${parentRelationTarget.namePlural || parentRelationTarget.name}».`
                          : `Укажите сущность для поля связи «${getEntityFieldDisplayName(parentField)}».`
                        : `Сначала добавьте варианты в поле «${getEntityFieldDisplayName(parentField)}».`}
                    </div>
                  ) : null}

                  <UnassignedOptionsSection
                    showColors={listUseColors}
                    options={unassignedOptions}
                    editor={editor}
                    drag={drag}
                    onEdit={(option) => setEditor({ mode: "edit", option })}
                    onDelete={deleteOption}
                    onCancelEditor={closeEditor}
                    onSaveEdit={saveEditOption}
                  />
                </>
              ) : (
                <>
                  {listOptions.length === 0 && editor.mode === "closed" ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {isRoleCatalog
                        ? "Пока нет ролей. Добавьте первую."
                        : "Пока нет вариантов. Добавьте первый."}
                    </div>
                  ) : (
                    <OptionGroupList
                      parentOptionId={null}
                      options={listOptions}
                      showColors={listUseColors}
                      editor={editor}
                      drag={drag}
                      onEdit={(option) => setEditor({ mode: "edit", option })}
                      onDelete={deleteOption}
                      onCancelEditor={closeEditor}
                      onSaveEdit={saveEditOption}
                      canDeleteOption={
                        isRoleCatalog
                          ? (optionId) => !isProtectedSystemRoleId(optionId)
                          : undefined
                      }
                    />
                  )}

                  {editor.mode === "create" ? (
                    <ListOptionEditor
                      showColors={listUseColors}
                      onCancel={closeEditor}
                      onSubmit={(data) => saveCreateOption(data, null)}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setEditor({ mode: "create", parentOptionId: null })
                      }
                    >
                      <Plus />
                      {isRoleCatalog ? "Добавить роль" : "Добавить вариант"}
                    </Button>
                  )}
                </>
              )}

              {listAllowOther ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">
                      Другое
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Свободный ввод при выборе
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    ввод
                  </span>
                </div>
              ) : null}

              {!isRoleCatalog ? (
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5",
                    listMultiple && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <Label
                      htmlFor="list-allow-other"
                      className="text-sm font-medium"
                    >
                      Включить поле «Другое»
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {listMultiple
                        ? "Недоступно при множественном выборе"
                        : "Появится вариант с полем для своего текста"}
                    </p>
                  </div>
                  <Switch
                    id="list-allow-other"
                    checked={listAllowOther}
                    disabled={listMultiple}
                    onCheckedChange={(checked) => {
                      updateEntityField(entity.id, field.id, {
                        listAllowOther: checked,
                      });
                    }}
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <Label
                    htmlFor="list-show-empty-value"
                    className="text-sm font-medium"
                  >
                    Без значения
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Колонка на доске для записей без выбранного варианта
                  </p>
                </div>
                <Switch
                  id="list-show-empty-value"
                  checked={listShowEmptyValue}
                  onCheckedChange={(checked) => {
                    updateEntityField(entity.id, field.id, {
                      listShowEmptyValue: checked,
                    });
                  }}
                />
              </div>
            </div>
          </section>
        </LayoutGroup>

        <DialogFooter className="gap-0 pt-0 sm:gap-0">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
