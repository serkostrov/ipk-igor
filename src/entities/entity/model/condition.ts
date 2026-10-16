/** Value family of a field for conditions and formulas. */
export type EntityValueKind =
  "list" | "relation" | "boolean" | "number" | "date" | "text";

export type EntityConditionOperator =
  | "empty"
  | "notEmpty"
  | "in"
  | "notIn"
  | "final"
  | "notFinal"
  | "problem"
  | "isCurrentUser"
  | "equalsCurrentUserField"
  | "equalsRecordField"
  | "true"
  | "false"
  | "gt"
  | "lt"
  | "eq"
  | "overdue"
  | "today"
  | "on"
  | "before"
  | "after"
  | "withinDays"
  | "contains";

/** One filter rule on a record field (all rules of a set must match). */
export type EntityCondition = {
  id: string;
  fieldId: string;
  operator: EntityConditionOperator;
  /** Option / record ids for `in` / `notIn`. */
  values?: string[];
  /**
   * Scalar operand: number for `gt` / `lt` / `eq`, days for `withinDays`,
   * ISO date for `on` / `before` / `after`, text for `contains`,
   * Users field id for `equalsCurrentUserField`,
   * source-entity field id for `equalsRecordField`.
   */
  value?: string;
};

export const ENTITY_CONDITION_OPERATOR_LABELS: Record<
  EntityConditionOperator,
  string
> = {
  empty: "пусто",
  notEmpty: "заполнено",
  in: "один из",
  notIn: "не из",
  final: "завершающий",
  notFinal: "не завершающий",
  problem: "проблемный",
  isCurrentUser: "текущий пользователь",
  equalsCurrentUserField: "как у текущего пользователя",
  equalsRecordField: "как в этой записи",
  true: "да",
  false: "нет",
  gt: "больше",
  lt: "меньше",
  eq: "равно",
  overdue: "просрочено",
  today: "сегодня",
  on: "в день",
  before: "раньше",
  after: "позже",
  withinDays: "в ближайшие N дней",
  contains: "содержит",
};

export const ENTITY_VALUE_KIND_LABELS: Record<EntityValueKind, string> = {
  list: "Список",
  relation: "Связь",
  boolean: "Да/Нет",
  number: "Число",
  date: "Дата",
  text: "Текст",
};

const OPERATORS_BY_KIND: Record<EntityValueKind, EntityConditionOperator[]> = {
  list: [
    "in",
    "notIn",
    "final",
    "notFinal",
    "problem",
    "equalsRecordField",
    "empty",
    "notEmpty",
  ],
  relation: [
    "in",
    "notIn",
    "isCurrentUser",
    "equalsCurrentUserField",
    "equalsRecordField",
    "empty",
    "notEmpty",
  ],
  boolean: ["true", "false", "empty", "notEmpty"],
  number: ["gt", "lt", "eq", "empty", "notEmpty"],
  date: [
    "on",
    "before",
    "after",
    "overdue",
    "today",
    "withinDays",
    "empty",
    "notEmpty",
  ],
  text: ["contains", "empty", "notEmpty"],
};

export function getEntityConditionOperators(
  kind: EntityValueKind,
): EntityConditionOperator[] {
  return OPERATORS_BY_KIND[kind];
}

/** Keep the operator if valid for `kind`, otherwise the first available. */
export function resolveEntityConditionOperator(
  kind: EntityValueKind,
  operator: EntityConditionOperator,
): EntityConditionOperator {
  const operators = OPERATORS_BY_KIND[kind];
  return operators.includes(operator) ? operator : operators[0]!;
}

/** Operators that need an operand input. */
export function entityConditionNeedsValue(operator: EntityConditionOperator) {
  return (
    operator === "in" ||
    operator === "notIn" ||
    operator === "equalsCurrentUserField" ||
    operator === "equalsRecordField" ||
    operator === "gt" ||
    operator === "lt" ||
    operator === "eq" ||
    operator === "on" ||
    operator === "before" ||
    operator === "after" ||
    operator === "withinDays" ||
    operator === "contains"
  );
}

const OPERATORS = new Set<string>(
  Object.keys(ENTITY_CONDITION_OPERATOR_LABELS),
);

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
}

export function normalizeEntityConditions(value: unknown): EntityCondition[] {
  if (!Array.isArray(value)) return [];
  const result: EntityCondition[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const raw = item as Record<string, unknown>;
    const fieldId = typeof raw.fieldId === "string" ? raw.fieldId.trim() : "";
    const operator = typeof raw.operator === "string" ? raw.operator : "";
    if (!fieldId || !OPERATORS.has(operator)) return;
    const condition: EntityCondition = {
      id:
        typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : `condition-${index}-${fieldId}`,
      fieldId,
      operator: operator as EntityConditionOperator,
    };
    const values = normalizeIds(raw.values);
    if (values.length > 0) condition.values = values;
    if (typeof raw.value === "string" && raw.value.trim()) {
      condition.value = raw.value.trim();
    }
    result.push(condition);
  });
  return result;
}

export function createEntityConditionId() {
  return `condition-${crypto.randomUUID()}`;
}
