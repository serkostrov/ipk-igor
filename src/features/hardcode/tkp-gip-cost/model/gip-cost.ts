import {
  PreciseDecimal,
  sumPreciseDecimals,
} from "@/shared/lib/precise-decimal";
import {
  normalizeReviewExpenseCategory,
  reviewExpenseCategoryLabel,
  type ReviewExpenseCategory,
} from "./expense-category";

/** Stub — rates come from stored line costs in the entity CRM. */
function calculatePlanRateRaw(salary: number | null): number | null {
  void salary;
  return null;
}

export const REVIEW_LINE_CALCULATION_TYPES = ["hours", "amount"] as const;
export type ReviewLineCalculationType =
  (typeof REVIEW_LINE_CALCULATION_TYPES)[number];

export const REVIEW_LINE_TAX_STATUSES = ["СЗ", "ГПХ", "ИП", "ООО"] as const;
export type ReviewLineTaxStatus = (typeof REVIEW_LINE_TAX_STATUSES)[number];

export const DEFAULT_REVIEW_LINE_COEFFICIENT = 1.2;
export const REVIEW_GIP_FIXED_RATE = 0.3;
export const REVIEW_GIP_FORMULA_VERSION_V2 =
  "confirmed-sheet-2026-08-07" as const;
export const REVIEW_GIP_FORMULA_VERSION =
  "reference-sheet-full-precision-2026-08-08" as const;
export const REVIEW_GIP_ROUNDING_POLICY_V2 = {
  moneyDecimals: 2,
  aggregate: "sum_rounded_items",
} as const;
export const REVIEW_GIP_ROUNDING_POLICY = {
  moneyDecimals: 2,
  decimalScale: 18,
  aggregate: "round_final_totals",
} as const;

export type DepartmentRateMember = {
  profile_id: string;
  is_active: boolean;
  salary_amount: number | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeReviewLineCalculationType(
  value: unknown,
): ReviewLineCalculationType {
  return value === "amount" ? "amount" : "hours";
}

export function normalizeReviewLineTaxStatus(
  value: unknown,
): ReviewLineTaxStatus | null {
  return REVIEW_LINE_TAX_STATUSES.includes(value as ReviewLineTaxStatus)
    ? (value as ReviewLineTaxStatus)
    : null;
}

export function calculateAverageDepartmentRate(
  members: DepartmentRateMember[],
): number | null {
  const rates = members
    .filter((member) => member.is_active)
    .map((member) => calculatePlanRateRaw(member.salary_amount))
    .filter((rate): rate is number => rate !== null);

  if (rates.length === 0) return null;
  return sumPreciseDecimals(rates.map((rate) => PreciseDecimal.from(rate)))
    .divide(PreciseDecimal.from(rates.length))
    .toNumber();
}

export function calculateReviewDepartmentLineCostFromRate(
  plannedHours: number,
  averageDepartmentRate: number | null,
): { cost: number; hourlyRateSnapshot: number | null } {
  const normalizedHours = Math.max(0, Number(plannedHours) || 0);
  const normalizedRate =
    typeof averageDepartmentRate === "number" &&
    Number.isFinite(averageDepartmentRate) &&
    averageDepartmentRate >= 0
      ? averageDepartmentRate
      : null;

  if (normalizedHours <= 0 || normalizedRate === null) {
    return { cost: 0, hourlyRateSnapshot: null };
  }

  return {
    cost: PreciseDecimal.from(normalizedHours)
      .multiply(PreciseDecimal.from(normalizedRate))
      .toNumber(),
    hourlyRateSnapshot: normalizedRate,
  };
}

export function calculateReviewDepartmentLineValue({
  calculationType,
  plannedHours,
  fixedAmount,
  averageDepartmentRate,
}: {
  calculationType: ReviewLineCalculationType;
  plannedHours: unknown;
  fixedAmount: unknown;
  averageDepartmentRate: number | null;
}): { plannedHours: number; cost: number; hourlyRateSnapshot: number | null } {
  if (calculationType === "amount") {
    return {
      plannedHours: 0,
      cost: nonNegativeNumber(fixedAmount),
      hourlyRateSnapshot: null,
    };
  }

  const normalizedHours = nonNegativeNumber(plannedHours);
  const calculated = calculateReviewDepartmentLineCostFromRate(
    normalizedHours,
    averageDepartmentRate,
  );
  return { plannedHours: normalizedHours, ...calculated };
}

export type ReviewCostBreakdownLine = {
  id?: unknown;
  title?: unknown;
  department_id?: unknown;
  department_name?: unknown;
  project_stage_id?: unknown;
  project_stage_name?: unknown;
  calculation_type?: unknown;
  planned_hours?: unknown;
  cost?: unknown;
  hourly_rate_snapshot?: unknown;
  expense_category_snapshot?: unknown;
  requires_tax_status_snapshot?: unknown;
  tax_status_snapshot?: unknown;
  tax_rate_snapshot?: unknown;
  requires_coefficient_snapshot?: unknown;
  coefficient_snapshot?: unknown;
};

export type ReviewCostBreakdownDepartment = {
  department_id?: unknown;
  department_name?: unknown;
  project_stage_id?: unknown;
  project_stage_name?: unknown;
  planned_hours?: unknown;
  cost?: unknown;
  expenses?: unknown;
  lines?: ReviewCostBreakdownLine[] | null;
};

export type ReviewStageCostBreakdown<T extends ReviewCostBreakdownDepartment> =
  {
    projectStageId: string | null;
    projectStageName: string;
    departments: T[];
    totals: ReturnType<typeof calculateReviewCostBreakdown>;
  };

/** The stage header is the sum of visible department rows, without a stage-level FIX. */
export function calculateReviewStageDisplayedTotal<
  T extends ReviewCostBreakdownDepartment,
>(stage: ReviewStageCostBreakdown<T>, showExpenses: boolean): number {
  return stage.departments.reduce(
    (sum, department) =>
      sum +
      calculateReviewDepartmentDisplayedTotal(
        calculateReviewDepartmentBreakdown(department),
        showExpenses,
      ),
    0,
  );
}

export type ReviewGipSourceKind =
  | "department_line"
  | "legacy_department_labor"
  | "legacy_department_expense"
  | "review_trip"
  | "review_subcontractor";

export type ReviewGipCostItem = {
  sourceKind: ReviewGipSourceKind;
  sourceId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  projectStageId: string | null;
  projectStageName: string | null;
  lineId: string | null;
  title: string;
  category: ReviewExpenseCategory | null;
  plannedHours: number;
  hourlyRate: number | null;
  sourceAmount: number;
  taxStatus: ReviewLineTaxStatus | null;
  taxRate: number | null;
  taxAmount: number;
  amountBeforeCoefficient: number;
  coefficient: number;
  coefficientAdjustment: number;
  amountAfterCoefficient: number;
  rawValues?: ReviewGipCostItemRawValues;
};

export type ReviewGipCostItemRawValues = {
  sourceAmount: string;
  taxAmount: string;
  amountBeforeCoefficient: string;
  coefficientAdjustment: string;
  amountAfterCoefficient: string;
};

export type ReviewDepartmentLineCostAdjustment = Pick<
  ReviewGipCostItem,
  | "sourceAmount"
  | "taxStatus"
  | "taxRate"
  | "taxAmount"
  | "amountBeforeCoefficient"
  | "coefficient"
  | "coefficientAdjustment"
  | "amountAfterCoefficient"
  | "rawValues"
>;

export type ReviewGipCostGroupKey =
  "labor" | "expenses_and_trips" | "contractor";

export type ReviewGipCostGroup = {
  key: ReviewGipCostGroupKey;
  label: string;
  treatment: "fixed_base" | "separate_after_fixed";
  sourceSubtotal: number;
  taxSubtotal: number;
  subtotalBeforeCoefficient: number;
  coefficientAdjustment: number;
  totalAfterCoefficient: number;
  items: ReviewGipCostItem[];
  rawValues?: Omit<
    ReviewGipCostItemRawValues,
    "sourceAmount" | "amountAfterCoefficient"
  > & {
    sourceSubtotal: string;
    totalAfterCoefficient: string;
  };
};

export type ReviewGipContractorLine = {
  id: string | null;
  title: string;
  sourceAmount: number;
  taxStatus?: ReviewLineTaxStatus | null;
  taxRate?: number | null;
  taxAmount?: number;
  amountBeforeCoefficient?: number;
  coefficient: number;
  coefficientAdjustment?: number;
  amountAfterCoefficient?: number;
  totalAmount: number;
};

type ReviewGipCostCalculationAliases = {
  laborCost: number;
  expensesAndTrips: number;
  upperBase: number;
  fixedRate: number;
  fixedAmount: number;
  costWithFixed: number;
  /** Full-precision Excel calculation base; UI continues to display costWithFixed. */
  costWithFixedRaw?: number;
  contractorLines: ReviewGipContractorLine[];
  contractorTotal: number;
  contractorWorkLines?: ReviewGipContractorLine[];
  contractorWorkTotal?: number;
  additionalWorkLines?: ReviewGipContractorLine[];
  additionalWorkTotal?: number;
};

export type ReviewGipCommercialBasis = {
  costWithFixed: number;
  contractorWorkTotal: number;
  additionalWorkTotal: number;
  /** Суммы до применения повышающего коэффициента. Требуются формулой прибыли V7. */
  contractorWorkBase?: number;
  additionalWorkBase?: number;
  raw?: {
    costWithFixed: string;
    contractorWorkTotal: string;
    additionalWorkTotal: string;
    contractorWorkBase?: string;
    additionalWorkBase?: string;
  };
};

export type ReviewGipRawValues = {
  laborCost: string;
  expensesAndTrips: string;
  contractorSubtotalBeforeCoefficient: string;
  contractorTotalAfterCoefficient: string;
  costBeforeFixed: string;
  fixedAmount: string;
  projectCost: string;
  contractorWorkTotal: string;
  additionalWorkTotal: string;
  totalAmount: string;
};

export type ReviewGipCostCalculationV1 = ReviewGipCostCalculationAliases & {
  /** Legacy snapshots were saved before calculationVersion existed. */
  calculationVersion?: 1;
};

export type ReviewGipCostCalculationV2 = ReviewGipCostCalculationAliases & {
  calculationVersion: 2;
  formulaVersion: typeof REVIEW_GIP_FORMULA_VERSION_V2;
  roundingPolicy: typeof REVIEW_GIP_ROUNDING_POLICY_V2;
  totalHours: number;
  contractorSubtotalBeforeCoefficient: number;
  contractorTotalAfterCoefficient: number;
  costBeforeFixed: number;
  projectCost: number;
  groups: ReviewGipCostGroup[];
  commercialBasis: ReviewGipCommercialBasis;
};

export type ReviewGipCostCalculationV3 = Omit<
  ReviewGipCostCalculationV2,
  "calculationVersion" | "formulaVersion" | "roundingPolicy"
> & {
  calculationVersion: 3;
  formulaVersion: typeof REVIEW_GIP_FORMULA_VERSION;
  roundingPolicy: typeof REVIEW_GIP_ROUNDING_POLICY;
  rawValues: ReviewGipRawValues;
  commercialBasis: ReviewGipCommercialBasis & {
    raw: NonNullable<ReviewGipCommercialBasis["raw"]>;
  };
};

export type ReviewGipCostCalculation =
  | ReviewGipCostCalculationV1
  | ReviewGipCostCalculationV2
  | ReviewGipCostCalculationV3;

export function reviewGipTotalAmount(
  calculation: ReviewGipCostCalculation,
): number {
  if (calculation.calculationVersion === 3) {
    return PreciseDecimal.from(
      calculation.rawValues.totalAmount,
    ).toRoundedNumber(2);
  }
  if (calculation.calculationVersion === 2) {
    return round2(
      calculation.projectCost + calculation.contractorTotalAfterCoefficient,
    );
  }
  return round2(calculation.costWithFixed + calculation.contractorTotal);
}

export type ReviewCostBreakdown = {
  totalHours: number;
  laborCost: number;
  fixedExpenses: number;
  subcontractorCost: number;
  totalExpenses: number;
  totalAmount: number;
  gipCalculation: ReviewGipCostCalculation;
};

export type ReviewDepartmentCostBreakdown = {
  hours: number;
  laborCost: number;
  fixedLineExpenses: number;
  legacyExpenses: number;
  fixedExpenses: number;
  total: number;
};

export function calculateReviewDepartmentBreakdown(
  department: ReviewCostBreakdownDepartment,
): ReviewDepartmentCostBreakdown {
  const lines = Array.isArray(department.lines) ? department.lines : [];
  const hasLineBreakdown = lines.length > 0;
  const hours = hasLineBreakdown
    ? lines.reduce(
        (sum, line) =>
          sum +
          (normalizeReviewLineCalculationType(line.calculation_type) === "hours"
            ? nonNegativeNumber(line.planned_hours)
            : 0),
        0,
      )
    : nonNegativeNumber(department.planned_hours);
  const laborCost = hasLineBreakdown
    ? lines.reduce(
        (sum, line) =>
          sum +
          (normalizeReviewLineCalculationType(line.calculation_type) === "hours"
            ? nonNegativeNumber(line.cost)
            : 0),
        0,
      )
    : nonNegativeNumber(department.cost);
  const fixedLineExpenses = hasLineBreakdown
    ? lines.reduce(
        (sum, line) =>
          sum +
          (normalizeReviewLineCalculationType(line.calculation_type) ===
          "amount"
            ? calculateReviewDepartmentLineCostAdjustment(line)
                .amountAfterCoefficient
            : 0),
        0,
      )
    : 0;
  const legacyExpenses = nonNegativeNumber(department.expenses);
  const fixedExpenses = fixedLineExpenses + legacyExpenses;

  return {
    hours: round2(hours),
    laborCost: round2(laborCost),
    fixedLineExpenses: round2(fixedLineExpenses),
    legacyExpenses: round2(legacyExpenses),
    fixedExpenses: round2(fixedExpenses),
    total: round2(laborCost + fixedExpenses),
  };
}

export function calculateReviewDepartmentDisplayedTotal(
  breakdown: ReviewDepartmentCostBreakdown,
  showExpenses: boolean,
): number {
  return showExpenses
    ? breakdown.total
    : round2(breakdown.laborCost + breakdown.fixedLineExpenses);
}

export type ReviewCostTrip = {
  id?: unknown;
  title?: unknown;
  purpose?: unknown;
  comment?: unknown;
  amount?: unknown;
};

export type ReviewCostSubcontractor = {
  id?: unknown;
  title?: unknown;
  counterparty_name?: unknown;
  amount?: unknown;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedTaxRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function optionalNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function normalizedCoefficient(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function preciseNonNegative(value: unknown): PreciseDecimal {
  try {
    const decimal = PreciseDecimal.from(
      typeof value === "string" || typeof value === "number"
        ? value
        : Number(value),
    );
    return decimal.isNegative() ? PreciseDecimal.zero() : decimal;
  } catch {
    return PreciseDecimal.zero();
  }
}

function preciseFromNonNegativeNumber(value: number): PreciseDecimal {
  return PreciseDecimal.from(Number.isFinite(value) && value >= 0 ? value : 0);
}

function calculateAdjustedCost({
  sourceAmount,
  taxRate = null,
  coefficient = 1,
}: {
  sourceAmount: unknown;
  taxRate?: number | null;
  coefficient?: number;
}): Pick<
  ReviewDepartmentLineCostAdjustment,
  | "sourceAmount"
  | "taxAmount"
  | "amountBeforeCoefficient"
  | "coefficient"
  | "coefficientAdjustment"
  | "amountAfterCoefficient"
  | "rawValues"
> {
  const preciseSourceAmount = preciseNonNegative(sourceAmount);
  const preciseTaxAmount =
    taxRate === null
      ? PreciseDecimal.zero()
      : preciseSourceAmount
          .multiply(preciseFromNonNegativeNumber(taxRate))
          .divide(PreciseDecimal.from(100));
  const preciseAmountBeforeCoefficient =
    preciseSourceAmount.add(preciseTaxAmount);
  const normalizedItemCoefficient = normalizedCoefficient(coefficient);
  const preciseAmountAfterCoefficient = preciseAmountBeforeCoefficient.multiply(
    preciseFromNonNegativeNumber(normalizedItemCoefficient),
  );
  const preciseCoefficientAdjustment = preciseAmountAfterCoefficient.subtract(
    preciseAmountBeforeCoefficient,
  );

  return {
    sourceAmount: preciseSourceAmount.toRoundedNumber(2),
    taxAmount: preciseTaxAmount.toRoundedNumber(2),
    amountBeforeCoefficient: preciseAmountBeforeCoefficient.toRoundedNumber(2),
    coefficient: normalizedItemCoefficient,
    coefficientAdjustment: preciseCoefficientAdjustment.toRoundedNumber(2),
    amountAfterCoefficient: preciseAmountAfterCoefficient.toRoundedNumber(2),
    rawValues: {
      sourceAmount: preciseSourceAmount.toString(),
      taxAmount: preciseTaxAmount.toString(),
      amountBeforeCoefficient: preciseAmountBeforeCoefficient.toString(),
      coefficientAdjustment: preciseCoefficientAdjustment.toString(),
      amountAfterCoefficient: preciseAmountAfterCoefficient.toString(),
    },
  };
}

/**
 * Keeps the entered fixed amount separate from the value used by TКП totals.
 * The same snapshot fields are used for the live row preview and the saved GIP calculation.
 */
export function calculateReviewDepartmentLineCostAdjustment(
  line: ReviewCostBreakdownLine,
): ReviewDepartmentLineCostAdjustment {
  const category = normalizeReviewExpenseCategory(
    line.expense_category_snapshot,
  );
  const isLegacyCoefficientLine =
    category === null && line.requires_coefficient_snapshot === true;
  const isCoefficientCategory =
    category === "survey" ||
    category === "expertise" ||
    category === "other_with_coefficient";
  const taxRate =
    category === "subcontractor"
      ? normalizedTaxRate(line.tax_rate_snapshot)
      : null;
  const taxStatus =
    category === "subcontractor"
      ? normalizeReviewLineTaxStatus(line.tax_status_snapshot)
      : null;
  const coefficient =
    isCoefficientCategory || isLegacyCoefficientLine
      ? normalizedCoefficient(
          line.coefficient_snapshot,
          DEFAULT_REVIEW_LINE_COEFFICIENT,
        )
      : 1;

  return {
    taxStatus,
    taxRate,
    ...calculateAdjustedCost({ sourceAmount: line.cost, taxRate, coefficient }),
  };
}

function createCostItem({
  sourceKind,
  sourceId = null,
  departmentId = null,
  departmentName = null,
  projectStageId = null,
  projectStageName = null,
  lineId = null,
  title,
  category = null,
  plannedHours = 0,
  hourlyRate = null,
  sourceAmount,
  taxStatus = null,
  taxRate = null,
  coefficient = 1,
}: {
  sourceKind: ReviewGipSourceKind;
  sourceId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  projectStageId?: string | null;
  projectStageName?: string | null;
  lineId?: string | null;
  title: string;
  category?: ReviewExpenseCategory | null;
  plannedHours?: number;
  hourlyRate?: number | null;
  sourceAmount: number;
  taxStatus?: ReviewLineTaxStatus | null;
  taxRate?: number | null;
  coefficient?: number;
}): ReviewGipCostItem {
  const adjustedCost = calculateAdjustedCost({
    sourceAmount,
    taxRate,
    coefficient,
  });

  return {
    sourceKind,
    sourceId,
    departmentId,
    departmentName,
    projectStageId,
    projectStageName,
    lineId,
    title,
    category,
    plannedHours: nonNegativeNumber(plannedHours),
    hourlyRate:
      hourlyRate !== null && Number.isFinite(hourlyRate)
        ? nonNegativeNumber(hourlyRate)
        : null,
    sourceAmount: adjustedCost.sourceAmount,
    taxStatus,
    taxRate,
    taxAmount: adjustedCost.taxAmount,
    amountBeforeCoefficient: adjustedCost.amountBeforeCoefficient,
    coefficient: adjustedCost.coefficient,
    coefficientAdjustment: adjustedCost.coefficientAdjustment,
    amountAfterCoefficient: adjustedCost.amountAfterCoefficient,
    rawValues: adjustedCost.rawValues,
  };
}

function createCostGroup(
  key: ReviewGipCostGroupKey,
  label: string,
  items: ReviewGipCostItem[],
  treatment: ReviewGipCostGroup["treatment"] = "fixed_base",
): ReviewGipCostGroup {
  const sourceSubtotal = sumPreciseDecimals(
    items.map((item) =>
      PreciseDecimal.from(item.rawValues?.sourceAmount ?? item.sourceAmount),
    ),
  );
  const taxSubtotal = sumPreciseDecimals(
    items.map((item) =>
      PreciseDecimal.from(item.rawValues?.taxAmount ?? item.taxAmount),
    ),
  );
  const subtotalBeforeCoefficient = sumPreciseDecimals(
    items.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountBeforeCoefficient ?? item.amountBeforeCoefficient,
      ),
    ),
  );
  const coefficientAdjustment = sumPreciseDecimals(
    items.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.coefficientAdjustment ?? item.coefficientAdjustment,
      ),
    ),
  );
  const totalAfterCoefficient = sumPreciseDecimals(
    items.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountAfterCoefficient ?? item.amountAfterCoefficient,
      ),
    ),
  );
  return {
    key,
    label,
    treatment,
    sourceSubtotal: sourceSubtotal.toRoundedNumber(2),
    taxSubtotal: taxSubtotal.toRoundedNumber(2),
    subtotalBeforeCoefficient: subtotalBeforeCoefficient.toRoundedNumber(2),
    coefficientAdjustment: coefficientAdjustment.toRoundedNumber(2),
    totalAfterCoefficient: totalAfterCoefficient.toRoundedNumber(2),
    items,
    rawValues: {
      sourceSubtotal: sourceSubtotal.toString(),
      taxAmount: taxSubtotal.toString(),
      amountBeforeCoefficient: subtotalBeforeCoefficient.toString(),
      coefficientAdjustment: coefficientAdjustment.toString(),
      totalAfterCoefficient: totalAfterCoefficient.toString(),
    },
  };
}

export function calculateReviewCostBreakdown({
  departments,
  trips = [],
  subcontractors = [],
}: {
  departments: ReviewCostBreakdownDepartment[];
  trips?: ReviewCostTrip[];
  subcontractors?: ReviewCostSubcontractor[];
}): ReviewCostBreakdown {
  const laborItems: ReviewGipCostItem[] = [];
  const expenseItems: ReviewGipCostItem[] = [];
  const contractorItems: ReviewGipCostItem[] = [];

  for (const department of departments) {
    const lines = Array.isArray(department.lines) ? department.lines : [];
    const hasLineBreakdown = lines.length > 0;
    const departmentId = optionalString(department.department_id);
    const departmentName = optionalString(department.department_name);
    const projectStageId = optionalString(department.project_stage_id);
    const projectStageName = optionalString(department.project_stage_name);

    if (!hasLineBreakdown) {
      const sourceAmount = nonNegativeNumber(department.cost);
      const plannedHours = nonNegativeNumber(department.planned_hours);
      if (sourceAmount > 0 || plannedHours > 0) {
        laborItems.push(
          createCostItem({
            sourceKind: "legacy_department_labor",
            sourceId: departmentId,
            departmentId,
            departmentName,
            projectStageId,
            projectStageName,
            title: departmentName
              ? `Работы отдела «${departmentName}»`
              : "Работы отдела",
            plannedHours,
            sourceAmount,
          }),
        );
      }
    }

    for (const line of lines) {
      const category = normalizeReviewExpenseCategory(
        line.expense_category_snapshot,
      );
      const calculationType = normalizeReviewLineCalculationType(
        line.calculation_type,
      );
      const lineId = optionalString(line.id);
      const sourceAmount = nonNegativeNumber(line.cost);
      const isLegacyCoefficientLine =
        category === null && line.requires_coefficient_snapshot === true;
      const isContractorCategory =
        category === "subcontractor" ||
        category === "survey" ||
        category === "expertise" ||
        category === "other_with_coefficient";
      const isCoefficientCategory =
        category === "survey" ||
        category === "expertise" ||
        category === "other_with_coefficient";
      const taxRate =
        category === "subcontractor"
          ? normalizedTaxRate(line.tax_rate_snapshot)
          : null;
      const taxStatus =
        category === "subcontractor"
          ? normalizeReviewLineTaxStatus(line.tax_status_snapshot)
          : null;
      const coefficient =
        isCoefficientCategory || isLegacyCoefficientLine
          ? normalizedCoefficient(
              line.coefficient_snapshot,
              DEFAULT_REVIEW_LINE_COEFFICIENT,
            )
          : 1;
      const isHourlyLabor =
        category === null &&
        !isLegacyCoefficientLine &&
        calculationType === "hours";
      const categoryLabel = reviewExpenseCategoryLabel(category);
      const title =
        optionalString(line.title) ??
        categoryLabel ??
        (calculationType === "hours" ? "Работы отдела" : "Расходы по проекту");
      const item = createCostItem({
        sourceKind: "department_line",
        sourceId: lineId,
        departmentId: optionalString(line.department_id) ?? departmentId,
        departmentName: optionalString(line.department_name) ?? departmentName,
        projectStageId: optionalString(line.project_stage_id) ?? projectStageId,
        projectStageName:
          optionalString(line.project_stage_name) ?? projectStageName,
        lineId,
        title,
        category,
        plannedHours: isHourlyLabor ? nonNegativeNumber(line.planned_hours) : 0,
        hourlyRate: isHourlyLabor
          ? optionalNonNegativeNumber(line.hourly_rate_snapshot)
          : null,
        sourceAmount,
        taxStatus,
        taxRate,
        coefficient,
      });

      if (isContractorCategory || isLegacyCoefficientLine) {
        contractorItems.push(item);
      } else if (category === "manager_expense" || isHourlyLabor) {
        laborItems.push(item);
      } else {
        // travel_expense, other_without_coefficient and legacy uncategorized amount lines.
        expenseItems.push(item);
      }
    }

    const legacyExpenseAmount = nonNegativeNumber(department.expenses);
    if (legacyExpenseAmount > 0) {
      expenseItems.push(
        createCostItem({
          sourceKind: "legacy_department_expense",
          sourceId: departmentId,
          departmentId,
          departmentName,
          projectStageId,
          projectStageName,
          title: departmentName
            ? `Расходы отдела «${departmentName}»`
            : "Расходы отдела",
          sourceAmount: legacyExpenseAmount,
        }),
      );
    }
  }

  for (const trip of trips) {
    expenseItems.push(
      createCostItem({
        sourceKind: "review_trip",
        sourceId: optionalString(trip.id),
        title:
          optionalString(trip.title) ??
          optionalString(trip.purpose) ??
          optionalString(trip.comment) ??
          "Командировочные расходы",
        category: "travel_expense",
        sourceAmount: nonNegativeNumber(trip.amount),
      }),
    );
  }

  for (const subcontractor of subcontractors) {
    contractorItems.push(
      createCostItem({
        sourceKind: "review_subcontractor",
        sourceId: optionalString(subcontractor.id),
        title:
          optionalString(subcontractor.title) ??
          optionalString(subcontractor.counterparty_name) ??
          "Подрядные работы",
        category: "subcontractor",
        sourceAmount: nonNegativeNumber(subcontractor.amount),
      }),
    );
  }

  const fixedBaseContractorItems = contractorItems.filter(
    (item) =>
      item.category === "subcontractor" &&
      (item.taxStatus === "ИП" ||
        item.taxStatus === "СЗ" ||
        item.taxStatus === "ГПХ"),
  );
  const separateContractorItems = contractorItems.filter(
    (item) => !fixedBaseContractorItems.includes(item),
  );
  const groups: ReviewGipCostGroup[] = [
    createCostGroup("labor", "Стоимость трудозатрат", laborItems),
    createCostGroup(
      "expenses_and_trips",
      "Расходы и командировки",
      expenseItems,
    ),
    createCostGroup(
      "contractor",
      "Подрядчики в базе FIX",
      fixedBaseContractorItems,
    ),
    createCostGroup(
      "contractor",
      "Подрядные и дополнительные работы после FIX",
      separateContractorItems,
      "separate_after_fixed",
    ),
  ];
  const laborGroup = groups[0];
  const expensesGroup = groups[1];
  const fixedBaseContractorGroup = groups[2];
  const contractorGroup = groups[3];
  const totalHoursRaw = sumPreciseDecimals(
    laborItems.map((item) => preciseNonNegative(item.plannedHours)),
  );
  const laborCostRaw = PreciseDecimal.from(
    laborGroup.rawValues?.amountBeforeCoefficient ??
      laborGroup.subtotalBeforeCoefficient,
  );
  const expensesAndTripsRaw = PreciseDecimal.from(
    expensesGroup.rawValues?.amountBeforeCoefficient ??
      expensesGroup.subtotalBeforeCoefficient,
  );
  const fixedBaseContractorRaw = PreciseDecimal.from(
    fixedBaseContractorGroup.rawValues?.amountBeforeCoefficient ??
      fixedBaseContractorGroup.subtotalBeforeCoefficient,
  );
  const contractorSubtotalBeforeCoefficientRaw = PreciseDecimal.from(
    contractorGroup.rawValues?.amountBeforeCoefficient ??
      contractorGroup.subtotalBeforeCoefficient,
  );
  const contractorTotalAfterCoefficientRaw = PreciseDecimal.from(
    contractorGroup.rawValues?.totalAfterCoefficient ??
      contractorGroup.totalAfterCoefficient,
  );
  const contractorWorkItems = separateContractorItems.filter(
    (item) => item.category === "subcontractor",
  );
  const additionalWorkItems = separateContractorItems.filter(
    (item) => item.category !== "subcontractor",
  );
  const contractorWorkTotalRaw = sumPreciseDecimals(
    contractorWorkItems.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountAfterCoefficient ?? item.amountAfterCoefficient,
      ),
    ),
  );
  const additionalWorkTotalRaw = sumPreciseDecimals(
    additionalWorkItems.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountAfterCoefficient ?? item.amountAfterCoefficient,
      ),
    ),
  );
  const contractorWorkBaseRaw = sumPreciseDecimals(
    contractorWorkItems.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountBeforeCoefficient ?? item.amountBeforeCoefficient,
      ),
    ),
  );
  const additionalWorkBaseRaw = sumPreciseDecimals(
    additionalWorkItems.map((item) =>
      PreciseDecimal.from(
        item.rawValues?.amountBeforeCoefficient ?? item.amountBeforeCoefficient,
      ),
    ),
  );
  const costBeforeFixedRaw = laborCostRaw
    .add(expensesAndTripsRaw)
    .add(fixedBaseContractorRaw);
  const fixedAmountRaw = costBeforeFixedRaw.multiply(
    PreciseDecimal.from(REVIEW_GIP_FIXED_RATE),
  );
  const projectCostRaw = costBeforeFixedRaw.add(fixedAmountRaw);
  const totalAmountRaw = projectCostRaw.add(contractorTotalAfterCoefficientRaw);
  const totalHours = totalHoursRaw.toNumber();
  const laborCost = laborCostRaw.toRoundedNumber(2);
  const expensesAndTrips = expensesAndTripsRaw.toRoundedNumber(2);
  const contractorSubtotalBeforeCoefficient =
    contractorSubtotalBeforeCoefficientRaw.toRoundedNumber(2);
  const contractorTotalAfterCoefficient =
    contractorTotalAfterCoefficientRaw.toRoundedNumber(2);
  const contractorWorkTotal = contractorWorkTotalRaw.toRoundedNumber(2);
  const additionalWorkTotal = additionalWorkTotalRaw.toRoundedNumber(2);
  const costBeforeFixed = costBeforeFixedRaw.toRoundedNumber(2);
  const fixedAmount = fixedAmountRaw.toRoundedNumber(2);
  const projectCost = projectCostRaw.toRoundedNumber(2);
  const toContractorLine = (
    item: ReviewGipCostItem,
  ): ReviewGipContractorLine => ({
    id: item.lineId ?? item.sourceId,
    title: item.title,
    sourceAmount: item.sourceAmount,
    taxStatus: item.taxStatus,
    taxRate: item.taxRate,
    taxAmount: item.taxAmount,
    amountBeforeCoefficient: item.amountBeforeCoefficient,
    coefficient: item.coefficient,
    coefficientAdjustment: item.coefficientAdjustment,
    amountAfterCoefficient: item.amountAfterCoefficient,
    totalAmount: item.amountAfterCoefficient,
  });
  const contractorLines = separateContractorItems.map(toContractorLine);
  const contractorWorkLines = contractorWorkItems.map(toContractorLine);
  const additionalWorkLines = additionalWorkItems.map(toContractorLine);

  return {
    totalHours,
    laborCost,
    fixedExpenses: expensesAndTrips,
    subcontractorCost: contractorSubtotalBeforeCoefficient,
    totalExpenses: expensesAndTripsRaw
      .add(contractorSubtotalBeforeCoefficientRaw)
      .toRoundedNumber(2),
    totalAmount: totalAmountRaw.toRoundedNumber(2),
    gipCalculation: {
      calculationVersion: 3,
      formulaVersion: REVIEW_GIP_FORMULA_VERSION,
      roundingPolicy: REVIEW_GIP_ROUNDING_POLICY,
      totalHours,
      laborCost,
      expensesAndTrips,
      contractorSubtotalBeforeCoefficient,
      contractorTotalAfterCoefficient,
      costBeforeFixed,
      projectCost,
      groups,
      commercialBasis: {
        costWithFixed: projectCost,
        contractorWorkTotal,
        additionalWorkTotal,
        contractorWorkBase: contractorWorkBaseRaw.toRoundedNumber(2),
        additionalWorkBase: additionalWorkBaseRaw.toRoundedNumber(2),
        raw: {
          costWithFixed: projectCostRaw.toString(),
          contractorWorkTotal: contractorWorkTotalRaw.toString(),
          additionalWorkTotal: additionalWorkTotalRaw.toString(),
          contractorWorkBase: contractorWorkBaseRaw.toString(),
          additionalWorkBase: additionalWorkBaseRaw.toString(),
        },
      },
      upperBase: costBeforeFixed,
      fixedRate: REVIEW_GIP_FIXED_RATE,
      fixedAmount,
      costWithFixed: projectCost,
      costWithFixedRaw: projectCostRaw.toNumber(),
      contractorLines,
      contractorTotal: contractorSubtotalBeforeCoefficient,
      contractorWorkLines,
      contractorWorkTotal,
      additionalWorkLines,
      additionalWorkTotal,
      rawValues: {
        laborCost: laborCostRaw.toString(),
        expensesAndTrips: expensesAndTripsRaw.toString(),
        contractorSubtotalBeforeCoefficient:
          contractorSubtotalBeforeCoefficientRaw.toString(),
        contractorTotalAfterCoefficient:
          contractorTotalAfterCoefficientRaw.toString(),
        costBeforeFixed: costBeforeFixedRaw.toString(),
        fixedAmount: fixedAmountRaw.toString(),
        projectCost: projectCostRaw.toString(),
        contractorWorkTotal: contractorWorkTotalRaw.toString(),
        additionalWorkTotal: additionalWorkTotalRaw.toString(),
        totalAmount: totalAmountRaw.toString(),
      },
    },
  };
}

export function calculateReviewStageCostBreakdowns<
  T extends ReviewCostBreakdownDepartment,
>(departments: T[]): ReviewStageCostBreakdown<T>[] {
  const groups = new Map<
    string,
    { id: string | null; name: string; departments: T[] }
  >();
  for (const department of departments) {
    const projectStageId =
      typeof department.project_stage_id === "string"
        ? department.project_stage_id
        : null;
    const key = projectStageId ?? "__legacy__";
    const projectStageName =
      typeof department.project_stage_name === "string" &&
      department.project_stage_name.trim()
        ? department.project_stage_name.trim()
        : "Без стадии";
    const group = groups.get(key) ?? {
      id: projectStageId,
      name: projectStageName,
      departments: [],
    };
    group.departments.push(department);
    groups.set(key, group);
  }
  return Array.from(groups.values(), (group) => ({
    projectStageId: group.id,
    projectStageName: group.name,
    departments: group.departments,
    totals: calculateReviewCostBreakdown({ departments: group.departments }),
  }));
}
