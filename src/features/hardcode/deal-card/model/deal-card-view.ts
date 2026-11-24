import {
  calculateDealProfitability,
  DEAL_CALCULATION_RULES_HARDCODE,
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
  actsWithoutVat: number | null;
  actsWithVat: number | null;
  paidExpenses: DealExpenseTotals;
  profitability: ReturnType<typeof calculateDealProfitability>;
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

  return {
    financials: resolveDealFinancials(data.deal, data.contractTotals),
    plannedRevenue,
    actualRevenue,
    actsWithoutVat: sumPresent(signedActs.map((act) => act.amountWithoutVat)),
    actsWithVat: sumPresent(signedActs.map((act) => act.amountWithVat)),
    paidExpenses,
    profitability: calculateDealProfitability({
      plannedRevenue: plannedRevenue.amount,
      actualRevenue,
      contractWithoutVat: data.contractTotals?.withoutVat ?? null,
      plannedLabor: data.deal.plannedCost,
      actualLabor: data.deal.actualCost,
      // TKP plan blocks are not linked to the deal calculation yet (hardcode).
      plannedTkp: { contractors: 0, expenses: 0, trips: 0 },
      actualExpenses: paidExpenses,
      rules: DEAL_CALCULATION_RULES_HARDCODE,
    }),
    schedule: buildDealPaymentSchedule({
      stages: data.stages,
      receiptsWithVat: data.receipts.map((receipt) => receipt.amountWithVat),
      today,
    }),
  };
}
