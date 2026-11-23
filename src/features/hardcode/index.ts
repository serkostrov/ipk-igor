export { getPaymentRequestDraftSummary } from "./payment-requests/model/draft-summary";
export { isDdsOperationsEntity } from "./dds/match";

export {
  applyTkpGipDepartmentUsers,
  type TkpGipDepartmentUsersResult,
} from "./tkp-gip/apply-gip-department-users";
export {
  dedupeDeptCalculationSiblingPairs,
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
  collectDeptCalculationRecordsForParent,
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
  buildTkpCommercialDocumentFile,
  buildTkpCommercialDocumentHtml,
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
export { TkpGipExecutionDurationAsk } from "./tkp-review/ui/TkpGipExecutionDurationAsk";
export { isTkpGipFillAutomationTask } from "./tkp-review/lib/assert-gip-execution-duration";
export {
  readTkpGipExecutionDurationDays,
  writeTkpGipExecutionDurationPatch,
} from "./tkp-review/model/match-related";
export {
  isTkpDepartmentHeadRole,
  isTkpGipRole,
  resolveTkpReviewCostVisibility,
} from "./tkp-review/model/visibility";
export type { TkpReviewCostVisibility } from "./tkp-review/model/visibility";
export {
  TKP_PRICE_HARDCODE_TAB_ID,
  TKP_PRICE_HARDCODE_TAB_NAME,
  createTkpPriceHardcodeTab,
  isTkpPriceHardcodeTab,
  withTkpPriceHardcodeTab,
} from "./tkp-review/model/price-tab";

export {
  findProjectsEntity,
  findProjectTasksLinkedEntity,
  isProjectsEntity,
  isProjectTasksEntity,
  PROJECT_GANTT_ENTITY_KEYS,
  PROJECT_GANTT_TASKS_ENTITY_KEYS,
  PROJECT_GANTT_HARDCODE_TAB_ID,
  PROJECT_GANTT_HARDCODE_TAB_NAME,
  createProjectGanttHardcodeTab,
  isProjectGanttHardcodeTab,
  withProjectGanttHardcodeTab,
  resolveProjectGanttVisibility,
  ProjectGanttHardcodeSlot,
  type ProjectGanttVisibility,
} from "./project-gantt";
export {
  findTkpApprovalListField,
  readTkpApprovalState,
  resolveTkpApprovalChainReady,
  resolveTkpApprovalPendingOptionId,
  TKP_APPROVAL_REVISION_KEY,
  TKP_APPROVAL_SUBMITTED_AT_KEY,
} from "./tkp-review/lib/tkp-approval";
export { submitTkpDocumentForApproval } from "./tkp-review/lib/submit-tkp-document";
export { assertTkpDocumentApprovalReady } from "./tkp-review/lib/assert-tkp-approval-ready";
export {
  assertTkpSendToCustomer,
  buildTkpSendToCustomerPatch,
  TKP_SEND_AT_KEY,
  TKP_SEND_CALL_AT_KEY,
  TKP_SEND_REVISION_KEY,
} from "./tkp-review/lib/assert-tkp-send-to-customer";
export {
  buildTkpApprovalApprovePatch,
  buildTkpApprovalReturnPatch,
  buildTkpApprovalResubmitPatch,
  isTkpFullyApproved,
  parseTkpApprovalStep,
  TKP_APPROVAL_HISTORY_KEY,
  TKP_APPROVAL_RETURN_TO_STEP_KEY,
  TKP_APPROVAL_STEP_KEY,
  type TkpApprovalStep,
} from "./tkp-review/lib/tkp-approval-progress";
export { resolveTkpDocumentFilesTarget } from "./tkp-review/lib/resolve-tkp-files-target";
export {
  countTkpRevisionFilesById,
  listTkpRevisionFiles,
  readTkpDocumentFileEntries,
  uploadTkpRevisionFiles,
} from "./tkp-review/lib/revision-files";
export { RevisionFilesPanel } from "./tkp-review/ui/RevisionFilesPanel";
export { TkpSendToCustomerPanel } from "./tkp-review/ui/TkpSendToCustomerPanel";

export {
  appendTkpNoVolumeIssue,
  isNoVolumeOutcomeLabel,
  parseTkpNoVolumeIssues,
  resolveTkpNoVolumeIssue,
  TKP_NO_VOLUME_ISSUES_KEY,
  type TkpNoVolumeIssue,
} from "./tkp-volumes/model/no-volume";
export {
  collectTkpMissingSourceFromDeptRows,
  isTkpMissingSourceLocked,
  parseTkpMissingSourceData,
  saveTkpMissingSourceData,
  TKP_MISSING_SOURCE_DATA_KEY,
  TKP_MISSING_SOURCE_SUBMITTED_AT_KEY,
  type TkpMissingSourceEntry,
} from "./tkp-volumes/model/missing-source-data";
export { TkpNoVolumeBanner } from "./tkp-volumes/ui/TkpNoVolumeBanner";
export { TkpMissingSourceAsk } from "./tkp-volumes/ui/TkpMissingSourceAsk";
export { registerTkpNoVolumeAfterCompleteHook } from "./tkp-volumes/lib/register-no-volume-hook";

// Side-effect: register after-complete hardcode handlers.
import "./tkp-gip/gip-filling-phase";
import "./dept-calculations/lib/assert-dept-calc-lines";
import { registerTkpNoVolumeAfterCompleteHook as __registerTkpNoVolume } from "./tkp-volumes/lib/register-no-volume-hook";
__registerTkpNoVolume();
