import type { ProfitLossMonth, ProfitLossReport } from "../../opiu/model/types";

function rowValue(report: ProfitLossReport, key: string, index: number) {
  return report.rows.find((row) => row.key === key)?.values[index] ?? null;
}

function legacyRowValue(report: ProfitLossReport, key: string, index: number) {
  return rowValue(report, key, index) ?? 0;
}

export type OpiuMonthlyChartData = {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  breakEven: number;
  netProfit: number;
};

export type OpiuProfitComparisonPoint = {
  key: string;
  label: string;
  marginalProfit: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
};

export function buildOpiuMonthlyChartData(
  report: ProfitLossReport,
  months: ProfitLossMonth[],
): OpiuMonthlyChartData[] {
  return months.map((month, index) => {
    const variableExpenses = legacyRowValue(report, "variable-expenses", index);
    const productionExpenses = legacyRowValue(
      report,
      "production-expenses",
      index,
    );
    const indirectExpenses = legacyRowValue(report, "indirect-expenses", index);
    const otherExpenses = legacyRowValue(report, "other-expenses-total", index);
    const tax = legacyRowValue(report, "tax", index);
    const expenses =
      variableExpenses +
      productionExpenses +
      indirectExpenses +
      otherExpenses +
      tax;

    return {
      key: month.key,
      label: month.label,
      revenue: legacyRowValue(report, "revenue", index),
      expenses,
      breakEven: expenses,
      netProfit: legacyRowValue(report, "net-profit", index),
    };
  });
}

export function buildOpiuProfitComparisonData(
  report: ProfitLossReport,
  months: ProfitLossMonth[],
): OpiuProfitComparisonPoint[] {
  return months.map((month, index) => ({
    key: month.key,
    label: month.label,
    marginalProfit: legacyRowValue(report, "marginal-profit", index),
    grossProfit: legacyRowValue(report, "gross-profit", index),
    operatingProfit: legacyRowValue(report, "operating-profit", index),
    netProfit: legacyRowValue(report, "net-profit", index),
  }));
}

export const EXPENSE_BLOCKS = [
  {
    key: "variable-expenses",
    title: "Переменные расходы",
    color: "#dc2626",
    detailKeys: ["project-expenses", "retro-bonus", "team-percent"],
  },
  {
    key: "production-expenses",
    title: "Производственные",
    color: "#ea580c",
    detailKeys: ["executor-labor", "production-software", "sro"],
  },
  {
    key: "indirect-expenses",
    title: "Косвенные",
    color: "#ca8a04",
    detailKeys: [
      "admin-payroll",
      "payroll-taxes",
      "project-managers-payroll",
      "office-rent",
      "parking-rent",
      "utilities",
      "office-maintenance",
      "bank-expenses",
      "admin-contractors",
      "personnel-total",
      "commercial-expenses",
      "admin-software",
      "os-depreciation",
      "leasing-depreciation",
    ],
  },
  {
    key: "other-expenses-total",
    title: "Прочие расходы",
    color: "#7c3aed",
    detailKeys: ["overdraft-expenses", "ods", "penalties"],
  },
  {
    key: "tax",
    title: "Налог на прибыль",
    color: "#be123c",
    detailKeys: [] as const,
  },
] as const;
