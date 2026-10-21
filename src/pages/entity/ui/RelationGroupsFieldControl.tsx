import { Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  getEntityDisplayName,
  getRelationRecordOptions,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  RelationSelect,
  serializeEntityRelationGroups,
  serializeEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityRelationGroupItem,
  type EntityRelationGroupsMode,
  type EntityValueContext,
} from "@/entities/entity";

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

function itemLabelFor(
  itemEntity: Entity,
  itemId: string,
  ctx: EntityValueContext,
) {
  return (
    getRelationRecordOptions(itemEntity, ctx.entities).find(
      (option) => option.id === itemId,
    )?.label ?? "Удалённая запись"
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

  const itemOptions = getRelationRecordOptions(itemEntity, ctx.entities).filter(
    (option) => !usedItemIds.has(option.id),
  );
  const allNestedOptions = getRelationRecordOptions(
    nestedEntity,
    ctx.entities,
  );

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
    commit([...groups, { itemId: nextId, nestedIds: [] }]);
  }

  function removeItem(itemId: string) {
    commit(groups.filter((group) => group.itemId !== itemId));
  }

  if (!config?.itemEntityId || !config.nestedEntityId) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
        Настройте сущности строк и вложенных в поле
      </p>
    );
  }

  if (!itemEntity || !nestedEntity) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
        Сущность не найдена
      </p>
    );
  }

  if (mode === "items") {
    return (
      <div className="flex flex-col gap-2">
        {groups.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {groups.map((group) => {
              const label = itemLabelFor(itemEntity, group.itemId, ctx);
              const nestedCount = group.nestedIds.length;
              return (
                <li
                  key={group.itemId}
                  className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-card px-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {label}
                  </span>
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
                    aria-label={`Убрать «${label}»`}
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
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          const label = itemLabelFor(itemEntity, group.itemId, ctx);
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
            <div
              key={group.itemId}
              className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2.5"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 px-0.5">
                <span className="truncate text-sm font-medium">{label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
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
                aria-label={`${nestedLabel} для «${label}»`}
                onChange={(next) => updateNested(group.itemId, next)}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // full
  return (
    <div className="flex flex-col gap-2">
      {groups.length > 0 ? (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const label = itemLabelFor(itemEntity, group.itemId, ctx);
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
              <div
                key={group.itemId}
                className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={label}
                  >
                    {label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Убрать «${label}»`}
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
                  aria-label={`${nestedLabel} для «${label}»`}
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
