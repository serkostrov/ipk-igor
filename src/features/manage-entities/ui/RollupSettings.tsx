import {
  ConditionBuilder,
  ENTITY_ROLLUP_AGGREGATIONS,
  getEntityFieldDisplayName,
  getEntityFieldValueKind,
  getEntityRollupSources,
  type Entity,
  type EntityRollupAggregation,
  type EntityRollupConfig,
} from "@/entities/entity";
import { rollupNeedsValueField } from "../model/field-type-settings";
import {
  SettingLabel,
  SettingSelect,
  type SettingOption,
} from "@/shared/ui/setting-controls";

const SOURCE_SEPARATOR = "|";

const AGGREGATION_LABELS: Record<EntityRollupAggregation, string> = {
  count: "Количество",
  sum: "Сумма",
  avg: "Среднее",
  min: "Минимум",
  max: "Максимум",
  countFinal: "Количество завершённых",
  percentFinal: "Доля завершённых, %",
};

const AGGREGATION_OPTIONS: SettingOption[] = ENTITY_ROLLUP_AGGREGATIONS.map(
  (aggregation) => ({
    value: aggregation,
    label: AGGREGATION_LABELS[aggregation],
  }),
);

function isAggregation(value: string | null): value is EntityRollupAggregation {
  return ENTITY_ROLLUP_AGGREGATIONS.includes(value as EntityRollupAggregation);
}

function isFinalAggregation(aggregation: EntityRollupAggregation) {
  return aggregation === "countFinal" || aggregation === "percentFinal";
}

/** Fields of the source that can feed `aggregation`. */
function getValueFieldOptions(
  source: Entity,
  aggregation: EntityRollupAggregation,
  entities: Entity[],
): SettingOption[] {
  return source.fields
    .filter((field) =>
      isFinalAggregation(aggregation)
        ? field.type === "list" && !field.listMultiple
        : getEntityFieldValueKind(source, field, entities) === "number",
    )
    .map((field) => ({
      value: field.id,
      label: getEntityFieldDisplayName(field),
    }));
}

type RollupSettingsProps = {
  entities: Entity[];
  value: EntityRollupConfig;
  onChange: (value: EntityRollupConfig) => void;
};

export function RollupSourceSettings({
  entityId,
  entities,
  value,
  onChange,
}: {
  entityId: string | null;
  entities: Entity[];
  value: EntityRollupConfig | null;
  onChange: (value: EntityRollupConfig) => void;
}) {
  const sources = entityId ? getEntityRollupSources(entities, entityId) : [];
  return (
    <SettingSelect
      id="entity-field-rollup-source"
      title="Связанные записи"
      description="Записи, которые ссылаются на эту"
      value={
        value
          ? `${value.sourceEntityId}${SOURCE_SEPARATOR}${value.linkFieldId}`
          : null
      }
      options={sources.map((source) => ({
        value: `${source.entityId}${SOURCE_SEPARATOR}${source.linkFieldId}`,
        label: source.label,
      }))}
      noOptionsLabel="Ни одна сущность не ссылается на эту"
      onChange={(next) => {
        const [sourceEntityId, linkFieldId] = (next ?? "").split(
          SOURCE_SEPARATOR,
        );
        if (!sourceEntityId || !linkFieldId) return;
        onChange({
          sourceEntityId,
          linkFieldId,
          aggregation: value?.aggregation ?? "count",
          valueFieldId: null,
          conditions: [],
          decimals: value?.decimals ?? 2,
        });
      }}
    />
  );
}

export function RollupCalculationSettings({
  entities,
  value,
  onChange,
}: RollupSettingsProps) {
  const source = entities.find((item) => item.id === value.sourceEntityId);
  const valueOptions = source
    ? getValueFieldOptions(source, value.aggregation, entities)
    : [];

  return (
    <div className="flex flex-col gap-2">
      <SettingSelect
        id="entity-field-rollup-aggregation"
        title="Расчёт"
        value={value.aggregation}
        options={AGGREGATION_OPTIONS}
        onChange={(next) => {
          if (!isAggregation(next)) return;
          const nextOptions = source
            ? getValueFieldOptions(source, next, entities)
            : [];
          const keepValueField = nextOptions.some(
            (option) => option.value === value.valueFieldId,
          );
          onChange({
            ...value,
            aggregation: next,
            valueFieldId: keepValueField ? value.valueFieldId : null,
          });
        }}
      />
      {rollupNeedsValueField(value.aggregation) ? (
        <SettingSelect
          id="entity-field-rollup-value"
          title={isFinalAggregation(value.aggregation) ? "Статус" : "Поле"}
          description={
            isFinalAggregation(value.aggregation)
              ? "Завершённые — с завершающим вариантом"
              : undefined
          }
          value={value.valueFieldId}
          options={valueOptions}
          noOptionsLabel={
            isFinalAggregation(value.aggregation)
              ? "У связанных записей нет полей «Список»"
              : "У связанных записей нет числовых полей"
          }
          onChange={(next) => onChange({ ...value, valueFieldId: next })}
        />
      ) : null}
    </div>
  );
}

export function RollupConditionsSettings({
  entities,
  value,
  onChange,
}: RollupSettingsProps) {
  const source = entities.find((item) => item.id === value.sourceEntityId);
  if (!source) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <SettingLabel
        title="Условия"
        description="Учитывать только подходящие записи"
      />
      <ConditionBuilder
        entity={source}
        entities={entities}
        conditions={value.conditions}
        onChange={(conditions) => onChange({ ...value, conditions })}
      />
    </div>
  );
}
