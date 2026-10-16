import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  type Entity,
  type EntityLookupConfig,
} from "@/entities/entity";
import { SettingSelect } from "@/shared/ui/setting-controls";

type LookupSettingsProps = {
  entity: Entity | null;
  entities: Entity[];
  value: EntityLookupConfig | null;
  onChange: (value: EntityLookupConfig) => void;
};

/** Relation of this entity → field of the related entity. */
export function LookupSettings({
  entity,
  entities,
  value,
  onChange,
}: LookupSettingsProps) {
  const relationFields =
    entity?.fields.filter((field) => field.type === "relation") ?? [];
  const relationField = relationFields.find(
    (field) => field.id === value?.relationFieldId,
  );
  const target = relationField
    ? entities.find(
        (item) => item.id === getEntityRelationTargetId(relationField),
      )
    : undefined;
  const targetFields =
    target?.fields.filter(
      (field) => field.type !== "file" && field.type !== "dependencies",
    ) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <SettingSelect
        id="entity-field-lookup-relation"
        title="Связь"
        description="Поле «Связь» этой сущности"
        value={value?.relationFieldId ?? null}
        options={relationFields.map((field) => {
          const fieldTarget = entities.find(
            (item) => item.id === getEntityRelationTargetId(field),
          );
          return {
            value: field.id,
            label: fieldTarget
              ? `${getEntityFieldDisplayName(field)} → ${fieldTarget.namePlural.trim() || fieldTarget.name.trim()}`
              : getEntityFieldDisplayName(field),
          };
        })}
        noOptionsLabel="Сначала добавьте поле «Связь»"
        onChange={(next) => {
          if (next) onChange({ relationFieldId: next, targetFieldId: "" });
        }}
      />
      {relationField ? (
        <SettingSelect
          id="entity-field-lookup-target"
          title="Поле"
          description="Значение какого поля показывать"
          value={value?.targetFieldId || null}
          options={targetFields.map((field) => ({
            value: field.id,
            label: getEntityFieldDisplayName(field),
          }))}
          noOptionsLabel="У связанной сущности нет полей"
          onChange={(next) => {
            if (next && value) onChange({ ...value, targetFieldId: next });
          }}
        />
      ) : null}
    </div>
  );
}
