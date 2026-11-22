import { useCallback } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
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

  const value = useAsyncValue(
    useCallback(async () => {
      const months = buildProfitLossYearMonths(year);
      const adapted = await adaptOpiuSourcesFromEntities(
        valueContext,
        entities,
      );
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
    }, [entities, valueContext, year]),
  );
  if (value.status === "error") throw value.error;
  return value.status === "ready"
    ? value.value
    : {
        report: buildProfitLossReport({
          months: [],
          acts: [],
          entries: [],
          categories: [],
        }),
        hasActsEntity: false,
        hasDdsEntity: false,
        hasArticlesEntity: false,
      };
}
