/**
 * Automation condition DSL — parity target with ipk-new automation_conditions.
 * TS evaluator and SQL `automation_conditions_match` must stay in sync.
 */

export const AUTOMATION_CONDITIONS_VERSION = 1 as const;
export const AUTOMATION_CONDITIONS_MAX_RULES = 40;

export type AutomationConditionMatch = "all" | "any";

export const AUTOMATION_CONDITION_OPERATORS = [
  "empty",
  "notEmpty",
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "includesAny",
  "includesAll",
  "true",
  "false",
  "fieldChanged",
  "fieldTransition",
  /** Named folder (files tab / file field) has at least one direct file. */
  "folderHasFiles",
  /** Named folder has no direct files (missing folder counts as empty). */
  "folderEmpty",
] as const;

export type AutomationConditionOperator =
  (typeof AUTOMATION_CONDITION_OPERATORS)[number];

/** Operators that inspect a folder inside a files tree value. */
export const AUTOMATION_FOLDER_FILE_OPERATORS: readonly AutomationConditionOperator[] =
  ["folderHasFiles", "folderEmpty"];

export function isAutomationFolderFileOperator(
  operator: string,
): operator is "folderHasFiles" | "folderEmpty" {
  return (AUTOMATION_FOLDER_FILE_OPERATORS as readonly string[]).includes(
    operator,
  );
}

export type AutomationConditionRule = {
  kind: "rule";
  id: string;
  fieldId: string;
  operator: AutomationConditionOperator;
  /** Scalar or list operand; for fieldTransition: { from?, to? } as JSON string. */
  value?: string;
  values?: string[];
};

export type AutomationConditionGroup = {
  kind: "group";
  id: string;
  match: AutomationConditionMatch;
  rules: AutomationConditionRule[];
};

export type AutomationConditionNode =
  AutomationConditionRule | AutomationConditionGroup;

export type AutomationConditions = {
  version: typeof AUTOMATION_CONDITIONS_VERSION;
  match: AutomationConditionMatch;
  rules: AutomationConditionNode[];
};

export function createAutomationConditionId() {
  return `ac-${crypto.randomUUID()}`;
}

export function emptyAutomationConditions(
  match: AutomationConditionMatch = "all",
): AutomationConditions {
  return { version: AUTOMATION_CONDITIONS_VERSION, match, rules: [] };
}

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

function normalizeRule(raw: Record<string, unknown>, index: number) {
  const fieldId = typeof raw.fieldId === "string" ? raw.fieldId.trim() : "";
  const operator = typeof raw.operator === "string" ? raw.operator : "";
  if (
    !fieldId ||
    !(AUTOMATION_CONDITION_OPERATORS as readonly string[]).includes(operator)
  ) {
    return null;
  }
  const rule: AutomationConditionRule = {
    kind: "rule",
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `ac-rule-${index}-${fieldId}`,
    fieldId,
    operator: operator as AutomationConditionOperator,
  };
  const values = normalizeIds(raw.values);
  if (values.length > 0) rule.values = values;
  if (typeof raw.value === "string" && raw.value.trim()) {
    rule.value = raw.value.trim();
  }
  return rule;
}

function normalizeNode(
  raw: unknown,
  index: number,
): AutomationConditionNode | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (item.kind === "group") {
    const match = item.match === "any" ? "any" : "all";
    const rules: AutomationConditionRule[] = [];
    if (Array.isArray(item.rules)) {
      item.rules.forEach((child, childIndex) => {
        if (!child || typeof child !== "object") return;
        const rule = normalizeRule(
          child as Record<string, unknown>,
          childIndex,
        );
        if (rule) rules.push(rule);
      });
    }
    return {
      kind: "group",
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id.trim()
          : `ac-group-${index}`,
      match,
      rules,
    };
  }
  return normalizeRule(item, index);
}

export function normalizeAutomationConditions(
  value: unknown,
): AutomationConditions {
  if (!value || typeof value !== "object") {
    return emptyAutomationConditions();
  }
  const raw = value as Record<string, unknown>;
  const match = raw.match === "any" ? "any" : "all";
  const rules: AutomationConditionNode[] = [];
  if (Array.isArray(raw.rules)) {
    raw.rules.forEach((item, index) => {
      const node = normalizeNode(item, index);
      if (node) rules.push(node);
    });
  }
  return {
    version: AUTOMATION_CONDITIONS_VERSION,
    match,
    rules: rules.slice(0, AUTOMATION_CONDITIONS_MAX_RULES),
  };
}

export const AUTOMATION_CONDITION_OPERATOR_LABELS: Record<
  AutomationConditionOperator,
  string
> = {
  empty: "пусто",
  notEmpty: "заполнено",
  equals: "равно",
  notEquals: "не равно",
  contains: "содержит",
  notContains: "не содержит",
  gt: "больше",
  gte: "не меньше",
  lt: "меньше",
  lte: "не больше",
  in: "один из",
  notIn: "не из",
  includesAny: "включает любой",
  includesAll: "включает все",
  true: "да",
  false: "нет",
  fieldChanged: "изменилось",
  fieldTransition: "переход",
  folderHasFiles: "есть файлы в папке",
  folderEmpty: "папка пуста",
};
