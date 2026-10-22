import { Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import {
  parseEntityRelationGroups,
  parseEntityRelationIds,
  serializeEntityRelationGroups,
  serializeEntityRelationIds,
  type EntityRelationGroupItem,
  type EntityRelationGroupsMode,
} from "../model/field";
import {
  formatRecordFieldValue,
  type EntityValueContext,
} from "../model/field-value";
import {
  getEntityDisplayName,
  getRelationRecordOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type RelationRecordOption,
} from "../model/types";
import { RelationSelect } from "./RelationSelect";

type RelationGroupsFieldControlProps = {
  id: string;
  ctx: EntityValueContext;
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
  /**
   * Ask / form presentation:
   * - full — rows + nested
   * - items — only add/remove rows (keeps existing nested)
   * - nested — only nested multi-select for existing rows
   */
  mode?: EntityRelationGroupsMode;
};

function allowedNestedIds(
  itemEntity: Entity | null,
  itemId: string,
  sourceFieldId: string | null,
): Set<string> | null {
  if (!itemEntity || !sourceFieldId) return null;
  const item = itemEntity.records.find((record) => record.id === itemId);
  if (!item) return new Set();
  return new Set(parseEntityRelationIds(item.values[sourceFieldId]));
}

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

function recordTitle(
  entity: Entity,
  recordId: string,
  ctx: EntityValueContext,
) {
  return (
    resolveRelationRecordLabel(entity, recordId, ctx.entities) ??
    "Удалённая запись"
  );
}

function withExtraLabel(title: string, extras: string): string {
  return extras ? `${title} · ${extras}` : title;
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
    label: withExtraLabel(
      option.label,
      formatRecordExtras(ctx, entity, option.id, fieldIds),
    ),
  }));
}

function ItemMeta({
  title,
  extras,
  className,
}: {
  title: string;
  extras: string;
  className?: string;
}) {
  return (
    <span className={cn("min-w-0 flex-1", className)}>
      <span className="block truncate text-sm font-medium" title={title}>
        {title}
      </span>
      {extras ? (
        <span
          className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground"
          title={extras}
        >
          {extras}
        </span>
      ) : null}
    </span>
  );
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
  const itemEntity = ctx.entityById.get(config?.itemEntityId ?? "") ?? null;
  const nestedEntity = ctx.entityById.get(config?.nestedEntityId ?? "") ?? null;
  const groups = parseEntityRelationGroups(value);
  const usedItemIds = new Set(groups.map((group) => group.itemId));
  const layout = config?.layout === "row" ? "row" : "column";
  const itemDisplayFieldIds = config?.itemDisplayFieldIds ?? [];
  const nestedDisplayFieldIds = config?.nestedDisplayFieldIds ?? [];

  const itemLabel = itemEntity ? getEntityDisplayName(itemEntity) : "Запись";
  const nestedLabel = nestedEntity
    ? getEntityDisplayName(nestedEntity)
    : "Вложенные";

  function commit(next: EntityRelationGroupItem[]) {
    onChange(serializeEntityRelationGroups(next));
  }

  function updateNested(itemId: string, nestedValue: string) {
    const nestedIds = parseEntityRelationIds(nestedValue);
    const allowed = allowedNestedIds(
      itemEntity,
      itemId,
      config?.nestedSourceFieldId ?? null,
    );
    const kept = allowed
      ? nestedIds.filter((nestedId) => allowed.has(nestedId))
      : nestedIds;
    commit(
      groups.map((group) =>
        group.itemId === itemId ? { ...group, nestedIds: kept } : group,
      ),
    );
  }

  function addItem(nextId: string) {
    if (!nextId || usedItemIds.has(nextId)) return;
    const defaults = config?.defaultNestedIds ?? [];
    const allowed = allowedNestedIds(
      itemEntity,
      nextId,
      config?.nestedSourceFieldId ?? null,
    );
    const nestedIds = allowed
      ? defaults.filter((nestedId) => allowed.has(nestedId))
      : [...defaults];
    commit([...groups, { itemId: nextId, nestedIds }]);
  }

  function removeItem(itemId: string) {
    commit(groups.filter((group) => group.itemId !== itemId));
  }

  if (!config?.itemEntityId || !config.nestedEntityId) {
    return (
      <p className="flex h-9 items-center rounded-md border border-dashed border-border px-2.5 text-sm text-muted-foreground">
        Настройте сущности строк и вложенных в поле
      </p>
    );
  }

  if (!itemEntity || !nestedEntity) {
    return (
      <p className="flex h-9 items-center rounded-md border border-dashed border-border px-2.5 text-sm text-muted-foreground">
        Сущность не найдена
      </p>
    );
  }

  const itemOptions = enrichOptions(
    ctx,
    itemEntity,
    getRelationRecordOptions(itemEntity, ctx.entities).filter(
      (option) => !usedItemIds.has(option.id),
    ),
    itemDisplayFieldIds,
  );
  const allNestedOptions = enrichOptions(
    ctx,
    nestedEntity,
    getRelationRecordOptions(nestedEntity, ctx.entities),
    nestedDisplayFieldIds,
  );

  const groupsClassName =
    layout === "row" ? "flex flex-row flex-wrap gap-2" : "flex flex-col gap-2";
  const cardClassName = cn(
    "flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2.5",
    layout === "row" && "min-w-[15rem] flex-1 basis-[min(100%,17rem)]",
  );

  if (mode === "items") {
    return (
      <div className="flex flex-col gap-2">
        {groups.length > 0 ? (
          <ul className={groupsClassName}>
            {groups.map((group) => {
              const title = recordTitle(itemEntity, group.itemId, ctx);
              const extras = formatRecordExtras(
                ctx,
                itemEntity,
                group.itemId,
                itemDisplayFieldIds,
              );
              const nestedCount = group.nestedIds.length;
              return (
                <li
                  key={group.itemId}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border/70 bg-card px-2.5",
                    layout === "row"
                      ? "min-h-9 min-w-[12rem] flex-1 basis-[min(100%,14rem)] py-1.5"
                      : "h-9",
                  )}
                >
                  <ItemMeta title={title} extras={extras} />
                  {nestedCount > 0 ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {nestedCount} выбр.
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Убрать «${title}»`}
                    onClick={() => removeItem(group.itemId)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            Добавьте {itemLabel.toLowerCase()}
          </p>
        )}
        <RelationSelect
          id={id}
          options={itemOptions}
          value=""
          placeholder={`Добавить: ${itemLabel.toLowerCase()}`}
          onChange={(next) => {
            const [nextId] = parseEntityRelationIds(next);
            if (nextId) addItem(nextId);
          }}
        />
      </div>
    );
  }

  if (mode === "nested") {
    if (groups.length === 0) {
      return (
        <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
          Сначала выберите {itemLabel.toLowerCase()} на предыдущем шаге
        </p>
      );
    }

    return (
      <div className={groupsClassName}>
        {groups.map((group) => {
          const title = recordTitle(itemEntity, group.itemId, ctx);
          const extras = formatRecordExtras(
            ctx,
            itemEntity,
            group.itemId,
            itemDisplayFieldIds,
          );
          const allowed = allowedNestedIds(
            itemEntity,
            group.itemId,
            config.nestedSourceFieldId,
          );
          const nestedOptions = allowed
            ? allNestedOptions.filter((option) => allowed.has(option.id))
            : allNestedOptions;
          const sourceMissing =
            config.nestedSourceFieldId != null && (allowed?.size ?? 0) === 0;

          return (
            <div key={group.itemId} className={cardClassName}>
              <div className="flex min-w-0 items-start justify-between gap-2 px-0.5">
                <ItemMeta title={title} extras={extras} />
                <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                  {nestedLabel}
                </span>
              </div>
              <RelationSelect
                options={nestedOptions}
                value={serializeEntityRelationIds(group.nestedIds)}
                multiple
                disabled={sourceMissing}
                placeholder={
                  sourceMissing
                    ? "Нет доступных записей"
                    : `Выберите ${nestedLabel.toLowerCase()}`
                }
                aria-label={`${nestedLabel} для «${title}»`}
                onChange={(next) => updateNested(group.itemId, next)}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.length > 0 ? (
        <div className={groupsClassName}>
          {groups.map((group) => {
            const title = recordTitle(itemEntity, group.itemId, ctx);
            const extras = formatRecordExtras(
              ctx,
              itemEntity,
              group.itemId,
              itemDisplayFieldIds,
            );
            const allowed = allowedNestedIds(
              itemEntity,
              group.itemId,
              config.nestedSourceFieldId,
            );
            const nestedOptions = allowed
              ? allNestedOptions.filter((option) => allowed.has(option.id))
              : allNestedOptions;
            const sourceMissing =
              config.nestedSourceFieldId != null && (allowed?.size ?? 0) === 0;

            return (
              <div key={group.itemId} className={cardClassName}>
                <div className="flex items-start gap-2">
                  <ItemMeta title={title} extras={extras} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Убрать «${title}»`}
                    onClick={() => removeItem(group.itemId)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <RelationSelect
                  options={nestedOptions}
                  value={serializeEntityRelationIds(group.nestedIds)}
                  multiple
                  disabled={sourceMissing}
                  placeholder={
                    sourceMissing
                      ? "Нет доступных записей"
                      : `Выберите ${nestedLabel.toLowerCase()}`
                  }
                  aria-label={`${nestedLabel} для «${title}»`}
                  onChange={(next) => updateNested(group.itemId, next)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      <RelationSelect
        id={id}
        options={itemOptions}
        value=""
        placeholder={`Добавить: ${itemLabel.toLowerCase()}`}
        onChange={(next) => {
          const [nextId] = parseEntityRelationIds(next);
          if (nextId) addItem(nextId);
        }}
      />
      {groups.length === 0 ? (
        <p className="-mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Plus className="size-3 shrink-0 opacity-70" aria-hidden />
          Для каждой строки можно выбрать {nestedLabel.toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
