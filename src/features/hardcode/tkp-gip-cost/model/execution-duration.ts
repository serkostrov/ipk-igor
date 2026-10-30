export function isValidReviewExecutionDuration(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    Number.isInteger(value * 2)
  );
}

export function parseReviewExecutionDuration(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return isValidReviewExecutionDuration(parsed) ? parsed : null;
}

export function formatReviewExecutionDuration(
  value: number | null | undefined,
): string {
  return isValidReviewExecutionDuration(value)
    ? `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раб. дн.`
    : "Не указан";
}

export function calculateReviewExecutionDurationTotal(
  departments: ReadonlyArray<{ execution_duration_days?: number | null }>,
): number {
  return departments.reduce(
    (total, department) => total + (department.execution_duration_days ?? 0),
    0,
  );
}

export function formatReviewExecutionDurationTotal(
  value: number | null | undefined,
): string {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value * 2)
    ? `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раб. дн.`
    : "Не указан";
}

export function resolveReviewGipExecutionDurationHighlight({
  isDepartmentHeadReviewScope,
  departmentsLoaded,
  departments,
  gipExecutionDurationDays,
}: {
  isDepartmentHeadReviewScope: boolean;
  departmentsLoaded: boolean;
  departments: ReadonlyArray<{ execution_duration_days?: number | null }>;
  gipExecutionDurationDays: number | null | undefined;
}): {
  executionDurationDays: number | null | undefined;
  isDepartmentHeadTotal: boolean;
} {
  if (!isDepartmentHeadReviewScope) {
    return {
      executionDurationDays: gipExecutionDurationDays,
      isDepartmentHeadTotal: false,
    };
  }

  if (!departmentsLoaded) {
    return { executionDurationDays: undefined, isDepartmentHeadTotal: false };
  }

  return {
    executionDurationDays: calculateReviewExecutionDurationTotal(departments),
    isDepartmentHeadTotal: true,
  };
}
