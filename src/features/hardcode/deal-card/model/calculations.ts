/**
 * Deal card money rules — port of ipk-igor `deal-financials.ts` and
 * `deal-profitability.ts`. Pure functions only:
 * missing values stay `null` and are never shown as a fake 0.
 */

export const DEAL_FIX_RATE = 0.3;
export const DEAL_PROFIT_TAX_RATE = 0.06;
export const DEAL_SUPPORT_MANAGER_THRESHOLD = 1_000_000;
export const DEAL_SUPPORT_MANAGER_HIGH = 50_000;
export const DEAL_SUPPORT_MANAGER_LOW = 25_000;

export type DealRetroRule =
  | { type: "none" }
  | { type: "fixed_percent"; percent: number }
  | { type: "contract_amount"; amount: number };

export type DealCalculationRules = {
  hasSupportManager: boolean;
  retro: DealRetroRule;
  employeeBonus: number;
};

/**
 * Temporary hardcode: the CRM has no fields for counterparty retro /
 * support-manager rules or the deal employee bonus yet. Once they appear,
 * read them in `deal-data.ts` instead of this constant.
 */
export const DEAL_CALCULATION_RULES_HARDCODE: DealCalculationRules = {
  hasSupportManager: false,
  retro: { type: "none" },
  employeeBonus: 0,
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Sum of present values; `null` when every value is missing. */
export function sumPresent(
  values: ReadonlyArray<number | null>,
): number | null {
  let total: number | null = null;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total = (total ?? 0) + value;
  }
  return total == null ? null : roundMoney(total);
}

export type MoneyTriple = {
  withoutVat: number | null;
  withVat: number | null;
  vat: number | null;
};

/** Explicit VAT wins; otherwise `with − without` when both are known. */
export function resolveVatAmount(money: MoneyTriple): number | null {
  if (money.vat != null) return money.vat;
  if (money.withVat != null && money.withoutVat != null) {
    return roundMoney(money.withVat - money.withoutVat);
  }
  return null;
}

/** VAT rate in percent derived from amounts (`null` when not derivable). */
export function deriveVatRate(money: MoneyTriple): number | null {
  const vat = resolveVatAmount(money);
  if (vat == null || money.withoutVat == null || money.withoutVat === 0) {
    return null;
  }
  return roundMoney((vat / money.withoutVat) * 100);
}

export type DealFinancials = MoneyTriple & {
  vatRate: number | null;
  source: "deal" | "contract";
};

/**
 * Header amounts: the linked contracts (sum of their stages) are the source
 * of truth; without a contract — the deal. Callers render a loader until the
 * contract records are loaded, so stale deal amounts are never shown.
 */
export function resolveDealFinancials(
  deal: MoneyTriple & { vatRate: number | null },
  contract: MoneyTriple | null,
): DealFinancials {
  if (contract) {
    return {
      ...contract,
      vat: resolveVatAmount(contract),
      vatRate: deriveVatRate(contract),
      source: "contract",
    };
  }
  return {
    withoutVat: deal.withoutVat,
    withVat: deal.withVat,
    vat: resolveVatAmount(deal),
    vatRate: deal.vatRate,
    source: "deal",
  };
}

export type DealRevenueSource =
  "contract-stages" | "deal-without-vat" | "deal-with-vat-fallback" | "none";

/**
 * Planned revenue without VAT: contract stages → deal without VAT → deal with
 * VAT (labelled fallback, never silently presented as an amount without VAT).
 */
export function resolvePlannedRevenue(input: {
  stagesWithoutVat: number | null;
  dealWithoutVat: number | null;
  dealWithVat: number | null;
}): { amount: number | null; source: DealRevenueSource } {
  if (input.stagesWithoutVat != null && input.stagesWithoutVat > 0) {
    return { amount: input.stagesWithoutVat, source: "contract-stages" };
  }
  if (input.dealWithoutVat != null) {
    return { amount: input.dealWithoutVat, source: "deal-without-vat" };
  }
  if (input.dealWithVat != null) {
    return { amount: input.dealWithVat, source: "deal-with-vat-fallback" };
  }
  return { amount: null, source: "none" };
}

/** Actual revenue = acts without VAT; non-positive total → `null`. */
export function resolveActualRevenue(
  actsWithoutVat: ReadonlyArray<number | null>,
): number | null {
  const total = sumPresent(actsWithoutVat);
  return total != null && total > 0 ? total : null;
}

export type DealExpenseCategory =
  "project" | "trips" | "contingency" | "contractors" | "other";

export const DEAL_EXPENSE_CATEGORY_LABELS: Record<DealExpenseCategory, string> =
  {
    project: "Расходы проекта",
    trips: "Командировки",
    contingency: "Непредвиденные расходы",
    contractors: "Внешние подрядчики",
    other: "Прочие",
  };

export function normalizeExpenseCategoryName(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Classifies a payment request by its ДДС article («родитель + имя»).
 * «непредвид» replaces the source `is_contingency_expense` flag (hardcode).
 */
export function classifyDealExpense(
  articleName: string,
  parentArticleName = "",
): DealExpenseCategory {
  const text = normalizeExpenseCategoryName(
    `${parentArticleName} ${articleName}`,
  );
  if (text.includes("непредвид")) return "contingency";
  if (text.includes("подрядчики проект")) return "contractors";
  if (text.includes("расходы по проект")) return "project";
  if (text.includes("командиров") && text.includes("проект")) return "trips";
  return "other";
}

/** Explicit amount without VAT; otherwise `with VAT / (1 + rate)`. */
export function resolveRequestAmountWithoutVat(input: {
  withoutVat: number | null;
  withVat: number | null;
  vatRate: number | null;
}): number | null {
  if (input.withoutVat != null) return roundMoney(input.withoutVat);
  if (input.withVat == null) return null;
  if (input.vatRate != null && input.vatRate > 0) {
    return roundMoney(input.withVat / (1 + input.vatRate / 100));
  }
  return roundMoney(input.withVat);
}

/** Over 1 000 000 ₽ → 50 000 ₽; otherwise (including exactly 1 000 000) → 25 000 ₽. */
export function resolveSupportManagerAmount(
  enabled: boolean,
  contractWithoutVat: number | null,
): number {
  if (!enabled) return 0;
  return (contractWithoutVat ?? 0) > DEAL_SUPPORT_MANAGER_THRESHOLD
    ? DEAL_SUPPORT_MANAGER_HIGH
    : DEAL_SUPPORT_MANAGER_LOW;
}

export function resolveRetroAmount(
  rule: DealRetroRule,
  baseWithoutVat: number | null,
): number {
  if (rule.type === "fixed_percent") {
    return roundMoney(((baseWithoutVat ?? 0) * rule.percent) / 100);
  }
  if (rule.type === "contract_amount") return roundMoney(rule.amount);
  return 0;
}

export type DealExpenseTotals = Record<DealExpenseCategory, number>;

export function sumExpensesByCategory(
  expenses: ReadonlyArray<{
    category: DealExpenseCategory;
    amountWithoutVat: number | null;
  }>,
): DealExpenseTotals {
  const totals: DealExpenseTotals = {
    project: 0,
    trips: 0,
    contingency: 0,
    contractors: 0,
    other: 0,
  };
  for (const expense of expenses) {
    if (expense.amountWithoutVat == null) continue;
    totals[expense.category] = roundMoney(
      totals[expense.category] + expense.amountWithoutVat,
    );
  }
  return totals;
}

export type DealProfitabilityColumn = {
  revenue: number | null;
  labor: number;
  supportManager: number;
  tkpContractors: number;
  projectExpenses: number;
  trips: number;
  baseCost: number;
  fix: number;
  externalContractors: number;
  retro: number;
  contingency: number;
  tax: number | null;
  costBeforeBonus: number;
  profitBeforeBonus: number | null;
  bonus: number;
  finalCost: number;
  finalProfit: number | null;
  profitabilityPercent: number | null;
};

export type DealProfitabilityInput = {
  plannedRevenue: number | null;
  actualRevenue: number | null;
  /** Contract stages without VAT — base for support manager / retro. */
  contractWithoutVat: number | null;
  plannedLabor: number | null;
  actualLabor: number | null;
  /** TKP plan blocks (contractors / department expenses / trips). */
  plannedTkp: { contractors: number; expenses: number; trips: number };
  /** Completed («Оплачено») requests of the deal. */
  actualExpenses: DealExpenseTotals;
  rules: DealCalculationRules;
};

function buildColumn(input: {
  revenue: number | null;
  labor: number;
  supportManager: number;
  tkpContractors: number;
  projectExpenses: number;
  trips: number;
  externalContractors: number;
  retro: number;
  contingency: number;
  bonus: number;
}): DealProfitabilityColumn {
  const baseCost = roundMoney(
    input.labor +
      input.supportManager +
      input.tkpContractors +
      input.projectExpenses +
      input.trips,
  );
  const fix = roundMoney(baseCost * DEAL_FIX_RATE);
  const tax =
    input.revenue == null
      ? null
      : roundMoney(input.revenue * DEAL_PROFIT_TAX_RATE);
  const costBeforeBonus = roundMoney(
    baseCost +
      fix +
      input.externalContractors +
      input.retro +
      input.contingency +
      (tax ?? 0),
  );
  const profitBeforeBonus =
    input.revenue == null ? null : roundMoney(input.revenue - costBeforeBonus);
  const finalCost = roundMoney(costBeforeBonus + input.bonus);
  const finalProfit =
    input.revenue == null ? null : roundMoney(input.revenue - finalCost);
  const profitabilityPercent =
    input.revenue == null || input.revenue === 0 || finalProfit == null
      ? null
      : roundMoney((finalProfit / input.revenue) * 100);

  return {
    revenue: input.revenue,
    labor: input.labor,
    supportManager: input.supportManager,
    tkpContractors: input.tkpContractors,
    projectExpenses: input.projectExpenses,
    trips: input.trips,
    baseCost,
    fix,
    externalContractors: input.externalContractors,
    retro: input.retro,
    contingency: input.contingency,
    tax,
    costBeforeBonus,
    profitBeforeBonus,
    bonus: input.bonus,
    finalCost,
    finalProfit,
    profitabilityPercent,
  };
}

/**
 * Plan vs fact profitability. Fact external contractors and contingency are
 * separate rows (not in the base); planned bonus is always 0.
 */
export function calculateDealProfitability(input: DealProfitabilityInput): {
  plan: DealProfitabilityColumn;
  fact: DealProfitabilityColumn;
} {
  const supportManager = resolveSupportManagerAmount(
    input.rules.hasSupportManager,
    input.contractWithoutVat,
  );
  const retro = resolveRetroAmount(
    input.rules.retro,
    input.contractWithoutVat ?? input.plannedRevenue,
  );

  return {
    plan: buildColumn({
      revenue: input.plannedRevenue,
      labor: input.plannedLabor ?? 0,
      supportManager,
      tkpContractors: input.plannedTkp.contractors,
      projectExpenses: input.plannedTkp.expenses,
      trips: input.plannedTkp.trips,
      externalContractors: 0,
      retro,
      contingency: 0,
      bonus: 0,
    }),
    fact: buildColumn({
      revenue: input.actualRevenue,
      labor: input.actualLabor ?? 0,
      supportManager,
      tkpContractors: 0,
      projectExpenses: input.actualExpenses.project,
      trips: input.actualExpenses.trips,
      externalContractors: input.actualExpenses.contractors,
      retro,
      contingency: input.actualExpenses.contingency,
      bonus: input.rules.employeeBonus,
    }),
  };
}

/**
 * Spreads incoming payments over planned parts in order (FIFO).
 * Returns paid per part and what is left unallocated.
 */
export function allocateReceipts(
  plannedAmounts: ReadonlyArray<number | null>,
  receivedTotal: number,
): { paid: number[]; unallocated: number } {
  let left = Math.max(0, roundMoney(receivedTotal));
  const paid = plannedAmounts.map((planned) => {
    const target = Math.max(0, planned ?? 0);
    const part = roundMoney(Math.min(left, target));
    left = roundMoney(left - part);
    return part;
  });
  return { paid, unallocated: left };
}
