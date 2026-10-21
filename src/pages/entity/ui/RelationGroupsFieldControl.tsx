import { X } from "lucide-react";
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
  type EntityValueContext,
} from "@/entities/entity";

type RelationGroupsFieldControlProps = {
  id: string;
  ctx: EntityValueContext;
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
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

export function RelationGroupsFieldControl({
  id,
  ctx,
  field,
  value,
  onChange,
}: RelationGroupsFieldControlProps) {
  const config = field.relationGroups;
  const itemEntity = ctx.entityById.get(config?.itemEntityId ?? "") ?? null;
  const nestedEntity = ctx.entityById.get(config?.nestedEntityId ?? "") ?? null;
  const groups = parseEntityRelationGroups(value);
  const usedItemIds = new Set(groups.map((group) => group.itemId));

  const itemOptions = getRelationRecordOptions(itemEntity, ctx.entities).filter(
    (option) => !usedItemIds.has(option.id),
  );
  const allNestedOptions = getRelationRecordOptions(nestedEntity, ctx.entities);

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

  return (
    <div className="flex flex-col gap-1.5">
      {groups.length > 0 ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2rem] gap-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
            <span>{itemLabel}</span>
            <span>{nestedLabel}</span>
            <span />
          </div>
          {groups.map((group) => {
            const label =
              itemOptions.find((option) => option.id === group.itemId)?.label ??
              getRelationRecordOptions(itemEntity, ctx.entities).find(
                (option) => option.id === group.itemId,
              )?.label ??
              "Удалённая запись";
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
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2rem] items-start gap-1.5"
              >
                <span
                  className="flex h-9 min-w-0 items-center rounded-md border border-border/70 bg-muted/30 px-2.5 text-sm"
                  title={label}
                >
                  <span className="truncate">{label}</span>
                </span>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Убрать «${label}»`}
                  onClick={() =>
                    commit(
                      groups.filter((item) => item.itemId !== group.itemId),
                    )
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </>
      ) : null}
      <RelationSelect
        id={id}
        options={itemOptions}
        value=""
        placeholder={`Добавить: ${itemLabel.toLowerCase()}`}
        onChange={(next) => {
          const [nextId] = parseEntityRelationIds(next);
          if (!nextId) return;
          commit([...groups, { itemId: nextId, nestedIds: [] }]);
        }}
      />
    </div>
  );
}
