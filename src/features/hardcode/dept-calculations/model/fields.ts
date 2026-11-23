/**
 * Field resolvers for the hardcoded «Расчёты отделов» view.
 * Match by display name (tolerant to ё/е and minor wording).
 */

import {
  getEntityFieldDisplayName,
  isEntityNameField,
  isEntityNumericFieldType,
  type Entity,
  type EntityField,
} from "@/entities/entity";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function fieldNameMatches(
  field: EntityField,
  keys: readonly string[],
): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return keys.some((key) => {
    const needle = normalizeName(key);
    return name === needle || name.includes(needle);
  });
}

function findField(
  entity: Entity,
  keys: readonly string[],
  predicate?: (field: EntityField) => boolean,
): EntityField | null {
  return (
    entity.fields.find(
      (field) =>
        (!predicate || predicate(field)) && fieldNameMatches(field, keys),
    ) ?? null
  );
}

/**
 * Prefer an editable `number` with an exact name, then any `number` match,
 * then other numeric types (formula / rollup / numberSum).
 */
function findNumericInputField(
  entity: Entity,
  keys: readonly string[],
  options?: { excludeFieldIds?: ReadonlySet<string> },
): EntityField | null {
  const exclude = options?.excludeFieldIds;
  const candidates = entity.fields.filter((field) => {
    if (exclude?.has(field.id)) return false;
    if (!isEntityNumericFieldType(field.type)) return false;
    return fieldNameMatches(field, keys);
  });
  if (candidates.length === 0) return null;

  const exactNumber = candidates.find((field) => {
    if (field.type !== "number") return false;
    const name = normalizeName(getEntityFieldDisplayName(field));
    return keys.some((key) => name === normalizeName(key));
  });
  if (exactNumber) return exactNumber;

  const numberMatch = candidates.find((field) => field.type === "number");
  if (numberMatch) return numberMatch;

  return candidates[0] ?? null;
}

const DEADLINE_KEYS = [
  "общий срок выполнения работ",
  "срок выполнения работы",
  "срок, раб",
  "срок раб",
  "раб. дни",
  "раб дни",
] as const;

const DESCRIPTION_KEYS = ["описание работ", "описание"] as const;
const COMMENT_KEYS = ["комментарий отдела", "комментарий"] as const;
const STATUS_KEYS = ["статус"] as const;
const FIXED_KEYS = [
  "фиксированные расходы",
  "фикс. расходы",
  "фикс расходы",
  "фикс.расходы",
] as const;
const LABOR_KEYS = ["стоимость трудозатрат", "стоимость труда"] as const;
const TOTAL_KEYS = ["итог отдела", "итог"] as const;
const HOURS_KEYS = ["часы", "общие часы", "hours"] as const;
const SUM_KEYS = [
  "сумма",
  "сумма расходов",
  "фикс. сумма",
  "фикс сумма",
  "amount",
] as const;
const SUM_WITH_COEFF_KEYS = [
  "сумма с коэффициентом",
  "сумма с коэф",
  "сумма с коэф.",
] as const;
const CALC_TYPE_KEYS = [
  "тип расчета",
  "тип расчёта",
  "тип рассчета",
  "calculation type",
  "calc type",
] as const;
const COST_KEYS = ["стоимость"] as const;
const COST_WITH_TAX_KEYS = ["стоимость с налогом"] as const;
const CATEGORY_KEYS = ["категория расходов", "категория"] as const;
const TAX_STATUS_KEYS = ["налоговый статус"] as const;
const TAX_KEYS = ["налог"] as const;
const COEFFICIENT_KEYS = ["коэффициент"] as const;

function nameLooksLikeSumWithCoeff(field: EntityField): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return name.includes("коэффициент") || name.includes("коэф");
}

export type DeptCalculationsHostFields = {
  deadline: EntityField | null;
  description: EntityField | null;
  comment: EntityField | null;
  status: EntityField | null;
  fixedExpenses: EntityField | null;
  laborCost: EntityField | null;
  total: EntityField | null;
  hours: EntityField | null;
};

export type DeptCalculationsSubtaskFields = {
  name: EntityField | null;
  calcType: EntityField | null;
  hours: EntityField | null;
  sum: EntityField | null;
  /** Formula «Сумма с коэффициентом» — cost with tax × coefficient. */
  sumWithCoeff: EntityField | null;
  /** Formula «Стоимость» — hours × rate, or the entered sum. */
  cost: EntityField | null;
  /** Formula «Стоимость с налогом». */
  costWithTax: EntityField | null;
  category: EntityField | null;
  taxStatus: EntityField | null;
  tax: EntityField | null;
  coefficient: EntityField | null;
  comment: EntityField | null;
};

export function resolveDeptCalculationsHostFields(
  entity: Entity,
): DeptCalculationsHostFields {
  const deadline = findField(entity, DEADLINE_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const description = findField(
    entity,
    DESCRIPTION_KEYS,
    (field) => field.type === "text" || field.type === "textarea",
  );
  const comment =
    findField(
      entity,
      COMMENT_KEYS,
      (field) => field.type === "text" || field.type === "textarea",
    ) ?? description;
  const status = findField(
    entity,
    STATUS_KEYS,
    (field) => field.type === "list",
  );
  const fixedExpenses = findField(entity, FIXED_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const laborCost = findField(entity, LABOR_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const total =
    findField(entity, TOTAL_KEYS, (field) =>
      isEntityNumericFieldType(field.type),
    ) ?? laborCost;
  const hours = findField(entity, HOURS_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  return {
    deadline,
    description,
    comment,
    status,
    fixedExpenses,
    laborCost,
    total,
    hours,
  };
}

export function resolveDeptCalculationsSubtaskFields(
  entity: Entity,
): DeptCalculationsSubtaskFields {
  const name = entity.fields.find((field) => isEntityNameField(field)) ?? null;
  // Prefer a list named «Тип расчёта»; fall back to any matching field, then
  // a lone list field whose name is exactly «Тип».
  const calcType =
    findField(entity, CALC_TYPE_KEYS, (field) => field.type === "list") ??
    findField(entity, CALC_TYPE_KEYS) ??
    entity.fields.find((field) => {
      if (field.type !== "list") return false;
      const n = normalizeName(getEntityFieldDisplayName(field));
      return n === "тип" || n.startsWith("тип ");
    }) ??
    null;
  // Prefer real number inputs over formula/rollup with the same name —
  // «Сумма» formula that mirrors cost often stays empty while the number
  // input holds the amount for type «Сумма».
  const hours = findNumericInputField(entity, HOURS_KEYS);
  const sumWithCoeff = findNumericInputField(entity, SUM_WITH_COEFF_KEYS, {
    excludeFieldIds: hours ? new Set([hours.id]) : undefined,
  });
  const usedIds = new Set(
    [hours?.id, sumWithCoeff?.id].filter((id): id is string => Boolean(id)),
  );
  // «Сумма» must not bind to «Сумма с коэффициентом» (name includes «сумма»).
  const sumCandidates = entity.fields.filter((field) => {
    if (usedIds.has(field.id)) return false;
    if (!isEntityNumericFieldType(field.type)) return false;
    if (nameLooksLikeSumWithCoeff(field)) return false;
    return fieldNameMatches(field, SUM_KEYS);
  });
  const sum =
    sumCandidates.find((field) => {
      if (field.type !== "number") return false;
      const name = normalizeName(getEntityFieldDisplayName(field));
      return SUM_KEYS.some((key) => name === normalizeName(key));
    }) ??
    sumCandidates.find((field) => field.type === "number") ??
    sumCandidates[0] ??
    null;
  if (sum) usedIds.add(sum.id);

  const costWithTax = findNumericInputField(entity, COST_WITH_TAX_KEYS, {
    excludeFieldIds: usedIds,
  });
  if (costWithTax) usedIds.add(costWithTax.id);
  const cost =
    findNumericInputField(entity, COST_KEYS, {
      excludeFieldIds: usedIds,
    }) ??
    findNumericInputField(entity, LABOR_KEYS, {
      excludeFieldIds: usedIds,
    });
  const category = findField(
    entity,
    CATEGORY_KEYS,
    (field) => field.type === "list",
  );
  const taxStatus = findField(
    entity,
    TAX_STATUS_KEYS,
    (field) => field.type === "list",
  );
  const tax = findNumericInputField(entity, TAX_KEYS, {
    excludeFieldIds: new Set(
      [costWithTax?.id, cost?.id, sumWithCoeff?.id].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  });
  const coefficient = findNumericInputField(entity, COEFFICIENT_KEYS, {
    excludeFieldIds: new Set(
      [sumWithCoeff?.id].filter((id): id is string => Boolean(id)),
    ),
  });
  const comment = findField(
    entity,
    COMMENT_KEYS,
    (field) => field.type === "text" || field.type === "textarea",
  );
  return {
    name,
    calcType,
    hours,
    sum,
    sumWithCoeff,
    cost,
    costWithTax,
    category,
    taxStatus,
    tax,
    coefficient,
    comment,
  };
}
