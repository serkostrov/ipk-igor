import { useMemo } from "react";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  type Entity,
  type EntityRelationGroupsConfig,
} from "@/entities/entity";
import { SettingSelect } from "@/shared/ui/setting-controls";

type EntityOption = {
  id: string;
  name: string;
  parentName?: string | null;
};

type RelationGroupsSettingsProps = {
  entities: Entity[];
  entityOptions: EntityOption[];
  value: EntityRelationGroupsConfig;
  onChange: (value: EntityRelationGroupsConfig) => void;
};

function optionLabel(option: EntityOption) {
  if (option.parentName) return `${option.parentName} → ${option.name}`;
  return option.name;
}

/** Configures primary + nested entities for a `relationGroups` field. */
export function RelationGroupsSettings({
  entities,
  entityOptions,
  value,
  onChange,
}: RelationGroupsSettingsProps) {
  const itemOptions = useMemo(
    () =>
      entityOptions.map((option) => ({
        value: option.id,
        label: optionLabel(option),
      })),
    [entityOptions],
  );

  const nestedOptions = useMemo(
    () =>
      entityOptions
        .filter((option) => option.id !== value.itemEntityId)
        .map((option) => ({
          value: option.id,
          label: optionLabel(option),
        })),
    [entityOptions, value.itemEntityId],
  );

  const itemEntity =
    entities.find((entity) => entity.id === value.itemEntityId) ?? null;

  const nestedSourceOptions = useMemo(() => {
    if (!itemEntity || !value.nestedEntityId) return [];
    return itemEntity.fields
      .filter(
        (field) =>
          field.type === "relation" &&
          getEntityRelationTargetId(field) === value.nestedEntityId,
      )
      .map((field) => ({
        value: field.id,
        label: getEntityFieldDisplayName(field),
      }));
  }, [itemEntity, value.nestedEntityId]);

  const nestedEntityName = value.nestedEntityId
    ? getEntityDisplayName(
        entities.find((entity) => entity.id === value.nestedEntityId) ?? {
          name: "",
          namePlural: "",
        },
      )
    : null;

  return (
    <div className="flex flex-col gap-2">
      <SettingSelect
        id="entity-field-relation-groups-item"
        title="Строки"
        description="Сущность, из которой выбираются основные записи"
        value={value.itemEntityId}
        options={itemOptions}
        emptyLabel="Выберите сущность"
        onChange={(itemEntityId) =>
          onChange({
            itemEntityId,
            nestedEntityId:
              value.nestedEntityId === itemEntityId
                ? null
                : value.nestedEntityId,
            nestedSourceFieldId: null,
          })
        }
      />
      <SettingSelect
        id="entity-field-relation-groups-nested"
        title="Вложенные"
        description="Мультивыбор для каждой строки"
        value={value.nestedEntityId}
        options={nestedOptions}
        emptyLabel="Выберите сущность"
        onChange={(nestedEntityId) =>
          onChange({
            ...value,
            nestedEntityId,
            nestedSourceFieldId: null,
          })
        }
      />
      {value.itemEntityId && value.nestedEntityId ? (
        <SettingSelect
          id="entity-field-relation-groups-source"
          title="Ограничить вложенные"
          description={
            nestedEntityName
              ? `Поле связи на строке → «${nestedEntityName}» (необязательно)`
              : "Поле связи на строке (необязательно)"
          }
          value={value.nestedSourceFieldId}
          options={nestedSourceOptions}
          emptyLabel="Все записи"
          onChange={(nestedSourceFieldId) =>
            onChange({ ...value, nestedSourceFieldId })
          }
        />
      ) : null}
    </div>
  );
}
