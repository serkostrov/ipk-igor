export { isDdsOperationsEntity } from "./dds/match";

export {
  applyTkpGipDepartmentUsers,
  type TkpGipDepartmentUsersResult,
} from "./tkp-gip/apply-gip-department-users";
export { persistDeptCalculationRelatedUpdate } from "./tkp-gip/fan-out-related-persist";
export {
  collectTkpStageDepartmentPairs,
  findDeptCalculationUserFields,
  findDeptCalculationsGroupsField,
  findTkpGipUserField,
  formatTkpGipDepartmentExtras,
  isDeptCalculationsEntity,
  isGipDepartmentRecord,
  isTkpAnalysisEntity,
  resolveDeptCalculationsCreateFanOut,
  type TkpStageDepartmentPair,
} from "./tkp-gip/match";

export {
  resolveDeptCalculationsHostFields,
  resolveDeptCalculationsSubtaskFields,
} from "./dept-calculations/model/fields";
export {
  calculateDeptCalculationsBreakdown,
  formatDeptDeadlineDays,
  formatDeptHours,
  formatDeptMoney,
} from "./dept-calculations/model/aggregation";
export { resolveDeptCalculationsNestedTarget } from "./dept-calculations/model/resolve-nested";
export {
  buildDeptCalculationStageGroups,
  resolveDeptCalculationDepartmentLabel,
  resolveDeptCalculationManagerName,
} from "./dept-calculations/model/stage-groups";

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
