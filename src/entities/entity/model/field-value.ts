import {
  addCalendarDays,
  extractIsoDate,
  nowTimeHHmm,
  todayIsoDate,
} from "@/shared/lib/business-days";
import { formatDateDisplay } from "@/shared/lib/format-date";
import type { EntityCondition, EntityValueKind } from "./condition";
import { getEntityDeadlineState } from "./deadline";
import {
  ENTITY_DEPENDENCY_TYPE_LABELS,
  ENTITY_LIST_OTHER_OPTION_ID,
  formatEntityDependencyLag,
  formatEntityFieldScalarValue,
  formatEntityNumberSumDisplay,
  getEntityFieldDisplayName,
  getEntityFieldNumericValue,
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  isEntityListOtherValue,
  normalizeEntitySumFieldIds,
  parseEntityDecimal,
  parseEntityDependencies,
  parseEntityListValueIds,
  parseEntityRelationIds,
  serializeEntityRelationIds,
} from "./field";
import { evaluateFormula, type FormulaValue } from "./formula";
import {
  isEntityListOptionFinal,
  isEntityListOptionProblem,
} from "./list-process";
import type {
  Entity,
  EntityField,
  EntityFormulaConfig,
  EntityNumberDecimals,
  EntityRecord,
  RelationRecordOption,
} from "./types";
import {
  formatEntityListFieldValue,
  getEntityListOption,
  getEntityListOptions,
  getVisibleListOptions,
  isEntityNameField,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  sanitizeListValueAgainstOptions,
} from "./types";

type RecordRef = { entity: Entity; record: EntityRecord };

/** A stored value location (lookups resolve to the target field's cells). */
export type EntityFieldCell = {
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
};

/**
 * Per-config index and caches for computed values. Created once per
 * `entities` array (the store replaces the array on every change).
 */
export type EntityValueContext = {
  entities: readonly Entity[];
  currentUserRecordId: string | null;
  today: string;
  entityById: Map<string, Entity>;
  recordById: Map<string, RecordRef>;
  linkIndexes: Map<string, Map<string, EntityRecord[]>>;
  formulaCache: Map<string, FormulaValue>;
  rollupCache: Map<string, number | null>;
  pending: Set<string>;
};

const LOOKUP_DEPTH_LIMIT = 4;
const contextCache = new WeakMap<readonly Entity[], EntityValueContext>();

export function getEntityValueContext(
  entities: readonly Entity[],
  currentUserRecordId: string | null = null,
): EntityValueContext {
  const today = todayIsoDate();
  const cached = contextCache.get(entities);
  if (
    cached &&
    cached.today === today &&
    cached.currentUserRecordId === currentUserRecordId
  ) {
    return cached;
  }
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const recordById = new Map<string, RecordRef>();
  for (const entity of entities) {
    for (const record of entity.records) {
      recordById.set(record.id, { entity, record });
    }
  }
  const context: EntityValueContext = {
    entities,
    currentUserRecordId,
    today,
    entityById,
    recordById,
    linkIndexes: new Map(),
    formulaCache: new Map(),
    rollupCache: new Map(),
    pending: new Set(),
  };
  contextCache.set(entities, context);
  return context;
}

/**
 * Context for unsaved values: shares indexes, but formulas and rollups are
 * recomputed (their caches are keyed by record id).
 */
export function getEntityPreviewValueContext(
  ctx: EntityValueContext,
): EntityValueContext {
  return {
    ...ctx,
    formulaCache: new Map(),
    rollupCache: new Map(),
    pending: new Set(),
  };
}

function findField(entity: Pick<Entity, "fields">, fieldId: string | null) {
  if (!fieldId) return null;
  return entity.fields.find((item) => item.id === fieldId) ?? null;
}

/** Records of `sourceEntityId` whose relation `linkFieldId` contains the parent. */
export function getEntityLinkedRecords(
  ctx: EntityValueContext,
  sourceEntityId: string,
  linkFieldId: string,
  parentRecordId: string,
): EntityRecord[] {
  const key = `${sourceEntityId}:${linkFieldId}`;
  let index = ctx.linkIndexes.get(key);
  if (!index) {
    index = new Map();
    const source = ctx.entityById.get(sourceEntityId);
    for (const record of source?.records ?? []) {
      for (const parentId of parseEntityRelationIds(
        record.values[linkFieldId],
      )) {
        const bucket = index.get(parentId);
        if (bucket) bucket.push(record);
        else index.set(parentId, [record]);
      }
    }
    ctx.linkIndexes.set(key, index);
  }
  return index.get(parentRecordId) ?? [];
}

/** Target entity + field of a lookup (settings and runtime). */
export function resolveEntityLookupTarget<
  T extends Pick<Entity, "id" | "fields">,
>(
  entity: Pick<Entity, "fields">,
  field: Pick<EntityField, "type" | "lookup">,
  entities: readonly T[],
): { relationField: EntityField; entity: T; field: EntityField } | null {
  if (field.type !== "lookup" || !field.lookup) return null;
  const relationField = findField(entity, field.lookup.relationFieldId);
  if (!relationField || relationField.type !== "relation") return null;
  const targetId = getEntityRelationTargetId(relationField);
  const target = entities.find((item) => item.id === targetId);
  if (!target) return null;
  const targetField = findField(target, field.lookup.targetFieldId);
  if (!targetField) return null;
  return { relationField, entity: target, field: targetField };
}

/** Stored field behind a chain of lookups (the field itself otherwise). */
export function resolveEntityFieldSource<
  T extends Pick<Entity, "id" | "fields">,
>(
  entity: T,
  field: EntityField,
  entities: readonly T[],
): { entity: T; field: EntityField } | null {
  let current = { entity, field };
  for (let depth = 0; depth < LOOKUP_DEPTH_LIMIT; depth += 1) {
    if (current.field.type !== "lookup") return current;
    const target = resolveEntityLookupTarget(
      current.entity,
      current.field,
      entities,
    );
    if (!target) return null;
    current = { entity: target.entity, field: target.field };
  }
  return current.field.type === "lookup" ? null : current;
}

/** Value family (lookups take the family of their target field). */
export function getEntityFieldValueKind(
  entity: Pick<Entity, "fields">,
  field: EntityField,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">>,
  depth = 0,
): EntityValueKind {
  switch (field.type) {
    case "list":
      return "list";
    case "relation":
      return "relation";
    case "boolean":
      return "boolean";
    case "number":
    case "numberSum":
    case "formula":
    case "rollup":
      return "number";
    case "datetime":
      return "date";
    case "time":
      return "text";
    case "lookup": {
      if (depth >= LOOKUP_DEPTH_LIMIT) return "text";
      const target = resolveEntityLookupTarget(entity, field, entities);
      return target
        ? getEntityFieldValueKind(
            target.entity,
            target.field,
            entities,
            depth + 1,
          )
        : "text";
    }
    default:
      return "text";
  }
}

/** Cells that hold the value of `field` for `record` (one for plain fields). */
export function resolveRecordFieldCells(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
  depth = 0,
): EntityFieldCell[] {
  if (field.type !== "lookup") return [{ entity, record, field }];
  if (depth >= LOOKUP_DEPTH_LIMIT) return [];
  const target = resolveEntityLookupTarget(entity, field, ctx.entities);
  if (!target) return [];
  return parseEntityRelationIds(record.values[target.relationField.id]).flatMap(
    (recordId) => {
      const ref = ctx.recordById.get(recordId);
      if (!ref || ref.entity.id !== target.entity.id) return [];
      return resolveRecordFieldCells(
        ctx,
        ref.entity,
        ref.record,
        target.field,
        depth + 1,
      );
    },
  );
}

function sumOrNull(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

/** Numeric value for totals, sorting, rollups and formulas (`null` — empty). */
export function getRecordFieldNumber(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): number | null {
  switch (field.type) {
    case "number": {
      const value = parseEntityDecimal(record.values[field.id] ?? "");
      return Number.isFinite(value) ? value : null;
    }
    case "numberSum": {
      const ids = normalizeEntitySumFieldIds(field.sumFieldIds);
      const hasAny = ids.some(
        (id) => (record.values[id] ?? "").trim().length > 0,
      );
      if (!hasAny) return null;
      const value = getEntityFieldNumericValue(field, record.values);
      return Number.isFinite(value) ? value : null;
    }
    case "formula": {
      const value = getFormulaResult(ctx, entity, record, field);
      if (typeof value === "number") return value;
      if (typeof value === "boolean") return value ? 1 : 0;
      return null;
    }
    case "rollup":
      return getRollupResult(ctx, record, field);
    case "lookup":
      return sumOrNull(
        resolveRecordFieldCells(ctx, entity, record, field).map((cell) =>
          getRecordFieldNumber(ctx, cell.entity, cell.record, cell.field),
        ),
      );
    case "boolean":
      return record.values[field.id] === "true" ? 1 : 0;
    default:
      return null;
  }
}

/** Option / record ids stored by list, relation (and their lookups). */
export function getRecordFieldIds(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): string[] {
  if (field.type === "list") {
    return parseEntityListValueIds(record.values[field.id]);
  }
  if (field.type === "relation") {
    return parseEntityRelationIds(record.values[field.id]);
  }
  if (field.type === "lookup") {
    return [
      ...new Set(
        resolveRecordFieldCells(ctx, entity, record, field).flatMap((cell) =>
          getRecordFieldIds(ctx, cell.entity, cell.record, cell.field),
        ),
      ),
    ];
  }
  return [];
}

function getRelationLabel(
  ctx: EntityValueContext,
  field: EntityField,
  recordId: string,
): string | null {
  const target = ctx.entityById.get(getEntityRelationTargetId(field) ?? "");
  return target ? resolveRelationRecordLabel(target, recordId) : null;
}

/** Value of a field as a formula operand. */
export function getRecordFieldFormulaValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): FormulaValue {
  switch (field.type) {
    case "number":
    case "numberSum":
    case "rollup":
      return getRecordFieldNumber(ctx, entity, record, field);
    case "formula":
      return getFormulaResult(ctx, entity, record, field);
    case "boolean":
      return record.values[field.id] === "true";
    case "datetime":
      return extractIsoDate(record.values[field.id]);
    case "time": {
      const raw = (record.values[field.id] ?? "").trim();
      return /^([01]?\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
    }
    case "list": {
      const option = getEntityListOptions(
        resolveEntityListFieldOptions(field, ctx.entities),
        record.values[field.id],
      )[0];
      return option?.name ?? null;
    }
    case "relation": {
      const id = parseEntityRelationIds(record.values[field.id])[0];
      return id ? getRelationLabel(ctx, field, id) : null;
    }
    case "lookup": {
      const cells = resolveRecordFieldCells(ctx, entity, record, field);
      if (getEntityFieldValueKind(entity, field, ctx.entities) === "number") {
        return sumOrNull(
          cells.map((cell) =>
            getRecordFieldNumber(ctx, cell.entity, cell.record, cell.field),
          ),
        );
      }
      const first = cells[0];
      return first
        ? getRecordFieldFormulaValue(
            ctx,
            first.entity,
            first.record,
            first.field,
          )
        : null;
    }
    case "dependencies":
    case "file":
      return null;
    default: {
      const raw = (record.values[field.id] ?? "").trim();
      return raw || null;
    }
  }
}

function withCycleGuard<T>(
  ctx: EntityValueContext,
  cache: Map<string, T>,
  key: string,
  fallback: T,
  compute: () => T,
): T {
  if (cache.has(key)) return cache.get(key)!;
  if (ctx.pending.has(key)) return fallback;
  ctx.pending.add(key);
  try {
    const value = compute();
    cache.set(key, value);
    return value;
  } finally {
    ctx.pending.delete(key);
  }
}

function roundComputed(value: FormulaValue): FormulaValue {
  if (typeof value !== "number") return value;
  return Math.round(value * 1e8) / 1e8;
}

function evaluateRecordFormula(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  expression: string,
): FormulaValue {
  if (!expression) return null;
  return roundComputed(
    evaluateFormula(
      expression,
      (fieldId) => {
        const ref = findField(entity, fieldId);
        return ref
          ? getRecordFieldFormulaValue(ctx, entity, record, ref)
          : null;
      },
      ctx.today,
    ),
  );
}

export function getFormulaResult(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): FormulaValue {
  return withCycleGuard(
    ctx,
    ctx.formulaCache,
    `${record.id}:${field.id}`,
    null,
    () =>
      evaluateRecordFormula(
        ctx,
        entity,
        record,
        field.formula?.expression ?? "",
      ),
  );
}

function getRollupResult(
  ctx: EntityValueContext,
  record: EntityRecord,
  field: EntityField,
): number | null {
  return withCycleGuard(
    ctx,
    ctx.rollupCache,
    `${record.id}:${field.id}`,
    null,
    () => {
      const config = field.rollup;
      if (!config) return null;
      const source = ctx.entityById.get(config.sourceEntityId);
      const linkField = source ? findField(source, config.linkFieldId) : null;
      if (!source || !linkField || linkField.type !== "relation") return null;

      const children = getEntityLinkedRecords(
        ctx,
        source.id,
        linkField.id,
        record.id,
      ).filter((child) =>
        matchesEntityConditions(ctx, source, child, config.conditions),
      );

      if (config.aggregation === "count") return children.length;

      if (
        config.aggregation === "countFinal" ||
        config.aggregation === "percentFinal"
      ) {
        const listField = findField(source, config.valueFieldId);
        if (!listField || listField.type !== "list") return null;
        const options = resolveEntityListFieldOptions(listField, ctx.entities);
        const done = children.filter((child) =>
          isEntityListOptionFinal(
            getEntityListOption(options, child.values[listField.id]),
          ),
        ).length;
        if (config.aggregation === "countFinal") return done;
        return children.length > 0
          ? (roundComputed((done / children.length) * 100) as number)
          : null;
      }

      const valueField = findField(source, config.valueFieldId);
      if (!valueField) return null;
      const numbers = children
        .map((child) => getRecordFieldNumber(ctx, source, child, valueField))
        .filter((value): value is number => value != null);
      if (config.aggregation === "sum") {
        return roundComputed(
          numbers.reduce((sum, value) => sum + value, 0),
        ) as number;
      }
      if (numbers.length === 0) return null;
      if (config.aggregation === "min") return Math.min(...numbers);
      if (config.aggregation === "max") return Math.max(...numbers);
      return roundComputed(
        numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
      ) as number;
    },
  );
}

export function formatEntityComputedNumber(
  value: number | null,
  decimals: EntityNumberDecimals = 2,
  unitSuffix?: string | null,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
  const unit = unitSuffix?.trim() ?? "";
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatFormulaValue(
  value: FormulaValue,
  decimals: EntityNumberDecimals,
  unitSuffix: string | null | undefined,
): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    return formatEntityComputedNumber(value, decimals, unitSuffix);
  }
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  const date = extractIsoDate(value);
  if (date && date === value.trim()) return formatDateDisplay(date);
  return value.trim() || "—";
}

/** Formula result on a record for the settings preview (not cached). */
export function formatEntityFormulaPreview(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  formula: EntityFormulaConfig,
  unitSuffix: string | null,
): string {
  return formatFormulaValue(
    evaluateRecordFormula(ctx, entity, record, formula.expression),
    formula.decimals,
    unitSuffix,
  );
}

/** Display text of any field value (computed types included). */
export function formatRecordFieldValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): string {
  switch (field.type) {
    case "numberSum":
      return formatEntityNumberSumDisplay(field, record.values);
    case "formula":
      return formatFormulaValue(
        getFormulaResult(ctx, entity, record, field),
        field.formula?.decimals ?? 2,
        field.unitSuffix,
      );
    case "rollup":
      return formatEntityComputedNumber(
        getRecordFieldNumber(ctx, entity, record, field),
        field.rollup?.decimals ?? 2,
        field.unitSuffix,
      );
    case "lookup": {
      const parts = resolveRecordFieldCells(ctx, entity, record, field)
        .map((cell) =>
          formatRecordFieldValue(ctx, cell.entity, cell.record, cell.field),
        )
        .filter((value) => value && value !== "—");
      return parts.length > 0 ? [...new Set(parts)].join(", ") : "—";
    }
    case "list":
      return formatEntityListFieldValue(
        field,
        record.values[field.id],
        ctx.entities,
      );
    case "relation": {
      const target = ctx.entityById.get(getEntityRelationTargetId(field) ?? "");
      return resolveRelationRecordLabel(target, record.values[field.id]) ?? "—";
    }
    case "dependencies": {
      const parts = parseEntityDependencies(record.values[field.id]).map(
        (dependency) => {
          const label =
            resolveRelationRecordLabel(entity, dependency.recordId) ??
            "Без названия";
          const lag = formatEntityDependencyLag(dependency.lag);
          const kind = ENTITY_DEPENDENCY_TYPE_LABELS[dependency.type].short;
          return `${label} · ${kind}${lag ? ` ${lag}` : ""}`;
        },
      );
      return parts.length > 0 ? parts.join(", ") : "—";
    }
    default:
      return formatEntityFieldScalarValue(field, record.values[field.id]);
  }
}

export function isRecordFieldEmpty(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): boolean {
  const kind = getEntityFieldValueKind(entity, field, ctx.entities);
  if (kind === "number") {
    return getRecordFieldNumber(ctx, entity, record, field) == null;
  }
  if (kind === "list" || kind === "relation") {
    return getRecordFieldIds(ctx, entity, record, field).length === 0;
  }
  if (field.type === "dependencies") {
    return parseEntityDependencies(record.values[field.id]).length === 0;
  }
  return formatRecordFieldValue(ctx, entity, record, field) === "—";
}

/** Comparable value for column sorting (`null` sorts last). */
export function getRecordFieldSortValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField,
): number | string | null {
  const kind = getEntityFieldValueKind(entity, field, ctx.entities);
  if (kind === "number")
    return getRecordFieldNumber(ctx, entity, record, field);
  const cell = resolveRecordFieldCells(ctx, entity, record, field)[0];
  if (!cell) return null;
  if (kind === "boolean") {
    return cell.record.values[cell.field.id] === "true" ? 1 : 0;
  }
  if (kind === "date") return extractIsoDate(cell.record.values[cell.field.id]);
  if (kind === "list") {
    const options = resolveEntityListFieldOptions(cell.field, ctx.entities);
    const id = parseEntityListValueIds(cell.record.values[cell.field.id])[0];
    const index = options.findIndex((option) => option.id === id);
    return index >= 0 ? index : null;
  }
  const text = formatRecordFieldValue(ctx, entity, record, field);
  return text === "—" ? null : text.toLocaleLowerCase("ru");
}

function listOptionOf(ctx: EntityValueContext, cell: EntityFieldCell) {
  if (cell.field.type !== "list") return null;
  return getEntityListOption(
    resolveEntityListFieldOptions(cell.field, ctx.entities),
    parseEntityListValueIds(cell.record.values[cell.field.id])[0],
  );
}

/** Optional parent/form record for `equalsRecordField` conditions. */
export type EntityConditionSource = {
  entity: Entity;
  record: EntityRecord;
};

function matchesEntityCondition(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  condition: EntityCondition,
  source?: EntityConditionSource | null,
): boolean {
  const field = findField(entity, condition.fieldId);
  if (!field) return true;
  const cells = resolveRecordFieldCells(ctx, entity, record, field);

  switch (condition.operator) {
    case "empty":
      return isRecordFieldEmpty(ctx, entity, record, field);
    case "notEmpty":
      return !isRecordFieldEmpty(ctx, entity, record, field);
    case "in":
    case "notIn": {
      const ids = getRecordFieldIds(ctx, entity, record, field).map((id) =>
        isEntityListOtherValue(id) ? ENTITY_LIST_OTHER_OPTION_ID : id,
      );
      const wanted = condition.values ?? [];
      const hit = ids.some((id) => wanted.includes(id));
      return condition.operator === "in" ? hit : !hit;
    }
    case "final":
      return cells.some((cell) =>
        isEntityListOptionFinal(listOptionOf(ctx, cell)),
      );
    case "notFinal":
      return !cells.some((cell) =>
        isEntityListOptionFinal(listOptionOf(ctx, cell)),
      );
    case "problem":
      return cells.some((cell) =>
        isEntityListOptionProblem(listOptionOf(ctx, cell)),
      );
    case "isCurrentUser":
      return (
        ctx.currentUserRecordId != null &&
        getRecordFieldIds(ctx, entity, record, field).includes(
          ctx.currentUserRecordId,
        )
      );
    case "equalsCurrentUserField": {
      const user = ctx.currentUserRecordId
        ? ctx.recordById.get(ctx.currentUserRecordId)
        : null;
      const userField = user
        ? findField(user.entity, condition.value ?? null)
        : null;
      if (!user || !userField) return false;
      const userIds = getRecordFieldIds(
        ctx,
        user.entity,
        user.record,
        userField,
      );
      return getRecordFieldIds(ctx, entity, record, field).some((id) =>
        userIds.includes(id),
      );
    }
    case "equalsRecordField": {
      if (!source) return true;
      const sourceField = findField(source.entity, condition.value ?? null);
      if (!sourceField) return true;
      const sourceIds = getRecordFieldIds(
        ctx,
        source.entity,
        source.record,
        sourceField,
      );
      // Source empty — no constraint yet (e.g. department not chosen).
      if (sourceIds.length === 0) return true;
      return getRecordFieldIds(ctx, entity, record, field).some((id) =>
        sourceIds.includes(id),
      );
    }
    case "true":
      return cells.some((cell) => cell.record.values[cell.field.id] === "true");
    case "false":
      return !cells.some(
        (cell) => cell.record.values[cell.field.id] === "true",
      );
    case "gt":
    case "lt":
    case "eq": {
      const value = getRecordFieldNumber(ctx, entity, record, field);
      const operand = parseEntityDecimal(condition.value ?? "");
      if (value == null || !Number.isFinite(operand)) return false;
      if (condition.operator === "gt") return value > operand;
      if (condition.operator === "lt") return value < operand;
      return Math.abs(value - operand) < 0.005;
    }
    case "overdue":
    case "today":
      return cells.some((cell) => {
        if (cell.field.type !== "datetime") return false;
        const state = getEntityDeadlineState(
          cell.entity,
          cell.record,
          cell.field,
          ctx.entities,
          ctx.today,
        );
        return state.status === condition.operator;
      });
    case "on":
    case "before":
    case "after": {
      const operand = extractIsoDate(condition.value ?? "");
      if (!operand) return false;
      return cells.some((cell) => {
        const date = extractIsoDate(cell.record.values[cell.field.id]);
        if (!date) return false;
        if (condition.operator === "on") return date === operand;
        if (condition.operator === "before") return date < operand;
        return date > operand;
      });
    }
    case "withinDays": {
      const days = Math.max(0, Math.round(Number(condition.value ?? "0")) || 0);
      const limit = addCalendarDays(ctx.today, days);
      return cells.some((cell) => {
        const date = extractIsoDate(cell.record.values[cell.field.id]);
        return date != null && date >= ctx.today && date <= limit;
      });
    }
    case "contains": {
      const needle = (condition.value ?? "").trim().toLocaleLowerCase("ru");
      if (!needle) return true;
      return formatRecordFieldValue(ctx, entity, record, field)
        .toLocaleLowerCase("ru")
        .includes(needle);
    }
  }
}

export function matchesEntityConditions(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  conditions: readonly EntityCondition[] | undefined,
  source?: EntityConditionSource | null,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) =>
    matchesEntityCondition(ctx, entity, record, condition, source),
  );
}

/** Record shape for form values that are not saved yet. */
export function createEntityDraftRecord(
  values: Record<string, string | undefined>,
  recordId?: string,
): EntityRecord {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") clean[key] = value;
  }
  return {
    id: recordId ?? "__draft__",
    values: clean,
    authUserId: null,
    createdBy: null,
  };
}

/** Relation on a sub-entity that stores the parent record id. */
export function getEntityParentLinkField(
  entity: Pick<Entity, "fields" | "parentEntityId">,
): EntityField | null {
  const parentId = entity.parentEntityId?.trim() || "";
  if (!parentId) return null;
  return (
    entity.fields.find(
      (field) =>
        field.type === "relation" &&
        getEntityRelationTargetId(field) === parentId,
    ) ?? null
  );
}

/**
 * When `field` targets a nested (sub) entity, find a sibling relation on the
 * same record that targets that sub-entity's parent — e.g. «Юрлицо» for
 * «Кошелёк» (Юрлица → Кошельки). No sibling → no cascade.
 */
export function getRelationNestedParentField(
  entity: Pick<Entity, "fields">,
  field: Pick<EntityField, "id" | "type" | "relationEntityId">,
  entities: ReadonlyArray<Pick<Entity, "id" | "parentEntityId" | "fields">>,
): EntityField | null {
  if (field.type !== "relation") return null;
  const targetId = getEntityRelationTargetId(field);
  if (!targetId) return null;
  const target = entities.find((item) => item.id === targetId);
  const parentEntityId = target?.parentEntityId?.trim() || "";
  if (!parentEntityId) return null;

  return (
    entity.fields.find(
      (candidate) =>
        candidate.type === "relation" &&
        candidate.id !== field.id &&
        getEntityRelationTargetId(candidate) === parentEntityId,
    ) ?? null
  );
}

/** Relation picker options respecting filters and field matches. */
export function getRelationFieldOptions(
  ctx: EntityValueContext,
  entity: Entity,
  values: Record<string, string | undefined>,
  field: EntityField,
  recordId?: string,
): RelationRecordOption[] {
  const target = ctx.entityById.get(getEntityRelationTargetId(field) ?? "");
  if (!target) return [];
  const nameField = target.fields.find((item) => isEntityNameField(item));
  const filter = field.relationFilter;
  const current = createEntityDraftRecord(values, recordId);
  const entities = [...ctx.entityById.values()];
  const nestedParentField = getRelationNestedParentField(
    entity,
    field,
    entities,
  );
  const parentLinkField = nestedParentField
    ? getEntityParentLinkField(target)
    : null;
  const nestedParentIds = nestedParentField
    ? parseEntityRelationIds(values[nestedParentField.id])
    : null;
  const matches = filter?.matches ?? [];
  const conditionSource: EntityConditionSource = {
    entity,
    record: current,
  };

  return target.records
    .filter((candidate) => {
      if (nestedParentField && parentLinkField) {
        if (!nestedParentIds || nestedParentIds.length === 0) return false;
        const linkedParentIds = parseEntityRelationIds(
          candidate.values[parentLinkField.id],
        );
        if (!linkedParentIds.some((id) => nestedParentIds.includes(id))) {
          return false;
        }
      }

      for (const match of matches) {
        const sourceField = findField(entity, match.sourceFieldId);
        const targetField = findField(target, match.targetFieldId);
        if (!sourceField || !targetField) continue;
        const sourceIds = getRecordFieldIds(ctx, entity, current, sourceField);
        // Source empty — no constraint yet (department not chosen).
        if (sourceIds.length === 0) continue;
        const targetIds = getRecordFieldIds(
          ctx,
          target,
          candidate,
          targetField,
        );
        // No shared id → exclude (also drops records without the link filled).
        if (!targetIds.some((id) => sourceIds.includes(id))) return false;
      }

      if (!filter) return true;
      return matchesEntityConditions(
        ctx,
        target,
        candidate,
        filter.conditions,
        conditionSource,
      );
    })
    .map((candidate) => {
      const label = nameField
        ? (candidate.values[nameField.id] ?? "").trim()
        : "";
      return {
        id: candidate.id,
        label: label || "Без названия",
      };
    });
}

/**
 * Set a field value and clear dependent values that became invalid:
 * child lists filtered by this field and relations filtered by it.
 */
export function applyEntityFieldValue(
  entity: Entity,
  values: Record<string, string>,
  fieldId: string,
  value: string,
  entities: readonly Entity[],
): Record<string, string> {
  const next = { ...values, [fieldId]: value };
  const parent = findField(entity, fieldId);
  for (const child of entity.fields) {
    if (child.type !== "list" || child.listDependsOnFieldId !== fieldId) {
      continue;
    }
    const visible = getVisibleListOptions(child, value, parent, entities);
    next[child.id] = sanitizeListValueAgainstOptions(
      next[child.id],
      visible,
      child.listMultiple,
      child.listAllowOther,
    );
  }

  return sanitizeDependentRelationValues(entity, next, entities, fieldId);
}

/** Drop relation values that no longer match filters / nested parent scope. */
function sanitizeDependentRelationValues(
  entity: Entity,
  values: Record<string, string>,
  entities: readonly Entity[],
  changedFieldId?: string,
): Record<string, string> {
  const dependentRelations = entity.fields.filter((child) => {
    if (child.type !== "relation") return false;
    if (changedFieldId && child.id === changedFieldId) return false;
    if (
      changedFieldId &&
      child.relationFilter?.matches.some(
        (match) => match.sourceFieldId === changedFieldId,
      )
    ) {
      return true;
    }
    if (
      changedFieldId &&
      child.relationFilter?.conditions.some(
        (condition) =>
          condition.operator === "equalsRecordField" &&
          condition.value === changedFieldId,
      )
    ) {
      return true;
    }
    // Nested sub-entity relations stay in sync with their parent field.
    return getRelationNestedParentField(entity, child, entities) != null;
  });
  if (dependentRelations.length === 0) return values;

  const ctx = getEntityValueContext(entities);
  const next = { ...values };
  for (const child of dependentRelations) {
    const allowed = new Set(
      getRelationFieldOptions(ctx, entity, next, child).map(
        (option) => option.id,
      ),
    );
    const kept = parseEntityRelationIds(next[child.id]).filter((id) =>
      allowed.has(id),
    );
    next[child.id] = serializeEntityRelationIds(kept);
  }
  return next;
}

/** Align relation values with nested parent scope (e.g. on form open). */
export function sanitizeEntityRelationDependencies(
  entity: Entity,
  values: Record<string, string>,
  entities: readonly Entity[],
): Record<string, string> {
  return sanitizeDependentRelationValues(entity, values, entities);
}

/** Stored default for a new record (`null` — no default). */
export function resolveEntityFieldDefaultValue(
  field: Pick<EntityField, "type" | "defaultValue" | "relationEntityId">,
  currentUserRecordId: string | null,
): string | null {
  const config = field.defaultValue;
  if (!config) return null;
  switch (config.kind) {
    case "today":
      return field.type === "datetime" ? todayIsoDate() : null;
    case "now":
      if (field.type === "time") return nowTimeHHmm();
      return field.type === "datetime"
        ? `${todayIsoDate()}T${nowTimeHHmm()}`
        : null;
    case "currentUser":
      return field.type === "relation" && currentUserRecordId
        ? serializeEntityRelationIds([currentUserRecordId])
        : null;
    case "value":
      return config.value;
  }
}

/** Field renders through `RecordValue` (computed value, progress, deadline). */
export function isRecordValueDecorated(field: EntityField) {
  return (
    field.numberDisplay === "progress" ||
    field.numberSignColor != null ||
    (field.type === "datetime" && field.deadline != null) ||
    field.type === "formula" ||
    field.type === "rollup" ||
    field.type === "lookup" ||
    field.type === "dependencies"
  );
}

/** Fill configured defaults for keys that are not present in `values`. */
export function applyEntityFieldDefaults(
  entity: Pick<Entity, "fields">,
  values: Record<string, string>,
  currentUserRecordId: string | null,
): Record<string, string> {
  let next = values;
  for (const field of entity.fields) {
    if (!field.defaultValue || values[field.id] !== undefined) continue;
    const value = resolveEntityFieldDefaultValue(field, currentUserRecordId);
    if (value == null) continue;
    if (next === values) next = { ...values };
    next[field.id] = value;
  }
  return next;
}

/** Values for «Дублировать»: fields only (no files), name marked as a copy. */
export function getEntityRecordCopyValues(
  entity: Pick<Entity, "fields">,
  record: EntityRecord,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of entity.fields) {
    if (field.type === "file" || isEntityComputedFieldType(field.type)) {
      continue;
    }
    const value = record.values[field.id];
    if (value === undefined) continue;
    values[field.id] =
      isEntityNameField(field) && value.trim()
        ? `${value.trim()} (копия)`
        : value;
  }
  return values;
}

/** Fields a formula of `fieldId` may reference, with editor names. */
export function getEntityFormulaOperands(
  entity: Pick<Entity, "fields">,
  fieldId: string | null,
): Array<{ id: string; name: string }> {
  return entity.fields
    .filter(
      (field) =>
        field.id !== fieldId &&
        field.type !== "file" &&
        field.type !== "dependencies",
    )
    .map((field) => ({ id: field.id, name: getEntityFieldDisplayName(field) }));
}

/** Relation fields of any entity that point to `entityId` (rollup sources). */
export function getEntityRollupSources(
  entities: ReadonlyArray<
    Pick<Entity, "id" | "name" | "namePlural" | "fields">
  >,
  entityId: string,
): Array<{
  entityId: string;
  linkFieldId: string;
  label: string;
}> {
  return entities.flatMap((source) =>
    source.fields
      .filter(
        (field) =>
          field.type === "relation" &&
          getEntityRelationTargetId(field) === entityId,
      )
      .map((field) => ({
        entityId: source.id,
        linkFieldId: field.id,
        label: `${source.namePlural.trim() || source.name.trim() || "Без названия"} · по полю «${field.name.trim() || "Связь"}»`,
      })),
  );
}
