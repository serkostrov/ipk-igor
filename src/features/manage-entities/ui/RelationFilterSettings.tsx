import { Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  ConditionBuilder,
  getEntityFieldDisplayName,
  getEntityFieldValueKind,
  getEntityRelationTargetId,
  type Entity,
  type EntityField,
  type EntityRelationFilter,
} from "@/entities/entity";
import { SettingLabel, SettingSelect } from "@/shared/ui/setting-controls";

function toOptions(fields: EntityField[]) {
  return fields.map((field) => ({
    value: field.id,
    label: getEntityFieldDisplayName(field),
  }));
}

/** List / relation fields (lookups included) that can be matched by ids. */
function getMatchableFields(entity: Entity, entities: Entity[]) {
  return entity.fields.filter((field) => {
    const kind = getEntityFieldValueKind(entity, field, entities);
    return kind === "list" || kind === "relation";
  });
}

function entityLabel(entity: Entity) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

/**
 * Prefer pairing fields that point to the same related entity
 * (Deal.Отдел ↔ User.Отдел → Departments).
 */
function pickDefaultMatchPair(
  sourceFields: EntityField[],
  targetFields: EntityField[],
): { targetFieldId: string; sourceFieldId: string } | null {
  for (const source of sourceFields) {
    if (source.type !== "relation") continue;
    const sharedId = getEntityRelationTargetId(source);
    if (!sharedId) continue;
    const target = targetFields.find(
      (item) =>
        item.type === "relation" &&
        getEntityRelationTargetId(item) === sharedId,
    );
    if (target) {
      return { sourceFieldId: source.id, targetFieldId: target.id };
    }
  }
  if (sourceFields[0] && targetFields[0]) {
    return {
      sourceFieldId: sourceFields[0].id,
      targetFieldId: targetFields[0].id,
    };
  }
  return null;
}

export function RelationFilterSettings({
  entity,
  fieldId,
  target,
  entities,
  value,
  onChange,
}: {
  /** Entity that owns the relation field. */
  entity: Entity | null;
  fieldId: string | null;
  target: Entity;
  entities: Entity[];
  value: EntityRelationFilter | null;
  onChange: (value: EntityRelationFilter | null) => void;
}) {
  const filter = value ?? { matches: [], conditions: [] };
  const targetFields = getMatchableFields(target, entities);
  const sourceFields = entity
    ? getMatchableFields(entity, entities).filter(
        (field) => field.id !== fieldId,
      )
    : [];
  const canAddMatch = targetFields.length > 0 && sourceFields.length > 0;

  function commit(next: EntityRelationFilter) {
    onChange(
      next.matches.length === 0 && next.conditions.length === 0 ? null : next,
    );
  }

  function updateMatch(
    index: number,
    patch: Partial<EntityRelationFilter["matches"][number]>,
  ) {
    commit({
      ...filter,
      matches: filter.matches.map((match, matchIndex) =>
        matchIndex === index ? { ...match, ...patch } : match,
      ),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <SettingLabel
        title="Фильтр записей"
        description="При выборе показывать только подходящие"
      />

      {filter.matches.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)_1.75rem] gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">В «{entityLabel(target)}»</span>
            <span />
            <span className="truncate">В этой записи</span>
            <span />
          </div>
          {filter.matches.map((match, index) => (
            <div
              key={`${match.targetFieldId}:${match.sourceFieldId}:${index}`}
              className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)_1.75rem] items-center gap-1.5"
            >
              <SettingSelect
                id={`entity-field-filter-target-${index}`}
                value={match.targetFieldId}
                options={toOptions(targetFields)}
                onChange={(next) => {
                  if (next) updateMatch(index, { targetFieldId: next });
                }}
              />
              <span className="text-center text-xs text-muted-foreground">
                =
              </span>
              <SettingSelect
                id={`entity-field-filter-source-${index}`}
                value={match.sourceFieldId}
                options={toOptions(sourceFields)}
                onChange={(next) => {
                  if (next) updateMatch(index, { sourceFieldId: next });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label="Удалить совпадение"
                onClick={() =>
                  commit({
                    ...filter,
                    matches: filter.matches.filter(
                      (_, matchIndex) => matchIndex !== index,
                    ),
                  })
                }
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs text-muted-foreground hover:text-foreground"
        disabled={!canAddMatch}
        title={
          canAddMatch
            ? undefined
            : "Нужны поля «Список» или «Связь» в обеих сущностях"
        }
        onClick={() => {
          const pair = pickDefaultMatchPair(sourceFields, targetFields);
          if (!pair) return;
          commit({
            ...filter,
            matches: [...filter.matches, pair],
          });
        }}
      >
        <Plus className="size-3.5" />
        Совпадение полей
      </Button>
      <ConditionBuilder
        entity={target}
        entities={entities}
        sourceEntity={entity}
        sourceExcludeFieldId={fieldId}
        conditions={filter.conditions}
        onChange={(conditions) => commit({ ...filter, conditions })}
      />
    </div>
  );
}
