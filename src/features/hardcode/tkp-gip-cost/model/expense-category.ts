export const REVIEW_EXPENSE_CATEGORIES = [
  "subcontractor",
  "manager_expense",
  "travel_expense",
  "survey",
  "expertise",
  "other_with_coefficient",
  "other_without_coefficient",
] as const;

export type ReviewExpenseCategory = (typeof REVIEW_EXPENSE_CATEGORIES)[number];

export const REVIEW_EXPENSE_CATEGORY_LABELS: Record<
  ReviewExpenseCategory,
  string
> = {
  subcontractor: "Подрядные работы",
  manager_expense: "Расходы менеджера",
  travel_expense: "Командировочные расходы",
  survey: "Изыскания",
  expertise: "Экспертиза",
  other_with_coefficient: "Прочие расходы с коэффициентом",
  other_without_coefficient: "Прочие расходы без коэффициента",
};

const COEFFICIENT_CATEGORIES = new Set<ReviewExpenseCategory>([
  "survey",
  "expertise",
  "other_with_coefficient",
]);

export function normalizeReviewExpenseCategory(
  value: unknown,
): ReviewExpenseCategory | null {
  return typeof value === "string" &&
    REVIEW_EXPENSE_CATEGORIES.includes(value as ReviewExpenseCategory)
    ? (value as ReviewExpenseCategory)
    : null;
}

export function reviewExpenseCategoryRequirements(
  category: ReviewExpenseCategory | null,
): {
  requiresTaxStatus: boolean;
  requiresCoefficient: boolean;
} {
  return {
    requiresTaxStatus: category === "subcontractor",
    requiresCoefficient:
      category !== null && COEFFICIENT_CATEGORIES.has(category),
  };
}

export function reviewExpenseCategoryLabel(
  category: ReviewExpenseCategory | null | undefined,
): string | null {
  return category ? REVIEW_EXPENSE_CATEGORY_LABELS[category] : null;
}
