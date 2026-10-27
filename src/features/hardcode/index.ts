export { isDdsOperationsEntity } from "./dds/match";
export {
  buildDdsWalletSummaryRows,
  resolveDdsWalletSummarySetup,
  type DdsWalletSummarySetup,
} from "./dds/wallet-summary/model";
export { DdsWalletSummaryTable } from "./dds/wallet-summary/ui";
export { DdsWalletTimelineSection } from "./dds/wallet-summary/timeline-section";
export { HardcodeTimelineSlot } from "./ui/HardcodeTimelineSlot";

export { resolveOpiuSourceEntities } from "./opiu/match";
export {
  buildProfitLossReport,
  getProfitLossRow,
  profitLossPercentValue,
  sumProfitLossValues,
} from "./opiu/model/calculation";
export {
  buildProfitLossPeriodMonths,
  buildProfitLossYearMonths,
} from "./opiu/model/months";
export type {
  ProfitLossMonth,
  ProfitLossReport,
  ProfitLossReportRow,
} from "./opiu/model/types";
export { useOpiuReport } from "./opiu/lib/use-opiu-report";
export { OpiuReportTable } from "./opiu/ui/OpiuReportTable";

export { FinanceDashboardsPage } from "./finance-dashboards/ui/FinanceDashboardsPage";
export { resolveFinanceDashboardSources } from "./finance-dashboards/match";
