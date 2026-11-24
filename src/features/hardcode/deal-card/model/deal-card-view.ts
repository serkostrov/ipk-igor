import {
  calculateDealProfitability,
  DEAL_CALCULATION_RULES_HARDCODE,
  NO_DEAL_OVERRIDES,
  resolveActualRevenue,
  resolveDealFinancials,
  resolvePlannedRevenue,
  sumExpensesByCategory,
  sumPresent,
  type DealExpenseTotals,
  type DealFinancials,
  type DealRevenueSource,
} from "./calculations";
import type { DealCardData } from "./deal-data";
import {
  buildDealPaymentSchedule,
  type DealPaymentSchedule,
} from "./payment-schedule";

export type DealCardView = {
  financials: DealFinancials;
  plannedRevenue: { amount: number | null; source: DealRevenueSource };
  actualRevenue: number | null;
  actsWithVat: number | null;
  paidExpenses: DealExpenseTotals;
  profitability: ReturnType<typeof calculateDealProfitability>;
  /** The same calculation without hand-entered cell values. */
  automatic: ReturnType<typeof calculateDealProfitability>;
  schedule: DealPaymentSchedule;
};

/** Derived numbers shared by the summary block and every deal tab. */
export function buildDealCardView(
  data: DealCardData,
  today: string,
): DealCardView {
  const signedActs = data.acts.filter((act) => !act.rejected);
  const plannedRevenue = resolvePlannedRevenue({
    stagesWithoutVat: data.contractTotals?.withoutVat ?? null,
    dealWithoutVat: data.deal.withoutVat,
    dealWithVat: data.deal.withVat,
  });
  const actualRevenue = resolveActualRevenue(
    signedActs.map((act) => act.amountWithoutVat),
  );
  const paidExpenses = sumExpensesByCategory(
    data.requests.filter((request) => request.paid),
  );
  const profitabilityInput = {
    plannedRevenue: plannedRevenue.amount,
    actualRevenue,
    contractWithoutVat: data.contractTotals?.withoutVat ?? null,
    actualExpenses: paidExpenses,
    manual: data.deal.manual,
    overrides: data.deal.overrides,
    rules: DEAL_CALCULATION_RULES_HARDCODE,
  };

  return {
    financials: resolveDealFinancials(data.deal, data.contractTotals),
    plannedRevenue,
    actualRevenue,
    actsWithVat: sumPresent(signedActs.map((act) => act.amountWithVat)),
    paidExpenses,
    profitability: calculateDealProfitability(profitabilityInput),
    automatic: calculateDealProfitability({
      ...profitabilityInput,
      overrides: NO_DEAL_OVERRIDES,
    }),
    schedule: buildDealPaymentSchedule({
      stages: data.stages,
      receipts: data.receipts,
      today,
    }),
  };
}
