export { isDdsOperationsEntity } from "./dds/match";

export {
  applyTkpGipDepartmentUsers,
  type TkpGipDepartmentUsersResult,
} from "./tkp-gip/apply-gip-department-users";
export {
  ensureDeptCalculationGipRows,
  persistDeptCalculationRelatedUpdate,
  syncDeptCalculationCatalogManagers,
} from "./tkp-gip/fan-out-related-persist";
export {
  maybeEnsureDeptCalculationGipAfterStageChange,
  maybeEnsureDeptCalculationGipForParent,
  maybeEnsureDeptCalculationGipForTask,
} from "./tkp-gip/gip-filling-phase";
export {
  isTkpGipFillingStageName,
  isTkpGipFillingStageOption,
  isTkpHostOnGipFillingStage,
} from "@/entities/entity";
export {
  buildTkpGipSoftFillParentRecord,
  collectDeptCalculationSiblingRecords,
  collectTkpStageDepartmentPairs,
  collectTkpStageRootIds,
  ensureTkpGipDepartmentInGroupsValue,
  findDeptCalculationUserFields,
  findDeptCalculationsGroupsField,
  findGipDepartmentRecordId,
  findTkpGipUserField,
  findTkpLeadRelationField,
  formatTkpGipDepartmentExtras,
  isDeptCalculationsEntity,
  isGipDepartmentRecord,
  isTkpAnalysisEntity,
  resolveDeptCalculationsCreateFanOut,
  resolveTkpGipLeadContext,
  resolveTkpGipUserIdsFromHost,
  serializeTkpStageDepartmentPairs,
  unionTkpStageDepartmentGroupsValues,
  withGipDepartmentPairs,
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
  resolveDeptLineCost,
} from "./dept-calculations/model/aggregation";
export { resolveDeptCalculationsNestedTarget } from "./dept-calculations/model/resolve-nested";
export {
  buildDeptCalculationStageGroups,
  resolveDeptCalculationDepartmentLabel,
  resolveDeptCalculationManagerName,
} from "./dept-calculations/model/stage-groups";
export {
  filterDeptCalculationRecordsForAssignee,
  isTkpLeadGipUser,
  resolveEditableDeptCalculationRecordIds,
} from "./dept-calculations/model/assignee-records";

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

export {
  calculateReviewCostBreakdown,
  calculateReviewExecutionDurationTotal,
  formatReviewExecutionDuration,
  formatReviewExecutionDurationTotal,
  GipCostSummary,
  isValidReviewExecutionDuration,
  parseReviewExecutionDuration,
  resolveReviewGipExecutionDurationHighlight,
  reviewExpenseCategoryLabel,
  reviewGipTotalAmount,
  type ReviewGipCommercialBasis,
  type ReviewGipCostCalculation,
  type ReviewGipCostGroup,
  type ReviewGipCostItem,
} from "./tkp-gip-cost";

export {
  appendTkpPriceRevision,
  calculateTkpCommercialV7,
  CommercialCalculationMetrics,
  CommercialMetricDetails,
  CommercialPriceHistoryTable,
  CommercialPricingPanel,
  fetchTkpPriceRevisions,
  fmtMoney,
  formatPercent,
  TKP_COMMERCIAL_MAX_MONEY,
  TKP_COMMERCIAL_VAT_RATE,
  tkpSalePriceModeLabel,
  type CommercialPricingPanelSaveInput,
  type TkpCommercialCalculation,
  type TkpCommercialInput,
  type TkpPriceRevisionSummary,
  type TkpSalePriceMode,
} from "./tkp-commercial";

export {
  TkpReviewHardcodeSlot,
  type TkpReviewHardcodeSection,
} from "./tkp-review/ui/TkpReviewHardcodeSlot";
export { resolveTkpReviewCostVisibility } from "./tkp-review/model/visibility";
export type { TkpReviewCostVisibility } from "./tkp-review/model/visibility";
export {
  TKP_PRICE_HARDCODE_TAB_ID,
  TKP_PRICE_HARDCODE_TAB_NAME,
  createTkpPriceHardcodeTab,
  isTkpPriceHardcodeTab,
  withTkpPriceHardcodeTab,
} from "./tkp-review/model/price-tab";
