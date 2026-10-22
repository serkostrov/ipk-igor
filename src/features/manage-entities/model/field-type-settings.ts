import {
  compileFormulaText,
  emptyEntityRelationGroupsConfig,
  formulaToDisplay,
  getEntityFormulaOperands,
  isEntityNumericFieldType,
  isEntityRelationGroupsConfigReady,
  type Entity,
  type EntityDeadlineConfig,
  type EntityDependenciesConfig,
  type EntityField,
  type EntityFieldDefaultValue,
  type EntityFieldType,
  type EntityLookupConfig,
  type EntityNumberDecimals,
  type EntityNumberSignColor,
  type EntityRelationFilter,
  type EntityRelationGroupsConfig,
  type EntityRollupAggregation,
  type EntityRollupConfig,
} from "@/entities/entity";

/** Per-type settings saved on a field. */
export type EntityFieldTypeSettings = Pick<
  EntityField,
  | "formula"
  | "rollup"
  | "lookup"
  | "dependencies"
  | "relationGroups"
  | "defaultValue"
  | "relationFilter"
  | "deadline"
  | "numberDisplay"
  | "numberSignColor"
>;

/** Editable per-type settings in the field dialog. */
export type FieldTypeSettingsDraft = {
  /** Formula with `[Поле]` names, as typed. */
  formulaText: string;
  formulaDecimals: EntityNumberDecimals;
  rollup: EntityRollupConfig | null;
  lookup: EntityLookupConfig | null;
  dependencies: EntityDependenciesConfig;
  relationGroups: EntityRelationGroupsConfig;
  defaultValue: EntityFieldDefaultValue | null;
  relationFilter: EntityRelationFilter | null;
  deadline: EntityDeadlineConfig | null;
  progress: boolean;
  signColor: EntityNumberSignColor | null;
};

const PROGRESS_TYPES = new Set<EntityFieldType>([
  "number",
  "formula",
  "rollup",
]);

const DEFAULT_VALUE_TYPES = new Set<EntityFieldType>([
  "text",
  "textarea",
  "number",
  "boolean",
  "datetime",
  "time",
  "period",
  "phone",
  "email",
  "url",
  "list",
  "relation",
  "belonging",
]);

export function canShowFieldAsProgress(type: EntityFieldType) {
  return PROGRESS_TYPES.has(type);
}

/** Lists need saved options; relations need a target entity. */
export function canHaveDefaultValue(
  type: EntityFieldType,
  {
    hasListOptions,
    hasRelationTarget,
  }: {
    /** @deprecated kept for call-site compat; ignored. */
    relationToUsers?: boolean;
    hasListOptions: boolean;
    hasRelationTarget?: boolean;
    /** @deprecated defaults live in RelationGroupsSettings levels. */
    hasRelationGroupsConfig?: boolean;
  },
) {
  if (!DEFAULT_VALUE_TYPES.has(type)) return false;
  if (type === "relation" || type === "belonging") {
    return Boolean(hasRelationTarget);
  }
  if (type === "list") return hasListOptions;
  return true;
}

export function rollupNeedsValueField(aggregation: EntityRollupAggregation) {
  return aggregation !== "count";
}

export function createFieldTypeSettingsDraft(
  field: EntityField | null | undefined,
  entity: Pick<Entity, "fields"> | null,
): FieldTypeSettingsDraft {
  const operands = entity
    ? getEntityFormulaOperands(entity, field?.id ?? null)
    : [];
  return {
    formulaText: field?.formula
      ? formulaToDisplay(
          field.formula.expression,
          (id) => operands.find((item) => item.id === id)?.name ?? null,
        )
      : "",
    formulaDecimals: field?.formula?.decimals ?? 2,
    rollup: field?.rollup ?? null,
    lookup: field?.lookup ?? null,
    dependencies: field?.dependencies ?? { sameFieldId: null },
    relationGroups: field?.relationGroups
      ? {
          levels: field.relationGroups.levels.map((level) => ({
            ...level,
            displayFieldIds: [...level.displayFieldIds],
            defaultIds: [...level.defaultIds],
            layout: level.layout ?? "column",
            source:
              level.source.kind === "entity"
                ? { ...level.source }
                : { ...level.source },
          })),
        }
      : emptyEntityRelationGroupsConfig(),
    defaultValue: field?.defaultValue ?? null,
    relationFilter: field?.relationFilter ?? null,
    deadline: field?.deadline ?? null,
    progress: field?.numberDisplay === "progress",
    signColor: field?.numberSignColor ?? null,
  };
}

function compileDraftFormula(
  draft: FieldTypeSettingsDraft,
  entity: Pick<Entity, "fields"> | null,
  fieldId: string | null,
) {
  return compileFormulaText(
    draft.formulaText,
    entity ? getEntityFormulaOperands(entity, fieldId) : [],
  );
}

/** Why the settings cannot be saved yet (`null` — valid). */
export function getFieldTypeSettingsError(
  type: EntityFieldType,
  draft: FieldTypeSettingsDraft,
  entity: Pick<Entity, "fields"> | null,
  fieldId: string | null,
): string | null {
  if (type === "formula") {
    const compiled = compileDraftFormula(draft, entity, fieldId);
    return compiled.ok ? null : compiled.error;
  }
  if (type === "rollup") {
    if (!draft.rollup) return "Выберите связанные записи";
    if (
      rollupNeedsValueField(draft.rollup.aggregation) &&
      !draft.rollup.valueFieldId
    ) {
      return "Выберите поле для расчёта";
    }
  }
  if (
    type === "lookup" &&
    (!draft.lookup?.relationFieldId || !draft.lookup.targetFieldId)
  ) {
    return "Выберите связь и поле";
  }
  if (type === "relationGroups") {
    if (!isEntityRelationGroupsConfigReady(draft.relationGroups)) {
      return "Настройте все уровни вложенности";
    }
  }
  return null;
}

/** Settings to save for `type` (other types' settings are cleared). */
export function resolveFieldTypeSettings(
  type: EntityFieldType,
  draft: FieldTypeSettingsDraft,
  entity: Pick<Entity, "fields"> | null,
  fieldId: string | null,
): EntityFieldTypeSettings {
  const compiled =
    type === "formula" ? compileDraftFormula(draft, entity, fieldId) : null;
  return {
    formula: compiled?.ok
      ? { expression: compiled.expression, decimals: draft.formulaDecimals }
      : undefined,
    rollup: type === "rollup" ? (draft.rollup ?? undefined) : undefined,
    lookup: type === "lookup" ? (draft.lookup ?? undefined) : undefined,
    dependencies: type === "dependencies" ? draft.dependencies : undefined,
    relationGroups:
      type === "relationGroups" ? draft.relationGroups : undefined,
    defaultValue: draft.defaultValue ?? undefined,
    relationFilter:
      type === "relation" ? (draft.relationFilter ?? undefined) : undefined,
    deadline: type === "datetime" ? (draft.deadline ?? undefined) : undefined,
    numberDisplay:
      draft.progress && canShowFieldAsProgress(type) ? "progress" : undefined,
    numberSignColor:
      draft.signColor && isEntityNumericFieldType(type)
        ? draft.signColor
        : undefined,
  };
}
