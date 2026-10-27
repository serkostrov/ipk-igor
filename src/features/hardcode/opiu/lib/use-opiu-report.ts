import { useMemo } from "react";
import { useEntityConfig, useEntityValueContext } from "@/entities/entity";
import { adaptOpiuSourcesFromEntities } from "../model/adapt-sources";
import { buildProfitLossReport } from "../model/calculation";
import { buildProfitLossYearMonths } from "../model/months";
import type { ProfitLossReport } from "../model/types";

export function useOpiuReport(year: number): {
  report: ProfitLossReport;
  hasActsEntity: boolean;
  hasDdsEntity: boolean;
  hasArticlesEntity: boolean;
} {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();

  return useMemo(() => {
    const months = buildProfitLossYearMonths(year);
    const adapted = adaptOpiuSourcesFromEntities(valueContext, entities);
    const report = buildProfitLossReport({
      months,
      acts: adapted.acts,
      entries: adapted.entries,
      categories: adapted.categories,
    });
    return {
      report,
      hasActsEntity: adapted.sources.acts != null,
      hasDdsEntity: adapted.sources.dds != null,
      hasArticlesEntity: adapted.sources.articles != null,
    };
  }, [entities, valueContext, year]);
}
