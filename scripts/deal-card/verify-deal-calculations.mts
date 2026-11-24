/**
 * Checks the deal card money rules (features/hardcode/deal-card/model/calculations.ts).
 * Run: node scripts/deal-card/verify-deal-calculations.mts
 */
import assert from "node:assert/strict";
import {
  allocateReceipts,
  calculateDealProfitability,
  classifyDealExpense,
  DEAL_CALCULATION_RULES_HARDCODE,
  resolveActualRevenue,
  resolveDealFinancials,
  resolvePlannedRevenue,
  resolveRequestAmountWithoutVat,
  resolveRetroAmount,
  resolveSupportManagerAmount,
  resolveVatAmount,
  sumExpensesByCategory,
  sumPresent,
  NO_DEAL_OVERRIDES,
  type DealManualInputs,
} from "../../src/features/hardcode/deal-card/model/calculations.ts";

import {
  parseDealOverrides,
  serializeDealOverrides,
} from "../../src/features/hardcode/deal-card/model/overrides.ts";

const NO_MANUAL: DealManualInputs = {
  plannedLabor: null,
  actualLabor: null,
  supportManager: null,
  retro: null,
  employeeBonus: null,
  tkpContractors: null,
  tkpExpenses: null,
  tkpTrips: null,
};

const cases: Array<[string, () => void]> = [
  [
    "sumPresent keeps null when nothing is filled",
    () => {
      assert.equal(sumPresent([null, null]), null);
      assert.equal(sumPresent([null, 10.005, 5]), 15.01);
    },
  ],
  [
    "VAT: explicit value wins, otherwise with − without, otherwise null",
    () => {
      assert.equal(
        resolveVatAmount({ withoutVat: 100, withVat: 122, vat: 20 }),
        20,
      );
      assert.equal(
        resolveVatAmount({ withoutVat: 100, withVat: 122, vat: null }),
        22,
      );
      assert.equal(
        resolveVatAmount({ withoutVat: 100, withVat: null, vat: null }),
        null,
      );
    },
  ],
  [
    "header amounts come from the contract when it exists",
    () => {
      const deal = { withoutVat: 1, withVat: 2, vat: null, vatRate: 20 };
      const fromContract = resolveDealFinancials(deal, {
        withoutVat: 1000,
        withVat: 1220,
        vat: null,
      });
      assert.equal(fromContract.source, "contract");
      assert.equal(fromContract.vat, 220);
      assert.equal(fromContract.vatRate, 22);
      const fromDeal = resolveDealFinancials(deal, null);
      assert.equal(fromDeal.source, "deal");
      assert.equal(fromDeal.vat, 1);
      assert.equal(fromDeal.vatRate, 20);
    },
  ],
  [
    "planned revenue: stages → deal without VAT → deal with VAT fallback",
    () => {
      assert.deepEqual(
        resolvePlannedRevenue({
          stagesWithoutVat: 500,
          dealWithoutVat: 400,
          dealWithVat: 488,
        }),
        { amount: 500, source: "contract-stages" },
      );
      assert.deepEqual(
        resolvePlannedRevenue({
          stagesWithoutVat: 0,
          dealWithoutVat: 400,
          dealWithVat: 488,
        }),
        { amount: 400, source: "deal-without-vat" },
      );
      assert.deepEqual(
        resolvePlannedRevenue({
          stagesWithoutVat: null,
          dealWithoutVat: null,
          dealWithVat: 488,
        }),
        { amount: 488, source: "deal-with-vat-fallback" },
      );
    },
  ],
  [
    "actual revenue is null without positive acts",
    () => {
      assert.equal(resolveActualRevenue([]), null);
      assert.equal(resolveActualRevenue([0]), null);
      assert.equal(resolveActualRevenue([100, null, 50]), 150);
    },
  ],
  [
    "expense classification by article (parent + name)",
    () => {
      assert.equal(classifyDealExpense("Подрядчики (проект)"), "contractors");
      assert.equal(classifyDealExpense("Расходы по проектам"), "project");
      assert.equal(
        classifyDealExpense("Командировочные", "Проектные расходы"),
        "trips",
      );
      assert.equal(
        classifyDealExpense("Непредвиденные расходы"),
        "contingency",
      );
      assert.equal(classifyDealExpense("Аренда офиса"), "other");
    },
  ],
  [
    "request amount without VAT",
    () => {
      assert.equal(
        resolveRequestAmountWithoutVat({
          withoutVat: 100,
          withVat: 999,
          vatRate: 22,
        }),
        100,
      );
      assert.equal(
        resolveRequestAmountWithoutVat({
          withoutVat: null,
          withVat: 122,
          vatRate: 22,
        }),
        100,
      );
      assert.equal(
        resolveRequestAmountWithoutVat({
          withoutVat: null,
          withVat: 122,
          vatRate: null,
        }),
        122,
      );
    },
  ],
  [
    "support manager threshold is strictly above 1 000 000",
    () => {
      assert.equal(resolveSupportManagerAmount(true, 1_000_000), 25_000);
      assert.equal(resolveSupportManagerAmount(true, 1_000_000.01), 50_000);
      assert.equal(resolveSupportManagerAmount(false, 5_000_000), 0);
    },
  ],
  [
    "retro rules",
    () => {
      assert.equal(
        resolveRetroAmount({ type: "fixed_percent", percent: 5 }, 1000),
        50,
      );
      assert.equal(
        resolveRetroAmount({ type: "contract_amount", amount: 77 }, 1000),
        77,
      );
      assert.equal(resolveRetroAmount({ type: "none" }, 1000), 0);
    },
  ],
  [
    "profitability plan and fact",
    () => {
      const expenses = sumExpensesByCategory([
        { category: "project", amountWithoutVat: 50_000 },
        { category: "trips", amountWithoutVat: 10_000 },
        { category: "contractors", amountWithoutVat: 30_000 },
        { category: "contingency", amountWithoutVat: 5_000 },
        { category: "other", amountWithoutVat: 1_000 },
      ]);
      const { plan, fact } = calculateDealProfitability({
        plannedRevenue: 1_000_000,
        actualRevenue: 500_000,
        contractWithoutVat: 1_000_000,
        actualExpenses: expenses,
        manual: { ...NO_MANUAL, plannedLabor: 400_000, actualLabor: 200_000 },
        overrides: NO_DEAL_OVERRIDES,
        rules: DEAL_CALCULATION_RULES_HARDCODE,
      });
      assert.equal(plan.baseCost, 400_000);
      assert.equal(plan.fix, 120_000);
      assert.equal(plan.tax, 60_000);
      assert.equal(plan.finalCost, 580_000);
      assert.equal(plan.finalProfit, 420_000);
      assert.equal(plan.profitabilityPercent, 42);
      assert.equal(fact.baseCost, 260_000);
      assert.equal(fact.fix, 78_000);
      assert.equal(fact.tax, 30_000);
      assert.equal(fact.finalCost, 403_000);
      assert.equal(fact.finalProfit, 97_000);
      assert.equal(fact.profitabilityPercent, 19.4);
    },
  ],
  [
    "profitability is null without revenue; bonus only in fact",
    () => {
      const { plan, fact } = calculateDealProfitability({
        plannedRevenue: null,
        actualRevenue: 100_000,
        contractWithoutVat: null,
        actualExpenses: sumExpensesByCategory([]),
        manual: { ...NO_MANUAL, actualLabor: 10_000, employeeBonus: 1_000 },
        overrides: NO_DEAL_OVERRIDES,
        rules: DEAL_CALCULATION_RULES_HARDCODE,
      });
      assert.equal(plan.tax, null);
      assert.equal(plan.profitabilityPercent, null);
      assert.equal(plan.bonus, 0);
      assert.equal(fact.bonus, 1_000);
      assert.equal(fact.finalCost, fact.costBeforeBonus + 1_000);
    },
  ],
  [
    "hand-entered values override automatic rules",
    () => {
      const { plan, fact } = calculateDealProfitability({
        plannedRevenue: 2_000_000,
        actualRevenue: null,
        contractWithoutVat: 2_000_000,
        actualExpenses: sumExpensesByCategory([]),
        manual: {
          ...NO_MANUAL,
          supportManager: 10_000,
          retro: 7_000,
          tkpContractors: 100_000,
          tkpExpenses: 20_000,
          tkpTrips: 5_000,
        },
        overrides: NO_DEAL_OVERRIDES,
        rules: {
          hasSupportManager: true,
          retro: { type: "fixed_percent", percent: 10 },
          employeeBonus: 0,
        },
      });
      assert.equal(plan.supportManager, 10_000);
      assert.equal(fact.supportManager, 10_000);
      assert.equal(plan.retro, 7_000);
      assert.equal(plan.baseCost, 135_000);
      assert.equal(fact.tkpContractors, 0);
    },
  ],
  [
    "any cell can be typed by hand and later rows follow it",
    () => {
      const base = {
        plannedRevenue: 1_000_000,
        actualRevenue: 500_000,
        contractWithoutVat: 1_000_000,
        actualExpenses: sumExpensesByCategory([]),
        manual: { ...NO_MANUAL, plannedLabor: 400_000 },
        rules: DEAL_CALCULATION_RULES_HARDCODE,
      };
      const auto = calculateDealProfitability({
        ...base,
        overrides: NO_DEAL_OVERRIDES,
      });
      assert.equal(auto.plan.finalCost, 580_000);

      const typed = calculateDealProfitability({
        ...base,
        overrides: {
          plan: { revenue: 2_000_000, fix: 0, finalProfit: 999 },
          fact: { baseCost: 100_000 },
        },
      });
      assert.equal(typed.plan.revenue, 2_000_000);
      assert.equal(typed.plan.fix, 0);
      assert.equal(typed.plan.tax, 120_000);
      assert.equal(typed.plan.costBeforeBonus, 520_000);
      assert.equal(typed.plan.finalProfit, 999);
      assert.equal(typed.plan.profitabilityPercent, 0.05);
      assert.equal(typed.fact.fix, 30_000);
      assert.equal(typed.fact.tax, 30_000);
    },
  ],
  [
    "hand-entered values are stored as JSON and validated",
    () => {
      const overrides = {
        plan: { revenue: 10.5 },
        fact: { tax: 0 },
      };
      const raw = serializeDealOverrides(overrides);
      assert.deepEqual(parseDealOverrides(raw), overrides);
      assert.equal(serializeDealOverrides(NO_DEAL_OVERRIDES), "");
      assert.deepEqual(parseDealOverrides("not json"), NO_DEAL_OVERRIDES);
      assert.deepEqual(
        parseDealOverrides('{"plan":{"revenue":"1","evil":5,"fix":2}}'),
        { plan: { fix: 2 }, fact: {} },
      );
    },
  ],
  [
    "receipts are spread over planned parts in order with sources",
    () => {
      assert.deepEqual(
        allocateReceipts(
          [100, 200, null],
          [
            { id: "a", amount: 150 },
            { id: "b", amount: 100 },
          ],
        ),
        {
          allocations: [
            [{ receiptId: "a", amount: 100 }],
            [
              { receiptId: "a", amount: 50 },
              { receiptId: "b", amount: 100 },
            ],
            [],
          ],
          unallocated: 0,
        },
      );
      assert.deepEqual(allocateReceipts([100], [{ id: "a", amount: 130 }]), {
        allocations: [[{ receiptId: "a", amount: 100 }]],
        unallocated: 30,
      });
    },
  ],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n${String(error)}`);
  }
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("OK");
