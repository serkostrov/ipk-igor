import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, EyeOff, Search, Shield } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  isEntityInternal,
  isSystemEntity,
  type Entity,
} from "@/entities/entity";
import {
  getMenuEntityTree,
  type MenuEntry,
  type MenuEntityTreeNode,
} from "@/entities/menu";

type PickerNode =
  | { type: "entity"; entity: Entity }
  | {
      type: "group";
      id: string;
      title: string;
      children: PickerNode[];
    };

type EntityMenuSelectProps = {
  entities: Entity[];
  menuEntries: MenuEntry[];
  value: string | undefined;
  onValueChange: (entityId: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function entityStatusIcons(entity: Entity): ReactNode {
  const internal = isEntityInternal(entity);
  const system = isSystemEntity(entity);
  if (!internal && !system) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
      {internal ? (
        <span title="Служебная сущность — без раздела в меню">
          <EyeOff className="size-3.5" aria-label="Служебная сущность" />
        </span>
      ) : null}
      {system ? (
        <span title="Системная сущность — нельзя удалить">
          <Shield className="size-3.5" aria-label="Системная сущность" />
        </span>
      ) : null}
    </span>
  );
}

function resolveMenuTree(
  nodes: MenuEntityTreeNode[],
  byId: Map<string, Entity>,
  seen: Set<string>,
): PickerNode[] {
  const result: PickerNode[] = [];
  for (const node of nodes) {
    if (node.type === "entity") {
      const entity = byId.get(node.entityId);
      if (!entity || seen.has(entity.id)) continue;
      seen.add(entity.id);
      result.push({ type: "entity", entity });
      continue;
    }
    const children = resolveMenuTree(node.children, byId, seen);
    if (children.length === 0) continue;
    result.push({
      type: "group",
      id: node.id,
      title: node.title,
      children,
    });
  }
  return result;
}

function buildPickerTree(
  entities: Entity[],
  menuEntries: MenuEntry[],
): PickerNode[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const seen = new Set<string>();
  const tree = resolveMenuTree(getMenuEntityTree(menuEntries), byId, seen);
  const leftovers = entities.filter((entity) => !seen.has(entity.id));
  if (leftovers.length > 0) {
    tree.push({
      type: "group",
      id: "outside-menu",
      title: "Вне меню",
      children: leftovers.map((entity) => ({ type: "entity", entity })),
    });
  }
  return tree;
}

function filterPickerTree(nodes: PickerNode[], needle: string): PickerNode[] {
  if (!needle) return nodes;
  const result: PickerNode[] = [];
  for (const node of nodes) {
    if (node.type === "entity") {
      const name = node.entity.name.trim().toLowerCase();
      const plural = node.entity.namePlural.trim().toLowerCase();
      if (name.includes(needle) || plural.includes(needle)) {
        result.push(node);
      }
      continue;
    }
    const children = filterPickerTree(node.children, needle);
    const titleMatch = node.title.toLowerCase().includes(needle);
    if (children.length === 0 && !titleMatch) continue;
    result.push({
      ...node,
      children: children.length > 0 ? children : node.children,
    });
  }
  return result;
}

/** Row height for elbow alignment (must match EntityButton / group header). */
const TREE_ROW_H = 32;
const TREE_ELBOW_TOP = TREE_ROW_H / 2;

/**
 * Tree branch for one child. Elbow is pinned to the first row center,
 * so nested groups (taller than one row) still connect correctly.
 */
function TreeChild({
  isLast,
  children,
}: {
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative ml-3">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 w-px bg-border",
          isLast ? "top-0" : "-top-px bottom-0",
        )}
        style={isLast ? { height: TREE_ELBOW_TOP } : undefined}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 h-px w-2.5 bg-border"
        style={{ top: TREE_ELBOW_TOP }}
      />
      <div className="min-w-0 pl-3">{children}</div>
    </div>
  );
}

function EntityButton({
  entity,
  selected,
  onSelect,
}: {
  entity: Entity;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = entity.name.trim() || "Без названия";
  const status = entityStatusIcons(entity);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-entity-picker-item={entity.id}
      title={label}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-muted/70",
      )}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {status}
      {selected ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}

function GroupBlock({
  node,
  selectedId,
  forceExpanded,
  onSelect,
}: {
  node: Extract<PickerNode, { type: "group" }>;
  selectedId: string | undefined;
  forceExpanded: boolean;
  onSelect: (entityId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const expanded = forceExpanded || open;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        title={`Группа: ${node.title}`}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 opacity-60 transition-transform duration-150",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="flex flex-col">
          {node.children.map((child, index) => (
            <TreeChild
              key={child.type === "entity" ? child.entity.id : child.id}
              isLast={index === node.children.length - 1}
            >
              {child.type === "entity" ? (
                <EntityButton
                  entity={child.entity}
                  selected={child.entity.id === selectedId}
                  onSelect={() => onSelect(child.entity.id)}
                />
              ) : (
                <GroupBlock
                  node={child}
                  selectedId={selectedId}
                  forceExpanded={forceExpanded}
                  onSelect={onSelect}
                />
              )}
            </TreeChild>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PickerTree({
  nodes,
  selectedId,
  forceExpanded,
  onSelect,
}: {
  nodes: PickerNode[];
  selectedId: string | undefined;
  forceExpanded: boolean;
  onSelect: (entityId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5" role="listbox">
      {nodes.map((node) =>
        node.type === "entity" ? (
          <EntityButton
            key={node.entity.id}
            entity={node.entity}
            selected={node.entity.id === selectedId}
            onSelect={() => onSelect(node.entity.id)}
          />
        ) : (
          <GroupBlock
            key={node.id}
            node={node}
            selectedId={selectedId}
            forceExpanded={forceExpanded}
            onSelect={onSelect}
          />
        ),
      )}
    </div>
  );
}

export function EntityMenuSelect({
  entities,
  menuEntries,
  value,
  onValueChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Выбор сущности",
}: EntityMenuSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(
    () => buildPickerTree(entities, menuEntries),
    [entities, menuEntries],
  );

  const needle = query.trim().toLowerCase();
  const filteredTree = useMemo(
    () => filterPickerTree(tree, needle),
    [tree, needle],
  );

  const selected = entities.find((entity) => entity.id === value) ?? null;
  const selectedLabel = selected
    ? selected.name.trim() || "Без названия"
    : entities.length === 0
      ? "Нет сущностей"
      : "Выберите сущность";

  const isDisabled = disabled || entities.length === 0;

  useEffect(() => {
    if (!open || !value) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const item = listRef.current?.querySelector(
          `[data-entity-picker-item="${CSS.escape(value)}"]`,
        );
        item?.scrollIntoView({ block: "center", inline: "nearest" });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open, value, filteredTree]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (isDisabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={isDisabled}
        aria-label={ariaLabel}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-9 w-64 min-w-56 items-center justify-between gap-2 overflow-hidden border-input bg-background px-2.5 py-0 text-sm font-normal shadow-xs hover:bg-background",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(100vw-2rem,26rem)] gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border/70 p-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              placeholder="Поиск…"
              className="h-9 pl-8"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div
          ref={listRef}
          className="max-h-[min(70vh,28rem)] overflow-y-auto p-2"
        >
          {filteredTree.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </p>
          ) : (
            <PickerTree
              nodes={filteredTree}
              selectedId={value}
              forceExpanded={needle.length > 0}
              onSelect={(entityId) => {
                onValueChange(entityId);
                setOpen(false);
                setQuery("");
              }}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
