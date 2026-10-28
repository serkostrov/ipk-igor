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
const HOURS_KEYS = ["часы", "общие часы"] as const;
const SUM_KEYS = ["сумма"] as const;
const CALC_TYPE_KEYS = ["тип расчета", "тип расчёта"] as const;
const COST_KEYS = ["стоимость"] as const;

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
  cost: EntityField | null;
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
  const calcType = findField(
    entity,
    CALC_TYPE_KEYS,
    (field) => field.type === "list",
  );
  const hours = findField(entity, HOURS_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const sum = findField(entity, SUM_KEYS, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const cost =
    findField(entity, COST_KEYS, (field) =>
      isEntityNumericFieldType(field.type),
    ) ??
    findField(entity, LABOR_KEYS, (field) =>
      isEntityNumericFieldType(field.type),
    );
  const comment = findField(
    entity,
    COMMENT_KEYS,
    (field) => field.type === "text" || field.type === "textarea",
  );
  return { name, calcType, hours, sum, cost, comment };
}
