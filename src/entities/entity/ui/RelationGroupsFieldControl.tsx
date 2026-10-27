import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import {
  getRelationGroupsLevelEntityId,
  parseEntityListValueIds,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  pruneEntityRelationGroupsNodes,
  resolveRelationGroupsModeDepth,
  serializeEntityListValueIds,
  serializeEntityRelationGroups,
  serializeEntityRelationIds,
  updateRelationGroupsNodeChildren,
  type EntityRelationGroupNode,
  type EntityRelationGroupsMode,
} from "../model/field";
import {
  formatRecordFieldValue,
  type EntityValueContext,
} from "../model/field-value";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationRecordOptions,
  isEntityNameField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRelationGroupsLevel,
  type RelationRecordOption,
} from "../model/types";
import { ListSelect } from "./ListSelect";
import { RelationSelect } from "./RelationSelect";

type RelationGroupsFieldControlProps = {
  id: string;
  ctx: EntityValueContext;
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
  mode?: EntityRelationGroupsMode;
};

function formatRecordExtras(
  ctx: EntityValueContext,
  entity: Entity,
  recordId: string,
  fieldIds: readonly string[],
): string {
  if (fieldIds.length === 0) return "";
  const record = entity.records.find((item) => item.id === recordId);
  if (!record) return "";
  const parts: string[] = [];
  for (const fieldId of fieldIds) {
    const extraField = entity.fields.find((item) => item.id === fieldId);
    if (!extraField) continue;
    const text = formatRecordFieldValue(ctx, entity, record, extraField);
    if (!text || text === "—") continue;
    parts.push(text);
  }
  return parts.join(" · ");
}

/** True when the catalog record exists and has a real title (not a ghost). */
function isSelectableRecord(entity: Entity | null | undefined, id: string) {
  if (!entity || !id.trim()) return false;
  const record = entity.records.find((item) => item.id === id);
  if (!record) return false;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return true;
  const name = (record.values[nameField.id] ?? "").trim();
  if (name) return true;
  // Empty name + empty template display → ghost «Без названия».
  const label = resolveRelationRecordLabel(entity, id)?.trim() ?? "";
  return Boolean(label && label !== "Без названия" && label !== id);
}

function isSelectableListOption(
  field: EntityField | null | undefined,
  id: string,
) {
  if (!field || field.type !== "list" || !id.trim()) return false;
  const option = field.listOptions.find((item) => item.id === id);
  if (!option) return false;
  return Boolean(option.name.trim());
}

function recordTitle(
  entity: Entity,
  recordId: string,
  ctx: EntityValueContext,
) {
  const record = entity.records.find((item) => item.id === recordId);
  if (!record) return "Удалённая запись";
  return (
    resolveRelationRecordLabel(entity, recordId, ctx.entities) ??
    "Без названия"
  );
}

function enrichOptions(
  ctx: EntityValueContext,
  entity: Entity,
  base: RelationRecordOption[],
  fieldIds: readonly string[],
): RelationRecordOption[] {
  if (fieldIds.length === 0) return base;
  return base.map((option) => ({
    ...option,
    label: (() => {
      const extras = formatRecordExtras(ctx, entity, option.id, fieldIds);
      return extras ? `${option.label} · ${extras}` : option.label;
    })(),
  }));
}

function ItemMeta({ title, extras }: { title: string; extras: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium leading-snug" title={title}>
        {title}
      </p>
      {extras ? (
        <p
          className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground"
          title={extras}
        >
          {extras}
        </p>
      ) : null}
    </div>
  );
}

function LevelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium leading-none text-muted-foreground">
      {children}
    </p>
  );
}

function NodesGrid({
  layout,
  children,
}: {
  layout: "row" | "column";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        layout === "row"
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
          : "flex flex-col gap-2",
      )}
    >
      {children}
    </div>
  );
}

function allowedIdsFromParent(
  parentEntity: Entity | null,
  parentId: string,
  level: EntityRelationGroupsLevel,
): Set<string> | null {
  if (level.source.kind === "entity") {
    if (!level.source.limitFieldId || !parentEntity) return null;
    const record = parentEntity.records.find((item) => item.id === parentId);
    if (!record) return new Set();
    return new Set(
      parseEntityRelationIds(record.values[level.source.limitFieldId]),
    );
  }
  if (level.source.kind !== "field" || !level.source.fieldId || !parentEntity) {
    return new Set();
  }
  const fieldId = level.source.fieldId;
  const record = parentEntity.records.find((item) => item.id === parentId);
  if (!record) return new Set();
  const sourceField = parentEntity.fields.find((item) => item.id === fieldId);
  if (!sourceField) return new Set();
  if (sourceField.type === "list") {
    return new Set(parseEntityListValueIds(record.values[sourceField.id]));
  }
  return new Set(parseEntityRelationIds(record.values[sourceField.id]));
}

function seedChildren(
  defaults: readonly string[],
  deeperDefaults: readonly (readonly string[])[],
): EntityRelationGroupNode[] {
  if (defaults.length === 0) return [];
  return defaults.map((id) => ({
    id,
    children: seedChildren(deeperDefaults[0] ?? [], deeperDefaults.slice(1)),
  }));
}

function findNode(
  nodes: readonly EntityRelationGroupNode[],
  path: readonly string[],
): EntityRelationGroupNode | null {
  if (path.length === 0) return null;
  const [head, ...rest] = path;
  const node = nodes.find((item) => item.id === head);
  if (!node) return null;
  if (rest.length === 0) return node;
  return findNode(node.children, rest);
}

export function RelationGroupsFieldControl({
  id,
  ctx,
  field,
  value,
  onChange,
  mode = "full",
}: RelationGroupsFieldControlProps) {
  const config = field.relationGroups;
  const levels = config?.levels ?? [];
  const modeDepth = resolveRelationGroupsModeDepth(mode);
  const editableThrough =
    modeDepth == null
      ? levels.length - 1
      : Math.min(modeDepth, levels.length - 1);

  function resolveFieldTarget(entityId: string, fieldId: string) {
    const entity = ctx.entityById.get(entityId);
    const source = entity?.fields.find((item) => item.id === fieldId);
    return source ? getEntityRelationTargetId(source) : null;
  }

  function levelEntityAt(index: number): Entity | null {
    let previous: string | null = null;
    for (let i = 0; i <= index; i += 1) {
      const level = levels[i];
      if (!level) return null;
      const entityId = getRelationGroupsLevelEntityId(
        level,
        previous,
        resolveFieldTarget,
      );
      if (!entityId) return null;
      if (i === index) return ctx.entityById.get(entityId) ?? null;
      previous = entityId;
    }
    return null;
  }

  function isValidGroupId(itemId: string, depth: number): boolean {
    const level = levels[depth];
    if (!level) return false;
    if (depth > 0) {
      const parentEntity = levelEntityAt(depth - 1);
      const sourceFieldId =
        level.source.kind === "field" ? level.source.fieldId : null;
      const sourceField =
        sourceFieldId && parentEntity
          ? (parentEntity.fields.find((item) => item.id === sourceFieldId) ??
            null)
          : null;
      if (sourceField?.type === "list") {
        return isSelectableListOption(sourceField, itemId);
      }
    }
    return isSelectableRecord(levelEntityAt(depth), itemId);
  }

  const parsedGroups = parseEntityRelationGroups(value);
  const groups = pruneEntityRelationGroupsNodes(parsedGroups, isValidGroupId);
  const prunedValue = serializeEntityRelationGroups(groups);
  const lastPrunedRef = useRef<string | null>(null);

  // Drop ghost / deleted ids that show up as «Без названия» without being picked.
  useEffect(() => {
    if (prunedValue === value) return;
    if (lastPrunedRef.current === prunedValue) return;
    lastPrunedRef.current = prunedValue;
    onChange(prunedValue);
  }, [onChange, prunedValue, value]);

  function commit(next: EntityRelationGroupNode[]) {
    onChange(
      serializeEntityRelationGroups(
        pruneEntityRelationGroupsNodes(next, isValidGroupId),
      ),
    );
  }

  function setRootIds(nextIds: string[]) {
    const byId = new Map(groups.map((node) => [node.id, node]));
    const defaultsFrom = levels.slice(1).map((level) => level.defaultIds);
    commit(
      nextIds.map((itemId) => {
        const existing = byId.get(itemId);
        if (existing) return existing;
        return {
          id: itemId,
          children: seedChildren(defaultsFrom[0] ?? [], defaultsFrom.slice(1)),
        };
      }),
    );
  }

  function setNodeChildren(path: string[], childIds: string[]) {
    const childLevelIndex = path.length;
    const defaultsFrom = levels
      .slice(childLevelIndex + 1)
      .map((level) => level.defaultIds);
    const existingBranch = findNode(groups, path);
    const byId = new Map(
      (existingBranch?.children ?? []).map((node) => [node.id, node]),
    );
    const nextChildren = childIds.map((childId) => {
      const existing = byId.get(childId);
      if (existing) return existing;
      return {
        id: childId,
        children: seedChildren(defaultsFrom[0] ?? [], defaultsFrom.slice(1)),
      };
    });
    commit(updateRelationGroupsNodeChildren(groups, path, nextChildren));
  }

  const rootEntity = levelEntityAt(0);
  const rootLevel = levels[0];

  if (!config || levels.length < 2 || !rootEntity || !rootLevel) {
    return (
      <p className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-muted-foreground">
        Настройте уровни поля «Наборы связей»
      </p>
    );
  }

  const rootOptions = enrichOptions(
    ctx,
    rootEntity,
    getRelationRecordOptions(rootEntity, ctx.entities).filter((option) =>
      isSelectableRecord(rootEntity, option.id),
    ),
    rootLevel.displayFieldIds,
  );
  const canEditRoot = editableThrough >= 0;
  const showDeeper = editableThrough >= 1;
  const rootLayout = rootLevel.layout === "row" ? "row" : "column";
  const rootEntityLabel = getEntityDisplayName(rootEntity);
  const rootSelectedIds = groups.map((node) => node.id);

  function renderLevel(
    node: EntityRelationGroupNode,
    path: string[],
    depth: number,
  ): React.ReactNode {
    if (depth > editableThrough) return null;
    const level = levels[depth];
    if (!level) return null;

    const parentEntity = levelEntityAt(depth - 1);
    const parentId = path[path.length - 1] ?? "";
    const parentSourceFieldId =
      level.source.kind === "field" ? level.source.fieldId : null;
    const parentSourceField =
      parentSourceFieldId && parentEntity
        ? parentEntity.fields.find((item) => item.id === parentSourceFieldId)
        : null;
    const isListSource = parentSourceField?.type === "list";
    const entity = levelEntityAt(depth);
    if (!isListSource && !entity) return null;

    const allowed = allowedIdsFromParent(parentEntity, parentId, level);
    const selectedIds = node.children.map((child) => child.id);
    const options =
      entity != null
        ? enrichOptions(
            ctx,
            entity,
            getRelationRecordOptions(entity, ctx.entities).filter(
              (option) =>
                isSelectableRecord(entity, option.id) &&
                (allowed ? allowed.has(option.id) : true),
            ),
            level.displayFieldIds,
          )
        : [];

    const label = isListSource
      ? getEntityFieldDisplayName(parentSourceField)
      : entity
        ? getEntityDisplayName(entity)
        : "Уровень";

    // Inside root row-columns, nested cards must stack — side-by-side is unreadable.
    const childLayout =
      rootLayout === "row"
        ? "column"
        : level.layout === "row"
          ? "row"
          : "column";

    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <LevelLabel>{label}</LevelLabel>
          {isListSource && parentSourceField ? (
            <ListSelect
              value={serializeEntityListValueIds(selectedIds)}
              options={
                allowed
                  ? parentSourceField.listOptions.filter((option) =>
                      allowed.has(option.id),
                    )
                  : parentSourceField.listOptions
              }
              multiple
              size="sm"
              showColors={parentSourceField.listUseColors}
              emptyLabel="Выберите…"
              className="min-h-8 w-full rounded-md border-input font-normal"
              onChange={(next) => {
                const ids = parseEntityListValueIds(next).filter((itemId) =>
                  allowed ? allowed.has(itemId) : true,
                );
                setNodeChildren(path, ids);
              }}
            />
          ) : (
            <RelationSelect
              id={`${id}-${path.join("-")}-d${depth}`}
              value={serializeEntityRelationIds(selectedIds)}
              options={options}
              multiple
              placeholder="Выберите…"
              className="h-8 min-h-8 bg-background hover:bg-background aria-expanded:bg-background"
              onChange={(next) => {
                const ids = parseEntityRelationIds(next).filter((itemId) =>
                  allowed ? allowed.has(itemId) : true,
                );
                setNodeChildren(path, ids);
              }}
            />
          )}
        </div>

        {depth < editableThrough && node.children.length > 0 ? (
          <NodesGrid layout={childLayout}>
            {node.children.map((child) => {
              const title = isListSource
                ? (parentSourceField.listOptions.find(
                    (option) => option.id === child.id,
                  )?.name ?? child.id)
                : entity
                  ? recordTitle(entity, child.id, ctx)
                  : child.id;
              const extras =
                !isListSource && entity
                  ? formatRecordExtras(
                      ctx,
                      entity,
                      child.id,
                      level.displayFieldIds,
                    )
                  : "";
              return (
                <div
                  key={child.id}
                  className="flex min-w-0 flex-col gap-2 rounded-md border border-border/60 bg-background/80 p-2.5"
                >
                  <ItemMeta title={title} extras={extras} />
                  {renderLevel(child, [...path, child.id], depth + 1)}
                </div>
              );
            })}
          </NodesGrid>
        ) : null}
      </div>
    );
  }

  // «Только строки»: one compact multi-select (chips), no empty cards.
  if (!showDeeper) {
    if (!canEditRoot) {
      return groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока ничего не выбрано</p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {groups.map((node) => {
            const title = recordTitle(rootEntity, node.id, ctx);
            return (
              <span
                key={node.id}
                className="inline-flex h-6 max-w-full items-center rounded-md bg-primary/10 px-2 text-xs font-medium text-primary"
              >
                <span className="truncate">{title}</span>
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <RelationSelect
        id={id}
        value={serializeEntityRelationIds(rootSelectedIds)}
        options={rootOptions}
        multiple
        placeholder={`Выберите «${rootEntityLabel}»`}
        className="h-9 min-h-9 w-full bg-background hover:bg-background aria-expanded:bg-background"
        onChange={(next) => {
          setRootIds(parseEntityRelationIds(next));
        }}
      />
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      {canEditRoot ? (
        <RelationSelect
          id={id}
          value={serializeEntityRelationIds(rootSelectedIds)}
          options={rootOptions}
          multiple
          placeholder={`Выберите «${rootEntityLabel}»`}
          className="h-9 min-h-9 w-full bg-background hover:bg-background aria-expanded:bg-background"
          onChange={(next) => {
            setRootIds(parseEntityRelationIds(next));
          }}
        />
      ) : null}

      {groups.length > 0 ? (
        <div
          className={cn(
            rootLayout === "row"
              ? "grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))]"
              : "flex flex-col gap-2",
          )}
        >
          {groups.map((node) => {
            const title = recordTitle(rootEntity, node.id, ctx);
            const extras = formatRecordExtras(
              ctx,
              rootEntity,
              node.id,
              rootLevel.displayFieldIds,
            );
            return (
              <section
                key={node.id}
                className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 p-2.5"
              >
                <header className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-6 max-w-full min-w-0 items-center rounded-md bg-primary/10 px-2 text-xs font-medium text-primary">
                    <span className="truncate">{title}</span>
                  </span>
                  {extras ? (
                    <span
                      className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
                      title={extras}
                    >
                      {extras}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1" />
                  )}
                  {canEditRoot ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Убрать «${title}»`}
                      onClick={() =>
                        setRootIds(
                          groups
                            .filter((item) => item.id !== node.id)
                            .map((item) => item.id),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </header>
                {renderLevel(node, [node.id], 1)}
              </section>
            );
          })}
        </div>
      ) : canEditRoot ? (
        <p className="text-xs text-muted-foreground">
          Выберите строки выше — для каждой откроются вложенные поля
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Пока ничего не выбрано</p>
      )}
    </div>
  );
}
