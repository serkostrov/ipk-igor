import { useMemo } from "react";
import { useEntityConfig, useEntityValueContext } from "@/entities/entity";
import { adaptOpiuSourcesFromEntities } from "../../opiu/model/adapt-sources";
import {
  buildProfitLossReport,
  getProfitLossRow,
  profitLossPercentValue,
  sumProfitLossValues,
} from "../../opiu/model/calculation";
import { buildProfitLossPeriodMonths } from "../../opiu/model/months";
import {
  EXPENSE_BLOCKS,
  buildOpiuMonthlyChartData,
  buildOpiuProfitComparisonData,
  type OpiuMonthlyChartData,
  type OpiuProfitComparisonPoint,
} from "../model/opiu-dashboard-data";
import type { ProfitLossReport } from "../../opiu/model/types";

export type OpiuExpenseBlock = {
  key: string;
  title: string;
  color: string;
  amount: number;
  revenuePercent: number;
  totalExpensePercent: number;
  details: Array<{
    key: string;
    label: string;
    amount: number;
    revenuePercent: number;
  }>;
};

export function useOpiuDashboard(input: {
  dateFrom: string;
  dateTo: string;
  enabled: boolean;
}): {
  report: ProfitLossReport;
  monthly: OpiuMonthlyChartData[];
  profitComparison: OpiuProfitComparisonPoint[];
  expenseBlocks: OpiuExpenseBlock[];
  hasActsEntity: boolean;
  hasDdsEntity: boolean;
  hasArticlesEntity: boolean;
} {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();

  return useMemo(() => {
    const months = input.enabled
      ? buildProfitLossPeriodMonths(input.dateFrom, input.dateTo)
      : [];
    const adapted = adaptOpiuSourcesFromEntities(valueContext, entities);
    const report = buildProfitLossReport({
      months,
      acts: adapted.acts,
      entries: adapted.entries,
      categories: adapted.categories,
    });

    const rowTotal = (key: string) => {
      const row = getProfitLossRow(report, key);
      return row ? (row.total ?? sumProfitLossValues(row.values)) : 0;
    };

    const expenseBlocks: OpiuExpenseBlock[] = EXPENSE_BLOCKS.map((block) => {
      const amount = rowTotal(block.key);
      return {
        key: block.key,
        title: block.title,
        color: block.color,
        amount,
        revenuePercent: profitLossPercentValue(amount, report.revenueTotal),
        totalExpensePercent: profitLossPercentValue(
          amount,
          report.totalExpenses,
        ),
        details: block.detailKeys
          .map((key) => {
            const row = getProfitLossRow(report, key);
            const value = row
              ? (row.total ?? sumProfitLossValues(row.values))
              : 0;
            return {
              key,
              label: row?.label ?? key,
              amount: value,
              revenuePercent: profitLossPercentValue(
                value,
                report.revenueTotal,
              ),
            };
          })
          .filter((item) => item.amount !== 0)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      };
    }).filter((block) => block.amount !== 0);

    return {
      report,
      monthly: buildOpiuMonthlyChartData(report, months),
      profitComparison: buildOpiuProfitComparisonData(report, months),
      expenseBlocks,
      hasActsEntity: adapted.sources.acts != null,
      hasDdsEntity: adapted.sources.dds != null,
      hasArticlesEntity: adapted.sources.articles != null,
    };
  }, [entities, valueContext, input.dateFrom, input.dateTo, input.enabled]);
}
