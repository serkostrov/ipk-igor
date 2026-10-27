import { useMemo } from "react";
import { useEntityConfig, useEntityValueContext } from "@/entities/entity";
import { adaptFinanceDashboardFromEntities } from "../model/adapt-dds-dashboard";
import { buildFinanceDashboardData } from "../model/dds-calculations";
import { localIsoDate } from "../model/period";
import type {
  DashboardBalanceView,
  FinanceDashboardData,
} from "../model/types";

export function useDdsDashboard(input: {
  dateFrom: string;
  dateTo: string;
  selectedLegalId: string | null;
  selectedProjectId: string | null;
  balanceView: DashboardBalanceView;
}): {
  data: FinanceDashboardData;
  legalEntities: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  hasDdsEntity: boolean;
  hasWalletsEntity: boolean;
  hasArticlesEntity: boolean;
} {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const today = useMemo(() => localIsoDate(), []);

  return useMemo(() => {
    const adapted = adaptFinanceDashboardFromEntities(valueContext, entities);
    const data = buildFinanceDashboardData({
      balanceView: input.balanceView,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      today,
      entries: adapted.entries,
      categories: adapted.categories,
      wallets: adapted.wallets,
      plannedReceipts: adapted.plannedReceipts,
      plannedOutflows: adapted.plannedOutflows,
      selectedLegalId: input.selectedLegalId,
      selectedProjectId: input.selectedProjectId,
    });
    return {
      data,
      legalEntities: adapted.legalEntities,
      projects: adapted.projects,
      hasDdsEntity: adapted.sources.dds != null,
      hasWalletsEntity: adapted.sources.wallets != null,
      hasArticlesEntity: adapted.sources.articles != null,
    };
  }, [
    entities,
    valueContext,
    today,
    input.balanceView,
    input.dateFrom,
    input.dateTo,
    input.selectedLegalId,
    input.selectedProjectId,
  ]);
}
