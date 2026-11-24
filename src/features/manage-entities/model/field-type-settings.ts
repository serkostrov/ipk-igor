import {
  canEntityFieldAllowManualInput,
  compileFormulaText,
  emptyEntityRelationGroupsConfig,
  formulaToDisplay,
  getEntityFormulaOperands,
  getEntityFormulaResultType,
  getEntityTimeTracking,
  isEntityNumericFieldType,
  isEntityRelationGroupsConfigReady,
  suggestFormulaResultType,
  type Entity,
  type EntityDeadlineConfig,
  type EntityDependenciesConfig,
  type EntityField,
  type EntityFieldDefaultValue,
  type EntityFieldType,
  type EntityFormulaResultType,
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
  | "allowManualInput"
>;

/** Editable per-type settings in the field dialog. */
export type FieldTypeSettingsDraft = {
  /** Formula with `[Поле]` names, as typed. */
  formulaText: string;
  formulaDecimals: EntityNumberDecimals;
  /** Declared formula result: number vs date. */
  formulaResultType: EntityFormulaResultType;
  /** Live formula value in the create-record form. */
  formulaShowOnCreate: boolean;
  /**
   * Computed fields: allow storing a value when the auto source is empty.
   */
  allowManualInput: boolean;
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
  "timeHours",
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

export function canShowFieldAsProgress(
  type: EntityFieldType,
  formulaResultType: EntityFormulaResultType = "number",
) {
  if (type === "formula" && formulaResultType === "date") return false;
  return PROGRESS_TYPES.has(type);
}

/** Formula (and similar) fields that behave as numbers in settings / totals. */
export function isEntityNumericSettingsType(
  type: EntityFieldType,
  formulaResultType: EntityFormulaResultType = "number",
) {
  if (type === "formula" && formulaResultType === "date") return false;
  return isEntityNumericFieldType(type);
}

const COMPUTED_DEFAULT_TYPES = new Set<EntityFieldType>([
  "lookup",
  "formula",
  "rollup",
  "numberSum",
  "timeHours",
]);

/** Lists need saved options; relations need a target entity. */
export function canHaveDefaultValue(
  type: EntityFieldType,
  {
    hasListOptions,
    hasRelationTarget,
    allowManualInput = false,
    valueType,
  }: {
    /** @deprecated kept for call-site compat; ignored. */
    relationToUsers?: boolean;
    hasListOptions: boolean;
    hasRelationTarget?: boolean;
    /** @deprecated defaults live in RelationGroupsSettings levels. */
    hasRelationGroupsConfig?: boolean;
    /** Computed fields: only with «Возможен ручной ввод». */
    allowManualInput?: boolean;
    /**
     * Effective control type for computed defaults (lookup target / formula
     * date → datetime). Defaults to `type`.
     */
    valueType?: EntityFieldType;
  },
) {
  if (type === "file" || type === "dependencies") return false;
  if (COMPUTED_DEFAULT_TYPES.has(type)) {
    if (!allowManualInput) return false;
    const effective = valueType ?? type;
    if (effective === "relation" || effective === "belonging") {
      return Boolean(hasRelationTarget);
    }
    if (effective === "list") return hasListOptions;
    // number / text / datetime stand-ins always OK once manual is on
    return true;
  }
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
  const formulaExpression = field?.formula?.expression ?? "";
  const formulaResultType: EntityFormulaResultType =
    field?.type === "formula"
      ? field.formula?.resultType != null
        ? getEntityFormulaResultType(field)
        : suggestFormulaResultType(formulaExpression)
      : "number";
  return {
    formulaText: field?.formula
      ? formulaToDisplay(
          formulaExpression,
          (id) => operands.find((item) => item.id === id)?.name ?? null,
        )
      : "",
    formulaDecimals: field?.formula?.decimals ?? 2,
    formulaResultType,
    formulaShowOnCreate: field?.formula?.showOnCreate === true,
    allowManualInput: field?.allowManualInput === true,
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
  entity: Pick<Entity, "fields" | "timeTracking"> | null,
  fieldId: string | null,
  entities: readonly Entity[] = [],
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
  if (type === "timeHours") {
    if (!entity || !getEntityTimeTracking(entity, entities)) {
      return "Сначала настройте вкладку «Учёт времени»";
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
  const formulaIsDate =
    type === "formula" && draft.formulaResultType === "date";
  return {
    formula: compiled?.ok
      ? {
          expression: compiled.expression,
          decimals: formulaIsDate ? 0 : draft.formulaDecimals,
          ...(draft.formulaResultType === "date"
            ? { resultType: "date" as const }
            : {}),
          ...(draft.formulaShowOnCreate ? { showOnCreate: true } : {}),
        }
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
      !formulaIsDate &&
      draft.progress &&
      canShowFieldAsProgress(type, draft.formulaResultType)
        ? "progress"
        : undefined,
    numberSignColor:
      !formulaIsDate &&
      draft.signColor &&
      isEntityNumericSettingsType(type, draft.formulaResultType)
        ? draft.signColor
        : undefined,
    allowManualInput:
      canEntityFieldAllowManualInput(type) && draft.allowManualInput
        ? true
        : undefined,
  };
}
