/**
 * Cost / hours breakdown for «Расчёты отделов» —
 * mirrors ipk-new `calculateReviewDepartmentBreakdown` over entity fields.
 */

import {
  canMergeEntityTableFields,
  entityRelationIncludesId,
  formatEntityDecimalTotal,
  formatEntityListFieldValue,
  formatRecordFieldValue,
  getEntityListOption,
  getEntityListOptions,
  getEntityRecordTitle,
  getRecordFieldNumber,
  isEntityFieldVisibleByConditions,
  isEntityNameField,
  isEntityNumericFieldType,
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  resolveEntityTableDisplayColumnField,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTableDisplayColumn,
  type EntityTableNestedTarget,
  type EntityValueContext,
} from "@/entities/entity";
import {
  resolveDeptCalculationsHostFields,
  resolveDeptCalculationsSubtaskFields,
  type DeptCalculationsHostFields,
  type DeptCalculationsSubtaskFields,
} from "./fields";

export type DeptCalculationsBreakdown = {
  hours: number;
  laborCost: number;
  fixedExpenses: number;
  total: number;
  lineCount: number;
  lineTitles: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nonNegative(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function normalizeCalcTypeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function calcTypeNameIsHours(name: string): boolean {
  const normalized = normalizeCalcTypeName(name);
  if (!normalized) return true;
  if (
    normalized.includes("сумм") ||
    normalized.includes("фикс") ||
    normalized.includes("amount") ||
    normalized.includes("fixed")
  ) {
    return false;
  }
  return true;
}

function resolveCalcTypeOptionName(
  entities: readonly Entity[],
  field: EntityField,
  raw: string | undefined,
): string | null {
  if (field.type === "list") {
    const formatted = formatEntityListFieldValue(field, raw, entities).trim();
    if (formatted && formatted !== "—") return formatted;

    const options = resolveEntityListFieldOptions(field, entities);
    const selected = getEntityListOptions(options, raw);
    if (selected[0]?.name?.trim()) return selected[0].name.trim();

    // Plain-text / legacy value: match option by name.
    const rawText = (raw ?? "").trim();
    if (rawText) {
      const byName = options.find(
        (item) =>
          normalizeCalcTypeName(item.name) === normalizeCalcTypeName(rawText),
      );
      if (byName?.name.trim()) return byName.name.trim();
      const optionId = parseEntityListValueIds(rawText)[0];
      const byId = getEntityListOption(options, optionId ?? rawText);
      if (byId?.name.trim()) return byId.name.trim();
      // Stored label itself (e.g. «Часы»).
      if (/[а-яa-z]/i.test(rawText) && !optionId) return rawText;
      if (
        optionId &&
        optionId === rawText &&
        /[а-яa-z]/i.test(rawText) &&
        !options.some((item) => item.id === rawText)
      ) {
        return rawText;
      }
    }
    return null;
  }

  return null;
}

function calcTypeIsHours(
  entities: readonly Entity[],
  field: EntityField | null,
  raw: string | undefined,
): boolean {
  if (!field) return true;
  const name = resolveCalcTypeOptionName(entities, field, raw);
  if (!name) return true;
  return calcTypeNameIsHours(name);
}

/**
 * «Часы» / «Сумма» and any numeric siblings merged by the same visibility
 * controller + table position (same rule as entity table columns).
 */
function collectHoursSumAlternatives(
  entity: Entity,
  fields: DeptCalculationsSubtaskFields,
): EntityField[] {
  const seeds = [fields.hours, fields.sum].filter(
    (field): field is EntityField => field != null,
  );
  if (seeds.length === 0) return [];
  const seen = new Set(seeds.map((field) => field.id));
  const out = [...seeds];
  for (const seed of seeds) {
    for (const field of entity.fields) {
      if (seen.has(field.id)) continue;
      if (!isEntityNumericFieldType(field.type)) continue;
      if (!canMergeEntityTableFields(seed, field)) continue;
      seen.add(field.id);
      out.push(field);
    }
  }
  return out;
}

function firstNumericValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  candidates: readonly (EntityField | null | undefined)[],
): number | null {
  for (const field of candidates) {
    if (!field) continue;
    const value = getRecordFieldNumber(ctx, entity, record, field);
    if (value != null) return value;
  }
  return null;
}

/**
 * Value for the «Часы / сумма» column: visible field of the hours↔sum pair
 * first (visibilityConditions on тип расчёта), then coalesce across the pair
 * and «Стоимость» so a filled amount is never shown as «—».
 */
function readDeptLineHoursOrSumValue(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  fields: DeptCalculationsSubtaskFields,
  isHours: boolean,
): number | null {
  const alternatives = collectHoursSumAlternatives(entity, fields);
  if (alternatives.length > 0) {
    const column: EntityTableDisplayColumn = {
      id: "dept-hours-sum",
      label: "Часы/Сумма",
      fields: alternatives,
    };
    const active = resolveEntityTableDisplayColumnField(
      ctx,
      entity,
      record,
      column,
    );
    const visible = alternatives.filter((field) =>
      isEntityFieldVisibleByConditions(ctx, entity, record, field),
    );
    const preferred = isHours
      ? (visible.find((field) => field.id === fields.hours?.id) ??
        visible[0] ??
        active)
      : (visible.find((field) => field.id === fields.sum?.id) ??
        visible[0] ??
        active);

    const fromPreferred = preferred
      ? getRecordFieldNumber(ctx, entity, record, preferred)
      : null;
    if (fromPreferred != null) return fromPreferred;

    const fromVisible = firstNumericValue(ctx, entity, record, visible);
    if (fromVisible != null) return fromVisible;

    const fromPair = firstNumericValue(ctx, entity, record, alternatives);
    if (fromPair != null) return fromPair;
  }

  if (isHours) {
    return firstNumericValue(ctx, entity, record, [fields.hours]);
  }

  // Sum type: «Сумма» → paired/visible → «Стоимость» → «Часы» (value often
  // landed in hours when only that input was filled).
  return firstNumericValue(ctx, entity, record, [
    fields.sum,
    fields.cost,
    fields.hours,
  ]);
}

function nestedLinesForHost(
  host: EntityRecord,
  nested: EntityTableNestedTarget | null,
): EntityRecord[] {
  if (!nested) return [];
  return nested.entity.records.filter((child) =>
    entityRelationIncludesId(child.values[nested.parentLinkFieldId], host.id),
  );
}

export function calculateDeptCalculationsBreakdown(
  ctx: EntityValueContext,
  hostEntity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  nested: EntityTableNestedTarget | null,
  hostFields: DeptCalculationsHostFields = resolveDeptCalculationsHostFields(
    hostEntity,
  ),
  lineFields: DeptCalculationsSubtaskFields | null = nested
    ? resolveDeptCalculationsSubtaskFields(nested.entity)
    : null,
): DeptCalculationsBreakdown {
  const lines = nestedLinesForHost(record, nested);

  if (lines.length > 0 && nested && lineFields) {
    let hours = 0;
    let laborCost = 0;
    let fixedExpenses = 0;
    const lineTitles: string[] = [];

    for (const line of lines) {
      const title = lineFields.name
        ? getEntityRecordTitle(ctx, nested.entity, line)
        : "—";
      if (title.trim() && title !== "—") lineTitles.push(title);

      const isHours = calcTypeIsHours(
        entities,
        lineFields.calcType,
        line.values[lineFields.calcType?.id ?? ""],
      );
      const amountValue = readDeptLineHoursOrSumValue(
        ctx,
        nested.entity,
        line,
        lineFields,
        isHours,
      );
      const costValue = lineFields.cost
        ? getRecordFieldNumber(ctx, nested.entity, line, lineFields.cost)
        : null;

      if (isHours) {
        hours += nonNegative(amountValue);
        laborCost += nonNegative(costValue);
      } else {
        // Amount from «Сумма» / paired field; cost only if amount is empty.
        fixedExpenses += nonNegative(amountValue ?? costValue);
      }
    }

    const legacyFixed = hostFields.fixedExpenses
      ? nonNegative(
          getRecordFieldNumber(
            ctx,
            hostEntity,
            record,
            hostFields.fixedExpenses,
          ),
        )
      : 0;

    hours = round2(hours);
    laborCost = round2(laborCost);
    fixedExpenses = round2(fixedExpenses + legacyFixed);

    return {
      hours,
      laborCost,
      fixedExpenses,
      total: round2(laborCost + fixedExpenses),
      lineCount: lines.length,
      lineTitles,
    };
  }

  const hours = hostFields.hours
    ? nonNegative(
        getRecordFieldNumber(ctx, hostEntity, record, hostFields.hours),
      )
    : 0;
  const laborCost = hostFields.laborCost
    ? nonNegative(
        getRecordFieldNumber(ctx, hostEntity, record, hostFields.laborCost),
      )
    : 0;
  const fixedExpenses = hostFields.fixedExpenses
    ? nonNegative(
        getRecordFieldNumber(ctx, hostEntity, record, hostFields.fixedExpenses),
      )
    : 0;
  const total = hostFields.total
    ? nonNegative(
        getRecordFieldNumber(ctx, hostEntity, record, hostFields.total),
      )
    : round2(laborCost + fixedExpenses);

  return {
    hours: round2(hours),
    laborCost: round2(laborCost),
    fixedExpenses: round2(fixedExpenses),
    total: round2(total),
    lineCount: 0,
    lineTitles: [],
  };
}

export function formatDeptHours(value: number): string {
  return formatEntityDecimalTotal(value);
}

export function formatDeptMoney(value: number): string {
  return `${formatEntityDecimalTotal(value)} ₽`;
}

export function formatDeptDeadlineDays(value: number | null): string {
  if (value == null) return "—";
  return `${formatEntityDecimalTotal(value)} раб. дн.`;
}

export function resolveDeptLineHoursOrSum(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  fields: DeptCalculationsSubtaskFields,
): { label: string; value: number | null; isHours: boolean } {
  const isHours = calcTypeIsHours(
    entities,
    fields.calcType,
    record.values[fields.calcType?.id ?? ""],
  );
  const value = readDeptLineHoursOrSumValue(
    ctx,
    entity,
    record,
    fields,
    isHours,
  );
  return {
    label: isHours ? "Часы" : "Сумма",
    value,
    isHours,
  };
}

/**
 * Display label for «Тип расчёта» on a subtask line.
 * Resolves list options (incl. linked catalogs); falls back to «Часы»/«Сумма».
 */
export function resolveDeptCalcTypeLabel(
  entities: readonly Entity[],
  field: EntityField | null,
  raw: string | undefined,
  fallbackIsHours = true,
): string {
  if (field) {
    if (field.type === "list") {
      const name = resolveCalcTypeOptionName(entities, field, raw);
      if (name) return name;
    } else {
      const text = (raw ?? "").trim();
      if (text) return text;
    }
  }
  return fallbackIsHours ? "Часы" : "Сумма";
}

/** Label with live formatting when a value context is available. */
export function resolveDeptCalcTypeLabelForRecord(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  fields: DeptCalculationsSubtaskFields,
): string {
  const field = fields.calcType;
  const raw = field ? record.values[field.id] : undefined;
  if (field && field.type !== "list") {
    const formatted = formatRecordFieldValue(ctx, entity, record, field).trim();
    if (formatted && formatted !== "—") return formatted;
  }
  const isHours = calcTypeIsHours(entities, field, raw);
  return resolveDeptCalcTypeLabel(entities, field, raw, isHours);
}

export function getDeptNestedLines(
  host: EntityRecord,
  nested: EntityTableNestedTarget | null,
): EntityRecord[] {
  return nestedLinesForHost(host, nested);
}

export function resolveDeptLineTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  fields: DeptCalculationsSubtaskFields,
): string {
  if (fields.name) {
    return getEntityRecordTitle(ctx, entity, record);
  }
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (nameField) return getEntityRecordTitle(ctx, entity, record);
  return "—";
}
