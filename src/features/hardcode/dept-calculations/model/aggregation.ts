/**
 * Cost / hours breakdown for «Расчёты отделов» —
 * mirrors ipk-new `calculateReviewDepartmentBreakdown` over entity fields.
 */

import {
  entityRelationIncludesId,
  formatEntityDecimalTotal,
  formatEntityListFieldValue,
  formatRecordFieldValue,
  getEntityListOption,
  getEntityListOptions,
  getEntityRecordTitle,
  getRecordFieldNumber,
  isEntityNameField,
  parseEntityListValueIds,
  resolveEntityListFieldOptions,
  type Entity,
  type EntityField,
  type EntityRecord,
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
      const hoursValue = lineFields.hours
        ? getRecordFieldNumber(ctx, nested.entity, line, lineFields.hours)
        : null;
      const sumValue = lineFields.sum
        ? getRecordFieldNumber(ctx, nested.entity, line, lineFields.sum)
        : null;
      const costValue = lineFields.cost
        ? getRecordFieldNumber(ctx, nested.entity, line, lineFields.cost)
        : null;

      if (isHours) {
        hours += nonNegative(hoursValue);
        laborCost += nonNegative(costValue);
      } else {
        fixedExpenses += nonNegative(costValue != null ? costValue : sumValue);
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
  if (isHours) {
    const value = fields.hours
      ? getRecordFieldNumber(ctx, entity, record, fields.hours)
      : null;
    return { label: "Часы", value, isHours: true };
  }
  const value = fields.sum
    ? getRecordFieldNumber(ctx, entity, record, fields.sum)
    : fields.cost
      ? getRecordFieldNumber(ctx, entity, record, fields.cost)
      : null;
  return { label: "Сумма", value, isHours: false };
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
