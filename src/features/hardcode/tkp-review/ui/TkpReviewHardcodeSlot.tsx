/**
 * Entrypoint for TKP GIP cost + commercial pricing on record page and tasks.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCurrentRole } from "@/entities/access";
import { collectRecordsLinkedToParent } from "@/entities/automation";
import {
  filterDeptCalculationRecordsForAssignee,
  getEntityRecordById,
  getEntityRecords,
  getSystemUserName,
  parseEntityListValueIds,
  updateEntityRecord,
  useCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { getSessionUser } from "@/entities/session";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { adaptDeptRecordsToGipDepartments } from "../../tkp-gip-cost/model/adapt-departments";
import {
  calculateReviewCostBreakdown,
  type ReviewGipCostCalculation,
} from "../../tkp-gip-cost/model/gip-cost";
import { GipCostSummary } from "../../tkp-gip-cost/ui/GipCostSummary";
import {
  appendTkpPriceRevision,
  fetchTkpPriceRevisions,
} from "../../tkp-commercial/api/price-revisions-api";
import type { TkpPriceRevisionSummary } from "../../tkp-commercial/model/types";
import {
  CommercialPricingPanel,
  type CommercialPricingPanelSaveInput,
} from "../../tkp-commercial/ui/CommercialPricingPanel";
import {
  findDeptCalculationsLinkedEntity,
  readTkpGipExecutionDurationDays,
  writeTkpGipExecutionDurationPatch,
} from "../model/match-related";
import { resolveTkpReviewCostVisibility } from "../model/visibility";
import {
  BIND_PRICE_REVISION_KEY,
  PENDING_NEW_PRICE_KEY,
} from "../lib/tkp-file-bind";
import {
  isTkpApprovalInProgress,
  readTkpApprovalState,
  resolveTkpSentStatusOptionId,
} from "../lib/tkp-approval";
import {
  countTkpRevisionFilesById,
  listTkpRevisionFiles,
  readTkpDocumentFileEntries,
  uploadTkpRevisionFiles,
} from "../lib/revision-files";
import { isTkpFullyApproved } from "../lib/tkp-approval-progress";
import { collectTkpMissingSourceFromDeptRows } from "../../tkp-volumes/model/missing-source-data";
import { TkpNoVolumeBanner } from "../../tkp-volumes/ui/TkpNoVolumeBanner";
import { RevisionFilesPanel } from "./RevisionFilesPanel";
import { TkpPendingPriceVersionBanner } from "./TkpPendingPriceVersionBanner";
import { TkpSendToCustomerPanel } from "./TkpSendToCustomerPanel";

export type TkpReviewHardcodeSection = "gip" | "commercial";

const ALL_TKP_REVIEW_SECTIONS: readonly TkpReviewHardcodeSection[] = [
  "gip",
  "commercial",
];

export function TkpReviewHardcodeSlot({
  entity,
  record,
  readOnly = false,
  /** Which blocks to render (GIP on dept tab, commercial on «Цена ТКП»). */
  sections = ALL_TKP_REVIEW_SECTIONS,
  /** Task form pins duration above the table — skip footer duplicate. */
  hideExecutionDuration = false,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
  sections?: readonly TkpReviewHardcodeSection[];
  hideExecutionDuration?: boolean;
}) {
  const role = useCurrentRole();
  const visibility = useMemo(
    () => resolveTkpReviewCostVisibility(role, entity.id),
    [entity.id, role],
  );
  const { entities } = useEntityConfig();
  const ctx = useEntityValueContext();
  const currentUserId = useCurrentUserRecordId();
  const [history, setHistory] = useState<TkpPriceRevisionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [autoExpandRevisionId, setAutoExpandRevisionId] = useState<
    string | null
  >(null);

  // Task UI may overlay form drafts on `record`; files always come from store.
  const liveEntity = useMemo(
    () => entities.find((item) => item.id === entity.id) ?? entity,
    [entities, entity],
  );
  const liveRecordValue = useAsyncValue(
    () => getEntityRecordById(liveEntity, record.id),
    [liveEntity, record.id],
  );
  const liveRecord =
    liveRecordValue.status === "ready"
      ? (liveRecordValue.value ?? record)
      : record;

  const deptEntity = useMemo(
    () => findDeptCalculationsLinkedEntity(liveEntity, entities),
    [liveEntity, entities],
  );

  const deptRecordsValue = useAsyncValue(async () => {
    if (!deptEntity) return [] as EntityRecord[];
    const ids = await collectRecordsLinkedToParent({
      childEntity: deptEntity,
      parentEntityId: liveEntity.id,
      parentRecordId: liveRecord.id,
      host: liveEntity,
    });
    const idSet = new Set(ids);
    const linked = (await getEntityRecords(deptEntity)).filter((item) =>
      idSet.has(item.id),
    );
    if (!visibility.showDepartmentRestrictedTotals) return linked;
    const sessionId = getSessionUser()?.id ?? null;
    return filterDeptCalculationRecordsForAssignee({
      entity: deptEntity,
      records: linked,
      entities,
      assigneeUserId: currentUserId ?? sessionId,
      assigneeUserIds: [currentUserId, sessionId].filter((id): id is string =>
        Boolean(id),
      ),
      leadParent: { entity: liveEntity, record: liveRecord },
      restrictToOwnDepartments: true,
    });
  }, [
    currentUserId,
    deptEntity,
    entities,
    liveEntity,
    liveRecord,
    visibility.showDepartmentRestrictedTotals,
  ]);
  const deptRecords = useMemo(
    () => (deptRecordsValue.status === "ready" ? deptRecordsValue.value : []),
    [deptRecordsValue],
  );

  const gipBreakdown = useMemo(() => {
    if (!deptEntity) {
      return calculateReviewCostBreakdown({ departments: [] });
    }
    const departments = adaptDeptRecordsToGipDepartments({
      ctx,
      hostEntity: deptEntity,
      records: deptRecords,
      entities,
    });
    return calculateReviewCostBreakdown({ departments });
  }, [ctx, deptEntity, deptRecords, entities]);

  const gipCalculation =
    gipBreakdown.gipCalculation as ReviewGipCostCalculation;
  const commercialBasis =
    gipCalculation.calculationVersion === 2 ||
    gipCalculation.calculationVersion === 3
      ? gipCalculation.commercialBasis
      : {
          costWithFixed: gipCalculation.costWithFixed,
          contractorWorkTotal: gipCalculation.contractorWorkTotal ?? 0,
          additionalWorkTotal: gipCalculation.additionalWorkTotal ?? 0,
          contractorWorkBase: gipCalculation.contractorTotal,
          additionalWorkBase: 0,
        };

  const executionDurationDays = readTkpGipExecutionDurationDays(
    liveRecord.values,
    liveEntity,
  );
  const pendingNewPriceVersion =
    liveRecord.values[PENDING_NEW_PRICE_KEY] === "1";
  const approvalState = readTkpApprovalState(liveRecord.values);
  const approvalInProgress = useMemo(() => {
    const sent = resolveTkpSentStatusOptionId(liveEntity, entities);
    if (sent) {
      const current =
        parseEntityListValueIds(liveRecord.values[sent.fieldId] ?? "")[0] ?? "";
      if (current === sent.optionId) return false;
    }
    if (
      isTkpApprovalInProgress({
        entity: liveEntity,
        values: liveRecord.values,
        entities,
      })
    ) {
      return true;
    }
    // Soft keys after «На согласование» — even when the list field is absent.
    const submittedId = approvalState.revisionId;
    if (!submittedId) return false;
    return history[0]?.id === submittedId;
  }, [
    approvalState.revisionId,
    entities,
    history,
    liveEntity,
    liveRecord.values,
  ]);
  const revisionFileEntries = useMemo(
    () =>
      readTkpDocumentFileEntries({
        entity: liveEntity,
        record: liveRecord,
      }),
    [liveEntity, liveRecord],
  );
  const fileCountByRevisionId = useMemo(
    () => countTkpRevisionFilesById(revisionFileEntries),
    [revisionFileEntries],
  );

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchTkpPriceRevisions(liveEntity.id, liveRecord.id);
      setHistory(rows);
    } catch (error) {
      console.error("[tkp-price-revisions] load failed", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [liveEntity.id, liveRecord.id]);

  useEffect(() => {
    if (!visibility.showCommercialPricing) return;
    // Defer so we don't call setState synchronously in the effect body.
    const timer = window.setTimeout(() => {
      void reloadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadHistory, visibility.showCommercialPricing]);

  async function handleSaveDuration(days: number) {
    const patch = writeTkpGipExecutionDurationPatch(liveEntity, days);
    await updateEntityRecord(liveEntity.id, liveRecord.id, patch);
  }

  async function handleSaveRevision(input: CommercialPricingPanelSaveInput) {
    const authorName = currentUserId
      ? (getSystemUserName(entities, currentUserId) ?? null)
      : null;
    const saved = await appendTkpPriceRevision({
      entityId: liveEntity.id,
      recordId: liveRecord.id,
      priceMode: input.mode,
      saleCoefficient:
        input.mode === "coefficient" ? input.saleCoefficient : null,
      manualTotalBeforeVat:
        input.mode === "manual" ? input.manualTotalBeforeVat : null,
      retroAmount: input.retroAmount ?? 0,
      calculation: input.calculation,
      gipCalculation,
      createdByName: authorName,
      idempotencyKey: crypto.randomUUID(),
    });
    if (pendingNewPriceVersion) {
      setAutoExpandRevisionId(saved.id);
      await updateEntityRecord(liveEntity.id, liveRecord.id, {
        [PENDING_NEW_PRICE_KEY]: "1",
        [BIND_PRICE_REVISION_KEY]: saved.id,
      });
    }
    const revisionLabel =
      saved.revisionNumber != null ? `#${saved.revisionNumber}` : "";
    toast.success(
      pendingNewPriceVersion
        ? `Версия цены ${revisionLabel} сохранена — загрузите файлы ТКП в строке ревизии ниже`
        : "Версия цены сохранена",
    );
    await reloadHistory();
  }

  async function handleStartNewPriceVersion() {
    await updateEntityRecord(liveEntity.id, liveRecord.id, {
      [PENDING_NEW_PRICE_KEY]: "1",
    });
    toast.message(
      "Сохраните новую версию цены, затем загрузите файлы в строке ревизии",
    );
  }

  async function handleUploadRevisionFiles(revisionId: string, files: File[]) {
    const result = await uploadTkpRevisionFiles({
      entity: liveEntity,
      record: liveRecord,
      entities,
      revisionId,
      files,
    });
    if (result.createdFilesTab) {
      toast.message(`Создана вкладка «${result.filesTabName}»`);
    }
    if (result.approvalStarted) {
      toast.success("Файлы загружены — запущено согласование новой версии ТКП");
    }
    await reloadHistory();
  }

  const wantGip = sections.includes("gip");
  const wantCommercial = sections.includes("commercial");

  const showGipBlock = wantGip && visibility.showGipCalculation;
  const showCommercialBlock =
    wantCommercial && visibility.showCommercialPricing;

  const canEditCommercial =
    !readOnly && showCommercialBlock && visibility.canEditCommercialPricing;
  const canEditGipDuration =
    !readOnly &&
    (visibility.showGipCalculation || visibility.showCommercialPricing);

  if (!showGipBlock && !showCommercialBlock) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="tkp-review-hardcode-slot">
      <TkpNoVolumeBanner entity={entity} record={record} readOnly={readOnly} />
      {showGipBlock ? (
        <GipCostSummary
          calculation={gipCalculation}
          executionDurationDays={executionDurationDays}
          canEditExecutionDuration={canEditGipDuration}
          hideExecutionDuration={hideExecutionDuration}
          onSaveExecutionDuration={
            canEditGipDuration && !hideExecutionDuration
              ? handleSaveDuration
              : undefined
          }
        />
      ) : null}

      {showCommercialBlock ? (
        <div className="space-y-3">
          {pendingNewPriceVersion ? (
            <TkpPendingPriceVersionBanner
              latestRevisionId={history[0]?.id ?? null}
            />
          ) : null}
          <CommercialPricingPanel
            key={history[0]?.id ?? "draft"}
            basis={commercialBasis}
            canEdit={canEditCommercial}
            latestRevision={history[0] ?? null}
            history={history}
            onSaveRevision={handleSaveRevision}
            onStartNewPriceVersion={
              canEditCommercial ? handleStartNewPriceVersion : undefined
            }
            pendingNewPriceVersion={pendingNewPriceVersion}
            approvalInProgress={approvalInProgress}
            approvalRevisionId={approvalState.revisionId}
            approvalSubmittedAt={approvalState.submittedAt}
            fileCountByRevisionId={fileCountByRevisionId}
            autoExpandRevisionId={autoExpandRevisionId}
            renderRevisionFiles={(entry) => (
              <RevisionFilesPanel
                revisionId={entry.id}
                revisionNumber={entry.revisionNumber}
                files={listTkpRevisionFiles(revisionFileEntries, entry.id)}
                canEdit={canEditCommercial}
                highlightUpload={autoExpandRevisionId === entry.id}
                isLatest={history[0]?.id === entry.id}
                onUpload={
                  canEditCommercial
                    ? (files) => handleUploadRevisionFiles(entry.id, files)
                    : undefined
                }
              />
            )}
          />
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">
              Загрузка истории цен…
            </p>
          ) : null}
          <TkpSendToCustomerPanel
            entity={entity}
            record={record}
            revisionId={approvalState.revisionId}
            fullyApproved={isTkpFullyApproved(record.values)}
            readOnly={readOnly}
          />
        </div>
      ) : null}
      {showGipBlock
        ? (() => {
            const missing = collectTkpMissingSourceFromDeptRows(deptRecords);
            if (missing.length === 0) return null;
            return (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  Недостающие исходные данные (от отделов)
                </p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {missing.map((item) => (
                    <li key={item.id}>{item.text}</li>
                  ))}
                </ul>
              </div>
            );
          })()
        : null}
    </div>
  );
}
