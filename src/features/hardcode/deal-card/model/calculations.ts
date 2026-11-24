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
 * support-manager rules yet. Hand-entered deal values (`DealManualInputs`)
 * override these defaults.
 */
export const DEAL_CALCULATION_RULES_HARDCODE: DealCalculationRules = {
  hasSupportManager: false,
  retro: { type: "none" },
  employeeBonus: 0,
};

/** Values typed on the deal; `null` — not filled, use the automatic rule. */
export type DealManualInputs = {
  plannedLabor: number | null;
  actualLabor: number | null;
  supportManager: number | null;
  retro: number | null;
  employeeBonus: number | null;
  tkpContractors: number | null;
  tkpExpenses: number | null;
  tkpTrips: number | null;
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

/** Hand-entered values by calculation row (column key). */
export type DealColumnOverrides = Partial<
  Record<keyof DealProfitabilityColumn, number>
>;

export type DealOverrides = {
  plan: DealColumnOverrides;
  fact: DealColumnOverrides;
};

export const NO_DEAL_OVERRIDES: DealOverrides = { plan: {}, fact: {} };

export type DealProfitabilityInput = {
  plannedRevenue: number | null;
  actualRevenue: number | null;
  /** Contract stages without VAT — base for support manager / retro. */
  contractWithoutVat: number | null;
  /** Completed («Оплачено») requests of the deal. */
  actualExpenses: DealExpenseTotals;
  manual: DealManualInputs;
  /** Hand-entered values of any calculation row, per column. */
  overrides: DealOverrides;
  rules: DealCalculationRules;
};

function buildColumn(
  input: {
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
  },
  override: DealColumnOverrides,
): DealProfitabilityColumn {
  // Each row takes a hand-entered value when present, and later rows are
  // calculated from the effective (possibly overridden) values.
  const revenue = override.revenue ?? input.revenue;
  const labor = override.labor ?? input.labor;
  const supportManager = override.supportManager ?? input.supportManager;
  const tkpContractors = override.tkpContractors ?? input.tkpContractors;
  const projectExpenses = override.projectExpenses ?? input.projectExpenses;
  const trips = override.trips ?? input.trips;
  const externalContractors =
    override.externalContractors ?? input.externalContractors;
  const retro = override.retro ?? input.retro;
  const contingency = override.contingency ?? input.contingency;
  const bonus = override.bonus ?? input.bonus;

  const baseCost =
    override.baseCost ??
    roundMoney(
      labor + supportManager + tkpContractors + projectExpenses + trips,
    );
  const fix = override.fix ?? roundMoney(baseCost * DEAL_FIX_RATE);
  const tax =
    override.tax ??
    (revenue == null ? null : roundMoney(revenue * DEAL_PROFIT_TAX_RATE));
  const costBeforeBonus =
    override.costBeforeBonus ??
    roundMoney(
      baseCost + fix + externalContractors + retro + contingency + (tax ?? 0),
    );
  const profitBeforeBonus =
    override.profitBeforeBonus ??
    (revenue == null ? null : roundMoney(revenue - costBeforeBonus));
  const finalCost = override.finalCost ?? roundMoney(costBeforeBonus + bonus);
  const finalProfit =
    override.finalProfit ??
    (revenue == null ? null : roundMoney(revenue - finalCost));
  const profitabilityPercent =
    override.profitabilityPercent ??
    (revenue == null || revenue === 0 || finalProfit == null
      ? null
      : roundMoney((finalProfit / revenue) * 100));

  return {
    revenue,
    labor,
    supportManager,
    tkpContractors,
    projectExpenses,
    trips,
    baseCost,
    fix,
    externalContractors,
    retro,
    contingency,
    tax,
    costBeforeBonus,
    profitBeforeBonus,
    bonus,
    finalCost,
    finalProfit,
    profitabilityPercent,
  };
}

/**
 * Plan vs fact profitability. Fact external contractors and contingency are
 * separate rows (not in the base); planned bonus is always 0. Values typed on
 * the deal fields (`manual`) win over automatic rules, and per-row
 * `overrides` win over everything.
 */
export function calculateDealProfitability(input: DealProfitabilityInput): {
  plan: DealProfitabilityColumn;
  fact: DealProfitabilityColumn;
} {
  const { manual, rules } = input;
  const supportManager =
    manual.supportManager ??
    resolveSupportManagerAmount(
      rules.hasSupportManager,
      input.contractWithoutVat,
    );
  const retro =
    manual.retro ??
    resolveRetroAmount(
      rules.retro,
      input.contractWithoutVat ?? input.plannedRevenue,
    );

  return {
    plan: buildColumn(
      {
        revenue: input.plannedRevenue,
        labor: manual.plannedLabor ?? 0,
        supportManager,
        tkpContractors: manual.tkpContractors ?? 0,
        projectExpenses: manual.tkpExpenses ?? 0,
        trips: manual.tkpTrips ?? 0,
        externalContractors: 0,
        retro,
        contingency: 0,
        bonus: 0,
      },
      input.overrides.plan,
    ),
    fact: buildColumn(
      {
        revenue: input.actualRevenue,
        labor: manual.actualLabor ?? 0,
        supportManager,
        tkpContractors: 0,
        projectExpenses: input.actualExpenses.project,
        trips: input.actualExpenses.trips,
        externalContractors: input.actualExpenses.contractors,
        retro,
        contingency: input.actualExpenses.contingency,
        bonus: manual.employeeBonus ?? rules.employeeBonus,
      },
      input.overrides.fact,
    ),
  };
}

export type ReceiptAllocation = { receiptId: string; amount: number };

/**
 * Spreads incoming payments (in the given order) over planned parts in order
 * (FIFO). Returns which receipts paid each part and what is left over.
 */
export function allocateReceipts(
  plannedAmounts: ReadonlyArray<number | null>,
  receipts: ReadonlyArray<{ id: string; amount: number | null }>,
): { allocations: ReceiptAllocation[][]; unallocated: number } {
  const pool = receipts
    .filter((receipt) => receipt.amount != null && receipt.amount > 0)
    .map((receipt) => ({ id: receipt.id, left: roundMoney(receipt.amount!) }));
  let cursor = 0;

  const allocations = plannedAmounts.map((planned) => {
    let need = Math.max(0, roundMoney(planned ?? 0));
    const parts: ReceiptAllocation[] = [];
    while (need > 0 && cursor < pool.length) {
      const receipt = pool[cursor]!;
      const amount = roundMoney(Math.min(need, receipt.left));
      parts.push({ receiptId: receipt.id, amount });
      need = roundMoney(need - amount);
      receipt.left = roundMoney(receipt.left - amount);
      if (receipt.left === 0) cursor += 1;
    }
    return parts;
  });

  const unallocated = roundMoney(
    pool.slice(cursor).reduce((sum, receipt) => sum + receipt.left, 0),
  );
  return { allocations, unallocated };
}
